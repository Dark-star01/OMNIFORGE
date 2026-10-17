const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
(async()=>{
  const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:390,height:844}, locale:'ar'}); const p = await ctx.newPage();
  let errs=[]; p.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errs.push(m.type()+': '+m.text())}); p.on('pageerror',e=>errs.push('PAGEERR '+e.message));
  p.on('requestfailed',r=>errs.push('REQFAIL '+r.url()));
  await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(400);
  const ids = await p.evaluate(()=>OF.reg.map(t=>t.id));
  for (const id of ids){
    errs=[];
    await p.evaluate(id=>{location.hash='#/tools/'+id},id); await p.waitForTimeout(700);
    const info = await p.evaluate(()=>({len:document.querySelector('#view').innerText.length, hscroll:document.documentElement.scrollWidth>window.innerWidth+1, btn:document.querySelectorAll('#view button, #view a.btn').length}));
    console.log(id.padEnd(22), JSON.stringify(info), errs.length?errs:'');
  }
  await b.close();
})();
