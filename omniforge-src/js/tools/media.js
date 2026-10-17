/* أدوات الوسائط: الصوت، الترجمة، الفيديو */
(function () {
  'use strict';
  const { h, ui } = OF;
  const T = OF.tools;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  /* ───────────── الصوت ───────────── */
  let actx = null; const ctx = () => (actx || (actx = new (window.AudioContext || window.webkitAudioContext)()));
  async function decodeFile(file) {
    const buf = await OF.readBuf(file); const c = ctx();
    try { return await new Promise((res, rej) => c.decodeAudioData(buf.slice(0), res, rej)); }
    catch (e) { throw new Error(file.name + ': تعذّر فك الصوت — الصيغة غير مدعومة في هذا النظام أو الملف تالف'); }
  }
  const db = x => (x <= 0 ? -Infinity : 20 * Math.log10(x));
  const fdb = v => (isFinite(v) ? v.toFixed(1) + ' dBFS' : '−∞');
  function analyze(ab) {
    let peak = 0, sumSq = 0, n = 0, clip = 0; for (let ch = 0; ch < ab.numberOfChannels; ch++) { const d = ab.getChannelData(ch); for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; if (a >= 0.999) clip++; sumSq += d[i] * d[i]; } n += d.length; }
    return { peak, rms: Math.sqrt(sumSq / Math.max(1, n)), clip };
  }
  function drawWave(canvas, ab) {
    const w = (canvas.width = canvas.clientWidth * (window.devicePixelRatio || 1) || 600), hh = (canvas.height = 90 * (window.devicePixelRatio || 1)); const g = canvas.getContext('2d'); g.clearRect(0, 0, w, hh); const d = ab.getChannelData(0); const step = Math.max(1, Math.floor(d.length / w)); g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#ff8a3d';
    for (let x = 0; x < w; x++) { let mn = 1, mx = -1; for (let i = 0; i < step; i++) { const v = d[x * step + i] || 0; if (v < mn) mn = v; if (v > mx) mx = v; } g.fillRect(x, (1 - mx) * hh / 2, 1, Math.max(1, (mx - mn) * hh / 2)); }
  }
  function encodeWav(chans, rate) { // chans: Float32Array[]
    const nCh = chans.length, len = chans[0].length, bytes = 44 + len * nCh * 2; if (bytes > 1.9e9) throw new Error('الملف الناتج كبير جداً لصيغة WAV'); const buf = new ArrayBuffer(bytes), dv = new DataView(buf); const wr = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    wr(0, 'RIFF'); dv.setUint32(4, bytes - 8, true); wr(8, 'WAVE'); wr(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, nCh, true); dv.setUint32(24, rate, true); dv.setUint32(28, rate * nCh * 2, true); dv.setUint16(32, nCh * 2, true); dv.setUint16(34, 16, true); wr(36, 'data'); dv.setUint32(40, len * nCh * 2, true);
    let o = 44; for (let i = 0; i < len; i++) for (let c = 0; c < nCh; c++) { const s = clamp(chans[c][i], -1, 1); dv.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7FFF, true); o += 2; }
    return new Blob([buf], { type: 'audio/wav' });
  }
  const parseTime = s => { s = String(s || '').trim().replace(',', '.'); if (!s) return NaN; const p = s.split(':').map(Number); if (p.some(isNaN)) return NaN; return p.reduce((a, v) => a * 60 + v, 0); };
  T['audio-workshop'] = {
    encodeWav,
    render(box) {
      OF.clear(box);
      box.appendChild(ui.tabs([
        { id: 'an', label: 'تحليل', render(p) {
          const f = ui.files({ accept: 'audio/*', label: 'اختر ملفاً صوتياً', maxMB: 150 }); const out = ui.out(); const cv = h('canvas', { class: 'wave' }); cv.style.display = 'none'; const btn = ui.btn('حلّل', null, { kind: 'primary' }); p.append(ui.card('', f, btn), out, cv);
          ui.task(btn, out, async t => { const file = f.first(); if (!file) throw new Error('اختر ملفاً'); t.progress(null, 'فك الترميز…'); const ab = await decodeFile(file); const a = analyze(ab); cv.style.display = ''; drawWave(cv, ab);
            out.kv([['الملف', file.name], ['الحجم', OF.fmt.bytes(file.size)], ['المدة', OF.fmt.dur(ab.duration)], ['معدل العينة', ab.sampleRate + ' Hz'], ['القنوات', ab.numberOfChannels === 1 ? 'أحادي' : ab.numberOfChannels === 2 ? 'ستيريو' : ab.numberOfChannels], ['معدل البت التقريبي', Math.round(file.size * 8 / ab.duration / 1000) + ' kbps'], ['ذروة الإشارة', fdb(db(a.peak))], ['RMS', fdb(db(a.rms))], ['عينات مقصوصة (≥0.999)', a.clip]]); if (a.clip > 0) out.warn('يوجد قصّ (clipping) محتمل في الإشارة.'); });
        } },
        { id: 'edit', label: 'قص وتعديل', render(p) {
          const f = ui.files({ accept: 'audio/*', label: 'اختر ملفاً صوتياً', maxMB: 150 }); const st = ui.input({ placeholder: 'البداية 0:00', dir: 'ltr' }), en = ui.input({ placeholder: 'النهاية (فارغ = للنهاية) مثل 1:30.5', dir: 'ltr' }); const gain = ui.input({ type: 'number', value: 0, step: 0.5 }); const norm = ui.check('تطبيع الذروة إلى -1 dBFS'); const fin = ui.input({ type: 'number', value: 0, min: 0, step: 0.1 }), fout = ui.input({ type: 'number', value: 0, min: 0, step: 0.1 }); const mono = ui.check('تحويل إلى أحادي'); const out = ui.out(); const btn = ui.btn('نفّذ وصدّر WAV', null, { kind: 'primary' });
          p.append(ui.card('', f, ui.row(h('div', { class: 'grow' }, ui.field('البداية', st)), h('div', { class: 'grow' }, ui.field('النهاية', en))), ui.field('تغيير المستوى (dB)', gain), norm, ui.row(h('div', { class: 'grow' }, ui.field('تلاشي دخول (ث)', fin)), h('div', { class: 'grow' }, ui.field('تلاشي خروج (ث)', fout))), mono, btn), out);
          ui.task(btn, out, async t => { const file = f.first(); if (!file) throw new Error('اختر ملفاً'); t.progress(null, 'فك الترميز…'); const ab = await decodeFile(file); const s0 = st.value.trim() ? parseTime(st.value) : 0, e0 = en.value.trim() ? parseTime(en.value) : ab.duration; if (isNaN(s0) || isNaN(e0)) throw new Error('صيغة الوقت غير صحيحة (مثال 1:30.5)'); if (s0 < 0 || e0 > ab.duration + 0.001 || s0 >= e0) throw new Error('النطاق غير صالح؛ مدة الملف ' + OF.fmt.dur(ab.duration));
            const r = ab.sampleRate, i0 = Math.floor(s0 * r), i1 = Math.min(ab.length, Math.floor(e0 * r)); let chans = Array.from({ length: ab.numberOfChannels }, (_, c) => ab.getChannelData(c).slice(i0, i1)); if (mono.input.checked && chans.length > 1) { const m = new Float32Array(chans[0].length); chans.forEach(c => c.forEach((v, i) => (m[i] += v / chans.length))); chans = [m]; }
            const g = Math.pow(10, (+gain.value || 0) / 20); let peak = 0; chans.forEach(c => { for (let i = 0; i < c.length; i++) { c[i] *= g; const a = Math.abs(c[i]); if (a > peak) peak = a; } }); if (norm.input.checked && peak > 0) { const k = Math.pow(10, -1 / 20) / peak; chans.forEach(c => { for (let i = 0; i < c.length; i++) c[i] *= k; }); }
            const nIn = Math.floor((+fin.value || 0) * r), nOut = Math.floor((+fout.value || 0) * r); chans.forEach(c => { for (let i = 0; i < Math.min(nIn, c.length); i++) c[i] *= i / nIn; for (let i = 0; i < Math.min(nOut, c.length); i++) c[c.length - 1 - i] *= i / nOut; });
            const wav = encodeWav(chans, r); out.ok('تم: ' + OF.fmt.dur((i1 - i0) / r) + ' — ' + OF.fmt.bytes(wav.size)); if (peak * g > 1.0) out.warn('المستوى المرفوع تجاوز 0 dBFS وسيحدث قصّ للإشارة.'); out.add(ui.saveRow(OF.baseOf(file.name) + '_edit.wav', wav)); });
        } },
        { id: 'merge', label: 'دمج', render(p) {
          const f = ui.files({ accept: 'audio/*', multiple: true, label: 'اختر الملفات بالترتيب', maxMB: 100 }); const gap = ui.input({ type: 'number', value: 0, min: 0, step: 0.1 }); const out = ui.out(); const btn = ui.btn('ادمج وصدّر WAV', null, { kind: 'primary' });
          p.append(ui.card('', f, ui.field('فاصل صامت بين الملفات (ث)', gap), btn), out);
          ui.task(btn, out, async t => { const fs = f.files(); if (fs.length < 2) throw new Error('اختر ملفين على الأقل'); const abs = []; for (let i = 0; i < fs.length; i++) { t.check(); t.progress(i / fs.length * 80, fs[i].name); abs.push(await decodeFile(fs[i])); await OF.tick(); }
            const r = abs[0].sampleRate, nCh = Math.max(...abs.map(a => a.numberOfChannels)), gp = Math.floor((+gap.value || 0) * r); const total = abs.reduce((a, x) => a + x.length, 0) + gp * (abs.length - 1); const chans = Array.from({ length: nCh }, () => new Float32Array(total)); let o = 0;
            abs.forEach((a, k) => { for (let c = 0; c < nCh; c++) chans[c].set(a.getChannelData(Math.min(c, a.numberOfChannels - 1)), o); o += a.length + (k < abs.length - 1 ? gp : 0); }); t.progress(90, 'ترميز WAV…'); const wav = encodeWav(chans, r); out.ok('تم دمج ' + abs.length + ' ملف — ' + OF.fmt.dur(total / r) + ' — ' + OF.fmt.bytes(wav.size)); out.add(ui.saveRow('merged.wav', wav)); }, { cancelable: true });
        } },
      ]));
    },
  };

  /* ───────────── الترجمة النصية ───────────── */
  const tsRe = /(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})/;
  const toMs = (m) => ((+(m[1] || 0) * 60 + +m[2]) * 60 + +m[3]) * 1000 + +m[4].padEnd(3, '0');
  function parseSubs(text) {
    text = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n'); const cues = []; const blocks = text.split(/\n{2,}/); const isVtt = /^WEBVTT/.test(text.trim());
    for (const b of blocks) { const lines = b.split('\n').filter((l, i, a) => !(i === 0 && /^WEBVTT/.test(l))); if (!lines.length) continue; const ti = lines.findIndex(l => l.includes('-->')); if (ti < 0) continue; if (/^(NOTE|STYLE|REGION)/.test(lines[0])) continue;
      const [a, bb] = lines[ti].split('-->'); const ma = tsRe.exec(a), mb = tsRe.exec(bb); if (!ma || !mb) continue; cues.push({ start: toMs(ma), end: toMs(mb), text: lines.slice(ti + 1).join('\n') }); }
    return { cues, isVtt };
  }
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const fmtTs = (ms, sep) => { ms = Math.max(0, Math.round(ms)); const h_ = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000), s = Math.floor(ms % 60000 / 1000); return pad(h_) + ':' + pad(m) + ':' + pad(s) + sep + pad(ms % 1000, 3); };
  const toSrt = cues => cues.map((c, i) => (i + 1) + '\n' + fmtTs(c.start, ',') + ' --> ' + fmtTs(c.end, ',') + '\n' + c.text).join('\n\n') + '\n';
  const toVtt = cues => 'WEBVTT\n\n' + cues.map(c => fmtTs(c.start, '.') + ' --> ' + fmtTs(c.end, '.') + '\n' + c.text).join('\n\n') + '\n';
  function problems(cues) { const out = []; cues.forEach((c, i) => { if (c.end <= c.start) out.push('#' + (i + 1) + ': وقت النهاية ≤ البداية'); if (!c.text.trim()) out.push('#' + (i + 1) + ': نص فارغ'); if (i && c.start < cues[i - 1].end) out.push('#' + (i + 1) + ': تداخل مع السابق (' + (cues[i - 1].end - c.start) + ' ms)'); if (i && c.start < cues[i - 1].start) out.push('#' + (i + 1) + ': غير مرتبة زمنياً'); const dur = (c.end - c.start) / 1000; const cps = c.text.replace(/\s/g, '').length / Math.max(0.1, dur); if (cps > 25) out.push('#' + (i + 1) + ': سرعة قراءة عالية (' + Math.round(cps) + ' حرف/ث)'); }); return out; }
  T['subtitle-workshop'] = {
    parseSubs, toSrt, toVtt, problems,
    render(box) {
      const f = ui.files({ accept: '.srt,.vtt,.txt', exts: ['srt', 'vtt', 'txt'], label: 'افتح ملف SRT أو VTT', maxMB: 10 }); const enc = ui.select([['utf-8', 'UTF-8'], ['windows-1256', 'Windows-1256 (عربي قديم)'], ['iso-8859-1', 'Latin-1']], 'utf-8'); const inp = ui.area({ rows: 10, code: true, placeholder: 'ألصق محتوى SRT أو VTT هنا…' }); const out = ui.out(); const outp = ui.area({ rows: 10, code: true, readonly: true });
      const load = async () => { const x = f.first(); if (x) inp.value = await OF.readText(x, enc.value); }; f.querySelector('input').addEventListener('change', () => setTimeout(load, 80)); enc.addEventListener('change', load);
      const shift = ui.input({ type: 'number', value: 0, placeholder: 'ms (سالب للتقديم)' }); const fromN = ui.input({ type: 'number', value: 1, min: 1 }); const r1 = ui.input({ type: 'number', value: 23.976, step: 0.001 }), r2 = ui.input({ type: 'number', value: 25, step: 0.001 }); let cues = [];
      const need = () => { out.clear(); const { cues: c } = parseSubs(inp.value); if (!c.length) { out.warn('لم يُعثر على ترجمات صالحة. تأكد من صيغة SRT/VTT.'); return null; } cues = c; return c; };
      const emit = (c, fmt) => { outp.value = fmt === 'vtt' ? toVtt(c) : toSrt(c); };
      const row = (label, fn) => ui.btn(label, fn);
      box.append(ui.card('المصدر', f, ui.field('الترميز', enc), inp, ui.row(ui.btn('افحص', () => { const c = need(); if (!c) return; out.ok(c.length + ' ترجمة — المدة ' + OF.fmt.dur(c[c.length - 1].end / 1000) + ' — الصيغة ' + (parseSubs(inp.value).isVtt ? 'VTT' : 'SRT')); const pr = problems(c); pr.length ? out.warn('مشاكل (' + pr.length + '): ' + pr.slice(0, 12).join(' | ') + (pr.length > 12 ? ' …' : '')) : out.ok('لا مشاكل ظاهرة.'); }, { kind: 'primary' }), ui.btn('SRT ← تحويل', () => { const c = need(); if (c) { emit(c, 'srt'); out.ok('تم التحويل إلى SRT'); } }), ui.btn('VTT ← تحويل', () => { const c = need(); if (c) { emit(c, 'vtt'); out.ok('تم التحويل إلى VTT'); } }))),
        ui.card('إزاحة التوقيت', ui.row(h('div', { class: 'grow' }, ui.field('المقدار (ms)', shift)), h('div', { class: 'grow' }, ui.field('ابتداءً من الترجمة رقم', fromN))), ui.btn('طبّق الإزاحة', () => { const c = need(); if (!c) return; const d = Math.round(+shift.value || 0), k = Math.max(1, Math.floor(+fromN.value) || 1); if (!d) return out.warn('أدخل مقداراً غير صفري'); c.forEach((x, i) => { if (i + 1 >= k) { x.start = Math.max(0, x.start + d); x.end = Math.max(0, x.end + d); } }); emit(c, parseSubs(inp.value).isVtt ? 'vtt' : 'srt'); out.ok('تمت إزاحة ' + (c.length - k + 1) + ' ترجمة بمقدار ' + d + ' ms'); })),
        ui.card('تغيير معدل الإطارات', ui.row(h('div', { class: 'grow' }, ui.field('من fps', r1)), h('div', { class: 'grow' }, ui.field('إلى fps', r2))), ui.btn('طبّق', () => { const c = need(); if (!c) return; const a = +r1.value, b = +r2.value; if (!(a > 0 && b > 0)) return out.warn('قيم fps غير صالحة'); const k = a / b; c.forEach(x => { x.start *= k; x.end *= k; }); emit(c, parseSubs(inp.value).isVtt ? 'vtt' : 'srt'); out.ok('تم تغيير المقياس الزمني ×' + k.toFixed(5)); })),
        ui.card('تنظيف', ui.row(ui.btn('إزالة وسوم HTML', () => { const c = need(); if (!c) return; c.forEach(x => (x.text = x.text.replace(/<[^>]+>/g, '').replace(/\{\\[^}]*\}/g, ''))); emit(c, parseSubs(inp.value).isVtt ? 'vtt' : 'srt'); out.ok('تمت إزالة الوسوم'); }), ui.btn('إصلاح التداخل والترتيب', () => { const c = need(); if (!c) return; c.sort((a, b) => a.start - b.start); let n = 0; c.forEach((x, i) => { if (i && x.start < c[i - 1].end) { c[i - 1].end = Math.max(c[i - 1].start + 1, x.start - 1); n++; } if (x.end <= x.start) { x.end = x.start + 1000; n++; } }); emit(c, parseSubs(inp.value).isVtt ? 'vtt' : 'srt'); out.ok('أُصلحت ' + n + ' حالة'); }), ui.btn('حذف الفارغة', () => { const c = need(); if (!c) return; const k = c.filter(x => x.text.trim()); emit(k, parseSubs(inp.value).isVtt ? 'vtt' : 'srt'); out.ok('حُذفت ' + (c.length - k.length) + ' ترجمة فارغة'); }))), out,
        ui.card('النتيجة', outp, ui.row(ui.copyBtn(() => outp.value), ui.btn('حفظ', () => outp.value ? OF.save(new Blob([outp.value], { type: 'text/plain;charset=utf-8' }), 'subtitles.' + (outp.value.startsWith('WEBVTT') ? 'vtt' : 'srt'), 'text/plain') : ui.toast('لا توجد نتيجة', 'error'), { small: true, icon: 'save' }))));
    },
  };

  /* ───────────── الفيديو ───────────── */
  function loadVideo(file) { return new Promise((res, rej) => { const v = document.createElement('video'); v.preload = 'metadata'; v.playsInline = true; v.src = URL.createObjectURL(file); v.onloadedmetadata = () => res(v); v.onerror = () => rej(new Error('تعذّر فتح الفيديو: الصيغة/الترميز غير مدعوم في هذا النظام')); }); }
  T['video-workshop'] = {
    render(box) {
      OF.clear(box);
      box.appendChild(ui.tabs([
        { id: 'info', label: 'معلومات وإطار', render(p) {
          const f = ui.files({ accept: 'video/*', label: 'اختر فيديو', maxMB: 1000 }); const out = ui.out(); const holder = h('div'); let vid = null; const btn = ui.btn('افتح', null, { kind: 'primary' });
          p.append(ui.card('', f, btn), out, holder);
          ui.task(btn, out, async () => { const file = f.first(); if (!file) throw new Error('اختر فيديو'); vid = await loadVideo(file); vid.controls = true; vid.style.cssText = 'width:100%;border-radius:10px;background:#000;max-height:320px'; OF.clear(holder); holder.appendChild(vid);
            out.kv([['الملف', file.name], ['الحجم', OF.fmt.bytes(file.size)], ['النوع المعلن', file.type || '—'], ['المدة', isFinite(vid.duration) ? OF.fmt.dur(vid.duration) : 'غير معروفة'], ['الأبعاد', vid.videoWidth + '×' + vid.videoHeight]]);
            holder.appendChild(ui.btn('التقط الإطار الحالي كصورة', async () => { try { const c = document.createElement('canvas'); c.width = vid.videoWidth; c.height = vid.videoHeight; c.getContext('2d').drawImage(vid, 0, 0); await OF.save(await OF.canvasBlob(c, 'image/png'), 'frame_' + vid.currentTime.toFixed(2) + 's.png', 'image/png'); } catch (e) { ui.toast('تعذر الالتقاط: ' + e.message, 'error'); } }, { icon: 'image' })); });
        } },
        { id: 'trim', label: 'قص / تحويل إلى WebM', render(p) {
          const supported = !!(window.MediaRecorder && HTMLCanvasElement.prototype.captureStream); const f = ui.files({ accept: 'video/*', label: 'اختر فيديو', maxMB: 1000 }); const st = ui.input({ placeholder: 'البداية 0:00', dir: 'ltr' }), en = ui.input({ placeholder: 'النهاية (فارغ = للنهاية)', dir: 'ltr' }); const scale = ui.select([['0', 'الأبعاد الأصلية'], ['1280', 'عرض أقصى 1280'], ['854', 'عرض أقصى 854'], ['640', 'عرض أقصى 640'], ['426', 'عرض أقصى 426']], '0'); const kbps = ui.select([['2500', 'جودة جيدة (2.5 Mbps)'], ['1200', 'متوسطة (1.2 Mbps)'], ['600', 'منخفضة (0.6 Mbps)'], ['5000', 'عالية (5 Mbps)']], '1200'); const audio = ui.check('تضمين الصوت', true); const out = ui.out(); const btn = ui.btn('ابدأ المعالجة', null, { kind: 'primary' });
          p.append(ui.card('', supported ? null : h('div', { class: 'msg error' }, OF.icon('x'), h('span', { text: 'هذا النظام لا يدعم MediaRecorder/captureStream؛ القص غير متاح.' })), h('div', { class: 'msg warn' }, OF.icon('info'), h('span', { text: 'تتم المعالجة بإعادة تسجيل الفيديو في الزمن الحقيقي: مدة المعالجة = مدة المقطع، وأبقِ التطبيق مفتوحاً. الجودة أقل من الأصل.' })), f, ui.row(h('div', { class: 'grow' }, ui.field('البداية', st)), h('div', { class: 'grow' }, ui.field('النهاية', en))), ui.field('الأبعاد', scale), ui.field('معدل البت', kbps), audio, btn), out);
          ui.task(btn, out, async t => {
            if (!supported) throw new Error('غير مدعوم في هذا النظام'); const file = f.first(); if (!file) throw new Error('اختر فيديو'); const vid = await loadVideo(file); const dur = vid.duration; const s0 = st.value.trim() ? parseTime(st.value) : 0; let e0 = en.value.trim() ? parseTime(en.value) : dur; if (isNaN(s0) || isNaN(e0)) throw new Error('صيغة الوقت غير صحيحة'); if (!isFinite(e0)) throw new Error('مدة الفيديو غير معروفة؛ حدّد وقت النهاية يدوياً'); e0 = Math.min(e0, dur); if (s0 < 0 || s0 >= e0) throw new Error('النطاق غير صالح؛ مدة الفيديو ' + OF.fmt.dur(dur));
            const cands = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']; const mime = cands.find(m => MediaRecorder.isTypeSupported(m)); if (!mime) throw new Error('النظام لا يدعم ترميز WebM');
            let W = vid.videoWidth, H = vid.videoHeight; const mx = +scale.value; if (mx && W > mx) { H = Math.round(H * mx / W); W = mx; } W -= W % 2; H -= H % 2; const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); const stream = c.captureStream(30);
            let ac = null; if (audio.input.checked) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); const src = ac.createMediaElementSource(vid); const dest = ac.createMediaStreamDestination(); src.connect(dest); dest.stream.getAudioTracks().forEach(tr => stream.addTrack(tr)); } catch (e) { out.warn('تعذّر التقاط الصوت: سيُنتج الفيديو بلا صوت.'); } }
            const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: +kbps.value * 1000 }); const chunks = []; rec.ondataavailable = e => e.data && e.data.size && chunks.push(e.data); const done = new Promise(r => (rec.onstop = r));
            vid.currentTime = s0; await new Promise(r => { vid.onseeked = r; }); vid.muted = false; let raf; const draw = () => { g.drawImage(vid, 0, 0, W, H); raf = requestAnimationFrame(draw); }; rec.start(1000); try { await vid.play(); } catch (e) { rec.stop(); throw new Error('تعذّر تشغيل الفيديو (قد يمنع النظام التشغيل التلقائي). المحاولة: اضغط الزر مرة أخرى.'); } draw();
            await new Promise((res, rej) => { const tick = setInterval(() => { try { t.check(); } catch (e) { clearInterval(tick); return rej(e); } const prog = (vid.currentTime - s0) / (e0 - s0); t.progress(clamp(prog * 100, 0, 100), 'تسجيل ' + OF.fmt.dur(vid.currentTime - s0) + ' / ' + OF.fmt.dur(e0 - s0)); if (vid.currentTime >= e0 - 0.05 || vid.ended) { clearInterval(tick); res(); } }, 200); }).finally(() => { cancelAnimationFrame(raf); vid.pause(); if (rec.state !== 'inactive') rec.stop(); });
            await done; if (ac) ac.close(); const blob = new Blob(chunks, { type: 'video/webm' }); if (!blob.size) throw new Error('لم يُنتج تسجيل'); out.ok('تم: ' + W + '×' + H + ' — ' + OF.fmt.bytes(blob.size)); out.add(ui.saveRow(OF.baseOf(file.name) + '_trim.webm', blob)); out.info('ملفات WebM الناتجة عن التسجيل قد لا تُظهر المدة في بعض المشغلات.');
          }, { cancelable: true });
        } },
      ]));
    },
  };
})();
