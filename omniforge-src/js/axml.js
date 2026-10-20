/* محرّر AndroidManifest الثنائي (AXML): قراءة إلى نموذج قابل للتعديل ثم إعادة بناء ملف صالح.
 * يحافظ على كل العقد (مساحات الأسماء، التعليقات، أرقام الأسطر) ويعيد بناء مجمّع النصوص وخريطة الموارد.
 * قيود: لا يدعم مجمّعات نصوص فيها أنماط (style spans) — غير موجودة في المانيفست عادةً. */
(function (root) {
  'use strict';
  const A = {};
  const NS_ANDROID = 'http://schemas.android.com/apk/res/android';
  A.NS_ANDROID = NS_ANDROID;
  // معرّفات موارد سمات android.R.attr المعروفة (للسمات التي قد نضيفها)
  A.ATTR = { label: 0x01010001, icon: 0x01010002, name: 0x01010003, debuggable: 0x0101000F, minSdkVersion: 0x0101020C, versionCode: 0x0101021B, versionName: 0x0101021C, targetSdkVersion: 0x01010270, maxSdkVersion: 0x01010271, allowBackup: 0x01010280, usesCleartextTraffic: 0x010104EC };
  const T = { REF: 0x01, STRING: 0x03, FLOAT: 0x04, INT_DEC: 0x10, INT_HEX: 0x11, BOOL: 0x12 };
  A.T = T;
  const NIL = 0xFFFFFFFF;
  const dec8 = new TextDecoder('utf-8'), enc8 = new TextEncoder();

  /* ───── القراءة ───── */
  A.parse = function (u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (u8.length < 8 || dv.getUint16(0, true) !== 0x0003) throw new Error('ليس XML ثنائياً (AXML)');
    const total = dv.getUint32(4, true); if (total > u8.length) throw new Error('ملف AXML مقطوع'); const hs0 = dv.getUint16(2, true);
    let p = hs0, strings = null, utf8 = false, resIds = []; const nodes = [];
    const S = i => (i === NIL ? null : (strings && strings[i] != null ? strings[i] : (() => { throw new Error('فهرس نص غير صالح ' + i); })()));
    while (p + 8 <= total) {
      const type = dv.getUint16(p, true), hs = dv.getUint16(p + 2, true), size = dv.getUint32(p + 4, true); if (size < 8 || p + size > total) throw new Error('حجم مقطع غير صالح عند ' + p);
      if (type === 0x0001) {
        const cnt = dv.getUint32(p + 8, true), styleCnt = dv.getUint32(p + 12, true), flags = dv.getUint32(p + 16, true), sStart = dv.getUint32(p + 20, true); if (styleCnt) throw new Error('مجمّع النصوص يحوي أنماطاً (غير مدعوم)');
        utf8 = !!(flags & 0x100); strings = [];
        for (let i = 0; i < cnt; i++) {
          let o = p + sStart + dv.getUint32(p + hs + i * 4, true);
          if (utf8) { let l = u8[o++]; if (l & 0x80) o++; let bl = u8[o++]; if (bl & 0x80) bl = ((bl & 0x7F) << 8) | u8[o++]; strings.push(dec8.decode(u8.subarray(o, o + bl))); }
          else { let l = dv.getUint16(o, true); o += 2; if (l & 0x8000) { l = ((l & 0x7FFF) << 16) | dv.getUint16(o, true); o += 2; } let s = ''; for (let k = 0; k < l; k++) s += String.fromCharCode(dv.getUint16(o + k * 2, true)); strings.push(s); }
        }
      } else if (type === 0x0180) { for (let i = 0; i < (size - hs) / 4; i++) resIds.push(dv.getUint32(p + hs + i * 4, true)); }
      else if (type >= 0x0100 && type <= 0x0104) {
        const line = dv.getUint32(p + 8, true), cm = dv.getUint32(p + 12, true); const n = { line, comment: S(cm) };
        if (type === 0x0100 || type === 0x0101) { n.type = type === 0x0100 ? 'ns-start' : 'ns-end'; n.prefix = S(dv.getUint32(p + 16, true)); n.uri = S(dv.getUint32(p + 20, true)); }
        else if (type === 0x0102) {
          n.type = 'start'; n.ns = S(dv.getUint32(p + 16, true)); n.name = S(dv.getUint32(p + 20, true)); const as = dv.getUint16(p + 24, true), asz = dv.getUint16(p + 26, true), ac = dv.getUint16(p + 28, true); n.idIndex = dv.getUint16(p + 30, true); n.classIndex = dv.getUint16(p + 32, true); n.styleIndex = dv.getUint16(p + 34, true); if (asz !== 20) throw new Error('حجم سمة غير معتاد'); n.attrs = [];
          for (let i = 0; i < ac; i++) { const a = p + 16 + as + i * 20; const nameIdx = dv.getUint32(a + 4, true); const dt = dv.getUint8(a + 15), data = dv.getUint32(a + 16, true), rawIdx = dv.getUint32(a + 8, true);
            n.attrs.push({ ns: S(dv.getUint32(a, true)), name: S(nameIdx), resId: nameIdx < resIds.length ? resIds[nameIdx] : 0, dt, data: dt === T.STRING ? 0 : data, str: dt === T.STRING ? S(data) : null, raw: rawIdx === NIL ? null : S(rawIdx) }); }
        } else if (type === 0x0103) { n.type = 'end'; n.ns = S(dv.getUint32(p + 16, true)); n.name = S(dv.getUint32(p + 20, true)); }
        else { n.type = 'cdata'; n.text = S(dv.getUint32(p + 16, true)); n.dt = dv.getUint8(p + 23); n.data = dv.getUint32(p + 24, true); }
        nodes.push(n);
      } else throw new Error('نوع مقطع غير معروف 0x' + type.toString(16));
      p += size;
    }
    if (!strings) throw new Error('لا يوجد مجمّع نصوص'); return { utf8, nodes };
  };

  /* ───── البناء ───── */
  const align4 = n => (n + 3) & ~3;
  function encStr(s, utf8) {
    if (utf8) { const b = enc8.encode(s); const cl = [...s].length; const out = []; const len = (n, name) => { if (n > 0x7FFF) throw new Error('نص طويل جداً'); if (n > 0x7F) out.push((n >> 8) | 0x80, n & 255); else out.push(n); }; len(cl); len(b.length); const u = new Uint8Array(out.length + b.length + 1); u.set(out); u.set(b, out.length); return u; }
    if (s.length > 0x7FFFFFFF) throw new Error('نص طويل جداً'); const hdr = s.length > 0x7FFF ? 4 : 2; const u = new Uint8Array(hdr + s.length * 2 + 2); const dv = new DataView(u.buffer); if (hdr === 4) { dv.setUint16(0, (s.length >> 16) | 0x8000, true); dv.setUint16(2, s.length & 0xFFFF, true); } else dv.setUint16(0, s.length, true); for (let i = 0; i < s.length; i++) dv.setUint16(hdr + i * 2, s.charCodeAt(i), true); return u;
  }
  A.build = function (doc) {
    const utf8 = !!doc.utf8; const nodes = doc.nodes;
    // 1) النصوص: أسماء السمات ذات المعرّف أولاً (مرتبة بحسب المعرّف الأولي الظهور) لتطابق خريطة الموارد
    const idStrings = []; const idOf = new Map(); const rest = []; const seen = new Set();
    for (const n of nodes) if (n.type === 'start') for (const a of n.attrs) if (a.resId) { if (idOf.has(a.name)) { if (idOf.get(a.name) !== a.resId) throw new Error('السمة ' + a.name + ' لها معرّفان مختلفان'); } else { idOf.set(a.name, a.resId); idStrings.push(a.name); } }
    const index = new Map(); const pool = []; const add = s => { if (s == null) return NIL; if (!index.has(s)) { index.set(s, pool.length); pool.push(s); } return index.get(s); };
    idStrings.forEach(add); const idCount = idStrings.length;
    for (const n of nodes) { if (n.comment != null) add(n.comment); if (n.type === 'ns-start' || n.type === 'ns-end') { add(n.prefix); add(n.uri); } else if (n.type === 'start') { add(n.ns); add(n.name); for (const a of n.attrs) { add(a.ns); add(a.name); if (a.raw != null) add(a.raw); if (a.dt === T.STRING) add(a.str); } } else if (n.type === 'end') { add(n.ns); add(n.name); } else add(n.text); }
    // 2) مجمّع النصوص
    const encoded = pool.map(s => encStr(s, utf8)); let dataLen = 0; const offs = encoded.map(e => { const o = dataLen; dataLen += e.length; return o; }); const dataPad = align4(dataLen);
    const spHead = 28, spSize = align4(spHead + pool.length * 4 + dataPad);
    // 3) الحجم الكلي
    const resBytes = idCount ? 8 + idCount * 4 : 0; let nodeBytes = 0; for (const n of nodes) nodeBytes += n.type === 'start' ? 36 + 20 * n.attrs.length : n.type === 'cdata' ? 28 : 24;
    const total = 8 + spSize + resBytes + nodeBytes; const out = new Uint8Array(total); const dv = new DataView(out.buffer);
    dv.setUint16(0, 3, true); dv.setUint16(2, 8, true); dv.setUint32(4, total, true);
    let p = 8; dv.setUint16(p, 1, true); dv.setUint16(p + 2, spHead, true); dv.setUint32(p + 4, spSize, true); dv.setUint32(p + 8, pool.length, true); dv.setUint32(p + 12, 0, true); dv.setUint32(p + 16, utf8 ? 0x100 : 0, true); dv.setUint32(p + 20, spHead + pool.length * 4, true); dv.setUint32(p + 24, 0, true);
    offs.forEach((o, i) => dv.setUint32(p + spHead + i * 4, o, true)); let q = p + spHead + pool.length * 4; encoded.forEach(e => { out.set(e, q); q += e.length; }); p += spSize;
    if (idCount) { dv.setUint16(p, 0x0180, true); dv.setUint16(p + 2, 8, true); dv.setUint32(p + 4, resBytes, true); idStrings.forEach((s, i) => dv.setUint32(p + 8 + i * 4, idOf.get(s), true)); p += resBytes; }
    const ref = s => (s == null ? NIL : index.get(s));
    for (const n of nodes) {
      const head = (type, size) => { dv.setUint16(p, type, true); dv.setUint16(p + 2, 16, true); dv.setUint32(p + 4, size, true); dv.setUint32(p + 8, n.line >>> 0, true); dv.setUint32(p + 12, ref(n.comment), true); };
      if (n.type === 'ns-start' || n.type === 'ns-end') { head(n.type === 'ns-start' ? 0x100 : 0x101, 24); dv.setUint32(p + 16, ref(n.prefix), true); dv.setUint32(p + 20, ref(n.uri), true); p += 24; }
      else if (n.type === 'start') { const sz = 36 + 20 * n.attrs.length; head(0x102, sz); dv.setUint32(p + 16, ref(n.ns), true); dv.setUint32(p + 20, ref(n.name), true); dv.setUint16(p + 24, 20, true); dv.setUint16(p + 26, 20, true); dv.setUint16(p + 28, n.attrs.length, true); dv.setUint16(p + 30, n.idIndex || 0, true); dv.setUint16(p + 32, n.classIndex || 0, true); dv.setUint16(p + 34, n.styleIndex || 0, true);
        n.attrs.forEach((a, i) => { const o = p + 36 + i * 20; dv.setUint32(o, ref(a.ns), true); dv.setUint32(o + 4, ref(a.name), true); dv.setUint32(o + 8, a.dt === T.STRING ? ref(a.str) : ref(a.raw), true); dv.setUint16(o + 12, 8, true); dv.setUint8(o + 14, 0); dv.setUint8(o + 15, a.dt); dv.setUint32(o + 16, a.dt === T.STRING ? ref(a.str) : (a.data >>> 0), true); }); p += sz; }
      else if (n.type === 'end') { head(0x103, 24); dv.setUint32(p + 16, ref(n.ns), true); dv.setUint32(p + 20, ref(n.name), true); p += 24; }
      else { head(0x104, 28); dv.setUint32(p + 16, ref(n.text), true); dv.setUint16(p + 20, 8, true); dv.setUint8(p + 22, 0); dv.setUint8(p + 23, n.dt || 0); dv.setUint32(p + 24, n.data >>> 0, true); p += 28; }
    }
    return out;
  };

  /* ───── مساعدات التعديل ───── */
  A.elements = (doc, tag) => doc.nodes.filter(n => n.type === 'start' && (!tag || n.name === tag));
  A.endIndex = (doc, startNode) => { const i = doc.nodes.indexOf(startNode); if (i < 0) throw new Error('عقدة غير موجودة'); let d = 0; for (let k = i; k < doc.nodes.length; k++) { const n = doc.nodes[k]; if (n.type === 'start') d++; else if (n.type === 'end') { d--; if (d === 0) return k; } } throw new Error('عنصر غير مغلق'); };
  A.getAttr = (el, name, ns) => el.attrs.find(a => a.name === name && (ns === undefined || a.ns === ns));
  A.attrValue = a => (!a ? null : a.dt === T.STRING ? a.str : a.dt === T.BOOL ? !!a.data : a.dt === T.INT_DEC ? a.data | 0 : a.dt === T.INT_HEX ? a.data >>> 0 : a.dt === T.REF ? '@0x' + a.data.toString(16) : a.data);
  // قيمة جديدة: {type:'string'|'int'|'bool'|'hex', value}
  const mkVal = v => { switch (v.type) { case 'string': return { dt: T.STRING, data: 0, str: String(v.value), raw: null }; case 'bool': return { dt: T.BOOL, data: v.value ? 0xFFFFFFFF : 0, str: null, raw: null }; case 'int': { const n = Math.trunc(+v.value); if (!Number.isFinite(n) || n < -2147483648 || n > 4294967295) throw new Error('عدد غير صالح'); return { dt: T.INT_DEC, data: n >>> 0, str: null, raw: null }; } default: throw new Error('نوع قيمة غير معروف'); } };
  // يضبط/يضيف سمة بمساحة android بحسب الترتيب الصاعد للمعرّف (شرط أندرويد). ns للسمات بلا مساحة = null.
  A.setAttr = (el, name, val, opts) => {
    opts = opts || {}; const ns = opts.ns === undefined ? NS_ANDROID : opts.ns; const nv = mkVal(val); const ex = el.attrs.find(a => a.name === name && a.ns === ns);
    if (ex) { Object.assign(ex, nv); return ex; }
    let resId = opts.resId || (ns === NS_ANDROID ? A.ATTR[name] : 0) || 0; if (ns === NS_ANDROID && !resId) throw new Error('معرّف مورد غير معروف للسمة ' + name);
    const a = Object.assign({ ns, name, resId }, nv); let pos = el.attrs.length;
    if (resId) { pos = el.attrs.findIndex(x => !x.resId || x.resId > resId); if (pos < 0) pos = el.attrs.length; }
    el.attrs.splice(pos, 0, a); return a;
  };
  A.removeAttr = (el, name, ns) => { const i = el.attrs.findIndex(a => a.name === name && (ns === undefined || a.ns === ns)); if (i >= 0) el.attrs.splice(i, 1); return i >= 0; };
  A.removeElement = (doc, el) => { const i = doc.nodes.indexOf(el), e = A.endIndex(doc, el); doc.nodes.splice(i, e - i + 1); };
  // يضيف عنصراً فارغاً (بسمات) قبل العقدة beforeNode (تُعطى عقدة start) داخل نفس الأب
  A.addElement = (doc, beforeNode, tag, attrs) => {
    const i = doc.nodes.indexOf(beforeNode); if (i < 0) throw new Error('نقطة الإدراج غير موجودة'); const line = beforeNode.line || 0;
    const st = { type: 'start', line, comment: null, ns: null, name: tag, idIndex: 0, classIndex: 0, styleIndex: 0, attrs: [] }; const en = { type: 'end', line, comment: null, ns: null, name: tag };
    doc.nodes.splice(i, 0, st, en); for (const [k, v] of Object.entries(attrs || {})) A.setAttr(st, k, v); return st;
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = A; else { root.OF = root.OF || {}; root.OF.axml = A; }
})(typeof window !== 'undefined' ? window : globalThis);
