import type { Node } from '@xyflow/react';
import type { WorkflowNodeData, TemplateInput, TemplateParam } from '../types';
import { apiGet } from '../api';

/** A ComfyUI prompt graph: node id → { class_type, inputs }. */
export type WorkflowGraph = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

/** Insert LoadImage → ImageToMask → optional FeatherMask, feeding VAEEncodeForInpaint. */
function wireMask(wf: WorkflowGraph, targetNodeId: string, maskComfyName: string, feather: number) {
  const maskLoadId = targetNodeId + '_mask_load';
  const maskConvertId = targetNodeId + '_mask_convert';
  wf[maskLoadId] = { class_type: 'LoadImage', inputs: { image: maskComfyName } };
  wf[maskConvertId] = { class_type: 'ImageToMask', inputs: { image: [maskLoadId, 0], channel: 'red' } };
  let finalMaskRef: [string, number] = [maskConvertId, 0];
  if (feather > 0) {
    const featherId = targetNodeId + '_mask_feather';
    wf[featherId] = {
      class_type: 'FeatherMask',
      inputs: { mask: [maskConvertId, 0], left: feather, top: feather, right: feather, bottom: feather },
    };
    finalMaskRef = [featherId, 0];
  }
  for (const key of Object.keys(wf)) {
    if (wf[key].class_type === 'VAEEncodeForInpaint') wf[key].inputs.mask = finalMaskRef;
  }
}

interface TemplateRefresh {
  workflow?: WorkflowGraph;
  inputs?: TemplateInput[];
  params?: TemplateParam[];
}

/**
 * Build the final ComfyUI workflow with params + connected inputs applied.
 * Faithful port of the legacy WorkflowNode.buildWorkflow, operating on plain
 * node data instead of fabric objects. `connectedInputs` is derived from the
 * current edges by the caller.
 */
/** Resolves an Inpaint node's source image + mask names (from edges/data). */
export type InpaintResolver = (inpaintNodeId: string) => { comfyName?: string; maskComfyName?: string | null } | null;

