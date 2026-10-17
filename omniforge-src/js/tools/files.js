/* أدوات الملفات: PDF، الأرشيفات، MHTML + ترقيم ZIP (أدواتي)، فحص الملفات، التقسيم والدمج */
(function () {
  'use strict';
  const { h, ui } = OF;
  const T = OF.tools;
  const dec = new TextDecoder();

  /* ───────────── أدوات مشتركة ───────────── */
  function parseRanges(str, n, asGroups) {
    const toks = String(str || '').trim().split(/[,،;\s]+/).filter(Boolean); if (!toks.length) throw new Error('أدخل أرقام الصفحات مثل 1-3,5,8-');
    const groups = toks.map(t => {
      let m = /^(\d*)-(\d*)$/.exec(t), a, b;
      if (m && (m[1] || m[2])) { a = m[1] ? +m[1] : 1; b = m[2] ? +m[2] : n; } else if (/^\d+$/.test(t)) { a = b = +t; } else throw new Error('نطاق غير صالح: «' + t + '»');
      if (a < 1 || b > n || a > b) throw new Error('النطاق «' + t + '» خارج عدد الصفحات (1–' + n + ')');
      return Array.from({ length: b - a + 1 }, (_, i) => a - 1 + i);
    });
    return asGroups ? groups : groups.flat();
  }
  const natCmp = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  const dl = (name, bytes, mime) => new Blob([bytes], { type: mime });

  /* ───────────── ورشة PDF ───────────── */
  async function loadPdf(file) {
    const buf = await OF.readBuf(file);
    try { return await PDFLib.PDFDocument.load(buf, { updateMetadata: false }); }
    catch (e) { throw new Error(file.name + ': تعذر فتح الملف — ' + (/encrypt/i.test(e.message) ? 'الملف مشفّر بكلمة مرور (غير مدعوم)' : 'الملف تالف أو ليس PDF صالحاً')); }
  }
  async function pdfFromPages(src, idxs) { const d = await PDFLib.PDFDocument.create(); const pages = await d.copyPages(src, idxs); pages.forEach(p => d.addPage(p)); return d; }
  const pdfBlob = async d => new Blob([await d.save()], { type: 'application/pdf' });
  function orderedList(files, getPick) { // قائمة ملفات قابلة لإعادة الترتيب والحذف
    const list = h('ul', { class: 'flist' });
    const draw = () => { OF.clear(list); files.forEach((f, i) => list.appendChild(h('li', null, h('span', { class: 'nm', text: f.name }), h('span', { class: 'sz', text: OF.fmt.bytes(f.size) }),
      ui.btn('▲', () => { if (i > 0) { [files[i - 1], files[i]] = [files[i], files[i - 1]]; draw(); } }, { small: true }), ui.btn('▼', () => { if (i < files.length - 1) { [files[i + 1], files[i]] = [files[i], files[i + 1]]; draw(); } }, { small: true }),
      ui.btn('✕', () => { files.splice(i, 1); const pk = getPick && getPick(); if (pk) pk.set(files); draw(); }, { small: true, kind: 'danger' })))); };
    const sync = fs => { const known = new Set(files); fs.forEach(x => { if (!known.has(x)) files.push(x); }); for (let i = files.length - 1; i >= 0; i--) if (!fs.includes(files[i])) files.splice(i, 1); draw(); };
    return { el: list, draw, sync };
  }
  T['pdf-workshop'] = {
    parseRanges,
    render(box) {
      OF.clear(box);
      const single = (label) => { const f = ui.files({ accept: '.pdf,application/pdf', exts: ['pdf'], mimes: ['application/pdf'], label: label || 'اختر ملف PDF', maxMB: 150 }); const info = h('div'); f.onInfo = async () => { OF.clear(info); const file = f.first(); if (!file) return; try { const d = await loadPdf(file); info.appendChild(h('p', { class: 'muted small', text: 'عدد الصفحات: ' + d.getPageCount() })); f.pages = d.getPageCount(); } catch (e) { info.appendChild(h('div', { class: 'msg error' }, OF.icon('x'), h('span', { text: e.message }))); } }; return { f, info }; };
      box.appendChild(ui.tabs([
        { id: 'merge', label: 'دمج', render(p) {
          let files = [], pick; const ol = orderedList(files, () => pick); pick = ui.files({ accept: '.pdf', exts: ['pdf'], mimes: ['application/pdf'], multiple: true, label: 'أضف ملفات PDF', maxMB: 150, onChange: fs => ol.sync(fs) }); pick.querySelector('.flist').style.display = 'none';
          const out = ui.out(); const btn = ui.btn('ادمج', null, { kind: 'primary' }); p.append(ui.card('الملفات (بالترتيب الذي ستُدمج به)', pick, ol.el, btn), out);
          ui.task(btn, out, async t => { if (files.length < 2) throw new Error('اختر ملفين على الأقل'); const merged = await PDFLib.PDFDocument.create(); let total = 0; for (let i = 0; i < files.length; i++) { t.check(); t.progress(i / files.length * 100, files[i].name); const d = await loadPdf(files[i]); (await merged.copyPages(d, d.getPageIndices())).forEach(pg => merged.addPage(pg)); total += d.getPageCount(); await OF.tick(); } t.progress(95, 'حفظ…'); out.ok('تم دمج ' + files.length + ' ملف (' + total + ' صفحة)'); out.add(ui.saveRow('merged.pdf', await pdfBlob(merged))); }, { cancelable: true });
        } },
        { id: 'split', label: 'تقسيم / استخراج', render(p) {
          const { f, info } = single(); f.querySelector('input').addEventListener('change', () => setTimeout(f.onInfo, 50)); const rng = ui.input({ placeholder: 'مثال: 1-3,5,8-', dir: 'ltr', code: true }); const mode = ui.select([['one', 'استخراج الصفحات المحددة في ملف واحد'], ['each', 'كل نطاق في ملف منفصل'], ['every', 'تقسيم كل N صفحة (أدخل N في الحقل)']], 'one'); const out = ui.out(); const btn = ui.btn('نفّذ', null, { kind: 'primary' });
          p.append(ui.card('', f, info, ui.field('الصفحات / N', rng), ui.field('الوضع', mode), btn), out);
          ui.task(btn, out, async t => { const file = f.first(); if (!file) throw new Error('اختر ملف PDF'); const src = await loadPdf(file), n = src.getPageCount(); const base = OF.baseOf(file.name);
            if (mode.value === 'every') { const k = Math.floor(+rng.value); if (!(k >= 1)) throw new Error('أدخل عدداً صحيحاً موجباً لـ N'); let c = 0; for (let s = 0; s < n; s += k) { t.check(); const idx = Array.from({ length: Math.min(k, n - s) }, (_, i) => s + i); t.progress(s / n * 100, 'جزء ' + (++c)); out.add(ui.saveRow(base + '_part' + String(c).padStart(3, '0') + '.pdf', await pdfBlob(await pdfFromPages(src, idx)))); await OF.tick(); } out.ok('تم إنشاء ' + c + ' ملف'); return; }
            if (mode.value === 'one') { const idx = parseRanges(rng.value, n); out.ok('تم استخراج ' + idx.length + ' صفحة'); out.add(ui.saveRow(base + '_extract.pdf', await pdfBlob(await pdfFromPages(src, idx)))); return; }
            const gs = parseRanges(rng.value, n, true); for (let i = 0; i < gs.length; i++) { t.check(); out.add(ui.saveRow(base + '_' + (gs[i][0] + 1) + '-' + (gs[i][gs[i].length - 1] + 1) + '.pdf', await pdfBlob(await pdfFromPages(src, gs[i])))); } out.ok('تم إنشاء ' + gs.length + ' ملف'); });
        } },
        { id: 'edit', label: 'تدوير / حذف / ترتيب', render(p) {
          const { f, info } = single(); f.querySelector('input').addEventListener('change', () => setTimeout(f.onInfo, 50)); const act = ui.select([['rotate', 'تدوير صفحات'], ['delete', 'حذف صفحات'], ['reorder', 'إعادة ترتيب (أدخل الترتيب الكامل)'], ['reverse', 'عكس ترتيب كل الصفحات']], 'rotate'); const rng = ui.input({ placeholder: 'الصفحات: 1-3,5 (للتدوير والحذف) أو الترتيب الجديد 3,1,2', dir: 'ltr', code: true }); const ang = ui.select([['90', '90° مع عقارب الساعة'], ['180', '180°'], ['270', '90° عكس عقارب الساعة']]); const out = ui.out(); const btn = ui.btn('نفّذ', null, { kind: 'primary' });
          p.append(ui.card('', f, info, ui.field('العملية', act), ui.field('الصفحات', rng, 'اتركه فارغاً لتدوير كل الصفحات'), ui.field('زاوية التدوير', ang), btn), out);
          ui.task(btn, out, async t => { const file = f.first(); if (!file) throw new Error('اختر ملف PDF'); const d = await loadPdf(file), n = d.getPageCount(); const base = OF.baseOf(file.name);
            if (act.value === 'rotate') { const idx = rng.value.trim() ? parseRanges(rng.value, n) : d.getPageIndices(); idx.forEach(i => { const pg = d.getPage(i); pg.setRotation(PDFLib.degrees((pg.getRotation().angle + +ang.value) % 360)); }); out.ok('تم تدوير ' + idx.length + ' صفحة'); out.add(ui.saveRow(base + '_rotated.pdf', await pdfBlob(d))); }
            else if (act.value === 'delete') { const idx = [...new Set(parseRanges(rng.value, n))]; if (idx.length >= n) throw new Error('لا يمكن حذف كل الصفحات'); const keep = d.getPageIndices().filter(i => !idx.includes(i)); out.ok('تم حذف ' + idx.length + ' صفحة، تبقى ' + keep.length); out.add(ui.saveRow(base + '_trimmed.pdf', await pdfBlob(await pdfFromPages(d, keep)))); }
            else if (act.value === 'reverse') { out.ok('تم عكس الترتيب'); out.add(ui.saveRow(base + '_reversed.pdf', await pdfBlob(await pdfFromPages(d, d.getPageIndices().reverse())))); }
            else { const idx = parseRanges(rng.value, n); if (new Set(idx).size !== n || idx.length !== n) throw new Error('يجب ذكر كل صفحة مرة واحدة بالضبط (' + n + ' صفحة)'); out.ok('تمت إعادة الترتيب'); out.add(ui.saveRow(base + '_reordered.pdf', await pdfBlob(await pdfFromPages(d, idx)))); } });
        } },
        { id: 'img2pdf', label: 'صور ← PDF', render(p) {
          let files = [], pick; const ol = orderedList(files, () => pick); pick = ui.files({ accept: 'image/*', exts: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'], mimes: ['image/'], multiple: true, label: 'أضف صوراً', maxMB: 50, onChange: fs => ol.sync(fs) }); pick.querySelector('.flist').style.display = 'none';
          const size = ui.select([['fit', 'بحجم الصورة'], ['a4', 'A4 (الصورة داخل الصفحة)']], 'a4'); const margin = ui.input({ type: 'number', value: 20, min: 0, max: 200 }); const out = ui.out(); const btn = ui.btn('أنشئ PDF', null, { kind: 'primary' });
          p.append(ui.card('الصور (بالترتيب)', pick, ol.el, ui.field('حجم الصفحة', size), ui.field('الهامش (نقطة)', margin), btn), out);
          ui.task(btn, out, async t => { if (!files.length) throw new Error('اختر صورة واحدة على الأقل'); const d = await PDFLib.PDFDocument.create(); const mg = Math.max(0, +margin.value || 0);
            for (let i = 0; i < files.length; i++) { t.check(); t.progress(i / files.length * 100, files[i].name); let bytes, kind = OF.extOf(files[i].name); let buf = new Uint8Array(await OF.readBuf(files[i]));
              if (!(kind === 'png' || kind === 'jpg' || kind === 'jpeg') || (buf[0] !== 0x89 && buf[0] !== 0xFF)) { const img = await OF.loadImage(files[i]); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); buf = new Uint8Array(await (await OF.canvasBlob(c, 'image/png')).arrayBuffer()); kind = 'png'; }
              const im = buf[0] === 0x89 ? await d.embedPng(buf) : await d.embedJpg(buf); let pw = im.width, ph = im.height, x = 0, y = 0, w = im.width, hh = im.height;
              if (size.value === 'a4') { pw = 595.28; ph = 841.89; const s = Math.min((pw - 2 * mg) / im.width, (ph - 2 * mg) / im.height, 1e9); w = im.width * s; hh = im.height * s; x = (pw - w) / 2; y = (ph - hh) / 2; if (im.width > im.height * 1.2) { pw = 841.89; ph = 595.28; const s2 = Math.min((pw - 2 * mg) / im.width, (ph - 2 * mg) / im.height); w = im.width * s2; hh = im.height * s2; x = (pw - w) / 2; y = (ph - hh) / 2; } }
              d.addPage([pw, ph]).drawImage(im, { x, y, width: w, height: hh }); await OF.tick(); }
            out.ok('تم إنشاء PDF من ' + files.length + ' صورة'); out.add(ui.saveRow('images.pdf', await pdfBlob(d))); }, { cancelable: true });
        } },
        { id: 'info', label: 'معلومات', render(p) {
          const f = ui.files({ accept: '.pdf', exts: ['pdf'], mimes: ['application/pdf'], label: 'اختر ملف PDF', maxMB: 150 }); const out = ui.out(); const btn = ui.btn('اعرض', null, { kind: 'primary' }); p.append(ui.card('', f, btn), out);
          ui.task(btn, out, async () => { const file = f.first(); if (!file) throw new Error('اختر ملفاً'); const d = await loadPdf(file); const pgs = d.getPages(); const sizes = {}; pgs.forEach(pg => { const k = Math.round(pg.getWidth()) + '×' + Math.round(pg.getHeight()) + ' pt'; sizes[k] = (sizes[k] || 0) + 1; });
            out.kv([['الحجم', OF.fmt.bytes(file.size)], ['الصفحات', pgs.length], ['مقاسات الصفحات', Object.entries(sizes).map(([k, v]) => k + ' (' + v + ')').join('، ')], ['العنوان', d.getTitle()], ['المؤلف', d.getAuthor()], ['الموضوع', d.getSubject()], ['الكلمات المفتاحية', d.getKeywords()], ['المنشئ', d.getCreator()], ['المُنتِج', d.getProducer()], ['تاريخ الإنشاء', d.getCreationDate() && d.getCreationDate().toLocaleString('ar-u-nu-latn')], ['تاريخ التعديل', d.getModificationDate() && d.getModificationDate().toLocaleString('ar-u-nu-latn')]]); });
        } },
      ]));
    },
  };

  /* ───────────── مدير الأرشيفات ───────────── */
  T['archive-manager'] = {
    render(box) {
      OF.clear(box);
      box.appendChild(ui.tabs([
        { id: 'open', label: 'فتح واستخراج', render(p) {
          const f = ui.files({ accept: '.zip,.apk,.jar,.docx,.xlsx,.pptx,.epub,.cbz', label: 'اختر ملف ZIP', maxMB: 300 }); const out = ui.out(); const list = h('div'); const q = ui.input({ placeholder: 'تصفية بالاسم…' }); let zip = null, entries = [], sel = new Set();
          const btn = ui.btn('افتح', null, { kind: 'primary' }); const act = h('div', { class: 'row' });
          p.append(ui.card('', f, btn), out, ui.card('المحتويات', q, list, act));
          const draw = () => {
            OF.clear(list); const w = q.value.toLowerCase(); const shown = entries.filter(e => !w || e.name.toLowerCase().includes(w));
            list.appendChild(h('div', { class: 'tbl-wrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, ['', 'الاسم', 'الحجم', ''].map(x => h('th', { text: x })))),
              h('tbody', null, shown.slice(0, 500).map(e => h('tr', null, h('td', null, e.dir ? '' : h('input', { type: 'checkbox', checked: sel.has(e.name), on: { change: ev => (ev.target.checked ? sel.add(e.name) : sel.delete(e.name)) } })), h('td', { class: 'mono', text: e.name, style: { whiteSpace: 'normal', wordBreak: 'break-all' } }), h('td', { text: e.dir ? '—' : OF.fmt.bytes(e.size) }), h('td', null, e.dir ? '' : ui.btn('حفظ', async () => { try { await OF.save(await zip.file(e.name).async('blob'), e.name.split('/').pop(), ''); } catch (er) { ui.toast(er.message, 'error'); } }, { small: true }))))))));
            if (shown.length > 500) list.appendChild(h('p', { class: 'muted small', text: 'يعرض أول 500 من ' + shown.length + ' — استخدم التصفية.' }));
          };
          q.addEventListener('input', draw);
          ui.task(btn, out, async t => { const file = f.first(); if (!file) throw new Error('اختر ملفاً'); t.progress(null, 'قراءة الأرشيف…'); try { zip = await JSZip.loadAsync(file); } catch (e) { throw new Error(/encrypt/i.test(e.message) ? 'الأرشيف محمي بكلمة مرور (غير مدعوم)' : 'ليس أرشيف ZIP صالحاً أو أنه تالف: ' + e.message); }
            entries = Object.values(zip.files).map(e => ({ name: e.name, dir: e.dir, size: (e._data && e._data.uncompressedSize) || 0 })); sel = new Set(); const total = entries.reduce((a, e) => a + e.size, 0); const bad = entries.filter(e => /(^|\/)\.\.(\/|$)|^\//.test(e.name)).length;
            out.ok(entries.filter(e => !e.dir).length + ' ملف — الحجم بعد الفك ' + OF.fmt.bytes(total)); if (bad) out.warn(bad + ' مسار مشبوه (يحتوي .. أو يبدأ بـ /). لا يُكتب أي ملف بمساره؛ يُحفظ باسمه فقط.'); if (total > 2 * 1073741824) out.warn('الحجم بعد الفك كبير جداً (احتمال ZIP bomb).'); draw();
            OF.clear(act); act.append(ui.btn('تحديد الكل', () => { entries.filter(e => !e.dir).forEach(e => sel.add(e.name)); draw(); }, { small: true }), ui.btn('إلغاء التحديد', () => { sel.clear(); draw(); }, { small: true }), ui.btn('حفظ المحدد كـ ZIP جديد', async () => { if (!sel.size) return ui.toast('حدد ملفات أولاً', 'error'); const nz = new JSZip(); for (const n of sel) nz.file(n, zip.file(n).async('uint8array')); out.add(ui.saveRow('selected.zip', await nz.generateAsync({ type: 'blob', compression: 'DEFLATE' }))); }, { small: true, kind: 'primary' })); });
        } },
        { id: 'create', label: 'إنشاء ZIP', render(p) {
          const f = ui.files({ multiple: true, label: 'اختر الملفات', maxMB: 300 }); const name = ui.input({ value: 'archive.zip', dir: 'ltr' }); const lvl = ui.select([['DEFLATE', 'ضغط (أبطأ، أصغر)'], ['STORE', 'بدون ضغط (أسرع)']], 'DEFLATE'); const out = ui.out(); const btn = ui.btn('أنشئ ZIP', null, { kind: 'primary' });
          p.append(ui.card('', f, ui.field('اسم الملف', name), ui.field('الضغط', lvl), btn), out);
          ui.task(btn, out, async t => { const fs = f.files(); if (!fs.length) throw new Error('اختر ملفاً واحداً على الأقل'); const z = new JSZip(); const used = new Set(); fs.forEach(x => { let n = x.webkitRelativePath || x.name, k = 1; const base = n; while (used.has(n)) n = base.replace(/(\.[^.]*)?$/, ' (' + k++ + ')$1'); used.add(n); z.file(n, x); }); const blob = await z.generateAsync({ type: 'blob', compression: lvl.value, compressionOptions: { level: 6 } }, m => t.progress(m.percent, m.currentFile || '')); out.ok('تم إنشاء الأرشيف (' + fs.length + ' ملف)'); out.add(ui.saveRow(/\.zip$/i.test(name.value) ? name.value : name.value + '.zip', blob)); }, { cancelable: false });
        } },
      ]));
    },
  };

  /* ───────────── MHTML: استخراج الصور (منقول من core.py) ───────────── */
  const IMAGE_EXT_BY_MIME = { 'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/bmp': '.bmp', 'image/avif': '.avif', 'image/tiff': '.tif', 'image/svg+xml': '.svg' };
  const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif', '.tif', '.tiff', '.svg']);
  const startsWith = (d, sig, off = 0) => sig.every((b, i) => d[off + i] === b);
  function sniffImage(d) { // نوع الصورة من التوقيع الحقيقي أو null
    if (startsWith(d, [0xFF, 0xD8, 0xFF])) return 'image/jpeg'; if (startsWith(d, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) return 'image/png'; if (startsWith(d, [0x47, 0x49, 0x46, 0x38]) && (d[4] === 0x37 || d[4] === 0x39) && d[5] === 0x61) return 'image/gif';
    if (startsWith(d, [0x52, 0x49, 0x46, 0x46]) && startsWith(d, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp'; if (d[0] === 0x42 && d[1] === 0x4D) return 'image/bmp'; if (startsWith(d, [0x49, 0x49, 0x2A, 0]) || startsWith(d, [0x4D, 0x4D, 0, 0x2A])) return 'image/tiff';
    if (startsWith(d, [0, 0, 0], 0) && startsWith(d, [0x66, 0x74, 0x79, 0x70], 4) && /avif|avis/.test(String.fromCharCode(...d.subarray(8, 16)))) return 'image/avif'; return null;
  }
  function isValidImageBytes(d, mime) { // نفس منطق is_valid_image_bytes
    if (!d || !d.length) return false;
    if (mime === 'image/svg+xml') { const head = dec.decode(d.subarray(0, 200)).trimStart().toLowerCase(); return head.startsWith('<svg') || head.includes('<svg'); }
    if (startsWith(d, [0x52, 0x49, 0x46, 0x46])) return startsWith(d, [0x57, 0x45, 0x42, 0x50], 8);
    if (sniffImage(d) && !(d[0] === 0x42 && d[1] === 0x4D && d.length < 14)) return true;
    return d.length > 64; // توقيع غير معروف: نقبل إن لم يكن صغيراً جداً (كالأصل)
  }
  function extFor(mime, filename, data) {
    const sn = data && sniffImage(data); if (sn) return IMAGE_EXT_BY_MIME[sn] || '.bin'; // تحسين: الامتداد من التوقيع الحقيقي
    if (filename) { const m = /(\.[A-Za-z0-9]+)$/.exec(filename); if (m && IMAGE_EXTS.has(m[1].toLowerCase())) return m[1].toLowerCase() === '.jpeg' ? '.jpg' : m[1].toLowerCase(); }
    return IMAGE_EXT_BY_MIME[mime] || '.bin';
  }
  const B64 = (() => { const t = new Int16Array(256).fill(-1); 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.split('').forEach((c, i) => (t[c.charCodeAt(0)] = i)); t[45] = 62; t[95] = 63; return t; })();
  function b64decode(src) { // src: Uint8Array من أحرف Base64 (يتجاهل ما سواها)
    const out = new Uint8Array(Math.floor(src.length * 3 / 4) + 3); let o = 0, acc = 0, bits = 0;
    for (let i = 0; i < src.length; i++) { const v = B64[src[i]]; if (v < 0) continue; acc = (acc << 6) | v; bits += 6; if (bits >= 8) { bits -= 8; out[o++] = (acc >> bits) & 255; acc &= (1 << bits) - 1; } }
    return out.subarray(0, o);
  }
  function qpDecode(src) { const out = []; for (let i = 0; i < src.length; i++) { const c = src[i]; if (c === 0x3D) { if (src[i + 1] === 0x0D && src[i + 2] === 0x0A) { i += 2; continue; } if (src[i + 1] === 0x0A) { i++; continue; } const hx = String.fromCharCode(src[i + 1], src[i + 2]); if (/^[0-9A-Fa-f]{2}$/.test(hx)) { out.push(parseInt(hx, 16)); i += 2; continue; } } out.push(c); } return Uint8Array.from(out); }
  const latin1 = u => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return s; };
  function indexOfSeq(hay, seq, from) { const f = seq[0]; for (let i = hay.indexOf(f, from); i !== -1; i = hay.indexOf(f, i + 1)) { let ok = true; for (let k = 1; k < seq.length; k++) if (hay[i + k] !== seq[k]) { ok = false; break; } if (ok) return i; } return -1; }
  function splitHeaders(u8) { // يرجع {headers:{name:value}, bodyStart}
    let i = 0, end = -1; for (; i < u8.length - 1; i++) { if (u8[i] === 0x0A && (u8[i + 1] === 0x0A || (u8[i + 1] === 0x0D && u8[i + 2] === 0x0A))) { end = i; break; } if (u8[i] === 0x0D && u8[i + 1] === 0x0A && u8[i + 2] === 0x0D && u8[i + 3] === 0x0A) { end = i + 1; break; } }
    if (end < 0) return { headers: {}, bodyStart: 0 };
    const txt = latin1(u8.subarray(0, end)).replace(/\r?\n[ \t]+/g, ' '); const headers = {}; txt.split(/\r?\n/).forEach(l => { const k = l.indexOf(':'); if (k > 0) { const n = l.slice(0, k).trim().toLowerCase(); if (!(n in headers)) headers[n] = l.slice(k + 1).trim(); } });
    let bs = end; while (u8[bs] === 0x0D || u8[bs] === 0x0A) { bs++; if (bs - end >= 4) break; } // يتخطى السطر/الأسطر الفارغة
    return { headers, bodyStart: u8[end] === 0x0A && u8[end + 1] === 0x0A ? end + 2 : end + (u8[end + 1] === 0x0D ? 3 : 2) };
  }
  const param = (v, name) => { if (!v) return ''; const m = new RegExp(name + '\\*?\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))', 'i').exec(v); if (!m) return ''; let s = m[1] != null ? m[1] : m[2]; const e = /^(?:utf-8|iso-8859-1)'[^']*'(.*)$/i.exec(s); if (e) { try { s = decodeURIComponent(e[1]); } catch (x) { s = e[1]; } } return decodeWord(s); };
  function decodeWord(s) { return s.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (m, cs, enc, t) => { try { const bytes = enc.toLowerCase() === 'b' ? b64decode(new TextEncoder().encode(t)) : qpDecode(new TextEncoder().encode(t.replace(/_/g, ' '))); return new TextDecoder(cs).decode(bytes); } catch (e) { return m; } }); }
  function decodeBody(u8, cte) { cte = (cte || '').toLowerCase().trim(); if (cte === 'base64') return b64decode(u8); if (cte === 'quoted-printable') return qpDecode(u8); return u8; }
  function walkMime(u8, out, depth) { // يجمع الأجزاء غير المتعددة بالترتيب
    if (depth > 8) return; const { headers, bodyStart } = splitHeaders(u8); const ct = headers['content-type'] || 'text/plain'; const body = u8.subarray(bodyStart);
    const mt = ct.split(';')[0].trim().toLowerCase();
    if (mt.startsWith('multipart/')) {
      const bd = param(ct, 'boundary'); if (!bd) return; const delim = new TextEncoder().encode('--' + bd); let pos = indexOfSeq(body, delim, 0); const starts = [];
      while (pos !== -1) { const lineEnd = body.indexOf(0x0A, pos); if (body[pos + delim.length] === 0x2D && body[pos + delim.length + 1] === 0x2D) { starts.push({ end: pos }); break; } starts.push({ s: lineEnd < 0 ? body.length : lineEnd + 1, at: pos }); pos = indexOfSeq(body, delim, pos + delim.length); }
      for (let i = 0; i < starts.length; i++) { if (starts[i].s == null) continue; let e = starts[i + 1] ? (starts[i + 1].at != null ? starts[i + 1].at : starts[i + 1].end) : body.length; if (body[e - 1] === 0x0A) e--; if (body[e - 1] === 0x0D) e--; walkMime(body.subarray(starts[i].s, Math.max(starts[i].s, e)), out, depth + 1); }
    } else out.push({ headers, ct: mt, raw: body, charset: param(ct, 'charset') });
  }
  function parseMhtml(u8) {
    if (!u8.length || !u8.some(b => b > 32)) throw new Error('الملف فارغ.'); const raw = []; walkMime(u8, raw, 0);
    let html = null; const parts = []; let idx = 0;
    for (const r of raw) {
      const cid = (r.headers['content-id'] || '').trim(), loc = (r.headers['content-location'] || '').trim(); const cd = r.headers['content-disposition'] || '';
      const filename = param(cd, 'filename') || param(r.headers['content-type'], 'name') || ''; const data = decodeBody(r.raw, r.headers['content-transfer-encoding']);
      if (r.ct === 'text/html' && html == null) { try { html = new TextDecoder(r.charset || 'utf-8').decode(data); } catch (e) { html = new TextDecoder('utf-8').decode(data); } continue; }
      if (r.ct.startsWith('image/') || filename || cid || loc) parts.push({ index: idx++, ct: r.ct, cid: cid.replace(/^<|>$/g, '').trim().toLowerCase(), filename, loc, data, isImage: r.ct.startsWith('image/') || (filename && IMAGE_EXTS.has((/(\.[^.]+)$/.exec(filename) || [''])[0].toLowerCase())) || (loc && /image\//.test(r.ct)) });
    }
    if (html == null && !parts.length) throw new Error('لم يتم العثور على محتوى HTML ولا أي أجزاء داخل الملف. تأكد أن الملف MHTML صالح.');
    return { html, parts };
  }
  const baseName = s => { try { return decodeURIComponent(String(s).split(/[?#]/)[0].split('/').pop()).toLowerCase(); } catch (e) { return String(s).split(/[?#]/)[0].split('/').pop().toLowerCase(); } };
  function decodeDataUri(uri) { const c = uri.indexOf(','); const head = uri.slice(5, c), pl = uri.slice(c + 1); const mime = (head.split(';')[0] || 'text/plain').toLowerCase(); if (/;base64/i.test(head)) return { data: b64decode(new TextEncoder().encode(pl)), mime }; return { data: Uint8Array.from(unescape(pl).split('').map(ch => ch.charCodeAt(0))), mime }; }
  function collectImages(html, parts) {
    const cidMap = new Map(), nameMap = new Map(), locMap = new Map(); parts.forEach(p => { if (p.cid) cidMap.set(p.cid, p); if (p.filename) { const k = baseName(p.filename); (nameMap.get(k) || nameMap.set(k, []).get(k)).push(p); } if (p.loc) { locMap.set(p.loc, p); const k = baseName(p.loc); if (!nameMap.has('loc:' + k)) nameMap.set('loc:' + k, [p]); } });
    const used = new Set(), extracted = []; const stats = { img_tags_found: 0, matched_from_html: 0, unmatched_img_tags: 0, fallback_parts_added: 0, invalid_images_skipped: 0 };
    const addPart = (part, source) => { if (used.has(part.index)) return false; used.add(part.index); if (!isValidImageBytes(part.data, part.ct)) { stats.invalid_images_skipped++; return false; } extracted.push({ ext: extFor(part.ct, part.filename, part.data), ct: part.ct, data: part.data, source }); return true; };
    const addBytes = (data, mime, source) => { if (!isValidImageBytes(data, mime)) { stats.invalid_images_skipped++; return false; } extracted.push({ ext: extFor(mime, null, data), ct: mime, data, source }); return true; };
    if (html) {
      const srcs = []; const doc = new DOMParser().parseFromString(html, 'text/html'); doc.querySelectorAll('img').forEach(im => { const s = (im.getAttribute('src') || '').trim(); if (s) srcs.push(s); });
      stats.img_tags_found = srcs.length;
      for (const src of srcs) {
        let matched = false; const low = src.toLowerCase();
        if (low.startsWith('cid:')) { const cid = src.slice(4).replace(/^<|>$/g, '').trim().toLowerCase(); const part = cidMap.get(cid); if (part) { addPart(part, 'cid:' + cid); matched = true; } }
        else if (low.startsWith('data:')) { try { const { data, mime } = decodeDataUri(src); matched = addBytes(data, mime, 'data:'); } catch (e) { matched = false; } }
        else { const part = locMap.get(src); if (part) { addPart(part, src); matched = true; } else { const bn = baseName(src); if (nameMap.has(bn)) { nameMap.get(bn).forEach(pt => addPart(pt, src)); matched = true; } else if (nameMap.has('loc:' + bn)) { nameMap.get('loc:' + bn).forEach(pt => addPart(pt, src)); matched = true; } } }
        matched ? stats.matched_from_html++ : stats.unmatched_img_tags++;
      }
    }
    parts.slice().sort((a, b) => a.index - b.index).forEach(pt => { if (!used.has(pt.index) && pt.isImage) { if (addPart(pt, pt.filename || pt.cid || pt.loc || 'part_' + pt.index)) stats.fallback_parts_added++; } });
    return { images: extracted.map((x, i) => ({ ...x, filename: String(i + 1).padStart(3, '0') + x.ext })), stats };
  }
  const safeStem = n => (String(n).trim().replace(/[^a-zA-Z0-9؀-ۿ._-]+/g, '_').replace(/^[._-]+|[._-]+$/g, '') || 'chapter');
  async function mhtmlToZip(u8, srcName, baseNameIn, progress) {
    progress && progress(10, 'تحليل MHTML…'); const { html, parts } = parseMhtml(u8); progress && progress(40, 'مطابقة الصور…'); const { images, stats } = collectImages(html, parts);
    if (!images.length) throw new Error('لم يتم العثور على أي صور صالحة داخل الملف. غالباً الموقع يخزّن روابط صور خارجية فقط ولم يتم تضمينها داخل MHTML.');
    const folder = safeStem(baseNameIn || OF.baseOf(srcName)); const manifest = { source_file: srcName, image_count: images.length, created_at: new Date().toISOString(), stats, items: images.map(i => ({ filename: i.filename, content_type: i.ct, source: i.source, bytes: i.data.length })) };
    const z = new JSZip(); z.file(folder + '/manifest.json', JSON.stringify(manifest, null, 2)); images.forEach(i => z.file(folder + '/' + i.filename, i.data, { compression: 'STORE' }));
    const blob = await z.generateAsync({ type: 'blob', compression: 'DEFLATE' }, m => progress && progress(60 + m.percent * 0.4, 'بناء ZIP…')); return { blob, manifest, folder };
  }
  /* ───── إعادة ترقيم صور ZIP (منقول من renamer.py) ───── */
  const RN_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif']);
  const isJunk = n => n.split('/').some(p => p.startsWith('.') || ['__macosx', 'thumbs.db', 'desktop.ini'].includes(p.toLowerCase()));
  function sortKey(name) { const stem = name.split('/').pop().replace(/\.[^.]*$/, ''); const nums = stem.match(/\d+/g); return nums ? [0, parseInt(nums[0], 10), stem.toLowerCase()] : [1, 0, stem.toLowerCase()]; }
  const cmpKey = (a, b) => a[0] - b[0] || a[1] - b[1] || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0);
  async function renameZip(file, progress) {
    let zip; try { zip = await JSZip.loadAsync(file); } catch (e) { throw new Error('الملف ليس ZIP صالحاً أو أنه تالف.'); }
    const imgs = []; let junk = 0, nonImg = 0; for (const e of Object.values(zip.files)) { if (e.dir) { nonImg++; continue; } if (isJunk(e.name)) { junk++; continue; } let ext = (/(\.[^./]+)$/.exec(e.name) || ['', ''])[1].toLowerCase(); if (ext === '.jpeg') ext = '.jpg'; if (!RN_EXTS.has(ext) && ext !== '.jpg') { nonImg++; continue; } imgs.push({ orig: e.name, ext, key: sortKey(e.name), entry: e }); }
    if (!imgs.length) throw new Error('لم يتم العثور على أي صور داخل ZIP. تأكد أن الملف يحتوي صوراً بصيغ: jpg, png, webp, gif, bmp, avif.');
    progress && progress(30, 'ترتيب ' + imgs.length + ' صورة…'); imgs.sort((a, b) => cmpKey(a.key, b.key)); const pad = Math.max(3, String(imgs.length).length); const out = new JSZip();
    for (let i = 0; i < imgs.length; i++) { imgs[i].renamed = String(i + 1).padStart(pad, '0') + imgs[i].ext; out.file(imgs[i].renamed, await imgs[i].entry.async('uint8array'), { compression: 'STORE' }); if (progress && i % 5 === 0) progress(30 + i / imgs.length * 60, 'إضافة الصور ' + (i + 1) + '/' + imgs.length); await OF.tick(); }
    return { blob: await out.generateAsync({ type: 'blob', compression: 'STORE' }), stats: { image_count: imgs.length, skipped_junk: junk, skipped_non_image: nonImg }, items: imgs.map(i => ({ original: i.orig, renamed: i.renamed })) };
  }
  T['mhtml-workshop'] = {
    api: { parseMhtml, collectImages, mhtmlToZip, renameZip, sortKey },
    render(box) {
      OF.clear(box);
      box.appendChild(ui.tabs([
        { id: 'extract', label: 'استخراج صور MHTML', render(p) {
          const f = ui.files({ accept: '.mhtml,.mht', multiple: true, label: 'اختر ملفات MHTML / MHT', hint: 'يُعالج محلياً على جهازك', maxMB: 200 }); const nm = ui.input({ placeholder: 'اسم المجلد داخل ZIP (اختياري، ملف واحد فقط)', dir: 'auto' }); const out = ui.out(); const btn = ui.btn('استخرج', null, { kind: 'primary' });
          p.append(ui.card('', f, ui.field('', nm), btn), out);
          ui.task(btn, out, async t => { const fs = f.files(); if (!fs.length) throw new Error('اختر ملف MHTML أولاً');
            for (let k = 0; k < fs.length; k++) { t.check(); const file = fs[k]; const sc = (pc, l) => t.progress((k + pc / 100) / fs.length * 100, file.name + ' — ' + l); sc(2, 'قراءة الملف…');
              if (!/\.(mhtml|mht)$/i.test(file.name)) out.warn(file.name + ': امتداد الملف ليس mhtml/mht، تتم المحاولة على أي حال.');
              try { const u8 = new Uint8Array(await OF.readBuf(file)); const r = await mhtmlToZip(u8, file.name, fs.length === 1 ? nm.value : '', sc); const s = r.manifest.stats;
                const card = ui.card(file.name, ui.kv([['الصور المستخرجة', r.manifest.image_count], ['وسوم <img> في الصفحة', s.img_tags_found], ['مطابقة من HTML', s.matched_from_html], ['وسوم بلا مطابقة (صور خارجية غير مضمّنة)', s.unmatched_img_tags], ['أُضيفت احتياطياً', s.fallback_parts_added], ['صور تالفة استُبعدت', s.invalid_images_skipped]]));
                if (s.unmatched_img_tags) card.appendChild(h('p', { class: 'hint', text: 'وجود وسوم بلا مطابقة يعني أن بعض الصور لم تُضمَّن داخل الملف عند حفظه.' })); card.appendChild(ui.saveRow(r.folder + '.zip', r.blob)); out.add(card);
              } catch (e) { out.error(file.name + ': ' + e.message); } await OF.tick(); } }, { cancelable: true });
        } },
        { id: 'rename', label: 'إعادة ترقيم صور ZIP', render(p) {
          const f = ui.files({ accept: '.zip', exts: ['zip'], label: 'اختر ملف ZIP يحتوي صوراً', maxMB: 300 }); const out = ui.out(); const btn = ui.btn('أعد الترقيم', null, { kind: 'primary' });
          p.append(ui.card('', h('p', { class: 'muted small', text: 'يرتّب الصور حسب أول رقم في اسم الملف ثم يعيد تسميتها 001، 002… دون تعديل محتوى الصور. يتجاهل ملفات النظام والمجلدات المخفية.' }), f, btn), out);
          ui.task(btn, out, async t => { const file = f.first(); if (!file) throw new Error('اختر ملف ZIP'); const r = await renameZip(file, (pc, l) => t.progress(pc, l)); out.ok('تمت إعادة ترتيب ' + r.stats.image_count + ' صورة'); out.kv([['الصور', r.stats.image_count], ['ملفات نظام/مخفية متجاهلة', r.stats.skipped_junk], ['غير صور متجاهلة', r.stats.skipped_non_image]]); out.add(ui.saveRow(OF.baseOf(file.name) + '_renumbered.zip', r.blob));
            out.add(h('details', { class: 'limits' }, h('summary', { text: 'الأسماء القديمة ← الجديدة' }), h('pre', { class: 'res' }, r.items.slice(0, 300).map(i => i.original + ' → ' + i.renamed).join('\n') + (r.items.length > 300 ? '\n…' : '')))); });
        } },
      ]));
    },
  };

  /* ───────────── فحص الملفات ───────────── */
  const SIGS = [
    ['PNG', [0x89, 0x50, 0x4E, 0x47], ['png']], ['JPEG', [0xFF, 0xD8, 0xFF], ['jpg', 'jpeg']], ['GIF', [0x47, 0x49, 0x46, 0x38], ['gif']], ['PDF', [0x25, 0x50, 0x44, 0x46], ['pdf']], ['ZIP / OOXML / APK / JAR', [0x50, 0x4B, 3, 4], ['zip', 'docx', 'xlsx', 'pptx', 'apk', 'jar', 'epub', 'odt', 'cbz']], ['GZIP', [0x1F, 0x8B], ['gz', 'tgz']], ['7-Zip', [0x37, 0x7A, 0xBC, 0xAF], ['7z']], ['RAR', [0x52, 0x61, 0x72, 0x21], ['rar']],
    ['SQLite', [0x53, 0x51, 0x4C, 0x69, 0x74, 0x65], ['db', 'sqlite']], ['ELF', [0x7F, 0x45, 0x4C, 0x46], ['so', 'elf']], ['EXE / DLL (MZ)', [0x4D, 0x5A], ['exe', 'dll']], ['DEX (Android)', [0x64, 0x65, 0x78, 0x0A], ['dex']], ['Ogg', [0x4F, 0x67, 0x67, 0x53], ['ogg', 'oga', 'opus']], ['FLAC', [0x66, 0x4C, 0x61, 0x43], ['flac']], ['MP3 (ID3)', [0x49, 0x44, 0x33], ['mp3']], ['BMP', [0x42, 0x4D], ['bmp']], ['TIFF', [0x49, 0x49, 0x2A, 0], ['tif', 'tiff']], ['TrueType', [0, 1, 0, 0], ['ttf']], ['OpenType', [0x4F, 0x54, 0x54, 0x4F], ['otf']], ['WOFF', [0x77, 0x4F, 0x46, 0x46], ['woff']], ['WOFF2', [0x77, 0x4F, 0x46, 0x32], ['woff2']],
  ];
  function sniff(u8) {
    for (const [n, sig, ex] of SIGS) if (startsWith(u8, sig)) return { name: n, exts: ex };
    if (startsWith(u8, [0x52, 0x49, 0x46, 0x46])) { const t = String.fromCharCode(...u8.subarray(8, 12)); if (t === 'WEBP') return { name: 'WEBP', exts: ['webp'] }; if (t === 'WAVE') return { name: 'WAV', exts: ['wav'] }; if (t === 'AVI ') return { name: 'AVI', exts: ['avi'] }; }
    if (startsWith(u8, [0x66, 0x74, 0x79, 0x70], 4)) return { name: 'ISO-BMFF (MP4/M4A/HEIC/AVIF/3GP)', exts: ['mp4', 'm4a', 'm4v', 'mov', 'heic', 'avif', '3gp'] };
    if (startsWith(u8, [0x1A, 0x45, 0xDF, 0xA3])) return { name: 'Matroska/WebM', exts: ['mkv', 'webm'] }; if (u8[0] === 0xFF && (u8[1] & 0xE0) === 0xE0) return { name: 'MP3/AAC (frame)', exts: ['mp3', 'aac'] };
    const head = dec.decode(u8.subarray(0, 512)); if (!/[\u0000-\u0008\u000E-\u001F]/.test(head)) { const t = head.trimStart().toLowerCase(); if (t.startsWith('<?xml') || t.startsWith('<svg')) return { name: t.includes('<svg') ? 'SVG/XML' : 'XML', exts: ['xml', 'svg'] }; if (t.startsWith('<!doctype html') || t.startsWith('<html')) return { name: 'HTML', exts: ['html', 'htm'] }; if (/^[\[{]/.test(t)) return { name: 'JSON (محتمل)', exts: ['json'] }; return { name: 'نص (Text)', exts: ['txt', 'md', 'csv', 'log', 'ini', 'js', 'css', 'srt', 'vtt', 'tsv', 'yaml', 'yml', 'py', 'java', 'kt', 'sh', 'json', 'html', 'xml'] }; }
    return { name: 'غير معروف', exts: null };
  }
  T['file-audit'] = {
    sniff,
    render(box) {
      const f = ui.files({ multiple: true, label: 'اختر ملفات للفحص', maxMB: 300 }); const out = ui.out(); const btn = ui.btn('افحص', null, { kind: 'primary' }); box.append(ui.card('', f, btn), out);
      ui.task(btn, out, async t => { const fs = f.files(); if (!fs.length) throw new Error('اختر ملفاً واحداً على الأقل'); const groups = new Map();
        for (let i = 0; i < fs.length; i++) { t.check(); const file = fs[i]; t.progress(i / fs.length * 100, file.name); const buf = await OF.readBuf(file); const u8 = new Uint8Array(buf); const sn = sniff(u8); const hash = OF.fmt.hex(new Uint8Array(await crypto.subtle.digest('SHA-256', buf))); const ext = OF.extOf(file.name);
          (groups.get(hash) || groups.set(hash, []).get(hash)).push(file.name); const mismatch = sn.exts && ext && !sn.exts.includes(ext);
          const hexdump = Array.from({ length: Math.ceil(Math.min(256, u8.length) / 16) }, (_, r) => { const row = u8.subarray(r * 16, r * 16 + 16); return r.toString(16).padStart(4, '0') + '  ' + Array.from(row, b => b.toString(16).padStart(2, '0')).join(' ').padEnd(47) + '  ' + Array.from(row, b => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join(''); }).join('\n');
          const card = ui.card(file.name, ui.kv([['الحجم', OF.fmt.bytes(file.size) + ' (' + file.size.toLocaleString('en') + ' بايت)'], ['الامتداد المعلن', ext || '—'], ['النوع من التوقيع', sn.name], ['SHA-256', h('span', { class: 'mono', text: hash })], ['آخر تعديل', file.lastModified ? new Date(file.lastModified).toLocaleString('ar-u-nu-latn') : '']]));
          if (mismatch) card.appendChild(h('div', { class: 'msg warn' }, OF.icon('info'), h('span', { text: 'الامتداد (' + ext + ') لا يطابق المحتوى الفعلي (' + sn.name + ').' })));
          card.appendChild(h('details', { class: 'limits' }, h('summary', { text: 'أول 256 بايت (Hex)' }), h('pre', { class: 'res' }, hexdump))); out.add(card); await OF.tick(); }
        const dups = [...groups.values()].filter(g => g.length > 1); if (fs.length > 1) dups.length ? out.warn('ملفات مكررة المحتوى: ' + dups.map(g => g.join(' = ')).join(' | ')) : out.ok('لا توجد ملفات مكررة المحتوى بين الملفات المختارة.'); }, { cancelable: true });
    },
  };

  /* ───────────── تقسيم ودمج الملفات ───────────── */
  T['file-split-join'] = {
    render(box) {
      OF.clear(box);
      box.appendChild(ui.tabs([
        { id: 'split', label: 'تقسيم', render(p) {
          const f = ui.files({ label: 'اختر ملفاً كبيراً', maxMB: 2000 }); const sz = ui.input({ type: 'number', value: 10, min: 0.1, step: 0.1 }); const out = ui.out(); const btn = ui.btn('قسّم', null, { kind: 'primary' });
          p.append(ui.card('', f, ui.field('حجم الجزء (MB)', sz), btn), out);
          ui.task(btn, out, async () => { const file = f.first(); if (!file) throw new Error('اختر ملفاً'); const part = Math.floor(+sz.value * 1048576); if (!(part >= 102400)) throw new Error('الحد الأدنى لحجم الجزء 0.1 MB'); const n = Math.ceil(file.size / part); if (n > 999) throw new Error('عدد الأجزاء (' + n + ') كبير؛ زد حجم الجزء (الحد 999 جزءاً).'); if (n < 2) throw new Error('الملف أصغر من حجم الجزء — لا حاجة للتقسيم.');
            out.ok('سيُقسَّم إلى ' + n + ' جزءاً. لا تُضاف بصمة تحقق؛ احسب SHA-256 للأصل قبل التقسيم وبعد الدمج.'); const pad = Math.max(3, String(n).length); const parts = []; for (let i = 0; i < n; i++) parts.push([file.name + '.part' + String(i + 1).padStart(pad, '0'), file.slice(i * part, Math.min(file.size, (i + 1) * part))]);
            out.add(ui.btn('حفظ كل الأجزاء بالتتابع', async () => { for (const [nm, b] of parts) { await OF.save(b, nm, 'application/octet-stream'); await OF.sleep(300); } }, { kind: 'primary', small: true })); parts.forEach(([nm, b]) => out.add(ui.saveRow(nm, b))); });
        } },
        { id: 'join', label: 'دمج', render(p) {
          const f = ui.files({ multiple: true, label: 'اختر كل الأجزاء (.part001 …)', maxMB: 2000 }); const out = ui.out(); const btn = ui.btn('ادمج', null, { kind: 'primary' });
          p.append(ui.card('', f, btn), out);
          ui.task(btn, out, async () => { const fs = f.files().slice().sort((a, b) => natCmp(a.name, b.name)); if (fs.length < 2) throw new Error('اختر جزأين على الأقل'); const re = /^(.*)\.part(\d+)$/i; const ms = fs.map(x => re.exec(x.name)); if (ms.some(m => !m)) out.warn('بعض الأسماء لا تتبع نمط name.partNNN؛ سيُدمج بحسب ترتيب الأسماء.');
            else { const bases = new Set(ms.map(m => m[1])); if (bases.size > 1) throw new Error('الأجزاء تعود لملفات مختلفة: ' + [...bases].join('، ')); const nums = ms.map(m => +m[2]); nums.forEach((v, i) => { if (v !== i + 1) throw new Error('جزء ناقص أو مكرر: المتوقع رقم ' + (i + 1) + ' لكن وُجد ' + v); }); }
            const name = ms[0] ? ms[0][1] : 'joined.bin'; const blob = new Blob(fs, { type: 'application/octet-stream' }); out.ok('تم دمج ' + fs.length + ' جزء (' + OF.fmt.bytes(blob.size) + ')'); out.add(ui.saveRow(name, blob)); });
        } },
      ]));
    },
  };
})();
