# Node Development Guide — ComfyUI Canvas

How to create new nodes and workflow templates that are consistent with the existing codebase.

## Architecture Overview

```
public/
  <name>-node.js     — Node class (canvas visual + properties panel)
  app.js              — Wires up menu items, connect handlers, global callbacks
  canvas-engine.js    — Serialize/deserialize, register nodes, draw connections
  index.html          — Script tags + menu items
```

Optional supporting files:
- `<name>-viewer.js` — Modal viewer (like mask-editor.js, tile-viewer.js)
- `templates/<name>/config.json` + `workflow.json` — ComfyUI workflow templates

---

## Node Class Pattern

Every node class must implement these methods:

```js
class ExampleNode {
  constructor(id, opts = {}) {
    this.id = id;
    this.type = 'example';           // unique type string
    this.label = opts.label || '';
    this.fabricObject = null;         // set by createVisual
    // ... node-specific state
  }

  // Build the fabric.js group and assign to this.fabricObject
  createVisual(x, y) { ... }

  // Return HTML for the right-side properties panel
  renderProperties() { ... }

  // Attach event listeners to properties panel elements
  bindProperties() { ... }

  // Return plain object for save/load
  serialize() { ... }
}
```

### createVisual(x, y)

Build a `fabric.Group` with these conventions:

```js
createVisual(x, y) {
  const width = 160;
  const height = 60;

  // Background rect — always first object
  const bg = new fabric.Rect({
    width, height,
    fill: '#1e1e3a',
    stroke: '#e6a817',      // node accent color
    strokeWidth: 1.5,
    rx: 8, ry: 8,
  });

  // Type label — index [1]
  const typeLabel = new fabric.Text('Example', {
    fontSize: 10, fill: '#e6a817', fontWeight: 'bold',
    fontFamily: 'Inter, sans-serif',
    left: 8, top: 4,
  });

  // User label — index [2]
  const userLabel = new fabric.Text(this.label || '', {
    fontSize: 10, fill: '#aaa', fontFamily: 'Inter, sans-serif',
    left: 8, top: height - 16,
  });

  // Status text — index [3]
  const statusText = new fabric.Text('Status here', {
    fontSize: 9, fill: '#666', fontFamily: 'monospace',
    left: 8, top: 22,
  });

  // Input port (left side) — blue
  const inputPort = new fabric.Circle({
    radius: 5, fill: '#4a9eff', stroke: '#fff', strokeWidth: 1.5,
    left: -5, top: height / 2 - 5,
  });

  // Output port (right side) — accent color
  const outputPort = new fabric.Circle({
    radius: 6, fill: '#e6a817', stroke: '#fff', strokeWidth: 2,
    left: width - 12, top: height / 2 - 6,
  });

  const group = new fabric.Group(
    [bg, typeLabel, userLabel, statusText, inputPort, outputPort],
    { left: x, top: y, hasControls: false, hasBorders: false }
  );

  group.nodeId = this.id;
  this.fabricObject = group;
  return this;
}
```

**Rules:**
- **Never use `addWithUpdate` or `removeWithUpdate`** — it breaks canvas selection
- If you need to change visuals after creation, either update existing object properties (`obj.set('text', ...)`) or rebuild the entire group
- Object order in the group array matters — use consistent indices for `_updateStatus()` etc.

### Accent Colors by Node Type

| Node Type     | Color     | Hex       |
|---------------|-----------|-----------|
| Image         | Blue      | `#4a9eff` |
| Prompt        | Purple    | `#a855f7` |
| Workflow      | Template  | from config |
| Inpaint       | Red       | `#e94560` |
| Generate      | Green     | `#4caf50` |
| Model         | Cyan      | `#00bcd4` |
| Viewer        | Teal      | `#26a69a` |
| Tile Preview  | Gold      | `#e6a817` |

Input ports are always **blue** (`#4a9eff`). Output ports use the node's accent color.

### Status Updates

Use a helper to update the status text object by index:

```js
_updateStatus(text) {
  if (this.fabricObject) {
    const statusObj = this.fabricObject._objects[3]; // index 3
    if (statusObj) { statusObj.set('text', text); this.fabricObject.canvas?.renderAll(); }
  }
}
```

---

## Properties Panel

### renderProperties()

Return an HTML string. Use these CSS classes (defined in style.css):

```html
<div class="prop-section">
  <label class="prop-section-label">Section Title</label>
  <!-- content -->
</div>

<div class="prop-row">
  <span class="prop-label">Key</span>
  <span class="prop-value">Value</span>
</div>

<input type="text" id="node-label" class="prop-input" value="..." placeholder="...">
<button class="prop-btn">Button</button>
<button class="generate-btn">Primary Action</button>
```

### bindProperties()

Attach event listeners **after** `renderProperties()` renders the HTML.

