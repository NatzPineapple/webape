// Pintura: aplicar cores, paleta Suvinil, meia parede, esquemas, cômodos e controles da vista
"use strict";

const FAM_COR  = ['#EFEDE8','#9A9A97','#E8C55E','#D98A3D','#B23B33','#D08398','#7E6796','#3C6E9F','#4E7C55','#7A5A44'];
const POR_HEX = new Map(CORES.map(c => [('#'+c[2]).toUpperCase(), c]));

/* ============================================================
   Pintura + UI
   ============================================================ */
const ORI = n => Math.abs(n[0])>Math.abs(n[1]) ? (n[0]>0?'leste':'oeste') : (n[1]>0?'sul':'norte');
function faceLabel(w,s){
  const wi=wallInfo[w];
  const ri=wi.sides[s];
  const nor = s===0 ? wi.nor : [-wi.nor[0],-wi.nor[1]];
  // a parede olha para o cômodo; a face voltada ao norte é a parede sul do cômodo
  const facing = ORI(nor);
  const opp = {norte:'sul', sul:'norte', leste:'oeste', oeste:'leste'}[facing];
  return { room: ri>=0 ? ROOMS[ri].name : 'Fachada externa', side: 'parede '+opp, ri };
}

function paint(list, color){
  const entry = [];
  list.forEach(({w,s})=>{
    const up = colors[w][s], low = lower[w][s];
    let nUp = up, nLow = low;
    if(faixa==='toda'){ nUp = color; nLow = null; }
    else if(faixa==='baixo'){ nLow = (color===up) ? null : color; }
    else { nUp = color; if(low===null) nLow = up; if(nLow===color) nLow = null; }
    if(nUp===up && nLow===low) return;
    entry.push({w,s,prevUp:up,prevLow:low});
    colors[w][s]=nUp; lower[w][s]=nLow;
  });
  if(!entry.length) return;
  undoStack.push(entry);
  pushRecente(color);
  save(); syncRooms(); syncSel(); syncRecentes(); syncFora(); invalidate();
  document.getElementById('btnUndo').disabled = false;
}
function pushRecente(hex){
  const c = hex.toUpperCase();
  recentes = [c, ...recentes.filter(x=>x.toUpperCase()!==c)].slice(0, MAX_RECENTES);
}
function facesOfRoom(ri){
  const out=[];
  wallInfo.forEach((wi,i)=>{ wi.sides.forEach((r,s)=>{ if(r===ri) out.push({w:i,s}); }); });
  return out;
}
function applyColor(color){
  if(!color) return;
  if(scopeRoom && sel){
    const {ri} = faceLabel(sel.w,sel.s);
    if(ri>=0){ paint(facesOfRoom(ri), color); return; }
  }
  if(sel) paint([sel], color);
}

function selectFace(hit){
  sel = hit;
  if(hit && activeColor) applyColor(activeColor);
  syncSel(); invalidate();
}

const selBox = document.getElementById('selBox');
function syncSel(){
  if(!sel){
    selBox.className='empty';
    selBox.textContent='Nenhuma parede selecionada. Clique numa face dentro do apartamento.';
    return;
  }
  const {room,side} = faceLabel(sel.w,sel.s);
  const up = colors[sel.w][sel.s], low = lower[sel.w][sel.s];
  selBox.className='sel';
  selBox.innerHTML = '';
  const chip=document.createElement('div'); chip.className='chip';
  if(low){
    const pct = Math.round(Math.min(1, hMeia/H)*100);
    chip.style.background = 'linear-gradient(to top, '+low+' 0 '+pct+'%, '+up+' '+pct+'% 100%)';
  } else {
    chip.style.background = up;
  }
  const meta=document.createElement('div'); meta.className='meta';
  const nm=document.createElement('div'); nm.className='name'; nm.textContent=room;
  const wh=document.createElement('div'); wh.className='where'; wh.textContent=side;
  const hx=document.createElement('div'); hx.className='hex';
  const rotulo = c => c.toUpperCase() + (nameOf(c) ? ' · '+nameOf(c) : '');
  hx.textContent = low
    ? 'cima ' + rotulo(up) + '  ·  baixo ' + rotulo(low)
    : rotulo(up);
  meta.append(nm,wh,hx); selBox.append(chip,meta);
}
function corDe(hex){ return POR_HEX.get(String(hex).toUpperCase()) || null; }
function nameOf(hex){ const c=corDe(hex); return c ? c[0]+' '+c[1] : null; }

