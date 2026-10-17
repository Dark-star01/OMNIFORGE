const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright'); const fs=require('fs');
const fx=n=>fs.readFileSync('../fix/'+n).toString('base64');
(async()=>{
  const b = await chromium.launch(); const p = await (await b.newContext({viewport:{width:390,height:844}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push('PAGEERR '+e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
  await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(300);
  const D={jpg:fx('exif.jpg'),png:fx('meta.png'),pdf:fx('meta.pdf'),pic:fx('pic.jpg'),wav:fx('tone.wav')};
  const res = await p.evaluate(async(D)=>{
    const R={}; const t=async(name,fn)=>{try{R[name]=await fn()}catch(e){R[name]='ERR '+e.message+' '+(e.stack||'').split('\n')[1]}};
    const u8=b=>Uint8Array.from(atob(b),c=>c.charCodeAt(0)); const b64=u=>{let s='';for(let i=0;i<u.length;i+=8192)s+=String.fromCharCode(...u.subarray(i,i+8192));return btoa(s)};
    const load=async id=>{const d=OF.reg.find(x=>x.id===id); await OF.loadAll(d.libs); await OF.load('js/tools/'+d.file+'.js');}
    for (const id of ['encryptor','metadata-cleaner','gif-studio','image-workshop','audio-workshop']) await load(id);
    const T=OF.tools;
    await t('enc',async()=>{const e=T.encryptor.api;const plain=new TextEncoder().encode('سر 123');const c=await e.encryptBytes(plain,'a.txt','pw1');const d=await e.decryptBytes(c,'pw1');
      let bad='',tam='';try{await e.decryptBytes(c,'pw2');bad='NO THROW'}catch(x){bad='ok:'+x.message}
      const c2=c.slice();c2[c2.length-3]^=1;try{await e.decryptBytes(c2,'pw1');tam='NO THROW'}catch(x){tam='ok'}
      const c3=c.slice();c3[7]^=1;let hdr='';try{await e.decryptBytes(c3,'pw1');hdr='NO THROW'}catch(x){hdr='ok:'+x.message.slice(0,30)}
      return {len:c.length,name:d.name,text:new TextDecoder().decode(d.data||d.plain||d.bytes),bad,tam,hdr,keys:Object.keys(d)}});
    await t('jpg',async()=>{const r=T['metadata-cleaner'].api.cleanJpeg(u8(D.jpg),false);window.__jpg=b64(new Uint8Array(await r.blob.arrayBuffer()));return {keys:Object.keys(r),found:r.found,removed:r.removed}});
    await t('png',async()=>{const r=T['metadata-cleaner'].api.cleanPng(u8(D.png));window.__png=b64(new Uint8Array(await r.blob.arrayBuffer()));return {keys:Object.keys(r),found:r.found,removed:r.removed}});
    await t('pdf',async()=>{const r=await T['metadata-cleaner'].api.cleanPdf(u8(D.pdf).buffer);window.__pdf=b64(new Uint8Array(await r.blob.arrayBuffer()));return {keys:Object.keys(r),found:r.found}});
    await t('gif',()=>{const g=T['gif-studio'];const mk=(c)=>{const d=new Uint8ClampedArray(40*30*4);for(let i=0;i<40*30;i++){d[i*4]=c[0]+(i%40)*3;d[i*4+1]=c[1];d[i*4+2]=c[2];d[i*4+3]=255}return d};
      const bytes=g.gifEncode([mk([255,0,0]),mk([0,255,0]),mk([0,0,255])],40,30,{delayMs:200,loop:0,colors:64});window.__gif=b64(bytes);return bytes.length});
    await t('img',async()=>{const f=new File([u8(D.pic)],'pic.jpg',{type:'image/jpeg'});const r=await T['image-workshop'].processImage(f,{format:'image/png',resize:'width',w:32,h:0,upscale:false,quality:90,rotate:90,flipH:false,flipV:false,crop:'free',cropPos:50,pct:50,bg:'#ffffff'});window.__img=b64(new Uint8Array(await r.blob.arrayBuffer()));return {keys:Object.keys(r),w:r.w||r.width,h:r.h||r.height,mime:r.mime}});
    await t('wav',()=>{const L=new Float32Array(100).fill(0.5);const w=T['audio-workshop'].encodeWav([L,L],8000);return w.length||w.size});
    return R;
  },D);
  console.log(JSON.stringify(res,null,1)); console.log(errs);
  for (const [k,e] of [['__jpg','clean.jpg'],['__png','clean.png'],['__pdf','clean.pdf'],['__gif','t.gif'],['__img','proc.png']]) { const v=await p.evaluate(k=>window[k],k); if(v) fs.writeFileSync('../fix/'+e,Buffer.from(v,'base64')); }
  await b.close();
})();
