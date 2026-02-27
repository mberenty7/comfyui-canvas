// WorkflowNode — represents a ComfyUI workflow on the canvas

class WorkflowNode {
  constructor(id, template, engine) {
    this.id = id;
    this.template = template;
    this.engine = engine;
    this.type = 'workflow';
    this.params = {};
    this.inputs = {};       // inputName -> { imageUrl, comfyName }
    this.outputs = {};      // 'output' -> { imageUrl, comfyName }
    this.fabricObject = null;
    this.isGenerating = false;
    this.outputImages = [];

    // Initialize default params from template
    if (template.params) {
      for (const p of template.params) {
        this.params[p.name] = p.default !== undefined ? p.default : '';
      }
    }
  }

  createVisual(x, y) {
    const width = 220;
    const inputCount = (this.template.inputs || []).length;
    const paramCount = (this.template.params || []).filter(p => p.type !== 'hidden').length;
    const height = 60 + inputCount * 24 + Math.min(paramCount, 3) * 20;

    // Background
    const bg = new fabric.Rect({
      width, height,
      fill: '#1e1e3a',
      stroke: this.template.color || '#e94560',
      strokeWidth: 2,
      rx: 8, ry: 8,
    });

    // Title bar
    const titleBg = new fabric.Rect({
      width: width - 4,
      height: 28,
      fill: this.template.color || '#e94560',
      rx: 6, ry: 6,
      left: 2, top: 2,
    });

    // Title text
    const title = new fabric.Text(this.template.name || 'Node', {
      fontSize: 12,
      fill: '#fff',
      fontWeight: 'bold',
      fontFamily: 'Inter, sans-serif',
      left: 10, top: 7,
    });

    // Input ports
    const ports = [];
    (this.template.inputs || []).forEach((input, i) => {
      const y = 40 + i * 24;
      const circle = new fabric.Circle({
        radius: 5,
        fill: '#4a9eff',
        stroke: '#fff',
        strokeWidth: 1,
        left: -5, top: y,
      });
      const label = new fabric.Text(input.name, {
        fontSize: 10,
        fill: '#aaa',
        fontFamily: 'monospace',
        left: 10, top: y - 3,
      });
      ports.push(circle, label);
    });

    // Output port
    const outY = height / 2;
    const outCircle = new fabric.Circle({
      radius: 5,
      fill: '#4caf50',
      stroke: '#fff',
      strokeWidth: 1,
      left: width - 5, top: outY - 5,
    });
    const outLabel = new fabric.Text('output', {
      fontSize: 10,
      fill: '#aaa',
      fontFamily: 'monospace',
      left: width - 50, top: outY - 8,
    });

    // Summary text (key params)
    const summaryLines = [];
    (this.template.params || []).slice(0, 3).forEach(p => {
      if (p.type !== 'hidden') {
        summaryLines.push(`${p.label || p.name}: ${this.params[p.name] || p.default || '?'}`);
      }
    });
    const summary = new fabric.Text(summaryLines.join('\n'), {
      fontSize: 9,
      fill: '#666',
      fontFamily: 'monospace',
      left: 10,
      top: 40 + (this.template.inputs || []).length * 24 + 4,
      lineHeight: 1.4,
    });

    const group = new fabric.Group(
      [bg, titleBg, title, ...ports, outCircle, outLabel, summary],
      { left: x, top: y, hasControls: false, subTargetCheck: true }
    );

    group.nodeId = this.id;
    this.fabricObject = group;
    return group;
  }

  setInput(inputName, data) {
    this.inputs[inputName] = data;
  }

  getOutputImage() {
    return this.outputs.output?.imageUrl;
  }

  getComfyName() {
    return this.outputs.output?.comfyName;
  }

  // Build the ComfyUI workflow with current params and inputs
  buildWorkflow() {
    const wf = JSON.parse(JSON.stringify(this.template.workflow));

    // Apply params
    for (const p of this.template.params || []) {
      if (p.target_node && p.target_field) {
        const node = wf[p.target_node];
        if (node) {
          let value = this.params[p.name];
          if (p.type === 'number' || p.type === 'slider') value = parseFloat(value);
          if (p.type === 'integer') value = parseInt(value);
          node.inputs[p.target_field] = value;
        }
      }
    }

    // Apply image inputs
    for (const input of this.template.inputs || []) {
      const data = this.inputs[input.name];
      if (data?.comfyName && input.target_node) {
        const node = wf[input.target_node];
        if (node) {
          node.inputs[input.target_field || 'image'] = data.comfyName;
        }
      }
    }

    return wf;
  }

