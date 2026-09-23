// Home: projetos salvos, modelos (embutido + criados no editor), importar/baixar .json e pré-visualização
"use strict";

/* ============================================================
   Projetos — a home guarda vários apartamentos pintados,
   cada um com seu próprio conjunto de cores salvas.
   ============================================================ */
const IDX_KEY='apto-projetos-v1';
const LEGACY_KEY='apto-cores-v3';
const ICONE_MODELO='<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 30 L32 12 L56 30" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 26 V52 H50 V26" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M27 52 V38 H37 V52" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
let projetos = [];
let projetoAtivo = null;

function chaveDados(id){ return 'apto-projeto-dados-'+id; }
function dadosPadrao(){
  return {
    colors: WALLS.map((w,i)=>[ wallInfo[i].sides[0]>=0?BASE_IN:BASE_OUT, wallInfo[i].sides[1]>=0?BASE_IN:BASE_OUT ]),
    lower: WALLS.map(()=>[null,null]),
    hMeia:1.05, floorId:'porcBranco', showLabels:true, recentes:[], esquemas:[]
  };
}
function carregarIndice(){
  try{ const raw=localStorage.getItem(IDX_KEY); if(raw){ const d=JSON.parse(raw); if(Array.isArray(d.projects)) return d.projects; } }catch(_){}
  return [];
}
function salvarIndice(){ try{ localStorage.setItem(IDX_KEY, JSON.stringify({projects:projetos})); }catch(_){} }
function migrarLegado(){
  if(localStorage.getItem(IDX_KEY)) return;
  const legado = localStorage.getItem(LEGACY_KEY);
  if(!legado) return;
  const id = 'p_'+Date.now().toString(36);
  try{ localStorage.setItem(chaveDados(id), legado); }catch(_){}
  const agora = new Date().toISOString();
  projetos = [{ id, nome:'Apartamento', modelo:'apartamento', criadoEm:agora, atualizadoEm:agora }];
  salvarIndice();
  localStorage.removeItem(LEGACY_KEY);
}
function gerarNomeProjeto(base='Apartamento'){
  const usados=new Set(projetos.map(p=>p.nome));
  if(!usados.has(base)) return base;
  let n=2; while(usados.has(base+' '+n)) n++;
  return base+' '+n;
}
function dadosDoProjeto(id){
  try{ const raw=localStorage.getItem(chaveDados(id)); if(raw) return JSON.parse(raw); }catch(_){}
  return null;
}
function formatarQuando(iso){
  const d=new Date(iso), min=Math.floor((Date.now()-d.getTime())/60000);
  if(min<1) return 'agora';
  if(min<60) return 'há '+min+' min';
  const hr=Math.floor(min/60); if(hr<24) return 'há '+hr+' h';
  const dias=Math.floor(hr/24); if(dias<7) return 'há '+dias+(dias===1?' dia':' dias');
  return d.toLocaleDateString('pt-BR');
}

function criarProjeto(modeloId){
  const modelo=modeloPorId(modeloId); if(!modelo) return;
  const id='p_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  const agora=new Date().toISOString();
  projetos.unshift({ id, nome:gerarNomeProjeto(modelo.nome), modelo:modeloId, criadoEm:agora, atualizadoEm:agora });
  salvarIndice();
  abrirProjeto(id);
  salvarProjetoAtivo();
}
function excluirProjeto(id){
  projetos = projetos.filter(p=>p.id!==id);
  salvarIndice();
  try{ localStorage.removeItem(chaveDados(id)); }catch(_){}
  renderProjetos();
}
function renomearProjeto(id, novoNome){
  const p=projetos.find(x=>x.id===id); if(!p) return;
  const nome=novoNome.trim();
  if(nome) p.nome=nome;
  p.atualizadoEm=new Date().toISOString();
  salvarIndice();
  if(id===projetoAtivo) document.getElementById('projTitulo').textContent=p.nome;
}
function save(){ salvarProjetoAtivo(); }
function salvarProjetoAtivo(){
  if(!projetoAtivo) return;
  try{ localStorage.setItem(chaveDados(projetoAtivo), JSON.stringify({colors,lower,hMeia,floorId,showLabels,recentes,esquemas})); }catch(_){}
  const p=projetos.find(x=>x.id===projetoAtivo);
  if(p){ p.atualizadoEm=new Date().toISOString(); salvarIndice(); }
}

