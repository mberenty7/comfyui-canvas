# ComfyUI Canvas

A visual node-based pipeline builder for ComfyUI. Place images, write prompts,
pick workflows, connect them together, process images, preview 3D models, and
generate — all on an infinite canvas.

The current UI is a **React + React Flow** app (in `web/`). The original
fabric.js app is preserved as a fallback.

## Quick Start

```bash
git clone https://github.com/mberenty7/comfyui-canvas.git
cd comfyui-canvas
npm install
npm run build:web      # builds the React app into public/dist
npm start
```

Open **`http://localhost:3002/`** in your browser.

| URL | App |
|-----|-----|
| `/` | React app (default) |
| `/app/` | React app (alias) |
| `/legacy/` | Original fabric.js app (backup) |

> `public/dist` is gitignored, so run `npm run build:web` after cloning or
> pulling. If you skip it, `/` has nothing to serve.

### Develop the React app (hot reload)

```bash
npm start            # backend on :3002 (one terminal)
npm run dev:web      # Vite dev server on :5173 (another terminal)
```
Open `http://localhost:5173/`. `npm run typecheck:web` runs the TypeScript checker.

### With Docker

```bash
docker build -t comfyui-canvas .
docker run -d -p 3002:3002 --name comfyui-canvas comfyui-canvas
```

## Configuration

Click **⚙️ Settings** in the toolbar to set:

- **ComfyUI URL** (default `http://localhost:8188`) — with a Test button
- **Output Directory** — every produced image (generations, 3D captures,
  processing outputs) is copied here with a `.json` metadata sidecar
- **Comfy API Key** — for partner/cloud nodes (Nano Banana, etc.)
- **BFL API Key** — for Flux generation via the BFL API

The green/red dot in the toolbar shows ComfyUI connection status. Settings can
also come from env vars (`COMFY_URL`, `OUTPUT_DIR`, `COMFY_API_KEY`,
`BFL_API_KEY`) and are persisted to `config.json` (gitignored).

## Node Types

Added via **➕ Add Node**, **Tab**, or **right-click** on the canvas (grouped by
category):

**Inputs**
- **✏️ Prompt** — positive/negative text; save to the Prompt Library
- **🔤 Template** — prompt builder with `<tag>` substitution; each tag becomes a
  prompt input, with defaults and a live preview
- **📷 Image** — import/drag-drop images

**Generate**
- **⚙️ Workflow** — a ComfyUI template (txt2img, img2img, inpaint, …) with typed
  prompt/image inputs and a full parameter panel
- **▶ Generate** — runs a connected Workflow N times (seed increment/random/
  fixed); results appear as Image nodes. Supports ComfyUI and BFL backends

**Image AI**
- **🎨 Inpaint** — paint a mask over an image and feed it to a Workflow
- **🖌 Paint** — freehand color paint over an image

**Color**
- **🎚 Grade** — gain / gamma / saturation / hue / per-channel RGB
- **🟥 Overlay** — composite a color onto an image using a matte

**3D**
- **🎲 3D Model** / **👁 3D Viewer** — load GLB/GLTF/OBJ/FBX; render modes
  (Color, Depth, Normal, Normal Gray, Puzzle Matte), focal length, aspect-ratio
  capture → Image node
- **🎯 Color Pick** — extract a binary matte from an image by color sampling

**Utility**
- **🔳 Grid Join** — combine up to 4 images into a 2×2 grid
- **✂️ Grid Split** — split one image into 4 quadrant Image nodes
- **📦 Group** — a nested subgraph; double-click to enter, breadcrumb to navigate

## Panels

- **📝 Prompt Library** — browse, place, and delete saved prompts
- **🖼️ Gallery** — browse ComfyUI outputs or a directory; lightbox with metadata;
  place on canvas
- **📋 Log** — generation progress and errors (verbose toggle)

## Controls

- **Left-drag (empty canvas)** — box-select
- **Middle-drag** or **Space + drag** — pan
- **Scroll** — zoom
- **Tab** — quick-add menu (at viewport center)
- **Right-click (canvas)** — quick-add menu (at cursor)
- **Right-click (node)** — Duplicate / Delete
- **Ctrl/Cmd + D** — duplicate selected
- **Delete / Backspace** — delete selected nodes/edges
- **Double-click** — Group: enter; 3D Model/Viewer: open viewer
- **💾 Save** — whole canvas, or just the selected nodes if any are selected
- **📂 Load** — replace the canvas; **📥 Import** — merge a file into the canvas

## Adding Workflow Templates

Create a directory in `templates/` with:

- `config.json` — defines inputs, parameters, and UI
- `workflow.json` — raw ComfyUI API-format workflow

See the existing `templates/` for examples.

## Project Layout

- `server.js`, `server/` — Node/Express backend (ComfyUI proxy, uploads,
  templates, config). Shared by both frontends.
- `web/` — React + React Flow + TypeScript app (Vite). Built to `public/dist`.
- `public/` — original fabric.js app + shared static assets, shaders.
- `templates/` — workflow templates.

## Requirements

- Node.js 18+
- A running ComfyUI instance (for generation; the canvas itself works offline)
