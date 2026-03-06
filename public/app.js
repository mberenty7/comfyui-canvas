// App — ties it all together

let engine;

document.addEventListener('DOMContentLoaded', () => {
  engine = new CanvasEngine('canvas');

  // Add Node dropdown
  const addBtn = document.getElementById('btn-add-node');
  const addMenu = document.getElementById('add-node-menu');
  addBtn.addEventListener('click', () => addMenu.classList.toggle('hidden'));
  document.addEventListener('click', (e) => {
    if (!addBtn.contains(e.target) && !addMenu.contains(e.target)) addMenu.classList.add('hidden');
  });
  addMenu.querySelector('[data-action="image"]').addEventListener('click', () => { addMenu.classList.add('hidden'); importImage(); });
  addMenu.querySelector('[data-action="prompt"]').addEventListener('click', () => { addMenu.classList.add('hidden'); addPromptNode(); });
  addMenu.querySelector('[data-action="workflow"]').addEventListener('click', () => { addMenu.classList.add('hidden'); addWorkflowNode(); });
  addMenu.querySelector('[data-action="model"]').addEventListener('click', () => { addMenu.classList.add('hidden'); importModel(); });
  addMenu.querySelector('[data-action="viewer"]').addEventListener('click', () => { addMenu.classList.add('hidden'); addViewerNode(); });
  addMenu.querySelector('[data-action="generate"]').addEventListener('click', () => { addMenu.classList.add('hidden'); addGenerateNode(); });

  document.getElementById('btn-log').addEventListener('click', toggleLog);
  document.getElementById('log-close').addEventListener('click', () => document.getElementById('log-panel').classList.add('hidden'));
  document.getElementById('log-clear').addEventListener('click', () => document.getElementById('log-body').innerHTML = '');

  document.getElementById('btn-save').addEventListener('click', saveCanvas);
  document.getElementById('btn-load').addEventListener('click', loadCanvas);
  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.getElementById('properties-close').addEventListener('click', closeProperties);

  engine.onNodeSelected = (node) => {
    // If in connect mode, handle the connection
    if (window._connectMode) {
      handleConnect(node);
      return;
    }
    showProperties(node);
    if (node.bindProperties) node.bindProperties();
  };
  engine.onNodeDeselected = () => closeProperties();

  // Double-click viewer or model node → open viewer
  engine.fc.on('mouse:dblclick', (e) => {
    let obj = e.target;
    while (obj && !obj.nodeId && obj.group) obj = obj.group;
    if (!obj?.nodeId) return;
    const node = engine.nodes.get(obj.nodeId);
    if (node?.type === 'viewer' && node.connectedModel) {
      window._openViewerForNode(node.connectedModel.nodeId);
    } else if (node?.type === 'model' && node.modelUrl) {
      window._viewer3d.open(node.modelUrl, node.filename);
    }
  });

  // Generate callback
  window._onGenerate = runGenerate;

  // 3D Viewer
  window._viewer3d = new Viewer3D();

  // Callback for ViewerNode → open 3D viewer with model
  window._openViewerForNode = (modelNodeId) => {
    const modelNode = engine.nodes.get(modelNodeId);
    if (modelNode?.type === 'model' && modelNode.modelUrl) {
      window._viewer3d.open(modelNode.modelUrl, modelNode.filename);
    }
  };

  // Callback for viewer captures → ImageNode on canvas
  window._createImageNode = async (opts) => {
    const pos = engine.canvasCenter();
    const id = engine.nextId();
    const node = new ImageNode(id, opts);
    await node.createVisual(pos.x - 100, pos.y - 100);
    engine.register(node);
  };

  // Gallery
  document.getElementById('btn-gallery').addEventListener('click', toggleGallery);
  document.getElementById('gallery-close').addEventListener('click', () => document.getElementById('gallery-panel').classList.add('hidden'));
  document.getElementById('gallery-refresh').addEventListener('click', loadGallery);
  document.getElementById('gallery-source').addEventListener('change', (e) => {
    const dirRow = document.getElementById('gallery-dir-row');
    dirRow.style.display = e.target.value === 'dir' ? 'flex' : 'none';
    loadGallery();
  });
  // Remember last gallery dir path
  const savedGalleryDir = localStorage.getItem('gallery-dir-path');
  if (savedGalleryDir) document.getElementById('gallery-dir-path').value = savedGalleryDir;
  document.getElementById('gallery-dir-go').addEventListener('click', loadGallery);
  document.getElementById('gallery-dir-path').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadGallery(); });
  document.getElementById('gallery-lb-close').addEventListener('click', closeGalleryLightbox);
  document.getElementById('gallery-lb-prev').addEventListener('click', () => navigateGallery(-1));
  document.getElementById('gallery-lb-next').addEventListener('click', () => navigateGallery(1));
  document.getElementById('gallery-lb-place').addEventListener('click', placeGalleryImage);

  setupDragDrop();
  setupContextMenu();
  setupKeyboard();
  checkComfyStatus();

  // Poll ComfyUI status every 30s
  setInterval(checkComfyStatus, 30000);
});

