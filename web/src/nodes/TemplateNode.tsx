import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { TemplateNodeData } from '../types';
import { OUTPUT_HANDLE } from '../ports';
import { templateTags } from '../promptResolve';

const PORT_TOP_START = 30;
const PORT_SPACING = 22;

/** Template — a prompt builder; each <tag> becomes a prompt input handle. */
export function TemplateNode({ data, selected }: NodeProps) {
  const d = data as TemplateNodeData;
  const tags = templateTags(d.template || '');
  const height = PORT_TOP_START + Math.max(tags.length, 1) * PORT_SPACING + 8;

  return (
    <div className={`cv-node cv-node-template${selected ? ' selected' : ''}`} style={{ minHeight: height }}>
      <div className="cv-node-type" style={{ color: '#f5a623' }}>Template</div>
      {d.label ? <div className="cv-node-sublabel">{d.label}</div> : null}

      {tags.map((tag, i) => {
        const top = PORT_TOP_START + i * PORT_SPACING;
        return (
          <Handle key={tag} id={`tag_${tag}`} type="target" position={Position.Left} style={{ top }} className="cv-handle cv-handle-text" />
        );
      })}
      {tags.map((tag, i) => (
        <span key={`l-${tag}`} className="cv-input-label" style={{ top: PORT_TOP_START + i * PORT_SPACING }}>{tag}</span>
      ))}

      <Handle id={OUTPUT_HANDLE} type="source" position={Position.Right} className="cv-handle cv-handle-text" />
    </div>
  );
}
