import { useMemo, useRef, useState } from 'react'
import type { Lens, LensSeries, Library, Projector } from '../types'
import { newId, seedLibrary } from '../lib/library'
import { Card, Field, Modal, NumberField, downloadText } from './ui'

/**
 * Library editor.
 *
 * Two tabs, because bodies and lenses are edited on different rhythms: you add
 * a body once per new model, but you add lenses in batches whenever a new
 * series arrives.
 */
export function LibraryEditor({
  library,
  onChange,
  onClose,
}: {
  library: Library
  onChange: (lib: Library) => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<'projectors' | 'lenses'>('projectors')
  const [editing, setEditing] = useState<Projector | null>(null)
  const [editingLens, setEditingLens] = useState<{ seriesId: string; lens: Lens } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const seriesById = useMemo(
    () => new Map(library.lensSeries.map((s) => [s.id, s])),
    [library.lensSeries],
  )

  const upsertProjector = (p: Projector) => {
    const exists = library.projectors.some((x) => x.id === p.id)
    onChange({
      ...library,
      projectors: exists
        ? library.projectors.map((x) => (x.id === p.id ? p : x))
        : [...library.projectors, p],
    })
    setEditing(null)
  }

  const deleteProjector = (id: string) => {
    onChange({ ...library, projectors: library.projectors.filter((x) => x.id !== id) })
  }

  const upsertLens = (seriesId: string, lens: Lens) => {
    onChange({
      ...library,
      lensSeries: library.lensSeries.map((s) =>
        s.id !== seriesId
          ? s
          : {
              ...s,
              lenses: s.lenses.some((l) => l.id === lens.id)
                ? s.lenses.map((l) => (l.id === lens.id ? lens : l))
                : [...s.lenses, lens],
            },
      ),
    })
    setEditingLens(null)
  }

  const deleteLens = (seriesId: string, lensId: string) => {
    onChange({
      ...library,
      lensSeries: library.lensSeries.map((s) =>
        s.id !== seriesId ? s : { ...s, lenses: s.lenses.filter((l) => l.id !== lensId) },
      ),
    })
  }

  const addSeries = () => {
    const name = prompt('Lens series name (e.g. "Panasonic ET-D75LE")')
    if (!name?.trim()) return
    const brand = prompt('Brand') ?? ''
    const series: LensSeries = {
      id: newId('series'),
      brand: brand.trim() || 'Custom',
      name: name.trim(),
      lenses: [],
    }
    onChange({ ...library, lensSeries: [...library.lensSeries, series] })
  }

  const handleImport = (file: File) => {
    setImportError(null)
    file
      .text()
      .then((text) => {
        const parsed = JSON.parse(text) as Library
        if (!Array.isArray(parsed.projectors) || !Array.isArray(parsed.lensSeries)) {
          throw new Error('Not a Blend Calc library — expected "projectors" and "lensSeries" arrays.')
        }
        onChange(parsed)
      })
      .catch((e: unknown) => setImportError(e instanceof Error ? e.message : String(e)))
  }

  return (
    <Modal
      title="Projector & lens library"
      onClose={onClose}
      footer={
        <>
          <button
            className="ghost"
            onClick={() => {
              if (confirm('Replace the whole library with the shipped seed data? Your additions will be lost.')) {
                onChange(seedLibrary())
              }
            }}
          >
            Reset to seed
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleImport(f)
              e.target.value = ''
            }}
          />
          <button className="ghost" onClick={() => fileRef.current?.click()}>
            Import JSON
          </button>
          <button
            onClick={() =>
              downloadText('blend-calc-library.json', JSON.stringify(library, null, 2), 'application/json')
            }
          >
            Export JSON
          </button>
          <button className="primary" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <div className="segmented" style={{ maxWidth: 300 }}>
        <button aria-pressed={tab === 'projectors'} onClick={() => setTab('projectors')}>
          Projectors ({library.projectors.length})
        </button>
        <button aria-pressed={tab === 'lenses'} onClick={() => setTab('lenses')}>
          Lens series ({library.lensSeries.length})
        </button>
      </div>

      {importError ? (
        <div className="diag error">
          <span className="tag">Error</span>
          <span>{importError}</span>
        </div>
      ) : null}

      <div className="notice">
        Entries marked <span className="badge">unverified</span> are seed data shipped with the app
        and have <strong>not</strong> been checked against a datasheet. Edit one and tick
        "specifications verified" once you have confirmed it — the flag also appears on the PDF
        report.
      </div>

      {tab === 'projectors' ? (
        <>
          <div className="btn-row">
            <button
              onClick={() =>
                setEditing({
                  id: newId('proj'),
                  brand: '',
                  model: '',
                  nativeWidth: 1920,
                  nativeHeight: 1200,
                  lumens: 20000,
                  lensSeriesId: library.lensSeries[0]?.id ?? 'generic',
                })
              }
            >
              + Add projector
            </button>
          </div>
          <div className="list">
            {library.projectors.map((p) => (
              <div className="list-item" key={p.id}>
                <div className="grow">
                  <div>
                    {p.brand} {p.model}{' '}
                    {p.unverified ? <span className="badge">unverified</span> : null}
                  </div>
                  <div className="meta">
                    {p.nativeWidth}×{p.nativeHeight} · {p.lumens.toLocaleString('en-GB')} lm ·{' '}
                    {seriesById.get(p.lensSeriesId)?.name ?? 'no lens series'}
                  </div>
                </div>
                <button className="small ghost" onClick={() => setEditing(p)}>
                  Edit
                </button>
                <button
                  className="small ghost"
                  onClick={() => setEditing({ ...p, id: newId('proj'), model: `${p.model} (copy)` })}
                >
                  Duplicate
                </button>
                <button
                  className="small danger ghost"
                  onClick={() => {
                    if (confirm(`Delete ${p.brand} ${p.model}?`)) deleteProjector(p.id)
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="btn-row">
            <button onClick={addSeries}>+ Add lens series</button>
          </div>
          {library.lensSeries.map((s) => (
            <Card
              key={s.id}
              title={`${s.brand} — ${s.name}`}
              right={
                <button
                  className="small ghost"
                  onClick={() =>
                    setEditingLens({
                      seriesId: s.id,
                      lens: { id: newId('lens'), name: '', throwRatioMin: 1.3, throwRatioMax: 1.8 },
                    })
                  }
                >
                  + Lens
                </button>
              }
              bodyClass="card-body"
            >
              {s.lenses.length === 0 ? (
                <div className="hint">No lenses in this series yet.</div>
              ) : (
                <div className="list">
                  {s.lenses.map((l) => (
                    <div className="list-item" key={l.id}>
                      <div className="grow">
                        <div>{l.name}</div>
                        <div className="meta">
                          {l.throwRatioMin.toFixed(2)}–{l.throwRatioMax.toFixed(2)}:1
                          {l.hShiftPct !== undefined ? ` · H shift ±${l.hShiftPct}%` : ''}
                          {l.vShiftPct !== undefined ? ` · V shift ±${l.vShiftPct}%` : ''}
                        </div>
                      </div>
                      <button
                        className="small ghost"
                        onClick={() => setEditingLens({ seriesId: s.id, lens: l })}
                      >
                        Edit
                      </button>
                      <button
                        className="small danger ghost"
                        onClick={() => {
                          if (confirm(`Delete ${l.name}?`)) deleteLens(s.id, l.id)
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </>
      )}

      {editing ? (
        <ProjectorForm
          projector={editing}
          lensSeries={library.lensSeries}
          onCancel={() => setEditing(null)}
          onSave={upsertProjector}
        />
      ) : null}

      {editingLens ? (
        <LensForm
          lens={editingLens.lens}
          onCancel={() => setEditingLens(null)}
          onSave={(l) => upsertLens(editingLens.seriesId, l)}
        />
      ) : null}
    </Modal>
  )
}

function ProjectorForm({
  projector,
  lensSeries,
  onSave,
  onCancel,
}: {
  projector: Projector
  lensSeries: LensSeries[]
  onSave: (p: Projector) => void
  onCancel: () => void
}) {
  const [p, setP] = useState(projector)
  const set = <K extends keyof Projector>(k: K, v: Projector[K]) => setP((s) => ({ ...s, [k]: v }))
  const valid = p.brand.trim() && p.model.trim() && p.nativeWidth > 0 && p.nativeHeight > 0

  return (
    <Modal
      title={`${projector.brand ? 'Edit' : 'New'} projector`}
      onClose={onCancel}
      footer={
        <>
          <button className="ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="primary" disabled={!valid} onClick={() => onSave(p)}>
            Save
          </button>
        </>
      }
    >
      <div className="row">
        <Field label="Brand">
          <input type="text" value={p.brand} onChange={(e) => set('brand', e.target.value)} />
        </Field>
        <Field label="Model">
          <input type="text" value={p.model} onChange={(e) => set('model', e.target.value)} />
        </Field>
      </div>
      <div className="row-3">
        <NumberField
          label="Native width"
          suffix="px"
          value={p.nativeWidth}
          min={1}
          step={1}
          onChange={(v) => set('nativeWidth', Math.round(v))}
        />
        <NumberField
          label="Native height"
          suffix="px"
          value={p.nativeHeight}
          min={1}
          step={1}
          onChange={(v) => set('nativeHeight', Math.round(v))}
        />
        <NumberField
          label="Light output"
          suffix="lm"
          value={p.lumens}
          min={0}
          step={100}
          onChange={(v) => set('lumens', v)}
        />
      </div>
      <Field
        label="Lens series"
        hint="Which mount this body takes. The generic lens classes are always offered as well."
      >
        <select value={p.lensSeriesId} onChange={(e) => set('lensSeriesId', e.target.value)}>
          {lensSeries.map((s) => (
            <option key={s.id} value={s.id}>
              {s.brand} — {s.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Notes">
        <textarea value={p.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
      </Field>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={!p.unverified}
          onChange={(e) => set('unverified', !e.target.checked)}
        />
        Specifications verified against a datasheet
      </label>
      <div className="hint">
        Native aspect ratio: {(p.nativeWidth / p.nativeHeight).toFixed(4)}:1
      </div>
    </Modal>
  )
}

function LensForm({
  lens,
  onSave,
  onCancel,
}: {
  lens: Lens
  onSave: (l: Lens) => void
  onCancel: () => void
}) {
  const [l, setL] = useState(lens)
  const [fixed, setFixed] = useState(lens.throwRatioMin === lens.throwRatioMax)
  const set = <K extends keyof Lens>(k: K, v: Lens[K]) => setL((s) => ({ ...s, [k]: v }))
  const valid = l.name.trim() && l.throwRatioMin > 0 && l.throwRatioMax >= l.throwRatioMin

  return (
    <Modal
      title={lens.name ? 'Edit lens' : 'New lens'}
      onClose={onCancel}
      footer={
        <>
          <button className="ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="primary"
            disabled={!valid}
            onClick={() => onSave(fixed ? { ...l, throwRatioMax: l.throwRatioMin } : l)}
          >
            Save
          </button>
        </>
      }
    >
      <Field label="Name">
        <input type="text" value={l.name} onChange={(e) => set('name', e.target.value)} />
      </Field>
      <label className="checkbox">
        <input type="checkbox" checked={fixed} onChange={(e) => setFixed(e.target.checked)} />
        Fixed (prime) lens — one throw ratio, no zoom
      </label>
      <div className="row">
        <NumberField
          label={fixed ? 'Throw ratio' : 'Throw ratio (wide)'}
          value={l.throwRatioMin}
          min={0.05}
          step={0.01}
          onChange={(v) => set('throwRatioMin', v)}
        />
        {!fixed ? (
          <NumberField
            label="Throw ratio (tele)"
            value={l.throwRatioMax}
            min={0.05}
            step={0.01}
            onChange={(v) => set('throwRatioMax', v)}
          />
        ) : null}
      </div>
      <div className="row">
        <NumberField
          label="Max H shift"
          suffix="%"
          hint="Percent of image width. Leave 0 if unknown — it is then not checked."
          value={l.hShiftPct ?? 0}
          min={0}
          step={1}
          onChange={(v) => set('hShiftPct', v > 0 ? v : undefined)}
        />
        <NumberField
          label="Max V shift"
          suffix="%"
          hint="Percent of image height."
          value={l.vShiftPct ?? 0}
          min={0}
          step={1}
          onChange={(v) => set('vShiftPct', v > 0 ? v : undefined)}
        />
      </div>
      <Field label="Notes">
        <input type="text" value={l.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </Modal>
  )
}
