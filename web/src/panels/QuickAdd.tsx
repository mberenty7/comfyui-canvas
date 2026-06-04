import { useMemo, useState, type CSSProperties } from 'react';
import { useReactFlow } from '@xyflow/react';
import { NODE_KINDS, createNodeAt, type NodeKind } from '../nodeActions';
import { useUI } from '../ui';

/** Quick-add menu (Tab or right-click) — type to filter, Enter/click to insert. */
export function QuickAdd() {
  const rf = useReactFlow();
  const at = useUI((s) => s.quickAddAt);
  const close = () => useUI.getState().setQuickAddOpen(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(
    () => NODE_KINDS.filter((k) => k.label.toLowerCase().includes(query.toLowerCase())),
    [query],
  );

  function add(type: NodeKind) {
    close();
    // Place at the right-click point if opened that way, else at viewport center.
    const screen = at ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    createNodeAt(type, rf.screenToFlowPosition(screen));
  }

  // Anchor the popup at the cursor when opened by right-click.
  const style: CSSProperties = at ? { left: at.x, top: at.y, transform: 'none' } : {};

  return (
    <div className="cv-quickadd-overlay" onMouseDown={close}>
      <div className="cv-quickadd" style={style} onMouseDown={(e) => e.stopPropagation()}>
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
