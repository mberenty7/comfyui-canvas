import { useEffect, useRef, useState } from 'react';
import { usePaintEditor } from '../paintEditor';

const PRESETS = ['#ff0000', '#0000ff', '#00cc00', '#ffff00', '#ffffff', '#000000', '#ff69b4', '#ffa500'];
const MAX_HISTORY = 30;

/**
 * Freehand color paint over a source image. Strokes are drawn on a native-res
 * transparent canvas (displayed scaled); Done composites paint over the source.
 */
export function PaintModal() {
  const opts = usePaintEditor((s) => s.opts);
  const close = usePaintEditor((s) => s.close);

  const paintRef = useRef<HTMLCanvasElement>(null); // native-res, transparent
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const history = useRef<ImageData[]>([]);

  const [color, setColor] = useState('#ff0000');
  const [brush, setBrush] = useState(20);
  const [opacity, setOpacity] = useState(100);

  const maxW = Math.min(opts ? opts.width : 0, window.innerWidth * 0.8);
  const maxH = window.innerHeight - 170;
  const scale = opts ? Math.min(maxW / opts.width, maxH / opts.height, 1) : 1;
  const dispW = opts ? Math.round(opts.width * scale) : 0;
  const dispH = opts ? Math.round(opts.height * scale) : 0;

  useEffect(() => {
    if (!opts) return;
    const c = paintRef.current!;
    c.width = opts.width;
    c.height = opts.height;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    history.current = [];
  }, [opts]);

  if (!opts) return null;

  function toNative(e: React.PointerEvent) {
    const rect = paintRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * opts!.width, y: ((e.clientY - rect.top) / rect.height) * opts!.height };
  }

  function pushHistory() {
    const c = paintRef.current!;
    history.current.push(c.getContext('2d')!.getImageData(0, 0, c.width, c.height));
    if (history.current.length > MAX_HISTORY) history.current.shift();
  }

  function stroke(from: { x: number; y: number }, to: { x: number; y: number }) {
    const ctx = paintRef.current!.getContext('2d')!;
    ctx.globalAlpha = opacity / 100;
    ctx.strokeStyle = color;
    ctx.lineWidth = brush / scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function onDown(e: React.PointerEvent) {
    pushHistory();
    drawing.current = true;
    const p = toNative(e);
    last.current = p;
    stroke(p, p);
  }
  function onMove(e: React.PointerEvent) {
    if (!drawing.current || !last.current) return;
    const p = toNative(e);
    stroke(last.current, p);
    last.current = p;
  }
  function onUp() {
    drawing.current = false;
    last.current = null;
  }

  function undo() {
    const prev = history.current.pop();
    const c = paintRef.current!;
    const ctx = c.getContext('2d')!;
    if (prev) ctx.putImageData(prev, 0, 0);
    else ctx.clearRect(0, 0, c.width, c.height);
  }

  function clear() {
    pushHistory();
    const c = paintRef.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
  }

  function done() {
    const out = document.createElement('canvas');
    out.width = opts!.width;
    out.height = opts!.height;
    const octx = out.getContext('2d')!;
    const img = new Image();
    img.onload = () => {
      octx.drawImage(img, 0, 0, out.width, out.height);
      octx.drawImage(paintRef.current!, 0, 0);
      opts!.onSave(out.toDataURL('image/png'));
      close();
    };
    img.src = opts!.imageUrl;
  }

  return (
    <div className="cv-modal-overlay">
      <div className="cv-mask-editor" onClick={(e) => e.stopPropagation()}>
        <div className="cv-mask-toolbar" style={{ flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>🖌 Paint</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {PRESETS.map((c) => (
              <button key={c} className="cv-swatch" style={{ background: c, outline: color === c ? '2px solid #fff' : 'none' }} onClick={() => setColor(c)} />
            ))}
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </div>
          <label style={{ fontSize: 11, color: '#aaa', display: 'flex', gap: 4, alignItems: 'center' }}>
            Size<input type="range" min={1} max={100} value={brush} onChange={(e) => setBrush(Number(e.target.value))} />
          </label>
          <label style={{ fontSize: 11, color: '#aaa', display: 'flex', gap: 4, alignItems: 'center' }}>
            Opacity<input type="range" min={5} max={100} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
          </label>
          <button className="prop-btn" onClick={undo}>↶ Undo</button>
          <button className="prop-btn" onClick={clear}>🗑 Clear</button>
          <div style={{ flex: 1 }} />
          <button className="generate-btn" style={{ width: 'auto', padding: '6px 14px' }} onClick={done}>Done</button>
          <button className="prop-btn" onClick={close}>Cancel</button>
        </div>
        <div className="cv-mask-stage" style={{ width: dispW, height: dispH }}>
          <img src={opts.imageUrl} width={dispW} height={dispH} draggable={false} alt="" />
          <canvas
            ref={paintRef}
            style={{ width: dispW, height: dispH }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerLeave={onUp}
          />
        </div>
      </div>
    </div>
  );
}
