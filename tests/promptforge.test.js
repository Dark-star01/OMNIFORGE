/* Prompt Forge: اختبارات المنطق وطبقة النموذج (Node). لا تختبر أي استدلال حقيقي: المحرك Mock أو بلاجن OmniLlm مُحاكى للعقد فقط. */
'use strict';
const assert = require('assert'); const fs = require('fs'); const path = require('path');
global.window = global; global.OF = {};
const SRC = path.join(__dirname, '..', 'omniforge-src');
const A = require(SRC + '/js/prompt-forge/logic.js'), M = require(SRC + '/js/prompt-forge/model.js');
const instr = JSON.parse(fs.readFileSync(SRC + '/config/prompt-forge/ai-instructions.json', 'utf8')), presets = JSON.parse(fs.readFileSync(SRC + '/config/prompt-forge/presets.json', 'utf8'));
let pass = 0, fail = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ✓', n); } catch (e) { fail++; console.log('  ✗', n, '\n     ', String(e.stack || e).split('\n').slice(0, 3).join('\n      ')); } };
const mock = (o) => { const e = M.MockEngine(M.PROFILES[0], Object.assign({ delay: 0, genDelay: 0 }, o)); return e; };
const run = async (o, eo) => { const e = mock(eo); await e.load(); return A.run(Object.assign({ engine: e, instr, presets, type: 'image', presetId: 'cinematic' }, o)); };

