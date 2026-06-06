import { useCallback, useEffect, useRef, useState } from 'react';
import { useCanvasStore } from '../store';
import { runGenerate } from '../generate';
import { WORKFLOW_HANDLE, MODEL_HANDLE, IMAGE_HANDLE } from '../ports';
import { useViewer3D } from '../viewer3d';
import { useMaskEditor } from '../maskEditor';
import { apiUpload } from '../api';
import { addLog } from '../logStore';
import { resolveImageUrl, loadImage, processColorPick, processOverlay, processGrade, processGridJoin, sampleColor, uploadCanvas, stampName } from '../imageProc';
import { templateTags, resolvePromptText, TAG_RE } from '../promptResolve';
import { runGridSplit } from '../gridSplit';
import { usePaintEditor } from '../paintEditor';
import type {
  ColorPickNodeData,
  GenerateNodeData,
  GradeNodeData,
  GridJoinNodeData,
  GridSplitNodeData,
  ImageNodeData,
  InpaintNodeData,
  ModelNodeData,
  OverlayNodeData,
  PaintNodeData,
  PromptNodeData,
  ReferenceNodeData,
  TemplateNodeData,
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
        {node.type === 'colorpick' && <ColorPickProperties id={node.id} data={node.data as ColorPickNodeData} onChange={updateNodeData} />}
        {node.type === 'overlay' && <OverlayProperties id={node.id} data={node.data as OverlayNodeData} onChange={updateNodeData} />}
        {node.type === 'grade' && <GradeProperties id={node.id} data={node.data as GradeNodeData} onChange={updateNodeData} />}
        {node.type === 'paint' && <PaintProperties id={node.id} data={node.data as PaintNodeData} onChange={updateNodeData} />}
        {node.type === 'group' && <GroupProperties id={node.id} label={(node.data.label as string) || 'Group'} onChange={updateNodeData} />}
        {node.type === 'netbox' && <NetBoxProperties id={node.id} data={node.data as { label?: string; color?: string }} onChange={updateNodeData} />}
        {node.type === 'reference' && <ReferenceProperties id={node.id} data={node.data as ReferenceNodeData} onChange={updateNodeData} />}
        {node.type === 'template' && <TemplateProperties id={node.id} data={node.data as TemplateNodeData} onChange={updateNodeData} />}
        {node.type === 'gridjoin' && <GridJoinProperties id={node.id} data={node.data as GridJoinNodeData} onChange={updateNodeData} />}
        {node.type === 'gridsplit' && <GridSplitProperties id={node.id} data={node.data as GridSplitNodeData} onChange={updateNodeData} />}
        {!['prompt', 'image', 'workflow', 'generate', 'model', 'viewer', 'inpaint', 'colorpick', 'overlay', 'grade', 'paint', 'group', 'template', 'gridjoin', 'gridsplit', 'netbox', 'reference'].includes(node.type ?? '') && (
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
          form.append('image', new File([blob], stampName(`mask_inpaint_${id}.png`), { type: 'image/png' }));
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

function useSourceImage(nodeId: string, handle: string) {
  const edges = useCanvasStore((s) => s.edges);
  const edge = edges.find((e) => e.target === nodeId && e.targetHandle === handle);
  const url = edge ? resolveImageUrl(edge.source) : null;
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!url) {
      setImg(null);
      return;
    }
    let cancelled = false;
    loadImage(url).then((i) => !cancelled && setImg(i)).catch(() => !cancelled && setImg(null));
    return () => {
      cancelled = true;
    };
  }, [url]);
  return { img, connected: !!edge };
}

