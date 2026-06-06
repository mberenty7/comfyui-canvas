import { useEffect, useMemo, useRef } from 'react';
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
import { PaintModal } from './panels/PaintModal';
import { Viewer3DModal } from './panels/Viewer3DModal';
import { PromptLibrary } from './panels/PromptLibrary';
import { Gallery } from './panels/Gallery';
import { Breadcrumb } from './panels/Breadcrumb';
import { useViewer3D } from './viewer3d';
import { isValidConnection as checkConnection, MODEL_HANDLE } from './ports';
import type { ModelNodeData } from './types';
import { uploadImageFile, uploadModelFile, uploadReferenceFile } from './nodeActions';
import type { CanvasFileV2 } from './types';

const AUTOSAVE_KEY = 'comfyui-canvas-autosave';

function Canvas() {
  const rf = useReactFlow();
  const allNodes = useCanvasStore((s) => s.nodes);
  const allEdges = useCanvasStore((s) => s.edges);
  const currentGroup = useCanvasStore((s) => s.currentGroup);
  // Nodes hidden because they live inside a collapsed (minimized) Network Box.
  const hiddenByBox = useMemo(() => {
    const set = new Set<string>();
    for (const n of allNodes) {
      if (n.type === 'netbox' && (n.data as { collapsed?: boolean }).collapsed) {
        for (const id of ((n.data as { contained?: string[] }).contained ?? [])) set.add(id);
      }
    }
    return set;
  }, [allNodes]);

  // Only show the nodes/edges that belong to the group currently being viewed,
  // minus anything hidden inside a collapsed box. Boxes render behind (zIndex −1).
  const nodes = useMemo(
    () =>
      allNodes
        .filter((n) => ((n.data?.group as string) || 'root') === currentGroup && !hiddenByBox.has(n.id))
        .map((n) => (n.type === 'netbox' ? { ...n, zIndex: -1 } : n)),
    [allNodes, currentGroup, hiddenByBox],
  );
  const edges = useMemo(
    () => allEdges.filter((e) => ((e.data?.group as string) || 'root') === currentGroup && !hiddenByBox.has(e.source) && !hiddenByBox.has(e.target)),
    [allEdges, currentGroup, hiddenByBox],
  );
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

  // Keyboard: Tab → enter selected group else quick-add; Ctrl/Cmd+D → duplicate;
  // Esc → close menus, else exit the current group.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return;
      if (e.key === 'Tab') {
        e.preventDefault();
        const store = useCanvasStore.getState();
        const sel = store.nodes.find((n) => n.id === store.selectedId);
        if (sel?.type === 'group') store.enterGroup(sel.id, (sel.data.label as string) || 'Group');
        else useUI.getState().openQuickAdd();
      } else if (e.key.toLowerCase() === 'd' && (e.ctrlKey || e.metaKey)) {
        const id = useCanvasStore.getState().selectedId;
        if (id) {
          e.preventDefault();
          useCanvasStore.getState().duplicateNode(id);
        }
      } else if (e.key === 'Escape') {
        const ui = useUI.getState();
        if (ui.quickAddOpen || ui.contextMenu) {
          ui.setQuickAddOpen(false);
          ui.closeContextMenu();
        } else {
          useCanvasStore.getState().exitGroup();
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Re-fit the view when navigating between groups.
  useEffect(() => {
    const t = setTimeout(() => rf.fitView({ duration: 200, maxZoom: 1.2 }), 30);
    return () => clearTimeout(t);
  }, [currentGroup, rf]);

  // Clipboard paste (Ctrl/Cmd+V) → drop an image from the clipboard onto the
  // canvas as a Reference, at the centre of the current view. Ignored while
  // typing in an input/textarea so normal text paste still works.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      const items = Array.from(e.clipboardData?.items ?? []);
      const imgItem = items.find((it) => it.type.startsWith('image/'));
      if (!imgItem) return;
      const file = imgItem.getAsFile();
      if (!file) return;
      e.preventDefault();
      const center = rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
      uploadReferenceFile(file, center);
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [rf]);

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

  // Network box sticky containment: dragging a box moves the nodes inside it.
  const boxDrag = useRef<{ boxId: string; last: { x: number; y: number }; captured: string[] } | null>(null);

  function nodeCenter(n: RFNode) {
    const w = n.measured?.width ?? 90;
    const h = n.measured?.height ?? 60;
    return { x: n.position.x + w / 2, y: n.position.y + h / 2 };
  }

  function onNodeDragStart(_: MouseEvent | TouchEvent, node: RFNode) {
    if (node.type !== 'netbox') return;
    const d = node.data as { width?: number; height?: number };
    const x0 = node.position.x;
    const y0 = node.position.y;
    const x1 = x0 + (d.width || 340);
    const y1 = y0 + (d.height || 240);
    const captured = useCanvasStore
      .getState()
      .nodes.filter((n) => n.id !== node.id && n.type !== 'netbox' && ((n.data?.group as string) || 'root') === currentGroup)
      .filter((n) => {
        const c = nodeCenter(n);
        return c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1;
      })
      .map((n) => n.id);
    boxDrag.current = { boxId: node.id, last: { x: node.position.x, y: node.position.y }, captured };
  }

  function onNodeDrag(_: MouseEvent | TouchEvent, node: RFNode) {
    const d = boxDrag.current;
    if (!d || d.boxId !== node.id) return;
    const dx = node.position.x - d.last.x;
    const dy = node.position.y - d.last.y;
    if (dx || dy) {
      useCanvasStore.getState().moveNodesBy(d.captured, dx, dy);
      d.last = { x: node.position.x, y: node.position.y };
    }
  }

  function onNodeDragStop() {
    boxDrag.current = null;
  }

  function onNodeDoubleClick(_: React.MouseEvent, node: RFNode) {
    if (node.type === 'group') {
      useCanvasStore.getState().enterGroup(node.id, (node.data.label as string) || 'Group');
      return;
    }
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
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Toolbar />
      <div
        className="cv-content"
        onDrop={onDrop}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
      >
      <Breadcrumb />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        deleteKeyCode={['Backspace', 'Delete']}
        // Keep selected nodes at their own z-index so a selected Network Box never
        // jumps in front of (and blocks clicks to) the nodes it contains.
        elevateNodesOnSelect={false}
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
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onNodeDoubleClick={onNodeDoubleClick}
        onPaneContextMenu={(e) => {
          e.preventDefault();
          useUI.getState().closeContextMenu();
          useUI.getState().openQuickAdd({ x: e.clientX, y: e.clientY });
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
      <PaintModal />
      <Viewer3DModal />
      {promptsOpen && <PromptLibrary />}
      {galleryOpen && <Gallery />}
      </div>
    </div>
  );
}

export function App() {
  return (
    <ReactFlowProvider>
      {/* Reference display filters: grayscale = equal-weight average; luminance =
          Rec.709 perceptual weighting. (CSS grayscale() already uses Rec.709, so
          we roll our own average to keep the two modes visibly distinct.) */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
        <filter id="cv-grayscale" colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values="0.3333 0.3333 0.3333 0 0  0.3333 0.3333 0.3333 0 0  0.3333 0.3333 0.3333 0 0  0 0 0 1 0"
          />
        </filter>
        <filter id="cv-luminance" colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values="0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0 0 0 1 0"
          />
        </filter>
      </svg>
      <Canvas />
    </ReactFlowProvider>
  );
}
