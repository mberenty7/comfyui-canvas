import { useEffect, useRef, useState } from 'react';
import { useMaskEditor } from '../maskEditor';

/**
 * Canvas-based mask editor (replaces the legacy fabric.js editor). Paint white
 * over areas to inpaint; exports a black/white PNG mask at the image's native
 * resolution. A translucent red overlay shows the painted area.
 */
export function MaskEditor() {
  const opts = useMaskEditor((s) => s.opts);
  const close = useMaskEditor((s) => s.close);

  const overlayRef = useRef<HTMLCanvasElement>(null); // display-size red strokes
  const maskRef = useRef<HTMLCanvasElement>(null); // native-size B/W mask
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [brush, setBrush] = useState(40);

  // Fit the image into the viewport.
  const maxW = Math.min(opts ? opts.width : 0, window.innerWidth * 0.8);
  const maxH = window.innerHeight - 160;
  const scale = opts ? Math.min(maxW / opts.width, maxH / opts.height, 1) : 1;
  const dispW = opts ? Math.round(opts.width * scale) : 0;
  const dispH = opts ? Math.round(opts.height * scale) : 0;

  // Initialise the native mask canvas (black) + optional existing mask.
  useEffect(() => {
    if (!opts) return;
    const mask = maskRef.current!;
    mask.width = opts.width;
    mask.height = opts.height;
    const mctx = mask.getContext('2d')!;
    mctx.fillStyle = '#000';
    mctx.fillRect(0, 0, opts.width, opts.height);

    const overlay = overlayRef.current!;
    const octx = overlay.getContext('2d')!;
    octx.clearRect(0, 0, overlay.width, overlay.height);

    if (opts.existingMask) {
      const img = new Image();
      img.onload = () => {
        mctx.drawImage(img, 0, 0, opts.width, opts.height);
        // Tint the painted area red on the overlay.
        octx.save();
        octx.drawImage(img, 0, 0, dispW, dispH);
        octx.globalCompositeOperation = 'source-in';
        octx.fillStyle = 'rgba(233,69,96,0.5)';
        octx.fillRect(0, 0, dispW, dispH);
        octx.restore();
      };
      img.src = opts.existingMask;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts]);

  if (!opts) return null;

  function pointer(e: React.PointerEvent) {
    const rect = overlayRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function stroke(from: { x: number; y: number }, to: { x: number; y: number }) {
    const octx = overlayRef.current!.getContext('2d')!;
    octx.strokeStyle = 'rgba(233,69,96,0.6)';
    octx.lineWidth = brush;
    octx.lineCap = 'round';
    octx.beginPath();
    octx.moveTo(from.x, from.y);
    octx.lineTo(to.x, to.y);
    octx.stroke();

    const mctx = maskRef.current!.getContext('2d')!;
    mctx.strokeStyle = '#fff';
    mctx.lineWidth = brush / scale;
    mctx.lineCap = 'round';
    mctx.beginPath();
    mctx.moveTo(from.x / scale, from.y / scale);
    mctx.lineTo(to.x / scale, to.y / scale);
    mctx.stroke();
  }

  function onDown(e: React.PointerEvent) {
    drawing.current = true;
    const p = pointer(e);
    last.current = p;
    stroke(p, p);
  }
  function onMove(e: React.PointerEvent) {
    if (!drawing.current || !last.current) return;
    const p = pointer(e);
    stroke(last.current, p);
    last.current = p;
  }
  function onUp() {
    drawing.current = false;
    last.current = null;
  }

  function clear() {
    overlayRef.current!.getContext('2d')!.clearRect(0, 0, dispW, dispH);
    const mctx = maskRef.current!.getContext('2d')!;
    mctx.fillStyle = '#000';
    mctx.fillRect(0, 0, opts!.width, opts!.height);
  }

  function save() {
    opts!.onSave(maskRef.current!.toDataURL('image/png'));
    close();
  }

  return (
    <div className="cv-modal-overlay">
      <div className="cv-mask-editor" onClick={(e) => e.stopPropagation()}>
        <div className="cv-mask-toolbar">
          <span style={{ fontSize: 13, fontWeight: 600 }}>🎨 Paint Mask</span>
          <label style={{ fontSize: 11, color: '#aaa', display: 'flex', gap: 6, alignItems: 'center' }}>
            Brush
            <input type="range" min={5} max={150} value={brush} onChange={(e) => setBrush(Number(e.target.value))} />
          </label>
          <button className="prop-btn" onClick={clear}>🗑 Clear</button>
          <div style={{ flex: 1 }} />
          <button className="generate-btn" style={{ width: 'auto', padding: '6px 14px' }} onClick={save}>Save Mask</button>
          <button className="prop-btn" onClick={close}>Cancel</button>
        </div>
        <p style={{ fontSize: 11, color: '#666', margin: '0 0 8px' }}>Paint white over areas to inpaint. Black = keep.</p>
        <div className="cv-mask-stage" style={{ width: dispW, height: dispH }}>
          <img src={opts.imageUrl} width={dispW} height={dispH} draggable={false} alt="" />
          <canvas
            ref={overlayRef}
            width={dispW}
            height={dispH}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerLeave={onUp}
          />
        </div>
        <canvas ref={maskRef} style={{ display: 'none' }} />
      </div>
    </div>
  );
}
