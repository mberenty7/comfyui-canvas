import { create } from 'zustand';
import {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from '@xyflow/react';
import { fromCanvasFormat, toCanvasFormat } from './serialize';
import type { CanvasFileV2, GenStatus } from './types';

interface CanvasState {
  nodes: Node[];
  edges: Edge[];
  nodeIdCounter: number;
  zoom: number;
  viewport: { x: number; y: number };
  selectedId: string | null;
  /** Transient per-Generate-node run status (not persisted). */
  genStatus: Record<string, GenStatus>;

  // React Flow change handlers
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;

  // Selection + viewport tracking
  setSelected: (id: string | null) => void;
  setViewportState: (v: { x: number; y: number; zoom: number }) => void;

  // Graph mutations
  nextId: () => string;
  addNode: (type: string, data: Record<string, unknown>, position: { x: number; y: number }) => string;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  deleteNode: (id: string) => void;
  disconnectInput: (targetId: string, handle: string) => void;
  addResultEdge: (source: string, target: string) => void;
  setGenStatus: (id: string, status: GenStatus) => void;

  // Persistence (legacy v2 compatible)
  serialize: () => CanvasFileV2;
  deserialize: (data: CanvasFileV2) => void;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  edges: [],
  nodeIdCounter: 0,
  zoom: 1,
  viewport: { x: 0, y: 0 },
  selectedId: null,
  genStatus: {},

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) });
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
  },

  onConnect: (connection) => {
    // One source per target input handle: a new wire replaces an existing one.
    const edges = get().edges.filter(
      (e) => !(e.target === connection.target && e.targetHandle === connection.targetHandle),
    );
    set({ edges: addEdge(connection, edges) });
  },

  setSelected: (id) => set({ selectedId: id }),

  setViewportState: (v) => set({ viewport: { x: v.x, y: v.y }, zoom: v.zoom }),

  nextId: () => {
    const next = get().nodeIdCounter + 1;
    set({ nodeIdCounter: next });
    return `node_${next}`;
  },

  addNode: (type, data, position) => {
    const id = get().nextId();
    const node: Node = { id, type, position, data };
    set({ nodes: [...get().nodes, node] });
    return id;
  },

  updateNodeData: (id, patch) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
      ),
    });
  },

  deleteNode: (id) => {
    set({
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.source !== id && e.target !== id),
      selectedId: get().selectedId === id ? null : get().selectedId,
    });
  },

  disconnectInput: (targetId, handle) => {
    set({
      edges: get().edges.filter((e) => !(e.target === targetId && e.targetHandle === handle)),
    });
  },

  addResultEdge: (source, target) => {
    set({ edges: [...get().edges, { id: `e_${source}_${target}_def`, source, sourceHandle: 'out', target, targetHandle: null }] });
  },

  setGenStatus: (id, status) => {
    set({ genStatus: { ...get().genStatus, [id]: status } });
  },

  serialize: () => {
    const { nodes, edges, nodeIdCounter, zoom, viewport } = get();
    return toCanvasFormat(nodes, edges, { nodeIdCounter, zoom, viewport });
  },

  deserialize: (data) => {
    const result = fromCanvasFormat(data);
    set({
      nodes: result.nodes,
      edges: result.edges,
      nodeIdCounter: result.nodeIdCounter,
      zoom: result.zoom,
      viewport: result.viewport,
      selectedId: null,
    });
  },
}));
