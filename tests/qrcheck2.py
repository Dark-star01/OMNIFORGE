import json, cv2, numpy as np, collections
d=json.load(open('qr.json'))
dets={'std':cv2.QRCodeDetector(),'aruco':cv2.QRCodeDetectorAruco()}
res=collections.defaultdict(dict)
for it in d:
    n=it['size']; q=4; s=8
    img=np.full(((n+2*q)*s,(n+2*q)*s),255,np.uint8)
    for y,row in enumerate(it['rows']):
        for x,c in enumerate(row):
            if c=='1': img[(y+q)*s:(y+q+1)*s,(x+q)*s:(x+q+1)*s]=0
    ok=False
    for k,det in dets.items():
        try:
            val,_,_=det.detectAndDecode(img)
        except Exception as e: val=''
        if val==it['text']: ok=True;break
    res[(it['e'])].setdefault(it['v'],[]).append(ok)
for e in 'LMQH':
    print(e,' '.join(f"{v}:{'Y' if all(r) else ('p' if any(r) else 'N')}" for v,r in sorted(res[e].items())))
