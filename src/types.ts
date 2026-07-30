// Domain types. All lengths are SI metres internally; the UI converts at the edges.

export type UnitSystem = 'metric' | 'imperial'

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

/**
 * `width` on a cylindrical screen is the ARC LENGTH along the surface, not the
 * chord. That is the dimension a screen is actually specified and built to, and
 * it is what the blend maths divides up.
 */
export type ScreenGeometry =
  | { kind: 'flat'; width: number; height: number }
  | { kind: 'cylindrical'; width: number; height: number; radius: number }

export type ScreenSurface = {
  geometry: ScreenGeometry
  /** Peak gain of the screen material. 1.0 = unity matte white. */
  gain: number
}

// ---------------------------------------------------------------------------
// Array / blend
// ---------------------------------------------------------------------------

/**
 * Which dimension the operator pins, and which one the solver derives.
 *
 * - `fit-width`  : you set the horizontal overlap; vertical overlap is solved so
 *                  the array covers the screen height exactly.
 * - `fit-height` : the mirror image.
 * - `manual`     : you set both; the solver reports the resulting coverage and
 *                  any spill or shortfall instead of forcing a fit.
 */
export type FitMode = 'fit-width' | 'fit-height' | 'manual'

/**
 * Where the projectors physically sit.
 *
 * - `per-tile`     : each projector is on the optical axis of its own tile
 *                    (a spread-out rig). No lens shift needed.
 * - `common-point` : every projector is stacked at one position (a single
 *                    hang point or a projection booth). Off-axis tiles need
 *                    lens shift, and on a curve the throw varies per column.
 */
export type PlacementMode = 'per-tile' | 'common-point'

export type ArrayConfig = {
  columns: number
  rows: number
  fitMode: FitMode
  /** Horizontal overlap as a fraction of ONE projector's image width, 0..0.5 */
  hOverlap: number
  /** Vertical overlap as a fraction of ONE projector's image height, 0..0.5 */
  vOverlap: number
  placement: PlacementMode
  /**
   * Perpendicular throw distance in metres. On a curved screen in `per-tile`
   * mode this is the radial distance from each projector to its own tile
   * centre; in `common-point` mode it is the distance from the single rig
   * position to the nearest point of the screen (the arc apex).
   */
  throwDistance: number
}

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

export type Lens = {
  id: string
  name: string
  /** Throw ratio = throw distance / image width, at the wide end. */
  throwRatioMin: number
  /** Throw ratio at the tele end. Equal to min for a fixed (prime) lens. */
  throwRatioMax: number
  /** Max horizontal lens shift, % of image width. Undefined = unknown. */
  hShiftPct?: number
  /** Max vertical lens shift, % of image height. Undefined = unknown. */
  vShiftPct?: number
  notes?: string
}

/**
 * A lens mount family. Bodies share a mount, so lenses are held once per
 * family rather than duplicated onto every model.
 */
export type LensSeries = {
  id: string
  brand: string
  name: string
  lenses: Lens[]
}

export type Projector = {
  id: string
  brand: string
  model: string
  /** Native panel/DMD resolution in pixels. */
  nativeWidth: number
  nativeHeight: number
  /** Rated light output, ANSI or ISO lumens as published. */
  lumens: number
  /** id of the LensSeries this body accepts. */
  lensSeriesId: string
  /**
   * false  = specs typed from a datasheet by the user, or otherwise trusted.
   * true   = shipped as seed data and NOT checked against a datasheet.
   * Anything unverified is flagged in the UI and on the PDF report.
   */
  unverified?: boolean
  notes?: string
}

export type Library = {
  projectors: Projector[]
  lensSeries: LensSeries[]
}

// ---------------------------------------------------------------------------
// Project (the whole saved document)
// ---------------------------------------------------------------------------

