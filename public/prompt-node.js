// PromptNode — positive/negative text prompts with an output port

class PromptNode {
  constructor(id, { positive, negative, label } = {}) {
    this.id = id;
    this.type = 'prompt';
    this.positive = positive || '';
    this.negative = negative || '';
    this.label = label || '';
    this.fabricObject = null;
  }

  createVisual(x, y) {
    const width = 160;
    const height = 50;

    const bg = new fabric.Rect({
      width, height,
      fill: '#1e1e3a',
      stroke: '#a855f7',
      strokeWidth: 1.5,
      rx: 8, ry: 8,
    });

    // Type label at top
    const typeLabel = new fabric.Text('Prompt', {
      fontSize: 10,
      fill: '#a855f7',
      fontWeight: 'bold',
      fontFamily: 'Inter, sans-serif',
      left: 8,
      top: 4,
    });

    // User label at bottom
    const userLabel = new fabric.Text(this.label || '', {
      fontSize: 10,
      fill: '#aaa',
      fontFamily: 'Inter, sans-serif',
      left: 8,
      top: 30,
    });

    // Output port
    const port = new fabric.Circle({
      radius: 6,
      fill: '#a855f7',
      stroke: '#fff',
      strokeWidth: 2,
      left: width - 12,
      top: height / 2 - 6,
    });

    const group = new fabric.Group([bg, typeLabel, userLabel, port], {
      left: x, top: y,
      hasControls: false,
      hasBorders: false,
      subTargetCheck: true,
    });

    group.nodeId = this.id;
    this.fabricObject = group;
    return this;
  }

  updateLabel(text) {
    this.label = text;
    if (this.fabricObject) {
      const labelObj = this.fabricObject._objects[2]; // userLabel
      if (labelObj) {
        labelObj.set('text', text);
        this.fabricObject.canvas?.renderAll();
      }
    }
  }

  renderProperties() {
    return `
      <div class="prop-section">
        <label class="prop-section-label">Label</label>
        <input type="text" id="node-label" class="prop-input" value="${this.label}" placeholder="e.g. Style Prompt">
      </div>
      <div class="prop-section">
        <label class="prop-section-label">Positive Prompt</label>
        <textarea id="prompt-positive" class="prop-textarea" rows="6" placeholder="Describe what you want...">${this.positive}</textarea>
      </div>
      <div class="prop-section">
        <label class="prop-section-label">Negative Prompt</label>
        <textarea id="prompt-negative" class="prop-textarea" rows="4" placeholder="Describe what to avoid...">${this.negative}</textarea>
      </div>
      <div class="prop-actions">
        <button id="prompt-save" class="prop-btn">💾 Save Prompt</button>
        <button id="prompt-load" class="prop-btn">📂 Load Prompt</button>
      </div>
    `;
  }

  // Wire up the properties panel events
  bindProperties() {
    const labelInput = document.getElementById('node-label');
    if (labelInput) {
      labelInput.addEventListener('input', () => this.updateLabel(labelInput.value));
    }

    const pos = document.getElementById('prompt-positive');
    const neg = document.getElementById('prompt-negative');

    if (pos) pos.addEventListener('input', () => {
      this.positive = pos.value;
      this.updateVisual();
    });
    if (neg) neg.addEventListener('input', () => {
      this.negative = neg.value;
      this.updateVisual();
    });

    document.getElementById('prompt-save')?.addEventListener('click', () => {
      const data = JSON.stringify({ positive: this.positive, negative: this.negative }, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'prompt.json';
      a.click();
      URL.revokeObjectURL(url);
    });

    document.getElementById('prompt-load')?.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,.txt';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        try {
          const data = JSON.parse(text);
          this.positive = data.positive || '';
          this.negative = data.negative || '';
        } catch {
          // Plain text file — treat as positive prompt
          this.positive = text.trim();
        }
        if (pos) pos.value = this.positive;
        if (neg) neg.value = this.negative;
        this.updateVisual();
      };
      input.click();
    });
  }

  serialize() {
    return {
      id: this.id,
      type: this.type,
      positive: this.positive,
      negative: this.negative,
      label: this.label,
      x: this.fabricObject?.left || 0,
      y: this.fabricObject?.top || 0,
    };
  }
}
