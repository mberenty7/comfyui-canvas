// Viewer3D — embedded Three.js 3D model viewer modal
// Supports GLB, GLTF, OBJ, FBX with shaders, depth/normal/color capture
// Captures create ImageNodes on the canvas

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

class Viewer3D {
  constructor() {
    this.modal = null;
    this.minimized = false;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.controls = null;
    this.currentModel = null;
    this.currentMaterial = null;
    this.clock = null;
    this.animId = null;
    this.grid = null;

    this.uniforms = {
      uColor: { value: null },
      uRimColor: { value: null },
      uFresnelPower: { value: 2.0 },
      uTime: { value: 0 },
    };

    this.shaderSources = { vertex: '', fragment: '' };
    this._buildDOM();
  }

  _buildDOM() {
    // Modal overlay
    const modal = document.createElement('div');
    modal.id = 'viewer3d-modal';
    modal.className = 'viewer3d-modal hidden';
    modal.innerHTML = `
      <div class="viewer3d-container" id="viewer3d-container">
        <div class="viewer3d-header">
          <span class="viewer3d-title">🎲 3D Viewer</span>
          <div class="viewer3d-header-actions">
            <button class="viewer3d-btn" id="viewer3d-minimize" title="Minimize">─</button>
            <button class="viewer3d-btn" id="viewer3d-close" title="Close">✕</button>
          </div>
        </div>
        <div class="viewer3d-body">
          <div class="viewer3d-viewport" id="viewer3d-viewport">
            <canvas id="viewer3d-canvas"></canvas>
            <div class="viewer3d-dropzone" id="viewer3d-dropzone">Drop .glb / .gltf / .obj / .fbx here</div>
          </div>
          <div class="viewer3d-sidebar">
            <section>
              <h4>Model</h4>
              <div id="viewer3d-model-info" class="viewer3d-info">No model loaded</div>
              <div id="viewer3d-error" style="color:#ff4444;font-size:11px;font-family:monospace;white-space:pre-wrap;max-height:150px;overflow-y:auto"></div>
            </section>

            <section>
              <h4>Shader</h4>
              <select id="viewer3d-shader-select">
                <option value="fresnel">Fresnel</option>
                <option value="toon">Toon</option>
                <option value="holographic">Holographic</option>
              </select>
              <div class="viewer3d-controls">
                <label>Base Color <input type="color" id="viewer3d-color" value="#808080"></label>
                <label>Fresnel Power <input type="range" id="viewer3d-fresnel" min="0.5" max="5" step="0.1" value="2.0"></label>
                <label>Rim Color <input type="color" id="viewer3d-rim" value="#ffffff"></label>
              </div>
            </section>

            <section>
              <h4>Scene</h4>
              <label>Background <input type="color" id="viewer3d-bg" value="#1a1a2e"></label>
              <label>Auto-Rotate <input type="checkbox" id="viewer3d-rotate"></label>
              <label>Show Grid <input type="checkbox" id="viewer3d-grid"></label>
            </section>

            <section>
              <h4>Capture → Canvas</h4>
              <select id="viewer3d-capture-res">
                <option value="1024">1024×1024</option>
                <option value="896">896×1152</option>
                <option value="512">512×512</option>
                <option value="2048">2048×2048</option>
              </select>
              <button class="viewer3d-capture-btn" data-mode="depth">📷 Depth Map</button>
              <button class="viewer3d-capture-btn" data-mode="depth4">📷 Depth 4-View</button>
              <button class="viewer3d-capture-btn" data-mode="normal">📷 Normal Map</button>
              <button class="viewer3d-capture-btn" data-mode="color">📷 Color Render</button>
            </section>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.modal = modal;

    // Minimized pill
    const pill = document.createElement('div');
    pill.id = 'viewer3d-pill';
    pill.className = 'viewer3d-pill hidden';
    pill.innerHTML = '🎲 3D Viewer';
    pill.addEventListener('click', () => this.restore());
    document.body.appendChild(pill);
    this.pill = pill;

    // Events
    document.getElementById('viewer3d-close').addEventListener('click', () => this.close());
    document.getElementById('viewer3d-minimize').addEventListener('click', () => this.minimize());

    document.getElementById('viewer3d-shader-select').addEventListener('change', (e) => {
      this._loadShaderPreset(e.target.value);
    });

    document.getElementById('viewer3d-color').addEventListener('input', (e) => {
      this.uniforms.uColor.value.set(e.target.value);
    });
    document.getElementById('viewer3d-rim').addEventListener('input', (e) => {
      this.uniforms.uRimColor.value.set(e.target.value);
    });
    document.getElementById('viewer3d-fresnel').addEventListener('input', (e) => {
      this.uniforms.uFresnelPower.value = parseFloat(e.target.value);
    });
    document.getElementById('viewer3d-bg').addEventListener('input', (e) => {
      this.scene?.background?.set(e.target.value);
    });
    document.getElementById('viewer3d-rotate').addEventListener('change', (e) => {
      if (this.controls) this.controls.autoRotate = e.target.checked;
    });
    document.getElementById('viewer3d-grid').addEventListener('change', (e) => {
      if (this.grid) this.grid.visible = e.target.checked;
    });

    // Capture buttons
    document.querySelectorAll('.viewer3d-capture-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        if (mode === 'depth4') this._captureDepth4View();
        else this._captureRender(mode);
      });
    });

    // Drag & drop on viewport
    const viewport = document.getElementById('viewer3d-viewport');
    viewport.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.getElementById('viewer3d-dropzone').classList.add('active');
    });
    viewport.addEventListener('dragleave', (e) => {
      if (!viewport.contains(e.relatedTarget)) {
        document.getElementById('viewer3d-dropzone').classList.remove('active');
      }
    });
    viewport.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.getElementById('viewer3d-dropzone').classList.remove('active');
      const file = e.dataTransfer.files[0];
      if (file && /\.(glb|gltf|obj|fbx)$/i.test(file.name)) {
        const url = URL.createObjectURL(file);
        this._loadModel(url);
        document.getElementById('viewer3d-model-info').textContent = file.name;
      }
    });
  }

  _initThree() {
    if (this.renderer) return; // already init

    const canvas = document.getElementById('viewer3d-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
    this.camera.position.set(0, 1, 3);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0.5, 0);

    // Lighting
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(3, 5, 4);
    this.scene.add(dir);
    const fill = new THREE.DirectionalLight(0x8888ff, 0.3);
    fill.position.set(-3, 2, -2);
    this.scene.add(fill);

    this.grid = new THREE.GridHelper(4, 20, 0x333355, 0x222244);
    this.grid.visible = false;
    this.scene.add(this.grid);

    this.clock = new THREE.Clock();

    this.uniforms.uColor.value = new THREE.Color(0x808080);
    this.uniforms.uRimColor.value = new THREE.Color(0xffffff);

    this._resize();
    this._animate();
  }

  _resize() {
    if (!this.renderer) return;
    const viewport = document.getElementById('viewer3d-viewport');
    if (!viewport) return;
    const w = viewport.clientWidth;
    const h = viewport.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _animate() {
    this.animId = requestAnimationFrame(() => this._animate());
    this.uniforms.uTime.value = this.clock.getElapsedTime();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  async _loadShaderPreset(name) {
    try {
      const res = await fetch(`/shaders/${name}.vert`);
      const vert = await res.text();
      const res2 = await fetch(`/shaders/${name}.frag`);
      const frag = await res2.text();
      this.shaderSources = { vertex: vert, fragment: frag };
      this._applyShader();
    } catch (err) {
      console.error('Failed to load shader:', err);
    }
  }

  _applyShader() {
    
    const { vertex, fragment } = this.shaderSources;
    if (!vertex || !fragment || !this.currentModel) return;

    try {
      let needsSkinning = false;
      this.currentModel.traverse(child => {
        if (child.isSkinnedMesh) needsSkinning = true;
      });

      const mat = new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: this.uniforms,
        transparent: true,
        skinning: needsSkinning,
      });

      this.currentModel.traverse(child => {
        if (child.isMesh || child.isSkinnedMesh) child.material = mat;
      });

      if (this.currentMaterial) this.currentMaterial.dispose();
      this.currentMaterial = mat;
    } catch (err) {
      console.error('Shader error:', err);
    }
  }

  _loadModel(url) {
    

    if (this.currentModel) {
      this.scene.remove(this.currentModel);
      this.currentModel.traverse(c => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
          else c.material.dispose();
        }
      });
    }

    document.getElementById('viewer3d-model-info').textContent = 'Loading...';
    const ext = url.split('.').pop().split('?')[0].toLowerCase();

    const onLoaded = (object) => {
      this.currentModel = object.scene || object;

      // Auto-scale and center
      const box = new THREE.Box3().setFromObject(this.currentModel);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 2 / maxDim;
      this.currentModel.scale.setScalar(scale);
      this.currentModel.position.sub(center.multiplyScalar(scale));

      this.scene.add(this.currentModel);
      this._applyShader();

      const info = `${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}`;
      document.getElementById('viewer3d-model-info').textContent = info;
    };

    const onError = (err) => {
      document.getElementById('viewer3d-model-info').textContent = 'Failed to load';
      this._showError('Model load: ' + (err.message || err));
    };

    if (ext === 'obj') new OBJLoader().load(url, onLoaded, undefined, onError);
    else if (ext === 'fbx') new FBXLoader().load(url, onLoaded, undefined, onError);
    else new GLTFLoader().load(url, onLoaded, undefined, onError);
  }

  // ── Capture → ImageNode ────────────────────

  _getCaptureRes() {
    const val = document.getElementById('viewer3d-capture-res').value;
    if (val === '896') return { w: 896, h: 1152 };
    const s = parseInt(val);
    return { w: s, h: s };
  }

  async _captureRender(mode) {
    if (!this.currentModel) return;

    
    const { w, h } = this._getCaptureRes();

    const offRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    offRenderer.setSize(w, h);
    offRenderer.outputColorSpace = THREE.SRGBColorSpace;

    const offCamera = this.camera.clone();
    offCamera.aspect = w / h;
    offCamera.updateProjectionMatrix();

    const savedMaterials = new Map();
    const savedBg = this.scene.background.clone();
    const gridWas = this.grid.visible;
    this.grid.visible = false;

    if (mode === 'depth') {
      const box = new THREE.Box3().setFromObject(this.currentModel);
      const corners = this._boxCorners(box);
      let nearZ = Infinity, farZ = -Infinity;
      for (const c of corners) {
        const z = -c.clone().applyMatrix4(offCamera.matrixWorldInverse).z;
        if (z < nearZ) nearZ = z;
        if (z > farZ) farZ = z;
      }
      const pad = (farZ - nearZ) * 0.02;
      offCamera.near = Math.max(0.001, nearZ - pad);
      offCamera.far = farZ + pad;
      offCamera.updateProjectionMatrix();

      this.scene.background = new THREE.Color(0x000000);
      this.currentModel.traverse(child => {
        if (child.isMesh || child.isSkinnedMesh) {
          savedMaterials.set(child, child.material);
          child.material = new THREE.MeshDepthMaterial({ depthPacking: THREE.BasicDepthPacking });
        }
      });
    } else if (mode === 'normal') {
      this.scene.background = new THREE.Color(0x8080ff);
      this.currentModel.traverse(child => {
        if (child.isMesh || child.isSkinnedMesh) {
          savedMaterials.set(child, child.material);
          child.material = new THREE.MeshNormalMaterial();
        }
      });
    } else {
      this.scene.background = new THREE.Color(0xffffff);
    }

    offRenderer.render(this.scene, offCamera);
    const dataURL = offRenderer.domElement.toDataURL('image/png');

    // Restore
    this.scene.background = savedBg;
    savedMaterials.forEach((mat, child) => { child.material = mat; });
    this.grid.visible = gridWas;
    offRenderer.dispose();

    // Create ImageNode on canvas
    await this._placeCapture(dataURL, `${mode}_${w}x${h}.png`, mode);
  }

  async _captureDepth4View() {
    if (!this.currentModel) return;

    
    const { w, h } = this._getCaptureRes();

    const offRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    offRenderer.setSize(w, h);
    offRenderer.outputColorSpace = THREE.SRGBColorSpace;

    const box = new THREE.Box3().setFromObject(this.currentModel);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const dist = Math.max(size.x, size.y, size.z) * 1.8;

    const savedBg = this.scene.background.clone();
    const savedMaterials = new Map();
    const gridWas = this.grid.visible;
    this.grid.visible = false;

    this.scene.background = new THREE.Color(0x000000);
    this.currentModel.traverse(child => {
      if (child.isMesh || child.isSkinnedMesh) {
        savedMaterials.set(child, child.material);
        child.material = new THREE.MeshDepthMaterial({ depthPacking: THREE.BasicDepthPacking });
      }
    });

    const views = [
      { name: 'front', dir: new THREE.Vector3(0, 0, 1) },
      { name: 'back', dir: new THREE.Vector3(0, 0, -1) },
      { name: 'left', dir: new THREE.Vector3(-1, 0, 0) },
      { name: 'right', dir: new THREE.Vector3(1, 0, 0) },
    ];

    const offCamera = new THREE.PerspectiveCamera(50, w / h, 0.001, 100);
    const corners = this._boxCorners(box);

    for (const view of views) {
      const pos = center.clone().add(view.dir.clone().multiplyScalar(dist));
      offCamera.position.copy(pos);
      offCamera.lookAt(center);
      offCamera.updateMatrixWorld();

      let nearZ = Infinity, farZ = -Infinity;
      for (const c of corners) {
        const z = -c.clone().applyMatrix4(offCamera.matrixWorldInverse).z;
        if (z < nearZ) nearZ = z;
        if (z > farZ) farZ = z;
      }
      const pad = (farZ - nearZ) * 0.02;
      offCamera.near = Math.max(0.001, nearZ - pad);
      offCamera.far = farZ + pad;
      offCamera.updateProjectionMatrix();

      offRenderer.render(this.scene, offCamera);
      const dataURL = offRenderer.domElement.toDataURL('image/png');
      await this._placeCapture(dataURL, `depth_${view.name}_${w}x${h}.png`, `depth-${view.name}`);
    }

    // Restore
    this.scene.background = savedBg;
    savedMaterials.forEach((mat, child) => { child.material = mat; });
    this.grid.visible = gridWas;
    offRenderer.dispose();
  }

  _boxCorners(box) {
    
    return [
      new THREE.Vector3(box.min.x, box.min.y, box.min.z),
      new THREE.Vector3(box.min.x, box.min.y, box.max.z),
      new THREE.Vector3(box.min.x, box.max.y, box.min.z),
      new THREE.Vector3(box.min.x, box.max.y, box.max.z),
      new THREE.Vector3(box.max.x, box.min.y, box.min.z),
      new THREE.Vector3(box.max.x, box.min.y, box.max.z),
      new THREE.Vector3(box.max.x, box.max.y, box.min.z),
      new THREE.Vector3(box.max.x, box.max.y, box.max.z),
    ];
  }

  async _placeCapture(dataURL, filename, label) {
    // Upload the captured image to the server
    const blob = await (await fetch(dataURL)).blob();
    const formData = new FormData();
    formData.append('image', blob, filename);

    const resp = await fetch('/api/comfy/upload', { method: 'POST', body: formData });
    const result = await resp.json();

    // Parse dimensions from the dataURL
    const dims = await new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.src = dataURL;
    });

    // Create ImageNode on canvas
    if (window._createImageNode) {
      window._createImageNode({
        imageUrl: result.localPath,
        filename: filename,
        comfyName: result.comfyName,
        width: dims.width,
        height: dims.height,
        format: 'PNG',
        label: label,
      });
    }
  }

  _showError(msg) {
    const el = document.getElementById('viewer3d-error');
    if (el) el.textContent = msg;
  }

  // ── Open / Close / Minimize ────────────────

  async open(modelUrl, filename) {
    this.modal.classList.remove('hidden');
    this.pill.classList.add('hidden');
    this.minimized = false;

    try {
      this._initThree();

      // Need to resize after modal is visible
      requestAnimationFrame(() => {
        this._resize();
        if (!this.shaderSources.vertex) {
          this._loadShaderPreset('fresnel');
        }
        if (modelUrl) {
          this._loadModel(modelUrl);
          document.getElementById('viewer3d-model-info').textContent = filename || 'Model';
        }
      });
    } catch (err) {
      this._showError('open(): ' + err.message + '\n' + err.stack);
    }
  }


  close() {
    this.modal.classList.add('hidden');
    this.pill.classList.add('hidden');
    this.minimized = false;
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }

  minimize() {
    this.modal.classList.add('hidden');
    this.pill.classList.remove('hidden');
    this.minimized = true;
  }

  restore() {
    this.modal.classList.remove('hidden');
    this.pill.classList.add('hidden');
    this.minimized = false;
    requestAnimationFrame(() => this._resize());
    if (!this.animId) this._animate();
  }
}

window.Viewer3D = Viewer3D;
