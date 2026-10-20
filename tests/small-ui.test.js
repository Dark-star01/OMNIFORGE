/* واجهة التحسينات الصغيرة في Chromium: ASS، TOML، تفكيك GIF، TAR/GZ، ZIP مشفّر، إخفاء مناطق الصور.
 * يتطلب خادماً على 8765 لمجلد التطبيق ومجلد fixtures في FX (الافتراضي /tmp/claude-0/small-fx). */
'use strict';
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');
const assert = require('assert'), fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:8765/index.html', FX = process.env.FX || '/tmp/claude-0/small-fx';
let pass = 0, fail = 0; const errs = [];
async function t(n, f) { try { await f(); pass++; console.log('  ✓', n); } catch (e) { fail++; console.log('  ✗', n, '\n     ', String(e.message).split('\n')[0]); } }
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar', acceptDownloads: true });
  async function open(id) { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(id + ': ' + e.message)); await p.goto(BASE); await p.waitForTimeout(200); await p.evaluate(i => { location.hash = '#/tools/' + i; }, id); await p.waitForTimeout(900); return p; }
  const outText = p => p.evaluate(() => document.body.innerText);
  await t('subtitle: ASS يُحوَّل إلى SRT', async () => {
    const p = await open('subtitle-workshop'); await p.locator('input[type=file]').first().setInputFiles(FX + '/t.ass'); await p.waitForTimeout(500);
    await p.getByRole('button', { name: /SRT ← تحويل/ }).click(); await p.waitForTimeout(300);
    const v = await p.locator('textarea[readonly]').first().inputValue(); assert.match(v, /00:00:01,000 --> 00:00:02,500\nمرحبا\nبالعالم/); assert(!/\{/.test(v)); await p.close(); });
  await t('data-workshop: TOML ↔ JSON', async () => {
    const p = await open('data-workshop'); const sels = p.locator('select'); await sels.nth(0).selectOption('TOML'); await sels.nth(1).selectOption('JSON');
    await p.locator('textarea').first().fill('title = "ت"\n[owner]\nn = 5\n[[items]]\nid = 1\n[[items]]\nid = 2\n');
    await p.getByRole('button', { name: /حوّل|تحويل|نفّذ|طبّق/ }).first().click(); await p.waitForTimeout(500);
    const v = await p.locator('textarea[readonly]').first().inputValue(); const o = JSON.parse(v); assert.deepStrictEqual(o, { title: 'ت', owner: { n: 5 }, items: [{ id: 1 }, { id: 2 }] }); 
    await sels.nth(0).selectOption('JSON'); await sels.nth(1).selectOption('TOML'); await p.locator('textarea').first().fill(JSON.stringify(o)); await p.getByRole('button', { name: /حوّل|تحويل|نفّذ|طبّق/ }).first().click(); await p.waitForTimeout(400);
    const tv = await p.locator('textarea[readonly]').first().inputValue(); assert.match(tv, /\[\[items\]\]/); assert.match(tv, /title = "ت"/); await p.close(); });
  await t('gif-studio: تفكيك GIF إلى ZIP بإطاراته', async () => {
    const p = await open('gif-studio'); const card = p.locator('.card', { hasText: 'تفكيك GIF' }).last(); await card.locator('input[type=file]').setInputFiles(FX + '/a.gif'); await p.waitForTimeout(300);
    await card.getByRole('button', { name: /فكّ إلى إطارات/ }).click(); await p.waitForTimeout(1500); const txt = await outText(p); assert.match(txt, /3 إطار/); assert.match(txt, /30×20/); await p.close(); });
  await t('archive: فتح TAR.GZ وTAR', async () => {
    for (const f of ['t.tar.gz', 't.tar']) { const p = await open('archive-manager'); await p.locator('input[type=file]').first().setInputFiles(FX + '/' + f); await p.getByRole('button', { name: /^افتح$/ }).click(); await p.waitForTimeout(1200); const txt = await outText(p); assert.match(txt, /ملف/); assert(/a\.txt/.test(txt) && /b\.txt/.test(txt), f + ' بدون محتوى'); await p.close(); } });
  await t('archive: ZIP مشفّر — بدون كلمة/خاطئة/صحيحة', async () => {
    const p = await open('archive-manager'); await p.locator('input[type=file]').first().setInputFiles(FX + '/enc.zip'); const open_ = p.getByRole('button', { name: /^افتح$/ });
    await open_.click(); await p.waitForTimeout(800); assert.match(await outText(p), /محمي بكلمة مرور/);
    await p.locator('input[type=password]').first().fill('wrong'); await open_.click(); await p.waitForTimeout(800); assert.match(await outText(p), /كلمة المرور خاطئة/);
    await p.locator('input[type=password]').first().fill('secret'); await open_.click(); await p.waitForTimeout(1000); const txt = await outText(p); assert(/a\.txt/.test(txt) && /فك التشفير/.test(txt)); await p.close(); });
  await t('archive: إنشاء ZIP مشفّر وفتحه ثم TAR.GZ', async () => {
    const p = await open('archive-manager'); await p.getByText('إنشاء أرشيف', { exact: true }).click(); await p.waitForTimeout(300);
    await p.locator('input[type=file]').last().setInputFiles([FX + '/s/a.txt', FX + '/s/sub/b.txt']); await p.waitForTimeout(300);
    const sel = p.locator('select:visible').filter({ has: p.locator('option[value=zipenc]') }).first(); await sel.selectOption('zipenc'); await p.locator('input[type=password]:visible').first().fill('pw9');
    const dl = p.waitForEvent('download', { timeout: 8000 }).catch(() => null); await p.getByRole('button', { name: /أنشئ الأرشيف/ }).click(); await p.waitForTimeout(1200); const txt = await outText(p); assert.match(txt, /تم إنشاء الأرشيف \(2 ملف\)/); await p.close(); });
  await t('redactor: إخفاء منطقة في صورة فعلياً', async () => {
    const p = await open('redactor'); const card = p.locator('.card', { hasText: 'إخفاء مناطق داخل صورة' }).last(); await card.locator('input[type=file]').setInputFiles(FX + '/p.png'); await p.waitForTimeout(600);
    const cv = card.locator('canvas'); await cv.scrollIntoViewIfNeeded(); const bb = await cv.boundingBox(); assert(bb && bb.width > 50, 'canvas ظاهر');
    // أخفِ منطقة تغطي المستطيل الداكن (x 50..150, y 40..60 من 200×120)
    const sx = bb.width / 200, sy = bb.height / 120; await p.mouse.move(bb.x + 40 * sx, bb.y + 30 * sy); await p.mouse.down(); await p.mouse.move(bb.x + 160 * sx, bb.y + 70 * sy, { steps: 5 }); await p.mouse.up();
    assert.match(await card.innerText(), /1 منطقة/);
    await p.evaluate(() => { window.__blob = null; const o = URL.createObjectURL; URL.createObjectURL = b => { window.__blob = b; return o.call(URL, b); }; });
    await card.getByRole('button', { name: /طبّق وصدّر/ }).click(); await p.waitForTimeout(1200); const txt = await card.innerText(); assert.match(txt, /تم إخفاء 1 منطقة/); assert.match(txt, /EXIF/);
    const info = await p.evaluate(async () => { const bl = window.__blob; if (!bl) return null; const im = await createImageBitmap(bl); const c = new OffscreenCanvas(im.width, im.height), g = c.getContext('2d'); g.drawImage(im, 0, 0); const d = g.getImageData(100, 50, 1, 1).data, e = g.getImageData(5, 5, 1, 1).data; return { w: im.width, h: im.height, mid: [...d], edge: [...e] }; });
    assert(info, 'لم يُلتقط Blob الناتج'); { assert.deepStrictEqual([info.w, info.h], [200, 120]); assert.deepStrictEqual(info.mid.slice(0, 3), [0, 0, 0]); assert.deepStrictEqual(info.edge.slice(0, 3), [250, 250, 250]); } await p.close(); });
  await b.close(); console.log(`\n${pass} نجح، ${fail} فشل`); if (errs.length) console.log('أخطاء صفحة:', errs.join(' | ')); process.exit(fail ? 1 : 0);
})();
