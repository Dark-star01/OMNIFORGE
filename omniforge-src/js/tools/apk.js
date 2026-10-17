/* ورشة APK — محلية بالكامل.
 * ما ينفّذه فعلاً: قراءة ZIP/APK، فك AndroidManifest الثنائي (AXML) إلى نص، استخراج معلومات الحزمة والأذونات،
 * كشف أنظمة التوقيع، استبدال/إضافة/حذف ملفات (أيقونات، صور، assets) وإعادة التجميع مع محاذاة zipalign.
 * ما لا ينفّذه: فك resources.arsc، تعديل المانيفست الثنائي، Smali، والتوقيع (يحتاجان محركاً أصلياً — انظر README). */
(function () {
  'use strict';
  const { h, ui } = OF;
  const T = OF.tools;
  const dec = new TextDecoder('utf-8');

  /* ───────────── ZIP: قراءة وكتابة خام (بدون إعادة ضغط للمدخلات غير المعدّلة) ───────────── */
  const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u8 => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function readZip(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054B50) { eocd = i; break; }
    if (eocd < 0) throw new Error('الملف ليس ZIP/APK صالحاً (لم يُعثر على نهاية الأرشيف)');
    const total = dv.getUint16(eocd + 10, true), cdOff = dv.getUint32(eocd + 16, true); if (cdOff === 0xFFFFFFFF || total === 0xFFFF) throw new Error('ZIP64 غير مدعوم');
    const entries = []; let p = cdOff;
    for (let k = 0; k < total; k++) {
      if (dv.getUint32(p, true) !== 0x02014B50) throw new Error('الدليل المركزي تالف'); const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true), time = dv.getUint16(p + 12, true), date = dv.getUint16(p + 14, true), crc = dv.getUint32(p + 16, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nl)); if (flags & 1) throw new Error('الحزمة تحتوي ملفات مشفرة (غير مدعوم)');
      const lnl = dv.getUint16(lho + 26, true), lel = dv.getUint16(lho + 28, true); entries.push({ name, method, flags, time, date, crc, csize, usize, dataOff: lho + 30 + lnl + lel, dir: name.endsWith('/') }); p += 46 + nl + el + cl;
    }
    // كتلة التوقيع (APK Signing Block)
    const sig = { v1: false, v2: false, v3: false, v31: false, blockSize: 0 }; const magic = 'APK Sig Block 42';
    if (cdOff >= 24 && dec.decode(u8.subarray(cdOff - 16, cdOff)) === magic) { const size = Number(dv.getBigUint64(cdOff - 24, true)); sig.blockSize = size + 8; const start = cdOff - size - 8; let q = start + 8; const end = cdOff - 24; while (q + 12 <= end) { const len = Number(dv.getBigUint64(q, true)); const id = dv.getUint32(q + 8, true); if (id === 0x7109871A) sig.v2 = true; else if (id === 0xF05368C0) sig.v3 = true; else if (id === 0x1B93AD61) sig.v31 = true; if (len < 4) break; q += 8 + len; } }
    entries.forEach(e => { if (/^META-INF\/[^/]+\.(RSA|DSA|EC|SF)$/i.test(e.name) || e.name === 'META-INF/MANIFEST.MF') sig.v1 = sig.v1 || /\.(RSA|DSA|EC)$/i.test(e.name); });
    return { entries, sig };
  }
  async function inflateRaw(u8) { if (typeof DecompressionStream === 'undefined') throw new Error('النظام لا يدعم DecompressionStream لفك الضغط'); return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()); }
  async function deflateRaw(u8) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()); }
  async function entryData(u8, e) { const raw = u8.subarray(e.dataOff, e.dataOff + e.csize); if (e.method === 0) return raw; if (e.method === 8) return inflateRaw(raw); throw new Error('طريقة ضغط غير مدعومة (' + e.method + ') في ' + e.name); }
  const NO_COMPRESS = /\.(png|jpe?g|gif|webp|ogg|mp3|mp4|m4a|aac|zip|jar|apk|woff2?|so|arsc|br)$/i;
  /* items: [{name, raw?:Uint8Array(معاملة خام) ومعها method/crc/usize/csize/time/date} أو {name, data:Uint8Array جديدة}] */
  async function writeZip(items, onProgress) {
    const parts = []; let off = 0; const cd = [];
    const pushBytes = b => { parts.push(b); off += b.length; };
    for (let i = 0; i < items.length; i++) {
      const it = items[i]; let method, crc, csize, usize, body, time = it.time || 0, date = it.date || 0x21; const nameB = new TextEncoder().encode(it.name);
      if (it.raw) { method = it.method; crc = it.crc; csize = it.csize; usize = it.usize; body = it.raw; }
      else { usize = it.data.length; crc = crc32(it.data); const keep = it.data.length < 64 || NO_COMPRESS.test(it.name) || it.name === 'resources.arsc'; if (keep || typeof CompressionStream === 'undefined') { method = 0; body = it.data; } else { const z = await deflateRaw(it.data); if (z.length < it.data.length) { method = 8; body = z; } else { method = 0; body = it.data; } } csize = body.length; }
      let pad = 0; if (method === 0 && !it.dir) { const al = /\.so$/i.test(it.name) ? 4096 : 4; pad = (al - ((off + 30 + nameB.length) % al)) % al; if (pad > 0 && pad < 4) pad += al === 4 ? 4 : 4; if (pad && (off + 30 + nameB.length + pad) % al) { pad = ((al - ((off + 30 + nameB.length + 4) % al)) % al) + 4; } }
      const lh = new Uint8Array(30 + nameB.length + pad); const dv = new DataView(lh.buffer); dv.setUint32(0, 0x04034B50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0x0800, true); dv.setUint16(8, method, true); dv.setUint16(10, time, true); dv.setUint16(12, date, true); dv.setUint32(14, crc, true); dv.setUint32(18, csize, true); dv.setUint32(22, usize, true); dv.setUint16(26, nameB.length, true); dv.setUint16(28, pad, true); lh.set(nameB, 30); if (pad) { dv.setUint16(30 + nameB.length, 0xD935, true); dv.setUint16(32 + nameB.length, pad - 4, true); }
      cd.push({ nameB, method, crc, csize, usize, time, date, off }); pushBytes(lh); pushBytes(body); if (onProgress && i % 20 === 0) onProgress(i / items.length * 100);
    }
    const cdStart = off; cd.forEach(c => { const b = new Uint8Array(46 + c.nameB.length); const dv = new DataView(b.buffer); dv.setUint32(0, 0x02014B50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 20, true); dv.setUint16(8, 0x0800, true); dv.setUint16(10, c.method, true); dv.setUint16(12, c.time, true); dv.setUint16(14, c.date, true); dv.setUint32(16, c.crc, true); dv.setUint32(20, c.csize, true); dv.setUint32(24, c.usize, true); dv.setUint16(28, c.nameB.length, true); dv.setUint32(42, c.off, true); b.set(c.nameB, 46); pushBytes(b); });
    const eo = new Uint8Array(22); const dv = new DataView(eo.buffer); dv.setUint32(0, 0x06054B50, true); dv.setUint16(8, cd.length, true); dv.setUint16(10, cd.length, true); dv.setUint32(12, off - cdStart, true); dv.setUint32(16, cdStart, true); pushBytes(eo);
    return new Blob(parts, { type: 'application/vnd.android.package-archive' });
  }

  /* ───────────── AXML → نص ───────────── */
  const ATTR_BY_ID = { 0x01010003: 'name', 0x0101021B: 'versionCode', 0x0101021C: 'versionName', 0x0101020C: 'minSdkVersion', 0x01010270: 'targetSdkVersion', 0x01010001: 'label', 0x01010002: 'icon', 0x0101000F: 'debuggable', 0x010102B7: 'maxSdkVersion', 0x01010280: 'allowBackup', 0x010103F2: 'usesCleartextTraffic', 0x0101001B: 'exported', 0x01010010: 'exported', 0x0101000E: 'enabled' };
  function decodeAxml(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); if (dv.getUint16(0, true) !== 0x0003) throw new Error('ليس XML ثنائياً (AXML)'); const total = Math.min(dv.getUint32(4, true), u8.length);
    let strings = [], resMap = [], p = dv.getUint16(2, true);
    const readStr = (base, i, utf8) => { let o = base + dv.getUint32(base - 0, true) * 0; return o; };
    const nsMap = {}; const lines = []; let depth = 0; const info = { elements: [] }; const stack = [];
    const S = i => (i === 0xFFFFFFFF || i == null ? '' : (strings[i] != null ? strings[i] : '#' + i));
    while (p + 8 <= total) {
      const type = dv.getUint16(p, true), hs = dv.getUint16(p + 2, true), size = dv.getUint32(p + 4, true); if (size < 8) break;
      if (type === 0x0001) { // StringPool
        const cnt = dv.getUint32(p + 8, true), flags = dv.getUint32(p + 16, true), sStart = dv.getUint32(p + 20, true), utf8 = !!(flags & 0x100); const offs = p + hs;
        for (let i = 0; i < cnt; i++) { let o = p + sStart + dv.getUint32(offs + i * 4, true); if (utf8) { let l = u8[o++]; if (l & 0x80) o++; let bl = u8[o++]; if (bl & 0x80) { bl = ((bl & 0x7F) << 8) | u8[o++]; } strings.push(dec.decode(u8.subarray(o, o + bl))); } else { let l = dv.getUint16(o, true); o += 2; if (l & 0x8000) { l = ((l & 0x7FFF) << 16) | dv.getUint16(o, true); o += 2; } let s = ''; for (let k = 0; k < l; k++) s += String.fromCharCode(dv.getUint16(o + k * 2, true)); strings.push(s); } }
      } else if (type === 0x0180) { for (let i = 0; i < (size - hs) / 4; i++) resMap.push(dv.getUint32(p + hs + i * 4, true)); }
      else if (type === 0x0100) { const pre = dv.getUint32(p + 16, true), uri = dv.getUint32(p + 20, true); nsMap[S(uri)] = S(pre); }
      else if (type === 0x0102) {
        const ns = dv.getUint32(p + 16, true), nm = dv.getUint32(p + 20, true), as = dv.getUint16(p + 24, true), ac = dv.getUint16(p + 28, true); const tag = S(nm); const attrs = [];
        for (let i = 0; i < ac; i++) { const a = p + 16 + as + i * 20; const ans = dv.getUint32(a, true), an = dv.getUint32(a + 4, true), raw = dv.getUint32(a + 8, true), dt = dv.getUint8(a + 15), data = dv.getUint32(a + 16, true); let name = S(an); if (!name || /^#/.test(name)) name = ATTR_BY_ID[resMap[an]] || ('attr_0x' + (resMap[an] || 0).toString(16)); else if (resMap[an] && ATTR_BY_ID[resMap[an]] && !name) name = ATTR_BY_ID[resMap[an]];
          let val; if (raw !== 0xFFFFFFFF && dt === 3) val = S(raw); else if (dt === 3) val = S(data); else if (dt === 0x12) val = data ? 'true' : 'false'; else if (dt === 0x10) val = String(data | 0); else if (dt === 0x11) val = '0x' + data.toString(16); else if (dt === 0x01) val = data ? '@0x' + data.toString(16).padStart(8, '0') : '@null'; else if (dt === 0x02) val = '?0x' + data.toString(16); else if (dt === 0x04) val = String(new Float32Array(new Uint32Array([data]).buffer)[0]); else if (dt >= 0x1C && dt <= 0x1F) val = '#' + data.toString(16).padStart(8, '0'); else if (dt === 0x05) { const mult = [0.00390625, 3.051758e-5, 1.192093e-7, 4.656613e-10][(data >> 4) & 3]; val = ((data & 0xFFFFFF00) >> 0) * mult + ['px', 'dip', 'sp', 'pt', 'in', 'mm'][data & 15]; } else val = raw !== 0xFFFFFFFF ? S(raw) : '0x' + data.toString(16);
          attrs.push({ ns: S(ans), name, val, dt, data }); }
        const rec = { tag, attrs, depth }; info.elements.push(rec); stack.push(rec);
        const pad = '  '.repeat(depth); const nsAttrs = Object.keys(nsMap).length && depth === 0 ? Object.entries(nsMap).map(([u, pr]) => ' xmlns:' + pr + '="' + u + '"').join('') : '';
        lines.push(pad + '<' + tag + nsAttrs + attrs.map(a => ' ' + (a.ns && nsMap[a.ns] ? nsMap[a.ns] + ':' : '') + a.name + '="' + a.val.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;') + '"').join('') + '>'); depth++;
      } else if (type === 0x0103) { depth--; stack.pop(); const tag = S(dv.getUint32(p + 20, true)); const last = lines.length - 1; lines.push('  '.repeat(depth) + '</' + tag + '>'); }
      else if (type === 0x0104) { lines.push('  '.repeat(depth) + S(dv.getUint32(p + 16, true))); }
      p += size;
    }
    return { xml: '<?xml version="1.0" encoding="utf-8"?>\n' + lines.join('\n'), info };
  }
  function manifestSummary(info) {
    const els = info.elements; const attr = (e, n) => { const a = e.attrs.find(x => x.name === n); return a ? a.val : ''; }; const root = els.find(e => e.tag === 'manifest'); if (!root) throw new Error('لا يوجد عنصر manifest');
    const sdk = els.find(e => e.tag === 'uses-sdk'), app = els.find(e => e.tag === 'application'); const names = tag => els.filter(e => e.tag === tag).map(e => attr(e, 'name')).filter(Boolean);
    // النشاط الرئيسي: activity فيه intent-filter فيه MAIN و LAUNCHER
    let launcher = ''; for (let i = 0; i < els.length; i++) { if (els[i].tag !== 'activity' && els[i].tag !== 'activity-alias') continue; for (let j = i + 1; j < els.length && els[j].depth > els[i].depth; j++) { if (els[j].tag === 'category' && /LAUNCHER/.test(attr(els[j], 'name'))) { launcher = attr(els[i], 'name'); break; } } if (launcher) break; }
    return { package: attr(root, 'package'), versionName: attr(root, 'versionName'), versionCode: attr(root, 'versionCode'), minSdk: sdk && attr(sdk, 'minSdkVersion'), targetSdk: sdk && attr(sdk, 'targetSdkVersion'), compileSdk: attr(root, 'compileSdkVersion'), permissions: names('uses-permission').concat(names('uses-permission-sdk-23')), activities: names('activity'), services: names('service'), receivers: names('receiver'), providers: names('provider'), features: names('uses-feature'), launcher, label: app && attr(app, 'label'), icon: app && attr(app, 'icon'), debuggable: app && attr(app, 'debuggable') === 'true', allowBackup: app && attr(app, 'allowBackup'), cleartext: app && attr(app, 'usesCleartextTraffic') };
  }
  const DANGEROUS = /(CAMERA|RECORD_AUDIO|READ_CONTACTS|WRITE_CONTACTS|ACCESS_FINE_LOCATION|ACCESS_COARSE_LOCATION|ACCESS_BACKGROUND_LOCATION|READ_SMS|SEND_SMS|RECEIVE_SMS|READ_PHONE_STATE|CALL_PHONE|READ_CALL_LOG|READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|MANAGE_EXTERNAL_STORAGE|SYSTEM_ALERT_WINDOW|REQUEST_INSTALL_PACKAGES|BIND_ACCESSIBILITY_SERVICE|READ_CALENDAR|BODY_SENSORS)/;

  /* ───────────── الأداة ───────────── */
  T['apk-workshop'] = {
    api: { readZip, writeZip, entryData, decodeAxml, manifestSummary, crc32 },
    render(box) {
      let apk = null; // {name, u8, entries, sig, mods: Map}
      const logLines = []; const logEl = h('pre', { class: 'res', style: { minHeight: '80px' } }, 'السجل فارغ.');
      const log = (m) => { logLines.push(new Date().toLocaleTimeString('ar-u-nu-latn') + '  ' + m); logEl.textContent = logLines.join('\n'); };
      const status = ui.out(); const loader = ui.files({ accept: '.apk,.zip,.jar,application/vnd.android.package-archive', label: 'اختر ملف APK', hint: 'يُعالَج محلياً على جهازك ولا يُرفع لأي خادم', maxMB: 400 }); const loadBtn = ui.btn('افتح وافحص', null, { kind: 'primary', icon: 'apk' });
      const needApk = pane => { OF.clear(pane); pane.appendChild(h('div', { class: 'empty', text: 'افتح ملف APK أولاً من الأعلى.' })); };
      const curEntry = name => apk.entries.find(e => e.name === name); const modded = () => apk.mods.size;
      const getData = async name => { if (apk.mods.has(name)) { const m = apk.mods.get(name); if (m === null) throw new Error('الملف محذوف في النسخة المعدّلة'); return m; } return entryData(apk.u8, curEntry(name)); };
      const rerender = []; // دوال تحديث الألسنة المفتوحة
      const refresh = () => rerender.forEach(f => f());
      const isBinXml = u8 => u8.length > 8 && u8[0] === 0x03 && u8[1] === 0x00 && u8[2] === 0x08 && u8[3] === 0x00;
      const looksText = u8 => { const n = Math.min(u8.length, 4096); for (let i = 0; i < n; i++) if (u8[i] === 0) return false; return true; };

      box.append(ui.card('', loader, loadBtn), status);
      ui.task(loadBtn, status, async t => {
        const f = loader.first(); if (!f) throw new Error('اختر ملف APK'); t.progress(null, 'قراءة الملف…'); const u8 = new Uint8Array(await OF.readBuf(f)); const { entries, sig } = readZip(u8);
        apk = { name: f.name, size: f.size, u8, entries, sig, mods: new Map(), summary: null, manifestXml: null }; logLines.length = 0; log('فُتح: ' + f.name + ' (' + OF.fmt.bytes(f.size) + ') — ' + entries.length + ' مدخلاً');
        const hasManifest = entries.some(e => e.name === 'AndroidManifest.xml'); if (!hasManifest) status.warn('لا يوجد AndroidManifest.xml: قد لا يكون هذا APK (يعمل الباقي كأرشيف ZIP).'); else { try { const d = decodeAxml(await entryData(u8, curEntry('AndroidManifest.xml'))); apk.manifestXml = d.xml; apk.summary = manifestSummary(d.info); log('تم فك AndroidManifest: ' + apk.summary.package); } catch (e) { log('تعذّر فك المانيفست: ' + e.message); status.warn('تعذّر فك المانيفست: ' + e.message); } }
        status.ok('تم فتح الحزمة.'); refresh();
      });

      const tabs = ui.tabs([
        { id: 'info', label: 'معلومات APK', render(pane) {
          const draw = async () => { if (!apk) return needApk(pane); OF.clear(pane); const s = apk.summary; const E = apk.entries; const dex = E.filter(e => /^classes\d*\.dex$/.test(e.name)); const abis = [...new Set(E.filter(e => /^lib\/[^/]+\//.test(e.name)).map(e => e.name.split('/')[1]))]; const sha = OF.fmt.hex(new Uint8Array(await crypto.subtle.digest('SHA-256', apk.u8)));
            pane.appendChild(ui.card('الحزمة', ui.kv([['الاسم', apk.name], ['الحجم', OF.fmt.bytes(apk.size)], ['SHA-256', h('span', { class: 'mono', text: sha })], ['اسم الحزمة', s && s.package], ['الإصدار', s && (s.versionName + (s.versionCode ? ' (' + s.versionCode + ')' : ''))], ['minSdk / targetSdk / compileSdk', s && [s.minSdk, s.targetSdk, s.compileSdk].map(x => x || '—').join(' / ')], ['النشاط الرئيسي', s && s.launcher], ['اسم التطبيق', s && s.label && (s.label.startsWith('@') ? s.label + ' (مرجع مورد — يتطلب فك resources.arsc)' : s.label)], ['قابل للتنقيح (debuggable)', s && (s.debuggable ? 'نعم ⚠' : 'لا')], ['allowBackup', s && s.allowBackup], ['cleartext HTTP', s && s.cleartext], ['ملفات dex', dex.length + (dex.length ? ' (' + OF.fmt.bytes(dex.reduce((a, e) => a + e.usize, 0)) + ')' : '')], ['مكتبات native (ABI)', abis.join('، ')], ['resources.arsc', (() => { const r = curEntry('resources.arsc'); return r ? OF.fmt.bytes(r.usize) + (r.method === 0 ? ' — غير مضغوط ✔' : ' — مضغوط ⚠ (Android 11+ يتطلب عدم الضغط)') : '—'; })()]])));
            const sg = apk.sig; pane.appendChild(ui.card('التوقيع', ui.kv([['JAR (v1)', sg.v1 ? 'موجود' : 'غير موجود'], ['APK Signature v2', sg.v2 ? 'موجود' : 'غير موجود'], ['APK Signature v3', sg.v3 || sg.v31 ? 'موجود' : 'غير موجود']]), h('p', { class: 'hint', text: 'هذا كشف لوجود التوقيعات فقط؛ لا يتحقق التطبيق من صحتها التشفيرية.' })));
            if (s) { const perms = s.permissions; pane.appendChild(ui.card('الأذونات (' + perms.length + ')', perms.length ? h('div', null, perms.map(x => h('div', { class: 'saverow' }, h('span', { class: 'nm mono', text: x }), DANGEROUS.test(x) ? ui.badge('partial', 'حساس') : null))) : h('p', { class: 'muted', text: 'لا أذونات.' })));
              [['الأنشطة', s.activities], ['الخدمات', s.services], ['المستقبلات', s.receivers], ['الموفّرات', s.providers]].forEach(([t, a]) => { if (a.length) pane.appendChild(h('details', { class: 'limits' }, h('summary', { text: t + ' (' + a.length + ')' }), h('ul', null, a.slice(0, 200).map(x => h('li', { class: 'mono', text: x }))))); }); }
            if (apk.manifestXml) pane.appendChild(ui.card('AndroidManifest.xml (مفكوك — للقراءة فقط)', h('pre', { class: 'res', style: { maxHeight: '360px' } }, apk.manifestXml), ui.row(ui.copyBtn(() => apk.manifestXml), ui.btn('حفظ كنص', () => OF.save(new Blob([apk.manifestXml], { type: 'text/xml' }), 'AndroidManifest.decoded.xml', 'text/xml'), { small: true, icon: 'save' })), h('p', { class: 'hint', text: 'تعديل المانيفست غير مدعوم حالياً: إعادة ترميزه الثنائي تحتاج محركاً أصلياً (apktool/aapt2).' }))); };
          rerender.push(draw); draw();
        } },
        { id: 'files', label: 'الملفات والموارد', render(pane) {
          const q = ui.input({ placeholder: 'تصفية بالمسار…' }); const list = h('div'); const viewer = h('div'); const addIn = ui.files({ label: 'إضافة/استبدال بملف' , maxMB: 100 });
          const draw = () => { OF.clear(list); if (!apk) { list.appendChild(h('div', { class: 'empty', text: 'افتح ملف APK أولاً من الأعلى.' })); return; } const w = q.value.toLowerCase(); const E = apk.entries.filter(e => !e.dir && (!w || e.name.toLowerCase().includes(w)));
            const rows = E.slice(0, 300).map(e => { const m = apk.mods.get(e.name); return h('tr', null, h('td', { class: 'mono', style: { whiteSpace: 'normal', wordBreak: 'break-all' }, text: e.name + (m === null ? '  [محذوف]' : m ? '  [معدّل]' : '') }), h('td', { text: OF.fmt.bytes(m ? m.length : e.usize) }), h('td', null, h('div', { class: 'row' }, ui.btn('عرض', () => view(e.name), { small: true }), ui.btn('حفظ', async () => { try { await OF.save(new Blob([await getData(e.name)]), e.name.split('/').pop(), ''); } catch (er) { ui.toast(er.message, 'error'); } }, { small: true }), ui.btn('استبدال', () => replace(e.name), { small: true }), ui.btn('حذف', () => { apk.mods.set(e.name, null); log('حُذف: ' + e.name); draw(); }, { small: true, kind: 'danger' }), m !== undefined ? ui.btn('تراجع', () => { apk.mods.delete(e.name); log('تراجع عن تعديل: ' + e.name); draw(); }, { small: true }) : null))); });
            list.appendChild(h('div', { class: 'tbl-wrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, ['المسار', 'الحجم', ''].map(x => h('th', { text: x })))), h('tbody', null, rows)))); if (E.length > 300) list.appendChild(h('p', { class: 'muted small', text: 'يعرض 300 من ' + E.length + ' — استخدم التصفية.' })); };
          const replace = name => { const inp = h('input', { type: 'file', style: { display: 'none' } }); document.body.appendChild(inp); inp.addEventListener('change', async () => { const f = inp.files[0]; inp.remove(); if (!f) return; apk.mods.set(name, new Uint8Array(await OF.readBuf(f))); log('استُبدل: ' + name + ' ← ' + f.name + ' (' + OF.fmt.bytes(f.size) + ')'); draw(); }); inp.click(); };
          const view = async name => { OF.clear(viewer); try { const d = await getData(name); const card = ui.card(name); const ext = OF.extOf(name);
            if (isBinXml(d)) { const x = decodeAxml(d).xml; card.appendChild(h('pre', { class: 'res' }, x.slice(0, 200000))); card.appendChild(h('p', { class: 'hint', text: 'XML ثنائي مُفكوك للعرض فقط. المراجع @0x… تشير لموارد resources.arsc.' })); }
            else if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) { const url = URL.createObjectURL(new Blob([d], { type: 'image/' + (ext === 'jpg' ? 'jpeg' : ext) })); card.appendChild(h('img', { class: 'imgprev', src: url })); }
            else if (d.length < 400000 && looksText(d)) card.appendChild(h('pre', { class: 'res' }, dec.decode(d))); else card.appendChild(h('pre', { class: 'res' }, Array.from({ length: Math.ceil(Math.min(512, d.length) / 16) }, (_, r) => { const row = d.subarray(r * 16, r * 16 + 16); return r.toString(16).padStart(4, '0') + '  ' + Array.from(row, b => b.toString(16).padStart(2, '0')).join(' '); }).join('\n')));
            viewer.appendChild(card); viewer.scrollIntoView(); } catch (e) { viewer.appendChild(h('div', { class: 'msg error' }, OF.icon('x'), h('span', { text: e.message }))); } };
          const outAdd = ui.out(); const pathIn = ui.input({ placeholder: 'المسار داخل الحزمة مثل assets/data.json', dir: 'ltr', code: true });
          pane.append(ui.card('', q, list), viewer, ui.card('إضافة ملف جديد', ui.field('المسار', pathIn), addIn, ui.btn('أضف إلى الحزمة', async () => { outAdd.clear(); if (!apk) return outAdd.warn('افتح APK أولاً'); const f = addIn.first(); const p = pathIn.value.trim().replace(/^\/+/, ''); if (!f || !p) return outAdd.warn('حدّد الملف والمسار'); if (/(^|\/)\.\.(\/|$)/.test(p)) return outAdd.error('مسار غير مسموح'); if (/^META-INF\//i.test(p)) return outAdd.error('مجلد META-INF مخصص للتواقيع'); apk.mods.set(p, new Uint8Array(await OF.readBuf(f))); if (!curEntry(p)) apk.entries.push({ name: p, usize: f.size, csize: f.size, method: 0, added: true, dir: false }); log('أُضيف: ' + p); outAdd.ok('أُضيف ' + p); addIn.clear(); draw(); }), outAdd));
          rerender.push(draw); draw(); q.addEventListener('input', draw);
        } },
        { id: 'icons', label: 'تعديل الأيقونات', render(pane) {
          const draw = () => { OF.clear(pane); if (!apk) return needApk(pane);
            const icons = apk.entries.filter(e => /^res\/(mipmap|drawable)[^/]*\/(ic_launcher|ic_launcher_round|icon|app_icon)[^/]*\.(png|webp|jpe?g)$/i.test(e.name) || /^res\/[^/]*\/(ic_launcher|icon)[^/]*\.(png|webp)$/i.test(e.name));
            if (!icons.length) { pane.appendChild(ui.card('الأيقونات', h('p', { class: 'muted', text: 'لم يُعثر على أيقونات PNG/WEBP بأسماء معتادة (قد تكون الأيقونة XML تكيّفية أو أسماء الموارد مبهمة). استبدل ملفاً محدداً من لسان «الملفات والموارد».' }))); return; }
            const f = ui.files({ accept: 'image/*', exts: ['png', 'jpg', 'jpeg', 'webp'], mimes: ['image/'], label: 'اختر صورة الأيقونة الجديدة (يُفضّل مربعة 512×512)', maxMB: 10 }); const out = ui.out(); const grid = h('div', { class: 'grid' });
            icons.forEach(async e => { try { const d = await getData(e.name); const ext = OF.extOf(e.name); const img = await OF.loadImage(new Blob([d], { type: 'image/' + (ext === 'jpg' ? 'jpeg' : ext) })); grid.appendChild(h('div', { class: 'tcard' }, h('img', { src: img.src, style: { width: '48px', height: '48px', objectFit: 'contain' } }), h('div', null, h('div', { class: 'mono small', text: e.name }), h('div', { class: 'muted small', text: img.naturalWidth + '×' + img.naturalHeight + (apk.mods.get(e.name) ? ' — معدّلة' : '') })))); } catch (er) { grid.appendChild(h('div', { class: 'tcard' }, h('div', { class: 'mono small', text: e.name + ' — تعذّر القراءة' }))); } });
            const btn = ui.btn('استبدل كل الأيقونات بالصورة الجديدة', null, { kind: 'primary' }); const prev = h('div');
            f.querySelector('input').addEventListener('change', async () => { setTimeout(async () => { OF.clear(prev); const x = f.first(); if (!x) return; const im = await OF.loadImage(x); prev.appendChild(h('div', { class: 'row' }, [96, 48, 36].map(s => h('img', { src: im.src, style: { width: s + 'px', height: s + 'px', objectFit: 'contain', border: '1px solid var(--line)', borderRadius: '8px' } })))); prev.appendChild(h('p', { class: 'hint', text: 'معاينة قبل الاعتماد — ستُعدّل حجم الصورة لكل أيقونة وتُحفظ بنفس صيغتها الأصلية.' })); }, 80); });
            pane.append(ui.card('الأيقونات الموجودة (' + icons.length + ')', grid, h('p', { class: 'hint', text: 'الأيقونات التكيّفية (XML) غير مشمولة. يتغير الأثر عند التثبيت بعد التوقيع.' })), ui.card('أيقونة جديدة', f, prev, btn), out);
            ui.task(btn, out, async t => { const x = f.first(); if (!x) throw new Error('اختر صورة'); const im = await OF.loadImage(x); let n = 0; for (const e of icons) { const d = await getData(e.name); const ext = OF.extOf(e.name); const old = await OF.loadImage(new Blob([d], { type: 'image/' + (ext === 'jpg' ? 'jpeg' : ext) })); const c = document.createElement('canvas'); c.width = old.naturalWidth; c.height = old.naturalHeight; const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; if (ext !== 'png' && ext !== 'webp') { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); } const s = Math.min(c.width / im.naturalWidth, c.height / im.naturalHeight); g.drawImage(im, (c.width - im.naturalWidth * s) / 2, (c.height - im.naturalHeight * s) / 2, im.naturalWidth * s, im.naturalHeight * s); const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'; const b = await OF.canvasBlob(c, mime, 0.95); if (b.type !== mime) throw new Error('النظام لا يرمّز ' + mime + ' (' + e.name + ')'); apk.mods.set(e.name, new Uint8Array(await b.arrayBuffer())); log('أيقونة: ' + e.name + ' ← ' + c.width + '×' + c.height); n++; } out.ok('تم تجهيز ' + n + ' أيقونة. انتقل إلى «إعادة البناء».'); draw(); });
          };
          rerender.push(draw); draw();
        } },
        { id: 'text', label: 'تعديل النصوص', render(pane) {
          const draw = () => { OF.clear(pane); if (!apk) return needApk(pane); const q = ui.input({ placeholder: 'ابحث عن ملف نصي (assets/…، res/raw/…)', dir: 'ltr' }); const sel = ui.select([]); const ta = ui.area({ rows: 12, code: true }); const out = ui.out(); let cur = null;
            const cands = () => apk.entries.filter(e => !e.dir && /\.(json|txt|html?|js|css|xml|properties|csv|md|ini|yaml|yml|svg)$/i.test(e.name) && !/^(AndroidManifest\.xml|resources\.arsc)$/.test(e.name) && e.usize < 400000 && (!q.value || e.name.toLowerCase().includes(q.value.toLowerCase())));
            const fill = () => { OF.clear(sel); cands().slice(0, 300).forEach(e => sel.appendChild(h('option', { value: e.name, text: e.name }))); };
            const load = async () => { out.clear(); cur = sel.value; if (!cur) { ta.value = ''; return; } try { const d = await getData(cur); if (isBinXml(d)) { ta.value = ''; return out.warn('هذا XML ثنائي مُترجَم (aapt). تعديله غير مدعوم هنا لأن إعادة ترميزه تحتاج محركاً أصلياً.'); } if (!looksText(d)) { ta.value = ''; return out.warn('ملف ثنائي'); } ta.value = dec.decode(d); } catch (e) { out.error(e.message); } };
            q.addEventListener('input', () => { fill(); load(); }); sel.addEventListener('change', load); fill(); load();
            pane.append(ui.card('', h('div', { class: 'msg info' }, OF.icon('info'), h('span', { text: 'يعدّل الملفات النصية العادية داخل APK (assets وres/raw وغيرها). ملفات XML الثنائية المترجمة (layout/values/manifest) غير قابلة للتعديل هنا.' })), ui.field('بحث', q), ui.field('الملف', sel), ta, ui.btn('اعتمد التعديل', () => { out.clear(); if (!cur) return out.warn('اختر ملفاً'); apk.mods.set(cur, new TextEncoder().encode(ta.value)); log('نص معدّل: ' + cur); out.ok('اعتُمد. انتقل إلى «إعادة البناء».'); }, { kind: 'primary' })), out); };
          rerender.push(draw); draw();
        } },
        { id: 'build', label: 'إعادة البناء والتوقيع', render(pane) {
          const draw = () => { OF.clear(pane); if (!apk) return needApk(pane); const out = ui.out(); const btn = ui.btn('أعد بناء APK', null, { kind: 'primary', icon: 'apk' });
            const dropSig = ui.check('إزالة التوقيع القديم (META-INF) — مطلوب لأن التعديل يبطله', true); dropSig.input.disabled = true;
            pane.append(ui.card('التعديلات المعلّقة (' + modded() + ')', modded() ? h('ul', null, [...apk.mods].slice(0, 50).map(([k, v]) => h('li', { class: 'mono', text: (v === null ? 'حذف: ' : 'تعديل: ') + k }))) : h('p', { class: 'muted', text: 'لا تعديلات. يمكنك إعادة البناء للاختبار فقط.' }), dropSig, btn),
              h('div', { class: 'msg warn' }, OF.icon('info'), h('span', { text: 'الناتج غير موقّع، وبالتالي لن يثبّته أندرويد قبل توقيعه بمفتاحك (apksigner أو أداة توقيع على الجهاز). التوقيع داخل OMNIFORGE غير متاح حالياً — يتطلب بلاجن Native (apksig) لم يُضمَّن.' })), out);
            ui.task(btn, out, async t => {
              const items = []; const names = new Set(); for (const e of apk.entries) { if (e.dir && !apk.mods.has(e.name)) { items.push({ name: e.name, dir: true, raw: new Uint8Array(0), method: 0, crc: 0, csize: 0, usize: 0, time: e.time, date: e.date }); names.add(e.name); continue; } if (/^META-INF\/([^/]+\.(SF|RSA|DSA|EC)|MANIFEST\.MF)$/i.test(e.name)) continue; if (apk.mods.get(e.name) === null) continue; names.add(e.name);
                if (apk.mods.has(e.name)) items.push({ name: e.name, data: apk.mods.get(e.name), time: e.time, date: e.date }); else items.push({ name: e.name, raw: apk.u8.subarray(e.dataOff, e.dataOff + e.csize), method: e.method, crc: e.crc, csize: e.csize, usize: e.usize, time: e.time, date: e.date }); }
              for (const [k, v] of apk.mods) if (v && !names.has(k)) items.push({ name: k, data: v });
              // resources.arsc أولاً بعد المانيفست غير مطلوب؛ نحافظ على الترتيب الأصلي
              t.progress(5, 'كتابة الأرشيف…'); const blob = await writeZip(items, p => t.progress(5 + p * 0.9, 'كتابة…')); log('أُعيد البناء: ' + items.length + ' مدخلاً — ' + OF.fmt.bytes(blob.size) + ' — بدون توقيع');
              const chk = readZip(new Uint8Array(await blob.arrayBuffer())); const bad = chk.entries.length !== items.length; if (bad) throw new Error('فشل التحقق الذاتي: عدد المدخلات لا يطابق'); const arsc = chk.entries.find(e => e.name === 'resources.arsc'); if (arsc && arsc.method !== 0) out.warn('resources.arsc مضغوط في الأصل؛ Android 11+ قد يرفض تثبيته.');
              out.ok('تمت إعادة البناء والتحقق الذاتي من بنية الأرشيف (' + chk.entries.length + ' مدخلاً).'); out.add(ui.saveRow(OF.baseOf(apk.name) + '_modified_unsigned.apk', blob)); });
          }; rerender.push(draw); draw();
        } },
        { id: 'log', label: 'السجل', render(pane) { pane.append(ui.card('سجل الخطوات', logEl, ui.copyBtn(() => logLines.join('\n')))); } },
      ]);
      box.appendChild(tabs);
    },
  };
})();
