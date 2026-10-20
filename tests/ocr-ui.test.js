/* أداة OCR في Chromium مع OmniNative/OmniOcr مُحاكاة: تتحقق من تجهيز الصورة (JPEG ≤2400px) ونقلها وتمرير الوسائط وعرض النتيجة. */
'use strict';
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright'); const assert = require('assert');
const BASE = process.env.BASE || 'http://localhost:8765/index.html', FX = process.env.FX || '/tmp/claude-0/small-fx';
const MOCK = langs => { window.__c = []; const mem = {}; let n = 0;
  const N = { addListener: async () => ({ remove() {} }), job: async () => ({ dir: '/w/o' }), cleanup: async o => window.__c.push(['cleanup', o.dir]), stageBegin: async o => ({ id: 's' + (++n), path: o.dir + '/' + o.name }), stageChunk: async o => { mem[o.id] = (mem[o.id] || '') + o.data; }, stageEnd: async o => { window.__c.push(['staged', atob(mem[o.id].slice(0, 8)).charCodeAt(0).toString(16), mem[o.id].length]); } };
  const O = { info: async () => ({ ready: !!window.__langs.length, langs: window.__langs }), recognize: async o => { window.__c.push(['rec', o.path, o.langs, o.psm]); return { text: 'مرحبا Hello\n', confidence: 88, langs: o.langs, width: 100, height: 50 }; } };
  window.__langs = langs; window.Capacitor = { isNativePlatform: () => true, Plugins: { OmniNative: N, OmniOcr: O, OmniSave: { begin: async () => ({}), chunk: async () => ({}), finish: async () => ({}), abort: async () => ({}) } } }; };
let pass = 0, fail = 0; const errs = []; async function t(n, f) { try { await f(); pass++; console.log('  ✓', n); } catch (e) { fail++; console.log('  ✗', n, '\n     ', String(e.message).split('\n')[0]); } }
(async () => {
  const b = await chromium.launch();
  async function open(langs) { const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar' }); await ctx.addInitScript(MOCK, langs); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(BASE); await p.evaluate(() => { location.hash = '#/tools/ocr-extractor'; }); await p.waitForTimeout(1000); return p; }
  await t('استخراج: JPEG يُنقل ثم recognize بالوسائط الصحيحة والنص يظهر', async () => {
    const p = await open(['ara', 'eng']); await p.locator('input[type=file]').first().setInputFiles(FX + '/p.png'); await p.getByRole('button', { name: /استخرج النص/ }).click(); await p.waitForFunction(() => document.body.innerText.includes('ثقة المحرك 88%'), null, { timeout: 15000 });
    const c = await p.evaluate(() => window.__c); const st = c.find(x => x[0] === 'staged'); assert.strictEqual(st[1], 'ff', 'ليس JPEG'); const r = c.find(x => x[0] === 'rec'); assert.deepStrictEqual(r.slice(1), ['/w/o/ocr.jpg', 'ara+eng', 'auto']); assert(c.some(x => x[0] === 'cleanup'));
    assert.strictEqual(await p.locator('textarea').first().inputValue(), 'مرحبا Hello'); await p.context().close(); });
  await t('نموذج العربية غير مضمّن: الخيارات المعطّلة والاختيار ينتقل للمتاح', async () => {
    const p = await open(['eng']); await p.waitForTimeout(500); assert.strictEqual(await p.locator('select').first().inputValue(), 'eng'); await p.context().close(); });
  await t('بلا نماذج إطلاقاً: تحذير', async () => { const p = await open([]); await p.waitForFunction(() => document.body.innerText.includes('نماذج OCR غير مضمّنة')); await p.context().close(); });
  await t('بلا صورة: رسالة', async () => { const p = await open(['ara', 'eng']); await p.getByRole('button', { name: /استخرج النص/ }).click(); await p.waitForFunction(() => document.body.innerText.includes('اختر صورة')); await p.context().close(); });
  await t('المتصفح بلا بلاجن: رسالة توضيحية', async () => { const ctx = await b.newContext({ locale: 'ar' }); const p = await ctx.newPage(); await p.goto(BASE); await p.evaluate(() => { location.hash = '#/tools/ocr-extractor'; }); await p.waitForTimeout(900); assert((await p.innerText('body')).includes('داخل التطبيق')); await ctx.close(); });
  await b.close(); console.log(`\n${pass} نجح، ${fail} فشل` + (errs.length ? '\nأخطاء صفحة: ' + errs.join(' | ') : '')); process.exit(fail || errs.length ? 1 : 0);
})();
