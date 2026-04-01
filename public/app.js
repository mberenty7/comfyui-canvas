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
  addMenu.querySelector('[data-action="inpaint"]').addEventListener('click', () => { addMenu.classList.add('hidden'); addInpaintNode(); });
  addMenu.querySelector('[data-action="model"]').addEventListener('click', () => { addMenu.classList.add('hidden'); importModel(); });
  addMenu.querySelector('[data-action="viewer"]').addEventListener('click', () => { addMenu.classList.add('hidden'); addViewerNode(); });
  addMenu.querySelector('[data-action="generate"]').addEventListener('click', () => { addMenu.classList.add('hidden'); addGenerateNode(); });
  addMenu.querySelector('[data-action="tile-preview"]').addEventListener('click', () => { addMenu.classList.add('hidden'); addTilePreviewNode(); });
  addMenu.querySelector('[data-action="group-box"]').addEventListener('click', () => { addMenu.classList.add('hidden'); addGroupBox(); });

  document.getElementById('btn-log').addEventListener('click', toggleLog);
  document.getElementById('log-close').addEventListener('click', () => document.getElementById('log-panel').classList.add('hidden'));
  document.getElementById('log-clear').addEventListener('click', () => document.getElementById('log-body').innerHTML = '');

  document.getElementById('btn-save').addEventListener('click', saveCanvas);
  document.getElementById('btn-load').addEventListener('click', loadCanvas);
  document.getElementById('btn-settings').addEventListener('click', openSettings);

  // Connection banner controls
  document.getElementById("connection-banner-settings").addEventListener("click", openSettings);
  document.getElementById("connection-banner-retry").addEventListener("click", checkComfyStatus);
  document.getElementById("connection-banner-dismiss").addEventListener("click", () => document.getElementById("connection-banner").classList.add("hidden"));
  document.getElementById("comfy-status").addEventListener("click", openSettings);
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

  // Expose engine for disconnect handlers
  window._engine = engine;
  window._refreshProperties = (node) => {
    showProperties(node);
    if (node.bindProperties) node.bindProperties();
  };

  // Mask Editor
  window._maskEditor = new MaskEditor();
  window._tileViewer = new TileViewer();

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

  // Prompt Library
  document.getElementById('btn-prompts').addEventListener('click', togglePromptLibrary);
  document.getElementById('prompts-close').addEventListener('click', () => document.getElementById('prompts-panel').classList.add('hidden'));
  document.getElementById('prompts-refresh').addEventListener('click', loadPromptLibrary);
  document.getElementById('prompts-filter').addEventListener('input', filterPromptLibrary);

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

  // Auto-restore from localStorage
  try {
    const saved = localStorage.getItem('comfyui-canvas-autosave');
    if (saved) {
      const data = JSON.parse(saved);
      engine.deserialize(data).then(() => {
        if (window.addLog) window.addLog('Canvas restored from autosave', 'info');
      }).catch(err => {
        console.error('Autosave restore failed:', err);
        if (window.addLog) window.addLog(`Autosave restore failed: ${err.message}`, 'error');
      });
    }
  } catch (e) {
    console.error('Failed to parse autosave:', e);
  }

  // Autosave on changes (debounced)
  let autosaveTimer = null;
  function scheduleAutosave() {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      try {
        const data = engine.serialize();
        localStorage.setItem('comfyui-canvas-autosave', JSON.stringify(data));
      } catch (e) {
        console.warn('Autosave failed:', e);
      }
    }, 1000);
  }
  engine.fc.on('object:modified', scheduleAutosave);
  engine.fc.on('object:added', scheduleAutosave);
  engine.fc.on('object:removed', scheduleAutosave);
  window._scheduleAutosave = scheduleAutosave;

  // Periodic autosave every 10s as catch-all for property changes
  setInterval(scheduleAutosave, 10000);
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
  const banner = document.getElementById('connection-banner');
  const bannerText = document.getElementById('connection-banner-text');
  try {
    const configResp = await fetch('/api/config');
    const cfg = await configResp.json();
    const comfyUrl = cfg.comfyUrl || 'http://localhost:8188';

    const resp = await fetch('/api/comfy/status');
    const data = await resp.json();
    dot.classList.toggle('connected', data.connected);
    dot.classList.toggle('disconnected', !data.connected);

    if (data.connected) {
      dot.title = 'ComfyUI connected — ' + comfyUrl;
      banner.classList.add('hidden');
    } else {
      dot.title = 'ComfyUI disconnected — ' + comfyUrl;
      bannerText.textContent = '⚠️ Cannot reach ComfyUI at ' + comfyUrl;
      banner.classList.remove('hidden');
    }
  } catch {
    dot.classList.add('disconnected');
    dot.classList.remove('connected');
    dot.title = 'ComfyUI disconnected';
    bannerText.textContent = '⚠️ Cannot reach ComfyUI — check Settings';
    banner.classList.remove('hidden');
  }
}












}

