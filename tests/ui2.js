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

  await open('audio-workshop','تحليل'); await setFiles(['tone.mp3']); await click('حلّل'); await waitOut(); log('audio-an-mp3',await outText());
  await open('audio-workshop','قص'); await setFiles(['tone.wav']); const ins=pane().locator('input'); await pane().locator('input[placeholder^="البداية"]').fill('0:00.5'); await pane().locator('input[placeholder^="النهاية"]').fill('1.5'); await click('نفّذ'); await waitOut(); log('audio-edit',await outText()); log(' saved',await saveAll());
  await open('audio-workshop','دمج'); await setFiles(['tone.wav','tone.mp3']); await click('ادمج'); await waitOut(); log('audio-merge',await outText()); log(' saved',await saveAll());
  await open('video-workshop','معلومات'); await setFiles(['clip.webm']); await click('افتح'); await waitOut(); log('video-info',await outText());
  await open('video-workshop','قص'); await setFiles(['clip.webm']); await pane().locator('input[placeholder^="النهاية"]').fill('1'); await click('ابدأ'); await waitOut(30000); log('video-trim',await outText()); log(' saved',await saveAll());
  await open('file-split-join','تقسيم'); await setFiles(['dj.ttf']); await pane().locator('input[type=number]').first().fill('0.2'); await click('قسّم'); await waitOut(); log('split',await outText().then(t=>t.slice(0,80))); log(' saved',await saveAll());
  await open('file-split-join','دمج'); const parts=fs.readdirSync('../fix').filter(n=>/^out_dj\.ttf\.part/.test(n)); await setFiles(parts); await click('ادمج'); await waitOut(); log('join',await outText().then(t=>t.slice(0,80))); log(' saved',await saveAll());
  console.log(errs);
  await b.close();
})();
