// WorkflowNode — selects a ComfyUI template and configures params
// Inputs (prompt, image) come from connected nodes — not from this node's properties

class WorkflowNode {
  constructor(id, { templateId, templateName, templateColor, inputs, params, workflow, label, backend, bflEndpoint, cost } = {}) {
    this.id = id;
    this.type = 'workflow';
    this.templateId = templateId || '';
    this.templateName = templateName || 'Workflow';
    this.templateColor = templateColor || '#4a9eff';
    this.cost = cost || null;
    this.templateInputs = inputs || [];  // from config.json
    this.templateParams = params || [];
    this.workflow = workflow || {};
    this.label = label || '';
    this.backend = backend || 'comfy'; // 'comfy' or 'bfl'
    this.bflEndpoint = bflEndpoint || '';
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

    // Remove optional unconnected nodes (e.g. LoadImage for optional reference)
    for (const input of this.templateInputs) {
      if (input.optional && !this.connectedInputs[input.name] && input.target_node) {
        delete wf[input.target_node];
      }
    }

    // Apply connected inputs
    for (const input of this.templateInputs) {
      const conn = this.connectedInputs[input.name];
      if (!conn) continue;

      const sourceNode = engine.nodes.get(conn.nodeId);
      if (!sourceNode) continue;

      // InpaintNode as source — provides image+mask+prompt
      if (sourceNode.type === 'inpaint') {
        const imgData = sourceNode.getImageData(engine);
        // prompts come from direct Prompt node connection

        if (input.type === 'image' && imgData) {
          if (input.target_node) {
            const node = wf[input.target_node];
            if (node) node.inputs[input.target_field || 'image'] = imgData.comfyName;
          }
          // Wire mask
          if (input.uses_mask && imgData.maskComfyName) {
            const maskLoadId = input.target_node + '_mask_load';
            const maskConvertId = input.target_node + '_mask_convert';
            // Load the B/W mask image
            wf[maskLoadId] = {
              class_type: 'LoadImage',
              inputs: { image: imgData.maskComfyName },
            };
            // Convert B/W image to mask (use red channel)
            wf[maskConvertId] = {
              class_type: 'ImageToMask',
              inputs: { image: [maskLoadId, 0], channel: 'red' },
            };
            // Optional feather (blur mask edges for smooth transitions)
            const featherVal = parseInt(this.paramValues?.feather) || 0;
            let finalMaskRef = [maskConvertId, 0];
            if (featherVal > 0) {
              const featherId = input.target_node + '_mask_feather';
              wf[featherId] = {
                class_type: 'FeatherMask',
                inputs: { mask: [maskConvertId, 0], left: featherVal, top: featherVal, right: featherVal, bottom: featherVal },
              };
              finalMaskRef = [featherId, 0];
            }
            for (const nodeKey of Object.keys(wf)) {
              if (wf[nodeKey].class_type === 'VAEEncodeForInpaint') {
                wf[nodeKey].inputs.mask = finalMaskRef;
              }
            }
          }
          if (input.link_output) {
            const lo = input.link_output;
            const targetNode = wf[lo.to_node];
            if (targetNode) targetNode.inputs[lo.to_field] = [lo.from_node, lo.from_output];
          }
        }

        continue;
      }

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
        // If this input uses a mask and the image has one, wire it up
        // The LoadImage node outputs [IMAGE, MASK] — mask is output index 1
        // VAEEncodeForInpaint expects mask from the LoadImage node
        if (input.uses_mask && sourceNode.maskComfyName) {
          const maskLoadId = input.target_node + '_mask_load';
          const maskConvertId = input.target_node + '_mask_convert';
          wf[maskLoadId] = {
            class_type: 'LoadImage',
            inputs: { image: sourceNode.maskComfyName },
          };
          wf[maskConvertId] = {
            class_type: 'ImageToMask',
            inputs: { image: [maskLoadId, 0], channel: 'red' },
          };
          // Optional feather (blur mask edges for smooth transitions)
          const featherVal2 = parseInt(this.paramValues?.feather) || 0;
          let finalMaskRef2 = [maskConvertId, 0];
          if (featherVal2 > 0) {
            const featherId2 = input.target_node + '_mask_feather';
            wf[featherId2] = {
              class_type: 'FeatherMask',
              inputs: { mask: [maskConvertId, 0], left: featherVal2, top: featherVal2, right: featherVal2, bottom: featherVal2 },
            };
            finalMaskRef2 = [featherId2, 0];
          }
          for (const nodeKey of Object.keys(wf)) {
            if (wf[nodeKey].class_type === 'VAEEncodeForInpaint') {
              wf[nodeKey].inputs.mask = finalMaskRef2;
            }
          }
        }
        // If this input has a link_output, wire the loader's output to the target node
        if (input.link_output) {
          const lo = input.link_output;
          const targetNode = wf[lo.to_node];
          if (targetNode) {
            targetNode.inputs[lo.to_field] = [lo.from_node, lo.from_output];
          }
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
      ${this.cost ? `<div class="prop-section">
        <label class="prop-section-label">💰 Cost per run</label>
        <div class="prop-value" style="padding:4px 0;color:${this.cost.credits > 0 ? '#ff9800' : '#4caf50'}">${this.cost.credits > 0 ? this.cost.credits + ' credits (~$' + (this.cost.credits / 211).toFixed(2) + ')' : 'Free / separate billing'}${this.cost.note ? ' — ' + this.cost.note : ''}</div>` : ''}
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
          ${conn ? `<button class="prop-btn disconnect-btn" data-disconnect="${input.name}" style="margin-top:4px;font-size:11px;padding:4px 8px;width:100%">✂️ Disconnect</button>` : ''}
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

    // Disconnect buttons
    document.querySelectorAll('.disconnect-btn').forEach(el => {
      el.addEventListener('click', () => {
        const inputName = el.dataset.disconnect;
        const oldConn = this.connectedInputs[inputName];
        delete this.connectedInputs[inputName];
        // Remove visual connection
        if (oldConn && window._engine) {
          window._engine.removeConnectionBetween(oldConn.nodeId, this.id);
        }
        // Re-render properties
        if (window._refreshProperties) window._refreshProperties(this);
      });
    });
  }

  serialize() {
    return {
      id: this.id,
      type: this.type,
      templateId: this.templateId,
      templateName: this.templateName,
      cost: this.cost,
      templateColor: this.templateColor,
      inputs: this.templateInputs,
      params: this.templateParams,
      workflow: this.workflow,
      paramValues: this.paramValues,
      connectedInputs: this.connectedInputs,
      label: this.label,
      backend: this.backend,
      bflEndpoint: this.bflEndpoint,
      x: this.fabricObject?.left || 0,
      y: this.fabricObject?.top || 0,
    };
  }
}
