// Visor 3D: geometria das paredes, WebGL, câmera, seleção por clique e rótulos
"use strict";

const BASE_IN = "#ECEAE3", BASE_OUT = "#D8D3CA";  // Alpes Suíços A203 / Papel Picado B148

/* ============================================================
   Geometria
   ============================================================ */
const V = [];               // pos(3) nor(3) side(1)
const wallInfo = [];        // {start,count,sides:[roomIdxA,roomIdxB],dir,nor}

function push(p,n,s){ V.push(p[0],p[1],p[2], n[0],n[1],n[2], s); }

function quad(P, a,b,c,d, n, s){
  push(P(a),n,s); push(P(b),n,s); push(P(c),n,s);
  push(P(a),n,s); push(P(c),n,s); push(P(d),n,s);
}

function box(w, u0,u1, y0,y1){
  const dx=w.x2-w.x1, dz=w.z2-w.z1, L=Math.hypot(dx,dz);
  const d=[dx/L,dz/L], n=[d[1],-d[0]], hv=w.t/2;
  const P = (c)=>[ w.x1 + d[0]*c[0] + n[0]*c[1], c[2], w.z1 + d[1]*c[0] + n[1]*c[1] ];
  const A=(u,v,y)=>[u,v,y];
  // face +n (lado 0) e -n (lado 1)
  quad(P, A(u0,hv,y0),A(u1,hv,y0),A(u1,hv,y1),A(u0,hv,y1), [n[0],0,n[1]], 0);
  quad(P, A(u0,-hv,y0),A(u1,-hv,y0),A(u1,-hv,y1),A(u0,-hv,y1), [-n[0],0,-n[1]], 1);
  // topo
  quad(P, A(u0,-hv,y1),A(u1,-hv,y1),A(u1,hv,y1),A(u0,hv,y1), [0,1,0], 2);
  // topos laterais
  quad(P, A(u1,-hv,y0),A(u1,hv,y0),A(u1,hv,y1),A(u1,-hv,y1), [d[0],0,d[1]], 2);
  quad(P, A(u0,-hv,y0),A(u0,hv,y0),A(u0,hv,y1),A(u0,-hv,y1), [-d[0],0,-d[1]], 2);
}

function roomAt(x,z){
  for(let i=0;i<ROOMS.length;i++){
    const r=ROOMS[i];
    for(const q of r.rects) if(x>q[0] && x<q[2] && z>q[1] && z<q[3]) return i;
  }
  return -1;
}

function construirGeometria(){
V.length = 0; wallInfo.length = 0; FL.length = 0;
for(const w of WALLS){
  const start = V.length/7;
  const dx=w.x2-w.x1, dz=w.z2-w.z1, L=Math.hypot(dx,dz);
  const d=[dx/L,dz/L], n=[d[1],-d[0]];
  const gaps = w.gaps.map(g=>[Math.max(0,g[0]),Math.min(L,g[1]),g[2]])
                     .filter(g=>g[1]>g[0]).sort((a,b)=>a[0]-b[0]);
  let cur = 0;
  for(const g of gaps){
    if(g[0]>cur) box(w, cur, g[0], 0, w.h);
    if(g[2]==='d'){ if(w.h>DOOR_H) box(w, g[0], g[1], DOOR_H, w.h); }
    else { box(w, g[0], g[1], 0, Math.min(WIN_LO,w.h));
           if(w.h>WIN_HI) box(w, g[0], g[1], WIN_HI, w.h); }
    cur = g[1];
  }
  if(cur < L) box(w, cur, L, 0, w.h);

  const mx=(w.x1+w.x2)/2, mz=(w.z1+w.z2)/2, off=w.t/2+0.25;
  wallInfo.push({
    start, count: V.length/7 - start,
    sides: [ roomAt(mx+n[0]*off, mz+n[1]*off), roomAt(mx-n[0]*off, mz-n[1]*off) ],
    nor: n
  });
}

flDry.start=0; ROOMS.forEach(r=>{ if(!r.wet) floorQuad(r); }); flDry.count=FL.length/7;
flWet.start=FL.length/7; ROOMS.forEach(r=>{ if(r.wet) floorQuad(r); }); flWet.count=FL.length/7-flWet.start;
}

