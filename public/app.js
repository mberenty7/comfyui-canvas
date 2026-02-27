// Main App — ties canvas engine, UI, and ComfyUI together

let engine;
let ws;

document.addEventListener('DOMContentLoaded', () => {
  engine = new CanvasEngine('canvas');

  // Wire up toolbar
  document.getElementById('btn-add-image').addEventListener('click', importImage);
  document.getElementById('btn-add-node').addEventListener('click', showTemplateModal);
  document.getElementById('btn-zoom-fit').addEventListener('click', () => engine.zoomToFit());
  document.getElementById('btn-zoom-reset').addEventListener('click', () => engine.resetZoom());
  document.getElementById('btn-save').addEventListener('click', showSaveModal);
  document.getElementById('btn-load').addEventListener('click', showLoadModal);
  document.getElementById('settings-close').addEventListener('click', closeSettings);
  document.getElementById('btn-generate').addEventListener('click', generateCurrent);

  // Node selection callbacks
  engine.onNodeSelected = (node) => {
    if (node.type === 'workflow') {
      showSettings(node);
    }
  };
  engine.onNodeDeselected = () => closeSettings();

  // Connect WebSocket for progress
  connectWS();

  // Drag and drop images onto canvas
  setupDragDrop();

  setStatus('Ready — Alt+drag to pan, scroll to zoom');
});

// ── Image Import ─────────────────────────────

function importImage() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setStatus('Uploading image...');
    const formData = new FormData();
    formData.append('image', file);

    const resp = await fetch('/api/upload', { method: 'POST', body: formData });
    const result = await resp.json();

    // Add to canvas at center
    const vpt = engine.fabricCanvas.viewportTransform;
    const cx = (engine.fabricCanvas.getWidth() / 2 - vpt[4]) / engine.fabricCanvas.getZoom();
    const cy = (engine.fabricCanvas.getHeight() / 2 - vpt[5]) / engine.fabricCanvas.getZoom();

    await engine.addImageNode(result.path, result.comfyName, cx - 100, cy - 100);
    setStatus(`Imported: ${file.name}`);
  };
  input.click();
}

function setupDragDrop() {
  const canvasEl = document.querySelector('.canvas-container') || document.getElementById('canvas');

  document.body.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  document.body.addEventListener('drop', async (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith('image/')) return;

    setStatus('Uploading dropped image...');
    const formData = new FormData();
    formData.append('image', file);

    const resp = await fetch('/api/upload', { method: 'POST', body: formData });
    const result = await resp.json();

    const zoom = engine.fabricCanvas.getZoom();
    const vpt = engine.fabricCanvas.viewportTransform;
    const x = (e.clientX - vpt[4]) / zoom;
    const y = (e.clientY - 48 - vpt[5]) / zoom;

    await engine.addImageNode(result.path, result.comfyName, x, y);
    setStatus(`Imported: ${file.name}`);
  });
}

// ── Template Modal ───────────────────────────