  async generate() {
    if (this.isGenerating) return;
    this.isGenerating = true;
    this._setVisualState('generating');

    try {
      const workflow = this.buildWorkflow();

      // Submit to ComfyUI
      const resp = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow, nodeId: this.id }),
      });

      const { prompt_id } = await resp.json();

      // Poll for completion
      const result = await this._pollResult(prompt_id);

      // Get output images
      if (result) {
        const outputs = result.outputs || {};
        for (const nodeKey of Object.keys(outputs)) {
          const nodeOutput = outputs[nodeKey];
          if (nodeOutput.images) {
            for (const img of nodeOutput.images) {
              const imageUrl = `/api/comfy-image?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=output`;
              this.outputs.output = { imageUrl, comfyName: img.filename };
              this.outputImages.push({ imageUrl, filename: img.filename });
            }
          }
        }
      }

      this._setVisualState('complete');
      return this.outputs.output;
    } catch (err) {
      console.error('Generation failed:', err);
      this._setVisualState('error');
      throw err;
    } finally {
      this.isGenerating = false;
    }
  }

  async _pollResult(promptId) {
    const maxWait = 300000; // 5 min
    const start = Date.now();

    while (Date.now() - start < maxWait) {
      const resp = await fetch(`/api/history/${promptId}`);
      const history = await resp.json();
      if (history[promptId]) return history[promptId];
      await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error('Generation timed out');
  }

  _setVisualState(state) {
    if (!this.fabricObject) return;
    const bg = this.fabricObject._objects[0]; // background rect

    switch (state) {
      case 'generating':
        bg.set('stroke', '#ff9800');
        bg.set('strokeDashArray', [6, 3]);
        break;
      case 'complete':
        bg.set('stroke', '#4caf50');
        bg.set('strokeDashArray', null);
        break;
      case 'error':
        bg.set('stroke', '#f44336');
        bg.set('strokeDashArray', null);
        break;
      default:
        bg.set('stroke', this.template.color || '#e94560');
        bg.set('strokeDashArray', null);
    }
    this.engine.fabricCanvas.renderAll();
  }

  // Render settings panel HTML
  renderSettings() {
    let html = '';

    // Inputs
    for (const input of this.template.inputs || []) {
      const data = this.inputs[input.name];
      html += `
        <div class="setting-group">
          <label>${input.label || input.name}</label>
          <div class="image-input ${data ? 'has-image' : ''}" data-input="${input.name}">
            ${data ? `<img src="${data.imageUrl}" alt="${input.name}">` : '📷 Drop image or click to connect'}
          </div>
        </div>
      `;
    }

    // Params
    for (const p of this.template.params || []) {
      if (p.type === 'hidden') continue;

      const value = this.params[p.name];

      if (p.type === 'prompt' || p.type === 'textarea') {
        html += `
          <div class="setting-group">
            <label>${p.label || p.name}</label>
            <textarea data-param="${p.name}">${value || ''}</textarea>
          </div>
        `;
      } else if (p.type === 'slider' || p.type === 'range') {
        html += `
          <div class="setting-group">
            <label>${p.label || p.name}</label>
            <div class="range-row">
              <input type="range" data-param="${p.name}" min="${p.min || 0}" max="${p.max || 1}" step="${p.step || 0.05}" value="${value}">
              <span class="range-value">${value}</span>
            </div>
          </div>
        `;
      } else if (p.type === 'select') {
        const options = (p.options || []).map(o => `<option value="${o}" ${o === value ? 'selected' : ''}>${o}</option>`).join('');
        html += `
          <div class="setting-group">
            <label>${p.label || p.name}</label>
            <select data-param="${p.name}">${options}</select>
          </div>
        `;
      } else if (p.type === 'integer' || p.type === 'number') {
        html += `
          <div class="setting-group">
            <label>${p.label || p.name}</label>
            <input type="number" data-param="${p.name}" value="${value}" min="${p.min}" max="${p.max}" step="${p.step || 1}">
          </div>
        `;
      } else if (p.type === 'seed') {
        html += `
          <div class="setting-group">
            <label>${p.label || 'Seed'}</label>
            <div class="range-row">
              <input type="number" data-param="${p.name}" value="${value}" style="flex:1">
              <button onclick="document.querySelector('[data-param=${p.name}]').value = Math.floor(Math.random()*999999); document.querySelector('[data-param=${p.name}]').dispatchEvent(new Event('change'))">🎲</button>
            </div>
          </div>
        `;
      } else {
        html += `
          <div class="setting-group">
            <label>${p.label || p.name}</label>
            <input type="text" data-param="${p.name}" value="${value || ''}">
          </div>
        `;
      }
    }

    // Output preview
    if (this.outputImages.length > 0) {
      html += '<div class="setting-group"><label>Output</label>';
      for (const img of this.outputImages) {
        html += `<img src="${img.imageUrl}" style="max-width:100%;border-radius:4px;margin-top:4px;">`;
      }
      html += '</div>';
    }

    return html;
  }
}
