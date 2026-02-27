// ModelNode — a 3D model on the canvas with an output port
// Double-click opens the 3D viewer modal

class ModelNode {
  constructor(id, { modelUrl, filename, comfyName, format, fileSize, label } = {}) {
    this.id = id;
    this.type = 'model';
    this.modelUrl = modelUrl || '';
    this.filename = filename || '';
    this.comfyName = comfyName || filename || '';
    this.format = format || 'GLB';
    this.fileSize = fileSize || 0;
    this.label = label || '';
    this.fabricObject = null;
  }

  createVisual(x, y) {
    const width = 200;
    const height = 70;

    const bg = new fabric.Rect({
      width, height,
      fill: '#1e1e3a',
      stroke: '#e94560',
      strokeWidth: 1.5,
      rx: 8, ry: 8,
    });

    const typeLabel = new fabric.Text('3D Model', {
      fontSize: 10,
      fill: '#e94560',
      fontWeight: 'bold',
      fontFamily: 'Inter, sans-serif',
      left: 8, top: 4,
    });

    const icon = new fabric.Text('🎲', {
      fontSize: 22,
      left: 8, top: 22,
    });

    const nameLabel = new fabric.Text(this.filename || 'No model', {
      fontSize: 11,
      fill: '#ccc',
      fontFamily: 'Inter, sans-serif',
      left: 40, top: 26,
    });

    const formatLabel = new fabric.Text(this.format.toUpperCase(), {
      fontSize: 9,
      fill: '#888',
      fontFamily: 'monospace',
      left: 40, top: 42,
    });

    const userLabel = new fabric.Text(this.label || '', {
      fontSize: 10,
      fill: '#aaa',
      fontFamily: 'Inter, sans-serif',
      left: 8, top: height - 16,
    });

    // Output port
    const port = new fabric.Circle({
      radius: 6,
      fill: '#e94560',
      stroke: '#fff',
      strokeWidth: 2,
      left: width - 12,
      top: height / 2 - 6,
    });

    const group = new fabric.Group([bg, typeLabel, icon, nameLabel, formatLabel, userLabel, port], {
      left: x, top: y,
      hasControls: false,
      hasBorders: false,
    });

    group.nodeId = this.id;
    this.fabricObject = group;
    return this;
  }

  updateLabel(text) {
    this.label = text;
    if (this.fabricObject) {
      const labelObj = this.fabricObject._objects[5]; // userLabel
      if (labelObj) { labelObj.set('text', text); this.fabricObject.canvas?.renderAll(); }
    }
  }

  bindProperties() {
    const labelInput = document.getElementById('node-label');
    if (labelInput) {
      labelInput.addEventListener('input', () => this.updateLabel(labelInput.value));
    }
  }

  renderProperties() {
    const sizeStr = this.fileSize
      ? (this.fileSize > 1024 * 1024
        ? `${(this.fileSize / 1024 / 1024).toFixed(1)} MB`
        : `${(this.fileSize / 1024).toFixed(1)} KB`)
      : '—';

    return `
      <div class="prop-section">
        <label class="prop-section-label">Label</label>
        <input type="text" id="node-label" class="prop-input" value="${this.label}" placeholder="e.g. Character Model">
      </div>
      <div class="prop-row">
        <span class="prop-label">Filename</span>
        <span class="prop-value">${this.filename}</span>
      </div>
      <div class="prop-row">
        <span class="prop-label">Format</span>
        <span class="prop-value">${this.format}</span>
      </div>
      <div class="prop-row">
        <span class="prop-label">Size</span>
        <span class="prop-value">${sizeStr}</span>
      </div>
    `;
  }

  serialize() {
    return {
      id: this.id,
      type: this.type,
      modelUrl: this.modelUrl,
      filename: this.filename,
      comfyName: this.comfyName,
      format: this.format,
      fileSize: this.fileSize,
      label: this.label,
      x: this.fabricObject?.left || 0,
      y: this.fabricObject?.top || 0,
    };
  }
}
