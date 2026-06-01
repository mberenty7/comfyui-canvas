import type { Node, Edge } from '@xyflow/react';

/**
 * Domain data carried in each React Flow node's `data` field.
 *
 * As more node types are migrated, add their interfaces to the union below.
 * Until then, unmigrated types fall through to `GenericNodeData` so their
 * fields still round-trip losslessly through save/load.
 */
export interface PromptNodeData {
  label: string;
  positive: string;
  negative: string;
  [key: string]: unknown;
}

export type GenericNodeData = Record<string, unknown>;

export type CanvasNode = Node;
export type CanvasEdge = Edge;

/**
 * The on-disk canvas format produced by the legacy fabric.js app
 * (CanvasEngine.serialize → version 2). The React app reads and writes
 * this exact shape so existing project files and autosaves stay compatible.
 */
export interface CanvasFileV2 {
  version: number;
  zoom?: number;
  viewport?: { x: number; y: number };
  nodeIdCounter?: number;
  nodes: LegacyNode[];
  connections: LegacyConnection[];
}

/** A legacy node: reserved positional keys + arbitrary type-specific fields. */
export interface LegacyNode {
  id: string;
  type: string;
  x?: number;
  y?: number;
  [key: string]: unknown;
}

export interface LegacyConnection {
  fromId: string;
  toId: string;
}
