import { useMemo, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { NODE_KINDS, createNodeAt, type NodeKind } from '../nodeActions';
import { useUI } from '../ui';

/** Tab-triggered quick-add menu — type to filter, Enter/click to insert. */
export function QuickAdd() {
  const rf = useReactFlow();
  const close = () => useUI.getState().setQuickAddOpen(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(
    () => NODE_KINDS.filter((k) => k.label.toLowerCase().includes(query.toLowerCase())),
    [query],
  );

  function add(type: NodeKind) {
    close();
    const center = rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    createNodeAt(type, center);
  }

  return (
    <div className="cv-quickadd-overlay" onMouseDown={close}>
      <div className="cv-quickadd" onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          className="prop-input"
          placeholder="Search nodes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close();
            if (e.key === 'Enter' && filtered[0]) add(filtered[0].type);
          }}
        />
        <div className="cv-quickadd-list">
          {filtered.map((k) => (
            <div key={k.type} className="cv-quickadd-item" onClick={() => add(k.type)}>
              {k.label}
            </div>
          ))}
          {filtered.length === 0 && <div className="cv-quickadd-empty">No matches</div>}
        </div>
      </div>
    </div>
  );
}
