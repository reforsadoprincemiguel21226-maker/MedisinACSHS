# Agent Guide

Read [README.md](README.md) for setup, retuning, RAG, calendar, and deployment instructions.

## Commands

- Install: `npm install`
- Start Ollama: `ollama serve`
- Download the default model: `ollama pull qwen3.5:0.8b`
- Start the app: `ADMIN_TOKEN=dev-token npm start`
- Syntax check backend: `node --check lib/server-core.js`
- Full regression suite: `npm run test:all`
- No separate build step is required.

## Architecture

- `api/chat.js`: Vercel chat function entrypoint.
- `api/admin/docs.js`: Vercel admin/RAG entrypoint.
- `lib/server-core.js`: shared local/Vercel HTTP routing, safety pipeline, hospital/kit handling, and AI communication orchestration.
- `lib/ai-response.js`: Qwen/Ollama communication brief, model call, and output validator.
- `scripts/kiosk-server.cjs`: local CommonJS HTTP server wrapper.
- `A.i asistant.html`: assistant UI, browser conversation state, Markdown rendering, and voice input controls.
- `data/rag.js`: extraction, chunking, cached keyword retrieval, and document persistence.
- `data/rag-defaults/`: tracked built-in health references.
- `data/rag-store/`: private uploaded documents and manifest; never commit its contents.
- `data/hospitals-data.js`: deterministic hospital directory.
- `plan-schedule.html`: appointment form and ICS calendar workflows.
- `assets/images/`: logos and icons.
- `assets/js/`: browser scripts.
- `css/`: stylesheets.
- `sw.js` and `assets/js/pwa-register.js`: PWA caching and registration.

## Development Rules

- Keep root HTML pages at the repository root because links and PWA paths are relative.
- When adding or moving a static asset, update every page reference, `manifest.webmanifest`, and `sw.js`; bump the service-worker cache name when cached assets change.
- The static server allowlist is intentional. Do not expose `.txt` or `.json` files through it.
- Preserve crisis detection before RAG and Ollama calls.
- RAG is keyword retrieval with intent query expansion, not vector embeddings. Keep default references reviewed and concise.
- Never let the model invent diagnoses, medication advice, kit items, hospitals, or emergency claims unsupported by the approved brief.
- RAG is connected to routine medical communication through `getRagKnowledge()`; deterministic safety guidance remains authoritative over retrieved text.
- The AI output validator must reject responses that omit required safety concepts or contain prohibited medical content.
- Never commit admin tokens, private health documents, or generated `.codegraph/` files.
- Restart Node after changing `lib/server-core.js`, `lib/ai-response.js`, or `data/rag.js`; refresh the browser after client changes.
- Validate changed JavaScript with `node --check` and use `git diff --check` before committing.
