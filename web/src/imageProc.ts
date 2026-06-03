import { apiUpload } from './api';
import { useCanvasStore } from './store';

/** Resolve a node's displayable image URL: its committed output, else its source. */
export function resolveImageUrl(nodeId: string | undefined): string | null {
  if (!nodeId) return null;
  const node = useCanvasStore.getState().nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  const d = node.data as { resultUrl?: string | null; imageUrl?: string };
  return d.resultUrl || d.imageUrl || null;
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image: ' + url));
    img.src = url;
  });
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Binary matte: white where the image color is within `tolerance` (Manhattan) of `pickHex`. */
export function processColorPick(img: HTMLImageElement, pickHex: string, tolerance: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  const [pr, pg, pb] = hexToRgb(pickHex);
  for (let i = 0; i < px.length; i += 4) {
    const dist = Math.abs(px[i] - pr) + Math.abs(px[i + 1] - pg) + Math.abs(px[i + 2] - pb);
    const v = dist <= tolerance ? 255 : 0;
    px[i] = px[i + 1] = px[i + 2] = v;
    px[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

/**
 * Composite a solid color onto `baseImg`, using `matteImg` as alpha.
 * `expand` grows (>0) or shrinks (<0) the matte via a blur+threshold approximation.
 */
export function processOverlay(
  baseImg: HTMLImageElement,
  matteImg: HTMLImageElement,
  opts: { color: string; opacity: number; invert: boolean; expand: number },
): HTMLCanvasElement {
  const w = baseImg.naturalWidth;
  const h = baseImg.naturalHeight;

  // Rasterise the matte to base dimensions, applying expand (blur+threshold).
  const matte = document.createElement('canvas');
  matte.width = w;
  matte.height = h;
  const mctx = matte.getContext('2d')!;
  if (opts.expand !== 0) mctx.filter = `blur(${Math.abs(opts.expand)}px)`;
  mctx.drawImage(matteImg, 0, 0, w, h);
  mctx.filter = 'none';
  const mdata = mctx.getImageData(0, 0, w, h);
  const mp = mdata.data;
  // expand>0 (dilate) → lower threshold grows white; expand<0 (erode) → higher threshold shrinks.
  const threshold = opts.expand > 0 ? 64 : opts.expand < 0 ? 192 : 128;

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const octx = out.getContext('2d')!;
  octx.drawImage(baseImg, 0, 0);
  const odata = octx.getImageData(0, 0, w, h);
  const op = odata.data;
  const [cr, cg, cb] = hexToRgb(opts.color);
  const a = Math.max(0, Math.min(100, opts.opacity)) / 100;

  for (let i = 0; i < op.length; i += 4) {
    let on = mp[i] >= threshold; // matte luminance via red channel (binary mattes)
    if (opts.invert) on = !on;
    if (on) {
      op[i] = op[i] * (1 - a) + cr * a;
      op[i + 1] = op[i + 1] * (1 - a) + cg * a;
      op[i + 2] = op[i + 2] * (1 - a) + cb * a;
    }
  }
  octx.putImageData(odata, 0, 0);
  return out;
}

/** Sample the RGB color at normalized (0..1) coords of an image. */
export function sampleColor(img: HTMLImageElement, nx: number, ny: number): string {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const x = Math.max(0, Math.min(c.width - 1, Math.floor(nx * c.width)));
  const y = Math.max(0, Math.min(c.height - 1, Math.floor(ny * c.height)));
  const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Upload a canvas as a PNG to ComfyUI and return its URL + comfyName. */
export async function uploadCanvas(canvas: HTMLCanvasElement, filename: string) {
  const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
  const form = new FormData();
  form.append('image', new File([blob], filename, { type: 'image/png' }));
  const result = await apiUpload<{ localPath?: string; path?: string; comfyName?: string }>('/api/comfy/upload', form);
  return {
    url: result.localPath || result.path || '',
    comfyName: result.comfyName || filename,
    width: canvas.width,
    height: canvas.height,
  };
}
