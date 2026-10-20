/* واجهة ورشة APK في Chromium مع بلاجن OmniNative/OmniSave مُحاكى: تعديل المانيفست، مفتاح التوقيع، التوقيع والتحقق.
 * المحاكاة تتحقق من المعاملات المُمرَّرة فقط؛ التوقيع الحقيقي (apksig) يُختبر على جهاز فقط. */
'use strict';
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');
const assert = require('assert'), fs = require('fs'), path = require('path'), cp = require('child_process');
const SRC = process.env.APP_SRC || path.resolve(__dirname, '../omniforge-src'), X = require(path.join(SRC, 'js/axml.js'));
const BASE = process.env.BASE || 'http://localhost:8765/index.html';
const tmp = fs.mkdtempSync('/tmp/claude-0/apkui-'); const AN = X.NS_ANDROID, T = X.T;
const str = (n, v) => ({ ns: AN, name: n, resId: X.ATTR[n] || 0, dt: T.STRING, data: 0, str: v, raw: null });
const int = (n, v) => ({ ns: AN, name: n, resId: X.ATTR[n], dt: T.INT_DEC, data: v >>> 0, str: null, raw: null });
const el = (n, a) => ({ type: 'start', line: 1, comment: null, ns: null, name: n, idIndex: 0, classIndex: 0, styleIndex: 0, attrs: a || [] }), en = n => ({ type: 'end', line: 1, comment: null, ns: null, name: n });
const doc = { utf8: true, nodes: [{ type: 'ns-start', line: 1, comment: null, prefix: 'android', uri: AN },
  el('manifest', [int('versionCode', 7), str('versionName', '1.2.3'), { ns: null, name: 'package', resId: 0, dt: T.STRING, data: 0, str: 'com.example.app', raw: null }]),
  el('uses-sdk', [int('minSdkVersion', 24), int('targetSdkVersion', 34)]), en('uses-sdk'), el('uses-permission', [str('name', 'android.permission.INTERNET')]), en('uses-permission'),
  el('uses-permission', [str('name', 'android.permission.CAMERA')]), en('uses-permission'), el('application', [str('label', 'تطبيقي')]), en('application'), en('manifest'), { type: 'ns-end', line: 1, comment: null, prefix: 'android', uri: AN }] };