// pisos (dois lotes: seco / molhado)
const FL = [];
const flDry={start:0,count:0}, flWet={start:0,count:0};
function floorQuad(r){
  const y=0.01;
  for(const q of r.rects){
    const p=[[q[0],y,q[1]],[q[2],y,q[1]],[q[2],y,q[3]],[q[0],y,q[3]]];
    const t=[p[0],p[1],p[2],p[0],p[2],p[3]];
    for(const v of t) FL.push(v[0],v[1],v[2], 0,1,0, 2);
  }
}
construirGeometria();

/* ============================================================
   WebGL
   ============================================================ */
const canvas = document.getElementById('gl');
const gl = canvas.getContext('webgl', {antialias:true, alpha:false});
if(!gl){ document.querySelector('.view').innerHTML = '<p style="padding:24px">Seu navegador não conseguiu abrir o WebGL, que é o que desenha o 3D aqui.</p>'; }

function sh(type,src){
  const s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function prog(vs,fs){
  const p=gl.createProgram();
  gl.attachShader(p,sh(gl.VERTEX_SHADER,vs)); gl.attachShader(p,sh(gl.FRAGMENT_SHADER,fs));
  gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

const HAS_DERIV = !!gl.getExtension('OES_standard_derivatives');
const VS = `
attribute vec3 aPos; attribute vec3 aNor; attribute float aSide;
uniform mat4 uVP; uniform vec3 uC0,uC1,uC2; uniform vec3 uL0,uL1; uniform float uSel,uHov;
varying vec3 vN; varying vec3 vC; varying vec3 vCL; varying float vS; varying float vH; varying vec3 vW;
void main(){
  vN = aNor;
  vC  = aSide < 0.5 ? uC0 : (aSide < 1.5 ? uC1 : uC2);
  vCL = aSide < 0.5 ? uL0 : (aSide < 1.5 ? uL1 : uC2);
  vS = abs(aSide - uSel) < 0.25 ? 1.0 : 0.0;
  vH = abs(aSide - uHov) < 0.25 ? 1.0 : 0.0;
  vW = aPos;
  gl_Position = uVP * vec4(aPos, 1.0);
}`;
const FS = (HAS_DERIV ? '#extension GL_OES_standard_derivatives : enable\n' : '') + `
precision mediump float;
varying vec3 vN; varying vec3 vC; varying vec3 vCL; varying float vS; varying float vH; varying vec3 vW;
uniform float uCut; uniform vec3 uAccent; uniform float uMeia;
uniform float uPiso; uniform vec2 uTile; uniform float uOffset; uniform vec3 uRejunte;
float hash21(vec2 p){ return fract(sin(dot(p, vec2(41.37, 289.13))) * 43758.5453); }
void main(){
  if (vW.y > uCut + 0.0005) discard;
  vec3 N = normalize(vN);
  vec3 base = vW.y < uMeia ? vCL : vC;
  if (uPiso > 0.5) {
    vec2 p = vW.xz;
    p.x += uOffset * floor(p.y / uTile.y);
    vec2 f = fract(p / uTile);
    vec2 d = min(f, 1.0 - f) * uTile;
    float g = min(d.x, d.y);
    float aa = ${HAS_DERIV ? 'fwidth(g) + 0.0006' : '0.0035'};
    float linha = 1.0 - smoothstep(0.004, 0.004 + aa, g);
    base *= 1.0 + (hash21(floor(p / uTile)) - 0.5) * 0.045;
    base = mix(base, uRejunte, linha * 0.9);
  }
  float d = max(dot(N, normalize(vec3(0.42,0.82,0.38))), 0.0) * 0.62
          + max(dot(N, normalize(vec3(-0.55,0.30,-0.62))), 0.0) * 0.20;
  float amb = 0.44 + 0.13 * (N.y * 0.5 + 0.5);
  vec3 c = base * (amb + d);
  c = mix(c, mix(c, uAccent, 0.42) * 1.05, vS);
  c = mix(c, c * 1.10 + 0.02, vH * (1.0 - vS));
  gl_FragColor = vec4(pow(clamp(c, 0.0, 1.0), vec3(0.4545)), 1.0);
}`;
const PVS = `
attribute vec3 aPos; attribute float aSide;
uniform mat4 uVP; varying float vS; varying float vY;
void main(){ vS = aSide; vY = aPos.y; gl_Position = uVP * vec4(aPos,1.0); }`;
const PFS = `
precision mediump float; varying float vS; varying float vY;
uniform float uId; uniform float uCut;
void main(){
  if (vY > uCut + 0.0005) discard;
  if (vS > 1.5) discard;
  gl_FragColor = vec4(uId/255.0, vS/255.0, 0.0, 1.0);
}`;

const P1 = prog(VS,FS), P2 = prog(PVS,PFS);
const U1 = {}; ["uVP","uC0","uC1","uC2","uL0","uL1","uSel","uHov","uCut","uAccent","uMeia","uPiso","uTile","uOffset","uRejunte"].forEach(k=>U1[k]=gl.getUniformLocation(P1,k));
const U2 = {}; ["uVP","uId","uCut"].forEach(k=>U2[k]=gl.getUniformLocation(P2,k));

const bufWalls = gl.createBuffer();
const bufFloor = gl.createBuffer();
function enviarBuffers(){
  gl.bindBuffer(gl.ARRAY_BUFFER,bufWalls); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(V),gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER,bufFloor); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(FL),gl.STATIC_DRAW);
}
enviarBuffers();

