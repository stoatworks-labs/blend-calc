import type { Lens, LensSeries, Library, Projector } from '../types'

/**
 * Seed library
 * ============
 *
 * Two tiers, deliberately separated:
 *
 *   1. GENERIC lens classes. These are honest by construction — they describe
 *      a category of lens ("short zoom, roughly 0.8–1.0:1"), not a specific
 *      product, so they cannot be wrong about a product. Use these to explore
 *      a design before you know what is actually in the truck.
 *
 *   2. REAL bodies, every one flagged `unverified: true`. Resolutions and
 *      lumens are from memory, NOT transcribed from a datasheet in front of
 *      me. They are here so the app is usable out of the box, and the UI and
 *      the PDF both shout about the flag. Clear it per-model once you have
 *      checked it (there is an "I've verified this" toggle in the editor).
 *
 * Nothing here is load-bearing: everything is editable, and the whole library
 * exports to and imports from JSON.
 */

const generic = (
  id: string,
  name: string,
  min: number,
  max: number,
  notes?: string,
): Lens => ({ id, name, throwRatioMin: min, throwRatioMax: max, notes })

export const GENERIC_LENSES: Lens[] = [
  generic('gen-ust', 'Generic ultra short throw', 0.35, 0.35, 'Fixed. Typically needs an off-axis mount.'),
  generic('gen-short-fixed', 'Generic short fixed', 0.68, 0.68, 'Fixed prime.'),
  generic('gen-short-zoom', 'Generic short zoom', 0.8, 1.2),
  generic('gen-standard-zoom', 'Generic standard zoom', 1.3, 1.8),
  generic('gen-medium-zoom', 'Generic medium zoom', 1.7, 2.4),
  generic('gen-long-zoom', 'Generic long zoom', 2.2, 3.6),
  generic('gen-ultra-long-zoom', 'Generic ultra long zoom', 3.6, 6.5),
]

const SERIES: LensSeries[] = [
  {
    id: 'generic',
    brand: 'Generic',
    name: 'Generic lens classes',
    lenses: GENERIC_LENSES,
  },
  {
    id: 'panasonic-et-d75',
    brand: 'Panasonic',
    name: 'ET-D75LE / ET-D3LE (3-chip bayonet)',
    lenses: [
      generic('pan-le95', 'ET-D75LE95 (ultra short)', 0.35, 0.35, 'Unverified'),
      generic('pan-le90', 'ET-D75LE90 (ultra short)', 0.36, 0.36, 'Unverified'),
      generic('pan-le6', 'ET-D75LE6', 0.9, 1.1, 'Unverified'),
      generic('pan-le8', 'ET-D75LE8', 1.3, 1.8, 'Unverified'),
      generic('pan-le10', 'ET-D75LE10', 1.7, 2.4, 'Unverified'),
      generic('pan-le20', 'ET-D75LE20', 2.4, 3.6, 'Unverified'),
      generic('pan-le30', 'ET-D75LE30', 3.6, 5.4, 'Unverified'),
      generic('pan-le40', 'ET-D75LE40', 5.4, 8.6, 'Unverified'),
    ],
  },
  {
    id: 'barco-tld-plus',
    brand: 'Barco',
    name: 'TLD+ / UDX lens family',
    lenses: [
      generic('bar-045', 'TLD+ 0.45:1', 0.45, 0.45, 'Unverified'),
      generic('bar-08', 'TLD+ 0.8:1', 0.8, 0.8, 'Unverified'),
      generic('bar-12', 'TLD+ 1.2-1.8:1', 1.2, 1.8, 'Unverified'),
      generic('bar-18', 'TLD+ 1.8-2.8:1', 1.8, 2.8, 'Unverified'),
      generic('bar-28', 'TLD+ 2.8-5.0:1', 2.8, 5.0, 'Unverified'),
      generic('bar-50', 'TLD+ 5.0-8.0:1', 5.0, 8.0, 'Unverified'),
    ],
  },
  {
    id: 'christie-m-series',
    brand: 'Christie',
    name: 'Christie high-brightness zoom set',
    lenses: [
      generic('chr-085', '0.85:1 fixed', 0.85, 0.85, 'Unverified'),
      generic('chr-13', '1.2-1.5:1', 1.2, 1.5, 'Unverified'),
      generic('chr-15', '1.5-2.0:1', 1.5, 2.0, 'Unverified'),
      generic('chr-20', '2.0-4.0:1', 2.0, 4.0, 'Unverified'),
      generic('chr-40', '4.0-7.2:1', 4.0, 7.2, 'Unverified'),
    ],
  },
  {
    id: 'epson-pu',
    brand: 'Epson',
    name: 'Epson ELPLX / ELPLM / ELPLL',
    lenses: [
      generic('eps-x02', 'ELPLX02 (ultra short)', 0.35, 0.35, 'Unverified'),
      generic('eps-u04', 'ELPLU04 (short zoom)', 0.87, 1.05, 'Unverified'),
      generic('eps-w08', 'ELPLW08 (wide zoom)', 1.04, 1.46, 'Unverified'),
      generic('eps-m15', 'ELPLM15 (middle zoom)', 2.17, 3.5, 'Unverified'),
      generic('eps-l08', 'ELPLL08 (long zoom)', 5.4, 8.7, 'Unverified'),
    ],
  },
]

