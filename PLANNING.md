# ComfyUI Canvas — Planning

## Vision
Vizcom meets ComfyUI. An infinite canvas where you visually build generation pipelines — place reference images, connect them to workflow nodes, tweak params, generate, and chain outputs into new inputs. A visual meta-graph on top of ComfyUI.

## Architecture

```
┌─────────────────────────────────────────────┐
│              Infinite Canvas                 │
│                                              │
│   [ref photo] ──→ [IP Adapter] ──→ [bass]  │
│                                     │        │
│                              [CHORD] ──→ [PBR maps] │
│                                              │
│   [sketch] ──→ [depth + style] ──→ [prop]  │
└─────────────────────────────────────────────┘
         │              │
    Canvas Engine    Workflow Engine
    (pan/zoom/       (template system,
     layers/draw)     ComfyUI API proxy)
```

- **Canvas engine:** fabric.js — handles objects, selection, grouping, serialization, pan/zoom
- **Workflow nodes:** Each node = a complete ComfyUI workflow (IP Adapter, CHORD, tiling, etc.)
- **Inputs:** Images/params you connect to nodes
- **Outputs:** Generated results that appear on canvas
- **Connections:** Visual links (bezier curves) between output → input of next node
- **Backend:** Express + WebSocket proxy to ComfyUI API

## Node Model
- Each canvas node wraps a full ComfyUI workflow template
- Nodes have typed input ports (image slots) and output ports
- Click a node → settings panel with all params (prompt, seed, weight, etc.)
- Generate → submits workflow to ComfyUI → result image appears on canvas
- Output images can be dragged into other nodes' inputs → chaining

## Workflow Templates
Stored in `templates/<name>/` with:
- `config.json` — name, description, inputs, params, color
- `workflow.json` — the ComfyUI workflow with placeholder values

Current templates:
- **IP Adapter** — style transfer from reference image
- **CHORD PBR** — decompose image into PBR material maps
- **Tileable Texture** — generate tileable textures from reference

## Phases

### Phase 1 — Canvas + Single Workflow ✅ (exists, needs cleanup)
- [x] Infinite canvas with pan/zoom (alt+drag, scroll wheel)
- [x] Import images (button + drag & drop)
- [x] Workflow node visual on canvas with input/output ports
- [x] Click image input slot → click canvas image to connect
- [x] Settings panel with all param types (prompt, slider, seed, select, etc.)
- [x] Generate → result appears on canvas next to node
- [x] WebSocket progress bar from ComfyUI
- [x] Save/load canvas state
- [x] Bezier connection lines

### Phase 2 — Multi-Workflow + Connections
- [ ] Drag-to-connect ports (drag from output circle to input circle)
- [ ] Visual connection validation (type checking)
- [ ] CHORD multi-output (5 PBR maps fan out from one node)
- [ ] Re-run individual nodes without clearing downstream
- [ ] Right-click context menu (add node, disconnect, delete)
- [ ] Node grouping / selection

### Phase 3 — Drawing + Polish
- [ ] Sketch tools (brush, shapes) directly on canvas
- [ ] Use sketches as depth/controlnet inputs
- [ ] Mask painting for inpainting regions
- [ ] Canvas export (PNG/PSD)
- [ ] Generation history per node (undo/compare)
- [ ] Minimap for navigation

## Tech Stack
- **Frontend:** Vanilla JS + fabric.js 5.3.1 (CDN)
- **Backend:** Node.js + Express + ws + multer
- **ComfyUI:** Proxied via `COMFY_URL` env var (default: `http://100.75.225.122:8188`)
- **Deploy:** Docker, port 3002

## Repo
- **GitHub:** https://github.com/mberenty7/comfyui-canvas (private)
- **Local:** `/home/matt/projects/comfyui-canvas`
