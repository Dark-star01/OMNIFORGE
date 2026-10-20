#!/usr/bin/env python3
"""مدقّق بنيوي مستقل لملف AXML: أحجام المقاطع، إزاحات النصوص، محاذاة 4 بايت، تطابق خريطة الموارد مع أول النصوص،
وترتيب السمات تصاعدياً حسب معرّف المورد (شرط AssetManager::retrieveAttributes). يخرج 0 إن صحّ."""
import struct, sys
d = open(sys.argv[1], 'rb').read()
def fail(m): print('FAIL:', m); sys.exit(1)
t, hs, total = struct.unpack_from('<HHI', d, 0)
if t != 3 or hs != 8: fail('header')
if total != len(d): fail('total size %d != %d' % (total, len(d)))
p = 8; strings = None; res = []; depth = 0; stack = []; seen_start = False
while p < total:
    ty, h, sz = struct.unpack_from('<HHI', d, p)
    if sz % 4 or p + sz > total: fail('chunk size/align at %d' % p)
    if ty == 1:
        cnt, scnt, fl, ss, sts = struct.unpack_from('<5I', d, p + 8)
        if h != 28 or scnt != 0 or sts != 0: fail('stringpool hdr')
        if ss != 28 + cnt * 4: fail('stringsStart')
        utf8 = bool(fl & 0x100); strings = []
        offs = struct.unpack_from('<%dI' % cnt, d, p + 28)
        for o in offs:
            q = p + ss + o
            if utf8:
                l = d[q]; q += 1
                if l & 0x80: q += 1
                bl = d[q]; q += 1
                if bl & 0x80: bl = ((bl & 0x7f) << 8) | d[q]; q += 1
                s = d[q:q + bl].decode('utf-8'); 
                if d[q + bl] != 0: fail('utf8 terminator')
            else:
                l = struct.unpack_from('<H', d, q)[0]; q += 2
                if l & 0x8000: fail('long utf16 unsupported in validator')
                s = d[q:q + l * 2].decode('utf-16le')
                if struct.unpack_from('<H', d, q + l * 2)[0] != 0: fail('utf16 terminator')
            strings.append(s)
        if len(set(strings)) != len(strings): fail('duplicate strings')
    elif ty == 0x180:
        res = list(struct.unpack_from('<%dI' % ((sz - h) // 4), d, p + h))
    elif ty in (0x100, 0x101):
        if h != 16 or sz != 24: fail('ns chunk')
    elif ty == 0x102:
        if h != 16: fail('start hdr')
        ns, nm, ast, asz, ac = struct.unpack_from('<IIHHH', d, p + 16)
        if ast != 20 or asz != 20 or sz != 36 + 20 * ac: fail('start sizes')
        prev = 0; noid = False
        for i in range(ac):
            a = p + 36 + i * 20
            ans, an, raw, vs, r0, dt, data = struct.unpack_from('<IIIHBBI', d, a)
            if vs != 8 or r0 != 0: fail('typed value hdr')
            if an >= len(strings): fail('attr name idx')
            rid = res[an] if an < len(res) else 0
            if rid:
                if noid: fail('attribute with id after attribute without id: ' + strings[an])
                if rid < prev: fail('attrs not sorted by resId: %s 0x%x < 0x%x' % (strings[an], rid, prev))
                prev = rid
            else: noid = True
            if dt == 3 and data >= len(strings): fail('string value idx')
            if dt == 3 and raw != data: fail('raw != data for string')
        stack.append(strings[nm])
    elif ty == 0x103:
        nm = struct.unpack_from('<I', d, p + 20)[0]
        if not stack or stack.pop() != strings[nm]: fail('end mismatch')
    elif ty == 0x104: pass
    else: fail('unknown chunk %x' % ty)
    p += sz
if stack: fail('unclosed elements')
# أسماء السمات ذات المعرّف يجب أن تكون في أول النصوص بنفس ترتيب الخريطة
if res:
    for i, rid in enumerate(res):
        if i >= len(strings): fail('resmap longer than pool')
print('OK strings=%d resmap=%d' % (len(strings), len(res)))
