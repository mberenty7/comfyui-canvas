# ComfyUI Canvas

A visual node-based pipeline builder for ComfyUI. Place images, write prompts, pick workflows, connect them together, and generate — all on an infinite canvas.

## Quick Start

```bash
git clone https://github.com/mberenty7/comfyui-canvas.git
cd comfyui-canvas
npm install
npm start
```

Open `http://localhost:3002` in your browser.

### With Docker

```bash
docker build -t comfyui-canvas .
docker run -d -p 3002:3002 --name comfyui-canvas comfyui-canvas
```

## Configuration

Click the ⚙️ button in the toolbar to set your ComfyUI URL (default: `http://localhost:8188`).

Or set via environment variable:

```bash
COMFY_URL=http://192.168.1.50:8188 npm start
```

The green/red dot in the toolbar shows ComfyUI connection status.

## Node Types

### 📷 Image
Drop or import images onto the canvas. Shows a thumbnail with metadata in the properties panel.

### ✏️ Prompt
Positive and negative text prompts. Save/load prompts as files.

### ⚙️ Workflow
Picks a ComfyUI workflow template (txt2img, img2img, etc.). Configure all parameters in the properties panel. Connect Image and Prompt nodes to its inputs.

### ▶ Generate
Connects to a Workflow node and executes it. Supports multiple generations with seed control (increment, random, or fixed). Results appear as new Image nodes on the canvas.

## Controls

- **Alt + drag** — Pan the canvas
- **Scroll** — Zoom in/out
- **Tab** — Quick-add node (searchable)
- **Delete / Backspace** — Delete selected node
- **Right-click** — Context menu
- **💾 Save / 📂 Load** — Download/upload canvas project as JSON

## Adding Workflow Templates

Create a directory in `templates/` with:

- `config.json` — defines inputs, parameters, and UI
- `workflow.json` — raw ComfyUI API-format workflow

See `templates/txt2img/` for an example.

## Requirements

- Node.js 18+
- A running ComfyUI instance
