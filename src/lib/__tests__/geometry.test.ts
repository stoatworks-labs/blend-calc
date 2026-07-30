import { describe, expect, it } from 'vitest'
import {
  curvedFlatImageWidth,
  overlapForFit,
  pixelBudget,
  solve,
  spanForTile,
  tileForSpan,
} from '../geometry'
import type { ArrayConfig, Lens, Projector, ScreenSurface } from '../../types'

const wuxga: Projector = {
  id: 'test',
  brand: 'Test',
  model: 'WUXGA',
  nativeWidth: 1920,
  nativeHeight: 1200,
  lumens: 20000,
  lensSeriesId: 'test',
}

const flat = (width: number, height: number): ScreenSurface => ({
  geometry: { kind: 'flat', width, height },
  gain: 1,
})

const baseArray: ArrayConfig = {
  columns: 3,
  rows: 1,
  fitMode: 'fit-width',
  hOverlap: 0.2,
  vOverlap: 0,
  placement: 'per-tile',
  throwDistance: 10,
}

describe('tile/span relation', () => {
  it('round-trips', () => {
    const tile = tileForSpan(12, 4, 0.15)
    expect(spanForTile(tile, 4, 0.15)).toBeCloseTo(12, 10)
  })

  it('reduces to simple division with no overlap', () => {
    expect(tileForSpan(12, 4, 0)).toBeCloseTo(3, 10)
  })

  it('solves the overlap that makes tiles fit a span', () => {
    const tile = tileForSpan(12, 4, 0.15)
    expect(overlapForFit(12, 4, tile)).toBeCloseTo(0.15, 10)
  })

  it('two tiles at 20% overlap span 1.8 tile widths', () => {
    expect(spanForTile(1, 2, 0.2)).toBeCloseTo(1.8, 10)
  })
})

describe('pixel budget', () => {
  it('conserves pixels: total === single + 2*double + 4*quad', () => {
    for (const [c, r, ho, vo] of [
      [3, 1, 0.2, 0],
      [2, 2, 0.1, 0.1],
      [5, 3, 0.25, 0.18],
      [1, 1, 0, 0],
      [4, 2, 0.5, 0.5],
    ] as const) {
      const b = pixelBudget(1920, 1200, c, r, ho, vo)
      const recomposed =
        b.singleCoveredPixels + 2 * b.doubleCoveredPixels + 4 * b.quadCoveredPixels
      expect(recomposed).toBeCloseTo(b.totalProjectorPixels, 4)
    }
  })

  it('unique === single + double + quad', () => {
    const b = pixelBudget(1920, 1200, 4, 3, 0.22, 0.16)
    expect(b.singleCoveredPixels + b.doubleCoveredPixels + b.quadCoveredPixels).toBeCloseTo(
      b.uniquePixels,
      4,
    )
  })

  it('two projectors at 20% overlap double exactly one blend band', () => {
    const b = pixelBudget(1920, 1200, 2, 1, 0.2, 0)
    expect(b.hBlendPixels).toBeCloseTo(384, 10)
    expect(b.canvasPixelWidth).toBeCloseTo(1920 * 1.8, 10)
    expect(b.doubleCoveredPixels).toBeCloseTo(384 * 1200, 4)
    expect(b.quadCoveredPixels).toBe(0)
    // Redundant pixels are exactly the one doubled band.
    expect(b.redundantPixels).toBeCloseTo(384 * 1200, 4)
  })

  it('a 2x2 grid has a quad-covered corner', () => {
    const b = pixelBudget(1000, 1000, 2, 2, 0.1, 0.1)
    expect(b.quadCoveredPixels).toBeCloseTo(100 * 100, 6)
  })

  it('no overlap means no redundancy', () => {
    const b = pixelBudget(1920, 1200, 3, 2, 0, 0)
    expect(b.redundantPixels).toBeCloseTo(0, 6)
    expect(b.doubleCoveredPixels).toBeCloseTo(0, 6)
    expect(b.overlapEfficiencyLoss).toBeCloseTo(0, 10)
  })
})