// --- Lab, para achar a Suvinil mais próxima de uma cor qualquer ---
function hex2lab(hex){
  let [r,g,b]=hex2rgb(hex);
  const f=c=> c<=0.04045 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4);
  r=f(r); g=f(g); b=f(b);
  let X=(0.4124*r+0.3576*g+0.1805*b)/0.95047,
      Y=(0.2126*r+0.7152*g+0.0722*b),
      Z=(0.0193*r+0.1192*g+0.9505*b)/1.08883;
  const t=v=> v>0.008856 ? Math.cbrt(v) : (7.787*v + 16/116);
  X=t(X); Y=t(Y); Z=t(Z);
  return [116*Y-16, 500*(X-Y), 200*(Y-Z)];
}
const CORES_LAB = CORES.map(c=>hex2lab('#'+c[2]));
function maisProxima(hex){
  const [L,A,B]=hex2lab(hex);
  let melhor=0, dist=Infinity;
  for(let i=0;i<CORES_LAB.length;i++){
    const l=CORES_LAB[i];
    const d=(L-l[0])*(L-l[0]) + (A-l[1])*(A-l[1]) + (B-l[2])*(B-l[2]);
    if(d<dist){ dist=d; melhor=i; }
  }
  return { cor: CORES[melhor], dE: Math.sqrt(dist) };
}

// paleta
const swWrap=document.getElementById('swatches'), swName=document.getElementById('swName');
const famsBox=document.getElementById('fams'), palCount=document.getElementById('palCount');
const buscaInput=document.getElementById('corBusca');
const customInput=document.getElementById('custom');
const hexInput=document.getElementById('hexInput');
const hexHint=document.getElementById('hexHint');
const MAX_MOSTRA = 400;
let famAtiva = -1, busca = '';