// ── Settings ─────────────────────────────────

async function openSettings() {
  const modal = document.getElementById('settings-modal');
  const urlInput = document.getElementById('settings-comfy-url');

  const dirInput = document.getElementById('settings-output-dir');

  const apiKeyInput = document.getElementById('settings-api-key');
  const bflKeyInput = document.getElementById('settings-bfl-key');

  const resp = await fetch('/api/config');
  const config = await resp.json();
  urlInput.value = config.comfyUrl || '';
  dirInput.value = config.outputDir || '';
  apiKeyInput.value = config.comfyApiKey || '';
  bflKeyInput.value = config.bflApiKey || '';

  modal.classList.remove('hidden');

  document.getElementById('settings-save').onclick = async () => {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comfyUrl: urlInput.value, outputDir: dirInput.value, comfyApiKey: apiKeyInput.value, bflApiKey: bflKeyInput.value }),
    });
    modal.classList.add('hidden');
    checkComfyStatus();
  };

  document.getElementById('settings-cancel').onclick = () => modal.classList.add('hidden');


  // Test Connection button
  document.getElementById("settings-test-connection").onclick = async () => {
    const result = document.getElementById("settings-connection-result");
    const testUrl = urlInput.value.trim();
    if (!testUrl) { result.textContent = "❌ Enter a URL first"; result.style.color = "#ff4444"; return; }
    result.textContent = "Testing..."; result.style.color = "#888";
    try {
      // Save temporarily to test
      await fetch("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ comfyUrl: testUrl }) });
      const resp = await fetch("/api/comfy/status");
      const data = await resp.json();
      if (data.connected) {
        result.textContent = "✅ Connected! ComfyUI v" + (data.system?.comfyui_version || "unknown");
        result.style.color = "#44ff44";
      } else {
        result.textContent = "❌ Cannot reach ComfyUI at " + testUrl;
        result.style.color = "#ff4444";
      }
    } catch (e) {
      result.textContent = "❌ Connection failed: " + e.message;
      result.style.color = "#ff4444";
    }
  };
  document.getElementById('settings-check-credits').onclick = () => {
    window.open('https://platform.comfy.org/login', '_blank');
    document.getElementById('settings-credit-result').textContent = 'Check balance on Comfy platform →';
  };
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

  // Upload locally first (always works)
  const resp = await fetch('/api/upload', { method: 'POST', body: formData });
  const result = await resp.json();
  if (result.error) { alert('Upload failed: ' + result.error); return; }

  const dims = await getImageDimensions(result.path);

  const pos = screenX !== undefined
    ? engine.screenToCanvas(screenX, screenY)
    : engine.canvasCenter();

  const id = engine.nextId();
  const node = new ImageNode(id, {
    imageUrl: result.path,
    filename: result.originalName || file.name,
    comfyName: result.filename, // will be re-uploaded to ComfyUI at generate time
    width: dims.width,
    height: dims.height,
    fileSize: file.size,
    format: file.type.split('/')[1]?.toUpperCase() || '?',
    needsComfyUpload: true,
  });

  await node.createVisual(pos.x - 100, pos.y - 100);
  engine.register(node);

  // Try to upload to ComfyUI in background (non-blocking)
  try {
    const comfyForm = new FormData();
    comfyForm.append('image', file);
    const comfyResp = await fetch('/api/comfy/upload', { method: 'POST', body: comfyForm });
    const comfyResult = await comfyResp.json();
    if (comfyResult.comfyName) {
      node.comfyName = comfyResult.comfyName;
      node.needsComfyUpload = false;
    }
  } catch {
    // ComfyUI not available — will upload when generating
    console.log('ComfyUI not available, image will be uploaded at generate time');
  }
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
    if (targetNode.connectInput) {
      targetNode.connectInput(mode.inputName, sourceNode.id);
    }
    connected = true;
  } else if (mode.connectType === 'tile-image' && sourceNode.type === 'image') {
    // Tile preview → image input
    targetNode.connectImage(sourceNode.id, sourceNode.imageUrl);
    connected = true;
  } else if (mode.expects === 'image' && sourceNode.type === 'image') {
    // Workflow or Inpaint node → image input
    if (targetNode.type === 'inpaint') {
      targetNode.connectedImage = { nodeId: sourceNode.id };
    } else if (targetNode.connectInput) {
      targetNode.connectInput(mode.inputName, sourceNode.id);
    }
    connected = true;
  } else if (mode.expects === 'image' && sourceNode.type === 'inpaint') {
    // Workflow node → inpaint node as image+mask+prompt source
    if (targetNode.connectInput) {
      targetNode.connectInput(mode.inputName, sourceNode.id);
    }
    connected = true;
  } else if (mode.expects === 'image' && sourceNode.type === 'model') {
    // Workflow node → 3D model captures
    if (targetNode.connectInput) {
      targetNode.connectInput(mode.inputName, sourceNode.id);
    }
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

    if ((e.key === 'Delete' || e.key === 'Backspace')) {
      // Multi-select delete
      const activeObj = engine.fc.getActiveObject();
      if (activeObj && activeObj.type === 'activeSelection') {
        const objects = activeObj.getObjects();
        const nodeIds = objects.map(o => { while (o && !o.nodeId && o.group) o = o.group; return o?.nodeId; }).filter(Boolean);
        engine.fc.discardActiveObject();
        nodeIds.forEach(id => deleteNode(id));
      } else if (engine.selectedNode) {
        deleteNode(engine.selectedNode.id);
      }
    }

    // Ctrl+D to duplicate selected node
    if (e.key === 'd' && (e.ctrlKey || e.metaKey) && engine.selectedNode) {
      e.preventDefault();
      duplicateNode(engine.selectedNode.id);
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
      else if (action === 'inpaint') addInpaintNode();
      else if (action === 'model') importModel();
      else if (action === 'viewer') addViewerNode();
      else if (action === 'generate') addGenerateNode();
      else if (action === 'tile-preview') addTilePreviewNode();
      else if (action === 'group-box') addGroupBox();
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
  if (window._scheduleAutosave) window._scheduleAutosave();
}

async function duplicateNode(nodeId) {
  const node = engine.nodes.get(nodeId);
  if (!node || !node.serialize) return;
  const data = node.serialize();
  const newId = engine.nextId();
  const offsetX = 30, offsetY = 30;

  if (data.type === 'image') {
    const n = new ImageNode(newId, {
      imageUrl: data.imageUrl, filename: data.filename, comfyName: data.comfyName,
      width: data.width, height: data.height, fileSize: data.fileSize,
      format: data.format, label: data.label, maskComfyName: data.maskComfyName,
    });
    await n.createVisual(data.x + offsetX, data.y + offsetY);
    engine.register(n);
  } else if (data.type === 'prompt') {
    const n = new PromptNode(newId, {
      positive: data.positive, negative: data.negative, label: data.label,
    });
    n.createVisual(data.x + offsetX, data.y + offsetY);
    engine.register(n);
  } else if (data.type === 'workflow') {
    const n = new WorkflowNode(newId, {
      templateId: data.templateId, templateName: data.templateName,
      templateColor: data.templateColor, inputs: data.inputs,
      params: data.params, workflow: data.workflow, label: data.label,
      backend: data.backend, bflEndpoint: data.bflEndpoint,
      cost: data.cost,
    });
    if (data.paramValues) n.paramValues = { ...data.paramValues };
    n.createVisual(data.x + offsetX, data.y + offsetY);
    engine.register(n);
  } else if (data.type === 'generate') {
    const n = new GenerateNode(newId, {
      count: data.count, seedMode: data.seedMode, baseSeed: data.baseSeed,
      outputName: data.outputName, label: data.label,
    });
    n.createVisual(data.x + offsetX, data.y + offsetY);
    engine.register(n);
  } else if (data.type === 'inpaint') {
    const n = new InpaintNode(newId, { label: data.label });
    n.createVisual(data.x + offsetX, data.y + offsetY);
    engine.register(n);
  } else if (data.type === 'viewer') {
    const n = new ViewerNode(newId, { label: data.label });
    n.createVisual(data.x + offsetX, data.y + offsetY);
    engine.register(n);
  } else if (data.type === 'model') {
    const n = new ModelNode(newId, {
      modelUrl: data.modelUrl, filename: data.filename,
      comfyName: data.comfyName, format: data.format,
      fileSize: data.fileSize, label: data.label,
    });
    n.createVisual(data.x + offsetX, data.y + offsetY);
    engine.register(n);
  }
  if (window._scheduleAutosave) window._scheduleAutosave();
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
      <h4 style="color:${t.color || '#4a9eff'}">${t.name}${t.cost && t.cost.credits > 0 ? ' <span style="font-size:11px;color:#ff9800;font-weight:normal">~$' + (t.cost.credits / 211).toFixed(2) + '</span>' : t.cost ? '' : ''}</h4>
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
        backend: template.backend || 'comfy',
        bflEndpoint: template.bfl_endpoint || '',
        cost: template.cost || null,
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

function addGroupBox() {
  const pos = engine.canvasCenter();
  const id = engine.nextId();
  const group = new GroupBox(id);
  group.createVisual(pos.x - 200, pos.y - 150);
  engine.register(group);
  engine.fc.sendToBack(group.fabricObject);
}

function addTilePreviewNode() {
  const pos = engine.canvasCenter();
  const id = engine.nextId();
  const node = new TilePreviewNode(id);
  node.createVisual(pos.x - 110, pos.y - 120);
  engine.register(node);
}


function addInpaintNode() {
  const pos = engine.canvasCenter();
  const id = engine.nextId();
  const node = new InpaintNode(id);
  node.createVisual(pos.x - 80, pos.y - 40);
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
      // Handle 3D mesh outputs — open in viewer
      if (result.type === '3d' && result.meshUrl) {
        addLog(`3D model ready: ${result.meshFilename}`, 'success');
        if (window._viewer3d) {
          try {
            window._viewer3d.open(result.meshUrl, result.meshFilename);
          } catch (err) {
            addLog(`3D viewer error (model saved to output): ${err.message}`, 'warn');
          }
        }
        continue;
      }
      const dims = await getImageDimensions(result.imageUrl);
      // Re-upload generated image to ComfyUI input so it can be used as input to other nodes
      let comfyName = result.comfyName;
      try {
        const imgBlob = await (await fetch(result.imageUrl)).blob();
        const upForm = new FormData();
        upForm.append('image', imgBlob, result.comfyName);
        const upResp = await fetch('/api/comfy/upload', { method: 'POST', body: upForm });
        const upResult = await upResp.json();
        if (upResult.comfyName) comfyName = upResult.comfyName;
      } catch (err) { console.warn('Failed to re-upload generated image:', err); }
      const id = engine.nextId();
      const imgNode = new ImageNode(id, {
        imageUrl: result.imageUrl,
        filename: result.comfyName,
        comfyName: comfyName,
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

// ── Prompt Library ───────────────────────────

let allPrompts = [];

function togglePromptLibrary() {
  const panel = document.getElementById('prompts-panel');
  // Close gallery if open
  document.getElementById('gallery-panel').classList.add('hidden');
  const wasHidden = panel.classList.contains('hidden');
  panel.classList.toggle('hidden');
  if (wasHidden) loadPromptLibrary();
}

async function loadPromptLibrary() {
  const body = document.getElementById('prompts-body');
  body.innerHTML = '<div class="prompts-empty">Loading...</div>';

  try {
    const resp = await fetch('/api/prompts');
    const data = await resp.json();
    allPrompts = data.prompts || [];

    if (allPrompts.length === 0) {
      body.innerHTML = '<div class="prompts-empty">No saved prompts yet.<br>Select a Prompt node and click "Save to Library"</div>';
      return;
    }

    renderPromptCards(allPrompts);
  } catch (err) {
    body.innerHTML = `<div class="prompts-empty">Failed to load:<br>${err.message}</div>`;
  }
}

function filterPromptLibrary() {
  const query = document.getElementById('prompts-filter').value.toLowerCase();
  if (!query) {
    renderPromptCards(allPrompts);
    return;
  }
  const filtered = allPrompts.filter(p => {
    const haystack = [p.name, p.positive, p.negative, ...(p.tags || [])].join(' ').toLowerCase();
    return haystack.includes(query);
  });
  renderPromptCards(filtered);
}

function renderPromptCards(prompts) {
  const body = document.getElementById('prompts-body');
  body.innerHTML = '';

  if (prompts.length === 0) {
    body.innerHTML = '<div class="prompts-empty">No matching prompts</div>';
    return;
  }

  for (const p of prompts) {
    const card = document.createElement('div');
    card.className = 'prompt-card';

    let html = `<div class="prompt-card-name">${escapeHtml(p.name)}</div>`;
    if (p.positive) html += `<div class="prompt-card-text">${escapeHtml(p.positive)}</div>`;
    if (p.negative) html += `<div class="prompt-card-neg">⛔ ${escapeHtml(p.negative)}</div>`;

    html += `<div class="prompt-card-footer">`;
    if (p.modified) {
      html += `<span class="prompt-card-date">${new Date(p.modified).toLocaleDateString()}</span>`;
    } else {
      html += `<span></span>`;
    }
    html += `<div class="prompt-card-actions">
      <button class="prompt-card-btn place-btn" title="Place on canvas">📌 Place</button>
      <button class="prompt-card-btn delete prompt-delete-btn" title="Delete">🗑</button>
    </div>`;
    html += `</div>`;

    card.innerHTML = html;

    // Place on canvas
    card.querySelector('.place-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      placePromptFromLibrary(p);
    });

    // Also place on card click (whole card)
    card.addEventListener('click', () => placePromptFromLibrary(p));

    // Delete
    card.querySelector('.prompt-delete-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Delete prompt "${p.name}"?`)) return;
      try {
        await fetch(`/api/prompts/${encodeURIComponent(p.filename)}`, { method: 'DELETE' });
        loadPromptLibrary();
        addLog(`Deleted prompt "${p.name}"`, 'info');
      } catch (err) {
        alert('Failed to delete: ' + err.message);
      }
    });

    body.appendChild(card);
  }
}

function placePromptFromLibrary(p) {
  const pos = engine.canvasCenter();
  const id = engine.nextId();
  const node = new PromptNode(id, {
    positive: p.positive,
    negative: p.negative,
    label: p.name,
  });
  node.createVisual(pos.x - 80, pos.y - 25);
  engine.register(node);
  addLog(`Placed prompt "${p.name}" on canvas`, 'success');
}

// ── Gallery ──────────────────────────────────

let galleryImages = [];
let galleryLightboxIndex = -1;

function toggleGallery() {
  const panel = document.getElementById('gallery-panel');
  // Close prompt library if open
  document.getElementById('prompts-panel').classList.add('hidden');
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
    const grid = document.createElement('div');
    grid.id = 'gallery-grid';
    galleryImages.forEach((img, i) => {
      const thumb = document.createElement('div');
      thumb.className = 'gallery-thumb';
      thumb.innerHTML = `<img loading="lazy" src="${galleryImageSrc(img)}"><div class="gallery-name">${img.filename}</div>`;
      thumb.addEventListener('click', () => openGalleryLightbox(i));
      grid.appendChild(thumb);
    });
    body.appendChild(grid);
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

  // Fetch the image and re-upload to ComfyUI's input so it can be used as a reference
  let comfyName = img.filename;
  try {
    const imgResp = await fetch(src);
    const blob = await imgResp.blob();
    const file = new File([blob], img.filename, { type: blob.type });
    const formData = new FormData();
    formData.append('image', file);
    const uploadResp = await fetch('/api/comfy/upload', { method: 'POST', body: formData });
    const uploadResult = await uploadResp.json();
    if (uploadResult.comfyName) comfyName = uploadResult.comfyName;
  } catch (err) {
    console.warn('Failed to upload gallery image to ComfyUI:', err);
  }

  const pos = engine.canvasCenter();
  const id = engine.nextId();
  const node = new ImageNode(id, {
    imageUrl: src,
    filename: img.filename,
    comfyName: comfyName,
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
