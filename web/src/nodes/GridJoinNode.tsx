import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { GridJoinNodeData } from '../types';
import { OUTPUT_HANDLE } from '../ports';

const QUADS: { id: string; label: string; top: number }[] = [
  { id: 'quad_tl', label: '↖', top: 26 },
  { id: 'quad_tr', label: '↗', top: 46 },
  { id: 'quad_bl', label: '↙', top: 66 },
  { id: 'quad_br', label: '↘', top: 86 },
];

/** Grid Join — combine up to 4 images into a 2×2 grid. */
export function GridJoinNode({ data, selected }: NodeProps) {
  const d = data as GridJoinNodeData;
  return (
    <div className={`cv-node cv-node-proc${selected ? ' selected' : ''}`} style={{ minHeight: 112, width: 170 }}>
      <div className="cv-node-type" style={{ color: '#a855f7' }}>Grid Join</div>
      {d.resultUrl ? (
        <img className="cv-node-thumb" src={d.resultUrl} alt="grid" draggable={false} />
      ) : (
        <div className="cv-node-thumb cv-node-thumb-empty">connect quads</div>
      )}
      {QUADS.map((q) => (
        <Handle key={q.id} id={q.id} type="target" position={Position.Left} style={{ top: q.top }} className="cv-handle cv-handle-image" />
      ))}
      {QUADS.map((q) => (
        <span key={`l-${q.id}`} className="cv-input-label" style={{ top: q.top }}>{q.label}</span>
      ))}
      <Handle id={OUTPUT_HANDLE} type="source" position={Position.Right} className="cv-handle cv-handle-image" />
    </div>
  );
}
