import { useEffect, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { groupedNodeKinds, createNodeAt, type NodeKind } from '../nodeActions';

/** Toolbar "➕ Add Node" dropdown — replaces the individual node buttons. */
export function AddNodeMenu() {
  const rf = useReactFlow();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function add(type: NodeKind) {
    setOpen(false);
    const center = rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    createNodeAt(type, center);
  }

  return (
    <div className="cv-dropdown" ref={ref}>
      <button onClick={() => setOpen((o) => !o)}>➕ Add Node ▾</button>
      {open && (
        <div className="cv-dropdown-menu">
          {groupedNodeKinds().map((group) => (
            <div key={group.category}>
              <div className="cv-menu-cat">{group.category}</div>
              {group.items.map((k) => (
                <div key={k.type} className="cv-dropdown-item" onClick={() => add(k.type)}>
                  {k.label}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
