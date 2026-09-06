# MedisinACSHS 2.0 — Vercel deployment

This package is Vercel-ready for a normal GitHub import.

## Repository structure

Put these files directly in the GitHub repository root. Do not add an extra wrapper folder.

- `index.html`
- `server.js`
- `api/chat.js`
- `api/admin/docs.js`
- `package.json`
- `data/`
- `lib/`
- `assets/`
- `css/`

## Vercel settings

Use the repository root as **Root Directory**.

- Framework Preset: **Other**
- Build Command: leave empty / automatic
- Output Directory: leave empty
- Install Command: automatic
- Node.js: **24.x**

No custom start command is required on Vercel. Vercel serves the root static files and deploys the files in `api/` as Node.js Functions.

## Why this package has `api/`

The original application has a local Node HTTP server (`server.js`). Vercel's standard Node.js Function deployment expects an exported handler under `/api`, so the Vercel adapter exposes the existing chat/admin handlers through:

- `/api/chat`
- `/api/admin/docs`

`server.js` remains the local/kiosk server and still starts normally with `npm start`.

## Important limitation

The normal medical response path is deterministic and does not require Ollama on Vercel. Ollama settings remain for local/development extension.

The admin document store uses the application's local filesystem. Vercel Functions do not provide durable local storage, so uploaded admin documents should not be treated as persistent on the Vercel deployment. For the kiosk/local deployment, the existing local document store remains available.

## Deploy

1. Extract this ZIP.
2. Put its **contents** directly in the GitHub repository root.
3. Commit and push.
4. Vercel should automatically create a new deployment.
5. Open the production URL and test `/` and then the assistant.
