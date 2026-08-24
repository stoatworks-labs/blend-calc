# Notes

Working notes for this repo: status, decisions, and the traps that have actually bitten.
Migrated out of Claude Code's memory on 2026-08-24, so they are written in the first
person and dated by when each thing was learned — that date is usually the useful part.

Cross-cutting notes that are not specific to this repo live in
[fleet-notes](https://github.com/stoatworks-labs/fleet-notes).

*Blend Calc — browser-only projector edge-blend calculator, deployed as a Cloudflare Worker serving static assets, with PDF reports and a Resolume Arena advanced-output exporter verified against real Arena files*

**PUBLIC since 2026-08-05** — the private-repo statements below are historical; the repo, its Docker packaging and its `/software` page are all live. See [browser tools published](https://github.com/stoatworks-labs/fleet-notes/blob/main/notes/project_browser_tools_published.md).

**Blend Calc** — projector edge-blend calculator. React/TS/Vite static SPA, no backend,
`localStorage` state, deploys as a Cloudflare Worker serving static assets, not a Pages project (`npm run build` → `dist`, `[assets] directory`) — see [cloudflare access](https://github.com/stoatworks-labs/fleet-notes/blob/main/notes/reference_cloudflare_access.md).
`~/Projects/blend-calc`, **GitHub PRIVATE** (stoatworks-labs/blend-calc, verified 2026-07-31), MIT. No CI
workflow yet. Cloudflare config is committed (`wrangler.toml` static-assets Worker over
`dist/`, RFutils pattern — Cloudflare runs the Vite build so `dist/` stays gitignored),
target `blend-calc.stoatworks-labs.com`, but **not yet deployed**: `wrangler login` is an
interactive account sign-in the human has to run.

**`npm run preview` does NOT apply `public/_headers`**, so it cannot catch a CSP mistake —
a blocking policy looks fine there. `scripts/serve-dist.py` (`npm run serve:dist`) parses
`_headers` and really sends them; the CSP was verified through it end-to-end including the
lazy jsPDF chunk and all three blob downloads. `style-src` needs `'unsafe-inline'` (React
inline styles), `img-src` needs `data:` + `blob:`.

Scope the user set: define a projection canvas, set projector count / throw / lens ratios,
get system resolution and the **"data double"** — which they clarified means *the overlapped
region itself*, not dual-link inputs. Flat **and cylindrical** screens, editable
projector/lens library, PDF report, Resolume Arena advanced-output XML.

Key engine facts (all in `src/lib/geometry.ts`, invariants pinned by 66 tests):
- One relation drives everything: `W = N·w − (N−1)·f·w`.
- Pixel budget conserves `total = single + 2·double + 4·quad`.
- **Throw is perpendicular, slant is straight-line** — on a concave screen outer tiles are
  perpendicularly *closer* but further in a straight line. Counterintuitive; cost a wrong
  test assumption.
- **A projector at the centre of curvature (throw == radius) is legal and often ideal** —
  an early guard rejecting `throw >= radius` was simply wrong.
- A flat calculator undersizes the lens on a curve, and the image is shorter at tile edges.

**Resolume format was reverse-engineered from real files on this Mac**, not docs —
`~/Documents/Resolume Arena/Preferences/AdvancedOutput.xml` (root `<ScreenSetup>`) and
`Presets/Advanced Output/output_map_1.xml` (root `<XmlState>`, no `<SoftEdging>`). Arena
7.27.0 rev 14395. A conformance test asserts the exporter emits **only element/attribute
shapes those files contain** — soft-edge params are deliberately absent because no
reference file had blending on. **Never round-tripped through a running Arena** — that is
the one open verification gap. See `docs/resolume-export.md`.

Seed projector models carry `unverified: true`, badged in UI and on the PDF. Generic bodies
and generic lens *classes* are safe by construction.

**Private on purpose, and permanently: the repo exists only to feed the deployed web
app.** It is not a distributable product, so it has no releases, no installers and no
download links — and it is correctly absent from the fleet's download tooling
([stoatworks website](https://github.com/stoatworks-labs/stoatworks-website/blob/main/docs/NOTES.md) (`stoatworks-website`), `gen-downloads.py`). Same for [pixel peeker](https://github.com/stoatworks-labs/pixel-peeker/blob/main/docs/NOTES.md) (`pixel-peeker`).
Missing downloads here is the design, not a gap to close.

Deliberately no `diag` module — static browser page, nowhere for a rotating log to go.
Related: [pages demo hosting](https://github.com/stoatworks-labs/fleet-notes/blob/main/notes/reference_pages_demo_hosting.md), [resolume luma keyer](https://github.com/stoatworks-labs/resolume-luma-keyer/blob/main/docs/NOTES.md) (`resolume-luma-keyer`),
[agents md convention](https://github.com/stoatworks-labs/fleet-notes/blob/main/notes/reference_agents_md_convention.md).
