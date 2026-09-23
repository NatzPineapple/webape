// Editor de modelos: planta em SVG, pisos, paredes, portas/janelas, regras e travas
"use strict";

/* ============================================================
   Editor de modelos
   ============================================================ */
const GRADE=0.05, EPS=0.001, PAREDE_T=0.15;
const LARG_PORTA=0.80, LARG_JANELA=1.20, LARG_MIN=0.40, LADO_MIN=0.50;
const MAX_PAREDES=250, MAX_PISOS=60;
const NOMES_MOLHADOS=/banh|lavab|cozinh|lavand|servi|varand|gourmet/i;
const ED={ m:null, tool:'selecionar', sel:null, view:{s:40,ox:0,oy:0},
           undo:[], redo:[], drag:null, pan:null, invalido:null, msg:null, msgTimer:null };
const edSvg=document.getElementById('edSvg'), edWrap=document.getElementById('edCanvasWrap'),
      edPanel=document.getElementById('edPanel'), edStatus=document.getElementById('edStatus'),
      edNome=document.getElementById('edNome');

function uid(p){ return p+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
const r3=v=>Math.round(v*1000)/1000;
const grade=v=>r3(Math.round(v/GRADE)*GRADE);
const fmt=v=>(Math.round(v*100)/100).toFixed(2).replace('.',',');
function esc(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function modeloVazio(){
  const agora=new Date().toISOString();
  return { formato:'webape-modelo', versao:1, id:uid('m'), nome:'Minha planta', criadoEm:agora, atualizadoEm:agora, pisos:[], paredes:[] };
}
function numero(v){ const n=Number(v); return (typeof v!=='boolean' && v!==null && v!=='' && isFinite(n)) ? r3(n) : null; }
function texto(v, padrao, max){ const s=(typeof v==='string' ? v : '').trim(); return (s||padrao).slice(0,max); }
function normalizarModelo(m){
  if(!m || typeof m!=='object' || !Array.isArray(m.pisos) || !Array.isArray(m.paredes)) return null;
  const agora=new Date().toISOString();
  const out={ formato:'webape-modelo', versao:1,
    id: texto(m.id, uid('m'), 60), nome: texto(m.nome, 'Modelo', 40),
    criadoEm: texto(m.criadoEm, agora, 40), atualizadoEm: texto(m.atualizadoEm, agora, 40),
    pisos:[], paredes:[] };
  for(const p of m.pisos){
    if(!p || typeof p!=='object') return null;
    const x=numero(p.x), z=numero(p.z), w=numero(p.w), d=numero(p.d);
    if([x,z,w,d].some(v=>v===null)) return null;
    out.pisos.push({ id:texto(p.id, uid('f'), 60), nome:texto(p.nome,'Cômodo',30), x, z, w, d, molhado:!!p.molhado, travado:!!p.travado });
  }
  for(const w of m.paredes){
    if(!w || typeof w!=='object') return null;
    const c=[w.x1,w.z1,w.x2,w.z2].map(numero);
    if(c.includes(null)) return null;
    const ab=[];
    for(const a of (Array.isArray(w.aberturas)?w.aberturas:[])){
      const pos=numero(a && a.pos), lg=numero(a && a.largura);
      if(pos===null || lg===null) return null;
      ab.push({ id:texto(a.id, uid('a'), 60), tipo:a.tipo==='janela'?'janela':'porta', pos, largura:lg });
    }
    // sempre do menor para o maior: a posição das aberturas é contada a partir de (x1,z1)
    if(c[0]>c[2] || (Math.abs(c[0]-c[2])<EPS && c[1]>c[3])){
      const L=Math.hypot(c[2]-c[0], c[3]-c[1]);
      ab.forEach(a=>{ a.pos=r3(L-(a.pos+a.largura)); });
      c.splice(0,4, c[2],c[3],c[0],c[1]);
    }
    out.paredes.push({ id:texto(w.id, uid('w'), 60), x1:c[0], z1:c[1], x2:c[2], z2:c[3],
      altura: w.altura==='meia'?'meia':'inteira', aberturas:ab, travado:!!w.travado });
  }
  return out;
}

/* ---------- geometria e regras ---------- */
function comprimento(w){ return Math.hypot(w.x2-w.x1, w.z2-w.z1); }
function ehHoriz(w){ return Math.abs(w.z1-w.z2)<EPS; }
function ehEixo(w){ return Math.abs(w.z1-w.z2)<EPS || Math.abs(w.x1-w.x2)<EPS; }
/* endpoints sempre do menor para o maior (x, depois z) — a posição das portas conta a partir de (x1,z1) */
function ordenarPontas(x1,z1,x2,z2){
  return (x1>x2+EPS || (Math.abs(x1-x2)<=EPS && z1>z2)) ? {x1:x2,z1:z2,x2:x1,z2:z1} : {x1,z1,x2,z2};
}
/* duas paredes no mesmo alinhamento dividindo um trecho (qualquer ângulo) */
function sobrepostas(a,b){
  const ax=a.x2-a.x1, az=a.z2-a.z1, La=Math.hypot(ax,az); if(La<EPS) return false;
  const ux=ax/La, uz=az/La;
  if(Math.abs((b.x1-a.x1)*uz-(b.z1-a.z1)*ux)>EPS || Math.abs((b.x2-a.x1)*uz-(b.z2-a.z1)*ux)>EPS) return false;
  const p1=(b.x1-a.x1)*ux+(b.z1-a.z1)*uz, p2=(b.x2-a.x1)*ux+(b.z2-a.z1)*uz;
  return Math.min(La, Math.max(p1,p2)) - Math.max(0, Math.min(p1,p2)) > EPS;
}
function linhaDe(w){
  const horiz=ehHoriz(w);
  return { horiz, c: horiz?w.z1:w.x1,
           a: horiz?Math.min(w.x1,w.x2):Math.min(w.z1,w.z2),
           b: horiz?Math.max(w.x1,w.x2):Math.max(w.z1,w.z2) };
}
function sobrepoe(a,b){
  return a.x < b.x+b.w-EPS && b.x < a.x+a.w-EPS && a.z < b.z+b.d-EPS && b.z < a.z+a.d-EPS;
}
function encostam(a,b){
  const ovz=Math.min(a.z+a.d,b.z+b.d)-Math.max(a.z,b.z);
  const ovx=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x);
  if((Math.abs(a.x+a.w-b.x)<EPS || Math.abs(b.x+b.w-a.x)<EPS) && ovz>=0.10-EPS) return true;
  if((Math.abs(a.z+a.d-b.z)<EPS || Math.abs(b.z+b.d-a.z)<EPS) && ovx>=0.10-EPS) return true;
  return false;
}
/* A parede inteira precisa estar coberta por pisos. Recorta o segmento em
   cada piso (Liang–Barsky) e confere se os trechos cobrem de ponta a ponta —
   funciona para parede reta ou diagonal. */
function paredeApoiada(w, pisos){
  const dx=w.x2-w.x1, dz=w.z2-w.z1, L=Math.hypot(dx,dz);
  if(L<EPS) return false;
  const iv=[];
  for(const p of pisos){
    let t0=0, t1=1;
    const corta=(pp,q)=>{
      if(Math.abs(pp)<1e-12) return q>=0;
      const r=q/pp;
      if(pp<0){ if(r>t1) return false; if(r>t0) t0=r; }
      else    { if(r<t0) return false; if(r<t1) t1=r; }
      return true;
    };
    if(corta(-dx, w.x1-(p.x-EPS)) && corta(dx, (p.x+p.w+EPS)-w.x1) &&
       corta(-dz, w.z1-(p.z-EPS)) && corta(dz, (p.z+p.d+EPS)-w.z1) && t1>=t0) iv.push([t0,t1]);
  }
  iv.sort((u,v)=>u[0]-v[0]);
  const tol=EPS/L;
  let cur=0;
  for(const [u,v] of iv){
    if(u>cur+tol) break;
    if(v>cur) cur=v;
    if(cur>=1-tol) return true;
  }
  return cur>=1-tol;
}
function dentroDoPiso(w,p){
  const ok=(x,z)=>x>=p.x-EPS && x<=p.x+p.w+EPS && z>=p.z-EPS && z<=p.z+p.d+EPS;
  return ok(w.x1,w.z1) && ok(w.x2,w.z2);
}
function nomePiso(p){ return '“'+(p.nome||'Cômodo')+'”'; }
function nomeTipo(a){ return a.tipo==='porta'?'porta':'janela'; }
function erro(msg, alvo){ return { ok:false, msg, alvo:alvo||null }; }

function validarModelo(m){
  if(m.pisos.length>MAX_PISOS) return erro('O limite é de '+MAX_PISOS+' pisos por modelo.');
  if(m.paredes.length>MAX_PAREDES) return erro('O limite é de '+MAX_PAREDES+' paredes por modelo.');
  for(const p of m.pisos){
    if(p.w<LADO_MIN-EPS || p.d<LADO_MIN-EPS) return erro('O piso '+nomePiso(p)+' precisa ter pelo menos 0,50 m de cada lado.', {tipo:'piso',id:p.id});
  }
  for(let i=0;i<m.pisos.length;i++) for(let j=i+1;j<m.pisos.length;j++){
    const a=m.pisos[i], b=m.pisos[j];
    if(sobrepoe(a,b)) return erro('Os pisos '+nomePiso(a)+' e '+nomePiso(b)+' ficariam um em cima do outro.', {tipo:'piso',id:b.id});
  }
  if(m.pisos.length>1){
    const visto=new Set([0]), fila=[0];
    while(fila.length){
      const i=fila.shift();
      m.pisos.forEach((q,j)=>{ if(!visto.has(j) && encostam(m.pisos[i],q)){ visto.add(j); fila.push(j); } });
    }
    const solto=m.pisos.find((p,i)=>!visto.has(i));
    if(solto) return erro('O piso '+nomePiso(solto)+' ficaria solto — todo piso precisa encostar em outro por uma borda.', {tipo:'piso',id:solto.id});
  }
  for(const w of m.paredes){
    const L=comprimento(w);
    if(L<0.10-EPS) return erro('Parede curta demais — o mínimo é 0,10 m.', {tipo:'parede',id:w.id});
    if(!paredeApoiada(w,m.pisos)) return erro('Essa parede ficaria fora do piso — toda parede precisa estar sobre um piso.', {tipo:'parede',id:w.id});
    const ab=w.aberturas.slice().sort((a,b)=>a.pos-b.pos);
    for(let k=0;k<ab.length;k++){
      const a=ab[k];
      if(a.largura<LARG_MIN-EPS) return erro('A '+nomeTipo(a)+' está estreita demais — o mínimo é 0,40 m.', {tipo:'parede',id:w.id});
      if(a.pos<-EPS || a.pos+a.largura>L+EPS) return erro('A '+nomeTipo(a)+' não cabe nessa parede de '+fmt(L)+' m.', {tipo:'parede',id:w.id});
      if(a.tipo==='janela' && w.altura==='meia') return erro('Meia parede não comporta janela — só porta ou vão.', {tipo:'parede',id:w.id});
      if(k>0 && ab[k-1].pos+ab[k-1].largura>a.pos+EPS) return erro('Há duas aberturas uma em cima da outra nessa parede.', {tipo:'parede',id:w.id});
    }
  }
  for(let i=0;i<m.paredes.length;i++) for(let j=i+1;j<m.paredes.length;j++){
    if(sobrepostas(m.paredes[i], m.paredes[j]))
      return erro('Duas paredes ficariam sobrepostas no mesmo trecho.', {tipo:'parede',id:m.paredes[j].id});
  }
  return { ok:true };
}

/* ---------- desfazer / refazer / rascunho ---------- */
function snapshot(){ return JSON.stringify(ED.m); }
function salvarRascunho(){ try{ localStorage.setItem(RASCUNHO_KEY, snapshot()); }catch(_){} }
function temRascunho(){
  try{ const d=JSON.parse(localStorage.getItem(RASCUNHO_KEY)||'null'); return !!(d && Array.isArray(d.pisos) && d.pisos.length); }
  catch(_){ return false; }
}
function syncUndo(){
  document.getElementById('edDesfazer').disabled = !ED.undo.length;
  document.getElementById('edRefazer').disabled = !ED.redo.length;
}
function registrar(antes){
  ED.undo.push(antes); if(ED.undo.length>120) ED.undo.shift();
  ED.redo.length=0;
  ED.m.atualizadoEm=new Date().toISOString();
  salvarRascunho(); syncUndo();
}
function tentar(alterar, okMsg){
  const antes=snapshot();
  alterar();
  const v=validarModelo(ED.m);
  if(!v.ok){ ED.m=JSON.parse(antes); edAviso(v.msg, true); edRender(); edPainel(); return false; }
  registrar(antes);
  if(okMsg) edAviso(okMsg, false, true);
  edRender(); edPainel();
  return true;
}
function desfazer(){
  if(!ED.undo.length) return;
  ED.redo.push(snapshot()); ED.m=JSON.parse(ED.undo.pop());
  validarSelecao(); salvarRascunho(); syncUndo(); edNome.value=ED.m.nome; edRender(); edPainel();
}
function refazer(){
  if(!ED.redo.length) return;
  ED.undo.push(snapshot()); ED.m=JSON.parse(ED.redo.pop());
  validarSelecao(); salvarRascunho(); syncUndo(); edNome.value=ED.m.nome; edRender(); edPainel();
}

/* ---------- seleção ---------- */
function pisoPorId(id){ return ED.m.pisos.find(p=>p.id===id) || null; }
function paredePorId(id){ return ED.m.paredes.find(w=>w.id===id) || null; }
function acharSel(){
  const s=ED.sel; if(!s) return null;
  if(s.tipo==='piso') return pisoPorId(s.id);
  const w=paredePorId(s.id); if(!w) return null;
  if(s.tipo==='parede') return w;
  return w.aberturas.find(a=>a.id===s.aid) || null;
}
function validarSelecao(){ if(ED.sel && !acharSel()) ED.sel=null; }

/* ---------- vista ---------- */
function aTela(x,z){ return [ED.view.ox+x*ED.view.s, ED.view.oy+z*ED.view.s]; }
function doEvento(e){
  const r=edSvg.getBoundingClientRect();
  const sx=e.clientX-r.left, sy=e.clientY-r.top;
  return { sx, sy, x:(sx-ED.view.ox)/ED.view.s, z:(sy-ED.view.oy)/ED.view.s };
}
function limitesModelo(){
  const b={x0:Infinity,x1:-Infinity,z0:Infinity,z1:-Infinity};
  ED.m.pisos.forEach(p=>{ b.x0=Math.min(b.x0,p.x); b.x1=Math.max(b.x1,p.x+p.w); b.z0=Math.min(b.z0,p.z); b.z1=Math.max(b.z1,p.z+p.d); });
  ED.m.paredes.forEach(w=>{ b.x0=Math.min(b.x0,w.x1,w.x2); b.x1=Math.max(b.x1,w.x1,w.x2); b.z0=Math.min(b.z0,w.z1,w.z2); b.z1=Math.max(b.z1,w.z1,w.z2); });
  return isFinite(b.x0) ? b : {x0:0,x1:10,z0:0,z1:8};
}
function ajustarVista(){
  const Wd=edWrap.clientWidth||800, Hd=edWrap.clientHeight||600, b=limitesModelo(), pad=1.5;
  const s=Math.max(8, Math.min(120, Math.min(Wd/(b.x1-b.x0+2*pad), Hd/(b.z1-b.z0+2*pad))));
  ED.view.s=s;
  ED.view.ox=Wd/2-((b.x0+b.x1)/2)*s;
  ED.view.oy=Hd/2-((b.z0+b.z1)/2)*s;
}
function zoomEm(fator, sx, sy){
  const v=ED.view, x=(sx-v.ox)/v.s, z=(sy-v.oy)/v.s;
  v.s=Math.max(8, Math.min(180, v.s*fator));
  v.ox=sx-x*v.s; v.oy=sy-z*v.s;
  edRender();
}

/* ---------- ímã: grade de 5 cm + bordas dos pisos e pontas das paredes ---------- */
function thrIma(){ return 10/ED.view.s; }
function imaEixo(v, alvos, thr){
  let best=null;
  for(const a of alvos){ const d=a-v; if(Math.abs(d)<=thr && (best===null || Math.abs(d)<Math.abs(best))) best=d; }
  return best;
}
function imaMulti(vals, alvos, thr){
  let best=null;
  for(const v of vals){ const d=imaEixo(v,alvos,thr); if(d!==null && (best===null || Math.abs(d)<Math.abs(best))) best=d; }
  return best;
}
function alvosPisos(exceto){
  const xs=[], zs=[];
  ED.m.pisos.forEach(p=>{ if(p.id===exceto) return; xs.push(p.x,p.x+p.w); zs.push(p.z,p.z+p.d); });
  return {xs,zs};
}
function alvosParede(exceto){
  const al=alvosPisos(null);
  ED.m.paredes.forEach(w=>{ if(w.id===exceto) return; al.xs.push(w.x1,w.x2); al.zs.push(w.z1,w.z2); });
  return al;
}
function snapPonto(x,z,al){
  const t=thrIma(), dx=imaEixo(x,al.xs,t), dz=imaEixo(z,al.zs,t);
  return { x: dx!==null ? r3(x+dx) : grade(x), z: dz!==null ? r3(z+dz) : grade(z) };
}
function ajusta(v, lista){ const i=imaEixo(v,lista,thrIma()); return i!==null ? r3(v+i) : grade(v); }

/* Ímã de objetos para as paredes: ponta de outra parede, meio dela, cantos dos
   pisos e — se nada disso estiver perto — qualquer ponto ao longo de uma parede. */
function snapObjeto(x,z,exceto){
  const tol=10/ED.view.s;
  let best=null;
  const cand=(px,pz,tipo,prio)=>{
    const d=Math.hypot(px-x,pz-z);
    if(d<=tol && (!best || prio<best.prio || (prio===best.prio && d<best.d))) best={x:r3(px), z:r3(pz), tipo, prio, d};
  };
  ED.m.paredes.forEach(w=>{
    if(w.id===exceto) return;
    cand(w.x1,w.z1,'ponta',0); cand(w.x2,w.z2,'ponta',0);
    cand((w.x1+w.x2)/2,(w.z1+w.z2)/2,'meio',1);
  });
  ED.m.pisos.forEach(p=>{
    cand(p.x,p.z,'canto',1); cand(p.x+p.w,p.z,'canto',1); cand(p.x,p.z+p.d,'canto',1); cand(p.x+p.w,p.z+p.d,'canto',1);
  });
  if(best) return best;
  let sobre=null;
  ED.m.paredes.forEach(w=>{
    if(w.id===exceto) return;
    const r=distSeg(x,z,w);
    if(r.d<=tol && (!sobre || r.d<sobre.r.d)) sobre={w,r};
  });
  if(sobre){
    const w=sobre.w, L=comprimento(w), u=Math.max(0, Math.min(L, grade(sobre.r.u)));
    return { x:r3(w.x1+(w.x2-w.x1)*u/L), z:r3(w.z1+(w.z2-w.z1)*u/L), tipo:'parede' };
  }
  return null;
}
function snapInicioParede(x,z,exceto){
  return snapObjeto(x,z,exceto) || { ...snapPonto(x,z,alvosParede(exceto)), tipo:'grade' };
}
/* Fim da parede: objetos primeiro; senão, ângulo gruda em 0/45/90/135°
   (ou é forçado com Shift); senão, ponto livre na grade = diagonal qualquer. */
function snapFimParede(ini, x, z, forcar45, exceto){
  if(!forcar45){ const o=snapObjeto(x,z,exceto); if(o) return o; }
  const dx=x-ini.x, dz=z-ini.z, L=Math.hypot(dx,dz);
  if(L<EPS) return { x:ini.x, z:ini.z, tipo:'grade' };
  const ang=Math.atan2(dz,dx), passo=Math.PI/4, alvo=Math.round(ang/passo)*passo;
  if(forcar45 || Math.abs(ang-alvo) < 6*Math.PI/180){
    const cx=Math.round(Math.cos(alvo)), cz=Math.round(Math.sin(alvo));
    const al=alvosParede(exceto);
    if(cz===0) return { x:ajusta(x,al.xs), z:ini.z, tipo:'reta' };
    if(cx===0) return { x:ini.x, z:ajusta(z,al.zs), tipo:'reta' };
    const t=grade((Math.abs(dx)+Math.abs(dz))/2);
    return { x:r3(ini.x+cx*t), z:r3(ini.z+cz*t), tipo:'45' };
  }
  return { ...snapPonto(x,z,alvosParede(exceto)), tipo:'grade' };
}

/* ---------- acerto de alvos ---------- */
function distSeg(px,pz,w){
  const dx=w.x2-w.x1, dz=w.z2-w.z1, L2=dx*dx+dz*dz;
  let t=L2 ? ((px-w.x1)*dx+(pz-w.z1)*dz)/L2 : 0;
  t=Math.max(0,Math.min(1,t));
  return { d:Math.hypot(px-(w.x1+t*dx), pz-(w.z1+t*dz)), u:t*Math.sqrt(L2) };
}
function handlesPiso(p){
  const x0=p.x, x1=p.x+p.w, z0=p.z, z1=p.z+p.d, xm=(x0+x1)/2, zm=(z0+z1)/2;
  return [{lado:'nw',x:x0,z:z0},{lado:'n',x:xm,z:z0},{lado:'ne',x:x1,z:z0},{lado:'e',x:x1,z:zm},
          {lado:'se',x:x1,z:z1},{lado:'s',x:xm,z:z1},{lado:'sw',x:x0,z:z1},{lado:'w',x:x0,z:zm}];
}
function acharHandle(x,z){
  const s=ED.sel; if(!s) return null;
  const tol=8/ED.view.s;
  if(s.tipo==='piso'){
    const p=pisoPorId(s.id); if(!p || p.travado) return null;
    for(const h of handlesPiso(p)) if(Math.abs(x-h.x)<=tol && Math.abs(z-h.z)<=tol) return {tipo:'handle-piso', id:p.id, lado:h.lado};
  }
  if(s.tipo==='parede'){
    const w=paredePorId(s.id); if(!w || w.travado) return null;
    if(Math.hypot(x-w.x1,z-w.z1)<=tol) return {tipo:'handle-parede', id:w.id, ponta:1};
    if(Math.hypot(x-w.x2,z-w.z2)<=tol) return {tipo:'handle-parede', id:w.id, ponta:2};
  }
  return null;
}
/* Qual borda (ou canto) do piso está sob o cursor: 'n','s','e','w','ne',... */
function bordaDoPiso(p,x,z,tol,soDentro){
  if(soDentro){ if(x<=p.x+EPS || x>=p.x+p.w-EPS || z<=p.z+EPS || z>=p.z+p.d-EPS) return null; }
  else if(x<p.x-tol || x>p.x+p.w+tol || z<p.z-tol || z>p.z+p.d+tol) return null;
  let lado='';
  if(Math.abs(z-p.z)<=tol) lado+='n'; else if(Math.abs(z-(p.z+p.d))<=tol) lado+='s';
  if(Math.abs(x-p.x)<=tol) lado+='w'; else if(Math.abs(x-(p.x+p.w))<=tol) lado+='e';
  return lado || null;
}
/* Ordem: alças → bordas do piso selecionado → paredes/aberturas → bordas de
   qualquer piso → corpo do piso. Com soPisos (ferramenta Piso) as paredes
   são ignoradas, então a borda do piso sempre redimensiona. */
function acharAlvo(x,z,opt){
  opt=opt||{};
  if(!opt.semHandles && !opt.soPisos){ const h=acharHandle(x,z); if(h) return h; }
  const tolB=(opt.soPisos?9:6)/ED.view.s;
  if(ED.sel && ED.sel.tipo==='piso'){
    const p=pisoPorId(ED.sel.id);
    if(p && !p.travado){ const l=bordaDoPiso(p,x,z,tolB,opt.soPisos); if(l) return {tipo:'handle-piso', id:p.id, lado:l}; }
  }
  if(!opt.soPisos){
    const tol=Math.max(7, PAREDE_T*ED.view.s/2+4)/ED.view.s;
    for(let i=ED.m.paredes.length-1;i>=0;i--){
      const w=ED.m.paredes[i], r=distSeg(x,z,w);
      if(r.d<=tol){
        const a=w.aberturas.find(q=>r.u>=q.pos-EPS && r.u<=q.pos+q.largura+EPS);
        return a ? {tipo:'abertura', id:w.id, aid:a.id, u:r.u} : {tipo:'parede', id:w.id, u:r.u};
      }
    }
  }
  for(let i=ED.m.pisos.length-1;i>=0;i--){
    const p=ED.m.pisos[i];
    if(p.travado) continue;
    const l=bordaDoPiso(p,x,z,tolB,opt.soPisos); if(l) return {tipo:'handle-piso', id:p.id, lado:l};
  }
  for(let i=ED.m.pisos.length-1;i>=0;i--){
    const p=ED.m.pisos[i];
    const dentro = opt.soPisos ? (x>p.x+EPS && x<p.x+p.w-EPS && z>p.z+EPS && z<p.z+p.d-EPS)
                               : (x>=p.x && x<=p.x+p.w && z>=p.z && z<=p.z+p.d);
    if(dentro) return {tipo:'piso', id:p.id};
  }
  return null;
}
/* Cadeados: no centro de cada piso; no meio da parede quando ela está
   selecionada ou travada. Coordenadas em pixels da tela. */
const CADEADO_R=11;
function cadeados(){
  const lista=[], s=ED.view.s;
  ED.m.pisos.forEach(p=>{
    if(p.w*s<30 || p.d*s<30) return;
    const [cx,cy]=aTela(p.x+p.w/2, p.z+p.d/2);
    lista.push({tipo:'piso', id:p.id, cx, cy, on:!!p.travado});
  });
  ED.m.paredes.forEach(w=>{
    const sel=ED.sel && (ED.sel.tipo==='parede'||ED.sel.tipo==='abertura') && ED.sel.id===w.id;
    if(!sel && !w.travado) return;
    if(comprimento(w)*s<40) return;
    const [cx,cy]=aTela((w.x1+w.x2)/2, (w.z1+w.z2)/2);
    lista.push({tipo:'parede', id:w.id, cx, cy, on:!!w.travado});
  });
  return lista;
}
function acharCadeado(sx,sy){
  const l=cadeados();
  for(let i=l.length-1;i>=0;i--) if(Math.abs(sx-l[i].cx)<=CADEADO_R && Math.abs(sy-l[i].cy)<=CADEADO_R) return l[i];
  return null;
}
function alternarTrava(tipo,id){
  const obj = tipo==='piso' ? pisoPorId(id) : paredePorId(id);
  if(!obj) return;
  const vai=!obj.travado;
  const msg = tipo==='piso'
    ? 'Piso '+nomePiso(obj)+(vai ? ' travado — não se move, não muda de tamanho e não pode ser excluído.' : ' destravado.')
    : (vai ? 'Parede travada — não se move, não muda de tamanho e não pode ser excluída.' : 'Parede destravada.');
  if(tentar(()=>{ obj.travado=vai; }, msg)){
    ED.sel={tipo, id}; edRender(); edPainel();
  }
}
function avisoTravado(tipo){
  edAviso((tipo==='piso'?'Esse piso':'Essa parede')+' está '+(tipo==='piso'?'travado':'travada')+' — clique no cadeado para destravar.', true);
}

/* ---------- operações ---------- */
function proximoNomeComodo(){
  const usados=new Set(ED.m.pisos.map(p=>p.nome));
  let n=ED.m.pisos.length+1; while(usados.has('Cômodo '+n)) n++;
  return 'Cômodo '+n;
}
function posLivre(w, pos, larg, exceto){
  const L=comprimento(w), outras=w.aberturas.filter(a=>a.id!==exceto);
  const cabe=p=> p>=-EPS && p+larg<=L+EPS && outras.every(a=> p+larg<=a.pos+EPS || p>=a.pos+a.largura-EPS);
  if(cabe(pos)) return r3(pos);
  const cand=[0, L-larg];
  outras.forEach(a=>cand.push(a.pos+a.largura, a.pos-larg));
  let best=null;
  cand.forEach(c=>{ c=r3(c); if(cabe(c) && (best===null || Math.abs(c-pos)<Math.abs(best-pos))) best=c; });
  return best;
}
function adicionarAbertura(paredeId, tipo, u){
  const w=paredePorId(paredeId); if(!w) return;
  const nome=tipo==='porta'?'porta':'janela';
  if(w.travado){ avisoTravado('parede'); return; }
  if(tipo==='janela' && w.altura==='meia'){ edAviso('Meia parede não comporta janela — só porta ou vão.', true); return; }
  const L=comprimento(w), larg=tipo==='porta'?LARG_PORTA:LARG_JANELA;
  if(larg>L+EPS){ edAviso('Essa parede tem '+fmt(L)+' m — curta demais para uma '+nome+' de '+fmt(larg)+' m.', true); return; }
  const pos=posLivre(w, Math.max(0,Math.min(L-larg, grade(u-larg/2))), larg);
  if(pos===null){ edAviso('Não sobra espaço livre nessa parede para mais uma '+nome+'.', true); return; }
  const a={ id:uid('a'), tipo, pos, largura:larg };
  if(tentar(()=>w.aberturas.push(a), (tipo==='porta'?'Porta':'Janela')+' de '+fmt(larg)+' m colocada.')){
    ED.sel={tipo:'abertura', id:w.id, aid:a.id}; edRender(); edPainel();
  }
}
function unirIntervalos(iv){
  const s=iv.slice().sort((a,b)=>a[0]-b[0]), out=[];
  for(const [a,b] of s){ if(out.length && a<=out[out.length-1][1]+EPS) out[out.length-1][1]=Math.max(out[out.length-1][1],b); else out.push([a,b]); }
  return out;
}
function subtrairIntervalos(base, tirar){
  let res=base.map(x=>x.slice());
  for(const [a,b] of tirar){
    const nov=[];
    for(const [u,v] of res){
      if(b<=u+EPS || a>=v-EPS){ nov.push([u,v]); continue; }
      if(a>u+EPS) nov.push([u,a]);
      if(b<v-EPS) nov.push([b,v]);
    }
    res=nov;
  }
  return res;
}
function gerarContorno(){
  if(!ED.m.pisos.length){ edAviso('Desenhe os pisos primeiro — as paredes do contorno nascem das bordas deles.', true); return; }
  const novas=[];
  for(const horiz of [true,false]){
    const linhas=new Map();
    const add=(c,a,b)=>{
      const k=c.toFixed(3);
      if(!linhas.has(k)) linhas.set(k,{c,ivs:[],cortes:new Set()});
      const Ln=linhas.get(k); Ln.ivs.push([a,b]); Ln.cortes.add(r3(a)); Ln.cortes.add(r3(b));
    };
    ED.m.pisos.forEach(p=>{
      if(horiz){ add(p.z,p.x,p.x+p.w); add(p.z+p.d,p.x,p.x+p.w); }
      else     { add(p.x,p.z,p.z+p.d); add(p.x+p.w,p.z,p.z+p.d); }
    });
    for(const Ln of linhas.values()){
      const exist=ED.m.paredes.filter(ehEixo).map(linhaDe).filter(l=>l.horiz===horiz && Math.abs(l.c-Ln.c)<EPS).map(l=>[l.a,l.b]);
      exist.forEach(([a,b])=>{ Ln.cortes.add(r3(a)); Ln.cortes.add(r3(b)); });
      const livres=subtrairIntervalos(unirIntervalos(Ln.ivs), exist);
      const cortes=[...Ln.cortes].sort((a,b)=>a-b);
      for(const [a,b] of livres){
        const pts=[a, ...cortes.filter(c=>c>a+EPS && c<b-EPS), b];
        for(let i=0;i<pts.length-1;i++){
          if(pts[i+1]-pts[i]<0.10-EPS) continue;
          const u=r3(pts[i]), v=r3(pts[i+1]), c=r3(Ln.c);
          novas.push(horiz ? {x1:u,z1:c,x2:v,z2:c} : {x1:c,z1:u,x2:c,z2:v});
        }
      }
    }
  }
  if(!novas.length){ edAviso('Todas as bordas dos pisos já têm parede.', false, true); return; }
  tentar(()=>{ novas.forEach(n=>ED.m.paredes.push({ id:uid('w'), ...n, altura:'inteira', aberturas:[] })); },
         novas.length+(novas.length===1?' parede criada':' paredes criadas')+' no contorno dos pisos.');
}
function excluirSelecao(){
  const s=ED.sel; if(!s) return;
  const alvoSel=s.tipo==='piso' ? pisoPorId(s.id) : paredePorId(s.id);
  if(alvoSel && alvoSel.travado){ avisoTravado(s.tipo==='piso'?'piso':'parede'); return; }
  if(s.tipo==='abertura'){
    const a=acharSel();
    if(tentar(()=>{ const w=paredePorId(s.id); w.aberturas=w.aberturas.filter(q=>q.id!==s.aid); }, (a&&a.tipo==='janela'?'Janela':'Porta')+' removida.')){
      ED.sel={tipo:'parede', id:s.id}; edRender(); edPainel();
    }
    return;
  }
  if(s.tipo==='parede'){
    if(tentar(()=>{ ED.m.paredes=ED.m.paredes.filter(w=>w.id!==s.id); }, 'Parede excluída.')){ ED.sel=null; edRender(); edPainel(); }
    return;
  }
  const antes=snapshot(), piso=pisoPorId(s.id); if(!piso) return;
  ED.m.pisos=ED.m.pisos.filter(p=>p.id!==s.id);
  const orfas=ED.m.paredes.filter(w=>!paredeApoiada(w,ED.m.pisos));
  if(orfas.length && !confirm('Excluir '+nomePiso(piso)+' também remove '+orfas.length+(orfas.length===1?' parede que só existe sobre ele':' paredes que só existem sobre ele')+'. Continuar?')){
    ED.m=JSON.parse(antes); return;
  }
  ED.m.paredes=ED.m.paredes.filter(w=>!orfas.includes(w));
  const v=validarModelo(ED.m);
  if(!v.ok){ ED.m=JSON.parse(antes); edAviso('Não dá para excluir esse piso: '+v.msg, true); edRender(); edPainel(); return; }
  registrar(antes); ED.sel=null;
  edAviso('Piso excluído'+(orfas.length ? ' junto com '+orfas.length+(orfas.length===1?' parede.':' paredes.') : '.'), false, true);
  edRender(); edPainel();
}
/* Ao redimensionar, as paredes que estão na borda puxada andam junto com ela,
   e as que terminam nessa borda esticam/encolhem — senão ajustar um cômodo
   depois de ter paredes seria sempre bloqueado. */
function bordasDoPiso(piso, lado){
  const o={x:piso.x, z:piso.z, w:piso.w, d:piso.d};
  const bx={ e:o.x+o.w, w:o.x }, bz={ s:o.z+o.d, n:o.z };
  const pontas=[], origParedes={};
  ED.m.paredes.forEach(w=>{
    origParedes[w.id]={ x1:w.x1, z1:w.z1, pos:w.aberturas.map(a=>a.pos) };
    if(w.travado || !dentroDoPiso(w,piso)) return;
    [1,2].forEach(k=>{
      const x=k===1?w.x1:w.x2, z=k===1?w.z1:w.z2;
      ['e','w'].forEach(b=>{ if(lado.includes(b) && Math.abs(x-bx[b])<EPS) pontas.push({id:w.id, k, eixo:'x', borda:b}); });
      ['s','n'].forEach(b=>{ if(lado.includes(b) && Math.abs(z-bz[b])<EPS) pontas.push({id:w.id, k, eixo:'z', borda:b}); });
    });
  });
  return { id:piso.id, orig:o, pontas, origParedes };
}
/* Mantém portas/janelas no mesmo lugar quando o início da parede anda. */
function compensarAberturas(w, o){
  const L=comprimento(w); if(L<EPS) return;
  const desl=(w.x1-o.x1)*(w.x2-w.x1)/L + (w.z1-o.z1)*(w.z2-w.z1)/L;
  w.aberturas.forEach((a,i)=>{ if(o.pos[i]!==undefined) a.pos=r3(o.pos[i]-desl); });
}
function aplicarBordas(ctx, x0, z0, x1, z1){
  const piso=pisoPorId(ctx.id);
  piso.x=r3(x0); piso.z=r3(z0); piso.w=r3(x1-x0); piso.d=r3(z1-z0);
  const nx={ e:r3(piso.x+piso.w), w:piso.x }, nz={ s:r3(piso.z+piso.d), n:piso.z };
  ctx.pontas.forEach(q=>{
    const w=paredePorId(q.id), v=q.eixo==='x' ? nx[q.borda] : nz[q.borda];
    if(q.eixo==='x'){ if(q.k===1) w.x1=v; else w.x2=v; } else { if(q.k===1) w.z1=v; else w.z2=v; }
  });
  const mexidas=new Set(ctx.pontas.map(q=>q.id));
  mexidas.forEach(id=>compensarAberturas(paredePorId(id), ctx.origParedes[id]));
  resolverSobreposicoes(mexidas);
}
/* Paredes que andaram junto com um piso e caíram sobre uma parede fixa no
   mesmo alinhamento são aparadas até onde a fixa começa — ou somem, se
   ficarem totalmente cobertas (a fixa já faz esse papel). */
function resolverSobreposicoes(moveis){
  if(!moveis.size) return;
  const fixos=ED.m.paredes.filter(o=>!moveis.has(o.id) && ehEixo(o)).map(linhaDe);
  ED.m.paredes=ED.m.paredes.filter(w=>{
    if(!moveis.has(w.id) || !ehEixo(w)) return true;
    const L=linhaDe(w);
    const cobre=fixos.filter(M=>M.horiz===L.horiz && Math.abs(M.c-L.c)<EPS && Math.min(M.b,L.b)-Math.max(M.a,L.a)>EPS).map(M=>[M.a,M.b]);
    if(!cobre.length) return true;
    const resto=subtrairIntervalos([[L.a,L.b]], cobre);
    if(!resto.length) return w.aberturas.length>0;
    if(resto.length===1){
      const [a,b]=resto[0], desl=r3(a-L.a);
      if(L.horiz){ w.x1=r3(a); w.x2=r3(b); } else { w.z1=r3(a); w.z2=r3(b); }
      if(desl) w.aberturas.forEach(ab=>{ ab.pos=r3(ab.pos-desl); });
    }
    return true;
  });
}
function moverSelecao(dx,dz){
  const s=ED.sel; if(!s) return;
  const obj=s.tipo==='piso' ? pisoPorId(s.id) : paredePorId(s.id);
  if(obj && obj.travado){ avisoTravado(s.tipo==='piso'?'piso':'parede'); return; }
  if(s.tipo==='piso'){
    tentar(()=>{
      const p=pisoPorId(s.id), junto=ED.m.paredes.filter(w=>!w.travado && dentroDoPiso(w,p));
      junto.forEach(w=>{ w.x1=r3(w.x1+dx); w.x2=r3(w.x2+dx); w.z1=r3(w.z1+dz); w.z2=r3(w.z2+dz); });
      p.x=r3(p.x+dx); p.z=r3(p.z+dz);
      resolverSobreposicoes(new Set(junto.map(w=>w.id)));
    });
    validarSelecao();
  } else if(s.tipo==='parede'){
    tentar(()=>{ const w=paredePorId(s.id); w.x1=r3(w.x1+dx); w.x2=r3(w.x2+dx); w.z1=r3(w.z1+dz); w.z2=r3(w.z2+dz); });
  }
}

/* ---------- ferramentas ---------- */
const DICAS={
  selecionar:'Clique para selecionar · arraste para mover · puxe bordas e pontas para redimensionar · cadeado trava · arraste o fundo para navegar · roda = zoom',
  piso:'Arraste no vazio — ou a partir da borda de um piso — para desenhar um cômodo vizinho. Pegue um piso por dentro para movê-lo, ou perto da borda para redimensionar.',
  parede:'Arraste para desenhar — a parede pode sair do meio de outra, de uma ponta ou de um canto, e pode ser diagonal. Shift trava em 45°.',
  porta:'Clique numa parede para colocar uma porta de 0,80 m.',
  janela:'Clique numa parede para colocar uma janela de 1,20 m (não vale em meia parede).'
};
function setTool(t){
  ED.tool=t; ED.drag=null; ED.snapHint=null;
  document.querySelectorAll('.ed-tool[data-tool]').forEach(b=>b.setAttribute('aria-pressed', String(b.dataset.tool===t)));
  edSvg.style.cursor = (t==='piso'||t==='parede') ? 'crosshair' : (t==='porta'||t==='janela') ? 'copy' : 'default';
  edStatusRender();
}
function edAviso(msg, ehErro, ehOk){
  ED.msg={ texto:msg, erro:!!ehErro, ok:!!ehOk };
  clearTimeout(ED.msgTimer);
  ED.msgTimer=setTimeout(()=>{ ED.msg=null; edStatusRender(); }, ehErro?6000:4000);
  edStatusRender();
}
function edStatusRender(){
  let txt=DICAS[ED.tool], cls='ed-status dica';
  if(ED.invalido){ txt=ED.invalido.msg; cls='ed-status erro'; }
  else if(ED.msg){ txt=ED.msg.texto; cls='ed-status'+(ED.msg.erro?' erro':ED.msg.ok?' ok':''); }
  edStatus.className=cls; edStatus.textContent=txt;
}

/* ---------- desenho da planta ---------- */
function edRender(){
  if(!ED.m || document.getElementById('editor').hidden) return;
  const Wd=edWrap.clientWidth, Hd=edWrap.clientHeight, v=ED.view, s=v.s;
  edSvg.setAttribute('viewBox','0 0 '+Wd+' '+Hd);
  const n=x=>x.toFixed(1);
  let out='';

  // grade: linhas finas a cada 0,5 m (ou 1 / 5 m afastado), fortes a cada metro
  const passo = s>=34 ? 0.5 : s>=14 ? 1 : 5, forte = passo<1 ? 1 : passo*5;
  let dMin='', dMaj='';
  const xi=Math.floor(-v.ox/s/passo), xf=Math.ceil((Wd-v.ox)/s/passo);
  for(let k=xi;k<=xf;k++){
    const x=k*passo, sx=Math.round(v.ox+x*s)+0.5, maj=Math.abs(x/forte-Math.round(x/forte))<1e-6;
    if(maj) dMaj+='M'+sx+' 0V'+Hd; else dMin+='M'+sx+' 0V'+Hd;
  }
  const zi=Math.floor(-v.oy/s/passo), zf=Math.ceil((Hd-v.oy)/s/passo);
  for(let k=zi;k<=zf;k++){
    const z=k*passo, sy=Math.round(v.oy+z*s)+0.5, maj=Math.abs(z/forte-Math.round(z/forte))<1e-6;
    if(maj) dMaj+='M0 '+sy+'H'+Wd; else dMin+='M0 '+sy+'H'+Wd;
  }
  out+='<path class="g-min" d="'+dMin+'"/><path class="g-maj" d="'+dMaj+'"/>';

  const bad=ED.invalido && ED.invalido.alvo;
  const arrastando=ED.drag && ED.drag.id;
  const ruim=(tipo,id)=> (bad && bad.tipo===tipo && bad.id===id) || (ED.invalido && arrastando===id);

  // pisos
  ED.m.pisos.forEach(p=>{
    const [sx,sy]=aTela(p.x,p.z);
    let c='pz'; if(p.molhado) c+=' molhado';
    if(ED.sel && ED.sel.tipo==='piso' && ED.sel.id===p.id) c+=' sel';
    if(ruim('piso',p.id)) c+=' bad';
    out+='<rect class="'+c+'" x="'+n(sx)+'" y="'+n(sy)+'" width="'+n(p.w*s)+'" height="'+n(p.d*s)+'"/>';
  });

  // paredes
  const tw=Math.max(4, PAREDE_T*s);
  ED.m.paredes.forEach(w=>{
    const [a1,b1]=aTela(w.x1,w.z1), [a2,b2]=aTela(w.x2,w.z2);
    let c='pw'; if(w.altura==='meia') c+=' meia';
    if(ED.sel && (ED.sel.tipo==='parede'||ED.sel.tipo==='abertura') && ED.sel.id===w.id) c+=' sel';
    if(ruim('parede',w.id)) c+=' bad';
    out+='<line class="'+c+'" x1="'+n(a1)+'" y1="'+n(b1)+'" x2="'+n(a2)+'" y2="'+n(b2)+'" stroke-width="'+n(tw)+'"/>';
  });

  // portas e janelas
  ED.m.paredes.forEach(w=>{
    const L=comprimento(w); if(L<EPS) return;
    const dx=(w.x2-w.x1)/L, dz=(w.z2-w.z1)/L, nx=dz, nz=-dx;
    w.aberturas.forEach(a=>{
      const p0=[w.x1+dx*a.pos, w.z1+dz*a.pos], p1=[w.x1+dx*(a.pos+a.largura), w.z1+dz*(a.pos+a.largura)];
      const [s0x,s0y]=aTela(p0[0],p0[1]), [s1x,s1y]=aTela(p1[0],p1[1]);
      const sel=ED.sel && ED.sel.tipo==='abertura' && ED.sel.aid===a.id ? ' sel' : '';
      out+='<line class="ab-gap" x1="'+n(s0x)+'" y1="'+n(s0y)+'" x2="'+n(s1x)+'" y2="'+n(s1y)+'" stroke-width="'+n(tw+2)+'"/>';
      if(a.tipo==='porta'){
        const r=a.largura*s, tx=s0x+nx*r, ty=s0y+nz*r;
        out+='<path class="ab-porta'+sel+'" d="M'+n(s0x)+' '+n(s0y)+'L'+n(tx)+' '+n(ty)+'A'+n(r)+' '+n(r)+' 0 0 1 '+n(s1x)+' '+n(s1y)+'"/>';
      } else {
        const o=tw/2, ox=nx*o, oy=nz*o;
        out+='<path class="ab-janela'+sel+'" d="M'+n(s0x+ox)+' '+n(s0y+oy)+'L'+n(s1x+ox)+' '+n(s1y+oy)+'L'+n(s1x-ox)+' '+n(s1y-oy)+'L'+n(s0x-ox)+' '+n(s0y-oy)+'Z M'+n(s0x)+' '+n(s0y)+'L'+n(s1x)+' '+n(s1y)+'"/>';
      }
    });
  });

  // rótulos dos pisos (abaixo do cadeado, que fica no centro)
  ED.m.pisos.forEach(p=>{
    const pw=p.w*s, ph=p.d*s; if(pw<54 || ph<58) return;
    const [cx,cy]=aTela(p.x+p.w/2, p.z+p.d/2);
    out+='<text class="pz-nome" x="'+n(cx)+'" y="'+n(cy+CADEADO_R+15)+'">'+esc(p.nome||'Cômodo')+'</text>';
    if(ph>=84) out+='<text class="pz-dim" x="'+n(cx)+'" y="'+n(cy+CADEADO_R+29)+'">'+fmt(p.w)+' × '+fmt(p.d)+'</text>';
  });

  // seleção (itens travados não mostram alças)
  const alvo=acharSel();
  if(alvo && ED.sel.tipo==='piso' && !alvo.travado){
    handlesPiso(alvo).forEach(h=>{ const [hx,hy]=aTela(h.x,h.z); out+='<rect class="hd" x="'+n(hx-4.5)+'" y="'+n(hy-4.5)+'" width="9" height="9" rx="1.5"/>'; });
  }
  if(alvo && ED.sel.tipo==='parede'){
    const [a1,b1]=aTela(alvo.x1,alvo.z1), [a2,b2]=aTela(alvo.x2,alvo.z2);
    if(!alvo.travado) out+='<circle class="hd" cx="'+n(a1)+'" cy="'+n(b1)+'" r="5.5"/><circle class="hd" cx="'+n(a2)+'" cy="'+n(b2)+'" r="5.5"/>';
    out+=cota((a1+a2)/2, (b1+b2)/2, alvo, tw, fmt(comprimento(alvo))+' m', ruim('parede',alvo.id));
  }

  // cadeados
  cadeados().forEach(c=>{ out+=desenhoCadeado(c.cx, c.cy, c.on, c.tipo==='piso'?'piso':'parede'); });

  // desenho em andamento
  const d=ED.drag;
  if(d && d.tipo==='novo-piso'){
    const x0=Math.min(d.x0,d.x1), x1=Math.max(d.x0,d.x1), z0=Math.min(d.z0,d.z1), z1=Math.max(d.z0,d.z1);
    const [sx,sy]=aTela(x0,z0), cls=ED.invalido?' bad':'';
    out+='<rect class="prev'+cls+'" x="'+n(sx)+'" y="'+n(sy)+'" width="'+n((x1-x0)*s)+'" height="'+n((z1-z0)*s)+'"/>';
    if(x1-x0>EPS || z1-z0>EPS){ const [cx,cy]=aTela((x0+x1)/2,(z0+z1)/2); out+='<text class="cota'+cls+'" x="'+n(cx)+'" y="'+n(cy+4)+'">'+fmt(x1-x0)+' × '+fmt(z1-z0)+' m</text>'; }
  }
  if(d && d.tipo==='nova-parede'){
    const [a1,b1]=aTela(d.x0,d.z0), [a2,b2]=aTela(d.x1,d.z1), cls=ED.invalido?' bad':'';
    out+='<line class="prev-l'+cls+'" x1="'+n(a1)+'" y1="'+n(b1)+'" x2="'+n(a2)+'" y2="'+n(b2)+'" stroke-width="'+n(tw)+'"/>';
    const L=Math.hypot(d.x1-d.x0, d.z1-d.z0);
    if(L>EPS){
      const ang=Math.round(Math.atan2(d.z0-d.z1, d.x1-d.x0)*180/Math.PI);
      const eixo=Math.abs(d.x1-d.x0)<EPS || Math.abs(d.z1-d.z0)<EPS;
      out+=cota((a1+a2)/2,(b1+b2)/2,{x1:d.x0,z1:d.z0,x2:d.x1,z2:d.z1},tw,fmt(L)+' m'+(eixo?'':' · '+((ang%180+180)%180)+'°'),!!ED.invalido);
    }
  }

  // ímã: onde a parede vai grudar
  const im=ED.snapHint;
  if(im && (ED.tool==='parede' || (d && (d.tipo==='nova-parede' || d.tipo==='ponta'))) && im.tipo!=='grade'){
    const [ix,iy]=aTela(im.x, im.z);
    const rot={ponta:'ponta', meio:'meio', parede:'na parede', canto:'canto', '45':'45°', reta:''}[im.tipo];
    out+='<circle class="ima" cx="'+n(ix)+'" cy="'+n(iy)+'" r="6"/>';
    if(rot) out+='<text class="ima-t" x="'+n(ix+10)+'" y="'+n(iy-9)+'">'+rot+'</text>';
  }
  edSvg.innerHTML=out;
  edStatusRender();
}
function cota(cx,cy,w,tw,txt,bad){
  const L=Math.hypot(w.x2-w.x1, w.z2-w.z1)||1;
  let nx=(w.z2-w.z1)/L, nz=-(w.x2-w.x1)/L;
  if(nz>0 || (Math.abs(nz)<EPS && nx<0)){ nx=-nx; nz=-nz; }
  const off=tw/2+CADEADO_R+8, x=cx+nx*off+(Math.abs(nz)<0.3?18:0), y=cy+nz*off+4;
  return '<text class="cota'+(bad?' bad':'')+'" x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'">'+esc(txt)+'</text>';
}
function desenhoCadeado(cx,cy,fechado,tipo){
  const x=(cx-CADEADO_R).toFixed(1), y=(cy-CADEADO_R).toFixed(1), d=CADEADO_R*2;
  const arco = fechado ? 'M7.6 10V8a3.4 3.4 0 0 1 6.8 0v2' : 'M7.6 10V8a3.4 3.4 0 0 1 6.5-1.4';
  return '<g class="trava'+(fechado?' on':'')+'" transform="translate('+x+' '+y+')">'
    + '<title>'+(fechado?'Destravar ':'Travar ')+(tipo==='piso'?'piso':'parede')+'</title>'
    + '<rect class="trava-bg" width="'+d+'" height="'+d+'" rx="6"/>'
    + '<path class="trava-arco" d="'+arco+'"/>'
    + '<rect class="trava-corpo" x="6" y="10" width="10" height="7.5" rx="1.6"/></g>';
}

/* ---------- ponteiro ---------- */
function iniciarPan(e){
  ED.pan={ sx:e.clientX, sy:e.clientY, ox:ED.view.ox, oy:ED.view.oy };
  try{ edSvg.setPointerCapture(e.pointerId); }catch(_){}
  edSvg.style.cursor='grabbing';
}
edSvg.addEventListener('contextmenu', e=>e.preventDefault());
/* Começa a editar o que está sob o cursor — usado pela ferramenta Selecionar
   e também pelas ferramentas Piso (pisos) e Parede (pontas da parede). */
function iniciarEdicao(alvo, p, base){
  const antes=snapshot();
  if(alvo.tipo==='handle-piso'){
    const piso=pisoPorId(alvo.id);
    ED.sel={tipo:'piso', id:alvo.id};
    if(piso.travado){ ED.drag={ ...base, tipo:'travado', alvo:'piso' }; edPainel(); edRender(); return; }
    ED.drag={ ...base, tipo:'redimensionar', lado:alvo.lado, antes, ...bordasDoPiso(piso, alvo.lado) };
    edPainel(); edRender(); return;
  }
  if(alvo.tipo==='handle-parede'){
    const w=paredePorId(alvo.id);
    ED.drag={ ...base, tipo:'ponta', id:alvo.id, ponta:alvo.ponta, antes,
              orig:{x1:w.x1,z1:w.z1,x2:w.x2,z2:w.z2, pos:w.aberturas.map(a=>a.pos)} };
    return;
  }
  if(alvo.tipo==='abertura'){
    ED.sel={tipo:'abertura', id:alvo.id, aid:alvo.aid};
    const w=paredePorId(alvo.id), a=w.aberturas.find(q=>q.id===alvo.aid);
    ED.drag = w.travado ? { ...base, tipo:'travado', alvo:'parede' }
                        : { ...base, tipo:'mover-abertura', id:alvo.id, aid:alvo.aid, antes, off:alvo.u-a.pos };
    edPainel(); edRender(); return;
  }
  if(alvo.tipo==='parede'){
    ED.sel={tipo:'parede', id:alvo.id};
    const w=paredePorId(alvo.id);
    ED.drag = w.travado ? { ...base, tipo:'travado', alvo:'parede' }
                        : { ...base, tipo:'mover-parede', id:alvo.id, antes, px:p.x, pz:p.z, orig:{x1:w.x1,z1:w.z1,x2:w.x2,z2:w.z2} };
    edPainel(); edRender(); return;
  }
  ED.sel={tipo:'piso', id:alvo.id};
  const piso=pisoPorId(alvo.id);
  if(piso.travado){ ED.drag={ ...base, tipo:'travado', alvo:'piso' }; edPainel(); edRender(); return; }
  const dentro=ED.m.paredes.filter(w=>dentroDoPiso(w,piso));
  const carregadas=dentro.filter(w=>!w.travado).map(w=>({id:w.id, x1:w.x1, z1:w.z1, x2:w.x2, z2:w.z2}));
  ED.drag={ ...base, tipo:'mover-piso', id:alvo.id, antes, px:p.x, pz:p.z, orig:{x:piso.x,z:piso.z},
            carregadas, travadasDentro:dentro.length-carregadas.length };
  edPainel(); edRender();
}

edSvg.addEventListener('pointerdown', e=>{
  if(!ED.m) return;
  if(e.button===1 || e.button===2 || e.ctrlKey || e.metaKey){ iniciarPan(e); return; }
  if(e.button!==0) return;
  const p=doEvento(e);
  try{ edSvg.setPointerCapture(e.pointerId); }catch(_){}
  const t=ED.tool, base={ sx0:e.clientX, sy0:e.clientY, moveu:false };

  // o cadeado vale em qualquer ferramenta
  const cad=acharCadeado(p.sx, p.sy);
  if(cad){ alternarTrava(cad.tipo, cad.id); return; }

  if(t==='piso'){
    const alvo=acharAlvo(p.x,p.z,{soPisos:true});
    if(alvo){ iniciarEdicao(alvo, p, base); return; }
    const a=snapPonto(p.x,p.z,alvosPisos(null));
    ED.drag={ ...base, tipo:'novo-piso', x0:a.x, z0:a.z, x1:a.x, z1:a.z }; edRender(); return;
  }
  if(t==='parede'){
    const h=acharHandle(p.x,p.z);
    if(h && h.tipo==='handle-parede'){ iniciarEdicao(h, p, base); return; }
    const a=snapInicioParede(p.x,p.z,null);
    ED.snapHint=a;
    ED.drag={ ...base, tipo:'nova-parede', x0:a.x, z0:a.z, x1:a.x, z1:a.z }; edRender(); return;
  }
  if(t==='porta' || t==='janela'){
    const alvo=acharAlvo(p.x,p.z,{semHandles:true});
    if(alvo && (alvo.tipo==='parede' || alvo.tipo==='abertura')) adicionarAbertura(alvo.id, t, alvo.u);
    else edAviso('Clique sobre uma parede para colocar a '+(t==='porta'?'porta':'janela')+'.', true);
    return;
  }

  const alvo=acharAlvo(p.x,p.z);
  if(!alvo){ if(ED.sel){ ED.sel=null; edPainel(); edRender(); } iniciarPan(e); return; }
  iniciarEdicao(alvo, p, base);
});

edSvg.addEventListener('pointermove', e=>{
  if(!ED.m) return;
  if(ED.pan){
    ED.view.ox=ED.pan.ox+(e.clientX-ED.pan.sx);
    ED.view.oy=ED.pan.oy+(e.clientY-ED.pan.sy);
    edRender(); return;
  }
  const p=doEvento(e), d=ED.drag;
  if(!d){ atualizarCursor(p); return; }
  if(!d.moveu){
    if(Math.hypot(e.clientX-d.sx0, e.clientY-d.sy0)<4) return;
    d.moveu=true;
    if(d.tipo==='travado'){ avisoTravado(d.alvo); return; }
  }
  if(d.tipo==='travado') return;
  if(d.tipo==='novo-piso'){
    const a=snapPonto(p.x,p.z,alvosPisos(null)); d.x1=a.x; d.z1=a.z;
    ED.invalido=validarNovo(d);
  }
  else if(d.tipo==='nova-parede'){
    const a=snapFimParede({x:d.x0,z:d.z0}, p.x, p.z, e.shiftKey, null);
    d.x1=a.x; d.z1=a.z; ED.snapHint=a;
    ED.invalido=validarNovo(d);
  }
  else {
    if(d.tipo==='mover-piso'){
      ED.m=JSON.parse(d.antes);
      const piso=pisoPorId(d.id), al=alvosPisos(d.id), t=thrIma();
      let nx=grade(d.orig.x+(p.x-d.px)), nz=grade(d.orig.z+(p.z-d.pz));
      const ix=imaMulti([nx,nx+piso.w],al.xs,t), iz=imaMulti([nz,nz+piso.d],al.zs,t);
      if(ix!==null) nx=r3(nx+ix);
      if(iz!==null) nz=r3(nz+iz);
      const dx=r3(nx-d.orig.x), dz=r3(nz-d.orig.z);
      piso.x=nx; piso.z=nz;
      d.carregadas.forEach(c=>{ const w=paredePorId(c.id); w.x1=r3(c.x1+dx); w.x2=r3(c.x2+dx); w.z1=r3(c.z1+dz); w.z2=r3(c.z2+dz); });
      resolverSobreposicoes(new Set(d.carregadas.map(c=>c.id)));
    }
    else if(d.tipo==='redimensionar'){
      ED.m=JSON.parse(d.antes);
      const o=d.orig, al=alvosPisos(d.id);
      let x0=o.x, x1=o.x+o.w, z0=o.z, z1=o.z+o.d;
      if(d.lado.includes('w')) x0=Math.min(ajusta(p.x,al.xs), r3(x1-LADO_MIN));
      if(d.lado.includes('e')) x1=Math.max(ajusta(p.x,al.xs), r3(x0+LADO_MIN));
      if(d.lado.includes('n')) z0=Math.min(ajusta(p.z,al.zs), r3(z1-LADO_MIN));
      if(d.lado.includes('s')) z1=Math.max(ajusta(p.z,al.zs), r3(z0+LADO_MIN));
      aplicarBordas(d, x0, z0, x1, z1);
    }
    else if(d.tipo==='ponta'){
      ED.m=JSON.parse(d.antes);
      const w=paredePorId(d.id), o=d.orig;
      const outra = d.ponta===1 ? {x:o.x2, z:o.z2} : {x:o.x1, z:o.z1};
      const a=snapFimParede(outra, p.x, p.z, e.shiftKey, d.id);
      ED.snapHint=a;
      if(d.ponta===1){ w.x1=a.x; w.z1=a.z; } else { w.x2=a.x; w.z2=a.z; }
      compensarAberturas(w, o);
    }
    else if(d.tipo==='mover-parede'){
      const w=paredePorId(d.id), o=d.orig;
      let dx=grade(p.x-d.px), dz=grade(p.z-d.pz);
      if(ehEixo(o)){
        const al=alvosPisos(null), t=thrIma();
        if(ehHoriz(o)){ const i=imaEixo(o.z1+dz, al.zs, t); if(i!==null) dz=r3(dz+i); }
        else          { const i=imaEixo(o.x1+dx, al.xs, t); if(i!==null) dx=r3(dx+i); }
      }
      w.x1=r3(o.x1+dx); w.x2=r3(o.x2+dx); w.z1=r3(o.z1+dz); w.z2=r3(o.z2+dz);
    }
    else if(d.tipo==='mover-abertura'){
      const w=paredePorId(d.id), a=w.aberturas.find(q=>q.id===d.aid), r=distSeg(p.x,p.z,w);
      a.pos=r3(Math.max(0, Math.min(comprimento(w)-a.largura, grade(r.u-d.off))));
    }
    const v=validarModelo(ED.m);
    ED.invalido = v.ok ? null : v;
  }
  edRender();
});

function paredeDoArrasto(d){
  const o=ordenarPontas(d.x0,d.z0,d.x1,d.z1);
  return { id:uid('w'), x1:o.x1, z1:o.z1, x2:o.x2, z2:o.z2, altura:'inteira', aberturas:[] };
}
function validarNovo(d){
  if(d.tipo==='novo-piso'){
    const x0=Math.min(d.x0,d.x1), x1=Math.max(d.x0,d.x1), z0=Math.min(d.z0,d.z1), z1=Math.max(d.z0,d.z1);
    if(x1-x0<LADO_MIN-EPS || z1-z0<LADO_MIN-EPS) return null;
    const v=validarModelo({ pisos:[...ED.m.pisos, {id:'_novo', nome:'Novo piso', x:x0, z:z0, w:x1-x0, d:z1-z0}], paredes:ED.m.paredes });
    return v.ok ? null : v;
  }
  const w=paredeDoArrasto(d);
  if(comprimento(w)<0.30-EPS) return null;
  const v=validarModelo({ pisos:ED.m.pisos, paredes:[...ED.m.paredes, w] });
  return v.ok ? null : v;
}

function fimArrasto(){
  if(ED.pan){ ED.pan=null; setTool(ED.tool); return; }
  const d=ED.drag; if(!d) return;
  ED.drag=null; ED.invalido=null; ED.snapHint=null;
  if(d.tipo==='travado'){ edRender(); return; }
  if(d.tipo==='novo-piso'){
    const x0=Math.min(d.x0,d.x1), x1=Math.max(d.x0,d.x1), z0=Math.min(d.z0,d.z1), z1=Math.max(d.z0,d.z1);
    if(!d.moveu){ edAviso('Arraste no vazio para desenhar o piso — ele nasce do ponto onde você clica até onde solta.'); edRender(); return; }
    if(x1-x0<LADO_MIN-EPS || z1-z0<LADO_MIN-EPS){ edAviso('Piso pequeno demais — o mínimo é 0,50 m de cada lado.', true); edRender(); return; }
    const piso={ id:uid('f'), nome:proximoNomeComodo(), x:r3(x0), z:r3(z0), w:r3(x1-x0), d:r3(z1-z0), molhado:false, travado:false };
    if(tentar(()=>ED.m.pisos.push(piso), 'Piso de '+fmt(piso.w)+' × '+fmt(piso.d)+' m criado — arraste para mover, puxe as bordas para redimensionar.')){
      ED.sel={tipo:'piso', id:piso.id}; edRender(); edPainel();
    }
    return;
  }
  if(d.tipo==='nova-parede'){
    const w=paredeDoArrasto(d);
    if(!d.moveu){ edAviso('Arraste para desenhar a parede.'); edRender(); return; }
    if(!ED.m.pisos.length){ edAviso('Desenhe um piso primeiro — toda parede fica sobre um piso.', true); edRender(); return; }
    if(comprimento(w)<0.30-EPS){ edAviso('Parede curta demais — arraste pelo menos 0,30 m.', true); edRender(); return; }
    if(tentar(()=>ED.m.paredes.push(w), 'Parede de '+fmt(comprimento(w))+' m criada.')){
      ED.sel={tipo:'parede', id:w.id}; edRender(); edPainel();
    }
    return;
  }
  if(!d.moveu){ edRender(); return; }
  if(d.tipo==='ponta'){   // mantém as pontas em ordem (portas contam a partir da ponta 1)
    const w=paredePorId(d.id);
    if(w){
      const o=ordenarPontas(w.x1,w.z1,w.x2,w.z2);
      if(o.x1!==w.x1 || o.z1!==w.z1){
        const L=comprimento(w);
        w.aberturas.forEach(a=>{ a.pos=r3(L-(a.pos+a.largura)); });
        Object.assign(w,o);
      }
    }
  }
  const v=validarModelo(ED.m);
  if(!v.ok){
    ED.m=JSON.parse(d.antes); validarSelecao();
    const extra = (d.tipo==='mover-piso' && d.travadasDentro) ? ' Há parede travada sobre esse piso — destrave-a para ela acompanhar.' : ' Voltou para onde estava.';
    edAviso(v.msg+extra, true);
  }
  else registrar(d.antes);
  edRender(); edPainel();
}
edSvg.addEventListener('pointerup', fimArrasto);
edSvg.addEventListener('pointercancel', fimArrasto);
edSvg.addEventListener('lostpointercapture', ()=>{ if(ED.drag || ED.pan) fimArrasto(); });
edSvg.addEventListener('pointerleave', ()=>{ if(!ED.drag && ED.snapHint){ ED.snapHint=null; edRender(); } });
edSvg.addEventListener('wheel', e=>{
  e.preventDefault();
  const p=doEvento(e); zoomEm(Math.exp(-e.deltaY*0.0015), p.sx, p.sy);
}, {passive:false});

const CURSOR_LADO={nw:'nwse-resize', se:'nwse-resize', ne:'nesw-resize', sw:'nesw-resize', n:'ns-resize', s:'ns-resize', e:'ew-resize', w:'ew-resize'};
function atualizarCursor(p){
  if(acharCadeado(p.sx,p.sy)){ edSvg.style.cursor='pointer'; if(ED.snapHint){ ED.snapHint=null; edRender(); } return; }
  const t=ED.tool;
  if(t==='parede'){
    const h=acharHandle(p.x,p.z);
    edSvg.style.cursor = h ? 'move' : 'crosshair';
    const antes=ED.snapHint;
    ED.snapHint = h ? null : snapInicioParede(p.x,p.z,null);
    if(JSON.stringify(antes)!==JSON.stringify(ED.snapHint)) edRender();
    return;
  }
  if(t==='porta' || t==='janela'){ edSvg.style.cursor='copy'; return; }
  const alvo = t==='piso' ? acharAlvo(p.x,p.z,{soPisos:true}) : acharAlvo(p.x,p.z);
  if(t==='piso' && !alvo){ edSvg.style.cursor='crosshair'; return; }
  const trav = alvo && ((alvo.tipo==='piso' && pisoPorId(alvo.id).travado) ||
               ((alvo.tipo==='parede'||alvo.tipo==='abertura') && paredePorId(alvo.id).travado));
  edSvg.style.cursor = !alvo ? 'grab'
    : trav ? 'not-allowed'
    : alvo.tipo==='handle-piso' ? CURSOR_LADO[alvo.lado]
    : alvo.tipo==='handle-parede' ? 'move' : 'move';
}

/* ---------- painel de propriedades ---------- */
function el(tag, props, ...kids){
  const n=document.createElement(tag);
  if(props) for(const k in props){
    const v=props[k];
    if(v===undefined || v===null || v===false) continue;
    if(k==='class') n.className=v;
    else if(k==='text') n.textContent=v;
    else if(k.slice(0,2)==='on') n.addEventListener(k.slice(2), v);
    else if(k==='value') n.value=v;
    else if(k==='checked') n.checked=!!v;
    else n.setAttribute(k, v===true ? '' : v);
  }
  kids.forEach(c=>{ if(c!==null && c!==undefined && c!==false) n.append(c); });
  return n;
}
function secao(titulo, ...kids){ return el('section', null, el('div',{class:'eyebrow', text:titulo}), ...kids); }
function campoNum(rotulo, valor, min, aoMudar){
  const inp=el('input',{type:'number', step:'0.05', min:String(min), value:String(r3(valor)), inputmode:'decimal'});
  inp.addEventListener('change',()=>{
    const v=Number(inp.value);
    if(!isFinite(v) || inp.value===''){ inp.value=String(r3(valor)); edAviso('Digite um número em metros, ex.: 3.20', true); return; }
    aoMudar(v);
  });
  return el('label',{class:'campo'}, el('span',{text:rotulo}), inp);
}
function seg(rotulo, opcoes, atual, aoMudar){
  const box=el('div',{class:'seg', role:'group', 'aria-label':rotulo});
  opcoes.forEach(([v,txt])=> box.append(el('button',{type:'button', 'aria-pressed':String(v===atual), text:txt, onclick:()=>{ if(v!==atual) aoMudar(v); }})));
  return box;
}
function resumoEditor(){
  const area=ED.m.pisos.reduce((s,p)=>s+p.w*p.d,0);
  const portas=ED.m.paredes.reduce((s,w)=>s+w.aberturas.filter(a=>a.tipo==='porta').length,0);
  const janelas=ED.m.paredes.reduce((s,w)=>s+w.aberturas.filter(a=>a.tipo==='janela').length,0);
  const q=(n,s,p)=>n+' '+(n===1?s:p);
  return q(ED.m.pisos.length,'cômodo','cômodos')+' · '+fmt(area)+' m² · '+q(ED.m.paredes.length,'parede','paredes')+' · '+q(portas,'porta','portas')+' · '+q(janelas,'janela','janelas');
}
/* Botão de trava do painel e bloqueio dos campos quando travado. */
function botaoTrava(tipo, obj){
  const b=el('button',{class:'btn'+(obj.travado?' primary':''), type:'button',
    text: obj.travado ? (tipo==='piso'?'Destravar piso':'Destravar parede') : (tipo==='piso'?'Travar piso':'Travar parede'),
    onclick:()=>alternarTrava(tipo, obj.id)});
  b.dataset.livre='1';
  return b;
}
function bloquearSeTravado(sec, obj, tipo){
  if(!obj.travado) return sec;
  sec.querySelectorAll('input,button').forEach(x=>{ if(!x.dataset.livre) x.disabled=true; });
  sec.insertBefore(el('p',{class:'ed-vazio', text:(tipo==='piso'?'Piso travado':'Parede travada')+' — destrave para mover, redimensionar ou excluir.'}), sec.children[1]);
  return sec;
}
function edPainel(){
  if(!ED.m) return;
  edPanel.innerHTML='';
  const alvo=acharSel();
  if(!alvo){
    edPanel.append(
      secao('Modelo', el('div',{class:'dado', text:resumoEditor()})),
      secao('Como montar',
        el('ol',null,
          el('li',null, el('b',{text:'Piso'}), ' — arraste no vazio para desenhar cada cômodo; arraste o piso para movê-lo e as bordas para redimensionar. Pisos não se sobrepõem e todos precisam encostar uns nos outros.'),
          el('li',null, el('b',{text:'Paredes no contorno'}), ' cria as paredes em todas as bordas de uma vez — ou desenhe com a ferramenta ', el('b',{text:'Parede'}), ', que pode sair do meio de outra parede e ser diagonal. Toda parede fica sobre um piso.'),
          el('li',null, el('b',{text:'Porta'}), ' e ', el('b',{text:'Janela'}), ' — clique numa parede. Selecione uma parede para trocar entre inteira e meia parede.'),
          el('li',null, 'O ', el('b',{text:'cadeado'}), ' no centro do piso (e no meio da parede selecionada) trava o que já está pronto.'),
          el('li',null, el('b',{text:'Ver em 3D'}), ' para conferir e ', el('b',{text:'Concluir modelo'}), ' para salvar e baixar o .json.')
        )
      ),
      secao('Vista',
        el('div',{class:'row'},
          el('button',{class:'btn', type:'button', text:'Enquadrar tudo', onclick:()=>{ ajustarVista(); edRender(); }}),
          el('button',{class:'btn ghost', type:'button', text:'Começar do zero', onclick:()=>{
            if(!ED.m.pisos.length && !ED.m.paredes.length) return;
            if(!confirm('Apagar todos os pisos e paredes deste rascunho? Dá para desfazer depois.')) return;
            const antes=snapshot(); ED.m.pisos=[]; ED.m.paredes=[]; registrar(antes); ED.sel=null;
            setTool('piso'); edRender(); edPainel();
          }})
        )
      )
    );
    return;
  }

  if(ED.sel.tipo==='piso'){
    const p=alvo;
    const nome=el('input',{class:'tin', value:p.nome, maxlength:'30', list:'edNomesComodo', spellcheck:'false', autocomplete:'off'});
    nome.addEventListener('change',()=>{
      const v=nome.value.trim()||'Cômodo';
      tentar(()=>{ p.nome=v.slice(0,30); if(NOMES_MOLHADOS.test(v)) p.molhado=true; });
    });
    const chk=el('input',{type:'checkbox', checked:p.molhado});
    chk.addEventListener('change',()=>tentar(()=>{ p.molhado=chk.checked; }));
    edPanel.append(bloquearSeTravado(secao('Piso',
      el('label',{class:'campo'}, el('span',{text:'Nome do cômodo'}), nome),
      el('label',{class:'check'}, chk, el('span',{text:'Área molhada — banheiro, cozinha, lavanderia, varanda. No 3D o piso sai um pouco mais frio.'})),
      el('div',{class:'par'},
        campoNum('Largura (m)', p.w, LADO_MIN, v=>tentar(()=>{ aplicarBordas(bordasDoPiso(p,'e'), p.x, p.z, p.x+grade(v), p.z+p.d); })),
        campoNum('Comprimento (m)', p.d, LADO_MIN, v=>tentar(()=>{ aplicarBordas(bordasDoPiso(p,'s'), p.x, p.z, p.x+p.w, p.z+grade(v)); }))
      ),
      el('div',{class:'dado', text:'Área: '+fmt(p.w*p.d)+' m²'}),
      el('div',{class:'row'}, botaoTrava('piso',p), el('button',{class:'btn ghost btn-del', type:'button', text:'Excluir piso', onclick:excluirSelecao}))
    ), p, 'piso'));
    return;
  }

  const w=paredePorId(ED.sel.id);
  if(ED.sel.tipo==='parede'){
    const L=comprimento(w), ux=(w.x2-w.x1)/L, uz=(w.z2-w.z1)/L;
    const ang=((Math.round(Math.atan2(-(w.z2-w.z1), w.x2-w.x1)*180/Math.PI)%180)+180)%180;
    const direcao = ehHoriz(w) ? 'horizontal' : Math.abs(w.x1-w.x2)<EPS ? 'vertical' : 'diagonal · '+ang+'°';
    const lista=el('div',{class:'ed-aberturas'});
    w.aberturas.slice().sort((a,b)=>a.pos-b.pos).forEach(a=>{
      lista.append(el('button',{class:'ed-ab', type:'button', onclick:()=>{ ED.sel={tipo:'abertura', id:w.id, aid:a.id}; edRender(); edPainel(); }},
        (a.tipo==='porta'?'Porta':'Janela')+' ', el('span',{class:'mono', text:fmt(a.largura)+' m · a '+fmt(a.pos)+' m do início'})));
    });
    edPanel.append(bloquearSeTravado(secao('Parede',
      el('div',{class:'par'},
        campoNum('Comprimento (m)', L, 0.1, v=>tentar(()=>{ const n=grade(v); w.x2=r3(w.x1+ux*n); w.z2=r3(w.z1+uz*n); })),
        el('div',{class:'campo'}, el('span',{text:'Direção'}), el('div',{class:'dado', style:'margin:8px 0 0', text:direcao}))
      ),
      el('div',{class:'campo'}, el('span',{text:'Altura'}),
        seg('Altura da parede', [['inteira','Inteira · 2,70 m'],['meia','Meia · 1,10 m']], w.altura, v=>tentar(()=>{ w.altura=v; }, v==='meia'?'Agora é meia parede (1,10 m).':'Agora é parede inteira (2,70 m).'))),
      el('div',{class:'eyebrow', style:'margin-top:16px', text:'Portas e janelas'}),
      w.aberturas.length ? lista : el('p',{class:'ed-vazio', text:'Nenhuma ainda. Use os botões abaixo ou as ferramentas Porta e Janela.'}),
      el('div',{class:'row'},
        el('button',{class:'btn', type:'button', text:'+ Porta', onclick:()=>adicionarAbertura(w.id,'porta',L/2)}),
        el('button',{class:'btn', type:'button', text:'+ Janela', disabled:w.altura==='meia', title:w.altura==='meia'?'Meia parede não comporta janela':null, onclick:()=>adicionarAbertura(w.id,'janela',L/2)})
      ),
      el('div',{class:'row', style:'margin-top:14px'}, botaoTrava('parede',w), el('button',{class:'btn ghost btn-del', type:'button', text:'Excluir parede', onclick:excluirSelecao}))
    ), w, 'parede'));
    return;
  }

  const a=alvo, L=comprimento(w);
  const voltar=el('button',{class:'btn', type:'button', text:'← Voltar à parede', onclick:()=>{ ED.sel={tipo:'parede', id:w.id}; edRender(); edPainel(); }});
  voltar.dataset.livre='1';
  edPanel.append(bloquearSeTravado(secao(a.tipo==='porta'?'Porta':'Janela',
    el('div',{class:'campo'}, el('span',{text:'Tipo'}),
      seg('Tipo de abertura', [['porta','Porta'],['janela','Janela']], a.tipo, v=>{
        if(v==='janela' && w.altura==='meia'){ edAviso('Meia parede não comporta janela.', true); return; }
        tentar(()=>{ a.tipo=v; });
      })),
    el('div',{class:'par'},
      campoNum('Largura (m)', a.largura, LARG_MIN, v=>tentar(()=>{ a.largura=grade(v); })),
      campoNum('Distância do início (m)', a.pos, 0, v=>tentar(()=>{ a.pos=grade(v); }))
    ),
    el('div',{class:'dado', text:'Parede de '+fmt(L)+' m · '+(a.tipo==='porta'?'altura 2,10 m':'peitoril 1,00 m, topo 2,20 m')}),
    el('div',{class:'row'},
      voltar,
      el('button',{class:'btn ghost btn-del', type:'button', text:'Remover', onclick:excluirSelecao})
    )
  ), w, 'parede'));
}

/* ---------- abrir / sair / concluir ---------- */
function abrirEditor(){
  let m=null;
  try{ m=normalizarModelo(JSON.parse(localStorage.getItem(RASCUNHO_KEY)||'null')); }catch(_){ m=null; }
  const recuperado=!!(m && (m.pisos.length || m.paredes.length));
  ED.m = recuperado ? m : modeloVazio();
  ED.sel=null; ED.undo=[]; ED.redo=[]; ED.drag=null; ED.pan=null; ED.invalido=null;
  edNome.value=ED.m.nome;
  mostrarTela('editor');
  setTool(ED.m.pisos.length ? 'selecionar' : 'piso');
  ajustarVista(); syncUndo(); edRender(); edPainel();
  if(recuperado) edAviso('Rascunho recuperado — continue de onde parou.', false, true);
}
function sairDoEditor(){
  if(ED.m) salvarRascunho();
  mostrarTela('home'); renderModelos();
}
async function concluirModelo(){
  const nome=edNome.value.trim();
  if(!nome){ edAviso('Dê um nome ao modelo antes de concluir.', true); edNome.focus(); return; }
  ED.m.nome=nome.slice(0,40);
  if(!ED.m.pisos.length){ edAviso('Desenhe pelo menos um piso.', true); return; }
  if(!ED.m.paredes.length){ edAviso('O modelo ainda não tem paredes — use “Paredes no contorno” ou a ferramenta Parede.', true); return; }
  const v=validarModelo(ED.m);
  if(!v.ok){ edAviso(v.msg, true); return; }
  const final=normalizarModelo(ED.m);
  final.id=uid('m'); final.atualizadoEm=new Date().toISOString();
  modelosCustom.push(final); salvarModelosCustom();
  try{ localStorage.removeItem(RASCUNHO_KEY); }catch(_){}
  const r=await baixarModelo(final);
  ED.m=null;
  mostrarTela('home'); renderModelos(); renderProjetos();
  avisoHome('“'+final.nome+'” foi salvo e já aparece em Novo projeto'+
    (r==='salvo' ? ' — o arquivo .json também foi baixado.'
     : r==='recusado' ? '. O download do .json foi cancelado; dá para baixar depois pelo cartão do modelo.'
     : '. Não deu para baixar o .json aqui; tente pelo cartão do modelo.'));
}

document.querySelectorAll('.ed-tool[data-tool]').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));
document.getElementById('edContorno').addEventListener('click', gerarContorno);
document.getElementById('edDesfazer').addEventListener('click', desfazer);
document.getElementById('edRefazer').addEventListener('click', refazer);
document.getElementById('edSair').addEventListener('click', sairDoEditor);
document.getElementById('edConcluir').addEventListener('click', concluirModelo);
document.getElementById('edPreview').addEventListener('click',()=>{
  if(!ED.m.pisos.length){ edAviso('Desenhe pelo menos um piso para ver em 3D.', true); return; }
  const v=validarModelo(ED.m); if(!v.ok){ edAviso(v.msg, true); return; }
  ED.m.nome=edNome.value.trim()||ED.m.nome;
  abrirPreview(ED.m);
});
document.getElementById('edZoomMais').addEventListener('click',()=>zoomEm(1.25, edWrap.clientWidth/2, edWrap.clientHeight/2));
document.getElementById('edZoomMenos').addEventListener('click',()=>zoomEm(0.8, edWrap.clientWidth/2, edWrap.clientHeight/2));
document.getElementById('edAjustar').addEventListener('click',()=>{ ajustarVista(); edRender(); });
edNome.addEventListener('input',()=>{ if(ED.m){ ED.m.nome=edNome.value.slice(0,40); salvarRascunho(); } });
new ResizeObserver(()=>edRender()).observe(edWrap);