// ── Log Panel ────────────────────────────────

function toggleLog() {
  document.getElementById('log-panel').classList.toggle('hidden');
}

function addLog(message, type = 'info') {
  const body = document.getElementById('log-body');
  const time = new Date().toLocaleTimeString();
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.innerHTML = `<span class="log-time">${time}</span>${message}`;
  body.appendChild(entry);
  body.scrollTop = body.scrollHeight;
}

// ── ComfyUI Status ───────────────────────────

async function checkComfyStatus() {
  const dot = document.getElementById('comfy-status');
  try {
    const resp = await fetch('/api/comfy/status');
    const data = await resp.json();
    dot.classList.toggle('connected', data.connected);
    dot.classList.toggle('disconnected', !data.connected);
    dot.title = data.connected ? 'ComfyUI connected' : 'ComfyUI disconnected';
  } catch {
    dot.classList.add('disconnected');
    dot.classList.remove('connected');
    dot.title = 'ComfyUI disconnected';
  }
}

// ── Settings ─────────────────────────────────

async function openSettings() {
  const modal = document.getElementById('settings-modal');
  const urlInput = document.getElementById('settings-comfy-url');

  const dirInput = document.getElementById('settings-output-dir');

  const apiKeyInput = document.getElementById('settings-api-key');

  const resp = await fetch('/api/config');
  const config = await resp.json();
  urlInput.value = config.comfyUrl || '';
  dirInput.value = config.outputDir || '';
  apiKeyInput.value = config.comfyApiKey || '';

  modal.classList.remove('hidden');

  document.getElementById('settings-save').onclick = async () => {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comfyUrl: urlInput.value, outputDir: dirInput.value, comfyApiKey: apiKeyInput.value }),
    });
    modal.classList.add('hidden');
    checkComfyStatus();
  };

  document.getElementById('settings-cancel').onclick = () => modal.classList.add('hidden');
}

// ── Import Image ─────────────────────────────

function importImage() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (file) uploadAndPlace(file);
  };
  input.click();
}

function setupDragDrop() {
  document.body.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  document.body.addEventListener('drop', (e) => {
    // Don't intercept drops on the 3D viewer
    if (e.target.closest('.viewer3d-viewport')) return;
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (file.type.startsWith('image/')) {
      uploadAndPlace(file, e.clientX, e.clientY);
    } else if (/\.(glb|gltf|obj|fbx)$/i.test(file.name)) {
      uploadAndPlaceModel(file, e.clientX, e.clientY);
    }
  });
}

async function uploadAndPlace(file, screenX, screenY) {
  const formData = new FormData();
  formData.append('image', file);

  // Upload to both local and ComfyUI
  const resp = await fetch('/api/comfy/upload', { method: 'POST', body: formData });
  const result = await resp.json();

  const dims = await getImageDimensions(result.localPath);

  const pos = screenX !== undefined
    ? engine.screenToCanvas(screenX, screenY)
    : engine.canvasCenter();

  const id = engine.nextId();
  const node = new ImageNode(id, {
    imageUrl: result.localPath,
    filename: result.originalName || file.name,
    comfyName: result.comfyName,
    width: dims.width,
    height: dims.height,
    fileSize: file.size,
    format: file.type.split('/')[1]?.toUpperCase() || '?',
  });

  await node.createVisual(pos.x - 100, pos.y - 100);
  engine.register(node);
}

function getImageDimensions(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = url;
  });
}

// ── Import 3D Model ──────────────────────────

