import type { Node, Edge } from '@xyflow/react';
import { useCanvasStore } from './store';
import { buildWorkflow, type WorkflowGraph, type InpaintResolver } from './nodes/buildWorkflow';
import { apiGet, apiPost, apiUpload, unwrap } from './api';
import { WORKFLOW_HANDLE, IMAGE_HANDLE } from './ports';
import { addLog, addVerbose, useLogStore } from './logStore';
import type { GenerateNodeData, WorkflowNodeData } from './types';

export interface GenResult {
  imageUrl?: string;
  comfyName?: string;
  seed: number;
  meshUrl?: string;
  meshFilename?: string;
  type?: '3d';
}

// Route generation logs to the Log panel (and the console for good measure).
function log(msg: string, level: 'info' | 'warn' | 'error' | 'success' = 'info') {
  addLog(msg, level);
  if (level === 'error') console.error(msg);
  else if (level === 'warn') console.warn(msg);
}

function getNode(id: string): Node | undefined {
  return useCanvasStore.getState().nodes.find((n) => n.id === id);
}

/** Derive a workflow node's connectedInputs map from the current edges. */
function connectedInputsFor(workflowId: string, edges: Edge[]): Record<string, { nodeId: string }> {
  const map: Record<string, { nodeId: string }> = {};
  for (const e of edges) {
    if (e.target === workflowId && e.targetHandle) map[e.targetHandle] = { nodeId: e.source };
  }
  return map;
}

/** Resolve an Inpaint node's connected image comfyName + its mask name. */
const resolveInpaint: InpaintResolver = (inpaintId) => {
  const { nodes, edges } = useCanvasStore.getState();
  const inpaint = nodes.find((n) => n.id === inpaintId);
  const imgEdge = edges.find((e) => e.target === inpaintId && e.targetHandle === IMAGE_HANDLE);
  const imgNode = imgEdge ? nodes.find((n) => n.id === imgEdge.source) : undefined;
  return {
    comfyName: (imgNode?.data as { comfyName?: string } | undefined)?.comfyName,
    maskComfyName: (inpaint?.data as { maskComfyName?: string | null } | undefined)?.maskComfyName ?? null,
  };
};

function getSeeds(d: GenerateNodeData): number[] {
  const seeds: number[] = [];
  for (let i = 0; i < d.count; i++) {
    if (d.seedMode === 'increment') seeds.push(d.baseSeed + i);
    else if (d.seedMode === 'random') seeds.push(Math.floor(Math.random() * 999999));
    else seeds.push(d.baseSeed);
  }
  return seeds;
}

function imageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = url;
  });
}

interface HistoryEntry {
  outputs?: Record<string, { images?: { filename: string; subfolder?: string; type?: string }[]; result?: unknown[]; text?: unknown[]; gltf?: unknown[]; glb?: unknown[] }>;
  status?: { status_str?: string; messages?: [string, Record<string, unknown>][] };
}

