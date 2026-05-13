// Canvas Engine — infinite canvas with pan/zoom, node management, connections

class CanvasEngine {
  constructor(canvasId) {
    this.fc = new fabric.Canvas(canvasId, {
      backgroundColor: '#1a1a2e',
      selection: true,
      preserveObjectStacking: true,
    });

    this.nodes = new Map();
    this.connections = []; // { fromId, toId }
    this.nodeIdCounter = 0;
    this.selectedNode = null;

    this.onNodeSelected = null;
    this.onNodeDeselected = null;

    this._resize();
    this._setupPanZoom();
    this._setupSelection();
    this._setupPortWiring();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    this.fc.setWidth(window.innerWidth);
    this.fc.setHeight(window.innerHeight - 48);
    this.fc.renderAll();
  }

  _setupPanZoom() {
    let panning = false;
    let last = { x: 0, y: 0 };
    let spaceDown = false;

    // Track spacebar for space+drag panning
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        spaceDown = true;
        this.fc.defaultCursor = 'grab';
      }
    });
    document.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        spaceDown = false;
        if (!panning) this.fc.defaultCursor = 'default';
      }
    });

    this.fc.on('mouse:down', (e) => {
      if (e.e.button === 1 || (e.e.button === 0 && (e.e.altKey || spaceDown))) {
        panning = true;
        last = { x: e.e.clientX, y: e.e.clientY };
        this.fc.selection = false;
        this.fc.defaultCursor = 'grabbing';
      }
    });

    this.fc.on('mouse:move', (e) => {
      if (!panning) return;
      const vpt = this.fc.viewportTransform;
      vpt[4] += e.e.clientX - last.x;
      vpt[5] += e.e.clientY - last.y;
      last = { x: e.e.clientX, y: e.e.clientY };
      this.fc.requestRenderAll();
      this._drawConnections();
      this._updateAllPorts();
    });

    this.fc.on('mouse:up', () => {
      panning = false;
      this.fc.selection = true;
      this.fc.defaultCursor = 'default';
    });

    this.fc.on('mouse:wheel', (e) => {
      const delta = e.e.deltaY;
      let zoom = this.fc.getZoom() * (0.999 ** delta);
      zoom = Math.max(0.1, Math.min(5, zoom));
      this.fc.zoomToPoint({ x: e.e.offsetX, y: e.e.offsetY }, zoom);
      e.e.preventDefault();
      e.e.stopPropagation();
      this._updateZoom();
      this._drawConnections();
      this._updateAllPorts();
    });

    // Track group box position at start of drag
    this.fc.on('mouse:down', (e) => {
      if (e.target?._isGroupBox && e.target?.nodeId) {
        const groupBox = this.nodes.get(e.target.nodeId);
        if (groupBox) groupBox.updateLastPosition();
      }
    });

    // Redraw connections when objects move + sticky group box movement
    this.fc.on('object:moving', (e) => {
      this._drawConnections();
      this._updateAllPorts();
      // Sticky group: move child nodes with the group box
      const obj = e.target;
      if (obj?._isGroupBox && obj?.nodeId) {
        const groupBox = this.nodes.get(obj.nodeId);
        if (groupBox && groupBox.type === 'group-box') {
          const { dx, dy } = groupBox.getMoveDelta();
          if (dx !== 0 || dy !== 0) {
            for (const [id, node] of this.nodes) {
              if (node.type === 'group-box' || node.id === groupBox.id) continue;
              if (groupBox.containsNode(node)) {
                node.fabricObject.set({
                  left: node.fabricObject.left + dx,
                  top: node.fabricObject.top + dy,
                });
                node.fabricObject.setCoords();
              }
            }
          }
        }
      }
    });
    this.fc.on('object:moved', (e) => {
      this._drawConnections();
      this._updateAllPorts();
      // Update group box last position after move
      const obj = e.target;
      if (obj?._isGroupBox && obj?.nodeId) {
        const groupBox = this.nodes.get(obj.nodeId);
        if (groupBox) groupBox.updateLastPosition();
      }
    });
    // Handle group box resize
    this.fc.on('object:scaled', (e) => {
      const obj = e.target;
      if (obj?._isGroupBox && obj?.nodeId) {
        const groupBox = this.nodes.get(obj.nodeId);
        if (groupBox) groupBox.updateDimensions();
      }
    });
  }

  _setupSelection() {
    this.fc.on('selection:created', (e) => this._onSelect(e));
    this.fc.on('selection:updated', (e) => this._onSelect(e));
    this.fc.on('selection:cleared', () => {
      if (this.selectedNode?.fabricObject) {
        const border = this.selectedNode.fabricObject._objects[0];
        if (border) { border.set('stroke', this.selectedNode._origStroke || '#444'); this.fc.renderAll(); }
      }
      this.selectedNode = null;
      if (this.onNodeDeselected) this.onNodeDeselected();
    });
  }

  _onSelect(e) {
    // Dim previous selection
    if (this.selectedNode?.fabricObject) {
      const border = this.selectedNode.fabricObject._objects[0];
      if (border) { border.set('stroke', this.selectedNode._origStroke || '#444'); this.fc.renderAll(); }
    }
    let obj = e.selected?.[0];
    // Walk up to find the group with nodeId
    while (obj && !obj.nodeId && obj.group) obj = obj.group;
    if (obj?.nodeId) {
      this.selectedNode = this.nodes.get(obj.nodeId);
      // Brighten border
      const border = this.selectedNode.fabricObject._objects[0];
      if (border) {
        this.selectedNode._origStroke = this.selectedNode._origStroke || border.stroke;
        border.set('stroke', '#fff');
        this.fc.renderAll();
      }
      if (this.onNodeSelected) this.onNodeSelected(this.selectedNode);
    }
  }

  _updateZoom() {
    const pct = Math.round(this.fc.getZoom() * 100);
    document.getElementById('zoom-level').textContent = `${pct}%`;
  }

  nextId() { return `node_${++this.nodeIdCounter}`; }

  // ── Connections ────────────────────────────

  addConnection(fromId, toId) {
    // Avoid duplicates
    if (!this.connections.find(c => c.fromId === fromId && c.toId === toId)) {
      this.connections.push({ fromId, toId });
      if (window._scheduleAutosave) window._scheduleAutosave();
      this._drawConnections();
      this._updateAllPorts();
    }
  }

  removeConnections(nodeId) {
    this.connections = this.connections.filter(c => c.fromId !== nodeId && c.toId !== nodeId);
    this._drawConnections();
  }

  removeConnectionBetween(fromId, toId) {
    this.connections = this.connections.filter(c => !(c.fromId === fromId && c.toId === toId));
    this._drawConnections();
  }

  _drawConnections() {
    // Remove old lines
    const old = this.fc.getObjects().filter(o => o._isConnection);
    old.forEach(o => this.fc.remove(o));

    for (const conn of this.connections) {
      const fromNode = this.nodes.get(conn.fromId);
      const toNode = this.nodes.get(conn.toId);
      if (!fromNode?.fabricObject || !toNode?.fabricObject) continue;

      const from = fromNode.fabricObject.getCenterPoint();
      const to = toNode.fabricObject.getCenterPoint();

      const midX = (from.x + to.x) / 2;
      const path = new fabric.Path(
        `M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`,
        {
          fill: '',
          stroke: '#555',
          strokeWidth: 1.5,
          strokeDashArray: [4, 4],
          selectable: false,
          evented: false,
          _isConnection: true,
        }
      );
      this.fc.add(path);
      this.fc.sendToBack(path);
    }
    this.fc.renderAll();
  }


  _portSpecForType(type) {
    const hasInput = ['workflow','generate','viewer','inpaint','tile-preview'].includes(type);
    const hasOutput = ['prompt','image','workflow','model','inpaint'].includes(type);
    return { hasInput, hasOutput };
  }

  _portPos(node, side) {
    const g = node.fabricObject;
    const c = g.getCenterPoint();
    const w = g.getScaledWidth();
    return { x: side === 'in' ? c.x - w/2 - 7 : c.x + w/2 + 7, y: c.y };
  }

  _createPortsForNode(node) {
    const spec = this._portSpecForType(node.type);
    if (!spec.hasInput && !spec.hasOutput) return;
    const ports = {};
    const mk=(side)=>{
      const pos=this._portPos(node,side);
      return new fabric.Circle({
        left: pos.x, top: pos.y, radius: 4.5, originX:'center', originY:'center',
        fill: side==='in' ? '#2a3f66' : '#3a6640', stroke:'#9bb', strokeWidth:1,
        selectable:false, evented:false, excludeFromExport:true, _isPort:true
      });
    };
    if (spec.hasInput) ports.in = mk('in');
    if (spec.hasOutput) ports.out = mk('out');
    if (ports.in) this.fc.add(ports.in);
    if (ports.out) this.fc.add(ports.out);
    this.nodePorts.set(node.id, ports);
    if (ports.in) this.fc.bringToFront(ports.in);
    if (ports.out) this.fc.bringToFront(ports.out);
  }

  _updatePortsForNode(node) {
    const ports = this.nodePorts.get(node.id);
    if (!ports) return;
    if (ports.in) { const p=this._portPos(node,'in'); ports.in.set({left:p.x, top:p.y}); }
    if (ports.out) { const p=this._portPos(node,'out'); ports.out.set({left:p.x, top:p.y}); }
  }

  _updateAllPorts() {
    for (const [id,node] of this.nodes) this._updatePortsForNode(node);
  }


  _findPortAtPoint(x, y, side = null) {
    const r2 = 10 * 10;
    for (const [id, ports] of this.nodePorts) {
      for (const k of ['in', 'out']) {
        const port = ports[k];
        if (!port) continue;
        if (side && k !== side) continue;
        const dx = port.left - x;
        const dy = port.top - y;
        if (dx * dx + dy * dy <= r2) return { nodeId: id, side: k, port };
      }
    }
    return null;
  }

  _setupPortWiring() {
    this.fc.on('mouse:down', (e) => {
      if (!e.e || e.e.button !== 0) return;
      const pt = this.fc.getPointer(e.e);
      const hit = this._findPortAtPoint(pt.x, pt.y, 'out');
      if (!hit) return;
      const line = new fabric.Line([hit.port.left, hit.port.top, pt.x, pt.y], { stroke:'#88a', strokeWidth:2, selectable:false, evented:false, _isTempWire:true });
      this.fc.add(line);
      this._wireDrag = { fromNodeId: hit.nodeId, line };
      this.fc.renderAll();
    });

    this.fc.on('mouse:move', (e) => {
      if (!this._wireDrag) return;
      const pt = this.fc.getPointer(e.e);
      this._wireDrag.line.set({ x2: pt.x, y2: pt.y });
      const hit = this._findPortAtPoint(pt.x, pt.y, 'in');
      for (const [,ports] of this.nodePorts) if (ports.in) ports.in.set('stroke', '#9bb');
      if (hit && hit.port) hit.port.set('stroke', '#fff');
      this.fc.requestRenderAll();
    });

    this.fc.on('mouse:up', (e) => {
      if (!this._wireDrag) return;
      const pt = this.fc.getPointer(e.e);
      const hit = this._findPortAtPoint(pt.x, pt.y, 'in');
      const fromId = this._wireDrag.fromNodeId;
      this.fc.remove(this._wireDrag.line);
      this._wireDrag = null;
      for (const [,ports] of this.nodePorts) if (ports.in) ports.in.set('stroke', '#9bb');
      if (hit && hit.nodeId && hit.nodeId !== fromId && this.onWireConnect) this.onWireConnect(fromId, hit.nodeId);
      this.fc.requestRenderAll();
    });
  }

  // ── Serialize / Deserialize ────────────────

  serialize() {
    const nodes = [];
    for (const [id, node] of this.nodes) {
      if (node.serialize) {
        nodes.push(node.serialize());
      } else {
        const obj = node.fabricObject;
        nodes.push({ id, type: node.type, x: obj?.left || 0, y: obj?.top || 0 });
      }
    }
    const vpt = this.fc.viewportTransform;
    return {
      version: 2,
      zoom: this.fc.getZoom(),
      viewport: { x: vpt[4], y: vpt[5] },
      nodeIdCounter: this.nodeIdCounter,
      nodes,
      connections: this.connections,
    };
  }

  async deserialize(data) {
    this.fc.clear();
    this.fc.backgroundColor = '#1a1a2e';
    this.nodes.clear();
    this.connections = [];
    this.nodeIdCounter = data.nodeIdCounter || 0;

    const nodes = data.nodes || [];
    for (const n of nodes) {
      try {
      n.label = n.label || '';

      if (n.type === 'image') {
        const node = new ImageNode(n.id, {
          imageUrl: n.imageUrl, filename: n.filename, comfyName: n.comfyName,
          width: n.width || 0, height: n.height || 0,
          fileSize: n.fileSize || 0, format: n.format || '', label: n.label,
          maskComfyName: n.maskComfyName,
        });
        await node.createVisual(n.x, n.y);
        this.register(node);

      } else if (n.type === 'prompt') {
        const node = new PromptNode(n.id, {
          positive: n.positive, negative: n.negative, label: n.label,
        });
        node.createVisual(n.x, n.y);
        this.register(node);

      } else if (n.type === 'workflow') {
        const node = new WorkflowNode(n.id, {
          templateId: n.templateId, templateName: n.templateName,
          templateColor: n.templateColor, inputs: n.inputs,
          params: n.params, workflow: n.workflow, label: n.label,
          backend: n.backend, bflEndpoint: n.bflEndpoint,
        });
        if (n.paramValues) node.paramValues = n.paramValues;
        if (n.connectedInputs) node.connectedInputs = n.connectedInputs;
        node.createVisual(n.x, n.y);
        this.register(node);

      } else if (n.type === 'model') {
        const node = new ModelNode(n.id, {
          modelUrl: n.modelUrl, filename: n.filename,
          comfyName: n.comfyName, format: n.format,
          fileSize: n.fileSize, label: n.label,
        });
        node.createVisual(n.x, n.y);
        this.register(node);

      } else if (n.type === 'viewer') {
        const node = new ViewerNode(n.id, { label: n.label });
        if (n.connectedModel) node.connectedModel = n.connectedModel;
        node.createVisual(n.x, n.y);
        this.register(node);

      } else if (n.type === 'inpaint') {
        const node = new InpaintNode(n.id, {
          label: n.label, maskComfyName: n.maskComfyName,
        });
        if (n.connectedImage) node.connectedImage = n.connectedImage;
        node.createVisual(n.x, n.y);
        this.register(node);

      } else if (n.type === 'tile-preview') {
        const node = new TilePreviewNode(n.id, {
          label: n.label, gridSize: n.gridSize,
          connectedImage: n.connectedImage,
        });
        node.createVisual(n.x, n.y);
        this.register(node);

      } else if (n.type === 'group-box') {
        const node = new GroupBox(n.id, {
          title: n.title, color: n.color,
          width: n.width, height: n.height,
        });
        node.createVisual(n.x, n.y);
        this.register(node);
        this.fc.sendToBack(node.fabricObject);

      } else if (n.type === 'generate') {
        const node = new GenerateNode(n.id, {
          count: n.count, seedMode: n.seedMode, baseSeed: n.baseSeed,
          outputName: n.outputName, label: n.label,
        });
        if (n.connectedWorkflow) node.connectedWorkflow = n.connectedWorkflow;
        if (n.connectedPrompt) node.connectedPrompt = n.connectedPrompt;
        node.createVisual(n.x, n.y);
        this.register(node);
      }
      } catch (err) {
        console.error(`Failed to load node ${n.id} (${n.type}):`, err);
      }
    }

    this.connections = data.connections || [];

    if (data.zoom) this.fc.setZoom(data.zoom);
    if (data.viewport) {
      const vpt = this.fc.viewportTransform;
      vpt[4] = data.viewport.x;
      vpt[5] = data.viewport.y;
    }
    this._updateZoom();
    this._drawConnections();
    this.fc.requestRenderAll();
  }

  register(node) {
    this.nodes.set(node.id, node);
    this.fc.add(node.fabricObject);
    this._createPortsForNode(node);
    this.fc.renderAll();
  }

  screenToCanvas(sx, sy) {
    const vpt = this.fc.viewportTransform;
    const zoom = this.fc.getZoom();
    return {
      x: (sx - vpt[4]) / zoom,
      y: (sy - 48 - vpt[5]) / zoom,
    };
  }

  canvasCenter() {
    return this.screenToCanvas(window.innerWidth / 2, window.innerHeight / 2 + 24);
  }
}
