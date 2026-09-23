// Partida do app: ligações finais e carga dos dados salvos
"use strict";

document.getElementById('btnVoltarHome').addEventListener('click', ()=>{ previewAtivo ? voltarDoPreview() : irParaHome(); });
window.addEventListener('beforeunload', ()=>{ if(projetoAtivo) salvarProjetoAtivo(); });

migrarLegado();
projetos = carregarIndice();
modelosCustom = carregarModelosCustom();
renderModelos();
renderProjetos();
