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

export interface ImageNodeData {
  label: string;
  imageUrl: string;
  filename: string;
  comfyName: string;
  width?: number;
  height?: number;
  fileSize?: number;
  format?: string;
  maskComfyName?: string | null;
  [key: string]: unknown;
}

/**
 * Reference image (PureRef-style moodboard material). Shares the Image node's
 * shape so it resolves as an `image` source in workflows, plus non-destructive
 * display controls. `display` is color | grayscale | luminance; `opacity` 0–1;
 * `crop` is a normalized rect (0–1) applied visually (Phase 3).
 */
export interface ReferenceNodeData extends ImageNodeData {
  display?: 'color' | 'grayscale' | 'luminance';
  opacity?: number;
  crop?: { x: number; y: number; w: number; h: number } | null;
}

/** A typed input slot declared by a workflow template's config.json. */
export interface TemplateInput {
  name: string;
  type: 'prompt' | 'image';
  label?: string;
  optional?: boolean;
  [key: string]: unknown;
}

/** A tunable parameter declared by a workflow template's config.json. */
export interface TemplateParam {
  name: string;
  label?: string;
  type: 'slider' | 'range' | 'select' | 'seed' | 'integer' | 'number' | 'text' | 'hidden';
  default?: unknown;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  [key: string]: unknown;
}

export interface WorkflowNodeData {
  label: string;
  templateId: string;
  templateName: string;
  templateColor: string;
  cost?: { credits: number; note?: string } | null;
  inputs: TemplateInput[];
  params: TemplateParam[];
  workflow?: Record<string, unknown>;
  paramValues: Record<string, unknown>;
  connectedInputs?: Record<string, { nodeId: string }>;
  backend?: string;
  bflEndpoint?: string;
  [key: string]: unknown;
}

export interface GenerateNodeData {
  label: string;
  count: number;
  seedMode: 'increment' | 'random' | 'fixed';
  baseSeed: number;
  outputName: string;
  connectedWorkflow?: { nodeId: string } | null;
  [key: string]: unknown;
}

/** Transient run state for a Generate node (not serialized). */
export interface GenStatus {
  state: 'idle' | 'running' | 'done' | 'error';
  text: string;
}

export interface ModelNodeData {
  label: string;
  modelUrl: string;
  filename: string;
  comfyName?: string;
  format?: string;
  fileSize?: number;
  [key: string]: unknown;
}

export interface ViewerNodeData {
  label: string;
  connectedModel?: { nodeId: string } | null;
  [key: string]: unknown;
}

export interface InpaintNodeData {
  label: string;
  maskDataUrl?: string | null;
  maskComfyName?: string | null;
  connectedImage?: { nodeId: string } | null;
  [key: string]: unknown;
}

/** Common fields a processing node carries: its committed output image. */
export interface ProcResultData {
  label: string;
  /** Committed output (after Capture/Save): a /uploads URL + ComfyUI name. */
  resultUrl?: string | null;
  comfyName?: string | null;
  width?: number;
  height?: number;
}

export interface ColorPickNodeData extends ProcResultData {
  pickColor: string; // hex, e.g. "#3cb44b"
  tolerance: number; // 0–200
  [key: string]: unknown;
}

export interface OverlayNodeData extends ProcResultData {
  color: string; // hex overlay tint
  opacity: number; // 0–100
  invert: boolean;
  expand: number; // -20..20
  [key: string]: unknown;
}

export interface GradeNodeData extends ProcResultData {
  gain: number;
  gamma: number;
  saturation: number;
  hue: number;
  rgb: string; // hex per-channel multiplier
  [key: string]: unknown;
}

export interface PaintNodeData extends ProcResultData {
  [key: string]: unknown;
}

export interface TemplateNodeData {
  label: string;
  template: string;
  tagDefaults: Record<string, string>;
  [key: string]: unknown;
}

export interface GridJoinNodeData extends ProcResultData {
  [key: string]: unknown;
}

export interface GridSplitNodeData {
  label: string;
  [key: string]: unknown;
}

/** Output port "type" a node emits, used for connection validation. */
export type PortType = 'image' | 'prompt' | 'workflow' | 'model';

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
