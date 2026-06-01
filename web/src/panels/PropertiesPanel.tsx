import { useCallback, useEffect, useRef, useState } from 'react';
import { useCanvasStore } from '../store';
import type { ImageNodeData, PromptNodeData, TemplateParam, WorkflowNodeData } from '../types';

const WIDTH_KEY = 'cv-properties-width';
const MIN_WIDTH = 240;
const MAX_WIDTH = 640;

/** Drag handle on the panel's left edge that resizes its width (persisted). */
function useResizableWidth() {
  const [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem(WIDTH_KEY));
    return saved >= MIN_WIDTH && saved <= MAX_WIDTH ? saved : 300;
  });
  const dragging = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }, []);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragging.current) return;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, window.innerWidth - e.clientX));
      setWidth(next);
    }
    function onUp() {
      if (!dragging.current) return;
      dragging.current = false;
      localStorage.setItem(WIDTH_KEY, String(width));
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [width]);

  return { width, onPointerDown };
}

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
  const { width, onPointerDown } = useResizableWidth();

  if (!node) return null;

  return (
    <div className="cv-properties" style={{ width }}>
      <div className="cv-properties-resizer" onPointerDown={onPointerDown} />
      <div className="cv-properties-header">
        <h3>Properties</h3>
        <button onClick={() => useCanvasStore.getState().setSelected(null)}>✕</button>
      </div>
      <div className="cv-properties-body">
        {node.type === 'prompt' && (
          <PromptProperties id={node.id} data={node.data as PromptNodeData} onChange={updateNodeData} />
        )}
        {node.type === 'image' && <ImageProperties id={node.id} data={node.data as ImageNodeData} onChange={updateNodeData} />}
        {node.type === 'workflow' && <WorkflowProperties id={node.id} data={node.data as WorkflowNodeData} onChange={updateNodeData} />}
        {!['prompt', 'image', 'workflow'].includes(node.type ?? '') && (
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

function ImageProperties({
  id,
  data,
  onChange,
}: {
  id: string;
  data: ImageNodeData;
  onChange: (id: string, patch: Record<string, unknown>) => void;
}) {
  const sizeStr = data.fileSize
    ? data.fileSize > 1024 * 1024
      ? `${(data.fileSize / 1024 / 1024).toFixed(1)} MB`
      : `${(data.fileSize / 1024).toFixed(1)} KB`
    : '—';
  return (
    <>
      <div className="prop-section">
        <label className="prop-section-label">Label</label>
        <input
          type="text"
          className="prop-input"
          value={data.label ?? ''}
          placeholder="e.g. Reference"
          onChange={(e) => onChange(id, { label: e.target.value })}
        />
      </div>
      {data.imageUrl && <img className="prop-preview" src={data.imageUrl} alt={data.filename || ''} />}
      <PropRow label="Filename" value={data.filename || '—'} />
      <PropRow label="Dimensions" value={`${data.width || '?'} × ${data.height || '?'}`} />
      <PropRow label="Size" value={sizeStr} />
      <PropRow label="Format" value={data.format || '—'} />
      <PropRow label="ComfyUI Name" value={data.comfyName || '—'} />
    </>
  );
}

function WorkflowProperties({
  id,
  data,
  onChange,
}: {
  id: string;
  data: WorkflowNodeData;
  onChange: (id: string, patch: Record<string, unknown>) => void;
}) {
  const edges = useCanvasStore((s) => s.edges);
  const disconnectInput = useCanvasStore((s) => s.disconnectInput);
  const paramValues = data.paramValues ?? {};

  function setParam(name: string, value: unknown) {
    onChange(id, { paramValues: { ...paramValues, [name]: value } });
  }

  return (
    <>
      <div className="prop-section">
        <label className="prop-section-label">Label</label>
        <input
          type="text"
          className="prop-input"
          value={data.label ?? ''}
          placeholder="e.g. Style Transfer"
          onChange={(e) => onChange(id, { label: e.target.value })}
        />
      </div>
      <div className="prop-section">
        <label className="prop-section-label">Template</label>
        <div className="prop-value" style={{ padding: '4px 0', color: data.templateColor }}>{data.templateName}</div>
      </div>
      {data.cost && (
        <div className="prop-section">
          <label className="prop-section-label">💰 Cost per run</label>
          <div className="prop-value" style={{ padding: '4px 0', color: data.cost.credits > 0 ? '#ff9800' : '#4caf50' }}>
            {data.cost.credits > 0
              ? `${data.cost.credits} credits (~$${(data.cost.credits / 211).toFixed(2)})`
              : 'Free / separate billing'}
            {data.cost.note ? ` — ${data.cost.note}` : ''}
          </div>
        </div>
      )}

      {(data.inputs ?? []).map((input) => {
        const connected = edges.some((e) => e.target === id && e.targetHandle === input.name);
        return (
          <div className="prop-section" key={input.name}>
            <label className="prop-section-label">
              {input.type === 'prompt' ? '✏️' : '📷'} {input.label || input.name}
            </label>
            <div className="workflow-input-slot" style={{ color: connected ? '#4caf50' : '#888' }}>
              {connected ? '✅ Connected' : `Drag a ${input.type} node's port here`}
            </div>
            {connected && (
              <button
                className="prop-btn"
                style={{ marginTop: 4, fontSize: 11, padding: '4px 8px', width: '100%' }}
                onClick={() => disconnectInput(id, input.name)}
              >
                ✂️ Disconnect
              </button>
            )}
          </div>
        );
      })}

      {(data.params ?? [])
        .filter((p) => p.type !== 'hidden')
        .map((p) => (
          <ParamControl key={p.name} param={p} value={paramValues[p.name]} onChange={(v) => setParam(p.name, v)} />
        ))}
    </>
  );
}

function ParamControl({
  param,
  value,
  onChange,
}: {
  param: TemplateParam;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const label = param.label || param.name;

  if (param.type === 'slider' || param.type === 'range') {
    return (
      <div className="prop-section">
        <label className="prop-section-label">{label}</label>
        <div className="range-row">
          <input
            type="range"
            min={param.min ?? 0}
            max={param.max ?? 1}
            step={param.step ?? 0.05}
            value={Number(value ?? 0)}
            onChange={(e) => onChange(parseFloat(e.target.value))}
          />
          <span className="range-value">{String(value ?? '')}</span>
        </div>
      </div>
    );
  }

  if (param.type === 'select') {
    return (
      <div className="prop-section">
        <label className="prop-section-label">{label}</label>
        <select className="prop-input" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
          {(param.options ?? []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </div>
    );
  }

  if (param.type === 'seed') {
    return (
      <div className="prop-section">
        <label className="prop-section-label">{label || 'Seed'}</label>
        <div className="range-row">
          <input
            type="number"
            className="prop-input"
            style={{ flex: 1 }}
            value={Number(value ?? 0)}
            onChange={(e) => onChange(parseInt(e.target.value, 10))}
          />
          <button
            className="prop-btn"
            style={{ flex: 0, padding: '6px 10px' }}
            onClick={() => onChange(Math.floor(Math.random() * 999999))}
          >
            🎲
          </button>
        </div>
      </div>
    );
  }

  const numeric = param.type === 'integer' || param.type === 'number';
  return (
    <div className="prop-section">
      <label className="prop-section-label">{label}</label>
      <input
        type={numeric ? 'number' : 'text'}
        className="prop-input"
        min={param.min}
        max={param.max}
        value={String(value ?? '')}
        onChange={(e) => onChange(numeric ? Number(e.target.value) : e.target.value)}
      />
    </div>
  );
}

function PropRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="prop-row">
      <span className="prop-label">{label}</span>
      <span className="prop-value">{value}</span>
    </div>
  );
}
