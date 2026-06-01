import type { NodeTypes } from '@xyflow/react';
import { PromptNode } from './PromptNode';
import { ImageNode } from './ImageNode';
import { WorkflowNode } from './WorkflowNode';

/**
 * Registry of migrated node types. Types not listed here (generate, model,
 * viewer, inpaint, tile-preview, group-box) render with React Flow's default
 * node for now — they still load and save losslessly via the serialization
 * adapter; only their custom visual is pending migration.
 */
export const nodeTypes: NodeTypes = {
  prompt: PromptNode,
  image: ImageNode,
  workflow: WorkflowNode,
};
