// Blockout Studio — 3D Blockout → Style Transfer via Nano Banana
// Phase 1: Three.js viewport with model loading, HDRI lighting, render capture
// Phase 2: Reference slots, prompt, stylize pipeline

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

class BlockoutStudio {
  constructor() {
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.controls = null;
    this.currentModel = null;
    this.animId = null;
    this.envMap = null;
    this.envIntensity = 1.0;
    this.bgMode = 'white';
    this.refs = [null, null, null]; // 3 art direction reference data URLs

    this._initThree();
    this._initUI();
    this._initDropzone();
    this._initRefSlots();
    this._generateProceduralHDRIs();
    this._setEnvironment('studio');
    this._animate();
  }

  // ─── Three.js Setup ───

  _initThree() {
    const canvas = document.getElementById('viewport-canvas');
    const container = document.getElementById('viewport-panel');

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xffffff);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
    this.camera.position.set(3, 2, 3);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0, 0);

    // Grid
    this.grid = new THREE.GridHelper(10, 20, 0x333333, 0x222222);
    this.scene.add(this.grid);

    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const container = document.getElementById('viewport-panel');
    const w = container.clientWidth;
    const h = container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _animate() {
    this.animId = requestAnimationFrame(() => this._animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  // ─── Procedural HDRI Environments ───

  _generateProceduralHDRIs() {
    this.hdriMaps = {};

    const presets = {
      studio: {
        topColor: new THREE.Color(0.95, 0.95, 1.0),
        midColor: new THREE.Color(0.8, 0.8, 0.85),
        bottomColor: new THREE.Color(0.4, 0.4, 0.45),
        sunColor: new THREE.Color(1.0, 0.95, 0.9),
        sunPos: new THREE.Vector3(1, 1, 0.5),
        sunIntensity: 2.0,
      },
      outdoor: {
        topColor: new THREE.Color(0.3, 0.5, 0.9),
        midColor: new THREE.Color(0.7, 0.8, 0.95),
        bottomColor: new THREE.Color(0.4, 0.35, 0.3),
        sunColor: new THREE.Color(1.0, 0.9, 0.7),
        sunPos: new THREE.Vector3(0.5, 0.8, 0.3),
        sunIntensity: 3.0,
      },
      overcast: {
        topColor: new THREE.Color(0.65, 0.68, 0.72),
        midColor: new THREE.Color(0.6, 0.62, 0.66),
        bottomColor: new THREE.Color(0.35, 0.35, 0.38),
        sunColor: new THREE.Color(0.75, 0.75, 0.78),
        sunPos: new THREE.Vector3(0, 1, 0),
        sunIntensity: 0.5,
      },
      dramatic: {
        topColor: new THREE.Color(0.05, 0.05, 0.15),
        midColor: new THREE.Color(0.15, 0.1, 0.2),
        bottomColor: new THREE.Color(0.02, 0.02, 0.05),
        sunColor: new THREE.Color(1.0, 0.6, 0.3),
        sunPos: new THREE.Vector3(-0.5, 0.2, 0.8),
        sunIntensity: 5.0,
      }
    };

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();

    for (const [name, preset] of Object.entries(presets)) {
      const envScene = new THREE.Scene();

      // Sky gradient via large sphere
      const skyGeo = new THREE.SphereGeometry(50, 32, 32);
      const skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: {
          topColor: { value: preset.topColor },
          midColor: { value: preset.midColor },
          bottomColor: { value: preset.bottomColor },
          sunColor: { value: preset.sunColor },
          sunPos: { value: preset.sunPos.normalize() },
          sunIntensity: { value: preset.sunIntensity },
        },
        vertexShader: `
          varying vec3 vWorldPos;
          void main() {
            vec4 worldPos = modelMatrix * vec4(position, 1.0);
            vWorldPos = worldPos.xyz;
            gl_Position = projectionMatrix * viewMatrix * worldPos;
          }
        `,
        fragmentShader: `
          uniform vec3 topColor;
          uniform vec3 midColor;
          uniform vec3 bottomColor;
          uniform vec3 sunColor;
          uniform vec3 sunPos;
          uniform float sunIntensity;
          varying vec3 vWorldPos;
          void main() {
            vec3 dir = normalize(vWorldPos);
            float y = dir.y;
            vec3 sky = y > 0.0
              ? mix(midColor, topColor, y)
              : mix(midColor, bottomColor, -y);
            // Sun glow
            float sunDot = max(dot(dir, sunPos), 0.0);
            sky += sunColor * pow(sunDot, 64.0) * sunIntensity;
            sky += sunColor * pow(sunDot, 8.0) * sunIntensity * 0.2;
            gl_FragColor = vec4(sky, 1.0);
          }
        `
      });
      const skyMesh = new THREE.Mesh(skyGeo, skyMat);
      envScene.add(skyMesh);

      const envRT = pmremGenerator.fromScene(envScene, 0.04);
      this.hdriMaps[name] = envRT.texture;
      envScene.clear();
    }

    pmremGenerator.dispose();
  }

  _setEnvironment(name) {
    const map = this.hdriMaps[name];
    if (!map) return;
    this.envMap = map;
    this.scene.environment = map;
    this._updateBackground();
    this._applyEnvToModel();
  }

  _updateBackground() {
    if (this.bgMode === 'white') {
      this.scene.background = new THREE.Color(0xffffff);
    } else {
      this.scene.background = null;
    }
  }

  _applyEnvToModel() {
    if (!this.currentModel) return;
    this.currentModel.traverse(child => {
      if (child.isMesh && child.material) {
        const mat = child.material;
        mat.envMap = this.envMap;
        mat.envMapIntensity = this.envIntensity;
        mat.needsUpdate = true;
      }
    });
  }

  // ─── Model Loading ───

  async loadModel(file) {
    const url = URL.createObjectURL(file);
    const ext = file.name.split('.').pop().toLowerCase();

    let loader;
    if (ext === 'glb' || ext === 'gltf') {
      loader = new GLTFLoader();
    } else if (ext === 'obj') {
      loader = new OBJLoader();
    } else if (ext === 'fbx') {
      loader = new FBXLoader();
    } else {
      this._setStatus(`Unsupported format: .${ext}`);
      return;
    }

    this._setStatus('Loading model...');

    try {
      const result = await new Promise((resolve, reject) => {
        loader.load(url, resolve, undefined, reject);
      });

      // Remove previous model
      if (this.currentModel) {
        this.scene.remove(this.currentModel);
      }

      const model = result.scene || result;

      // Center and scale
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 2.0 / maxDim;
      model.scale.setScalar(scale);
      model.position.sub(center.multiplyScalar(scale));

      // Ensure materials use environment
      model.traverse(child => {
        if (child.isMesh && child.material) {
          // If material has no map, give it a neutral standard material
          if (!child.material.isMeshStandardMaterial && !child.material.isMeshPhysicalMaterial) {
            child.material = new THREE.MeshStandardMaterial({
              color: child.material.color || 0x888888,
              roughness: 0.6,
              metalness: 0.1,
            });
          }
          child.material.envMap = this.envMap;
          child.material.envMapIntensity = this.envIntensity;
          child.material.needsUpdate = true;
        }
      });

      this.scene.add(model);
      this.currentModel = model;

      // Fit camera
      const scaledBox = new THREE.Box3().setFromObject(model);
      const scaledSize = scaledBox.getSize(new THREE.Vector3());
      const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
      const dist = Math.max(scaledSize.x, scaledSize.y, scaledSize.z) * 1.8;
      this.camera.position.set(
        scaledCenter.x + dist * 0.7,
        scaledCenter.y + dist * 0.5,
        scaledCenter.z + dist * 0.7
      );
      this.controls.target.copy(scaledCenter);
      this.controls.update();

      // Hide dropzone, enable stylize
      document.getElementById('dropzone').classList.add('hidden');
      document.getElementById('btn-stylize').disabled = false;

      this._setStatus(`Loaded: ${file.name}`);

    } catch (err) {
      console.error('Model load error:', err);
      this._setStatus(`Error: ${err.message}`);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // ─── Render Capture ───

  captureRender() {
    // Temporarily set background based on mode
    const prevBg = this.scene.background;

    if (this.bgMode === 'alpha') {
      this.scene.background = null;
    }

    this.renderer.render(this.scene, this.camera);
    const dataUrl = this.renderer.domElement.toDataURL('image/png');

    this.scene.background = prevBg;
    return dataUrl;
  }

  // ─── Stylize Pipeline ───

  async stylize() {
    if (!this.currentModel) return;

    const btn = document.getElementById('btn-stylize');
    btn.disabled = true;
    btn.textContent = '⏳ Rendering...';
    btn.classList.add('loading');
    this._setStatus('Capturing render...');

    try {
      // Step 1: Capture the 3D render
      const renderDataUrl = this.captureRender();

      // Show render preview
      this._showOutput('render', renderDataUrl);

      // Step 2: Build form data
      btn.textContent = '⏳ Stylizing...';
      this._setStatus('Submitting to Nano Banana...');

      const prompt = document.getElementById('prompt').value.trim();
      const model = document.getElementById('model-select').value;

      const body = {
        render: renderDataUrl,
        refs: this.refs.filter(r => r !== null),
        prompt,
        model,
      };

      // Step 3: Submit to server
      const resp = await fetch('/api/blockout/stylize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(err || `HTTP ${resp.status}`);
      }

      const result = await resp.json();

      // Step 4: Show output
      if (result.imageUrl) {
        this._showOutput('stylized', result.imageUrl);
        document.getElementById('output-actions').classList.remove('hidden');
        this._setStatus('Done!');
      } else {
        throw new Error('No image in response');
      }

    } catch (err) {
      console.error('Stylize error:', err);
      this._setStatus(`Error: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = '🎨 Stylize';
      btn.classList.remove('loading');
    }
  }

  // ─── UI ───

  _initUI() {
    // Load model button
    document.getElementById('btn-load-model').addEventListener('click', () => {
      document.getElementById('file-input').click();
    });

    document.getElementById('file-input').addEventListener('change', e => {
      if (e.target.files[0]) this.loadModel(e.target.files[0]);
    });

    // HDRI select
    document.getElementById('hdri-select').addEventListener('change', e => {
      this._setEnvironment(e.target.value);
    });

    // HDRI intensity
    document.getElementById('hdri-intensity').addEventListener('input', e => {
      this.envIntensity = parseFloat(e.target.value);
      document.getElementById('hdri-intensity-val').textContent = this.envIntensity.toFixed(2);
      this.renderer.toneMappingExposure = this.envIntensity;
      this._applyEnvToModel();
    });

    // Background mode
    document.getElementById('bg-mode').addEventListener('change', e => {
      this.bgMode = e.target.value;
      this._updateBackground();
    });

    // Stylize button
    document.getElementById('btn-stylize').addEventListener('click', () => this.stylize());

    // Output tabs
    document.querySelectorAll('.output-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.output-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const which = tab.dataset.tab;
        document.getElementById('output-stylized').classList.toggle('hidden', which !== 'stylized');
        document.getElementById('output-render').classList.toggle('hidden', which !== 'render');
      });
    });

    // Save buttons
    document.getElementById('btn-save-both').addEventListener('click', () => this._saveBoth());
    document.getElementById('btn-save-stylized').addEventListener('click', () => this._saveImage('stylized'));
  }

  _initDropzone() {
    const dz = document.getElementById('dropzone');
    const vp = document.getElementById('viewport-panel');

    ['dragenter', 'dragover'].forEach(evt => {
      vp.addEventListener(evt, e => {
        e.preventDefault();
        e.stopPropagation();
        dz.classList.add('drag-over');
        dz.style.pointerEvents = 'auto';
      });
    });

    ['dragleave', 'drop'].forEach(evt => {
      vp.addEventListener(evt, e => {
        e.preventDefault();
        e.stopPropagation();
        dz.classList.remove('drag-over');
        dz.style.pointerEvents = 'none';
      });
    });

    vp.addEventListener('drop', e => {
      const file = e.dataTransfer.files[0];
      if (file) this.loadModel(file);
    });
  }

  _initRefSlots() {
    document.querySelectorAll('.ref-slot').forEach(slot => {
      const idx = parseInt(slot.dataset.slot) - 1;
      const fileInput = slot.querySelector('input[type="file"]');
      const preview = slot.querySelector('.ref-preview');
      const placeholder = slot.querySelector('.ref-placeholder');
      const clearBtn = slot.querySelector('.ref-clear');

      // Click to upload
      slot.addEventListener('click', e => {
        if (e.target === clearBtn) return;
        fileInput.click();
      });

      // File selected
      fileInput.addEventListener('change', e => {
        if (e.target.files[0]) this._setRef(idx, e.target.files[0]);
      });

      // Drag & drop
      slot.addEventListener('dragover', e => {
        e.preventDefault();
        slot.classList.add('drag-over');
      });

      slot.addEventListener('dragleave', () => {
        slot.classList.remove('drag-over');
      });

      slot.addEventListener('drop', e => {
        e.preventDefault();
        e.stopPropagation();
        slot.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
          this._setRef(idx, file);
        }
      });

      // Clear
      clearBtn.addEventListener('click', e => {
        e.stopPropagation();
        this.refs[idx] = null;
        preview.classList.add('hidden');
        placeholder.classList.remove('hidden');
        clearBtn.classList.add('hidden');
        slot.classList.remove('has-image');
      });
    });
  }

  _setRef(idx, file) {
    const reader = new FileReader();
    reader.onload = e => {
      this.refs[idx] = e.target.result;
      const slot = document.querySelector(`.ref-slot[data-slot="${idx + 1}"]`);
      const preview = slot.querySelector('.ref-preview');
      const placeholder = slot.querySelector('.ref-placeholder');
      const clearBtn = slot.querySelector('.ref-clear');

      preview.src = e.target.result;
      preview.classList.remove('hidden');
      placeholder.classList.add('hidden');
      clearBtn.classList.remove('hidden');
      slot.classList.add('has-image');
    };
    reader.readAsDataURL(file);
  }

  _showOutput(which, src) {
    const img = document.getElementById(`output-${which}`);
    img.src = src;
    img.classList.remove('hidden');
    document.getElementById('output-placeholder').classList.add('hidden');

    // Switch to the tab we just updated
    document.querySelectorAll('.output-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.output-tab[data-tab="${which}"]`).classList.add('active');
    document.getElementById('output-stylized').classList.toggle('hidden', which !== 'stylized');
    document.getElementById('output-render').classList.toggle('hidden', which !== 'render');
  }

  _saveImage(which) {
    const img = document.getElementById(`output-${which}`);
    if (!img.src) return;
    const a = document.createElement('a');
    a.href = img.src;
    a.download = `blockout-${which}-${Date.now()}.png`;
    a.click();
  }

  _saveBoth() {
    this._saveImage('render');
    setTimeout(() => this._saveImage('stylized'), 500);
  }

  _setStatus(msg) {
    document.getElementById('status').textContent = msg;
  }
}

// Boot
const studio = new BlockoutStudio();
