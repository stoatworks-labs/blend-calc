# Blend Calc

A projector edge-blend calculator that runs entirely in the browser. Define a projection
canvas, set the array, pick a projector and lens from a library you control, and get the
system resolution, the overlap budget, the lens requirement per position, a PDF report,
and a Resolume Arena advanced-output file.

No backend, no accounts, no telemetry. Everything is computed client-side and stored in
`localStorage`, so it deploys as a static site to Cloudflare Pages.

---

## What it does

**Canvas** — flat or cylindrical. On a curve you give the arc width (measured along the
surface, the way a screen is actually built) and the radius; the wrap angle and chord fall
out of that.

**Array** — any grid of columns × rows. You pin one blend and the solver derives the other
so the array closes on the screen exactly:

| Fit mode | You set | Solver derives |
|---|---|---|
| Fit width | horizontal blend | vertical blend |
| Fit height | vertical blend | horizontal blend |
| Manual | both | reports the spill or shortfall instead of correcting it |

**System resolution** — the blended canvas size, total projector pixels, pixel density on
the screen surface in PPI, and an estimated screen luminance in foot-lamberts and nits.

**The doubled region** — the overlap accounting, which is the thing that makes blends
expensive. Blend bands are covered by two projectors; where a horizontal and a vertical
blend cross, by four. The report separates all three, in canvas pixels and as a share of
the canvas, and totals the redundant pixels you pay for twice and see once.

**Throw and lens** — required throw ratio per column, the lens that covers it, where it
sits in its zoom range, and the horizontal lens shift needed. Two placement models:

- *One per tile* — each projector on the axis of its own tile. No shift needed.
- *Common point* — the whole array stacked at one position. Off-axis tiles need shift,
  and on a curve the throw varies per column.

**Library** — projectors by brand/model with their native resolution, light output and
lens mount; lenses grouped into mount families so they are entered once, not once per
body. Fully editable, with JSON import/export.

**Exports** — a PDF system report, a Resolume Arena advanced-output XML, and the design
itself as JSON.

---

## Curved screens

The optics on a curve are not the flat maths with a fudge factor. A projector forms a flat
image; a curved screen does not, so the flat image has to be wider than the tile's arc
length to reach around the curvature. With a segment subtending angle θ at radius R and a
throw D:

```
half-angle  α = atan( R·sin(θ/2) / (D − R·(1 − cos(θ/2))) )
flat width  w = 2·D·tan(α)
throw ratio   = D / w
```

Two consequences the tool reports and a flat calculator misses:

- You need a **wider** lens than the flat maths suggests.
- The image is **shorter at the tile edges** than at the centre, because a concave screen's
  edges bulge towards the projector. You oversize vertically and mask, or let the warp
  engine pull the corners down. The percentage is on screen and in the report.

A projector at the centre of curvature (throw = radius) is a normal, often ideal, position
and is handled — the formula collapses to α = θ/2 there. The real constraint is that the
projector must be in front of the plane through its own tile's edges.

---

## Resolume Arena export

The XML format was derived from two files written by a real Arena 7.27.0 (rev 14395)
install, not from documentation. See [docs/resolume-export.md](docs/resolume-export.md) for
exactly what is reproduced, what is deliberately left out, and what has and has not been
verified.

Short version: the file carries the **geometry** — one Screen per projector, each with a
Slice whose input rectangle is that projector's share of the composition with its overlap.
Soft-edge parameters are not written, because no reference file had blending enabled and a
guessed parameter name is worse than an absent one. The blend widths are in the UI and the
report; set them on each slice edge in Arena.

---

## Running it

```bash
npm install
npm run dev
```

```bash
npm test
npm run build
```

`npm run build` writes a static site to `dist/`.

### Deploying to Cloudflare Pages

Build command `npm run build`, output directory `dist`. `public/_headers` sets a strict CSP
and immutable caching for hashed assets; Pages picks it up automatically.

---

## Accuracy, and what this is not

Every figure is geometric. It assumes square pixels, no keystone, no lens distortion, a
perfectly built screen, and zero optical losses. The luminance estimate is a ceiling: it
ignores lamp ageing, port glass, and blend-region compensation losses.

The shipped projector and lens data is **seed data, flagged `unverified`**, and has not
been checked against datasheets. Anything unverified is badged in the UI and carries a
warning box on the PDF. Clear the flag per model once you have confirmed it. The generic
lens *classes* ("standard zoom, 1.3–1.8:1") are honest by construction — they describe a
category, not a product.

Confirm lens coverage and brightness against manufacturer datasheets, and the room against
a site survey, before anything is ordered or quoted.

## Licence

MIT.
