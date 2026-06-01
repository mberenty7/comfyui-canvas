import { useCanvasStore } from '../store';
import type { PromptNodeData } from '../types';

/**
 * Side panel — the React replacement for the legacy `renderProperties()` /
 * `bindProperties()` string-HTML pattern. Reads the selected node from the
 * store and renders a per-type editor. For now only the Prompt editor is
 * fully built; other types show a read-only placeholder.
 */
export function PropertiesPanel() {
  const selectedId = useCanvasStore((s) => s.selectedId);
  const node = useCanvasStore((s) => s.nodes.find((n) => n.id === selectedId));
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);

  if (!node) return null;

  return (
    <div className="cv-properties">
      <div className="cv-properties-header">
        <h3>Properties</h3>
        <button onClick={() => useCanvasStore.getState().setSelected(null)}>✕</button>
      </div>
      <div className="cv-properties-body">
        {node.type === 'prompt' ? (
          <PromptProperties id={node.id} data={node.data as PromptNodeData} onChange={updateNodeData} />
        ) : (
          <div className="prop-section">
            <label className="prop-section-label">Type</label>
            <div className="prop-value">{node.type}</div>
            <p style={{ fontSize: 11, color: '#666', marginTop: 8 }}>
              Editor for this node type isn't migrated yet. Its data is preserved on save.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function PromptProperties({
  id,
  data,
  onChange,
}: {
  id: string;
  data: PromptNodeData;
  onChange: (id: string, patch: Record<string, unknown>) => void;
}) {
  async function saveToLibrary() {
    const name = window.prompt('Prompt name:', data.label || 'My Prompt');
    if (!name) return;
    try {
      const resp = await fetch('/api/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, positive: data.positive, negative: data.negative }),
      });
      const result = await resp.json();
      if (!result.saved) alert('Failed to save: ' + (result.error || 'Unknown error'));
    } catch (err) {
      alert('Failed to save: ' + (err as Error).message);
    }
  }

  return (
    <>
      <div className="prop-section">
        <label className="prop-section-label">Label</label>
        <input
          type="text"
          className="prop-input"
          value={data.label ?? ''}
          placeholder="e.g. Style Prompt"
          onChange={(e) => onChange(id, { label: e.target.value })}
        />
      </div>
      <div className="prop-section">
        <label className="prop-section-label">Positive Prompt</label>
        <textarea
          className="prop-textarea"
          rows={6}
          value={data.positive ?? ''}
          placeholder="Describe what you want..."
          onChange={(e) => onChange(id, { positive: e.target.value })}
        />
      </div>
      <div className="prop-section">
        <label className="prop-section-label">Negative Prompt</label>
        <textarea
          className="prop-textarea"
          rows={4}
          value={data.negative ?? ''}
          placeholder="Describe what to avoid..."
          onChange={(e) => onChange(id, { negative: e.target.value })}
        />
      </div>
      <div className="prop-section" style={{ marginTop: 8 }}>
        <button
          className="prop-btn"
          style={{ width: '100%', background: '#a855f7', borderColor: '#a855f7' }}
          onClick={saveToLibrary}
        >
          📝 Save to Library
        </button>
      </div>
    </>
  );
}