function bindAttribs(p){
  const S=28;
  const a=gl.getAttribLocation(p,"aPos"); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a,3,gl.FLOAT,false,S,0);
  const nL=gl.getAttribLocation(p,"aNor");
  if(nL>=0){ gl.enableVertexAttribArray(nL); gl.vertexAttribPointer(nL,3,gl.FLOAT,false,S,12); }
  const s=gl.getAttribLocation(p,"aSide"); gl.enableVertexAttribArray(s); gl.vertexAttribPointer(s,1,gl.FLOAT,false,S,24);
}

// framebuffer de seleção
let pickFB=null, pickTex=null, pickRB=null, pickW=0, pickH=0;
function ensurePick(w,h){
  if(pickFB && pickW===w && pickH===h) return;
  if(pickFB){ gl.deleteFramebuffer(pickFB); gl.deleteTexture(pickTex); gl.deleteRenderbuffer(pickRB); }
  pickW=w; pickH=h;
  pickTex=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,pickTex);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  pickRB=gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER,pickRB);
  gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,w,h);
  pickFB=gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER,pickFB);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,pickTex,0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,pickRB);
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
}

/* ---------------- matrizes ---------------- */
function mul(a,b){
  const o=new Float32Array(16);
  for(let c=0;c<4;c++) for(let r=0;r<4;r++){
    o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];
  }
  return o;
}
function persp(fov,asp,n,f){
  const t=1/Math.tan(fov/2), o=new Float32Array(16);
  o[0]=t/asp; o[5]=t; o[10]=(f+n)/(n-f); o[11]=-1; o[14]=2*f*n/(n-f);
  return o;
}
function lookAt(e,c,up){
  const z=[e[0]-c[0],e[1]-c[1],e[2]-c[2]];
  let l=Math.hypot(...z); z[0]/=l; z[1]/=l; z[2]/=l;
  let x=[up[1]*z[2]-up[2]*z[1], up[2]*z[0]-up[0]*z[2], up[0]*z[1]-up[1]*z[0]];
  l=Math.hypot(...x)||1; x[0]/=l; x[1]/=l; x[2]/=l;
  const y=[z[1]*x[2]-z[2]*x[1], z[2]*x[0]-z[0]*x[2], z[0]*x[1]-z[1]*x[0]];
  return new Float32Array([
    x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0,
    -(x[0]*e[0]+x[1]*e[1]+x[2]*e[2]),
    -(y[0]*e[0]+y[1]*e[1]+y[2]*e[2]),
    -(z[0]*e[0]+z[1]*e[1]+z[2]*e[2]), 1
  ]);
}