describe('curved optics', () => {
  it('collapses to the flat case as radius grows', () => {
    const arc = 4
    const throwD = 8
    const huge = curvedFlatImageWidth(1e9, throwD, arc)
    expect(huge.flatWidth).toBeCloseTo(arc, 6)
    expect(huge.edgeDistanceRatio).toBeCloseTo(1, 6)
  })

  it('needs a wider flat image than the arc length on a real curve', () => {
    const r = curvedFlatImageWidth(10, 6, 4)
    expect(r.flatWidth).toBeGreaterThan(4)
    // Edges of a concave screen bulge towards the projector, so they sit
    // closer than the tile centre.
    expect(r.edgeDistanceRatio).toBeLessThan(1)
  })

  it('tightens the required throw ratio as curvature increases', () => {
    const gentle = curvedFlatImageWidth(50, 6, 4)
    const tight = curvedFlatImageWidth(8, 6, 4)
    expect(6 / tight.flatWidth).toBeLessThan(6 / gentle.flatWidth)
  })
})

describe('solve — flat single row', () => {
  it('fits three 16:10 tiles across a 12 m screen at 20% overlap', () => {
    const s = solve(flat(12, 3), baseArray, wuxga, null, [])
    // w = 12 / (3 - 2*0.2) = 12 / 2.6
    expect(s.tileWidth).toBeCloseTo(12 / 2.6, 9)
    expect(s.tileHeight).toBeCloseTo(12 / 2.6 / 1.6, 9)
    expect(s.coveredWidth).toBeCloseTo(12, 9)
    expect(s.hOverlapMetres).toBeCloseTo(0.2 * (12 / 2.6), 9)
  })

  it('reports the required throw ratio as throw / tile width', () => {
    const s = solve(flat(12, 3), baseArray, wuxga, null, [])
    expect(s.columns).toHaveLength(3)
    expect(s.columns[0].requiredThrowRatio).toBeCloseTo(10 / (12 / 2.6), 9)
    // per-tile placement: no shift anywhere
    expect(s.columns.every((c) => c.hShiftPct === 0)).toBe(true)
  })

  it('computes system resolution from the resolved overlap', () => {
    const s = solve(flat(12, 3), baseArray, wuxga, null, [])
    expect(s.pixels.canvasPixelWidth).toBeCloseTo(1920 * 2.6, 6)
    expect(s.pixels.totalProjectorPixels).toBe(3 * 1920 * 1200)
  })
})

describe('solve — fit modes', () => {
  it('fit-width derives the vertical overlap that closes the height', () => {
    const array: ArrayConfig = { ...baseArray, columns: 3, rows: 2, hOverlap: 0.2 }
    // tile is 12/2.6 wide -> 12/2.6/1.6 tall; two rows must cover 4 m
    const s = solve(flat(12, 4), array, wuxga, null, [])
    expect(s.coveredHeight).toBeCloseTo(4, 9)
    expect(spanForTile(s.tileHeight, 2, s.vOverlap)).toBeCloseTo(4, 9)
  })

  it('fit-height derives the horizontal overlap', () => {
    const array: ArrayConfig = {
      ...baseArray,
      columns: 3,
      rows: 2,
      fitMode: 'fit-height',
      vOverlap: 0.15,
    }
    const s = solve(flat(12, 4), array, wuxga, null, [])
    expect(s.coveredWidth).toBeCloseTo(12, 9)
    expect(s.vOverlap).toBeCloseTo(0.15, 12)
  })

  it('flags a negative solved overlap as a gap, not a silent pass', () => {
    // Very tall screen, one row of 16:10 -> two rows would need negative overlap
    const array: ArrayConfig = { ...baseArray, columns: 2, rows: 2, hOverlap: 0.2 }
    const s = solve(flat(4, 40), array, wuxga, null, [])
    expect(s.ok).toBe(false)
    expect(s.diagnostics.some((d) => d.code === 'overlap-gap')).toBe(true)
  })

  it('manual mode reports height spill instead of forcing a fit', () => {
    const array: ArrayConfig = {
      ...baseArray,
      columns: 3,
      rows: 2,
      fitMode: 'manual',
      hOverlap: 0.2,
      vOverlap: 0.2,
    }
    const s = solve(flat(12, 10), array, wuxga, null, [])
    expect(Math.abs(s.heightSpill)).toBeGreaterThan(0)
    expect(s.coveredHeight).toBeCloseTo(spanForTile(s.tileHeight, 2, 0.2), 9)
  })
})

