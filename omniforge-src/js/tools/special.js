/* أدوات متخصصة: محلل التخزين + فاحص الخطوط */
(function () {
  'use strict';
  const { h, ui } = OF;

  /* ───────── محلل التخزين ───────── */
  const TYPES = [
    ['صور', ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'avif', 'ico']],
    ['فيديو', ['mp4', 'mkv', 'webm', 'avi', 'mov', '3gp', 'm4v', 'flv']],
    ['صوت', ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus', 'amr']],
    ['مستندات', ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'rtf', 'odt', 'csv', 'epub']],
    ['أرشيفات', ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'apk', 'xapk', 'jar']],
    ['شيفرة وبيانات', ['js', 'ts', 'json', 'html', 'css', 'xml', 'py', 'java', 'kt', 'yml', 'yaml', 'sql', 'php', 'c', 'cpp', 'h', 'sh']],
    ['خطوط', ['ttf', 'otf', 'woff', 'woff2']]
  ];
  const extOf = n => { const i = n.lastIndexOf('.'); return i > 0 ? n.slice(i + 1).toLowerCase() : ''; };
  function typeOf(name) {
    const e = extOf(name);
    for (const [t, l] of TYPES) if (l.includes(e)) return t;
    return 'أخرى';
  }
  function analyze(list) {
    const byType = {}, byExt = {}; let total = 0;
    const items = list.map(f => ({ name: f.webkitRelativePath || f.name, size: f.size, type: typeOf(f.name), ext: extOf(f.name) }));
    for (const it of items) {
      total += it.size;
      (byType[it.type] = byType[it.type] || { n: 0, size: 0 }).n++; byType[it.type].size += it.size;
      const k = it.ext || '(بلا امتداد)';
      (byExt[k] = byExt[k] || { n: 0, size: 0 }).n++; byExt[k].size += it.size;
    }
    // ملفات مكررة محتملة: الاسم + الحجم نفسهما (مؤشر فقط، ليس مقارنة محتوى)
    const seen = {}, dups = [];
    for (const it of items) { const k = it.name.split('/').pop() + '|' + it.size; if (seen[k]) { seen[k].push(it); } else seen[k] = [it]; }
    for (const k in seen) if (seen[k].length > 1 && seen[k][0].size > 0) dups.push(seen[k]);
    return { items, total, byType, byExt, dups };
  }

  OF.tools['storage-analyzer'] = {
    analyze,
    render(box) {
      OF.clear(box);
      const out = ui.out();
      const pickFiles = ui.files({ multiple: true, label: 'اختر ملفات', maxMB: 1e6, onChange: run });
      const pickDir = ui.files({ multiple: true, directory: true, label: 'اختر مجلداً', hint: 'يعتمد على دعم النظام لاختيار المجلدات', maxMB: 1e6, onChange: run });
      const est = h('div');
      let all = [];
      function run() {
        all = pickFiles.files().concat(pickDir.files());
        out.clear();
        if (!all.length) return;
        show(analyze(all), '');
      }
      function show(r, note) {
        out.ok('تم تحليل ' + (r.count != null ? r.count : r.items.length) + ' ملف — الإجمالي ' + OF.fmt.bytes(r.total) + (note || ''));
        const types = Object.entries(r.byType).sort((a, b) => b[1].size - a[1].size);
        out.add(ui.card('حسب النوع', ...types.map(([t, v]) => {
          const pct = r.total ? v.size / r.total * 100 : 0;
          const bar = h('div', { class: 'progress' }, h('i', { style: { width: pct.toFixed(1) + '%' } }));
          return h('div', { class: 'field' }, h('div', { class: 'row' }, h('strong', { text: t }), h('span', { class: 'muted small', text: v.n + ' ملف — ' + OF.fmt.bytes(v.size) + ' (' + pct.toFixed(1) + '%)' })), bar);
        })));
        const exts = Object.entries(r.byExt).sort((a, b) => b[1].size - a[1].size).slice(0, 12);
        out.add(ui.card('أكثر الامتدادات حجماً', ui.kv(exts.map(([e, v]) => [e, v.n + ' ملف — ' + OF.fmt.bytes(v.size)]))));
        const big = r.items.slice().sort((a, b) => b.size - a.size).slice(0, 15);
        out.add(ui.card('أكبر الملفات', ui.kv(big.map(it => [it.name, OF.fmt.bytes(it.size)]))));
        if (r.dups && r.dups.length) out.add(ui.card('ملفات يُحتمل تكرارها (الاسم والحجم نفسهما)', h('p', { class: 'muted small', text: 'مؤشر فقط: لم تُقارَن المحتويات.' }), ui.kv(r.dups.slice(0, 15).map(g => [g[0].name.split('/').pop() + ' × ' + g.length, OF.fmt.bytes(g[0].size)]))));
      }
      // نتيجة المسح الأصلي → نفس شكل analyze()
      function fromNative(r) {
        const byType = {}, byExt = {};
        for (const e of r.byExt) { const t = typeOf('x.' + e.ext); (byType[t] = byType[t] || { n: 0, size: 0 }); byType[t].n += e.count; byType[t].size += e.bytes; byExt[e.ext] = { n: e.count, size: e.bytes }; }
        return { items: r.largest.map(b => ({ name: b.path || b.name, size: b.size })), total: r.bytes, byType, byExt, dups: [], count: r.files };
      }
      const nn = OF.nat && OF.nat.available() && OF.nat.plugin().scanFolder ? OF.nat.plugin() : null;
      const natCard = nn ? (() => {
        const b = ui.btn('اختر مجلداً وحلّله (أصلي)', null, { kind: 'primary' }); const nout = ui.out(); const stop = ui.btn('إيقاف', null, { small: true, kind: 'danger' }); let sid = null;
        ui.task(b, nout, async t => {
          let f; try { f = await nn.pickFolder(); } catch (e) { if (OF.nat.isCancel(e)) { const er = new Error('لم يُختر مجلد'); er.name = 'AbortError'; throw er; } throw new Error(OF.nat.errorText(e)); }
          sid = 'scan' + Date.now(); const off = await OF.nat.on('nativeProgress', e => { if (e.phase === 'scan' && e.id === sid) t.progress(null, e.files + ' ملف — ' + OF.fmt.bytes(e.bytes)); });
          t.progress(null, 'مسح «' + (f.name || 'المجلد') + '»…'); let r; try { r = await nn.scanFolder({ uri: f.uri, id: sid }); } catch (e) { if (t.cancelled || OF.nat.isCancel(e)) { const er = new Error('أُوقف المسح'); er.name = 'AbortError'; throw er; } throw new Error(OF.nat.errorText(e)); } finally { off(); }
          out.clear(); show(fromNative(r), ' (في ' + r.dirs + ' مجلد)'); if (r.truncated) out.warn('توقّف المسح عند حد الحجم/الزمن (300 ألف ملف أو 90 ثانية)؛ النتائج جزئية.'); out.info('المسح الأصلي لا يكشف المكررات (الأسماء فقط، بدون مسارات كاملة لكل ملف).');
          nout.ok('اكتمل المسح'); }, { cancelable: true });
        return ui.card('تحليل مجلد (أصلي)', h('p', { class: 'muted small', text: 'يمسح المجلد بالكامل داخل التطبيق دون تحميل الملفات إلى الذاكرة، ويعمل على المجلدات الكبيرة. تقرأ الأسماء والأحجام فقط.' }), b, nout);
      })() : null;
      box.append(
        ui.card('مساحة تخزين التطبيق', est),
        ...(natCard ? [natCard] : []),
        ui.card('اختر ما تريد تحليله', h('p', { class: 'muted small', text: 'يُحلَّل ما تختاره فقط؛ لا يمكن لـ WebView فحص كامل تخزين الهاتف. لا يُرفع شيء ولا تُقرأ محتويات الملفات.' }), pickFiles, pickDir),
        out);
      (async () => {
        try {
          if (nn && nn.storageInfo) { try { const si = await nn.storageInfo(); const rows = []; const v = (n, x) => x && rows.push([n, OF.fmt.bytes(x.free) + ' متاح من ' + OF.fmt.bytes(x.total) + ' (مستخدم ' + OF.fmt.bytes(x.total - x.free) + ')']); v('التخزين الداخلي', si.internal); if (si.shared && (!si.internal || si.shared.total !== si.internal.total)) v('التخزين المشترك', si.shared); if (si.app) rows.push(['ملفات التطبيق', OF.fmt.bytes(si.app.files)], ['ذاكرة التطبيق المؤقتة', OF.fmt.bytes((si.app.cache || 0) + (si.app.externalCache || 0))]); est.appendChild(ui.kv(rows)); return; } catch (e) { /* ننتقل للتقدير */ } }
          if (!navigator.storage || !navigator.storage.estimate) { est.appendChild(h('p', { class: 'muted small', text: 'التقدير غير مدعوم في هذا النظام.' })); return; }
          const e = await navigator.storage.estimate();
          est.appendChild(ui.kv([['المستخدم', OF.fmt.bytes(e.usage || 0)], ['الحصة المتاحة (تقديرية)', OF.fmt.bytes(e.quota || 0)]]));
        } catch (err) { est.appendChild(h('p', { class: 'muted small', text: 'تعذّر التقدير: ' + err.message })); }
      })();
    }
  };

  /* ───────── فاحص الخطوط ───────── */
  const u16 = (d, o) => d.getUint16(o), u32 = (d, o) => d.getUint32(o);
  const tag4 = (d, o) => String.fromCharCode(d.getUint8(o), d.getUint8(o + 1), d.getUint8(o + 2), d.getUint8(o + 3));

  function sfntTables(buf) {
    const d = new DataView(buf);
    if (buf.byteLength < 12) throw new Error('الملف أصغر من أن يكون خطاً');
    let base = 0;
    if (tag4(d, 0) === 'ttcf') base = u32(d, 12); // أول خط داخل المجموعة
    const n = u16(d, base + 4); const tabs = {};
    for (let i = 0; i < n; i++) { const o = base + 12 + i * 16; if (o + 16 > buf.byteLength) break; tabs[tag4(d, o)] = { off: u32(d, o + 8), len: u32(d, o + 12) }; }
    return { d, tabs, version: tag4(d, base) };
  }

  async function inflate(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('فك ضغط WOFF غير مدعوم في هذا النظام (DecompressionStream)');
    const ds = new DecompressionStream('deflate');
    const w = ds.writable.getWriter(); w.write(bytes); w.close();
    return new Uint8Array(await new Response(ds.readable).arrayBuffer());
  }

  /* يحوّل WOFF إلى sfnt خام (مفكوك) ليمرّ على نفس القارئ */
  async function woffToSfnt(buf) {
    const d = new DataView(buf); const n = u16(d, 12); const flavor = u32(d, 4);
    const recs = [];
    for (let i = 0; i < n; i++) { const o = 44 + i * 20; recs.push({ tag: tag4(d, o), off: u32(d, o + 4), comp: u32(d, o + 8), orig: u32(d, o + 12), sum: u32(d, o + 16) }); }
    let size = 12 + n * 16; const pad = x => (x + 3) & ~3;
    recs.forEach(r => size += pad(r.orig));
    const out = new Uint8Array(size); const od = new DataView(out.buffer);
    od.setUint32(0, flavor); od.setUint16(4, n);
    let pos = 12 + n * 16;
    for (let i = 0; i < n; i++) {
      const r = recs[i]; const raw = new Uint8Array(buf, r.off, r.comp);
      const data = r.comp < r.orig ? await inflate(raw) : raw;
      if (data.length !== r.orig) throw new Error('جدول ' + r.tag + ' تالف بعد فك الضغط');
      const o = 12 + i * 16;
      for (let k = 0; k < 4; k++) out[o + k] = r.tag.charCodeAt(k);
      od.setUint32(o + 4, r.sum); od.setUint32(o + 8, pos); od.setUint32(o + 12, r.orig);
      out.set(data, pos); pos += pad(r.orig);
    }
    return out.buffer;
  }

  function decodeName(d, off, len, platform) {
    let s = '';
    if (platform === 3 || platform === 0) { for (let i = 0; i + 1 < len; i += 2) s += String.fromCharCode(d.getUint16(off + i)); }
    else { for (let i = 0; i < len; i++) s += String.fromCharCode(d.getUint8(off + i)); }
    return s;
  }

  function readNames(d, tabs) {
    const t = tabs.name; if (!t) return {};
    const count = u16(d, t.off + 2), strOff = t.off + u16(d, t.off + 4); const res = {};
    for (let i = 0; i < count; i++) {
      const o = t.off + 6 + i * 12; if (o + 12 > d.byteLength) break;
      const plat = u16(d, o), id = u16(d, o + 6), len = u16(d, o + 8), so = strOff + u16(d, o + 10);
      if (so + len > d.byteLength) continue;
      if (!(plat === 3 || plat === 0 || plat === 1)) continue;
      const s = decodeName(d, so, len, plat); if (!s) continue;
      if (!res[id] || plat === 3) res[id] = s;
    }
    return res;
  }

  async function inspectFont(buf) {
    const sig = new DataView(buf).getUint32(0);
    let kind;
    if (sig === 0x774F4646) kind = 'WOFF';
    else if (sig === 0x774F4632) kind = 'WOFF2';
    else if (sig === 0x00010000 || sig === 0x74727565) kind = 'TrueType';
    else if (sig === 0x4F54544F) kind = 'OpenType (CFF)';
    else if (sig === 0x74746366) kind = 'TrueType Collection';
    else throw new Error('ليس ملف خط معروفاً (توقيع غير مطابق)');
    if (kind === 'WOFF2') return { kind, partial: true };
    let b = buf; if (kind === 'WOFF') b = await woffToSfnt(buf);
    const { d, tabs } = sfntTables(b);
    const names = readNames(d, tabs);
    const info = { kind, names, tables: Object.keys(tabs) };
    if (tabs.maxp) info.glyphs = u16(d, tabs.maxp.off + 4);
    if (tabs.head) info.unitsPerEm = u16(d, tabs.head.off + 18);
    return info;
  }

  OF.tools['font-inspector'] = {
    inspectFont,
    render(box) {
      OF.clear(box);
      const out = ui.out();
      const sample = ui.input({ value: 'أبجد هوز — Abc 123 — The quick brown fox', dir: 'auto' });
      const size = ui.input({ type: 'number', value: 32, min: 8, max: 120 });
      let face = null, fam = null;
      const prev = h('div', { class: 'card', style: { padding: '14px', minHeight: '80px', overflowWrap: 'anywhere' } });
      const upd = () => { prev.textContent = sample.value; prev.style.fontSize = (Number(size.value) || 32) + 'px'; prev.style.fontFamily = fam ? '"' + fam + '", sans-serif' : ''; };
      sample.addEventListener('input', upd); size.addEventListener('input', upd);
      const pick = ui.files({ accept: '.ttf,.otf,.woff,.woff2,.ttc', exts: ['ttf', 'otf', 'woff', 'woff2', 'ttc'], label: 'اختر ملف خط', maxMB: 50, onChange: async fs => {
        out.clear();
        if (face) { try { document.fonts.delete(face); } catch (e) { /* ignore */ } face = null; fam = null; }
        const f = fs[0]; if (!f) { upd(); return; }
        const buf = await f.arrayBuffer();
        let loaded = false;
        try {
          fam = 'of-font-' + Date.now();
          face = new FontFace(fam, buf); await face.load(); document.fonts.add(face); loaded = true;
        } catch (e) { fam = null; face = null; out.error('رفض النظام تحميل الخط للمعاينة: ' + e.message); }
        try {
          const r = await inspectFont(buf);
          if (r.partial) out.warn('WOFF2: المعاينة فقط؛ قراءة الجداول غير مدعومة في هذا الإصدار.');
          else {
            const n = r.names;
            out.kv([['النوع', r.kind], ['العائلة', n[16] || n[1]], ['النمط', n[17] || n[2]], ['الاسم الكامل', n[4]], ['PostScript', n[6]], ['الإصدار', n[5]],
              ['عدد الحروف الشكلية (Glyphs)', r.glyphs], ['وحدات EM', r.unitsPerEm], ['الشركة المصنّعة', n[8]], ['المصمم', n[9]], ['حقوق النشر', n[0]], ['الترخيص', n[13]], ['رابط الترخيص', n[14]], ['الجداول', r.tables.join(' ')]]);
          }
        } catch (e) { out.warn('تعذّرت قراءة الجداول: ' + e.message); }
        if (loaded) out.ok('تم تحميل الخط للمعاينة.');
        upd();
      } });
      box.append(ui.card('', pick), ui.card('المعاينة', ui.field('النص', sample), ui.field('الحجم (px)', size), prev), out);
      upd();
    }
  };
})();
