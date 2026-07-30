import { useEffect, useMemo, useState } from 'react'
import type { ArrayConfig, FitMode, Library, PlacementMode, Project } from './types'
import { solve } from './lib/geometry'
import {
  brandsOf,
  findLens,
  findProjector,
  lensesFor,
  loadLibrary,
  loadStoredProject,
  modelsOf,
  saveLibrary,
  saveStoredProject,
} from './lib/library'
import { exportResolumeXml } from './lib/resolume'
import { fromMetres, int, lengthUnit, megapixels, pct, ppi, toMetres } from './lib/units'
import { FrontElevation, PlanView } from './components/Diagram'
import { LibraryEditor } from './components/LibraryEditor'
import { Card, Field, Modal, NumberField, Segmented, Stat, downloadText } from './components/ui'

const DEFAULT_PROJECT: Project = {
  name: 'Untitled blend',
  client: '',
  notes: '',
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
}

export default function App() {
  const [library, setLibrary] = useState<Library>(() => loadLibrary())
  const [project, setProject] = useState<Project>(
    () => loadStoredProject<Project>() ?? DEFAULT_PROJECT,
  )
  const [showLibrary, setShowLibrary] = useState(false)
  const [showExport, setShowExport] = useState(false)

  useEffect(() => saveLibrary(library), [library])
  useEffect(() => saveStoredProject(project), [project])

  const projector = findProjector(library, project.projectorId)
  const candidates = useMemo(() => lensesFor(library, projector), [library, projector])
  const lens = findLens(library, projector, project.lensId)

  const sol = useMemo(
    () => solve(project.screen, project.array, projector, lens, candidates),
    [project.screen, project.array, projector, lens, candidates],
  )

  const u = project.units
  const set = (patch: Partial<Project>) => setProject((p) => ({ ...p, ...patch }))
  const setArray = (patch: Partial<ArrayConfig>) =>
    setProject((p) => ({ ...p, array: { ...p.array, ...patch } }))
  const setGeom = (patch: Record<string, unknown>) =>
    setProject((p) => ({
      ...p,
      screen: { ...p.screen, geometry: { ...p.screen.geometry, ...patch } as Project['screen']['geometry'] },
    }))

  const geo = project.screen.geometry
  const { columns, rows } = project.array
  const canExport = sol.ok && !!projector

  // jsPDF drags in ~370 kB of html2canvas and dompurify that nothing else here
  // needs, so it is loaded only when someone actually asks for a report.
  const [pdfBusy, setPdfBusy] = useState(false)
  const downloadPdf = async () => {
    if (!projector) return
    setPdfBusy(true)
    try {
      const { buildReport, reportFilename } = await import('./lib/pdf')
      buildReport(project, sol, projector, sol.lens).save(reportFilename(project))
    } finally {
      setPdfBusy(false)
    }
  }

  const downloadResolume = (target: 'preferences' | 'preset') => {
    if (!projector) return
    const xml = exportResolumeXml(sol, projector, columns, rows, { name: project.name, target })
    const base = (project.name || 'blend').replace(/[^a-z0-9]+/gi, '-').toLowerCase()
    downloadText(
      target === 'preferences' ? 'AdvancedOutput.xml' : `${base}-advanced-output.xml`,
      xml,
      'application/xml',
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          Blend Calc
        </div>
        <input
          type="text"
          value={project.name}
          onChange={(e) => set({ name: e.target.value })}
          aria-label="Project name"
          style={{ maxWidth: 260 }}
        />
        <div className="topbar-spacer" />
        <div className="segmented" style={{ width: 150 }}>
          <button aria-pressed={u === 'metric'} onClick={() => set({ units: 'metric' })}>
            Metric
          </button>
          <button aria-pressed={u === 'imperial'} onClick={() => set({ units: 'imperial' })}>
            Imperial
          </button>
        </div>
        <button onClick={() => setShowLibrary(true)}>Library</button>
        <button disabled={!canExport} onClick={() => setShowExport(true)}>
          Export
        </button>
        <button className="primary" disabled={!canExport || pdfBusy} onClick={downloadPdf}>
          {pdfBusy ? 'Building…' : 'PDF report'}
        </button>
      </header>

      <div className="layout">
        {/* ------------------------------------------------------- inputs */}
        <div className="col">
          <Card title="Projection canvas">
            <Segmented
              label="Screen shape"
              value={geo.kind}
              options={[
                { value: 'flat', label: 'Flat' },
                { value: 'cylindrical', label: 'Curved' },
              ]}
              onChange={(kind) =>
                setProject((p) => ({
                  ...p,
                  screen: {
                    ...p.screen,
                    geometry:
                      kind === 'flat'
                        ? { kind: 'flat', width: p.screen.geometry.width, height: p.screen.geometry.height }
                        : {
                            kind: 'cylindrical',
                            width: p.screen.geometry.width,
                            height: p.screen.geometry.height,
                            radius:
                              p.screen.geometry.kind === 'cylindrical'
                                ? p.screen.geometry.radius
                                : Math.max(p.screen.geometry.width, 1) * 0.9,
                          },
                  },
                }))
              }
            />
            <div className="row">
              <NumberField
                label={geo.kind === 'flat' ? 'Width' : 'Arc width'}
                suffix={lengthUnit(u)}
                value={fromMetres(geo.width, u)}
                min={0.1}
                step={0.1}
                hint={geo.kind === 'cylindrical' ? 'Measured along the curved surface.' : undefined}
                onChange={(v) => setGeom({ width: toMetres(v, u) })}
              />
              <NumberField
                label="Height"
                suffix={lengthUnit(u)}
                value={fromMetres(geo.height, u)}
                min={0.1}
                step={0.1}
                onChange={(v) => setGeom({ height: toMetres(v, u) })}
              />
            </div>
            {geo.kind === 'cylindrical' ? (
              <NumberField
                label="Radius of curvature"
                suffix={lengthUnit(u)}
                value={fromMetres(geo.radius, u)}
                min={0.1}
                step={0.1}
                hint={
                  sol.wrapAngleDeg > 0
                    ? `Wrap angle ${sol.wrapAngleDeg.toFixed(1)}° · chord ${(
                        2 * geo.radius * Math.sin(geo.width / geo.radius / 2)
                      ).toFixed(2)} m`
                    : undefined
                }
                onChange={(v) => setGeom({ radius: toMetres(v, u) })}
              />
            ) : null}
            <NumberField
              label="Screen gain"
              value={project.screen.gain}
              min={0.1}
              max={5}
              step={0.05}
              hint="1.0 = unity matte white. Only affects the luminance estimate."
              onChange={(v) => set({ screen: { ...project.screen, gain: v } })}
            />
            <div className="hint">
              Screen aspect {(geo.width / geo.height).toFixed(3)}:1 · area{' '}
              {(geo.width * geo.height).toFixed(2)} m²
            </div>
          </Card>

          <Card title="Projector array">
            <div className="row">
              <NumberField
                label="Columns"
                value={columns}
                min={1}
                max={24}
                step={1}
                onChange={(v) => setArray({ columns: Math.max(1, Math.round(v)) })}
              />
              <NumberField
                label="Rows"
                value={rows}
                min={1}
                max={12}
                step={1}
                onChange={(v) => setArray({ rows: Math.max(1, Math.round(v)) })}
              />
            </div>
            <Segmented<FitMode>
              label="Fit"
              value={project.array.fitMode}
              options={[
                { value: 'fit-width', label: 'Fit width' },
                { value: 'fit-height', label: 'Fit height' },
                { value: 'manual', label: 'Manual' },
              ]}
              hint={
                project.array.fitMode === 'fit-width'
                  ? 'You set the horizontal blend; the vertical blend is solved to close the height.'
                  : project.array.fitMode === 'fit-height'
                    ? 'You set the vertical blend; the horizontal blend is solved to close the width.'
                    : 'Both blends are yours. Any spill or shortfall is reported, not corrected.'
              }
              onChange={(fitMode) => setArray({ fitMode })}
            />

            {columns > 1 && project.array.fitMode !== 'fit-height' ? (
              <OverlapSlider
                label="Horizontal blend"
                value={project.array.hOverlap}
                pixels={sol.pixels.hBlendPixels}
                metres={sol.hOverlapMetres}
                onChange={(hOverlap) => setArray({ hOverlap })}
              />
            ) : null}
            {rows > 1 && project.array.fitMode !== 'fit-width' ? (
              <OverlapSlider
                label="Vertical blend"
                value={project.array.vOverlap}
                pixels={sol.pixels.vBlendPixels}
                metres={sol.vOverlapMetres}
                onChange={(vOverlap) => setArray({ vOverlap })}
              />
            ) : null}
            {columns > 1 && project.array.fitMode === 'fit-height' ? (
              <SolvedOverlap label="Horizontal blend (solved)" value={sol.hOverlap} px={sol.pixels.hBlendPixels} m={sol.hOverlapMetres} />
            ) : null}
            {rows > 1 && project.array.fitMode === 'fit-width' ? (
              <SolvedOverlap label="Vertical blend (solved)" value={sol.vOverlap} px={sol.pixels.vBlendPixels} m={sol.vOverlapMetres} />
            ) : null}
          </Card>

          <Card title="Throw & placement">
            <NumberField
              label="Throw distance"
              suffix={lengthUnit(u)}
              value={fromMetres(project.array.throwDistance, u)}
              min={0.1}
              step={0.1}
              hint={
                geo.kind === 'cylindrical' && project.array.placement === 'common-point'
                  ? 'From the rig to the nearest point of the screen (the apex of the arc).'
                  : 'Perpendicular from the projector to its own part of the screen.'
              }
              onChange={(v) => setArray({ throwDistance: toMetres(v, u) })}
            />
            <Segmented<PlacementMode>
              label="Placement"
              value={project.array.placement}
              options={[
                { value: 'per-tile', label: 'One per tile' },
                { value: 'common-point', label: 'Common point' },
              ]}
              hint={
                project.array.placement === 'per-tile'
                  ? 'Each projector sits on the axis of its own tile. No lens shift needed.'
                  : 'Every projector is stacked at one position. Off-axis tiles need lens shift.'
              }
              onChange={(placement) => setArray({ placement })}
            />
          </Card>

          <Card
            title="Projector & lens"
            right={
              <button className="small ghost" onClick={() => setShowLibrary(true)}>
                Edit library
              </button>
            }
          >
            <Field label="Brand">
              <select
                value={projector?.brand ?? ''}
                onChange={(e) => {
                  const first = modelsOf(library, e.target.value)[0]
                  set({ projectorId: first?.id ?? null, lensId: null })
                }}
              >
                {brandsOf(library).map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Model">
              <select
                value={project.projectorId ?? ''}
                onChange={(e) => set({ projectorId: e.target.value, lensId: null })}
              >
                {projector
                  ? modelsOf(library, projector.brand).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.model}
                      </option>
                    ))
                  : null}
              </select>
            </Field>
            {projector ? (
              <div className="hint">
                {int(projector.nativeWidth)} × {int(projector.nativeHeight)} px ·{' '}
                {(projector.nativeWidth / projector.nativeHeight).toFixed(3)}:1 ·{' '}
                {int(projector.lumens)} lm{' '}
                {projector.unverified ? <span className="badge">unverified</span> : null}
              </div>
            ) : null}
            <Field
              label="Lens"
              hint={
                sol.lens && sol.lensFits && sol.lens.throwRatioMax > sol.lens.throwRatioMin
                  ? `Zoom at ${pct(sol.lensZoomPosition, 0)} from the wide end.`
                  : undefined
              }
            >
              <select
                value={project.lensId ?? ''}
                onChange={(e) => set({ lensId: e.target.value || null })}
              >
                <option value="">Auto — pick a lens that fits</option>
                {candidates.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.throwRatioMin.toFixed(2)}
                    {l.throwRatioMax > l.throwRatioMin ? `–${l.throwRatioMax.toFixed(2)}` : ''}:1)
                  </option>
                ))}
              </select>
            </Field>
          </Card>

          <Card title="Report details">
            <Field label="Client">
              <input
                type="text"
                value={project.client ?? ''}
                onChange={(e) => set({ client: e.target.value })}
              />
            </Field>
            <Field label="Notes">
              <textarea
                value={project.notes ?? ''}
                onChange={(e) => set({ notes: e.target.value })}
                placeholder="Rigging constraints, sightlines, anything that should ride along with the PDF."
              />
            </Field>
            <div className="btn-row">
              <button
                className="ghost"
                onClick={() => {
                  if (confirm('Discard this design and start again?')) setProject(DEFAULT_PROJECT)
                }}
              >
                Reset design
              </button>
            </div>
          </Card>
        </div>

        {/* ------------------------------------------------------ results */}
        <div className="col">
          {sol.diagnostics.length ? (
            <div className="col" style={{ gap: 8 }}>
              {sol.diagnostics.map((d, i) => (
                <div key={i} className={`diag ${d.severity}`}>
                  <span className="tag">{d.severity}</span>
                  <span>{d.message}</span>
                </div>
              ))}
            </div>
          ) : null}

          <Card title="System resolution" bodyClass="stat-grid">
            <Stat
              label="Canvas resolution"
              tone="accent"
              value={`${int(sol.pixels.canvasPixelWidth)} × ${int(sol.pixels.canvasPixelHeight)}`}
              sub={`${megapixels(sol.pixels.uniquePixels)} unique`}
            />
            <Stat
              label="Canvas aspect"
              value={`${(sol.pixels.canvasPixelWidth / sol.pixels.canvasPixelHeight || 0).toFixed(3)}:1`}
              sub={`screen ${(geo.width / geo.height).toFixed(3)}:1`}
            />
            <Stat
              label="Total projector pixels"
              value={megapixels(sol.pixels.totalProjectorPixels)}
              sub={`${columns * rows} × ${int(projector?.nativeWidth ?? 0)}×${int(
                projector?.nativeHeight ?? 0,
              )}`}
            />
            <Stat
              label="Pixel density"
              value={`${ppi(sol.pixelDensity).toFixed(1)} PPI`}
              sub={`${sol.pixelDensity.toFixed(0)} px/m on screen`}
            />
            <Stat
              label="Est. luminance"
              value={`${sol.luminanceFootLamberts.toFixed(1)} fL`}
              sub={`${sol.luminanceNits.toFixed(0)} nits · ${int(
                (projector?.lumens ?? 0) * columns * rows,
              )} lm total`}
            />
            <Stat
              label="Image per projector"
              value={`${fromMetres(sol.tileWidth, u).toFixed(2)} × ${fromMetres(
                sol.tileHeight,
                u,
              ).toFixed(2)} ${lengthUnit(u)}`}
              sub={`throw ratio ${sol.columns[0]?.requiredThrowRatio.toFixed(3) ?? '—'}:1`}
            />
          </Card>

          <Card title="Overlap — the doubled region" bodyClass="stat-grid">
            <Stat
              label="Doubled area"
              tone="blend"
              value={pct(sol.pixels.doubleCoveredPixels / (sol.pixels.uniquePixels || 1))}
              sub={`${int(sol.pixels.doubleCoveredPixels)} canvas px`}
            />
            <Stat
              label="Quad-covered corners"
              value={
                sol.pixels.quadCoveredPixels > 0
                  ? pct(sol.pixels.quadCoveredPixels / (sol.pixels.uniquePixels || 1))
                  : '—'
              }
              sub={
                sol.pixels.quadCoveredPixels > 0
                  ? `${int(sol.pixels.quadCoveredPixels)} canvas px`
                  : 'single row/column'
              }
            />
            <Stat
              label="Horizontal blend"
              value={columns > 1 ? `${int(sol.pixels.hBlendPixels)} px` : '—'}
              sub={
                columns > 1
                  ? `${pct(sol.hOverlap)} of image · ${fromMetres(sol.hOverlapMetres, u).toFixed(
                      3,
                    )} ${lengthUnit(u)}`
                  : 'single column'
              }
            />
            <Stat
              label="Vertical blend"
              value={rows > 1 ? `${int(sol.pixels.vBlendPixels)} px` : '—'}
              sub={
                rows > 1
                  ? `${pct(sol.vOverlap)} of image · ${fromMetres(sol.vOverlapMetres, u).toFixed(
                      3,
                    )} ${lengthUnit(u)}`
                  : 'single row'
              }
            />
            <Stat
              label="Redundant pixels"
              tone="blend"
              value={megapixels(sol.pixels.redundantPixels)}
              sub="paid for twice, seen once"
            />
            <Stat
              label="Pixel efficiency loss"
              value={pct(sol.pixels.overlapEfficiencyLoss)}
              sub="of total projector pixels"
            />
          </Card>

          <Card title="Layout" bodyClass="">
            <div className="diagram">
              <FrontElevation sol={sol} columns={columns} rows={rows} screen={geo} />
            </div>
            <div className="legend">
              <span>
                <span className="swatch" style={{ background: '#0f2033', border: '1px solid #e8eef5' }} />
                Screen
              </span>
              <span>
                <span className="swatch" style={{ border: '1.5px solid #4cc9f0' }} />
                Projector image
              </span>
              <span>
                <span className="swatch" style={{ background: 'rgba(249,160,63,0.55)' }} />
                Doubled (blend) region
              </span>
            </div>
            {geo.kind === 'cylindrical' ? (
              <>
                <div className="diagram" style={{ borderTop: '1px solid var(--line-soft)' }}>
                  <PlanView
                    sol={sol}
                    radius={geo.radius}
                    arcLength={geo.width}
                    throwDistance={project.array.throwDistance}
                    placement={project.array.placement}
                  />
                </div>
                <div className="legend">
                  <span>
                    Plan view · {sol.wrapAngleDeg.toFixed(1)}° wrap · image is{' '}
                    {pct(1 - sol.curveHeightRatio)} shorter at the tile edges than at centre
                  </span>
                </div>
              </>
            ) : null}
          </Card>

          <Card title="Per-projector schedule" bodyClass="">
            <table className="data">
              <thead>
                <tr>
                  <th>Position</th>
                  <th title="Perpendicular distance — what throw ratio is defined against">
                    Throw
                  </th>
                  <th title="Straight-line distance to the tile centre — what you measure on site">
                    Slant
                  </th>
                  <th>Image width</th>
                  <th>Throw ratio</th>
                  <th>H shift</th>
                  <th>Off-axis</th>
                  <th>Blend edges</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: rows }, (_, r) =>
                  sol.columns.map((c) => (
                    <tr key={`${r}-${c.column}`}>
                      <td>{rows > 1 ? `R${r + 1}C${c.column + 1}` : `P${c.column + 1}`}</td>
                      <td>
                        {fromMetres(c.throwDistance, u).toFixed(2)} {lengthUnit(u)}
                      </td>
                      <td>
                        {fromMetres(c.slantDistance, u).toFixed(2)} {lengthUnit(u)}
                      </td>
                      <td>
                        {fromMetres(c.flatImageWidth, u).toFixed(3)} {lengthUnit(u)}
                      </td>
                      <td>{c.requiredThrowRatio.toFixed(3)}:1</td>
                      <td>{c.hShiftPct.toFixed(1)}%</td>
                      <td>{c.offAxisDeg.toFixed(1)}°</td>
                      <td>
                        {[
                          c.column > 0 ? 'L' : null,
                          c.column < columns - 1 ? 'R' : null,
                          r > 0 ? 'T' : null,
                          r < rows - 1 ? 'B' : null,
                        ]
                          .filter(Boolean)
                          .join(' ') || '—'}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </Card>
        </div>
      </div>

      <div className="footer-note">
        Blend Calc is a planning tool. Every figure here is geometric — it assumes square pixels,
        no keystone, no lens distortion and a perfectly built screen. Confirm lens coverage and
        brightness against manufacturer datasheets, and confirm the room against a site survey,
        before anything gets ordered or quoted.
      </div>

      {showLibrary ? (
        <LibraryEditor library={library} onChange={setLibrary} onClose={() => setShowLibrary(false)} />
      ) : null}

      {showExport ? (
        <Modal title="Export" onClose={() => setShowExport(false)}>
          <Card title="PDF system report">
            <div className="hint">
              Full report: screen and array summary, system resolution, the overlap budget, a
              scaled front elevation (plus a plan view for a curved screen), the per-projector
              schedule and every warning raised here.
            </div>
            <div className="btn-row">
              <button className="primary" disabled={pdfBusy} onClick={downloadPdf}>
                {pdfBusy ? 'Building…' : 'Download PDF'}
              </button>
            </div>
          </Card>

          <Card title="Resolume Arena — advanced output">
            <div className="hint">
              One Screen per projector, each with a Slice whose input rectangle is that
              projector's share of the composition, overlap included. The composition texture size
              is set to {int(sol.pixels.canvasPixelWidth)} × {int(sol.pixels.canvasPixelHeight)}.
            </div>
            <div className="notice">
              Outputs are written as <strong>Virtual</strong> devices — a real display's device id
              is a property of the machine Arena runs on and cannot be generated here, so assign
              each screen to a physical output once loaded. <strong>Soft-edge parameters are not
              written</strong>; set the blend on each slice edge in Arena using the widths above
              ({int(sol.pixels.hBlendPixels)} px horizontal
              {rows > 1 ? `, ${int(sol.pixels.vBlendPixels)} px vertical` : ''}). The geometry is
              what this file carries.
            </div>
            <div className="btn-row">
              <button onClick={() => downloadResolume('preset')}>
                Preset (Presets/Advanced Output/)
              </button>
              <button onClick={() => downloadResolume('preferences')}>
                AdvancedOutput.xml (Preferences/)
              </button>
            </div>
            <div className="hint">
              Back up your existing <code>AdvancedOutput.xml</code> before replacing it — Arena
              reads it at launch and will overwrite it on quit.
            </div>
          </Card>

          <Card title="Design file">
            <div className="hint">
              The whole design as JSON, so it can be reopened or handed over.
            </div>
            <div className="btn-row">
              <button
                onClick={() =>
                  downloadText(
                    `${(project.name || 'blend').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.blendcalc.json`,
                    JSON.stringify(project, null, 2),
                    'application/json',
                  )
                }
              >
                Export design JSON
              </button>
            </div>
          </Card>
        </Modal>
      ) : null}
    </div>
  )
}

