import { useEffect, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  type OnSelectionChangeParams,
  type Viewport,
  type Node as RFNode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCanvasStore } from './store';
import { useUI } from './ui';
import { nodeTypes } from './nodes';
import { Toolbar } from './panels/Toolbar';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { LogPanel } from './panels/LogPanel';
import { QuickAdd } from './panels/QuickAdd';
import { ContextMenu } from './panels/ContextMenu';
import { WorkflowPicker } from './panels/WorkflowPicker';
import { SettingsModal } from './panels/SettingsModal';
import { MaskEditor } from './panels/MaskEditor';
import { Viewer3DModal } from './panels/Viewer3DModal';
import { PromptLibrary } from './panels/PromptLibrary';
import { Gallery } from './panels/Gallery';
import { useViewer3D } from './viewer3d';
import { isValidConnection as checkConnection, MODEL_HANDLE } from './ports';
import type { ModelNodeData } from './types';
import { uploadImageFile, uploadModelFile } from './nodeActions';
import type { CanvasFileV2 } from './types';

const AUTOSAVE_KEY = 'comfyui-canvas-autosave';

function Canvas() {
  const rf = useReactFlow();
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const onNodesChange = useCanvasStore((s) => s.onNodesChange);
  const onEdgesChange = useCanvasStore((s) => s.onEdgesChange);
  const onConnect = useCanvasStore((s) => s.onConnect);
  const setSelected = useCanvasStore((s) => s.setSelected);
  const setViewportState = useCanvasStore((s) => s.setViewportState);

  const workflowPickerPos = useUI((s) => s.workflowPickerPos);
  const settingsOpen = useUI((s) => s.settingsOpen);
  const quickAddOpen = useUI((s) => s.quickAddOpen);
  const promptsOpen = useUI((s) => s.promptsOpen);
  const galleryOpen = useUI((s) => s.galleryOpen);

  const restored = useRef(false);

  // Restore from the shared autosave key on first mount.
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

  // Keyboard: Tab → quick-add, Ctrl/Cmd+D → duplicate selected.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return;
      if (e.key === 'Tab') {
        e.preventDefault();
        useUI.getState().setQuickAddOpen(true);
      } else if (e.key.toLowerCase() === 'd' && (e.ctrlKey || e.metaKey)) {
        const id = useCanvasStore.getState().selectedId;
        if (id) {
          e.preventDefault();
          useCanvasStore.getState().duplicateNode(id);
        }
      } else if (e.key === 'Escape') {
        useUI.getState().setQuickAddOpen(false);
        useUI.getState().closeContextMenu();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function onSelectionChange({ nodes: selectedNodes }: OnSelectionChangeParams) {
    setSelected(selectedNodes[0]?.id ?? null);
  }

  function onMoveEnd(_: unknown, viewport: Viewport) {
    setViewportState(viewport);
  }

  function onNodeContextMenu(e: React.MouseEvent, node: RFNode) {
    e.preventDefault();
    useUI.getState().openContextMenu({ x: e.clientX, y: e.clientY, nodeId: node.id });
  }

  function onNodeDoubleClick(_: React.MouseEvent, node: RFNode) {
    if (node.type === 'model') {
      const d = node.data as ModelNodeData;
      if (d.modelUrl) useViewer3D.getState().openViewer(d.modelUrl, d.filename);
    } else if (node.type === 'viewer') {
      const { nodes, edges } = useCanvasStore.getState();
      const edge = edges.find((e) => e.target === node.id && e.targetHandle === MODEL_HANDLE);
      const model = edge ? (nodes.find((n) => n.id === edge.source)?.data as ModelNodeData | undefined) : undefined;
      if (model?.modelUrl) useViewer3D.getState().openViewer(model.modelUrl, model.filename);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    if (file.type.startsWith('image/')) uploadImageFile(file, pos);
    else if (/\.(glb|gltf|obj|fbx)$/i.test(file.name)) uploadModelFile(file, pos);
  }

  return (
    <div
      style={{ width: '100vw', height: '100vh' }}
      onDrop={onDrop}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
    >
      <Toolbar />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        deleteKeyCode={['Backspace', 'Delete']}
        selectionOnDrag
        panOnDrag={[1]}
        selectionKeyCode={null}
        panActivationKeyCode="Space"
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
        onNodeContextMenu={onNodeContextMenu}
        onNodeDoubleClick={onNodeDoubleClick}
        onPaneContextMenu={(e) => {
          e.preventDefault();
          useUI.getState().closeContextMenu();
        }}
        proOptions={{ hideAttribution: true }}
        fitView
      >
        <Background color="#2a2a44" gap={20} />
        <Controls />
        <MiniMap
          pannable
          zoomable
          bgColor="#16162a"
          maskColor="rgba(10, 10, 22, 0.6)"
          nodeColor="#4a9eff"
          nodeStrokeColor="#2a2a44"
        />
      </ReactFlow>
      <PropertiesPanel />
      <LogPanel />
      {quickAddOpen && <QuickAdd />}
      <ContextMenu />
      {workflowPickerPos && (
        <WorkflowPicker
          onCancel={() => useUI.getState().closeWorkflowPicker()}
          onPick={(data) => {
            const pos = useUI.getState().workflowPickerPos;
            useUI.getState().closeWorkflowPicker();
            if (pos) useCanvasStore.getState().addNode('workflow', data, { x: pos.x - 90, y: pos.y - 35 });
          }}
        />
      )}
      {settingsOpen && <SettingsModal onClose={() => useUI.getState().setSettingsOpen(false)} />}
      <MaskEditor />
      <Viewer3DModal />
      {promptsOpen && <PromptLibrary />}
      {galleryOpen && <Gallery />}
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
