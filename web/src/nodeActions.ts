import { useCanvasStore } from './store';
import { useUI } from './ui';
import { apiUpload } from './api';

export type NodeKind = 'prompt' | 'image' | 'workflow' | 'generate' | 'model' | 'viewer' | 'inpaint' | 'colorpick' | 'overlay';

/** The node types offered in the Add-node menu and Tab quick-add. */
export const NODE_KINDS: { type: NodeKind; label: string }[] = [
  { type: 'prompt', label: '✏️ Prompt' },
  { type: 'image', label: '📷 Image' },
  { type: 'workflow', label: '⚙️ Workflow' },
  { type: 'inpaint', label: '🎨 Inpaint' },
  { type: 'colorpick', label: '🎯 Color Pick' },
  { type: 'overlay', label: '🟥 Overlay' },
  { type: 'model', label: '🎲 3D Model' },
  { type: 'viewer', label: '👁 3D Viewer' },
  { type: 'generate', label: '▶ Generate' },
];

type Pos = { x: number; y: number };

export function imageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = url;
  });
}

/** Upload an image file and place an Image node at the given flow position. */
export async function uploadImageFile(file: File, pos: Pos) {
  const form = new FormData();
  form.append('image', file);
  const result = await apiUpload<{ path?: string; localPath?: string; filename?: string; originalName?: string; error?: string }>(
    '/api/upload',
    form,
  );
  const url = result.path || result.localPath;
  if (!url) {
    alert('Upload failed: ' + (result.error || 'unknown'));
    return;
  }
  const dims = await imageDimensions(url);
  const id = useCanvasStore.getState().addNode(
    'image',
    {
      label: '',
      imageUrl: url,
      filename: result.originalName || file.name,
      comfyName: result.filename,
      width: dims.width,
      height: dims.height,
      fileSize: file.size,
      format: file.type.split('/')[1]?.toUpperCase() || '?',
      needsComfyUpload: true,
    },
    { x: pos.x - 90, y: pos.y - 90 },
  );
  // Best-effort upload to ComfyUI so the image can be used as a reference.
  try {
    const comfyForm = new FormData();
    comfyForm.append('image', file);
    const comfy = await apiUpload<{ comfyName?: string }>('/api/comfy/upload', comfyForm);
    if (comfy.comfyName) {
      useCanvasStore.getState().updateNodeData(id, { comfyName: comfy.comfyName, needsComfyUpload: false });
    }
  } catch {
    /* ComfyUI offline — will upload at generate time */
  }
}

/** Upload a 3D model file and place a Model node at the given flow position. */
export async function uploadModelFile(file: File, pos: Pos) {
  const form = new FormData();
  form.append('model', file);
  const result = await apiUpload<{ path?: string; originalName?: string }>('/api/models/upload', form);
  if (!result.path) {
    alert('Model upload failed');
    return;
  }
  useCanvasStore.getState().addNode(
    'model',
    {
      label: '',
      modelUrl: result.path,
      filename: result.originalName || file.name,
      format: (file.name.split('.').pop() || '').toUpperCase(),
      fileSize: file.size,
    },
    { x: pos.x - 90, y: pos.y - 35 },
  );
}

function pickFile(accept: string, onPick: (file: File) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) onPick(file);
  };
  input.click();
}

/** Create a node of the given kind at a flow position (handles uploads/picker). */
export function createNodeAt(type: NodeKind, pos: Pos) {
  const store = useCanvasStore.getState();
  switch (type) {
    case 'prompt':
      store.addNode('prompt', { label: '', positive: '', negative: '' }, { x: pos.x - 80, y: pos.y - 25 });
      break;
    case 'generate':
      store.addNode(
        'generate',
        { label: '', count: 1, seedMode: 'increment', baseSeed: Math.floor(Math.random() * 999999), outputName: 'canvas_output', connectedWorkflow: null },
        { x: pos.x - 80, y: pos.y - 30 },
      );
      break;
    case 'image':
      pickFile('image/*', (file) => uploadImageFile(file, pos));
      break;
    case 'model':
      pickFile('.glb,.gltf,.obj,.fbx', (file) => uploadModelFile(file, pos));
      break;
    case 'viewer':
      store.addNode('viewer', { label: '', connectedModel: null }, { x: pos.x - 90, y: pos.y - 35 });
      break;
    case 'inpaint':
      store.addNode('inpaint', { label: '', connectedImage: null, maskComfyName: null, maskDataUrl: null }, { x: pos.x - 80, y: pos.y - 30 });
      break;
    case 'colorpick':
      store.addNode('colorpick', { label: '', pickColor: '#3cb44b', tolerance: 30, resultUrl: null, comfyName: null }, { x: pos.x - 80, y: pos.y - 40 });
      break;
    case 'overlay':
      store.addNode('overlay', { label: '', color: '#ff0000', opacity: 50, invert: false, expand: 0, resultUrl: null, comfyName: null }, { x: pos.x - 80, y: pos.y - 40 });
      break;
    case 'workflow':
      useUI.getState().openWorkflowPicker(pos);
      break;
  }
}
