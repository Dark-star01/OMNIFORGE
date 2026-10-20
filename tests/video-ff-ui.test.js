/* تبويب MP4 (FFmpeg) في ورشة الفيديو داخل Chromium مع OmniNative/OmniMedia/OmniSave مُحاكاة (تتحقق من الوسائط المُرسلة فقط). */
'use strict';
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright'); const assert = require('assert');
const BASE = process.env.BASE || 'http://localhost:8765/index.html';
const MOCK = () => {
  window.__c = []; const INFO = 'Input #0, mov,mp4\n  Duration: 00:00:10.00, start: 0.000000, bitrate: 800 kb/s\n  Stream #0:0(und): Video: h264 (High), yuv420p, 640x360, 700 kb/s, 30 fps\n  Stream #0:1(und): Audio: aac (LC), 44100 Hz, stereo, fltp, 96 kb/s\n';
  let n = 0; const N = { addListener: async () => ({ remove() {} }), job: async () => ({ dir: '/w/j' }), cleanup: async o => window.__c.push(['cleanup', o.dir]),
    pickFiles: async o => { const k = window.__pickN || 1; return { files: Array.from({ length: k }, (_, i) => ({ path: '/w/j/' + i + '_clip' + i + '.mp4', name: i + '_clip' + i + '.mp4', size: 5e6, mime: 'video/mp4' })) }; } };
  const M = { addListener: async () => ({ remove() {} }), info: async () => ({ ready: true, version: 'ffmpeg' }), encoders: async () => ({ text: ' V....D libx264              H.264\n A....D aac                  AAC\n' }), probe: async o => ({ text: INFO }),
    run: async o => { window.__c.push(['run', o.args, o.concat]); return { path: '/w/j/out.mp4', size: 1234567, exit: 0 }; }, cancel: async () => ({}) };
  const S = { saveFromPath: async o => { window.__c.push(['save', o.name, o.mime]); return { path: 'Download/OMNIFORGE/' + o.name }; }, begin: async () => ({}), chunk: async () => ({}), finish: async () => ({}), abort: async () => ({}) };
  window.Capacitor = { isNativePlatform: () => true, Plugins: { OmniNative: N, OmniMedia: M, OmniSave: S } };
};
let pass = 0, fail = 0; const errs = []; async function t(n, f) { try { await f(); pass++; console.log('  ✓', n); } catch (e) { fail++; console.log('  ✗', n, '\n     ', String(e.message).split('\n')[0]); } }
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar' }); await ctx.addInitScript(MOCK);
  async function open(pn) { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(BASE); await p.evaluate(() => { location.hash = '#/tools/video-workshop'; }); await p.waitForTimeout(900); await p.getByRole('tab', { name: /MP4 \(FFmpeg\)/ }).click(); if (pn) await p.evaluate(n => { window.__pickN = n; }, pn); return p; }
  const lastRun = p => p.evaluate(() => window.__c.filter(x => x[0] === 'run').pop());
  await t('قص: اختيار ثم تشغيل → وسائط -ss/-t/copy وحفظ', async () => {
    const p = await open(); await p.getByRole('button', { name: /اختر ملف/ }).click(); await p.waitForFunction(() => document.body.innerText.includes('640×360'));
    await p.locator('input[dir=ltr]').nth(0).fill('0:02'); await p.locator('input[dir=ltr]').nth(1).fill('0:05'); await p.getByRole('button', { name: /^ابدأ$/ }).click(); await p.waitForFunction(() => document.body.innerText.includes('اكتمل'));
    const r = await lastRun(p); const a = r[1]; assert(a.includes('-ss') && a[a.indexOf('-ss') + 1] === '2' && a[a.indexOf('-t') + 1] === '3' && a.includes('copy') && a[a.length - 1] === '/w/j/out.mp4', a.join(' ')); const s = (await p.evaluate(() => window.__c)).find(x => x[0] === 'save'); assert.strictEqual(s[1], 'clip0_trim.mp4'); assert.strictEqual(s[2], 'video/mp4'); await p.close(); });
  await t('ضغط 480p: مرمّز libx264 ومرشّح scale', async () => {
    const p = await open(); await p.getByRole('button', { name: /اختر ملف/ }).click(); await p.waitForFunction(() => document.body.innerText.includes('640×360')); await p.locator('select').first().selectOption('compress');
    await p.locator('select').nth(1).selectOption('480'); await p.getByRole('button', { name: /^ابدأ$/ }).click(); await p.waitForFunction(() => document.body.innerText.includes('اكتمل')); const a = (await lastRun(p))[1].join(' '); assert(/libx264/.test(a) && /scale=-2:'min\(480,ih\)'/.test(a), a); await p.close(); });
  await t('تحويل إلى M4A يحفظ بامتداد ونوع صحيحين', async () => {
    const p = await open(); await p.getByRole('button', { name: /اختر ملف/ }).click(); await p.waitForFunction(() => document.body.innerText.includes('640×360')); await p.locator('select').first().selectOption('convert'); await p.locator('select').nth(1).selectOption('m4a');
    await p.getByRole('button', { name: /^ابدأ$/ }).click(); await p.waitForFunction(() => document.body.innerText.includes('اكتمل')); const s = (await p.evaluate(() => window.__c)).find(x => x[0] === 'save'); assert.strictEqual(s[1], 'clip0_converted.m4a'); assert.strictEqual(s[2], 'audio/mp4'); await p.close(); });
  await t('MP3 مرفوض عند غياب libmp3lame برسالة واضحة', async () => {
    const p = await open(); await p.getByRole('button', { name: /اختر ملف/ }).click(); await p.waitForFunction(() => document.body.innerText.includes('640×360')); await p.locator('select').first().selectOption('convert'); await p.locator('select').nth(1).selectOption('mp3');
    await p.getByRole('button', { name: /^ابدأ$/ }).click(); await p.waitForFunction(() => document.body.innerText.includes('libmp3lame') || document.body.innerText.includes('MP3 غير موجود')); await p.close(); });
  await t('دمج: ملفان متطابقان → نسخ concat مع {{LIST}}', async () => {
    const p = await open(2); await p.locator('select').first().selectOption('merge'); await p.getByRole('button', { name: /اختر ملف/ }).click(); await p.waitForFunction(() => document.body.innerText.includes('clip1')); await p.getByRole('button', { name: /^ابدأ$/ }).click(); await p.waitForFunction(() => document.body.innerText.includes('اكتمل'));
    const r = await lastRun(p); assert(r[1].includes('{{LIST}}') && r[1].includes('concat') && r[2].length === 2, JSON.stringify(r)); await p.close(); });
  await t('دمج بملف واحد يُرفض', async () => { const p = await open(1); await p.locator('select').first().selectOption('merge'); await p.getByRole('button', { name: /اختر ملف/ }).click(); await p.waitForFunction(() => document.body.innerText.includes('ملفين على الأقل')); await p.close(); });
  await t('زمن غير صالح يُرفض', async () => { const p = await open(); await p.getByRole('button', { name: /اختر ملف/ }).click(); await p.waitForFunction(() => document.body.innerText.includes('640×360')); await p.locator('input[dir=ltr]').nth(0).fill('abc'); await p.getByRole('button', { name: /^ابدأ$/ }).click(); await p.waitForFunction(() => document.body.innerText.includes('صيغة الزمن')); await p.close(); });
  await t('في المتصفح بلا بلاجن: رسالة توضيحية بدل الأدوات', async () => { const c2 = await b.newContext({ locale: 'ar' }); const p = await c2.newPage(); await p.goto(BASE); await p.evaluate(() => { location.hash = '#/tools/video-workshop'; }); await p.waitForTimeout(900); await p.getByRole('tab', { name: /MP4 \(FFmpeg\)/ }).click(); assert((await p.innerText('body')).includes('داخل التطبيق')); await c2.close(); });
  await b.close(); console.log(`\n${pass} نجح، ${fail} فشل` + (errs.length ? '\nأخطاء صفحة: ' + errs.join(' | ') : '')); process.exit(fail || errs.length ? 1 : 0);
})();
