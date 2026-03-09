// ImageNode — an image on the canvas with an output port

class ImageNode {
  constructor(id, { imageUrl, filename, width, height, fileSize, format, comfyName, label, maskDataUrl, maskComfyName }) {
    this.id = id;
    this.type = 'image';
    this.imageUrl = imageUrl;
    this.filename = filename;
    this.comfyName = comfyName || filename;
    this.width = width;
    this.height = height;
    this.fileSize = fileSize;
    this.format = format;
    this.label = label || '';
    this.maskDataUrl = maskDataUrl || null;
    this.maskComfyName = maskComfyName || null;
    this.fabricObject = null;
  }

  // Create the fabric group: image thumbnail + output port dot
  createVisual(x, y) {
    return new Promise((resolve) => {
      fabric.Image.fromURL(this.imageUrl, (img) => {
        // Scale to thumbnail
        const maxDim = 200;
        const scale = maxDim / Math.max(img.width, img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        img.scale(scale);

        const pad = 6;
        const headerH = 20;
        const footerH = this.label ? 20 : 0;
        const totalH = headerH + h + pad * 2 + footerH;
        const totalW = w + pad * 2;

        img.set({ originX: 'left', originY: 'top', left: pad, top: headerH + pad });

        // Subtle rounded border
        const border = new fabric.Rect({
          width: totalW,
          height: totalH,
          fill: '#1e1e3a',
          stroke: '#444',
          strokeWidth: 1.5,
          rx: 8,
          ry: 8,
          originX: 'left',
          originY: 'top',
        });

        // Type label at top
        const typeLabel = new fabric.Text('Image', {
          fontSize: 10,
          fill: '#4a9eff',
          fontWeight: 'bold',
          fontFamily: 'Inter, sans-serif',
          left: pad + 2,
          top: 4,
        });

        // User label at bottom
        const userLabel = new fabric.Text(this.label || '', {
          fontSize: 10,
          fill: '#aaa',
          fontFamily: 'Inter, sans-serif',
          left: pad + 2,
          top: headerH + h + pad + 4,
        });

        // Output port
        const port = new fabric.Circle({
          radius: 6,
          fill: '#4caf50',
          stroke: '#fff',
          strokeWidth: 2,
          left: totalW - 12,
          top: totalH / 2 - 6,
        });

        const group = new fabric.Group([border, img, typeLabel, userLabel, port], {
          left: x,
          top: y,
          hasControls: false,
          hasBorders: false,
          
        });

        group.nodeId = this.id;
        this.fabricObject = group;
        resolve(this);
      }, { crossOrigin: 'anonymous' });
    });
  }

  bindProperties() {
    const labelInput = document.getElementById('node-label');
    if (labelInput) {
      labelInput.addEventListener('input', () => this.updateLabel(labelInput.value));
    }

    document.getElementById('btn-paint-mask')?.addEventListener('click', () => {
      if (window._maskEditor) {
        window._maskEditor.open(
          this.imageUrl,
          this.width || 512,
          this.height || 512,
          this.maskDataUrl,
          async (maskDataUrl) => {
            this.maskDataUrl = maskDataUrl;
            // Upload mask to ComfyUI
            try {
              const resp = await fetch(maskDataUrl);
              const blob = await resp.blob();
              const file = new File([blob], `mask_${this.id}.png`, { type: 'image/png' });
              const formData = new FormData();
              formData.append('image', file);
              const uploadResp = await fetch('/api/comfy/upload', { method: 'POST', body: formData });
              const result = await uploadResp.json();
              if (result.comfyName) this.maskComfyName = result.comfyName;
              if (window.addLog) window.addLog(`Mask saved for "${this.filename}"`, 'success');
            } catch (err) {
              console.warn('Failed to upload mask:', err);
            }
            // Refresh properties panel
            if (window._refreshProperties) window._refreshProperties(this);
          }
        );
      }
    });

    document.getElementById('btn-clear-mask')?.addEventListener('click', () => {
      this.maskDataUrl = null;
      this.maskComfyName = null;
      if (window._refreshProperties) window._refreshProperties(this);
    });
  }

  updateLabel(text) {
    this.label = text;
    if (this.fabricObject) {
      const labelObj = this.fabricObject._objects[3]; // userLabel
      if (labelObj) {
        labelObj.set('text', text);
        this.fabricObject.canvas?.renderAll();
      }
    }
  }

  serialize() {
    return {
      id: this.id,
      type: this.type,
      imageUrl: this.imageUrl,
      filename: this.filename,
      comfyName: this.comfyName,
      width: this.width,
      height: this.height,
      fileSize: this.fileSize,
      format: this.format,
      label: this.label,
      maskComfyName: this.maskComfyName,
      x: this.fabricObject?.left || 0,
      y: this.fabricObject?.top || 0,
    };
  }

  // Render properties panel HTML
  renderProperties() {
    const sizeStr = this.fileSize
      ? (this.fileSize > 1024 * 1024
        ? `${(this.fileSize / 1024 / 1024).toFixed(1)} MB`
        : `${(this.fileSize / 1024).toFixed(1)} KB`)
      : '—';

    return `
      <div class="prop-section">
        <label class="prop-section-label">Label</label>
        <input type="text" id="node-label" class="prop-input" value="${this.label}" placeholder="e.g. Paranorman Ref">
      </div>
      <img class="prop-preview" src="${this.imageUrl}" alt="${this.filename}">
      <div class="prop-row">
        <span class="prop-label">Filename</span>
        <span class="prop-value">${this.filename}</span>
      </div>
      <div class="prop-row">
        <span class="prop-label">Dimensions</span>
        <span class="prop-value">${this.width || '?'} × ${this.height || '?'}</span>
      </div>
      <div class="prop-row">
        <span class="prop-label">Size</span>
        <span class="prop-value">${sizeStr}</span>
      </div>
      <div class="prop-row">
        <span class="prop-label">Format</span>
        <span class="prop-value">${this.format || '—'}</span>
      </div>
      <div class="prop-row">
        <span class="prop-label">ComfyUI Name</span>
        <span class="prop-value">${this.comfyName}</span>
      </div>
      <div class="prop-section" style="margin-top:12px">
        <label class="prop-section-label">🎨 Inpaint Mask</label>
        ${this.maskDataUrl ? '<img class="prop-preview" src="' + this.maskDataUrl + '" alt="Mask" style="border:1px solid #333">' : ''}
        <div class="prop-actions">
          <button id="btn-paint-mask" class="prop-btn" style="background:#e94560;border-color:#e94560">${this.maskDataUrl ? '🎨 Edit Mask' : '🎨 Paint Mask'}</button>
          ${this.maskDataUrl ? '<button id="btn-clear-mask" class="prop-btn">🗑 Clear</button>' : ''}
        </div>
      </div>
    `;
  }
}
