import { type NodeProps } from '@xyflow/react';
import { useCanvasStore } from '../store';

/** Group — an organizational container holding a nested subgraph. No ports. */
export function GroupNode({ id, data, selected }: NodeProps) {
  const label = (data.label as string) || 'Group';
  const count = useCanvasStore((s) => s.nodes.filter((n) => ((n.data?.group as string) || 'root') === id).length);
  return (
    <div className={`cv-node cv-node-group${selected ? ' selected' : ''}`}>
      <div className="cv-node-type" style={{ color: '#bbb' }}>📦 {label}</div>
      <div className="cv-node-sublabel">{count} node{count !== 1 ? 's' : ''} inside</div>
      <button className="cv-group-enter" onClick={() => useCanvasStore.getState().enterGroup(id, label)}>
        Enter group →
      </button>
    </div>
  );
}
