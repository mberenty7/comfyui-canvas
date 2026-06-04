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

export interface GradeParams {
  gain: number; // 0–4
  gamma: number; // 0.2–5
  saturation: number; // 0–3
  hue: number; // -180..180 degrees
  rgb: string; // hex per-channel multiplier
}

/**
 * Nuke-style grade. Pipeline order (per spec): RGB multiply → gain → gamma →
 * saturation → hue shift.
 */
export function processGrade(img: HTMLImageElement, p: GradeParams): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  const [mr, mg, mb] = hexToRgb(p.rgb).map((v) => v / 255) as [number, number, number];
  const invGamma = 1 / p.gamma;
  const hueRad = (p.hue * Math.PI) / 180;
  const cosH = Math.cos(hueRad);
  const sinH = Math.sin(hueRad);

  for (let i = 0; i < px.length; i += 4) {
    let r = px[i] / 255;
    let g = px[i + 1] / 255;
    let b = px[i + 2] / 255;

    // RGB multiply (per-channel)
    r *= mr; g *= mg; b *= mb;
    // Gain
    r *= p.gain; g *= p.gain; b *= p.gain;
    // Gamma
    r = Math.pow(Math.max(0, r), invGamma);
    g = Math.pow(Math.max(0, g), invGamma);
    b = Math.pow(Math.max(0, b), invGamma);
    // Saturation (around luma)
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = luma + (r - luma) * p.saturation;
    g = luma + (g - luma) * p.saturation;
    b = luma + (b - luma) * p.saturation;
    // Hue shift (YIQ rotation)
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const I = 0.596 * r - 0.274 * g - 0.322 * b;
    const Q = 0.211 * r - 0.523 * g + 0.312 * b;
    const I2 = I * cosH - Q * sinH;
    const Q2 = I * sinH + Q * cosH;
    r = y + 0.956 * I2 + 0.621 * Q2;
    g = y - 0.272 * I2 - 0.647 * Q2;
    b = y - 1.106 * I2 + 1.703 * Q2;

    px[i] = Math.max(0, Math.min(255, r * 255));
    px[i + 1] = Math.max(0, Math.min(255, g * 255));
    px[i + 2] = Math.max(0, Math.min(255, b * 255));
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

/** Combine up to 4 images into a square 2×2 grid (order: tl, tr, bl, br). */
export function processGridJoin(quads: (HTMLImageElement | null)[]): HTMLCanvasElement | null {
  const present = quads.filter(Boolean) as HTMLImageElement[];
  if (present.length === 0) return null;
  const cell = Math.max(...present.map((i) => Math.max(i.naturalWidth, i.naturalHeight)));
  const canvas = document.createElement('canvas');
  canvas.width = cell * 2;
  canvas.height = cell * 2;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const cellPos = [
    [0, 0],
    [cell, 0],
    [0, cell],
    [cell, cell],
  ];
  quads.forEach((img, i) => {
    if (!img) return;
    // Contain within the cell, centered.
    const s = Math.min(cell / img.naturalWidth, cell / img.naturalHeight);
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    const [cxBase, cyBase] = cellPos[i];
    ctx.drawImage(img, cxBase + (cell - w) / 2, cyBase + (cell - h) / 2, w, h);
  });
  return canvas;
}

/** Split an image into 4 equal quadrant canvases (order: tl, tr, bl, br). */
export function splitImageQuads(img: HTMLImageElement): HTMLCanvasElement[] {
  const hw = Math.floor(img.naturalWidth / 2);
  const hh = Math.floor(img.naturalHeight / 2);
  const regions = [
    [0, 0],
    [hw, 0],
    [0, hh],
    [hw, hh],
  ];
  return regions.map(([sx, sy]) => {
    const c = document.createElement('canvas');
    c.width = hw;
    c.height = hh;
    c.getContext('2d')!.drawImage(img, sx, sy, hw, hh, 0, 0, hw, hh);
    return c;
  });
}

/** Compact local timestamp, e.g. "20260604-125301". */
export function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Insert a timestamp before the file extension: "x.png" → "x_20260604-125301.png". */
export function stampName(filename: string): string {
  const dot = filename.lastIndexOf('.');
  const base = dot >= 0 ? filename.slice(0, dot) : filename;
  const ext = dot >= 0 ? filename.slice(dot) : '';
  return `${base}_${timestamp()}${ext}`;
}

/** Best-effort copy of a produced image to the configured output directory. */
export async function saveToOutputDir(blob: Blob, filename: string, metadata?: Record<string, unknown>) {
  try {
    const form = new FormData();
    form.append('image', new File([blob], filename, { type: 'image/png' }));
    form.append('filename', filename);
    form.append('metadata', JSON.stringify(metadata ?? { timestamp: new Date().toISOString() }));
    await fetch('/api/save-image-file', { method: 'POST', body: form });
  } catch {
    /* output dir not set or unreachable — non-fatal */
  }
}

/** Upload a canvas as a PNG to ComfyUI and return its URL + comfyName. */
export async function uploadCanvas(canvas: HTMLCanvasElement, filename: string, metadata?: Record<string, unknown>) {
  const name = stampName(filename);
  const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
  const form = new FormData();
  form.append('image', new File([blob], name, { type: 'image/png' }));
  const result = await apiUpload<{ localPath?: string; path?: string; comfyName?: string }>('/api/comfy/upload', form);
  // Also copy to the output directory (best-effort).
  saveToOutputDir(blob, name, metadata);
  return {
    url: result.localPath || result.path || '',
    comfyName: result.comfyName || name,
    width: canvas.width,
    height: canvas.height,
  };
}