/* ---------------- estado ---------------- */
// caixa de navegação: limites da planta + folga, para não se perder no vazio
const FOLGA = 2.5;
const PLANTA = {}, LIM = {}, CENTER = [0,0,0], cam = {}, HOME = {};
function calcularLimites(){
  const b = {x0:Infinity,x1:-Infinity,z0:Infinity,z1:-Infinity};
  WALLS.forEach(w=>{ b.x0=Math.min(b.x0,w.x1,w.x2); b.x1=Math.max(b.x1,w.x1,w.x2); b.z0=Math.min(b.z0,w.z1,w.z2); b.z1=Math.max(b.z1,w.z1,w.z2); });
  ROOMS.forEach(r=>r.rects.forEach(q=>{ b.x0=Math.min(b.x0,q[0]); b.x1=Math.max(b.x1,q[2]); b.z0=Math.min(b.z0,q[1]); b.z1=Math.max(b.z1,q[3]); }));
  if(!isFinite(b.x0)) Object.assign(b,{x0:0,x1:4,z0:0,z1:4});
  Object.assign(PLANTA, b);
  const dim = Math.max(b.x1-b.x0, b.z1-b.z0, 3);
  Object.assign(LIM, { x0:b.x0-FOLGA, x1:b.x1+FOLGA, z0:b.z0-FOLGA, z1:b.z1+FOLGA, rMin:2.5, rMax:dim*2.6 });
  CENTER[0]=(b.x0+b.x1)/2; CENTER[2]=(b.z0+b.z1)/2;
  Object.assign(HOME, { az:0.55, el:0.95, r:Math.max(7, dim*1.5), tx:CENTER[0], tz:CENTER[2] });
  Object.assign(cam, HOME);
}
calcularLimites();
function clampCam(){
  cam.tx = Math.min(LIM.x1, Math.max(LIM.x0, cam.tx));
  cam.tz = Math.min(LIM.z1, Math.max(LIM.z0, cam.tz));
  cam.r  = Math.min(LIM.rMax, Math.max(LIM.rMin, cam.r));
  cam.el = Math.min(1.53, Math.max(0.06, cam.el));
}
function noCentro(){
  return Math.abs(cam.tx-CENTER[0]) < 0.02 && Math.abs(cam.tz-CENTER[2]) < 0.02;
}
let colors = WALLS.map((w,i)=>[
  wallInfo[i].sides[0] >= 0 ? BASE_IN : BASE_OUT,
  wallInfo[i].sides[1] >= 0 ? BASE_IN : BASE_OUT
]);
let lower = WALLS.map(()=>[null,null]);   // cor da faixa inferior; null = igual à de cima
let hMeia = 1.05;                        // altura da divisão da meia parede
let faixa = "toda";                      // toda | baixo | cima
let sel = null;            // {w,s}
let showLabels = true;
let hov = null;
const PISOS = {
  porcBranco:{nome:'Porcelanato branco 60×60', cor:'#F2F2F0', tile:[0.60,0.60], off:0,    rejunte:'#C6CAC7'},
  porcCinza: {nome:'Porcelanato cinza 60×60',  cor:'#D8D9D6', tile:[0.60,0.60], off:0,    rejunte:'#AEB2AF'},
  porcBege:  {nome:'Porcelanato bege 80×80',   cor:'#E7E0D3', tile:[0.80,0.80], off:0,    rejunte:'#C3BBAC'},
  cimento:   {nome:'Cimento queimado',          cor:'#BFBDB7', tile:null},
  madClara:  {nome:'Madeira clara',             cor:'#C9A87C', tile:[0.19,1.30], off:0.65, rejunte:'#9C7E58'},
  madEscura: {nome:'Madeira escura',            cor:'#8A6242', tile:[0.19,1.30], off:0.65, rejunte:'#5C3F29'}
};
let floorId = 'porcBranco';
let cut = H;
let activeColor = null, activeName = null;
let scopeRoom = false;
const undoStack = [];
const MAX_RECENTES = 6;
let recentes = [];
let esquemas = [];
let VP = null, dirty = true;