function ColorPickProperties({
  id,
  data,
  onChange,
}: {
  id: string;
  data: ColorPickNodeData;
  onChange: (id: string, patch: Record<string, unknown>) => void;
}) {
  const { img, connected } = useSourceImage(id, 'image');
  const [preview, setPreview] = useState('');

  useEffect(() => {
    if (!img) {
      setPreview('');
      return;
    }
    const t = setTimeout(() => setPreview(processColorPick(img, data.pickColor, data.tolerance).toDataURL('image/png')), 100);
    return () => clearTimeout(t);
  }, [img, data.pickColor, data.tolerance]);

  async function capture() {
    if (!img) return;
    const up = await uploadCanvas(processColorPick(img, data.pickColor, data.tolerance), `colorpick_${id}.png`);
    onChange(id, { resultUrl: up.url, comfyName: up.comfyName, width: up.width, height: up.height });
    addLog('Color Pick matte captured', 'success');
  }

  function onSample(e: React.MouseEvent<HTMLImageElement>) {
    if (!img) return;
    const r = e.currentTarget.getBoundingClientRect();
    onChange(id, { pickColor: sampleColor(img, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height) });
  }

  return (
    <>
      <LabelField id={id} label={data.label} onChange={onChange} placeholder="e.g. Head matte" />
      {!connected ? (
        <p className="cv-proc-hint">Connect an image to the input port.</p>
      ) : (
        <>
          <div className="prop-section">
            <label className="prop-section-label">Click to sample</label>
            {img && <img className="cv-proc-sample" src={img.src} onClick={onSample} alt="source" />}
          </div>
          <div className="prop-section">
            <label className="prop-section-label">Pick Color</label>
            <input type="color" value={data.pickColor} onChange={(e) => onChange(id, { pickColor: e.target.value })} />
          </div>
          <div className="prop-section">
            <label className="prop-section-label">Tolerance ({data.tolerance})</label>
            <input type="range" min={0} max={200} value={data.tolerance} onChange={(e) => onChange(id, { tolerance: Number(e.target.value) })} />
          </div>
          {preview && (
            <div className="prop-section">
              <label className="prop-section-label">Matte Preview</label>
              <img className="cv-proc-preview" src={preview} alt="matte preview" />
            </div>
          )}
          <div className="prop-section">
            <button className="generate-btn" onClick={capture}>📷 Capture Matte</button>
          </div>
        </>
      )}
    </>
  );
}

