import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { GradeNodeData } from '../types';
import { OUTPUT_HANDLE } from '../ports';

/** Grade — Nuke-style color correction (gain/gamma/saturation/hue/RGB). */
export function GradeNode({ data, selected }: NodeProps) {
  const d = data as GradeNodeData;
  return (
    <div className={`cv-node cv-node-proc${selected ? ' selected' : ''}`} style={{ minHeight: 78 }}>
      <div className="cv-node-type" style={{ color: '#a855f7' }}>Grade</div>
      {d.resultUrl ? (
        <img className="cv-node-thumb" src={d.resultUrl} alt="graded" draggable={false} />
      ) : (
        <div className="cv-node-thumb cv-node-thumb-empty">select to grade</div>
      )}
      {d.label ? <div className="cv-node-sublabel">{d.label}</div> : null}
      <Handle id="image" type="target" position={Position.Left} style={{ top: 30 }} className="cv-handle cv-handle-prompt" />
      <span className="cv-input-label" style={{ top: 30 }}>image</span>
      <Handle id="compare" type="target" position={Position.Left} style={{ top: 52 }} className="cv-handle cv-handle-prompt" />
      <span className="cv-input-label" style={{ top: 52, opacity: 0.6 }}>compare</span>
      <Handle id={OUTPUT_HANDLE} type="source" position={Position.Right} className="cv-handle cv-handle-prompt" />
    </div>
  );
}
