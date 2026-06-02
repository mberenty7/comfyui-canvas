import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { InpaintNodeData } from '../types';
import { OUTPUT_HANDLE, IMAGE_HANDLE } from '../ports';

/** Inpaint node — image input (left) + mask editing; output feeds a Workflow. */
export function InpaintNode({ data, selected }: NodeProps) {
  const d = data as InpaintNodeData;
  return (
    <div className={`cv-node cv-node-inpaint${selected ? ' selected' : ''}`}>
      <div className="cv-node-type" style={{ color: '#e94560' }}>Inpaint</div>
      <div className="cv-node-status">{d.maskComfyName || d.maskDataUrl ? '✅ Mask ready' : 'No mask'}</div>
      {d.label ? <div className="cv-node-sublabel">{d.label}</div> : null}
      <Handle id={IMAGE_HANDLE} type="target" position={Position.Left} className="cv-handle cv-handle-image" />
      <Handle id={OUTPUT_HANDLE} type="source" position={Position.Right} className="cv-handle cv-handle-inpaint" />
    </div>
  );
}
