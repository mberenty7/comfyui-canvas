import { useEffect, useMemo, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useCanvasStore } from '../store';
import { useUI } from '../ui';
import { addLog } from '../logStore';

interface SavedPrompt {
  name: string;
  positive?: string;
  negative?: string;
  tags?: string[];
  modified?: string;
  filename: string;
}

/** Prompt Library — browse, place, and delete saved prompts (/api/prompts). */
export function PromptLibrary() {
  const rf = useReactFlow();
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('Loading…');

  async function load() {
    setStatus('Loading…');
    try {
      const data = await (await fetch('/api/prompts')).json();
      setPrompts(data.prompts || []);
      setStatus((data.prompts || []).length ? '' : 'No saved prompts yet. Select a Prompt node and click "Save to Library".');
    } catch (e) {
      setStatus(`Failed to load: ${(e as Error).message}`);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return prompts;
    const q = query.toLowerCase();
    return prompts.filter((p) => [p.name, p.positive, p.negative, ...(p.tags || [])].join(' ').toLowerCase().includes(q));
  }, [prompts, query]);

  function place(p: SavedPrompt) {
    const c = rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    useCanvasStore.getState().addNode('prompt', { label: p.name, positive: p.positive || '', negative: p.negative || '' }, { x: c.x - 80, y: c.y - 25 });
    addLog(`Placed prompt "${p.name}" on canvas`, 'success');
  }

  async function del(p: SavedPrompt) {
    if (!confirm(`Delete prompt "${p.name}"?`)) return;
    await fetch(`/api/prompts/${encodeURIComponent(p.filename)}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="cv-side-panel">
      <div className="cv-side-header">
        <h3>📝 Prompt Library</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="prop-btn" style={{ padding: '4px 8px', fontSize: 11 }} onClick={load}>Refresh</button>
          <button className="cv-log-close" onClick={() => useUI.getState().togglePrompts()}>✕</button>
        </div>
      </div>
      <div className="cv-side-search">
        <input className="prop-input" style={{ fontSize: 12 }} placeholder="Search prompts…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="cv-side-body">
        {filtered.length === 0 ? (
          <div className="cv-side-empty">{status || 'No matching prompts'}</div>
        ) : (
          filtered.map((p) => (
            <div key={p.filename} className="cv-card" onClick={() => place(p)}>
              <div className="cv-card-name">{p.name}</div>
              {p.positive && <div className="cv-card-text">{p.positive}</div>}
              {p.negative && <div className="cv-card-neg">⛔ {p.negative}</div>}
              <div className="cv-card-footer">
                <span className="cv-card-date">{p.modified ? new Date(p.modified).toLocaleDateString() : ''}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="cv-card-btn" onClick={(e) => { e.stopPropagation(); place(p); }}>📌 Place</button>
                  <button className="cv-card-btn cv-card-del" onClick={(e) => { e.stopPropagation(); del(p); }}>🗑</button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
