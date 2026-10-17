/* OMNIFORGE core — أدوات مشتركة: DOM، واجهة، حفظ الملفات، شبكة، تحميل مكتبات */
(function () {
  'use strict';
  const OF = (window.OF = { version: '1.0.0', tools: {}, reg: [], cats: [] });

  /* ───────── تخزين محلي آمن (قد يفشل في بعض البيئات) ───────── */
  OF.store = {
    get(k, d) { try { const v = localStorage.getItem('of.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('of.' + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    clearAll() { try { Object.keys(localStorage).filter(k => k.startsWith('of.')).forEach(k => localStorage.removeItem(k)); } catch (e) { /* ignore */ } },
  };

  /* ───────── أيقونات (مسارات SVG بسيطة 24×24) ───────── */
  const ICONS = {
    home: 'M3 11l9-8 9 8M5 10v10h14V10',
    back: 'M9 6l6 6-6 6',            // السهم يُقلب في RTL بالـCSS
    search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-5-5',
    star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
    sun: 'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5',
    gear: 'M12 9a3 3 0 100 6 3 3 0 000-6zM19 12l2-1-1-3-2 .5-1.5-1.5.5-2-3-1-1 2h-2l-1-2-3 1 .5 2L6 8.5 4 8l-1 3 2 1v2l-2 1 1 3 2-.5L7.5 19l-.5 2 3 1 1-2h2l1 2 3-1-.5-2 1.5-1.5 2 .5 1-3-2-1z',
    file: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6',
    pdf: 'M6 3h8l4 4v14H6zM14 3v4h4M8.5 17v-4h1.7a1.3 1.3 0 010 2.6H8.5',
    archive: 'M4 7h16v13H4zM3 4h18v3H3zM10 11h4',
    image: 'M4 5h16v14H4zM8.5 10a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM4 17l5-5 4 4 3-3 4 4',
    palette: 'M12 3a9 9 0 100 18c1.4 0 2-1 1.5-2-.6-1.2.2-2.5 1.6-2.5H17a4 4 0 004-4c0-5-4-9.5-9-9.5zM7.5 11h.01M10 7.5h.01M14.5 7.5h.01',
    svg: 'M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 6l-3 12',
    gif: 'M4 5h16v14H4zM9 10h-2v4h2v-2M12 10v4M15 14v-4h2.5',
    video: 'M3 6h12v12H3zM15 10l6-3v10l-6-3',
    audio: 'M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2',
    subtitle: 'M3 5h18v14H3zM7 12h4M13 12h4M7 15h2M12 15h5',
    text: 'M5 6h14M12 6v13M9 19h6',
    diff: 'M7 4v16M17 4v16M3 8h8M13 16h8',
    code: 'M8 8l-4 4 4 4M16 8l4 4-4 4',
    key: 'M14 10a4 4 0 11-1.2 2.8L4 21v-3l2-1v-2l2-1 2.2-2.2A4 4 0 0114 10zM16.5 8.5h.01',
    lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 017 0v3',
    shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
    hash: 'M5 9h14M5 15h14M10 4L8 20M16 4l-2 16',
    globe: 'M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
    link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
    download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
    send: 'M4 12l16-8-6 16-3-7z',
    table: 'M3 5h18v14H3zM3 10h18M9 5v14M15 5v14',
    json: 'M8 4c-2 0-3 1-3 3v2c0 1-1 2-2 3 1 1 2 2 2 3v2c0 2 1 3 3 3M16 4c2 0 3 1 3 3v2c0 1 1 2 2 3-1 1-2 2-2 3v2c0 2-1 3-3 3',
    regex: 'M12 5v8M8.5 7l7 4M15.5 7l-7 4M6 19h.01',
    calc: 'M6 3h12v18H6zM9 7h6M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01',
    clock: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2',
    ruler: 'M3 16l13-13 5 5L8 21zM7 12l2 2M10 9l2 2M13 6l2 2',
    qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z',
    note: 'M5 4h14v16H5zM8 9h8M8 13h8M8 17h5',
    apk: 'M7 9a5 5 0 0110 0M5 9h14v9a2 2 0 01-2 2H7a2 2 0 01-2-2zM9 5L8 3M15 5l1-2M9.5 13h.01M14.5 13h.01',
    disk: 'M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 7v5c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5',
    font: 'M5 20L11 4h2l6 16M7.5 14h9',
    wifi: 'M3 9a14 14 0 0118 0M6 12.5a9.5 9.5 0 0112 0M9 16a5 5 0 016 0M12 19.5h.01',
    play: 'M8 5v14l11-7z',
    split: 'M12 3v18M5 8l-3 4 3 4M19 8l3 4-3 4',
    eraser: 'M4 16l9-9a2 2 0 013 0l3 3a2 2 0 010 3l-7 7H8zM9 21h11M7 11l6 6',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7zM12 9a3 3 0 100 6 3 3 0 000-6z',
    info: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v6M12 7.5h.01',
    x: 'M6 6l12 12M18 6L6 18',
    check: 'M5 12l5 5 9-10',
    plus: 'M12 5v14M5 12h14',
    trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
    copy: 'M9 9h11v11H9zM5 15V4h11',
    save: 'M5 4h12l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
    upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
    refresh: 'M20 12a8 8 0 11-2.3-5.7M20 4v5h-5',
    mic: 'M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3zM6 11a6 6 0 0012 0M12 17v4',
    doc: 'M6 3h12v18H6zM9 8h6M9 12h6M9 16h4',
    wand: 'M4 20L16 8M14 6l1-3 1 3 3 1-3 1-1 3-1-3-3-1z',
  };
  OF.icon = function (name) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'ic'); s.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', ICONS[name] || ICONS.file); s.appendChild(p);
    return s;
  };

  /* ───────── بناء DOM ───────── */
  const h = (OF.h = function (tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'on') for (const ev of Object.keys(v)) el.addEventListener(ev, v[ev]);
        else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected' || k === 'indeterminate') el[k] = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (let i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  });
  function append(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(x => append(el, x));
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
  OF.clear = el => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

  /* ───────── تنسيقات ───────── */
  OF.fmt = {
    bytes(n) {
      if (n == null || isNaN(n)) return '—';
      const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; n = +n;
      while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
      return (i === 0 ? n : n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2)) + ' ' + u[i];
    },
    dur(s) {
      if (!isFinite(s)) return '—';
      s = Math.max(0, s); const h_ = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s - h_ * 3600 - m * 60;
      return (h_ ? h_ + ':' : '') + String(m).padStart(h_ ? 2 : 1, '0') + ':' + sec.toFixed(1).padStart(4, '0');
    },
    hex: u8 => Array.from(u8, b => b.toString(16).padStart(2, '0')).join(''),
  };
  OF.norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[ً-ٰٟـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[̀-ͯ]/g, '');
  OF.sleep = ms => new Promise(r => setTimeout(r, ms));
  OF.tick = () => new Promise(r => setTimeout(r, 0)); // يترك المتصفح يرسم التقدم

  /* ───────── تحميل مكتبات محلية عند الحاجة فقط ───────── */
  const loaded = {};
  OF.load = function (src) {
    if (loaded[src]) return loaded[src];
    return (loaded[src] = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = src;
      s.onload = () => res(); s.onerror = () => { delete loaded[src]; rej(new Error('تعذر تحميل الملف: ' + src)); };
      document.head.appendChild(s);
    }));
  };
  OF.loadAll = async list => { for (const s of list || []) await OF.load(s); };

  /* ───────── واجهة المستخدم المشتركة ───────── */
  const ui = (OF.ui = {});

  ui.toast = function (msg, kind) {
    const box = document.getElementById('toasts'); if (!box) return;
    const t = h('div', { class: 'toast' + (kind === 'error' ? ' error' : ''), text: msg });
    box.appendChild(t); setTimeout(() => t.remove(), kind === 'error' ? 5200 : 2800);
  };

  ui.card = (title, ...kids) => h('section', { class: 'card' }, title ? h('h2', { text: title }) : null, ...kids);
  ui.field = (label, control, hint) => h('div', { class: 'field' }, label ? h('label', { text: label }) : null, control, hint ? h('div', { class: 'hint', text: hint }) : null);
  ui.row = (...kids) => h('div', { class: 'row' }, ...kids);
  ui.input = (o = {}) => { const e = h('input', { type: o.type || 'text', value: o.value != null ? String(o.value) : '', placeholder: o.placeholder, dir: o.dir || 'auto', class: o.code ? 'code' : null, min: o.min, max: o.max, step: o.step, inputmode: o.inputmode, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', accept: o.accept }); if (o.onInput) e.addEventListener('input', o.onInput); return e; };
  ui.area = (o = {}) => { const e = h('textarea', { placeholder: o.placeholder, class: o.code ? 'code' : null, dir: o.code ? 'ltr' : 'auto', rows: o.rows || 6, spellcheck: 'false', autocapitalize: 'off' }); if (o.value != null) e.value = o.value; if (o.readonly) e.readOnly = true; return e; };
  ui.select = (opts, value) => {
    const s = h('select');
    opts.forEach(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; s.appendChild(h('option', { value: v, text: l, selected: v === value })); });
    if (value != null) s.value = value; return s;
  };
  ui.check = (label, checked) => { const i = h('input', { type: 'checkbox', checked: !!checked }); const l = h('label', { class: 'check' }, i, h('span', { text: label })); l.input = i; return l; };
  ui.btn = (label, onClick, o = {}) => {
    const b = h('button', { type: 'button', class: 'btn' + (o.kind ? ' ' + o.kind : '') + (o.small ? ' sm' : '') }, o.icon ? OF.icon(o.icon) : null, label);
    if (onClick) b.addEventListener('click', onClick); return b;
  };
  ui.copy = async text => {
    try { await navigator.clipboard.writeText(text); ui.toast('تم النسخ'); return true; }
    catch (e) {
      try { const t = h('textarea', { style: { position: 'fixed', opacity: 0 } }); t.value = text; document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); ui.toast(ok ? 'تم النسخ' : 'تعذر النسخ', ok ? '' : 'error'); return ok; }
      catch (e2) { ui.toast('تعذر النسخ', 'error'); return false; }
    }
  };
  ui.copyBtn = (getText, label) => ui.btn(label || 'نسخ', () => { const t = getText(); if (!t) return ui.toast('لا يوجد ما يُنسخ', 'error'); ui.copy(t); }, { icon: 'copy', small: true });

  ui.badge = (status, label) => {
    const names = { ready: 'جاهزة', partial: 'جزئية', 'requires-service': 'تحتاج خدمة', unavailable: 'غير متاحة', mine: 'من أدواتي' };
    return h('span', { class: 'badge b-' + status, text: label || names[status] || status });
  };

  /* منطقة الرسائل والنتائج */
  ui.out = function () {
    const box = h('div', { class: 'out', role: 'status', 'aria-live': 'polite' });
    const msg = (kind, text) => { const m = h('div', { class: 'msg ' + kind }, OF.icon(kind === 'ok' ? 'check' : kind === 'error' ? 'x' : 'info'), h('span', { text })); box.appendChild(m); return m; };
    box.clear = () => OF.clear(box);
    box.ok = t => msg('ok', t); box.warn = t => msg('warn', t); box.error = t => msg('error', t); box.info = t => msg('info', t);
    box.add = n => { box.appendChild(n); return n; };
    box.pre = (text, o = {}) => { const p = h('pre', { class: 'res' }, text); if (o.rtl) p.style.direction = 'rtl', p.style.textAlign = 'start'; box.appendChild(p); return p; };
    box.kv = rows => box.add(ui.kv(rows));
    return box;
  };
  ui.kv = rows => h('table', { class: 'kv' }, h('tbody', null, rows.filter(r => r && r[1] != null && r[1] !== '').map(([k, v]) => h('tr', null, h('th', { text: k }), h('td', null, v instanceof Node ? v : String(v))))));

  ui.progress = function () {
    const bar = h('i'); const wrap = h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100 }, bar);
    const lab = h('div', { class: 'plabel' });
    const el = h('div', { style: { display: 'none' } }, wrap, lab);
    el.set = (pct, label) => { el.style.display = ''; if (pct == null) { wrap.classList.add('indet'); } else { wrap.classList.remove('indet'); bar.style.width = Math.max(0, Math.min(100, pct)) + '%'; wrap.setAttribute('aria-valuenow', Math.round(pct)); } lab.textContent = label || ''; };
    el.hide = () => { el.style.display = 'none'; bar.style.width = '0'; wrap.classList.remove('indet'); };
    return el;
  };

  /* تشغيل مهمة طويلة: يمنع التكرار، يعرض التقدم الحقيقي، ويدعم الإيقاف */
  ui.task = function (btn, out, fn, o = {}) {
    const bar = ui.progress(); const stop = ui.btn('إيقاف', null, { kind: 'danger', small: true, icon: 'x' }); stop.style.display = 'none';
    const holder = h('div', null, bar, stop);
    if (btn.parentNode) btn.parentNode.insertBefore(holder, btn.nextSibling); else out.parentNode && out.parentNode.insertBefore(holder, out);
    let running = false;
    btn.addEventListener('click', async () => {
      if (running) return; running = true; btn.disabled = true;
      const t = { cancelled: false, progress: (p, l) => bar.set(p, l), check() { if (t.cancelled) { const e = new Error('أُوقفت العملية'); e.name = 'AbortError'; throw e; } } };
      stop.onclick = () => { t.cancelled = true; stop.disabled = true; }; stop.disabled = false;
      if (o.cancelable) stop.style.display = '';
      out.clear();
      try { await fn(t); }
      catch (e) { if (e && e.name === 'AbortError') out.warn(e.message || 'أُوقفت العملية'); else { console.error(e); out.error((e && e.message) || String(e)); } }
      finally { running = false; btn.disabled = false; bar.hide(); stop.style.display = 'none'; }
    });
    return holder;
  };

  /* حفظ/تنزيل ملف: يستخدم بلاجن OmniSave الأصلي في APK، وإلا تنزيل المتصفح */
  OF.native = () => { try { return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.OmniSave || null; } catch (e) { return null; } };
  OF.isNative = () => { try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); } catch (e) { return false; } };
  OF.toBlob = (data, mime) => data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
  OF.b64 = async blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
  OF.save = async function (data, name, mime) {
    const blob = OF.toBlob(data, mime); name = String(name || 'file').replace(/[\\/:*?"<>|]+/g, '_');
    const nat = OF.native();
    if (nat) {
      const { id } = await nat.begin({ name, mime: blob.type || mime || 'application/octet-stream' });
      try {
        const CH = 768 * 1024;
        for (let o = 0; o < blob.size; o += CH) await nat.chunk({ id, data: await OF.b64(blob.slice(o, o + CH)) });
        const r = await nat.finish({ id });
        ui.toast('تم الحفظ: ' + (r.path || 'التنزيلات/OMNIFORGE'));
        return { where: 'native', path: r.path || '' };
      } catch (e) { try { await nat.abort({ id }); } catch (e2) { /* ignore */ } throw new Error('فشل الحفظ: ' + (e.message || e)); }
    }
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name, style: { display: 'none' } }); document.body.appendChild(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
    ui.toast('بدأ التنزيل: ' + name);
    return { where: 'browser', path: name };
  };
  /* صف نتيجة ملف: اسم + حجم + زر حفظ (+ معاينة اختيارية) */
  ui.saveRow = function (name, blob, o = {}) {
    const row = h('div', { class: 'saverow' }, h('span', { class: 'nm', text: name, title: name }), h('span', { class: 'sz muted small', text: OF.fmt.bytes(blob.size) }));
    row.appendChild(ui.btn('حفظ', async () => { try { await OF.save(blob, name, blob.type); } catch (e) { ui.toast(e.message, 'error'); } }, { icon: 'save', small: true, kind: 'primary' }));
    if (o.preview && /^image\//.test(blob.type)) {
      const url = URL.createObjectURL(blob); let img = null;
      row.appendChild(ui.btn('معاينة', () => { if (img) { img.remove(); img = null; return; } img = h('img', { class: 'imgprev', src: url, alt: name }); row.after(img); }, { small: true, icon: 'eye' }));
    }
    return row;
  };

  /* ملفات الإدخال */
  ui.files = function (o = {}) {
    let files = [];
    const input = h('input', { type: 'file', accept: o.accept, multiple: !!o.multiple });
    if (o.directory) { input.setAttribute('webkitdirectory', ''); }
    const drop = h('label', { class: 'drop' }, OF.icon('upload'), h('strong', { text: o.label || (o.multiple ? 'اختر الملفات' : 'اختر ملفاً') }), h('span', { class: 'small', text: o.hint || '' }), input);
    const list = h('ul', { class: 'flist' });
    const el = h('div', null, drop, list);
    const maxBytes = (o.maxMB || 300) * 1048576;
    function render() {
      OF.clear(list);
      files.forEach((f, i) => list.appendChild(h('li', null, h('span', { class: 'nm', text: f.webkitRelativePath || f.name, title: f.name }), h('span', { class: 'sz', text: OF.fmt.bytes(f.size) }),
        h('button', { type: 'button', class: 'iconbtn', 'aria-label': 'إزالة', style: { width: '32px', height: '32px' }, on: { click: () => { files.splice(i, 1); render(); change(); } } }, OF.icon('x')))));
    }
    function change() { if (o.onChange) o.onChange(files.slice()); }
    function accept(list_) {
      const errs = []; const ok = [];
      for (const f of list_) {
        if (f.size > maxBytes) { errs.push(f.name + ': الحجم يتجاوز الحد (' + (o.maxMB || 300) + ' MB)'); continue; }
        if (o.exts) { const ext = (f.name.split('.').pop() || '').toLowerCase(); if (!o.exts.includes(ext) && !(o.mimes && o.mimes.some(m => (f.type || '').startsWith(m)))) { errs.push(f.name + ': نوع غير مدعوم (المدعوم: ' + o.exts.join('، ') + ')'); continue; } }
        ok.push(f);
      }
      if (errs.length) ui.toast(errs[0] + (errs.length > 1 ? ' (+' + (errs.length - 1) + ')' : ''), 'error');
      files = o.multiple ? files.concat(ok) : ok.slice(0, 1); render(); change();
    }
    input.addEventListener('change', () => { accept(Array.from(input.files)); input.value = ''; });
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files) accept(Array.from(e.dataTransfer.files)); });
    el.files = () => files.slice(); el.first = () => files[0] || null;
    el.clear = () => { files = []; render(); change(); };
    el.set = arr => { files = arr.slice(); render(); change(); };
    return el;
  };

  ui.tabs = function (defs, initial) {
    const bar = h('div', { class: 'tabs', role: 'tablist' }); const body = h('div'); const el = h('div', null, bar, body);
    const cache = {}; let cur = null;
    function show(id) {
      cur = id;
      Array.from(bar.children).forEach(b => b.setAttribute('aria-selected', String(b.dataset.id === id)));
      Array.from(body.children).forEach(c => (c.style.display = c.dataset.id === id ? '' : 'none'));
      if (!cache[id]) { const d = defs.find(x => x.id === id); const pane = h('div', { 'data-id': id }); body.appendChild(pane); cache[id] = pane; d.render(pane); pane.style.display = ''; }
    }
    defs.forEach(d => bar.appendChild(h('button', { type: 'button', class: 'tab', role: 'tab', 'data-id': d.id, text: d.label, on: { click: () => show(d.id) } })));
    show(initial || defs[0].id); el.show = show; return el;
  };

  /* ───────── قراءة ملفات ───────── */
  OF.readBuf = f => new Promise((res, rej) => { if (f.arrayBuffer) f.arrayBuffer().then(res, rej); else { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsArrayBuffer(f); } });
  OF.readText = (f, enc) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsText(f, enc || 'utf-8'); });
  OF.extOf = n => { const m = /\.([A-Za-z0-9]+)$/.exec(n || ''); return m ? m[1].toLowerCase() : ''; };
  OF.baseOf = n => String(n || 'file').replace(/\.[^.\\/]+$/, '');
  OF.loadImage = function (blobOrUrl) {
    return new Promise((res, rej) => {
      const url = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
      const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error('تعذر قراءة الصورة (ملف تالف أو صيغة غير مدعومة في هذا المتصفح)'));
      img.src = url; img._url = url;
    });
  };
  OF.canvasBlob = (c, type, q) => new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('تعذر ترميز الصورة بهذه الصيغة في هذا المتصفح')), type, q));

  /* ───────── شبكة: بلاجن أصلي إن وُجد (يتجاوز CORS) وإلا fetch ───────── */
  OF.http = {
    engine() { return OF.native() ? 'native' : 'browser'; },
    /* يرجع {status, statusText, headers, text, bytes(Uint8Array), url, ms, engine} */
    async request(o) {
      const t0 = performance.now(); const nat = OF.native();
      if (nat && nat.request) {
        const r = await nat.request({ url: o.url, method: o.method || 'GET', headers: o.headers || {}, body: o.body || '', timeoutMs: o.timeoutMs || 20000, maxBytes: o.maxBytes || 8 * 1048576 });
        const bin = Uint8Array.from(atob(r.bodyBase64 || ''), c => c.charCodeAt(0));
        return { status: r.status, statusText: r.statusText || '', headers: r.headers || {}, bytes: bin, text: new TextDecoder('utf-8', { fatal: false }).decode(bin), url: r.url || o.url, ms: Math.round(performance.now() - t0), engine: 'native', truncated: !!r.truncated };
      }
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), o.timeoutMs || 20000);
      try {
        const init = { method: o.method || 'GET', headers: o.headers || {}, signal: ctl.signal, redirect: 'follow' };
        if (o.body && !['GET', 'HEAD'].includes(init.method)) init.body = o.body;
        const r = await fetch(o.url, init); const buf = new Uint8Array(await r.arrayBuffer()); const hd = {}; r.headers.forEach((v, k) => (hd[k] = v));
        return { status: r.status, statusText: r.statusText, headers: hd, bytes: buf, text: new TextDecoder('utf-8').decode(buf), url: r.url, ms: Math.round(performance.now() - t0), engine: 'browser' };
      } catch (e) {
        if (e.name === 'AbortError') throw new Error('انتهت مهلة الطلب');
        throw new Error('فشل الطلب. في المتصفح العادي قد يمنعه CORS أو عدم وجود اتصال؛ المحرك الأصلي داخل APK لا يتأثر بـCORS. (' + (e.message || e) + ')');
      } finally { clearTimeout(to); }
    },
  };

  /* ───────── حاجز URL: http/https فقط ───────── */
  OF.cleanUrl = function (s) {
    s = String(s || '').trim(); if (!s) throw new Error('أدخل رابطاً أولاً');
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;
    let u; try { u = new URL(s); } catch (e) { throw new Error('الرابط غير صالح'); }
    if (!/^https?:$/.test(u.protocol)) throw new Error('يُدعم http و https فقط');
    return u;
  };

  OF.download = (name, text, mime) => OF.save(new Blob([text], { type: mime || 'text/plain;charset=utf-8' }), name);
})();