async function showTemplateModal() {
  const modal = document.getElementById('template-modal');
  const list = document.getElementById('template-list');

  list.innerHTML = '<p style="color:#888">Loading templates...</p>';
  modal.classList.remove('hidden');

  const resp = await fetch('/api/templates');
  const templates = await resp.json();

  if (templates.length === 0) {
    list.innerHTML = '<p style="color:#888">No templates found. Add workflow templates to the templates/ directory.</p>';
    return;
  }

  list.innerHTML = templates.map(t => `
    <div class="template-card" data-id="${t.id}">
      <h4>${t.name}</h4>
      <p>${t.description || ''}</p>
      <div class="template-io">
        <span>Inputs: ${(t.inputs || []).map(i => i.name).join(', ') || 'none'}</span>
        <span>•</span>
        <span>Output: image</span>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.template-card').forEach(card => {
    card.addEventListener('click', async () => {
      const id = card.dataset.id;
      const resp = await fetch(`/api/templates/${id}`);
      const template = await resp.json();

      const vpt = engine.fabricCanvas.viewportTransform;
      const zoom = engine.fabricCanvas.getZoom();
      const cx = (engine.fabricCanvas.getWidth() / 2 - vpt[4]) / zoom;
      const cy = (engine.fabricCanvas.getHeight() / 2 - vpt[5]) / zoom;

      const node = engine.addNode(template, cx - 110, cy - 50);
      modal.classList.add('hidden');
      showSettings(node);
      setStatus(`Added: ${template.name}`);
    });
  });
}

// ── Settings Panel ───────────────────────────

function showSettings(node) {
  const panel = document.getElementById('settings-panel');
  const title = document.getElementById('settings-title');
  const body = document.getElementById('settings-body');
  const genBtn = document.getElementById('btn-generate');

  title.textContent = node.template?.name || 'Node Settings';
  body.innerHTML = node.renderSettings();
  panel.classList.remove('hidden');

  // Wire up param change listeners
  body.querySelectorAll('[data-param]').forEach(el => {
    const handler = () => {
      node.params[el.dataset.param] = el.value;
      // Update range display
      if (el.type === 'range') {
        el.nextElementSibling.textContent = el.value;
      }
    };
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
  });

  // Wire up image input click → connect from selected image on canvas
  body.querySelectorAll('.image-input').forEach(el => {
    el.addEventListener('click', () => {
      const inputName = el.dataset.input;
      setStatus(`Click an image on the canvas to connect to "${inputName}"...`);

      // Set up a one-time click handler on canvas
      const handler = (e) => {
        const obj = e.target;
        if (obj && obj.nodeId && obj.nodeId !== node.id) {
          const sourceNode = engine.nodes.get(obj.nodeId);
          if (sourceNode) {
            engine.connect(obj.nodeId, node.id, inputName);
            // Update the image input display
            const imgUrl = sourceNode.getOutputImage?.() || sourceNode.imageUrl;
            if (imgUrl) {
              el.classList.add('has-image');
              el.innerHTML = `<img src="${imgUrl}" alt="${inputName}">`;
            }
            setStatus(`Connected ${sourceNode.filename || sourceNode.template?.name || 'node'} → ${inputName}`);
          }
        }
        engine.fabricCanvas.off('mouse:down', handler);
      };
      engine.fabricCanvas.on('mouse:down', handler);
    });
  });

  genBtn.disabled = node.isGenerating;
}

function closeSettings() {
  document.getElementById('settings-panel').classList.add('hidden');
}

// ── Generation ───────────────────────────────

async function generateCurrent() {
  const node = engine.selectedNode;
  if (!node || node.type !== 'workflow') return;

  const genBtn = document.getElementById('btn-generate');
  genBtn.disabled = true;
  genBtn.textContent = '⏳ Generating...';
  showProgress();
  setStatus(`Generating: ${node.template.name}...`);

  try {
    const output = await node.generate();

    if (output) {
      // Add output image to canvas next to the node
      const nodePos = node.fabricObject;
      const x = nodePos.left + nodePos.width + 40;
      const y = nodePos.top;

      const imgNode = await engine.addImageNode(output.imageUrl, output.comfyName, x, y);
      engine.connect(node.id, imgNode.id, 'source');

      setStatus(`Done! Output: ${output.comfyName}`);
    }

    // Refresh settings panel to show output
    showSettings(node);
  } catch (err) {
    setStatus(`Error: ${err.message}`);
  } finally {
    genBtn.disabled = false;
    genBtn.textContent = '▶ Generate';
    hideProgress();
  }
}

// ── Save/Load ────────────────────────────────

function showSaveModal() {
  const modal = document.getElementById('save-modal');
  document.getElementById('save-modal-title').textContent = 'Save Canvas';
  document.getElementById('canvas-name').value = '';
  document.getElementById('canvas-list').innerHTML = '';

  document.getElementById('btn-save-confirm').onclick = async () => {
    const name = document.getElementById('canvas-name').value.trim();
    if (!name) return;

    const data = engine.serialize();
    await fetch('/api/canvas/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, data }),
    });
    modal.classList.add('hidden');
    setStatus(`Canvas saved: ${name}`);
  };

  modal.classList.remove('hidden');
}

async function showLoadModal() {
  const modal = document.getElementById('save-modal');
  document.getElementById('save-modal-title').textContent = 'Load Canvas';
  document.getElementById('btn-save-confirm').style.display = 'none';

  const resp = await fetch('/api/canvas/list');
  const canvases = await resp.json();

  const list = document.getElementById('canvas-list');
  list.innerHTML = canvases.map(name => `
    <div class="canvas-item" data-name="${name}">${name}</div>
  `).join('');

  list.querySelectorAll('.canvas-item').forEach(el => {
    el.addEventListener('click', async () => {
      const resp = await fetch(`/api/canvas/load/${el.dataset.name}`);
      const data = await resp.json();
      await engine.deserialize(data);
      modal.classList.add('hidden');
      document.getElementById('btn-save-confirm').style.display = '';
      setStatus(`Loaded: ${el.dataset.name}`);
    });
  });

  modal.classList.remove('hidden');
}

// ── WebSocket Progress ───────────────────────

function connectWS() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}/ws`);

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'progress') {
        const pct = Math.round((msg.data.value / msg.data.max) * 100);
        updateProgress(pct, `Step ${msg.data.value}/${msg.data.max}`);
      }
    } catch {}
  };

  ws.onclose = () => setTimeout(connectWS, 3000);
}

// ── Progress UI ──────────────────────────────

function showProgress() {
  document.getElementById('progress-overlay').classList.remove('hidden');
  updateProgress(0, 'Starting...');
}

function hideProgress() {
  document.getElementById('progress-overlay').classList.add('hidden');
}

function updateProgress(pct, text) {
  document.getElementById('progress-fill').style.width = `${pct}%`;
  document.getElementById('progress-text').textContent = text;
}

// ── Status ───────────────────────────────────

function setStatus(text) {
  document.getElementById('status-text').textContent = text;
}
