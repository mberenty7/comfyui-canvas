// @ts-nocheck
// Three.js model viewer with a Render Mode pipeline (Color / Depth / Normal /
// Normal Gray / Puzzle Matte). Kept loose (no TS). Manages its own modal DOM.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

// 20-color palette for Puzzle Matte (one flat color per mesh) — matches Color Pick.
const PALETTE = [
  '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#46f0f0',
  '#f032e6', '#bcf60c', '#fabebe', '#008080', '#e6beff', '#9a6324', '#fffac8',
  '#800000', '#aaffc3', '#808000', '#ffd8b1', '#000075', '#808080',
];

// Capture resolutions (longest side 1024).
const RES_OPTIONS = [
  { id: '1:1', label: '1:1 (1024²)', w: 1024, h: 1024 },
  { id: '16:9', label: '16:9', w: 1024, h: 576 },
  { id: '9:16', label: '9:16', w: 576, h: 1024 },
  { id: '4:3', label: '4:3', w: 1024, h: 768 },
  { id: '3:4', label: '3:4', w: 768, h: 1024 },
  { id: '3:2', label: '3:2', w: 1024, h: 683 },
  { id: '2:3', label: '2:3', w: 683, h: 1024 },
];

// Focal length (mm, 35mm full-frame 24mm sensor height) → vertical FOV degrees.
function focalToFov(mm) {
  return (2 * Math.atan(24 / (2 * mm)) * 180) / Math.PI;
}

// Compact local timestamp, e.g. "20260604-125301".
function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

class Viewer3D {
  constructor() {
    this.modal = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.controls = null;
    this.currentModel = null;
    this.clock = null;
    this.animId = null;
    this.grid = null;
    this.modelCenter = new THREE.Vector3();
    this.modelRadius = 1;

    // Settings
    this.mode = 'color';
    this.objectColor = '#b0b0b0';
    this.focal = 36;
    this.azimuth = -45;
    this.elevation = 45;
    this.bgColor = '#1a1a2e';
    this.autoRotate = false;
    this.showGrid = true;
    this.currentRes = RES_OPTIONS[0];

    this._buildShaders();
    this._buildDOM();
  }

  _buildShaders() {
    this.depthMat = new THREE.ShaderMaterial({
      uniforms: { uNear: { value: 0.1 }, uFar: { value: 10 } },
      vertexShader: `varying float vZ; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vZ = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vZ; uniform float uNear; uniform float uFar; void main(){ float d = clamp((vZ - uNear)/(uFar - uNear), 0.0, 1.0); float v = 1.0 - d; gl_FragColor = vec4(vec3(v), 1.0); }`,
    });
    this.normalMat = new THREE.ShaderMaterial({
      vertexShader: `varying vec3 vN; void main(){ vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vN; void main(){ gl_FragColor = vec4(normalize(vN) * 0.5 + 0.5, 1.0); }`,
    });
  }

