const fs=require('fs');
const BASE='https://catalog.suvinil.com.br/api/v1/colors';
const H={'User-Agent':'Mozilla/5.0','Accept':'application/json','Referer':'https://www.suvinil.com.br/'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function pega(page){
  for(let t=0;t<5;t++){
    try{
      const r=await fetch(`${BASE}?page=${page}`,{headers:H});
      if(r.ok){ const j=await r.json(); if(j.content&&j.content.items) return j.content; }
    }catch(e){}
    await sleep(600*(t+1));
  }
  return null;
}
(async()=>{
  const primeiro=await pega(1);
  if(!primeiro){ console.log('FALHOU na primeira pagina'); return; }
  const total=primeiro.totalPage;
  console.log('paginas:',total,'itens:',primeiro.totalItems);
  const todos=[...primeiro.items];
  let falhas=0;
  for(let p=2;p<=total;p++){
    const c=await pega(p);
    if(c) todos.push(...c.items); else falhas++;
    if(p%25===0) console.log('pagina',p,'acumulado',todos.length,'falhas',falhas);
    await sleep(250);
  }
  fs.writeFileSync('suvinil-cores.json', JSON.stringify(todos));
  console.log('PRONTO', todos.length, 'cores, falhas:', falhas);
})();
