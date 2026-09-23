const fs=require('fs');
const bruto=JSON.parse(fs.readFileSync('suvinil-cores.json','utf8'));
const FORA=/verniz|glasu|metaliz|madeira e metal|outras superf|cimento queimado/i;

function hsl(r,g,b){
  r/=255;g/=255;b/=255;
  const mx=Math.max(r,g,b), mn=Math.min(r,g,b), l=(mx+mn)/2;
  let h=0,s=0;
  if(mx!==mn){
    const d=mx-mn;
    s = l>0.5 ? d/(2-mx-mn) : d/(mx+mn);
    if(mx===r) h=((g-b)/d+(g<b?6:0));
    else if(mx===g) h=(b-r)/d+2;
    else h=(r-g)/d+4;
    h*=60;
  }
  return [h,s,l];
}
function familia(r,g,b){
  const [h,s,l]=hsl(r,g,b);
  if(s<0.10) return l>0.82 ? 'Brancos' : 'Cinzas';
  if(h<15||h>=345)  return (l<0.42&&s<0.55) ? 'Marrons' : 'Vermelhos';
  if(h<45)  return (l<0.62&&s<0.75) ? 'Marrons' : 'Laranjas';
  if(h<70)  return (l<0.45) ? 'Marrons' : 'Amarelos';
  if(h<165) return 'Verdes';
  if(h<255) return 'Azuis';
  if(h<295) return 'Violetas';
  return 'Rosas';
}
const vistos=new Set(), saida=[];
for(const c of bruto){
  if(!c.active || !c.rgb || !c.code) continue;
  const grupos=(c.colorToColorGroups||[]).map(g=>g.colorGroup.name);
  if(grupos.length && grupos.every(n=>FORA.test(n))) continue;
  if(vistos.has(c.code)) continue;
  vistos.add(c.code);
  const [r,g,b]=c.rgb.split(',').map(n=>parseInt(n,10));
  if([r,g,b].some(n=>isNaN(n))) continue;
  const hex='#'+[r,g,b].map(n=>n.toString(16).padStart(2,'0')).join('').toUpperCase();
  saida.push([c.name.trim(), c.code.trim(), hex, familia(r,g,b)]);
}
const FAMS=['Brancos','Cinzas','Amarelos','Laranjas','Vermelhos','Rosas','Violetas','Azuis','Verdes','Marrons'];
saida.sort((a,b)=> FAMS.indexOf(a[3])-FAMS.indexOf(b[3]) || a[0].localeCompare(b[0],'pt'));
const conta={}; saida.forEach(c=>conta[c[3]]=(conta[c[3]]||0)+1);
console.log('cores finais:', saida.length);
console.log(FAMS.map(f=>f+': '+(conta[f]||0)).join('  |  '));
const compacto = saida.map(c=>[c[0],c[1],c[2].slice(1),FAMS.indexOf(c[3])]);
fs.writeFileSync('paleta-suvinil.json', JSON.stringify(compacto));
console.log('tamanho do JSON:', (fs.statSync('paleta-suvinil.json').size/1024).toFixed(1), 'KB');
console.log('exemplos:', JSON.stringify(compacto.slice(0,3)), JSON.stringify(compacto.slice(-2)));

// o app lê a paleta deste arquivo (script comum, para funcionar também abrindo o index.html direto)
fs.mkdirSync('js/dados', { recursive:true });
fs.writeFileSync('js/dados/cores-suvinil.js',
  '// Gerado por gerar-paleta.js a partir de suvinil-cores.json — não edite à mão.\n' +
  '// Cada cor: [nome, código, hex sem #, índice em FAMILIAS]\n' +
  '"use strict";\n' +
  'const FAMILIAS = ' + JSON.stringify(FAMS) + ';\n' +
  'const CORES = ' + JSON.stringify(compacto) + ';\n');
console.log('js/dados/cores-suvinil.js atualizado');
