// Canvas Engine — manages the infinite canvas, nodes, and connections

class CanvasEngine {
  constructor(canvasId) {
    this.fabricCanvas = new fabric.Canvas(canvasId, {
      backgroundColor: '#1a1a2e',
      selection: true,
      preserveObjectStacking: true,
    });

    this.nodes = new Map(); // nodeId -> WorkflowNode
    this.connections = [];  // { from: nodeId, fromPort: 'output', to: nodeId, toPort: 'input_name' }
    this.selectedNode = null;
    this.nodeIdCounter = 0;
    this.gridSize = 20;

    this._setupCanvas();
    this._setupPanZoom();
    this._setupEvents();
    this._drawGrid();
  }

  _setupCanvas() {
    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight - 48;
      this.fabricCanvas.setWidth(w);
      this.fabricCanvas.setHeight(h);
      this.fabricCanvas.renderAll();
    };
    window.addEventListener('resize', resize);
    resize();
  }

  _setupPanZoom() {
    let isPanning = false;
    let lastPos = { x: 0, y: 0 };

    // Pan with middle mouse or space+drag
    this.fabricCanvas.on('mouse:down', (e) => {
      if (e.e.button === 1 || (e.e.button === 0 && e.e.altKey)) {
        isPanning = true;
        lastPos = { x: e.e.clientX, y: e.e.clientY };
        this.fabricCanvas.selection = false;
        this.fabricCanvas.defaultCursor = 'grabbing';
      }
    });

    this.fabricCanvas.on('mouse:move', (e) => {
      if (!isPanning) return;
      const vpt = this.fabricCanvas.viewportTransform;
      vpt[4] += e.e.clientX - lastPos.x;
      vpt[5] += e.e.clientY - lastPos.y;
      lastPos = { x: e.e.clientX, y: e.e.clientY };
      this.fabricCanvas.requestRenderAll();
      this._updateConnections();
    });

    this.fabricCanvas.on('mouse:up', () => {
      isPanning = false;
      this.fabricCanvas.selection = true;
      this.fabricCanvas.defaultCursor = 'default';
    });

    // Zoom with scroll wheel
    this.fabricCanvas.on('mouse:wheel', (e) => {
      const delta = e.e.deltaY;
      let zoom = this.fabricCanvas.getZoom();
      zoom *= 0.999 ** delta;
      zoom = Math.max(0.1, Math.min(5, zoom));
      this.fabricCanvas.zoomToPoint({ x: e.e.offsetX, y: e.e.offsetY }, zoom);
      e.e.preventDefault();
      e.e.stopPropagation();
      this._updateZoomDisplay();
      this._updateConnections();
    });
  }

  _setupEvents() {
    // Node selection
    this.fabricCanvas.on('selection:created', (e) => this._onSelect(e));
    this.fabricCanvas.on('selection:updated', (e) => this._onSelect(e));
    this.fabricCanvas.on('selection:cleared', () => {
      this.selectedNode = null;
      if (this.onNodeDeselected) this.onNodeDeselected();
    });

    // Node movement — update connections
    this.fabricCanvas.on('object:moving', () => this._updateConnections());
    this.fabricCanvas.on('object:moved', () => this._updateConnections());
  }

  _onSelect(e) {
    const obj = e.selected?.[0];
    if (obj && obj.nodeId) {
      this.selectedNode = this.nodes.get(obj.nodeId);
      if (this.onNodeSelected) this.onNodeSelected(this.selectedNode);
    }
  }

  _drawGrid() {
    // Subtle dot grid drawn on render
    // (skipping for perf — can add later)
  }

  _updateZoomDisplay() {
    const zoom = Math.round(this.fabricCanvas.getZoom() * 100);
    document.getElementById('zoom-level').textContent = `${zoom}%`;
  }

  // ── Node Management ──────────────────────────

  addNode(template, x, y) {
    const id = `node_${++this.nodeIdCounter}`;
    const node = new WorkflowNode(id, template, this);
    this.nodes.set(id, node);

    // Create visual group on canvas
    const group = node.createVisual(x, y);
    this.fabricCanvas.add(group);
    this.fabricCanvas.renderAll();

    return node;
  }

  addImageNode(imageUrl, filename, x, y) {
    const id = `img_${++this.nodeIdCounter}`;

    return new Promise((resolve) => {
      fabric.Image.fromURL(imageUrl, (img) => {
        // Scale to reasonable size
        const maxDim = 200;
        const scale = maxDim / Math.max(img.width, img.height);
        img.scale(scale);

        // Create a group with label
        const label = new fabric.Text(filename, {
          fontSize: 11,
          fill: '#888',
          fontFamily: 'monospace',
          originX: 'center',
          top: (img.height * scale) / 2 + 8,
        });

        const border = new fabric.Rect({
          width: img.width * scale + 8,
          height: img.height * scale + 28,
          fill: '#1e1e3a',
          stroke: '#4a9eff',
          strokeWidth: 2,
          rx: 6, ry: 6,
          originX: 'center',
          originY: 'center',
          top: 6,
        });

        const group = new fabric.Group([border, img, label], {
          left: x, top: y,
          hasControls: false,
          hasBorders: false,
          subTargetCheck: true,
        });

        group.nodeId = id;
        group.isImageNode = true;
        group.imageUrl = imageUrl;
        group.comfyName = filename;

        this.nodes.set(id, {
          id, type: 'image', filename, imageUrl,
          comfyName: filename,
          fabricObject: group,
          getOutputImage: () => imageUrl,
          getComfyName: () => filename,
        });

        this.fabricCanvas.add(group);
        this.fabricCanvas.renderAll();
        resolve(this.nodes.get(id));
      }, { crossOrigin: 'anonymous' });
    });
  }

  removeNode(nodeId) {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    if (node.fabricObject) this.fabricCanvas.remove(node.fabricObject);
    this.nodes.delete(nodeId);
    // Remove connections
    this.connections = this.connections.filter(c => c.from !== nodeId && c.to !== nodeId);
    this._updateConnections();
  }

  // ── Connections ────────────────────────────

  connect(fromId, toId, inputName) {
    this.connections.push({ from: fromId, to: toId, toPort: inputName });
    this._updateConnections();

    // Set the input on the target node
    const fromNode = this.nodes.get(fromId);
    const toNode = this.nodes.get(toId);
    if (fromNode && toNode && toNode.setInput) {
      const imgUrl = fromNode.getOutputImage?.() || fromNode.imageUrl;
      const comfyName = fromNode.getComfyName?.() || fromNode.comfyName;
      toNode.setInput(inputName, { imageUrl: imgUrl, comfyName });
    }
  }

  _updateConnections() {
    // Remove existing connection lines
    const toRemove = this.fabricCanvas.getObjects().filter(o => o.isConnection);
    toRemove.forEach(o => this.fabricCanvas.remove(o));

    // Draw new lines
    for (const conn of this.connections) {
      const fromNode = this.nodes.get(conn.from);
      const toNode = this.nodes.get(conn.to);
      if (!fromNode?.fabricObject || !toNode?.fabricObject) continue;

      const fromObj = fromNode.fabricObject;
      const toObj = toNode.fabricObject;
      const fromCenter = fromObj.getCenterPoint();
      const toCenter = toObj.getCenterPoint();

      // Bezier curve
      const midX = (fromCenter.x + toCenter.x) / 2;
      const path = new fabric.Path(
        `M ${fromCenter.x} ${fromCenter.y} C ${midX} ${fromCenter.y}, ${midX} ${toCenter.y}, ${toCenter.x} ${toCenter.y}`,
        {
          fill: '',
          stroke: '#e94560',
          strokeWidth: 2,
          strokeDashArray: [5, 5],
          selectable: false,
          evented: false,
          isConnection: true,
        }
      );
      this.fabricCanvas.add(path);
      this.fabricCanvas.sendToBack(path);
    }
    this.fabricCanvas.renderAll();
  }

  // ── Viewport ──────────────────────────────

  zoomToFit() {
    const objects = this.fabricCanvas.getObjects().filter(o => !o.isConnection);
    if (objects.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    objects.forEach(o => {
      const bounds = o.getBoundingRect(true);
      minX = Math.min(minX, bounds.left);
      minY = Math.min(minY, bounds.top);
      maxX = Math.max(maxX, bounds.left + bounds.width);
      maxY = Math.max(maxY, bounds.top + bounds.height);
    });

    const padding = 60;
    const cw = this.fabricCanvas.getWidth();
    const ch = this.fabricCanvas.getHeight();
    const zoom = Math.min(cw / (maxX - minX + padding * 2), ch / (maxY - minY + padding * 2), 2);

    this.fabricCanvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    this.fabricCanvas.zoomToPoint({ x: cw / 2, y: ch / 2 }, zoom);

    const vpt = this.fabricCanvas.viewportTransform;
    vpt[4] = cw / 2 - (minX + maxX) / 2 * zoom;
    vpt[5] = ch / 2 - (minY + maxY) / 2 * zoom;

    this.fabricCanvas.requestRenderAll();
    this._updateZoomDisplay();
    this._updateConnections();
  }

  resetZoom() {
    this.fabricCanvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    this._updateZoomDisplay();
    this._updateConnections();
  }

  // ── Serialization ─────────────────────────

  serialize() {
    const nodes = [];
    for (const [id, node] of this.nodes) {
      const obj = node.fabricObject;
      nodes.push({
        id,
        type: node.type || 'workflow',
        templateId: node.template?.id,
        x: obj?.left || 0,
        y: obj?.top || 0,
        params: node.params || {},
        filename: node.filename,
        imageUrl: node.imageUrl,
      });
    }
    return { nodes, connections: this.connections };
  }

  async deserialize(data) {
    // Clear
    this.fabricCanvas.clear();
    this.fabricCanvas.backgroundColor = '#1a1a2e';
    this.nodes.clear();
    this.connections = [];

    for (const n of data.nodes) {
      if (n.type === 'image') {
        await this.addImageNode(n.imageUrl, n.filename, n.x, n.y);
      } else if (n.templateId) {
        // Load template and add node
        const resp = await fetch(`/api/templates/${n.templateId}`);
        const template = await resp.json();
        const node = this.addNode(template, n.x, n.y);
        if (n.params) node.params = { ...node.params, ...n.params };
      }
    }

    this.connections = data.connections || [];
    this._updateConnections();
  }
}
