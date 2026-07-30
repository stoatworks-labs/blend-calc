import type {
  ArrayConfig,
  ColumnOptics,
  Diagnostic,
  Lens,
  PixelBudget,
  Projector,
  ScreenSurface,
  Solution,
} from '../types'

/**
 * The blend model
 * ===============
 *
 * N tiles across a span W, each tile w wide, adjacent tiles sharing a band of
 * `f * w` (f = the overlap fraction of ONE image width):
 *
 *     W = N*w - (N-1)*f*w  =>  w = W / (N - (N-1)*f)
 *
 * Everything else falls out of that. `spanForTile` and `tileForSpan` are
 * inverses of each other and are the only two places this relation is written.
 */
export function tileForSpan(span: number, count: number, overlap: number): number {
  return span / (count - (count - 1) * overlap)
}

export function spanForTile(tile: number, count: number, overlap: number): number {
  return tile * (count - (count - 1) * overlap)
}

/**
 * Solve for the overlap fraction that makes `count` tiles of size `tile`
 * exactly cover `span`. Returns NaN for a single tile, where the overlap is
 * undefined (there is nothing to overlap with).
 */
export function overlapForFit(span: number, count: number, tile: number): number {
  if (count < 2) return NaN
  return (count - span / tile) / (count - 1)
}

const DEG = 180 / Math.PI

// ---------------------------------------------------------------------------
// Curved-screen optics
// ---------------------------------------------------------------------------

/**
 * A projector sits at radius (R - D) from the centre of curvature O, aimed
 * radially at the mid-point M of its own arc segment. The segment subtends
 * angle `theta`. Put OM along +y:
 *
 *     M    = (0, R)                       nearest point of the segment
 *     P    = (0, R - D)                   the projector
 *     E    = (R sin(t/2), R cos(t/2))     segment edge, t = theta
 *
 * The projector forms a FLAT image on the plane through M perpendicular to PM.
 * The ray that lands on E leaves the axis at half-angle
 *
 *     alpha = atan( R sin(t/2) / (D - R(1 - cos(t/2))) )
 *
 * so the flat image must be `2 D tan(alpha)` wide — wider than the arc length,
 * because a flat rectangle has to reach around the curvature.
 *
 * As R -> infinity this collapses to alpha = atan((w/2)/D) and a flat image
 * width of exactly w, which is the flat-screen case. That identity is asserted
 * in the tests.
 */
export function curvedFlatImageWidth(
  radius: number,
  throwDistance: number,
  arcLength: number,
): { flatWidth: number; halfAngleRad: number; edgeDistanceRatio: number } {
  const theta = arcLength / radius
  const halfChordY = radius * (1 - Math.cos(theta / 2))
  // Perpendicular distance from the projector to the plane containing the
  // segment EDGE. On a concave screen the edges bulge towards the projector,
  // so this is shorter than the throw to the segment centre.
  const edgeDepth = throwDistance - halfChordY
  const halfAngle = Math.atan((radius * Math.sin(theta / 2)) / edgeDepth)
  return {
    flatWidth: 2 * throwDistance * Math.tan(halfAngle),
    halfAngleRad: halfAngle,
    // < 1: the image is SHORTER at the tile edge than at its centre, because
    // the edge is closer. You oversize vertically and mask the difference.
    edgeDistanceRatio: edgeDepth / throwDistance,
  }
}

// ---------------------------------------------------------------------------
// Pixel budget — the "data double" accounting
// ---------------------------------------------------------------------------

/**
 * Blend bands on the canvas, in canvas pixels:
 *
 *   - (C-1) vertical bands, each `hBlend` wide, running the full canvas height
 *   - (R-1) horizontal bands, each `vBlend` tall, running the full canvas width
 *   - where they cross, FOUR projectors overlap, not two
 *
 * Double area therefore subtracts the crossings twice (once for each band that
 * already counted them) and they are reported separately as quad area.
 *
 * Invariant, asserted in the tests:
 *     totalProjectorPixels === single + 2*double + 4*quad
 */