(async () => {
  await t('config: ai-instructions يحوي كل الأقسام المطلوبة ومستقل', () => {
    for (const k of ['role', 'mission', 'behavior', 'image_prompt_rules', 'video_prompt_rules', 'quality_rules', 'output_rules', 'safety_policy']) assert(instr[k], k);
    assert(instr.safety_policy.allowed.length && instr.safety_policy.refuse_or_redirect.length);
    assert(!/qwen/i.test(JSON.stringify(instr)), 'التعليمات يجب أن تكون Model-agnostic');
  });
  await t('config: presets المطلوبة موجودة (صورة 8 + فيديو 5) وكلها بـid/name/hint', () => {
    const im = ['Cinematic', 'Photorealistic', 'Fantasy', 'Anime', 'Dark Fantasy', 'Sci-Fi', 'Product', 'Portrait'];
    assert.strictEqual(presets.image.length, im.length); assert.strictEqual(presets.video.length, 5);
    [...presets.image, ...presets.video].forEach(p => assert(p.id && p.name && p.hint, p.id));
    assert.strictEqual(new Set([...presets.image, ...presets.video].map(p => p.id)).size, 13);
  });
  await t('لا ملف GGUF أو نموذج داخل المشروع', () => {
    const bad = []; (function w(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) { if (f.name !== 'node_modules' && f.name !== '.git') w(p); } else if (/\.(gguf|ggml|safetensors)$/i.test(f.name)) bad.push(p); } })(path.join(__dirname, '..'));
    assert.deepStrictEqual(bad, []);
  });
  await t('Qwen3-0.6B-GGUF هو الافتراضي الموصى به وبصيغة GGUF', () => { const p = M.PROFILES[0]; assert.strictEqual(p.name, 'Qwen3-0.6B-GGUF'); assert(p.recommended && p.format === 'gguf'); assert.strictEqual(M.DEFAULT_PROFILE, p.id); });
  await t('composeSystem: قواعد الصورة للصورة فقط والفيديو للفيديو فقط + السلامة + hint', () => {
    const si = A.composeSystem(instr, 'image', presets.image[0]), sv = A.composeSystem(instr, 'video', presets.video[0]);
    assert(si.includes('Image prompt rules') && !si.includes('Video prompt rules')); assert(sv.includes('Video prompt rules') && !sv.includes('Image prompt rules'));
    assert(si.includes('Safety policy') && si.includes('Preset guidance') && si.includes('PROMPT:'));
  });
  await t('buildUser: /no_think فقط حين يطلبه الـprofile', () => { assert(A.buildUser('x', 'image', { noThink: true }).endsWith('/no_think')); assert(!A.buildUser('x', 'image', {}).includes('/no_think')); });

  await t('1) Image prompt (إنجليزي)', async () => { const r = await run({ idea: 'a lone knight facing a dragon in a storm' }); assert.strictEqual(r.kind, 'prompt'); assert(r.prompt.includes('lone knight')); assert(/cinematic/i.test(r.prompt)); assert(r.negative); assert.strictEqual(r.mode, 'mock'); });
  await t('2) Video prompt: بداية/وسط/نهاية وحركة كاميرا', async () => { const r = await run({ idea: 'a knight walking through fog', type: 'video', presetId: 'cinematic-video' }); assert.strictEqual(r.kind, 'prompt'); assert(/Beginning:/.test(r.prompt) && /Middle:/.test(r.prompt) && /Ending:/.test(r.prompt)); assert(/camera:/.test(r.prompt)); assert(/fog/i.test(r.prompt)); });
  await t('3) إدخال عربي: يبقى كما هو داخل الناتج', async () => { const r = await run({ idea: 'فارس وحيد أمام تنين في ليلة عاصفة' }); assert(r.prompt.includes('فارس وحيد أمام تنين')); assert(/night|moon/i.test(r.prompt)); assert(/scale/.test(r.prompt)); });
  await t('5) عربي/إنجليزي مختلط', async () => { const r = await run({ idea: 'محارب samurai تحت المطر' }); assert(r.prompt.includes('محارب samurai تحت المطر')); assert(/rain/i.test(r.prompt)); });
  await t('6) فكرة قصيرة جداً تُثرى', async () => { const r = await run({ idea: 'قطة' }); assert(r.prompt.length > 80, r.prompt); });
  await t('7) فكرة مفصلة طويلة: تُحفظ كاملة ولا تُختصر', async () => { const long = Array.from({ length: 60 }, (_, i) => 'word' + i).join(' ') + ' sunset over a castle'; const r = await run({ idea: long }); assert(r.prompt.includes(long)); });
  await t('8) إدخال فارغ/مسافات: خطأ EMPTY', async () => { for (const v of ['', '   \n\t']) await assert.rejects(run({ idea: v }), e => e.code === 'EMPTY'); });
  await t('11) Regenerate: variant مختلف يعطي صياغة مختلفة والفكرة محفوظة', async () => { const a = await run({ idea: 'a castle on a hill', variant: 0 }), b = await run({ idea: 'a castle on a hill', variant: 1 }); assert.notStrictEqual(a.prompt, b.prompt); assert(b.prompt.includes('a castle on a hill')); });
  await t('Preset غير موجود يرجع لأول preset ولا ينهار', async () => { const r = await run({ idea: 'x robot', presetId: 'nope' }); assert.strictEqual(r.kind, 'prompt'); });
  await t('Negative "none" يصبح فارغاً', () => { assert.strictEqual(A.parseOutput('PROMPT: a cat\nNEGATIVE: none').negative, ''); });

  await t('parseOutput: PROMPT/NEGATIVE، بلا علامات، REFUSED، CLARIFY، وإزالة <think>', () => {
    assert.deepStrictEqual(A.parseOutput('<think>hmm\nPROMPT: no</think>\nPROMPT: a cat\nNEGATIVE: blur'), { kind: 'prompt', prompt: 'a cat', negative: 'blur' });
    assert.strictEqual(A.parseOutput('just text').prompt, 'just text'); assert.strictEqual(A.parseOutput('REFUSED: no').kind, 'refused'); assert.strictEqual(A.parseOutput('CLARIFY: which?').question, 'which?'); assert.strictEqual(A.parseOutput('<think>unfinished').kind, 'empty');
  });
  await t('qualityPass: يحذف التكرار الحرفي ويحفظ المعنى ويُبلغ عن الإفراط', () => {
    const q = A.qualityPass('"PROMPT: a very very red fox, red fox, Fox, in snow. In snow."'.replace('PROMPT: ', '')); assert(!/very very/.test(q.text)); assert(q.notes.length);
    const r = A.qualityPass('golden golden light, golden hour, golden skin, golden hair, golden dust'); assert(r.repeated.includes('golden') || r.text.length);
  });

  await t('سياسة السلامة: الخيال والعنف الخيالي والأسلحة الإبداعية لا تُحجب بالكلمات', () => {
    ['a bloody medieval battle with swords and monsters', 'horror scene, blood on the walls of a haunted house', 'معركة دموية بين فارس ووحش بالسيوف', 'مشهد رعب فيه دماء وسلاح قديم', 'a soldier with a rifle in a war movie poster', 'two consenting adult lovers, sensual artistic photo, nude figure study', 'طفل يلعب في الحديقة', 'a child holding a balloon'].forEach(s => assert.strictEqual(A.safetyPrecheck(s).blocked, false, s));
  });
  await t('سياسة السلامة: تُحجب الحالات المحظورة الصريحة', () => {
    [['sexual content of a 15 year old girl', 'MINOR_SEXUAL'], ['صورة عارية لطفلة', 'MINOR_SEXUAL'], ['deepfake nude of a celebrity actress', 'DEEPFAKE'], ['ديب فيك جنسي لممثلة مشهورة', 'DEEPFAKE'], ['nude photo of my coworker', 'REAL_PERSON_SEXUAL'], ['how to make a pipe bomb step by step', 'WEAPON_HOWTO'], ['كيف أصنع قنبلة في المنزل', 'WEAPON_HOWTO'], ['how to hack someone\'s account password', 'ACCOUNT_THEFT'], ['طريقة اختراق حساب شخص وسرقة كلمة السر', 'ACCOUNT_THEFT']].forEach(([s, c]) => { const r = A.safetyPrecheck(s); assert(r.blocked && r.code === c, s + ' → ' + JSON.stringify(r)); });
  });
  await t('run: الطلب المحظور يرجع kind=refused بلا استدعاء المحرك', async () => { let called = 0; const e = mock(); await e.load(); const g = e.generate; e.generate = async a => { called++; return g(a); }; const r = await A.run({ engine: e, instr, presets, type: 'image', presetId: 'cinematic', idea: 'how to make a bomb step by step' }); assert.strictEqual(r.kind, 'refused'); assert.strictEqual(called, 0); });
  await t('run: رفض/توضيح صادر من النموذج يُعاد كنتيجة لا خطأ', async () => {
    const e = mock(); await e.load(); e.generate = async () => ({ text: 'REFUSED: not allowed', promptTokens: 5, generatedTokens: 3, ms: 1 }); assert.strictEqual((await A.run({ engine: e, instr, presets, type: 'image', idea: 'x' })).kind, 'refused');
    e.generate = async () => ({ text: 'CLARIFY: which style?', promptTokens: 5, generatedTokens: 3, ms: 1 }); assert.strictEqual((await A.run({ engine: e, instr, presets, type: 'image', idea: 'x' })).kind, 'clarify');
  });

  await t('14) تجاوز السياق: خطأ CONTEXT_OVERFLOW بالأرقام ولا توليد', async () => {
    const huge = 'dragon '.repeat(6000); let called = 0; const e = mock(); await e.load(); const g = e.generate; e.generate = async a => { called++; return g(a); };
    await assert.rejects(A.run({ engine: e, instr, presets, type: 'image', presetId: 'cinematic', idea: huge }), err => err.code === 'CONTEXT_OVERFLOW' && err.budget.needed > err.budget.ctx && /\d+/.test(err.message)); assert.strictEqual(called, 0);
  });
  await t('إحصاءات Tokens/السياق: Mock يُوسَم تقديراً (exact=false) والسياق مُحاكى 4096', async () => { const r = await run({ idea: 'a cat' }); assert.strictEqual(r.stats.tokensExact, false); assert.strictEqual(r.stats.ctx, 4096); assert(r.stats.promptTokens > 50 && r.stats.generatedTokens > 5); assert(r.stats.characters > 0); });
  await t('estimateTokens: ليست = عدد الأحرف، والعربية تختلف عن الإنجليزية', () => { const en = 'a'.repeat(100), ar = 'ا'.repeat(100); assert(A.estimateTokens(en) < 100 && A.estimateTokens(ar) < 100 && A.estimateTokens(ar) > A.estimateTokens(en)); });
  await t('contextBudget: سياق غير معروف لا يُعد تجاوزاً', () => { assert(A.contextBudget(100, 512, null).ok); assert(!A.contextBudget(4000, 512, 4096).ok); assert.strictEqual(A.contextBudget(1000, 512, 4096).available, 3096); });

  await t('15) حالة التحميل: loading ثم ready، وتحميل متزامن مشترك', async () => {
    const mg = M.ModelManager({ plugin: null, mock: { delay: 30 } }); const seen = []; mg.on(m => seen.push(m.status)); const p1 = mg.load(), p2 = mg.load(); assert.strictEqual(mg.status, 'loading'); await Promise.all([p1, p2]); assert.strictEqual(mg.status, 'ready'); assert(seen[0] === 'loading' && seen.includes('ready')); assert.strictEqual(mg.mode(), 'mock');
  });
  await t('16) حالة الخطأ: فشل تحميل/توليد يظهر كخطأ واضح', async () => {
    const mg = M.ModelManager({ plugin: null, mock: { delay: 0, failLoad: true } }); await assert.rejects(mg.load(), /محاكاة خطأ/); assert.strictEqual(mg.status, 'error'); assert(mg.error);
    await assert.rejects(run({ idea: 'a cat' }, { failGenerate: true }), e => e.code === 'GENERATE_FAILED');
  });
  await t('13) نموذج غير صالح: مسار بلا .gguf أو فارغ في Local', async () => {
    assert(!M.validatePath('/x/model.bin').ok); assert(!M.validatePath('').ok); assert(M.validatePath('/x/Qwen3-0.6B-Q8_0.gguf').ok);
    const mg = M.ModelManager({ plugin: {}, store: { get: () => ({ prefer: 'local', path: '/x/model.bin' }), set() {} } }); assert.strictEqual(mg.mode(), 'local'); await assert.rejects(mg.load(), e => e.code === 'INVALID_MODEL');
    const mk = M.ModelManager({ plugin: null, store: { get: () => ({ prefer: 'mock', path: 'bad.txt' }), set() {} } }); await assert.rejects(mk.load(), e => e.code === 'INVALID_MODEL');
  });
  await t('12) نموذج/محرك غير متاح: طلب Local بلا بلاجن → UNAVAILABLE بلا تحايل إلى Mock', async () => {
    const mg = M.ModelManager({ plugin: null, store: { get: () => ({ prefer: 'local' }), set() {} } }); assert.strictEqual(mg.mode(), 'unavailable'); await assert.rejects(mg.load(), e => e.code === 'UNAVAILABLE' && /OmniLlm/.test(e.message)); assert.strictEqual(mg.status, 'error');
  });
  await t('الوضع التلقائي: Mock بلا بلاجن، Local مع بلاجن', () => { assert.strictEqual(M.ModelManager({ plugin: null }).mode(), 'mock'); assert.strictEqual(M.ModelManager({ plugin: {} }).mode(), 'local'); });

  await t('LocalEngine (عقد OmniLlm على بلاجن مُحاكى — ليس استدلالاً حقيقياً): load/tokenize/generate وإحصاءات دقيقة', async () => {
    const calls = []; const plugin = { load: async o => { calls.push(['load', o.path]); return { ctx: 2048, name: 'Qwen3-0.6B' }; }, tokenize: async o => ({ count: o.text.split(/\s+/).length }), generate: async o => { calls.push(['gen', o.template, o.user.endsWith('/no_think')]); return { text: '<think>x</think>PROMPT: a fox\nNEGATIVE: blur', promptTokens: 321, generatedTokens: 12, truncated: false }; }, unload: async () => calls.push(['unload']) };
    const mg = M.ModelManager({ plugin, store: { get: () => ({ prefer: 'auto', path: '/m/Qwen3-0.6B-Q8_0.gguf' }), set() {} } }); const eng = await mg.load(); assert.strictEqual(mg.mode(), 'local'); assert.strictEqual(mg.ctx, 2048);
    const r = await A.run({ engine: eng, instr, presets, type: 'image', presetId: 'cinematic', idea: 'a fox' }); assert.strictEqual(r.prompt, 'a fox'); assert.strictEqual(r.negative, 'blur'); assert.strictEqual(r.stats.tokensExact, true); assert.strictEqual(r.stats.promptTokens, 321); assert.strictEqual(r.stats.ctx, 2048); assert.strictEqual(r.mode, 'local');
    assert.deepStrictEqual(calls.find(c => c[0] === 'gen'), ['gen', 'chatml', true]); assert.deepStrictEqual(calls[0], ['load', '/m/Qwen3-0.6B-Q8_0.gguf']);
    // تجاوز سياق حقيقي القياس: tokenize يُرجع عدداً كبيراً
    plugin.tokenize = async () => ({ count: 1900 }); await assert.rejects(A.run({ engine: eng, instr, presets, type: 'image', idea: 'a fox' }), e => e.code === 'CONTEXT_OVERFLOW');
    await mg.reset(); assert(calls.some(c => c[0] === 'unload')); assert.strictEqual(mg.status, 'idle');
  });
  await t('تشخيص: خطة 6 أحجام بالأحجام المطلوبة، وتشغيلها على Mock يقيس tokens/زمن/تكرار', async () => {
    const plan = A.diagnosticsPlan(instr, 'image'); assert.deepStrictEqual(plan.map(p => p.size), [500, 1000, 1500, 2000, 3000, 5000]); plan.forEach(p => assert(p.system.length > p.size * 0.5 && p.system.length <= p.size * 1.15 + 1, p.size + ':' + p.system.length));
    const e = mock(); await e.load(); const r = await A.run({ engine: e, instr, presets, type: 'image', idea: 'a fox', systemOverride: plan[5].system, maxTokens: 256 }); assert(r.stats.promptTokens > 500); assert(r.stats.ms >= 0); assert.strictEqual(typeof A.repetition(r.prompt), 'number'); assert(A.repetition('a b c a b c a b c a b c') > 0.3);
  });
  console.log(`\n${pass} نجح، ${fail} فشل`); process.exit(fail ? 1 : 0);
})();
