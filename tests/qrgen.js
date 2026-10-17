global.window={}; global.TextEncoder=TextEncoder; require('/home/claude/omniforge/omniforge-src/js/qr-encoder.js');
const qr=window.OF.qr; const out=[];
for(const e of ['L','M','Q','H']) for(let v=1;v<=40;v++){
  const cc=v<=9?8:16; const cap=Math.floor((qr.capacity(v,e)*8-4-cc)/8);
  for (const len of [cap, Math.max(1,Math.floor(cap/2))]) {
    let s=''; for(let i=0;i<len;i++) s+=String.fromCharCode(33+((i*7+v)%90));
    const r=qr.encode(s,e,v); if(r.version!==v) {continue;}
    out.push({v,e,text:s,size:r.size,rows:r.modules.map(row=>row.map(c=>c?1:0).join(''))});
  }
}
require('fs').writeFileSync('qr.json',JSON.stringify(out)); console.log(out.length);