export function pixelBudget(
  nativeWidth: number,
  nativeHeight: number,
  columns: number,
  rows: number,
  hOverlap: number,
  vOverlap: number,
): PixelBudget {
  const hBlendPixels = hOverlap * nativeWidth
  const vBlendPixels = vOverlap * nativeHeight

  const canvasPixelWidth = spanForTile(nativeWidth, columns, hOverlap)
  const canvasPixelHeight = spanForTile(nativeHeight, rows, vOverlap)

  const totalProjectorPixels = columns * rows * nativeWidth * nativeHeight
  const uniquePixels = canvasPixelWidth * canvasPixelHeight

  const quadCoveredPixels = (columns - 1) * (rows - 1) * hBlendPixels * vBlendPixels
  const doubleCoveredPixels =
    (columns - 1) * hBlendPixels * canvasPixelHeight +
    (rows - 1) * vBlendPixels * canvasPixelWidth -
    2 * quadCoveredPixels
  const singleCoveredPixels = uniquePixels - doubleCoveredPixels - quadCoveredPixels

  const redundantPixels = totalProjectorPixels - uniquePixels

  return {
    totalProjectorPixels,
    canvasPixelWidth,
    canvasPixelHeight,
    uniquePixels,
    singleCoveredPixels,
    doubleCoveredPixels,
    quadCoveredPixels,
    redundantPixels,
    overlapEfficiencyLoss: totalProjectorPixels > 0 ? redundantPixels / totalProjectorPixels : 0,
    hBlendPixels,
    vBlendPixels,
  }
}

// ---------------------------------------------------------------------------
// The solver
// ---------------------------------------------------------------------------

