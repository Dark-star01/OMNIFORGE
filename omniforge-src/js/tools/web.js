/* أدوات الويب: الروابط، API، فحص المواقع والشبكة، الساحة، التنزيل */
(function () {
  'use strict';
  const { h, ui } = OF;
  const T = OF.tools;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const VIDEO_HOSTS = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|tiktok\.com|facebook\.com|fb\.watch|instagram\.com|twitter\.com|x\.com|dailymotion\.com|twitch\.tv|netflix\.com|shahid\.net)$/i;

  /* ───────────── ورشة الروابط ───────────── */
  T['url-workshop'] = {
    render(box) {
      const inp = ui.input({ placeholder: 'https://example.com/path?a=1&b=2#frag', dir: 'ltr', code: true }); const out = ui.out(); const q = h('div'); let url = null; const rebuilt = ui.area({ rows: 2, code: true, readonly: true });
      const rowsEl = h('div'); let params = [];
      const renderParams = () => { OF.clear(rowsEl); params.forEach((p, i) => { const k = ui.input({ value: p[0], dir: 'ltr', code: true, placeholder: 'المفتاح' }), v = ui.input({ value: p[1], dir: 'ltr', code: true, placeholder: 'القيمة' }); k.addEventListener('input', () => { p[0] = k.value; rebuild(); }); v.addEventListener('input', () => { p[1] = v.value; rebuild(); }); rowsEl.appendChild(h('div', { class: 'row', style: { marginBottom: '6px' } }, h('div', { class: 'grow' }, k), h('div', { class: 'grow' }, v), ui.btn('✕', () => { params.splice(i, 1); renderParams(); rebuild(); }, { small: true, kind: 'danger' }))); }); };
      const rebuild = () => { if (!url) return; const u = new URL(url.href); u.search = ''; params.filter(p => p[0] !== '').forEach(p => u.searchParams.append(p[0], p[1])); rebuilt.value = u.href; };
      const go = () => { out.clear(); OF.clear(q); url = null; let s = inp.value.trim(); if (!s) return out.warn('أدخل رابطاً'); try { url = new URL(s); } catch (e) { try { url = new URL('https://' + s); out.info('أُضيف https:// تلقائياً'); } catch (e2) { return out.error('الرابط غير صالح'); } }
        out.kv([['البروتوكول', url.protocol], ['المستخدم', url.username], ['كلمة المرور', url.password ? '(موجودة — لا تشاركها)' : ''], ['المضيف', url.hostname], ['المنفذ', url.port || '(الافتراضي)'], ['المسار', url.pathname], ['الاستعلام', url.search], ['الجزء #', url.hash], ['الأصل (origin)', url.origin]]);
        if (url.password) out.warn('الرابط يحتوي كلمة مرور بنص صريح.'); params = Array.from(url.searchParams.entries()); renderParams(); rebuild(); q.appendChild(ui.card('معاملات الاستعلام (قابلة للتعديل)', rowsEl, ui.btn('+ معامل', () => { params.push(['', '']); renderParams(); }, { small: true }), ui.field('الرابط الناتج', rebuilt), ui.copyBtn(() => rebuilt.value))); };
      const enc = ui.area({ rows: 3, placeholder: 'نص للترميز/الفك' }); const encOut = ui.area({ rows: 3, readonly: true, code: true });
      box.append(ui.card('', ui.field('الرابط', inp), ui.btn('حلّل', go, { kind: 'primary' }), h('p', { class: 'hint', text: 'التحليل محلي بالكامل — لا يتصل التطبيق بالرابط.' })), out, q,
        ui.card('ترميز / فك ترميز', enc, ui.row(ui.btn('ترميز', () => (encOut.value = encodeURIComponent(enc.value))), ui.btn('فك', () => { try { encOut.value = decodeURIComponent(enc.value.replace(/\+/g, ' ')); } catch (e) { encOut.value = ''; ui.toast('نص مُرمّز غير صالح', 'error'); } })), encOut));
    },
  };

  /* ───────────── مختبر API ───────────── */
  function parseHeaders(txt) { const o = {}; txt.split('\n').map(l => l.trim()).filter(Boolean).forEach(l => { const i = l.indexOf(':'); if (i < 1) throw new Error('ترويسة غير صالحة: «' + l + '» (الصيغة Name: value)'); o[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }); return o; }
  T['api-lab'] = {
    render(box) {
      const method = ui.select(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'], 'GET'); const url = ui.input({ placeholder: 'https://api.example.com/items', dir: 'ltr', code: true }); const hd = ui.area({ rows: 3, code: true, placeholder: 'Authorization: Bearer …\nAccept: application/json' }); const body = ui.area({ rows: 5, code: true, placeholder: '{"name":"value"}' }); const ctype = ui.select([['', 'بدون'], ['application/json', 'JSON'], ['application/x-www-form-urlencoded', 'Form'], ['text/plain', 'Text']], 'application/json'); const out = ui.out(); const btn = ui.btn('أرسل', null, { kind: 'primary', icon: 'send' });
      const engine = OF.http.engine(); const curlOut = ui.area({ rows: 3, code: true, readonly: true });
      box.append(ui.card('', h('div', { class: 'msg info' }, OF.icon('info'), h('span', { text: engine === 'native' ? 'المحرك: أصلي (لا يتأثر بـCORS).' : 'المحرك: المتصفح — تخضع الطلبات لسياسة CORS، وقد تفشل مع مواقع كثيرة خارج APK.' })), ui.row(h('div', { style: { width: '120px' } }, ui.field('الطريقة', method)), h('div', { class: 'grow' }, ui.field('الرابط', url))), ui.field('الترويسات (سطر لكل ترويسة)', hd, 'لا تُحفظ المفاتيح ولا الطلبات.'), ui.field('نوع المحتوى', ctype), ui.field('الجسم', body), ui.row(btn, ui.btn('انسخ كـ curl', () => { try { const u = OF.cleanUrl(url.value); const hs = parseHeaders(hd.value); if (ctype.value && body.value) hs['Content-Type'] = ctype.value; const q = s => "'" + String(s).replace(/'/g, "'\\''") + "'"; const c = 'curl -X ' + method.value + ' ' + q(u.href) + Object.entries(hs).map(([k, v]) => ' -H ' + q(k + ': ' + v)).join('') + (body.value && !['GET', 'HEAD'].includes(method.value) ? ' --data-raw ' + q(body.value) : ''); curlOut.value = c; ui.copy(c); } catch (e) { out.clear(); out.error(e.message); } }, { small: true }))), out, curlOut);
      ui.task(btn, out, async () => {
        const u = OF.cleanUrl(url.value); const hs = parseHeaders(hd.value); if (ctype.value && body.value && !Object.keys(hs).some(k => k.toLowerCase() === 'content-type')) hs['Content-Type'] = ctype.value; if (ctype.value === 'application/json' && body.value) { try { JSON.parse(body.value); } catch (e) { throw new Error('جسم JSON غير صالح: ' + e.message); } }
        const r = await OF.http.request({ url: u.href, method: method.value, headers: hs, body: method.value === 'GET' || method.value === 'HEAD' ? '' : body.value, timeoutMs: 25000 }); const ok = r.status >= 200 && r.status < 300;
        (ok ? out.ok : out.warn)('الحالة: ' + r.status + ' ' + (r.statusText || '') + ' — ' + r.ms + ' ms — ' + OF.fmt.bytes(r.bytes.length) + (r.truncated ? ' (اقتُطعت الاستجابة)' : '') + ' — محرك: ' + r.engine);
        out.add(h('details', { class: 'limits' }, h('summary', { text: 'ترويسات الاستجابة (' + Object.keys(r.headers).length + ')' }), h('pre', { class: 'res' }, Object.entries(r.headers).map(([k, v]) => k + ': ' + v).join('\n'))));
        let shown = r.text; const ct = Object.entries(r.headers).find(([k]) => k.toLowerCase() === 'content-type'); if (ct && /json/i.test(ct[1])) { try { shown = JSON.stringify(JSON.parse(r.text), null, 2); } catch (e) { /* اترك النص */ } }
        if (ct && /^(image|audio|video)\//i.test(ct[1])) shown = '[محتوى ثنائي ' + ct[1] + ' — ' + OF.fmt.bytes(r.bytes.length) + ']'; if (shown.length > 1e6) shown = shown.slice(0, 1e6) + '\n… (اقتُطع العرض عند 1 مليون حرف)';
        out.pre(shown || '(جسم فارغ)'); out.add(ui.row(ui.copyBtn(() => r.text), ui.btn('حفظ الاستجابة', () => OF.save(new Blob([r.bytes]), 'response' + (ct && /json/.test(ct[1]) ? '.json' : '.txt'), 'application/octet-stream'), { small: true, icon: 'save' })));
      });
    },
  };

  /* ───────────── فحص المواقع والشبكة ───────────── */
  T['network-tools'] = {
    render(box) {
      OF.clear(box);
      box.appendChild(ui.tabs([
        { id: 'site', label: 'فحص موقع', render(p) {
          const url = ui.input({ placeholder: 'https://example.com', dir: 'ltr', code: true }); const out = ui.out(); const btn = ui.btn('افحص', null, { kind: 'primary' }); p.append(ui.card('', ui.field('الرابط', url, 'يُرسل طلب GET إلى الموقع من جهازك مباشرة.'), btn), out);
          ui.task(btn, out, async () => { const u = OF.cleanUrl(url.value); const r = await OF.http.request({ url: u.href, method: 'GET', timeoutMs: 20000, maxBytes: 3 * 1048576 }); const hk = k => { const e = Object.entries(r.headers).find(([x]) => x.toLowerCase() === k); return e ? e[1] : ''; };
            out.kv([['الحالة', r.status + ' ' + (r.statusText || '')], ['الرابط النهائي', r.url !== u.href ? r.url : '(بدون تحويل)'], ['الزمن', r.ms + ' ms'], ['الحجم المستلم', OF.fmt.bytes(r.bytes.length) + (r.truncated ? ' (اقتُطع)' : '')], ['النوع', hk('content-type')], ['الخادم', hk('server')], ['التخزين المؤقت', hk('cache-control')]]);
            const sec = [['Strict-Transport-Security', 'strict-transport-security'], ['Content-Security-Policy', 'content-security-policy'], ['X-Frame-Options', 'x-frame-options'], ['X-Content-Type-Options', 'x-content-type-options'], ['Referrer-Policy', 'referrer-policy']]; out.add(ui.card('ترويسات الأمان', ui.kv(sec.map(([n, k]) => [n, hk(k) ? '✔ ' + hk(k).slice(0, 80) : '✘ غير موجودة']))));
            if (/html/i.test(hk('content-type') || '') || /^\s*<(!doctype|html)/i.test(r.text.slice(0, 200))) { const d = new DOMParser().parseFromString(r.text, 'text/html'); const meta = n => { const e = d.querySelector('meta[name="' + n + '"],meta[property="' + n + '"]'); return e ? e.getAttribute('content') : ''; }; const canon = d.querySelector('link[rel="canonical"]');
              out.add(ui.card('الصفحة', ui.kv([['العنوان', d.title], ['الوصف', meta('description')], ['og:title', meta('og:title')], ['اللغة', d.documentElement.getAttribute('lang')], ['canonical', canon && canon.href], ['الروابط', d.querySelectorAll('a[href]').length], ['الصور', d.querySelectorAll('img').length], ['السكربتات', d.querySelectorAll('script').length], ['ملفات CSS', d.querySelectorAll('link[rel="stylesheet"]').length]]))); }
            out.info('هذه المعلومات كما يعيدها الخادم لطلب عام؛ لا تُظهر محتوى مخفياً أو متطلباً لتسجيل الدخول.'); });
        } },
        { id: 'dns', label: 'DNS', render(p) {
          const name = ui.input({ placeholder: 'example.com', dir: 'ltr', code: true }); const type = ui.select(['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME', 'SOA', 'CAA'], 'A'); const ok = ui.check('أوافق على إرسال اسم النطاق إلى Cloudflare (cloudflare-dns.com) لإجراء الاستعلام'); const out = ui.out(); const btn = ui.btn('استعلم', null, { kind: 'primary' });
          p.append(ui.card('', ui.field('النطاق', name), ui.field('النوع', type), ok, btn), out);
          ui.task(btn, out, async () => { const n = name.value.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, ''); if (!/^[a-z0-9.-]+$/i.test(n) || !n.includes('.')) throw new Error('أدخل اسم نطاق صالحاً مثل example.com'); if (!ok.input.checked) throw new Error('يلزم الموافقة على إرسال اسم النطاق إلى الخدمة الخارجية'); const r = await OF.http.request({ url: 'https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(n) + '&type=' + type.value, headers: { accept: 'application/dns-json' }, timeoutMs: 15000 }); if (r.status !== 200) throw new Error('الخدمة أعادت الحالة ' + r.status); const j = JSON.parse(r.text); const codes = { 0: 'NOERROR', 2: 'SERVFAIL', 3: 'NXDOMAIN', 5: 'REFUSED' };
            out.ok('الاستجابة: ' + (codes[j.Status] || j.Status) + ' — ' + r.ms + ' ms'); if (!j.Answer || !j.Answer.length) return out.info('لا توجد سجلات من هذا النوع.'); out.add(h('div', { class: 'tbl-wrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, ['الاسم', 'النوع', 'TTL', 'البيانات'].map(x => h('th', { text: x })))), h('tbody', null, j.Answer.map(a => h('tr', null, h('td', { class: 'mono', text: a.name }), h('td', { text: a.type }), h('td', { text: a.TTL }), h('td', { class: 'mono', text: a.data }))))))); });
        } },
        { id: 'lat', label: 'زمن الاستجابة', render(p) {
          const url = ui.input({ placeholder: 'https://example.com', dir: 'ltr', code: true }); const n = ui.input({ type: 'number', value: 5, min: 1, max: 20 }); const out = ui.out(); const btn = ui.btn('قِس', null, { kind: 'primary' }); const c = navigator.connection || {};
          p.append(ui.card('حالة الاتصال', ui.kv([['متصل', navigator.onLine ? 'نعم' : 'لا'], ['النوع الفعلي', c.effectiveType], ['السرعة التقديرية', c.downlink != null ? c.downlink + ' Mbps' : ''], ['RTT تقديري', c.rtt != null ? c.rtt + ' ms' : '']]), h('p', { class: 'hint', text: 'القيم التقديرية من المتصفح وقد لا تتوفر.' })), ui.card('', ui.field('الرابط', url), ui.field('عدد المحاولات', n), btn, h('p', { class: 'hint', text: 'يقيس زمن طلب HTTP كامل (ليس ICMP ping).' })), out);
          ui.task(btn, out, async t => { const u = OF.cleanUrl(url.value); const N = clamp(Math.floor(+n.value) || 5, 1, 20); const times = []; for (let i = 0; i < N; i++) { t.check(); t.progress(i / N * 100, 'محاولة ' + (i + 1)); const t0 = performance.now(); try { if (OF.native()) await OF.http.request({ url: u.href, method: 'HEAD', timeoutMs: 10000 }); else await fetch(u.href + (u.search ? '&' : '?') + '_t=' + Date.now(), { mode: 'no-cors', cache: 'no-store' }); times.push(Math.round(performance.now() - t0)); } catch (e) { times.push(null); } }
            const ok = times.filter(x => x != null); if (!ok.length) throw new Error('فشلت كل المحاولات: لا اتصال أو الرابط غير قابل للوصول'); out.kv([['المحاولات الناجحة', ok.length + '/' + N], ['الأدنى', Math.min(...ok) + ' ms'], ['المتوسط', Math.round(ok.reduce((a, b) => a + b, 0) / ok.length) + ' ms'], ['الأعلى', Math.max(...ok) + ' ms'], ['التفاصيل', times.map(x => (x == null ? 'فشل' : x)).join(' | ')]]); }, { cancelable: true });
        } },
      ]));
    },
  };

  /* ───────────── ساحة HTML/CSS/JS ───────────── */
  T['html-playground'] = {
    render(box) {
      const html = ui.area({ rows: 7, code: true, value: '<h1 id="t">مرحباً OMNIFORGE</h1>\n<button id="b">اضغط</button>' }); const css = ui.area({ rows: 5, code: true, value: 'body{font-family:sans-serif;padding:1rem}\nbutton{padding:.6rem 1rem}' }); const js = ui.area({ rows: 5, code: true, value: "document.getElementById('b').onclick=()=>{console.log('تم الضغط');document.getElementById('t').style.color='tomato'}" });
      const net = ui.check('السماح للصفحة بالوصول إلى الشبكة (صور/طلبات خارجية)'); const frame = h('iframe', { class: 'sandbox', sandbox: 'allow-scripts', title: 'معاينة' }); const con = h('pre', { class: 'res', style: { minHeight: '60px' } }, 'وحدة التحكم…');
      const onMsg = e => { if (e.source !== frame.contentWindow || !e.data || e.data.__of !== 1) return; con.textContent += '\n' + e.data.lvl + ': ' + String(e.data.msg).slice(0, 500); };
      window.addEventListener('message', onMsg);
      const run = () => { con.textContent = 'وحدة التحكم…'; const csp = net.input.checked ? "default-src * data: blob: 'unsafe-inline'" : "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; media-src data: blob:; font-src data:"; const hook = "<script>(function(){var s=function(l){return function(){var a=[].slice.call(arguments).map(function(x){try{return typeof x==='object'?JSON.stringify(x):String(x)}catch(e){return String(x)}}).join(' ');parent.postMessage({__of:1,lvl:l,msg:a},'*')}};console.log=s('log');console.warn=s('warn');console.error=s('error');window.onerror=function(m,u,l){s('error')(m+' (سطر '+l+')')}})();<\/script>"; frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + csp + '"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css.value.replace(/<\/style/gi, '<\\/style') + '</style>' + hook + '</head><body>' + html.value + '<script>' + js.value.replace(/<\/script/gi, '<\\/script') + '<\/script></body></html>'; };
      box.append(ui.card('HTML', html), ui.card('CSS', css), ui.card('JavaScript', js), ui.card('', net, ui.btn('شغّل', run, { kind: 'primary', icon: 'play' }), h('p', { class: 'hint', text: 'يعمل داخل إطار معزول (sandbox) بلا وصول إلى بيانات التطبيق أو ملفاتك.' })), ui.card('المعاينة', frame, con));
      run(); return () => window.removeEventListener('message', onMsg);
    },
  };

  /* ───────────── التنزيل وحفظ الصفحات ───────────── */
  function nameFromUrl(u) { try { const n = decodeURIComponent(new URL(u).pathname.split('/').pop() || ''); return n || 'download'; } catch (e) { return 'download'; } }
  T['downloader'] = {
    render(box) {
      OF.clear(box);
      box.appendChild(ui.tabs([
        { id: 'file', label: 'ملف مباشر', render(p) {
          const url = ui.input({ placeholder: 'https://example.com/file.zip', dir: 'ltr', code: true }); const name = ui.input({ placeholder: 'اسم الملف (اختياري)', dir: 'ltr' }); const out = ui.out(); const btn = ui.btn('نزّل', null, { kind: 'primary', icon: 'download' }); const nat = OF.native();
          p.append(ui.card('', h('div', { class: 'msg info' }, OF.icon('info'), h('span', { text: nat && nat.download ? 'التنزيل الأصلي: يُحفظ مباشرة في التنزيلات/OMNIFORGE مع تقدم حقيقي.' : 'وضع المتصفح: يُحمَّل الملف في الذاكرة (حتى 300 MB) ويخضع لـCORS.' })), ui.field('الرابط المباشر', url), ui.field('اسم الملف', name), btn, h('p', { class: 'hint', text: 'نزّل فقط ما تملك حق الوصول إليه. لا يتجاوز هذا الأداة تسجيل الدخول أو الحماية.' })), out);
          let cancelFn = null; const holder = ui.task(btn, out, async t => {
            const u = OF.cleanUrl(url.value); if (VIDEO_HOSTS.test(u.hostname)) throw new Error('هذا الرابط يخص منصة فيديو/خدمة بث ولا يقدّم ملفاً مباشراً. استخدم أداة «تنزيل فيديو من رابط» (تحليل الصفحة واختيار الجودة)، أو ضع رابط ملف مباشر تملك حق تنزيله هنا.');
            const fname = (name.value.trim() || nameFromUrl(u.href)).replace(/[\\/:*?"<>|]+/g, '_');
            if (nat && nat.download) { let off = null; try { if (nat.addListener) off = await nat.addListener('downloadProgress', e => t.progress(e.total > 0 ? e.received / e.total * 100 : null, OF.fmt.bytes(e.received) + (e.total > 0 ? ' / ' + OF.fmt.bytes(e.total) : ''))); } catch (e) { /* بدون تقدم */ } t.progress(null, 'بدء التنزيل…'); cancelFn = () => nat.cancelDownload && nat.cancelDownload();
              try { const r = await nat.download({ url: u.href, name: fname }); out.ok('تم التنزيل: ' + (r.path || fname) + ' — ' + OF.fmt.bytes(r.bytes)); if (/text\/html/i.test(r.contentType || '')) out.warn('نوع المحتوى HTML: قد يكون الرابط صفحة وليس ملفاً.'); } catch (e) { if (t.cancelled) { const er = new Error('أُوقف التنزيل'); er.name = 'AbortError'; throw er; } throw new Error('فشل التنزيل: ' + (e.message || e)); } finally { if (off && off.remove) off.remove(); cancelFn = null; } return; }
            const ctl = new AbortController(); cancelFn = () => ctl.abort(); let r; try { r = await fetch(u.href, { signal: ctl.signal }); } catch (e) { if (t.cancelled) { const er = new Error('أُوقف التنزيل'); er.name = 'AbortError'; throw er; } throw new Error('تعذّر الاتصال: قد يمنعه CORS في المتصفح، أو لا يوجد اتصال. (داخل APK يعمل التنزيل الأصلي.)'); }
            if (!r.ok) throw new Error('الخادم أعاد الحالة ' + r.status); const total = +r.headers.get('content-length') || 0; if (total > 300 * 1048576) throw new Error('الملف أكبر من 300 MB (حد وضع المتصفح).'); if (/text\/html/i.test(r.headers.get('content-type') || '')) out.warn('نوع المحتوى HTML: قد يكون الرابط صفحة وليس ملفاً.');
            const reader = r.body.getReader(); const parts = []; let got = 0; for (;;) { if (t.cancelled) { ctl.abort(); const er = new Error('أُوقف التنزيل'); er.name = 'AbortError'; throw er; } const { done, value } = await reader.read(); if (done) break; parts.push(value); got += value.length; if (got > 300 * 1048576) { ctl.abort(); throw new Error('تجاوز الحجم 300 MB'); } t.progress(total ? got / total * 100 : null, OF.fmt.bytes(got) + (total ? ' / ' + OF.fmt.bytes(total) : '')); }
            const blob = new Blob(parts, { type: r.headers.get('content-type') || 'application/octet-stream' }); out.ok('اكتمل: ' + OF.fmt.bytes(blob.size)); out.add(ui.saveRow(fname, blob)); }, { cancelable: true });
          holder.addEventListener('click', e => { if (e.target.closest('.btn.danger') && cancelFn) cancelFn(); });
        } },
        { id: 'page', label: 'حفظ صفحة ويب', render(p) {
          const url = ui.input({ placeholder: 'https://example.com/page', dir: 'ltr', code: true }); const base = ui.check('إضافة <base> لتعمل الروابط النسبية عند الفتح', true); const out = ui.out(); const btn = ui.btn('احفظ المصدر', null, { kind: 'primary' });
          p.append(ui.card('', h('div', { class: 'msg warn' }, OF.icon('info'), h('span', { text: 'يحفظ مصدر HTML كما يعيده الخادم فقط (بدون الصور وCSS وJS). الصفحات الديناميكية (التي تُبنى بـJavaScript) لن تُحفظ كاملة.' })), ui.field('الرابط', url), base, btn), out);
          ui.task(btn, out, async () => { const u = OF.cleanUrl(url.value); const r = await OF.http.request({ url: u.href, timeoutMs: 25000, maxBytes: 8 * 1048576 }); if (r.status >= 400) throw new Error('الخادم أعاد الحالة ' + r.status); let html = r.text; const ct = Object.entries(r.headers).find(([k]) => k.toLowerCase() === 'content-type'); if (ct && !/html|xml|text/i.test(ct[1])) throw new Error('المحتوى ليس صفحة نصية (' + ct[1] + ')؛ استخدم تبويب «ملف مباشر».'); const d = new DOMParser().parseFromString(html, 'text/html');
            if (base.input.checked && !/<base\s/i.test(html)) { const m = /<head[^>]*>/i.exec(html); const tag = '<base href="' + (r.url || u.href).replace(/"/g, '&quot;') + '">'; html = m ? html.slice(0, m.index + m[0].length) + tag + html.slice(m.index + m[0].length) : tag + html; }
            out.ok('تم جلب الصفحة: ' + OF.fmt.bytes(r.bytes.length) + (r.truncated ? ' (اقتُطعت)' : '')); out.kv([['العنوان', d.title], ['الرابط النهائي', r.url]]); const fn = (d.title || u.hostname).replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60) || 'page'; out.add(ui.saveRow(fn + '.html', new Blob([html], { type: 'text/html;charset=utf-8' }))); });
        } },
      ]));
    },
  };
})();