const p = (
  id: string,
  brand: string,
  model: string,
  nativeWidth: number,
  nativeHeight: number,
  lumens: number,
  lensSeriesId: string,
): Projector => ({
  id,
  brand,
  model,
  nativeWidth,
  nativeHeight,
  lumens,
  lensSeriesId,
  unverified: true,
})

const PROJECTORS: Projector[] = [
  // Generic reference bodies — resolution/aspect are exact by definition, and
  // the lumens are round placeholders you are meant to overwrite.
  {
    id: 'gen-wuxga',
    brand: 'Generic',
    model: 'WUXGA 1920x1200',
    nativeWidth: 1920,
    nativeHeight: 1200,
    lumens: 20000,
    lensSeriesId: 'generic',
    notes: 'Reference body. Resolution is exact; set the lumens to your real unit.',
  },
  {
    id: 'gen-hd',
    brand: 'Generic',
    model: 'HD 1920x1080',
    nativeWidth: 1920,
    nativeHeight: 1080,
    lumens: 15000,
    lensSeriesId: 'generic',
    notes: 'Reference body. Resolution is exact; set the lumens to your real unit.',
  },
  {
    id: 'gen-uhd',
    brand: 'Generic',
    model: 'UHD 3840x2160',
    nativeWidth: 3840,
    nativeHeight: 2160,
    lumens: 25000,
    lensSeriesId: 'generic',
    notes: 'Reference body. Resolution is exact; set the lumens to your real unit.',
  },
  {
    id: 'gen-4kplus',
    brand: 'Generic',
    model: '4K+ 3840x2400',
    nativeWidth: 3840,
    nativeHeight: 2400,
    lumens: 30000,
    lensSeriesId: 'generic',
    notes: 'Reference body. Resolution is exact; set the lumens to your real unit.',
  },
  {
    id: 'gen-dci4k',
    brand: 'Generic',
    model: 'DCI 4K 4096x2160',
    nativeWidth: 4096,
    nativeHeight: 2160,
    lumens: 30000,
    lensSeriesId: 'generic',
    notes: 'Reference body. Resolution is exact; set the lumens to your real unit.',
  },

  // Real bodies — ALL unverified seed data.
  p('pan-rz21k', 'Panasonic', 'PT-RZ21K', 1920, 1200, 21000, 'panasonic-et-d75'),
  p('pan-rq22k', 'Panasonic', 'PT-RQ22K', 3840, 2400, 21000, 'panasonic-et-d75'),
  p('pan-rq35k', 'Panasonic', 'PT-RQ35K', 3840, 2400, 30500, 'panasonic-et-d75'),
  p('bar-udx-w32', 'Barco', 'UDX-W32', 1920, 1200, 31000, 'barco-tld-plus'),
  p('bar-udx-4k32', 'Barco', 'UDX-4K32', 3840, 2400, 31000, 'barco-tld-plus'),
  p('bar-udx-4k40', 'Barco', 'UDX-4K40', 3840, 2400, 40000, 'barco-tld-plus'),
  p('chr-d4k40', 'Christie', 'D4K40-RGB', 4096, 2160, 40000, 'christie-m-series'),
  p('chr-m4k25', 'Christie', 'M 4K25 RGB', 3840, 2160, 25000, 'christie-m-series'),
  p('eps-pu2010', 'Epson', 'EB-PU2010B', 1920, 1200, 10000, 'epson-pu'),
  p('eps-pu2220', 'Epson', 'EB-PU2220B', 1920, 1200, 20000, 'epson-pu'),
]

