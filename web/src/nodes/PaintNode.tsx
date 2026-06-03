import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { PaintNodeData } from '../types';
import { OUTPUT_HANDLE } from '../ports';

/** Paint — freehand brush painting over a source image. */
export function PaintNode({ data, selected }: NodeProps) {
  const d = data as PaintNodeData;
  return (
    <div className={`cv-node cv-node-proc${selected ? ' selected' : ''}`}>
      <div className="cv-node-type" style={{ color: '#a855f7' }}>Paint</div>
      {d.resultUrl ? (
        <img className="cv-node-thumb" src={d.resultUrl} alt="painted" draggable={false} />
      ) : (
        <div className="cv-node-thumb cv-node-thumb-empty">no paint yet</div>
      )}
      {d.label ? <div className="cv-node-sublabel">{d.label}</div> : null}
      <Handle id="image" type="target" position={Position.Left} className="cv-handle cv-handle-prompt" />
      <Handle id={OUTPUT_HANDLE} type="source" position={Position.Right} className="cv-handle cv-handle-prompt" />
    </div>
  );
}
