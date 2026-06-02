import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ModelNodeData } from '../types';
import { OUTPUT_HANDLE } from '../ports';

/** 3D model node — output feeds a Viewer (model) or Workflow image input. */
export function ModelNode({ data, selected }: NodeProps) {
  const d = data as ModelNodeData;
  return (
    <div className={`cv-node cv-node-model${selected ? ' selected' : ''}`}>
      <div className="cv-node-type" style={{ color: '#e94560' }}>3D Model</div>
      <div className="cv-model-row">
        <span className="cv-model-icon">🎲</span>
        <div>
          <div className="cv-model-name">{d.filename || 'No model'}</div>
          <div className="cv-node-sublabel">{(d.format || 'GLB').toUpperCase()}</div>
        </div>
      </div>
      {d.label ? <div className="cv-node-sublabel">{d.label}</div> : null}
      <Handle id={OUTPUT_HANDLE} type="source" position={Position.Right} className="cv-handle cv-handle-model" />
    </div>
  );
}