  _buildDOM() {
    const modal = document.createElement('div');
    modal.id = 'viewer3d-modal';
    modal.className = 'viewer3d-modal hidden';
    modal.innerHTML = `
      <div class="viewer3d-container">
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
              <h4>Render Mode</h4>
              <select id="v3d-mode">
                <option value="color">Color</option>
                <option value="depth">Depth</option>
                <option value="normal">Normal</option>
                <option value="normalgray">Normal (Gray)</option>
                <option value="puzzle">Puzzle Matte</option>
              </select>
              <div class="viewer3d-controls" id="v3d-objcolor-row">
                <label>Object Color <input type="color" id="v3d-objcolor" value="#b0b0b0"></label>
              </div>
              <div class="viewer3d-controls" id="v3d-light-row" style="display:none">
                <label>Azimuth <input type="range" id="v3d-az" min="-180" max="180" value="-45"></label>
                <label>Elevation <input type="range" id="v3d-el" min="-90" max="90" value="45"></label>
              </div>
            </section>

            <section>
              <h4>Capture → Canvas</h4>
              <label>Resolution
                <select id="v3d-res">${RES_OPTIONS.map((r) => `<option value="${r.id}">${r.label}</option>`).join('')}</select>
              </label>
              <label>Focal Length <span id="v3d-focal-val">36mm</span>
                <input type="range" id="v3d-focal" min="10" max="200" step="1" value="36">
              </label>
              <button class="viewer3d-capture-btn" id="v3d-capture">📷 Capture</button>
            </section>

            <section>
              <h4>Scene</h4>
              <label>Background <input type="color" id="v3d-bg" value="#1a1a2e"></label>
              <label>Auto-Rotate <input type="checkbox" id="v3d-rotate"></label>
              <label>Show Grid <input type="checkbox" id="v3d-grid" checked></label>
            </section>

            <section>
              <h4>Model</h4>
              <div id="v3d-info" class="viewer3d-info">No model loaded</div>
              <div id="v3d-error" style="color:#ff4444;font-size:11px;font-family:monospace;white-space:pre-wrap;max-height:140px;overflow-y:auto"></div>
            </section>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    this.modal = modal;

    const pill = document.createElement('div');
    pill.id = 'viewer3d-pill';
    pill.className = 'viewer3d-pill hidden';
    pill.innerHTML = '🎲 3D Viewer';
    pill.addEventListener('click', () => this.restore());
    document.body.appendChild(pill);
    this.pill = pill;

    const $ = (id) => document.getElementById(id);
    $('viewer3d-close').addEventListener('click', () => this.close());
    $('viewer3d-minimize').addEventListener('click', () => this.minimize());

    $('v3d-mode').addEventListener('change', (e) => {
      this.mode = e.target.value;
      $('v3d-objcolor-row').style.display = this.mode === 'color' ? '' : 'none';
      $('v3d-light-row').style.display = this.mode === 'normalgray' ? '' : 'none';
      this._applyMode();
    });
    $('v3d-objcolor').addEventListener('input', (e) => {
      this.objectColor = e.target.value;
      if (this.mode === 'color') this._applyMode();
    });
    $('v3d-az').addEventListener('input', (e) => {
      this.azimuth = parseFloat(e.target.value);
      this._updateGrayLight();
    });
    $('v3d-el').addEventListener('input', (e) => {
      this.elevation = parseFloat(e.target.value);
      this._updateGrayLight();
    });
    $('v3d-res').addEventListener('change', (e) => {
      this.currentRes = RES_OPTIONS.find((r) => r.id === e.target.value) || RES_OPTIONS[0];
    });
    $('v3d-focal').addEventListener('input', (e) => {
      this.focal = parseFloat(e.target.value);
      $('v3d-focal-val').textContent = `${this.focal}mm`;
      this._applyFocal();
    });
    $('v3d-bg').addEventListener('input', (e) => {
      this.bgColor = e.target.value;
      if (this.scene && (this.mode === 'color' || this.mode === 'normalgray')) this.scene.background = new THREE.Color(this.bgColor);
    });
    $('v3d-rotate').addEventListener('change', (e) => {
      this.autoRotate = e.target.checked;
      if (this.controls) this.controls.autoRotate = this.autoRotate;
    });
    $('v3d-grid').addEventListener('change', (e) => {
      this.showGrid = e.target.checked;
      if (this.grid) this.grid.visible = this.showGrid && this.mode === 'color';
    });
    $('v3d-capture').addEventListener('click', () => this._capture());

    const viewport = $('viewer3d-viewport');
    viewport.addEventListener('dragover', (e) => {
      e.preventDefault();
      $('viewer3d-dropzone').classList.add('active');
    });
    viewport.addEventListener('dragleave', (e) => {
      if (!viewport.contains(e.relatedTarget)) $('viewer3d-dropzone').classList.remove('active');
    });
    viewport.addEventListener('drop', (e) => {
      e.preventDefault();
      $('viewer3d-dropzone').classList.remove('active');
      const file = e.dataTransfer.files[0];
      if (file && /\.(glb|gltf|obj|fbx)$/i.test(file.name)) {
        this._loadModel(URL.createObjectURL(file));
        $('v3d-info').textContent = file.name;
      }
    });
  }

  _destroyThree() {
    if (this.animId) cancelAnimationFrame(this.animId);
    this.animId = null;
    if (this.controls) { this.controls.dispose(); this.controls = null; }
    if (this.renderer) { this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer = null; }
    this.scene = null;
    this.camera = null;
    this.grid = null;
    this.currentModel = null;
  }

  _initThree() {
    this._destroyThree();
    const old = document.getElementById('viewer3d-canvas');
    const canvas = document.createElement('canvas');
    canvas.id = 'viewer3d-canvas';
    old.parentNode.replaceChild(canvas, old);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.bgColor);

    this.camera = new THREE.PerspectiveCamera(focalToFov(this.focal), 1, 0.01, 1000);
    this.camera.position.set(0, 1, 3);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0.5, 0);
    this.controls.autoRotate = this.autoRotate;

    // Beauty lighting (4-light setup) — used in Color mode.
    this.ambient = new THREE.AmbientLight(0xffffff, 0.3);
    this.scene.add(this.ambient);
    this.beautyLights = [];
    const beautySpecs = [
      [0xffffff, 1.1, [4, 6, 5]],
      [0xbcccff, 0.5, [-5, 2, 3]],
      [0xffffff, 0.6, [0, 4, -6]],
      [0xffe6c0, 0.4, [3, -2, 2]],
    ];
    for (const [color, intensity, pos] of beautySpecs) {
      const l = new THREE.DirectionalLight(color, intensity);
      l.position.set(...pos);
      this.scene.add(l);
      this.beautyLights.push(l);
    }
    // Single light for Normal (Gray) mode.
    this.grayLight = new THREE.DirectionalLight(0xffffff, 1.2);
    this.scene.add(this.grayLight);
    this._updateGrayLight();

    this.grid = new THREE.GridHelper(4, 20, 0x333355, 0x222244);
    this.scene.add(this.grid);

    this.clock = new THREE.Clock();
    this._resize();
    this._animate();
  }

  _updateGrayLight() {
    if (!this.grayLight) return;
    const az = (this.azimuth * Math.PI) / 180;
    const el = (this.elevation * Math.PI) / 180;
    const d = 8;
    this.grayLight.position.set(d * Math.cos(el) * Math.sin(az), d * Math.sin(el), d * Math.cos(el) * Math.cos(az));
    this.grayLight.target.position.set(0, 0.5, 0);
    this.grayLight.target.updateMatrixWorld();
  }

  _applyFocal() {
    if (!this.camera) return;
    this.camera.fov = focalToFov(this.focal);
    this.camera.updateProjectionMatrix();
  }

  _bgForMode() {
    if (this.mode === 'depth' || this.mode === 'puzzle') return '#000000';
    if (this.mode === 'normal') return '#3a4a8a';
    return this.bgColor;
  }

  _meshes() {
    const out = [];
    if (this.currentModel) this.currentModel.traverse((c) => { if (c.isMesh || c.isSkinnedMesh) out.push(c); });
    return out;
  }

  _applyMode() {
    if (!this.renderer) return;
    const meshes = this._meshes();

    if (this.mode === 'color') {
      const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(this.objectColor), metalness: 0.1, roughness: 0.7 });
      meshes.forEach((x) => (x.material = m));
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    } else if (this.mode === 'depth') {
      meshes.forEach((x) => (x.material = this.depthMat));
      this.renderer.toneMapping = THREE.NoToneMapping;
    } else if (this.mode === 'normal') {
      meshes.forEach((x) => (x.material = this.normalMat));
      this.renderer.toneMapping = THREE.NoToneMapping;
    } else if (this.mode === 'normalgray') {
      const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
      meshes.forEach((x) => (x.material = m));
      this.renderer.toneMapping = THREE.NoToneMapping;
    } else if (this.mode === 'puzzle') {
      meshes.forEach((x, i) => (x.material = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE[i % PALETTE.length]) })));
      this.renderer.toneMapping = THREE.NoToneMapping;
    }

    // Lights: beauty for color; single light for normalgray; off otherwise.
    this.ambient.intensity = this.mode === 'color' ? 0.3 : this.mode === 'normalgray' ? 0.15 : 0;
    this.beautyLights.forEach((l) => (l.visible = this.mode === 'color'));
    this.grayLight.visible = this.mode === 'normalgray';

    this.scene.background = new THREE.Color(this._bgForMode());
    this.grid.visible = this.showGrid && this.mode === 'color';
    meshes.forEach((x) => x.material && (x.material.needsUpdate = true));
  }

  _resize() {
    if (!this.renderer) return;
    const vp = document.getElementById('viewer3d-viewport');
    if (!vp) return;
    const w = vp.clientWidth;
    const h = vp.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _updateDepthUniforms(cam) {
    const dist = cam.position.distanceTo(this.modelCenter);
    this.depthMat.uniforms.uNear.value = Math.max(0.001, dist - this.modelRadius);
    this.depthMat.uniforms.uFar.value = dist + this.modelRadius;
  }

  _animate() {
    this.animId = requestAnimationFrame(() => this._animate());
    this.controls.update();
    if (this.mode === 'depth') this._updateDepthUniforms(this.camera);
    this.renderer.render(this.scene, this.camera);
  }

  _loadModel(url) {
    if (this.currentModel) {
      this.scene.remove(this.currentModel);
      this.currentModel.traverse((c) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => m.dispose());
      });
    }
    document.getElementById('v3d-info').textContent = 'Loading...';
    const ext = url.split('.').pop().split('?')[0].toLowerCase();

    const onLoaded = (object) => {
      this.currentModel = object.scene || object;
      const box = new THREE.Box3().setFromObject(this.currentModel);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const scale = 2 / maxDim;
      this.currentModel.scale.setScalar(scale);
      this.currentModel.position.sub(center.multiplyScalar(scale));
      this.scene.add(this.currentModel);

      const fitBox = new THREE.Box3().setFromObject(this.currentModel);
      this.modelCenter = fitBox.getCenter(new THREE.Vector3());
      this.modelRadius = fitBox.getSize(new THREE.Vector3()).length() / 2 || 1;

      this._applyMode();
      document.getElementById('v3d-info').textContent = `${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}`;
    };
    const onError = (err) => {
      document.getElementById('v3d-info').textContent = 'Failed to load';
      this._showError('Model load: ' + (err.message || err));
    };

    if (ext === 'obj') new OBJLoader().load(url, onLoaded, undefined, onError);
    else if (ext === 'fbx') new FBXLoader().load(url, onLoaded, undefined, onError);
    else new GLTFLoader().load(url, onLoaded, undefined, onError);
  }

  async _capture() {
    if (!this.currentModel) return;
    const { w, h } = this.currentRes;
    const off = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    off.setPixelRatio(1);
    off.setSize(w, h);
    off.outputColorSpace = THREE.SRGBColorSpace;
    off.toneMapping = this.mode === 'color' ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    off.toneMappingExposure = 1.0;

    const cam = this.camera.clone();
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    if (this.mode === 'depth') this._updateDepthUniforms(cam);

    const gridWas = this.grid.visible;
    this.grid.visible = false;
    off.render(this.scene, cam);
    const dataURL = off.domElement.toDataURL('image/png');
    this.grid.visible = gridWas;
    off.dispose();
    off.forceContextLoss();

    await this._placeCapture(dataURL, `${this.mode}_${w}x${h}_${timestamp()}.png`, this.mode);
  }

  async _placeCapture(dataURL, filename, label) {
    const blob = await (await fetch(dataURL)).blob();
    const formData = new FormData();
    formData.append('image', blob, filename);
    const resp = await fetch('/api/comfy/upload', { method: 'POST', body: formData });
    const raw = await resp.json();
    // /api/comfy/upload wraps its payload as { ok, data }.
    const result = raw && typeof raw === 'object' && 'ok' in raw ? raw.data || {} : raw;

    // Best-effort copy to the configured output directory.
    try {
      const outForm = new FormData();
      outForm.append('image', blob, filename);
      outForm.append('filename', filename);
      outForm.append('metadata', JSON.stringify({ timestamp: new Date().toISOString(), source: '3d-viewer', mode: label }));
      fetch('/api/save-image-file', { method: 'POST', body: outForm });
    } catch (e) {
      /* output dir not set — non-fatal */
    }

    const dims = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.src = dataURL;
    });

    if (captureHandler) {
      captureHandler({
        imageUrl: result.localPath,
        filename,
        comfyName: result.comfyName,
        width: dims.width,
        height: dims.height,
        format: 'PNG',
        label,
      });
    }
  }

  _showError(msg) {
    const el = document.getElementById('v3d-error');
    if (el) el.textContent = msg;
  }

  async open(modelUrl, filename) {
    this.modal.classList.remove('hidden');
    this.pill.classList.add('hidden');
    const errEl = document.getElementById('v3d-error');
    if (errEl) errEl.textContent = '';
    try {
      this._initThree();
      requestAnimationFrame(() => {
        this._resize();
        if (modelUrl) {
          this._loadModel(modelUrl);
          document.getElementById('v3d-info').textContent = filename || 'Model';
        }
      });
    } catch (err) {
      this._showError('open(): ' + err.message + '\n' + err.stack);
    }
  }

  close() {
    this.modal.classList.add('hidden');
    this.pill.classList.add('hidden');
    this._destroyThree();
    const errEl = document.getElementById('v3d-error');
    if (errEl) errEl.textContent = '';
  }

  minimize() {
    this.modal.classList.add('hidden');
    this.pill.classList.remove('hidden');
  }

  restore() {
    this.modal.classList.remove('hidden');
    this.pill.classList.add('hidden');
    requestAnimationFrame(() => this._resize());
    if (!this.animId && this.renderer) this._animate();
  }
}

let _instance = null;
export function getViewer3D() {
  if (!_instance) _instance = new Viewer3D();
  return _instance;
}
export let captureHandler = null;
export function setCaptureHandler(fn) {
  captureHandler = fn;
}
