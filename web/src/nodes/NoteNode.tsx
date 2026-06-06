import { NodeResizer, type NodeProps } from '@xyflow/react';
import type { NoteNodeData } from '../types';
import { useCanvasStore } from '../store';

/**
 * Sticky Note — a freeform text label for annotating a board. Resizable, no
 * ports. The colored top bar is the drag handle; the body is an editable
 * textarea (marked `nodrag`/`nowheel` so typing and scrolling don't pan/drag).
 */
export function NoteNode({ id, data, selected }: NodeProps) {
  const d = data as NoteNodeData;
  const color = d.color || '#ffe066';
  const w = d.viewW || 200;
  const h = d.viewH || 140;
  return (
    <>
      <NodeResizer
        color={color}
        isVisible={selected}
        minWidth={120}
        minHeight={80}
        onResize={(_, p) => useCanvasStore.getState().updateNodeData(id, { viewW: p.width, viewH: p.height })}
      />
      <div className={`cv-note${selected ? ' selected' : ''}`} style={{ width: w, height: h, background: color }}>
        <div className="cv-note-bar" />
        <textarea
          className="cv-note-text nodrag nowheel"
          value={d.text ?? ''}
          placeholder="Note…"
          onChange={(e) => useCanvasStore.getState().updateNodeData(id, { text: e.target.value })}
        />
      </div>
    </>
  );
}
