import type { UnitSystem } from '../types'

const M_PER_FT = 0.3048

/** Metres -> the display unit. */
export function fromMetres(m: number, units: UnitSystem): number {
  return units === 'metric' ? m : m / M_PER_FT
}

/** The display unit -> metres. */
export function toMetres(v: number, units: UnitSystem): number {
  return units === 'metric' ? v : v * M_PER_FT
}

export function lengthUnit(units: UnitSystem): string {
  return units === 'metric' ? 'm' : 'ft'
}

/** A length in metres, rendered in the display unit with its suffix. */
export function len(m: number, units: UnitSystem, dp = 3): string {
  return `${fromMetres(m, units).toFixed(dp)} ${lengthUnit(units)}`
}

/**
 * Feet and inches, for the imperial readouts where a decimal foot is useless
 * on a tape measure.
 */
export function feetInches(m: number): string {
  const totalIn = m / M_PER_FT * 12
  const sign = totalIn < 0 ? '-' : ''
  const abs = Math.abs(totalIn)
  const ft = Math.floor(abs / 12)
  const inch = abs - ft * 12
  return `${sign}${ft}' ${inch.toFixed(1)}"`
}

/** A length in metres shown in both systems, for reports. */
export function lenBoth(m: number): string {
  return `${m.toFixed(3)} m (${feetInches(m)})`
}

export function pxDensity(pxPerMetre: number, units: UnitSystem): string {
  return units === 'metric'
    ? `${pxPerMetre.toFixed(1)} px/m`
    : `${(pxPerMetre * M_PER_FT).toFixed(1)} px/ft`
}

/** Pixels per inch on the screen surface — the number that decides viewing distance. */
export function ppi(pxPerMetre: number): number {
  return pxPerMetre * 0.0254
}

export function int(n: number): string {
  return Math.round(n).toLocaleString('en-GB')
}

export function megapixels(n: number): string {
  return `${(n / 1e6).toFixed(2)} MP`
}

export function pct(fraction: number, dp = 1): string {
  return `${(fraction * 100).toFixed(dp)}%`
}
