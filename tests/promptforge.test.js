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
    const mg = M.ModelManager({ plugin: null, mock: { delay: 30 }, store: { get: () => ({ prefer: 'mock' }), set() {} } }); const seen = []; mg.on(m => seen.push(m.status)); const p1 = mg.load(), p2 = mg.load(); assert.strictEqual(mg.status, 'loading'); await Promise.all([p1, p2]); assert.strictEqual(mg.status, 'ready'); assert(seen[0] === 'loading' && seen.includes('ready')); assert.strictEqual(mg.mode(), 'mock');
  });
  await t('16) حالة الخطأ: فشل تحميل/توليد يظهر كخطأ واضح', async () => {
    const mg = M.ModelManager({ plugin: null, mock: { delay: 0, failLoad: true }, store: { get: () => ({ prefer: 'mock' }), set() {} } }); await assert.rejects(mg.load(), /محاكاة خطأ/); assert.strictEqual(mg.status, 'error'); assert(mg.error);
    await assert.rejects(run({ idea: 'a cat' }, { failGenerate: true }), e => e.code === 'GENERATE_FAILED');
  });
  await t('13) نموذج غير صالح: مسار بلا .gguf أو فارغ في Local', async () => {
    assert(!M.validatePath('/x/model.bin').ok); assert(!M.validatePath('').ok); assert(M.validatePath('/x/Qwen3-0.6B-Q8_0.gguf').ok);
    const mg = M.ModelManager({ plugin: {}, store: { get: () => ({ prefer: 'local', path: '/x/model.bin' }), set() {} } }); assert.strictEqual(mg.mode(), 'local'); await assert.rejects(mg.load(), e => e.code === 'INVALID_MODEL');
    const mk = M.ModelManager({ plugin: null, store: { get: () => ({ prefer: 'mock', path: 'bad.txt' }), set() {} } }); await assert.rejects(mk.load(), e => e.code === 'INVALID_MODEL');
  });
  await t('12) نموذج/محرك غير متاح: طلب Local بلا بلاجن → UNAVAILABLE بلا تحايل إلى Mock', async () => {
    const mg = M.ModelManager({ plugin: null, store: { get: () => ({ prefer: 'local' }), set() {} } }); assert.strictEqual(mg.mode(), 'unavailable'); await assert.rejects(mg.load(), e => e.code === 'UNAVAILABLE' && /OmniLlm/.test(e.message)); assert.strictEqual(mg.state(), 'unavailable'); assert.strictEqual(mg.statusText(), 'OmniLlm unavailable'); assert.strictEqual(mg.engine, null);
  });
  await t('لا Mock صامت: بلا بلاجن → unavailable (وليس mock)، مع بلاجن → local، Mock فقط باختيار صريح', () => { assert.strictEqual(M.ModelManager({ plugin: null }).mode(), 'unavailable'); assert.strictEqual(M.ModelManager({ plugin: {} }).mode(), 'local'); assert.strictEqual(M.ModelManager({ plugin: null, store: { get: () => ({ prefer: 'mock' }), set() {} } }).mode(), 'mock'); assert.strictEqual(M.ModelManager({ plugin: {}, store: { get: () => ({ prefer: 'auto' }), set() {} } }).prefer, 'local'); });

  await t('LocalEngine (عقد OmniLlm على بلاجن مُحاكى — ليس استدلالاً حقيقياً): load/tokenize/generate وإحصاءات دقيقة', async () => {
    const calls = []; const plugin = { load: async o => { calls.push(['load', o.path]); return { ctx: 2048, name: 'Qwen3-0.6B' }; }, tokenize: async o => ({ count: o.text.split(/\s+/).length }), generate: async o => { calls.push(['gen', o.template, o.user.endsWith('/no_think'), o.assistantPrefix, o.topK]); return { text: '<think>x</think>PROMPT: a fox\nNEGATIVE: blur', promptTokens: 321, generatedTokens: 12, truncated: false }; }, unload: async () => calls.push(['unload']) };
    const mg = M.ModelManager({ plugin, store: { get: () => ({ prefer: 'local', path: '/m/Qwen3-0.6B-Q8_0.gguf' }), set() {} } }); const eng = await mg.load(); assert.strictEqual(mg.mode(), 'local'); assert.strictEqual(mg.ctx, 2048);
    const r = await A.run({ engine: eng, instr, presets, type: 'image', presetId: 'cinematic', idea: 'a fox' }); assert.strictEqual(r.prompt, 'a fox'); assert.strictEqual(r.negative, 'blur'); assert.strictEqual(r.stats.tokensExact, true); assert.strictEqual(r.stats.promptTokens, 321); assert.strictEqual(r.stats.ctx, 2048); assert.strictEqual(r.mode, 'local');
    assert.deepStrictEqual(calls.find(c => c[0] === 'gen'), ['gen', 'chatml', false, '<think>\n\n</think>\n\n', 20]); assert.deepStrictEqual(calls[0], ['load', '/m/Qwen3-0.6B-Q8_0.gguf']);
    // تجاوز سياق حقيقي القياس: tokenize يُرجع عدداً كبيراً
    plugin.tokenize = async () => ({ count: 1900 }); await assert.rejects(A.run({ engine: eng, instr, presets, type: 'image', idea: 'a fox' }), e => e.code === 'CONTEXT_OVERFLOW');
    await mg.reset(); assert(calls.some(c => c[0] === 'unload')); assert.strictEqual(mg.status, 'idle');
  });

  const mkp = (over) => Object.assign({ load: async () => ({ ctx: 2048, name: 'Qwen3 0.6B', displayName: 'Qwen3-0.6B-Q8_0', modelSize: 639e6 }), tokenize: async () => ({ count: 50 }), unload: async () => {}, cancel: async () => {}, generate: async () => ({ text: 'PROMPT: a fox\nNEGATIVE: blur', promptTokens: 900, generatedTokens: 30, cachedTokens: 800, truncated: false, ms: 1500, promptMs: 300, genMs: 1200, tokensPerSec: 25 }) }, over || {});
  const mkm = (plugin, saved) => M.ModelManager({ plugin, store: { get: () => saved || {}, set() {} } });
  await t('نص الحالة: كل الحالات الستة المطلوبة حرفياً', async () => {
    assert.strictEqual(mkm(null).statusText(), 'OmniLlm unavailable');
    assert.strictEqual(mkm(mkp()).statusText(), 'No local model configured');
    const m = mkm(mkp(), { path: '/m/Qwen3-0.6B-Q8_0.gguf' }); assert.strictEqual(m.state(), 'idle'); await m.load(); assert.strictEqual(m.statusText(), 'Qwen3-0.6B — Ready'); m.setGenerating(true); assert.strictEqual(m.statusText(), 'Generating...'); m.setGenerating(false);
    const l = mkm(mkp({ load: async () => { throw Object.assign(new Error('Model load failed: x'), { code: 'LOAD_FAILED' }); } }), { path: '/m/a.gguf' }); await assert.rejects(l.load(), e => e.code === 'LOAD_FAILED'); assert.strictEqual(l.statusText(), 'Model load failed');
    let rel; const lo = mkm(mkp({ load: () => new Promise(r => { rel = r; }) }), { path: '/m/a.gguf' }); const pl = lo.load(); assert.strictEqual(lo.statusText(), 'Loading model...'); rel({ ctx: 1 }); await pl;
    assert(/Mock/.test(mkm(null, { prefer: 'mock' }).statusText()));
  });
  await t('بلا نموذج مضبوط: load يرمي NO_MODEL ولا يستدعي البلاجن', async () => { let c = 0; const m = mkm(mkp({ load: async () => { c++; return {}; } })); await assert.rejects(m.load(), e => e.code === 'NO_MODEL' && /No local model configured/.test(e.message)); assert.strictEqual(c, 0); assert.strictEqual(m.status, 'idle'); });
  await t('مصدر URI (منتقي الملفات): load({uri}) بلا path، والاسم من الـGGUF/الملف', async () => { let req; const m = mkm(mkp({ load: async o => { req = o; return { ctx: 2048, name: 'Qwen3 0.6B' }; } })); m.setSource({ uri: 'content://x/1', name: 'Qwen3-0.6B-Q8_0.gguf', size: 639e6 }); assert(m.hasModel()); await m.load(); assert.deepStrictEqual(req, { nCtx: 2048, uri: 'content://x/1' }); assert.strictEqual(m.label(), 'Qwen3-0.6B'); });
  await t('نموذج آخر غير Qwen3-0.6B: يظهر باسمه (قابلية إضافة نماذج مستقبلاً)', async () => { const m = mkm(mkp({ load: async () => ({ ctx: 4096, name: 'Llama 3.2 1B Instruct' }) }), { path: '/m/Llama-3.2-1B.gguf' }); await m.load(); assert.strictEqual(m.statusText(), 'Llama 3.2 1B Instruct — Ready'); });
  await t('probe: بلاجن موجود بلا مكتبة أصلية (available:false) → unavailable مع السبب', async () => { const m = mkm(mkp({ info: async () => ({ available: false, reason: 'Native library not available for this device' }) }), { path: '/m/a.gguf' }); assert.strictEqual(m.mode(), 'local'); await m.probe(); assert.strictEqual(m.mode(), 'unavailable'); assert(/Native library/.test(m.unavailableReason())); await assert.rejects(m.load(), e => e.code === 'UNAVAILABLE'); });
  await t('thinking: non-thinking افتراضي عبر assistantPrefix، وبلا /no_think في user، والمعاملات من الـprofile', async () => {
    let req; const m = mkm(mkp({ generate: async o => { req = o; return { text: 'PROMPT: a\nNEGATIVE: none', promptTokens: 10, generatedTokens: 3 }; } }), { path: '/m/Qwen3-0.6B.gguf' }); const e = await m.load(); await A.run({ engine: e, instr, presets, type: 'image', idea: 'a fox' });
    assert.strictEqual(req.assistantPrefix, '<think>\n\n</think>\n\n'); assert(!req.user.includes('/no_think')); assert.deepStrictEqual([req.temperature, req.topK, req.topP, req.repeatPenalty], [0.7, 20, 0.8, 1.05]);
    await A.run({ engine: e, instr, presets, type: 'image', idea: 'a fox', variant: 1 }); assert(req.temperature > 0.7);
  });
  await t('الناتج: <think> يُحذف ولا يصل للمستخدم، والإحصاءات الحقيقية تمر كما هي (tokens/sec، cache)', async () => {
    const m = mkm(mkp({ generate: async () => ({ text: '<think>secret reasoning</think>PROMPT: a fox in snow\nNEGATIVE: blur', promptTokens: 900, generatedTokens: 30, cachedTokens: 800, ms: 1500, tokensPerSec: 25, truncated: false }) }), { path: '/m/a.gguf' }); const e = await m.load(); const r = await A.run({ engine: e, instr, presets, type: 'image', idea: 'a fox' });
    assert.strictEqual(r.prompt, 'a fox in snow'); assert(!JSON.stringify([r.prompt, r.negative]).includes('secret')); assert.strictEqual(r.stats.tokensPerSec, 25); assert.strictEqual(r.stats.cachedTokens, 800); assert.strictEqual(r.stats.tokensExact, true);
  });
  await t('لا اختلاق أرقام: محرك لا يعيد tokensPerSec/cached → null', async () => { const m = mkm(mkp({ generate: async () => ({ text: 'PROMPT: a', promptTokens: 5, generatedTokens: 1 }) }), { path: '/m/a.gguf' }); const e = await m.load(); const r = await A.run({ engine: e, instr, presets, type: 'image', idea: 'x' }); assert.strictEqual(r.stats.tokensPerSec, null); assert.strictEqual(r.stats.cachedTokens, null); assert.strictEqual(r.stats.promptMs, null); });
  await t('Cancel: CANCELLED من البلاجن يصل كخطأ CANCELLED؛ cancel() يستدعي البلاجن؛ الإلغاء قبل التوليد يمنعه', async () => {
    let cc = 0, called = 0; const m = mkm(mkp({ cancel: async () => { cc++; }, generate: async () => { called++; throw Object.assign(new Error('Generation cancelled.'), { code: 'CANCELLED' }); } }), { path: '/m/a.gguf' }); const e = await m.load();
    await assert.rejects(A.run({ engine: e, instr, presets, type: 'image', idea: 'x' }), er => er.code === 'CANCELLED'); await m.cancel(); assert.strictEqual(cc, 1); assert.strictEqual(m.cancelled, true);
    called = 0; await assert.rejects(A.run({ engine: e, instr, presets, type: 'image', idea: 'x', isCancelled: () => true }), er => er.code === 'CANCELLED'); assert.strictEqual(called, 0);
  });
  await t('Mock: cancel أثناء التوليد → CANCELLED', async () => { const e = mock({ genDelay: 400 }); await e.load(); const p = A.run({ engine: e, instr, presets, type: 'image', idea: 'x' }); setTimeout(() => e.cancel(), 60); await assert.rejects(p, er => er.code === 'CANCELLED'); });
  await t('تحرير تلقائي (ضغط ذاكرة): NOT_LOADED من البلاجن → إعادة تحميل مرة واحدة ثم نجاح', async () => { let loads = 0, gens = 0; const m = mkm(mkp({ load: async () => { loads++; return { ctx: 2048 }; }, generate: async () => { if (++gens === 1) throw Object.assign(new Error('No model is loaded.'), { code: 'NOT_LOADED' }); return { text: 'PROMPT: ok', promptTokens: 5, generatedTokens: 1 }; } }), { path: '/m/a.gguf' }); const e = await m.load(); const r = await A.run({ engine: e, instr, presets, type: 'image', idea: 'x' }); assert.strictEqual(r.prompt, 'ok'); assert.strictEqual(loads, 2); });
  await t('أخطاء التحميل تمر بأكوادها: INSUFFICIENT_MEMORY / FILE_NOT_FOUND / INVALID_MODEL ولا تنهار', async () => { for (const [code, msg] of [['INSUFFICIENT_MEMORY', 'Insufficient memory to load this model.'], ['FILE_NOT_FOUND', 'Model file not found'], ['INVALID_MODEL', 'Not a valid GGUF']]) { const m = mkm(mkp({ load: async () => { throw Object.assign(new Error(msg), { code }); } }), { path: '/m/a.gguf' }); await assert.rejects(m.load(), e => e.code === code && e.message === msg); assert.strictEqual(m.state(), 'load-failed'); } });
  await t('cancel أثناء التحميل: يرجع idle لا error', async () => { let rej; const m = mkm(mkp({ load: () => new Promise((_, r) => { rej = r; }), cancel: async () => rej(Object.assign(new Error('Model loading cancelled.'), { code: 'CANCELLED' })) }), { path: '/m/a.gguf' }); const p = m.load(); await m.cancel(); await assert.rejects(p, e => e.code === 'CANCELLED'); assert.strictEqual(m.status, 'idle'); assert.strictEqual(m.error, null); });
  await t('stat/pick/listModels عبر البلاجن', async () => { const m = mkm(mkp({ stat: async o => ({ exists: true, size: 639e6, name: 'q.gguf', gguf: true }), pickModel: async () => ({ uri: 'content://m/2', name: 'Qwen3-0.6B-Q8_0.gguf', size: 639e6 }), listModels: async () => ({ dir: '/d', models: [{ name: 'q.gguf', path: '/d/q.gguf', size: 1 }] }) })); await m.pick(); assert.strictEqual(m.uri, 'content://m/2'); assert.strictEqual(m.fileInfo.exists, true); assert.strictEqual((await m.listModels()).models.length, 1); });
  await t('إعادة الاستخدام: ensure() لا يحمّل مرتين، وreset() يحرر', async () => { let loads = 0, unl = 0; const m = mkm(mkp({ load: async () => { loads++; return { ctx: 1 }; }, unload: async () => { unl++; } }), { path: '/m/a.gguf' }); await Promise.all([m.ensure(), m.ensure()]); await m.ensure(); assert.strictEqual(loads, 1); await m.reset(); assert.strictEqual(unl, 1); assert.strictEqual(m.status, 'idle'); });
  await t('تشخيص: خطة 6 أحجام بالأحجام المطلوبة، وتشغيلها على Mock يقيس tokens/زمن/تكرار', async () => {
    const plan = A.diagnosticsPlan(instr, 'image'); assert.deepStrictEqual(plan.map(p => p.size), [500, 1000, 1500, 2000, 3000, 5000]); plan.forEach(p => assert(p.system.length > p.size * 0.5 && p.system.length <= p.size * 1.15 + 1, p.size + ':' + p.system.length));
    const e = mock(); await e.load(); const r = await A.run({ engine: e, instr, presets, type: 'image', idea: 'a fox', systemOverride: plan[5].system, maxTokens: 256 }); assert(r.stats.promptTokens > 500); assert(r.stats.ms >= 0); assert.strictEqual(typeof A.repetition(r.prompt), 'number'); assert(A.repetition('a b c a b c a b c a b c') > 0.3);
  });
  console.log(`\n${pass} نجح، ${fail} فشل`); process.exit(fail ? 1 : 0);
})();