function normHex(s){
  let v=String(s).trim().replace(/^#/,'');
  if(/^[0-9a-fA-F]{3}$/.test(v)) v=v.split('').map(c=>c+c).join('');
  return /^[0-9a-fA-F]{6}$/.test(v) ? '#'+v.toUpperCase() : null;
}
function hexOk(msg){
  hexInput.classList.remove('bad'); hexHint.classList.remove('bad');
  hexHint.textContent = msg || 'busca a Suvinil mais próxima';
}
function setActive(hex){
  activeColor = hex.toUpperCase(); activeName = nameOf(activeColor);
  [...swWrap.children].forEach(b=>
    b.setAttribute('aria-pressed', String(b.dataset.hex===activeColor)));
  restoreSwName();
  customInput.value = activeColor.toLowerCase();
  if(document.activeElement !== hexInput) hexInput.value = activeColor;
  hexOk();
}
function clearActive(){
  activeColor=null; activeName=null;
  [...swWrap.children].forEach(b=>b.setAttribute('aria-pressed','false'));
  restoreSwName(); hexInput.value=''; hexOk();
}
function restoreSwName(){
  swName.textContent = activeColor
    ? (activeName || 'Fora do catálogo') + ' · ' + activeColor + ' — clique nas paredes para pintar'
    : 'Nenhuma cor ativa — clicar numa parede só seleciona.';
}
function filtradas(){
  const q = busca.trim().toLowerCase();
  return CORES.filter(c =>
    (famAtiva<0 || c[3]===famAtiva) &&
    (!q || c[0].toLowerCase().includes(q) || c[1].toLowerCase().includes(q))
  );
}
function renderPaleta(){
  const lista = filtradas();
  swWrap.innerHTML='';
  lista.slice(0,MAX_MOSTRA).forEach(c=>{
    const hex='#'+c[2];
    const b=document.createElement('button');
    b.className='sw'; b.type='button'; b.style.background=hex; b.dataset.hex=hex;
    b.title=c[0]+' · '+c[1]+' · '+hex;
    b.setAttribute('aria-label',c[0]+', código '+c[1]);
    b.setAttribute('aria-pressed', String(activeColor===hex));
    b.addEventListener('click',()=>{
      if(activeColor===hex){ clearActive(); return; }
      setActive(hex); applyColor(hex);
    });
    b.addEventListener('mouseenter',()=>{ swName.textContent = c[0]+' · '+c[1]+' · '+hex; });
    swWrap.appendChild(b);
  });
  palCount.textContent = lista.length > MAX_MOSTRA
    ? MAX_MOSTRA+' de '+lista.length+' cores'
    : lista.length+(lista.length===1?' cor':' cores');
}
function renderFamilias(){
  famsBox.innerHTML='';
  const faz=(rotulo,idx,cor)=>{
    const b=document.createElement('button');
    b.className='fam'; b.type='button';
    b.setAttribute('aria-pressed', String(famAtiva===idx));
    if(cor){ const i=document.createElement('i'); i.style.background=cor; b.appendChild(i); }
    b.appendChild(document.createTextNode(rotulo));
    b.addEventListener('click',()=>{ famAtiva = (famAtiva===idx ? -1 : idx); renderFamilias(); renderPaleta(); });
    famsBox.appendChild(b);
  };
  faz('Todas', -1, null);
  FAMILIAS.forEach((f,i)=>faz(f,i,FAM_COR[i]));
}
// cores herdadas que não existem no catálogo Suvinil
function foraDoCatalogo(){
  const fora=[];
  colors.forEach((par,i)=>par.forEach((c,s)=>{
    if(c && !corDe(c)) fora.push({w:i,s,onde:'cima'});
    const l=lower[i][s];
    if(l && !corDe(l)) fora.push({w:i,s,onde:'baixo'});
  }));
  return fora;
}
function syncFora(){
  const nota=document.getElementById('foraNota');
  const fora=foraDoCatalogo();
  if(!fora.length){ nota.hidden=true; nota.textContent=''; return; }
  nota.hidden=false; nota.textContent='';
  const n=new Set(fora.map(f=>f.onde==='cima'?colors[f.w][f.s]:lower[f.w][f.s])).size;
  nota.appendChild(document.createTextNode(
    n+(n===1?' cor pintada não existe':' cores pintadas não existem')+' no catálogo Suvinil. '));
  const b=document.createElement('button');
  b.className='btn'; b.type='button'; b.style.marginTop='6px';
  b.textContent='Trocar pelas Suvinil mais próximas';
  b.addEventListener('click',()=>{
    const entry=[];
    const alvos=new Map();
    foraDoCatalogo().forEach(f=>{
      const atual = f.onde==='cima' ? colors[f.w][f.s] : lower[f.w][f.s];
      if(!alvos.has(atual)) alvos.set(atual, '#'+maisProxima(atual).cor[2]);
      const nova=alvos.get(atual);
      if(!entry.some(e=>e.w===f.w&&e.s===f.s)) entry.push({w:f.w,s:f.s,prevUp:colors[f.w][f.s],prevLow:lower[f.w][f.s]});
      if(f.onde==='cima') colors[f.w][f.s]=nova; else lower[f.w][f.s]=nova;
    });
    if(entry.length){ undoStack.push(entry); document.getElementById('btnUndo').disabled=false; }
    save(); syncRooms(); syncSel(); syncFora(); invalidate();
  });
  nota.appendChild(document.createElement('br'));
  nota.appendChild(b);
}
function syncRecentes(){
  const wrap=document.getElementById('recentWrap'), box=document.getElementById('recents');
  wrap.hidden = recentes.length===0;
  box.innerHTML='';
  recentes.forEach(hex=>{
    const b=document.createElement('button');
    b.className='rc'; b.type='button'; b.style.background=hex;
    const rot = nameOf(hex) || 'Fora do catálogo';
    b.title = rot+' · '+hex;
    b.setAttribute('aria-label','Reaplicar '+rot);
    b.addEventListener('click',()=>{ setActive(hex); applyColor(hex); });
    box.appendChild(b);
  });
}
buscaInput.addEventListener('input',()=>{ busca=buscaInput.value; renderPaleta(); });
swWrap.addEventListener('mouseleave', restoreSwName);

// entrada por código/seletor: sempre cai numa cor real do catálogo
function aplicarAproximada(hex, origem){
  const exata = corDe(hex);
  if(exata){ setActive('#'+exata[2]); applyColor('#'+exata[2]); hexOk(); return; }
  const {cor,dE} = maisProxima(hex);
  const h='#'+cor[2];
  setActive(h); applyColor(h);
  hexHint.textContent = 'mais próxima: '+cor[0]+' '+cor[1];
  if(origem==='hex') hexInput.value = h;
}
customInput.addEventListener('input',()=>{
  const h=normHex(customInput.value); if(!h) return;
  aplicarAproximada(h,'seletor');
});
hexInput.addEventListener('input',()=>{
  const raw=hexInput.value.trim();
  if(!raw){ hexOk('digite um código, ex.: #C8A27A'); return; }
  const h=normHex(raw);
  if(h) aplicarAproximada(h,'hex');
  else { hexInput.classList.add('bad'); hexHint.classList.add('bad');
         hexHint.textContent='use 6 dígitos de 0-9 e A-F'; }
});
hexInput.addEventListener('blur',()=>{
  if(activeColor){ hexInput.value=activeColor; } else { hexInput.value=''; hexOk(); }
});
hexInput.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); hexInput.blur(); } });

