import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { GridSplitNodeData } from '../types';

/** Grid Split — split one image into 4 quadrant Image nodes (no output port). */
export function GridSplitNode({ data, selected }: NodeProps) {
  const d = data as GridSplitNodeData;
  return (
    <div className={`cv-node cv-node-proc${selected ? ' selected' : ''}`}>
      <div className="cv-node-type" style={{ color: '#a855f7' }}>Grid Split</div>
      <div className="cv-node-sublabel">splits image into 2×2</div>
      {d.label ? <div className="cv-node-sublabel">{d.label}</div> : null}
      <Handle id="image" type="target" position={Position.Left} className="cv-handle cv-handle-image" />
    </div>
  );
}
