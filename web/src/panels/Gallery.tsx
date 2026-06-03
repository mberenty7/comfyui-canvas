import { useCallback, useEffect, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useCanvasStore } from '../store';
import { useUI } from '../ui';
import { apiUpload } from '../api';
import { addLog } from '../logStore';

interface GalleryImage {
  filename: string;
  subfolder?: string;
  type?: string;
  source: 'comfy' | 'dir';
  dirPath?: string;
}

function imageSrc(img: GalleryImage): string {
  if (img.source === 'dir') {
    return `/api/gallery/dir/image?dir=${encodeURIComponent(img.dirPath || '')}&filename=${encodeURIComponent(img.filename)}`;
  }
  return `/api/comfy/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=${encodeURIComponent(img.type || 'output')}`;
}

function imageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = url;
  });
}

/** Output gallery — browse ComfyUI outputs or a directory; lightbox + place. */
export function Gallery() {
  const rf = useReactFlow();
  const [source, setSource] = useState<'comfy' | 'dir'>('comfy');
  const [dirPath, setDirPath] = useState(() => localStorage.getItem('gallery-dir-path') || '');
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [status, setStatus] = useState('Loading…');
  const [lightbox, setLightbox] = useState(-1);
  const [meta, setMeta] = useState<Record<string, unknown> | null>(null);

  // Default the custom-directory path to the configured Output Directory
  // (where generations are copied) if the user hasn't set one yet.
  useEffect(() => {
    if (dirPath) return;
    fetch('/api/config')
      .then((r) => r.json())
      .then((cfg: { outputDir?: string }) => {
        if (cfg.outputDir) setDirPath(cfg.outputDir);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    setStatus('Loading…');
    setImages([]);
    try {
      let url = '/api/gallery';
      if (source === 'dir') {
        if (!dirPath.trim()) {
          setStatus('Enter a directory path above');
          return;
        }
        localStorage.setItem('gallery-dir-path', dirPath.trim());
        url = `/api/gallery/dir?path=${encodeURIComponent(dirPath.trim())}`;
      }
      const data = await (await fetch(url)).json();
      if (data.error) throw new Error(data.error);
      setImages(data.images || []);
      setStatus((data.images || []).length ? '' : 'No images found');
    } catch (e) {
      setStatus(`Failed to load: ${(e as Error).message}`);
    }
  }, [source, dirPath]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  // Load sidecar metadata when the lightbox image changes.
  useEffect(() => {
    if (lightbox < 0) return;
    const img = images[lightbox];
    if (!img) return;
    setMeta(null);
    const params = new URLSearchParams({ filename: img.filename });
    if (img.dirPath) params.set('dir', img.dirPath);
    fetch(`/api/gallery/sidecar?${params}`)
      .then((r) => r.json())
      .then((m) => setMeta(m && typeof m === 'object' ? m : null))
      .catch(() => setMeta(null));
  }, [lightbox, images]);

  // Lightbox keyboard nav.
  useEffect(() => {
    if (lightbox < 0) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightbox(-1);
      if (e.key === 'ArrowLeft') setLightbox((i) => (i - 1 + images.length) % images.length);
      if (e.key === 'ArrowRight') setLightbox((i) => (i + 1) % images.length);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, images.length]);

  async function place(img: GalleryImage) {
    const src = imageSrc(img);
    const dims = await imageDimensions(src);
    let comfyName = img.filename;
    try {
      const blob = await (await fetch(src)).blob();
      const form = new FormData();
      form.append('image', new File([blob], img.filename, { type: blob.type }));
      const up = await apiUpload<{ comfyName?: string }>('/api/comfy/upload', form);
      if (up.comfyName) comfyName = up.comfyName;
    } catch {
      /* ComfyUI offline — node still placed with the gallery URL */
    }
    const c = rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    useCanvasStore.getState().addNode(
      'image',
      { label: '', imageUrl: src, filename: img.filename, comfyName, width: dims.width, height: dims.height, format: img.filename.split('.').pop()?.toUpperCase() || 'PNG' },
      { x: c.x - 100, y: c.y - 100 },
    );
    setLightbox(-1);
    addLog(`Placed "${img.filename}" on canvas`, 'success');
  }

  const lbImg = lightbox >= 0 ? images[lightbox] : null;

  return (
    <>
      <div className="cv-side-panel">
        <div className="cv-side-header">
          <h3>🖼️ Gallery</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="prop-btn" style={{ padding: '4px 8px', fontSize: 11 }} onClick={load}>Refresh</button>
            <button className="cv-log-close" onClick={() => useUI.getState().toggleGallery()}>✕</button>
          </div>
        </div>
        <div className="cv-side-search" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <select className="prop-input" style={{ fontSize: 12 }} value={source} onChange={(e) => setSource(e.target.value as 'comfy' | 'dir')}>
            <option value="comfy">ComfyUI Output</option>
            <option value="dir">Custom Directory</option>
          </select>
          {source === 'dir' && (
            <div style={{ display: 'flex', gap: 4 }}>
              <input className="prop-input" style={{ fontSize: 11 }} placeholder="/path/to/images" value={dirPath} onChange={(e) => setDirPath(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} />
              <button className="prop-btn" style={{ padding: '4px 10px', fontSize: 11 }} onClick={load}>Go</button>
            </div>
          )}
        </div>
        <div className="cv-side-body">
          {images.length === 0 ? (
            <div className="cv-side-empty">{status}</div>
          ) : (
            <div className="cv-gallery-grid">
              {images.map((img, i) => (
                <div key={`${img.subfolder || img.dirPath || ''}/${img.filename}`} className="cv-thumb" onClick={() => setLightbox(i)}>
                  <img loading="lazy" src={imageSrc(img)} alt={img.filename} />
                  <div className="cv-thumb-name">{img.filename}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {lbImg && (
        <div className="cv-modal-overlay" onClick={() => setLightbox(-1)}>
          <div className="cv-lightbox" onClick={(e) => e.stopPropagation()}>
            <div className="cv-lightbox-top">
              <span style={{ fontSize: 13, color: '#888', fontFamily: 'monospace' }}>{lbImg.filename} ({lightbox + 1}/{images.length})</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="generate-btn" style={{ width: 'auto', padding: '6px 14px', fontSize: 12 }} onClick={() => place(lbImg)}>📌 Place on Canvas</button>
                <button className="cv-log-close" onClick={() => setLightbox(-1)}>✕</button>
              </div>
            </div>
            <div className="cv-lightbox-body">
              <button className="cv-lightbox-nav" style={{ left: 0 }} onClick={() => setLightbox((i) => (i - 1 + images.length) % images.length)}>◀</button>
              <img className="cv-lightbox-img" src={imageSrc(lbImg)} alt={lbImg.filename} />
              <button className="cv-lightbox-nav" style={{ right: 0 }} onClick={() => setLightbox((i) => (i + 1) % images.length)}>▶</button>
              {meta && Object.keys(meta).length > 0 && <MetaPanel meta={meta} />}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MetaPanel({ meta }: { meta: Record<string, unknown> }) {
  const params = (meta.params as Record<string, unknown>) || {};
  return (
    <div className="cv-lightbox-meta">
      {typeof meta.template === 'string' && <div style={{ color: '#4a9eff', fontWeight: 600 }}>{meta.template}</div>}
      {typeof meta.timestamp === 'string' && <div style={{ color: '#666', fontSize: 10 }}>{new Date(meta.timestamp).toLocaleString()}</div>}
      {typeof meta.positive === 'string' && meta.positive && (
        <div style={{ marginTop: 8 }}><div className="cv-meta-label">Positive</div><div style={{ color: '#ccc', wordBreak: 'break-word' }}>{meta.positive}</div></div>
      )}
      {typeof meta.negative === 'string' && meta.negative && (
        <div style={{ marginTop: 8 }}><div className="cv-meta-label">Negative</div><div style={{ color: '#f44336', wordBreak: 'break-word' }}>{meta.negative}</div></div>
      )}
      <div style={{ marginTop: 8 }}><span style={{ color: '#888' }}>Seed:</span> <span style={{ color: '#4caf50', fontFamily: 'monospace' }}>{String(meta.seed ?? '?')}</span></div>
      {Object.keys(params).length > 0 && (
        <div style={{ marginTop: 8, borderTop: '1px solid #333', paddingTop: 8 }}>
          <div className="cv-meta-label">Parameters</div>
          {Object.entries(params).filter(([k]) => k !== 'positive' && k !== 'negative').map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px solid #222' }}>
              <span style={{ color: '#888' }}>{k}</span>
              <span style={{ color: '#ccc', fontFamily: 'monospace', fontSize: 11, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{String(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
