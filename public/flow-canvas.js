import React, { useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import ReactFlow, { Background, Controls, Handle, Position, addEdge, useNodesState, useEdgesState, ReactFlowProvider } from 'reactflow';
import htm from 'htm';
const html = htm.bind(React.createElement);

const VALID = {
  prompt: { out: 'text' },
  workflow: { in: { prompt: 'text', image: 'image' }, out: 'workflow' },
  generate: { in: { workflow: 'workflow' } }
};

function PromptNode() {
  return html`<div className="node prompt">
    <${Handle} type="source" position=${Position.Right} id="text" className="h-text" />
    <div className="head">Prompt</div><div className="body">Outputs text</div>
  </div>`;
}

function WorkflowNode() {
  return html`<div className="node workflow">
    <${Handle} type="target" position=${Position.Left} id="prompt" style=${{top:16}} className="h-text" />
    <${Handle} type="target" position=${Position.Left} id="image" style=${{top:36}} className="h-image" />
    <${Handle} type="source" position=${Position.Right} id="workflow" className="h-workflow" />
    <div className="head">Workflow</div><div className="body">Inputs: prompt,image · Output: workflow</div>
  </div>`;
}

function GenerateNode() {
  return html`<div className="node generate">
    <${Handle} type="target" position=${Position.Left} id="workflow" className="h-workflow" />
    <div className="head">Generate</div><div className="body">Input: workflow</div>
  </div>`;
}

const nodeTypes = { prompt: PromptNode, workflow: WorkflowNode, generate: GenerateNode };

function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([
    { id: 'p1', type: 'prompt', position: { x: 80, y: 120 }, data: {} },
    { id: 'w1', type: 'workflow', position: { x: 380, y: 120 }, data: {} },
    { id: 'g1', type: 'generate', position: { x: 700, y: 120 }, data: {} }
  ]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const nodesById = useMemo(() => Object.fromEntries(nodes.map(n => [n.id, n])), [nodes]);

  const isValidConnection = useCallback((c) => {
    const src = nodesById[c.source];
    const tgt = nodesById[c.target];
    if (!src || !tgt) return false;
    const outType = VALID[src.type]?.out;
    const expected = VALID[tgt.type]?.in?.[c.targetHandle || ''];
    if (!outType || !expected) return false;
    const duplicateTargetHandle = edges.some(e => e.target === c.target && e.targetHandle === c.targetHandle);
    if (duplicateTargetHandle) return false;
    return outType === expected;
  }, [nodesById, edges]);

  const onConnect = useCallback((params) => {
    if (!isValidConnection(params)) return;
    setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#6ea8fe' } }, eds));
  }, [isValidConnection, setEdges]);

  return html`
    <div className="topbar">React Flow spike: prompt → workflow → generate wiring validation</div>
    <${ReactFlow}
      nodes=${nodes}
      edges=${edges}
      onNodesChange=${onNodesChange}
      onEdgesChange=${onEdgesChange}
      onConnect=${onConnect}
      isValidConnection=${isValidConnection}
      nodeTypes=${nodeTypes}
      fitView
      deleteKeyCode=${['Delete','Backspace']}
      multiSelectionKeyCode="Shift"
      selectionKeyCode="Shift"
      panOnScroll=${true}
    >
      <${Controls} />
      <${Background} gap=${20} color="#2e3550" />
    </${ReactFlow}>
  `;
}

createRoot(document.getElementById('root')).render(html`<${ReactFlowProvider}><${App} /></${ReactFlowProvider}>`);
