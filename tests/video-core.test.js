/* اختبارات وحدة لطبقة js/video-core.js (بلا متصفح ولا أندرويد). التشغيل:  node tests/video-core.test.js
 * ⚠️ الـfixtures أدناه مكتوبة يدوياً على نمط خرج yt-dlp --dump-single-json، وليست لقطات حقيقية من مواقع. */
'use strict';
const assert = require('assert');
const path = require('path');
const V = require(path.resolve(__dirname, process.env.VIDEO_CORE || '../omniforge-src/js/video-core.js'));

let pass = 0, fail = 0; const failures = [];
async function t(name, fn) { try { await fn(); pass++; console.log('  ✓', name); } catch (e) { fail++; failures.push(name); console.log('  ✗', name, '\n    ', e && e.message); } }

/* ───── fixtures ───── */
const single = {
  id: 'abc123', title: 'محاضرة تجريبية', duration: 1471, uploader: 'قناة', webpage_url: 'https://video.example/watch?v=abc123', extractor_key: 'Example',
  thumbnails: [{ url: 'https://i.example/s.jpg', width: 120 }, { url: 'https://i.example/m.jpg', width: 480 }, { url: 'https://i.example/l.jpg', width: 1280 }],
  formats: [
    { format_id: 'sb0', ext: 'mhtml', protocol: 'mhtml', format_note: 'storyboard', vcodec: 'none', acodec: 'none' },
    { format_id: '139', ext: 'm4a', vcodec: 'none', acodec: 'mp4a.40.5', abr: 48, filesize: 5.2e6, format_note: 'low' },
    { format_id: '140', ext: 'm4a', vcodec: 'none', acodec: 'mp4a.40.2', abr: 129.5, filesize: 23.8e6 },
    { format_id: '251', ext: 'webm', vcodec: 'none', acodec: 'opus', abr: 135, filesize: 24.5e6 },
    { format_id: '18', ext: 'mp4', vcodec: 'avc1.42001E', acodec: 'mp4a.40.2', height: 360, width: 640, fps: 25, tbr: 500, filesize: 70e6 },
    { format_id: '136', ext: 'mp4', vcodec: 'avc1.4d401f', acodec: 'none', height: 720, width: 1280, fps: 25, tbr: 1200, filesize: 150e6 },
    { format_id: '247', ext: 'webm', vcodec: 'vp9', acodec: 'none', height: 720, width: 1280, fps: 25, tbr: 900, filesize: 110e6 },
    { format_id: '137', ext: 'mp4', vcodec: 'avc1.640028', acodec: 'none', height: 1080, width: 1920, fps: 60, tbr: 4000, filesize_approx: 480e6 },
  ],
};
const page = { _type: 'playlist', id: 'pg', title: 'صفحة فيها فيديوهات', webpage_url: 'https://news.example/page',
  entries: [
    { id: '1', title: 'الفيديو 1', url: 'https://cdn.example/1.mp4', duration: 1471, thumbnail: 'https://i.example/1.jpg' },
    { id: '2', title: 'الفيديو 2', url: 'https://news.example/v/2', duration: 1122 },
    { title: 'بلا رابط' },
    { id: '3', title: 'الفيديو 3', webpage_url: 'https://news.example/v/3', url: 'https://news.example/v/3', duration: 1870, thumbnails: [{ url: 'https://i.example/3.jpg' }] },
  ] };
const bareDirect = { id: 'clip', title: 'clip', url: 'https://example.com/clip.mp4', ext: 'mp4', webpage_url: 'https://example.com/clip.mp4' };

