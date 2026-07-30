// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { exportResolumeXml, sliceLayout } from '../resolume'
import { solve } from '../geometry'
import type { ArrayConfig, Projector, ScreenSurface } from '../../types'

const wuxga: Projector = {
  id: 'test',
  brand: 'Test',
  model: 'WUXGA',
  nativeWidth: 1920,
  nativeHeight: 1200,
  lumens: 20000,
  lensSeriesId: 'test',
}

const screen: ScreenSurface = { geometry: { kind: 'flat', width: 12, height: 3 }, gain: 1 }
const array: ArrayConfig = {
  columns: 3,
  rows: 1,
  fitMode: 'fit-width',
  hOverlap: 0.2,
  vOverlap: 0,
  placement: 'per-tile',
  throwDistance: 10,
}

const sol = () => solve(screen, array, wuxga, null, [])

// Set BLEND_CALC_XML_OUT=/some/dir to dump a sample for eyeballing against a
// real Arena file.
if (process.env.BLEND_CALC_XML_OUT) {
  const dir = process.env.BLEND_CALC_XML_OUT
  const gridSol = solve(
    { geometry: { kind: 'flat', width: 12, height: 4 }, gain: 1 },
    { ...array, rows: 2 },
    wuxga,
    null,
    [],
  )
  const write = async (name: string, body: string) => {
    const fs = await import('node:fs')
    fs.writeFileSync(`${dir}/${name}`, body)
  }
  void write('sample-AdvancedOutput.xml', exportResolumeXml(sol(), wuxga, 3, 1, { name: 'Blend Calc Demo', target: 'preferences' }))
  void write('sample-preset.xml', exportResolumeXml(gridSol, wuxga, 3, 2, { name: 'Blend Calc Demo', target: 'preset' }))
}

describe('slice layout', () => {
  it('places tiles on the blend pitch and sizes the canvas to the last tile', () => {
    const { slices, canvasWidth, canvasHeight } = sliceLayout(sol(), wuxga, 3, 1, 'Show')
    expect(slices).toHaveLength(3)
    // pitch = 1920 * 0.8 = 1536
    expect(slices[0].input.x0).toBe(0)
    expect(slices[1].input.x0).toBe(1536)
    expect(slices[2].input.x0).toBe(3072)
    expect(canvasWidth).toBe(3072 + 1920) // 4992 = 1920 * 2.6
    expect(canvasHeight).toBe(1200)
  })

  it('every slice is exactly one projector raster wide', () => {
    const { slices } = sliceLayout(sol(), wuxga, 3, 1, 'Show')
    for (const s of slices) {
      expect(s.input.x1 - s.input.x0).toBe(1920)
      expect(s.input.y1 - s.input.y0).toBe(1200)
      expect(s.output.width).toBe(1920)
    }
  })

  it('adjacent slices overlap by exactly the blend width', () => {
    const { slices } = sliceLayout(sol(), wuxga, 3, 1, 'Show')
    const overlap = slices[0].input.x1 - slices[1].input.x0
    expect(overlap).toBe(Math.round(0.2 * 1920)) // 384
  })

  it('lays out a grid row by row', () => {
    const gridArray: ArrayConfig = { ...array, rows: 2 }
    const s = solve({ ...screen, geometry: { kind: 'flat', width: 12, height: 4 } }, gridArray, wuxga, null, [])
    const { slices } = sliceLayout(s, wuxga, 3, 2, 'Show')
    expect(slices).toHaveLength(6)
    expect(slices[0].input.y0).toBe(0)
    expect(slices[3].input.y0).toBeGreaterThan(0)
    expect(slices[0].screenName).toContain('R1C1')
    expect(slices[5].screenName).toContain('R2C3')
  })
})

