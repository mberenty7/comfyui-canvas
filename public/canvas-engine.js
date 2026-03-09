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
    });

    // Redraw connections when objects move
    this.fc.on('object:moving', () => this._drawConnections());
    this.fc.on('object:moved', () => this._drawConnections());
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
      this._drawConnections();
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
