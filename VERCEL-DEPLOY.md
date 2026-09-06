# MedisinACSHS 2.0 — Vercel deployment

This version is structured as a static frontend plus Vercel Node Functions. It does not use a root Node server entrypoint.

## Repository structure

```text
index.html and other site pages -> public/
public/
  index.html
  home.html
  A.i asistant.html
  admin.html
  emergency-hotlines.html
  plan-schedule.html
  manifest.webmanifest
  sw.js
  css/
  assets/
  hotlines/
api/
  chat.js
  admin/docs.js
lib/
  server-core.js and medical pipeline modules
data/
  kit, medical guidance, hospitals, RAG data
scripts/
  kiosk-server.cjs (local-only server)
vercel.json
package.json
```

## Vercel configuration

`vercel.json` explicitly selects **Other** (`framework: null`), uses no build command, serves `public/` as the static output directory, and deploys the two files under `api/` as Node Functions.

No root `server.js`, `kiosk-server.js`, `app.js`, or other Node server entrypoint is present. This avoids Vercel's standalone Node-server detection.

Node 24 is pinned in `package.json`.

## Deploy

1. Extract this ZIP.
2. Replace the GitHub repository contents with the ZIP contents.
3. Commit and push to `main`.
4. Use the existing **medisinacshs** Vercel project. Do not create a second project.
5. Vercel should build the new commit. If automatic Git deployment does not trigger, manually deploy the `main` branch from the existing project's Deployments page.

## Production behavior

The routine medical response path is deterministic and does not require Ollama. Ollama remains a local/development extension.

The admin RAG document store uses local filesystem storage; Vercel function storage is not durable, so admin uploads should not be considered persistent on Vercel.

## Local development

`npm start` runs `scripts/kiosk-server.cjs`, which serves the same `public/` frontend and the same `/api` handlers locally.
