import { useEffect } from 'react';
import { useUI } from '../ui';
import { useCanvasStore } from '../store';

/** Right-click node menu: Duplicate / Delete. */
export function ContextMenu() {
  const menu = useUI((s) => s.contextMenu);
  const close = useUI((s) => s.closeContextMenu);
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);
  const deleteNode = useCanvasStore((s) => s.deleteNode);

  useEffect(() => {
    if (!menu) return;
    const onDown = () => close();
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menu, close]);

  if (!menu) return null;

  return (
    <div className="cv-context-menu" style={{ left: menu.x, top: menu.y }} onMouseDown={(e) => e.stopPropagation()}>
      <div className="cv-context-item" onClick={() => { duplicateNode(menu.nodeId); close(); }}>
        📋 Duplicate Node
      </div>
      <div className="cv-context-item" onClick={() => { deleteNode(menu.nodeId); close(); }}>
        🗑 Delete Node
      </div>
    </div>
  );
}
