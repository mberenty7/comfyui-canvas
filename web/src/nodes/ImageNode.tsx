import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ImageNodeData } from '../types';
import { OUTPUT_HANDLE } from '../ports';

/**
 * Image node — a thumbnail on the canvas with a single output port.
 * Replaces the legacy fabric ImageNode (which scaled the bitmap into a
 * fabric.Group); here the browser handles image loading via a plain <img>.
 */
export function ImageNode({ data, selected }: NodeProps) {
  const d = data as ImageNodeData;
  return (
    <div className={`cv-node cv-node-image${selected ? ' selected' : ''}`}>
      <div className="cv-node-type" style={{ color: '#4a9eff' }}>Image</div>
      {d.imageUrl ? (
        <img className="cv-node-thumb" src={d.imageUrl} alt={d.filename || ''} draggable={false} />
      ) : (
        <div className="cv-node-thumb cv-node-thumb-empty">no image</div>
      )}
      {d.label ? <div className="cv-node-label">{d.label}</div> : null}
      <Handle
        id={OUTPUT_HANDLE}
        type="source"
        position={Position.Right}
        className="cv-handle cv-handle-image"
      />
    </div>
  );
}