function hex2rgb(h){
  const v=parseInt(h.slice(1),16);
  return [((v>>16)&255)/255, ((v>>8)&255)/255, (v&255)/255];
}
function srgb2lin(c){ return c.map(x => Math.pow(x, 2.2)); }
function accentRGB(){
  const dark = matchMedia('(prefers-color-scheme: dark)').matches
    && document.documentElement.getAttribute('data-theme') !== 'light'
    || document.documentElement.getAttribute('data-theme') === 'dark';
  return dark ? [0.25,0.71,0.69] : [0.05,0.49,0.53];
}

function resize(){
  const dpr = Math.min(window.devicePixelRatio||1, 2);
  const w = Math.max(1, Math.round(canvas.clientWidth*dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight*dpr));
  if(canvas.width!==w || canvas.height!==h){ canvas.width=w; canvas.height=h; }
  return [w,h];
}

function camEye(){
  const ce=Math.cos(cam.el), se=Math.sin(cam.el);
  return [cam.tx + cam.r*ce*Math.sin(cam.az), cam.r*se, cam.tz + cam.r*ce*Math.cos(cam.az)];
}

function buildVP(w,h){
  const eye=camEye();
  VP = mul(persp(0.82, w/h, 0.1, 200), lookAt(eye,[cam.tx,0.9,cam.tz],[0,1,0]));
}

function drawScene(pick){
  const [w,h]=resize();
  buildVP(w,h);
  const p = pick?P2:P1;
  gl.useProgram(p);
  gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
  gl.viewport(0,0,w,h);
  if(pick){ gl.clearColor(0,0,0,1); } else {
    const bg = srgb2lin(hex2rgb(getComputedStyle(document.body).backgroundColor.match(/\d+/g)
      ? '#'+getComputedStyle(document.body).backgroundColor.match(/\d+/g).slice(0,3)
          .map(n=>(+n).toString(16).padStart(2,'0')).join('') : '#EEF0F1'));
    gl.clearColor(bg[0],bg[1],bg[2],1);
  }
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.uniformMatrix4fv(pick?U2.uVP:U1.uVP,false,VP);
  gl.uniform1f(pick?U2.uCut:U1.uCut, cut);
  if(!pick) gl.uniform1f(U1.uMeia, hMeia);

  // pisos
  if(!pick){
    const piso = PISOS[floorId] || PISOS.porcBranco;
    gl.uniform3fv(U1.uAccent, accentRGB());
    gl.bindBuffer(gl.ARRAY_BUFFER,bufFloor); bindAttribs(P1);
    gl.uniform1f(U1.uSel,-9); gl.uniform1f(U1.uHov,-9);
    if(piso.tile){
      gl.uniform1f(U1.uPiso,1);
      gl.uniform2f(U1.uTile, piso.tile[0], piso.tile[1]);
      gl.uniform1f(U1.uOffset, piso.off||0);
      gl.uniform3fv(U1.uRejunte, srgb2lin(hex2rgb(piso.rejunte)));
    } else {
      gl.uniform1f(U1.uPiso,0);
    }
    const fc = srgb2lin(hex2rgb(piso.cor));
    gl.uniform3fv(U1.uC0,fc); gl.uniform3fv(U1.uC1,fc); gl.uniform3fv(U1.uC2,fc);
    gl.uniform3fv(U1.uL0,fc); gl.uniform3fv(U1.uL1,fc);
    gl.drawArrays(gl.TRIANGLES, flDry.start, flDry.count);
    const wc = fc.map(x=>x*0.94+0.025);
    gl.uniform3fv(U1.uC2,new Float32Array(wc));
    gl.drawArrays(gl.TRIANGLES, flWet.start, flWet.count);
    gl.uniform1f(U1.uPiso,0);
  }

  gl.bindBuffer(gl.ARRAY_BUFFER,bufWalls); bindAttribs(p);
  for(let i=0;i<WALLS.length;i++){
    const wi=wallInfo[i];
    if(pick){
      gl.uniform1f(U2.uId, i+1);
    } else {
      gl.uniform3fv(U1.uC0, srgb2lin(hex2rgb(colors[i][0])));
      gl.uniform3fv(U1.uC1, srgb2lin(hex2rgb(colors[i][1])));
      gl.uniform3fv(U1.uL0, srgb2lin(hex2rgb(lower[i][0] || colors[i][0])));
      gl.uniform3fv(U1.uL1, srgb2lin(hex2rgb(lower[i][1] || colors[i][1])));
      gl.uniform3fv(U1.uC2, srgb2lin(hex2rgb("#CFCCC6")));
      gl.uniform1f(U1.uSel, sel && sel.w===i ? sel.s : -9);
      gl.uniform1f(U1.uHov, hov && hov.w===i ? hov.s : -9);
    }
    gl.drawArrays(gl.TRIANGLES, wi.start, wi.count);
  }
}