function abrirProjeto(id){
  const proj = projetos.find(p=>p.id===id);
  if(!proj) return;
  const modelo = modeloPorId(proj.modelo);
  if(!modelo){ avisoHome('O modelo de “'+proj.nome+'” foi excluído — esse projeto não pode mais ser aberto.'); return; }
  previewAtivo = false;
  carregarModelo(modelo);
  projetoAtivo = id;
  prepararVisor(proj.nome, dadosDoProjeto(id));
}
function prepararVisor(titulo, d){
  const base=dadosPadrao();
  colors=base.colors; lower=base.lower; hMeia=base.hMeia; floorId=base.floorId;
  showLabels=true; recentes=[]; esquemas=[]; sel=null; hov=null;
  scopeRoom=false; faixa='toda'; cut=H;
  Object.assign(cam,HOME);
  undoStack.length=0;

  if(d){
    if(Array.isArray(d.colors)) d.colors.slice(0,WALLS.length).forEach((p,i)=>{ if(Array.isArray(p)&&p.length===2) colors[i]=p.slice(); });
    if(Array.isArray(d.lower)) d.lower.slice(0,WALLS.length).forEach((p,i)=>{ if(Array.isArray(p)&&p.length===2) lower[i]=p.slice(); });
    if(typeof d.hMeia==='number') hMeia=Math.min(2.20,Math.max(0.40,d.hMeia));
    if(typeof d.showLabels==='boolean') showLabels=d.showLabels;
    if(typeof d.floorId==='string' && PISOS[d.floorId]) floorId=d.floorId;
    if(Array.isArray(d.recentes)) recentes=d.recentes.filter(c=>/^#[0-9A-F]{6}$/i.test(c)).slice(0,MAX_RECENTES);
    if(Array.isArray(d.esquemas)) esquemas=d.esquemas.filter(e=>e&&Array.isArray(e.colors));
  }

  document.getElementById('projTitulo').textContent = titulo;
  document.getElementById('projSub').textContent = previewAtivo
    ? 'Pré-visualização do modelo — as cores pintadas aqui não são salvas.'
    : 'Clique numa parede e escolha a tinta.';
  document.getElementById('btnVoltarHome').textContent = previewAtivo ? '← Voltar ao editor' : '← Projetos';
  meiaR.value=hMeia; meiaV.textContent=hMeia.toFixed(2).replace('.',',')+' m';
  floorSel.value = PISOS[floorId] ? floorId : 'porcBranco';
  btnLabels.setAttribute('aria-pressed', String(showLabels));
  btnLabels.textContent = showLabels ? 'Ocultar nomes' : 'Mostrar nomes';
  setScope(false); setFaixa('toda');
  document.getElementById('btnUndo').disabled = true;
  document.getElementById('cut').value = H;
  document.getElementById('cutVal').textContent = H.toFixed(2).replace('.',',')+' m';

  renderFamilias(); renderPaleta(); syncFora();
  syncRecentes(); syncEsquemas(); restoreSwName();
  syncRooms(); syncSel(); syncCenterBtn();

  mostrarTela('app');
  render();
}
function irParaHome(){
  salvarProjetoAtivo();
  projetoAtivo = null;
  mostrarTela('home');
  renderModelos(); renderProjetos();
}

function renderModelos(){
  const grid=document.getElementById('modelosGrid');
  grid.innerHTML='';
  listaModelos().forEach(m=>{
    const card=document.createElement('div'); card.className='modelo-card';
    const prev=document.createElement('div'); prev.className='modelo-prev'; prev.innerHTML=miniaturaPlanta(m.planta);
    const nome=document.createElement('div'); nome.className='modelo-nome'; nome.textContent=m.nome;
    const info=document.createElement('div'); info.className='modelo-info mono';
    info.textContent=resumoModelo(m.planta.rooms)+(m.embutido ? '' : ' · '+m.planta.walls.length+' paredes');
    const usar=document.createElement('button'); usar.className='btn primary'; usar.type='button'; usar.textContent='Usar este modelo';
    usar.addEventListener('click',()=>criarProjeto(m.id));
    card.append(prev, nome, info, usar);
    if(!m.embutido){
      const acoes=document.createElement('div'); acoes.className='modelo-acoes';
      const baixar=document.createElement('button'); baixar.className='btn ghost'; baixar.type='button'; baixar.textContent='Baixar .json';
      baixar.addEventListener('click', async ()=>{
        const r=await baixarModelo(m.fonte);
        if(r==='falhou') avisoHome('Não deu para baixar o arquivo neste navegador.');
      });
      const del=document.createElement('button'); del.className='btn ghost btn-del'; del.type='button'; del.textContent='Excluir';
      del.setAttribute('aria-label','Excluir modelo '+m.nome);
      del.addEventListener('click',()=>excluirModelo(m.id));
      acoes.append(baixar, del);
      card.append(acoes);
    }
    grid.appendChild(card);
  });
  const novo=document.createElement('div'); novo.className='modelo-card modelo-novo';
  novo.innerHTML='<div class="modelo-prev" aria-hidden="true">+</div><div class="modelo-nome">Criar novo modelo</div>'
    + '<div class="modelo-info">Monte a planta da sua casa ou apê: pisos, paredes inteiras ou meia parede, portas e janelas.</div>';
  const abrir=document.createElement('button'); abrir.className='btn primary'; abrir.type='button';
  abrir.textContent = temRascunho() ? 'Continuar rascunho' : 'Abrir editor';
  abrir.addEventListener('click', abrirEditor);
  const importar=document.createElement('button'); importar.className='btn ghost'; importar.type='button'; importar.textContent='Importar .json';
  importar.addEventListener('click',()=>document.getElementById('importarModelo').click());
  novo.append(abrir, importar);
  grid.appendChild(novo);
}
function renderProjetos(){
  const grid=document.getElementById('projetosGrid'), vazio=document.getElementById('semProjetos');
  grid.innerHTML='';
  vazio.hidden = projetos.length>0;
  projetos.slice().sort((a,b)=>new Date(b.atualizadoEm)-new Date(a.atualizadoEm)).forEach(p=>{
    const card=document.createElement('div'); card.className='projeto-card';

    const chips=document.createElement('div'); chips.className='projeto-chips';
    const d=dadosDoProjeto(p.id);
    const cores = d && Array.isArray(d.colors) ? coresDoProjeto(d.colors) : [];
    (cores.length ? cores : [BASE_IN]).forEach(c=>{ const i=document.createElement('i'); i.style.background=c; chips.appendChild(i); });

    const nome=document.createElement('div'); nome.className='projeto-nome'; nome.textContent=p.nome;
    nome.title='Clique para renomear'; nome.tabIndex=0; nome.setAttribute('role','button');
    const editar=()=>{
      const input=document.createElement('input');
      input.className='projeto-nome-edit'; input.value=p.nome; input.setAttribute('aria-label','Renomear projeto');
      nome.replaceWith(input); input.focus(); input.select();
      const confirmar=()=>{ renomearProjeto(p.id, input.value); renderProjetos(); };
      input.addEventListener('blur', confirmar);
      input.addEventListener('keydown', e=>{
        if(e.key==='Enter'){ e.preventDefault(); input.blur(); }
        if(e.key==='Escape'){ input.value=p.nome; input.blur(); }
      });
    };
    nome.addEventListener('click', editar);
    nome.addEventListener('keydown', e=>{ if(e.key==='Enter') editar(); });

    const sub=document.createElement('div'); sub.className='projeto-sub mono';
    const mod=modeloPorId(p.modelo);
    sub.textContent = (mod ? mod.nome : 'modelo excluído') + ' · editado ' + formatarQuando(p.atualizadoEm);

    const meta=document.createElement('div'); meta.append(nome, sub);

    const acoes=document.createElement('div'); acoes.className='projeto-actions';
    const abrir=document.createElement('button'); abrir.className='btn primary'; abrir.type='button'; abrir.textContent='Abrir';
    abrir.addEventListener('click',()=>abrirProjeto(p.id));
    const del=document.createElement('button'); del.className='btn ghost btn-del'; del.type='button'; del.textContent='Excluir';
    del.setAttribute('aria-label','Excluir '+p.nome);
    del.addEventListener('click',()=>{
      if(confirm('Excluir "'+p.nome+'"? As cores desse projeto se perdem.')) excluirProjeto(p.id);
    });
    acoes.append(abrir, del);

    card.append(chips, meta, acoes);
    grid.appendChild(card);
  });
}

function coresDoProjeto(cs){
  const conta={};
  cs.forEach(par=>{ if(Array.isArray(par)) par.forEach(c=>{ if(typeof c==='string' && c!==BASE_OUT) conta[c]=(conta[c]||0)+1; }); });
  return Object.keys(conta).sort((a,b)=>conta[b]-conta[a]).slice(0,6);
}

/* ============================================================
   Modelos — a planta embutida + as montadas no editor.
   Formato do arquivo (.json): { formato:'webape-modelo', versao:1,
   id, nome, pisos:[{id,nome,x,z,w,d,molhado}],
   paredes:[{id,x1,z1,x2,z2,altura:'inteira'|'meia',
             aberturas:[{id,tipo:'porta'|'janela',pos,largura}]}] }
   Medidas em metros; pos = distância do início (x1,z1) da parede.
   ============================================================ */
const MODELOS_KEY='apto-modelos-v1';
const RASCUNHO_KEY='apto-modelo-rascunho';
const ALT_MEIA=1.10;
let modelosCustom=[];
let modeloCarregadoId='apartamento';
let previewAtivo=false;
const cachePlantas=new Map();

function carregarModelosCustom(){
  try{
    const d=JSON.parse(localStorage.getItem(MODELOS_KEY)||'[]');
    if(Array.isArray(d)) return d.map(normalizarModelo).filter(Boolean);
  }catch(_){}
  return [];
}
function salvarModelosCustom(){ try{ localStorage.setItem(MODELOS_KEY, JSON.stringify(modelosCustom)); }catch(_){} }
function modeloParaPlanta(m){
  return {
    rooms: m.pisos.map(p=>R(p.nome||'Cômodo', [[p.x,p.z,p.x+p.w,p.z+p.d]], !!p.molhado)),
    walls: m.paredes.map(w=>W(w.x1,w.z1,w.x2,w.z2,{
      h: w.altura==='meia' ? ALT_MEIA : H,
      gaps: (w.aberturas||[]).map(a=>[a.pos, a.pos+a.largura, a.tipo==='porta'?'d':'w'])
    }))
  };
}
function listaModelos(){
  const lista=[{ id:'apartamento', nome:'Apartamento', planta:PLANTA_APTO, embutido:true }];
  modelosCustom.forEach(m=>{
    if(!cachePlantas.has(m.id)) cachePlantas.set(m.id, modeloParaPlanta(m));
    lista.push({ id:m.id, nome:m.nome, planta:cachePlantas.get(m.id), fonte:m });
  });
  return lista;
}
function modeloPorId(id){ return listaModelos().find(m=>m.id===id) || null; }
function carregarModelo(modelo, forcar){
  if(!forcar && modeloCarregadoId===modelo.id) return;
  modeloCarregadoId=modelo.id;
  WALLS=modelo.planta.walls; ROOMS=modelo.planta.rooms;
  construirGeometria(); enviarBuffers(); calcularLimites();
  construirEtiquetas(); construirComodos();
  document.getElementById('areaBadge').textContent=resumoModelo();
  sel=null; hov=null;
}

function mostrarTela(t){
  document.getElementById('home').hidden = t!=='home';
  document.querySelector('.app').hidden = t!=='app';
  document.getElementById('editor').hidden = t!=='editor';
}

let avisoTimer=null;
function avisoHome(msg){
  const el=document.getElementById('homeAviso');
  el.textContent=msg; el.hidden=false;
  clearTimeout(avisoTimer); avisoTimer=setTimeout(()=>{ el.hidden=true; }, 9000);
}

function miniaturaPlanta(planta){
  const b={x0:Infinity,x1:-Infinity,z0:Infinity,z1:-Infinity};
  planta.rooms.forEach(r=>r.rects.forEach(q=>{ b.x0=Math.min(b.x0,q[0]); b.x1=Math.max(b.x1,q[2]); b.z0=Math.min(b.z0,q[1]); b.z1=Math.max(b.z1,q[3]); }));
  planta.walls.forEach(w=>{ b.x0=Math.min(b.x0,w.x1,w.x2); b.x1=Math.max(b.x1,w.x1,w.x2); b.z0=Math.min(b.z0,w.z1,w.z2); b.z1=Math.max(b.z1,w.z1,w.z2); });
  if(!isFinite(b.x0)) return ICONE_MODELO;
  const n=v=>Number(v).toFixed(3), pad=0.3;
  let s='<svg class="mini" viewBox="'+n(b.x0-pad)+' '+n(b.z0-pad)+' '+n(b.x1-b.x0+2*pad)+' '+n(b.z1-b.z0+2*pad)+'" preserveAspectRatio="xMidYMid meet" aria-hidden="true">';
  planta.rooms.forEach(r=>r.rects.forEach(q=>{
    s+='<rect class="mini-piso'+(r.wet?' molhado':'')+'" x="'+n(q[0])+'" y="'+n(q[1])+'" width="'+n(q[2]-q[0])+'" height="'+n(q[3]-q[1])+'"/>';
  }));
  planta.walls.forEach(w=>{
    s+='<line class="mini-parede'+(w.h<H?' meia':'')+'" x1="'+n(w.x1)+'" y1="'+n(w.z1)+'" x2="'+n(w.x2)+'" y2="'+n(w.z2)+'"/>';
  });
  return s+'</svg>';
}

function nomeArquivo(nome){
  return (String(nome||'modelo').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase()
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'modelo');
}
async function baixarModelo(m){
  const dados=JSON.stringify(m, null, 2);
  const filename=nomeArquivo(m.nome)+'.webape.json';
  let dl=null;
  if(window.claude && typeof window.claude.use==='function'){
    try{ dl=await window.claude.use('downloads'); }catch(_){ dl=null; }
  }
  if(dl){
    try{ await dl.save({ filename, data:dados }); return 'salvo'; }
    catch(e){ return (e && e.code==='declined') ? 'recusado' : 'falhou'; }
  }
  try{
    const url=URL.createObjectURL(new Blob([dados], {type:'application/json'}));
    const a=document.createElement('a'); a.href=url; a.download=filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 4000);
    return 'salvo';
  }catch(_){ return 'falhou'; }
}

