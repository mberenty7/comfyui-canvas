// WorkflowNode — selects a ComfyUI template and configures params
// Inputs (prompt, image) come from connected nodes — not from this node's properties

class WorkflowNode {
  constructor(id, { templateId, templateName, templateColor, inputs, params, workflow, label } = {}) {
    this.id = id;
    this.type = 'workflow';
    this.templateId = templateId || '';
    this.templateName = templateName || 'Workflow';
    this.templateColor = templateColor || '#4a9eff';
    this.templateInputs = inputs || [];  // from config.json
    this.templateParams = params || [];
    this.workflow = workflow || {};
    this.label = label || '';
    this.paramValues = {};
    this.connectedInputs = {}; // inputName → { nodeId }
    this.fabricObject = null;

    // Set param defaults
    for (const p of this.templateParams) {
      this.paramValues[p.name] = p.default !== undefined ? p.default : '';
    }
  }

  createVisual(x, y) {
    const width = 180;
    const inputCount = this.templateInputs.length;
    const height = 50 + inputCount * 20;

    const bg = new fabric.Rect({
      width, height,
      fill: '#1e1e3a',
      stroke: this.templateColor,
      strokeWidth: 1.5,
      rx: 8, ry: 8,
    });

    const typeLabel = new fabric.Text(this.templateName, {
      fontSize: 10,
      fill: this.templateColor,
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

    // Input ports on left side
    const ports = [];
    this.templateInputs.forEach((input, i) => {
      const py = 28 + i * 20;
      const color = input.type === 'prompt' ? '#a855f7' : '#4a9eff';
      const dot = new fabric.Circle({
        radius: 5,
        fill: color,
        stroke: '#fff',
        strokeWidth: 1.5,
        left: -5, top: py,
      });
      const lbl = new fabric.Text(input.label || input.name, {
        fontSize: 9,
        fill: '#666',
        fontFamily: 'monospace',
        left: 10, top: py - 2,
      });
      ports.push(dot, lbl);
    });

    // Output port on right
    const outPort = new fabric.Circle({
      radius: 6,
      fill: this.templateColor,
      stroke: '#fff',
      strokeWidth: 2,
      left: width - 12,
      top: height / 2 - 6,
    });

    const group = new fabric.Group([bg, typeLabel, userLabel, ...ports, outPort], {
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
      const labelObj = this.fabricObject._objects[2];
      if (labelObj) { labelObj.set('text', text); this.fabricObject.canvas?.renderAll(); }
    }
  }

  connectInput(inputName, sourceNodeId) {
    this.connectedInputs[inputName] = { nodeId: sourceNodeId };
  }

  // Build the final ComfyUI workflow with all params and connected inputs applied
  buildWorkflow(engine) {
    const wf = JSON.parse(JSON.stringify(this.workflow));

    // Apply params
    for (const p of this.templateParams) {
      if (p.target_node && p.target_field) {
        const node = wf[p.target_node];
        if (node) {
          let value = this.paramValues[p.name];
          if (p.type === 'number' || p.type === 'slider') value = parseFloat(value);
          if (p.type === 'integer') value = parseInt(value);
          node.inputs[p.target_field] = value;
        }
      }
    }

    // Apply connected inputs
    for (const input of this.templateInputs) {
      const conn = this.connectedInputs[input.name];
      if (!conn) continue;

      const sourceNode = engine.nodes.get(conn.nodeId);
      if (!sourceNode) continue;

      if (input.type === 'prompt' && sourceNode.type === 'prompt') {
        // Wire positive and negative prompt text into the workflow
        if (input.target_positive) {
          const node = wf[input.target_positive.node];
          if (node) node.inputs[input.target_positive.field] = sourceNode.positive || '';
        }
        if (input.target_negative) {
          const node = wf[input.target_negative.node];
          if (node) node.inputs[input.target_negative.field] = sourceNode.negative || '';
        }
      } else if (input.type === 'image' && sourceNode.type === 'image') {
        // Wire image filename into the workflow
        if (input.target_node) {
          const node = wf[input.target_node];
          if (node) node.inputs[input.target_field || 'image'] = sourceNode.comfyName;
        }
      }
    }

    return wf;
  }

  renderProperties() {
    let html = `
      <div class="prop-section">
        <label class="prop-section-label">Label</label>
        <input type="text" id="node-label" class="prop-input" value="${this.label}" placeholder="e.g. Style Transfer">
      </div>
      <div class="prop-section">
        <label class="prop-section-label">Template</label>
        <div class="prop-value" style="padding:4px 0;color:${this.templateColor}">${this.templateName}</div>
      </div>
    `;

    // Connected inputs
    for (const input of this.templateInputs) {
      const conn = this.connectedInputs[input.name];
      const icon = input.type === 'prompt' ? '✏️' : '📷';
      const expectedType = input.type === 'prompt' ? 'prompt' : 'image';
      html += `
        <div class="prop-section">
          <label class="prop-section-label">${icon} ${input.label || input.name}</label>
          <div class="workflow-input-slot" data-input="${input.name}" data-expects="${expectedType}">
            ${conn ? `✅ Connected` : `Click to connect a ${input.type} node`}
          </div>
        </div>
      `;
    }

    // Params (no prompt types — those come from connections now)
    for (const p of this.templateParams) {
      if (p.type === 'hidden') continue;
      const value = this.paramValues[p.name];

      if (p.type === 'slider' || p.type === 'range') {
        html += `
          <div class="prop-section">
            <label class="prop-section-label">${p.label || p.name}</label>
            <div class="range-row">
              <input type="range" data-param="${p.name}" min="${p.min || 0}" max="${p.max || 1}" step="${p.step || 0.05}" value="${value}">
              <span class="range-value">${value}</span>
            </div>
          </div>
        `;
      } else if (p.type === 'select') {
        const opts = (p.options || []).map(o => `<option value="${o}" ${o == value ? 'selected' : ''}>${o}</option>`).join('');
        html += `
          <div class="prop-section">
            <label class="prop-section-label">${p.label || p.name}</label>
            <select data-param="${p.name}" class="prop-input">${opts}</select>
          </div>
        `;
      } else if (p.type === 'seed') {
        html += `
          <div class="prop-section">
            <label class="prop-section-label">${p.label || 'Seed'}</label>
            <div class="range-row">
              <input type="number" data-param="${p.name}" class="prop-input" value="${value}" style="flex:1">
              <button class="prop-btn" style="flex:0;padding:6px 10px" onclick="document.querySelector('[data-param=${p.name}]').value=Math.floor(Math.random()*999999);document.querySelector('[data-param=${p.name}]').dispatchEvent(new Event('change'))">🎲</button>
            </div>
          </div>
        `;
      } else {
        html += `
          <div class="prop-section">
            <label class="prop-section-label">${p.label || p.name}</label>
            <input type="${p.type === 'integer' ? 'number' : 'text'}" data-param="${p.name}" class="prop-input" value="${value}" ${p.min !== undefined ? `min="${p.min}"` : ''} ${p.max !== undefined ? `max="${p.max}"` : ''}>
          </div>
        `;
      }
    }

    return html;
  }

  bindProperties() {
    const labelInput = document.getElementById('node-label');
    if (labelInput) labelInput.addEventListener('input', () => this.updateLabel(labelInput.value));

    // Param listeners
    document.querySelectorAll('[data-param]').forEach(el => {
      const handler = () => {
        this.paramValues[el.dataset.param] = el.value;
        if (el.type === 'range' && el.nextElementSibling) {
          el.nextElementSibling.textContent = el.value;
        }
      };
      el.addEventListener('input', handler);
      el.addEventListener('change', handler);
    });

    // Input slot click → connect mode
    document.querySelectorAll('.workflow-input-slot').forEach(el => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        const inputName = el.dataset.input;
        const expects = el.dataset.expects;
        window._connectMode = { targetNodeId: this.id, inputName, expects };
        el.textContent = `🔗 Click a ${expects} node on the canvas...`;
      });
    });
  }

  serialize() {
    return {
      id: this.id,
      type: this.type,
      templateId: this.templateId,
      templateName: this.templateName,
      templateColor: this.templateColor,
      inputs: this.templateInputs,
      params: this.templateParams,
      workflow: this.workflow,
      paramValues: this.paramValues,
      connectedInputs: this.connectedInputs,
      label: this.label,
      x: this.fabricObject?.left || 0,
      y: this.fabricObject?.top || 0,
    };
  }
}
