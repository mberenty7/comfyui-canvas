import type { Node } from '@xyflow/react';
import type { PortType, WorkflowNodeData } from './types';

/** Minimal shape shared by React Flow's Connection and Edge for validation. */
interface ConnectionLike {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export const OUTPUT_HANDLE = 'out';
/** The single workflow-input handle on a Generate node. */
export const WORKFLOW_HANDLE = 'workflow';
/** The model-input handle on a Viewer node. */
export const MODEL_HANDLE = 'model';
/** The image-input handle on an Inpaint node. */
export const IMAGE_HANDLE = 'image';

/** The named image input handles each processing node exposes. */
export const PROC_INPUTS: Record<string, string[]> = {
  colorpick: ['image'],
  overlay: ['image', 'matte'],
  grade: ['image', 'compare'],
  paint: ['image'],
  gridjoin: ['quad_tl', 'quad_tr', 'quad_bl', 'quad_br'],
  gridsplit: ['image'],
};

/**
 * The port types a node's output can satisfy. A model is polymorphic: it feeds
 * both a Viewer's model input and a Workflow's image input (camera captures).
 * Mirrors the legacy connection rules in app.js `handleConnect`.
 */
export function sourceProvides(node: Node): PortType[] {
  switch (node.type) {
    case 'prompt':
      return ['prompt'];
    case 'image':
      return ['image'];
    case 'workflow':
      return ['workflow'];
    case 'inpaint':
    case 'colorpick':
    case 'overlay':
    case 'grade':
    case 'paint':
    case 'gridjoin':
      return ['image'];
    case 'template':
      return ['prompt'];
    case 'model':
      return ['image', 'model'];
    default:
      // gridsplit has no output (it spawns Image nodes).
      return [];
  }
}

/** The port type a target input handle expects, or null if unknown. */
export function inputType(node: Node, handleId: string | null | undefined): PortType | null {
  if (node.type === 'workflow' && handleId) {
    const data = node.data as WorkflowNodeData;
    const input = data.inputs?.find((i) => i.name === handleId);
    return input ? input.type : null;
  }
  if (node.type === 'generate' && handleId === WORKFLOW_HANDLE) return 'workflow';
  if (node.type === 'viewer' && handleId === MODEL_HANDLE) return 'model';
  if (node.type === 'inpaint' && handleId === IMAGE_HANDLE) return 'image';
  // Template tag inputs accept prompt sources (Prompt nodes or other Templates).
  if (node.type === 'template' && handleId?.startsWith('tag_')) return 'prompt';
  if (node.type && PROC_INPUTS[node.type]?.includes(handleId ?? '')) return 'image';
  return null;
}

/**
 * Connection is valid when the source can provide the type the target input
 * expects. Unknown types are permissive (don't block).
 */
export function isValidConnection(
  conn: ConnectionLike,
  getNode: (id: string) => Node | undefined,
): boolean {
  const source = getNode(conn.source);
  const target = getNode(conn.target);
  if (!source || !target) return false;
  if (source.id === target.id) return false;

  const expected = inputType(target, conn.targetHandle);
  const provides = sourceProvides(source);
  if (expected == null || provides.length === 0) return true;
  return provides.includes(expected);
}
