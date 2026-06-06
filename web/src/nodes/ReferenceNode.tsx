import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ReferenceNodeData } from '../types';
import { OUTPUT_HANDLE } from '../ports';

/**
 * Reference node — PureRef-style moodboard material. Like an Image node (single
 * output port, resolves as an `image` source), but visually distinct (pin tag)
 * and carries non-destructive display controls. Display/crop are applied here
 * as CSS for now; baking into the workflow input comes in Phase 3.
 */
export function ReferenceNode({ data, selected }: NodeProps) {
  const d = data as ReferenceNodeData;
  const display = d.display ?? 'color';
  const opacity = d.opacity ?? 1;
  // grayscale = simple desaturation; luminance = perceptual-weighted via SVG filter.
  const filter =
    display === 'grayscale' ? 'grayscale(1)' : display === 'luminance' ? 'url(#cv-luminance)' : undefined;
  return (
    <div className={`cv-node cv-node-reference${selected ? ' selected' : ''}`}>
      <div className="cv-node-type cv-reference-tag">📌 Reference</div>
      {d.imageUrl ? (
        <img
          className="cv-node-thumb"
          src={d.imageUrl}
          alt={d.filename || ''}
          draggable={false}
          style={{ filter, opacity }}
        />
      ) : (
        <div className="cv-node-thumb cv-node-thumb-empty">no image</div>
      )}
      {d.label ? <div className="cv-node-label">{d.label}</div> : null}
      <Handle id={OUTPUT_HANDLE} type="source" position={Position.Right} className="cv-handle cv-handle-image" />
    </div>
  );
}
