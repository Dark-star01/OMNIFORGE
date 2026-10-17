const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright'); const fs=require('fs');
const fx=n=>fs.readFileSync('../fix/'+n).toString('base64');
(async()=>{
  const b = await chromium.launch(); const p = await (await b.newContext({viewport:{width:390,height:844}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push('PAGEERR '+e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
  await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(300);
  const D={mhtml:fx('test.mhtml'),imgs:fx('imgs.zip'),apk:fx('fake.apk'),apk8:fx('fake8.apk'),ttf:fx('dj.ttf'),woff:fx('dj.woff'),srt:fx('sample.srt')};
  const res = await p.evaluate(async(D)=>{
    const R={}; const t=async(name,fn)=>{try{R[name]=await fn()}catch(e){R[name]='ERR '+e.message+' '+(e.stack||'').split('\n')[1]}};
    const u8=b=>Uint8Array.from(atob(b),c=>c.charCodeAt(0));
    const load=async id=>{const d=OF.reg.find(x=>x.id===id); await OF.loadAll(d.libs); await OF.load('js/tools/'+d.file+'.js');}
    for (const id of ['subtitle-workshop','code-formatter','mhtml-workshop','apk-workshop','font-inspector','storage-analyzer','encryptor','metadata-cleaner']) await load(id);
    const T=OF.tools;
    await t('css',()=>[T['code-formatter'].fmtCss('a{color:red;b:c}','  '),T['code-formatter'].minCss('a { color : red ; }\n/*x*/ b{c:d}')]);
    await t('html',()=>[T['code-formatter'].fmtHtml('<div><p>hi</p><br><span>x</span></div>','  '),T['code-formatter'].minHtml('<div>  <p> hi </p> </div>')]);
    await t('mhtml',async()=>{const a=T['mhtml-workshop'].api;const m=a.parseMhtml(u8(D.mhtml)); const c=a.collectImages(m.html,m.parts); return {parts:m.parts.length, html:m.html.slice(0,60), imgs:c.images.map(i=>i.filename+':'+i.source+':'+i.data.length), stats:c.stats}});
    await t('mhtml-zip',async()=>{const a=T['mhtml-workshop'].api;const r=await a.mhtmlToZip(u8(D.mhtml),'test.mhtml','',()=>{});const z=await JSZip.loadAsync(r.blob); return Object.keys(z.files)});
    await t('rename',async()=>{const a=T['mhtml-workshop'].api;const f=new File([u8(D.imgs)],'imgs.zip');const r=await a.renameZip(f,()=>{});const z=await JSZip.loadAsync(r.blob||r);return {keys:Object.keys(z.files),rk:Object.keys(r)}});
    await t('apk',async()=>{const a=T['apk-workshop'].api;const U=u8(D.apk);const {entries,sig}=a.readZip(U);const e=entries.find(e=>e.name==='AndroidManifest.xml');const man=await a.entryData(U,e);const dec=a.decodeAxml(man);return {n:entries.length,names:entries.map(e=>e.name),sig,sum:a.manifestSummary(dec.info),xml:dec.xml.slice(0,400)}});
    await t('apk8',async()=>{const a=T['apk-workshop'].api;const U=u8(D.apk8);const {entries}=a.readZip(U);const man=await a.entryData(U,entries[0]);return a.manifestSummary(a.decodeAxml(man).info).package+' '+a.manifestSummary(a.decodeAxml(man).info).permissions.length});
    await t('apk-roundtrip',async()=>{const a=T['apk-workshop'].api;const U=u8(D.apk);const {entries}=a.readZip(U);const items=[];for(const e of entries){items.push({name:e.name,data:await a.entryData(U,e)})}const blob=await a.writeZip(items);const b2=new Uint8Array(await blob.arrayBuffer());const chk=a.readZip(b2);window.__rt=btoa(String.fromCharCode(...b2));return {size:blob.size,n:chk.entries.length}});
    await t('font-ttf',async()=>{const r=await T['font-inspector'].inspectFont(u8(D.ttf).buffer);return {k:r.kind,n:r.names[1],full:r.names[4],g:r.glyphs,upm:r.unitsPerEm,tabs:r.tables.length}});
    await t('font-woff',async()=>{const r=await T['font-inspector'].inspectFont(u8(D.woff).buffer);return {k:r.kind,n:r.names[1],g:r.glyphs}});
    await t('font-bad',async()=>{try{await T['font-inspector'].inspectFont(u8(D.srt).buffer);return 'NO THROW'}catch(e){return 'throws '+e.message}});
    await t('storage',()=>{const f=[{name:'a.jpg',size:1000},{name:'b.mp4',size:9000},{name:'c.jpg',size:1000},{name:'x/a.jpg',size:1000}];const r=T['storage-analyzer'].analyze(f);return {total:r.total,types:r.byType,dups:r.dups.length}});
    return R;
  },D);
  console.log(JSON.stringify(res,null,1)); const rt=await p.evaluate(()=>window.__rt); if(rt) require('fs').writeFileSync('../fix/rt.apk',Buffer.from(rt,'base64')); console.log(errs);
  await b.close();
})();
