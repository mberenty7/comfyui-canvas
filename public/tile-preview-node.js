// TilePreviewNode — visual tile preview to check seamless tiling

class TilePreviewNode {
  constructor(id, opts = {}) {
    this.id = id;
    this.type = 'tile-preview';
    this.label = opts.label || '';
    this.gridSize = opts.gridSize || 3; // 2 or 3
    this.connectedImage = opts.connectedImage || null; // { nodeId, imageUrl }
    this.fabricObject = null;
    this._tileGroup = null;
  }

  createVisual(x, y) {
    const w = 220;
    const headerH = 24;
    const previewH = 200;
    const footerH = 8;
    const totalH = headerH + previewH + footerH;

    const border = new fabric.Rect({
      width: w, height: totalH,
      fill: '#1e1e3a', stroke: '#e6a817', strokeWidth: 1.5,
      rx: 8, ry: 8,
    });

    const typeLabel = new fabric.Text('🔲 Tile Preview', {
      fontSize: 11, fill: '#e6a817', fontWeight: 'bold',
      fontFamily: 'Inter, sans-serif', left: 8, top: 5,
    });

    // Input port (left side)
    const inputPort = new fabric.Circle({
      radius: 6, fill: '#4a9eff', stroke: '#fff', strokeWidth: 2,
      left: -6, top: totalH / 2 - 6,
    });

    // Placeholder text when no image connected
    const placeholder = new fabric.Text('Connect an image\nto preview tiling', {
      fontSize: 11, fill: '#666', fontFamily: 'Inter, sans-serif',
      textAlign: 'center', left: w / 2, top: headerH + previewH / 2 - 12,
      originX: 'center',
    });

    const group = new fabric.Group([border, typeLabel, inputPort, placeholder], {
      left: x, top: y,
      hasControls: false, hasBorders: false,
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
    const w = 220;
    const headerH = 24;
    const previewH = 200;
    const grid = this.gridSize;

    // Remove old tile group and placeholder
    if (this._tileGroup) {
      const idx = group._objects.indexOf(this._tileGroup);
      if (idx >= 0) group._objects.splice(idx, 1);
      this._tileGroup = null;
    }
    // Remove placeholder text (index 3)
    const placeholder = group._objects.find(o => o.type === 'text' && o.text?.includes('Connect'));
    if (placeholder) {
      const idx = group._objects.indexOf(placeholder);
      if (idx >= 0) group._objects.splice(idx, 1);
    }

    fabric.Image.fromURL(this.connectedImage.imageUrl, (img) => {
      const tileSize = previewH / grid;
      const scale = tileSize / Math.max(img.width, img.height);
      const tileW = img.width * scale;
      const tileH = img.height * scale;

      const tiles = [];
      // Clip rect for the preview area
      const clipRect = new fabric.Rect({
        width: previewH, height: previewH,
        fill: '#111', left: (w - previewH) / 2, top: headerH,
      });
      tiles.push(clipRect);

      const offsetX = (w - previewH) / 2;
      let loaded = 0;
      const total = grid * grid;

      for (let row = 0; row < grid; row++) {
        for (let col = 0; col < grid; col++) {
          fabric.Image.fromURL(this.connectedImage.imageUrl, (tileImg) => {
            tileImg.scale(scale);
            tileImg.set({
              left: offsetX + col * tileW,
              top: headerH + row * tileH,
              originX: 'left', originY: 'top',
            });
            tiles.push(tileImg);
            loaded++;

            if (loaded === total) {
              const tileGroup = new fabric.Group(tiles, {
                left: 0, top: 0,
                originX: 'left', originY: 'top',
              });
              this._tileGroup = tileGroup;
              group.addWithUpdate(tileGroup);
              if (canvas) canvas.renderAll();
            }
          }, { crossOrigin: 'anonymous' });
        }
      }
    }, { crossOrigin: 'anonymous' });
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
  }

  renderProperties() {
    const connected = this.connectedImage
      ? `<span class="prop-value" style="color:#4caf50">Connected</span>`
      : `<button class="prop-btn" onclick="window._connectTileImage(${this.id})">Select Image</button>`;

    return `
      <div class="prop-section">
        <label class="prop-section-label">Label</label>
        <input type="text" id="node-label" class="prop-input" value="${this.label}" placeholder="e.g. Brick Tile Check">
      </div>
      <div class="prop-row">
        <span class="prop-label">Image Input</span>
        ${connected}
      </div>
      <div class="prop-section">
        <label class="prop-section-label">Grid Size</label>
        <div style="display:flex;gap:8px;margin-top:4px">
          <button class="prop-btn ${this.gridSize === 2 ? 'active' : ''}" onclick="window._setTileGrid(2)">2×2</button>
          <button class="prop-btn ${this.gridSize === 3 ? 'active' : ''}" onclick="window._setTileGrid(3)">3×3</button>
          <button class="prop-btn ${this.gridSize === 4 ? 'active' : ''}" onclick="window._setTileGrid(4)">4×4</button>
        </div>
      </div>
    `;
  }
}
