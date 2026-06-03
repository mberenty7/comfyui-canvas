import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ColorPickNodeData } from '../types';
import { OUTPUT_HANDLE } from '../ports';

/** Color Pick — extracts a binary matte from an image by color sampling. */
export function ColorPickNode({ data, selected }: NodeProps) {
  const d = data as ColorPickNodeData;
  return (
    <div className={`cv-node cv-node-proc${selected ? ' selected' : ''}`}>
      <div className="cv-node-type" style={{ color: '#a855f7' }}>Color Pick</div>
      {d.resultUrl ? (
        <img className="cv-node-thumb" src={d.resultUrl} alt="matte" draggable={false} />
      ) : (
        <div className="cv-node-thumb cv-node-thumb-empty">no matte yet</div>
      )}
      {d.label ? <div className="cv-node-sublabel">{d.label}</div> : null}
      <Handle id="image" type="target" position={Position.Left} className="cv-handle cv-handle-prompt" />
      <Handle id={OUTPUT_HANDLE} type="source" position={Position.Right} className="cv-handle cv-handle-prompt" />
    </div>
  );
}