export function solve(
  screen: ScreenSurface,
  array: ArrayConfig,
  projector: Projector | null,
  lens: Lens | null,
  lensCandidates: Lens[],
): Solution {
  const diagnostics: Diagnostic[] = []
  const err = (code: string, message: string) =>
    diagnostics.push({ severity: 'error', code, message })
  const warn = (code: string, message: string) =>
    diagnostics.push({ severity: 'warning', code, message })
  const info = (code: string, message: string) =>
    diagnostics.push({ severity: 'info', code, message })

  const { columns, rows } = array
  const geo = screen.geometry
  const screenWidth = geo.width
  const screenHeight = geo.height

  const empty = (): Solution => ({
    ok: false,
    diagnostics,
    hOverlap: array.hOverlap,
    vOverlap: array.vOverlap,
    tileWidth: 0,
    tileHeight: 0,
    hOverlapMetres: 0,
    vOverlapMetres: 0,
    coveredWidth: 0,
    coveredHeight: 0,
    widthSpill: 0,
    heightSpill: 0,
    pixels: pixelBudget(0, 0, columns, rows, 0, 0),
    columns: [],
    pixelDensity: 0,
    wrapAngleDeg: 0,
    curveHeightRatio: 1,
    luminanceNits: 0,
    luminanceFootLamberts: 0,
    lens: null,
    lensFits: false,
    lensZoomPosition: 0,
  })

  if (!projector) {
    err('no-projector', 'Select a projector model to calculate.')
    return empty()
  }
  if (screenWidth <= 0 || screenHeight <= 0) {
    err('bad-screen', 'Screen width and height must both be greater than zero.')
    return empty()
  }
  if (columns < 1 || rows < 1) {
    err('bad-array', 'The array needs at least one column and one row.')
    return empty()
  }
  if (array.throwDistance <= 0) {
    err('bad-throw', 'Throw distance must be greater than zero.')
    return empty()
  }

  const aspect = projector.nativeWidth / projector.nativeHeight

  // -- Resolve the two overlap fractions ------------------------------------
  let hOverlap = columns > 1 ? array.hOverlap : 0
  let vOverlap = rows > 1 ? array.vOverlap : 0
  let tileWidth: number
  let tileHeight: number

  if (array.fitMode === 'fit-width') {
    tileWidth = tileForSpan(screenWidth, columns, hOverlap)
    tileHeight = tileWidth / aspect
    if (rows > 1) {
      vOverlap = overlapForFit(screenHeight, rows, tileHeight)
    }
  } else if (array.fitMode === 'fit-height') {
    tileHeight = tileForSpan(screenHeight, rows, vOverlap)
    tileWidth = tileHeight * aspect
    if (columns > 1) {
      hOverlap = overlapForFit(screenWidth, columns, tileWidth)
    }
  } else {
    // Manual: both overlaps are given. Drive off width and let the height fall
    // where it falls, then report the mismatch rather than hiding it.
    tileWidth = tileForSpan(screenWidth, columns, hOverlap)
    tileHeight = tileWidth / aspect
  }

  const coveredWidth = spanForTile(tileWidth, columns, hOverlap)
  const coveredHeight = spanForTile(tileHeight, rows, vOverlap)
  const widthSpill = coveredWidth - screenWidth
  const heightSpill = coveredHeight - screenHeight

  // -- Sanity-check the solved overlaps -------------------------------------
  const checkOverlap = (v: number, axis: 'Horizontal' | 'Vertical', count: number) => {
    if (count < 2) return
    if (!Number.isFinite(v)) {
      err('overlap-nan', `${axis} overlap could not be solved.`)
      return
    }
    if (v < 0) {
      err(
        'overlap-gap',
        `${axis} overlap solves to ${(v * 100).toFixed(1)}% — the tiles do not reach ` +
          `each other, leaving a gap. Add a column/row, or use a projector with a ` +
          `different native aspect ratio.`,
      )
    } else if (v < 0.08) {
      warn(
        'overlap-thin',
        `${axis} overlap is only ${(v * 100).toFixed(1)}% of the image. Below about 8% ` +
          `there is not enough soft-edge width to hide the seam, and alignment drift ` +
          `becomes visible.`,
      )
    } else if (v > 0.5) {
      err(
        'overlap-excess',
        `${axis} overlap of ${(v * 100).toFixed(1)}% exceeds 50%, so non-adjacent ` +
          `projectors would overlap. The model does not cover that.`,
      )
    } else if (v > 0.35) {
      warn(
        'overlap-wide',
        `${axis} overlap of ${(v * 100).toFixed(1)}% is very wide — you are paying for ` +
          `a lot of duplicated pixels. Consider fewer, brighter projectors.`,
      )
    }
  }
  checkOverlap(hOverlap, 'Horizontal', columns)
  checkOverlap(vOverlap, 'Vertical', rows)

  if (array.fitMode === 'manual') {
    if (Math.abs(heightSpill) > 1e-6) {
      const pct = (heightSpill / screenHeight) * 100
      if (heightSpill > 0) {
        info(
          'height-spill',
          `The array is ${fmtM(heightSpill)} taller than the screen (${pct.toFixed(1)}%). ` +
            `That vertical spill must be masked or blanked.`,
        )
      } else {
        warn(
          'height-short',
          `The array is ${fmtM(-heightSpill)} shorter than the screen ` +
            `(${(-pct).toFixed(1)}%) — the bottom of the screen is not covered.`,
        )
      }
    }
  }

  if (rows === 1 && array.fitMode === 'fit-width' && Math.abs(heightSpill) > 1e-6) {
    const pct = (heightSpill / screenHeight) * 100
    if (heightSpill > 0) {
      info(
        'single-row-spill',
        `A single row of ${aspect.toFixed(3)}:1 images on a ` +
          `${(screenWidth / screenHeight).toFixed(3)}:1 screen overshoots the height by ` +
          `${fmtM(heightSpill)} (${pct.toFixed(1)}%). Mask it, or blank those pixels.`,
      )
    } else {
      warn(
        'single-row-short',
        `A single row leaves ${fmtM(-heightSpill)} (${(-pct).toFixed(1)}%) of the screen ` +
          `height uncovered. Add a row, or accept a shorter active area.`,
      )
    }
  }

  // -- Optics per column ----------------------------------------------------
  const isCurved = geo.kind === 'cylindrical'
  const radius = isCurved ? geo.radius : Infinity
  const wrapAngleDeg = isCurved ? (screenWidth / radius) * DEG : 0
  let curveHeightRatio = 1

  const cols: ColumnOptics[] = []
  const thetaTile = isCurved ? tileWidth / radius : 0

  if (isCurved) {
    if (radius <= 0) {
      err('bad-radius', 'Screen radius must be greater than zero.')
      return empty()
    }
    if (wrapAngleDeg > 360) {
      err('wrap-over', `A ${wrapAngleDeg.toFixed(0)}° wrap is more than a full circle.`)
      return empty()
    }
    // The projector must be in FRONT of the plane through its tile's edges,
    // otherwise the edge rays never converge and the image width is undefined.
    //
    // Note this is NOT "throw must be less than the radius". Sitting exactly at
    // the centre of curvature (throw === radius) is a normal, and often ideal,
    // position for a curved screen — every point of the screen is then the same
    // distance away, and the required half-angle is exactly half the tile's
    // subtended angle. Going past the centre is still valid geometry.
    const edgeDepth = array.throwDistance - radius * (1 - Math.cos(thetaTile / 2))
    if (edgeDepth <= 0) {
      err(
        'throw-inside-arc',
        `At ${fmtM(array.throwDistance)} the projector is level with, or behind, the edges ` +
          `of its own ${(thetaTile * DEG).toFixed(1)}° segment, which bulge ` +
          `${fmtM(radius * (1 - Math.cos(thetaTile / 2)))} towards it. Move it back, or ` +
          `use more columns so each segment is flatter.`,
      )
      return empty()
    }
  }

  for (let c = 0; c < columns; c++) {
    // Angular centre of this tile, measured from the middle of the whole arc.
    const centreOffsetTiles = c - (columns - 1) / 2
    const pitch = tileWidth * (1 - hOverlap) // centre-to-centre spacing
    const linearOffset = centreOffsetTiles * pitch

    if (!isCurved) {
      // Flat screen. Throw is the same for every tile in both placement modes;
      // only the required lens shift differs.
      const flatImageWidth = tileWidth
      const hShiftPct =
        array.placement === 'common-point' ? (linearOffset / flatImageWidth) * 100 : 0
      const offset = array.placement === 'common-point' ? linearOffset : 0
      cols.push({
        column: c,
        throwDistance: array.throwDistance,
        slantDistance: Math.hypot(array.throwDistance, offset),
        flatImageWidth,
        requiredThrowRatio: array.throwDistance / flatImageWidth,
        hShiftPct,
        offAxisDeg: offset !== 0 ? Math.atan(offset / array.throwDistance) * DEG : 0,
      })
      continue
    }

    const phi = linearOffset / radius // angular centre of this tile

    if (array.placement === 'per-tile') {
      // Each projector on its own radius, aimed at its own tile. Every column
      // is optically identical — this is the standard concentric dome/curve rig.
      const { flatWidth, edgeDistanceRatio } = curvedFlatImageWidth(
        radius,
        array.throwDistance,
        tileWidth,
      )
      curveHeightRatio = edgeDistanceRatio
      cols.push({
        column: c,
        throwDistance: array.throwDistance,
        // Aimed radially at its own tile, so the slant distance IS the throw.
        slantDistance: array.throwDistance,
        flatImageWidth: flatWidth,
        requiredThrowRatio: array.throwDistance / flatWidth,
        hShiftPct: 0,
        offAxisDeg: phi * DEG,
      })
    } else {
      // One rig position for the whole array. `throwDistance` is measured to the
      // arc apex, so the projector sits at (0, R - D) with its axis along +y.
      // Project each tile edge onto the plane through the tile's own centre.
      const py = radius - array.throwDistance
      const edge = (angle: number) => {
        const ex = radius * Math.sin(angle)
        const ey = radius * Math.cos(angle) - py
        return { ex, ey }
      }
      const centre = edge(phi)
      const refDepth = centre.ey // distance from rig to this tile's reference plane
      if (refDepth <= 0) {
        err(
          'tile-behind-rig',
          `Column ${c + 1} wraps behind the rig position. Move the rig back, ` +
            `reduce the wrap angle, or switch to per-tile placement.`,
        )
        return empty()
      }
      const l = edge(phi - thetaTile / 2)
      const r = edge(phi + thetaTile / 2)
      // Where the edge rays pierce the reference plane.
      const xl = (l.ex / l.ey) * refDepth
      const xr = (r.ex / r.ey) * refDepth
      const flatImageWidth = xr - xl
      const centreX = (xl + xr) / 2
      cols.push({
        column: c,
        throwDistance: refDepth,
        slantDistance: Math.hypot(centre.ex, centre.ey),
        flatImageWidth,
        requiredThrowRatio: refDepth / flatImageWidth,
        hShiftPct: (centreX / flatImageWidth) * 100,
        offAxisDeg: Math.atan(centre.ex / centre.ey) * DEG,
      })
      // Vertical foreshortening for the worst column, evaluated at its far edge.
      const far = Math.max(Math.abs(l.ey), Math.abs(r.ey)) === Math.abs(l.ey) ? r : l
      curveHeightRatio = Math.min(curveHeightRatio, far.ey / refDepth)
    }
  }

  if (isCurved && curveHeightRatio < 0.995) {
    warn(
      'curve-height',
      `On this curve the image is ${((1 - curveHeightRatio) * 100).toFixed(1)}% shorter at ` +
        `the tile edges than at the centre. Oversize vertically by at least that much ` +
        `and mask, or let the warp engine pull the corners down.`,
    )
  }

  if (array.placement === 'common-point') {
    const worstShift = Math.max(...cols.map((c) => Math.abs(c.hShiftPct)))
    if (worstShift > 0.01) {
      info(
        'shift-needed',
        `Common-point placement needs up to ${worstShift.toFixed(1)}% horizontal lens ` +
          `shift (as a fraction of image width) on the outermost columns.`,
      )
    }
  }

  // -- Lens selection -------------------------------------------------------
  // Size the lens for the tightest requirement across the array, so one lens
  // type covers every position.
  const minTR = Math.min(...cols.map((c) => c.requiredThrowRatio))
  const maxTR = Math.max(...cols.map((c) => c.requiredThrowRatio))

  let chosen: Lens | null = lens
  if (!chosen) {
    chosen =
      lensCandidates.find((l) => l.throwRatioMin <= minTR && l.throwRatioMax >= maxTR) ?? null
    if (chosen) {
      info('lens-auto', `Auto-selected ${chosen.name} for a required throw ratio of ${fmtTR(minTR, maxTR)}.`)
    } else if (lensCandidates.length > 0) {
      warn(
        'lens-none',
        `No lens in this body's series covers the required throw ratio of ` +
          `${fmtTR(minTR, maxTR)}. Change the throw distance or the array layout.`,
      )
    }
  }

  let lensFits = false
  let lensZoomPosition = 0
  if (chosen) {
    lensFits = chosen.throwRatioMin <= minTR + 1e-9 && chosen.throwRatioMax >= maxTR - 1e-9
    const span = chosen.throwRatioMax - chosen.throwRatioMin
    lensZoomPosition = span > 1e-9 ? clamp((minTR - chosen.throwRatioMin) / span, 0, 1) : 0
    if (!lensFits) {
      const need = fmtTR(minTR, maxTR)
      err(
        'lens-out-of-range',
        `${chosen.name} covers ${chosen.throwRatioMin.toFixed(2)}–` +
          `${chosen.throwRatioMax.toFixed(2)}:1 but this design needs ${need}:1.`,
      )
    } else if (span > 1e-9 && (lensZoomPosition < 0.05 || lensZoomPosition > 0.95)) {
      warn(
        'lens-at-limit',
        `${chosen.name} is at the ${lensZoomPosition < 0.5 ? 'wide' : 'tele'} end of its ` +
          `zoom. Leave yourself some adjustment — a small change on site will run out of lens.`,
      )
    }
    if (chosen.hShiftPct !== undefined) {
      const worst = Math.max(...cols.map((c) => Math.abs(c.hShiftPct)))
      if (worst > chosen.hShiftPct) {
        err(
          'shift-out-of-range',
          `This layout needs ${worst.toFixed(1)}% horizontal lens shift but ${chosen.name} ` +
            `offers ${chosen.hShiftPct}%. Spread the projectors out, or reposition the rig.`,
        )
      }
    }
  }

  // -- Pixels ---------------------------------------------------------------
  const pixels = pixelBudget(
    projector.nativeWidth,
    projector.nativeHeight,
    columns,
    rows,
    Math.max(0, hOverlap),
    Math.max(0, vOverlap),
  )

  // -- Light ----------------------------------------------------------------
  // Blend regions are compensated back down to a single projector's level, so
  // the useful flux is the sum of all projectors spread over the UNIQUE area.
  const screenArea = screenWidth * screenHeight
  const totalLumens = projector.lumens * columns * rows
  const luminanceNits = screenArea > 0 ? (totalLumens * screen.gain) / (Math.PI * screenArea) : 0
  const luminanceFootLamberts = luminanceNits / 3.4262591

  if (luminanceFootLamberts > 0 && luminanceFootLamberts < 10) {
    warn(
      'dim',
      `Estimated ${luminanceFootLamberts.toFixed(1)} fL. SMPTE-style rooms want 12–16 fL; ` +
        `bright corporate rooms want far more. This is a lamp-hours-zero, ` +
        `zero-loss figure, so treat it as a ceiling.`,
    )
  }

  const pixelDensity = tileWidth > 0 ? projector.nativeWidth / tileWidth : 0

  if (projector.unverified) {
    warn(
      'unverified-specs',
      `${projector.brand} ${projector.model} is seed data that has NOT been checked ` +
        `against a datasheet. Verify native resolution, lumens and lens ranges before ` +
        `quoting from this.`,
    )
  }

  const ok = !diagnostics.some((d) => d.severity === 'error')

  return {
    ok,
    diagnostics,
    hOverlap,
    vOverlap,
    tileWidth,
    tileHeight,
    hOverlapMetres: hOverlap * tileWidth,
    vOverlapMetres: vOverlap * tileHeight,
    coveredWidth,
    coveredHeight,
    widthSpill,
    heightSpill,
    pixels,
    columns: cols,
    pixelDensity,
    wrapAngleDeg,
    curveHeightRatio,
    luminanceNits,
    luminanceFootLamberts,
    lens: chosen,
    lensFits,
    lensZoomPosition,
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v))
}

function fmtM(v: number) {
  return `${v.toFixed(3)} m`
}

function fmtTR(min: number, max: number) {
  return Math.abs(max - min) < 5e-3 ? min.toFixed(2) : `${min.toFixed(2)}–${max.toFixed(2)}`
}
