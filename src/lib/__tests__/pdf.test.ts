import { describe, expect, it } from 'vitest'
import { buildReport, reportFilename } from '../pdf'
import { solve } from '../geometry'
import { findProjector, lensesFor, seedLibrary } from '../library'
import type { Project } from '../../types'

/**
 * The PDF builder does a lot of arithmetic on a mutable cursor and will happily
 * throw on an edge case (a NaN coordinate, an empty column list) that no other
 * test would catch. These tests build a real document for each shape of design
 * and check the object that comes back.
 *
 * Set BLEND_CALC_PDF_OUT=/some/dir to also write the PDFs out for eyeballing.
 */

const lib = seedLibrary()
const projector = findProjector(lib, 'gen-wuxga')!

const project = (over: Partial<Project> = {}): Project => ({
  name: 'Test Show',
  client: 'A Client',
  notes: 'Some notes that ride along with the report.',
  units: 'metric',
  screen: { geometry: { kind: 'flat', width: 12, height: 3 }, gain: 1 },
  array: {
    columns: 3,
    rows: 1,
    fitMode: 'fit-width',
    hOverlap: 0.2,
    vOverlap: 0.2,
    placement: 'per-tile',
    throwDistance: 10,
  },
  projectorId: 'gen-wuxga',
  lensId: null,
  ...over,
})

function build(p: Project) {
  const sol = solve(p.screen, p.array, projector, null, lensesFor(lib, projector))
  const doc = buildReport(p, sol, projector, sol.lens)
  const out = process.env.BLEND_CALC_PDF_OUT
  if (out) doc.save(`${out}/${reportFilename(p)}`)
  return { doc, sol }
}

describe('pdf report', () => {
  it('builds a multi-page report for a flat single-row blend', () => {
    const { doc } = build(project())
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1)
    const bytes = doc.output('arraybuffer')
    expect(bytes.byteLength).toBeGreaterThan(2000)
    // A real PDF starts with %PDF-
    expect(new TextDecoder().decode(new Uint8Array(bytes).slice(0, 5))).toBe('%PDF-')
  })

  it('builds for a grid on a curved screen with common-point placement', () => {
    const { doc, sol } = build(
      project({
        name: 'Curved Grid',
        screen: { geometry: { kind: 'cylindrical', width: 16, height: 4 , radius: 12 }, gain: 1.4 },
        array: {
          columns: 4,
          rows: 2,
          fitMode: 'fit-width',
          hOverlap: 0.18,
          vOverlap: 0.2,
          placement: 'common-point',
          throwDistance: 8,
        },
      }),
    )
    expect(sol.columns).toHaveLength(4)
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2)
  })

  it('builds for a single projector with no blends at all', () => {
    const { doc, sol } = build(
      project({
        name: 'Single',
        array: {
          columns: 1,
          rows: 1,
          fitMode: 'fit-width',
          hOverlap: 0,
          vOverlap: 0,
          placement: 'per-tile',
          throwDistance: 6,
        },
      }),
    )
    expect(sol.pixels.redundantPixels).toBeCloseTo(0, 6)
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1)
  })

  it('builds a large array without overflowing off the last page', () => {
    const { doc } = build(
      project({
        name: 'Big Array',
        screen: { geometry: { kind: 'flat', width: 40, height: 6 }, gain: 1 },
        array: {
          columns: 8,
          rows: 3,
          fitMode: 'fit-width',
          hOverlap: 0.2,
          vOverlap: 0.2,
          placement: 'per-tile',
          throwDistance: 14,
        },
      }),
    )
    // 24 schedule rows plus diagrams must paginate rather than throw.
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2)
  })

  it('still produces a report when the design has errors', () => {
    // A layout that cannot be solved should not crash the report generator —
    // the warnings section is exactly where the operator needs to read why.
    const p = project({
      name: 'Broken',
      screen: { geometry: { kind: 'flat', width: 4, height: 40 }, gain: 1 },
      array: {
        columns: 2,
        rows: 2,
        fitMode: 'fit-width',
        hOverlap: 0.2,
        vOverlap: 0.2,
        placement: 'per-tile',
        throwDistance: 10,
      },
    })
    const sol = solve(p.screen, p.array, projector, null, lensesFor(lib, projector))
    expect(sol.ok).toBe(false)
    expect(() => buildReport(p, sol, projector, sol.lens)).not.toThrow()
  })

  it('derives a filesystem-safe filename from the project name', () => {
    expect(reportFilename(project({ name: 'Rock & Roll / Main Stage' }))).toBe(
      'rock-roll-main-stage-report.pdf',
    )
    expect(reportFilename(project({ name: '' }))).toBe('blend-report.pdf')
  })
})