async function pollResult(promptId: string): Promise<HistoryEntry | null> {
  const start = Date.now();
  while (Date.now() - start < 300000) {
    const history = await apiGet<Record<string, HistoryEntry>>(`/api/comfy/history/${promptId}`);
    if (history[promptId]) {
      const entry = history[promptId];
      if (entry.status?.status_str === 'error') {
        const errMsg =
          entry.status.messages
            ?.filter((m) => m[0] === 'execution_error')
            .map((m) => (m[1] as { exception_message?: string }).exception_message || 'Unknown error')
            .join('; ') || 'ComfyUI execution error';
        throw new Error(errMsg);
      }
      return entry;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('Generation timed out');
}

function buildMetadata(wfData: WorkflowNodeData, connectedInputs: Record<string, { nodeId: string }>, seed: number, d: GenerateNodeData) {
  const meta: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    template: wfData.templateName || wfData.templateId || 'unknown',
    seed,
    seedMode: d.seedMode,
    outputName: d.outputName,
  };
  const params: Record<string, unknown> = {};
  for (const p of wfData.params ?? []) {
    const val = wfData.paramValues?.[p.name];
    if (val !== undefined && val !== null && val !== '') params[p.name] = val;
    else if (p.default !== undefined) params[p.name] = p.default;
  }
  meta.params = params;
  for (const [inputName, conn] of Object.entries(connectedInputs)) {
    const src = getNode(conn.nodeId);
    const sd = (src?.data ?? {}) as Record<string, unknown>;
    if (src?.type === 'prompt') {
      meta.positive = sd.positive || '';
      meta.negative = sd.negative || '';
    } else if (src?.type === 'image') {
      meta[inputName + '_image'] = sd.filename || sd.comfyName || '';
    }
  }
  return meta;
}

/**
 * Run a Generate node: resolves its connected workflow, submits N times with
 * seed control, polls for results, and places the resulting images on canvas.
 * Faithful port of the legacy GenerateNode.run + app.js runGenerate.
 */
export async function runGenerate(genId: string): Promise<void> {
  const store = useCanvasStore.getState();
  const gen = store.nodes.find((n) => n.id === genId);
  if (!gen) return;
  const d = gen.data as GenerateNodeData;

  const wfEdge = store.edges.find((e) => e.target === genId && e.targetHandle === WORKFLOW_HANDLE);
  const wfNode = wfEdge ? store.nodes.find((n) => n.id === wfEdge.source) : undefined;

  try {
    if (!wfNode || wfNode.type !== 'workflow') throw new Error('No workflow connected');
    const wfData = wfNode.data as WorkflowNodeData;

    store.setGenStatus(genId, { state: 'running', text: 'Starting…' });
    useLogStore.getState().show(); // surface progress without a manual toggle
    log(`Starting generation — ${wfData.templateName} ×${d.count} (${d.seedMode})`, 'info');
    const seeds = getSeeds(d);
    const results: GenResult[] = [];

    for (let i = 0; i < seeds.length; i++) {
      store.setGenStatus(genId, { state: 'running', text: `${i + 1}/${seeds.length}…` });
      log(`Generation ${i + 1}/${seeds.length} — seed ${seeds[i]}`, 'info');
      try {
        const connectedInputs = connectedInputsFor(wfNode.id, useCanvasStore.getState().edges);

        // Seed override
        const paramValues = { ...(wfData.paramValues ?? {}) };
        const seedParam = (wfData.params ?? []).find((p) => p.type === 'seed');
        if (seedParam) paramValues[seedParam.name] = seeds[i];

        if (wfData.backend === 'bfl') {
          await runBflOne(wfData, connectedInputs, paramValues, seeds[i], d, results);
          continue;
        }

        const wf = await buildWorkflow({ ...wfData, paramValues }, connectedInputs, getNode, resolveInpaint);
        for (const key of Object.keys(wf)) {
          if (wf[key].class_type === 'SaveImage') wf[key].inputs.filename_prefix = d.outputName;
        }
        addVerbose(`Workflow nodes: ${Object.values(wf).map((n) => n.class_type).join(', ')}`, 'info');
        addVerbose(`Workflow graph: ${JSON.stringify(wf).substring(0, 1500)}`, 'info');

        // Use a raw fetch so we can log the full response body before unwrapping.
        const rawResp = await fetch('/api/comfy/prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workflow: wf }),
        });
        const rawJson = await rawResp.json();
        addVerbose(`Prompt response: ${JSON.stringify(rawJson).substring(0, 600)}`, 'info');
        const resp = unwrap<{
          prompt_id?: string;
          error?: unknown;
          node_errors?: Record<string, { errors?: { message: string }[] }>;
        }>(rawJson);
        if (resp.error) {
          throw new Error(typeof resp.error === 'string' ? resp.error : JSON.stringify(resp.error));
        }
        if (resp.node_errors && Object.keys(resp.node_errors).length > 0) {
          const errs = Object.values(resp.node_errors)
            .map((e) => e.errors?.map((x) => x.message).join(', ') || 'Unknown node error')
            .join('; ');
          throw new Error(errs);
        }
        if (!resp.prompt_id) throw new Error('No prompt_id returned — submission may have failed');
        log(`Submitted to ComfyUI (prompt ${resp.prompt_id.substring(0, 12)}…)`, 'info');

        const result = await pollResult(resp.prompt_id);
        parseOutputs(result, seeds[i], wfData, connectedInputs, d, results, wf);
      } catch (err) {
        log(`Generation ${i + 1} failed: ${(err as Error).message}`, 'error');
        store.setGenStatus(genId, { state: 'error', text: `Error: ${(err as Error).message}` });
      }
    }

    await placeResults(genId, gen.position, results);
    store.setGenStatus(genId, { state: 'done', text: `Done — ${results.length} image${results.length !== 1 ? 's' : ''}` });
    log(`Generation complete — ${results.length} image${results.length !== 1 ? 's' : ''}`, 'success');
  } catch (err) {
    store.setGenStatus(genId, { state: 'error', text: `Error: ${(err as Error).message}` });
    log(`Generation failed: ${(err as Error).message}`, 'error');
    useLogStore.getState().show(); // surface the failure without a console dive
  }
}

