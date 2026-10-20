/* اختبار منسّق/مصغّر JS: (1) تطابق الرموز (2) فحص الصياغة بـ node (3) تكافؤ سلوكي على كود حقيقي (4) حالات ASI */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert'), cp = require('child_process');
const SRC = process.env.APP_SRC || path.resolve(__dirname, '../omniforge-src');
const F = require(path.join(SRC, 'js/jsfmt.js'));
let pass = 0, fail = 0; const bad = [];
function t(n, f) { try { f(); pass++; console.log('  ✓', n); } catch (e) { fail++; bad.push(n); console.log('  ✗', n, '\n     ', String(e.message).split('\n')[0]); } }
const sig = s => F.tokenize(s).filter(x => x.type !== 'comment').map(x => x.type + ':' + x.value);
const syntax = (s, name) => { try { new vm.Script(s, { filename: name || 'x.js' }); } catch (e) { throw new Error('syntax: ' + e.message); } };

console.log('حالات خاصة');
const cases = {
  'ASI بلا فاصلة منقوطة': 'let a = 1\nlet b = 2\nconsole.log(a + b)\n',
  'return على سطر منفصل': 'function f(){ return\n 5 }\nconsole.log(f())',
  'سطر يبدأ بـ ( لا يُدمج': 'const a = 1;\n;(function(){ console.log("iife") })()\n',
  'تعبير نمطي مقابل قسمة': 'let x = 10, g = 2; let y = x / g / 1; let r = /a\\/b[/]c/gi.test("a/b/c"); console.log(y, r)',
  'قالب متداخل': 'const n = 3; console.log(`a ${n > 2 ? `inner ${n}` : "no"} b ${ {a:1}.a }`)',
  '++ و -- و + +': 'let a = 1, b = 2; console.log(a++ + ++b, a - -b, a+ +b, - -a, a-- - --b)',
  'switch': 'function s(x){ switch(x){ case 1: return "a"; case 2: case 3: { return "b" } default: return "c" } } console.log(s(1), s(3), s(9))',
  'else if / try': 'let v = 3; if (v > 5) console.log(1); else if (v > 2) { console.log(2) } else console.log(3); try { throw new Error("e") } catch (e) { console.log(e.message) } finally { console.log("f") }',
  'do while + label': 'let i = 0; do { i++ } while (i < 3); outer: for (let a = 0; a < 2; a++) { for (;;) { break outer } } console.log(i)',
  'كائن وتفكيك ومعاملات': 'const {a, ...rest} = {a:1,b:2,c:3}; const f = (...xs) => xs.length; console.log(a, rest, f(...[1,2,3]), [..."ab"])',
  'async/await': 'async function g(){ await null; return 7 } g().then(v => console.log(v))',
  'class': 'class A { #p = 1; static s = 2; get p(){ return this.#p } } console.log(new A().p, A.s)',
  'تعليقات': '/* c1 */ let z = 1 // c2\n/* c3\n c4 */ console.log(z) // end',
  '?. و ??': 'const o = {a:{b:null}}; console.log(o?.a?.b ?? "d", o.x?.y)',
  'سلسلة ثلاثية': 'const k = 5; console.log(k > 3 ? k > 4 ? "a" : "b" : "c")',
  'أرقام': 'console.log(1..toString(), 1.5.toFixed(1), 0xFF, 1e3, 10n)',
  'يونيكود': 'const عربي = "مرحبا"; console.log(عربي)',
  'case مع ternary': 'function q(x){ switch(x){ case 1: return x ? "t" : "f"; default: return "d" } } console.log(q(1), q(2))',
};
for (const [name, src] of Object.entries(cases)) {
  t(name, () => {
    const b = F.beautify(src, '  '), m = F.minify(src);
    syntax(b, 'beautified'); syntax(m, 'minified');
    assert.deepStrictEqual(sig(b), sig(src), 'beautify غيّر الرموز'); assert.deepStrictEqual(sig(m), sig(src), 'minify غيّر الرموز');
    const run = code => { const out = []; const con = { log: (...a) => out.push(a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' ')) }; vm.runInNewContext(code, { console: con, setTimeout }); return out.join('|'); };
    const r0 = run(src); assert.strictEqual(run(b), r0, 'beautify غيّر السلوك'); assert.strictEqual(run(m), r0, 'minify غيّر السلوك');
    assert.ok(m.length <= src.length, 'المصغّر أكبر من الأصل');
    // مرتين = نفس النتيجة (ثبات)
    assert.strictEqual(F.beautify(b, '  '), b, 'beautify غير ثابت');
    assert.strictEqual(F.minify(m), m, 'minify غير ثابت');
  });
}
t('أخطاء: نص غير مغلق يرمي', () => assert.throws(() => F.minify('let a = "abc'), /غير مغلق/));
t('أخطاء: قالب غير مغلق', () => assert.throws(() => F.beautify('let a = `abc'), /غير مغلق/));
t('تفضيل التبويب', () => assert.ok(F.beautify('function f(){return 1}', '\t').includes('\n\treturn 1')));
t('تعليق /*! يُحفظ', () => assert.ok(F.minify('/*! keep */ var a = 1; /* drop */ var b = 2;').startsWith('/*! keep */')));

console.log('كود حقيقي من التطبيق (رموز + صياغة)');
const files = []; (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } })(path.join(SRC, 'js'));
files.push(...fs.readdirSync(path.join(SRC, 'libs')).filter(f => f.endsWith('.js')).map(f => path.join(SRC, 'libs', f)));
for (const f of files) {
  const rel = path.relative(SRC, f);
  t(rel, () => {
    const s = fs.readFileSync(f, 'utf8'); const b = F.beautify(s, '  '), m = F.minify(s);
    syntax(b, rel + ' beautified'); syntax(m, rel + ' minified');
    assert.deepStrictEqual(sig(b), sig(s)); assert.deepStrictEqual(sig(m), sig(s));
  });
}

console.log('تكافؤ سلوكي: اختبارات الوحدة نفسها على نسخة مصغّرة/منسّقة من video-core.js');
for (const mode of ['minify', 'beautify']) {
  t('video-core.js بعد ' + mode + ' يجتاز 75 اختباراً', () => {
    const dir = fs.mkdtempSync('/tmp/claude-0/jsfmt-'); const src = fs.readFileSync(path.join(SRC, 'js/video-core.js'), 'utf8');
    fs.writeFileSync(path.join(dir, 'video-core.js'), mode === 'minify' ? F.minify(src) : F.beautify(src, '  '));
    const r = cp.spawnSync('node', [path.resolve(__dirname, 'video-core.test.js')], { env: Object.assign({}, process.env, { VIDEO_CORE: path.join(dir, 'video-core.js') }), encoding: 'utf8' });
    assert.ok(/75 نجح، 0 فشل/.test(r.stdout), (r.stdout || '').split('\n').slice(-6).join(' ') + r.stderr);
  });
}

console.log(`\n${pass} نجح، ${fail} فشل`); if (fail) { console.log('الفاشلة:', bad.join(' | ')); process.exit(1); }
