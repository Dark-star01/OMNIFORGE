/* اختبار واجهة «تنزيل فيديو من رابط» في Chromium (390px) مع بلاجنات Capacitor وهمية.
 * يختبر منطق الواجهة والتدفق فقط — لا يختبر Kotlin ولا yt-dlp ولا أندرويد.
 * التشغيل: serve لمجلد التطبيق على 8765 ثم  node tests/video-ui.test.js  (PLAYWRIGHT يمكن تحديده بمتغير) */
'use strict';
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');
const assert = require('assert');
const BASE = process.env.BASE || 'http://localhost:8765/index.html';

const SINGLE = { id: 'abc', title: 'محاضرة تجريبية', duration: 1471, uploader: 'قناة', webpage_url: 'https://video.example/watch?v=abc', extractor_key: 'Example', thumbnail: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  formats: [
    { format_id: '140', ext: 'm4a', vcodec: 'none', acodec: 'mp4a.40.2', abr: 129, filesize: 23e6 },
    { format_id: '18', ext: 'mp4', vcodec: 'avc1', acodec: 'mp4a.40.2', height: 360, tbr: 500, filesize: 70e6 },
    { format_id: '137', ext: 'mp4', vcodec: 'avc1', acodec: 'none', height: 1080, fps: 30, tbr: 4000, filesize: 480e6 },
  ] };
const PAGE = { _type: 'playlist', title: 'صفحة أخبار', entries: [1, 2, 3, 4].map(i => ({ id: 'e' + i, title: 'الفيديو ' + i, url: 'https://news.example/v/' + i, duration: 600 + i * 60 })) };

/* يُحقن قبل أي سكربت: Capacitor + OmniVideo + OmniSave وهميان قابلان للبرمجة عبر window.__m */
function injected() {
  const L = {}; const emit = (ev, d) => (L[ev] || []).forEach(f => f(d));
  const mk = extra => Object.assign({ addListener: async (ev, cb) => { (L[ev] = L[ev] || []).push(cb); return { remove: () => { L[ev] = (L[ev] || []).filter(f => f !== cb); } }; } }, extra);
  const m = window.__m = { calls: [], saved: [], failUrls: new Set(), slow: false, ffmpeg: true, gate: null, singleJson: null, pageJson: null };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  window.Capacitor = { isNativePlatform: () => true, Plugins: {
    OmniVideo: mk({
      engineInfo: async () => ({ engine: 'yt-dlp', ready: true, ffmpeg: m.ffmpeg, ytdlpVersion: '2026.01.01' }),
      updateEngine: async () => ({ status: 'DONE', version: '2026.02.02' }),
      extract: async a => { m.calls.push(['extract', a.url]); await sleep(30);
        if (/unsupported/.test(a.url)) throw new Error('ERROR: Unsupported URL: ' + a.url);
        if (/novideo/.test(a.url)) throw new Error('ERROR: [generic] There is no video in this post');
        if (/drm/.test(a.url)) throw new Error('ERROR: [x] This video is DRM protected');
        if (/offline/.test(a.url)) throw new Error('ERROR: Unable to download webpage: <urlopen error [Errno -2] Name or service not known>');
        if (/page/.test(a.url)) return { json: JSON.stringify(m.pageJson || { _type: 'playlist', title: 'x', entries: [] }) };
        return { json: JSON.stringify(m.singleJson) }; },
      download: async a => { m.calls.push(['download', a.url, a.selector, a.mux, a.audio]);
        emit('videoProgress', { id: a.id, line: '[download] Destination: /c/media.f137.mp4' });
        for (const p of [10, 40, 70]) { emit('videoProgress', { id: a.id, line: '[download]  ' + p + '.0% of  100.00MiB at  2.00MiB/s ETA 00:10' }); await sleep(m.slow ? 150 : 15); if (m.gate) await m.gate; }
        if (a.cancelled) throw new Error('cancelled');
        if (m.failUrls.has(a.url)) throw new Error('ERROR: [x] 1: Video unavailable. This video has been removed');
        if (m.cancelIds && m.cancelIds.has(a.id)) throw new Error('cancelled');
        emit('videoProgress', { id: a.id, line: '[Merger] Merging formats into "/c/media.mp4"' }); await sleep(10);
        return { path: '/cache/omni-video/' + a.id + '/media.' + (a.audio === 'mp3' ? 'mp3' : 'mp4'), ext: a.audio === 'mp3' ? 'mp3' : 'mp4', size: 104857600 }; },
      cancel: async a => { (m.cancelIds = m.cancelIds || new Set()).add(a.id); m.calls.push(['cancel', a.id]); m.release && m.release(); },
      cleanup: async () => {},
    }),
    OmniSave: mk({
      request: async a => ({ status: /gone/.test(a.url) ? 404 : 200, headers: { 'content-length': '2097152', 'content-type': 'video/mp4' } }),
      saveFromPath: async a => { m.saved.push(a.name); await sleep(10); return { path: 'Download/OMNIFORGE/' + a.name, bytes: 104857600 }; },
      download: async a => { m.calls.push(['direct', a.url, a.name]); emit('downloadProgress', { received: 1048576, total: 2097152 }); await sleep(20); m.saved.push(a.name); return { path: 'Download/OMNIFORGE/' + a.name, bytes: 2097152, contentType: 'video/mp4' }; },
      cancelDownload: async () => {},
    }),
  } };
}

