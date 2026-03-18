// TilePreviewNode — visual tile preview to check seamless tiling

class TilePreviewNode {
  constructor(id, opts = {}) {
    this.id = id;
    this.type = 'tile-preview';
    this.label = opts.label || '';
    this.gridSize = opts.gridSize || 3;
    this.connectedImage = opts.connectedImage || null; // { nodeId, imageUrl }
    this.fabricObject = null;
    this._previewImg = null; // fabric.Image for the tiled preview
  }

  createVisual(x, y) {
    const w = 220;
    const headerH = 24;
    const previewH = 200;
    const totalH = headerH + previewH + 8;

    const border = new fabric.Rect({
      width: w, height: totalH,
      fill: '#1e1e3a', stroke: '#e6a817', strokeWidth: 1.5,
      rx: 8, ry: 8,
      originX: 'left', originY: 'top',
    });

    const typeLabel = new fabric.Text('Tile Preview', {
      fontSize: 10, fill: '#e6a817', fontWeight: 'bold',
      fontFamily: 'Inter, sans-serif',
      left: 8, top: 5,
      originX: 'left', originY: 'top',
    });

    // Input port (left side)
    const inputPort = new fabric.Circle({
      radius: 6, fill: '#4a9eff', stroke: '#fff', strokeWidth: 2,
      left: -6, top: totalH / 2 - 6,
      originX: 'left', originY: 'top',
    });

    // Placeholder text
    this._placeholder = new fabric.Text('Connect an image\nto preview tiling', {
      fontSize: 11, fill: '#666', fontFamily: 'Inter, sans-serif',
      textAlign: 'center',
      left: w / 2, top: headerH + previewH / 2 - 12,
      originX: 'center', originY: 'top',
    });

    // Preview background
    const previewBg = new fabric.Rect({
      width: previewH, height: previewH,
      fill: '#111',
      left: (w - previewH) / 2, top: headerH,
      originX: 'left', originY: 'top',
    });

    const objects = [border, typeLabel, inputPort, previewBg, this._placeholder];

    const group = new fabric.Group(objects, {
      left: x, top: y,
      hasControls: false, hasBorders: false,
      subTargetCheck: false,
    });

    group.nodeId = this.id;
    this.fabricObject = group;

    if (this.connectedImage) {
      this._renderTiles();
    }
  }

  connectImage(nodeId, imageUrl) {
    this.connectedImage = { nodeId, imageUrl };
    this._renderTiles();
  }

  _renderTiles() {
    if (!this.connectedImage || !this.fabricObject) return;

    const group = this.fabricObject;
    const canvas = group.canvas;
    const nodeW = 220;
    const headerH = 24;
    const previewSize = 200;
    const grid = this.gridSize;

    // Load the source image
    const imgEl = new Image();
    imgEl.crossOrigin = 'anonymous';
    imgEl.onload = () => {
      // Render tiled grid to an offscreen canvas
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

      // Remove old preview image from group
      if (this._previewImg) {
        group.removeWithUpdate(this._previewImg);
        this._previewImg = null;
      }

      // Hide placeholder
      if (this._placeholder) {
        this._placeholder.set({ visible: false });
      }

      // Create fabric image from the offscreen canvas
      const dataUrl = offscreen.toDataURL('image/png');
      fabric.Image.fromURL(dataUrl, (fImg) => {
        fImg.set({
          left: (nodeW - previewSize) / 2,
          top: headerH,
          originX: 'left',
          originY: 'top',
          selectable: false,
          evented: false,
        });

        this._previewImg = fImg;
        group.addWithUpdate(fImg);

        if (canvas) canvas.renderAll();
      });
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
          // Remove preview
          if (this._previewImg && this.fabricObject) {
            this.fabricObject.removeWithUpdate(this._previewImg);
            this._previewImg = null;
          }
          // Show placeholder again
          if (this._placeholder) {
            this._placeholder.set({ visible: true });
            this.fabricObject?.canvas?.renderAll();
          }
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