fs.mkdirSync(tmp + '/z'); fs.writeFileSync(tmp + '/z/AndroidManifest.xml', X.build(doc)); fs.writeFileSync(tmp + '/z/classes.dex', Buffer.from('dex\n035\0'.padEnd(120, 'x'))); fs.mkdirSync(tmp + '/z/lib'); fs.writeFileSync(tmp + '/z/lib/a.so', Buffer.alloc(300, 7));
cp.execSync('zip -q -X -r ../t.apk .', { cwd: tmp + '/z' });
const MOCK = () => {
  window.__calls = []; const lst = {}; const mem = new Map(); let n = 0;
  const P = {
    addListener: async () => ({ remove() {} }), job: async () => ({ dir: '/w/job1' }), cleanup: async d => { window.__calls.push(['cleanup', d.dir]); },
    stageBegin: async () => ({ id: 's' + (++n), path: '/w/job1/unsigned.apk' }), stageChunk: async o => { mem.set(o.id, (mem.get(o.id) || 0) + atob(o.data).length); }, stageEnd: async o => { window.__calls.push(['staged', mem.get(o.id)]); return {}; },
    signApk: async o => { window.__calls.push(['sign', JSON.stringify({ input: o.input, outName: o.outName, alg: o.alg, v1: o.v1, v2: o.v2, v3: o.v3, key: o.key.length > 100, certs: o.certs.length })]); return { path: '/w/job1/' + o.outName, size: 1234, alignedEntries: 2 }; },
    verifyApk: async o => { window.__calls.push(['verify', o.path]); return { verified: true, v1: true, v2: true, v3: true, errors: [], warnings: [], certSha256: ['ab12'], certSubjects: ['CN=T'] }; } };
  const S = { saveFromPath: async o => { window.__calls.push(['save', o.name]); return { path: 'Download/OMNIFORGE/' + o.name }; }, begin: async () => ({ id: 'x' }), chunk: async () => ({}), finish: async () => ({ path: 'x' }), abort: async () => ({}) };
  window.Capacitor = { isNativePlatform: () => true, Plugins: { OmniNative: P, OmniSave: S } };
};
console.log("fixture ok"); let pass = 0, fail = 0; const errs = [];
async function t(n, f) { try { await f(); pass++; console.log('  ✓', n); } catch (e) { fail++; console.log('  ✗', n, '\n     ', String(e.message).split('\n')[0]); } }
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar', acceptDownloads: true }); await ctx.addInitScript(MOCK);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  console.log('launched'); await p.goto(BASE); console.log('loaded'); await p.waitForTimeout(200); await p.evaluate(() => { location.hash = '#/tools/apk-workshop'; }); await p.waitForTimeout(1200);
  await p.locator('input[type=file]').first().setInputFiles(tmp + '/t.apk'); await p.getByRole('button', { name: /افتح وافحص/ }).click(); await p.waitForTimeout(1200);
  const tab = n => p.getByRole('tab', { name: n }).or(p.getByRole('button', { name: n })).first();
  await t('تبويب المانيفست يظهر الحقول الحالية', async () => { await tab(/تعديل المانيفست/).click(); await p.waitForTimeout(400); const v = await p.locator('input[type=number]').first().inputValue(); assert.strictEqual(v, '7'); assert((await p.innerText('body')).includes('android.permission.CAMERA')); });
  await t('تطبيق تعديلات: version + حذف إذن + إضافة إذن', async () => {
    await p.locator('input[type=number]').first().fill('42'); await p.locator('label.check', { hasText: 'android.permission.CAMERA' }).locator('input').check();
    await p.locator('input[placeholder="android.permission.VIBRATE"]').fill('android.permission.VIBRATE'); await p.getByRole('button', { name: /طبّق على المانيفست/ }).click(); await p.waitForTimeout(500);
    const txt = await p.innerText('body'); assert(/عُدّل المانيفست/.test(txt) && /\(3 تغيير\)/.test(txt), txt.replace(/\n+/g,' | ').slice(-500)); });
  await t('المانيفست المعدّل يُحفظ فعلاً ويقرأ بعد إعادة التحليل', async () => {
    await tab(/ملفات|الملفات/).click(); await p.waitForTimeout(300); const x = await p.evaluate(() => window.__apkCur().mods.get('AndroidManifest.xml')); assert(x && x.length > 50);
    const r = await p.evaluate(() => { const A = OF.axml, d = A.parse(window.__apkCur().mods.get('AndroidManifest.xml')); return { vc: A.attrValue(A.getAttr(A.elements(d, 'manifest')[0], 'versionCode')), perms: A.elements(d, 'uses-permission').map(e => A.attrValue(A.getAttr(e, 'name'))) }; });
    assert.strictEqual(r.vc, 42); assert.deepStrictEqual(r.perms, ['android.permission.INTERNET', 'android.permission.VIBRATE']); });
  await t('بدون مفتاح: التوقيع يفشل برسالة واضحة', async () => {
    await tab(/إعادة البناء|البناء/).click(); await p.waitForTimeout(300); await p.getByRole('button', { name: /أعد بناء APK/ }).first().click(); await p.waitForTimeout(1200); assert.match(await p.innerText('body'), /لا يوجد مفتاح توقيع/); });
  await t('إنشاء مفتاح ثم بناء وتوقيع (معاملات صحيحة + تحقق + حفظ)', async () => {
    await p.getByRole('button', { name: /^أنشئ مفتاحاً$/ }).click(); await p.waitForFunction(() => document.body.innerText.includes('أُنشئ المفتاح'), null, { timeout: 30000 });
    await p.getByRole('button', { name: /أعد بناء APK/ }).first().click(); await p.waitForFunction(() => document.body.innerText.includes('وُقّعت وتحققت'), null, { timeout: 20000 });
    const c = await p.evaluate(() => window.__calls); const s = c.find(x => x[0] === 'sign'); assert(s, JSON.stringify(c)); const o = JSON.parse(s[1]); assert.deepStrictEqual(o, { input: '/w/job1/unsigned.apk', outName: 't_signed.apk', alg: 'RSA', v1: true, v2: true, v3: true, key: true, certs: 1 });
    assert(c.some(x => x[0] === 'verify') && c.some(x => x[0] === 'save' && x[1] === 't_signed.apk') && c.some(x => x[0] === 'cleanup')); assert(c.find(x => x[0] === 'staged')[1] > 300); });
  await t('تعطيل v1 وv3 يُمرَّر إلى المحرك', async () => {
    await p.locator('label.check', { hasText: 'JAR v1' }).locator('input').uncheck(); await p.locator('label.check', { hasText: /^v3$/ }).locator('input').uncheck(); await p.evaluate(() => { window.__calls.length = 0; });
    await p.getByRole('button', { name: /أعد بناء APK/ }).first().click(); await p.waitForTimeout(2000); const s = (await p.evaluate(() => window.__calls)).find(x => x[0] === 'sign'); const o = JSON.parse(s[1]); assert.strictEqual(o.v1, false); assert.strictEqual(o.v2, true); assert.strictEqual(o.v3, false); });
  await t('نسخة احتياطية: استيراد ما صُدِّر يعيد نفس البصمة', async () => {
    const r = await p.evaluate(async () => { const k = JSON.parse(localStorage.getItem('omni.apk.signkey.v1')); const k2 = OF.x509.fromBackup(OF.x509.toBackup(OF.x509.fromBackup(JSON.stringify(k)))); return [k.sha256, k2.sha256, k.alg]; }); assert.strictEqual(r[0], r[1]); assert.strictEqual(r[2], 'RSA'); });
  await t('زر التحقق من الحزمة المفتوحة', async () => { await p.getByRole('button', { name: /تحقق من توقيع الحزمة المفتوحة/ }).click(); await p.waitForFunction(() => document.body.innerText.includes('التوقيع صالح'), null, { timeout: 10000 }); });
  await b.close(); await ctx.close?.().catch(() => {});
  console.log(`\n${pass} نجح، ${fail} فشل` + (errs.length ? '\nأخطاء صفحة: ' + errs.join(' | ') : '')); process.exit(fail || errs.length ? 1 : 0);
})();