let pass = 0, fail = 0; const failed = [];
async function t(name, fn) { try { await fn(); pass++; console.log('  ✓', name); } catch (e) { fail++; failed.push(name); console.log('  ✗', name, '\n     ', (e && e.message || e).toString().split('\n')[0]); } }

(async () => {
  const b = await chromium.launch();
  async function fresh(native = true) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar' }); const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push('PAGEERR ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    if (native) await p.addInitScript(injected);
    await p.goto(BASE); await p.waitForTimeout(200);
    await p.evaluate(() => { location.hash = '#/tools/video-link-downloader'; }); await p.waitForTimeout(500);
    p.errs = errs; return p;
  }
  const setup = p => p.evaluate(([s, pg]) => { window.__m.singleJson = s; window.__m.pageJson = pg; }, [SINGLE, PAGE]);
  async function analyze(p, u) { await p.fill('input[type=url]', u); await p.locator('button.btn', { hasText: 'حلّل الرابط' }).click(); }
  const txt = p => p.locator('#view').innerText();
  const hscroll = p => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

  console.log('الصفحة والسجل');
  await t('لا تظهر «تحتاج خدمة» وتظهر شارة «جزئية» + الجملة الصادقة', async () => { const p = await fresh(); const s = await txt(p); assert.ok(!/تحتاج خدمة|يحتاج خدمة أو محركاً/.test(s)); assert.ok(/جزئية/.test(s)); assert.ok(/يدعم مجموعة واسعة من مواقع ومنصات الفيديو، وقد يختلف الدعم/.test(s)); assert.ok(!(await hscroll(p))); assert.deepStrictEqual(p.errs, []); });
  await t('بدون المحرك الأصلي (متصفح): رسالة واضحة والزر معطّل', async () => { const p = await fresh(false); const s = await txt(p); assert.ok(/داخل تطبيق أندرويد فقط/.test(s)); assert.ok(await p.locator('button.btn', { hasText: 'حلّل الرابط' }).isDisabled()); assert.deepStrictEqual(p.errs, []); });
  await t('بطاقة المحرك تعرض الإصدار وFFmpeg', async () => { const p = await fresh(); await p.locator('summary', { hasText: 'محرك الاستخراج' }).click(); await p.waitForTimeout(200); const s = await txt(p); assert.ok(/2026\.01\.01/.test(s) && /متوفر/.test(s)); });

  console.log('الأخطاء');
  for (const [u, re, name] of [['https://unsupported.example/x', /الموقع أو الصفحة غير مدعومة/, 'موقع غير مدعوم'], ['https://novideo.example/p', /لا يوجد فيديو في هذه الصفحة/, 'لا يوجد فيديو'], ['https://drm.example/p', /محمي \(DRM\)/, 'محتوى محمي'], ['https://offline.example/p', /تعذّر الاتصال بالإنترنت/, 'خطأ شبكة'], ['https://page.example/p', /لا يوجد فيديو في هذه الصفحة/, 'قائمة فارغة']])
    await t(name + ' → رسالة عربية بلا انهيار', async () => { const p = await fresh(); await setup(p); await p.evaluate(() => { window.__m.pageJson = { _type: 'playlist', title: 'x', entries: [] }; }); await analyze(p, u); await p.waitForTimeout(500); const s = await txt(p); assert.ok(re.test(s), s.slice(0, 200)); assert.ok(await p.locator('.msg.error').count() >= 1); assert.deepStrictEqual(p.errs, []); });
  await t('رابط غير صالح', async () => { const p = await fresh(); await analyze(p, 'http://'); await p.waitForTimeout(300); assert.ok(/الرابط غير صالح/.test(await txt(p))); });
  await t('حقل فارغ', async () => { const p = await fresh(); await p.locator('button.btn', { hasText: 'حلّل الرابط' }).click(); await p.waitForTimeout(300); assert.ok(/غير صالح|أدخل/.test(await txt(p))); });
  await t('رابط بلا بروتوكول يُصلَح تلقائياً', async () => { const p = await fresh(); await setup(p); await analyze(p, 'video.example/watch?v=abc'); await p.waitForSelector('select', { timeout: 3000 }); });

  console.log('فيديو مفرد');
  await t('يعرض العنوان/المدة/المعاينة/الجودات المجمّعة', async () => { const p = await fresh(); await setup(p); await analyze(p, 'https://video.example/watch?v=abc'); await p.waitForSelector('select', { timeout: 3000 }); const s = await txt(p); assert.ok(/محاضرة تجريبية/.test(s) && /24:31/.test(s)); assert.strictEqual(await p.locator('img.vthumb').count(), 1); const groups = await p.locator('optgroup').evaluateAll(g => g.map(x => x.label)); assert.deepStrictEqual(groups, ['فيديو + صوت', 'صوت فقط', 'فيديو فقط (بلا صوت)']); { const t_ = await p.locator('select').innerText(); assert.ok(/1080p/.test(t_), t_); } assert.ok(!(await hscroll(p))); assert.deepStrictEqual(p.errs, []); });
  await t('تنزيل 1080p: دمج + تقدم حقيقي + نتيجة + حفظ عبر OmniSave', async () => { const p = await fresh(); await setup(p); await p.evaluate(() => { window.__m.slow = true; }); await analyze(p, 'https://video.example/watch?v=abc'); await p.waitForSelector('select'); await p.locator('button.btn', { hasText: /^تنزيل$/ }).click(); await p.waitForFunction(() => /% ·/.test(document.querySelector('#view').innerText), null, { timeout: 4000 }); const mid = await txt(p); assert.ok(/MB|MiB/.test(mid) && /\/ 100 MB/.test(mid) && /ث/.test(mid), mid.slice(-300)); await p.waitForFunction(() => /اكتمل التنزيل/.test(document.querySelector('#view').innerText), null, { timeout: 6000 }); const s = await txt(p); assert.ok(/اسم الملف/.test(s) && /محاضرة تجريبية\.mp4/.test(s) && /Download\/OMNIFORGE/.test(s) && /100 MB/.test(s)); const m = await p.evaluate(() => window.__m); assert.deepStrictEqual(m.saved, ['محاضرة تجريبية.mp4']); const dl = m.calls.find(c => c[0] === 'download'); assert.ok(dl[2].startsWith('137+ba') && dl[3] === true); });
  await t('صوت MP3 يمرّر audio=mp3 وبلا mux', async () => { const p = await fresh(); await setup(p); await analyze(p, 'https://video.example/watch?v=abc'); await p.waitForSelector('select'); await p.selectOption('select', 'a:mp3'); await p.locator('button.btn', { hasText: /^تنزيل$/ }).click(); await p.waitForFunction(() => /اكتمل التنزيل/.test(document.querySelector('#view').innerText), null, { timeout: 5000 }); const m = await p.evaluate(() => window.__m); const dl = m.calls.find(c => c[0] === 'download'); assert.strictEqual(dl[4], 'mp3'); assert.strictEqual(dl[3], false); assert.deepStrictEqual(m.saved, ['محاضرة تجريبية.mp3']); });
  await t('عند غياب FFmpeg تُعطَّل خيارات الدمج وتظهر ملاحظة', async () => { const p = await fresh(); await setup(p); await p.evaluate(() => { window.__m.ffmpeg = false; location.hash = '#/'; }); await p.waitForTimeout(300); await p.evaluate(() => { location.hash = '#/tools/video-link-downloader'; }); await p.waitForTimeout(600); await setup(p); await analyze(p, 'https://video.example/watch?v=abc'); await p.waitForSelector('select'); const dis = await p.locator('option[disabled]').count(); assert.ok(dis >= 2, 'disabled=' + dis); assert.ok(/يحتاج FFmpeg غير متاح/.test(await p.locator('select').innerText())); });
  await t('إيقاف التنزيل: رسالة «أُوقف» وبلا حفظ', async () => { const p = await fresh(); await setup(p); await p.evaluate(() => { window.__m.slow = true; }); await analyze(p, 'https://video.example/watch?v=abc'); await p.waitForSelector('select'); await p.locator('button.btn', { hasText: /^تنزيل$/ }).click(); await p.waitForFunction(() => /% ·/.test(document.querySelector('#view').innerText), null, { timeout: 4000 }); await p.locator('button.btn.danger:visible', { hasText: 'إيقاف' }).click(); await p.waitForFunction(() => /أُوقف التنزيل/.test(document.querySelector('#view').innerText), null, { timeout: 5000 }); const m = await p.evaluate(() => window.__m); assert.deepStrictEqual(m.saved, []); assert.ok(m.calls.some(c => c[0] === 'cancel')); assert.ok(await p.locator('button.btn', { hasText: /^تنزيل$/ }).isEnabled()); assert.deepStrictEqual(p.errs, []); });
  await t('فشل التنزيل لفيديو مفرد: السبب بالعربية والزر يعود', async () => { const p = await fresh(); await setup(p); await p.evaluate(() => { window.__m.failUrls.add('https://video.example/watch?v=abc'); }); await analyze(p, 'https://video.example/watch?v=abc'); await p.waitForSelector('select'); await p.locator('button.btn', { hasText: /^تنزيل$/ }).click(); await p.waitForFunction(() => /السبب/.test(document.querySelector('#view').innerText), null, { timeout: 5000 }); assert.ok(/الفيديو غير متاح/.test(await txt(p))); assert.ok(await p.locator('button.btn', { hasText: /^تنزيل$/ }).isEnabled()); });

  console.log('رابط مباشر');
  await t('mp4 مباشر: لا يمر بالمحرك، حجم من HEAD، تنزيل أصلي', async () => { const p = await fresh(); await analyze(p, 'https://files.example/clips/%D9%81%D9%8A%D8%AF%D9%8A%D9%88.mp4'); await p.waitForSelector('select', { timeout: 3000 }); { const s_ = await txt(p); assert.ok(/ملف مباشر/.test(s_) && /2\.0 MB/.test(s_), s_.slice(0,400)); } await p.locator('button.btn', { hasText: /^تنزيل$/ }).click(); await p.waitForFunction(() => /اكتمل التنزيل/.test(document.querySelector('#view').innerText), null, { timeout: 4000 }); const m = await p.evaluate(() => window.__m); assert.ok(!m.calls.some(c => c[0] === 'extract' || c[0] === 'download')); assert.deepStrictEqual(m.saved, ['فيديو.mp4']); });
  await t('mp4 مباشر محذوف (404) → رسالة', async () => { const p = await fresh(); await analyze(p, 'https://files.example/gone.mp4'); await p.waitForTimeout(500); assert.ok(/الصفحة غير موجودة \(404\)/.test(await txt(p))); });

  console.log('عدة فيديوهات');
  await t('قائمة: checkbox + thumbnails/placeholder + عدّاد + تحديد الكل/إلغاء', async () => { const p = await fresh(); await setup(p); await analyze(p, 'https://page.example/news'); await p.waitForSelector('.vrow', { timeout: 3000 }); assert.strictEqual(await p.locator('.vrow').count(), 4); assert.ok(/تم العثور على 4 فيديو/.test(await txt(p))); assert.strictEqual(await p.locator('.vrow input:checked').count(), 4); await p.locator('button.btn', { hasText: 'إلغاء تحديد الكل' }).click(); assert.strictEqual(await p.locator('.vrow input:checked').count(), 0); assert.ok(await p.locator('button.btn', { hasText: 'تنزيل المحدد' }).isDisabled()); await p.locator('button.btn', { hasText: /^تحديد الكل$/ }).click(); assert.ok(/المحدد: 4 من 4/.test(await txt(p))); assert.ok(!(await hscroll(p))); assert.deepStrictEqual(p.errs, []); });
  await t('طابور: 3 محددة، الثاني يفشل، الباقي يكتمل، ثم إعادة المحاولة', async () => { const p = await fresh(); await setup(p); await p.evaluate(() => { window.__m.failUrls.add('https://news.example/v/3'); }); await analyze(p, 'https://page.example/news'); await p.waitForSelector('.vrow'); await p.locator('.vrow input').nth(1).uncheck(); await p.locator('button.btn', { hasText: /تنزيل المحدد/ }).click(); await p.waitForFunction(() => document.querySelectorAll('.vq-item.st-done').length === 2 && document.querySelectorAll('.vq-item.st-failed').length === 1, null, { timeout: 9000 }); const s = await txt(p); assert.ok(/3 \/ 3/.test(s), s.slice(0, 600)); assert.ok(/فشل «الفيديو 3»/.test(s) && /الفيديو غير متاح/.test(s)); assert.ok(/اكتمل التنزيل: 2 من 3/.test(s)); let m = await p.evaluate(() => window.__m); assert.deepStrictEqual(m.saved, ['الفيديو 1.mp4', 'الفيديو 4.mp4']); assert.ok(m.calls.filter(c => c[0] === 'download').every(c => c[2].includes('height<=720'))); await p.evaluate(() => window.__m.failUrls.clear()); await p.locator('button.btn', { hasText: 'إعادة محاولة الفاشل' }).click(); await p.waitForFunction(() => document.querySelectorAll('.vq-item.st-done').length === 3, null, { timeout: 6000 }); m = await p.evaluate(() => window.__m); assert.strictEqual(m.saved.length, 3); assert.ok(await p.locator('.vrow input').first().isEnabled()); assert.deepStrictEqual(p.errs, []); });
  await t('طابور: إيقاف الكل أثناء الجاري يلغي الباقي بلا انهيار', async () => { const p = await fresh(); await setup(p); await p.evaluate(() => { window.__m.slow = true; }); await analyze(p, 'https://page.example/news'); await p.waitForSelector('.vrow'); await p.locator('button.btn', { hasText: /تنزيل المحدد/ }).click(); await p.waitForFunction(() => document.querySelector('.vq-item.st-running'), null, { timeout: 4000 }); await p.locator('button.btn.danger', { hasText: 'إيقاف الكل' }).click(); await p.waitForFunction(() => document.querySelectorAll('.vq-item.st-cancelled').length === 4, null, { timeout: 6000 }); assert.deepStrictEqual((await p.evaluate(() => window.__m.saved)), []); assert.deepStrictEqual(p.errs, []); });
  await t('طابور: إلغاء عنصر منتظر واحد فقط', async () => { const p = await fresh(); await setup(p); await p.evaluate(() => { window.__m.slow = true; }); await analyze(p, 'https://page.example/news'); await p.waitForSelector('.vrow'); await p.locator('button.btn', { hasText: /تنزيل المحدد/ }).click(); await p.waitForFunction(() => document.querySelector('.vq-item.st-running'), null, { timeout: 4000 }); await p.locator('.vq-item.st-pending .iconbtn').nth(1).click(); await p.waitForFunction(() => document.querySelectorAll('.vq-item.st-done').length === 3 && document.querySelectorAll('.vq-item.st-cancelled').length === 1, null, { timeout: 15000 }); });
  await t('قائمة بعنصر واحد تُحوَّل تلقائياً إلى فيديو مفرد بصيغه', async () => { const p = await fresh(); await setup(p); await p.evaluate(() => { window.__m.pageJson = { _type: 'playlist', title: 'واحد', entries: [{ id: 'x', title: 'وحيد', url: 'https://video.example/watch?v=abc' }] }; }); await analyze(p, 'https://page.example/one'); await p.waitForSelector('select', { timeout: 3000 }); assert.ok(/محاضرة تجريبية/.test(await txt(p))); });
  await t('عناوين مكررة تُفرَّق بلا تعارض', async () => { const p = await fresh(); await setup(p); await p.evaluate(() => { window.__m.pageJson = { _type: 'playlist', title: 'مكرر', entries: [1, 2].map(i => ({ id: 'd' + i, title: 'نفس العنوان', url: 'https://news.example/d/' + i })) }; }); await analyze(p, 'https://page.example/dup'); await p.waitForSelector('.vrow'); await p.locator('button.btn', { hasText: /تنزيل المحدد/ }).click(); await p.waitForFunction(() => document.querySelectorAll('.vq-item.st-done').length === 2, null, { timeout: 6000 }); assert.deepStrictEqual((await p.evaluate(() => window.__m.saved)), ['نفس العنوان.mp4', 'نفس العنوان (2).mp4']); });
  await t('تحديث المحرك من البطاقة', async () => { const p = await fresh(); await p.locator('summary', { hasText: 'محرك الاستخراج' }).click(); await p.locator('button.btn', { hasText: 'تحديث المحرك' }).click(); await p.waitForFunction(() => /تم تحديث المحرك/.test(document.querySelector('#view').innerText), null, { timeout: 3000 }); });
  await t('الوضع الفاتح لا يكسر العرض (390px)', async () => { const p = await fresh(); await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'light')); await setup(p); await analyze(p, 'https://page.example/news'); await p.waitForSelector('.vrow'); assert.ok(!(await hscroll(p))); });

  await b.close();
  console.log(`\n${pass} نجح، ${fail} فشل`); if (fail) { console.log('الفاشلة:', failed.join(' | ')); process.exit(1); }
})();
