// Mask Editor — modal for painting inpaint masks on images
// Uses a secondary canvas overlaid on the image

class MaskEditor {
  constructor() {
    this.modal = null;
    this.canvas = null;       // fabric.Canvas for mask painting
    this.imageUrl = null;
    this.imageWidth = 0;
    this.imageHeight = 0;
    this.brushSize = 40;
    this.isErasing = false;
    this.onSave = null;       // callback(maskDataUrl)
    this._build();
  }

  _build() {
    // Modal container
    this.modal = document.createElement('div');
    this.modal.className = 'mask-editor-modal hidden';
    this.modal.innerHTML = `
      <div class="mask-editor-container">
        <div class="mask-editor-header">
          <span class="mask-editor-title">🎨 Mask Editor</span>
          <div class="mask-editor-tools">
            <button class="mask-tool active" data-tool="brush" title="Brush (paint mask)">🖌️ Brush</button>
            <button class="mask-tool" data-tool="eraser" title="Eraser (remove mask)">🧹 Eraser</button>
            <label class="mask-brush-size">
              Size: <input type="range" id="mask-brush-size" min="5" max="150" value="40">
              <span id="mask-brush-size-val">40</span>
            </label>
            <button class="mask-tool" data-tool="clear" title="Clear mask">🗑️ Clear</button>
            <button class="mask-tool" data-tool="invert" title="Invert mask">🔄 Invert</button>
            <button class="mask-tool" data-tool="fill" title="Fill all">⬜ Fill</button>
          </div>
          <div class="mask-editor-actions">
            <button id="mask-save" class="generate-btn" style="width:auto;padding:8px 20px;font-size:13px">✅ Save Mask</button>
            <button id="mask-cancel" class="prop-btn" style="padding:8px 16px">Cancel</button>
          </div>
        </div>
        <div class="mask-editor-viewport">
          <canvas id="mask-canvas"></canvas>
        </div>
      </div>
    `;
    document.body.appendChild(this.modal);

    // Tool buttons
    this.modal.querySelectorAll('.mask-tool').forEach(btn => {
      btn.addEventListener('click', () => this._onTool(btn.dataset.tool));
    });

    // Brush size
    const sizeSlider = this.modal.querySelector('#mask-brush-size');
    const sizeVal = this.modal.querySelector('#mask-brush-size-val');
    sizeSlider.addEventListener('input', () => {
      this.brushSize = parseInt(sizeSlider.value);
      sizeVal.textContent = this.brushSize;
      if (this.canvas) {
        this.canvas.freeDrawingBrush.width = this.brushSize;
      }
    });

    // Save / Cancel
    this.modal.querySelector('#mask-save').addEventListener('click', () => this._save());
    this.modal.querySelector('#mask-cancel').addEventListener('click', () => this.close());

    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.modal.classList.contains('hidden')) {
        this.close();
      }
    });
  }

  open(imageUrl, width, height, existingMask, onSave) {
    this.imageUrl = imageUrl;
    this.imageWidth = width;
    this.imageHeight = height;
    this.onSave = onSave;

    this.modal.classList.remove('hidden');

    // Calculate display size (fit in viewport)
    const maxW = window.innerWidth * 0.8;
    const maxH = window.innerHeight - 140;
    const scale = Math.min(maxW / width, maxH / height, 1);
    const displayW = Math.round(width * scale);
    const displayH = Math.round(height * scale);

    const canvasEl = this.modal.querySelector('#mask-canvas');
    canvasEl.width = displayW;
    canvasEl.height = displayH;

    // Create fabric canvas
    if (this.canvas) {
      this.canvas.dispose();
    }
    this.canvas = new fabric.Canvas('mask-canvas', {
      width: displayW,
      height: displayH,
      isDrawingMode: true,
      selection: false,
    });

    // Set background image
    fabric.Image.fromURL(imageUrl, (img) => {
      img.scaleToWidth(displayW);
      this.canvas.setBackgroundImage(img, this.canvas.renderAll.bind(this.canvas));
    }, { crossOrigin: 'anonymous' });

    // Configure brush
    this.canvas.freeDrawingBrush = new fabric.PencilBrush(this.canvas);
    this.canvas.freeDrawingBrush.width = this.brushSize;
    this.canvas.freeDrawingBrush.color = 'rgba(255, 0, 0, 0.5)';
    this.isErasing = false;

    // Load existing mask if provided
    if (existingMask) {
      fabric.Image.fromURL(existingMask, (maskImg) => {
        maskImg.scaleToWidth(displayW);
        maskImg.set({ selectable: false, evented: false, opacity: 0.5 });
        this.canvas.add(maskImg);
        this.canvas.renderAll();
      }, { crossOrigin: 'anonymous' });
    }

    // Set active tool highlight
    this.modal.querySelectorAll('.mask-tool').forEach(b => b.classList.remove('active'));
    this.modal.querySelector('[data-tool="brush"]').classList.add('active');
  }

  close() {
    this.modal.classList.add('hidden');
    if (this.canvas) {
      this.canvas.dispose();
      this.canvas = null;
    }
  }

  _onTool(tool) {
    if (tool === 'clear') {
      this.canvas.getObjects().forEach(obj => this.canvas.remove(obj));
      this.canvas.renderAll();
      return;
    }

    if (tool === 'fill') {
      const rect = new fabric.Rect({
        left: 0, top: 0,
        width: this.canvas.width,
        height: this.canvas.height,
        fill: 'rgba(255, 0, 0, 0.5)',
        selectable: false,
        evented: false,
      });
      this.canvas.add(rect);
      this.canvas.renderAll();
      return;
    }

    if (tool === 'invert') {
      this._invertMask();
      return;
    }

    // Brush / Eraser toggle
    this.modal.querySelectorAll('.mask-tool').forEach(b => b.classList.remove('active'));
    this.modal.querySelector(`[data-tool="${tool}"]`)?.classList.add('active');

    if (tool === 'eraser') {
      this.isErasing = true;
      this.canvas.freeDrawingBrush.color = 'rgba(0, 0, 0, 1)';
      // Use globalCompositeOperation for erasing
      this.canvas.freeDrawingBrush.globalCompositeOperation = 'destination-out';
    } else {
      this.isErasing = false;
      this.canvas.freeDrawingBrush.color = 'rgba(255, 0, 0, 0.5)';
      this.canvas.freeDrawingBrush.globalCompositeOperation = 'source-over';
    }
  }

  _invertMask() {
    // Render current mask, invert it
    const maskCanvas = this._renderMask();
    const ctx = maskCanvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    for (let i = 0; i < imageData.data.length; i += 4) {
      imageData.data[i] = 255 - imageData.data[i];
      imageData.data[i + 1] = 255 - imageData.data[i + 1];
      imageData.data[i + 2] = 255 - imageData.data[i + 2];
    }
    ctx.putImageData(imageData, 0, 0);

    // Clear canvas and add inverted mask as image
    const dataUrl = maskCanvas.toDataURL('image/png');
    this.canvas.getObjects().forEach(obj => this.canvas.remove(obj));
    fabric.Image.fromURL(dataUrl, (img) => {
      img.set({
        left: 0, top: 0,
        scaleX: this.canvas.width / this.imageWidth,
        scaleY: this.canvas.height / this.imageHeight,
        selectable: false,
        evented: false,
        opacity: 0.5,
      });
      this.canvas.add(img);
      this.canvas.renderAll();
    });
  }

  _renderMask() {
    // Create an offscreen canvas at original image resolution
    const offscreen = document.createElement('canvas');
    offscreen.width = this.imageWidth;
    offscreen.height = this.imageHeight;
    const ctx = offscreen.getContext('2d');

    // Start with black (keep everything)
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, this.imageWidth, this.imageHeight);

    // Render the mask layer (drawings only, no background)
    const scaleX = this.imageWidth / this.canvas.width;
    const scaleY = this.imageHeight / this.canvas.height;

    // Create a temp canvas from fabric objects only
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = this.canvas.width;
    tempCanvas.height = this.canvas.height;
    const tempCtx = tempCanvas.getContext('2d');

    // Draw all fabric objects (paths, rects) onto temp canvas
    const objects = this.canvas.getObjects();
    for (const obj of objects) {
      const objCanvas = obj.toCanvasElement();
      const bounds = obj.getBoundingRect();
      tempCtx.drawImage(objCanvas, bounds.left, bounds.top);
    }

    // Check which pixels have mask paint (any non-zero red channel)
    const tempData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);

    // Scale up to original resolution
    ctx.imageSmoothingEnabled = true;
    for (let y = 0; y < this.imageHeight; y++) {
      for (let x = 0; x < this.imageWidth; x++) {
        const sx = Math.floor(x / scaleX);
        const sy = Math.floor(y / scaleY);
        const si = (sy * tempCanvas.width + sx) * 4;
        // If the temp canvas has any paint (alpha > 0 and it's reddish), mark white
        if (tempData.data[si + 3] > 20) {
          // Check if it's mask paint (red) vs erased
          if (tempData.data[si] > 50) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(x, y, 1, 1);
          }
        }
      }
    }

    return offscreen;
  }

  _save() {
    // Simpler approach: use fabric's toDataURL but with only objects visible
    // Create the mask at original resolution
    const offscreen = document.createElement('canvas');
    offscreen.width = this.imageWidth;
    offscreen.height = this.imageHeight;
    const ctx = offscreen.getContext('2d');

    // Black background (keep)
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, this.imageWidth, this.imageHeight);

    // Get the fabric canvas as image (objects only)
    const bgImage = this.canvas.backgroundImage;
    this.canvas.backgroundImage = null;
    this.canvas.backgroundColor = 'rgba(0,0,0,0)';
    this.canvas.renderAll();

    const fabricDataUrl = this.canvas.toDataURL({ format: 'png' });

    // Restore background
    this.canvas.backgroundImage = bgImage;
    this.canvas.renderAll();

    // Draw the mask paint onto offscreen, converting red paint to white
    const tempImg = new Image();
    tempImg.onload = () => {
      ctx.drawImage(tempImg, 0, 0, this.imageWidth, this.imageHeight);

      // Convert: any pixel with red > threshold → white, else → black
      const imageData = ctx.getImageData(0, 0, this.imageWidth, this.imageHeight);
      for (let i = 0; i < imageData.data.length; i += 4) {
        const r = imageData.data[i];
        const a = imageData.data[i + 3];
        if (a > 20 && r > 30) {
          imageData.data[i] = 255;
          imageData.data[i + 1] = 255;
          imageData.data[i + 2] = 255;
          imageData.data[i + 3] = 255;
        } else {
          imageData.data[i] = 0;
          imageData.data[i + 1] = 0;
          imageData.data[i + 2] = 0;
          imageData.data[i + 3] = 255;
        }
      }
      ctx.putImageData(imageData, 0, 0);

      const maskDataUrl = offscreen.toDataURL('image/png');
      if (this.onSave) this.onSave(maskDataUrl);
      this.close();
    };
    tempImg.src = fabricDataUrl;
  }
}
