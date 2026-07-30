// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { exportResolumeXml } from '../resolume'
import { solve } from '../geometry'
import type { ArrayConfig, Projector, ScreenSurface } from '../../types'

/**
 * Structural conformance test.
 *
 * REFERENCE_SHAPES below is the complete set of `element path [sorted attribute
 * names]` pairs found in two files written by a real Resolume Arena 7.27.0
 * (rev 14395) install:
 *
 *   ~/Documents/Resolume Arena/Preferences/AdvancedOutput.xml
 *   ~/Documents/Resolume Arena/Presets/Advanced Output/output_map_1.xml
 *
 * The list was extracted mechanically, not transcribed by hand, and the `/XmlState`
 * wrapper is normalised away so the preset and preferences forms compare like for
 * like.
 *
 * The rule this enforces: the exporter may only emit element/attribute shapes
 * Arena itself writes. Inventing a plausible-looking parameter is the one failure
 * mode that would produce a file Arena silently mis-parses, and it is exactly the
 * mistake this catches. If a shape genuinely needs adding, add it here WITH a
 * reference file that contains it — not because it looks right.
 */
const REFERENCE_SHAPES = new Set([
  '/ScreenSetup [name]',
  '/ScreenSetup/CurrentCompositionTextureSize [height width]',
  '/ScreenSetup/Params [name]',
  '/ScreenSetup/SoftEdging []',
  '/ScreenSetup/SoftEdging/Params [name]',
  '/ScreenSetup/SoftEdging/Params/ParamRange [T default name value]',
  '/ScreenSetup/SoftEdging/Params/ParamRange/PhaseSourceStatic [name]',
  '/ScreenSetup/screens []',
  '/ScreenSetup/screens/Screen [name uniqueId]',
  '/ScreenSetup/screens/Screen/OutputDevice []',
  '/ScreenSetup/screens/Screen/OutputDevice/OutputDeviceNDI [deviceId height idHash name width]',
  '/ScreenSetup/screens/Screen/OutputDevice/OutputDeviceNDI/Params [name]',
  '/ScreenSetup/screens/Screen/OutputDevice/OutputDeviceNDI/Params/ParamRange [T default name value]',
  '/ScreenSetup/screens/Screen/OutputDevice/OutputDeviceNDI/Params/ParamRange/PhaseSourceStatic [name]',
  '/ScreenSetup/screens/Screen/OutputDevice/OutputDeviceVirtual [deviceId height idHash name width]',
  '/ScreenSetup/screens/Screen/OutputDevice/OutputDeviceVirtual [deviceId height name width]',
  '/ScreenSetup/screens/Screen/Params [name]',
  '/ScreenSetup/screens/Screen/Params/Param [T default name value]',
  '/ScreenSetup/screens/Screen/guides []',
  '/ScreenSetup/screens/Screen/guides/ScreenGuide [name type]',
  '/ScreenSetup/screens/Screen/layers []',
  '/ScreenSetup/screens/Screen/layers/Slice [uniqueId]',
  '/ScreenSetup/screens/Screen/layers/Slice/InputRect [orientation]',
  '/ScreenSetup/screens/Screen/layers/Slice/InputRect/v [x y]',
  '/ScreenSetup/screens/Screen/layers/Slice/OutputRect [orientation]',
  '/ScreenSetup/screens/Screen/layers/Slice/OutputRect/v [x y]',
  '/ScreenSetup/screens/Screen/layers/Slice/Params [name]',
  '/ScreenSetup/screens/Screen/layers/Slice/Params/Param [T default name value]',
  '/ScreenSetup/screens/Screen/layers/Slice/Params/ParamChoice [default name storeChoices value]',
  '/ScreenSetup/screens/Screen/layers/Slice/Warper []',
  '/ScreenSetup/screens/Screen/layers/Slice/Warper/BezierWarper [controlHeight controlWidth]',
  '/ScreenSetup/screens/Screen/layers/Slice/Warper/BezierWarper/vertices []',
  '/ScreenSetup/screens/Screen/layers/Slice/Warper/BezierWarper/vertices/v [x y]',
  '/ScreenSetup/screens/Screen/layers/Slice/Warper/Homography []',
  '/ScreenSetup/screens/Screen/layers/Slice/Warper/Homography/dst []',
  '/ScreenSetup/screens/Screen/layers/Slice/Warper/Homography/dst/v [x y]',
  '/ScreenSetup/screens/Screen/layers/Slice/Warper/Homography/src []',
  '/ScreenSetup/screens/Screen/layers/Slice/Warper/Homography/src/v [x y]',
  '/ScreenSetup/screens/Screen/layers/Slice/Warper/Params [name]',
  '/ScreenSetup/screens/Screen/layers/Slice/Warper/Params/Param [T default name value]',
  '/ScreenSetup/screens/Screen/layers/Slice/Warper/Params/ParamChoice [default name storeChoices value]',
  '/ScreenSetup/versionInfo [majorVersion microVersion minorVersion name revision]',
  '/XmlState [name]',
  '/XmlState/versionInfo [majorVersion microVersion minorVersion name revision]',
])

/** Every `path [attrs]` shape in a document, with the XmlState wrapper stripped. */
function shapesOf(xml: string): Set<string> {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  expect(doc.querySelector('parsererror')).toBeNull()
  const out = new Set<string>()
  const walk = (el: Element, parent: string) => {
    const path = `${parent}/${el.tagName}`
    const attrs = [...el.attributes].map((a) => a.name).sort()
    const i = path.indexOf('/ScreenSetup')
    out.add(`${i >= 0 ? path.slice(i) : path} [${attrs.join(' ')}]`)
    for (const child of [...el.children]) walk(child, path)
  }
  walk(doc.documentElement, '')
  return out
}

const wuxga: Projector = {
  id: 't',
  brand: 'T',
  model: 'WUXGA',
  nativeWidth: 1920,
  nativeHeight: 1200,
  lumens: 20000,
  lensSeriesId: 't',
}

const make = (columns: number, rows: number, width: number, height: number) => {
  const screen: ScreenSurface = { geometry: { kind: 'flat', width, height }, gain: 1 }
  const array: ArrayConfig = {
    columns,
    rows,
    fitMode: 'fit-width',
    hOverlap: 0.2,
    vOverlap: 0.2,
    placement: 'per-tile',
    throwDistance: 10,
  }
  return { sol: solve(screen, array, wuxga, null, []), columns, rows }
}

describe('resolume xml conforms to shapes a real Arena writes', () => {
  const cases = [
    { label: 'single projector', ...make(1, 1, 4, 2.5) },
    { label: 'single row of 3', ...make(3, 1, 12, 3) },
    { label: '4x2 grid', ...make(4, 2, 16, 4) },
  ]

  for (const target of ['preferences', 'preset'] as const) {
    for (const c of cases) {
      it(`${target} / ${c.label} invents no elements or attributes`, () => {
        const xml = exportResolumeXml(c.sol, wuxga, c.columns, c.rows, {
          name: 'Conformance',
          target,
        })
        const novel = [...shapesOf(xml)].filter((s) => !REFERENCE_SHAPES.has(s))
        expect(novel).toEqual([])
      })
    }
  }

  it('the guard actually catches an invented element', () => {
    // Proves the test above is not vacuous.
    const novel = [...shapesOf('<ScreenSetup name="x"><MadeUpThing foo="1"/></ScreenSetup>')].filter(
      (s) => !REFERENCE_SHAPES.has(s),
    )
    expect(novel).toEqual(['/ScreenSetup/MadeUpThing [foo]'])
  })
})
