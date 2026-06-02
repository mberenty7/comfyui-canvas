import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { WorkflowNodeData } from '../types';
import { OUTPUT_HANDLE } from '../ports';

const PORT_TOP_START = 30; // px from top of the first input port
const PORT_SPACING = 22;

/**
 * Workflow node — wraps a ComfyUI template. Renders one typed input handle
 * per template input (purple = prompt, blue = image) on the left, and a
 * single output handle on the right. Params are edited in the side panel.
 */
export function WorkflowNode({ data, selected }: NodeProps) {
  const d = data as WorkflowNodeData;
  const inputs = d.inputs ?? [];
  const color = d.templateColor || '#4a9eff';
  const height = PORT_TOP_START + Math.max(inputs.length, 1) * PORT_SPACING + 8;

  return (
    <div
      className={`cv-node cv-node-workflow${selected ? ' selected' : ''}`}
      style={{ borderColor: selected ? '#fff' : color, minHeight: height }}
    >
      <div className="cv-node-type" style={{ color }}>{d.templateName || 'Workflow'}</div>
      {d.label ? <div className="cv-node-sublabel">{d.label}</div> : null}

      {/* Input ports: Handles must be direct children of the node so their
          offset parent is the node box and `top` aligns to the node edge. */}
      {inputs.map((input, i) => {
        const top = PORT_TOP_START + i * PORT_SPACING;
        const isPrompt = input.type === 'prompt';
        return (
          <Handle
            key={input.name}
            id={input.name}
            type="target"
            position={Position.Left}
            style={{ top }}
            className={`cv-handle ${isPrompt ? 'cv-handle-prompt' : 'cv-handle-image'}`}
          />
        );
      })}
      {inputs.map((input, i) => (
        <span key={`label-${input.name}`} className="cv-input-label" style={{ top: PORT_TOP_START + i * PORT_SPACING }}>
          {input.label || input.name}
        </span>
      ))}

      <Handle
        id={OUTPUT_HANDLE}
        type="source"
        position={Position.Right}
        className="cv-handle"
        style={{ background: color }}
      />
    </div>
  );
}