// esquemas salvos
const schemeName = document.getElementById('schemeName');
const schemesBox = document.getElementById('schemes');
function resumo(cs){
  const conta = {};
  cs.forEach((par,i)=>par.forEach((c,s)=>{ if(wallInfo[i] && wallInfo[i].sides[s]>=0) conta[c]=(conta[c]||0)+1; }));
  return Object.keys(conta).sort((a,b)=>conta[b]-conta[a]).slice(0,6);
}
function syncEsquemas(){
  schemesBox.innerHTML='';
  esquemas.forEach(es=>{
    const row=document.createElement('div'); row.className='scheme';
    const load=document.createElement('button'); load.type='button'; load.className='load';
    load.title='Aplicar este esquema';
    const strip=document.createElement('span'); strip.className='strip';
    resumo(es.colors).forEach(c=>{ const i=document.createElement('i'); i.style.background=c; strip.appendChild(i); });
    const nm=document.createElement('span'); nm.className='nm'; nm.textContent=es.nome;
    load.append(strip,nm);
    load.addEventListener('click',()=>carregarEsquema(es));
    const del=document.createElement('button'); del.type='button'; del.className='del';
    del.textContent='×'; del.title='Apagar "'+es.nome+'"';
    del.setAttribute('aria-label','Apagar esquema '+es.nome);
    del.addEventListener('click',()=>{
      esquemas = esquemas.filter(x=>x.id!==es.id);
      save(); syncEsquemas();
    });
    row.append(load,del);
    schemesBox.appendChild(row);
  });
}
function carregarEsquema(es){
  const entry=[];
  const esLow = Array.isArray(es.lower) ? es.lower : colors.map(()=>[null,null]);
  colors.forEach((par,i)=>par.forEach((c,s)=>{
    const nUp = (es.colors[i] && es.colors[i][s]) || c;
    const nLow = (esLow[i] && esLow[i][s]) || null;
    if(nUp!==c || nLow!==lower[i][s]) entry.push({w:i,s,prevUp:c,prevLow:lower[i][s]});
  }));
  if(entry.length){ undoStack.push(entry); document.getElementById('btnUndo').disabled=false; }
  colors = es.colors.map(par=>par.slice());
  lower = esLow.map(par=>par.slice());
  if(typeof es.hMeia==='number') setMeia(es.hMeia);
  if(es.floorId && PISOS[es.floorId]){ floorId=es.floorId; floorSel.value=floorId; }
  save(); syncRooms(); syncSel(); invalidate();
}
document.getElementById('btnSave').addEventListener('click',()=>{
  const nome = (schemeName.value || '').trim() || 'Esquema ' + (esquemas.length + 1);
  esquemas = [{ id: Date.now().toString(36), nome, floorId, hMeia, colors: colors.map(p=>p.slice()), lower: lower.map(p=>p.slice()) },
              ...esquemas].slice(0, 12);
  schemeName.value='';
  save(); syncEsquemas();
});
schemeName.addEventListener('keydown',e=>{
  if(e.key==='Enter'){ e.preventDefault(); document.getElementById('btnSave').click(); }
});

