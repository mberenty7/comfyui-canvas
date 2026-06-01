# React Flow migration — vertical slice

This is a **proof-of-concept** of migrating the canvas from fabric.js to
[React Flow](https://reactflow.dev) (`@xyflow/react`) + React + TypeScript.
It lives alongside the existing fabric app (`public/`), which is untouched.

## What's in the slice

- **Vite + React 18 + TypeScript** build (`web/`), output to `public/dist`.
- **Zustand store** (`src/store.ts`) holding `nodes` / `edges`.
- **v2 serialization adapter** (`src/serialize.ts`) — reads & writes the exact
  legacy file format produced by the fabric app, so existing `.json` projects
  and the shared `comfyui-canvas-autosave` localStorage key are interchangeable.
  Unmigrated node types round-trip losslessly (their data is preserved).
- **One migrated node** — `PromptNode` — with its full properties panel
  (label / positive / negative / Save to Library).
- React Flow gives pan/zoom, drag-to-connect ports, minimap, and selection
  for free.

## Run it

```bash
npm install

# Terminal 1 — the existing Express backend (API + uploads)
npm start

# Terminal 2 — the React dev server (proxies /api, /uploads, /style.css to :3002)
npm run dev:web      # http://localhost:5173

# Or build and serve from Express at /app:
npm run build:web    # outputs to public/dist
npm start            # http://localhost:3002/app/
```

`npm run typecheck:web` runs the TypeScript checker.

## Status

This is step one of the plan: it de-risks the state-model flip and
serialization compatibility. Remaining node types (image, workflow, generate,
model, viewer, inpaint, tile-preview, group-box) and the other side panels
(settings, log, gallery, workflow picker) are not yet ported.
