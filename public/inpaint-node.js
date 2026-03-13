// InpaintNode — sits between Image and Workflow, provides mask editing
// Input: Image node (source image to paint on)
// Input: Prompt node (what to fill in masked area)
// Output: connects to Workflow node as image+mask+prompt source

class InpaintNode {
  constructor(id, { label, maskDataUrl, maskComfyName } = {}) {
    this.id = id;
    this.type = 'inpaint';
    this.label = label || '';
    this.maskDataUrl = maskDataUrl || null;
    this.maskComfyName = maskComfyName || null;
    this.connectedImage = null;  // { nodeId }
    this.fabricObject = null;
  }

  createVisual(x, y) {
    const width = 160;
    const height = 60;

    const bg = new fabric.Rect({
      width, height,
      fill: '#1e1e3a',
      stroke: '#e94560',
      strokeWidth: 1.5,
      rx: 8, ry: 8,
    });

    const typeLabel = new fabric.Text('Inpaint', {
      fontSize: 10,
      fill: '#e94560',
      fontWeight: 'bold',
      fontFamily: 'Inter, sans-serif',
      left: 8, top: 4,
    });

    const userLabel = new fabric.Text(this.label || '', {
      fontSize: 10,
      fill: '#aaa',
      fontFamily: 'Inter, sans-serif',
      left: 8, top: height - 16,
    });

    const statusText = new fabric.Text(this.maskDataUrl ? '✅ Mask ready' : 'No mask', {
      fontSize: 9,
      fill: '#666',
      fontFamily: 'monospace',
      left: 8, top: 22,
    });

    // Input port: image (left)
    const imgPort = new fabric.Circle({
      radius: 5,
      fill: '#4a9eff',
      stroke: '#fff',
      strokeWidth: 1.5,
      left: -5, top: height / 2 - 5,
    });

    // Output port on right
    const outPort = new fabric.Circle({
      radius: 6,
      fill: '#e94560',
      stroke: '#fff',
      strokeWidth: 2,
      left: width - 12, top: height / 2 - 6,
    });

    const group = new fabric.Group(
      [bg, typeLabel, userLabel, statusText, imgPort, outPort],
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

  // Get the connected image node's data (used by WorkflowNode.buildWorkflow)
  getImageData(engine) {
    if (!this.connectedImage) return null;
    const imgNode = engine.nodes.get(this.connectedImage.nodeId);
    if (!imgNode || imgNode.type !== 'image') return null;
    return {
      comfyName: imgNode.comfyName,
      imageUrl: imgNode.imageUrl,
      maskComfyName: this.maskComfyName,
      maskUrl: this.maskDataUrl,
    };
  }

  renderProperties() {
    const imgStatus = this.connectedImage ? '✅ Connected' : 'Click to connect an image node';

    return `
      <div class="prop-section">
        <label class="prop-section-label">Label</label>
        <input type="text" id="node-label" class="prop-input" value="${this.label}" placeholder="e.g. Fix face">
      </div>
      <div class="prop-section">
        <label class="prop-section-label">📷 Source Image</label>
        <div class="workflow-input-slot" data-connect="image" data-expects="image" style="cursor:pointer">
          ${imgStatus}
        </div>
        ${this.connectedImage ? `<button class="prop-btn disconnect-btn" data-disconnect="image" style="margin-top:4px;font-size:11px;padding:4px 8px;width:100%">✂️ Disconnect</button>` : ''}
      </div>
      <div class="prop-section">
        <label class="prop-section-label">🎨 Mask</label>
        <button id="btn-paint-mask" class="generate-btn" style="width:100%;font-size:12px;padding:8px" ${!this.connectedImage ? 'disabled title="Connect an image first"' : ''}>
          ${this.maskDataUrl ? '🎨 Edit Mask' : '🎨 Paint Mask'}
        </button>
        ${this.maskDataUrl ? `
          <div style="margin-top:6px;text-align:center">
            <img src="${this.maskDataUrl}" style="max-width:100%;max-height:100px;border:1px solid #333;border-radius:4px">
          </div>
          <button id="btn-clear-mask" class="prop-btn" style="margin-top:4px;font-size:11px;padding:4px 8px;width:100%">🗑️ Clear Mask</button>
        ` : '<p style="font-size:11px;color:#666;margin-top:4px">Paint white over areas to inpaint. Black = keep.</p>'}
      </div>
    `;
  }

  bindProperties() {
    const labelInput = document.getElementById('node-label');
    if (labelInput) labelInput.addEventListener('input', () => this.updateLabel(labelInput.value));

    // Connect image slot
    document.querySelector('[data-connect="image"]')?.addEventListener('click', () => {
      window._connectMode = { targetNodeId: this.id, connectType: 'image', expects: 'image' };
      document.querySelector('[data-connect="image"]').textContent = '🔗 Click an image node...';
    });

    // Disconnect buttons
    document.querySelectorAll('.disconnect-btn').forEach(el => {
      el.addEventListener('click', () => {
        const which = el.dataset.disconnect;
        if (which === 'image') {
          const oldConn = this.connectedImage;
          this.connectedImage = null;
          this.maskDataUrl = null;
          this.maskComfyName = null;
          this._updateStatus('No mask');
          if (oldConn && window._engine) window._engine.removeConnectionBetween(oldConn.nodeId, this.id);
        }
        if (window._refreshProperties) window._refreshProperties(this);
      });
    });

    // Paint mask button
    document.getElementById('btn-paint-mask')?.addEventListener('click', () => {
      if (!this.connectedImage || !window._engine) return;
      const imgNode = window._engine.nodes.get(this.connectedImage.nodeId);
      if (!imgNode || !imgNode.imageUrl) return;

      if (window._maskEditor) {
        window._maskEditor.comfyName = imgNode.comfyName || null;
        window._maskEditor.open(
          imgNode.imageUrl,
          imgNode.width || 1024,
          imgNode.height || 1024,
          this.maskDataUrl,
          async (maskDataUrl) => {
            this.maskDataUrl = maskDataUrl;
            this._updateStatus('✅ Mask ready');

            // Upload mask to server/ComfyUI
            try {
              const resp = await fetch(maskDataUrl);
              const blob = await resp.blob();
              const file = new File([blob], `mask_inpaint_${this.id}.png`, { type: 'image/png' });
              const formData = new FormData();
              formData.append('image', file);
              const uploadResp = await fetch('/api/comfy/upload', { method: 'POST', body: formData });
              const result = await uploadResp.json();
              if (result.comfyName) this.maskComfyName = result.comfyName;
              if (window.addLog) window.addLog(`Inpaint mask saved`, 'success');
            } catch (err) {
              console.warn('Failed to upload mask:', err);
            }

            if (window._refreshProperties) window._refreshProperties(this);
          }
        );
      }
    });

    // Clear mask
    document.getElementById('btn-clear-mask')?.addEventListener('click', () => {
      this.maskDataUrl = null;
      this.maskComfyName = null;
      this._updateStatus('No mask');
      if (window._refreshProperties) window._refreshProperties(this);
    });
  }

  serialize() {
    return {
      id: this.id,
      type: this.type,
      label: this.label,
      maskComfyName: this.maskComfyName,
      connectedImage: this.connectedImage,
      x: this.fabricObject?.left || 0,
      y: this.fabricObject?.top || 0,
      // Note: maskDataUrl is a data URL which can be large — skip it in saves
      // The mask is re-paintable and also stored server-side via comfyName
    };
  }
}
