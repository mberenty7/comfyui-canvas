import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { OverlayNodeData } from '../types';
import { OUTPUT_HANDLE } from '../ports';

/** Overlay — composites a solid color onto an image using a matte as alpha. */
export function OverlayNode({ data, selected }: NodeProps) {
  const d = data as OverlayNodeData;
  return (
    <div className={`cv-node cv-node-proc${selected ? ' selected' : ''}`} style={{ minHeight: 78 }}>
      <div className="cv-node-type" style={{ color: '#a855f7' }}>Overlay</div>
      {d.resultUrl ? (
        <img className="cv-node-thumb" src={d.resultUrl} alt="overlay" draggable={false} />
      ) : (
        <div className="cv-node-thumb cv-node-thumb-empty">no result yet</div>
      )}
      {d.label ? <div className="cv-node-sublabel">{d.label}</div> : null}
      <Handle id="image" type="target" position={Position.Left} style={{ top: 30 }} className="cv-handle cv-handle-prompt" />
      <span className="cv-input-label" style={{ top: 30 }}>image</span>
      <Handle id="matte" type="target" position={Position.Left} style={{ top: 52 }} className="cv-handle cv-handle-prompt" />
      <span className="cv-input-label" style={{ top: 52 }}>matte</span>
      <Handle id={OUTPUT_HANDLE} type="source" position={Position.Right} className="cv-handle cv-handle-prompt" />
    </div>
  );
}
