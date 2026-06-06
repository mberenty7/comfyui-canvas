import { NodeResizer, type NodeProps } from '@xyflow/react';
import { useCanvasStore } from '../store';

/** hex → rgba string with the given alpha. */
function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Node ids whose centre falls inside the box (current group only). */
export function containedNodeIds(boxId: string): string[] {
  const all = useCanvasStore.getState().nodes;
  const box = all.find((n) => n.id === boxId);
  if (!box) return [];
  const d = box.data as { width?: number; height?: number; group?: string };
  const x0 = box.position.x;
  const y0 = box.position.y;
  const x1 = x0 + (d.width || 340);
  const y1 = y0 + (d.height || 240);
  const group = d.group || 'root';
  return all
    .filter((n) => n.id !== boxId && n.type !== 'netbox' && ((n.data?.group as string) || 'root') === group)
    .filter((n) => {
      const w = n.measured?.width ?? 90;
      const h = n.measured?.height ?? 60;
      const cx = n.position.x + w / 2;
      const cy = n.position.y + h / 2;
      return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;
    })
    .map((n) => n.id);
}

/**
 * Pack the box's contents into a tidy left-to-right grid inside its bounds,
 * wrapping at the box width and growing the box height if needed. Uses each
 * node's rendered/declared size with a small gutter.
 */
export function arrangeNetBox(boxId: string) {
  const store = useCanvasStore.getState();
  const box = store.nodes.find((n) => n.id === boxId);
  if (!box) return;
  const d = box.data as { width?: number; height?: number };
  const bw = d.width || 340;
  const pad = 16;
  const gap = 12;
  const titleH = 22;
  const ids = containedNodeIds(boxId);
  if (ids.length === 0) return;

  const items = ids.map((id) => {
    const n = store.nodes.find((x) => x.id === id)!;
    const nd = n.data as { viewW?: number; viewH?: number };
    const w = n.measured?.width ?? nd.viewW ?? 120;
    const h = n.measured?.height ?? nd.viewH ?? 100;
    return { id, w, h };
  });

  const left = box.position.x + pad;
  let x = left;
  let y = box.position.y + pad + titleH;
  let rowH = 0;
  const positions: Record<string, { x: number; y: number }> = {};
  for (const it of items) {
    if (x + it.w > box.position.x + bw - pad && x > left) {
      x = left;
      y += rowH + gap;
      rowH = 0;
    }
    positions[it.id] = { x, y };
    x += it.w + gap;
    rowH = Math.max(rowH, it.h);
  }
  store.setNodePositions(positions);

  const neededH = y + rowH + pad - box.position.y;
  if (neededH > (d.height || 240)) store.updateNodeData(boxId, { height: Math.ceil(neededH) });
}

/** Collapse → record current contents and hide them; expand → reveal them. */
export function toggleNetBoxCollapsed(boxId: string) {
  const store = useCanvasStore.getState();
  const box = store.nodes.find((n) => n.id === boxId);
  if (!box) return;
  const collapsed = (box.data as { collapsed?: boolean }).collapsed;
  if (collapsed) store.updateNodeData(boxId, { collapsed: false });
  else store.updateNodeData(boxId, { collapsed: true, contained: containedNodeIds(boxId) });
}

/**
 * Network Box — a resizable, titled, colored region (Houdini-style). Renders
 * behind the graph and drags its contained nodes along (sticky containment in
 * App). Can be collapsed to just its title bar, hiding its contents to free up
 * canvas. No ports; purely organizational.
 */
export function NetBoxNode({ id, data, selected }: NodeProps) {
  const d = data as { label?: string; color?: string; width?: number; height?: number; collapsed?: boolean; contained?: string[] };
  const color = d.color || '#4a9eff';
  const collapsed = !!d.collapsed;
  const w = d.width || 320;
  const h = d.height || 220;
  const hiddenCount = collapsed ? d.contained?.length ?? 0 : 0;

  const title = (
    <div className="cv-netbox-title" style={{ color, background: hexA(color, 0.14) }}>
      <button
        className="cv-netbox-toggle nodrag"
        title={collapsed ? 'Expand' : 'Minimize'}
        onClick={(e) => {
          e.stopPropagation();
          toggleNetBoxCollapsed(id);
        }}
      >
        {collapsed ? '＋' : '－'}
      </button>
      <span className="cv-netbox-name">{d.label || 'Box'}</span>
      {collapsed && hiddenCount ? <span className="cv-netbox-count">{hiddenCount} hidden</span> : null}
    </div>
  );

  if (collapsed) {
    return (
      <div className={`cv-netbox collapsed${selected ? ' selected' : ''}`} style={{ borderColor: color, background: hexA(color, 0.14) }}>
        {title}
      </div>
    );
  }

  return (
    <>
      <NodeResizer
        color={color}
        isVisible={selected}
        minWidth={140}
        minHeight={90}
        onResize={(_, p) => useCanvasStore.getState().updateNodeData(id, { width: p.width, height: p.height })}
      />
      <div className={`cv-netbox${selected ? ' selected' : ''}`} style={{ width: w, height: h, borderColor: color, background: hexA(color, 0.06) }}>
        {title}
      </div>
    </>
  );
}
