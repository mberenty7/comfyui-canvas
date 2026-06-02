import { useEffect, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  type OnSelectionChangeParams,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCanvasStore } from './store';
import { nodeTypes } from './nodes';
import { Toolbar } from './panels/Toolbar';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { LogPanel } from './panels/LogPanel';
import { isValidConnection as checkConnection } from './ports';
import type { CanvasFileV2 } from './types';

const AUTOSAVE_KEY = 'comfyui-canvas-autosave';

function Canvas() {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const onNodesChange = useCanvasStore((s) => s.onNodesChange);
  const onEdgesChange = useCanvasStore((s) => s.onEdgesChange);
  const onConnect = useCanvasStore((s) => s.onConnect);
  const setSelected = useCanvasStore((s) => s.setSelected);
  const setViewportState = useCanvasStore((s) => s.setViewportState);

  const restored = useRef(false);

  // Restore from the shared autosave key on first mount (proves cross-app
  // compatibility: a canvas saved by the fabric app loads here unchanged).
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const saved = localStorage.getItem(AUTOSAVE_KEY);
      if (saved) useCanvasStore.getState().deserialize(JSON.parse(saved) as CanvasFileV2);
    } catch (err) {
      console.error('Autosave restore failed:', err);
    }
  }, []);

  // Debounced autosave on any store change.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = useCanvasStore.subscribe(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(useCanvasStore.getState().serialize()));
        } catch (err) {
          console.warn('Autosave failed:', err);
        }
      }, 1000);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, []);

  function onSelectionChange({ nodes: selectedNodes }: OnSelectionChangeParams) {
    setSelected(selectedNodes[0]?.id ?? null);
  }

  function onMoveEnd(_: unknown, viewport: Viewport) {
    setViewportState(viewport);
  }

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Toolbar />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={(c) =>
          checkConnection(
            { source: c.source, target: c.target, sourceHandle: c.sourceHandle, targetHandle: c.targetHandle },
            (id) => useCanvasStore.getState().nodes.find((n) => n.id === id),
          )
        }
        onSelectionChange={onSelectionChange}
        onMoveEnd={onMoveEnd}
        proOptions={{ hideAttribution: true }}
        fitView
      >
        <Background color="#2a2a44" gap={20} />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
      <PropertiesPanel />
      <LogPanel />
    </div>
  );
}

export function App() {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  );
}
