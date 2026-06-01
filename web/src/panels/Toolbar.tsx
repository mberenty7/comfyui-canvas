import { useReactFlow } from '@xyflow/react';
import { useCanvasStore } from '../store';
import type { CanvasFileV2 } from '../types';

/**
 * Minimal toolbar for the slice: add a Prompt node, plus Save / Load that use
 * the legacy v2 file format so projects are interchangeable with the fabric app.
 */
export function Toolbar() {
  const rf = useReactFlow();
  const addNode = useCanvasStore((s) => s.addNode);

  function addPrompt() {
    const center = rf.screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    addNode('prompt', { label: '', positive: '', negative: '' }, { x: center.x - 80, y: center.y - 25 });
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
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const data = JSON.parse(await file.text()) as CanvasFileV2;
      useCanvasStore.getState().deserialize(data);
    };
    input.click();
  }

  return (
    <div className="cv-toolbar">
      <button onClick={addPrompt}>➕ Prompt</button>
      <button onClick={saveCanvas}>💾 Save</button>
      <button onClick={loadCanvas}>📂 Load</button>
      <span className="cv-toolbar-note">React Flow preview</span>
    </div>
  );
}
