// GroupBox — visual container for organizing nodes on the canvas

class GroupBox {
  constructor(id, opts = {}) {
    this.id = id;
    this.type = 'group-box';
    this.title = opts.title || 'Group';
    this.color = opts.color || '#4a9eff';
    this.boxWidth = opts.width || 400;
    this.boxHeight = opts.height || 300;
    this.fabricObject = null;
    this._lastLeft = 0;
    this._lastTop = 0;
  }

  createVisual(x, y) {
    const headerH = 28;

    // Background rect
    const bg = new fabric.Rect({
      width: this.boxWidth,
      height: this.boxHeight,
      fill: this.color + '12', // very transparent
      stroke: this.color + '55',
      strokeWidth: 1.5,
      strokeDashArray: [6, 3],
      rx: 10, ry: 10,
      originX: 'left', originY: 'top',
    });

    // Header bar
    const header = new fabric.Rect({
      width: this.boxWidth,
      height: headerH,
      fill: this.color + '30',
      rx: 10, ry: 10,
      originX: 'left', originY: 'top',
    });

    // Title text
    const titleText = new fabric.Text(this.title, {
      fontSize: 12,
      fill: this.color,
      fontWeight: 'bold',
      fontFamily: 'Inter, sans-serif',
      left: 10,
      top: 6,
      originX: 'left', originY: 'top',
    });

    const group = new fabric.Group([bg, header, titleText], {
      left: x, top: y,
      hasControls: true,
      hasBorders: true,
      lockRotation: true,
      // Only allow corner resize
      setControlsVisibility: undefined,
      subTargetCheck: false,
    });

    // Only show resize handles, not rotation
    group.setControlsVisibility({
      mtr: false, // no rotation
      ml: true, mr: true, mt: true, mb: true,
      tl: true, tr: true, bl: true, br: true,
    });

    group.nodeId = this.id;
    group._isGroupBox = true;
    this.fabricObject = group;
    this._lastLeft = x;
    this._lastTop = y;

    return this;
  }

  // Called when the group box is being moved — returns delta for child nodes
  getMoveDelta() {
    if (!this.fabricObject) return { dx: 0, dy: 0 };
    const dx = this.fabricObject.left - this._lastLeft;
    const dy = this.fabricObject.top - this._lastTop;
    this._lastLeft = this.fabricObject.left;
    this._lastTop = this.fabricObject.top;
    return { dx, dy };
  }

  updateLastPosition() {
    if (this.fabricObject) {
      this._lastLeft = this.fabricObject.left;
      this._lastTop = this.fabricObject.top;
    }
  }

  // Check if a node's center is inside this group box
  containsNode(node) {
    if (!this.fabricObject || !node.fabricObject) return false;
    const box = this.fabricObject;
    const nObj = node.fabricObject;
    const nCenter = nObj.getCenterPoint();

    // Get the actual bounding box of the group (accounting for scale from resize)
    const bLeft = box.left;
    const bTop = box.top;
    const bWidth = this.boxWidth * (box.scaleX || 1);
    const bHeight = this.boxHeight * (box.scaleY || 1);

    return (
      nCenter.x >= bLeft &&
      nCenter.x <= bLeft + bWidth &&
      nCenter.y >= bTop &&
      nCenter.y <= bTop + bHeight
    );
  }

  // Update internal dimensions after resize
  updateDimensions() {
    if (!this.fabricObject) return;
    const obj = this.fabricObject;
    this.boxWidth = (this.boxWidth || 400) * (obj.scaleX || 1);
    this.boxHeight = (this.boxHeight || 300) * (obj.scaleY || 1);
    obj.scaleX = 1;
    obj.scaleY = 1;

    // Rebuild visual at current size
    const x = obj.left;
    const y = obj.top;
    const canvas = obj.canvas;
    if (canvas) canvas.remove(obj);
    this.createVisual(x, y);
    if (canvas) {
      canvas.add(this.fabricObject);
      canvas.sendToBack(this.fabricObject);
      canvas.renderAll();
    }
  }

  updateTitle(text) {
    this.title = text;
    if (this.fabricObject) {
      const titleObj = this.fabricObject._objects[2];
      if (titleObj) {
        titleObj.set('text', text);
        this.fabricObject.canvas?.renderAll();
      }
    }
  }

  updateColor(color) {
    this.color = color;
    if (this.fabricObject) {
      const bg = this.fabricObject._objects[0];
      const header = this.fabricObject._objects[1];
      const titleText = this.fabricObject._objects[2];
      if (bg) {
        bg.set({ fill: color + '12', stroke: color + '55' });
      }
      if (header) header.set({ fill: color + '30' });
      if (titleText) titleText.set({ fill: color });
      this.fabricObject.canvas?.renderAll();
    }
  }

  serialize() {
    return {
      id: this.id,
      type: this.type,
      title: this.title,
      color: this.color,
      width: this.boxWidth,
      height: this.boxHeight,
      x: this.fabricObject?.left || 0,
      y: this.fabricObject?.top || 0,
    };
  }

  renderProperties() {
    const colors = [
      { label: 'Blue', value: '#4a9eff' },
      { label: 'Green', value: '#4caf50' },
      { label: 'Purple', value: '#a855f7' },
      { label: 'Red', value: '#e94560' },
      { label: 'Gold', value: '#e6a817' },
      { label: 'Teal', value: '#26a69a' },
      { label: 'Orange', value: '#ea8600' },
      { label: 'Pink', value: '#e91e8e' },
    ];
    const colorOptions = colors.map(c =>
      `<button class="prop-btn group-color-btn ${this.color === c.value ? 'active' : ''}" data-color="${c.value}" style="background:${c.value}22;border-color:${c.value};color:${c.value};min-width:auto;padding:4px 8px">${c.label}</button>`
    ).join('');

    return `
      <div class="prop-section">
        <label class="prop-section-label">Title</label>
        <input type="text" id="node-label" class="prop-input" value="${this.title}" placeholder="e.g. Character Pipeline">
      </div>
      <div class="prop-section">
        <label class="prop-section-label">Color</label>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">
          ${colorOptions}
        </div>
      </div>
    `;
  }

  bindProperties() {
    const titleInput = document.getElementById('node-label');
    if (titleInput) {
      titleInput.addEventListener('input', () => this.updateTitle(titleInput.value));
    }

    document.querySelectorAll('.group-color-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.updateColor(btn.dataset.color);
        document.querySelectorAll('.group-color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }
}
