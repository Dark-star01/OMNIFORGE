/* أدوات النصوص: ورشة النصوص، المقارنة، الترميز، Markdown، القصاصات */
(function () {
  'use strict';
  const { h, ui } = OF;
  const T = OF.tools;

  /* ───────────── ورشة النصوص ───────────── */
  const AR_DIAC = /[ً-ٰٟ]/g;
  const textOps = {
    'حذف المسافات الزائدة (أطراف الأسطر)': s => s.split('\n').map(l => l.trim()).join('\n'),
    'ضغط المسافات المتكررة': s => s.replace(/[ \t ]{2,}/g, ' '),
    'حذف الأسطر الفارغة': s => s.split('\n').filter(l => l.trim() !== '').join('\n'),
    'حذف الأسطر المكررة': s => { const seen = new Set(); return s.split('\n').filter(l => (seen.has(l) ? false : (seen.add(l), true))).join('\n'); },
    'ترتيب الأسطر تصاعدياً': s => s.split('\n').sort((a, b) => a.localeCompare(b, 'ar', { numeric: true })).join('\n'),
    'ترتيب الأسطر تنازلياً': s => s.split('\n').sort((a, b) => b.localeCompare(a, 'ar', { numeric: true })).join('\n'),
    'عكس ترتيب الأسطر': s => s.split('\n').reverse().join('\n'),
    'ترقيم الأسطر': s => s.split('\n').map((l, i) => (i + 1) + '. ' + l).join('\n'),
    'أحرف كبيرة (EN)': s => s.toUpperCase(),
    'أحرف صغيرة (EN)': s => s.toLowerCase(),
    'أول حرف كبير لكل كلمة (EN)': s => s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toUpperCase()),
    'حذف التشكيل العربي': s => s.replace(AR_DIAC, ''),
    'حذف التطويل (ـ)': s => s.replace(/ـ/g, ''),
    'توحيد الألف والياء (أإآ→ا، ى→ي)': s => s.replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي'),
    'أرقام عربية ← لاتينية': s => s.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)),
    'أرقام لاتينية ← عربية': s => s.replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[+d]),
    'تحويل إلى slug': s => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, ''),
    'استخراج الروابط': s => (s.match(/https?:\/\/[^\s<>"')]+/g) || []).join('\n'),
    'استخراج عناوين البريد': s => (s.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) || []).join('\n'),
    'استخراج الأرقام': s => (s.match(/-?\d+(?:[.,]\d+)?/g) || []).join('\n'),
    'دمج الأسطر في سطر واحد (بمسافة)': s => s.split('\n').map(l => l.trim()).filter(Boolean).join(' '),
    'تقسيم الكلمات إلى أسطر': s => s.trim().split(/\s+/).join('\n'),
  };
  function stats(s) {
    const words = (s.trim().match(/\S+/g) || []).length;
    return [['الأحرف', [...s].length], ['الأحرف بدون مسافات', [...s.replace(/\s/g, '')].length], ['الكلمات', words], ['الأسطر', s === '' ? 0 : s.split('\n').length], ['البايتات (UTF-8)', new TextEncoder().encode(s).length], ['زمن القراءة التقريبي', Math.max(words ? 1 : 0, Math.round(words / 200)) + ' دقيقة']];
  }
  T['text-workshop'] = {
    render(box) {
      const inp = ui.area({ rows: 8, placeholder: 'ألصق النص هنا…' });
      const out = ui.out(); const st = h('div'); const outp = ui.area({ rows: 8, readonly: true });
      const refresh = () => { OF.clear(st); st.appendChild(ui.kv(stats(inp.value))); };
      inp.addEventListener('input', refresh); refresh();
      const sel = ui.select(Object.keys(textOps));
      const run = ui.btn('تطبيق', () => { out.clear(); if (!inp.value) return out.warn('أدخل نصاً أولاً'); outp.value = textOps[sel.value](inp.value); out.ok('تم: ' + sel.value); }, { kind: 'primary' });
      const find = ui.input({ placeholder: 'بحث عن…' }), rep = ui.input({ placeholder: 'استبدال بـ…' }); const re = ui.check('تعبير نمطي (Regex)'), cs = ui.check('مطابقة حالة الأحرف');
      const doRep = ui.btn('استبدال الكل', () => {
        out.clear(); if (!inp.value) return out.warn('أدخل نصاً أولاً'); if (!find.value) return out.warn('أدخل نص البحث');
        try { const rx = new RegExp(re.input.checked ? find.value : find.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g' + (cs.input.checked ? '' : 'i') + 'u'); let n = 0; outp.value = inp.value.replace(rx, () => { n++; return rep.value; }); out.ok('تم استبدال ' + n + ' موضع'); }
        catch (e) { out.error('تعبير نمطي غير صالح: ' + e.message); }
      });
      const pre = ui.input({ placeholder: 'بادئة لكل سطر' }), suf = ui.input({ placeholder: 'لاحقة لكل سطر' });
      const doPS = ui.btn('إضافة', () => { out.clear(); if (!inp.value) return out.warn('أدخل نصاً أولاً'); outp.value = inp.value.split('\n').map(l => pre.value + l + suf.value).join('\n'); out.ok('تمت الإضافة'); });
      box.append(
        ui.card('النص', inp, st),
        ui.card('عملية سريعة', ui.field('اختر العملية', sel), run),
        ui.card('بحث واستبدال', ui.field('', find), ui.field('', rep), re, cs, doRep),
        ui.card('بادئة / لاحقة', ui.row(h('div', { class: 'grow' }, pre), h('div', { class: 'grow' }, suf)), doPS),
        ui.card('النتيجة', out, outp, ui.row(ui.copyBtn(() => outp.value), ui.btn('استخدم النتيجة كمدخل', () => { inp.value = outp.value; refresh(); }, { small: true }), ui.btn('حفظ .txt', () => outp.value ? OF.download('result.txt', outp.value) : ui.toast('لا توجد نتيجة', 'error'), { small: true, icon: 'save' }))));
    },
  };

  /* ───────────── مقارنة النصوص ───────────── */
  function lcsDiff(a, b) {
    // يرجع مصفوفة عمليات: {t:'=',v}|{t:'-',v}|{t:'+',v}
    let s = 0; while (s < a.length && s < b.length && a[s] === b[s]) s++;
    let ea = a.length, eb = b.length; while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
    const A = a.slice(s, ea), B = b.slice(s, eb); const n = A.length, m = B.length;
    if (n * m > 25e6) throw new Error('النصان كبيران جداً للمقارنة التفصيلية (' + n + '×' + m + ' سطراً مختلفاً). قسّمهما.');
    const W = m + 1; const dp = new Uint16Array((n + 1) * W);
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i * W + j] = A[i] === B[j] ? dp[(i + 1) * W + j + 1] + 1 : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1]);
    const ops = []; for (let i = 0; i < s; i++) ops.push({ t: '=', v: a[i] });
    let i = 0, j = 0;
    while (i < n && j < m) { if (A[i] === B[j]) { ops.push({ t: '=', v: A[i] }); i++; j++; } else if (dp[(i + 1) * W + j] >= dp[i * W + j + 1]) ops.push({ t: '-', v: A[i++] }); else ops.push({ t: '+', v: B[j++] }); }
    while (i < n) ops.push({ t: '-', v: A[i++] }); while (j < m) ops.push({ t: '+', v: B[j++] });
    for (let k = ea; k < a.length; k++) ops.push({ t: '=', v: a[k] });
    return ops;
  }
  T['text-diff'] = {
    render(box) {
      const A = ui.area({ rows: 7, placeholder: 'النص الأصلي (A)' }), B = ui.area({ rows: 7, placeholder: 'النص الجديد (B)' });
      const ign = ui.check('تجاهل المسافات في أطراف الأسطر'); const out = ui.out(); const res = h('div'); const merged = ui.area({ rows: 8, readonly: true });
      const go = ui.btn('قارن', () => {
        out.clear(); OF.clear(res); merged.value = '';
        const norm = l => (ign.input.checked ? l.trim() : l);
        const a = A.value.split('\n'), b = B.value.split('\n');
        if (!A.value && !B.value) return out.warn('أدخل النصين أولاً');
        let ops; try { ops = lcsDiff(a.map(norm), b.map(norm)); } catch (e) { return out.error(e.message); }
        // أعد القيم الأصلية (غير المُنقّاة) للعرض
        let ia = 0, ib = 0; ops.forEach(o => { if (o.t === '=') { o.v = b[ib]; o.a = a[ia]; ia++; ib++; } else if (o.t === '-') { o.v = a[ia++]; } else { o.v = b[ib++]; } });
        const add = ops.filter(o => o.t === '+').length, del = ops.filter(o => o.t === '-').length;
        if (!add && !del) { out.ok('النصان متطابقان' + (ign.input.checked ? ' (مع تجاهل المسافات)' : '') + '.'); return; }
        out.info('أسطر مضافة: ' + add + ' — أسطر محذوفة: ' + del);
        // مجموعات التغيير
        const hunks = []; let cur = null; ops.forEach((o, idx) => { if (o.t === '=') { cur = null; } else { if (!cur) { cur = { del: [], add: [], at: idx, choice: 'B' }; hunks.push(cur); } (o.t === '-' ? cur.del : cur.add).push(o.v); o.h = cur; } });
        const view = h('div', { class: 'res' }); let lastH = null;
        ops.forEach(o => {
          const line = h('div', { class: o.t === '+' ? 'diff-add' : o.t === '-' ? 'diff-del' : '' }, (o.t === '+' ? '+ ' : o.t === '-' ? '- ' : '  ') + o.v);
          view.appendChild(line);
          if (o.h && o.h !== lastH) lastH = o.h; if (!o.h) lastH = null;
        });
        res.appendChild(ui.card('الفروق', view));
        const build = () => { const outL = []; let hk = null; ops.forEach(o => { if (o.t === '=') { outL.push(o.v); hk = null; } else if (o.h) { if (hk !== o.h) { hk = o.h; const c = o.h.choice; if (c === 'A' || c === 'AB') outL.push(...o.h.del); if (c === 'B' || c === 'AB') outL.push(...o.h.add); } } }); merged.value = outL.join('\n'); };
        const mc = h('div'); hunks.forEach((hk, i) => {
          const s = ui.select([['B', 'خذ B (الجديد)'], ['A', 'خذ A (الأصلي)'], ['AB', 'الاثنين (A ثم B)']], 'B'); s.addEventListener('change', () => { hk.choice = s.value; build(); });
          mc.appendChild(h('div', { class: 'field' }, h('label', { text: 'تغيير ' + (i + 1) + ': حذف ' + hk.del.length + ' / إضافة ' + hk.add.length }), s));
        });
        res.appendChild(ui.card('الدمج', h('p', { class: 'muted small', text: 'اختر لكل مجموعة تغييرات أي نسخة تريد، ثم انسخ الناتج.' }), mc, merged, ui.copyBtn(() => merged.value)));
        build();
      }, { kind: 'primary' });
      box.append(ui.card('النصان', ui.field('A — الأصلي', A), ui.field('B — الجديد', B), ign, go), out, res);
    },
  };

  /* ───────────── استوديو الترميز ───────────── */
  const u8ToB64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const b64ToU8 = b => { const bin = atob(b); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  const enc = new TextEncoder();
  const codecs = {
    'Base64': { e: s => u8ToB64(enc.encode(s)), d: s => bytesToText(b64ToU8(s.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.replace(/\s+/g, '').length / 4) * 4, '='))) },
    'Base64 URL-safe': { e: s => u8ToB64(enc.encode(s)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), d: s => bytesToText(b64ToU8(s.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.replace(/\s+/g, '').length / 4) * 4, '='))) },
    'URL (encodeURIComponent)': { e: s => encodeURIComponent(s), d: s => decodeURIComponent(s.replace(/\+/g, ' ')) },
    'URL كامل (encodeURI)': { e: s => encodeURI(s), d: s => decodeURI(s) },
    'HTML Entities': { e: s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])), d: s => { const t = document.createElement('textarea'); t.innerHTML = s; return t.value; } },
    'HTML Entities (كل غير ASCII)': { e: s => [...s].map(c => (c.codePointAt(0) > 127 || /[&<>"']/.test(c)) ? '&#' + c.codePointAt(0) + ';' : c).join(''), d: s => { const t = document.createElement('textarea'); t.innerHTML = s; return t.value; } },
    'Hex (UTF-8)': { e: s => OF.fmt.hex(enc.encode(s)).replace(/(..)/g, '$1 ').trim(), d: s => { const c = s.replace(/0x|[\s,:-]/gi, ''); if (!/^([0-9a-f]{2})*$/i.test(c)) throw new Error('نص Hex غير صالح'); return bytesToText(Uint8Array.from(c.match(/../g) || [], x => parseInt(x, 16))); } },
    'Binary (UTF-8)': { e: s => Array.from(enc.encode(s), b => b.toString(2).padStart(8, '0')).join(' '), d: s => { const c = s.replace(/\s+/g, ''); if (!/^[01]*$/.test(c) || c.length % 8) throw new Error('نص ثنائي غير صالح (يجب أن يكون من مضاعفات 8 بتات)'); return bytesToText(Uint8Array.from(c.match(/.{8}/g) || [], x => parseInt(x, 2))); } },
    'Unicode escape (\\uXXXX)': { e: s => [...s].map(c => { const cp = c.codePointAt(0); return cp > 127 ? (cp > 0xffff ? '\\u{' + cp.toString(16) + '}' : '\\u' + cp.toString(16).padStart(4, '0')) : c; }).join(''), d: s => s.replace(/\\u\{([0-9a-f]+)\}|\\u([0-9a-f]{4})/gi, (m, a, b) => String.fromCodePoint(parseInt(a || b, 16))) },
  };
  function bytesToText(u8) { try { return new TextDecoder('utf-8', { fatal: true }).decode(u8); } catch (e) { throw new Error('البيانات ليست نصاً UTF-8 صالحاً. Hex: ' + OF.fmt.hex(u8.subarray(0, 64)) + (u8.length > 64 ? '…' : '')); } }
  T['encoder-studio'] = {
    render(box) {
      const sel = ui.select(Object.keys(codecs)); const inp = ui.area({ rows: 6, placeholder: 'النص…' }); const outp = ui.area({ rows: 6, readonly: true }); const out = ui.out();
      const act = fn => () => { out.clear(); if (!inp.value) return out.warn('أدخل نصاً أولاً'); try { outp.value = codecs[sel.value][fn](inp.value); } catch (e) { outp.value = ''; out.error('تعذر التنفيذ: ' + (e.message || 'مدخل غير صالح')); } };
      box.append(ui.card('', ui.field('نوع الترميز', sel), ui.field('المدخل', inp), ui.row(ui.btn('ترميز', act('e'), { kind: 'primary' }), ui.btn('فك الترميز', act('d'))), out, ui.field('النتيجة', outp), ui.row(ui.copyBtn(() => outp.value), ui.btn('تبديل المدخل والنتيجة', () => { const t = inp.value; inp.value = outp.value; outp.value = t; }, { small: true }))));
    },
  };

  /* ───────────── Markdown ───────────── */
  T['markdown-workshop'] = {
    render(box) {
      const src = ui.area({ rows: 12, code: true, placeholder: '# عنوان\n\nنص **غامق** و*مائل*\n\n- نقطة' });
      src.value = OF.store.get('md-draft', '') ; // مسودة محلية فقط
      const prev = h('div', { class: 'mdbox' });
      const render = () => {
        try { const html = marked.parse(src.value || '', { gfm: true, breaks: true, async: false }); prev.innerHTML = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } }); prev.querySelectorAll('p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th').forEach(n => n.setAttribute('dir', 'auto')); }
        catch (e) { prev.textContent = 'خطأ في التحويل: ' + e.message; }
        OF.store.set('md-draft', src.value);
      };
      prev.addEventListener('click', e => { const a = e.target.closest('a'); if (a) { e.preventDefault(); ui.toast('الروابط معطّلة داخل المعاينة'); } });
      src.addEventListener('input', render); render();
      const exportHtml = () => {
        const body = DOMPurify.sanitize(marked.parse(src.value || '', { gfm: true, breaks: true, async: false }), { USE_PROFILES: { html: true } });
        return '<!doctype html><html lang="ar" dir="auto"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Document</title><style>body{font-family:system-ui,sans-serif;max-width:760px;margin:2rem auto;padding:0 1rem;line-height:1.7}pre,code{background:#f3f3f3;border-radius:4px;padding:2px 5px}pre{padding:12px;overflow:auto}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:6px 10px}blockquote{border-inline-start:4px solid #ccc;margin:0;padding-inline-start:1rem;color:#555}</style></head><body>' + body + '</body></html>';
      };
      const tb = ui.row(...[['عنوان', '# ', ''], ['غامق', '**', '**'], ['مائل', '*', '*'], ['قائمة', '\n- ', ''], ['كود', '`', '`'], ['رابط', '[', '](https://)']].map(([l, a, b]) => ui.btn(l, () => { const s = src.selectionStart, e = src.selectionEnd, v = src.value; src.value = v.slice(0, s) + a + v.slice(s, e) + b + v.slice(e); src.focus(); src.selectionStart = s + a.length; src.selectionEnd = e + a.length; render(); }, { small: true })));
      box.append(ui.card('المحرر', tb, src, h('p', { class: 'hint', text: 'المسودة تُحفظ محلياً على جهازك فقط.' })), ui.card('المعاينة', prev),
        ui.card('تصدير', ui.row(ui.btn('حفظ HTML', () => OF.download('document.html', exportHtml(), 'text/html;charset=utf-8'), { icon: 'save' }), ui.btn('حفظ .md', () => OF.download('document.md', src.value, 'text/markdown;charset=utf-8'), { icon: 'save' }), ui.copyBtn(exportHtml, 'نسخ HTML'))));
    },
  };

  /* ───────────── القصاصات والقوالب ───────────── */
  T['snippets'] = {
    render(box) {
      let items = OF.store.get('snippets', []); const save = () => OF.store.set('snippets', items);
      const q = ui.input({ placeholder: 'ابحث في القصاصات…' }), list = h('div'), out = ui.out();
      const title = ui.input({ placeholder: 'العنوان' }), body = ui.area({ rows: 5, placeholder: 'النص. استخدم {{اسم}} لمتغيّر يُملأ عند الاستخدام.' }); let editing = null;
      const form = ui.card('قصاصة جديدة', ui.field('', title), ui.field('', body));
      const saveBtn = ui.btn('حفظ', () => {
        out.clear(); if (!title.value.trim() || !body.value.trim()) return out.warn('العنوان والنص مطلوبان');
        if (editing) { Object.assign(editing, { title: title.value.trim(), body: body.value, ts: Date.now() }); } else items.unshift({ id: Date.now().toString(36), title: title.value.trim(), body: body.value, ts: Date.now() });
        if (!save()) out.warn('تعذر الحفظ المحلي (التخزين ممتلئ أو معطّل)'); else out.ok('تم الحفظ'); editing = null; title.value = body.value = ''; draw();
      }, { kind: 'primary', icon: 'save' });
      form.appendChild(ui.row(saveBtn, ui.btn('إلغاء التعديل', () => { editing = null; title.value = body.value = ''; })));
      function draw() {
        OF.clear(list); const w = OF.norm(q.value);
        const shown = items.filter(i => !w || OF.norm(i.title + ' ' + i.body).includes(w));
        if (!shown.length) list.appendChild(h('div', { class: 'empty', text: items.length ? 'لا نتائج.' : 'لا توجد قصاصات بعد.' }));
        shown.forEach(it => {
          const vars = [...new Set((it.body.match(/\{\{\s*([^{}]+?)\s*\}\}/g) || []).map(x => x.replace(/[{}\s]/g, '')))];
          const fills = {}; const fillBox = h('div'); vars.forEach(v => { const i = ui.input({ placeholder: v }); i.addEventListener('input', () => (fills[v] = i.value)); fillBox.appendChild(ui.field(v, i)); });
          const final = () => it.body.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (m, v) => (fills[v.trim()] != null && fills[v.trim()] !== '' ? fills[v.trim()] : m));
          list.appendChild(h('section', { class: 'card' }, h('h2', { text: it.title }), h('pre', { class: 'res', style: { maxHeight: '140px' } }, it.body), vars.length ? fillBox : null,
            ui.row(ui.copyBtn(final, vars.length ? 'نسخ بعد الملء' : 'نسخ'), ui.btn('تعديل', () => { editing = it; title.value = it.title; body.value = it.body; form.scrollIntoView(); }, { small: true }), ui.btn('حذف', () => { if (confirm('حذف «' + it.title + '»؟')) { items = items.filter(x => x !== it); save(); draw(); } }, { small: true, kind: 'danger', icon: 'trash' }))));
        });
      }
      q.addEventListener('input', draw);
      const imp = ui.files({ accept: '.json,application/json', label: 'استيراد من ملف JSON', maxMB: 5, onChange: async fs => { if (!fs[0]) return; out.clear(); try { const arr = JSON.parse(await OF.readText(fs[0])); if (!Array.isArray(arr)) throw new Error('الملف ليس مصفوفة'); let n = 0; arr.forEach(x => { if (x && typeof x.title === 'string' && typeof x.body === 'string') { items.push({ id: Date.now().toString(36) + n, title: x.title, body: x.body, ts: Date.now() }); n++; } }); save(); draw(); out.ok('تم استيراد ' + n + ' قصاصة'); } catch (e) { out.error('تعذر الاستيراد: ' + e.message); } imp.clear(); } });
      box.append(form, out, ui.card('القصاصات', q, list), ui.card('نسخ احتياطي', ui.btn('تصدير الكل JSON', () => items.length ? OF.download('snippets.json', JSON.stringify(items, null, 2), 'application/json') : ui.toast('لا توجد قصاصات', 'error'), { icon: 'save' }), imp));
      draw();
    },
  };
})();
