import type { NodeTypes } from '@xyflow/react';
import { PromptNode } from './PromptNode';

/**
 * Registry of migrated node types. Types not listed here (image, workflow,
 * generate, etc.) render with React Flow's default node for now — they still
 * load and save losslessly via the serialization adapter; only their custom
 * visual is pending migration.
 */
export const nodeTypes: NodeTypes = {
  prompt: PromptNode,
};
