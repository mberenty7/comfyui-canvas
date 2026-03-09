// GenerateNode — executes a connected workflow N times with seed control
// Input: a WorkflowNode (which already has its prompt/image connections)
// Output: N Image nodes placed on canvas

class GenerateNode {
  constructor(id, { count, seedMode, baseSeed, label } = {}) {
    this.id = id;
    this.type = 'generate';
    this.count = count || 1;
    this.seedMode = seedMode || 'increment'; // 'increment', 'random', 'fixed'
    this.baseSeed = baseSeed || Math.floor(Math.random() * 999999);
    this.outputName = (arguments[1] && arguments[1].outputName) || 'canvas_output';
    this.label = label || '';
    this.connectedWorkflow = null; // { nodeId }
    this.isRunning = false;
    this.fabricObject = null;
  }

  createVisual(x, y) {
    const width = 160;
    const height = 60;

    const bg = new fabric.Rect({
      width, height,
      fill: '#1e1e3a',
      stroke: '#4caf50',
      strokeWidth: 1.5,
      rx: 8, ry: 8,
    });

    const typeLabel = new fabric.Text('Generate', {
      fontSize: 10,
      fill: '#4caf50',
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

    const statusText = new fabric.Text('Ready', {
      fontSize: 9,
      fill: '#666',
      fontFamily: 'monospace',
      left: 8, top: 22,
    });

    // Input port on left (workflow)
    const inPort = new fabric.Circle({
      radius: 5,
      fill: '#4a9eff',
      stroke: '#fff',
      strokeWidth: 1.5,
      left: -5, top: height / 2 - 5,
    });

    // Output port on right (results)
    const outPort = new fabric.Circle({
      radius: 6,
      fill: '#4caf50',
      stroke: '#fff',
      strokeWidth: 2,
      left: width - 12, top: height / 2 - 6,
    });

    const group = new fabric.Group([bg, typeLabel, userLabel, statusText, inPort, outPort], {
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

  setStatus(text) {
    if (this.fabricObject) {
      const statusObj = this.fabricObject._objects[3];
      if (statusObj) { statusObj.set('text', text); this.fabricObject.canvas?.renderAll(); }
    }
  }

  setBorderState(state) {
    if (!this.fabricObject) return;
    const bg = this.fabricObject._objects[0];
    switch (state) {
      case 'running':
        bg.set({ stroke: '#ff9800', strokeDashArray: [6, 3] });
        break;
      case 'done':
        bg.set({ stroke: '#4caf50', strokeDashArray: null });
        break;
      case 'error':
        bg.set({ stroke: '#f44336', strokeDashArray: null });
        break;
      default:
        bg.set({ stroke: '#4caf50', strokeDashArray: null });
    }
    this.fabricObject.canvas?.renderAll();
  }

  getSeeds() {
    const seeds = [];
    for (let i = 0; i < this.count; i++) {
      switch (this.seedMode) {
        case 'increment': seeds.push(this.baseSeed + i); break;
        case 'random': seeds.push(Math.floor(Math.random() * 999999)); break;
        case 'fixed': seeds.push(this.baseSeed); break;
      }
    }
    return seeds;
  }

  // Run generation — returns array of { imageUrl, comfyName, seed }
  async run(engine) {
    if (this.isRunning) return [];
    if (!this.connectedWorkflow) throw new Error('No workflow connected');

    const workflowNode = engine.nodes.get(this.connectedWorkflow.nodeId);
    if (!workflowNode || workflowNode.type !== 'workflow') throw new Error('Connected node is not a workflow');

    this.isRunning = true;
    this.setBorderState('running');
    const seeds = this.getSeeds();
    const results = [];

    for (let i = 0; i < seeds.length; i++) {
      this.setStatus(`${i + 1}/${seeds.length}...`);

      try {
        // Override seed in workflow params
        const seedParam = workflowNode.templateParams.find(p => p.type === 'seed');
        if (seedParam) {
          workflowNode.paramValues[seedParam.name] = seeds[i];
        }

        // Build workflow with all connections resolved
        const workflow = workflowNode.buildWorkflow(engine);

        // Set output filename prefix on SaveImage nodes
        for (const nodeKey of Object.keys(workflow)) {
          if (workflow[nodeKey].class_type === 'SaveImage') {
            workflow[nodeKey].inputs.filename_prefix = this.outputName;
          }
        }

        // Submit to ComfyUI
        const resp = await fetch('/api/comfy/prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workflow }),
        });
        const data = await resp.json();

        if (window.addLog) window.addLog(`Prompt response: ${JSON.stringify(data).substring(0, 200)}`, 'info');

        if (data.error) throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
        if (data.node_errors && Object.keys(data.node_errors).length > 0) {
          const errs = Object.values(data.node_errors).map(e => e.errors?.map(x => x.message).join(', ') || 'Unknown node error').join('; ');
          throw new Error(errs);
        }

        if (!data.prompt_id) throw new Error('No prompt_id returned — submission may have failed');

        if (window.addLog) window.addLog(`Prompt submitted: ${data.prompt_id?.substring(0, 12)}...`, 'info');

        // Poll for result
        const result = await this._pollResult(data.prompt_id);
        if (window.addLog) window.addLog(`Poll result keys: ${result ? Object.keys(result).join(',') : 'null'}, outputs: ${result ? JSON.stringify(Object.keys(result.outputs || {})) : 'none'}`, 'info');
        if (result) {
          const outputs = result.outputs || {};
          for (const nodeKey of Object.keys(outputs)) {
            const nodeOutput = outputs[nodeKey];
            if (nodeOutput.images) {
              for (const img of nodeOutput.images) {
                const imageUrl = `/api/comfy/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=output`;
                results.push({ imageUrl, comfyName: img.filename, seed: seeds[i] });

                // Save image + sidecar metadata to output directory
                const metadata = this._buildMetadata(workflowNode, engine, seeds[i]);
                fetch('/api/comfy/save-output', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    filename: img.filename,
                    subfolder: img.subfolder || '',
                    type: img.type || 'output',
                    metadata,
                  }),
                }).catch(err => console.warn('Failed to save output:', err));
              }
            }
          }
        }
      } catch (err) {
        console.error(`Generation ${i + 1} failed:`, err);
        this.setStatus(`Error: ${err.message}`);
        this.setBorderState('error');
      }
    }

    this.isRunning = false;
    this.setStatus(`Done — ${results.length} image${results.length !== 1 ? 's' : ''}`);
    this.setBorderState('done');
    return results;
  }

  _buildMetadata(workflowNode, engine, seed) {
    const meta = {
      timestamp: new Date().toISOString(),
      template: workflowNode.templateName || workflowNode.templateId || 'unknown',
      seed,
      seedMode: this.seedMode,
      outputName: this.outputName,
    };

    // Collect all workflow params (steps, CFG, sampler, checkpoint, resolution, etc.)
    if (workflowNode.templateParams) {
      meta.params = {};
      for (const p of workflowNode.templateParams) {
        const val = workflowNode.paramValues?.[p.name];
        if (val !== undefined && val !== null && val !== '') {
          meta.params[p.name] = val;
        } else if (p.default !== undefined) {
          meta.params[p.name] = p.default;
        }
      }
    }

    // Collect connected prompts
    if (workflowNode.connectedInputs) {
      for (const [inputName, conn] of Object.entries(workflowNode.connectedInputs)) {
        const nodeId = typeof conn === 'string' ? conn : conn?.nodeId;
        const sourceNode = engine.nodes.get(nodeId);
        if (sourceNode?.type === 'prompt') {
          meta.positive = sourceNode.positive || '';
          meta.negative = sourceNode.negative || '';
        } else if (sourceNode?.type === 'image') {
          meta[inputName + '_image'] = sourceNode.filename || sourceNode.comfyName || '';
        }
      }
    }

    return meta;
  }

  async _pollResult(promptId) {
    const maxWait = 300000;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const resp = await fetch(`/api/comfy/history/${promptId}`);
      const history = await resp.json();
      if (history[promptId]) {
        const entry = history[promptId];
        const status = entry.status?.status_str;
        if (status === 'error') {
          // Extract error from messages
          const errMsg = entry.status?.messages
            ?.filter(m => m[0] === 'execution_error')
            ?.map(m => m[1]?.exception_message || 'Unknown error')
            ?.join('; ') || 'ComfyUI execution error';
          if (window.addLog) window.addLog(`ComfyUI error: ${errMsg}`, 'error');
          throw new Error(errMsg);
        }
        return entry;
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error('Generation timed out');
  }

  renderProperties() {
    const workflowStatus = this.connectedWorkflow ? '✅ Connected' : 'Click to connect a workflow node';

    return `
      <div class="prop-section">
        <label class="prop-section-label">Label</label>
        <input type="text" id="node-label" class="prop-input" value="${this.label}" placeholder="e.g. Batch Run">
      </div>
      <div class="prop-section">
        <label class="prop-section-label">Output Name</label>
        <input type="text" id="gen-output-name" class="prop-input" value="${this.outputName}" placeholder="e.g. paranorman_style">
      </div>
      <div class="prop-section">
        <label class="prop-section-label">⚙️ Workflow</label>
        <div class="workflow-input-slot" data-connect="workflow" style="cursor:pointer">
          ${workflowStatus}
        </div>
        ${this.connectedWorkflow ? `<button class="prop-btn disconnect-workflow-btn" style="margin-top:4px;font-size:11px;padding:4px 8px;width:100%">✂️ Disconnect</button>` : ''}
      </div>
      <div class="prop-section">
        <label class="prop-section-label">Number of Generations</label>
        <input type="number" id="gen-count" class="prop-input" value="${this.count}" min="1" max="100">
      </div>
      <div class="prop-section">
        <label class="prop-section-label">Seed Mode</label>
        <select id="gen-seed-mode" class="prop-input">
          <option value="increment" ${this.seedMode === 'increment' ? 'selected' : ''}>Increment (seed, seed+1, seed+2...)</option>
          <option value="random" ${this.seedMode === 'random' ? 'selected' : ''}>Random each</option>
          <option value="fixed" ${this.seedMode === 'fixed' ? 'selected' : ''}>Fixed (same seed)</option>
        </select>
      </div>
      <div class="prop-section">
        <label class="prop-section-label">Base Seed</label>
        <div class="range-row">
          <input type="number" id="gen-base-seed" class="prop-input" value="${this.baseSeed}" style="flex:1">
          <button class="prop-btn" style="flex:0;padding:6px 10px" id="gen-randomize-seed">🎲</button>
        </div>
      </div>
      <div class="prop-section">
        <button id="btn-run-generate" class="generate-btn" ${this.isRunning ? 'disabled' : ''}>
          ${this.isRunning ? '⏳ Running...' : '▶ Generate'}
        </button>
      </div>
    `;
  }

  bindProperties() {
    const labelInput = document.getElementById('node-label');
    if (labelInput) labelInput.addEventListener('input', () => this.updateLabel(labelInput.value));

    const outputNameInput = document.getElementById('gen-output-name');
    if (outputNameInput) outputNameInput.addEventListener('input', () => { this.outputName = outputNameInput.value; });

    const countInput = document.getElementById('gen-count');
    if (countInput) countInput.addEventListener('change', () => { this.count = parseInt(countInput.value) || 1; });

    const modeSelect = document.getElementById('gen-seed-mode');
    if (modeSelect) modeSelect.addEventListener('change', () => { this.seedMode = modeSelect.value; });

    const seedInput = document.getElementById('gen-base-seed');
    if (seedInput) seedInput.addEventListener('change', () => { this.baseSeed = parseInt(seedInput.value) || 0; });

    document.getElementById('gen-randomize-seed')?.addEventListener('click', () => {
      this.baseSeed = Math.floor(Math.random() * 999999);
      if (seedInput) seedInput.value = this.baseSeed;
    });

    // Connect workflow slot
    document.querySelector('[data-connect="workflow"]')?.addEventListener('click', () => {
      window._connectMode = { targetNodeId: this.id, connectType: 'workflow', expects: 'workflow' };
      document.querySelector('[data-connect="workflow"]').textContent = '🔗 Click a workflow node...';
    });

    // Disconnect workflow
    document.querySelector('.disconnect-workflow-btn')?.addEventListener('click', () => {
      const oldConn = this.connectedWorkflow;
      this.connectedWorkflow = null;
      if (oldConn && window._engine) {
        window._engine.removeConnectionBetween(oldConn.nodeId, this.id);
      }
      if (window._refreshProperties) window._refreshProperties(this);
    });

    // Generate button
    document.getElementById('btn-run-generate')?.addEventListener('click', () => {
      if (window._onGenerate) window._onGenerate(this);
    });
  }

  serialize() {
    return {
      id: this.id,
      type: this.type,
      count: this.count,
      seedMode: this.seedMode,
      baseSeed: this.baseSeed,
      outputName: this.outputName,
      label: this.label,
      connectedWorkflow: this.connectedWorkflow,
      x: this.fabricObject?.left || 0,
      y: this.fabricObject?.top || 0,
    };
  }
}
