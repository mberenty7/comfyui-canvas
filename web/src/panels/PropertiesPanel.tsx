import { useCallback, useEffect, useRef, useState } from 'react';
import { useCanvasStore } from '../store';
import { runGenerate } from '../generate';
import { WORKFLOW_HANDLE, MODEL_HANDLE, IMAGE_HANDLE } from '../ports';
import { useViewer3D } from '../viewer3d';
import { useMaskEditor } from '../maskEditor';
import { apiUpload } from '../api';
import { addLog } from '../logStore';
import type {
  GenerateNodeData,
  ImageNodeData,
  InpaintNodeData,
  ModelNodeData,
  PromptNodeData,
  TemplateParam,
  ViewerNodeData,
  WorkflowNodeData,
} from '../types';

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
        {node.type === 'generate' && <GenerateProperties id={node.id} data={node.data as GenerateNodeData} onChange={updateNodeData} />}
        {node.type === 'model' && <ModelProperties id={node.id} data={node.data as ModelNodeData} onChange={updateNodeData} />}
        {node.type === 'viewer' && <ViewerProperties id={node.id} data={node.data as ViewerNodeData} onChange={updateNodeData} />}
        {node.type === 'inpaint' && <InpaintProperties id={node.id} data={node.data as InpaintNodeData} onChange={updateNodeData} />}
        {!['prompt', 'image', 'workflow', 'generate', 'model', 'viewer', 'inpaint'].includes(node.type ?? '') && (
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

function GenerateProperties({
  id,
  data,
  onChange,
}: {
  id: string;
  data: GenerateNodeData;
  onChange: (id: string, patch: Record<string, unknown>) => void;
}) {
  const edges = useCanvasStore((s) => s.edges);
  const disconnectInput = useCanvasStore((s) => s.disconnectInput);
  const status = useCanvasStore((s) => s.genStatus[id]);
  const running = status?.state === 'running';
  const connected = edges.some((e) => e.target === id && e.targetHandle === WORKFLOW_HANDLE);

  return (
    <>
      <div className="prop-section">
        <label className="prop-section-label">Label</label>
        <input
          type="text"
          className="prop-input"
          value={data.label ?? ''}
          placeholder="e.g. Batch Run"
          onChange={(e) => onChange(id, { label: e.target.value })}
        />
      </div>
      <div className="prop-section">
        <label className="prop-section-label">Output Name</label>
        <input
          type="text"
          className="prop-input"
          value={data.outputName ?? ''}
          placeholder="e.g. paranorman_style"
          onChange={(e) => onChange(id, { outputName: e.target.value })}
        />
      </div>
      <div className="prop-section">
        <label className="prop-section-label">⚙️ Workflow</label>
        <div className="workflow-input-slot" style={{ color: connected ? '#4caf50' : '#888' }}>
          {connected ? '✅ Connected' : "Drag a workflow node's port here"}
        </div>
        {connected && (
          <button
            className="prop-btn"
            style={{ marginTop: 4, fontSize: 11, padding: '4px 8px', width: '100%' }}
            onClick={() => disconnectInput(id, WORKFLOW_HANDLE)}
          >
            ✂️ Disconnect
          </button>
        )}
      </div>
      <div className="prop-section">
        <label className="prop-section-label">Number of Generations</label>
        <input
          type="number"
          className="prop-input"
          min={1}
          max={100}
          value={data.count ?? 1}
          onChange={(e) => onChange(id, { count: parseInt(e.target.value, 10) || 1 })}
        />
      </div>
      <div className="prop-section">
        <label className="prop-section-label">Seed Mode</label>
        <select className="prop-input" value={data.seedMode} onChange={(e) => onChange(id, { seedMode: e.target.value })}>
          <option value="increment">Increment (seed, seed+1, …)</option>
          <option value="random">Random each</option>
          <option value="fixed">Fixed (same seed)</option>
        </select>
      </div>
      <div className="prop-section">
        <label className="prop-section-label">Base Seed</label>
        <div className="range-row">
          <input
            type="number"
            className="prop-input"
            style={{ flex: 1 }}
            value={data.baseSeed ?? 0}
            onChange={(e) => onChange(id, { baseSeed: parseInt(e.target.value, 10) || 0 })}
          />
          <button
            className="prop-btn"
            style={{ flex: 0, padding: '6px 10px' }}
            onClick={() => onChange(id, { baseSeed: Math.floor(Math.random() * 999999) })}
          >
            🎲
          </button>
        </div>
      </div>
      {status && (
        <div className="prop-section">
          <div className="prop-value" style={{ color: status.state === 'error' ? '#f44336' : '#888' }}>{status.text}</div>
        </div>
      )}
      <div className="prop-section">
        <button className="generate-btn" disabled={running} onClick={() => runGenerate(id)}>
          {running ? '⏳ Running…' : '▶ Generate'}
        </button>
      </div>
    </>
  );
}

function ModelProperties({
  id,
  data,
  onChange,
}: {
  id: string;
  data: ModelNodeData;
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
        <input type="text" className="prop-input" value={data.label ?? ''} placeholder="e.g. Character Model" onChange={(e) => onChange(id, { label: e.target.value })} />
      </div>
      <PropRow label="Filename" value={data.filename || '—'} />
      <PropRow label="Format" value={data.format || '—'} />
      <PropRow label="Size" value={sizeStr} />
      <div className="prop-section">
        <button
          className="generate-btn"
          style={{ background: '#e94560' }}
          disabled={!data.modelUrl}
          onClick={() => useViewer3D.getState().openViewer(data.modelUrl, data.filename)}
        >
          👁 Open 3D Viewer
        </button>
      </div>
    </>
  );
}

function ViewerProperties({
  id,
  data,
  onChange,
}: {
  id: string;
  data: ViewerNodeData;
  onChange: (id: string, patch: Record<string, unknown>) => void;
}) {
  const edges = useCanvasStore((s) => s.edges);
  const nodes = useCanvasStore((s) => s.nodes);
  const disconnectInput = useCanvasStore((s) => s.disconnectInput);
  const modelEdge = edges.find((e) => e.target === id && e.targetHandle === MODEL_HANDLE);
  const modelNode = modelEdge ? nodes.find((n) => n.id === modelEdge.source) : undefined;
  const modelData = modelNode?.data as ModelNodeData | undefined;

  return (
    <>
      <div className="prop-section">
        <label className="prop-section-label">Label</label>
        <input type="text" className="prop-input" value={data.label ?? ''} placeholder="e.g. Character Viewer" onChange={(e) => onChange(id, { label: e.target.value })} />
      </div>
      <div className="prop-section">
        <label className="prop-section-label">🎲 Model Input</label>
        <div className="workflow-input-slot" style={{ color: modelEdge ? '#4caf50' : '#888' }}>
          {modelEdge ? '✅ Connected' : "Drag a 3D Model node's port here"}
        </div>
        {modelEdge && (
          <button className="prop-btn" style={{ marginTop: 4, fontSize: 11, padding: '4px 8px', width: '100%' }} onClick={() => disconnectInput(id, MODEL_HANDLE)}>
            ✂️ Disconnect
          </button>
        )}
      </div>
      <div className="prop-section">
        <button
          className="generate-btn"
          style={{ background: '#e94560' }}
          disabled={!modelData?.modelUrl}
          onClick={() => modelData && useViewer3D.getState().openViewer(modelData.modelUrl, modelData.filename)}
        >
          👁 Open Viewer
        </button>
      </div>
    </>
  );
}

function InpaintProperties({
  id,
  data,
  onChange,
}: {
  id: string;
  data: InpaintNodeData;
  onChange: (id: string, patch: Record<string, unknown>) => void;
}) {
  const edges = useCanvasStore((s) => s.edges);
  const nodes = useCanvasStore((s) => s.nodes);
  const disconnectInput = useCanvasStore((s) => s.disconnectInput);
  const imgEdge = edges.find((e) => e.target === id && e.targetHandle === IMAGE_HANDLE);
  const imgNode = imgEdge ? nodes.find((n) => n.id === imgEdge.source) : undefined;
  const imgData = imgNode?.data as ImageNodeData | undefined;

  function paintMask() {
    if (!imgData?.imageUrl) return;
    useMaskEditor.getState().open({
      imageUrl: imgData.imageUrl,
      width: imgData.width || 1024,
      height: imgData.height || 1024,
      existingMask: data.maskDataUrl ?? null,
      onSave: async (maskDataUrl) => {
        onChange(id, { maskDataUrl });
        try {
          const blob = await (await fetch(maskDataUrl)).blob();
          const form = new FormData();
          form.append('image', new File([blob], `mask_inpaint_${id}.png`, { type: 'image/png' }));
          const result = await apiUpload<{ comfyName?: string }>('/api/comfy/upload', form);
          if (result.comfyName) onChange(id, { maskComfyName: result.comfyName });
          addLog('Inpaint mask saved', 'success');
        } catch (e) {
          addLog(`Failed to upload mask: ${(e as Error).message}`, 'warn');
        }
      },
    });
  }

  return (
    <>
      <div className="prop-section">
        <label className="prop-section-label">Label</label>
        <input type="text" className="prop-input" value={data.label ?? ''} placeholder="e.g. Fix face" onChange={(e) => onChange(id, { label: e.target.value })} />
      </div>
      <div className="prop-section">
        <label className="prop-section-label">📷 Source Image</label>
        <div className="workflow-input-slot" style={{ color: imgEdge ? '#4caf50' : '#888' }}>
          {imgEdge ? '✅ Connected' : "Drag an image node's port here"}
        </div>
        {imgEdge && (
          <button className="prop-btn" style={{ marginTop: 4, fontSize: 11, padding: '4px 8px', width: '100%' }} onClick={() => disconnectInput(id, IMAGE_HANDLE)}>
            ✂️ Disconnect
          </button>
        )}
      </div>
      <div className="prop-section">
        <label className="prop-section-label">🎨 Mask</label>
        <button className="generate-btn" disabled={!imgEdge} onClick={paintMask}>
          {data.maskDataUrl ? '🎨 Edit Mask' : '🎨 Paint Mask'}
        </button>
        {data.maskDataUrl ? (
          <>
            <div style={{ marginTop: 6, textAlign: 'center' }}>
              <img src={data.maskDataUrl} style={{ maxWidth: '100%', maxHeight: 100, border: '1px solid #333', borderRadius: 4 }} alt="mask" />
            </div>
            <button
              className="prop-btn"
              style={{ marginTop: 4, fontSize: 11, padding: '4px 8px', width: '100%' }}
              onClick={() => onChange(id, { maskDataUrl: null, maskComfyName: null })}
            >
              🗑 Clear Mask
            </button>
          </>
        ) : (
          <p style={{ fontSize: 11, color: '#666', marginTop: 4 }}>Paint white over areas to inpaint. Black = keep.</p>
        )}
      </div>
    </>
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
