/* مُنشئ أوامر FFmpeg لورشة الفيديو (قص/تحويل/ضغط/دمج) + محلّلات المخرجات. دوال نقية بلا DOM — تُختبر على Node مع ffmpeg الحقيقي. */
(function (root) {
  'use strict';
  const FF = {};
  /* ───── الزمن ───── */
  FF.parseTime = s => { s = String(s == null ? '' : s).trim().replace(',', '.'); if (!s) return NaN; if (/^\d+(\.\d+)?$/.test(s)) return +s; const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/.exec(s); if (!m) return NaN; const v = (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]); return +m[2] < 60 && +m[3] < 60 ? v : NaN; };
  FF.fmtTime = sec => { sec = Math.max(0, sec || 0); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + (s < 10 ? '0' : '') + s.toFixed(1).replace(/\.0$/, ''); };
  /* ───── تحليل مخرجات ffmpeg ───── */
  FF.parseEncoders = txt => { const set = new Set(); for (const l of String(txt).split('\n')) { const m = /^\s*([VAS][A-Z.]{5})\s+(\S+)\s/.exec(l); if (m) set.add(m[2]); } return set; };
  FF.pickVideoEncoder = set => (set.has('libx264') ? { name: 'libx264', kind: 'h264' } : set.has('libopenh264') ? { name: 'libopenh264', kind: 'h264' } : set.has('mpeg4') ? { name: 'mpeg4', kind: 'mpeg4' } : null);
  FF.parseInfo = txt => { // مخرجات `ffmpeg -i file` (stderr)
    txt = String(txt); const info = { duration: null, bitrate: null, video: null, audio: null, streams: [] };
    let m = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(txt); if (m) info.duration = +m[1] * 3600 + +m[2] * 60 + +m[3]; m = /bitrate:\s*(\d+)\s*kb\/s/.exec(txt); if (m) info.bitrate = +m[1];
    for (const l of txt.split('\n')) { const s = /Stream #\d+:\d+(?:\[[^\]]*\])?(?:\([^)]*\))?:\s*(Video|Audio|Subtitle):\s*([^,\n]+)(.*)$/.exec(l); if (!s) continue; const rest = s[3] || ''; const st = { type: s[1].toLowerCase(), codec: s[2].trim().split(' ')[0] };
      if (st.type === 'video') { if (/attached pic/.test(l)) continue; const d = /\b(\d{2,5})x(\d{2,5})\b/.exec(rest); if (d) { st.width = +d[1]; st.height = +d[2]; } const f = /([\d.]+)\s*fps/.exec(rest); if (f) st.fps = +f[1]; const rot = /rotate\s*:\s*(-?\d+)/.exec(txt); if (rot) st.rotate = +rot[1]; if (!info.video) info.video = st; }
      else if (st.type === 'audio') { const hz = /(\d+)\s*Hz/.exec(rest); if (hz) st.hz = +hz[1]; if (!info.audio) info.audio = st; } info.streams.push(st); }
    return info;
  };
  FF.parseProgress = (line, durationSec) => { // سطر من -progress pipe:1
    let m = /^out_time_(?:us|ms)=(-?\d+)/.exec(String(line).trim()); if (m) { const sec = +m[1] / 1e6; return { type: 'time', sec, pct: durationSec > 0 ? Math.max(0, Math.min(99, sec / durationSec * 100)) : null }; } m = /^speed=\s*([\d.]+)x/.exec(String(line).trim()); if (m) return { type: 'speed', x: +m[1] }; if (/^progress=end/.test(String(line).trim())) return { type: 'end' }; return null; };
  /* ───── مساعدات ───── */
  const q = (n, lo, hi, d) => { n = +n; return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const even = n => Math.max(2, Math.round(n / 2) * 2);
  const encArgs = (enc, o) => { // ترميز الفيديو حسب المتاح: x264 بـ CRF، أو mpeg4 بجودة ثابتة (احتياطي أضعف)
    if (!enc) throw new Error('لا يوجد مرمّز فيديو متاح في FFmpeg المضمّن (libx264/mpeg4)');
    if (enc.kind === 'h264' && enc.name === 'libx264') return ['-c:v', 'libx264', '-preset', o.preset || 'veryfast', '-crf', String(q(o.crf, 14, 38, 23)), '-pix_fmt', 'yuv420p'];
    if (enc.kind === 'h264') return ['-c:v', enc.name, '-b:v', Math.round(q(o.vkbps, 200, 40000, 2500)) + 'k', '-pix_fmt', 'yuv420p'];
    const qv = Math.round(2 + (q(o.crf, 14, 38, 23) - 14) / 24 * 29); return ['-c:v', 'mpeg4', '-q:v', String(Math.max(2, Math.min(31, qv))), '-pix_fmt', 'yuv420p']; // q أصغر = جودة أعلى
  };
  const audioArgs = (o) => (o.audio === false ? ['-an'] : ['-c:a', 'aac', '-b:a', Math.round(q(o.abr, 48, 320, 128)) + 'k', '-ac', '2']);
  const progress = ['-progress', 'pipe:1', '-nostats', '-hide_banner'];
  const common = ['-y', ...progress];
  /* ───── العمليات ───── */
  // قص: copy = بلا إعادة ترميز (فوري، الحدود عند أقرب إطار مفتاحي)؛ encode = دقيق للإطار.
  FF.trim = o => {
    const s = o.start == null || isNaN(o.start) ? 0 : o.start, e = o.end == null || isNaN(o.end) ? null : o.end;
    if (s < 0) throw new Error('البداية سالبة'); if (e != null && e <= s) throw new Error('النهاية يجب أن تكون بعد البداية'); if (o.duration && s >= o.duration) throw new Error('البداية بعد نهاية الفيديو');
    const a = [...common]; if (s > 0) a.push('-ss', String(s)); a.push('-i', o.input); if (e != null) a.push('-t', String(+(e - s).toFixed(3)));
    if (o.mode === 'copy') a.push('-map', '0:v:0?', '-map', '0:a:0?', '-c', 'copy', '-avoid_negative_ts', 'make_zero'); else { a.push('-map', '0:v:0?', '-map', '0:a:0?', ...encArgs(o.encoder, o), ...audioArgs(o)); }
    a.push('-movflags', '+faststart', o.output); return a;
  };
  // تحويل: mp4 (H.264+AAC)، remux (نسخ التدفقات إلى حاوية mp4/mkv)، m4a (صوت فقط AAC)، mp3 إن توفّر libmp3lame
  FF.convert = o => {
    const a = [...common, '-i', o.input];
    switch (o.target) {
      case 'mp4': a.push('-map', '0:v:0?', '-map', '0:a:0?', ...encArgs(o.encoder, o), ...audioArgs(o), '-movflags', '+faststart'); break;
      case 'remux-mp4': a.push('-map', '0:v:0?', '-map', '0:a:0?', '-c', 'copy', '-movflags', '+faststart'); break;
      case 'remux-mkv': a.push('-map', '0:v:0?', '-map', '0:a:0?', '-map', '0:s?', '-c', 'copy'); break;
      case 'm4a': a.push('-vn', '-map', '0:a:0', '-c:a', 'aac', '-b:a', Math.round(q(o.abr, 48, 320, 160)) + 'k', '-movflags', '+faststart'); break;
      case 'mp3': if (!o.hasMp3) throw new Error('مرمّز MP3 (libmp3lame) غير متوفر في FFmpeg المضمّن'); a.push('-vn', '-map', '0:a:0', '-c:a', 'libmp3lame', '-b:a', Math.round(q(o.abr, 48, 320, 192)) + 'k'); break;
      default: throw new Error('هدف التحويل غير معروف: ' + o.target);
    } a.push(o.output); return a;
  };
  // ضغط: تصغير الدقة (حد أقصى للارتفاع) + CRF + معدل صوت
  FF.compress = o => {
    const a = [...common, '-i', o.input, '-map', '0:v:0?', '-map', '0:a:0?']; const h = o.maxHeight ? even(+o.maxHeight) : 0;
    if (h) a.push('-vf', `scale=-2:'min(${h},ih)':flags=lanczos`); a.push(...encArgs(o.encoder, o), ...audioArgs(o), '-movflags', '+faststart', o.output); return a;
  };
  // دمج: concat-copy (نفس الترميز والأبعاد تماماً، فوري) أو reencode (يوحّد الأبعاد/المعدل). listFile: ملف قائمة يكتبه المكوّن الأصلي.
  FF.merge = o => {
    const ins = o.inputs; if (!ins || ins.length < 2) throw new Error('اختر ملفين على الأقل');
    if (o.mode === 'copy') return [...common, '-f', 'concat', '-safe', '0', '-i', o.listFile, '-map', '0:v:0?', '-map', '0:a:0?', '-c', 'copy', '-movflags', '+faststart', o.output];
    const W = even(o.width || 1280), H = even(o.height || 720), fps = q(o.fps, 5, 60, 30); const useAudio = o.audio !== false && ins.every(i => i.hasAudio);
    const a = [...common]; ins.forEach(i => a.push('-i', i.path)); let fc = '';
    ins.forEach((_, k) => { fc += `[${k}:v:0]scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${fps},format=yuv420p[v${k}];`; if (useAudio) fc += `[${k}:a:0]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a${k}];`; });
    fc += ins.map((_, k) => `[v${k}]` + (useAudio ? `[a${k}]` : '')).join('') + `concat=n=${ins.length}:v=1:a=${useAudio ? 1 : 0}[v]` + (useAudio ? '[a]' : '');
    a.push('-filter_complex', fc, '-map', '[v]'); if (useAudio) a.push('-map', '[a]'); a.push(...encArgs(o.encoder, o), ...(useAudio ? ['-c:a', 'aac', '-b:a', Math.round(q(o.abr, 48, 320, 128)) + 'k'] : ['-an']), '-movflags', '+faststart', o.output); return a;
  };
  FF.concatList = paths => paths.map(p => "file '" + String(p).replace(/'/g, "'\\''") + "'").join('\n') + '\n';
  // هل الملفات متوافقة لنسخ concat؟ (نفس الترميز والأبعاد ومعدل العينة)
  FF.canConcatCopy = infos => { const f = infos[0]; return infos.every(i => i.video && f.video && i.video.codec === f.video.codec && i.video.width === f.video.width && i.video.height === f.video.height && !!i.audio === !!f.audio && (!i.audio || (i.audio.codec === f.audio.codec && i.audio.hz === f.audio.hz))); };
  FF.estimateOutput = (o) => { const d = o.duration || 0; if (!d) return null; return Math.round(d * ((o.vkbps || 1500) + (o.abr || 128)) * 125); };
  if (typeof module !== 'undefined' && module.exports) module.exports = FF; else { root.OF = root.OF || {}; root.OF.ffcmd = FF; }
})(typeof window !== 'undefined' ? window : globalThis);