// escopo
const bFace=document.getElementById('scopeFace'), bRoom=document.getElementById('scopeRoom');
function setScope(r){ scopeRoom=r; bFace.setAttribute('aria-pressed',String(!r)); bRoom.setAttribute('aria-pressed',String(r)); }
bFace.onclick=()=>setScope(false); bRoom.onclick=()=>setScope(true);

// faixa da parede (meia parede)
const bToda=document.getElementById('faixaToda'), bBaixo=document.getElementById('faixaBaixo'),
      bCima=document.getElementById('faixaCima'), meiaCtl=document.getElementById('meiaCtl'),
      meiaR=document.getElementById('meia'), meiaV=document.getElementById('meiaVal');
function setFaixa(f){
  faixa=f;
  bToda.setAttribute('aria-pressed', String(f==='toda'));
  bBaixo.setAttribute('aria-pressed', String(f==='baixo'));
  bCima.setAttribute('aria-pressed', String(f==='cima'));
  meiaCtl.hidden = (f==='toda');
}
bToda.onclick=()=>setFaixa('toda'); bBaixo.onclick=()=>setFaixa('baixo'); bCima.onclick=()=>setFaixa('cima');
function setMeia(h){
  hMeia = Math.min(2.20, Math.max(0.40, h));
  meiaR.value = hMeia;
  meiaV.textContent = hMeia.toFixed(2).replace('.',',')+' m';
  syncSel();
}
meiaR.addEventListener('input',()=>{ setMeia(parseFloat(meiaR.value)); save(); invalidate(); });

// cômodos
const roomsWrap=document.getElementById('rooms');
let roomEls = [];
function construirComodos(){
roomsWrap.innerHTML='';
roomEls = ROOMS.map((r,i)=>{
  const b=document.createElement('button'); b.className='room'; b.type='button';
  const dot=document.createElement('span'); dot.className='dot';
  const nm=document.createElement('span'); nm.className='rn'; nm.textContent=r.name;
  const ar=document.createElement('span'); ar.className='ra';
  ar.textContent = r.area.toFixed(1).replace(".",",")+" m²";
  b.append(dot,nm,ar);
  b.addEventListener('click',()=>{
    if(!activeColor){ swName.textContent='Escolha uma cor na paleta primeiro.'; return; }
    paint(facesOfRoom(i), activeColor);
  });
  roomsWrap.appendChild(b);
  return {b,dot};
});
}
construirComodos();
function syncRooms(){
  ROOMS.forEach((r,i)=>{
    const faces=facesOfRoom(i);
    const tally={};
    faces.forEach(f=>{ const c=colors[f.w][f.s]; tally[c]=(tally[c]||0)+1; });
    let best=BASE_IN, n=-1;
    for(const k in tally) if(tally[k]>n){ n=tally[k]; best=k; }
    roomEls[i].dot.style.background=best;
  });
}
function resumoModelo(rooms=ROOMS){
  const m2 = rooms.reduce((s,r)=>s+r.area,0).toFixed(0).replace('.',',')+' m²';
  const nq = rooms.filter(r=>/^quarto/i.test(r.name)).length;
  const partes = [];
  if(nq) partes.push(nq + (nq===1 ? ' quarto' : ' quartos'));
  if(rooms.some(r=>/^su[ií]te/i.test(r.name))) partes.push('suíte');
  if(!partes.length) partes.push(rooms.length + (rooms.length===1 ? ' cômodo' : ' cômodos'));
  return m2+' · '+partes.join(' + ');
}
document.getElementById('areaBadge').textContent = resumoModelo();

