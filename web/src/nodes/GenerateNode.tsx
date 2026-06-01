import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { GenerateNodeData } from '../types';
import { OUTPUT_HANDLE, WORKFLOW_HANDLE } from '../ports';
import { useCanvasStore } from '../store';

const BORDER: Record<string, string> = {
  idle: '#4caf50',
  running: '#ff9800',
  done: '#4caf50',
  error: '#f44336',
};

/**
 * Generate node — takes a workflow input on the left, emits result images on
 * the right. Shows live run status pulled from the store's transient genStatus.
 */
export function GenerateNode({ id, data, selected }: NodeProps) {
  const d = data as GenerateNodeData;
  const status = useCanvasStore((s) => s.genStatus[id]);
  const state = status?.state ?? 'idle';
  const color = BORDER[state] ?? '#4caf50';

  return (
    <div
      className={`cv-node cv-node-generate${selected ? ' selected' : ''}`}
      style={{ borderColor: color, borderStyle: state === 'running' ? 'dashed' : 'solid' }}
    >
      <div className="cv-node-type" style={{ color: '#4caf50' }}>Generate</div>
      <div className="cv-node-status">{status?.text || 'Ready'}</div>
      {d.label ? <div className="cv-node-sublabel">{d.label}</div> : null}

      <Handle id={WORKFLOW_HANDLE} type="target" position={Position.Left} className="cv-handle cv-handle-image" />
      <Handle id={OUTPUT_HANDLE} type="source" position={Position.Right} className="cv-handle cv-handle-generate" />
    </div>
  );
}
