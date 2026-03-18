// Tile Viewer — modal for previewing seamless tiling with zoom/pan

class TileViewer {
  constructor() {
    this.modal = null;
    this.imageUrl = null;
    this.gridSize = 3;
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.onClose = null;
    this._imgEl = null;
    this._isDragging = false;
    this._lastMouse = { x: 0, y: 0 };
    this._canvasEl = null;
    this._build();
  }

  _build() {
    this.modal = document.createElement('div');
    this.modal.className = 'mask-editor-modal hidden';
    this.modal.innerHTML = `
      <div class="mask-editor-container" style="max-width:900px">
        <div class="mask-editor-header">
          <span class="mask-editor-title">🔲 Tile Preview</span>
          <div class="mask-editor-tools">
            <button class="mask-tool tile-grid-btn" data-grid="2">2×2</button>
            <button class="mask-tool tile-grid-btn" data-grid="3">3×3</button>
            <button class="mask-tool tile-grid-btn active" data-grid="4">4×4</button>
            <button class="mask-tool tile-grid-btn" data-grid="5">5×5</button>
            <span style="border-left:1px solid #555;margin:0 6px"></span>
            <button class="mask-tool" id="tile-zoom-in" title="Zoom in">🔍+</button>
            <button class="mask-tool" id="tile-zoom-out" title="Zoom out">🔍−</button>
            <button class="mask-tool" id="tile-zoom-reset" title="Reset zoom">↺ Fit</button>
            <span id="tile-zoom-label" style="font-size:11px;color:#888;min-width:45px;text-align:center">100%</span>
            <span style="flex:1"></span>
            <button class="mask-tool" id="tile-viewer-close">✕ Close</button>
          </div>
        </div>
        <div class="mask-editor-canvas-wrap" id="tile-viewer-wrap" style="display:flex;justify-content:center;align-items:center;background:#111;min-height:500px;overflow:hidden;cursor:grab;position:relative">
          <canvas id="tile-viewer-canvas" style="image-rendering:pixelated"></canvas>
        </div>
      </div>
    `;
    document.body.appendChild(this.modal);

    this._canvasEl = this.modal.querySelector('#tile-viewer-canvas');
    const wrap = this.modal.querySelector('#tile-viewer-wrap');

    // Grid size buttons
    this.modal.querySelectorAll('.tile-grid-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.modal.querySelectorAll('.tile-grid-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.gridSize = parseInt(btn.dataset.grid);
        this._render();
      });
    });

    // Zoom buttons
    this.modal.querySelector('#tile-zoom-in').addEventListener('click', () => this._setZoom(this.zoom * 1.3));
    this.modal.querySelector('#tile-zoom-out').addEventListener('click', () => this._setZoom(this.zoom / 1.3));
    this.modal.querySelector('#tile-zoom-reset').addEventListener('click', () => {
      this.zoom = 1;
      this.panX = 0;
      this.panY = 0;
      this._render();
    });

    // Scroll to zoom
    wrap.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      this._setZoom(this.zoom * factor);
    }, { passive: false });

    // Pan with mouse drag
    wrap.addEventListener('mousedown', (e) => {
      this._isDragging = true;
      this._lastMouse = { x: e.clientX, y: e.clientY };
      wrap.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', (e) => {
      if (!this._isDragging) return;
      this.panX += e.clientX - this._lastMouse.x;
      this.panY += e.clientY - this._lastMouse.y;
      this._lastMouse = { x: e.clientX, y: e.clientY };
      this._applyTransform();
    });
    window.addEventListener('mouseup', () => {
      if (this._isDragging) {
        this._isDragging = false;
        wrap.style.cursor = 'grab';
      }
    });

    // Close
    this.modal.querySelector('#tile-viewer-close').addEventListener('click', () => this.close());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.modal.classList.contains('hidden')) {
        this.close();
      }
    });
  }

  _setZoom(newZoom) {
    this.zoom = Math.max(0.25, Math.min(10, newZoom));
    this._applyTransform();
    this.modal.querySelector('#tile-zoom-label').textContent = `${Math.round(this.zoom * 100)}%`;
  }

  _applyTransform() {
    this._canvasEl.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
  }

  open(imageUrl, gridSize, onClose) {
    this.imageUrl = imageUrl;
    this.gridSize = gridSize || this.gridSize;
    this.onClose = onClose || null;
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;

    this.modal.querySelectorAll('.tile-grid-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.grid) === this.gridSize);
    });
    this.modal.querySelector('#tile-zoom-label').textContent = '100%';
    this._canvasEl.style.transform = '';

    this.modal.classList.remove('hidden');

    // Pre-load image then render
    this._imgEl = new Image();
    this._imgEl.crossOrigin = 'anonymous';
    this._imgEl.onload = () => this._render();
    this._imgEl.onerror = () => console.error('TileViewer: failed to load', this.imageUrl);
    this._imgEl.src = this.imageUrl;
  }

  close() {
    this.modal.classList.add('hidden');
    if (this.onClose) this.onClose(this.gridSize);
  }

  _render() {
    if (!this._imgEl || !this._imgEl.complete) return;

    const canvas = this._canvasEl;
    const ctx = canvas.getContext('2d');
    const grid = this.gridSize;

    // Use source image dimensions for crisp rendering
    const tileW = this._imgEl.width;
    const tileH = this._imgEl.height;
    const totalW = tileW * grid;
    const totalH = tileH * grid;

    // Cap canvas size to avoid huge memory use, but keep it high-res
    const maxDim = 2048;
    const scale = Math.min(1, maxDim / Math.max(totalW, totalH));
    const cw = Math.round(totalW * scale);
    const ch = Math.round(totalH * scale);

    canvas.width = cw;
    canvas.height = ch;

    // Fit visually in the modal at 100% zoom
    const wrapSize = Math.min(700, window.innerWidth - 100, window.innerHeight - 150);
    const fitScale = wrapSize / Math.max(cw, ch);
    canvas.style.width = Math.round(cw * fitScale) + 'px';
    canvas.style.height = Math.round(ch * fitScale) + 'px';

    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, cw, ch);

    const tw = cw / grid;
    const th = ch / grid;

    for (let row = 0; row < grid; row++) {
      for (let col = 0; col < grid; col++) {
        ctx.drawImage(this._imgEl, col * tw, row * th, tw, th);
      }
    }

    // Subtle grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let i = 1; i < grid; i++) {
      ctx.beginPath();
      ctx.moveTo(i * tw, 0);
      ctx.lineTo(i * tw, ch);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * th);
      ctx.lineTo(cw, i * th);
      ctx.stroke();
    }

    // Reset transform (zoom/pan stays from CSS)
    this._applyTransform();
    this.modal.querySelector('#tile-zoom-label').textContent = `${Math.round(this.zoom * 100)}%`;
  }
}
