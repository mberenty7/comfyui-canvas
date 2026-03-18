// Tile Viewer — modal for previewing seamless tiling

class TileViewer {
  constructor() {
    this.modal = null;
    this.canvas = null;
    this.imageUrl = null;
    this.gridSize = 3;
    this.onClose = null;
    this._build();
  }

  _build() {
    this.modal = document.createElement('div');
    this.modal.className = 'mask-editor-modal hidden'; // reuse mask editor modal styles
    this.modal.innerHTML = `
      <div class="mask-editor-container" style="max-width:800px">
        <div class="mask-editor-header">
          <span class="mask-editor-title">🔲 Tile Preview</span>
          <div class="mask-editor-tools">
            <button class="mask-tool tile-grid-btn" data-grid="2">2×2</button>
            <button class="mask-tool tile-grid-btn" data-grid="3">3×3</button>
            <button class="mask-tool tile-grid-btn active" data-grid="4">4×4</button>
            <button class="mask-tool tile-grid-btn" data-grid="5">5×5</button>
            <span style="flex:1"></span>
            <button class="mask-tool" id="tile-viewer-close">✕ Close</button>
          </div>
        </div>
        <div class="mask-editor-canvas-wrap" style="display:flex;justify-content:center;align-items:center;background:#111;min-height:500px">
          <canvas id="tile-viewer-canvas"></canvas>
        </div>
      </div>
    `;
    document.body.appendChild(this.modal);

    // Grid size buttons
    this.modal.querySelectorAll('.tile-grid-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.modal.querySelectorAll('.tile-grid-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.gridSize = parseInt(btn.dataset.grid);
        this._render();
      });
    });

    // Close
    this.modal.querySelector('#tile-viewer-close').addEventListener('click', () => this.close());

    // ESC to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.modal.classList.contains('hidden')) {
        this.close();
      }
    });
  }

  open(imageUrl, gridSize, onClose) {
    this.imageUrl = imageUrl;
    this.gridSize = gridSize || this.gridSize;
    this.onClose = onClose || null;

    // Update active grid button
    this.modal.querySelectorAll('.tile-grid-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.grid) === this.gridSize);
    });

    this.modal.classList.remove('hidden');
    this._render();
  }

  close() {
    this.modal.classList.add('hidden');
    if (this.onClose) this.onClose(this.gridSize);
  }

  _render() {
    if (!this.imageUrl) return;

    const canvas = this.modal.querySelector('#tile-viewer-canvas');
    const ctx = canvas.getContext('2d');
    const grid = this.gridSize;

    const imgEl = new Image();
    imgEl.crossOrigin = 'anonymous';
    imgEl.onload = () => {
      // Size the canvas to fit the modal while maintaining tile proportions
      const maxSize = Math.min(700, window.innerWidth - 100, window.innerHeight - 150);
      const canvasSize = maxSize;

      canvas.width = canvasSize;
      canvas.height = canvasSize;

      const tileW = canvasSize / grid;
      const tileH = canvasSize / grid;

      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, canvasSize, canvasSize);

      for (let row = 0; row < grid; row++) {
        for (let col = 0; col < grid; col++) {
          ctx.drawImage(imgEl, col * tileW, row * tileH, tileW, tileH);
        }
      }

      // Draw subtle grid lines
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      for (let i = 1; i < grid; i++) {
        ctx.beginPath();
        ctx.moveTo(i * tileW, 0);
        ctx.lineTo(i * tileW, canvasSize);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * tileH);
        ctx.lineTo(canvasSize, i * tileH);
        ctx.stroke();
      }
    };
    imgEl.onerror = () => {
      console.error('TileViewer: failed to load image', this.imageUrl);
    };
    imgEl.src = this.imageUrl;
  }
}