function OverlayProperties({
  id,
  data,
  onChange,
}: {
  id: string;
  data: OverlayNodeData;
  onChange: (id: string, patch: Record<string, unknown>) => void;
}) {
  const { img: baseImg, connected: hasImage } = useSourceImage(id, 'image');
  const { img: matteImg, connected: hasMatte } = useSourceImage(id, 'matte');
  const [preview, setPreview] = useState('');

  const opts = { color: data.color, opacity: data.opacity, invert: data.invert, expand: data.expand };
  useEffect(() => {
    if (!baseImg || !matteImg) {
      setPreview('');
      return;
    }
    const t = setTimeout(() => setPreview(processOverlay(baseImg, matteImg, opts).toDataURL('image/png')), 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseImg, matteImg, data.color, data.opacity, data.invert, data.expand]);

  async function save() {
    if (!baseImg || !matteImg) return;
    const up = await uploadCanvas(processOverlay(baseImg, matteImg, opts), `overlay_${id}.png`);
    onChange(id, { resultUrl: up.url, comfyName: up.comfyName, width: up.width, height: up.height });
    addLog('Overlay result saved', 'success');
  }

  return (
    <>
      <LabelField id={id} label={data.label} onChange={onChange} placeholder="e.g. Tint head" />
      {!hasImage || !hasMatte ? (
        <p className="cv-proc-hint">Connect both an image and a matte to the input ports.</p>
      ) : (
        <>
          <div className="prop-section">
            <label className="prop-section-label">Color</label>
            <input type="color" value={data.color} onChange={(e) => onChange(id, { color: e.target.value })} />
          </div>
          <div className="prop-section">
            <label className="prop-section-label">Opacity ({data.opacity}%)</label>
            <input type="range" min={0} max={100} value={data.opacity} onChange={(e) => onChange(id, { opacity: Number(e.target.value) })} />
          </div>
          <div className="prop-section">
            <label className="prop-section-label" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={data.invert} onChange={(e) => onChange(id, { invert: e.target.checked })} /> Invert matte
            </label>
          </div>
          <div className="prop-section">
            <label className="prop-section-label">Expand ({data.expand}px)</label>
            <input type="range" min={-20} max={20} value={data.expand} onChange={(e) => onChange(id, { expand: Number(e.target.value) })} />
          </div>
          {preview && (
            <div className="prop-section">
              <label className="prop-section-label">Preview</label>
              <img className="cv-proc-preview" src={preview} alt="overlay preview" />
            </div>
          )}
          <div className="prop-section">
            <button className="generate-btn" onClick={save}>💾 Save Result</button>
          </div>
        </>
      )}
    </>
  );
}

// rgb '#ffffff' is the identity multiplier (255 → 1.0 per channel).
const GRADE_DEFAULTS = { gain: 1, gamma: 1, saturation: 1, hue: 0, rgb: '#ffffff' };

function GradeProperties({
  id,
  data,
  onChange,
}: {
  id: string;
  data: GradeNodeData;
  onChange: (id: string, patch: Record<string, unknown>) => void;
}) {
  const { img, connected } = useSourceImage(id, 'image');
  const [preview, setPreview] = useState('');
  const params = { gain: data.gain, gamma: data.gamma, saturation: data.saturation, hue: data.hue, rgb: data.rgb };

  useEffect(() => {
    if (!img) {
      setPreview('');
      return;
    }
    const t = setTimeout(() => setPreview(processGrade(img, params).toDataURL('image/png')), 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, data.gain, data.gamma, data.saturation, data.hue, data.rgb]);

  async function save() {
    if (!img) return;
    const up = await uploadCanvas(processGrade(img, params), `grade_${id}.png`);
    onChange(id, { resultUrl: up.url, comfyName: up.comfyName, width: up.width, height: up.height });
    addLog('Graded image saved', 'success');
  }

  return (
    <>
      <LabelField id={id} label={data.label} onChange={onChange} placeholder="e.g. Warm grade" />
      {!connected ? (
        <p className="cv-proc-hint">Connect an image to the input port.</p>
      ) : (
        <>
          <Slider label="Gain" min={0} max={4} step={0.01} value={data.gain} onChange={(v) => onChange(id, { gain: v })} />
          <Slider label="Gamma" min={0.2} max={5} step={0.01} value={data.gamma} onChange={(v) => onChange(id, { gamma: v })} />
          <Slider label="Saturation" min={0} max={3} step={0.01} value={data.saturation} onChange={(v) => onChange(id, { saturation: v })} />
          <Slider label="Hue Shift" min={-180} max={180} step={1} value={data.hue} onChange={(v) => onChange(id, { hue: v })} />
          <div className="prop-section">
            <label className="prop-section-label">RGB Multiply</label>
            <input type="color" value={data.rgb} onChange={(e) => onChange(id, { rgb: e.target.value })} />
          </div>
          {preview && (
            <div className="prop-section">
              <label className="prop-section-label">Preview</label>
              <img className="cv-proc-preview" src={preview} alt="grade preview" />
            </div>
          )}
          <div className="prop-actions">
            <button className="prop-btn" onClick={() => onChange(id, GRADE_DEFAULTS)}>Reset</button>
            <button className="generate-btn" style={{ width: 'auto', flex: 1 }} onClick={save}>💾 Save</button>
          </div>
        </>
      )}
    </>
  );
}

function PaintProperties({
  id,
  data,
  onChange,
}: {
  id: string;
  data: PaintNodeData;
  onChange: (id: string, patch: Record<string, unknown>) => void;
}) {
  const { img, connected } = useSourceImage(id, 'image');

  function paint() {
    if (!img) return;
    usePaintEditor.getState().open({
      imageUrl: data.resultUrl || img.src,
      width: img.naturalWidth,
      height: img.naturalHeight,
      onSave: async (dataUrl) => {
        const canvas = await dataUrlToCanvas(dataUrl);
        const up = await uploadCanvas(canvas, `paint_${id}.png`);
        onChange(id, { resultUrl: up.url, comfyName: up.comfyName, width: up.width, height: up.height });
        addLog('Painted image saved', 'success');
      },
    });
  }

  return (
    <>
      <LabelField id={id} label={data.label} onChange={onChange} placeholder="e.g. Annotation" />
      {!connected ? (
        <p className="cv-proc-hint">Connect an image to the input port.</p>
      ) : (
        <>
          <div className="prop-section">
            <button className="generate-btn" onClick={paint}>🖌 {data.resultUrl ? 'Edit Paint' : 'Paint'}</button>
          </div>
          {data.resultUrl && (
            <div className="prop-section">
              <img className="cv-proc-preview" src={data.resultUrl} alt="painted" />
              <button className="prop-btn" style={{ marginTop: 4, fontSize: 11, padding: '4px 8px', width: '100%' }} onClick={() => onChange(id, { resultUrl: null, comfyName: null })}>
                🗑 Clear
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function dataUrlToCanvas(dataUrl: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d')!.drawImage(img, 0, 0);
      resolve(c);
    };
    img.src = dataUrl;
  });
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="prop-section">
      <label className="prop-section-label">{label} ({value})</label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
    </div>
  );
}

function GroupProperties({
  id,
  label,
  onChange,
}: {
  id: string;
  label: string;
  onChange: (id: string, patch: Record<string, unknown>) => void;
}) {
  const count = useCanvasStore((s) => s.nodes.filter((n) => ((n.data?.group as string) || 'root') === id).length);
  return (
    <>
      <div className="prop-section">
        <label className="prop-section-label">Group Name</label>
        <input type="text" className="prop-input" value={label} placeholder="Group" onChange={(e) => onChange(id, { label: e.target.value })} />
      </div>
      <PropRow label="Contents" value={`${count} node${count !== 1 ? 's' : ''}`} />
      <div className="prop-section">
        <button className="generate-btn" onClick={() => useCanvasStore.getState().enterGroup(id, label)}>Enter Group →</button>
      </div>
    </>
  );
}

function LabelField({
  id,
  label,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  onChange: (id: string, patch: Record<string, unknown>) => void;
  placeholder: string;
}) {
  return (
    <div className="prop-section">
      <label className="prop-section-label">Label</label>
      <input type="text" className="prop-input" value={label ?? ''} placeholder={placeholder} onChange={(e) => onChange(id, { label: e.target.value })} />
    </div>
  );
}

function TemplateProperties({
  id,
  data,
  onChange,
}: {
  id: string;
  data: TemplateNodeData;
  onChange: (id: string, patch: Record<string, unknown>) => void;
}) {
  const edges = useCanvasStore((s) => s.edges);
  // Subscribe to nodes so the preview live-updates when a connected Prompt's text changes.
  const nodes = useCanvasStore((s) => s.nodes);
  const tags = templateTags(data.template || '');
  const defaults = data.tagDefaults || {};

  // Resolve a tag's current value (connected source text, else default).
  function tagValue(tag: string): string {
    const edge = edges.find((e) => e.target === id && e.targetHandle === `tag_${tag}`);
    if (!edge) return defaults[tag] ?? '';
    const src = nodes.find((n) => n.id === edge.source);
    if (src?.type === 'prompt') return (src.data.positive as string) || '';
    return resolvePromptText(edge.source); // nested template / other source
  }

  // Build a colored preview: filled tags green, empty tags red.
  const segments: { text: string; kind: 'plain' | 'filled' | 'empty' }[] = [];
  const tpl = data.template || '';
  let last = 0;
  for (const m of tpl.matchAll(TAG_RE)) {
    if (m.index! > last) segments.push({ text: tpl.slice(last, m.index), kind: 'plain' });
    const val = tagValue(m[1]);
    segments.push(val ? { text: val, kind: 'filled' } : { text: `<${m[1]}>`, kind: 'empty' });
    last = m.index! + m[0].length;
  }
  if (last < tpl.length) segments.push({ text: tpl.slice(last), kind: 'plain' });

  function setDefault(tag: string, value: string) {
    onChange(id, { tagDefaults: { ...defaults, [tag]: value } });
  }

  const connectedTags = new Set(
    edges.filter((e) => e.target === id && e.targetHandle?.startsWith('tag_')).map((e) => e.targetHandle!.slice(4)),
  );

  return (
    <>
      <LabelField id={id} label={data.label} onChange={onChange} placeholder="e.g. Portrait template" />
      <div className="prop-section">
        <label className="prop-section-label">Template</label>
        <textarea
          className="prop-textarea"
          rows={4}
          value={data.template ?? ''}
          placeholder="A <style> photo of <subject> with <lighting> lighting"
          onChange={(e) => onChange(id, { template: e.target.value })}
        />
      </div>
      <div className="prop-section">
        <label className="prop-section-label">Preview</label>
        <div className="cv-template-preview">
          {segments.map((s, i) => (
            <span key={i} className={s.kind === 'filled' ? 'cv-tag-filled' : s.kind === 'empty' ? 'cv-tag-empty' : undefined}>{s.text}</span>
          ))}
        </div>
      </div>
      {tags.length > 0 && (
        <div className="prop-section">
          <label className="prop-section-label">Tag Defaults</label>
          {tags.map((tag) => (
            <div key={tag} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: '#f5a623', fontFamily: 'monospace', minWidth: 70 }}>{tag}</span>
              <input
                className="prop-input"
                style={{ flex: 1, fontSize: 11 }}
                value={defaults[tag] ?? ''}
                placeholder={connectedTags.has(tag) ? '(from connection)' : 'default…'}
                disabled={connectedTags.has(tag)}
                onChange={(e) => setDefault(tag, e.target.value)}
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function GridJoinProperties({
  id,
  data,
  onChange,
}: {
  id: string;
  data: GridJoinNodeData;
  onChange: (id: string, patch: Record<string, unknown>) => void;
}) {
  const tl = useSourceImage(id, 'quad_tl');
  const tr = useSourceImage(id, 'quad_tr');
  const bl = useSourceImage(id, 'quad_bl');
  const br = useSourceImage(id, 'quad_br');
  const quads = [tl, tr, bl, br];
  const connected = quads.filter((q) => q.connected).length;
  const [preview, setPreview] = useState('');

  useEffect(() => {
    const imgs = quads.map((q) => q.img);
    const canvas = processGridJoin(imgs);
    setPreview(canvas ? canvas.toDataURL('image/png') : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tl.img, tr.img, bl.img, br.img]);

  async function save() {
    const canvas = processGridJoin(quads.map((q) => q.img));
    if (!canvas) return;
    const up = await uploadCanvas(canvas, `gridjoin_${id}.png`);
    onChange(id, { resultUrl: up.url, comfyName: up.comfyName, width: up.width, height: up.height });
    addLog('Grid join saved', 'success');
  }

  return (
    <>
      <LabelField id={id} label={data.label} onChange={onChange} placeholder="e.g. Comparison sheet" />
      <PropRow label="Connected" value={`${connected}/4`} />
      <div className="prop-section">
        <div className="cv-quad-diagram">
          <span style={{ opacity: tl.connected ? 1 : 0.3 }}>↖</span>
          <span style={{ opacity: tr.connected ? 1 : 0.3 }}>↗</span>
          <span style={{ opacity: bl.connected ? 1 : 0.3 }}>↙</span>
          <span style={{ opacity: br.connected ? 1 : 0.3 }}>↘</span>
        </div>
      </div>
      {preview && (
        <div className="prop-section">
          <label className="prop-section-label">Preview</label>
          <img className="cv-proc-preview" src={preview} alt="grid" />
        </div>
      )}
      <div className="prop-section">
        <button className="generate-btn" disabled={connected === 0} onClick={save}>💾 Save Grid</button>
      </div>
    </>
  );
}

function GridSplitProperties({
  id,
  data,
  onChange,
}: {
  id: string;
  data: GridSplitNodeData;
  onChange: (id: string, patch: Record<string, unknown>) => void;
}) {
  const { img, connected } = useSourceImage(id, 'image');

  return (
    <>
      <LabelField id={id} label={data.label} onChange={onChange} placeholder="e.g. Concept grid" />
      {!connected ? (
        <p className="cv-proc-hint">Connect an image to the input port.</p>
      ) : (
        <>
          {img && (
            <div className="prop-section">
              <img className="cv-proc-preview" src={img.src} alt="source" />
            </div>
          )}
          <div className="prop-section">
            <button className="generate-btn" onClick={() => runGridSplit(id)}>✂️ Split into 4</button>
          </div>
        </>
      )}
    </>
  );
}

const BOX_COLORS = ['#4a9eff', '#a855f7', '#4caf50', '#e94560', '#f5a623', '#888'];

function ReferenceProperties({
  data,
}: {
  id: string;
  data: ReferenceNodeData;
  onChange: (id: string, patch: Record<string, unknown>) => void;
}) {
  return (
    <>
      <div className="prop-section">
        <label className="prop-section-label">Reference</label>
        <PropRow label="File" value={data.filename || '—'} />
        {data.width && data.height ? <PropRow label="Size" value={`${data.width} × ${data.height}`} /> : null}
        {data.format ? <PropRow label="Format" value={data.format} /> : null}
        <PropRow label="Stored" value={data.imageUrl?.startsWith('/references/') ? 'references/ (deduped)' : 'in place'} />
      </div>
      <p style={{ fontSize: 11, color: '#666' }}>Connect the output to a Workflow or Inpaint to use it as an image input. Display controls (grayscale / luminance / opacity / crop) arrive next.</p>
    </>
  );
}

function NetBoxProperties({
  id,
  data,
  onChange,
}: {
  id: string;
  data: { label?: string; color?: string };
  onChange: (id: string, patch: Record<string, unknown>) => void;
}) {
  return (
    <>
      <div className="prop-section">
        <label className="prop-section-label">Title</label>
        <input type="text" className="prop-input" value={data.label ?? ''} placeholder="e.g. Hero refs" onChange={(e) => onChange(id, { label: e.target.value })} />
      </div>
      <div className="prop-section">
        <label className="prop-section-label">Color</label>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {BOX_COLORS.map((c) => (
            <button key={c} className="cv-swatch" style={{ background: c, outline: data.color === c ? '2px solid #fff' : 'none' }} onClick={() => onChange(id, { color: c })} />
          ))}
          <input type="color" value={data.color ?? '#4a9eff'} onChange={(e) => onChange(id, { color: e.target.value })} />
        </div>
      </div>
      <p style={{ fontSize: 11, color: '#666' }}>Drag the box to move everything inside it. Drag the corner to resize. Drag a node out to detach it.</p>
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
