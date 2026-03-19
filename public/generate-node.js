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

    // Check if this is a BFL (Flux API) backend
    if (workflowNode.backend === 'bfl') {
      return this._runBfl(engine, workflowNode);
    }

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
        if (window.addLog) {
          window.addLog(`Workflow nodes: ${Object.keys(workflow).join(', ')} | types: ${Object.values(workflow).map(n => n.class_type).join(', ')}`, 'info');
          window.addLog(`Submitting workflow: ${JSON.stringify(workflow).substring(0, 1500)}`, 'info');
        }
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
        if (result) {
          const outputs = result.outputs || {};
          if (window.addLog) {
            window.addLog(`Output keys: ${Object.keys(outputs).join(', ')}`, 'info');
            window.addLog(`Full result keys: ${JSON.stringify(Object.keys(result))}`, 'info');
            window.addLog(`Outputs dump: ${JSON.stringify(outputs).substring(0, 500)}`, 'info');
            window.addLog(`Status: ${JSON.stringify(result.status)}`, 'info');
            // Detect cached execution (no real outputs)
            const isCached = result.status?.messages?.some(m => m[0] === 'execution_cached');
            if (isCached && Object.keys(outputs).length === 0) {
              window.addLog(`⚠️ Result was cached — no new outputs. Try changing seed or re-uploading image.`, 'warn');
            }
          }
          for (const nodeKey of Object.keys(outputs)) {
            const nodeOutput = outputs[nodeKey];
            if (window.addLog) window.addLog(`Node ${nodeKey} output keys: ${JSON.stringify(Object.keys(nodeOutput))} | result: ${JSON.stringify(nodeOutput.result)?.substring(0,200)} | text: ${JSON.stringify(nodeOutput.text)?.substring(0,200)}`, 'info');
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
            // Handle 3D mesh outputs (e.g. Hunyuan3D Preview3D node, Tripo)
            // Check result array
            if (nodeOutput.result && Array.isArray(nodeOutput.result)) {
              for (const item of nodeOutput.result) {
                if (typeof item === 'string' && /\.(glb|gltf|obj|fbx)$/i.test(item)) {
                  const meshUrl = `/api/comfy/mesh?filename=${encodeURIComponent(item)}`;
                  results.push({ meshUrl, meshFilename: item, seed: seeds[i], type: '3d' });
                  if (window.addLog) window.addLog(`3D model output: ${item}`, 'success');
                }
              }
            }
            // Check text array (STRING outputs like Tripo model_file)
            if (nodeOutput.text && Array.isArray(nodeOutput.text)) {
              for (const item of nodeOutput.text) {
                if (typeof item === 'string' && /\.(glb|gltf|obj|fbx)$/i.test(item)) {
                  const meshUrl = `/api/comfy/mesh?filename=${encodeURIComponent(item)}`;
                  results.push({ meshUrl, meshFilename: item, seed: seeds[i], type: '3d' });
                  if (window.addLog) window.addLog(`3D model output (text): ${item}`, 'success');
                }
              }
            }
            // Check gltf/glb outputs (FILE_3D_GLB type)
            if (nodeOutput.gltf || nodeOutput.glb) {
              const files = [...(nodeOutput.gltf || []), ...(nodeOutput.glb || [])];
              for (const item of files) {
                const filename = typeof item === 'string' ? item : item?.filename;
                if (filename) {
                  const meshUrl = `/api/comfy/mesh?filename=${encodeURIComponent(filename)}`;
                  results.push({ meshUrl, meshFilename: filename, seed: seeds[i], type: '3d' });
                  if (window.addLog) window.addLog(`3D model output (glb/gltf): ${filename}`, 'success');
                }
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

  // Run generation via BFL (Flux) API
  async _runBfl(engine, workflowNode) {
    this.isRunning = true;
    this.setBorderState('running');
    const seeds = this.getSeeds();
    const results = [];

    for (let i = 0; i < seeds.length; i++) {
      this.setStatus(`BFL ${i + 1}/${seeds.length}...`);

      try {
        // Gather prompt from connected prompt node (or inpaint node)
        let promptText = '';
        for (const [inputName, conn] of Object.entries(workflowNode.connectedInputs || {})) {
          const input = workflowNode.templateInputs.find(inp => inp.name === inputName);
          if (!input) continue;
          const sourceNode = engine.nodes.get(conn.nodeId);
          if (input.type === 'prompt' && sourceNode?.type === 'prompt') {
            promptText = sourceNode.positive || '';
          }

        }

        // Build params from workflow node values
        const params = { ...workflowNode.paramValues };
        params.seed = seeds[i];

        // Determine endpoint — model selector overrides default
        let endpoint = workflowNode.bflEndpoint || '/v1/flux-pro-1.1';
        if (params.model) {
          endpoint = `/v1/${params.model}`;
          delete params.model;
        }

        // Handle image+mask for inpainting
        let imageBase64 = null;
        let maskBase64 = null;

        for (const [inputName, conn] of Object.entries(workflowNode.connectedInputs || {})) {
          const input = workflowNode.templateInputs.find(inp => inp.name === inputName);
          if (!input || input.type !== 'image') continue;
          const sourceNode = engine.nodes.get(conn.nodeId);
          if (!sourceNode) continue;

          let imgUrl = null;
          let maskUrl = null;

          if (sourceNode.type === 'inpaint') {
            // InpaintNode — get image and mask from its connections
            const imgData = sourceNode.getImageData(engine);
            if (imgData?.imageUrl) imgUrl = imgData.imageUrl;
            if (imgData?.maskUrl) maskUrl = imgData.maskUrl;
          } else if (sourceNode.type === 'image') {
            imgUrl = sourceNode.imageUrl || sourceNode.comfyName;
            if (input.uses_mask && sourceNode.maskUrl) maskUrl = sourceNode.maskUrl;
          }

          // Get image as base64 via server
          if (imgUrl) {
            this.setStatus(`BFL ${i + 1}/${seeds.length} encoding...`);
            const b64Resp = await fetch(`/api/image-base64?url=${encodeURIComponent(imgUrl)}`);
            const b64Data = await b64Resp.json();
            if (b64Data.base64) imageBase64 = b64Data.base64;
          }

          // Get mask as base64
          if (maskUrl) {
            if (maskUrl.startsWith('data:')) {
              // Already a data URL — extract base64 directly
              const commaIdx = maskUrl.indexOf(',');
              if (commaIdx !== -1) maskBase64 = maskUrl.substring(commaIdx + 1);
            } else {
              const maskResp = await fetch(`/api/image-base64?url=${encodeURIComponent(maskUrl)}`);
              const maskData = await maskResp.json();
              if (maskData.base64) maskBase64 = maskData.base64;
            }
          }
        }

        if (window.addLog) window.addLog(`[BFL] Submitting to ${endpoint}, seed=${seeds[i]}`, 'info');

        // Submit to BFL
        const resp = await fetch('/api/bfl/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint,
            prompt: promptText,
            params,
            image: imageBase64,
            mask: maskBase64,
          }),
        });
        const data = await resp.json();

        if (data.error) throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
        if (!data.id) throw new Error('No request ID returned from BFL');

        if (window.addLog) window.addLog(`[BFL] Request submitted: ${data.id}`, 'info');

        // Poll for result
        this.setStatus(`BFL ${i + 1}/${seeds.length} generating...`);
        const result = await this._pollBflResult(data.id, data.polling_url);

        if (result.status === 'Ready' && result.result?.sample) {
          const bflImageUrl = result.result.sample;
          const ext = (params.output_format === 'jpeg') ? 'jpg' : 'png';
          const filename = `${this.outputName}_${seeds[i]}.${ext}`;

          // Download and save via server
          const metadata = this._buildMetadata(workflowNode, engine, seeds[i]);
          metadata.backend = 'bfl';
          metadata.bfl_endpoint = endpoint;
          metadata.bfl_request_id = data.id;

          const saveResp = await fetch('/api/bfl/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl: bflImageUrl, filename, metadata }),
          });
          const saveData = await saveResp.json();

          if (saveData.saved) {
            results.push({ imageUrl: saveData.path, comfyName: filename, seed: seeds[i] });
            if (window.addLog) window.addLog(`[BFL] Image saved: ${filename}`, 'success');
          }
        } else {
          throw new Error(`BFL generation failed: ${result.status || 'unknown'}`);
        }
      } catch (err) {
        console.error(`BFL generation ${i + 1} failed:`, err);
        if (window.addLog) window.addLog(`[BFL] Error: ${err.message}`, 'error');
        this.setStatus(`Error: ${err.message}`);
        this.setBorderState('error');
      }
    }

    this.isRunning = false;
    this.setStatus(`Done — ${results.length} image${results.length !== 1 ? 's' : ''}`);
    this.setBorderState('done');
    return results;
  }

  async _pollBflResult(requestId, pollingUrl) {
    const maxWait = 300000;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const resp = await fetch(`/api/bfl/result/${requestId}`);
      const data = await resp.json();

      if (data.status === 'Ready') return data;
      if (data.status === 'Error' || data.status === 'Request Moderated') {
        throw new Error(`BFL: ${data.status} — ${data.result?.message || 'generation failed'}`);
      }

      // Still pending/processing
      await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error('BFL generation timed out (5 min)');
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
