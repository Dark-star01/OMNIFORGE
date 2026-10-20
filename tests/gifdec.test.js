'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process'),a=require('assert');
const SRC=process.env.APP_SRC||path.resolve(__dirname,'../omniforge-src');const G=require(path.join(SRC,'js/gifdec.js'));
const tmp=fs.mkdtempSync('/tmp/claude-0/gif-');let p=0,f=0;const t=(n,fn)=>{try{fn();p++;console.log('  ✓',n)}catch(e){f++;console.log('  ✗',n,e.message.split('\n')[0])}};
// مرجع: Pillow يولّد GIF ثم يحفظ كل إطار RGBA كامل
const py=`
import sys,json
from PIL import Image,ImageSequence
import random
random.seed(5)
d=sys.argv[1]
def mk(w,h,seed):
    im=Image.new('RGBA',(w,h));px=im.load();random.seed(seed)
    for y in range(h):
        for x in range(w):
            px[x,y]=((x*7+seed*30)%256,(y*5)%256,random.randrange(0,256) if x%9==0 else 128,255)
    return im
frames=[mk(40,30,i) for i in range(5)]
# شفافية جزئية
for fr in frames[2:]:
    px=fr.load()
    for y in range(10): 
        for x in range(10): px[x,y]=(0,0,0,0)
for name,kw in {'plain':{},'opt':{'optimize':True,'disposal':2},'interlace':{'interlace':True,'disposal':1},'d3':{'disposal':3}}.items():
    frames[0].save(d+'/'+name+'.gif',save_all=True,append_images=frames[1:],duration=[100,200,300,400,500],loop=0,**kw)
    im=Image.open(d+'/'+name+'.gif');out=[]
    for fr in ImageSequence.Iterator(im):
        c=fr.convert('RGBA');out.append(list(c.tobytes()))
    json.dump({'w':im.width,'h':im.height,'frames':out,'dur':[1]},open(d+'/'+name+'.json','w'))
`;
fs.writeFileSync(tmp+'/g.py',py);const r=cp.spawnSync('python3',[tmp+'/g.py',tmp],{encoding:'utf8'});if(r.status){console.log(r.stderr);process.exit(1)}
for(const n of ['plain','opt','interlace','d3']){
 t('مطابقة Pillow: '+n,()=>{const ref=JSON.parse(fs.readFileSync(`${tmp}/${n}.json`));const d=G.decode(new Uint8Array(fs.readFileSync(`${tmp}/${n}.gif`)));
  a.strictEqual(d.width,ref.w);a.strictEqual(d.height,ref.h);a.strictEqual(d.frames.length,ref.frames.length);
  d.frames.forEach((fr,i)=>{const R=ref.frames[i];let bad=0;for(let k=0;k<R.length;k+=4){const ta=R[k+3]===0&&fr.rgba[k+3]===0;if(ta)continue;if(R[k]!==fr.rgba[k]||R[k+1]!==fr.rgba[k+1]||R[k+2]!==fr.rgba[k+2]||R[k+3]!==fr.rgba[k+3])bad++}a.strictEqual(bad,0,'إطار '+i+' فيه '+bad+' بكسل مختلف')});
  a.deepStrictEqual(d.frames.map(x=>x.delay),[100,200,300,400,500]);a.strictEqual(d.loop,0);});
}
// ffmpeg: GIF حقيقي من مصدر اختباري
const ff=cp.spawnSync('ffmpeg',['-y','-v','error','-f','lavfi','-i','testsrc=size=64x48:rate=5:duration=1','-f','gif',tmp+'/ff.gif']);
t('GIF من ffmpeg (5 إطارات)',()=>{a.strictEqual(ff.status,0);const d=G.decode(new Uint8Array(fs.readFileSync(tmp+'/ff.gif')));a.strictEqual(d.frames.length,5);a.strictEqual(d.width,64)});
t('رفض ملف غير GIF',()=>a.throws(()=>G.decode(new Uint8Array([1,2,3,4,5,6,7,8])),/GIF/));
t('GIF مقطوع لا يتجمّد ولا يتعطل بشكل غير مصرّح به',()=>{const b=new Uint8Array(fs.readFileSync(tmp+'/plain.gif'));for(const cut of [20,100,300,Math.floor(b.length/2)]){try{G.decode(b.subarray(0,cut))}catch(e){a(e instanceof Error)}}});
t('حد الحجم',()=>a.throws(()=>G.decode(new Uint8Array(fs.readFileSync(tmp+'/plain.gif')),{maxPixels:1000}),/كبير/));
console.log(`\n${p} نجح، ${f} فشل`);process.exit(f?1:0);
