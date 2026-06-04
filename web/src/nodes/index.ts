import type { NodeTypes } from '@xyflow/react';
import { PromptNode } from './PromptNode';
import { ImageNode } from './ImageNode';
import { WorkflowNode } from './WorkflowNode';
import { GenerateNode } from './GenerateNode';
import { ModelNode } from './ModelNode';
import { ViewerNode } from './ViewerNode';
import { InpaintNode } from './InpaintNode';
import { ColorPickNode } from './ColorPickNode';
import { OverlayNode } from './OverlayNode';
import { GradeNode } from './GradeNode';
import { PaintNode } from './PaintNode';
import { GroupNode } from './GroupNode';
import { TemplateNode } from './TemplateNode';
import { GridJoinNode } from './GridJoinNode';
import { GridSplitNode } from './GridSplitNode';

/**
 * Registry of migrated node types. Types not listed here (tile-preview,
 * group-box) render with React Flow's default node for now — they still load
 * and save losslessly via the serialization adapter; only their custom visual
 * is pending migration.
 */
export const nodeTypes: NodeTypes = {
  prompt: PromptNode,
  image: ImageNode,
  workflow: WorkflowNode,
  generate: GenerateNode,
  model: ModelNode,
  viewer: ViewerNode,
  inpaint: InpaintNode,
  colorpick: ColorPickNode,
  overlay: OverlayNode,
  grade: GradeNode,
  paint: PaintNode,
  group: GroupNode,
  template: TemplateNode,
  gridjoin: GridJoinNode,
  gridsplit: GridSplitNode,
};
