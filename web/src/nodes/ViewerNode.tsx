import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ViewerNodeData, ModelNodeData } from '../types';
import { MODEL_HANDLE } from '../ports';
import { useCanvasStore } from '../store';

/** 3D viewer node — takes a model input; double-click opens the viewer. */
export function ViewerNode({ id, data, selected }: NodeProps) {
  const d = data as ViewerNodeData;
  // Reflect the connected model's name from the live edges.
  const status = useCanvasStore((s) => {
    const edge = s.edges.find((e) => e.target === id && e.targetHandle === MODEL_HANDLE);
    if (!edge) return 'No model connected';
    const model = s.nodes.find((n) => n.id === edge.source);
    return (model?.data as ModelNodeData)?.filename || 'Model';
  });

  return (
    <div className={`cv-node cv-node-viewer${selected ? ' selected' : ''}`}>
      <div className="cv-node-type" style={{ color: '#e94560' }}>3D Viewer</div>
      <div className="cv-model-row">
        <span className="cv-model-icon">👁</span>
        <div className="cv-node-sublabel">{status}</div>
      </div>
      {d.label ? <div className="cv-node-sublabel">{d.label}</div> : null}
      <Handle id={MODEL_HANDLE} type="target" position={Position.Left} className="cv-handle cv-handle-model" />
    </div>
  );
}