// vista
const cutR=document.getElementById('cut'), cutV=document.getElementById('cutVal');
cutR.addEventListener('input',()=>{
  cut=parseFloat(cutR.value);
  cutV.textContent = cut.toFixed(2).replace('.',',')+' m';
  invalidate();
});
const floorSel = document.getElementById('floor');
Object.keys(PISOS).forEach(id=>{
  const o=document.createElement('option'); o.value=id; o.textContent=PISOS[id].nome; floorSel.appendChild(o);
});
floorSel.value = floorId;
floorSel.addEventListener('change',e=>{ floorId=e.target.value; save(); invalidate(); });
document.getElementById('btnReset').addEventListener('click',()=>{ Object.assign(cam,HOME); invalidate(); });
const btnCenter = document.getElementById('btnCenter');
function centralizar(){
  cam.tx=CENTER[0]; cam.tz=CENTER[2]; clampCam(); syncCenterBtn(); invalidate();
}
function syncCenterBtn(){ btnCenter.disabled = noCentro(); }
btnCenter.addEventListener('click', centralizar);
document.getElementById('btnTop').addEventListener('click',()=>{
  cam.az=0; cam.el=1.5; cam.r=HOME.r*0.9; cam.tx=CENTER[0]; cam.tz=CENTER[2]; clampCam(); invalidate();
});
const btnLabels = document.getElementById('btnLabels');
function setLabels(on){
  showLabels = on;
  btnLabels.setAttribute('aria-pressed', String(on));
  btnLabels.textContent = on ? 'Ocultar nomes' : 'Mostrar nomes';
  save(); invalidate();
}
btnLabels.addEventListener('click',()=>setLabels(!showLabels));
document.getElementById('btnUndo').addEventListener('click',()=>{
  const e=undoStack.pop(); if(!e) return;
  e.forEach(x=>{ colors[x.w][x.s]=x.prevUp; lower[x.w][x.s]=x.prevLow; });
  document.getElementById('btnUndo').disabled = undoStack.length===0;
  save(); syncRooms(); syncSel(); invalidate();
});
document.getElementById('btnClear').addEventListener('click',()=>{
  const all=[]; wallInfo.forEach((wi,i)=>wi.sides.forEach((r,s)=>all.push({w:i,s})));
  const entry=all.map(({w,s})=>({w,s,prevUp:colors[w][s],prevLow:lower[w][s]}));
  undoStack.push(entry);
  wallInfo.forEach((wi,i)=>{ colors[i]=[wi.sides[0]>=0?BASE_IN:BASE_OUT, wi.sides[1]>=0?BASE_IN:BASE_OUT]; lower[i]=[null,null]; });
  document.getElementById('btnUndo').disabled=false;
  save(); syncRooms(); syncSel(); invalidate();
});
window.addEventListener('keydown',e=>{
  if(document.querySelector('.app').hidden) return;
  if(/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
  if(e.key==='Escape'){ sel=null; syncSel(); invalidate(); }
  if(e.key==='r'||e.key==='R'){ Object.assign(cam,HOME); invalidate(); }
  if(e.key==='n'||e.key==='N'){ setLabels(!showLabels); }
  if(e.key==='c'||e.key==='C'){ centralizar(); }
});
new ResizeObserver(()=>invalidate()).observe(canvas);
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',()=>invalidate());