export function seedLibrary(): Library {
  return {
    projectors: PROJECTORS.map((x) => ({ ...x })),
    lensSeries: SERIES.map((s) => ({ ...s, lenses: s.lenses.map((l) => ({ ...l })) })),
  }
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function findProjector(lib: Library, id: string | null): Projector | null {
  if (!id) return null
  return lib.projectors.find((x) => x.id === id) ?? null
}

/** The lenses that fit the given body, always with the generic set appended. */
export function lensesFor(lib: Library, projector: Projector | null): Lens[] {
  if (!projector) return []
  const own = lib.lensSeries.find((s) => s.id === projector.lensSeriesId)?.lenses ?? []
  if (projector.lensSeriesId === 'generic') return [...own]
  const genericSet = lib.lensSeries.find((s) => s.id === 'generic')?.lenses ?? []
  return [...own, ...genericSet]
}

export function findLens(lib: Library, projector: Projector | null, id: string | null): Lens | null {
  if (!id) return null
  return lensesFor(lib, projector).find((l) => l.id === id) ?? null
}

export function brandsOf(lib: Library): string[] {
  return [...new Set(lib.projectors.map((x) => x.brand))].sort((a, b) => {
    // Keep Generic at the top; it is the safe default.
    if (a === 'Generic') return -1
    if (b === 'Generic') return 1
    return a.localeCompare(b)
  })
}

export function modelsOf(lib: Library, brand: string): Projector[] {
  return lib.projectors
    .filter((x) => x.brand === brand)
    .sort((a, b) => a.model.localeCompare(b.model))
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const LIB_KEY = 'blend-calc.library.v1'
const PROJECT_KEY = 'blend-calc.project.v1'

export function loadLibrary(): Library {
  try {
    const raw = localStorage.getItem(LIB_KEY)
    if (!raw) return seedLibrary()
    const parsed = JSON.parse(raw) as Library
    if (!Array.isArray(parsed.projectors) || !Array.isArray(parsed.lensSeries)) {
      return seedLibrary()
    }
    // Always re-graft the generic series so an old save cannot lose it.
    if (!parsed.lensSeries.some((s) => s.id === 'generic')) {
      parsed.lensSeries.unshift(SERIES[0])
    }
    return parsed
  } catch {
    return seedLibrary()
  }
}

export function saveLibrary(lib: Library) {
  try {
    localStorage.setItem(LIB_KEY, JSON.stringify(lib))
  } catch {
    /* private browsing / quota — the app still works, it just will not persist */
  }
}

export function loadStoredProject<T>(): T | null {
  try {
    const raw = localStorage.getItem(PROJECT_KEY)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function saveStoredProject(project: unknown) {
  try {
    localStorage.setItem(PROJECT_KEY, JSON.stringify(project))
  } catch {
    /* ignore */
  }
}

export function newId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}