export type Project = {
  name: string
  client?: string
  notes?: string
  units: UnitSystem
  screen: ScreenSurface
  array: ArrayConfig
  projectorId: string | null
  /** null = let the solver recommend from the body's lens series. */
  lensId: string | null
}

// ---------------------------------------------------------------------------
// Solver output
// ---------------------------------------------------------------------------

export type Severity = 'error' | 'warning' | 'info'

export type Diagnostic = {
  severity: Severity
  code: string
  message: string
}

/** Per-column optical result. Identical across columns except on a curve. */
export type ColumnOptics = {
  column: number
  /**
   * Perpendicular throw from the projector to this tile's reference plane.
   * This is the distance throw ratio is defined against, so it is the one the
   * lens maths uses — NOT the straight-line distance to the tile.
   */
  throwDistance: number
  /**
   * Straight-line distance from the projector to the centre of its tile. This
   * is what someone measures with a laser on site. It differs from
   * `throwDistance` whenever the tile is off the rig axis.
   */
  slantDistance: number
  /**
   * Width of the FLAT image the projector must form at the reference plane in
   * order to cover this tile. On a curve this is wider than the tile's arc
   * length, because a flat image plane has to reach around the curvature.
   */
  flatImageWidth: number
  /** Required throw ratio = throwDistance / flatImageWidth. */
  requiredThrowRatio: number
  /** Horizontal lens shift needed, % of image width. 0 in `per-tile` mode. */
  hShiftPct: number
  /** Angle of this tile's centre off the rig axis, degrees. Curve/common-point. */
  offAxisDeg: number
}

export type PixelBudget = {
  /** Total addressable pixels across every projector. */
  totalProjectorPixels: number
  /** Distinct pixels on the screen surface — the system resolution. */
  canvasPixelWidth: number
  canvasPixelHeight: number
  uniquePixels: number
  /** Pixels covered by exactly one projector. */
  singleCoveredPixels: number
  /** THE DATA DOUBLE: canvas area covered by exactly two projectors. */
  doubleCoveredPixels: number
  /** Canvas area covered by four projectors — the corners of a grid blend. */
  quadCoveredPixels: number
  /** totalProjectorPixels - uniquePixels. The pixels you pay for twice. */
  redundantPixels: number
  /** redundantPixels / totalProjectorPixels. */
  overlapEfficiencyLoss: number
  /** Width of one horizontal blend band, in projector pixels. */
  hBlendPixels: number
  /** Height of one vertical blend band, in projector pixels. */
  vBlendPixels: number
}

export type Solution = {
  ok: boolean
  diagnostics: Diagnostic[]

  /** Resolved overlaps after the fit solve. Fractions of one image dimension. */
  hOverlap: number
  vOverlap: number

  /** One projector's image on the screen, in metres. Arc length if curved. */
  tileWidth: number
  tileHeight: number

  /** Metres of physical overlap between two adjacent tiles. */
  hOverlapMetres: number
  vOverlapMetres: number

  /** What the array actually covers. Equals the screen unless fitMode=manual. */
  coveredWidth: number
  coveredHeight: number
  /** Positive = image spills past the screen, negative = the screen is short. */
  widthSpill: number
  heightSpill: number

  pixels: PixelBudget
  columns: ColumnOptics[]

  /** Pixels per metre on the screen surface, horizontal. */
  pixelDensity: number

  /** Total wrap angle of a cylindrical screen, degrees. 0 when flat. */
  wrapAngleDeg: number
  /**
   * On a curve, the image height at the tile EDGE as a fraction of the height
   * at the tile centre. < 1 means you must oversize vertically and mask.
   */
  curveHeightRatio: number

  /** Estimated screen luminance, nits (cd/m^2), blend-compensated. */
  luminanceNits: number
  luminanceFootLamberts: number

  /** The lens actually used for the report, and whether it can do the job. */
  lens: Lens | null
  lensFits: boolean
  /** 0 = at the wide end of the zoom, 1 = at the tele end. */
  lensZoomPosition: number
}