function parseOutputs(
  result: HistoryEntry | null,
  seed: number,
  wfData: WorkflowNodeData,
  connectedInputs: Record<string, { nodeId: string }>,
  d: GenerateNodeData,
  results: GenResult[],
  _wf: WorkflowGraph,
) {
  const outputs = result?.outputs ?? {};
  addVerbose(`Output node keys: ${Object.keys(outputs).join(', ') || '(none)'}`, 'info');
  for (const nodeKey of Object.keys(outputs)) {
    const out = outputs[nodeKey];
    if (out.images) {
      for (const img of out.images) {
        const imageUrl = `/api/comfy/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=output`;
        results.push({ imageUrl, comfyName: img.filename, seed });
        const metadata = buildMetadata(wfData, connectedInputs, seed, d);
        apiPost('/api/comfy/save-output', {
          filename: img.filename,
          subfolder: img.subfolder || '',
          type: img.type || 'output',
          metadata,
        }).catch((e) => log(`Failed to save output: ${e.message}`, 'warn'));
      }
    }
    // 3D mesh outputs (result[]/text[]/gltf/glb)
    const meshCandidates: string[] = [];
    for (const arr of [out.result, out.text]) {
      if (Array.isArray(arr)) for (const item of arr) if (typeof item === 'string' && /\.(glb|gltf|obj|fbx)$/i.test(item)) meshCandidates.push(item);
    }
    for (const item of [...(out.gltf ?? []), ...(out.glb ?? [])]) {
      const filename = typeof item === 'string' ? item : (item as { filename?: string })?.filename;
      if (filename) meshCandidates.push(filename);
    }
    for (const filename of meshCandidates) {
      results.push({ meshUrl: `/api/comfy/mesh?filename=${encodeURIComponent(filename)}`, meshFilename: filename, seed, type: '3d' });
      const metadata = buildMetadata(wfData, connectedInputs, seed, d);
      apiPost('/api/comfy/save-mesh', { filename, outputName: d.outputName || '', metadata }).catch((e) =>
        log(`Failed to save mesh: ${e.message}`, 'warn'),
      );
    }
  }
}

