import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import ReactFlow, { Background, Controls, Handle, Position, addEdge, useNodesState, useEdgesState, ReactFlowProvider } from 'reactflow';
import htm from 'htm';
const html = htm.bind(React.createElement);

let nextId = 100;
const uid = (p='n') => `${p}${nextId++}`;

function PromptNode({ data }) {
  return html`<div className="node prompt"><${Handle} type="source" position=${Position.Right} id="text" className="h-text" />
    <div className="head">Prompt</div><div className="body">${data.text || 'Double-click to edit in sidebar'}</div></div>`;
}
function ImageNode({ data }) {
  return html`<div className="node image"><${Handle} type="source" position=${Position.Right} id="image" className="h-image" />
    <div className="head">Image</div><div className="body">${data.filename || 'No image'} </div></div>`;
}
function WorkflowNode({ data }) {
  return html`<div className="node workflow">
    <${Handle} type="target" position=${Position.Left} id="prompt" style=${{top:16}} className="h-text" />
    <${Handle} type="target" position=${Position.Left} id="image" style=${{top:36}} className="h-image" />
    <${Handle} type="source" position=${Position.Right} id="workflow" className="h-workflow" />
    <div className="head">Workflow</div><div className="body">${data.templateName || 'Select template'}</div></div>`;
}
function GenerateNode({ data }) {
  return html`<div className="node generate"><${Handle} type="target" position=${Position.Left} id="workflow" className="h-workflow" />
    <div className="head">Generate</div><div className="body">${data.status || 'Ready'}</div></div>`;
}

const nodeTypes = { prompt: PromptNode, image: ImageNode, workflow: WorkflowNode, generate: GenerateNode };

const outType = { prompt: 'text', image: 'image', workflow: 'workflow' };
const inType = {
  workflow: { prompt: 'text', image: 'image' },
  generate: { workflow: 'workflow' }
};

