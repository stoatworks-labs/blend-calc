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
npm run preview      # serve the built dist/ (does NOT apply _headers)
npm run serve:dist   # serve dist/ WITH _headers applied — use this to check the CSP
npx tsc --noEmit     # typecheck only
```

## Deploy

```bash
npx wrangler login   # you must run this — it's an account sign-in
npm run deploy       # build + wrangler deploy
```

Or connect the repo in Cloudflare: build `npm ci && npm run build`, output `dist`.
See [docs/deployment.md](docs/deployment.md).

Write the generated artefacts out to inspect them:

```bash
BLEND_CALC_PDF_OUT=/tmp/out npx vitest run pdf
BLEND_CALC_XML_OUT=/tmp/out npx vitest run resolume
```

## Ground rules

- All lengths are **metres** inside the engine. Convert only in `units.ts` and the UI.
- `geometry.ts` is the single source of truth for the blend relation. Don't re-derive it.
- The Resolume exporter may only emit XML shapes a real Arena file contains —
  `resolume-schema.test.ts` enforces this. Don't add a plausible-looking `<Param>`.
- Seed projector data is `unverified: true` on purpose. Leave the flag alone.
