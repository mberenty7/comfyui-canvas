import { NodeResizer, type NodeProps } from '@xyflow/react';
import { useCanvasStore } from '../store';

/** hex → rgba string with the given alpha. */
function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Network Box — a resizable, titled, colored region (Houdini-style). It renders
 * behind the graph and drags its contained nodes along (handled in App via
 * sticky containment). No ports; purely organizational.
 */
export function NetBoxNode({ id, data, selected }: NodeProps) {
  const d = data as { label?: string; color?: string; width?: number; height?: number };
  const color = d.color || '#4a9eff';
  const w = d.width || 320;
  const h = d.height || 220;
  return (
    <>
      <NodeResizer
        color={color}
        isVisible={selected}
        minWidth={140}
        minHeight={90}
        onResize={(_, p) => useCanvasStore.getState().updateNodeData(id, { width: p.width, height: p.height })}
      />
      <div
        className={`cv-netbox${selected ? ' selected' : ''}`}
        style={{ width: w, height: h, borderColor: color, background: hexA(color, 0.06) }}
      >
        <div className="cv-netbox-title" style={{ color, background: hexA(color, 0.14) }}>
          {d.label || 'Box'}
        </div>
      </div>
    </>
  );
}
