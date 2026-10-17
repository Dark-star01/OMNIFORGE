import struct, zipfile, io, base64, os, subprocess, glob
from PIL import Image, ImageDraw
F='fix/'
def png(color,size=(120,80),text=''):
    im=Image.new('RGB',size,color); d=ImageDraw.Draw(im); d.text((5,5),text,fill='white'); b=io.BytesIO(); im.save(b,'PNG'); return b.getvalue()
imgs=[png((200,50,50),text='A'),png((50,200,50),text='B'),png((50,50,200),text='C')]
# MHTML
parts=[]
html='<html><body><img src="cid:a@x"><img src="http://ex.com/b.png"><img src="c.png"></body></html>'
def part(ct,loc,body,enc='base64',cid=None):
    h='Content-Type: %s\r\nContent-Transfer-Encoding: %s\r\nContent-Location: %s\r\n'%(ct,enc,loc)
    if cid: h+='Content-ID: <%s>\r\n'%cid
    return h+'\r\n'+body+'\r\n'
def b64(b): s=base64.b64encode(b).decode(); return '\r\n'.join(s[i:i+76] for i in range(0,len(s),76))
m='From: <Saved>\r\nSubject: test\r\nMIME-Version: 1.0\r\nContent-Type: multipart/related; type="text/html"; boundary="BND"\r\n\r\n'
m+='--BND\r\n'+part('text/html; charset=utf-8','http://ex.com/index.html','<html><body>caf=C3=A9 <img src=3D"cid:a@x"><img src=3D"b.png"><img src=3D"http://ex.com/c.png"><img src=3D"missing.png"></body></html>','quoted-printable')
for i,(n,c) in enumerate(zip(['a.png','b.png','c.png'],imgs)):
    m+='--BND\r\n'+part('image/png','http://ex.com/'+n,b64(c),'base64',cid='a@x' if i==0 else None)
m+='--BND--\r\n'
open(F+'test.mhtml','w',newline='').write(m)
# zip of images unsorted names
with zipfile.ZipFile(F+'imgs.zip','w') as z:
    for n,c in zip(['img_10.png','img_2.png','img_1.png'],imgs): z.writestr(n,c)
    z.writestr('notes.txt','x')
