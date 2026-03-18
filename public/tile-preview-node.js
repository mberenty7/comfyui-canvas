// TilePreviewNode — connects to an image, opens tile viewer modal

class TilePreviewNode {
  constructor(id, opts = {}) {
    this.id = id;
    this.type = 'tile-preview';
    this.label = opts.label || '';
    this.gridSize = opts.gridSize || 3;
    this.connectedImage = opts.connectedImage || null; // { nodeId }
    this.fabricObject = null;
  }

  createVisual(x, y) {
    const width = 160;
    const height = 60;

    const bg = new fabric.Rect({
      width, height,
      fill: '#1e1e3a', stroke: '#e6a817', strokeWidth: 1.5,
      rx: 8, ry: 8,
    });

    const typeLabel = new fabric.Text('Tile Preview', {
      fontSize: 10, fill: '#e6a817', fontWeight: 'bold',
      fontFamily: 'Inter, sans-serif',
      left: 8, top: 4,
    });

    const userLabel = new fabric.Text(this.label || '', {
      fontSize: 10, fill: '#aaa', fontFamily: 'Inter, sans-serif',
      left: 8, top: height - 16,
    });

    const statusText = new fabric.Text(
      this.connectedImage ? '✅ Image connected' : 'No image', {
      fontSize: 9, fill: '#666', fontFamily: 'monospace',
      left: 8, top: 22,
    });

    // Input port (left)
    const imgPort = new fabric.Circle({
      radius: 5, fill: '#4a9eff', stroke: '#fff', strokeWidth: 1.5,
      left: -5, top: height / 2 - 5,
    });

    const group = new fabric.Group(
      [bg, typeLabel, userLabel, statusText, imgPort],
      { left: x, top: y, hasControls: false, hasBorders: false }
    );

    group.nodeId = this.id;
    this.fabricObject = group;
    return this;
  }

  updateLabel(text) {
    this.label = text;
    if (this.fabricObject) {
      const labelObj = this.fabricObject._objects[2];
      if (labelObj) { labelObj.set('text', text); this.fabricObject.canvas?.renderAll(); }
    }
  }

  _updateStatus(text) {
    if (this.fabricObject) {
      const statusObj = this.fabricObject._objects[3];
      if (statusObj) { statusObj.set('text', text); this.fabricObject.canvas?.renderAll(); }
    }
  }

  connectImage(nodeId, imageUrl) {
    this.connectedImage = { nodeId };
    this._updateStatus('✅ Image connected');
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

  renderProperties() {
    const imgStatus = this.connectedImage ? '✅ Connected' : 'Click to connect an image node';

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
        ${this.connectedImage ? `<button class="prop-btn disconnect-btn" data-disconnect="image" style="margin-top:4px;font-size:11px;padding:4px 8px;width:100%">✂️ Disconnect</button>` : ''}
      </div>
      <div class="prop-section">
        <label class="prop-section-label">🔲 Preview</label>
        <button id="btn-open-tile-viewer" class="generate-btn" style="width:100%;font-size:12px;padding:8px" ${!this.connectedImage ? 'disabled title="Connect an image first"' : ''}>
          🔲 Open Tile Viewer
        </button>
      </div>
    `;
  }

  bindProperties() {
    const labelInput = document.getElementById('node-label');
    if (labelInput) labelInput.addEventListener('input', () => this.updateLabel(labelInput.value));

    // Connect image slot
    document.querySelector('[data-connect="image"]')?.addEventListener('click', () => {
      window._connectMode = { targetNodeId: this.id, connectType: 'tile-image', expects: 'image' };
      document.querySelector('[data-connect="image"]').textContent = '🔗 Click an image node...';
    });

    // Disconnect
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

    // Open tile viewer
    document.getElementById('btn-open-tile-viewer')?.addEventListener('click', () => {
      if (!this.connectedImage || !window._engine) return;
      const imgNode = window._engine.nodes.get(this.connectedImage.nodeId);
      if (!imgNode || !imgNode.imageUrl) return;

      if (window._tileViewer) {
        window._tileViewer.open(imgNode.imageUrl, this.gridSize, (newGridSize) => {
          this.gridSize = newGridSize;
        });
      }
    });
  }
}
