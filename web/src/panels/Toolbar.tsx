import { useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useCanvasStore } from '../store';
import { WorkflowPicker } from './WorkflowPicker';
import type { CanvasFileV2 } from '../types';

/**
 * Toolbar for the slice: add Prompt / Image / Workflow nodes, plus Save / Load
 * using the legacy v2 file format so projects interchange with the fabric app.
 */
export function Toolbar() {
  const rf = useReactFlow();
  const addNode = useCanvasStore((s) => s.addNode);
  const [pickerOpen, setPickerOpen] = useState(false);

  function center() {
    return rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  }

  function addPrompt() {
    const c = center();
    addNode('prompt', { label: '', positive: '', negative: '' }, { x: c.x - 80, y: c.y - 25 });
  }

  function addImage() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const form = new FormData();
      form.append('image', file);
      const result = await (await fetch('/api/upload', { method: 'POST', body: form })).json();
      if (result.error) {
        alert('Upload failed: ' + result.error);
        return;
      }
      const dims = await imageDimensions(result.path);
      const c = center();
      const id = addNode(
        'image',
        {
          label: '',
          imageUrl: result.path,
          filename: result.originalName || file.name,
          comfyName: result.filename,
          width: dims.width,
          height: dims.height,
          fileSize: file.size,
          format: file.type.split('/')[1]?.toUpperCase() || '?',
          needsComfyUpload: true,
        },
        { x: c.x - 90, y: c.y - 90 },
      );
      // Best-effort upload to ComfyUI so the image can be used as a reference.
      try {
        const comfyForm = new FormData();
        comfyForm.append('image', file);
        const comfy = await (await fetch('/api/comfy/upload', { method: 'POST', body: comfyForm })).json();
        if (comfy.comfyName) {
          useCanvasStore.getState().updateNodeData(id, { comfyName: comfy.comfyName, needsComfyUpload: false });
        }
      } catch {
        /* ComfyUI offline — will upload at generate time */
      }
    };
    input.click();
  }

  function saveCanvas() {
    const data = useCanvasStore.getState().serialize();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'canvas-project.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function loadCanvas() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const data = JSON.parse(await file.text()) as CanvasFileV2;
      useCanvasStore.getState().deserialize(data);
    };
    input.click();
  }

  return (
    <>
      <div className="cv-toolbar">
        <button onClick={addPrompt}>✏️ Prompt</button>
        <button onClick={addImage}>📷 Image</button>
        <button onClick={() => setPickerOpen(true)}>⚙️ Workflow</button>
        <button onClick={saveCanvas}>💾 Save</button>
        <button onClick={loadCanvas}>📂 Load</button>
        <span className="cv-toolbar-note">React Flow preview</span>
      </div>
      {pickerOpen && (
        <WorkflowPicker
          onCancel={() => setPickerOpen(false)}
          onPick={(data) => {
            setPickerOpen(false);
            const c = center();
            addNode('workflow', data, { x: c.x - 90, y: c.y - 35 });
          }}
        />
      )}
    </>
  );
}

function imageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = url;
  });
}
