import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react';
import type { ReferenceNodeData } from '../types';
import { OUTPUT_HANDLE } from '../ports';
import { useCanvasStore } from '../store';

/**
 * Reference node — PureRef-style moodboard material. Like an Image node (single
 * output port, resolves as an `image` source) but freely resizable on the canvas
 * and carrying non-destructive display controls. The image fills the box; the
 * tag/label sit on top as overlays so resizing keeps the picture's aspect clean.
 */
export function ReferenceNode({ id, data, selected }: NodeProps) {
  const d = data as ReferenceNodeData;
  const display = d.display ?? 'color';
  const opacity = d.opacity ?? 1;
  const w = d.viewW ?? 200;
  const h = d.viewH ?? 200;
  // grayscale = simple desaturation; luminance = Rec.709 perceptual weighting.
  const filter =
    display === 'grayscale' ? 'grayscale(1)' : display === 'luminance' ? 'url(#cv-luminance)' : undefined;

  // Conform the box to the image's true aspect ratio (no letterbox / dead space).
  // Runs once per image once its natural size is known; also backfills width/height.
  function onImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    if (!img.naturalWidth || !img.naturalHeight) return;
    const aspect = img.naturalWidth / img.naturalHeight;
    const patch: Record<string, unknown> = {};
    if (!d.width || !d.height) {
      patch.width = img.naturalWidth;
      patch.height = img.naturalHeight;
    }
    if (Math.abs(w / h - aspect) > 0.01) patch.viewH = Math.round(w / aspect);
    if (Object.keys(patch).length) useCanvasStore.getState().updateNodeData(id, patch);
  }

  return (
    <>
      <NodeResizer
        color="#f5a623"
        isVisible={selected}
        keepAspectRatio
        minWidth={80}
        minHeight={80}
        onResize={(_, p) => useCanvasStore.getState().updateNodeData(id, { viewW: p.width, viewH: p.height })}
      />
      <div className={`cv-node cv-node-reference${selected ? ' selected' : ''}`} style={{ width: w, height: h }}>
        {d.imageUrl ? (
          <img className="cv-reference-img" src={d.imageUrl} alt={d.filename || ''} draggable={false} style={{ filter, opacity }} onLoad={onImgLoad} />
        ) : (
          <div className="cv-node-thumb-empty" style={{ height: '100%' }}>no image</div>
        )}
        <div className="cv-reference-tag">📌</div>
        {d.label ? <div className="cv-reference-label">{d.label}</div> : null}
        <Handle id={OUTPUT_HANDLE} type="source" position={Position.Right} className="cv-handle cv-handle-image" />
      </div>
    </>
  );
}