```js
bindProperties() {
  // Label input — always include
  const labelInput = document.getElementById('node-label');
  if (labelInput) labelInput.addEventListener('input', () => this.updateLabel(labelInput.value));

  // Image connect slot — use data-connect pattern
  document.querySelector('[data-connect="image"]')?.addEventListener('click', () => {
    window._connectMode = { targetNodeId: this.id, connectType: 'my-type', expects: 'image' };
    document.querySelector('[data-connect="image"]').textContent = '🔗 Click an image node...';
  });

  // Disconnect — use data-disconnect pattern
  document.querySelectorAll('.disconnect-btn').forEach(el => {
    el.addEventListener('click', () => {
      if (el.dataset.disconnect === 'image') {
        const oldConn = this.connectedImage;
        this.connectedImage = null;
        this._updateStatus('No image');
        if (oldConn && window._engine) window._engine.removeConnectionBetween(oldConn.nodeId, this.id);
      }
      if (window._refreshProperties) window._refreshProperties(this);
    });
  });
}
```

### Connection Slots (renderProperties HTML)

```html
<!-- Unconnected -->
<div class="workflow-input-slot" data-connect="image" data-expects="image" style="cursor:pointer">
  Click to connect an image node
</div>

<!-- Connected -->
<div class="workflow-input-slot" data-connect="image" data-expects="image" style="cursor:pointer">
  ✅ Connected
</div>
<button class="prop-btn disconnect-btn" data-disconnect="image"
  style="margin-top:4px;font-size:11px;padding:4px 8px;width:100%">✂️ Disconnect</button>
```

---

## Wiring Up a New Node

### 1. Create the node file

`public/my-node.js` — follow the class pattern above.

### 2. Add to index.html

```html
<!-- In the dropdown menu -->
<div class="dropdown-item" data-action="my-node">🔧 My Node</div>

<!-- In the quick-add menu -->
<div class="quick-add-item" data-action="my-node">🔧 My Node</div>

<!-- Script tag (before app.js) -->
<script src="my-node.js?v=1"></script>
```

### 3. Wire in app.js

```js
// Menu listener (in DOMContentLoaded)
addMenu.querySelector('[data-action="my-node"]').addEventListener('click', () => {
  addMenu.classList.add('hidden'); addMyNode();
});

// Quick-add handler (in the quick-add item click handler)
else if (action === 'my-node') addMyNode();

// Add function
function addMyNode() {
  const pos = engine.canvasCenter();
  const id = engine.nextId();
  const node = new MyNode(id);
  node.createVisual(pos.x - 80, pos.y - 30);
  engine.register(node);
}
```

### 4. Handle connections in `handleConnect()` (if node accepts inputs)

```js
} else if (mode.connectType === 'my-type' && sourceNode.type === 'image') {
  targetNode.connectImage(sourceNode.id, sourceNode.imageUrl);
  connected = true;
}
```

### 5. Add deserialization in canvas-engine.js

```js
} else if (n.type === 'my-node') {
  const node = new MyNode(n.id, {
    label: n.label,
    // ... restore saved state
  });
  node.createVisual(n.x, n.y);
  this.register(node);
}
```

---

## Modal Viewers

For nodes that need a full-screen editing/preview experience (like mask editor, tile viewer):

1. Create `public/my-viewer.js` with a class that builds its own modal DOM
2. Reuse `mask-editor-modal` and `mask-editor-container` CSS classes for consistent styling
3. Instantiate once in `app.js`: `window._myViewer = new MyViewer();`
4. Open from `bindProperties()`: `window._myViewer.open(data, callback)`
5. Include `<script src="my-viewer.js?v=1"></script>` in index.html

---

## Workflow Templates

For nodes that submit to ComfyUI, add a template:

```
templates/my-workflow/
  config.json     — metadata, inputs, params
  workflow.json   — ComfyUI API workflow with placeholders
```

### config.json

```json
{
  "name": "My Workflow",
  "description": "What it does",
  "color": "#e6a817",
  "inputs": [
    { "name": "image", "type": "image", "label": "Source Image" }
  ],
  "params": [
    { "name": "prompt", "type": "text", "label": "Prompt", "default": "" },
    { "name": "steps", "type": "slider", "label": "Steps", "default": 20, "min": 1, "max": 50 },
    { "name": "seed", "type": "seed", "label": "Seed", "default": -1 }
  ]
}
```

### Param Types

| Type     | Properties                          |
|----------|-------------------------------------|
| `text`   | `default`                           |
| `slider` | `default`, `min`, `max`, `step`     |
| `seed`   | `default` (-1 for random)           |
| `select` | `default`, `options` (string array) |

---

## Checklist for New Nodes

- [ ] Node class with all 4 methods (createVisual, renderProperties, bindProperties, serialize)
- [ ] Consistent accent color (pick one, add to table above)
- [ ] `group.nodeId = this.id` set in createVisual
- [ ] `hasControls: false, hasBorders: false` on the group
- [ ] Script tag in index.html (before app.js)
- [ ] Dropdown + quick-add menu items in index.html
- [ ] Menu listener + add function in app.js
- [ ] Connection handler in `handleConnect()` if accepting inputs
- [ ] Deserialization block in canvas-engine.js
- [ ] Disconnect uses `data-disconnect` + `removeConnectionBetween`
- [ ] No `addWithUpdate` / `removeWithUpdate` anywhere
