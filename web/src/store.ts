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
  /** Current subgraph being viewed ('root' = top level). */
  currentGroup: string;
  /** Breadcrumb path from root to the current group. */
  groupPath: { id: string; name: string }[];
  /** Transient per-Generate-node run status (not persisted). */
  genStatus: Record<string, GenStatus>;

  // React Flow change handlers
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;

  // Selection + viewport tracking
  setSelected: (id: string | null) => void;
  setViewportState: (v: { x: number; y: number; zoom: number }) => void;

  // Group navigation
  enterGroup: (id: string, name: string) => void;
  exitGroup: () => void;

  // Graph mutations
  nextId: () => string;
  addNode: (type: string, data: Record<string, unknown>, position: { x: number; y: number }) => string;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  deleteNode: (id: string) => void;
  duplicateNode: (id: string) => void;
  disconnectInput: (targetId: string, handle: string) => void;
  addResultEdge: (source: string, target: string) => void;
  setGenStatus: (id: string, status: GenStatus) => void;

  // Persistence (legacy v2 compatible)
  serialize: () => CanvasFileV2;
  /** Serialize only the selected nodes (+ wires between them), or null if none selected. */
  serializeSelection: () => CanvasFileV2 | null;
  deserialize: (data: CanvasFileV2) => void;
}

/** The group a node/edge belongs to ('root' by default). */
const groupOf = (n: { data?: Record<string, unknown> }): string => (n.data?.group as string) || 'root';

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  edges: [],
  nodeIdCounter: 0,
  zoom: 1,
  viewport: { x: 0, y: 0 },
  selectedId: null,
  currentGroup: 'root',
  groupPath: [{ id: 'root', name: 'Root' }],
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
    // Tag the new edge with the current group so it's only shown there.
    const tagged = { ...connection, data: { group: get().currentGroup } };
    set({ edges: addEdge(tagged, edges) });
  },

  setSelected: (id) => set({ selectedId: id }),

  setViewportState: (v) => set({ viewport: { x: v.x, y: v.y }, zoom: v.zoom }),

  enterGroup: (id, name) => {
    set({ currentGroup: id, groupPath: [...get().groupPath, { id, name }], selectedId: null });
  },

  exitGroup: () => {
    const path = get().groupPath;
    if (path.length <= 1) return;
    const next = path.slice(0, -1);
    set({ groupPath: next, currentGroup: next[next.length - 1].id, selectedId: null });
  },

  nextId: () => {
    const next = get().nodeIdCounter + 1;
    set({ nodeIdCounter: next });
    return `node_${next}`;
  },

  addNode: (type, data, position) => {
    const id = get().nextId();
    // New nodes belong to the group currently being viewed.
    const node: Node = { id, type, position, data: { ...data, group: get().currentGroup } };
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
    const nodes = get().nodes;
    const target = nodes.find((n) => n.id === id);
    // Deleting a group removes its whole subtree (nodes nested at any depth).
    const doomed = new Set<string>([id]);
    if (target?.type === 'group') {
      let added = true;
      while (added) {
        added = false;
        for (const n of nodes) {
          if (!doomed.has(n.id) && doomed.has(groupOf(n))) {
            doomed.add(n.id);
            added = true;
          }
        }
      }
    }
    set({
      nodes: nodes.filter((n) => !doomed.has(n.id)),
      edges: get().edges.filter((e) => !doomed.has(e.source) && !doomed.has(e.target)),
      selectedId: doomed.has(get().selectedId ?? '') ? null : get().selectedId,
    });
  },

  duplicateNode: (id) => {
    const n = get().nodes.find((x) => x.id === id);
    if (!n) return;
    const newId = get().nextId();
    const data = JSON.parse(JSON.stringify(n.data ?? {}));
    // Don't carry connections to the copy (mirrors the legacy duplicate).
    if (n.type === 'workflow') data.connectedInputs = {};
    if (n.type === 'generate') data.connectedWorkflow = null;
    const node: Node = {
      id: newId,
      type: n.type,
      position: { x: n.position.x + 30, y: n.position.y + 30 },
      data,
    };
    set({ nodes: [...get().nodes, node] });
  },

  disconnectInput: (targetId, handle) => {
    set({
      edges: get().edges.filter((e) => !(e.target === targetId && e.targetHandle === handle)),
    });
  },

  addResultEdge: (source, target) => {
    set({
      edges: [
        ...get().edges,
        { id: `e_${source}_${target}_def`, source, sourceHandle: 'out', target, targetHandle: null, data: { group: get().currentGroup } },
      ],
    });
  },

  setGenStatus: (id, status) => {
    set({ genStatus: { ...get().genStatus, [id]: status } });
  },

  serialize: () => {
    const { nodes, edges, nodeIdCounter, zoom, viewport } = get();
    return toCanvasFormat(nodes, edges, { nodeIdCounter, zoom, viewport });
  },

  serializeSelection: () => {
    const { nodes, edges, nodeIdCounter, zoom, viewport } = get();
    const selected = nodes.filter((n) => n.selected);
    if (selected.length === 0) return null;
    const ids = new Set(selected.map((n) => n.id));
    // Normalize to root so the saved subset loads at the top level.
    const subNodes = selected.map((n) => ({ ...n, data: { ...n.data, group: 'root' } }));
    const subEdges = edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({ ...e, data: { ...e.data, group: 'root' } }));
    return toCanvasFormat(subNodes, subEdges, { nodeIdCounter, zoom, viewport });
  },

  deserialize: (data) => {
    const result = fromCanvasFormat(data);
    // Derive each edge's group from its source node (both endpoints share one).
    const groupById = new Map(result.nodes.map((n) => [n.id, groupOf(n)]));
    const edges = result.edges.map((e) => ({ ...e, data: { ...e.data, group: groupById.get(e.source) || 'root' } }));
    set({
      nodes: result.nodes,
      edges,
      nodeIdCounter: result.nodeIdCounter,
      zoom: result.zoom,
      viewport: result.viewport,
      selectedId: null,
      currentGroup: 'root',
      groupPath: [{ id: 'root', name: 'Root' }],
    });
  },
}));
