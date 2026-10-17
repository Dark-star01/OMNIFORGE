/* أدوات الأمان والخصوصية */
(function () {
  'use strict';
  const { h, ui } = OF;
  const T = OF.tools;
  const enc = new TextEncoder(), dec = new TextDecoder();

  /* عشوائية تشفيرية بدون انحياز */
  function rnd(n) {
    if (n <= 0 || n > 4294967296) throw new Error('نطاق عشوائي غير صالح');
    const b = new Uint32Array(1); const lim = Math.floor(4294967296 / n) * n; let x;
    do { crypto.getRandomValues(b); x = b[0]; } while (x >= lim);
    return x % n;
  }
  const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const hex = OF.fmt.hex;

  /* ───────────── المولّد الآمن ───────────── */
  const SETS = { lower: 'abcdefghijklmnopqrstuvwxyz', upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', digits: '0123456789', symbols: '!@#$%^&*()-_=+[]{};:,.?/~' };
  const AMBIG = /[0O1lI|`'"]/g;
  function strength(bits) { return bits < 40 ? 'ضعيفة' : bits < 64 ? 'متوسطة' : bits < 100 ? 'قوية' : 'قوية جداً'; }
  T['secure-generator'] = {
    render(box) {
      OF.clear(box);
      box.appendChild(ui.tabs([
        { id: 'pw', label: 'كلمة مرور', render(p) {
          const len = ui.input({ type: 'range', min: 8, max: 128, value: 20 }); const lv = h('span', { text: '20' }); len.addEventListener('input', () => (lv.textContent = len.value));
          const c = { lower: ui.check('أحرف صغيرة a-z', true), upper: ui.check('أحرف كبيرة A-Z', true), digits: ui.check('أرقام 0-9', true), symbols: ui.check('رموز !@#', true) }; const amb = ui.check('استبعاد الأحرف المتشابهة (0O1lI)', false);
          const cnt = ui.input({ type: 'number', value: 5, min: 1, max: 20 }); const out = ui.out(); const list = h('div');
          p.append(ui.card('', ui.field(null, h('div', null, 'الطول: ', lv), len), ...Object.values(c), amb, ui.field('العدد', cnt), ui.btn('توليد', () => {
            out.clear(); OF.clear(list); const sets = Object.keys(c).filter(k => c[k].input.checked).map(k => (amb.input.checked ? SETS[k].replace(AMBIG, '') : SETS[k]));
            const L = +len.value, N = Math.max(1, Math.min(20, Math.floor(+cnt.value) || 1)); if (!sets.length) return out.warn('اختر نوعاً واحداً على الأقل'); if (L < sets.length) return out.warn('الطول أقل من عدد الأنواع');
            const all = sets.join(''); const bits = L * Math.log2(all.length);
            for (let k = 0; k < N; k++) { const ch = sets.map(s => s[rnd(s.length)]); while (ch.length < L) ch.push(all[rnd(all.length)]); for (let i = ch.length - 1; i > 0; i--) { const j = rnd(i + 1); [ch[i], ch[j]] = [ch[j], ch[i]]; } const pw = ch.join(''); list.appendChild(h('div', { class: 'saverow' }, h('span', { class: 'nm mono', text: pw }), ui.copyBtn(() => pw))); }
            out.info('الإنتروبيا التقريبية: ' + bits.toFixed(0) + ' بت (' + strength(bits) + '). لا تُحفظ الكلمات ولا تغادر الجهاز.');
          }, { kind: 'primary' })), out, list);
        } },
        { id: 'pin', label: 'PIN / أرقام', render(p) {
          const len = ui.input({ type: 'number', value: 6, min: 4, max: 32 }); const out = ui.out(); const res = h('div');
          p.append(ui.card('', ui.field('عدد الخانات', len), ui.btn('توليد', () => { out.clear(); OF.clear(res); const n = Math.floor(+len.value); if (!(n >= 4 && n <= 32)) return out.warn('بين 4 و32'); const v = Array.from({ length: n }, () => rnd(10)).join(''); res.appendChild(h('div', { class: 'saverow' }, h('span', { class: 'nm mono', text: v }), ui.copyBtn(() => v))); out.info('≈ ' + (n * Math.log2(10)).toFixed(0) + ' بت'); }, { kind: 'primary' })), out, res);
        } },
        { id: 'token', label: 'توكن / UUID', render(p) {
          const bytes = ui.input({ type: 'number', value: 32, min: 8, max: 256 }); const fmt = ui.select([['hex', 'Hex'], ['b64u', 'Base64 URL-safe'], ['b64', 'Base64']]); const out = ui.out(); const res = h('div');
          const mk = (txt) => res.appendChild(h('div', { class: 'saverow' }, h('span', { class: 'nm mono', text: txt }), ui.copyBtn(() => txt)));
          p.append(ui.card('توكن عشوائي', ui.field('عدد البايتات', bytes), ui.field('الصيغة', fmt), ui.row(ui.btn('توليد توكن', () => { out.clear(); OF.clear(res); const n = Math.floor(+bytes.value); if (!(n >= 8 && n <= 256)) return out.warn('بين 8 و256 بايت'); const u = crypto.getRandomValues(new Uint8Array(n)); mk(fmt.value === 'hex' ? hex(u) : fmt.value === 'b64' ? b64(u) : b64(u).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')); out.info(n * 8 + ' بت'); }, { kind: 'primary' }), ui.btn('UUID v4', () => { out.clear(); OF.clear(res); const u = crypto.getRandomValues(new Uint8Array(16)); u[6] = (u[6] & 15) | 64; u[8] = (u[8] & 63) | 128; const x = hex(u); mk([x.slice(0, 8), x.slice(8, 12), x.slice(12, 16), x.slice(16, 20), x.slice(20)].join('-')); }))), out, res);
        } },
      ]));
    },
  };

  /* ───────────── البصمات ───────────── */
  const ALGS = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];
  const digest = async (alg, buf) => new Uint8Array(await crypto.subtle.digest(alg, buf));
  OF.hashFile = async (file, alg) => hex(await digest(alg, await OF.readBuf(file)));
  T['hash-studio'] = {
    render(box) {
      OF.clear(box);
      const compare = (outEl, results, expected) => {
        const e = expected.trim().toLowerCase().replace(/\s+/g, ''); if (!e) return;
        const hit = results.find(r => r.hex === e || r.b64 === expected.trim());
        hit ? outEl.ok('مطابقة: القيمة المتوقعة تساوي ' + hit.alg) : outEl.error('لا تطابق أي خوارزمية محسوبة.');
      };
      const table = (res) => ui.kv(res.map(r => [r.alg, h('span', { class: 'mono', text: r.hex }), ]));
      box.appendChild(ui.tabs([
        { id: 'text', label: 'نص', render(p) {
          const inp = ui.area({ rows: 5, placeholder: 'النص…' }); const exp = ui.input({ placeholder: 'قيمة متوقعة للمقارنة (اختياري)', dir: 'ltr', code: true }); const out = ui.out();
          p.append(ui.card('', inp, ui.field('', exp), ui.btn('احسب', async () => {
            out.clear(); if (!inp.value) return out.warn('أدخل نصاً'); const buf = enc.encode(inp.value); const res = [];
            for (const a of ALGS) { const d = await digest(a, buf); res.push({ alg: a, hex: hex(d), b64: b64(d) }); }
            out.add(table(res)); res.forEach(r => out.add(ui.row(h('span', { class: 'small muted', text: r.alg }), ui.copyBtn(() => r.hex, 'نسخ')))); compare(out, res, exp.value);
          }, { kind: 'primary' })), out);
        } },
        { id: 'file', label: 'ملف', render(p) {
          const f = ui.files({ label: 'اختر ملفاً', maxMB: 300 }); const exp = ui.input({ placeholder: 'قيمة متوقعة للمقارنة (اختياري)', dir: 'ltr', code: true }); const out = ui.out();
          const btn = ui.btn('احسب', null, { kind: 'primary' });
          p.append(ui.card('', f, ui.field('', exp), btn), out);
          ui.task(btn, out, async t => {
            const file = f.first(); if (!file) throw new Error('اختر ملفاً أولاً'); t.progress(null, 'قراءة الملف في الذاكرة…'); const buf = await OF.readBuf(file); const res = [];
            for (const a of ALGS) { t.progress(null, 'حساب ' + a + '…'); const d = await digest(a, buf); res.push({ alg: a, hex: hex(d), b64: b64(d) }); await OF.tick(); }
            out.kv([['الملف', file.name], ['الحجم', OF.fmt.bytes(file.size)]]); out.add(table(res)); compare(out, res, exp.value);
          });
        } },
        { id: 'hmac', label: 'HMAC', render(p) {
          const msg = ui.area({ rows: 4, placeholder: 'الرسالة' }); const key = ui.input({ type: 'password', placeholder: 'المفتاح', dir: 'ltr' }); const alg = ui.select(['SHA-256', 'SHA-384', 'SHA-512', 'SHA-1'], 'SHA-256'); const out = ui.out();
          p.append(ui.card('', ui.field('', msg), ui.field('المفتاح', key), ui.field('الخوارزمية', alg), ui.btn('احسب HMAC', async () => { out.clear(); if (!key.value || !msg.value) return out.warn('أدخل الرسالة والمفتاح'); const k = await crypto.subtle.importKey('raw', enc.encode(key.value), { name: 'HMAC', hash: alg.value }, false, ['sign']); const s = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg.value))); out.kv([['Hex', h('span', { class: 'mono', text: hex(s) })], ['Base64', h('span', { class: 'mono', text: b64(s) })]]); out.add(ui.copyBtn(() => hex(s), 'نسخ Hex')); }, { kind: 'primary' })), out);
        } },
      ]));
    },
  };

  /* ───────────── تنظيف البيانات الوصفية ───────────── */
  function parseExif(tiff) { // tiff: Uint8Array يبدأ من «II»/«MM»
    const info = {}; try {
      const dv = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength); const le = dv.getUint16(0) === 0x4949; const u16 = o => dv.getUint16(o, le), u32 = o => dv.getUint32(o, le);
      const str = (o, n) => { let s = ''; for (let i = 0; i < n && tiff[o + i]; i++) s += String.fromCharCode(tiff[o + i]); return s.trim(); };
      const readIfd = (off, cb) => { const n = u16(off); for (let i = 0; i < n; i++) { const e = off + 2 + i * 12; const tag = u16(e), type = u16(e + 2), cnt = u32(e + 4); cb(tag, type, cnt, e + 8); } };
      const valOff = (type, cnt, e) => { const size = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1 }[type] || 1; return size * cnt > 4 ? u32(e) : e; };
      let exifPtr = 0, gpsPtr = 0;
      readIfd(u32(4), (tag, type, cnt, e) => {
        if (tag === 0x010F) info['الشركة المصنعة'] = str(valOff(type, cnt, e), cnt); if (tag === 0x0110) info['الطراز'] = str(valOff(type, cnt, e), cnt); if (tag === 0x0131) info['البرنامج'] = str(valOff(type, cnt, e), cnt);
        if (tag === 0x0132) info['التاريخ'] = str(valOff(type, cnt, e), cnt); if (tag === 0x0112) info.orientation = u16(e); if (tag === 0x8769) exifPtr = u32(e); if (tag === 0x8825) gpsPtr = u32(e);
      });
      if (exifPtr) readIfd(exifPtr, (tag, type, cnt, e) => { if (tag === 0x9003) info['تاريخ الالتقاط'] = str(valOff(type, cnt, e), cnt); if (tag === 0xA431) info['رقم تسلسلي للجسم'] = str(valOff(type, cnt, e), cnt); });
      if (gpsPtr) {
        const g = {}; readIfd(gpsPtr, (tag, type, cnt, e) => { if (tag === 1 || tag === 3) g[tag] = String.fromCharCode(tiff[e]); if (tag === 2 || tag === 4) { const o = valOff(type, cnt, e); const r = i => u32(o + i * 8) / (u32(o + i * 8 + 4) || 1); g[tag] = r(0) + r(1) / 60 + r(2) / 3600; } });
        if (g[2] != null && g[4] != null) info['إحداثيات GPS'] = ((g[1] === 'S' ? -1 : 1) * g[2]).toFixed(5) + ', ' + ((g[3] === 'W' ? -1 : 1) * g[4]).toFixed(5); else info['GPS'] = 'موجود';
      }
    } catch (e) { info['EXIF'] = 'تعذر قراءة كل الحقول'; }
    return info;
  }
  function cleanJpeg(u8, keepOrient) {
    if (u8[0] !== 0xFF || u8[1] !== 0xD8) throw new Error('الملف ليس JPEG صالحاً');
    const removed = [], found = {}; const parts = [u8.subarray(0, 2)]; let i = 2; let orient = 1;
    while (i < u8.length) {
      if (u8[i] !== 0xFF) throw new Error('بنية JPEG غير متوقعة عند البايت ' + i);
      let m = u8[i + 1]; while (m === 0xFF) { i++; m = u8[i + 1]; }
      if (m === 0xD9 || m === 0xDA) { parts.push(u8.subarray(i)); break; } // EOI أو بداية بيانات الصورة
      if (m === 0x01 || (m >= 0xD0 && m <= 0xD8)) { parts.push(u8.subarray(i, i + 2)); i += 2; continue; }
      const len = (u8[i + 2] << 8) | u8[i + 3]; const seg = u8.subarray(i, i + 2 + len); const body = u8.subarray(i + 4, i + 2 + len);
      const id = m >= 0xE0 && m <= 0xEF ? String.fromCharCode(...body.subarray(0, Math.min(body.length, 29))).replace(/\0.*/, '') : '';
      let drop = false, label = '';
      if (m === 0xE1 && id.startsWith('Exif')) { drop = true; label = 'EXIF'; Object.assign(found, parseExif(body.subarray(6))); if (found.orientation) orient = found.orientation; }
      else if (m === 0xE1 && id.startsWith('http://ns.adobe.com/xap')) { drop = true; label = 'XMP'; }
      else if (m === 0xED) { drop = true; label = 'Photoshop/IPTC'; } else if (m === 0xFE) { drop = true; label = 'تعليق'; }
      else if (m === 0xE2 && id.startsWith('MPF')) { drop = true; label = 'MPF (صور متعددة)'; }
      else if ((m >= 0xE3 && m <= 0xEC) || m === 0xE0 && !id.startsWith('JFIF') && !id.startsWith('JFXX')) { drop = true; label = 'APP' + (m - 0xE0) + ' ' + id; }
      if (drop) removed.push(label + ' (' + OF.fmt.bytes(seg.length) + ')'); else parts.push(seg);
      i += 2 + len;
    }
    delete found.orientation; const orientKept = keepOrient && orient > 1;
    if (orientKept) { // APP1 EXIF صغير فيه Orientation فقط
      const t = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0, 0, 0x49, 0x49, 0x2A, 0, 8, 0, 0, 0, 1, 0, 0x12, 1, 3, 0, 1, 0, 0, 0, orient, 0, 0, 0, 0, 0, 0, 0]); const len = t.length + 2;
      parts.splice(1, 0, new Uint8Array([0xFF, 0xE1, len >> 8, len & 255]), t);
    }
    return { blob: new Blob(parts, { type: 'image/jpeg' }), removed, found, orientKept, orient };
  }
  const PNG_STRIP = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);
  function cleanPng(u8) {
    const sig = [137, 80, 78, 71, 13, 10, 26, 10]; if (!sig.every((b, k) => u8[k] === b)) throw new Error('الملف ليس PNG صالحاً');
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); const parts = [u8.subarray(0, 8)]; const removed = [], found = {}; let i = 8;
    while (i + 8 <= u8.length) {
      const len = dv.getUint32(i); const type = String.fromCharCode(u8[i + 4], u8[i + 5], u8[i + 6], u8[i + 7]); const end = i + 12 + len; if (end > u8.length) throw new Error('PNG مقطوع أو تالف');
      if (PNG_STRIP.has(type)) { removed.push(type + ' (' + OF.fmt.bytes(end - i) + ')'); if (type === 'tEXt') { const body = u8.subarray(i + 8, i + 8 + len); const z = body.indexOf(0); found[dec.decode(body.subarray(0, z))] = dec.decode(body.subarray(z + 1)).slice(0, 120); } if (type === 'eXIf') Object.assign(found, parseExif(u8.subarray(i + 8, i + 8 + len))); }
      else parts.push(u8.subarray(i, end));
      i = end; if (type === 'IEND') break;
    }
    delete found.orientation; return { blob: new Blob(parts, { type: 'image/png' }), removed, found };
  }
  async function cleanPdf(buf) {
    const { PDFDocument, PDFName } = PDFLib; let doc; try { doc = await PDFDocument.load(buf, { updateMetadata: false }); } catch (e) { throw new Error('تعذر فتح PDF (قد يكون مشفراً أو تالفاً): ' + e.message); }
    const found = {}; const info = doc.getInfoDict(); const names = { Title: 'العنوان', Author: 'المؤلف', Subject: 'الموضوع', Keywords: 'الكلمات المفتاحية', Creator: 'المنشئ', Producer: 'المُنتِج', CreationDate: 'تاريخ الإنشاء', ModDate: 'تاريخ التعديل' }; const removed = [];
    info.keys().slice().forEach(k => { const key = k.decodeText ? k.decodeText() : String(k).replace('/', ''); const v = info.get(k); found[names[key] || key] = String(v && v.decodeText ? v.decodeText() : v).slice(0, 120); info.delete(k); removed.push('Info/' + key); });
    if (doc.catalog.has(PDFName.of('Metadata'))) { doc.catalog.delete(PDFName.of('Metadata')); removed.push('XMP Metadata'); }
    const bytes = await doc.save({ useObjectStreams: false, updateFieldAppearances: false }); return { blob: new Blob([bytes], { type: 'application/pdf' }), removed, found };
  }
  T['metadata-cleaner'] = {
    render(box) {
      const f = ui.files({ accept: '.jpg,.jpeg,.png,.pdf', exts: ['jpg', 'jpeg', 'png', 'pdf'], multiple: true, label: 'اختر صوراً JPEG/PNG أو ملفات PDF', maxMB: 100 }); const keep = ui.check('الإبقاء على اتجاه الصورة (Orientation) لتفادي تدويرها', true); const out = ui.out(); const btn = ui.btn('نظّف', null, { kind: 'primary', icon: 'eraser' });
      box.append(ui.card('', f, keep, btn), out);
      ui.task(btn, out, async t => {
        const files = f.files(); if (!files.length) throw new Error('اختر ملفاً أولاً');
        for (let k = 0; k < files.length; k++) {
          const file = files[k]; t.progress((k / files.length) * 100, file.name); t.check(); const ext = OF.extOf(file.name); const buf = await OF.readBuf(file);
          try {
            const r = ext === 'pdf' ? await cleanPdf(buf) : ext === 'png' ? cleanPng(new Uint8Array(buf)) : cleanJpeg(new Uint8Array(buf), keep.input.checked);
            const outName = OF.baseOf(file.name) + '_clean.' + (ext === 'jpeg' ? 'jpg' : ext);
            const card = ui.card(file.name); const fkeys = Object.keys(r.found || {});
            if (!r.removed.length) card.appendChild(h('div', { class: 'msg info' }, OF.icon('info'), h('span', { text: 'لم يُعثر على بيانات وصفية قابلة للإزالة في هذا الملف.' })));
            else card.appendChild(ui.kv([['أُزيل', r.removed.join('، ')], ['الحجم', OF.fmt.bytes(file.size) + ' ← ' + OF.fmt.bytes(r.blob.size)]]));
            if (fkeys.length) card.appendChild(ui.kv(fkeys.map(x => [x, r.found[x]])));
            if (r.orientKept) card.appendChild(h('p', { class: 'hint', text: 'أُبقي حقل الاتجاه فقط (قيمة ' + r.orient + ').' }));
            if (ext === 'pdf') card.appendChild(h('p', { class: 'hint', text: 'ملاحظة: تمت إزالة معلومات المستند وXMP فقط؛ قد تبقى بيانات داخل محتوى الصفحات أو الخطوط.' }));
            card.appendChild(ui.saveRow(outName, r.blob, { preview: true })); out.add(card);
          } catch (e) { out.error(file.name + ': ' + e.message); }
        }
      });
    },
  };
  T['metadata-cleaner'].api = { cleanJpeg, cleanPng, cleanPdf, parseExif };

  /* ───────────── إخفاء البيانات ───────────── */
  const luhn = d => { let s = 0, alt = false; for (let i = d.length - 1; i >= 0; i--) { let n = +d[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } s += n; alt = !alt; } return s % 10 === 0; };
  const PATTERNS = [
    { k: 'email', l: 'البريد الإلكتروني', tag: 'EMAIL', re: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g },
    { k: 'url', l: 'الروابط', tag: 'URL', re: /https?:\/\/[^\s<>"')]+/g },
    { k: 'iban', l: 'آيبان (IBAN)', tag: 'IBAN', re: /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,4})?\b/g },
    { k: 'card', l: 'أرقام البطاقات (Luhn)', tag: 'CARD', re: /\b(?:\d[ -]?){13,19}\b/g, ok: m => luhn(m.replace(/\D/g, '')) },
    { k: 'phone', l: 'أرقام الهاتف', tag: 'PHONE', re: /(?:\+|00)?\d{1,3}[\s-]?\(?\d{2,3}\)?[\s-]?\d{3}[\s-]?\d{3,4}\b|\b05\d{8}\b/g, ok: m => m.replace(/\D/g, '').length >= 9 },
    { k: 'ip', l: 'عناوين IPv4', tag: 'IP', re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, ok: m => m.split('.').every(x => +x <= 255) },
    { k: 'long', l: 'أرقام طويلة (9+ خانات، مثل الهوية)', tag: 'NUM', re: /\b\d{9,}\b/g },
  ];
  T['redactor'] = {
    render(box) {
      const inp = ui.area({ rows: 8, placeholder: 'ألصق النص…' }); const checks = PATTERNS.map(p => [p, ui.check(p.l, true)]); const custom = ui.area({ rows: 3, placeholder: 'كلمات/عبارات مخصصة للإخفاء (واحدة في كل سطر)' });
      const style = ui.select([['block', 'كتل ████ بنفس الطول'], ['label', 'وسم [EMAIL]'], ['fixed', '[محذوف]']], 'block'); const outp = ui.area({ rows: 8, readonly: true }); const out = ui.out();
      const go = ui.btn('أخفِ', () => {
        out.clear(); let s = inp.value; if (!s) return out.warn('أدخل نصاً'); const counts = [];
        const repl = (m, tag) => (style.value === 'block' ? '█'.repeat(Math.max(3, [...m].length)) : style.value === 'label' ? '[' + tag + ']' : '[محذوف]');
        const words = custom.value.split('\n').map(x => x.trim()).filter(Boolean);
        words.forEach(w => { let n = 0; s = s.replace(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), m => { n++; return repl(m, 'CUSTOM'); }); if (n) counts.push(['«' + w + '»', n]); });
        checks.forEach(([p, c]) => { if (!c.input.checked) return; let n = 0; s = s.replace(p.re, m => { if (p.ok && !p.ok(m)) return m; n++; return repl(m, p.tag); }); if (n) counts.push([p.l, n]); });
        outp.value = s; counts.length ? (out.ok('تم الإخفاء'), out.kv(counts)) : out.info('لم يُعثر على بيانات مطابقة. راجع النص يدوياً أيضاً.');
        out.warn('الاكتشاف تلقائي بأنماط عامة وقد يفوّت بيانات (أسماء، عناوين…). راجع النتيجة قبل المشاركة.');
      }, { kind: 'primary' });
      box.append(ui.card('النص', inp), ui.card('ما يُخفى', h('div', { class: 'grid' }, checks.map(c => c[1])), custom, ui.field('أسلوب الإخفاء', style), go), out, ui.card('النتيجة', outp, ui.copyBtn(() => outp.value)));
    },
  };

  /* ───────────── التشفير AES-256-GCM ───────────── */
  const MAGIC = [0x4F, 0x4D, 0x4E, 0x49]; const ITER = 600000;
  // الترويسة: "OMNI"(4) | version=1 (1) | kdf=1 PBKDF2-SHA256 (1) | iterations u32 (4) | salt (16) | iv (12) | ciphertext+tag
  async function deriveKey(pass, salt, iters) { const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']); return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iters, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); }
  async function encryptBytes(plain, name, pass) {
    const nm = enc.encode(name || ''); if (nm.length > 65535) throw new Error('اسم الملف طويل جداً');
    const payload = new Uint8Array(2 + nm.length + plain.length); payload[0] = nm.length >> 8; payload[1] = nm.length & 255; payload.set(nm, 2); payload.set(plain, 2 + nm.length);
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)); const head = new Uint8Array(4 + 1 + 1 + 4 + 16 + 12); head.set(MAGIC, 0); head[4] = 1; head[5] = 1; new DataView(head.buffer).setUint32(6, ITER); head.set(salt, 10); head.set(iv, 26);
    const key = await deriveKey(pass, salt, ITER); const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: head.subarray(0, 26) }, key, payload));
    const outb = new Uint8Array(head.length + ct.length); outb.set(head); outb.set(ct, head.length); return outb;
  }
  async function decryptBytes(data, pass) {
    if (data.length < 4 + 1 + 1 + 4 + 16 + 12 + 16 || !MAGIC.every((b, i) => data[i] === b)) throw new Error('الملف ليس بصيغة OMNIFORGE المشفّرة (.omnienc)');
    if (data[4] !== 1 || data[5] !== 1) throw new Error('إصدار التشفير غير مدعوم');
    const iters = new DataView(data.buffer, data.byteOffset).getUint32(6); if (iters < 100000 || iters > 5000000) throw new Error('عدد تكرارات غير معقول في الترويسة');
    const salt = data.subarray(10, 26), iv = data.subarray(26, 38); const key = await deriveKey(pass, salt, iters); let pt;
    try { pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: data.subarray(0, 26) }, key, data.subarray(38))); } catch (e) { throw new Error('فشل فك التشفير: كلمة المرور خاطئة أو الملف معدّل/تالف.'); }
    const nl = (pt[0] << 8) | pt[1]; return { name: dec.decode(pt.subarray(2, 2 + nl)), data: pt.subarray(2 + nl) };
  }
  T['encryptor'] = {
    render(box) {
      OF.clear(box);
      const passFields = () => { const p1 = ui.input({ type: 'password', dir: 'ltr', placeholder: 'كلمة المرور' }), p2 = ui.input({ type: 'password', dir: 'ltr', placeholder: 'تأكيد كلمة المرور' }); return { p1, p2 }; };
      box.appendChild(h('div', { class: 'msg warn' }, OF.icon('info'), h('span', { text: 'لا يمكن استرجاع كلمة المرور. إن نسيتها فلا سبيل لفك التشفير. التشفير AES-256-GCM مع اشتقاق PBKDF2 (600,000 تكرار).' })));
      box.appendChild(ui.tabs([
        { id: 'text', label: 'نص', render(p) {
          const inp = ui.area({ rows: 5, placeholder: 'النص المراد تشفيره، أو النص المشفّر (Base64) لفكه' }); const { p1, p2 } = passFields(); const out = ui.out(); const res = ui.area({ rows: 5, code: true, readonly: true });
          const e = ui.btn('تشفير', null, { kind: 'primary' }), d = ui.btn('فك التشفير', null);
          p.append(ui.card('', inp, ui.field('', p1), ui.field('', p2, 'التأكيد مطلوب عند التشفير فقط.'), ui.row(e, d)), out, ui.card('النتيجة', res, ui.copyBtn(() => res.value)));
          ui.task(e, out, async t => { res.value = ''; if (!inp.value) throw new Error('أدخل نصاً'); if (!p1.value) throw new Error('أدخل كلمة مرور'); if (p1.value !== p2.value) throw new Error('كلمتا المرور غير متطابقتين'); if (p1.value.length < 8) out.warn('كلمة المرور قصيرة؛ يُنصح بـ 12 حرفاً أو أكثر.'); t.progress(null, 'اشتقاق المفتاح…'); res.value = b64(await encryptBytes(enc.encode(inp.value), '', p1.value)); out.ok('تم التشفير'); });
          ui.task(d, out, async t => { res.value = ''; if (!inp.value.trim()) throw new Error('الصق النص المشفّر'); if (!p1.value) throw new Error('أدخل كلمة المرور'); let raw; try { raw = unb64(inp.value.replace(/\s+/g, '')); } catch (x) { throw new Error('النص المشفّر ليس Base64 صالحاً'); } t.progress(null, 'اشتقاق المفتاح…'); const r = await decryptBytes(raw, p1.value); res.value = dec.decode(r.data); out.ok('تم فك التشفير'); });
        } },
        { id: 'file', label: 'ملف', render(p) {
          const f = ui.files({ label: 'اختر ملفاً', maxMB: 150 }); const { p1, p2 } = passFields(); const out = ui.out(); const e = ui.btn('تشفير الملف', null, { kind: 'primary' }), d = ui.btn('فك تشفير ملف .omnienc', null);
          p.append(ui.card('', f, ui.field('', p1), ui.field('', p2, 'التأكيد مطلوب عند التشفير فقط.'), ui.row(e, d)), out);
          ui.task(e, out, async t => { const file = f.first(); if (!file) throw new Error('اختر ملفاً'); if (!p1.value) throw new Error('أدخل كلمة مرور'); if (p1.value !== p2.value) throw new Error('كلمتا المرور غير متطابقتين'); t.progress(null, 'قراءة وتشفير…'); const b = await encryptBytes(new Uint8Array(await OF.readBuf(file)), file.name, p1.value); out.ok('تم التشفير'); out.add(ui.saveRow(file.name + '.omnienc', new Blob([b], { type: 'application/octet-stream' }))); });
          ui.task(d, out, async t => { const file = f.first(); if (!file) throw new Error('اختر ملف .omnienc'); if (!p1.value) throw new Error('أدخل كلمة المرور'); t.progress(null, 'فك التشفير…'); const r = await decryptBytes(new Uint8Array(await OF.readBuf(file)), p1.value); out.ok('تم فك التشفير'); out.add(ui.saveRow(r.name || file.name.replace(/\.omnienc$/, '') || 'decrypted', new Blob([r.data]))); });
        } },
      ]));
    },
  };
  T['encryptor'].api = { encryptBytes, decryptBytes };
})();
