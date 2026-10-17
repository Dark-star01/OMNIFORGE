/* أدوات البيانات والمطورين */
(function () {
  'use strict';
  const { h, ui } = OF;
  const T = OF.tools;

  /* ───────────── CSV مشترك ───────────── */
  const csv = (OF.csv = {
    detect(text) {
      const head = text.split('\n').slice(0, 5).join('\n'); let best = ',', n = -1;
      [',', ';', '\t', '|'].forEach(d => { const c = head.split(d).length - 1; if (c > n) { n = c; best = d; } }); return best;
    },
    parse(text, delim) {
      const rows = []; let row = [], f = '', q = false, i = 0; const n = text.length;
      if (text.charCodeAt(0) === 0xFEFF) i = 1;
      for (; i < n; i++) {
        const c = text[i];
        if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
        else if (c === '"' && f === '') q = true;
        else if (c === delim) { row.push(f); f = ''; }
        else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; rows.push(row); row = []; }
        else f += c;
      }
      if (q) throw new Error('اقتباس مزدوج غير مغلق في CSV');
      if (f !== '' || row.length) { row.push(f); rows.push(row); }
      return rows.filter(r => !(r.length === 1 && r[0] === ''));
    },
    stringify(rows, delim) {
      const d = delim || ','; const esc = v => { v = v == null ? '' : String(v); return (v.includes(d) || /["\n\r]/.test(v) || /^\s|\s$/.test(v)) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      return rows.map(r => r.map(esc).join(d)).join('\n');
    },
  });

  /* ───────────── XML ↔ JS ───────────── */
  function xmlToObj(node) {
    const o = {}; let hasChild = false;
    if (node.attributes && node.attributes.length) { o['@attributes'] = {}; for (const a of node.attributes) o['@attributes'][a.name] = a.value; }
    let text = '';
    for (const c of node.childNodes) {
      if (c.nodeType === 1) { hasChild = true; const v = xmlToObj(c); if (c.nodeName in o) { if (!Array.isArray(o[c.nodeName])) o[c.nodeName] = [o[c.nodeName]]; o[c.nodeName].push(v); } else o[c.nodeName] = v; }
      else if (c.nodeType === 3 || c.nodeType === 4) text += c.nodeValue;
    }
    text = text.trim();
    if (!hasChild && !o['@attributes']) return text;
    if (text) o['#text'] = text;
    return o;
  }
  function objToXml(name, v, ind, step) {
    const pad = step ? ind : ''; const nl = step ? '\n' : ''; const tag = String(name).replace(/[^\w.\-:؀-ۿ]/g, '_').replace(/^([^A-Za-z_؀-ۿ])/, '_$1');
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (Array.isArray(v)) return v.map(x => objToXml(name, x, ind, step)).join('');
    if (v === null || typeof v !== 'object') return pad + '<' + tag + '>' + esc(v == null ? '' : v) + '</' + tag + '>' + nl;
    let attrs = ''; const kids = []; let text = '';
    for (const k of Object.keys(v)) {
      if (k === '@attributes') for (const a of Object.keys(v[k])) attrs += ' ' + a.replace(/[^\w.\-:]/g, '_') + '="' + esc(v[k][a]).replace(/"/g, '&quot;') + '"';
      else if (k === '#text') text = esc(v[k]); else kids.push(k);
    }
    if (!kids.length) return pad + '<' + tag + attrs + (text ? '>' + text + '</' + tag + '>' : '/>') + nl;
    return pad + '<' + tag + attrs + '>' + nl + (text ? pad + step + text + nl : '') + kids.map(k => objToXml(k, v[k], ind + step, step)).join('') + pad + '</' + tag + '>' + nl;
  }
  function parseXml(s) {
    const d = new DOMParser().parseFromString(s, 'application/xml'); const err = d.getElementsByTagName('parsererror')[0];
    if (err) throw new Error('XML غير صالح: ' + err.textContent.replace(/\s+/g, ' ').slice(0, 200));
    return d;
  }

  function jsonErr(e, text) {
    const m = /position (\d+)/.exec(e.message); if (!m) return e.message;
    const pos = +m[1]; const before = text.slice(0, pos); const line = before.split('\n').length, col = pos - before.lastIndexOf('\n');
    return e.message.replace(/ in JSON at position \d+.*/, '') + ' (السطر ' + line + '، العمود ' + col + ')';
  }
  function sortKeys(v) { if (Array.isArray(v)) return v.map(sortKeys); if (v && typeof v === 'object') { const o = {}; Object.keys(v).sort().forEach(k => (o[k] = sortKeys(v[k]))); return o; } return v; }
  const flat = (v) => (v !== null && typeof v === 'object') ? JSON.stringify(v) : v;

  /* ───────────── ورشة البيانات المنظمة ───────────── */
  T['data-workshop'] = {
    render(box) {
      const fmts = ['JSON', 'YAML', 'XML', 'CSV'];
      const src = ui.select(fmts, 'JSON'), dst = ui.select(fmts, 'YAML'), ind = ui.select([['2', 'مسافتان'], ['4', '4 مسافات'], ['tab', 'Tab']], '2');
      const inp = ui.area({ rows: 10, code: true, placeholder: 'ألصق البيانات هنا…' }); const outp = ui.area({ rows: 10, code: true, readonly: true }); const out = ui.out();
      const sk = ui.check('ترتيب المفاتيح أبجدياً');
      const parse = () => {
        const s = inp.value; if (!s.trim()) throw new Error('أدخل بيانات أولاً');
        switch (src.value) {
          case 'JSON': try { return JSON.parse(s); } catch (e) { throw new Error('JSON غير صالح: ' + jsonErr(e, s)); }
          case 'YAML': try { return jsyaml.safeLoad(s); } catch (e) { throw new Error('YAML غير صالح: ' + e.message.split('\n')[0]); }
          case 'XML': { const d = parseXml(s); return { [d.documentElement.nodeName]: xmlToObj(d.documentElement) }; }
          case 'CSV': { const rows = csv.parse(s, csv.detect(s)); if (rows.length < 1) throw new Error('CSV فارغ'); const hd = rows[0]; return rows.slice(1).map(r => Object.fromEntries(hd.map((k, i) => [k || 'col' + (i + 1), r[i] == null ? '' : r[i]]))); }
        }
      };
      const stepStr = () => (ind.value === 'tab' ? '\t' : ' '.repeat(+ind.value));
      const ser = (v, f) => {
        if (sk.input.checked) v = sortKeys(v);
        switch (f) {
          case 'JSON': return JSON.stringify(v, null, stepStr());
          case 'MIN': return JSON.stringify(v);
          case 'YAML': return jsyaml.safeDump(v, { indent: ind.value === '4' ? 4 : 2, lineWidth: -1, noRefs: true });
          case 'XML': { const keys = v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v) : []; const body = keys.length === 1 ? objToXml(keys[0], v[keys[0]], '', stepStr()) : objToXml('root', Array.isArray(v) ? { item: v } : v, '', stepStr()); return '<?xml version="1.0" encoding="UTF-8"?>\n' + body.trim(); }
          case 'CSV': {
            if (!Array.isArray(v)) { if (v && typeof v === 'object') v = [v]; else throw new Error('CSV يحتاج مصفوفة من الكائنات'); }
            if (!v.length) throw new Error('المصفوفة فارغة'); if (!v.every(x => x && typeof x === 'object' && !Array.isArray(x))) throw new Error('عناصر المصفوفة يجب أن تكون كائنات لتحويلها إلى CSV');
            const cols = [...new Set(v.flatMap(x => Object.keys(x)))]; return csv.stringify([cols].concat(v.map(x => cols.map(c => flat(x[c])))), ',');
          }
        }
      };
      const run = (label, f, srcOverride) => () => {
        out.clear(); outp.value = '';
        try { const v = parse(); outp.value = ser(v, f); out.ok(label); } catch (e) { out.error(e.message); }
      };
      box.append(ui.card('', ui.row(h('div', { class: 'grow' }, ui.field('الصيغة الحالية', src)), h('div', { class: 'grow' }, ui.field('الصيغة الهدف', dst))), ui.field('المدخل', inp), ui.row(ui.field('المسافات', ind), sk),
        ui.row(ui.btn('تحويل', () => run('تم التحويل من ' + src.value + ' إلى ' + dst.value, dst.value)(), { kind: 'primary' }),
          ui.btn('تنسيق', () => run('تم التنسيق', src.value === 'CSV' ? 'CSV' : src.value)()),
          ui.btn('تصغير JSON', () => { if (src.value !== 'JSON') return out.warn('التصغير لصيغة JSON فقط'); run('تم التصغير', 'MIN')(); }),
          ui.btn('تحقق فقط', () => { out.clear(); try { const v = parse(); out.ok('الصيغة ' + src.value + ' صالحة' + (Array.isArray(v) ? ' — مصفوفة من ' + v.length + ' عنصر' : '')); } catch (e) { out.error(e.message); } }))),
        out, ui.card('النتيجة', outp, ui.row(ui.copyBtn(() => outp.value), ui.btn('حفظ', () => outp.value ? OF.download('output.' + ({ JSON: 'json', MIN: 'json', YAML: 'yaml', XML: 'xml', CSV: 'csv' }[dst.value] || 'txt'), outp.value) : ui.toast('لا توجد نتيجة', 'error'), { small: true, icon: 'save' }))));
    },
  };

  /* ───────────── ورشة الجداول CSV ───────────── */
  T['table-workshop'] = {
    render(box) {
      let rows = [], hasHeader = true, delim = ',', sortCol = -1, sortDir = 1;
      const inp = ui.area({ rows: 7, code: true, placeholder: 'ألصق CSV هنا أو اختر ملفاً…' }); const out = ui.out();
      const dsel = ui.select([['auto', 'اكتشاف تلقائي'], [',', 'فاصلة ,'], [';', 'فاصلة منقوطة ;'], ['\t', 'Tab'], ['|', 'خط عمودي |']], 'auto'); const hd = ui.check('الصف الأول عناوين', true);
      const filt = ui.input({ placeholder: 'تصفية الصفوف…' }); const view = h('div'); const exp = h('div');
      const file = ui.files({ accept: '.csv,.tsv,.txt,text/csv', label: 'اختر ملف CSV', maxMB: 30, onChange: async fs => { if (fs[0]) { try { inp.value = await OF.readText(fs[0]); } catch (e) { out.error('تعذر قراءة الملف'); } } } });
      const body = () => (hasHeader ? rows.slice(1) : rows); const headers = () => (hasHeader ? rows[0] : rows[0].map((_, i) => 'عمود ' + (i + 1)));
      function draw() {
        OF.clear(view); if (!rows.length) return;
        let data = body(); const q = filt.value.trim().toLowerCase(); if (q) data = data.filter(r => r.some(c => String(c).toLowerCase().includes(q)));
        if (sortCol >= 0) data = data.slice().sort((a, b) => { const x = a[sortCol] || '', y = b[sortCol] || ''; const nx = parseFloat(x), ny = parseFloat(y); return (isNaN(nx) || isNaN(ny) ? String(x).localeCompare(String(y), 'ar', { numeric: true }) : nx - ny) * sortDir; });
        const hs = headers(); const th = hs.map((c, i) => h('th', { text: c + (sortCol === i ? (sortDir > 0 ? ' ▲' : ' ▼') : ''), on: { click: () => { if (sortCol === i) sortDir = -sortDir; else { sortCol = i; sortDir = 1; } draw(); } } }));
        const tb = data.slice(0, 500).map(r => h('tr', null, hs.map((_, i) => h('td', { text: r[i] == null ? '' : r[i] }))));
        view.appendChild(h('div', { class: 'tbl-wrap' }, h('table', { class: 'data', dir: 'auto' }, h('thead', null, h('tr', null, th)), h('tbody', null, tb))));
        view.appendChild(h('p', { class: 'muted small', text: 'يعرض ' + Math.min(500, data.length) + ' من ' + data.length + ' صف (الصفوف المطابقة). اضغط عنوان عمود للترتيب.' }));
        view._data = data;
      }
      const load = ui.btn('عرض الجدول', () => {
        out.clear(); OF.clear(exp);
        try {
          if (!inp.value.trim()) throw new Error('أدخل بيانات CSV أو اختر ملفاً');
          delim = dsel.value === 'auto' ? csv.detect(inp.value) : dsel.value; rows = csv.parse(inp.value, delim); hasHeader = hd.input.checked; sortCol = -1;
          if (!rows.length) throw new Error('لا توجد صفوف');
          const w = rows[0].length; const bad = rows.map((r, i) => [i, r.length]).filter(([, n]) => n !== w);
          const empties = rows.reduce((a, r) => a + r.filter(c => c === '').length, 0);
          out.ok('الصفوف: ' + rows.length + ' — الأعمدة: ' + w + ' — الفاصل: ' + (delim === '\t' ? 'Tab' : delim));
          if (bad.length) out.warn('صفوف بعدد أعمدة مختلف (' + bad.length + '): مثال سطر ' + (bad[0][0] + 1) + ' فيه ' + bad[0][1] + ' عموداً بدلاً من ' + w);
          if (empties) out.info('خلايا فارغة: ' + empties);
          draw();
          const data = () => (view._data || body()), hs = () => headers();
          const asObjs = () => data().map(r => Object.fromEntries(hs().map((k, i) => [k, r[i] == null ? '' : r[i]])));
          const mdEsc = s => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
          const formats = { 'JSON': () => JSON.stringify(asObjs(), null, 2), 'CSV': () => csv.stringify([hs()].concat(data()), ','), 'TSV': () => csv.stringify([hs()].concat(data()), '\t'), 'Markdown': () => '| ' + hs().map(mdEsc).join(' | ') + ' |\n|' + hs().map(() => '---').join('|') + '|\n' + data().map(r => '| ' + hs().map((_, i) => mdEsc(r[i])).join(' | ') + ' |').join('\n') };
          const fsel = ui.select(Object.keys(formats)); const res = ui.area({ rows: 8, code: true, readonly: true });
          exp.appendChild(ui.card('تصدير (يشمل التصفية والترتيب الحاليين)', ui.field('الصيغة', fsel), ui.btn('تحويل', () => { res.value = formats[fsel.value](); }, { kind: 'primary' }), res, ui.row(ui.copyBtn(() => res.value), ui.btn('حفظ', () => res.value ? OF.download('table.' + ({ JSON: 'json', CSV: 'csv', TSV: 'tsv', Markdown: 'md' }[fsel.value]), res.value) : ui.toast('حوّل أولاً', 'error'), { small: true, icon: 'save' }))));
        } catch (e) { rows = []; OF.clear(view); out.error(e.message); }
      }, { kind: 'primary' });
      filt.addEventListener('input', draw);
      box.append(ui.card('البيانات', file, ui.field('', inp), ui.row(h('div', { class: 'grow' }, ui.field('الفاصل', dsel)), hd), load), out, ui.card('الجدول', filt, view), exp);
    },
  };

  /* ───────────── ورشة Regex (داخل Worker مع مهلة) ───────────── */
  const rxWorkerSrc = "self.onmessage=function(e){var d=e.data;try{var g=d.f.indexOf('g')>=0;var rx=new RegExp(d.p,d.f);var out=[],m,n=0;if(!g){m=rx.exec(d.t);if(m)out.push({i:m.index,t:m[0],g:Array.prototype.slice.call(m,1),n:m.groups||null});}else{while((m=rx.exec(d.t))!==null&&n<2000){out.push({i:m.index,t:m[0],g:Array.prototype.slice.call(m,1),n:m.groups||null});n++;if(m[0]==='')rx.lastIndex++;}}var rep=null;if(d.r!=null){rep=d.t.replace(new RegExp(d.p,d.f),d.r);}self.postMessage({ok:true,m:out,rep:rep,cut:n>=2000});}catch(err){self.postMessage({ok:false,e:String(err.message||err)});}};";
  function runRegex(p, f, t, r) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(new Blob([rxWorkerSrc], { type: 'text/javascript' })); const w = new Worker(url);
      const to = setTimeout(() => { w.terminate(); URL.revokeObjectURL(url); rej(new Error('استغرقت المطابقة أكثر من 2.5 ثانية وأُوقفت (احتمال backtracking مفرط في النمط).')); }, 2500);
      w.onmessage = e => { clearTimeout(to); w.terminate(); URL.revokeObjectURL(url); e.data.ok ? res(e.data) : rej(new Error(e.data.e)); };
      w.onerror = e => { clearTimeout(to); w.terminate(); URL.revokeObjectURL(url); rej(new Error(e.message || 'خطأ في المحرك')); };
      w.postMessage({ p, f, t, r });
    });
  }
  T['regex-lab'] = {
    render(box) {
      const pat = ui.input({ code: true, placeholder: 'النمط، مثال: (\\d+)-(\\w+)', dir: 'ltr' }); const txt = ui.area({ rows: 7, placeholder: 'نص الاختبار…' }); const rep = ui.input({ code: true, placeholder: 'نص الاستبدال (اختياري) مثل $1-$2', dir: 'ltr' });
      const flags = ['g', 'i', 'm', 's', 'u'].map((f, i) => [f, ui.check(f + ({ g: ' (الكل)', i: ' (تجاهل الحالة)', m: ' (متعدد الأسطر)', s: ' (النقطة تطابق السطر الجديد)', u: ' (Unicode)' }[f]), f === 'g'), '']);
      const out = ui.out(); const hl = h('div', { class: 'res', style: { direction: 'auto' } }); const list = h('div'); const rp = ui.area({ rows: 4, code: true, readonly: true });
      const go = ui.btn('اختبر', async () => {
        out.clear(); OF.clear(list); hl.textContent = ''; rp.value = '';
        if (!pat.value) return out.warn('أدخل نمطاً'); const f = flags.filter(x => x[1].input.checked).map(x => x[0]).join('');
        try { new RegExp(pat.value, f); } catch (e) { return out.error('نمط غير صالح: ' + e.message); }
        try {
          const r = await runRegex(pat.value, f, txt.value, rep.value !== '' ? rep.value : null);
          out.ok(r.m.length + ' مطابقة' + (r.cut ? ' (اقتُصر على أول 2000)' : '')); 
          let last = 0; r.m.forEach(m => { if (m.i < last) return; hl.appendChild(document.createTextNode(txt.value.slice(last, m.i))); hl.appendChild(h('span', { class: 'hl', text: m.t })); last = m.i + m.t.length; }); hl.appendChild(document.createTextNode(txt.value.slice(last)));
          if (r.m.length) list.appendChild(h('div', { class: 'tbl-wrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, ['#', 'الموضع', 'المطابقة', 'المجموعات'].map(x => h('th', { text: x })))), h('tbody', null, r.m.slice(0, 200).map((m, i) => h('tr', null, h('td', { text: i + 1 }), h('td', { text: m.i }), h('td', { class: 'mono', text: m.t }), h('td', { class: 'mono', text: JSON.stringify(m.n || m.g) })))))));
          if (r.rep != null) rp.value = r.rep;
        } catch (e) { out.error(e.message); }
      }, { kind: 'primary' });
      box.append(ui.card('', ui.field('النمط', pat), ui.row(...flags.map(x => x[1])), ui.field('النص', txt), ui.field('الاستبدال', rep), go), out, ui.card('المطابقات في النص', hl, list), ui.card('ناتج الاستبدال', rp, ui.copyBtn(() => rp.value)));
    },
  };

  /* ───────────── مولّد بيانات الاختبار ───────────── */
  const NAMES_AR = ['أحمد', 'محمد', 'خالد', 'سارة', 'نورة', 'ليلى', 'يوسف', 'ريم', 'عمر', 'هند', 'فهد', 'منى', 'سلمان', 'لمى', 'بدر', 'دانة'];
  const LAST_AR = ['العتيبي', 'الغامدي', 'القحطاني', 'الشمري', 'الحربي', 'الدوسري', 'المطيري', 'الزهراني', 'السبيعي', 'العمري'];
  const NAMES_EN = ['Alex', 'Sam', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie', 'Avery', 'Quinn', 'Drew', 'Cameron'];
  const LAST_EN = ['Smith', 'Brown', 'Taylor', 'Wilson', 'Clark', 'Lewis', 'Walker', 'Hall', 'Young', 'King'];
  const CITIES = ['الرياض', 'جدة', 'الدمام', 'مكة', 'المدينة', 'أبها', 'تبوك', 'حائل', 'Cairo', 'Dubai', 'London', 'Paris'];
  const LOREM = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua'.split(' ');
  const rnd = n => { const b = new Uint32Array(1); const lim = Math.floor(4294967296 / n) * n; let x; do { crypto.getRandomValues(b); x = b[0]; } while (x >= lim); return x % n; };
  const pick = a => a[rnd(a.length)];
  const uuid4 = () => (crypto.randomUUID ? crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));
  const gens = {
    id: { l: 'رقم تسلسلي', f: i => i + 1 }, uuid: { l: 'UUID', f: uuid4 },
    nameAr: { l: 'اسم عربي', f: () => pick(NAMES_AR) + ' ' + pick(LAST_AR) }, nameEn: { l: 'اسم إنجليزي', f: () => pick(NAMES_EN) + ' ' + pick(LAST_EN) },
    email: { l: 'بريد (example.test)', f: () => (pick(NAMES_EN) + rnd(1000)).toLowerCase() + '@example.test' },
    phone: { l: 'هاتف وهمي (05xxxxxxxx)', f: () => '05' + String(rnd(1e8)).padStart(8, '0') },
    city: { l: 'مدينة', f: () => pick(CITIES) }, int: { l: 'عدد صحيح 0–1000', f: () => rnd(1001) },
    float: { l: 'عدد عشري 0–100', f: () => +(rnd(1e6) / 1e4).toFixed(2) }, bool: { l: 'منطقي', f: () => rnd(2) === 1 },
    date: { l: 'تاريخ (آخر 5 سنوات)', f: () => new Date(Date.now() - rnd(5 * 365 * 864e5)).toISOString().slice(0, 10) },
    ip: { l: 'عنوان IPv4 خاص', f: () => '192.168.' + rnd(256) + '.' + rnd(256) }, color: { l: 'لون HEX', f: () => '#' + rnd(0xffffff).toString(16).padStart(6, '0') },
    text: { l: 'جملة lorem', f: () => { const n = 4 + rnd(7); return Array.from({ length: n }, () => pick(LOREM)).join(' '); } },
  };
  T['test-data'] = {
    render(box) {
      const checks = Object.entries(gens).map(([k, g]) => [k, ui.check(g.l, ['id', 'nameEn', 'email', 'int'].includes(k))]); const cnt = ui.input({ type: 'number', value: 10, min: 1, max: 1000 }); const fmt = ui.select(['JSON', 'CSV']); const outp = ui.area({ rows: 10, code: true, readonly: true }); const out = ui.out();
      const go = ui.btn('توليد', () => {
        out.clear(); const keys = checks.filter(c => c[1].input.checked).map(c => c[0]); const n = Math.floor(+cnt.value);
        if (!keys.length) return out.warn('اختر حقلاً واحداً على الأقل'); if (!(n >= 1 && n <= 1000)) return out.warn('العدد بين 1 و1000');
        const rows = Array.from({ length: n }, (_, i) => Object.fromEntries(keys.map(k => [k, gens[k].f(i)])));
        outp.value = fmt.value === 'JSON' ? JSON.stringify(rows, null, 2) : csv.stringify([keys].concat(rows.map(r => keys.map(k => r[k]))), ','); out.ok('تم توليد ' + n + ' سجلاً وهمياً');
      }, { kind: 'primary' });
      box.append(ui.card('الحقول', h('div', { class: 'grid' }, checks.map(c => c[1])), ui.row(h('div', { class: 'grow' }, ui.field('العدد', cnt)), h('div', { class: 'grow' }, ui.field('الصيغة', fmt))), go), out, ui.card('النتيجة', outp, ui.row(ui.copyBtn(() => outp.value), ui.btn('حفظ', () => outp.value ? OF.download('test-data.' + fmt.value.toLowerCase(), outp.value) : ui.toast('ولّد أولاً', 'error'), { small: true, icon: 'save' }))));
    },
  };

  /* ───────────── تنسيق وتصغير الكود ───────────── */
  function fmtCss(src, step) {
    let out = '', ind = 0, i = 0, q = null, par = 0, buf = ''; const n = src.length;
    const flush = () => { const t = buf.trim(); buf = ''; return t; };
    const nl = () => '\n' + step.repeat(Math.max(ind, 0));
    while (i < n) {
      const c = src[i];
      if (q) { buf += c; if (c === '\\') { buf += src[++i] || ''; } else if (c === q) q = null; i++; continue; }
      if (c === '"' || c === "'") { q = c; buf += c; i++; continue; }
      if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? n : e + 2; const t = flush(); if (t) out += nl() + t; out += nl() + src.slice(i, end); i = end; continue; }
      if (c === '(') par++; if (c === ')') par = Math.max(0, par - 1);
      if (par === 0 && c === '{') { const t = flush(); out += nl() + t.replace(/\s+/g, ' ') + ' {'; ind++; i++; continue; }
      if (par === 0 && c === '}') { const t = flush(); if (t) out += nl() + t.replace(/\s*:\s*/, ': ') + ';'; ind--; out += nl() + '}'; i++; continue; }
      if (par === 0 && c === ';') { const t = flush(); if (t) out += nl() + t.replace(/\s*:\s*/, ': ') + ';'; i++; continue; }
      buf += c; i++;
    }
    const t = flush(); if (t) out += nl() + t;
    return out.trim().replace(/\}\n(?=[^\s}])/g, '}\n\n');
  }
  function minCss(src) {
    let out = '', q = null, i = 0; const n = src.length;
    while (i < n) { const c = src[i]; if (q) { out += c; if (c === '\\') out += src[++i] || ''; else if (c === q) q = null; i++; continue; } if (c === '"' || c === "'") { q = c; out += c; i++; continue; } if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; } out += c; i++; }
    return out.replace(/\s+/g, ' ').replace(/\s*([{};,>])\s*/g, '$1').replace(/\s+:\s+/g, ':').replace(/:\s+/g, ':').replace(/;}/g, '}').trim();
  }
  const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
  const RAW = new Set(['script', 'style', 'pre', 'textarea']);
  function tokHtml(src) {
    const toks = []; let i = 0; const n = src.length;
    while (i < n) {
      if (src[i] === '<') {
        if (src.startsWith('<!--', i)) { const e = src.indexOf('-->', i + 4); const end = e < 0 ? n : e + 3; toks.push({ k: 'c', v: src.slice(i, end) }); i = end; continue; }
        let j = i + 1, q = null; while (j < n) { const ch = src[j]; if (q) { if (ch === q) q = null; } else if (ch === '"' || ch === "'") q = ch; else if (ch === '>') break; j++; }
        const tag = src.slice(i, j + 1); const m = /^<\s*(\/?)\s*([A-Za-z][\w:-]*)/.exec(tag);
        if (m) { const name = m[2].toLowerCase(); toks.push({ k: m[1] ? 'e' : (VOID.has(name) || /\/>$/.test(tag) ? 'v' : 's'), n: name, v: tag });
          if (!m[1] && RAW.has(name) && !/\/>$/.test(tag)) { const re = new RegExp('</' + name + '\\s*>', 'i'); const rest = src.slice(j + 1); const mm = re.exec(rest); const body = mm ? rest.slice(0, mm.index) : rest; toks.push({ k: 'r', v: body }); i = j + 1 + body.length; continue; } }
        else toks.push({ k: 'v', n: '', v: tag });
        i = j + 1;
      } else { const e = src.indexOf('<', i); const end = e < 0 ? n : e; toks.push({ k: 't', v: src.slice(i, end) }); i = end; }
    }
    return toks;
  }
  function fmtHtml(src, step) {
    const toks = tokHtml(src); let out = [], ind = 0;
    toks.forEach(t => {
      if (t.k === 't') { const s = t.v.replace(/\s+/g, ' ').trim(); if (s) out.push(step.repeat(ind) + s); }
      else if (t.k === 'c' || t.k === 'v') out.push(step.repeat(ind) + t.v);
      else if (t.k === 's') { out.push(step.repeat(ind) + t.v); ind++; }
      else if (t.k === 'e') { ind = Math.max(0, ind - 1); out.push(step.repeat(ind) + t.v); }
      else if (t.k === 'r') { if (t.v.trim()) out.push(t.v.replace(/^\n+|\s+$/g, '')); }
    });
    // ادمج وسم فتح + نص قصير + وسم إغلاق في سطر واحد
    const joined = []; for (let i = 0; i < out.length; i++) { const a = out[i], b = out[i + 1], c = out[i + 2]; const mA = /^(\s*)<([A-Za-z][\w:-]*)(?:\s[^>]*)?>$/.exec(a); if (mA && b && c && !/^\s*</.test(b) && new RegExp('^\\s*</' + mA[2] + '\\s*>$', 'i').test(c) && b.length < 80) { joined.push(a + b.trim() + c.trim()); i += 2; } else joined.push(a); }
    return joined.join('\n');
  }
  function minHtml(src) {
    return tokHtml(src).filter(t => t.k !== 'c').map(t => (t.k === 't' ? t.v.replace(/\s+/g, ' ') : t.v)).join('').replace(/>\s+</g, '><').trim();
  }
  T['code-formatter'] = {
    render(box) {
      const lang = ui.select(['JSON', 'CSS', 'HTML']); const ind = ui.select([['2', 'مسافتان'], ['4', '4 مسافات'], ['tab', 'Tab']], '2'); const inp = ui.area({ rows: 10, code: true, placeholder: 'الكود…' }); const outp = ui.area({ rows: 10, code: true, readonly: true }); const out = ui.out();
      const step = () => (ind.value === 'tab' ? '\t' : ' '.repeat(+ind.value));
      const act = mode => () => {
        out.clear(); outp.value = ''; const s = inp.value; if (!s.trim()) return out.warn('أدخل كوداً أولاً');
        try {
          let r; if (lang.value === 'JSON') { let v; try { v = JSON.parse(s); } catch (e) { throw new Error('JSON غير صالح: ' + jsonErr(e, s)); } r = mode === 'f' ? JSON.stringify(v, null, step()) : JSON.stringify(v); }
          else if (lang.value === 'CSS') r = mode === 'f' ? fmtCss(s, step()) : minCss(s); else r = mode === 'f' ? fmtHtml(s, step()) : minHtml(s);
          outp.value = r; out.ok((mode === 'f' ? 'تم التنسيق' : 'تم التصغير') + ' — ' + s.length + ' ← ' + r.length + ' حرفاً');
        } catch (e) { out.error(e.message); }
      };
      box.append(ui.card('', ui.row(h('div', { class: 'grow' }, ui.field('اللغة', lang)), h('div', { class: 'grow' }, ui.field('المسافات', ind))), ui.field('المدخل', inp), ui.row(ui.btn('تنسيق', act('f'), { kind: 'primary' }), ui.btn('تصغير', act('m')))), out, ui.card('النتيجة', outp, ui.copyBtn(() => outp.value)));
    },
  };
  T['code-formatter'].fmtCss = fmtCss; T['code-formatter'].minCss = minCss; T['code-formatter'].fmtHtml = fmtHtml; T['code-formatter'].minHtml = minHtml;

  /* ───────────── JWT ───────────── */
  const b64u = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s); return Uint8Array.from(bin, c => c.charCodeAt(0)); };
  const u8b64u = u8 => { let s = ''; u8.forEach(b => (s += String.fromCharCode(b))); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  T['jwt-inspector'] = {
    render(box) {
      const inp = ui.area({ rows: 5, code: true, placeholder: 'eyJhbGciOi...' }); const secret = ui.input({ type: 'password', placeholder: 'المفتاح السري لـ HS256/384/512 (اختياري)', dir: 'ltr' }); const out = ui.out();
      const go = ui.btn('افحص', async () => {
        out.clear(); const t = inp.value.trim().replace(/^Bearer\s+/i, ''); if (!t) return out.warn('ألصق رمز JWT');
        const parts = t.split('.'); if (parts.length !== 3) return out.error('JWT يجب أن يتكوّن من 3 أجزاء مفصولة بنقطة (وجدت ' + parts.length + ')');
        let hd, pl; try { hd = JSON.parse(new TextDecoder().decode(b64u(parts[0]))); pl = JSON.parse(new TextDecoder().decode(b64u(parts[1]))); } catch (e) { return out.error('تعذر فك الترميز: الأجزاء ليست Base64URL/JSON صالحاً'); }
        out.info('هذا فك ترميز فقط: لم يُتحقق من التوقيع ما لم تُدخل المفتاح وتكن الخوارزمية HS*.');
        out.add(ui.card('الترويسة (Header)', h('pre', { class: 'res' }, JSON.stringify(hd, null, 2)))); out.add(ui.card('الحمولة (Payload)', h('pre', { class: 'res' }, JSON.stringify(pl, null, 2))));
        const now = Date.now() / 1000; const rows = [];
        ['iat', 'nbf', 'exp'].forEach(k => { if (typeof pl[k] === 'number') rows.push([({ iat: 'صدر في (iat)', nbf: 'لا يصلح قبل (nbf)', exp: 'ينتهي في (exp)' })[k], new Date(pl[k] * 1000).toLocaleString('ar') + (k === 'exp' ? (pl[k] < now ? ' — منتهي الصلاحية' : ' — ساري') : '')]); });
        if (rows.length) out.add(ui.card('التواريخ', ui.kv(rows)));
        if (String(hd.alg).toLowerCase() === 'none') out.warn('الخوارزمية none: الرمز غير موقّع — لا تثق به.');
        const m = /^HS(256|384|512)$/.exec(hd.alg || '');
        if (secret.value) {
          if (!m) out.warn('التحقق مدعوم لـ HS256/384/512 فقط؛ الخوارزمية هنا: ' + hd.alg);
          else try { const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret.value), { name: 'HMAC', hash: 'SHA-' + m[1] }, false, ['sign']); const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(parts[0] + '.' + parts[1]))); u8b64u(sig) === parts[2] ? out.ok('التوقيع صحيح بهذا المفتاح (' + hd.alg + ').') : out.error('التوقيع غير مطابق لهذا المفتاح.'); } catch (e) { out.error('تعذر التحقق: ' + e.message); }
        }
      }, { kind: 'primary' });
      box.append(ui.card('', ui.field('الرمز', inp), ui.field('المفتاح السري', secret, 'يبقى في جهازك ولا يُرسل أو يُحفظ.'), go), out);
    },
  };
})();