function render(){
  dirty=false;
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  drawScene(false);
  placeLabels();
  syncCenterBtn();
}
function invalidate(){ if(!dirty){ dirty=true; requestAnimationFrame(render); } }

function pickAt(cx,cy){
  const [w,h]=resize();
  ensurePick(w,h);
  gl.bindFramebuffer(gl.FRAMEBUFFER,pickFB);
  drawScene(true);
  const dpr = w/canvas.clientWidth;
  const px = Math.round(cx*dpr), py = Math.round(h - cy*dpr);
  const buf = new Uint8Array(4);
  if(px<0||py<0||px>=w||py>=h){ gl.bindFramebuffer(gl.FRAMEBUFFER,null); return null; }
  gl.readPixels(px,py,1,1,gl.RGBA,gl.UNSIGNED_BYTE,buf);
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  invalidate();
  if(buf[0]===0) return null;
  const wi = buf[0]-1;
  if(wi<0 || wi>=WALLS.length) return null;
  return { w:wi, s: buf[1]>0 ? 1 : 0 };
}

/* ---------------- etiquetas dos cômodos ---------------- */
const labelBox = document.getElementById('labels');
let labelEls = [], labelOrder = [];
function construirEtiquetas(){
  labelBox.innerHTML='';
  labelEls = ROOMS.map(r=>{
    const s=document.createElement('span'); s.textContent=r.name; labelBox.appendChild(s); return s;
  });
  labelOrder = ROOMS.map((r,i)=>i).sort((a,b)=>ROOMS[b].area-ROOMS[a].area);
}
construirEtiquetas();
function placeLabels(){
  if(!showLabels){ for(const el of labelEls) el.style.display="none"; return; }
  const wpx = canvas.clientWidth, hpx = canvas.clientHeight;
  const placed = [];
  for(const i of labelOrder){
    const r=ROOMS[i], el=labelEls[i], x=r.cx, z=r.cz;
    const cx=VP[0]*x+VP[4]*0.06+VP[8]*z+VP[12];
    const cy=VP[1]*x+VP[5]*0.06+VP[9]*z+VP[13];
    const cw=VP[3]*x+VP[7]*0.06+VP[11]*z+VP[15];
    if(cw<=0.01){ el.style.display='none'; continue; }
    const px=(cx/cw*0.5+0.5)*wpx, py=(0.5-cy/cw*0.5)*hpx;
    el.style.display='block';
    el.style.left=px+'px'; el.style.top=py+'px';
    const hw=el.offsetWidth/2+3, hh=el.offsetHeight/2+2;
    const box=[px-hw,py-hh,px+hw,py+hh];
    if(placed.some(q => box[0]<q[2] && box[2]>q[0] && box[1]<q[3] && box[3]>q[1])){
      el.style.display='none';
    } else {
      placed.push(box);
    }
  }
}