describe('solve — lens selection', () => {
  const lenses: Lens[] = [
    { id: 'a', name: 'Short 0.8-1.0', throwRatioMin: 0.8, throwRatioMax: 1.0 },
    { id: 'b', name: 'Standard 1.3-1.8', throwRatioMin: 1.3, throwRatioMax: 1.8 },
    { id: 'c', name: 'Long 1.8-3.0', throwRatioMin: 1.8, throwRatioMax: 3.0 },
  ]

  it('auto-picks a lens covering the required ratio', () => {
    // tile = 12/2.6 = 4.615 m, throw 7 m -> TR 1.517
    const s = solve(flat(12, 3), { ...baseArray, throwDistance: 7 }, wuxga, null, lenses)
    expect(s.lens?.id).toBe('b')
    expect(s.lensFits).toBe(true)
    expect(s.lensZoomPosition).toBeGreaterThan(0)
    expect(s.lensZoomPosition).toBeLessThan(1)
  })

  it('errors when an explicitly chosen lens cannot reach', () => {
    const s = solve(flat(12, 3), { ...baseArray, throwDistance: 7 }, wuxga, lenses[0], lenses)
    expect(s.ok).toBe(false)
    expect(s.diagnostics.some((d) => d.code === 'lens-out-of-range')).toBe(true)
  })

  it('warns when no lens in the series covers the design', () => {
    const s = solve(flat(12, 3), { ...baseArray, throwDistance: 40 }, wuxga, null, lenses)
    expect(s.lens).toBeNull()
    expect(s.diagnostics.some((d) => d.code === 'lens-none')).toBe(true)
  })
})

describe('solve — curved screen', () => {
  const curved = (width: number, height: number, radius: number): ScreenSurface => ({
    geometry: { kind: 'cylindrical', width, height, radius },
    gain: 1,
  })

  it('reports the wrap angle from arc length and radius', () => {
    const s = solve(curved(Math.PI * 5, 3, 10), baseArray, wuxga, null, [])
    // arc = pi*5 on r=10 -> pi/2 rad = 90 deg
    expect(s.wrapAngleDeg).toBeCloseTo(90, 6)
  })

  it('per-tile placement keeps every column optically identical', () => {
    const s = solve(curved(12, 3, 10), baseArray, wuxga, null, [])
    const trs = s.columns.map((c) => c.requiredThrowRatio)
    expect(Math.max(...trs) - Math.min(...trs)).toBeCloseTo(0, 12)
    expect(s.columns.every((c) => c.hShiftPct === 0)).toBe(true)
  })

  it('needs a wider lens on a curve than on a flat screen of the same width', () => {
    const flatS = solve(flat(12, 3), baseArray, wuxga, null, [])
    const curvedS = solve(curved(12, 3, 8), baseArray, wuxga, null, [])
    expect(curvedS.columns[0].requiredThrowRatio).toBeLessThan(
      flatS.columns[0].requiredThrowRatio,
    )
  })

  it('common-point placement needs lens shift on the outer columns', () => {
    const array: ArrayConfig = { ...baseArray, placement: 'common-point', columns: 3 }
    const s = solve(curved(12, 3, 10), array, wuxga, null, [])
    const centre = s.columns[1]
    const outer = s.columns[2]
    expect(Math.abs(outer.hShiftPct)).toBeGreaterThan(0)
    expect(Math.abs(centre.hShiftPct)).toBeCloseTo(0, 9)
    // outer columns sit on opposite sides, so shifts are opposite in sign
    expect(Math.sign(s.columns[0].hShiftPct)).toBe(-Math.sign(s.columns[2].hShiftPct))
  })

  it('brings outer tiles CLOSER in perpendicular depth but further in a straight line', () => {
    // A concave screen bulges towards the rig at its edges, so the outer tiles
    // are at a shorter perpendicular depth than the apex — while the actual
    // straight-line distance to them is longer.
    const array: ArrayConfig = { ...baseArray, placement: 'common-point', columns: 3, throwDistance: 6 }
    const s = solve(curved(12, 3, 10), array, wuxga, null, [])
    const centre = s.columns[1]
    const outer = s.columns[2]
    expect(outer.throwDistance).toBeLessThan(centre.throwDistance)
    expect(outer.slantDistance).toBeGreaterThan(centre.slantDistance)
    expect(centre.slantDistance).toBeCloseTo(centre.throwDistance, 9)
  })

  it('puts every tile at the same slant distance when the rig is at the centre', () => {
    // throw === radius means the rig sits on the centre of curvature, so every
    // point of the arc is exactly one radius away no matter how wide the wrap.
    const array: ArrayConfig = { ...baseArray, placement: 'common-point', throwDistance: 10 }
    const s = solve(curved(12, 3, 10), array, wuxga, null, [])
    for (const c of s.columns) {
      expect(c.slantDistance).toBeCloseTo(10, 9)
    }
  })

  it('reports slant distance equal to throw when each projector faces its own tile', () => {
    const s = solve(curved(12, 3, 10), baseArray, wuxga, null, [])
    for (const c of s.columns) {
      expect(c.slantDistance).toBeCloseTo(c.throwDistance, 12)
    }
  })

  it('flat common-point: slant distance is the hypotenuse of throw and offset', () => {
    const array: ArrayConfig = { ...baseArray, placement: 'common-point', columns: 3 }
    const s = solve(flat(12, 3), array, wuxga, null, [])
    const outer = s.columns[2]
    const pitch = s.tileWidth * (1 - s.hOverlap)
    expect(outer.slantDistance).toBeCloseTo(Math.hypot(10, pitch), 9)
    // Throw ratio is defined against the perpendicular plane, so it is unchanged.
    expect(outer.requiredThrowRatio).toBeCloseTo(s.columns[1].requiredThrowRatio, 12)
  })

  it('accepts a projector sitting exactly at the centre of curvature', () => {
    // Throw === radius. Every point of the screen is then equidistant, and the
    // required half-angle collapses to exactly half the tile's subtended angle,
    // so the flat image width is 2*R*tan(theta/2).
    const s = solve(curved(12, 3, 10), { ...baseArray, throwDistance: 10 }, wuxga, null, [])
    expect(s.ok).toBe(true)
    const tileTheta = s.tileWidth / 10
    expect(s.columns[0].flatImageWidth).toBeCloseTo(2 * 10 * Math.tan(tileTheta / 2), 9)
  })

  it('works past the centre of curvature too', () => {
    const s = solve(curved(12, 3, 8), { ...baseArray, throwDistance: 12 }, wuxga, null, [])
    expect(s.ok).toBe(true)
    expect(s.columns[0].requiredThrowRatio).toBeGreaterThan(0)
  })

  it('rejects a throw that puts the projector behind its own tile edges', () => {
    // A tight radius with one very wide tile: the segment edges bulge past the
    // projector, so no flat image can cover it.
    const s = solve(
      curved(12, 3, 2),
      { ...baseArray, columns: 1, throwDistance: 0.4 },
      wuxga,
      null,
      [],
    )
    expect(s.ok).toBe(false)
    expect(s.diagnostics.some((d) => d.code === 'throw-inside-arc')).toBe(true)
  })

  it('warns that the image is shorter at the tile edges', () => {
    const s = solve(curved(12, 3, 6), baseArray, wuxga, null, [])
    expect(s.curveHeightRatio).toBeLessThan(1)
    expect(s.diagnostics.some((d) => d.code === 'curve-height')).toBe(true)
  })
})