(async () => {
  console.log('directMedia');
  await t('mp4 مباشر', () => assert.deepStrictEqual(V.directMedia('https://example.com/a/video.mp4?x=1'), { ext: 'mp4', name: 'video.mp4' }));
  await t('اسم عربي مرمّز', () => assert.strictEqual(V.directMedia('https://e.com/%D9%81%D9%8A%D8%AF%D9%8A%D9%88.webm').name, 'فيديو.webm'));
  await t('صفحة ويب ليست مباشرة', () => assert.strictEqual(V.directMedia('https://example.com/video-page'), null));
  await t('m3u8 يمر بالمحرك', () => assert.strictEqual(V.directMedia('https://example.com/live/index.m3u8'), null));
  await t('رابط غير http', () => assert.strictEqual(V.directMedia('ftp://e.com/a.mp4'), null));
  await t('امتداد في الاستعلام فقط', () => assert.strictEqual(V.directMedia('https://e.com/watch?file=a.mp4'), null));

  console.log('classifyError');
  const C = (s, code) => t(code + ' ← ' + String(s).slice(0, 50), () => assert.strictEqual(V.classifyError(s).code, code));
  await C('ERROR: Unsupported URL: https://example.com/x', 'UNSUPPORTED');
  await C('ERROR: [generic] None: There is no video in this post', 'NO_VIDEO');
  await C('ERROR: [youtube] abc: Sign in to confirm you’re not a bot. Use --cookies', 'BOT_CHECK');
  await C('ERROR: [youtube] abc: Sign in to confirm your age', 'LOGIN_REQUIRED');
  await C('ERROR: [vimeo] 1: This video is only available for members-only', 'LOGIN_REQUIRED');
  await C('ERROR: [x] 1: Private video. Sign in if you\'ve been granted access', 'LOGIN_REQUIRED');
  await C('ERROR: [site] 1: This video is DRM protected', 'DRM');
  await C('ERROR: [site] 1: The uploader has not made this video available in your country', 'GEO');
  await C('ERROR: [site] 1: Video unavailable. This video has been removed by the uploader', 'UNAVAILABLE');
  await C('ERROR: Unable to download webpage: HTTP Error 404: Not Found', 'HTTP_404');
  await C('ERROR: Unable to download webpage: HTTP Error 403: Forbidden', 'HTTP_403');
  await C('ERROR: HTTP Error 429: Too Many Requests', 'HTTP_429');
  await C('ERROR: unable to download video data: HTTP Error 503: Service Unavailable', 'HTTP_ERROR');
  await C('ERROR: Unable to download webpage: <urlopen error [Errno -2] Name or service not known>', 'NETWORK');
  await C('ERROR: Unable to download webpage: The read operation timed out', 'TIMEOUT');
  await C('ERROR: Requested format is not available. Use --list-formats', 'FORMAT_UNAVAILABLE');
  await C('OSError: [Errno 28] No space left on device', 'NO_SPACE');
  await C('ERROR: Postprocessing: ffmpeg exited with code 1', 'MUX_FAILED');
  await C('ERROR: [site] 1: Unable to extract video data; please report this issue', 'EXTRACTOR_FAILED');
  await C('cancelled', 'CANCELLED');
  await C(Object.assign(new Error('x'), { name: 'AbortError' }), 'CANCELLED');
  await C('some completely unknown failure', 'UNKNOWN');
  await C('Traceback ... /data/user/0/app/python3.11/foo.py ... boom', 'UNKNOWN');
  await C(Object.assign(new Error('x'), { code: 'NO_SPACE' }), 'NO_SPACE');
  await t('كل رمز له رسالة عربية', () => V.errorCodes.forEach(c => { const e = V.fail(c); assert.ok(/[؀-ۿ]/.test(e.message), c); }));
  await t('detail = آخر سطر ERROR', () => assert.strictEqual(V.classifyError('WARNING: x\nERROR: [a] b: Unsupported URL: u').detail, 'ERROR: [a] b: Unsupported URL: u'));
  await t('toError يحفظ الرمز والاسم', () => { const e = V.toError('cancelled'); assert.strictEqual(e.code, 'CANCELLED'); assert.strictEqual(e.name, 'AbortError'); });

  console.log('parseProgress');
  await t('تقدم عادي', () => { const p = V.parseProgress('[download]  45.2% of  120.00MiB at  2.50MiB/s ETA 00:23'); assert.strictEqual(p.type, 'download'); assert.strictEqual(p.pct, 45.2); assert.strictEqual(p.total, 125829120); assert.strictEqual(p.speed, 2621440); assert.strictEqual(p.eta, '00:23'); assert.strictEqual(p.downloaded, Math.round(125829120 * 0.452)); });
  await t('حجم تقريبي + شظايا', () => { const p = V.parseProgress('[download]   3.1% of ~  80.50MiB at  1.20MiB/s ETA 01:10 (frag 3/90)'); assert.strictEqual(p.approx, true); assert.strictEqual(p.pct, 3.1); });
  await t('سرعة Unknown', () => { const p = V.parseProgress('[download]   0.0% of  10.00KiB at  Unknown B/s ETA Unknown'); assert.strictEqual(p.speed, null); assert.strictEqual(p.eta, null); });
  await t('اكتمال', () => { const p = V.parseProgress('[download] 100% of  120.00MiB in 00:00:48 at 2.50MiB/s'); assert.strictEqual(p.pct, 100); });
  await t('Destination/Merger/Convert', () => { assert.strictEqual(V.parseProgress('[download] Destination: /x/media.f137.mp4').type, 'dest'); assert.strictEqual(V.parseProgress('[Merger] Merging formats into "/x/media.mp4"').type, 'merge'); assert.strictEqual(V.parseProgress('[ExtractAudio] Destination: /x/media.mp3').type, 'convert'); });
  await t('سطر فارغ/عشوائي', () => { assert.strictEqual(V.parseProgress(''), null); assert.strictEqual(V.parseProgress('hello').type, 'other'); });

  console.log('fromYtdlp');
  await t('فيديو مفرد: يستبعد storyboard ويطبّع', () => { const v = V.fromYtdlp(single); assert.strictEqual(v.kind, 'video'); assert.strictEqual(v.formats.length, 7); assert.ok(!v.formats.find(f => f.id === 'sb0')); assert.strictEqual(v.title, 'محاضرة تجريبية'); assert.strictEqual(v.thumbnail, 'https://i.example/m.jpg'); assert.strictEqual(v.formats.find(f => f.id === '18').kind, 'av'); assert.strictEqual(v.formats.find(f => f.id === '137').kind, 'v'); assert.strictEqual(v.formats.find(f => f.id === '140').kind, 'a'); });
  await t('قائمة: يحذف العناصر بلا رابط', () => { const v = V.fromYtdlp(JSON.stringify(page)); assert.strictEqual(v.kind, 'playlist'); assert.strictEqual(v.entries.length, 3); assert.strictEqual(v.entries[2].thumbnail, 'https://i.example/3.jpg'); assert.strictEqual(v.entries[0].duration, 1471); });
  await t('رابط مفرد بلا formats', () => { const v = V.fromYtdlp(bareDirect); assert.strictEqual(v.formats.length, 1); assert.strictEqual(v.formats[0].kind, 'av'); });
  await t('JSON تالف → EXTRACTOR_FAILED', () => assert.throws(() => V.fromYtdlp('{oops'), e => e.code === 'EXTRACTOR_FAILED'));
  await t('null → NO_VIDEO', () => assert.throws(() => V.fromYtdlp(null), e => e.code === 'NO_VIDEO'));

  console.log('buildOptions');
  const v = V.fromYtdlp(single); const opts = V.buildOptions(v);
  await t('مجموعات av/a/v موجودة', () => { assert.deepStrictEqual([...new Set(opts.map(o => o.group))].sort(), ['a', 'av', 'v']); });
  await t('أعلى خيار 1080p ويحتاج دمجاً', () => { const o = opts.filter(x => x.group === 'av')[0]; assert.ok(o.label.startsWith('1080p60')); assert.strictEqual(o.mux, true); assert.ok(o.selector.startsWith('137+ba')); assert.strictEqual(o.sizeApprox, true); });
  await t('360p مدمج جاهز بلا دمج', () => { const o = opts.find(x => x.key === 'av:18'); assert.strictEqual(o.mux, false); assert.strictEqual(o.selector, '18'); assert.strictEqual(o.sub, 'فيديو + صوت'); });
  await t('720p يفضّل mp4 (avc) على webm', () => assert.strictEqual(opts.find(x => x.group === 'av' && x.height === 720).key, 'av:136'));
  await t('الحجم = فيديو + صوت للدمج', () => { const o = opts.find(x => x.key === 'av:136'); assert.strictEqual(o.size, 150e6 + 24.5e6 > 0 ? 150e6 + 24.5e6 : 0); });
  await t('خيارات الصوت: أفضل + MP3 + bitrates', () => { const a = opts.filter(x => x.group === 'a'); assert.ok(a.find(x => x.key === 'a:best')); assert.ok(a.find(x => x.key === 'a:mp3').convert); assert.ok(a.length >= 4); });
  await t('فيديو فقط بلا صوت', () => assert.ok(opts.filter(x => x.group === 'v').every(x => !x.selector.includes('+'))));
  await t('بلا صيغة صوت: لا دمج ولا selector مركّب', () => { const only = V.buildOptions(V.fromYtdlp({ title: 't', duration: 10, formats: [{ format_id: '1', ext: 'mp4', vcodec: 'avc1', acodec: 'none', height: 480 }] })); const o = only.find(x => x.group === 'av'); assert.strictEqual(o.mux, false); assert.strictEqual(o.selector, '1'); });
  await t('صوت فقط من مصدر (podcast)', () => { const au = V.buildOptions(V.fromYtdlp({ title: 'p', formats: [{ format_id: 'a', ext: 'mp3', vcodec: 'none', acodec: 'mp3', abr: 128 }] })); assert.deepStrictEqual([...new Set(au.map(o => o.group))], ['a']); });
  await t('المسبقات تحمل محددات صالحة', () => V.PRESETS.forEach(p => { assert.ok(p.selector && !p.selector.startsWith('-')); }));
  await t('تنسيق الحجم والمدة', () => { assert.strictEqual(V.fmtSize(150e6), '143 MB'); assert.strictEqual(V.fmtSize(null), ''); assert.strictEqual(V.fmtDur(1471), '24:31'); assert.strictEqual(V.fmtDur(3725), '1:02:05'); });

  console.log('extract (محرك وهمي)');
  const calls = [];
  global.Capacitor = { Plugins: {
    OmniVideo: { extract: async a => { calls.push(['extract', a.url]); if (/bad/.test(a.url)) throw Object.assign(new Error('ERROR: Unsupported URL: ' + a.url), { code: undefined }); if (/page/.test(a.url)) return { json: JSON.stringify(page) }; return { json: JSON.stringify(single) }; } },
    OmniSave: { request: async () => ({ status: 200, headers: { 'content-length': '5242880', 'content-type': 'video/mp4' } }) },
  } };
  await t('رابط مباشر لا يستدعي المحرك + حجم من HEAD', async () => { calls.length = 0; const r = await V.extract('https://example.com/video.mp4'); assert.strictEqual(r.direct, true); assert.strictEqual(r.formats[0].size, 5242880); assert.strictEqual(calls.length, 0); });
  await t('صفحة فيديو تمر بالمحرك', async () => { const r = await V.extract('https://video.example/watch?v=abc123'); assert.strictEqual(r.kind, 'video'); assert.strictEqual(calls.length, 1); });
  await t('صفحة بعدة فيديوهات', async () => { const r = await V.extract('https://news.example/page'); assert.strictEqual(r.kind, 'playlist'); assert.strictEqual(r.entries.length, 3); });
  await t('موقع غير مدعوم → UNSUPPORTED', async () => { await assert.rejects(() => V.extract('https://bad.example/x'), e => e.code === 'UNSUPPORTED' && /[؀-ۿ]/.test(e.message)); });
  await t('رابط غير صالح', async () => { await assert.rejects(() => V.extract('not a url'), e => e.code === 'INVALID_URL'); await assert.rejects(() => V.extract('ftp://a.com/x'), e => e.code === 'INVALID_URL'); });
  await t('بدون بلاجن → ENGINE_MISSING', async () => { const keep = global.Capacitor; global.Capacitor = undefined; await assert.rejects(() => V.extract('https://a.com/page'), e => e.code === 'ENGINE_MISSING'); global.Capacitor = keep; });
  await t('HEAD 404 للرابط المباشر', async () => { const keep = global.Capacitor.Plugins.OmniSave.request; global.Capacitor.Plugins.OmniSave.request = async () => ({ status: 404, headers: {} }); await assert.rejects(() => V.extract('https://example.com/gone.mp4'), e => e.code === 'HTTP_404'); global.Capacitor.Plugins.OmniSave.request = keep; });
  await t('HEAD غير مدعوم لا يمنع المتابعة', async () => { const keep = global.Capacitor.Plugins.OmniSave.request; global.Capacitor.Plugins.OmniSave.request = async () => { throw new Error('HEAD not allowed'); }; const r = await V.extract('https://example.com/ok.mp4'); assert.strictEqual(r.direct, true); global.Capacitor.Plugins.OmniSave.request = keep; });

  console.log('queue');
  const mk = n => Array.from({ length: n }, (_, i) => ({ title: 'v' + i, url: 'https://e.com/' + i, option: {} }));
  await t('فشل عنصر لا يوقف الباقي', async () => { const q = V.createQueue(mk(4), { run: async (it) => { if (it.i === 1) throw new Error('ERROR: Unsupported URL'); return { name: it.title }; } }); await q.start(); assert.deepStrictEqual(q.items.map(x => x.status), ['done', 'failed', 'done', 'done']); assert.strictEqual(q.items[1].error.code, 'UNSUPPORTED'); assert.strictEqual(q.done, 3); assert.strictEqual(q.failed, 1); assert.ok(q.finished); });
  await t('إلغاء الكل أثناء الجاري', async () => { let release; const gate = new Promise(r => (release = r)); const q = V.createQueue(mk(3), { run: async (it, ctl) => { ctl.cancel = () => release(); await gate; if (ctl.cancelled) throw V.fail('CANCELLED'); return {}; } }); const p = q.start(); await new Promise(r => setTimeout(r, 10)); assert.strictEqual(q.items[0].status, 'running'); q.cancelAll(); await p; assert.deepStrictEqual(q.items.map(x => x.status), ['cancelled', 'cancelled', 'cancelled']); });
  await t('إلغاء عنصر منتظر ثم إكمال الباقي', async () => { const q = V.createQueue(mk(3), { run: async () => ({}) }); q.cancelItem(1); await q.start(); assert.deepStrictEqual(q.items.map(x => x.status), ['done', 'cancelled', 'done']); });
  await t('إعادة المحاولة للفاشل فقط ثم ينجح', async () => { let fails = true; const q = V.createQueue(mk(3), { run: async it => { if (it.i === 2 && fails) throw new Error('HTTP Error 503'); return {}; } }); await q.start(); assert.strictEqual(q.items[2].status, 'failed'); fails = false; await q.retryFailed(); assert.deepStrictEqual(q.items.map(x => x.status), ['done', 'done', 'done']); });
  await t('onChange يُستدعى بالتقدم', async () => { let n = 0; const q = V.createQueue(mk(1), { onChange: () => n++, run: async (it, ctl, prog) => { prog({ pct: 50 }); return {}; } }); await q.start(); assert.ok(n >= 4); });

  console.log('download (محرك وهمي)');
  function mockPlugins() {
    const log = []; const L = {};
    const emit = (ev, d) => (L[ev] || []).forEach(f => f(d));
    const mkp = (extra) => Object.assign({ addListener: async (ev, cb) => { (L[ev] = L[ev] || []).push(cb); return { remove: () => { L[ev] = (L[ev] || []).filter(f => f !== cb); log.push('rm:' + ev); } }; } }, extra);
    global.Capacitor = { Plugins: {
      OmniVideo: mkp({
        download: async a => { log.push('dl:' + a.selector + '|mux=' + a.mux); emit('videoProgress', { id: a.id, line: '[download] Destination: /c/media.f137.mp4' }); emit('videoProgress', { id: a.id, line: '[download]  50.0% of  10.00MiB at  1.00MiB/s ETA 00:05' }); emit('videoProgress', { id: 'other', line: '[download] 99.0% of 1MiB' }); emit('videoProgress', { id: a.id, line: '[Merger] Merging formats into "/c/media.mp4"' }); return { path: '/cache/omni-video/' + a.id + '/media.mp4', ext: 'mp4', size: 10485760 }; },
        cancel: async a => { log.push('cancel:' + a.id); }, cleanup: async a => { log.push('cleanup'); },
      }),
      OmniSave: mkp({ saveFromPath: async a => { log.push('save:' + a.name + '|' + a.mime + '|del=' + a.deleteSource); return { path: 'Download/OMNIFORGE/' + a.name, bytes: 10485760 }; }, download: async a => { log.push('direct:' + a.name); emit('downloadProgress', { received: 5, total: 10 }); return { path: 'Download/OMNIFORGE/' + a.name, bytes: 10, contentType: 'video/mp4' }; }, cancelDownload: async () => log.push('cancelDirect') }),
    } };
    return { log, emit };
  }
  await t('تنزيل عبر المحرك ثم الحفظ عبر OmniSave مع تنظيف', async () => { const m = mockPlugins(); const prog = []; const r = await V.download({ title: 'عنوان: اختبار?', url: 'https://e.com/v', option: { selector: '137+ba', mux: true } }, {}, p => prog.push(p)); assert.strictEqual(r.name, 'عنوان_ اختبار_.mp4'); assert.ok(m.log.includes('dl:137+ba|mux=true')); assert.ok(m.log.includes('save:عنوان_ اختبار_.mp4|video/mp4|del=true')); assert.ok(prog.some(p => p.stage === 'download' && p.pct === 50 && p.total === 10485760)); assert.ok(prog.some(p => p.stage === 'merge')); assert.ok(!prog.some(p => p.pct === 99)); assert.ok(m.log.includes('cleanup')); assert.ok(m.log.filter(x => x.startsWith('rm:')).length === 2); });
  await t('رابط مباشر عبر OmniSave.download فقط', async () => { const m = mockPlugins(); const r = await V.download({ title: 'clip', url: 'https://e.com/clip.mp4', direct: true, option: { ext: 'mp4' } }, {}, () => {}); assert.strictEqual(r.name, 'clip.mp4'); assert.ok(m.log.includes('direct:clip.mp4')); assert.ok(!m.log.some(x => x.startsWith('dl:'))); });
  await t('رابط مباشر يعيد HTML → NO_VIDEO', async () => { const m = mockPlugins(); global.Capacitor.Plugins.OmniSave.download = async () => ({ path: 'x', bytes: 1, contentType: 'text/html; charset=utf-8' }); await assert.rejects(() => V.download({ title: 'p', url: 'https://e.com/p.mp4', direct: true, option: {} }, {}, () => {}), e => e.code === 'NO_VIDEO'); });
  await t('إلغاء أثناء تنزيل المحرك', async () => { const m = mockPlugins(); let rej; global.Capacitor.Plugins.OmniVideo.download = a => new Promise((_, r) => (rej = r)); const ctl = {}; const p = V.download({ title: 't', url: 'https://e.com/v', option: {} }, ctl, () => {}); await new Promise(r => setTimeout(r, 10)); ctl.cancel(); rej(new Error('cancelled')); await assert.rejects(p, e => e.code === 'CANCELLED'); assert.ok(m.log.some(x => x.startsWith('cancel:'))); assert.ok(m.log.includes('cleanup')); });
  await t('فشل الحفظ → SAVE_FAILED', async () => { const m = mockPlugins(); global.Capacitor.Plugins.OmniSave.saveFromPath = async () => { throw new Error('IO boom'); }; await assert.rejects(() => V.download({ title: 't', url: 'https://e.com/v', option: {} }, {}, () => {}), e => e.code === 'SAVE_FAILED'); });
  await t('نفاد المساحة من البلاجن → NO_SPACE', async () => { mockPlugins(); global.Capacitor.Plugins.OmniVideo.download = async () => { throw Object.assign(new Error('مساحة'), { code: 'NO_SPACE' }); }; await assert.rejects(() => V.download({ title: 't', url: 'https://e.com/v', option: {} }, {}, () => {}), e => e.code === 'NO_SPACE'); });
  await t('طابور حقيقي فوق download الوهمي: واحد يفشل', async () => { mockPlugins(); let n = 0; const orig = global.Capacitor.Plugins.OmniVideo.download; global.Capacitor.Plugins.OmniVideo.download = async a => { if (++n === 2) throw new Error('ERROR: Video unavailable'); return orig(a); }; const q = V.createQueue([1, 2, 3].map(i => ({ title: 'v' + i, url: 'https://e.com/' + i, option: { selector: 'b' } }))); await q.start(); assert.deepStrictEqual(q.items.map(x => x.status), ['done', 'failed', 'done']); assert.strictEqual(q.items[1].error.code, 'UNAVAILABLE'); });

  console.log(`\n${pass} نجح، ${fail} فشل`);
  if (fail) { console.log('الفاشلة:', failures.join(' | ')); process.exit(1); }
})();