/* ============================================================
   Interação de câmera
   ============================================================ */
const pointers = new Map();
let mode=null, last=null, downAt=null, moved=0, pinch0=0;

canvas.addEventListener('contextmenu', e=>e.preventDefault());
const ehPan = e => e.button===2 || (e.buttons&2)===2 || e.ctrlKey || e.metaKey || e.shiftKey;
canvas.addEventListener('pointerdown', e=>{
  try{ canvas.setPointerCapture(e.pointerId); }catch(_){}
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size===2){
    mode='pinch';
    const [a,b]=[...pointers.values()]; pinch0=Math.hypot(a.x-b.x,a.y-b.y);
  } else {
    mode = ehPan(e) ? 'pan' : 'orbit';
    downAt = performance.now(); moved=0;
  }
  last={x:e.clientX,y:e.clientY};
  canvas.classList.add('grabbing');
});
canvas.addEventListener('pointermove', e=>{
  if(pointers.has(e.pointerId)) pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(mode && mode!=='pinch' && e.buttons===0){ pointers.clear(); mode=null; canvas.classList.remove('grabbing','moving'); }
  if(!mode){
    if(e.pointerType==='mouse'){
      const r=canvas.getBoundingClientRect();
      const hit = pickAt(e.clientX-r.left, e.clientY-r.top);
      const same = (hit&&hov&&hit.w===hov.w&&hit.s===hov.s) || (!hit&&!hov);
      hov = hit;
      canvas.classList.toggle('pointing', !!hit);
      if(!same) invalidate();
    }
    return;
  }
  const dx=e.clientX-last.x, dy=e.clientY-last.y;
  moved += Math.hypot(dx,dy);
  if(mode!=='pinch' && e.pointerType==='mouse') mode = ehPan(e) ? 'pan' : 'orbit';
  if(mode==='pinch' && pointers.size===2){
    const [a,b]=[...pointers.values()]; const d=Math.hypot(a.x-b.x,a.y-b.y);
    if(pinch0>0) cam.r = cam.r*(pinch0/d);
    pinch0=d;
    panBy(dx,dy);
  } else if(mode==='pan'){
    panBy(dx,dy);
  } else {
    cam.az -= dx*0.0055;
    cam.el += dy*0.0045;
  }
  clampCam();
  canvas.classList.toggle('moving', mode==='pan');
  last={x:e.clientX,y:e.clientY};
  invalidate();
});
function panBy(dx,dy){
  const s = cam.r*0.0016;
  const ca=Math.cos(cam.az), sa=Math.sin(cam.az);
  cam.tx -= ( ca*dx + sa*dy*0.9)*s;
  cam.tz -= (-sa*dx + ca*dy*0.9)*s;
}
function endPointer(e){
  pointers.delete(e.pointerId);
  canvas.classList.remove('grabbing','moving');
  if(mode==='orbit' && moved<6 && performance.now()-downAt<600 && e.button!==2){
    const r=canvas.getBoundingClientRect();
    const hit = pickAt(e.clientX-r.left, e.clientY-r.top);
    selectFace(hit);
  }
  if(pointers.size===0) mode=null;
}
canvas.addEventListener('pointerup', endPointer);
window.addEventListener('pointerup', e=>{ if(pointers.has(e.pointerId)) endPointer(e); });
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('lostpointercapture', e=>{ pointers.delete(e.pointerId); if(pointers.size===0){ mode=null; canvas.classList.remove('grabbing','moving'); } });
canvas.addEventListener('wheel', e=>{
  e.preventDefault();
  cam.r = cam.r * Math.exp(e.deltaY*0.0012); clampCam();
  invalidate();
}, {passive:false});
