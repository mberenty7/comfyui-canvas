import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { PromptNodeData } from '../types';

/**
 * Prompt node — mirrors the legacy fabric PromptNode visual:
 * a rounded box with a "Prompt" type label, the user label, and a single
 * output port on the right. The properties (positive/negative text) are
 * edited in the side panel, not on the node itself.
 */
export function PromptNode({ data, selected }: NodeProps) {
  const d = data as PromptNodeData;
  return (
    <div className={`cv-node cv-node-prompt${selected ? ' selected' : ''}`}>
      <div className="cv-node-type">Prompt</div>
      <div className="cv-node-label">{d.label || ''}</div>
      <Handle type="source" position={Position.Right} className="cv-handle cv-handle-prompt" />
    </div>
  );
}