async function placeResults(genId: string, genPos: { x: number; y: number }, results: GenResult[]) {
  const store = useCanvasStore.getState();
  const startX = genPos.x + 220;
  let y = genPos.y;
  for (const result of results) {
    if (result.type === '3d') {
      log(`3D model ready: ${result.meshFilename} (3D viewer not yet ported to React preview)`, 'success');
      continue;
    }
    if (!result.imageUrl) continue;
    const dims = await imageDimensions(result.imageUrl);
    // Re-upload generated image to ComfyUI input so it can feed other nodes.
    let comfyName = result.comfyName;
    try {
      const blob = await (await fetch(result.imageUrl)).blob();
      const form = new FormData();
      form.append('image', blob, result.comfyName);
      const up = await apiUpload<{ comfyName?: string }>('/api/comfy/upload', form);
      if (up.comfyName) comfyName = up.comfyName;
    } catch (e) {
      log(`Failed to re-upload generated image: ${(e as Error).message}`, 'warn');
    }
    const id = store.addNode(
      'image',
      {
        label: `seed: ${result.seed}`,
        imageUrl: result.imageUrl,
        filename: result.comfyName,
        comfyName,
        width: dims.width,
        height: dims.height,
        format: 'PNG',
      },
      { x: startX, y },
    );
    store.addResultEdge(genId, id);
    y += 250;
  }
}

// ── BFL (Flux API) path ──────────────────────────────────────────────

interface BflParams {
  [key: string]: unknown;
  seed: number;
  model?: string;
  output_format?: string;
}

async function pollBflResult(requestId: string): Promise<{ status: string; result?: { sample?: string; message?: string } }> {
  const start = Date.now();
  while (Date.now() - start < 300000) {
    const data = await apiGet<{ status: string; result?: { sample?: string; message?: string } }>(`/api/bfl/result/${requestId}`);
    if (data.status === 'Ready') return data;
    if (data.status === 'Error' || data.status === 'Request Moderated') {
      throw new Error(`BFL: ${data.status} — ${data.result?.message || 'generation failed'}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('BFL generation timed out (5 min)');
}

async function runBflOne(
  wfData: WorkflowNodeData,
  connectedInputs: Record<string, { nodeId: string }>,
  paramValues: Record<string, unknown>,
  seed: number,
  d: GenerateNodeData,
  results: GenResult[],
) {
  // Gather prompt text + reference image from connected nodes.
  let promptText = '';
  let imageBase64: string | null = null;
  for (const [inputName, conn] of Object.entries(connectedInputs)) {
    const input = (wfData.inputs ?? []).find((inp) => inp.name === inputName);
    if (!input) continue;
    const src = getNode(conn.nodeId);
    const sd = (src?.data ?? {}) as Record<string, unknown>;
    if (input.type === 'prompt' && src?.type === 'prompt') {
      promptText = (sd.positive as string) || '';
    } else if (input.type === 'image' && src?.type === 'image') {
      const imgUrl = (sd.imageUrl as string) || (sd.comfyName as string);
      if (imgUrl) {
        const b64 = await apiGet<{ base64?: string }>(`/api/image-base64?url=${encodeURIComponent(imgUrl)}`);
        if (b64.base64) imageBase64 = b64.base64;
      }
    }
  }

  const params: BflParams = { ...paramValues, seed };
  let endpoint = wfData.bflEndpoint || '/v1/flux-pro-1.1';
  if (params.model) {
    endpoint = `/v1/${params.model}`;
    delete params.model;
  }

  const data = await apiPost<{ id?: string }>('/api/bfl/generate', {
    endpoint,
    prompt: promptText,
    params,
    image: imageBase64,
    mask: null,
  });
  if (!data.id) throw new Error('No request ID returned from BFL');

  const result = await pollBflResult(data.id);
  if (result.status === 'Ready' && result.result?.sample) {
    const ext = params.output_format === 'jpeg' ? 'jpg' : 'png';
    const filename = `${d.outputName}_${seed}.${ext}`;
    const metadata = buildMetadata(wfData, connectedInputs, seed, d) as Record<string, unknown>;
    metadata.backend = 'bfl';
    metadata.bfl_endpoint = endpoint;
    metadata.bfl_request_id = data.id;
    const saveData = await apiPost<{ saved?: boolean; path?: string }>('/api/bfl/save', {
      imageUrl: result.result.sample,
      filename,
      metadata,
    });
    if (saveData.saved && saveData.path) results.push({ imageUrl: saveData.path, comfyName: filename, seed });
  } else {
    throw new Error(`BFL generation failed: ${result.status || 'unknown'}`);
  }
}