function importModel() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.glb,.gltf,.obj,.fbx';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (file) uploadAndPlaceModel(file);
  };
  input.click();
}

async function uploadAndPlaceModel(file, screenX, screenY) {
  const formData = new FormData();
  formData.append('model', file);

  const resp = await fetch('/api/models/upload', { method: 'POST', body: formData });
  const result = await resp.json();

  const pos = screenX !== undefined
    ? engine.screenToCanvas(screenX, screenY)
    : engine.canvasCenter();

  const ext = file.name.split('.').pop().toUpperCase();
  const id = engine.nextId();
  const node = new ModelNode(id, {
    modelUrl: result.path,
    filename: result.originalName || file.name,
    format: ext,
    fileSize: file.size,
  });

  node.createVisual(pos.x - 100, pos.y - 35);
  engine.register(node);
}

// ── Properties Panel ─────────────────────────

function showProperties(node) {
  if (!node?.renderProperties) return;
  document.getElementById('properties-body').innerHTML = node.renderProperties();
  document.getElementById('properties').classList.remove('hidden');
}

function closeProperties() {
  document.getElementById('properties').classList.add('hidden');
}

// ── Connection System ────────────────────────

function handleConnect(sourceNode) {
  const mode = window._connectMode;
  window._connectMode = null;

  if (!mode) return;

  const targetNode = engine.nodes.get(mode.targetNodeId);
  if (!targetNode) return;

  let connected = false;

  if (mode.connectType === 'workflow' && sourceNode.type === 'workflow') {
    // Generate node → workflow
    targetNode.connectedWorkflow = { nodeId: sourceNode.id };
    connected = true;
  } else if (mode.connectType === 'viewer-model' && sourceNode.type === 'model') {
    // Viewer node → model input
    targetNode.connectModel(sourceNode.id);
    targetNode._updateStatus(sourceNode.filename || 'Model');
    connected = true;
  } else if (mode.expects === 'prompt' && sourceNode.type === 'prompt') {
    // Workflow node → prompt input
    targetNode.connectInput(mode.inputName, sourceNode.id);
    connected = true;
  } else if (mode.expects === 'image' && (sourceNode.type === 'image' || sourceNode.type === 'model')) {
    // Workflow node → image input (images or 3D model captures)
    targetNode.connectInput(mode.inputName, sourceNode.id);
    connected = true;
  }

  if (connected) {
    engine.addConnection(sourceNode.id, targetNode.id);
    showProperties(targetNode);
    if (targetNode.bindProperties) targetNode.bindProperties();
  } else {
    // Wrong type — cancel silently, refresh panel
    showProperties(targetNode);
    if (targetNode.bindProperties) targetNode.bindProperties();
  }
}

// ── Keyboard ─────────────────────────────────

function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    const quickAdd = document.getElementById('quick-add');
    const isQuickAddOpen = !quickAdd.classList.contains('hidden');

    // Gallery lightbox keys
    const galleryLB = document.getElementById('gallery-lightbox');
    if (galleryLB && !galleryLB.classList.contains('hidden')) {
      if (e.key === 'Escape') { closeGalleryLightbox(); return; }
      if (e.key === 'ArrowLeft') { navigateGallery(-1); return; }
      if (e.key === 'ArrowRight') { navigateGallery(1); return; }
      return;
    }

    if (e.key === 'Escape') {
      if (isQuickAddOpen) { quickAdd.classList.add('hidden'); return; }
      if (window._connectMode) { window._connectMode = null; return; }
    }

    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      if (e.target.id !== 'quick-add-search') return;
      if (e.key === 'Enter') {
        const visible = quickAdd.querySelector('.quick-add-item:not(.hidden)');
        if (visible) visible.click();
      }
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      openQuickAdd();
    }

    if ((e.key === 'Delete' || e.key === 'Backspace') && engine.selectedNode) {
      deleteNode(engine.selectedNode.id);
    }
  });
}

