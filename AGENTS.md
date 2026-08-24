# AGENTS.md — bringing an LLM up to speed on Blend Calc

Orientation for an AI assistant (or a new human) picking this project up cold. `CLAUDE.md`
holds the short command reference; this file explains the model and the traps.

---

## 1. What this is

A **projector edge-blend calculator**. Browser-only, no backend: React + TypeScript + Vite,
built to a static `dist/` and hosted on Cloudflare Pages. State lives in `localStorage`.

It answers: given a screen, a number of projectors and a throw distance — what resolution
is the system, how many pixels am I paying for twice, what lens does each position need,
and can I hand someone a PDF and a Resolume file at the end of it.

## 2. Layout

```
src/
  types.ts              domain types. Read this first — it is the spec.
  lib/geometry.ts       THE ENGINE. Blend solve, curved optics, pixel budget, diagnostics.
  lib/library.ts        projector/lens library, seed data, localStorage
  lib/resolume.ts       Arena advanced-output XML
  lib/pdf.ts            jsPDF report (vector, no rasterised canvas)
  lib/units.ts          metric/imperial at the edges only
  components/           UI. Diagram.tsx draws SVG in metres and lets the viewBox scale it.
  App.tsx               wiring, all the state
docs/resolume-export.md  where the XML format came from, and what is unverified
```

**All lengths are SI metres internally.** Unit conversion happens only in `units.ts` and at
the UI boundary. Do not let feet leak into the engine.

## 3. The one relation everything derives from

N tiles of width `w` across a span `W`, adjacent tiles sharing `f · w`:

```
W = N·w − (N−1)·f·w    =>    w = W / (N − (N−1)·f)
```

`tileForSpan` / `spanForTile` / `overlapForFit` in `geometry.ts` are the only places this is
written. They are mutual inverses and the tests assert that. Everything else — canvas
resolution, blend widths in pixels, the pixel budget — is this relation applied to metres or
to pixels.

## 4. Traps

### "Data double" means the overlap region

The user's term. It is the area covered by two projectors, *not* dual-link inputs or
frame-doubling. Where a horizontal and a vertical blend cross, four projectors overlap, and
that is accounted separately. The invariant, asserted in the tests:

```
totalProjectorPixels === single + 2·double + 4·quad
```

If you change the pixel accounting, that test is the one that matters.

### Throw distance is perpendicular, not straight-line

`ColumnOptics.throwDistance` is the perpendicular distance to the tile's reference plane,
because that is what throw ratio is defined against. `slantDistance` is the straight-line
distance — what someone measures on site. They differ whenever a tile is off the rig axis,
and **on a concave screen the outer tiles are perpendicularly CLOSER but further away in a
straight line.** That is counterintuitive and cost one round of wrong test assumptions
already; there is a test pinning it.

### A projector at the centre of curvature is legal

`throw === radius` puts the projector exactly on the centre of curvature. Every point of the
screen is then equidistant — a normal and often ideal curved-screen position, where the
formula collapses to `α = θ/2`. An earlier guard rejected `throw >= radius` and was simply
wrong. The real constraint is that the projector must be in front of the plane through its
own tile's edges (`throw > R·(1 − cos(θ/2))`), which is what `throw-inside-arc` checks.

### A flat calculator undersizes the lens on a curve

A projector forms a flat image; a curved screen does not. The flat image must be *wider*
than the tile's arc length to reach around the curvature, so the required throw ratio is
*smaller* (wider lens) than the naive `D / arcLength`. And the image is shorter at the tile
edges than at the centre. Both are reported. Don't "simplify" `curvedFlatImageWidth` back
into the flat formula.

### The Resolume exporter must not invent parameters

See `docs/resolume-export.md`. The format was read off real Arena files, and
`resolume-schema.test.ts` asserts the exporter only emits element/attribute shapes those
files contain. Soft-edge parameters are deliberately absent because no reference file had
blending on. **Adding a plausible-looking `<Param>` is the specific mistake that test
exists to stop.** If you add a shape, add it with a real Arena file that has it.

### Seed library data is unverified and says so

Real projector models in `library.ts` carry `unverified: true`. It is not decoration: the UI
badges it and the PDF prints a warning box. Do not quietly clear the flag, and do not add
new "real" models without it. The `Generic` bodies are exact by construction (a resolution
is a resolution) and the generic lens *classes* describe a category rather than a product,
so neither can be wrong about a manufacturer's spec.

## 5. Commands

```bash
npm run dev       # vite dev server
npm test          # vitest, 66 tests
npm run build     # tsc -b && vite build -> dist/
```

Write the artefacts out to look at them:

```bash
BLEND_CALC_PDF_OUT=/tmp/out npx vitest run pdf
BLEND_CALC_XML_OUT=/tmp/out npx vitest run resolume
```

## 6. Deployment and the CSP

Static-assets Worker on Cloudflare, `wrangler.toml` → `dist/`. See
[docs/deployment.md](docs/deployment.md).

`public/_headers` carries a strict CSP. **`npm run preview` does not apply it**, so it
cannot catch a CSP mistake — a policy that blocks the app looks perfectly fine there. Use
`scripts/serve-dist.py`, which parses `_headers` and actually sends them:

```bash
npm run build && npm run serve:dist     # then load it and click every export button
```

That is how the current policy was verified: first render, the lazy jsPDF chunk, and all
three blob downloads, with zero console output.

Two constraints on the policy: `style-src` needs `'unsafe-inline'` (React sets inline
`style` attributes), and `img-src` needs `data:` for the favicon and `blob:` for downloads.
`connect-src 'self'` is deliberate — the tool sends nothing anywhere, and the CSP is what
enforces that rather than leaving it to good intentions.

## 7. Verified vs assumed

| Claim | Status |
|---|---|
| Blend/pixel maths | **Verified** — 39 tests including conservation invariants and flat/curved limit cases |
| Curved optics collapse to the flat case as R→∞ | **Verified** — asserted directly |
| PDF builds for flat, curved, single, large and *broken* designs | **Verified** — generated and inspected |
| Resolume XML vocabulary matches a real Arena 7.27 file | **Verified** — mechanically extracted, asserted in CI |
| Arena actually loads the generated file and blends correctly | **NOT VERIFIED** — never round-tripped through a running Arena |
| Seed projector/lens specifications | **NOT VERIFIED** — flagged as such throughout |

No blend has ever been driven onto real projectors from this tool.

## 8. Deliberately not here

- **No `diag` module.** The fleet convention vendors a rotating-log + crash-report module
  into every repo. This is a static browser page with no process, no filesystem and no
  telemetry by design; a rotating log file has nowhere to go. If diagnostics are ever
  wanted, the design JSON export already reproduces any calculation exactly.
- **No backend.** Adding one would change the deployment story from "static Pages" to
  something with an origin, for no functional gain.

## Notes

`docs/NOTES.md` carries this repo's working notes — current status, decisions
already made, and the traps that have actually bitten. Read it before changing
anything non-obvious. Cross-cutting fleet knowledge lives in
[fleet-notes](https://github.com/stoatworks-labs/fleet-notes).
