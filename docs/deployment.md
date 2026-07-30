# Deploying Blend Calc to Cloudflare

Blend Calc is a static site with no backend, so hosting it is just serving `dist/`.
`wrangler.toml` declares a static-assets-only Worker pointing at that directory.

Target hostname, following the fleet convention: **`blend-calc.stoatworks-labs.com`**.
Apps that are the real tool running in the browser get the bare name (like `rfutils` and
`pmse-to-wwb`); only recorded click-through demos take a `-demo` suffix. This one does real
work on the visitor's own machine, so it gets the bare name.

---

## Route A — connect the GitHub repo (recommended)

Matches how RFutils is deployed, and gives an automatic deploy on every push to `main`.

In the Cloudflare dashboard, create a Workers/Pages project from Git and point it at
`stoatworks-labs/blend-calc`:

| Setting | Value |
|---|---|
| Production branch | `main` |
| Build command | `npm ci && npm run build` |
| Build output directory | `dist` |
| Root directory | *(repo root)* |
| Node version | 20 or later |

Then add the custom domain `blend-calc.stoatworks-labs.com` to the project.

Nothing needs committing to make this work — Cloudflare runs the build, so `dist/` stays
out of git. That is the difference between this repo and the recorded demos, which commit
`demo/dist` because assembling them needs real devices a build container hasn't got.

## Route B — deploy from this machine

One-off, or when you want to publish without pushing.

```bash
npx wrangler login
```

That opens a browser for the OAuth consent screen. It has to be run by you — it is an
account sign-in, and it is the only step here that cannot be scripted.

Then, from the repo root:

```bash
npm run deploy
```

which is `npm run build && npx wrangler deploy`. Confirm afterwards with:

```bash
npx wrangler deployments list
```

---

## Headers

`public/_headers` is copied into `dist/` by Vite and is honoured by Cloudflare's
static-assets runtime. It sets:

- a strict CSP — `default-src 'self'`, no inline scripts, `object-src 'none'`,
  `frame-ancestors 'none'`
- `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`
- `Cache-Control: public, max-age=31536000, immutable` for `/assets/*`, which is safe
  because Vite content-hashes those filenames

**The CSP has been verified against the real production build**, not just eyeballed:
`dist/` was served locally with `_headers` actually applied, and the app was exercised end
to end — first render, the lazy-loaded jsPDF chunk, the PDF blob download, the Resolume XML
download and the design JSON download. Zero console messages, zero CSP violations.

Two things to know if you change the CSP:

- `style-src` needs `'unsafe-inline'` because React sets inline `style` attributes on the
  diagram and a few layout elements.
- `img-src` needs `data:` for the inline SVG favicon and `blob:` for downloads.

If you add anything that talks to the network, `connect-src 'self'` will block it — which is
deliberate. This tool sends nothing anywhere, and the CSP is what keeps that true rather
than merely intended.

## Local check before publishing

```bash
npm run build
npm run preview
```

`npm run preview` does **not** apply `_headers`, so it will not catch a CSP mistake. To
check the headers as Cloudflare will send them:

```bash
npm run build
npm run serve:dist        # http://127.0.0.1:4321, _headers actually applied
```

Then load it, open the console, and click every export button. A CSP problem shows up as a
blocked-resource error there and nowhere else.
