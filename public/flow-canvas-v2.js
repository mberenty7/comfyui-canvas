import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import ReactFlow, { Background, Controls, Handle, Position, addEdge, useNodesState, useEdgesState, ReactFlowProvider, useReactFlow } from 'reactflow';
import htm from 'htm';
const html = htm.bind(React.createElement);
let nextId = 100; const uid = (p='n') => `${p}${nextId++}`;
const nodeTypes = {
  prompt: ({data}) => html`<div className="node prompt"><${Handle} type="source" position=${Position.Right} id="text" className="h-text" /><div className="head">Prompt</div><div className="body">${data.text || 'Prompt text'}</div></div>`,
  image: ({data}) => html`<div className="node image"><${Handle} type="source" position=${Position.Right} id="image" className="h-image" /><div className="head">Image</div><div className="body">${data.filename || 'No image'}</div></div>`,
  workflow: ({data}) => html`<div className="node workflow"><${Handle} type="target" position=${Position.Left} id="prompt" style=${{top:16}} className="h-text" /><${Handle} type="target" position=${Position.Left} id="image" style=${{top:36}} className="h-image" /><${Handle} type="source" position=${Position.Right} id="workflow" className="h-workflow" /><div className="head">Workflow</div><div className="body">${data.templateName || 'Select template'}</div></div>`,
  generate: ({data}) => html`<div className="node generate"><${Handle} type="target" position=${Position.Left} id="workflow" className="h-workflow" /><div className="head">Generate</div><div className="body">${data.status || 'Ready'}</div></div>`,
};
const outType = { prompt: 'text', image: 'image', workflow: 'workflow' };
const inType = { workflow: { prompt: 'text', image: 'image' }, generate: { workflow: 'workflow' } };

