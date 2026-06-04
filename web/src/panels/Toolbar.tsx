import { useCanvasStore } from '../store';
import { useLogStore } from '../logStore';
import { useUI } from '../ui';
import { AddNodeMenu } from './AddNodeMenu';
import { StatusDot } from './StatusDot';
import type { CanvasFileV2 } from '../types';

/**
 * Toolbar: Add-node dropdown, Save/Load, Log, Settings, and a connection dot.
 * Node creation lives in nodeActions; modals/menus are driven by the UI store.
 */
export function Toolbar() {
  function saveCanvas() {
    // If nodes are selected, save just those (+ wires between them); else the whole canvas.
    const selection = useCanvasStore.getState().serializeSelection();
    const data = selection ?? useCanvasStore.getState().serialize();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selection ? 'canvas-selection.json' : 'canvas-project.json';
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
    <div className="cv-toolbar">
      <AddNodeMenu />
      <button onClick={saveCanvas}>💾 Save</button>
      <button onClick={loadCanvas}>📂 Load</button>
      <button onClick={() => useUI.getState().togglePrompts()}>📝 Prompts</button>
      <button onClick={() => useUI.getState().toggleGallery()}>🖼️ Gallery</button>
      <button onClick={() => useLogStore.getState().toggle()}>📋 Log</button>
      <button onClick={() => useUI.getState().setSettingsOpen(true)}>⚙️ Settings</button>
      <StatusDot onClick={() => useUI.getState().setSettingsOpen(true)} />
      <span className="cv-toolbar-note">React Flow preview</span>
    </div>
  );
}
