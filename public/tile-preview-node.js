// TilePreviewNode — visual tile preview to check seamless tiling

class TilePreviewNode {
  constructor(id, opts = {}) {
    this.id = id;
    this.type = 'tile-preview';
    this.label = opts.label || '';
    this.gridSize = opts.gridSize || 3;
    this.connectedImage = opts.connectedImage || null; // { nodeId, imageUrl }
    this.fabricObject = null;
  }

  createVisual(x, y) {
    this._buildGroup(x, y, null);
  }

  // Build (or rebuild) the entire fabric group
  _buildGroup(x, y, previewDataUrl) {
    const w = 220;
    const headerH = 24;
    const previewSize = 200;
    const totalH = headerH + previewSize + 8;
    const canvas = this.fabricObject?.canvas;

    // Remove old group from canvas
    if (this.fabricObject && canvas) {
      canvas.remove(this.fabricObject);
    }

    const objects = [];

    // Background
    objects.push(new fabric.Rect({
      width: w, height: totalH,
      fill: '#1e1e3a', stroke: '#e6a817', strokeWidth: 1.5,
      rx: 8, ry: 8,
      originX: 'left', originY: 'top',
    }));

    // Header label
    objects.push(new fabric.Text('Tile Preview', {
      fontSize: 10, fill: '#e6a817', fontWeight: 'bold',
      fontFamily: 'Inter, sans-serif',
      left: 8, top: 5,
      originX: 'left', originY: 'top',
    }));

    // Input port (left side)
    objects.push(new fabric.Circle({
      radius: 6, fill: '#4a9eff', stroke: '#fff', strokeWidth: 2,
      left: -6, top: totalH / 2 - 6,
      originX: 'left', originY: 'top',
    }));

    // Preview area background
    objects.push(new fabric.Rect({
      width: previewSize, height: previewSize,
      fill: '#111',
      left: (w - previewSize) / 2, top: headerH,
      originX: 'left', originY: 'top',
    }));

    const finalize = (extraObjects) => {
      if (extraObjects) objects.push(...extraObjects);

      const group = new fabric.Group(objects, {
        left: x, top: y,
        hasControls: false, hasBorders: false,
      });

      group.nodeId = this.id;
      this.fabricObject = group;

      // Re-register on canvas if we had one
      if (canvas) {
        canvas.add(group);
        // Update the engine's node reference
        if (window._engine) {
          window._engine.nodes.set(this.id, this);
          window._engine._drawConnections();
        }
        canvas.renderAll();
      }
    };

    if (previewDataUrl) {
      // Add the pre-rendered tile preview image
      fabric.Image.fromURL(previewDataUrl, (fImg) => {
        fImg.set({
          left: (w - previewSize) / 2,
          top: headerH,
          originX: 'left', originY: 'top',
        });
        finalize([fImg]);
      });
    } else {
      // No preview — show placeholder
      objects.push(new fabric.Text('Connect an image\nto preview tiling', {
        fontSize: 11, fill: '#666', fontFamily: 'Inter, sans-serif',
        textAlign: 'center',
        left: w / 2, top: headerH + previewSize / 2 - 12,
        originX: 'center', originY: 'top',
      }));
      finalize();
    }
  }

  connectImage(nodeId, imageUrl) {
    this.connectedImage = { nodeId, imageUrl };
    this._renderTiles();
  }

  _renderTiles() {
    if (!this.connectedImage || !this.fabricObject) return;

    const previewSize = 200;
    const grid = this.gridSize;
    const pos = { x: this.fabricObject.left, y: this.fabricObject.top };

    // Load source image and render tiled grid to offscreen canvas
    const imgEl = new Image();
    imgEl.crossOrigin = 'anonymous';
    imgEl.onload = () => {
      const offscreen = document.createElement('canvas');
      offscreen.width = previewSize;
      offscreen.height = previewSize;
      const ctx = offscreen.getContext('2d');

      const tileW = previewSize / grid;
      const tileH = previewSize / grid;

      for (let row = 0; row < grid; row++) {
        for (let col = 0; col < grid; col++) {
          ctx.drawImage(imgEl, col * tileW, row * tileH, tileW, tileH);
        }
      }

      // Rebuild the group with the preview image
      this._buildGroup(pos.x, pos.y, offscreen.toDataURL('image/png'));
    };
    imgEl.onerror = () => {
      console.error('TilePreviewNode: failed to load image', this.connectedImage.imageUrl);
    };
    imgEl.src = this.connectedImage.imageUrl;
  }

  setGridSize(size) {
    this.gridSize = size;
    if (this.connectedImage) this._renderTiles();
  }

  serialize() {
    return {
      id: this.id,
      type: this.type,
      label: this.label,
      gridSize: this.gridSize,
      connectedImage: this.connectedImage,
      x: this.fabricObject?.left || 0,
      y: this.fabricObject?.top || 0,
    };
  }

  bindProperties() {
    const labelInput = document.getElementById('node-label');
    if (labelInput) {
      labelInput.addEventListener('input', () => {
        this.label = labelInput.value;
      });
    }

    // Connect image slot
    document.querySelector('[data-connect="image"]')?.addEventListener('click', () => {
      window._connectMode = { targetNodeId: this.id, connectType: 'tile-image', expects: 'image' };
      const slot = document.querySelector('[data-connect="image"]');
      if (slot) slot.textContent = '🔗 Click an image node...';
    });

    // Disconnect button
    document.querySelectorAll('.disconnect-btn').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (el.dataset.disconnect === 'image') {
          const oldConn = this.connectedImage;
          this.connectedImage = null;
          const pos = { x: this.fabricObject?.left || 0, y: this.fabricObject?.top || 0 };
          this._buildGroup(pos.x, pos.y, null);
          if (oldConn && window._engine) window._engine.removeConnectionBetween(oldConn.nodeId, this.id);
        }
        if (window._refreshProperties) window._refreshProperties(this);
      });
    });

    // Grid size buttons
    document.querySelectorAll('.grid-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setGridSize(parseInt(btn.dataset.grid));
        if (window._refreshProperties) window._refreshProperties(this);
      });
    });
  }

  renderProperties() {
    const imgStatus = this.connectedImage
      ? `<span style="color:#4caf50">✅ Connected</span> <button class="disconnect-btn" data-disconnect="image" style="font-size:10px;margin-left:6px;cursor:pointer;background:none;border:1px solid #666;color:#aaa;border-radius:4px;padding:1px 6px">✕</button>`
      : `🔗 Click to select image...`;

    return `
      <div class="prop-section">
        <label class="prop-section-label">Label</label>
        <input type="text" id="node-label" class="prop-input" value="${this.label}" placeholder="e.g. Brick Tile Check">
      </div>
      <div class="prop-section">
        <label class="prop-section-label">📷 Source Image</label>
        <div class="workflow-input-slot" data-connect="image" data-expects="image" style="cursor:pointer">
          ${imgStatus}
        </div>
      </div>
      <div class="prop-section">
        <label class="prop-section-label">Grid Size</label>
        <div style="display:flex;gap:8px;margin-top:4px">
          <button class="prop-btn grid-btn ${this.gridSize === 2 ? 'active' : ''}" data-grid="2">2×2</button>
          <button class="prop-btn grid-btn ${this.gridSize === 3 ? 'active' : ''}" data-grid="3">3×3</button>
          <button class="prop-btn grid-btn ${this.gridSize === 4 ? 'active' : ''}" data-grid="4">4×4</button>
        </div>
      </div>
    `;
  }
}
