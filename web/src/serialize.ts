import type { Node, Edge } from '@xyflow/react';
import type { CanvasFileV2, LegacyNode } from './types';

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
 * Every field on a legacy node other than {id,type,x,y} is preserved in
 * `node.data`, so even node types the React app cannot yet render still
 * survive a load → save cycle untouched.
 */
export function fromCanvasFormat(data: CanvasFileV2): DeserializeResult {
  const legacyNodes = data.nodes ?? [];

  const nodes: Node[] = legacyNodes.map((n) => {
    const { id, type, x, y, ...rest } = n;
    return {
      id,
      type: type || 'default',
      position: { x: x ?? 0, y: y ?? 0 },
      data: { ...rest },
    };
  });

  const edges: Edge[] = (data.connections ?? []).map((c) => ({
    id: `e_${c.fromId}_${c.toId}`,
    source: c.fromId,
    target: c.toId,
  }));

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
 * Spreads `node.data` back to the top level so the output is byte-compatible
 * with what the fabric.js app produced.
 */
export function toCanvasFormat(nodes: Node[], edges: Edge[], meta: SerializeMeta): CanvasFileV2 {
  const legacyNodes: LegacyNode[] = nodes.map((n) => {
    const data = (n.data ?? {}) as Record<string, unknown>;
    // Guard against a stray reserved key inside data clobbering position.
    const safeData = { ...data };
    for (const k of RESERVED_KEYS) delete safeData[k];
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