export async function buildWorkflow(
  wfData: WorkflowNodeData,
  connectedInputs: Record<string, { nodeId: string }>,
  getNode: (id: string) => Node | undefined,
  getInpaintData?: InpaintResolver,
  getPromptText?: (nodeId: string) => string,
): Promise<WorkflowGraph> {
  let workflow = wfData.workflow as WorkflowGraph | undefined;
  let templateInputs = wfData.inputs ?? [];
  let templateParams = wfData.params ?? [];
  const paramValues = wfData.paramValues ?? {};

  // Always fetch the latest template workflow from the server.
  if (wfData.templateId) {
    try {
      const template = await apiGet<TemplateRefresh>(`/api/templates/${wfData.templateId}`);
      if (template.workflow) workflow = template.workflow;
      if (template.inputs) templateInputs = template.inputs;
      if (template.params) templateParams = template.params;
    } catch (e) {
      console.warn('Failed to refresh template, using cached:', e);
    }
  }

  const wf: WorkflowGraph = JSON.parse(JSON.stringify(workflow ?? {}));

  // ── Apply params ──
  for (const p of templateParams) {
    if (p.target_node && p.target_field) {
      const node = wf[p.target_node as string];
      if (node) {
        let value: unknown = paramValues[p.name];
        if (p.type === 'number' || p.type === 'slider') value = parseFloat(value as string);
        if (p.type === 'integer') value = parseInt(value as string, 10);
        node.inputs[p.target_field as string] = value;
      }
    }
  }

  // ── Remove optional unconnected nodes ──
  for (const input of templateInputs) {
    if (input.optional && !connectedInputs[input.name] && input.target_node) {
      delete wf[input.target_node as string];
    }
  }

  // ── Apply connected inputs ──
  const feather = parseInt(String(paramValues.feather ?? ''), 10) || 0;

  for (const input of templateInputs) {
    const conn = connectedInputs[input.name];
    if (!conn) continue;
    const source = getNode(conn.nodeId);
    if (!source) continue;
    const srcData = (source.data ?? {}) as Record<string, unknown>;

    if (source.type === 'inpaint') {
      // Inpaint provides image + mask to the workflow's image input.
      const inpaint = getInpaintData?.(source.id);
      const targetNodeId = input.target_node as string | undefined;
      if (input.type === 'image' && inpaint?.comfyName && targetNodeId) {
        const node = wf[targetNodeId];
        if (node) node.inputs[(input.target_field as string) || 'image'] = inpaint.comfyName;
        if (input.uses_mask && inpaint.maskComfyName) {
          wireMask(wf, targetNodeId, inpaint.maskComfyName, feather);
        }
        if (input.link_output) {
          const lo = input.link_output as { to_node: string; to_field: string; from_node: string; from_output: number };
          const targetNode = wf[lo.to_node];
          if (targetNode) targetNode.inputs[lo.to_field] = [lo.from_node, lo.from_output];
        }
      }
      continue;
    }

    if (input.type === 'prompt' && (source.type === 'prompt' || source.type === 'template')) {
      const positive = getPromptText ? getPromptText(source.id) : (srcData.positive as string) || '';
      const negative = source.type === 'prompt' ? (srcData.negative as string) || '' : '';
      if (input.target_positive) {
        const tp = input.target_positive as { node: string; field: string };
        const node = wf[tp.node];
        if (node) node.inputs[tp.field] = positive;
      }
      if (input.target_negative) {
        const tn = input.target_negative as { node: string; field: string };
        const node = wf[tn.node];
        if (node) node.inputs[tn.field] = negative;
      }
    } else if (input.type === 'image' && srcData.comfyName) {
      // Any image-producing source (image, model capture, or a processing
      // node like Color Pick / Overlay / Grade / Paint) exposes comfyName.
      const targetNodeId = input.target_node as string | undefined;
      if (targetNodeId) {
        const node = wf[targetNodeId];
        if (node) node.inputs[(input.target_field as string) || 'image'] = srcData.comfyName;
      }
      // Mask wiring (LoadImage → ImageToMask → optional FeatherMask).
      if (input.uses_mask && srcData.maskComfyName && targetNodeId) {
        wireMask(wf, targetNodeId, srcData.maskComfyName as string, feather);
      }
      if (input.link_output) {
        const lo = input.link_output as { to_node: string; to_field: string; from_node: string; from_output: number };
        const targetNode = wf[lo.to_node];
        if (targetNode) targetNode.inputs[lo.to_field] = [lo.from_node, lo.from_output];
      }
    }
  }

  // ── Batch groups (multiple images → chained ImageBatch nodes) ──
  const batchGroups: Record<string, { inputs: { loaderNode: string; outputIndex: number }[]; targetNode?: string; targetField?: string }> = {};
  for (const input of templateInputs) {
    if (!input.batch_group) continue;
    if (!connectedInputs[input.name]) continue;
    const group = (batchGroups[input.batch_group as string] ??= {
      inputs: [],
      targetNode: input.batch_target_node as string | undefined,
      targetField: input.batch_target_field as string | undefined,
    });
    group.inputs.push({ loaderNode: input.target_node as string, outputIndex: 0 });
  }

  for (const group of Object.values(batchGroups)) {
    const connected = group.inputs.filter((i) => wf[i.loaderNode]);
    if (connected.length === 0 || !group.targetNode) continue;
    const target = wf[group.targetNode];
    if (!target) continue;

    if (connected.length === 1) {
      target.inputs[group.targetField as string] = [connected[0].loaderNode, connected[0].outputIndex];
    } else {
      let counter = 100;
      let batchId = `batch_${counter++}`;
      wf[batchId] = {
        class_type: 'ImageBatch',
        inputs: {
          image1: [connected[0].loaderNode, connected[0].outputIndex],
          image2: [connected[1].loaderNode, connected[1].outputIndex],
        },
      };
      let lastRef: [string, number] = [batchId, 0];
      for (let i = 2; i < connected.length; i++) {
        batchId = `batch_${counter++}`;
        wf[batchId] = {
          class_type: 'ImageBatch',
          inputs: { image1: lastRef, image2: [connected[i].loaderNode, connected[i].outputIndex] },
        };
        lastRef = [batchId, 0];
      }
      target.inputs[group.targetField as string] = lastRef;
    }
  }

  return wf;
}