function InnerApp() {
  const rf = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([
    { id:'p1', type:'prompt', position:{x:60,y:120}, data:{ text:'cinematic forest at sunrise' } },
    { id:'w1', type:'workflow', position:{x:380,y:120}, data:{ templateId:'txt2img', templateName:'txt2img' } },
    { id:'g1', type:'generate', position:{x:700,y:120}, data:{ status:'Ready' } },
  ]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [zoom, setZoom] = useState(100);
  const [log, setLog] = useState('');
  const [showLog, setShowLog] = useState(false);
  const [showImageLib, setShowImageLib] = useState(false);
  const [showPromptLib, setShowPromptLib] = useState(false);
  const [propWidth, setPropWidth] = useState(() => Number(localStorage.getItem('flow-v2-prop-width')||320));
  const [resizing, setResizing] = useState(false);
  const [menu, setMenu] = useState(null);

  const nodesById = useMemo(() => Object.fromEntries(nodes.map(n => [n.id, n])), [nodes]);
  const selected = nodes.find(n => n.id === selectedId) || null;

  useEffect(() => { (async()=>{ try { const r=await fetch('/api/templates'); const j=await r.json(); setTemplates(j.ok?(j.data||[]):(Array.isArray(j)?j:[])); } catch {} })(); }, []);
  useEffect(() => {
    if (!resizing) return;
    const onMove = (e) => {
      const w = Math.max(240, Math.min(520, window.innerWidth - e.clientX));
      setPropWidth(w);
    };
    const onUp = () => {
      setResizing(false);
      localStorage.setItem('flow-v2-prop-width', String(propWidth));
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp, { once: true });
    return () => { window.removeEventListener('mousemove', onMove); };
  }, [resizing, propWidth]);

  useEffect(()=>{const onKey=(e)=>{ if(e.key==='Tab' && !e.target.closest('input,textarea,select')){ e.preventDefault(); setMenu({x:window.innerWidth/2-100,y:80}); }}; window.addEventListener('keydown',onKey); return ()=>window.removeEventListener('keydown',onKey);},[]);

  const isValidConnection = useCallback((c)=>{ const s=nodesById[c.source], t=nodesById[c.target]; if(!s||!t) return false; const ot=outType[s.type], et=inType[t.type]?.[c.targetHandle||'']; if(!ot||!et||ot!==et) return false; if(edges.some(e=>e.target===c.target&&e.targetHandle===c.targetHandle)) return false; return true; },[nodesById,edges]);
  const onConnect = useCallback((p)=>{ if(!isValidConnection(p)) return; setEdges(eds=>addEdge({...p,animated:true,style:{stroke:'#9ed6ff'}},eds)); },[isValidConnection,setEdges]);
  const addNode = useCallback((type,pos)=>{ const c=pos?rf.screenToFlowPosition(pos):rf.screenToFlowPosition({x:280,y:220}); const n={id:uid(type[0]),type,position:c,data:{}}; if(type==='prompt')n.data.text='new prompt'; if(type==='workflow')n.data={templateId:'txt2img',templateName:'txt2img'}; if(type==='generate')n.data={status:'Ready'}; setNodes(nds=>[...nds,n]); setMenu(null); },[rf,setNodes]);
  const updateSelected = useCallback((patch)=>{ if(!selectedId) return; setNodes(nds=>nds.map(n=>n.id===selectedId?({...n,data:{...n.data,...patch}}):n)); },[selectedId,setNodes]);

  const runGenerate = useCallback(async()=>{
    const gen = nodes.find(n=>n.type==='generate'); if(!gen){setLog('No generate node'); setShowLog(true); return;}
    const edgeWG = edges.find(e=>e.target===gen.id&&e.targetHandle==='workflow'); if(!edgeWG){setLog('Generate not connected to workflow'); setShowLog(true); return;}
    const wf = nodesById[edgeWG.source]; const promptEdge=edges.find(e=>e.target===wf.id&&e.targetHandle==='prompt'); const imageEdge=edges.find(e=>e.target===wf.id&&e.targetHandle==='image');
    const promptNode=promptEdge?nodesById[promptEdge.source]:null; const imageNode=imageEdge?nodesById[imageEdge.source]:null;
    setNodes(nds=>nds.map(n=>n.id===gen.id?({...n,data:{...n.data,status:'Running...'}}):n));
    try {
      const body={template:wf.data.templateId||'txt2img',params:{prompt:promptNode?.data?.text||'a scenic landscape'},images:imageNode?.data?.dataUrl?{image:imageNode.data.dataUrl}:{}};
      const r=await fetch('/api/workflow/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const j=await r.json(); const d=j.ok?j.data:j; setLog(JSON.stringify(d,null,2)); setShowLog(true);
      setNodes(nds=>nds.map(n=>n.id===gen.id?({...n,data:{...n.data,status:'Done'}}):n));
    } catch(e){ setLog(String(e)); setShowLog(true); setNodes(nds=>nds.map(n=>n.id===gen.id?({...n,data:{...n.data,status:'Error'}}):n)); }
  },[nodes,edges,nodesById,setNodes]);

  return html`<div className="page">
    <div className="toolbar">
      <button className="btn" onClick=${()=>setMenu({x:12,y:48})}>Add Node</button>
      <button className="btn" onClick=${()=>localStorage.setItem('flow-v2-state',JSON.stringify({nodes,edges,nextId}))}>Save</button>
      <button className="btn" onClick=${()=>{const s=localStorage.getItem('flow-v2-state'); if(!s)return; const d=JSON.parse(s); setNodes(d.nodes||[]); setEdges(d.edges||[]); if(d.nextId) nextId=d.nextId;}}>Load</button>
      <button className="btn" onClick=${()=>alert('Settings coming in P2')}>Settings</button>
      <span className="sp"></span>
      <button className="btn" onClick=${()=>setShowLog(v=>!v)}>Log</button>
      <button className="btn" onClick=${()=>{setShowImageLib(v=>!v); setShowPromptLib(false);}}>Image Library</button>
      <button className="btn" onClick=${()=>{setShowPromptLib(v=>!v); setShowImageLib(false);}}>Prompt Library</button>
      <span className="muted">Zoom ${zoom}%</span>
    </div>
    <div className="layout" style=${{ gridTemplateColumns: selected ? `1fr ${propWidth}px` : "1fr 0px" }}>
      <div className=${'leftbar ' + ((!showImageLib && !showPromptLib) ? 'hidden' : '')}>
        ${showImageLib ? html`<h3>Image Library</h3><div className="muted">Library panel scaffold (P2: wire to /api/gallery)</div>` : null}
        ${showPromptLib ? html`<h3>Prompt Library</h3><div className="muted">Library panel scaffold (P2: wire to /api/prompts)</div>` : null}
      </div>
      <div>
        <${ReactFlow} nodes=${nodes} edges=${edges} nodeTypes=${nodeTypes}
          onNodesChange=${onNodesChange} onEdgesChange=${onEdgesChange}
          onConnect=${onConnect} isValidConnection=${isValidConnection}
          onNodeClick=${(e,n)=>setSelectedId(n.id)} onPaneClick=${()=>setSelectedId(null)}
          onPaneContextMenu=${(e)=>{e.preventDefault(); setMenu({x:e.clientX,y:e.clientY});}}
          onMove=${()=>setZoom(Math.round(rf.getZoom()*100))}
          fitView deleteKeyCode=${['Delete','Backspace']}
        >
          <${Controls} />
          <${Background} gap=${20} color="#3a4f43" />
        </${ReactFlow}>
      </div>
      <div className=${'sidebar ' + ((!selected) ? 'hidden' : '')}>
        ${selected ? html`<h3 style=${{margin:'6px 0'}}>Selected: ${selected.type}</h3>
          ${selected.type==='prompt' ? html`<textarea rows="4" value=${selected.data.text||''} onChange=${e=>updateSelected({text:e.target.value})}></textarea>` : null}
          ${selected.type==='workflow' ? html`<select value=${selected.data.templateId||''} onChange=${e=>{const t=templates.find(x=>x.id===e.target.value); updateSelected({templateId:e.target.value,templateName:t?.name||e.target.value});}}>${templates.map(t=>html`<option value=${t.id}>${t.name||t.id}</option>`)}</select>` : null}
          ${selected.type==='image' ? html`<input type="file" accept="image/*" onChange=${e=>{const f=e.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=()=>updateSelected({filename:f.name,dataUrl:r.result}); r.readAsDataURL(f);}} />` : null}
        ` : null}
      </div>
    </div>

    ${menu ? html`<div className="menu" style=${{left:menu.x+'px',top:menu.y+'px'}}>
      <button onClick=${()=>addNode('prompt',menu)}>Prompt</button>
      <button onClick=${()=>addNode('image',menu)}>Image</button>
      <button onClick=${()=>addNode('workflow',menu)}>Workflow</button>
      <button onClick=${()=>addNode('generate',menu)}>Generate</button>
      <button onClick=${()=>setMenu(null)}>Close</button>
    </div>` : null}

    ${showLog ? html`<div className="floating-log"><div className="tabs"><div className="tab active">Run Log</div><button className="btn" onClick=${()=>setShowLog(false)}>Close</button></div><div className="log">${log||'No run yet'}</div></div>`:null}
  </div>`;
}

createRoot(document.getElementById('root')).render(html`<${ReactFlowProvider}><${InnerApp} /></${ReactFlowProvider}>`);