window.addEventListener('keydown', e=>{
  if(document.getElementById('editor').hidden || !ED.m) return;
  const emCampo=/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);
  const k=e.key.toLowerCase();
  if((e.ctrlKey||e.metaKey) && k==='z'){ if(emCampo) return; e.preventDefault(); e.shiftKey ? refazer() : desfazer(); return; }
  if((e.ctrlKey||e.metaKey) && k==='y'){ if(emCampo) return; e.preventDefault(); refazer(); return; }
  if(emCampo || e.ctrlKey || e.metaKey || e.altKey) return;
  if(e.key==='Delete' || e.key==='Backspace'){ e.preventDefault(); excluirSelecao(); return; }
  if(e.key==='Escape'){
    if(ED.drag && ED.drag.antes){ ED.m=JSON.parse(ED.drag.antes); }
    ED.drag=null; ED.invalido=null; ED.sel=null; setTool('selecionar'); edRender(); edPainel(); return;
  }
  const passo=e.shiftKey?0.5:GRADE;
  const setas={arrowleft:[-passo,0], arrowright:[passo,0], arrowup:[0,-passo], arrowdown:[0,passo]};
  if(setas[k] && ED.sel && ED.sel.tipo!=='abertura'){ e.preventDefault(); moverSelecao(setas[k][0], setas[k][1]); return; }
  const mapa={v:'selecionar', p:'piso', w:'parede', d:'porta', j:'janela'};
  if(mapa[k]) setTool(mapa[k]);
});