function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([
    { id:'p1', type:'prompt', position:{x:60,y:120}, data:{ text:'cinematic forest at sunrise' } },
    { id:'w1', type:'workflow', position:{x:380,y:120}, data:{ templateId:'txt2img', templateName:'txt2img' } },
    { id:'g1', type:'generate', position:{x:700,y:120}, data:{ status:'Ready' } },
  ]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [log, setLog] = useState('');

  const nodesById = useMemo(() => Object.fromEntries(nodes.map(n => [n.id, n])), [nodes]);
  const selected = nodes.find(n => n.id === selectedId) || null;

  useEffect(() => { (async()=>{
    try {
      const r = await fetch('/api/templates');
      const j = await r.json();
      const arr = j.ok ? (j.data || []) : (Array.isArray(j) ? j : []);
      setTemplates(arr);
    } catch {}
  })(); }, []);

  const isValidConnection = useCallback((c) => {
    const s = nodesById[c.source], t = nodesById[c.target]; if (!s||!t) return false;
    const ot = outType[s.type], et = inType[t.type]?.[c.targetHandle||''];
    if (!ot || !et || ot !== et) return false;
    if (edges.some(e => e.target===c.target && e.targetHandle===c.targetHandle)) return false;
    return true;
  }, [nodesById, edges]);

  const onConnect = useCallback((params) => {
    if (!isValidConnection(params)) return;
    setEdges(eds => addEdge({ ...params, animated:true, style:{stroke:'#6ea8fe'} }, eds));
  }, [isValidConnection, setEdges]);

  const addNode = useCallback((type) => {
    const n = { id: uid(type[0]), type, position:{x:120+Math.random()*300,y:220+Math.random()*220}, data:{} };
    if (type==='prompt') n.data.text='new prompt';
    if (type==='workflow') n.data={templateId:'txt2img', templateName:'txt2img'};
    if (type==='generate') n.data={status:'Ready'};
    setNodes(nds => [...nds, n]);
  }, [setNodes]);

  const updateSelected = useCallback((patch)=>{
    if (!selectedId) return;
    setNodes(nds => nds.map(n => n.id===selectedId ? ({...n, data:{...n.data, ...patch}}) : n));
  }, [selectedId, setNodes]);

  const runGenerate = useCallback(async()=>{
    const gen = nodes.find(n=>n.type==='generate');
    if (!gen) return;
    const edgeWG = edges.find(e=>e.target===gen.id && e.targetHandle==='workflow');
    if (!edgeWG) { setLog('Generate not connected to workflow'); return; }
    const wf = nodesById[edgeWG.source];
    const promptEdge = edges.find(e=>e.target===wf.id && e.targetHandle==='prompt');
    const imageEdge = edges.find(e=>e.target===wf.id && e.targetHandle==='image');
    const promptNode = promptEdge ? nodesById[promptEdge.source] : null;
    const imageNode = imageEdge ? nodesById[imageEdge.source] : null;

    setNodes(nds => nds.map(n => n.id===gen.id ? ({...n, data:{...n.data, status:'Running...'}}) : n));
    try {
      const body = {
        template: wf.data.templateId || 'txt2img',
        params: { prompt: promptNode?.data?.text || 'a scenic landscape' },
        images: imageNode?.data?.dataUrl ? { image: imageNode.data.dataUrl } : {},
      };
      const r = await fetch('/api/workflow/run', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      const j = await r.json();
      const data = j.ok ? j.data : j;
      setLog(JSON.stringify(data, null, 2));
      setNodes(nds => nds.map(n => n.id===gen.id ? ({...n, data:{...n.data, status:'Done'}}) : n));
    } catch (e) {
      setLog(String(e));
      setNodes(nds => nds.map(n => n.id===gen.id ? ({...n, data:{...n.data, status:'Error'}}) : n));
    }
  }, [nodes, edges, nodesById, setNodes]);

  return html`<div className="layout">
    <div>
      <${ReactFlow}
        nodes=${nodes} edges=${edges} nodeTypes=${nodeTypes}
        onNodesChange=${onNodesChange} onEdgesChange=${onEdgesChange}
        onConnect=${onConnect} isValidConnection=${isValidConnection}
        onNodeClick=${(e,n)=>setSelectedId(n.id)} onPaneClick=${()=>setSelectedId(null)}
        fitView deleteKeyCode=${['Delete','Backspace']}
      >
        <${Controls} />
        <${Background} gap=${20} color="#2e3550" />
      </${ReactFlow}>
    </div>
    <div className="sidebar">
      <div className="row">
        <button className="btn" onClick=${()=>addNode('prompt')}>+ Prompt</button>
        <button className="btn" onClick=${()=>addNode('image')}>+ Image</button>
        <button className="btn" onClick=${()=>addNode('workflow')}>+ Workflow</button>
        <button className="btn" onClick=${()=>addNode('generate')}>+ Generate</button>
      </div>
      <div className="row"><button className="btn" onClick=${runGenerate}>Run Generate</button></div>

      ${selected ? html`<h3 style=${{margin:'6px 0'}}>Selected: ${selected.type}</h3>
        ${selected.type==='prompt' ? html`<textarea rows="4" value=${selected.data.text||''} onChange=${e=>updateSelected({text:e.target.value})}></textarea>` : null}
        ${selected.type==='workflow' ? html`<select value=${selected.data.templateId||''} onChange=${e=>{ const t=templates.find(x=>x.id===e.target.value); updateSelected({templateId:e.target.value, templateName:t?.name||e.target.value}); }}>
          ${templates.map(t=>html`<option value=${t.id}>${t.name||t.id}</option>`)}
        </select>` : null}
        ${selected.type==='image' ? html`<input type="file" accept="image/*" onChange=${async e=>{const f=e.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=()=>updateSelected({filename:f.name,dataUrl:r.result}); r.readAsDataURL(f);}} />` : null}
      ` : html`<div>Select a node</div>`}

      <h3 style=${{margin:'10px 0 6px'}}>Log</h3>
      <div className="log">${log || 'No run yet'}</div>
    </div>
  </div>`;
}

createRoot(document.getElementById('root')).render(html`<${ReactFlowProvider}><${App} /></${ReactFlowProvider}>`);