describe('solve — light', () => {
  it('matches the classic lumens*gain/area_sqft foot-lambert formula', () => {
    const s = solve(flat(12, 3), baseArray, { ...wuxga, lumens: 20000 }, null, [])
    const areaSqFt = 12 * 3 * 10.7639104
    expect(s.luminanceFootLamberts).toBeCloseTo((3 * 20000 * 1) / areaSqFt, 3)
  })

  it('scales linearly with screen gain', () => {
    const a = solve(flat(12, 3), baseArray, wuxga, null, [])
    const b = solve(
      { geometry: { kind: 'flat', width: 12, height: 3 }, gain: 2 },
      baseArray,
      wuxga,
      null,
      [],
    )
    expect(b.luminanceNits).toBeCloseTo(a.luminanceNits * 2, 6)
  })
})

describe('solve — guards', () => {
  it('refuses to calculate without a projector', () => {
    const s = solve(flat(12, 3), baseArray, null, null, [])
    expect(s.ok).toBe(false)
    expect(s.diagnostics.some((d) => d.code === 'no-projector')).toBe(true)
  })

  it('rejects a zero throw distance', () => {
    const s = solve(flat(12, 3), { ...baseArray, throwDistance: 0 }, wuxga, null, [])
    expect(s.ok).toBe(false)
  })

  it('treats a single projector as having no overlap at all', () => {
    const s = solve(flat(4, 2.5), { ...baseArray, columns: 1, rows: 1 }, wuxga, null, [])
    expect(s.hOverlap).toBe(0)
    expect(s.pixels.redundantPixels).toBeCloseTo(0, 6)
  })
})