# AXML
def axml(utf8=False):
    strs=[]; 
    def S(s):
        if s not in strs: strs.append(s)
        return strs.index(s)
    ANDROID='http://schemas.android.com/apk/res/android'
    # attribute names with resource ids first (order matters)
    names=[('versionCode',0x0101021b),('versionName',0x0101021c),('name',0x01010003),('minSdkVersion',0x0101020c),('targetSdkVersion',0x01010270),('label',0x01010001)]
    for n,_ in names: S(n)
    for s in ['android','package','manifest','uses-sdk','uses-permission','application','activity',ANDROID,'com.test.app','1.2.3','android.permission.INTERNET','android.permission.CAMERA','.MainActivity','My App']: S(s)
    rid={n:r for n,r in names}
    ev=[]
    def attr(ns,name,val,kind):
        a=S(name); nsi=S(ns) if ns else 0xFFFFFFFF
        if kind=='s': return struct.pack('<IIIHBBI',nsi,a,S(val),8,0,3,S(val))
        return struct.pack('<IIIHBBI',nsi,a,0xFFFFFFFF,8,0,0x10,val)
    def start(name,attrs):
        body=struct.pack('<IIHHHHHH',0xFFFFFFFF,S(name),20,20,len(attrs),0,0,0)+b''.join(attrs)
        return struct.pack('<HHIII',0x0102,16,16+len(body),1,0xFFFFFFFF)+body
    def end(name): return struct.pack('<HHIIIII',0x0103,16,24,1,0xFFFFFFFF,0xFFFFFFFF,S(name))
    ch=[]
    ch.append(struct.pack('<HHIIIII',0x0100,16,24,1,0xFFFFFFFF,S('android'),S(ANDROID)))
    ch.append(start('manifest',[attr(None,'package','com.test.app','s'),attr(ANDROID,'versionCode',7,'i'),attr(ANDROID,'versionName','1.2.3','s')]))
    ch.append(start('uses-sdk',[attr(ANDROID,'minSdkVersion',23,'i'),attr(ANDROID,'targetSdkVersion',34,'i')])); ch.append(end('uses-sdk'))
    for p in ['android.permission.INTERNET','android.permission.CAMERA']:
        ch.append(start('uses-permission',[attr(ANDROID,'name',p,'s')])); ch.append(end('uses-permission'))
    ch.append(start('application',[attr(ANDROID,'label','My App','s')]))
    ch.append(start('activity',[attr(ANDROID,'name','.MainActivity','s')])); ch.append(end('activity'))
    ch.append(end('application')); ch.append(end('manifest'))
    ch.append(struct.pack('<HHIIIII',0x0101,16,24,2,0xFFFFFFFF,S('android'),S(ANDROID)))
    # string pool
    data=b''; offs=[]
    for s in strs:
        offs.append(len(data))
        if utf8:
            e=s.encode('utf-8'); data+=bytes([len(s)])+bytes([len(e)])+e+b'\0'
        else:
            e=s.encode('utf-16-le'); data+=struct.pack('<H',len(s))+e+b'\0\0'
    while len(data)%4: data+=b'\0'
    hdr=28; sp=struct.pack('<HHIIIIII',0x0001,hdr,hdr+4*len(strs)+len(data),len(strs),0,0x100 if utf8 else 0,hdr+4*len(strs),0)+b''.join(struct.pack('<I',o) for o in offs)+data
    rm=struct.pack('<HHI',0x0180,8,8+4*len(names))+b''.join(struct.pack('<I',r) for _,r in names)
    body=sp+rm+b''.join(ch)
    return struct.pack('<HHI',0x0003,8,8+len(body))+body
with zipfile.ZipFile(F+'fake.apk','w',zipfile.ZIP_DEFLATED) as z:
    z.writestr('AndroidManifest.xml',axml()); z.writestr('classes.dex',b'dex\n035\0'+b'0'*500)
    z.writestr('res/mipmap-hdpi/ic_launcher.png',png((255,138,61),(72,72))); z.writestr('assets/hello.txt','hello'*100)
    z.writestr('resources.arsc',b'\x02\x00\x0c\x00'+b'\0'*64,compress_type=zipfile.ZIP_STORED)
    z.writestr('META-INF/CERT.RSA',b'x'*50)
with zipfile.ZipFile(F+'fake8.apk','w',zipfile.ZIP_DEFLATED) as z:
    z.writestr('AndroidManifest.xml',axml(True))
# PDFs
for i,c in enumerate([(200,50,50),(50,200,50),(50,50,200)]):
    pg=[Image.new('RGB',(300,400),c) for _ in range(i+2)]
    pg[0].save(F+'p%d.pdf'%(i+1),save_all=True,append_images=pg[1:])
# media
subprocess.run('ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=440:duration=2" -ar 44100 -ac 2 fix/tone.wav',shell=True)
subprocess.run('ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=440:duration=2" fix/tone.mp3',shell=True)
subprocess.run('ffmpeg -loglevel error -y -f lavfi -i testsrc=size=160x120:rate=10:duration=2 -f lavfi -i "sine=frequency=440:duration=2" -c:v libvpx -b:v 200k -c:a libvorbis -shortest fix/clip.webm',shell=True)
# fonts
from fontTools.ttLib import TTFont
src=glob.glob('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')[0]
import shutil; shutil.copy(src,F+'dj.ttf')
f=TTFont(src); f.flavor='woff'; f.save(F+'dj.woff')
Image.new('RGB',(64,64),(10,100,200)).save(F+'pic.jpg',quality=90)
open(F+'test.svg','w').write('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>')
open(F+'sample.srt','w').write('1\n00:00:01,000 --> 00:00:02,500\nمرحبا\n\n2\n00:00:03,000 --> 00:00:04,000\nHello\n')
print(os.listdir(F))
