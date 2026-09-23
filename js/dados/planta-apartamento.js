// Planta embutida "Apartamento": paredes, cômodos e alturas (metros; X à direita, Z para baixo)
"use strict";

/* ============================================================
   PLANTA — coordenadas em metros, X para a direita, Z para baixo
   (mesma orientação da planta impressa; topo da planta = Norte)
   ============================================================ */
const H = 2.70;            // pé-direito
const DOOR_H = 2.10;
const WIN_LO = 1.00, WIN_HI = 2.20;

// w(x1,z1,x2,z2, {t,h,gaps:[[de,ate,'d'|'w']]})
const W = (x1,z1,x2,z2,o={})=>({x1,z1,x2,z2,t:o.t??0.15,h:o.h??H,gaps:o.gaps??[]});

let WALLS = [
  // ---- fachada norte ----
  W(3.65,0, 5.80,0,  {t:.20, gaps:[[0.5,1.9,'w']]}),   // quarto 1
  W(5.80,0, 8.05,0,  {t:.20, gaps:[[0.7,1.5,'w']]}),   // lavanderia
  W(8.05,0, 10.70,0, {t:.20, gaps:[[1.0,1.8,'w']]}),   // banheiro da suíte

  // ---- fachada leste ----
  W(10.70,0, 10.70,1.60, {t:.20}),
  W(10.70,1.60, 10.70,5.75,{t:.20, gaps:[[1.3,2.9,'w']]}),  // suíte
  W(10.70,5.75, 10.70,9.65,{t:.20, gaps:[[1.2,2.8,'w']]}),  // escritório

  // ---- fachada sul ----
  W(3.10,9.65, 6.15,9.65, {t:.20, gaps:[[0.8,2.4,'w']]}),   // quarto 2
  W(6.15,9.65, 7.70,9.65, {t:.20, gaps:[[0.5,1.0,'w']]}),   // banheiro social
  W(7.70,9.65, 10.70,9.65),   // escritório

  // ---- recuo e fachada oeste ----
  W(3.65,0, 3.65,0.75, {t:.20}),
  W(2.05,0.75, 3.65,0.75,                             ),    // quarto 1
  W(2.05,0.75, 2.05,3.10,                             ),    // quarto 1
  W(0,3.10, 2.05,3.10, {t:.20, gaps:[[0.10,1.20,'d']]}),    // entrada
  W(0,3.10, 0,8.60,                                   ),    // sala
  W(0,8.60, 0,10.50,      {t:.20, h:1.15}             ),    // varanda
  W(0,10.50, 3.10,10.50,  {t:.20, h:1.15}             ),    // varanda
  W(3.10,9.65, 3.10,10.50,{t:.20, h:1.15}             ),    // varanda

  // ---- internas ----
  W(3.10,3.10, 5.80,3.10, {t:.20, h:1.15}),          // quarto 1 / sala
  W(5.80,0, 5.80,0.75),                              // lavanderia / quarto 1
  W(5.80,1.60, 7.20,1.60, {gaps:[[0.15,0.85,'d']]}), // lavanderia / despensa
  W(7.20,1.60, 8.05,1.60),                           // lavanderia / suíte
  W(8.05,1.60, 10.70,1.60,{gaps:[[1.00,1.50,'d']]}), // banheiro da suíte / suíte
  W(8.05,0, 8.05,1.60),     // banheiro da suíte / lavanderia
  W(5.80,1.60, 5.80,3.10),  // despensa / quarto 1
  W(5.80,3.10, 5.80,3.85),  // despensa / sala
  W(5.80,3.85, 7.20,3.85),  // despensa, porta
  W(7.20,1.60, 7.20,3.85),  // suíte / despensa
  W(7.20,3.85, 7.20,4.70),  // suíte / sala
  W(7.20,5.75, 10.70,5.75), // suíte / escritório
  W(3.10,5.75, 6.15,5.75),  // sala / quarto 2
  W(3.10,5.75, 3.10,8.60),  // quarto 2 / sala
  W(3.10,8.60, 3.10,9.65),  // quarto 2 / varanda
  W(6.15,5.75, 6.15,6.80,{gaps:[[0.20,1.05,'d']]}),  // quarto 2, porta (hall)
  W(7.70,5.75, 7.70,6.80,{gaps:[[0.20,1.05,'d']]}),  // escritório, porta (hall)
  W(6.15,6.80, 6.15,9.65),  // banheiro social / quarto 2
  W(6.15,6.80, 7.70,6.80,{gaps:[[0.70,1.55,'d']]}),  // banheiro social, porta (hall)
  W(7.70,6.80, 7.70,9.65),  // banheiro social / escritório
  W(7.20,4.70, 7.20,5.75,{gaps:[[0.20,1.05,'d']]})   // suíte, porta (sala) — no fim para não desalinhar cores salvas
];

// r(nome, [[x0,z0,x1,z1],...], molhado?, [ancoraX,ancoraZ]?)
function R(name, rects, wet=false, anchor=null){
  let area=0, big=rects[0];
  for(const q of rects){
    const a=(q[2]-q[0])*(q[3]-q[1]);
    area+=a;
    if(a > (big[2]-big[0])*(big[3]-big[1])) big=q;
  }
  return {name, rects, wet, area,
    cx: anchor ? anchor[0] : (big[0]+big[2])/2,
    cz: anchor ? anchor[1] : (big[1]+big[3])/2};
}
let ROOMS = [
  R("Cozinha", [[2.05,0.75,5.80,3.10],[3.65,0,5.80,0.75]], false, [4.20,1.90]),
  R("Lavanderia", [[5.80,0,8.05,1.60]], true),
  R("Banheiro da suíte", [[8.05,0,10.70,1.60]], true),
  R("Despensa", [[5.80,1.60,7.20,3.85]]),
  R("Suíte", [[7.20,1.60,10.70,5.75]]),
  R("Sala", [[0,3.10,5.80,5.75],[5.80,3.85,7.20,5.75],[0,5.75,3.10,8.60]], false, [1.55,5.20]),
  R("Varanda", [[0,8.60,3.10,10.50]], true),
  R("Hall", [[6.15,5.75,7.70,6.80]]),
  R("Quarto 2", [[3.10,5.75,6.15,9.65]]),
  R("Banheiro social", [[6.15,6.80,7.70,9.65]], true),
  R("Escritório", [[7.70,5.75,10.70,9.65]])
];

const PLANTA_APTO = { walls: WALLS, rooms: ROOMS };
