/* أدوات الصور: ورشة الصور، الألوان، SVG، GIF */
(function () {
  'use strict';
  const { h, ui } = OF;
  const T = OF.tools;
  const MAX_PIXELS = 120e6;

  /* ───────────── ورشة الصور ───────────── */
  async function supports(type) { const c = document.createElement('canvas'); c.width = c.height = 1; return new Promise(r => c.toBlob(b => r(!!b && b.type === type), type, 0.8)); }
  async function processImage(file, o) {
    const img = await OF.loadImage(file); let sw = img.naturalWidth, sh = img.naturalHeight; if (!sw || !sh) throw new Error('أبعاد الصورة غير صالحة');
    if (sw * sh > MAX_PIXELS) throw new Error('الصورة كبيرة جداً (' + Math.round(sw * sh / 1e6) + ' ميغابكسل)');
    // 1) قص بنسبة
    let cx = 0, cy = 0, cw = sw, ch = sh;
    if (o.crop && o.crop !== 'free') { const [a, b] = o.crop.split(':').map(Number); const target = a / b; if (sw / sh > target) { cw = Math.round(sh * target); cx = Math.round((sw - cw) * o.cropPos / 100); } else { ch = Math.round(sw / target); cy = Math.round((sh - ch) * o.cropPos / 100); } }
    // 2) تغيير الحجم
    let tw = cw, th = ch;
    if (o.resize === 'width' && o.w > 0) { tw = o.w; th = Math.round(ch * o.w / cw); } else if (o.resize === 'height' && o.h > 0) { th = o.h; tw = Math.round(cw * o.h / ch); }
    else if (o.resize === 'fit' && o.w > 0 && o.h > 0) { const s = Math.min(o.w / cw, o.h / ch); tw = Math.round(cw * s); th = Math.round(ch * s); } else if (o.resize === 'exact' && o.w > 0 && o.h > 0) { tw = o.w; th = o.h; } else if (o.resize === 'percent' && o.pct > 0) { tw = Math.round(cw * o.pct / 100); th = Math.round(ch * o.pct / 100); }
    if (!o.upscale && o.resize !== 'exact' && (tw > cw || th > ch)) { tw = cw; th = ch; }
    tw = Math.max(1, tw); th = Math.max(1, th); if (tw * th > MAX_PIXELS) throw new Error('الحجم الناتج كبير جداً');
    // 3) تدوير/قلب
    const rot = o.rotate % 180 !== 0; const W = rot ? th : tw, H = rot ? tw : th;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
    const mime = o.format === 'original' ? (file.type && /^image\/(png|jpeg|webp)$/.test(file.type) ? file.type : 'image/png') : o.format;
    if (mime === 'image/jpeg') { g.fillStyle = o.bg || '#ffffff'; g.fillRect(0, 0, W, H); }
    g.save(); g.translate(W / 2, H / 2); g.rotate(o.rotate * Math.PI / 180); g.scale(o.flipH ? -1 : 1, o.flipV ? -1 : 1);
    // تصغير على مراحل لجودة أفضل
    let src = img, sx = cx, sy = cy, sW = cw, sH = ch;
    while (sW / 2 >= tw && sH / 2 >= th) { const t = document.createElement('canvas'); t.width = Math.floor(sW / 2); t.height = Math.floor(sH / 2); const tg = t.getContext('2d'); tg.imageSmoothingQuality = 'high'; tg.drawImage(src, sx, sy, sW, sH, 0, 0, t.width, t.height); src = t; sx = 0; sy = 0; sW = t.width; sH = t.height; }
    g.drawImage(src, sx, sy, sW, sH, -tw / 2, -th / 2, tw, th); g.restore();
    const blob = await OF.canvasBlob(c, mime, mime === 'image/png' ? undefined : o.quality / 100);
    if (blob.type !== mime) throw new Error('هذا النظام لا يدعم الترميز إلى ' + mime);
    return { blob, w: W, h: H, srcW: sw, srcH: sh, mime };
  }
  T['image-workshop'] = {
    processImage,
    render(box) {
      const f = ui.files({ accept: 'image/*', multiple: true, label: 'اختر صوراً', hint: 'JPG · PNG · WEBP · GIF · BMP…', exts: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif', 'heic'], mimes: ['image/'], maxMB: 60 });
      const resize = ui.select([['none', 'بدون تغيير'], ['width', 'حسب العرض'], ['height', 'حسب الارتفاع'], ['fit', 'ملاءمة داخل صندوق'], ['exact', 'أبعاد محددة (قد يشوّه)'], ['percent', 'نسبة مئوية']], 'none');
      const w = ui.input({ type: 'number', placeholder: 'العرض px', min: 1 }), hh = ui.input({ type: 'number', placeholder: 'الارتفاع px', min: 1 }), pct = ui.input({ type: 'number', value: 50, min: 1, max: 400 }); const up = ui.check('السماح بالتكبير');
      const crop = ui.select([['free', 'بدون قص'], ['1:1', '1:1'], ['4:3', '4:3'], ['3:4', '3:4'], ['16:9', '16:9'], ['9:16', '9:16']], 'free'); const cpos = ui.input({ type: 'range', min: 0, max: 100, value: 50 });
      const rot = ui.select([['0', 'بدون'], ['90', '90°'], ['180', '180°'], ['270', '270°']], '0'); const fh = ui.check('قلب أفقي'), fv = ui.check('قلب عمودي');
      const fmt = ui.select([['original', 'نفس الصيغة'], ['image/png', 'PNG (بلا فقد)'], ['image/jpeg', 'JPEG'], ['image/webp', 'WEBP']], 'original'); const q = ui.input({ type: 'range', min: 10, max: 100, value: 85 }); const qv = h('span', { text: '85' }); q.addEventListener('input', () => (qv.textContent = q.value)); const bg = ui.input({ value: '#ffffff', dir: 'ltr' });
      const out = ui.out(); const btn = ui.btn('نفّذ', null, { kind: 'primary' });
      box.append(ui.card('الملفات', f), ui.card('الحجم', ui.field('الوضع', resize), ui.row(h('div', { class: 'grow' }, w), h('div', { class: 'grow' }, hh), h('div', { class: 'grow' }, pct)), up, h('p', { class: 'hint', text: 'للنسبة المئوية استخدم الحقل الثالث؛ للعرض/الارتفاع/الصندوق استخدم الأولين.' })),
        ui.card('القص والتدوير', ui.field('نسبة القص', crop), ui.field('موضع القص (من البداية إلى النهاية)', cpos), ui.field('التدوير', rot), ui.row(fh, fv)), ui.card('الإخراج', ui.field('الصيغة', fmt), ui.field(null, h('div', null, 'الجودة (JPEG/WEBP): ', qv), q), ui.field('لون الخلفية عند التحويل إلى JPEG', bg), btn), out);
      ui.task(btn, out, async t => {
        const fs = f.files(); if (!fs.length) throw new Error('اختر صورة واحدة على الأقل'); if (!/^#[0-9a-f]{6}$/i.test(bg.value)) throw new Error('لون الخلفية بصيغة #RRGGBB');
        if (['image/webp', 'image/jpeg'].includes(fmt.value) && !(await supports(fmt.value))) throw new Error('هذا النظام لا يدعم الترميز إلى ' + fmt.value);
        const o = { resize: resize.value, w: +w.value || 0, h: +hh.value || 0, pct: +pct.value || 0, upscale: up.input.checked, crop: crop.value, cropPos: +cpos.value, rotate: +rot.value, flipH: fh.input.checked, flipV: fv.input.checked, format: fmt.value, quality: +q.value, bg: bg.value };
        if (['width', 'height', 'fit', 'exact'].includes(o.resize) && !(o.w || o.h)) throw new Error('أدخل العرض أو الارتفاع');
        for (let i = 0; i < fs.length; i++) { t.check(); t.progress(i / fs.length * 100, fs[i].name); try { const r = await processImage(fs[i], o); const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[r.mime]; const card = ui.card(fs[i].name, ui.kv([['الأبعاد', r.srcW + '×' + r.srcH + ' ← ' + r.w + '×' + r.h], ['الحجم', OF.fmt.bytes(fs[i].size) + ' ← ' + OF.fmt.bytes(r.blob.size)]])); card.appendChild(ui.saveRow(OF.baseOf(fs[i].name) + '_edit.' + ext, r.blob, { preview: true })); out.add(card); } catch (e) { out.error(fs[i].name + ': ' + e.message); } await OF.tick(); }
      }, { cancelable: true });
    },
  };

  /* ───────────── استوديو الألوان ───────────── */
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  function parseColor(s) {
    s = String(s || '').trim(); if (!s) throw new Error('أدخل لوناً');
    let m = /^#?([0-9a-f]{3,8})$/i.exec(s);
    if (m && [3, 4, 6, 8].includes(m[1].length)) { let x = m[1]; if (x.length <= 4) x = x.split('').map(c => c + c).join(''); return { r: parseInt(x.slice(0, 2), 16), g: parseInt(x.slice(2, 4), 16), b: parseInt(x.slice(4, 6), 16), a: x.length === 8 ? parseInt(x.slice(6, 8), 16) / 255 : 1 }; }
    if ((m = /^rgba?\(\s*(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)(?:[ ,/]+(\d*\.?\d+%?))?\s*\)$/i.exec(s))) return { r: clamp(Math.round(+m[1]), 0, 255), g: clamp(Math.round(+m[2]), 0, 255), b: clamp(Math.round(+m[3]), 0, 255), a: m[4] == null ? 1 : (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]) };
    if ((m = /^hsla?\(\s*(-?\d+(?:\.\d+)?)(?:deg)?[ ,]+(\d+(?:\.\d+)?)%[ ,]+(\d+(?:\.\d+)?)%(?:[ ,/]+(\d*\.?\d+%?))?\s*\)$/i.exec(s))) { const c = hslToRgb(+m[1], +m[2], +m[3]); c.a = m[4] == null ? 1 : (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]); return c; }
    const ctx = document.createElement('canvas').getContext('2d'); ctx.fillStyle = '#010203'; ctx.fillStyle = s; const v = ctx.fillStyle; if (v === '#010203' && !/^#?010203$/.test(s)) throw new Error('لون غير مفهوم: ' + s); return parseColor(v);
  }
  function hslToRgb(hh, s, l) { hh = ((hh % 360) + 360) % 360; s /= 100; l /= 100; const k = n => (n + hh / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255), a: 1 }; }
  function rgbToHsl({ r, g, b }) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let hh = 0, s = 0; const l = (mx + mn) / 2; if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hh *= 60; } return { h: Math.round(hh), s: Math.round(s * 100), l: Math.round(l * 100) }; }
  const toHex = c => '#' + [c.r, c.g, c.b].map(x => clamp(Math.round(x), 0, 255).toString(16).padStart(2, '0')).join('');
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hslHex = (hh, s, l) => toHex(hslToRgb(hh, clamp(s, 0, 100), clamp(l, 0, 100)));
  const sw = (hex) => h('div', { class: 'saverow' }, h('div', { class: 'swatch', style: { background: hex } }), h('span', { class: 'nm mono', text: hex.toUpperCase() }), ui.copyBtn(() => hex.toUpperCase()));
  function medianCut(px, k) { // px: [[r,g,b,count]]
    let boxes = [px.slice()]; while (boxes.length < k) { let bi = -1, best = 0; boxes.forEach((b, i) => { if (b.length < 2) return; const rng = [0, 1, 2].map(c => Math.max(...b.map(p => p[c])) - Math.min(...b.map(p => p[c]))); const sc = Math.max(...rng) * b.reduce((a, p) => a + p[3], 0); if (sc > best) { best = sc; bi = i; } }); if (bi < 0) break; const b = boxes[bi]; const rng = [0, 1, 2].map(c => Math.max(...b.map(p => p[c])) - Math.min(...b.map(p => p[c]))); const ch = rng.indexOf(Math.max(...rng)); b.sort((x, y) => x[ch] - y[ch]); const tot = b.reduce((a, p) => a + p[3], 0); let acc = 0, cut = 1; for (let i = 0; i < b.length - 1; i++) { acc += b[i][3]; if (acc >= tot / 2) { cut = i + 1; break; } } boxes.splice(bi, 1, b.slice(0, cut), b.slice(cut)); }
    return boxes.map(b => { const n = b.reduce((a, p) => a + p[3], 0); return { r: Math.round(b.reduce((a, p) => a + p[0] * p[3], 0) / n), g: Math.round(b.reduce((a, p) => a + p[1] * p[3], 0) / n), b: Math.round(b.reduce((a, p) => a + p[2] * p[3], 0) / n), n }; }).sort((x, y) => y.n - x.n);
  }
  T['color-studio'] = {
    parseColor, contrast, medianCut,
    render(box) {
      OF.clear(box);
      box.appendChild(ui.tabs([
        { id: 'conv', label: 'محوّل', render(p) {
          const inp = ui.input({ value: '#ff8a3d', dir: 'ltr', code: true, placeholder: '#ff8a3d | rgb(255,138,61) | hsl(24,100%,62%) | orange' }); const pick = h('input', { type: 'color', value: '#ff8a3d', style: { width: '100%', height: '46px' } }); const out = ui.out();
          const show = () => { out.clear(); try { const c = parseColor(inp.value); const hs = rgbToHsl(c); const k = 1 - Math.max(c.r, c.g, c.b) / 255; const cm = k === 1 ? [0, 0, 0] : [(1 - c.r / 255 - k) / (1 - k), (1 - c.g / 255 - k) / (1 - k), (1 - c.b / 255 - k) / (1 - k)]; pick.value = toHex(c);
            out.add(h('div', { class: 'swatch', style: { width: '100%', height: '70px', background: 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + c.a + ')' } }));
            const rows = [['HEX', toHex(c).toUpperCase() + (c.a < 1 ? Math.round(c.a * 255).toString(16).padStart(2, '0').toUpperCase() : '')], ['RGB', 'rgb(' + c.r + ', ' + c.g + ', ' + c.b + ')' + (c.a < 1 ? ' — ألفا ' + c.a.toFixed(2) : '')], ['HSL', 'hsl(' + hs.h + ', ' + hs.s + '%, ' + hs.l + '%)'], ['CMYK (تقريبي)', cm.map(v => Math.round(v * 100) + '%').concat(Math.round(k * 100) + '%').join(' / ')], ['سطوع نسبي', lum(c).toFixed(3)]];
            out.add(ui.kv(rows.map(([a, b]) => [a, h('span', { class: 'row' }, h('span', { class: 'mono', text: b }), ui.copyBtn(() => b))]))); } catch (e) { out.error(e.message); } };
          inp.addEventListener('input', show); pick.addEventListener('input', () => { inp.value = pick.value; show(); }); p.append(ui.card('', ui.field('اللون', inp), pick), out); show();
        } },
        { id: 'harm', label: 'لوحة متناسقة', render(p) {
          const inp = ui.input({ value: '#ff8a3d', dir: 'ltr', code: true }); const res = h('div'); const out = ui.out();
          const gen = () => { out.clear(); OF.clear(res); try { const c = parseColor(inp.value), hs = rgbToHsl(c); const sets = { 'مكمّل': [0, 180], 'متجاور': [-30, 0, 30], 'ثلاثي': [0, 120, 240], 'رباعي': [0, 90, 180, 270], 'مكمّل مجزأ': [0, 150, 210] };
            Object.entries(sets).forEach(([n, a]) => res.appendChild(ui.card(n, ...a.map(d => sw(hslHex(hs.h + d, hs.s, hs.l)))))); res.appendChild(ui.card('تدرجات أحادية', ...[90, 75, 60, 45, 30, 15].map(l => sw(hslHex(hs.h, hs.s, l))))); } catch (e) { out.error(e.message); } };
          inp.addEventListener('input', gen); p.append(ui.card('', ui.field('اللون الأساسي', inp)), out, res); gen();
        } },
        { id: 'img', label: 'من صورة', render(p) {
          const f = ui.files({ accept: 'image/*', exts: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'], mimes: ['image/'], label: 'اختر صورة', maxMB: 40 }); const k = ui.input({ type: 'number', value: 6, min: 2, max: 16 }); const out = ui.out(); const btn = ui.btn('استخرج الألوان', null, { kind: 'primary' });
          p.append(ui.card('', f, ui.field('عدد الألوان', k), btn), out);
          ui.task(btn, out, async () => { const file = f.first(); if (!file) throw new Error('اختر صورة'); const n = clamp(Math.floor(+k.value) || 6, 2, 16); const img = await OF.loadImage(file); const s = Math.min(1, 120 / Math.max(img.naturalWidth, img.naturalHeight)); const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s)); const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height); const d = g.getImageData(0, 0, c.width, c.height).data; const hist = new Map();
            for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 128) continue; const key = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3); hist.set(key, (hist.get(key) || 0) + 1); }
            const px = [...hist].map(([key, cnt]) => [((key >> 10) & 31) * 8 + 4, ((key >> 5) & 31) * 8 + 4, (key & 31) * 8 + 4, cnt]); if (!px.length) throw new Error('الصورة شفافة بالكامل'); const pal = medianCut(px, n); const tot = pal.reduce((a, x) => a + x.n, 0);
            pal.forEach(x => { const hx = toHex(x); out.add(h('div', { class: 'saverow' }, h('div', { class: 'swatch', style: { background: hx } }), h('span', { class: 'nm mono', text: hx.toUpperCase() + '  ' + Math.round(x.n / tot * 100) + '%' }), ui.copyBtn(() => hx.toUpperCase()))); }); });
        } },
        { id: 'contrast', label: 'التباين', render(p) {
          const a = ui.input({ value: '#ffffff', dir: 'ltr', code: true }), b = ui.input({ value: '#1c1f27', dir: 'ltr', code: true }); const out = ui.out();
          const go = () => { out.clear(); try { const x = parseColor(a.value), y = parseColor(b.value); const r = contrast(x, y); out.add(h('div', { class: 'card', style: { background: toHex(y), color: toHex(x), fontSize: '1.2rem', fontWeight: 700 } }, 'نص تجريبي Sample 123'));
            const ok = v => (v ? '✔ ينجح' : '✘ يفشل'); out.kv([['نسبة التباين', r.toFixed(2) + ' : 1'], ['AA — نص عادي (4.5)', ok(r >= 4.5)], ['AA — نص كبير (3)', ok(r >= 3)], ['AAA — نص عادي (7)', ok(r >= 7)], ['AAA — نص كبير (4.5)', ok(r >= 4.5)]]); } catch (e) { out.error(e.message); } };
          [a, b].forEach(e => e.addEventListener('input', go)); p.append(ui.card('', ui.field('لون النص', a), ui.field('لون الخلفية', b)), out); go();
        } },
        { id: 'bg', label: 'خلفية متدرجة', render(p) {
          const kind = ui.select([['solid', 'لون ثابت'], ['linear', 'تدرج خطي'], ['radial', 'تدرج دائري']], 'linear'); const c1 = ui.input({ value: '#ff8a3d', dir: 'ltr' }), c2 = ui.input({ value: '#1c1f27', dir: 'ltr' }), c3 = ui.input({ value: '', placeholder: 'لون ثالث (اختياري)', dir: 'ltr' }); const ang = ui.input({ type: 'number', value: 135 }); const W = ui.input({ type: 'number', value: 1080 }), H = ui.input({ type: 'number', value: 1920 }); const prev = h('div'); const out = ui.out(); let cv = null;
          p.append(ui.card('', ui.field('النوع', kind), ui.row(h('div', { class: 'grow' }, ui.field('لون 1', c1)), h('div', { class: 'grow' }, ui.field('لون 2', c2)), h('div', { class: 'grow' }, ui.field('لون 3', c3))), ui.field('الزاوية (خطي)', ang), ui.row(h('div', { class: 'grow' }, ui.field('العرض', W)), h('div', { class: 'grow' }, ui.field('الارتفاع', H))),
            ui.btn('أنشئ', () => { out.clear(); OF.clear(prev); try { const w = clamp(Math.floor(+W.value), 16, 4096), hh = clamp(Math.floor(+H.value), 16, 4096); if (!(w > 0 && hh > 0)) throw new Error('أبعاد غير صالحة'); const cols = [c1.value, c2.value, c3.value].filter(x => x.trim()).map(x => toHex(parseColor(x))); const c = document.createElement('canvas'); c.width = w; c.height = hh; const g = c.getContext('2d'); let fill;
              if (kind.value === 'solid') fill = cols[0]; else if (kind.value === 'linear') { const a = ((+ang.value || 0) - 90) * Math.PI / 180, cx = w / 2, cy = hh / 2, len = Math.abs(w * Math.cos(a)) + Math.abs(hh * Math.sin(a)); fill = g.createLinearGradient(cx - Math.cos(a) * len / 2, cy - Math.sin(a) * len / 2, cx + Math.cos(a) * len / 2, cy + Math.sin(a) * len / 2); } else fill = g.createRadialGradient(w / 2, hh / 2, 0, w / 2, hh / 2, Math.hypot(w, hh) / 2);
              if (typeof fill !== 'string') cols.forEach((col, i) => fill.addColorStop(cols.length === 1 ? 0 : i / (cols.length - 1), col)); g.fillStyle = fill; g.fillRect(0, 0, w, hh); c.style.cssText = 'max-width:100%;max-height:320px;border-radius:8px'; prev.appendChild(c); cv = c; out.ok('تم الإنشاء ' + w + '×' + hh); } catch (e) { out.error(e.message); } }, { kind: 'primary' })), out, ui.card('المعاينة', prev, ui.btn('حفظ PNG', async () => { if (!cv) return ui.toast('أنشئ أولاً', 'error'); await OF.save(await OF.canvasBlob(cv, 'image/png'), 'background.png', 'image/png'); }, { small: true, icon: 'save' })));
        } },
      ]));
    },
  };

  /* ───────────── SVG ───────────── */
  function svgInfo(src) {
    const d = new DOMParser().parseFromString(src, 'image/svg+xml'); const err = d.getElementsByTagName('parsererror')[0]; if (err) throw new Error('SVG غير صالح: ' + err.textContent.replace(/\s+/g, ' ').slice(0, 180));
    const r = d.documentElement; if (r.localName !== 'svg') throw new Error('العنصر الجذر ليس <svg>'); return { doc: d, root: r, w: r.getAttribute('width'), h: r.getAttribute('height'), vb: r.getAttribute('viewBox'), n: d.getElementsByTagName('*').length };
  }
  function svgMinify(src) {
    let s = src.replace(/<\?xml[\s\S]*?\?>/g, '').replace(/<!DOCTYPE[\s\S]*?>/gi, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<(metadata|sodipodi:namedview)[\s\S]*?<\/\1>/gi, '').replace(/<sodipodi:namedview[^>]*\/>/gi, '');
    s = s.replace(/\s(?:inkscape|sodipodi):[\w-]+="[^"]*"/g, '').replace(/\sxmlns:(?:inkscape|sodipodi|dc|cc|rdf)="[^"]*"/g, '');
    return s.replace(/>\s+</g, '><').replace(/\s{2,}/g, ' ').trim();
  }
  T['svg-workshop'] = {
    svgInfo, svgMinify,
    render(box) {
      const f = ui.files({ accept: '.svg,image/svg+xml', exts: ['svg'], mimes: ['image/svg'], label: 'افتح ملف SVG (اختياري)', maxMB: 10 }); const inp = ui.area({ rows: 9, code: true, placeholder: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">…</svg>' }); const out = ui.out(); const prev = h('div'); const px = ui.input({ type: 'number', value: 512, min: 16, max: 4096 });
      f.querySelector('input').addEventListener('change', () => setTimeout(async () => { const x = f.first(); if (x) inp.value = await OF.readText(x); }, 80));
      const clean = () => DOMPurify.sanitize(inp.value, { USE_PROFILES: { svg: true, svgFilters: true } });
      const check = () => { out.clear(); OF.clear(prev); if (!inp.value.trim()) { out.warn('أدخل كود SVG'); return null; } try { const i = svgInfo(inp.value); out.ok('SVG صالح'); out.kv([['العرض × الارتفاع', (i.w || '—') + ' × ' + (i.h || '—')], ['viewBox', i.vb || '—'], ['عدد العناصر', i.n], ['الحجم', OF.fmt.bytes(new Blob([inp.value]).size)]]); const url = URL.createObjectURL(new Blob([clean()], { type: 'image/svg+xml' })); prev.appendChild(h('img', { class: 'imgprev', src: url, alt: 'معاينة SVG' })); const bad = /<script|on\w+\s*=/i.test(inp.value); if (bad) out.warn('الكود يحتوي سكربتات/معالجات أحداث: أُزيلت من المعاينة ولن تُنفَّذ.'); return i; } catch (e) { out.error(e.message); return null; } };
      const png = ui.btn('PNG', async () => { const i = check(); if (!i) return; try { const size = clamp(Math.floor(+px.value) || 512, 16, 4096); let ratio = 1; if (i.vb) { const v = i.vb.split(/[ ,]+/).map(Number); if (v[2] > 0 && v[3] > 0) ratio = v[3] / v[2]; } else if (parseFloat(i.w) > 0 && parseFloat(i.h) > 0) ratio = parseFloat(i.h) / parseFloat(i.w); const url = URL.createObjectURL(new Blob([clean()], { type: 'image/svg+xml' })); const img = await OF.loadImage(url); const c = document.createElement('canvas'); c.width = size; c.height = Math.max(1, Math.round(size * ratio)); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); out.add(ui.saveRow('image.png', await OF.canvasBlob(c, 'image/png'), { preview: true })); } catch (e) { out.error('تعذر التحويل: ' + e.message); } }, { icon: 'save' });
      box.append(ui.card('', f, inp, ui.row(ui.btn('تحقق وعاين', check, { kind: 'primary' }), ui.btn('صغّر', () => { if (!inp.value.trim()) return; const before = inp.value.length; inp.value = svgMinify(inp.value); out.clear(); out.ok('التصغير: ' + before + ' ← ' + inp.value.length + ' حرفاً'); }), ui.copyBtn(() => inp.value), ui.btn('حفظ SVG', () => inp.value ? OF.save(new Blob([inp.value], { type: 'image/svg+xml' }), 'image.svg', 'image/svg+xml') : ui.toast('لا يوجد كود', 'error'), { small: true, icon: 'save' }))), out, ui.card('المعاينة', prev), ui.card('تحويل إلى PNG', ui.field('العرض px', px), png));
    },
  };

  /* ───────────── GIF: محرك ترميز مكتوب داخلياً ───────────── */
  function quantize(rgba, maxColors) {
    const hist = new Map(); for (let i = 0; i < rgba.length; i += 4) { const key = ((rgba[i] >> 3) << 10) | ((rgba[i + 1] >> 3) << 5) | (rgba[i + 2] >> 3); hist.set(key, (hist.get(key) || 0) + 1); }
    const px = [...hist].map(([k, c]) => [((k >> 10) & 31) * 8 + 4, ((k >> 5) & 31) * 8 + 4, (k & 31) * 8 + 4, c]); const pal = medianCut(px, Math.min(maxColors, px.length)).map(c => [c.r, c.g, c.b]);
    const cache = new Map(); const idx = new Uint8Array(rgba.length / 4);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j++) { const key = ((rgba[i] >> 3) << 10) | ((rgba[i + 1] >> 3) << 5) | (rgba[i + 2] >> 3); let v = cache.get(key); if (v === undefined) { let best = 0, bd = Infinity; const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2]; for (let k = 0; k < pal.length; k++) { const dr = pal[k][0] - r, dg = pal[k][1] - g, db = pal[k][2] - b; const d = dr * dr * 2 + dg * dg * 4 + db * db * 3; if (d < bd) { bd = d; best = k; } } v = best; cache.set(key, v); } idx[j] = v; }
    return { pal, idx };
  }
  function lzwEncode(idx, minCode) {
    const clear = 1 << minCode, eoi = clear + 1; let codeSize = minCode + 1, next = eoi + 2 - 1; next = eoi + 1; const bytes = []; let cur = 0, bits = 0; const emit = (c) => { cur |= c << bits; bits += codeSize; while (bits >= 8) { bytes.push(cur & 255); cur >>>= 8; bits -= 8; } };
    let table = new Map(); emit(clear); let prefix = idx[0];
    for (let i = 1; i < idx.length; i++) { const k = idx[i], key = prefix * 256 + k; const v = table.get(key); if (v === undefined) { emit(prefix); if (next === 4096) { emit(clear); table = new Map(); next = eoi + 1; codeSize = minCode + 1; } else { if (next >= (1 << codeSize)) codeSize++; table.set(key, next++); } prefix = k; } else prefix = v; }
    emit(prefix); emit(eoi); if (bits > 0) bytes.push(cur & 255); return bytes;
  }
  function gifEncode(frames, w, hgt, opt) {
    const out = []; const w16 = v => out.push(v & 255, (v >> 8) & 255); '47494638396'.split(''); out.push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61); w16(w); w16(hgt); out.push(0x70, 0, 0);
    out.push(0x21, 0xFF, 0x0B, ...'NETSCAPE2.0'.split('').map(c => c.charCodeAt(0)), 3, 1); w16(opt.loop || 0); out.push(0);
    frames.forEach(fr => { const { pal, idx } = quantize(fr, opt.colors || 256); let bitsN = 1; while ((1 << bitsN) < pal.length) bitsN++; const size = 1 << bitsN; while (pal.length < size) pal.push([0, 0, 0]);
      out.push(0x21, 0xF9, 4, 0x04); w16(Math.max(2, Math.round((opt.delayMs || 500) / 10))); out.push(0, 0); out.push(0x2C); w16(0); w16(0); w16(w); w16(hgt); out.push(0x80 | (bitsN - 1)); pal.forEach(c => out.push(c[0], c[1], c[2]));
      const minCode = Math.max(2, bitsN); out.push(minCode); const data = lzwEncode(idx, minCode); for (let i = 0; i < data.length; i += 255) { const n = Math.min(255, data.length - i); out.push(n); for (let j = 0; j < n; j++) out.push(data[i + j]); } out.push(0); });
    out.push(0x3B); return new Uint8Array(out);
  }
  T['gif-studio'] = {
    gifEncode, quantize, lzwEncode,
    render(box) {
      const splitCard = () => {
        const gf = ui.files({ accept: 'image/gif,.gif', label: 'اختر ملف GIF لتفكيكه', exts: ['gif'], mimes: ['image/gif'], maxMB: 50 }); const so = ui.out(); const sb = ui.btn('فكّ إلى إطارات PNG (ZIP)', null, { kind: 'primary' });
        ui.task(sb, so, async t => { const f = gf.first(); if (!f) throw new Error('اختر ملف GIF'); t.progress(5, 'فك الترميز…'); await OF.tick(); let d; try { d = OF.gifdec.decode(new Uint8Array(await f.arrayBuffer())); } catch (e) { throw new Error('تعذر فك GIF: ' + e.message); }
          const z = new JSZip(); const pad = Math.max(3, String(d.frames.length).length); const c = document.createElement('canvas'); c.width = d.width; c.height = d.height; const g = c.getContext('2d'); const meta = [];
          for (let i = 0; i < d.frames.length; i++) { t.check(); t.progress(10 + i / d.frames.length * 80, 'إطار ' + (i + 1) + '/' + d.frames.length); g.putImageData(new ImageData(d.frames[i].rgba, d.width, d.height), 0, 0); const b = await new Promise(r => c.toBlob(r, 'image/png')); z.file(String(i + 1).padStart(pad, '0') + '.png', b, { compression: 'STORE' }); meta.push({ frame: i + 1, delay_ms: d.frames[i].delay }); }
          z.file('frames.json', JSON.stringify({ width: d.width, height: d.height, loop: d.loop, frames: meta }, null, 2)); const blob = await z.generateAsync({ type: 'blob', compression: 'STORE' });
          so.ok(d.frames.length + ' إطار — ' + d.width + '×' + d.height + ' — مدة ' + OF.fmt.dur(d.frames.reduce((a, x) => a + x.delay, 0) / 1000)); so.add(ui.saveRow(OF.baseOf(f.name) + '_frames.zip', blob)); }, { cancelable: true });
        return ui.card('تفكيك GIF إلى إطارات', gf, sb, so);
      };
      let files = [], pick; const list = h('ul', { class: 'flist' });
      const draw = () => { OF.clear(list); files.forEach((x, i) => list.appendChild(h('li', null, h('span', { class: 'nm', text: x.name }), ui.btn('▲', () => { if (i) { [files[i - 1], files[i]] = [files[i], files[i - 1]]; draw(); } }, { small: true }), ui.btn('▼', () => { if (i < files.length - 1) { [files[i + 1], files[i]] = [files[i], files[i + 1]]; draw(); } }, { small: true }), ui.btn('✕', () => { files.splice(i, 1); pick.set(files); draw(); }, { small: true, kind: 'danger' })))); };
      pick = ui.files({ accept: 'image/*', multiple: true, label: 'اختر الصور (إطارات GIF بالترتيب)', exts: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'], mimes: ['image/'], maxMB: 20, onChange: fs => { const known = new Set(files); fs.forEach(x => { if (!known.has(x)) files.push(x); }); for (let i = files.length - 1; i >= 0; i--) if (!fs.includes(files[i])) files.splice(i, 1); draw(); } }); pick.querySelector('.flist').style.display = 'none';
      const wd = ui.input({ type: 'number', value: 480, min: 16, max: 1080 }); const delay = ui.input({ type: 'number', value: 500, min: 20, max: 10000 }); const colors = ui.select([['256', '256 لون'], ['128', '128'], ['64', '64'], ['32', '32']], '256'); const loop = ui.check('تكرار لا نهائي', true); const allGif = ui.check('عند إضافة ملف GIF متحرك: استخدم كل إطاراته', true); const bg = ui.input({ value: '#ffffff', dir: 'ltr' }); const out = ui.out(); const btn = ui.btn('أنشئ GIF', null, { kind: 'primary' });
      box.append(ui.card('الإطارات', pick, list), ui.card('الإعدادات', ui.field('عرض الـGIF px', wd, 'الارتفاع يُحسب من أول صورة؛ باقي الصور تُوضع داخله مع هامش بلون الخلفية.'), ui.field('مدة كل إطار (ms)', delay), ui.field('الألوان', colors), ui.field('لون الخلفية', bg), loop, allGif, btn), out, splitCard());
      ui.task(btn, out, async t => {
        if (files.length < 1) throw new Error('اختر صورة واحدة على الأقل'); if (!/^#[0-9a-f]{6}$/i.test(bg.value)) throw new Error('لون الخلفية بصيغة #RRGGBB'); const W = clamp(Math.floor(+wd.value) || 480, 16, 1080); const first = await OF.loadImage(files[0]); const H = Math.max(1, Math.round(W * first.naturalHeight / first.naturalWidth)); if (W * H * files.length > 400e6) throw new Error('الحجم الإجمالي كبير جداً؛ قلّل العرض أو عدد الصور');
        const frames = []; for (let i = 0; i < files.length; i++) { t.check(); t.progress(i / files.length * 70, 'قراءة ' + files[i].name); if (allGif.input.checked && /gif$/i.test(files[i].type || files[i].name)) { let dg = null; try { dg = OF.gifdec.decode(new Uint8Array(await files[i].arrayBuffer()), { maxPixels: 200e6 }); } catch (e) { dg = null; } if (dg && dg.frames.length > 1) { for (const fr of dg.frames) { const sc = document.createElement('canvas'); sc.width = dg.width; sc.height = dg.height; sc.getContext('2d').putImageData(new ImageData(fr.rgba, dg.width, dg.height), 0, 0); const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.fillStyle = bg.value; g.fillRect(0, 0, W, H); const s = Math.min(W / dg.width, H / dg.height); g.imageSmoothingQuality = 'high'; g.drawImage(sc, (W - dg.width * s) / 2, (H - dg.height * s) / 2, dg.width * s, dg.height * s); frames.push(g.getImageData(0, 0, W, H)); } continue; } } const im = i === 0 ? first : await OF.loadImage(files[i]); const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.fillStyle = bg.value; g.fillRect(0, 0, W, H); const s = Math.min(W / im.naturalWidth, H / im.naturalHeight); const dw = im.naturalWidth * s, dh = im.naturalHeight * s; g.imageSmoothingQuality = 'high'; g.drawImage(im, (W - dw) / 2, (H - dh) / 2, dw, dh); frames.push(g.getImageData(0, 0, W, H).data); await OF.tick(); }
        t.progress(80, 'ترميز GIF…'); await OF.tick(); const bytes = gifEncode(frames, W, H, { delayMs: +delay.value || 500, loop: loop.input.checked ? 0 : 1, colors: +colors.value }); const blob = new Blob([bytes], { type: 'image/gif' });
        out.ok('تم إنشاء GIF: ' + W + '×' + H + ' — ' + files.length + ' إطار — ' + OF.fmt.bytes(blob.size)); if (files.length === 1) out.info('إطار واحد فقط: سيكون GIF ثابتاً.'); out.add(ui.saveRow('animation.gif', blob, { preview: true })); }, { cancelable: true });
    },
  };
})();
