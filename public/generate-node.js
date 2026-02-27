// GenerateNode — executes a connected workflow N times with seed control
// Input: a WorkflowNode
// Output: N Image nodes placed on canvas

class GenerateNode {
  constructor(id, { count, seedMode, baseSeed, label } = {}) {
    this.id = id;
    this.type = 'generate';
    this.count = count || 1;
    this.seedMode = seedMode || 'increment'; // 'increment', 'random', 'fixed'
    this.baseSeed = baseSeed || Math.floor(Math.random() * 999999);
    this.label = label || '';
    this.connectedWorkflow = null; // { nodeId }
    this.connectedPrompt = null;   // { nodeId }
    this.isRunning = false;
    this.progress = { current: 0, total: 0, step: 0, maxStep: 0 };
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
        case 'increment':
          seeds.push(this.baseSeed + i);
          break;
        case 'random':
          seeds.push(Math.floor(Math.random() * 999999));
          break;
        case 'fixed':
          seeds.push(this.baseSeed);
          break;
      }
    }
    return seeds;
  }

  // Run generation — called from app.js
  // Returns array of { imageUrl, comfyName, seed }
  async run(engine) {
    if (this.isRunning) return [];
    if (!this.connectedWorkflow) throw new Error('No workflow connected');

    const workflowNode = engine.nodes.get(this.connectedWorkflow.nodeId);
    if (!workflowNode || workflowNode.type !== 'workflow') throw new Error('Connected node is not a workflow');

    // If there's a connected prompt, apply it to the workflow
    if (this.connectedPrompt) {
      const promptNode = engine.nodes.get(this.connectedPrompt.nodeId);
      if (promptNode && promptNode.type === 'prompt') {
        workflowNode.applyPrompt(promptNode);
      }
    }

    this.isRunning = true;
    this.setBorderState('running');
    const seeds = this.getSeeds();
    const results = [];

    for (let i = 0; i < seeds.length; i++) {
      this.setStatus(`Generating ${i + 1}/${seeds.length}...`);
      this.progress = { current: i + 1, total: seeds.length, step: 0, maxStep: 0 };

      try {
        // Set seed in workflow
        const seedParam = workflowNode.templateParams.find(p => p.type === 'seed');
        if (seedParam) {
          workflowNode.paramValues[seedParam.name] = seeds[i];
        }

        const workflow = workflowNode.buildWorkflow();

        // Submit
        const resp = await fetch('/api/comfy/prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workflow }),
        });
        const { prompt_id } = await resp.json();

        // Poll for result
        const result = await this._pollResult(prompt_id);
        if (result) {
          const outputs = result.outputs || {};
          for (const nodeKey of Object.keys(outputs)) {
            const nodeOutput = outputs[nodeKey];
            if (nodeOutput.images) {
              for (const img of nodeOutput.images) {
                const imageUrl = `/api/comfy/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=output`;
                results.push({ imageUrl, comfyName: img.filename, seed: seeds[i] });
              }
            }
          }
        }
      } catch (err) {
        console.error(`Generation ${i + 1} failed:`, err);
        this.setStatus(`Error on ${i + 1}/${seeds.length}`);
      }
    }

    this.isRunning = false;
    this.setStatus(`Done — ${results.length} image${results.length !== 1 ? 's' : ''}`);
    this.setBorderState('done');
    return results;
  }

  async _pollResult(promptId) {
    const maxWait = 300000; // 5 min
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const resp = await fetch(`/api/comfy/history/${promptId}`);
      const history = await resp.json();
      if (history[promptId]) return history[promptId];
      await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error('Generation timed out');
  }

  renderProperties() {
    const workflowStatus = this.connectedWorkflow ? '✅ Connected' : '⬜ Click to connect';
    const promptStatus = this.connectedPrompt ? '✅ Connected' : '⬜ Click to connect (optional)';

    return `
      <div class="prop-section">
        <label class="prop-section-label">Label</label>
        <input type="text" id="node-label" class="prop-input" value="${this.label}" placeholder="e.g. Batch Run">
      </div>
      <div class="prop-section">
        <label class="prop-section-label">Workflow Input</label>
        <div class="workflow-input-slot" data-connect="workflow" style="cursor:pointer">
          ${workflowStatus}
        </div>
      </div>
      <div class="prop-section">
        <label class="prop-section-label">Prompt Input (optional)</label>
        <div class="workflow-input-slot" data-connect="prompt" style="cursor:pointer">
          ${promptStatus}
        </div>
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
          <option value="fixed" ${this.seedMode === 'fixed' ? 'selected' : ''}>Fixed (same seed every time)</option>
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

    // Connect slots
    document.querySelector('[data-connect="workflow"]')?.addEventListener('click', () => {
      window._connectMode = { targetNodeId: this.id, connectType: 'workflow' };
      document.querySelector('[data-connect="workflow"]').textContent = '🔗 Click a workflow node...';
    });

    document.querySelector('[data-connect="prompt"]')?.addEventListener('click', () => {
      window._connectMode = { targetNodeId: this.id, connectType: 'prompt' };
      document.querySelector('[data-connect="prompt"]').textContent = '🔗 Click a prompt node...';
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
      label: this.label,
      connectedWorkflow: this.connectedWorkflow,
      connectedPrompt: this.connectedPrompt,
      x: this.fabricObject?.left || 0,
      y: this.fabricObject?.top || 0,
    };
  }
}
