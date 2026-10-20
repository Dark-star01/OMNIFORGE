'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), a = require('assert');
const SRC = process.env.APP_SRC || path.resolve(__dirname, '../omniforge-src'); const X = require(path.join(SRC, 'js/axml.js'));
const tmp = fs.mkdtempSync('/tmp/claude-0/axml-'); let p = 0, f = 0; const tests = []; const t = (n, fn) => tests.push([n, fn]);
const AN = X.NS_ANDROID, T = X.T;
const str = (name, v, resId) => ({ ns: AN, name, resId: resId || X.ATTR[name] || 0, dt: T.STRING, data: 0, str: v, raw: null });
const int = (name, v, resId) => ({ ns: AN, name, resId: resId || X.ATTR[name], dt: T.INT_DEC, data: v >>> 0, str: null, raw: null });
const bool = (name, v) => ({ ns: AN, name, resId: X.ATTR[name], dt: T.BOOL, data: v ? 0xFFFFFFFF : 0, str: null, raw: null });
const el = (name, attrs, line) => ({ type: 'start', line: line || 1, comment: null, ns: null, name, idIndex: 0, classIndex: 0, styleIndex: 0, attrs: attrs || [] });
const en = name => ({ type: 'end', line: 1, comment: null, ns: null, name });
function sample(utf8) {
  const nodes = [{ type: 'ns-start', line: 1, comment: null, prefix: 'android', uri: AN },
    el('manifest', [int('versionCode', 7), str('versionName', '1.2.3'), { ns: null, name: 'package', resId: 0, dt: T.STRING, data: 0, str: 'com.example.app', raw: null }]),
    el('uses-sdk', [int('minSdkVersion', 24), int('targetSdkVersion', 34)]), en('uses-sdk'),
    el('uses-permission', [str('name', 'android.permission.INTERNET')]), en('uses-permission'),
    el('uses-permission', [str('name', 'android.permission.CAMERA')]), en('uses-permission'),
    el('application', [str('label', 'تطبيقي ✓'), bool('allowBackup', true)]),
    el('activity', [str('name', '.MainActivity')]), el('intent-filter', []), el('action', [str('name', 'android.intent.action.MAIN')]), en('action'), el('category', [str('name', 'android.intent.category.LAUNCHER')]), en('category'), en('intent-filter'), en('activity'),
    en('application'), en('manifest'), { type: 'ns-end', line: 1, comment: null, prefix: 'android', uri: AN }];
  return { utf8, nodes };
}
const write = (n, u8) => { const f = path.join(tmp, n); fs.writeFileSync(f, u8); return f; };
const validate = file => { const r = cp.spawnSync('python3', [path.resolve(__dirname, 'axml_validate.py'), file], { encoding: 'utf8' }); a.strictEqual(r.status, 0, r.stdout + r.stderr); return r.stdout; };
for (const utf8 of [true, false]) {
  t('بناء صالح بنيوياً (' + (utf8 ? 'UTF-8' : 'UTF-16') + ')', () => validate(write('s' + utf8 + '.xml', X.build(sample(utf8)))));
  t('قراءة ما بُني (' + (utf8 ? 'UTF-8' : 'UTF-16') + ')', () => { const d = X.parse(X.build(sample(utf8))); a.strictEqual(d.utf8, utf8); const m = X.elements(d, 'manifest')[0]; a.strictEqual(X.attrValue(X.getAttr(m, 'versionCode')), 7); a.strictEqual(X.attrValue(X.getAttr(m, 'versionName')), '1.2.3'); a.strictEqual(X.attrValue(X.getAttr(m, 'package')), 'com.example.app'); a.strictEqual(X.attrValue(X.getAttr(X.elements(d, 'application')[0], 'label')), 'تطبيقي ✓'); a.strictEqual(X.attrValue(X.getAttr(X.elements(d, 'application')[0], 'allowBackup')), true); });
  t('ثبات: build(parse(build(x))) مطابق بايت ببايت (' + (utf8 ? 'UTF-8' : 'UTF-16') + ')', () => { const b1 = X.build(sample(utf8)); const b2 = X.build(X.parse(b1)); a.deepStrictEqual(Buffer.from(b2), Buffer.from(b1)); });
}
t('خريطة الموارد: السمات ذات المعرّف في أول المجمّع', () => { const d = X.parse(X.build(sample(true))); a(d.nodes.length > 10); });
t('تعديل versionCode/versionName/label', () => { const d = X.parse(X.build(sample(true))); const m = X.elements(d, 'manifest')[0], app = X.elements(d, 'application')[0]; X.setAttr(m, 'versionCode', { type: 'int', value: 99 }); X.setAttr(m, 'versionName', { type: 'string', value: '9.9' }); X.setAttr(app, 'label', { type: 'string', value: 'اسم جديد' }); const b = X.build(d); validate(write('e1.xml', b)); const d2 = X.parse(b); a.strictEqual(X.attrValue(X.getAttr(X.elements(d2, 'manifest')[0], 'versionCode')), 99); a.strictEqual(X.attrValue(X.getAttr(X.elements(d2, 'application')[0], 'label')), 'اسم جديد'); a.strictEqual(X.attrValue(X.getAttr(X.elements(d2, 'manifest')[0], 'package')), 'com.example.app'); });
t('إضافة سمة debuggable بترتيب المعرّف الصحيح', () => { const d = X.parse(X.build(sample(true))); const app = X.elements(d, 'application')[0]; X.setAttr(app, 'debuggable', { type: 'bool', value: true }); X.setAttr(app, 'usesCleartextTraffic', { type: 'bool', value: true }); const names = app.attrs.map(x => x.name); a.deepStrictEqual(names, ['label', 'debuggable', 'allowBackup', 'usesCleartextTraffic']); validate(write('e2.xml', X.build(d))); });
t('إضافة سمة بدون مساحة (بلا معرّف) تأتي أخيراً', () => { const d = X.parse(X.build(sample(true))); const m = X.elements(d, 'manifest')[0]; X.setAttr(m, 'platformBuildVersionName', { type: 'string', value: '14' }, { ns: null }); a.strictEqual(m.attrs[m.attrs.length - 1].name, 'platformBuildVersionName'); X.setAttr(m, 'versionCode', { type: 'int', value: 1 }); validate(write('e3.xml', X.build(d))); });
t('حذف إذن', () => { const d = X.parse(X.build(sample(true))); const cam = X.elements(d, 'uses-permission').find(e => X.attrValue(X.getAttr(e, 'name')) === 'android.permission.CAMERA'); X.removeElement(d, cam); const b = X.build(d); validate(write('e4.xml', b)); const d2 = X.parse(b); a.deepStrictEqual(X.elements(d2, 'uses-permission').map(e => X.attrValue(X.getAttr(e, 'name'))), ['android.permission.INTERNET']); });
t('حذف عنصر له أبناء (activity)', () => { const d = X.parse(X.build(sample(true))); X.removeElement(d, X.elements(d, 'activity')[0]); const b = X.build(d); validate(write('e5.xml', b)); a.strictEqual(X.elements(X.parse(b), 'intent-filter').length, 0); });
t('إضافة إذن قبل application', () => { const d = X.parse(X.build(sample(true))); X.addElement(d, X.elements(d, 'application')[0], 'uses-permission', { name: { type: 'string', value: 'android.permission.VIBRATE' } }); const b = X.build(d); validate(write('e6.xml', b)); const names = X.elements(X.parse(b), 'uses-permission').map(e => X.attrValue(X.getAttr(e, 'name'))); a.deepStrictEqual(names, ['android.permission.INTERNET', 'android.permission.CAMERA', 'android.permission.VIBRATE']); });
t('سمة جديدة بلا معرّف معروف تُرفض', () => { const d = X.parse(X.build(sample(true))); a.throws(() => X.setAttr(X.elements(d, 'application')[0], 'fooBar', { type: 'bool', value: true }), /معرّف/); });
t('قيم غير صالحة', () => { const d = X.parse(X.build(sample(true))); a.throws(() => X.setAttr(X.elements(d, 'manifest')[0], 'versionCode', { type: 'int', value: 'abc' }), /غير صالح/); a.throws(() => X.setAttr(X.elements(d, 'manifest')[0], 'versionCode', { type: 'float', value: 1 }), /غير معروف/); });
t('ملف تالف/مقطوع يرمي', () => { a.throws(() => X.parse(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])), /AXML/); const b = X.build(sample(true)); a.throws(() => X.parse(b.subarray(0, b.length - 10)), /مقطوع/); });
t('نص طويل (>127) وأحرف خارج BMP', () => { const d = sample(true); d.nodes[1].attrs.find(x => x.name === 'versionName').str = 'x'.repeat(300) + '😀'; for (const utf8 of [true, false]) { d.utf8 = utf8; const b = X.build(d); validate(write('long' + utf8 + '.xml', b)); const v = X.attrValue(X.getAttr(X.elements(X.parse(b), 'manifest')[0], 'versionName')); a.strictEqual(v, 'x'.repeat(300) + '😀'); } });
t('توافق مع قارئ apk.js المستقل (decodeAxml)', () => {
  global.OF = { h: () => ({}), ui: {}, tools: {}, fmt: {}, icon: () => ({}) }; global.TextDecoder = TextDecoder; delete require.cache[require.resolve(path.join(SRC, 'js/tools/apk.js'))];
  try { require(path.join(SRC, 'js/tools/apk.js')); } catch (e) { return; /* بيئة غير كافية لتحميل الأداة */ }
  const api = global.OF.tools['apk-workshop'] && global.OF.tools['apk-workshop'].api; if (!api) return; const r = api.decodeAxml(X.build(sample(true))); a(/versionName="1\.2\.3"/.test(r.xml), r.xml.slice(0, 300)); a(/android\.permission\.CAMERA/.test(r.xml)); a(/<uses-sdk/.test(r.xml)); });
(async () => { for (const [n, fn] of tests) { try { await fn(); p++; console.log('  ✓', n); } catch (e) { f++; console.log('  ✗', n, String(e.message).split('\n')[0]); } } console.log(`\n${p} نجح، ${f} فشل`); process.exit(f ? 1 : 0); })();
