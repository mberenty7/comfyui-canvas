import { useCanvasStore } from './store';
import { loadImage, splitImageQuads, uploadCanvas, resolveImageUrl } from './imageProc';
import { addLog } from './logStore';

/** Split a Grid Split node's source image into 4 quadrant Image nodes. */
export async function runGridSplit(nodeId: string) {
  const { nodes, edges } = useCanvasStore.getState();
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return;
  const edge = edges.find((e) => e.target === nodeId && e.targetHandle === 'image');
  const url = edge ? resolveImageUrl(edge.source) : null;
  if (!url) {
    addLog('Grid Split: connect an image first', 'warn');
    return;
  }
  const img = await loadImage(url);
  const quads = splitImageQuads(img);
  const names = ['tl', 'tr', 'bl', 'br'];
  const offsets = [
    [220, -120],
    [430, -120],
    [220, 110],
    [430, 110],
  ];
  for (let i = 0; i < 4; i++) {
    const up = await uploadCanvas(quads[i], `split_${names[i]}_${nodeId}.png`);
    useCanvasStore.getState().addNode(
      'image',
      { label: `split ${names[i]}`, imageUrl: up.url, filename: up.comfyName, comfyName: up.comfyName, width: up.width, height: up.height, format: 'PNG' },
      { x: node.position.x + offsets[i][0], y: node.position.y + offsets[i][1] },
    );
  }
  addLog('Split into 4 images', 'success');
}