describe('resolume xml', () => {
  it('emits a ScreenSetup root for the preferences target', () => {
    const xml = exportResolumeXml(sol(), wuxga, 3, 1, { name: 'Show', target: 'preferences' })
    expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true)
    expect(xml).toContain('<ScreenSetup name="ScreenSetup">')
    expect(xml).toContain('<SoftEdging>')
    expect(xml).not.toContain('<XmlState')
  })

  it('emits an XmlState wrapper for the preset target', () => {
    const xml = exportResolumeXml(sol(), wuxga, 3, 1, { name: 'Show', target: 'preset' })
    expect(xml).toContain('<XmlState name="Show">')
    expect(xml).toContain('<Params name="ScreenSetupParams"/>')
    // Arena writes SoftEdging only into the preferences file.
    expect(xml).not.toContain('<SoftEdging>')
  })

  it('sets the composition texture size to the blended canvas', () => {
    const xml = exportResolumeXml(sol(), wuxga, 3, 1, { name: 'Show', target: 'preferences' })
    expect(xml).toContain('<CurrentCompositionTextureSize width="4992" height="1200"/>')
  })

  it('writes one Screen and one Slice per projector', () => {
    const xml = exportResolumeXml(sol(), wuxga, 3, 1, { name: 'Show', target: 'preferences' })
    expect(xml.match(/<Screen /g)).toHaveLength(3)
    expect(xml.match(/<Slice /g)).toHaveLength(3)
    expect(xml.match(/<OutputDeviceVirtual /g)).toHaveLength(3)
  })

  it('gives every Screen and Slice a distinct uniqueId', () => {
    const xml = exportResolumeXml(sol(), wuxga, 3, 1, {
      name: 'Show',
      target: 'preferences',
      idBase: 1000,
    })
    const ids = [...xml.matchAll(/uniqueId="(\d+)"/g)].map((m) => m[1])
    expect(ids).toHaveLength(6)
    expect(new Set(ids).size).toBe(6)
  })

  it('carries the overlap into the InputRect of the middle projector', () => {
    const xml = exportResolumeXml(sol(), wuxga, 3, 1, { name: 'Show', target: 'preferences' })
    // Middle slice starts at 1536 and ends at 3456.
    expect(xml).toContain('<v x="1536" y="0"/>')
    expect(xml).toContain('<v x="3456" y="0"/>')
  })

  it('maps every projector to a full-raster OutputRect at the origin', () => {
    const xml = exportResolumeXml(sol(), wuxga, 3, 1, { name: 'Show', target: 'preferences' })
    const outputRects = [...xml.matchAll(/<OutputRect orientation="0">([\s\S]*?)<\/OutputRect>/g)]
    expect(outputRects).toHaveLength(3)
    for (const [, body] of outputRects) {
      expect(body).toContain('<v x="0" y="0"/>')
      expect(body).toContain('<v x="1920" y="0"/>')
      expect(body).toContain('<v x="1920" y="1200"/>')
    }
  })

  it('writes an identity 4x4 bezier grid on the output rect', () => {
    const xml = exportResolumeXml(sol(), wuxga, 3, 1, { name: 'Show', target: 'preferences' })
    const grid = xml.match(/<vertices>([\s\S]*?)<\/vertices>/)![1]
    const pts = [...grid.matchAll(/<v x="([-\d.]+)" y="([-\d.]+)"\/>/g)]
    expect(pts).toHaveLength(16)
    expect(pts[0].slice(1)).toEqual(['0', '0'])
    expect(pts[3].slice(1)).toEqual(['1920', '0'])
    expect(pts[15].slice(1)).toEqual(['1920', '1200'])
  })

  it('escapes XML metacharacters in the project name', () => {
    const xml = exportResolumeXml(sol(), wuxga, 1, 1, {
      name: 'Rock & <Roll>',
      target: 'preferences',
    })
    expect(xml).toContain('Rock &amp; &lt;Roll&gt;')
    expect(xml).not.toMatch(/name="Rock & </)
  })

  it('is well-formed XML', () => {
    const xml = exportResolumeXml(sol(), wuxga, 3, 2, { name: 'Show', target: 'preset' })
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    expect(doc.querySelector('parsererror')).toBeNull()
    expect(doc.documentElement.tagName).toBe('XmlState')
  })
})
