/* أداة «تنزيل فيديو من رابط» — واجهة فقط.
 * كل العمل الثقيل (الاستخراج، التنزيل، الدمج، الحفظ) في الطبقة الأصلية عبر OF.video (js/video-core.js)
 * الذي يتكلم مع بلاجن OmniVideo ثم OmniSave. هذا الملف لا يعرف أي محرك محدد. */
(function () {
  'use strict';
  const h = OF.h, ui = OF.ui, V = OF.video;
  const T = OF.tools;

  const GLYPH = { pending: '⏳', running: '↓', done: '✓', failed: '❌', cancelled: '⊘' };
  const STATUS_AR = { pending: 'في الانتظار', running: 'جارٍ التنزيل', done: 'اكتمل', failed: 'فشل', cancelled: 'أُلغي' };

  function progText(p) {
    if (!p) return '';
    if (p.text && p.stage !== 'download') return p.text + (p.pct != null ? ' ' + Math.round(p.pct) + '%' : '');
    const bits = [];
    if (p.pct != null) bits.push(p.pct.toFixed(p.pct >= 100 ? 0 : 1) + '%');
    if (p.total) bits.push((p.downloaded != null ? V.fmtSize(p.downloaded) + ' / ' : '') + V.fmtSize(p.total, p.approx));
    else if (p.downloaded) bits.push(V.fmtSize(p.downloaded));
    if (p.speed) bits.push(V.fmtSpeed(p.speed));
    if (p.eta) bits.push('المتبقي ' + p.eta);
    if (p.part > 1) bits.push('الجزء ' + p.part);
    return bits.join(' · ') || 'جارٍ التنزيل…';
  }

  /* خيارات الجودة كقائمة منسدلة مجمّعة (فيديو+صوت / صوت فقط / فيديو فقط) */
  function optionLabel(o) { return o.label + (o.size ? ' — ' + V.fmtSize(o.size, o.sizeApprox) : '') + ' — ' + o.sub; }

  T['video-link-downloader'] = {
    render(box) {
      let engine = { ready: null, ffmpeg: null }; // تُملأ من engineInfo
      let currentQueue = null; let busyToken = 0; const errLog = [];
      const nativeOK = V.available();

      const url = ui.input({ placeholder: 'https://example.com/video-page', dir: 'ltr', code: true, type: 'url' });
      const analyzeBtn = ui.btn('حلّل الرابط', null, { kind: 'primary', icon: 'wand' });
      const out = ui.out(); const result = h('div'); const panelHost = h('div');
      url.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); analyzeBtn.click(); } });

      const inputCard = ui.card('',
        nativeOK ? h('div', { class: 'msg info' }, OF.icon('info'), h('span', { text: 'يدعم مجموعة واسعة من مواقع ومنصات الفيديو، وقد يختلف الدعم حسب الموقع وتغيّراته. يعمل المحرك محلياً على جهازك بلا سيرفر.' }))
          : h('div', { class: 'msg warn' }, OF.icon('info'), h('span', { text: 'استخراج الفيديو يعمل داخل تطبيق أندرويد فقط (يلزم المحرك الأصلي). في المتصفح العادي استخدم «تنزيل الملفات وصفحات الويب» للروابط المباشرة.' })),
        ui.field('رابط صفحة الفيديو أو ملف مباشر', url), analyzeBtn,
        h('p', { class: 'hint', text: 'نزّل فقط ما تملك حق تنزيله. لا يتجاوز التطبيق DRM أو تسجيل الدخول أو أي حماية؛ المحتوى المحمي سيظهر سبب تعذّر تنزيله.' }));
      if (!nativeOK) analyzeBtn.disabled = true;

      /* ───── بطاقة المحرك (حالة + تحديث + تشخيص) ───── */
      const engKv = h('div', { class: 'muted small', text: nativeOK ? 'جارٍ فحص المحرك…' : 'المحرك الأصلي غير متاح في هذه البيئة.' });
      const engOut = ui.out();
      const updBtn = ui.btn('تحديث المحرك', null, { icon: 'refresh', small: true });
      const diagBtn = ui.btn('نسخ تقرير التشخيص', () => ui.copy(diagnostics()), { icon: 'copy', small: true });
      updBtn.disabled = !nativeOK;
      const engDetails = h('details', { class: 'limits' }, h('summary', { text: 'محرك الاستخراج والتشخيص' }), h('div', { style: { padding: '0 12px 12px' } }, engKv, h('div', { class: 'row', style: { marginTop: '8px' } }, updBtn, diagBtn), engOut,
        h('p', { class: 'hint', text: 'تحديث المحرك يجلب أحدث yt-dlp من الإنترنت (مفيد عندما يغيّر موقع طريقة عرض الفيديو).' })));
      function diagnostics() {
        return JSON.stringify({ app: 'OMNIFORGE ' + OF.version, ua: navigator.userAgent, engine, lastErrors: errLog.slice(-5) }, null, 2);
      }
      function showEngine(info) {
        engine = info; OF.clear(engKv);
        engKv.className = '';
        engKv.appendChild(ui.kv([['المحرك', info.engine || 'yt-dlp'], ['الحالة', info.ready ? 'جاهز' : 'غير جاهز' + (info.error ? ' — ' + info.error : '')], ['إصدار yt-dlp', info.ytdlpVersion], ['FFmpeg (دمج/تحويل)', info.ready ? (info.ffmpeg ? 'متوفر' : 'غير متوفر' + (info.ffmpegError ? ' — ' + info.ffmpegError : '')) : '']]));
      }
      if (nativeOK) V.engineInfo().then(showEngine).catch(e => { engKv.textContent = 'تعذّر فحص المحرك: ' + (e && e.message || e); });
      updBtn.addEventListener('click', async () => {
        updBtn.disabled = true; engOut.clear(); engOut.info('جارٍ تحديث المحرك… قد يستغرق دقيقة.');
        try { const r = await V.updateEngine(); engOut.clear(); engOut.ok(r.status === 'ALREADY_UP_TO_DATE' ? 'المحرك محدّث بالفعل' : 'تم تحديث المحرك' + (r.version ? ' (' + r.version + ')' : '')); showEngine(Object.assign({}, engine, { ytdlpVersion: r.version || engine.ytdlpVersion })); }
        catch (e) { engOut.clear(); engOut.error(e.message + (e.hint ? ' — ' + e.hint : '')); } finally { updBtn.disabled = false; }
      });

      /* ───── عرض الأخطاء بشكل موحّد ───── */
      function showError(e, target) {
        const er = V.toError(e); errLog.push({ t: new Date().toISOString(), code: er.code, detail: er.detail, raw: (er.raw || '').slice(0, 800) });
        const t = target || out; t.error(er.message);
        if (er.hint) t.info(er.hint);
        if (er.detail && er.code !== 'CANCELLED') t.add(h('details', { class: 'limits' }, h('summary', { text: 'تفاصيل تقنية' }), h('pre', { class: 'res', text: er.detail })));
      }

      /* ───── تشغيل طابور وعرض لوحته ───── */
      function runQueue(items, host) {
        if (currentQueue && currentQueue.running) return ui.toast('هناك تنزيل جارٍ بالفعل', 'error');
        OF.clear(host);
        const rows = [];
        const head = h('div', { class: 'vq-head' }); const list = h('div', { class: 'vq-list' }); const results = h('div'); const actions = h('div', { class: 'row', style: { marginTop: '8px' } });
        const cancelAll = ui.btn(items.length > 1 ? 'إيقاف الكل' : 'إيقاف', null, { kind: 'danger', icon: 'x', small: true });
        const retry = ui.btn('إعادة محاولة الفاشل', null, { icon: 'refresh', small: true }); retry.style.display = 'none';
        actions.append(cancelAll, retry);
        host.append(ui.card(items.length > 1 ? 'قائمة التنزيل' : 'التنزيل', head, list, actions, results));

        const q = V.createQueue(items, { onChange: update }); currentQueue = q;
        q.items.forEach(it => {
          const bar = ui.progress(); const ic = h('span', { class: 'vq-ic', text: GLYPH.pending }); const title = h('div', { class: 'vq-title', text: it.title || it.url }); const sub = h('div', { class: 'vq-sub muted small' });
          const x = ui.btn('', () => q.cancelItem(it.i), { icon: 'x', small: true }); x.setAttribute('aria-label', 'إلغاء هذا العنصر'); x.className += ' iconbtn';
          const el = h('div', { class: 'vq-item st-pending' }, ic, h('div', { class: 'vq-main' }, title, sub, bar), x);
          list.appendChild(el); rows[it.i] = { el, ic, sub, bar, x };
        });
        cancelAll.addEventListener('click', () => { q.cancelAll(); cancelAll.disabled = true; });
        retry.addEventListener('click', () => { retry.style.display = 'none'; cancelAll.disabled = false; q.retryFailed(); });

        function update() {
          const total = q.total; const done = q.done; const cur = q.current;
          head.textContent = total > 1 ? (q.running ? (Math.min(done + q.failed + (cur >= 0 ? 1 : 0), total)) : (done + q.failed + q.items.filter(x => x.status === 'cancelled').length)) + ' / ' + total + (q.running && cur >= 0 ? ' — الحالي: ' + (q.items[cur].title || '') : '') : '';
          q.items.forEach(it => {
            const r = rows[it.i]; r.el.className = 'vq-item st-' + it.status; r.ic.textContent = GLYPH[it.status];
            r.x.style.display = (it.status === 'pending' || it.status === 'running') && total > 1 ? '' : 'none';
            if (it.status === 'running') { const p = it.progress; r.sub.textContent = progText(p) || 'جارٍ التحضير…'; if (p && p.pct != null && p.stage !== 'merge') r.bar.set(p.pct, ''); else r.bar.set(null, ''); }
            else { r.bar.hide(); }
            if (it.status === 'pending') r.sub.textContent = STATUS_AR.pending;
            if (it.status === 'cancelled') r.sub.textContent = STATUS_AR.cancelled;
            if (it.status === 'failed') r.sub.textContent = 'السبب: ' + (it.error ? it.error.message + (it.error.detail && it.error.code === 'UNKNOWN' ? ' (' + it.error.detail + ')' : '') : '');
            if (it.status === 'done') r.sub.textContent = it.result ? it.result.name + ' — ' + OF.fmt.bytes(it.result.bytes) : STATUS_AR.done;
          });
          if (!q.running) {
            cancelAll.style.display = 'none';
            const bad = q.items.filter(x => x.status === 'failed' || x.status === 'cancelled').length; retry.style.display = bad ? '' : 'none';
            renderResults();
          } else { cancelAll.style.display = ''; }
        }
        function renderResults() {
          OF.clear(results);
          const okItems = q.items.filter(x => x.status === 'done'); const failed = q.items.filter(x => x.status === 'failed');
          const cancelled = q.items.filter(x => x.status === 'cancelled');
          if (okItems.length) {
            results.appendChild(h('div', { class: 'msg ok' }, OF.icon('check'), h('span', { text: 'اكتمل التنزيل' + (items.length > 1 ? ': ' + okItems.length + ' من ' + items.length : '') })));
            okItems.forEach(it => results.appendChild(ui.kv([['اسم الملف', it.result.name], ['الحجم', OF.fmt.bytes(it.result.bytes)], ['المكان', it.result.path]])));
          }
          failed.forEach(it => { const m = h('div', { class: 'msg error' }, OF.icon('x'), h('span', { text: (items.length > 1 ? 'فشل «' + (it.title || '') + '» — ' : '') + 'السبب: ' + it.error.message + (it.error.hint ? ' — ' + it.error.hint : '') })); results.appendChild(m); errLog.push({ t: new Date().toISOString(), code: it.error.code, detail: it.error.detail, raw: (it.error.raw || '').slice(0, 800) }); });
          if (cancelled.length && !okItems.length && !failed.length) results.appendChild(h('div', { class: 'msg warn' }, OF.icon('info'), h('span', { text: 'أُوقف التنزيل' })));
          else if (cancelled.length) results.appendChild(h('div', { class: 'msg warn' }, OF.icon('info'), h('span', { text: 'أُلغي ' + cancelled.length + ' عنصر' })));
        }
        update();
        q.start().then(() => { if (typeof host.onFinished === 'function') host.onFinished(q); });
        return q;
      }

      /* ───── فيديو واحد ───── */
      function renderSingle(info) {
        OF.clear(result); OF.clear(panelHost);
        const opts = V.buildOptions(info);
        if (!opts.length) { out.error('لم يُعثر على صيغ قابلة للتنزيل لهذا الفيديو'); return; }
        const sel = h('select', { 'aria-label': 'الجودة والصيغة' }); const detail = h('div', { class: 'hint' });
        ['av', 'a', 'v'].forEach(g => {
          const os = opts.filter(o => o.group === g); if (!os.length) return;
          const og = h('optgroup', { label: V.GROUP_LABELS[g] });
          os.forEach(o => { const needFF = (o.mux || o.convert) && engine.ffmpeg === false; og.appendChild(h('option', { value: o.key, text: optionLabel(o) + (needFF ? ' (يحتاج FFmpeg غير متاح)' : ''), disabled: needFF })); });
          sel.appendChild(og);
        });
        const pref = opts.filter(o => o.group === 'av' && (!o.height || o.height <= 1080))[0] || opts.find(o => o.group === 'av' && !o.mux) || opts.find(o => !((o.mux || o.convert) && engine.ffmpeg === false)) || opts[0];
        sel.value = pref.key;
        const optOf = () => opts.find(o => o.key === sel.value);
        const refreshDetail = () => { const o = optOf(); detail.textContent = [o.sub, o.size ? 'الحجم: ' + V.fmtSize(o.size, o.sizeApprox) : 'الحجم غير معروف', o.mux ? 'يتطلب دمج الصوت والفيديو (FFmpeg)' : (o.convert ? 'يتطلب تحويلاً (FFmpeg)' : '')].filter(Boolean).join(' · '); };
        sel.addEventListener('change', refreshDetail); refreshDetail();

        const thumb = info.thumbnail ? h('img', { class: 'vthumb', src: info.thumbnail, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : h('div', { class: 'vthumb ph' }, OF.icon('video'));
        thumb.addEventListener && thumb.addEventListener('error', () => { const ph = h('div', { class: 'vthumb ph' }, OF.icon('video')); thumb.replaceWith(ph); });
        const meta = [info.duration ? V.fmtDur(info.duration) : '', info.uploader || '', info.direct ? 'ملف مباشر' : (info.extractor || '')].filter(Boolean).join(' · ');
        const dl = ui.btn('تنزيل', null, { kind: 'primary', icon: 'download' });
        const rawRows = (info.formats || []).map(f => h('tr', null, [f.id, f.ext, f.height ? f.height + 'p' : (f.kind === 'a' ? 'صوت' : '—'), f.vcodec || '—', f.acodec || '—', f.size ? V.fmtSize(f.size, f.sizeApprox) : '—', { av: 'فيديو+صوت', v: 'فيديو فقط', a: 'صوت فقط' }[f.kind]].map(x => h('td', { text: x }))));
        const tech = h('details', { class: 'limits' }, h('summary', { text: 'كل الصيغ المتاحة (' + (info.formats || []).length + ')' }), h('div', { class: 'tbl-wrap', style: { margin: '0 12px 12px' } }, h('table', { class: 'data' }, h('thead', null, h('tr', null, ['المعرّف', 'الامتداد', 'الدقة', 'فيديو', 'صوت', 'الحجم', 'النوع'].map(x => h('th', { text: x })))), h('tbody', null, rawRows))));
        result.appendChild(ui.card('', h('div', { class: 'vhead' }, thumb, h('div', { class: 'vmeta' }, h('div', { class: 'vtitle', text: info.title || 'بدون عنوان' }), h('div', { class: 'muted small', text: meta }))),
          ui.field('الجودة / الصيغة', sel), detail, h('div', { style: { marginTop: '10px' } }, dl), tech));
        dl.addEventListener('click', () => {
          const o = optOf(); if (!o) return;
          if ((o.mux || o.convert) && engine.ffmpeg === false) return showError(V.fail('FFMPEG_MISSING'));
          out.clear(); dl.disabled = true;
          const q = runQueue([{ title: info.title || 'video', url: info.url, direct: !!info.direct, option: { selector: o.selector, mux: !!o.mux, audio: o.audio || '', ext: o.ext, size: o.size || 0 } }], panelHost);
          panelHost.onFinished = () => { dl.disabled = false; };
        });
      }

      /* ───── عدة فيديوهات ───── */
      function renderPlaylist(info) {
        OF.clear(result); OF.clear(panelHost);
        const entries = info.entries; const checks = [];
        const presetSel = ui.select(V.PRESETS.map(p => [p.id, p.label]), 'h720');
        const countEl = h('span', { class: 'muted small' }); const dl = ui.btn('تنزيل المحدد', null, { kind: 'primary', icon: 'download' });
        const allBtn = ui.btn('تحديد الكل', () => { checks.forEach(c => (c.checked = true)); upd(); }, { small: true, icon: 'check' });
        const noneBtn = ui.btn('إلغاء تحديد الكل', () => { checks.forEach(c => (c.checked = false)); upd(); }, { small: true, icon: 'x' });
        const list = h('div', { class: 'vlist' });
        entries.forEach((e, i) => {
          const cb = h('input', { type: 'checkbox', checked: true, 'aria-label': 'تحديد الفيديو ' + (i + 1) }); cb.addEventListener('change', upd); checks.push(cb);
          const th = e.thumbnail ? h('img', { class: 'vthumb sm', src: e.thumbnail, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : h('div', { class: 'vthumb sm ph' }, OF.icon('video'));
          if (e.thumbnail) th.addEventListener('error', () => th.replaceWith(h('div', { class: 'vthumb sm ph' }, OF.icon('video'))));
          list.appendChild(h('label', { class: 'vrow' }, cb, th, h('div', { class: 'vmeta' }, h('div', { class: 'vtitle', text: e.title || ('فيديو ' + (i + 1)) }), h('div', { class: 'muted small', text: [e.duration ? V.fmtDur(e.duration) : '', e.uploader || ''].filter(Boolean).join(' · ') }))));
        });
        function upd() { const n = checks.filter(c => c.checked).length; countEl.textContent = 'المحدد: ' + n + ' من ' + entries.length; dl.textContent = ''; dl.append(OF.icon('download'), 'تنزيل المحدد (' + n + ')'); dl.disabled = !n || (currentQueue && currentQueue.running); }
        const note = entries.length >= 100 ? h('p', { class: 'hint', text: 'عُرض أول 100 فيديو فقط.' }) : null;
        result.appendChild(ui.card(info.title || 'فيديوهات الصفحة', h('div', { class: 'msg ok' }, OF.icon('check'), h('span', { text: 'تم العثور على ' + entries.length + ' فيديو' })), note,
          ui.field('الجودة لكل المحدد', presetSel, 'تُطبَّق على كل الفيديوهات المحددة؛ إن لم تتوفر الجودة المطلوبة يُختار أقرب خيار متاح.'),
          h('div', { class: 'row' }, allBtn, noneBtn, countEl), list, h('div', { style: { marginTop: '10px' } }, dl)));
        upd();
        dl.addEventListener('click', () => {
          const p = V.PRESETS.find(x => x.id === presetSel.value) || V.PRESETS[0];
          if ((p.mux || p.convert) && engine.ffmpeg === false) return showError(V.fail('FFMPEG_MISSING'));
          const used = new Map(); const items = [];
          entries.forEach((e, i) => {
            if (!checks[i].checked) return;
            let t = V.safeName(e.title, 'فيديو ' + (i + 1)); const k = t.toLowerCase(); const n = (used.get(k) || 0) + 1; used.set(k, n); if (n > 1) t += ' (' + n + ')';
            const d = V.directMedia(e.url); const direct = !!d && p.kind === 'av';
            items.push({ title: t, url: e.url, direct, option: { selector: p.selector, mux: !!p.mux, audio: p.audio || '', ext: d ? d.ext : '', size: 0 } });
          });
          if (!items.length) return;
          out.clear(); checks.forEach(c => (c.disabled = true)); [allBtn, noneBtn, dl, presetSel].forEach(b => (b.disabled = true));
          runQueue(items, panelHost);
          panelHost.onFinished = () => { checks.forEach(c => (c.disabled = false)); [allBtn, noneBtn, presetSel].forEach(b => (b.disabled = false)); upd(); };
        });
      }

      /* ───── التحليل ───── */
      ui.task(analyzeBtn, out, async t => {
        const my = ++busyToken; OF.clear(result);
        let u; try { u = OF.cleanUrl(url.value); } catch (e) { showError(V.fail('INVALID_URL')); return; }
        t.progress(null, 'جارٍ تحليل الرابط… (قد يستغرق حتى دقيقة في أول مرة)');
        let info;
        try {
          info = await V.extract(u.href);
          if (info.kind === 'playlist' && info.entries.length === 1) { t.progress(null, 'جارٍ جلب تفاصيل الفيديو…'); info = await V.extract(info.entries[0].url); }
        } catch (e) { if (my === busyToken) showError(e); return; }
        if (my !== busyToken) return;
        if (info.kind === 'playlist') renderPlaylist(info); else renderSingle(info);
      });

      box.append(inputCard, out, result, panelHost, engDetails);
    },
  };
})();
