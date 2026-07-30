# CLAUDE.md — Blend Calc

Command reference. For the model, the invariants and the traps, read
[AGENTS.md](AGENTS.md) first.

## Commands

```bash
npm install
npm run dev          # vite dev server
npm test             # vitest — 66 tests
npm run test:watch
npm run build        # tsc -b && vite build -> dist/
npm run preview      # serve the built dist/
npx tsc --noEmit     # typecheck only
```

Write the generated artefacts out to inspect them:

```bash
BLEND_CALC_PDF_OUT=/tmp/out npx vitest run pdf
BLEND_CALC_XML_OUT=/tmp/out npx vitest run resolume
```

## Deploy

Cloudflare Pages. Build command `npm run build`, output directory `dist`.
`public/_headers` carries the CSP and cache rules.

## Ground rules

- All lengths are **metres** inside the engine. Convert only in `units.ts` and the UI.
- `geometry.ts` is the single source of truth for the blend relation. Don't re-derive it.
- The Resolume exporter may only emit XML shapes a real Arena file contains —
  `resolume-schema.test.ts` enforces this. Don't add a plausible-looking `<Param>`.
- Seed projector data is `unverified: true` on purpose. Leave the flag alone.
