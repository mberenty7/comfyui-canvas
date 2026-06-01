import type { Node } from '@xyflow/react';
import type { PortType, WorkflowNodeData } from './types';

/** Minimal shape shared by React Flow's Connection and Edge for validation. */
interface ConnectionLike {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

/** Stable id for a node's single output handle. */
export const OUTPUT_HANDLE = 'out';
/** The single workflow-input handle on a Generate node. */
export const WORKFLOW_HANDLE = 'workflow';

/**
 * The port type a node emits from its output handle. Mirrors the legacy
 * connection rules in app.js `handleConnect`: prompt nodes emit 'prompt',
 * image-producing nodes emit 'image', and a workflow node emits 'workflow'
 * (it only feeds a Generate node).
 */
export function outputType(node: Node): PortType | null {
  switch (node.type) {
    case 'prompt':
      return 'prompt';
    case 'workflow':
      return 'workflow';
    case 'image':
    case 'inpaint':
    case 'model':
      return 'image';
    default:
      return null;
  }
}

/** The port type a target input handle expects, or null if unknown. */
export function inputType(node: Node, handleId: string | null | undefined): PortType | null {
  if (node.type === 'workflow' && handleId) {
    const data = node.data as WorkflowNodeData;
    const input = data.inputs?.find((i) => i.name === handleId);
    return input ? input.type : null;
  }
  if (node.type === 'generate' && handleId === WORKFLOW_HANDLE) {
    return 'workflow';
  }
  return null;
}

/**
 * Connection is valid when the source's output type matches the target
 * input's expected type. Unknown types are permissive (don't block).
 */
export function isValidConnection(
  conn: ConnectionLike,
  getNode: (id: string) => Node | undefined,
): boolean {
  const source = getNode(conn.source);
  const target = getNode(conn.target);
  if (!source || !target) return false;
  if (source.id === target.id) return false;

  const out = outputType(source);
  const expected = inputType(target, conn.targetHandle);
  if (out == null || expected == null) return true;
  return out === expected;
}
