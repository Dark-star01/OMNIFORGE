/* يولّد حالات اختبار JVM لـ FfArgs: أوامر ffcmd.js الحقيقية (يجب أن تُقبل وتُنفَّذ) + أوامر خبيثة (يجب أن تُرفض).
 * الصيغة: سطر لكل حالة  KIND \t NAME \t arg1 \x1f arg2 ...  حيث $W = مجلد العمل. الناتج: /tmp/claude-0/kt/ff_cases.txt */
'use strict';
const fs = require('fs'), path = require('path'); const FF = require(path.join(process.env.APP_SRC || path.resolve(__dirname, '../../omniforge-src'), 'js/ffcmd.js'));
const enc = { name: 'libx264', kind: 'h264' }, I = '$W/in.mp4', O = n => '$W/' + n; const rows = [];
const ok = (n, a, o) => rows.push(['RUN', n, a].concat(o || []));
ok('trim copy', FF.trim({ input: I, output: O('o1.mp4'), start: 0.5, end: 1.5, mode: 'copy' }));
ok('trim encode', FF.trim({ input: I, output: O('o2.mp4'), start: 0.5, end: 1.5, mode: 'encode', encoder: enc, crf: 28 }));
ok('convert mp4', FF.convert({ input: I, output: O('o3.mp4'), target: 'mp4', encoder: enc, crf: 30 }));
ok('convert remux-mp4', FF.convert({ input: I, output: O('o4.mp4'), target: 'remux-mp4' }));
ok('convert remux-mkv', FF.convert({ input: I, output: O('o5.mkv'), target: 'remux-mkv' }));
ok('convert m4a', FF.convert({ input: I, output: O('o6.m4a'), target: 'm4a', abr: 96 }));
ok('compress', FF.compress({ input: I, output: O('o7.mp4'), maxHeight: 120, encoder: enc, crf: 30, abr: 64 }));
ok('compress بلا صوت', FF.compress({ input: I, output: O('o8.mp4'), encoder: enc, audio: false }));
ok('merge reencode', FF.merge({ inputs: [{ path: I, hasAudio: true }, { path: '$W/in2.mp4', hasAudio: true }], mode: 'reencode', encoder: enc, width: 160, height: 120, fps: 15, output: O('o9.mp4') }));
ok('merge copy', FF.merge({ inputs: [{ path: I }, { path: '$W/in2.mp4' }], mode: 'copy', listFile: '{{LIST}}', output: O('o10.mp4') }), ['CONCAT']);
const bad = (n, a) => rows.push(['BAD', n, a]);
const base = ['-y', '-i', I]; const o = O('x.mp4');
bad('مدخل خارج مجلد العمل', ['-y', '-i', '/etc/passwd', o]); bad('مخرج خارج مجلد العمل', [...base, '/tmp/evil.mp4']); bad('مدخل http', ['-y', '-i', 'http://example.com/a.mp4', o]);
bad('movie في -vf', [...base, '-vf', 'movie=/etc/passwd', o]); bad('subtitles', [...base, '-vf', 'subtitles=/etc/passwd', o]); bad('drawtext textfile', [...base, '-vf', "drawtext=textfile=/etc/passwd", o]);
bad('movie داخل filter_complex', [...base, '-filter_complex', '[0:v]scale=1:1[a];movie=/etc/passwd[b]', '-map', '[a]', o]); bad('sendcmd', [...base, '-vf', 'scale=1:1,sendcmd=f=/x', o]);
bad('خيار غير مسموح -metadata', [...base, '-metadata', 'a=b', o]); bad('-f lavfi', ['-y', '-f', 'lavfi', '-i', I, o]); bad('-protocol_whitelist', ['-protocol_whitelist', 'file', ...base, o]);
bad('ترميز غير مسموح', [...base, '-c:v', 'libfdk_aac', o]); bad('امتداد المخرج', [...base, '$W/x.sh']); bad('المخرج = المدخل', ['-y', '-i', I, I]); bad('بلا مخرج', ['-y', '-i', I]);
bad('-ss نص', ['-y', '-ss', 'abc', '-i', I, o]); bad('-map حقن', [...base, '-map', '0:v:0;x', o]); bad('أحرف شاذة في المرشّح', [...base, '-vf', 'scale=1:1`id`', o]); bad('NUL', [...base, '-vf', 'scale=1:1\u0000', o]);
bad('وسيط موضعي إضافي', ['-y', 'extra', '-i', I, o]); bad('concat بدون safe', ['-y', '-f', 'concat', '-i', I, o]);
fs.mkdirSync('/tmp/claude-0/kt', { recursive: true }); fs.writeFileSync('/tmp/claude-0/kt/ff_cases.txt', rows.map(r => [r[0], r[1], r[2].join('\x1f'), r[3] || ''].join('\t')).join('\n') + '\n'); console.log(rows.length + ' حالة');
