// ViewerNode — opens the 3D viewer modal
// Accepts a ModelNode as input, captures create ImageNodes

class ViewerNode {
  constructor(id, { label } = {}) {
    this.id = id;
    this.type = 'viewer';
    this.label = label || '';
    this.connectedModel = null; // { nodeId }
    this.fabricObject = null;
  }

  createVisual(x, y) {
    const width = 180;
    const height = 70;

    const bg = new fabric.Rect({
      width, height,
      fill: '#1e1e3a',
      stroke: '#e94560',
      strokeWidth: 1.5,
      rx: 8, ry: 8,
    });

    const typeLabel = new fabric.Text('3D Viewer', {
      fontSize: 10,
      fill: '#e94560',
      fontWeight: 'bold',
      fontFamily: 'Inter, sans-serif',
      left: 8, top: 4,
    });

    const icon = new fabric.Text('👁', {
      fontSize: 20,
      left: 8, top: 22,
    });

    const statusLabel = new fabric.Text('No model connected', {
      fontSize: 10,
      fill: '#666',
      fontFamily: 'Inter, sans-serif',
      left: 38, top: 28,
    });

    const userLabel = new fabric.Text(this.label || '', {
      fontSize: 10,
      fill: '#aaa',
      fontFamily: 'Inter, sans-serif',
      left: 8, top: height - 16,
    });

    // Input port (left) — accepts model
    const inputPort = new fabric.Circle({
      radius: 5,
      fill: '#e94560',
      stroke: '#fff',
      strokeWidth: 1.5,
      left: -5, top: height / 2 - 5,
    });

    const inputLabel = new fabric.Text('model', {
      fontSize: 9,
      fill: '#666',
      fontFamily: 'monospace',
      left: 10, top: height / 2 - 3,
    });

    const group = new fabric.Group([bg, typeLabel, icon, statusLabel, userLabel, inputPort, inputLabel], {
      left: x, top: y,
      hasControls: false,
      hasBorders: false,
    });

    group.nodeId = this.id;
    this.fabricObject = group;
    return this;
  }

  _updateStatus(text) {
    if (this.fabricObject) {
      const statusObj = this.fabricObject._objects[3];
      if (statusObj) { statusObj.set('text', text); this.fabricObject.canvas?.renderAll(); }
    }
  }

  updateLabel(text) {
    this.label = text;
    if (this.fabricObject) {
      const labelObj = this.fabricObject._objects[4];
      if (labelObj) { labelObj.set('text', text); this.fabricObject.canvas?.renderAll(); }
    }
  }

  connectModel(sourceNodeId) {
    this.connectedModel = { nodeId: sourceNodeId };
  }

  bindProperties() {
    const labelInput = document.getElementById('node-label');
    if (labelInput) {
      labelInput.addEventListener('input', () => this.updateLabel(labelInput.value));
    }

    // Connect model slot
    const slot = document.getElementById('viewer-model-slot');
    if (slot) {
      slot.addEventListener('click', () => {
        window._connectMode = { targetNodeId: this.id, connectType: 'viewer-model', expects: 'model' };
        slot.textContent = '🔗 Click a 3D Model node...';
      });
    }

    // Open viewer button
    const openBtn = document.getElementById('open-viewer-btn');
    if (openBtn) {
      openBtn.addEventListener('click', () => this._openViewer());
    }
  }

  _openViewer() {
    if (!this.connectedModel) return;
    // Resolve the model node to get its URL
    if (window._openViewerForNode) {
      window._openViewerForNode(this.connectedModel.nodeId);
    }
  }

  renderProperties() {
    const hasModel = !!this.connectedModel;

    return `
      <div class="prop-section">
        <label class="prop-section-label">Label</label>
        <input type="text" id="node-label" class="prop-input" value="${this.label}" placeholder="e.g. Character Viewer">
      </div>
      <div class="prop-section">
        <label class="prop-section-label">🎲 Model Input</label>
        <div class="workflow-input-slot" id="viewer-model-slot" style="cursor:pointer">
          ${hasModel ? '✅ Connected' : 'Click to connect a 3D Model node'}
        </div>
      </div>
      <div class="prop-section">
        <button id="open-viewer-btn" class="generate-btn" style="background:#e94560" ${hasModel ? '' : 'disabled'}>👁 Open Viewer</button>
      </div>
    `;
  }

  serialize() {
    return {
      id: this.id,
      type: this.type,
      label: this.label,
      connectedModel: this.connectedModel,
      x: this.fabricObject?.left || 0,
      y: this.fabricObject?.top || 0,
    };
  }
}
