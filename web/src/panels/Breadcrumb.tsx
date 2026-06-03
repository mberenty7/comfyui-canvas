import { useCanvasStore } from '../store';

/** Shows the current subgraph path when inside one or more Group nodes. */
export function Breadcrumb() {
  const path = useCanvasStore((s) => s.groupPath);
  const exitGroup = useCanvasStore((s) => s.exitGroup);
  if (path.length <= 1) return null;

  function goto(index: number) {
    const np = path.slice(0, index + 1);
    useCanvasStore.setState({ groupPath: np, currentGroup: np[np.length - 1].id, selectedId: null });
  }

  return (
    <div className="cv-breadcrumb">
      <button className="cv-crumb-back" onClick={exitGroup}>← Back</button>
      {path.map((c, i) => (
        <span key={c.id}>
          {i > 0 && <span className="cv-crumb-sep">/</span>}
          <button className="cv-crumb" disabled={i === path.length - 1} onClick={() => goto(i)}>{c.name}</button>
        </span>
      ))}
    </div>
  );
}