function OverlapSlider({
  label,
  value,
  pixels,
  metres,
  onChange,
}: {
  label: string
  value: number
  pixels: number
  metres: number
  onChange: (v: number) => void
}) {
  return (
    <Field
      label={label}
      hint={`${Math.round(pixels)} px of blend · ${metres.toFixed(3)} m on screen`}
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <input
          type="range"
          min={0}
          max={0.5}
          step={0.005}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <div style={{ width: 88, flex: 'none' }}>
          <div className="input-suffix">
            <input
              type="number"
              value={Number((value * 100).toFixed(2))}
              min={0}
              max={50}
              step={0.5}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (Number.isFinite(n)) onChange(Math.min(0.5, Math.max(0, n / 100)))
              }}
            />
            <span>%</span>
          </div>
        </div>
      </div>
    </Field>
  )
}

function SolvedOverlap({ label, value, px, m }: { label: string; value: number; px: number; m: number }) {
  const bad = !Number.isFinite(value) || value < 0
  return (
    <Field
      label={label}
      hint={bad ? 'No solution — see the warnings.' : `${Math.round(px)} px · ${m.toFixed(3)} m on screen`}
    >
      <input
        type="text"
        readOnly
        value={bad ? '—' : `${(value * 100).toFixed(2)} %`}
        style={{ fontFamily: 'var(--mono)', color: bad ? 'var(--danger)' : 'var(--accent)' }}
      />
    </Field>
  )
}