function excluirModelo(id){
  const m=modelosCustom.find(x=>x.id===id); if(!m) return;
  const n=projetos.filter(p=>p.modelo===id).length;
  if(n){ avisoHome('“'+m.nome+'” é usado por '+n+(n===1?' projeto':' projetos')+'. Exclua '+(n===1?'o projeto':'os projetos')+' antes de excluir o modelo.'); return; }
  if(!confirm('Excluir o modelo "'+m.nome+'"? Se quiser guardar, baixe o .json antes.')) return;
  modelosCustom=modelosCustom.filter(x=>x.id!==id); cachePlantas.delete(id);
  salvarModelosCustom(); renderModelos();
}

document.getElementById('importarModelo').addEventListener('change', async e=>{
  const f=e.target.files && e.target.files[0]; e.target.value='';
  if(!f) return;
  let bruto;
  try{ bruto=JSON.parse(await f.text()); }catch(_){ avisoHome('Esse arquivo não é um JSON válido.'); return; }
  if(!bruto || bruto.formato!=='webape-modelo'){ avisoHome('Esse arquivo não é um modelo do WebApê (.webape.json).'); return; }
  const m=normalizarModelo(bruto);
  if(!m){ avisoHome('O arquivo está incompleto: algum piso ou parede não tem medidas válidas.'); return; }
  const v=validarModelo(m);
  if(!v.ok){ avisoHome('O modelo tem um problema e não foi importado: '+v.msg); return; }
  if(!m.pisos.length || !m.paredes.length){ avisoHome('O modelo precisa ter pelo menos um piso e uma parede.'); return; }
  if(m.id==='apartamento' || modelosCustom.some(x=>x.id===m.id)) m.id=uid('m');
  modelosCustom.push(m); salvarModelosCustom(); renderModelos();
  avisoHome('“'+m.nome+'” importado — já aparece em Novo projeto.');
});

/* ---------------- pré-visualização 3D a partir do editor ---------------- */
function abrirPreview(m){
  previewAtivo=true; projetoAtivo=null;
  carregarModelo({ id:'__preview__', nome:m.nome, planta:modeloParaPlanta(m) }, true);
  prepararVisor('Pré-visualização · '+(m.nome||'modelo'), null);
}
function voltarDoPreview(){
  previewAtivo=false;
  mostrarTela('editor');
  edRender(); edPainel();
}
