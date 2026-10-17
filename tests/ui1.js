const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright'); const fs=require('fs'); const path=require('path');
const FX=n=>path.resolve('../fix/'+n);
(async()=>{
  const b = await chromium.launch(); const p = await (await b.newContext({viewport:{width:390,height:844},acceptDownloads:true})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push('PAGEERR '+e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
  await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(300);
  await p.evaluate(()=>{window.__saves={};}); 
  async function open(id,tab){ await p.evaluate(id=>{location.hash='#/tools/'+id},id); await p.waitForTimeout(600); if(tab){ await p.locator('.tab',{hasText:tab}).first().click(); await p.waitForTimeout(200);} 
    await p.evaluate(()=>{ OF.save=async(data,name,mime)=>{const blob=OF.toBlob(data,mime);const b=await OF.b64(blob);(window.__saves[name]=b);return {where:'test'}}; }); }
  const pane=()=>p.locator('#view .tabs ~ div > div[data-id]:visible').first();
  async function setFiles(names,idx=0){ await pane().locator('input[type=file]').nth(idx).setInputFiles(names.map(FX)); await p.waitForTimeout(400); }
  async function click(text,scope){ await (scope||pane()).locator('button.btn',{hasText:text}).first().click(); }
  async function waitOut(ms=8000){ await p.waitForFunction(()=>{const v=document.querySelector('#view [data-id]:not([style*="none"]) .out')||document.querySelector('#view .out'); return v&&v.children.length>0},null,{timeout:ms}).catch(()=>{}); await p.waitForTimeout(300); }
  async function outText(){ return (await p.locator('#view .out:visible').allInnerTexts()).join(' | ').slice(0,300); }
  async function saveAll(){ const n=await p.locator('#view .saverow:visible').count(); for(let i=0;i<n;i++){ await p.locator('#view .saverow:visible').nth(i).locator('button',{hasText:'حفظ'}).click(); await p.waitForTimeout(150);} const s=await p.evaluate(()=>window.__saves); for(const [k,v] of Object.entries(s)) fs.writeFileSync('../fix/out_'+k,Buffer.from(v,'base64')); const r=Object.keys(s); await p.evaluate(()=>{window.__saves={}}); return r; }
  const log=(k,v)=>console.log(k.padEnd(14),v);

  // PDF merge
  await open('pdf-workshop','دمج'); await setFiles(['p1.pdf','p2.pdf','p3.pdf']); await click('ادمج'); await waitOut(); log('pdf-merge',await outText()); log(' saved',await saveAll());
  // split
  await open('pdf-workshop','تقسيم'); await setFiles(['p3.pdf']); await pane().locator('input[type=text],input:not([type])').first().fill('1-2,4'); await click('نفّذ'); await waitOut(); log('pdf-split',await outText()); log(' saved',await saveAll());
  // img2pdf
  await open('pdf-workshop','صور'); await setFiles(['pic.jpg','meta.png']); await click('أنشئ'); await waitOut(); log('img2pdf',await outText()); log(' saved',await saveAll());
  // archive create + open
  await open('archive-manager','إنشاء'); await setFiles(['pic.jpg','sample.srt','test.svg']); await click('أنشئ ZIP'); await waitOut(); log('zip-create',await outText()); log(' saved',await saveAll());
  await open('archive-manager','فتح'); await setFiles(['imgs.zip']); await click('افتح'); await waitOut(); log('zip-open',await outText());
  // split/join
  await open('file-split-join','تقسيم'); await setFiles(['dj.ttf']); const num=pane().locator('input[type=number]').first(); await num.fill('300'); await click('قسّم'); await waitOut(); log('split',await outText()); log(' saved',await saveAll());
  // mhtml
  await open('mhtml-workshop','استخراج'); await setFiles(['test.mhtml']); await click('استخرج'); await waitOut(); log('mhtml',await outText()); log(' saved',await saveAll());
  await open('mhtml-workshop','إعادة'); await setFiles(['imgs.zip']); await click('أعد الترقيم'); await waitOut(); log('renumber',await outText()); log(' saved',await saveAll());
  console.log(errs);
  await b.close();
})();
