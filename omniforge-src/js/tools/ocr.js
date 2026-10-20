/* استخراج النص من الصور (OCR) — Tesseract على الجهاز عبر بلاجن OmniOcr (عربي/إنجليزي، بلا إنترنت).
 * الصور فقط. يعمل داخل التطبيق (APK) فقط؛ في المتصفح تظهر رسالة توضيحية. */
(function () {
  'use strict';
  const { h, ui } = OF; const T = OF.tools;
  const MAX = 2400;
  /* يصغّر الصورة (يحترم اتجاه EXIF) ويحوّلها JPEG؛ اختيارياً رمادي + تمديد التباين ليساعد التعرف. */
  async function prepare(file, gray) {
    let bm; try { bm = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { throw new Error('تعذّر قراءة الصورة (الصيغة غير مدعومة في هذا النظام)'); }
    const k = Math.min(1, MAX / Math.max(bm.width, bm.height)); const W = Math.max(1, Math.round(bm.width * k)), H = Math.max(1, Math.round(bm.height * k));
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.drawImage(bm, 0, 0, W, H); if (bm.close) bm.close();
    if (gray) { const d = g.getImageData(0, 0, W, H), p = d.data, hist = new Uint32Array(256);
      for (let i = 0; i < p.length; i += 4) { const y = (p[i] * 299 + p[i + 1] * 587 + p[i + 2] * 114) / 1000 | 0; p[i] = y; hist[y]++; }
      const n = W * H, lo = (() => { let a = 0; for (let v = 0; v < 256; v++) { a += hist[v]; if (a >= n * 0.01) return v; } return 0; })(), hi = (() => { let a = 0; for (let v = 255; v >= 0; v--) { a += hist[v]; if (a >= n * 0.01) return v; } return 255; })();
      const sc = hi > lo + 20 ? 255 / (hi - lo) : 1; for (let i = 0; i < p.length; i += 4) { const v = Math.max(0, Math.min(255, ((p[i] - lo) * sc) | 0)); p[i] = p[i + 1] = p[i + 2] = v; } g.putImageData(d, 0, 0); }
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92)); if (!blob) throw new Error('فشل تجهيز الصورة'); return { blob, W, H };
  }
  T['ocr-extractor'] = {
    render(box) {
      OF.clear(box); const OO = OF.nat.available() && OF.nat.plugin() && Capacitor.Plugins.OmniOcr, ON = OF.nat.available() ? OF.nat.plugin() : null;
      if (!OO || !ON) return box.appendChild(ui.card('', h('div', { class: 'msg warn' }, OF.icon('info'), h('span', { text: 'محرك OCR (Tesseract) يعمل داخل التطبيق (APK) فقط. غير متاح في المتصفح.' }))));
      const f = ui.files({ accept: 'image/*', label: 'اختر صورة فيها نص', maxMB: 40, hint: 'صور فقط (لا ملفات PDF)' });
      const lang = ui.select([['ara+eng', 'عربي + إنجليزي'], ['ara', 'عربي'], ['eng', 'إنجليزي']], 'ara+eng'), psm = ui.select([['auto', 'تلقائي (صفحة/عدة فقرات)'], ['block', 'كتلة نص واحدة'], ['line', 'سطر واحد']], 'auto'), gray = ui.check('تحسين التباين (رمادي) قبل القراءة', true);
      const btn = ui.btn('استخرج النص', null, { kind: 'primary' }); const out = ui.out(); const res = ui.area({ rows: 10 }); const stat = h('div');
      OO.info().then(i => { if (!i.ready) stat.appendChild(h('div', { class: 'msg warn' }, OF.icon('info'), h('span', { text: 'نماذج OCR غير مضمّنة في هذا البناء' + (i.error ? ' (' + i.error + ')' : '') + ': تعذّر تنزيلها في GitHub Actions. أعد تشغيل البناء.' }))); else { const have = new Set(i.langs || []); [...lang.options].forEach(o => { if (!o.value.split('+').every(l => have.has(l))) o.disabled = true; }); if (lang.selectedOptions[0] && lang.selectedOptions[0].disabled) { const ok = [...lang.options].find(o => !o.disabled); if (ok) lang.value = ok.value; } } }).catch(() => {});
      ui.task(btn, out, async t => {
        const file = f.first(); if (!file) throw new Error('اختر صورة'); let dir = null; res.value = '';
        try { t.progress(5, 'تجهيز الصورة…'); const { blob, W, H } = await prepare(file, gray.input.checked); dir = await OF.nat.job(); const path = await OF.nat.stage(blob, dir, 'ocr.jpg'); t.progress(30, 'قراءة النص (قد تستغرق عشرات الثواني)…');
          const r = await OO.recognize({ path, langs: lang.value, psm: psm.value }); const txt = String(r.text || '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').trim(); res.value = txt;
          if (!txt) out.warn('لم يُعثر على نص. جرّب صورة أوضح/أكبر أو غيّر وضع الصفحة.'); else out.ok('تم: ' + txt.length + ' حرفاً — ثقة المحرك ' + Math.round(r.confidence) + '%');
          out.kv([['اللغات', r.langs], ['الدقة المُعالَجة', r.width + '×' + r.height]]); if (txt && r.confidence < 60) out.warn('الثقة منخفضة: راجع النص يدوياً؛ الخطوط المزخرفة والصور المائلة أو منخفضة الجودة تضعف العربية خصوصاً.');
        } catch (e) { throw new Error(e && e.code ? OF.nat.errorText(Object.assign({}, e, { message: String(e.message || '').replace(/^OCR_DATA_MISSING:\s*/, '') })) : e.message); } finally { if (dir) OF.nat.cleanup(dir); }
      });
      box.append(ui.card('', f, ui.row(h('div', { class: 'grow' }, ui.field('اللغة', lang)), h('div', { class: 'grow' }, ui.field('وضع الصفحة', psm))), gray, btn), stat, out, ui.card('النص المستخرج', res, ui.row(ui.copyBtn(() => res.value), ui.btn('حفظ .txt', () => res.value ? OF.save(new Blob([res.value], { type: 'text/plain;charset=utf-8' }), OF.baseOf((f.first() || {}).name || 'ocr') + '.txt', 'text/plain') : ui.toast('لا نص', 'error'), { small: true }))));
    },
  };
})();
