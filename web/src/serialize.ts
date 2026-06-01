import type { Node, Edge } from '@xyflow/react';
import type { CanvasFileV2, LegacyNode } from './types';
import { OUTPUT_HANDLE, WORKFLOW_HANDLE } from './ports';

/**
 * Keys that live at the top level of a legacy node object and therefore must
 * NOT be folded into React Flow's `data` bag (they map to id/type/position).
 */
const RESERVED_KEYS = new Set(['id', 'type', 'x', 'y']);

export interface DeserializeResult {
  nodes: Node[];
  edges: Edge[];
  nodeIdCounter: number;
  zoom: number;
  viewport: { x: number; y: number };
}

/**
 * Convert the legacy v2 file format into React Flow nodes + edges.
 *
 * The flat `connections` array only stores {fromId,toId} with no port info.
 * For workflow targets we recover which input each connection feeds from the
 * target node's `connectedInputs` map, so typed edges land on the right handle.
 */
export function fromCanvasFormat(data: CanvasFileV2): DeserializeResult {
  const legacyNodes = data.nodes ?? [];
  const byId = new Map<string, LegacyNode>(legacyNodes.map((n) => [n.id, n]));

  const nodes: Node[] = legacyNodes.map((n) => {
    const { id, type, x, y, ...rest } = n;
    return {
      id,
      type: type || 'default',
      position: { x: x ?? 0, y: y ?? 0 },
      data: { ...rest },
    };
  });

  const edges: Edge[] = (data.connections ?? []).map((c) => {
    const target = byId.get(c.toId);
    let targetHandle: string | undefined;
    if (target?.type === 'workflow') {
      const connectedInputs = (target.connectedInputs ?? {}) as Record<string, { nodeId: string }>;
      targetHandle = Object.keys(connectedInputs).find((k) => connectedInputs[k]?.nodeId === c.fromId);
    } else if (target?.type === 'generate') {
      const cw = target.connectedWorkflow as { nodeId: string } | null | undefined;
      if (cw?.nodeId === c.fromId) targetHandle = WORKFLOW_HANDLE;
    }
    return {
      id: `e_${c.fromId}_${c.toId}_${targetHandle ?? 'def'}`,
      source: c.fromId,
      sourceHandle: OUTPUT_HANDLE,
      target: c.toId,
      targetHandle: targetHandle ?? null,
    };
  });

  return {
    nodes,
    edges,
    nodeIdCounter: data.nodeIdCounter ?? legacyNodes.length,
    zoom: data.zoom ?? 1,
    viewport: data.viewport ?? { x: 0, y: 0 },
  };
}

export interface SerializeMeta {
  nodeIdCounter: number;
  zoom: number;
  viewport: { x: number; y: number };
}

/**
 * Convert React Flow nodes + edges back into the legacy v2 file format.
 * Edges are the source of truth: the flat `connections` array and each
 * workflow node's `connectedInputs` map are both recomputed from them so the
 * output stays byte-compatible with the fabric.js app.
 */
export function toCanvasFormat(nodes: Node[], edges: Edge[], meta: SerializeMeta): CanvasFileV2 {
  // Recompute connectedInputs per workflow node from incoming typed edges.
  const connectedInputsByNode = new Map<string, Record<string, { nodeId: string }>>();
  for (const e of edges) {
    if (!e.targetHandle) continue;
    const map = connectedInputsByNode.get(e.target) ?? {};
    map[e.targetHandle] = { nodeId: e.source };
    connectedInputsByNode.set(e.target, map);
  }

  const legacyNodes: LegacyNode[] = nodes.map((n) => {
    const data = (n.data ?? {}) as Record<string, unknown>;
    const safeData = { ...data };
    for (const k of RESERVED_KEYS) delete safeData[k];
    if (n.type === 'workflow') {
      safeData.connectedInputs = connectedInputsByNode.get(n.id) ?? {};
    } else if (n.type === 'generate') {
      const wfEdge = edges.find((e) => e.target === n.id && e.targetHandle === WORKFLOW_HANDLE);
      safeData.connectedWorkflow = wfEdge ? { nodeId: wfEdge.source } : null;
    }
    return {
      id: n.id,
      type: n.type ?? 'default',
      x: n.position.x,
      y: n.position.y,
      ...safeData,
    };
  });

  return {
    version: 2,
    zoom: meta.zoom,
    viewport: meta.viewport,
    nodeIdCounter: meta.nodeIdCounter,
    nodes: legacyNodes,
    connections: edges.map((e) => ({ fromId: e.source, toId: e.target })),
  };
}
