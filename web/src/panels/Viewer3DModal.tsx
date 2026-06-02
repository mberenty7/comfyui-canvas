import { useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useViewer3D } from '../viewer3d';
import { useCanvasStore } from '../store';
import { addLog } from '../logStore';

interface CaptureOpts {
  imageUrl: string;
  filename: string;
  comfyName: string;
  width: number;
  height: number;
  format?: string;
  label?: string;
}

// Lazy-load the three.js viewer (and three itself) only on first open.
let modPromise: Promise<typeof import('../vendor/viewer3d')> | null = null;
const loadViewer = () => (modPromise ??= import('../vendor/viewer3d'));

/**
 * Drives the vendored three.js Viewer3D (which manages its own modal DOM).
 * Renders nothing itself; opens the viewer when the store requests it and
 * routes captured renders into Image nodes on the canvas.
 */
export function Viewer3DModal() {
  const rf = useReactFlow();
  const open = useViewer3D((s) => s.open);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadViewer().then((mod) => {
      if (cancelled) return;
      mod.setCaptureHandler((opts: CaptureOpts) => {
        const c = rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
        useCanvasStore.getState().addNode(
          'image',
          {
            label: opts.label || '',
            imageUrl: opts.imageUrl,
            filename: opts.filename,
            comfyName: opts.comfyName,
            width: opts.width,
            height: opts.height,
            format: opts.format || 'PNG',
          },
          { x: c.x - 100, y: c.y - 100 },
        );
        addLog(`Captured ${opts.label || 'image'} → canvas`, 'success');
      });
      mod.getViewer3D().open(open.modelUrl, open.filename);
    });
    return () => {
      cancelled = true;
    };
  }, [open, rf]);

  return null;
}
