'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process'),a=require('assert');
const SRC=process.env.APP_SRC||path.resolve(__dirname,'../omniforge-src');const T=require(path.join(SRC,'js/tar.js'));
const tmp=fs.mkdtempSync('/tmp/claude-0/tar-');let p=0,f=0;const tests=[];const t=(n,fn)=>tests.push([n,fn]);
const sh=(c)=>{const r=cp.spawnSync('bash',['-c',c],{encoding:'utf8'});if(r.status)throw new Error(c+': '+r.stderr);return r.stdout};
const long='d'.repeat(60)+'/'+'e'.repeat(60)+'/'+'ملف_عربي_'+'x'.repeat(50)+'.txt';
const src=tmp+'/src';fs.mkdirSync(src+'/sub/'+'q'.repeat(90)+'/z',{recursive:true});fs.writeFileSync(src+'/a.txt','hello');fs.writeFileSync(src+'/عربي.txt','مرحبا');fs.writeFileSync(src+'/sub/'+'q'.repeat(90)+'/z/deep.bin',Buffer.alloc(1000,7));fs.writeFileSync(src+'/empty',''); fs.writeFileSync(src+'/big.bin',Buffer.alloc(100000,3)); fs.symlinkSync('a.txt',src+'/lnk');
for(const fmt of [['gnu','--format=gnu'],['ustar','--format=ustar'],['pax','--format=pax'],['posix','--format=posix']]){
 t('قراءة tar من نظام: '+fmt[0],async()=>{const o=tmp+'/'+fmt[0]+'.tar';try{sh(`cd ${src} && tar ${fmt[1]} -cf ${o} .`)}catch(e){return}const E=await T.open(new Uint8Array(fs.readFileSync(o)));const m=Object.fromEntries(E.filter(x=>!x.dir&&!x.skipped).map(x=>[x.name.replace(/^\.\//,''),x]));
  a.strictEqual(Buffer.from(m['a.txt'].data).toString(),'hello');a.strictEqual(Buffer.from(m['عربي.txt'].data).toString(),'مرحبا');a.strictEqual(m['big.bin'].size,100000);a(m['sub/'+'q'.repeat(90)+'/z/deep.bin'],'اسم طويل');a.strictEqual(m['empty'].size,0);a(E.some(x=>x.skipped&&/رمزي/.test(x.skipped)),'الرابط الرمزي يُبلَّغ عنه');});
}
t('قراءة tar.gz من نظام',async()=>{sh(`cd ${src} && tar -czf ${tmp}/s.tgz .`);const E=await T.open(new Uint8Array(fs.readFileSync(tmp+'/s.tgz')));a(E.some(x=>/a\.txt$/.test(x.name)))});
t('كتابة بواسطتنا وقراءة بواسطة tar النظام',async()=>{const ents=[{name:'dir/',dir:true},{name:'dir/a.txt',data:new TextEncoder().encode('abc')},{name:long,data:new TextEncoder().encode('طويل')},{name:'big',data:new Uint8Array(70000).fill(9)}];const u=await T.gzip(T.build(ents));fs.writeFileSync(tmp+'/o.tgz',u);
 const lst=sh(`tar --quoting-style=literal -tzf ${tmp}/o.tgz`);a(lst.includes('dir/a.txt'));a(lst.includes(long),'الاسم الطويل');sh(`mkdir -p ${tmp}/x && tar -xzf ${tmp}/o.tgz -C ${tmp}/x`);a.strictEqual(fs.readFileSync(tmp+'/x/dir/a.txt','utf8'),'abc');a.strictEqual(fs.readFileSync(tmp+'/x/'+long,'utf8'),'طويل');a.strictEqual(fs.statSync(tmp+'/x/big').size,70000);});
t('ذهاب وإياب',async()=>{const ents=[{name:'a',data:new Uint8Array([1,2,3])}];const r=T.parse(T.build(ents));a.deepStrictEqual(Array.from(r[0].data),[1,2,3])});
t('ترويسة تالفة ترمي',()=>{const b=T.build([{name:'a',data:new Uint8Array(5)}]);b[10]^=0xff;a.throws(()=>T.parse(b),/تالفة/)});
t('أرشيف مقطوع ترمي',()=>{const b=T.build([{name:'a',data:new Uint8Array(5000)}]);a.throws(()=>T.parse(b.subarray(0,1000)),/مقطوع/)});
t('حد الحجم',()=>{const b=T.build([{name:'a',data:new Uint8Array(5000)}]);a.throws(()=>T.parse(b,{maxTotal:100}),/كبير/)});
t('gzip تالف',async()=>{let ok=false;try{await T.open(new Uint8Array([0x1f,0x8b,8,0,0,0,0,0,0,3,1,2,3,4]))}catch(e){ok=/gzip/.test(e.message)}a(ok)});
(async()=>{for(const [n,fn] of tests){try{await fn();p++;console.log('  ✓',n)}catch(e){f++;console.log('  ✗',n,String(e.message).split('\n')[0])}}console.log(`\n${p} نجح، ${f} فشل`);process.exit(f?1:0)})();
