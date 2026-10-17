/* OMNIFORGE — طبقة محرك الفيديو (OF.video)
 *
 * الغرض: فصل واجهة الأداة عن تفاصيل أي محرك استخراج. الواجهة لا تعرف yt-dlp؛ تعرف فقط:
 *
 *     extract(url)  →  نموذج موحّد { kind:'video'|'playlist', ... , formats }
 *     buildOptions(video) → خيارات الجودة/الصيغة المعروضة للمستخدم
 *     download(job) → ملف محفوظ عبر OmniSave
 *
 * المحرك الحالي: بلاجن Capacitor «OmniVideo» (Kotlin) فوق yt-dlp (مكتبة youtubedl-android).
 * لاستبدال المحرك لاحقاً: اكتب adapter جديداً بنفس الواجهة (parse) وسجّله بـ OF.video.useAdapter(...)
 * بلا تعديل ملف الواجهة js/tools/videolink.js.
 *
 * الملف يعمل في المتصفح (يُحمَّل كسولاً) وفي Node (للاختبارات: require).
 */
(function (root) {
  'use strict';
  const V = {};

  /* ───────────────────────── 1) الروابط المباشرة ───────────────────────── */
  const DIRECT_EXT = ['mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi', 'flv', '3gp', 'wmv', 'mpg', 'mpeg', 'mp3', 'm4a', 'aac', 'ogg', 'oga', 'ogv', 'opus', 'wav', 'flac'];
  const AUDIO_EXT = ['mp3', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'wav', 'flac', 'weba'];
  const MIME_BY_EXT = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', avi: 'video/x-msvideo', flv: 'video/x-flv', '3gp': 'video/3gpp', wmv: 'video/x-ms-wmv', mpg: 'video/mpeg', mpeg: 'video/mpeg', ogv: 'video/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac', weba: 'audio/webm' };
  V.mimeOf = ext => MIME_BY_EXT[String(ext || '').toLowerCase()] || 'application/octet-stream';

  /* يرجع {ext, name} إذا كان الرابط يشير مباشرة إلى ملف وسائط، وإلا null */
  V.directMedia = function (urlStr) {
    let u; try { u = new URL(urlStr); } catch (e) { return null; }
    if (!/^https?:$/.test(u.protocol)) return null;
    let last = ''; try { last = decodeURIComponent(u.pathname.split('/').pop() || ''); } catch (e) { last = u.pathname.split('/').pop() || ''; }
    const m = /\.([A-Za-z0-9]{2,4})$/.exec(last);
    if (!m || !DIRECT_EXT.includes(m[1].toLowerCase())) return null;
    return { ext: m[1].toLowerCase(), name: last };
  };

  V.safeName = function (s, fallback) {
    s = String(s == null ? '' : s).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/\s+/g, ' ').trim().replace(/^\.+|\.+$/g, '');
    if (s.length > 100) s = s.slice(0, 100).trim();
    return s || fallback || 'video';
  };

  /* ───────────────────────── 2) تصنيف الأخطاء ───────────────────────── */
  /* يستقبل نص الخطأ الخام (stderr من المحرك أو رسالة البلاجن) ويعيد {code, message, hint, detail}
   * كل حالة تنتج رسالة مفهومة بالعربية؛ detail هو سطر الخطأ التقني للعرض الاختياري. */
  const ERR = {
    INVALID_URL: ['الرابط غير صالح', 'تأكد من كتابة رابط كامل يبدأ بـ http:// أو https://.'],
    UNSUPPORTED: ['الموقع أو الصفحة غير مدعومة', 'لم يتعرف المحرك على فيديو في هذا الرابط. قد يكون الموقع غير مدعوم، أو أن الفيديو يُحمَّل بطريقة خاصة. جرّب رابط صفحة الفيديو نفسها، أو حدّث المحرك.'],
    NO_VIDEO: ['لا يوجد فيديو في هذه الصفحة', 'لم يُعثر على فيديو قابل للتنزيل. قد يحتاج المحتوى إلى تسجيل دخول أو يُحمَّل بعد تشغيل الصفحة.'],
    LOGIN_REQUIRED: ['المحتوى يتطلب تسجيل الدخول أو صلاحية', 'هذا الفيديو خاص أو مقيّد بحساب أو بالعمر. لا يتجاوز التطبيق تسجيل الدخول أو قيود الوصول.'],
    BOT_CHECK: ['الموقع يطلب التحقق من أنك لست روبوتاً', 'يمنع الموقع الاستخراج الآلي لهذا الفيديو الآن. لا يتجاوز التطبيق أنظمة الحماية؛ جرّب لاحقاً أو بعد تحديث المحرك.'],
    DRM: ['المحتوى محمي (DRM)', 'هذا الفيديو محمي بتشفير حقوق النشر ولا يمكن تنزيله. لا يتجاوز التطبيق حماية المحتوى.'],
    GEO: ['المحتوى غير متاح في بلدك', 'يقيّد الموقع هذا الفيديو جغرافياً.'],
    UNAVAILABLE: ['الفيديو غير متاح', 'ربما حُذف أو أصبح خاصاً أو انتهت صلاحية الرابط.'],
    HTTP_403: ['الموقع رفض الوصول (403)', 'يمنع الخادم الطلب. قد يحتاج الفيديو إلى تسجيل دخول أو يقيّد الوصول الآلي.'],
    HTTP_404: ['الصفحة غير موجودة (404)', 'تحقق من الرابط؛ قد تكون الصفحة حُذفت أو الرابط خاطئ.'],
    HTTP_429: ['طلبات كثيرة (429)', 'حدّ الموقع عدد الطلبات. انتظر قليلاً ثم أعد المحاولة.'],
    HTTP_ERROR: ['الخادم أعاد خطأ HTTP', 'تعذّر جلب الصفحة أو الملف من الموقع.'],
    TIMEOUT: ['انتهت مهلة الاتصال', 'الموقع بطيء أو الاتصال ضعيف. أعد المحاولة.'],
    NETWORK: ['تعذّر الاتصال بالإنترنت', 'تحقق من اتصالك بالشبكة ثم أعد المحاولة.'],
    FORMAT_UNAVAILABLE: ['الصيغة أو الجودة المطلوبة غير متاحة', 'اختر جودة أو صيغة أخرى من القائمة.'],
    NO_SPACE: ['مساحة التخزين غير كافية', 'أفرغ مساحة على الجهاز ثم أعد المحاولة (يحتاج التنزيل مساحة مؤقتة تساوي حجم الفيديو تقريباً، إضافة إلى مساحة الملف النهائي).'],
    MUX_FAILED: ['فشل دمج الصوت والفيديو أو تحويلهما', 'جرّب جودة أخرى أو صيغة تحتوي صوتاً وفيديو معاً.'],
    FFMPEG_MISSING: ['مكوّن FFmpeg غير متاح', 'هذا الخيار يحتاج دمجاً أو تحويلاً. اختر صيغة تحتوي صوتاً وفيديو معاً.'],
    ENGINE_MISSING: ['محرك الاستخراج غير متاح', 'يعمل هذا المحرك داخل تطبيق أندرويد فقط.'],
    ENGINE_INIT: ['تعذّر تشغيل محرك الاستخراج', 'فشلت تهيئة المحرك على هذا الجهاز. جرّب إعادة فتح التطبيق، ثم انسخ تقرير التشخيص إن تكرر الخطأ.'],
    EXTRACTOR_FAILED: ['فشل المحرك في قراءة هذا الموقع', 'غالباً غيّر الموقع طريقة عرضه. جرّب «تحديث المحرك» ثم أعد المحاولة.'],
    SAVE_FAILED: ['فشل حفظ الملف', 'اكتمل التنزيل لكن تعذّر حفظه في مجلد التنزيلات. تحقق من المساحة ثم أعد المحاولة.'],
    CANCELLED: ['أُوقف التنزيل', ''],
    UNKNOWN: ['حدث خطأ غير متوقع', 'جرّب مرة أخرى؛ إن تكرر انسخ تقرير التشخيص.'],
  };
  V.errorCodes = Object.keys(ERR);

  V.classifyError = function (err) {
    const raw = String(err && err.message != null ? err.message : err == null ? '' : err);
    const given = err && err.code && ERR[err.code] ? err.code : null; // بلاجن أصلي قد يرسل رمزاً جاهزاً
    const t = raw.toLowerCase();
    const has = (...xs) => xs.some(x => (x instanceof RegExp ? x.test(raw) : t.includes(x)));
    let code = given && given !== 'UNKNOWN' ? given : null;
    if (!code) {
      if (raw === 'cancelled' || has('cancelled', 'canceled', 'aborterror') || (err && err.name === 'AbortError')) code = 'CANCELLED';
      else if (has('no space left', 'enospc', 'not enough space')) code = 'NO_SPACE';
      else if (has('drm protected', 'drm-protected', 'drm_protected', ' drm ', 'widevine')) code = 'DRM';
      else if (has("confirm you're not a bot", 'confirm you’re not a bot', 'not a bot')) code = 'BOT_CHECK';
      else if (has('sign in', 'log in', 'login required', 'login is required', 'members-only', 'members only', 'private video', 'confirm your age', 'age-restricted', 'age restricted', 'this video is private', 'requires authentication', 'premium', 'rentals')) code = 'LOGIN_REQUIRED';
      else if (has('not available in your country', 'geo restrict', 'geo-restrict', 'geo-block', 'geoblock', 'blocked it in your country', 'not made this video available in your country')) code = 'GEO';
      else if (has('unsupported url')) code = 'UNSUPPORTED';
      else if (has('no video formats found', 'there is no video in this', 'no video could be found', 'no video found', 'does not contain any video')) code = 'NO_VIDEO';
      else if (has('video unavailable', 'has been removed', 'no longer available', 'been deleted', 'does not exist', 'video is unavailable', 'this video is not available', 'content isn’t available', "content isn't available")) code = 'UNAVAILABLE';
      else if (has(/http error 403/i)) code = 'HTTP_403';
      else if (has(/http error 404/i)) code = 'HTTP_404';
      else if (has(/http error 429/i)) code = 'HTTP_429';
      else if (has(/http error [45]\d\d/i)) code = 'HTTP_ERROR';
      else if (has('timed out', 'timeout', 'time out')) code = 'TIMEOUT';
      else if (has('name or service not known', 'temporary failure in name resolution', 'network is unreachable', 'connection refused', 'connection reset', 'no address associated', 'unable to resolve host', 'failed to resolve', 'getaddrinfo', 'unable to download webpage', 'urlopen error', 'unable to connect', 'ssl:', 'certificate verify failed')) code = 'NETWORK';
      else if (has('requested format is not available', 'requested format not available', 'no such format')) code = 'FORMAT_UNAVAILABLE';
      else if (has('ffmpeg is not installed', 'ffmpeg not found', 'ffmpeg-location', 'ffprobe and ffmpeg not found')) code = 'FFMPEG_MISSING';
      else if (has('postprocessing', 'conversion failed', 'error merging', 'merger', 'muxing', 'ffmpeg exited')) code = 'MUX_FAILED';
      else if (has('unable to extract', 'extractorerror', 'extractor error', 'unable to download json', 'unable to parse', 'unexpected response', 'player response', 'unable to download api page')) code = 'EXTRACTOR_FAILED';
      else if (has('invalid url', 'is not a valid url', 'يُدعم http')) code = 'INVALID_URL';
      else if (has('could not initialize', 'init failed', 'unsatisfiedlinkerror', 'noclassdeffounderror', 'engine_init')) code = 'ENGINE_INIT';
      else code = 'UNKNOWN';
    }
    const [message, hint] = ERR[code] || ERR.UNKNOWN;
    // سطر الخطأ التقني (آخر سطر يبدأ بـ ERROR:) أو آخر 300 حرف
    let detail = '';
    const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const errLines = lines.filter(s => /^ERROR:/i.test(s));
    detail = (errLines.length ? errLines[errLines.length - 1] : lines[lines.length - 1] || '').slice(0, 300);
    return { code, message, hint, detail, raw: raw.slice(0, 4000) };
  };

  /* خطأ مُصنَّف قابل للرمي */
  V.fail = function (code, detail) {
    const [message, hint] = ERR[code] || ERR.UNKNOWN;
    const e = new Error(message); e.code = code; e.hint = hint; e.detail = detail || ''; if (code === 'CANCELLED') e.name = 'AbortError';
    return e;
  };
  V.toError = function (err) {
    if (err && err.__classified) return err;
    const c = V.classifyError(err);
    const e = new Error(c.message); e.code = c.code; e.hint = c.hint; e.detail = c.detail; e.raw = c.raw; e.__classified = true;
    if (c.code === 'CANCELLED') e.name = 'AbortError';
    return e;
  };

  /* ───────────────────────── 3) تحليل سطر التقدم ───────────────────────── */
  const UNIT = { B: 1, KIB: 1024, MIB: 1048576, GIB: 1073741824, TIB: 1099511627776, KB: 1000, MB: 1e6, GB: 1e9 };
  const toBytes = (n, u) => { const k = UNIT[String(u || 'B').toUpperCase()]; return k ? Math.round(parseFloat(n) * k) : null; };
  /* يحلل أسطر yt-dlp مثل:
   *   [download]  45.2% of  120.00MiB at  2.50MiB/s ETA 00:23
   *   [download]  45.2% of ~ 120.00MiB at  2.50MiB/s ETA 00:23 (frag 3/20)
   *   [download] 100% of  120.00MiB in 00:00:48 at 2.50MiB/s
   *   [download] Destination: /path/media.f137.mp4          [Merger] Merging formats into "..."   */
  V.parseProgress = function (line) {
    line = String(line || '').trim(); if (!line) return null;
    let m = /^\[download\]\s+([\d.]+)%\s+of\s+~?\s*([\d.]+)\s*([KMGT]?i?B)(?:\s+at\s+([\d.]+|Unknown)\s*([KMGT]?i?B)?\/s)?(?:\s+ETA\s+([\d:]+|Unknown))?/i.exec(line);
    if (m) {
      const pct = parseFloat(m[1]); const total = toBytes(m[2], m[3]);
      const speed = m[4] && m[4] !== 'Unknown' ? toBytes(m[4], m[5] || 'B') : null;
      return { type: 'download', pct, total, downloaded: total ? Math.round(total * pct / 100) : null, speed, eta: m[6] && m[6] !== 'Unknown' ? m[6] : null, approx: /of\s+~/.test(line) };
    }
    m = /^\[download\]\s+100%\s+of\s+~?\s*([\d.]+)\s*([KMGT]?i?B)/i.exec(line);
    if (m) { const total = toBytes(m[1], m[2]); return { type: 'download', pct: 100, total, downloaded: total, speed: null, eta: null }; }
    if (/^\[download\]\s+Destination:/i.test(line)) return { type: 'dest' };
    if (/^\[(Merger|ffmpeg)\]\s+Merging/i.test(line)) return { type: 'merge' };
    if (/^\[(ExtractAudio|VideoConvertor|FixupM4a|FixupM3u8|FixupMp4|Fixup|VideoRemuxer)/i.test(line)) return { type: 'convert' };
    return { type: 'other' };
  };

  /* ───────────────────────── 4) النموذج الموحّد (من JSON الخاص بـ yt-dlp) ───────────────────────── */
  const num = x => (typeof x === 'number' && isFinite(x) ? x : null);
  const str = x => (typeof x === 'string' && x ? x : null);
  const hasCodec = c => !!c && c !== 'none';

  function pickThumb(o) {
    if (str(o.thumbnail)) return o.thumbnail;
    if (Array.isArray(o.thumbnails) && o.thumbnails.length) {
      const ok = o.thumbnails.filter(t => t && str(t.url));
      // آخر صورة في القائمة هي الأكبر عادة، لكن نفضّل متوسطة الحجم لسرعة العرض
      const sized = ok.filter(t => num(t.width)).sort((a, b) => a.width - b.width);
      const mid = sized.find(t => t.width >= 320) || sized[sized.length - 1] || ok[ok.length - 1];
      return mid && mid.url || null;
    }
    return null;
  }

  function normFormat(f) {
    const vc = hasCodec(f.vcodec), ac = hasCodec(f.acodec);
    const unknownCodecs = f.vcodec == null && f.acodec == null; // روابط عامة بلا معلومات ترميز
    let kind;
    if (vc && ac) kind = 'av'; else if (vc) kind = 'v'; else if (ac) kind = 'a';
    else if (unknownCodecs) kind = (f.resolution === 'audio only' || (AUDIO_EXT.includes(String(f.ext || '').toLowerCase()) && !num(f.height))) ? 'a' : 'av';
    else kind = 'x';
    const size = num(f.filesize) || num(f.filesize_approx);
    return {
      id: String(f.format_id), kind, ext: str(f.ext) || '', height: num(f.height), width: num(f.width), fps: num(f.fps),
      vcodec: vc ? String(f.vcodec).split('.')[0] : null, acodec: ac ? String(f.acodec).split('.')[0] : null,
      abr: num(f.abr), tbr: num(f.tbr), size, sizeApprox: !num(f.filesize) && !!num(f.filesize_approx),
      note: str(f.format_note) || '', protocol: str(f.protocol) || '', language: str(f.language) || '',
    };
  }

  /* يحوّل خرج yt-dlp --dump-single-json إلى النموذج الموحّد */
  function fromYtdlp(json) {
    let j = json;
    if (typeof j === 'string') { try { j = JSON.parse(j); } catch (e) { throw V.fail('EXTRACTOR_FAILED', 'JSON غير صالح من المحرك'); } }
    if (!j || typeof j !== 'object') throw V.fail('NO_VIDEO');
    const base = (o) => ({
      id: str(o.id) || null, title: str(o.title) || str(o.fulltitle) || null, thumbnail: pickThumb(o), duration: num(o.duration),
      uploader: str(o.uploader) || str(o.channel) || str(o.uploader_id) || null, url: str(o.webpage_url) || str(o.url) || str(o.original_url) || null, extractor: str(o.extractor_key) || str(o.extractor) || null,
    });
    if (j._type === 'playlist' || Array.isArray(j.entries)) {
      const entries = (j.entries || []).filter(Boolean).map((e, i) => Object.assign(base(e), { index: i, url: str(e.url) || str(e.webpage_url) || str(e.original_url) || null })).filter(e => e.url);
      return Object.assign(base(j), { kind: 'playlist', entries, url: str(j.webpage_url) || str(j.original_url) || null });
    }
    const formats = (Array.isArray(j.formats) ? j.formats : [])
      .filter(f => f && f.format_id != null && f.ext !== 'mhtml' && f.protocol !== 'mhtml' && !/^sb\d+$/.test(String(f.format_id)))
      .map(normFormat).filter(f => f.kind !== 'x');
    // فيديو بلا قائمة formats (رابط مباشر مفرد): نكوّن صيغة واحدة من الحقول العليا
    if (!formats.length && (str(j.url) || str(j.ext))) formats.push(normFormat({ format_id: str(j.format_id) || 'direct', ext: j.ext, height: j.height, width: j.width, vcodec: j.vcodec, acodec: j.acodec, filesize: j.filesize, filesize_approx: j.filesize_approx, tbr: j.tbr, protocol: j.protocol }));
    return Object.assign(base(j), { kind: 'video', formats, live: !!(j.is_live || j.live_status === 'is_live') });
  }

  /* ───────────────────────── 5) خيارات الجودة والصيغة ───────────────────────── */
  /* مسبقات للدفعات والقوائم (تُطبَّق على كل عنصر عبر محددات yt-dlp) */
  V.PRESETS = [
    { id: 'best', label: 'أفضل جودة متاحة', kind: 'av', selector: 'bv*+ba/b', mux: true },
    { id: 'h1080', label: 'حتى 1080p', kind: 'av', selector: 'bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b', mux: true },
    { id: 'h720', label: 'حتى 720p', kind: 'av', selector: 'bv*[height<=720]+ba/b[height<=720]/bv*+ba/b', mux: true },
    { id: 'h480', label: 'حتى 480p', kind: 'av', selector: 'bv*[height<=480]+ba/b[height<=480]/bv*+ba/b', mux: true },
    { id: 'h360', label: 'حتى 360p (أصغر حجماً)', kind: 'av', selector: 'bv*[height<=360]+ba/b[height<=360]/bv*+ba/b', mux: true },
    { id: 'audio', label: 'صوت فقط — أفضل جودة', kind: 'a', selector: 'ba/b', mux: false, audio: 'best' },
    { id: 'mp3', label: 'صوت فقط — MP3 (تحويل)', kind: 'a', selector: 'ba/b', mux: false, audio: 'mp3', convert: true },
  ];

  const sizeOf = (f, dur) => f.size || (f.tbr && dur ? Math.round(f.tbr * 1000 / 8 * dur) : null);
  const vlabel = f => (f.height ? f.height + 'p' : (f.width ? f.width + 'px' : 'فيديو')) + (f.fps && f.fps > 30 ? Math.round(f.fps) : '');

  /* يبني خيارات العرض من النموذج الموحّد.
   * كل خيار: { key, group:'av'|'a'|'v', label, sub, selector, mux, convert, audio, size, sizeApprox, ext } */
  V.buildOptions = function (video) {
    const dur = video.duration; const fs = video.formats || [];
    const vids = fs.filter(f => f.kind === 'av' || f.kind === 'v');
    const auds = fs.filter(f => f.kind === 'a');
    const bestAudio = auds.slice().sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0))[0] || null;
    const rank = f => (f.ext === 'mp4' ? 1e6 : 0) + (f.tbr || 0) + (f.kind === 'av' ? 0.5 : 0);
    const opts = [];

    // فيديو + صوت: خيار لكل ارتفاع (أفضل صيغة عند ذلك الارتفاع)
    const byH = new Map();
    vids.forEach(f => { const k = f.height || 0; if (!byH.has(k) || rank(f) > rank(byH.get(k))) byH.set(k, f); });
    Array.from(byH.entries()).sort((a, b) => b[0] - a[0]).forEach(([h, f]) => {
      const needMux = f.kind === 'v' && !!bestAudio;
      const sel = f.kind === 'av' ? f.id : (bestAudio ? f.id + '+ba[ext=m4a]/' + f.id + '+ba/' + f.id : f.id);
      const sz = sizeOf(f, dur); const asz = needMux ? sizeOf(bestAudio, dur) : 0;
      opts.push({ key: 'av:' + f.id, group: 'av', label: vlabel(f) + (f.ext ? ' · ' + f.ext.toUpperCase() : ''), sub: (f.kind === 'av' ? 'فيديو + صوت' : (bestAudio ? 'فيديو + صوت (دمج)' : 'فيديو بلا صوت متاح')), selector: sel, mux: needMux, size: sz ? sz + (asz || 0) : null, sizeApprox: !!f.sizeApprox || !f.size, ext: needMux ? 'mp4' : f.ext, height: h });
    });
    // صوت فقط
    if (auds.length || vids.length) {
      const ba = bestAudio;
      opts.push({ key: 'a:best', group: 'a', label: 'أفضل جودة صوت' + (ba && ba.abr ? ' (~' + Math.round(ba.abr) + 'kbps)' : ''), sub: 'صوت فقط — ' + ((ba && ba.ext) || 'أصلي'), selector: 'ba/b', mux: false, audio: 'best', size: ba ? sizeOf(ba, dur) : null, sizeApprox: true, ext: (ba && ba.ext) || 'm4a' });
      opts.push({ key: 'a:mp3', group: 'a', label: 'MP3', sub: 'صوت فقط — تحويل (يحتاج FFmpeg)', selector: 'ba/b', mux: false, audio: 'mp3', convert: true, size: null, ext: 'mp3' });
      const seen = new Set(['best']);
      auds.slice().sort((a, b) => (b.abr || 0) - (a.abr || 0)).forEach(f => {
        const k = Math.round(f.abr || 0) + f.ext; if (!f.abr || seen.has(k) || seen.size > 4) return; seen.add(k);
        opts.push({ key: 'a:' + f.id, group: 'a', label: Math.round(f.abr) + 'kbps · ' + f.ext.toUpperCase(), sub: 'صوت فقط', selector: f.id, mux: false, audio: 'best', size: sizeOf(f, dur), sizeApprox: !!f.sizeApprox || !f.size, ext: f.ext });
      });
    }
    // فيديو فقط (بلا صوت): لكل ارتفاع صيغة فيديو فقط إن وُجدت
    const vOnly = new Map();
    fs.filter(f => f.kind === 'v').forEach(f => { const k = f.height || 0; if (!vOnly.has(k) || rank(f) > rank(vOnly.get(k))) vOnly.set(k, f); });
    Array.from(vOnly.entries()).sort((a, b) => b[0] - a[0]).forEach(([h, f]) => opts.push({ key: 'v:' + f.id, group: 'v', label: vlabel(f) + (f.ext ? ' · ' + f.ext.toUpperCase() : ''), sub: 'فيديو فقط (بلا صوت)', selector: f.id, mux: false, size: sizeOf(f, dur), sizeApprox: !!f.sizeApprox || !f.size, ext: f.ext, height: h }));
    return opts;
  };
  V.GROUP_LABELS = { av: 'فيديو + صوت', a: 'صوت فقط', v: 'فيديو فقط (بلا صوت)' };
  V.fmtSize = (n, approx) => (n ? (approx ? '~' : '') + (n >= 1073741824 ? (n / 1073741824).toFixed(2) + ' GB' : n >= 1048576 ? (n / 1048576).toFixed(n >= 104857600 ? 0 : 1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB') : '');
  V.fmtDur = s => { if (!isFinite(s) || s == null) return ''; s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; const p = n => String(n).padStart(2, '0'); return h ? h + ':' + p(m) + ':' + p(x) : m + ':' + p(x); };
  V.fmtSpeed = n => (n ? V.fmtSize(n) + '/ث' : '');

  /* ───────────────────────── 6) المحوّل (adapter) والمحرك ───────────────────────── */
  const adapters = { ytdlp: { id: 'yt-dlp', parse: fromYtdlp } };
  let adapter = adapters.ytdlp;
  V.useAdapter = a => { if (!a || typeof a.parse !== 'function') throw new Error('adapter غير صالح'); adapter = a; };
  V.fromYtdlp = fromYtdlp;

  const plug = name => { try { return root.Capacitor && root.Capacitor.Plugins && root.Capacitor.Plugins[name] || null; } catch (e) { return null; } };
  V.plugin = () => plug('OmniVideo');
  V.saver = () => plug('OmniSave');
  V.available = () => !!(V.plugin() && V.saver());

  async function listen(p, ev, cb) { try { if (p && p.addListener) return await p.addListener(ev, cb); } catch (e) { /* بلا تقدم */ } return null; }

  V.engineInfo = async function () {
    const p = V.plugin();
    if (!p) return { ready: false, available: false, error: 'ENGINE_MISSING' };
    try { const r = await p.engineInfo(); return Object.assign({ available: true }, r); }
    catch (e) { return { ready: false, available: true, error: String(e && e.message || e) }; }
  };
  V.updateEngine = async function () {
    const p = V.plugin(); if (!p) throw V.fail('ENGINE_MISSING');
    try { return await p.updateEngine(); } catch (e) { throw V.toError(e); }
  };

  /* extract(url) → {kind:'video'|'playlist', ...}. الروابط المباشرة لا تمر بالمحرك الثقيل. */
  V.extract = async function (urlStr, o = {}) {
    let u; try { u = new URL(String(urlStr).trim()); } catch (e) { throw V.fail('INVALID_URL'); }
    if (!/^https?:$/.test(u.protocol)) throw V.fail('INVALID_URL');
    const d = V.directMedia(u.href);
    if (d) {
      const isAudio = AUDIO_EXT.includes(d.ext);
      let size = null, type = null;
      const sv = V.saver();
      if (sv && sv.request) { try { const r = await sv.request({ url: u.href, method: 'HEAD', timeoutMs: 12000, maxBytes: 1024 }); const hd = r.headers || {}; size = +hd['content-length'] || null; type = hd['content-type'] || null; if (r.status >= 400) throw V.fail(r.status === 404 ? 'HTTP_404' : r.status === 403 ? 'HTTP_403' : 'HTTP_ERROR', 'HTTP ' + r.status); } catch (e) { if (e && e.code) throw e; /* HEAD قد لا يُدعم: نكمل */ } }
      return { kind: 'video', direct: true, id: null, title: V.safeName(d.name.replace(/\.[^.]+$/, ''), 'video'), thumbnail: null, duration: null, uploader: null, url: u.href, extractor: 'direct', contentType: type,
        formats: [{ id: 'direct', kind: isAudio ? 'a' : 'av', ext: d.ext, height: null, size, sizeApprox: false, vcodec: null, acodec: null, note: 'ملف مباشر', protocol: u.protocol.replace(':', '') }] };
    }
    const p = V.plugin(); if (!p) throw V.fail('ENGINE_MISSING');
    let r;
    try { r = await p.extract({ url: u.href, playlistEnd: o.playlistEnd || 100, timeoutSec: o.timeoutSec || 90 }); }
    catch (e) { throw V.toError(e); }
    const out = adapter.parse(r && (r.json != null ? r.json : r));
    if (out.kind === 'playlist' && !out.entries.length) throw V.fail('NO_VIDEO');
    if (out.kind === 'video' && !out.formats.length) throw V.fail('NO_VIDEO');
    if (out.kind === 'video' && out.live) throw V.fail('UNAVAILABLE', 'بث مباشر غير مدعوم');
    return out;
  };

  let seq = 0;
  const newId = () => 'j' + Date.now().toString(36) + (seq++).toString(36);
  const extFromPath = p => { const m = /\.([A-Za-z0-9]{2,5})$/.exec(p || ''); return m ? m[1].toLowerCase() : ''; };

  /* download(job): job = {title, url, direct, option:{selector,mux,audio,convert,ext,size}}
   *   ctl = {cancelled, cancel()} يُملأ داخلياً؛ onProgress({stage, pct, downloaded, total, speed, eta, text})
   * يرجع {name, path, bytes}. يرمي أخطاء مُصنَّفة (V.toError). */
  V.download = async function (job, ctl, onProgress) {
    ctl = ctl || {}; onProgress = onProgress || (() => {});
    const saver = V.saver(); if (!saver) throw V.fail('ENGINE_MISSING');
    const opt = job.option || {}; const title = V.safeName(job.title, 'video');
    const cleanup = [];
    const guard = () => { if (ctl.cancelled) throw V.fail('CANCELLED'); };
    try {
      guard();
      /* (أ) رابط مباشر: التنزيل الأصلي عبر OmniSave مباشرة إلى التنزيلات */
      if (job.direct) {
        const ext = opt.ext || V.directMedia(job.url).ext; const name = title + '.' + ext;
        const off = await listen(saver, 'downloadProgress', e => onProgress({ stage: 'download', pct: e.total > 0 ? e.received / e.total * 100 : null, downloaded: e.received, total: e.total > 0 ? e.total : null }));
        cleanup.push(() => off && off.remove && off.remove());
        ctl.cancel = () => { ctl.cancelled = true; try { saver.cancelDownload && saver.cancelDownload(); } catch (e) { /* ignore */ } };
        onProgress({ stage: 'download', pct: null });
        let r; try { r = await saver.download({ url: job.url, name }); } catch (e) { if (ctl.cancelled) throw V.fail('CANCELLED'); throw V.toError(e); }
        if (/text\/html/i.test(r.contentType || '')) throw V.fail('NO_VIDEO', 'الرابط أعاد صفحة HTML وليس ملف وسائط');
        return { name, path: r.path || name, bytes: r.bytes || 0 };
      }
      /* (ب) عبر المحرك: تنزيل إلى مجلد مؤقت ثم نقل النتيجة إلى OmniSave */
      const eng = V.plugin(); if (!eng) throw V.fail('ENGINE_MISSING');
      const id = newId(); let stream = 0; let lastPct = 0;
      const off = await listen(eng, 'videoProgress', e => {
        if (!e || e.id !== id) return;
        const pr = V.parseProgress(e.line);
        if (pr && pr.type === 'dest') stream++;
        if (pr && pr.type === 'merge') return onProgress({ stage: 'merge', pct: null, text: 'دمج الصوت والفيديو…' });
        if (pr && pr.type === 'convert') return onProgress({ stage: 'convert', pct: null, text: 'تحويل الملف…' });
        if (pr && pr.type === 'download') { lastPct = pr.pct; return onProgress({ stage: 'download', part: stream || 1, pct: pr.pct, downloaded: pr.downloaded, total: pr.total, speed: pr.speed, eta: pr.eta, approx: pr.approx }); }
        if (typeof e.percent === 'number' && e.percent >= 0) { lastPct = e.percent; onProgress({ stage: 'download', part: stream || 1, pct: e.percent, eta: e.eta }); }
      });
      cleanup.push(() => off && off.remove && off.remove());
      ctl.cancel = () => { ctl.cancelled = true; try { eng.cancel({ id }); } catch (e) { /* ignore */ } };
      cleanup.push(() => { try { eng.cleanup({ id }); } catch (e) { /* ignore */ } });
      onProgress({ stage: 'prepare', pct: null, text: 'بدء التنزيل…' });
      let r;
      try {
        r = await eng.download({ id, url: job.url, selector: opt.selector || 'bv*+ba/b', mux: !!opt.mux, audio: opt.audio || '', estimateBytes: opt.size || 0 });
      } catch (e) { if (ctl.cancelled) throw V.fail('CANCELLED'); throw V.toError(e); }
      guard();
      const ext = r.ext || extFromPath(r.path) || opt.ext || 'mp4'; const name = title + '.' + ext;
      onProgress({ stage: 'save', pct: null, text: 'حفظ الملف في التنزيلات…' });
      const off2 = await listen(saver, 'saveProgress', e => onProgress({ stage: 'save', pct: e.total > 0 ? e.received / e.total * 100 : null, downloaded: e.received, total: e.total > 0 ? e.total : null, text: 'حفظ الملف في التنزيلات…' }));
      cleanup.push(() => off2 && off2.remove && off2.remove());
      let s;
      try { s = await saver.saveFromPath({ path: r.path, name, mime: V.mimeOf(ext), deleteSource: true }); }
      catch (e) { const er = V.toError(e); if (er.code === 'UNKNOWN') { const f = V.fail('SAVE_FAILED', er.detail); throw f; } throw er; }
      return { name, path: s.path || name, bytes: s.bytes || r.size || 0 };
    } finally { cleanup.reverse().forEach(f => { try { f(); } catch (e) { /* ignore */ } }); }
  };

  /* ───────────────────────── 7) طابور التنزيل ───────────────────────── */
  /* items: [{title, url, direct?, option}]؛ يعمل بالتتابع، وفشل عنصر لا يوقف الباقي.
   * حالات العنصر: pending | running | done | failed | cancelled
   * opts.run(item, ctl, onProgress) يمكن استبداله (للاختبار)؛ opts.onChange(queue) عند كل تغيير. */
  V.createQueue = function (items, opts = {}) {
    const run = opts.run || V.download; const onChange = opts.onChange || (() => {});
    const q = {
      items: items.map((it, i) => Object.assign({}, it, { i, status: 'pending', progress: null, error: null, result: null })),
      running: false, cancelledAll: false, current: -1, _ctl: null,
      get done() { return this.items.filter(x => x.status === 'done').length; },
      get failed() { return this.items.filter(x => x.status === 'failed').length; },
      get total() { return this.items.length; },
      get finished() { return !this.running && this.items.every(x => x.status !== 'pending' && x.status !== 'running'); },
      async start() {
        if (this.running) return; this.running = true; this.cancelledAll = false; onChange(this);
        try {
          for (let i = 0; i < this.items.length; i++) {
            const it = this.items[i];
            if (it.status !== 'pending') continue;
            if (this.cancelledAll) { it.status = 'cancelled'; continue; }
            this.current = i; it.status = 'running'; it.progress = null; this._ctl = { cancelled: false }; onChange(this);
            try {
              it.result = await run(it, this._ctl, p => { it.progress = p; onChange(this); });
              it.status = 'done'; it.progress = null;
            } catch (e) {
              const er = V.toError(e);
              if (er.code === 'CANCELLED') it.status = 'cancelled'; else { it.status = 'failed'; it.error = er; }
              it.progress = null;
            }
            this._ctl = null; onChange(this);
          }
        } finally { this.running = false; this.current = -1; onChange(this); }
      },
      /* يوقف الجاري ويلغي ما تبقى */
      cancelAll() { this.cancelledAll = true; if (this._ctl) { this._ctl.cancelled = true; try { this._ctl.cancel && this._ctl.cancel(); } catch (e) { /* ignore */ } } this.items.forEach(x => { if (x.status === 'pending') x.status = 'cancelled'; }); onChange(this); },
      /* يلغي عنصراً واحداً (جارياً أو منتظراً) ويكمل الباقي */
      cancelItem(i) { const it = this.items[i]; if (!it) return; if (it.status === 'pending') { it.status = 'cancelled'; onChange(this); } else if (it.status === 'running' && this._ctl) { this._ctl.cancelled = true; try { this._ctl.cancel && this._ctl.cancel(); } catch (e) { /* ignore */ } } },
      /* يعيد الفاشل/الملغى إلى الانتظار ويشغّل الطابور */
      retryFailed() { this.items.forEach(x => { if (x.status === 'failed' || x.status === 'cancelled') { x.status = 'pending'; x.error = null; } }); return this.start(); },
    };
    return q;
  };

  root.__OF_VIDEO__ = V;
  if (typeof root.OF !== 'undefined' && root.OF) root.OF.video = V;
  if (typeof module !== 'undefined' && module.exports) module.exports = V;
})(typeof window !== 'undefined' ? window : globalThis);