function openQuickAdd() {
  const quickAdd = document.getElementById('quick-add');
  const search = document.getElementById('quick-add-search');
  const items = quickAdd.querySelectorAll('.quick-add-item');

  search.value = '';
  items.forEach(i => i.classList.remove('hidden'));
  quickAdd.classList.remove('hidden');
  search.focus();

  search.oninput = () => {
    const q = search.value.toLowerCase();
    items.forEach(i => {
      i.classList.toggle('hidden', !i.textContent.toLowerCase().includes(q));
    });
  };

  items.forEach(i => {
    i.onclick = () => {
      quickAdd.classList.add('hidden');
      const action = i.dataset.action;
      if (action === 'image') importImage();
      else if (action === 'prompt') addPromptNode();
      else if (action === 'workflow') addWorkflowNode();
      else if (action === 'model') importModel();
      else if (action === 'viewer') addViewerNode();
      else if (action === 'generate') addGenerateNode();
    };
  });

  const closeHandler = (e) => {
    if (!quickAdd.contains(e.target)) {
      quickAdd.classList.add('hidden');
      document.removeEventListener('mousedown', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);
}

function deleteNode(nodeId) {
  const node = engine.nodes.get(nodeId);
  if (!node) return;
  if (node.fabricObject) engine.fc.remove(node.fabricObject);
  engine.nodes.delete(nodeId);
  engine.removeConnections(nodeId);
  if (engine.selectedNode?.id === nodeId) {
    engine.selectedNode = null;
    closeProperties();
  }
}

// ── Context Menu ─────────────────────────────

let contextTarget = null;

function setupContextMenu() {
  const menu = document.getElementById('context-menu');

  document.addEventListener('contextmenu', (e) => {
    const rect = engine.fc.upperCanvasEl.getBoundingClientRect();
    if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
      e.preventDefault();
      let obj = engine.fc.findTarget(e);
      while (obj && !obj.nodeId && obj.group) obj = obj.group;
      if (obj?.nodeId) {
        contextTarget = obj.nodeId;
        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';
        menu.classList.remove('hidden');
      } else {
        menu.classList.add('hidden');
      }
    }
  });

  engine.fc.on('mouse:down', (e) => {
    if (e.e.button !== 2) menu.classList.add('hidden');
  });

  menu.querySelector('[data-action="delete"]').addEventListener('click', () => {
    if (contextTarget) {
      deleteNode(contextTarget);
      contextTarget = null;
    }
    menu.classList.add('hidden');
  });

  document.addEventListener('click', () => menu.classList.add('hidden'));
}

// ── Add Nodes ────────────────────────────────

function addPromptNode() {
  const pos = engine.canvasCenter();
  const id = engine.nextId();
  const node = new PromptNode(id);
  node.createVisual(pos.x - 80, pos.y - 25);
  engine.register(node);
}

async function addWorkflowNode() {
  // Fetch available templates
  const resp = await fetch('/api/templates');
  const templates = await resp.json();

  if (templates.length === 0) {
    alert('No workflow templates found. Add templates to the templates/ directory.');
    return;
  }

  // Show picker
  const modal = document.getElementById('workflow-picker');
  const list = document.getElementById('workflow-picker-list');

  list.innerHTML = templates.map(t => `
    <div class="template-card" data-id="${t.id}">
      <h4 style="color:${t.color || '#4a9eff'}">${t.name}</h4>
      <p style="font-size:12px;color:#888">${t.description || ''}</p>
    </div>
  `).join('');

  modal.classList.remove('hidden');

  document.getElementById('workflow-picker-cancel').onclick = () => modal.classList.add('hidden');

  list.querySelectorAll('.template-card').forEach(card => {
    card.addEventListener('click', async () => {
      modal.classList.add('hidden');
      const tResp = await fetch(`/api/templates/${card.dataset.id}`);
      const template = await tResp.json();

      const pos = engine.canvasCenter();
      const id = engine.nextId();
      const node = new WorkflowNode(id, {
        templateId: template.id,
        templateName: template.name,
        templateColor: template.color,
        inputs: template.inputs,
        params: template.params,
        workflow: template.workflow,
      });
      node.createVisual(pos.x - 90, pos.y - 35);
      engine.register(node);
    });
  });
}

function addViewerNode() {
  const pos = engine.canvasCenter();
  const id = engine.nextId();
  const node = new ViewerNode(id);
  node.createVisual(pos.x - 90, pos.y - 35);
  engine.register(node);
}

function addGenerateNode() {
  const pos = engine.canvasCenter();
  const id = engine.nextId();
  const node = new GenerateNode(id);
  node.createVisual(pos.x - 80, pos.y - 30);
  engine.register(node);
}

// ── Generate ─────────────────────────────────

async function runGenerate(genNode) {
  try {
    addLog('Starting generation...', 'info');
    const results = await genNode.run(engine);
    addLog(`Generation complete: ${results.length} image(s)`, 'success');

    // Place result images on canvas to the right of the generate node
    const genObj = genNode.fabricObject;
    const startX = genObj.left + genObj.width + 40;
    let y = genObj.top;

    for (const result of results) {
      const dims = await getImageDimensions(result.imageUrl);
      const id = engine.nextId();
      const imgNode = new ImageNode(id, {
        imageUrl: result.imageUrl,
        filename: result.comfyName,
        comfyName: result.comfyName,
        width: dims.width,
        height: dims.height,
        format: 'PNG',
        label: `seed: ${result.seed}`,
      });
      await imgNode.createVisual(startX, y);
      engine.register(imgNode);
      engine.addConnection(genNode.id, imgNode.id);
      y += 250; // stack vertically
    }
  } catch (err) {
    addLog(`Generation failed: ${err.message}`, 'error');
    // Auto-open log panel on error
    document.getElementById('log-panel').classList.remove('hidden');
    alert(`Generation failed: ${err.message}`);
  }
}

// ── Gallery ──────────────────────────────────

let galleryImages = [];
let galleryLightboxIndex = -1;

function toggleGallery() {
  const panel = document.getElementById('gallery-panel');
  const wasHidden = panel.classList.contains('hidden');
  panel.classList.toggle('hidden');
  if (wasHidden) loadGallery();
}

function galleryImageSrc(img) {
  if (img.source === 'dir') {
    return `/api/gallery/dir/image?dir=${encodeURIComponent(img.dirPath)}&filename=${encodeURIComponent(img.filename)}`;
  }
  return `/api/comfy/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${encodeURIComponent(img.type)}`;
}

async function loadGallery() {
  const body = document.getElementById('gallery-body');
  body.innerHTML = '<div class="gallery-empty">Loading...</div>';

  const source = document.getElementById('gallery-source').value;

  try {
    let resp;
    if (source === 'dir') {
      const dirPath = document.getElementById('gallery-dir-path').value.trim();
      if (!dirPath) {
        body.innerHTML = '<div class="gallery-empty">Enter a directory path above</div>';
        return;
      }
      localStorage.setItem('gallery-dir-path', dirPath);
      resp = await fetch(`/api/gallery/dir?path=${encodeURIComponent(dirPath)}`);
    } else {
      resp = await fetch('/api/gallery');
    }

    const data = await resp.json();
    if (data.error) throw new Error(data.error);
    galleryImages = data.images || [];

    if (galleryImages.length === 0) {
      body.innerHTML = '<div class="gallery-empty">No images found</div>';
      return;
    }

    body.innerHTML = '';
    galleryImages.forEach((img, i) => {
      const thumb = document.createElement('div');
      thumb.className = 'gallery-thumb';
      thumb.innerHTML = `<img loading="lazy" src="${galleryImageSrc(img)}"><div class="gallery-name">${img.filename}</div>`;
      thumb.addEventListener('click', () => openGalleryLightbox(i));
      body.appendChild(thumb);
    });
  } catch (err) {
    body.innerHTML = `<div class="gallery-empty">Failed to load:<br>${err.message}</div>`;
  }
}

function openGalleryLightbox(index) {
  galleryLightboxIndex = index;
  showGalleryLightboxImage();
  document.getElementById('gallery-lightbox').classList.remove('hidden');
}

function closeGalleryLightbox() {
  document.getElementById('gallery-lightbox').classList.add('hidden');
  galleryLightboxIndex = -1;
}

function navigateGallery(dir) {
  if (galleryImages.length === 0) return;
  galleryLightboxIndex = (galleryLightboxIndex + dir + galleryImages.length) % galleryImages.length;
  showGalleryLightboxImage();
}

async function showGalleryLightboxImage() {
  const img = galleryImages[galleryLightboxIndex];
  if (!img) return;
  document.getElementById('gallery-lb-img').src = galleryImageSrc(img);
  document.getElementById('gallery-lb-title').textContent = `${img.filename}  (${galleryLightboxIndex + 1}/${galleryImages.length})`;

  // Fetch sidecar metadata
  const metaPanel = document.getElementById('gallery-lb-meta');
  metaPanel.style.display = 'none';
  metaPanel.innerHTML = '';

  try {
    const params = new URLSearchParams({ filename: img.filename });
    if (img.dirPath) params.set('dir', img.dirPath);
    const resp = await fetch(`/api/gallery/sidecar?${params}`);
    const meta = await resp.json();
    if (!meta) return;

    metaPanel.style.display = 'block';
    let html = '<div style="display:flex;flex-direction:column;gap:12px">';

    // Template & timestamp
    html += '<div>';
    if (meta.template) html += `<div style="color:#4a9eff;font-weight:600;margin-bottom:4px">${meta.template}</div>`;
    if (meta.timestamp) html += `<div style="color:#666;font-size:10px">${new Date(meta.timestamp).toLocaleString()}</div>`;
    html += '</div>';

    // Prompts
    if (meta.positive) {
      html += `<div><div style="color:#888;font-size:10px;text-transform:uppercase;margin-bottom:2px">Positive</div><div style="color:#ccc;line-height:1.4;word-break:break-word">${escapeHtml(meta.positive)}</div></div>`;
    }
    if (meta.negative) {
      html += `<div><div style="color:#888;font-size:10px;text-transform:uppercase;margin-bottom:2px">Negative</div><div style="color:#f44336;line-height:1.4;word-break:break-word">${escapeHtml(meta.negative)}</div></div>`;
    }

    // Seed
    html += `<div><span style="color:#888">Seed:</span> <span style="color:#4caf50;font-family:monospace">${meta.seed ?? '?'}</span></div>`;

    // Params
    if (meta.params && Object.keys(meta.params).length > 0) {
      html += '<div style="border-top:1px solid #333;padding-top:8px">';
      html += '<div style="color:#888;font-size:10px;text-transform:uppercase;margin-bottom:4px">Parameters</div>';
      for (const [key, val] of Object.entries(meta.params)) {
        if (key === 'positive' || key === 'negative') continue; // already shown above
        html += `<div style="display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid #222"><span style="color:#888">${key}</span><span style="color:#ccc;font-family:monospace;font-size:11px;text-align:right;max-width:140px;overflow:hidden;text-overflow:ellipsis">${escapeHtml(String(val))}</span></div>`;
      }
      html += '</div>';
    }

    // Reference images
    const refImages = Object.entries(meta).filter(([k]) => k.endsWith('_image') && meta[k]);
    if (refImages.length > 0) {
      html += '<div style="border-top:1px solid #333;padding-top:8px">';
      html += '<div style="color:#888;font-size:10px;text-transform:uppercase;margin-bottom:4px">Reference Images</div>';
      for (const [key, val] of refImages) {
        html += `<div style="padding:2px 0;color:#ccc">${key.replace('_image', '')}: ${escapeHtml(String(val))}</div>`;
      }
      html += '</div>';
    }

    html += '</div>';
    metaPanel.innerHTML = html;
  } catch {}
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function placeGalleryImage() {
  const img = galleryImages[galleryLightboxIndex];
  if (!img) return;

  const src = galleryImageSrc(img);
  const dims = await getImageDimensions(src);
  const pos = engine.canvasCenter();
  const id = engine.nextId();
  const node = new ImageNode(id, {
    imageUrl: src,
    filename: img.filename,
    comfyName: img.filename,
    width: dims.width,
    height: dims.height,
    format: img.filename.split('.').pop()?.toUpperCase() || 'PNG',
  });

  await node.createVisual(pos.x - 100, pos.y - 100);
  engine.register(node);

  closeGalleryLightbox();
  addLog(`Placed "${img.filename}" on canvas`, 'success');
}

// ── Save / Load ──────────────────────────────

async function saveCanvas() {
  const data = engine.serialize();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });

  // Use File System Access API for native save dialog if available
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'canvas-project.json',
        types: [{ description: 'JSON Files', accept: { 'application/json': ['.json'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      if (err.name === 'AbortError') return; // user cancelled
    }
  }

  // Fallback for browsers without File System Access API
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'canvas-project.json';
  a.click();
  URL.revokeObjectURL(url);
}

function loadCanvas() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const data = JSON.parse(text);
    await engine.deserialize(data);
  };
  input.click();
}
