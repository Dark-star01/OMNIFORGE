/* Prompt Forge — طبقة النموذج (Model abstraction).
 *  - ModelManager: النموذج الحالي ومصدره (مسار/URI)، حالته، نص الحالة الظاهر للمستخدم، معلومات السياق.
 *  - Engine (واجهة واحدة): info() / load({path|uri}) / unload() / countTokens(text) / generate(args) / cancel()
 *      · LocalEngine: محوّل لبلاجن Capacitor اسمه OmniLlm (llama.cpp + GGUF، plugins/omni-llm). عقده موثّق في docs/PROMPT_FORGE.md.
 *      · MockEngine: قالبي (بلا ذكاء اصطناعي ولا نموذج). وضع اختبار صريح فقط — لا يُستخدم تلقائياً أبداً عند غياب المحرك الحقيقي.
 * ثلاث حالات مميزة للوضع: Mock | Real Local AI (local) | Unavailable. إضافة نموذج/صيغة = عنصر في PROFILES (أو محرك بنفس الواجهة). */
(function (root) {
  'use strict';
  const NS = (root.OF = root.OF || {}); NS.pf = NS.pf || {};
  const logic = NS.pf.logic || (typeof require !== 'undefined' ? require('./logic.js') : null);

  /* الافتراضي والموصى به: Qwen3-0.6B-GGUF. ملف النموذج خارجي دائماً (لا يُضمَّن في APK ولا الـzip ولا يُنزَّل أثناء البناء).
   * Qwen3: وضع non-thinking افتراضياً لسرعة التوليد عبر كتلة <think></think> فارغة بعد بداية دور المساعد (نفس ما يفعله قالب Qwen3 الرسمي مع enable_thinking=false).
   * لتفعيل التفكير: thinkControl:'none' (والـ<think> يُحذف من الناتج دائماً ولا يُعرض للمستخدم). المعاملات = توصية Qwen3 للوضع غير التفكيري. */
  const PROFILES = [
    { id: 'qwen3-0.6b-gguf', name: 'Qwen3-0.6B-GGUF', display: 'Qwen3-0.6B', family: 'qwen3', format: 'gguf', template: 'chatml', noThink: true, thinkControl: 'prefix', assistantPrefix: '<think>\n\n</think>\n\n',
      sampling: { temperature: 0.7, topK: 20, topP: 0.8, minP: 0, repeatPenalty: 1.05 }, nCtx: 2048, match: /qwen3.{0,12}0[._ -]?6b/i, recommended: true, source: 'Qwen/Qwen3-0.6B-GGUF' },
  ];
  const DEFAULT_PROFILE = PROFILES[0].id;

  const MOCK_CTX = 4096; // نافذة سياق مُحاكاة بوضوح (ليست قياساً لجهاز أو نموذج)

  /* ───────── Mock: مولّد قالبي ───────── */
  const hasAny = (s, re) => re.test(s);
  const pick = (list, v) => list[(v || 0) % list.length];
  const CUES = {
    portrait: /\b(portrait|face|close[- ]?up|woman|man|girl|boy|warrior|king|queen)\b|بورتريه|وجه|ملامح|امرأ|رجل|فتا|ولد|شاب|عجوز|محارب|ملك|ملكة/i,
    landscape: /\b(landscape|mountains?|forest|valley|sea|ocean|desert|city|skyline|castle|village)\b|منظر|جبل|جبال|غاب|بحر|محيط|صحراء|مدين|قلع|قري|وادي/i,
    creature: /\b(dragons?|monsters?|creatures?|beasts?|demons?|giants?)\b|تنين|وحش|مخلوق|عملاق|شيطان|عفريت/i,
    night: /\b(night|moon(light)?|midnight)\b|ليل|قمر|منتصف الليل/i,
    sunset: /\b(sunset|sunrise|golden hour|dusk|dawn)\b|غروب|شروق|فجر/i,
    rain: /\b(rain(y|ing)?|storm(y)?|wet)\b|مطر|عاصف|عاصفة|بلل/i,
    fog: /\b(fog(gy)?|mist(y)?|haze)\b|ضباب|ندى|غبار/i,
    battle: /\b(battles?|war|fights?|fighting|sword|duel)\b|معرك|حرب|قتال|سيف|مبارز/i,
    walk: /\b(walk(s|ing)?|run(s|ning)?|ride|riding|fly|flying|march(ing)?)\b|يمش|تمش|يجري|تجري|يركض|يركب|يطير|تطير|يسير/i,
  };
  const OPEN = ['The shot opens on', 'We begin with', 'The scene opens with'];
  const CLOSE = ['the shot settles on', 'the motion resolves as', 'the scene closes with'];
  const cap = x => x.charAt(0).toUpperCase() + x.slice(1);
  function wordCount(s) { return (String(s).trim().match(/\S+/g) || []).length; }
  /* يبني Prompt من فكرة + facets الـPreset بلا أي توليد لغوي. لا يترجم الفكرة: تبقى بلغتها كما كتبها المستخدم. */
  function mockCompose(a) {
    const idea = String(a.idea).trim().replace(/\s+/g, ' '); const p = a.preset || {}; const v = a.variant || 0; const type = a.type === 'video' ? 'video' : 'image';
    const detailed = wordCount(idea) >= 35; // فكرة مفصلة: نحافظ عليها ونضيف قليلاً فقط
    const extra = [];
    if (hasAny(idea, CUES.night)) extra.push('night scene, moonlight and practical light sources');
    if (hasAny(idea, CUES.sunset)) extra.push('golden hour glow, long soft shadows');
    if (hasAny(idea, CUES.rain)) extra.push('wet reflective surfaces, rain streaks catching the light');
    if (hasAny(idea, CUES.fog)) extra.push('volumetric fog and haze adding depth');
    let text;
    if (type === 'image') {
      const comp = hasAny(idea, CUES.creature) ? pick(['dynamic heroic composition with a strong sense of scale', 'low-angle composition emphasizing scale and power'], v)
        : hasAny(idea, CUES.portrait) ? pick(['medium close-up framing, subject in the rule-of-thirds', 'tight portrait framing, eyes near the upper third'], v)
          : hasAny(idea, CUES.landscape) ? pick(['wide establishing composition with layered foreground, midground and background depth', 'sweeping wide shot with leading lines and atmospheric depth'], v) : pick(['balanced composition with a clear focal point', 'centered subject with clean negative space'], v);
      const parts = detailed ? [idea, p.style, p.quality] : [idea, comp, p.style, p.lighting, p.camera, p.palette, p.mood, p.quality];
      text = parts.concat(detailed ? [] : extra).filter(Boolean).join(', ');
    } else {
      const act = hasAny(idea, CUES.battle) ? 'the action escalates with clashing movement and forceful impacts' : hasAny(idea, CUES.walk) ? 'the subject moves steadily through the space while the surroundings react' : 'the main action develops with clear, continuous motion';
      const seg = [
        pick(OPEN, v) + ' ' + idea + (p.style ? ' (' + p.style + ')' : '') + '.',
        'Beginning: a steady establishing frame' + (p.lighting ? ' under ' + p.lighting : '') + '.',
        'Middle: ' + act + (p.camera ? '; camera: ' + p.camera : '') + '.',
        'Ending: ' + pick(CLOSE, v) + ' a held final frame that keeps the same subject, lighting and look.',
        cap((extra.concat([p.mood, p.palette]).filter(Boolean).join(', ') + (p.quality ? '. ' + cap(p.quality) : '')).replace(/^\.\s*/, '')),
      ];
      text = seg.filter(Boolean).join(' ').replace(/\.\s*\./g, '.');
    }
    return 'PROMPT: ' + text + '\nNEGATIVE: ' + (p.negative || 'none');
  }

  /* ───────── المحركات ───────── */
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const cancelled = () => Object.assign(new Error('Generation cancelled.'), { code: 'CANCELLED' });
  function MockEngine(profile, opts) {
    opts = opts || {}; let loaded = false, cancelFlag = false;
    const E = { kind: 'mock', profile, simulated: true };
    E.info = () => ({ kind: 'mock', name: 'Mock (قالبي)', ctx: MOCK_CTX, simulated: true, loaded });
    E.load = async () => { await sleep(opts.delay != null ? opts.delay : 450); if (opts.failLoad) throw Object.assign(new Error('فشل تحميل Mock (محاكاة خطأ)'), { code: 'LOAD_FAILED' }); loaded = true; return E.info(); };
    E.unload = async () => { loaded = false; };
    E.isLoaded = () => loaded;
    E.countTokens = async text => ({ tokens: logic.estimateTokens(text), exact: false });
    E.generate = async a => {
      if (!loaded) throw Object.assign(new Error('النموذج غير محمّل'), { code: 'NOT_LOADED' });
      cancelFlag = false; const t0 = Date.now(); const total = opts.genDelay != null ? opts.genDelay : 250;
      for (let waited = 0; waited < total; waited += 25) { await sleep(Math.min(25, total - waited)); if (cancelFlag) throw cancelled(); }
      if (opts.failGenerate) throw Object.assign(new Error('فشل التوليد (محاكاة خطأ)'), { code: 'GENERATE_FAILED' });
      const text = mockCompose(a);
      return { text, promptTokens: logic.estimateTokens(a.system + '\n' + a.user), generatedTokens: logic.estimateTokens(text), exact: false, ms: Date.now() - t0, truncated: false };
    };
    E.cancel = async () => { cancelFlag = true; };
    return E;
  }

  /* محوّل بلاجن OmniLlm (العقد الكامل في docs/PROMPT_FORGE.md). مصدر النموذج: {path} أو {uri}.
   * لا يخترع أرقاماً: كل ما يعيده المحرك يمرّ كما هو، وما لا يوفّره يبقى null (تعرضه الواجهة «Unavailable»). */
  function LocalEngine(profile, plugin) {
    let ctx = null, name = null, display = null, loaded = false, lastLoad = null, extra = {};
    const E = { kind: 'local', profile, plugin };
    E.info = () => Object.assign({ kind: 'local', name: name || profile.name, displayName: display, ctx, simulated: false, loaded }, extra);
    E.load = async o => {
      if (!plugin || !plugin.load) throw Object.assign(new Error('OmniLlm unavailable'), { code: 'UNAVAILABLE' });
      const req = { nCtx: profile.nCtx || 2048 }; if (o.uri) req.uri = o.uri; else req.path = o.path;
      let r; try { r = await plugin.load(req); } catch (e) { throw Object.assign(new Error((e && e.message) || 'Model load failed'), { code: (e && e.code) || 'LOAD_FAILED' }); }
      ctx = (r && r.ctx) || null; name = (r && r.name) || null; display = (r && r.displayName) || null; loaded = true; lastLoad = o;
      extra = { modelSize: r && r.modelSize != null ? r.modelSize : null, threads: r && r.threads != null ? r.threads : null, reused: !!(r && r.reused) };
      return E.info();
    };
    E.unload = async () => { try { plugin && plugin.unload && await plugin.unload(); } finally { loaded = false; ctx = null; } };
    E.isLoaded = () => loaded;
    E.markUnloaded = () => { loaded = false; };
    E.countTokens = async text => {
      if (plugin && plugin.tokenize) { try { const r = await plugin.tokenize({ text }); if (r && Number.isFinite(r.count)) return { tokens: r.count, exact: true }; } catch (e) { /* يرجع للتقدير */ } }
      return { tokens: logic.estimateTokens(text), exact: false };
    };
    E.generate = async a => {
      if (!loaded) throw Object.assign(new Error('النموذج غير محمّل'), { code: 'NOT_LOADED' });
      const s = profile.sampling || {}; const t0 = Date.now();
      const req = { system: a.system, user: a.user, template: profile.template, maxTokens: a.maxTokens,
        temperature: a.temperature != null ? a.temperature : (a.variant ? Math.min(1.2, (s.temperature != null ? s.temperature : 0.7) + 0.2) : (s.temperature != null ? s.temperature : 0.7)),
        topK: s.topK, topP: s.topP, minP: s.minP, repeatPenalty: s.repeatPenalty };
      if (profile.thinkControl === 'prefix' && profile.noThink && profile.assistantPrefix) req.assistantPrefix = profile.assistantPrefix;
      const call = async () => { try { return await plugin.generate(req); } catch (e) { throw Object.assign(new Error((e && e.message) || 'فشل التوليد'), { code: (e && e.code) || 'GENERATE_FAILED' }); } };
      let r; try { r = await call(); }
      catch (e) { // حُرِّر النموذج تلقائياً (ضغط ذاكرة): أعد تحميله مرة واحدة ثم أعد المحاولة
        if (e.code === 'NOT_LOADED' && lastLoad) { loaded = false; await E.load(lastLoad); r = await call(); } else throw e; }
      return { text: r.text, promptTokens: r.promptTokens, generatedTokens: r.generatedTokens, cachedTokens: r.cachedTokens != null ? r.cachedTokens : null, exact: r.promptTokens != null,
        ms: r.ms != null ? r.ms : Date.now() - t0, promptMs: r.promptMs != null ? r.promptMs : null, genMs: r.genMs != null ? r.genMs : null, tokensPerSec: r.tokensPerSec != null ? r.tokensPerSec : null, truncated: !!r.truncated };
    };
    E.cancel = async () => { try { plugin && plugin.cancel && await plugin.cancel(); } catch (e) { /* ignore */ } };
    E.diagnostics = async () => { try { return plugin && plugin.info ? await plugin.info() : null; } catch (e) { return null; } };
    return E;
  }

  /* ───────── ModelManager ───────── */
  function pluginOf() { try { return root.Capacitor && root.Capacitor.Plugins && root.Capacitor.Plugins.OmniLlm || null; } catch (e) { return null; } }
  function validatePath(p) {
    p = String(p || '').trim(); if (!p) return { ok: false, error: 'No local model configured' };
    if (/[\0\r\n]/.test(p)) return { ok: false, error: 'مسار غير صالح' };
    if (!/\.gguf$/i.test(p)) return { ok: false, error: 'نموذج غير صالح: يجب أن ينتهي المسار بـ .gguf' };
    return { ok: true, path: p };
  }
  const baseName = p => String(p || '').split(/[\\/]/).pop();
  /* store: كائن get/set (OF.store). prefer: 'local' (Real Local AI، الافتراضي) | 'mock' (اختبار صريح فقط). القيمة القديمة 'auto' تُرحَّل إلى 'local'. */
  function ModelManager(o) {
    o = o || {}; const store = o.store || { get: (k, d) => d, set: () => {} };
    const M = { profiles: PROFILES, listeners: [] };
    const saved = store.get('pf.model', {}) || {};
    M.profile = PROFILES.find(p => p.id === saved.profileId) || PROFILES[0];
    M.path = saved.path || ''; M.uri = saved.uri || ''; M.fileName = saved.fileName || (M.path ? baseName(M.path) : ''); M.fileSize = saved.fileSize != null ? saved.fileSize : null;
    M.prefer = saved.prefer === 'mock' ? 'mock' : 'local';
    M.status = 'idle'; M.error = null; M.engine = null; M.ctx = null; M.seq = 0; M.generating = false; M.cancelled = false; M.pluginInfo = null; M.fileInfo = null;
    const emit = () => M.listeners.forEach(f => { try { f(M); } catch (e) { /* ignore */ } });
    M.on = f => { M.listeners.push(f); return () => { M.listeners = M.listeners.filter(x => x !== f); }; };
    const persist = () => store.set('pf.model', { profileId: M.profile.id, path: M.path, uri: M.uri, fileName: M.fileName, fileSize: M.fileSize, prefer: M.prefer });
    M.plugin = () => (o.plugin !== undefined ? o.plugin : pluginOf());
    /* يسأل البلاجن إن كان المحرك الأصلي فعلاً متاحاً (قد يوجد البلاجن بلا مكتبة أصلية، مثل ABI غير مبني). */
    M.probe = async () => {
      const p = M.plugin(); M.pluginInfo = null;
      if (p && p.info) { try { M.pluginInfo = await p.info(); } catch (e) { M.pluginInfo = { available: false, reason: (e && e.message) || 'info failed' }; } }
      if (p && p.addListener && !M._lis) { M._lis = true; try { await p.addListener('modelUnloaded', () => { if (M.status === 'ready' && !M.generating) { if (M.engine && M.engine.markUnloaded) M.engine.markUnloaded(); M.engine = null; M.status = 'idle'; M.ctx = null; emit(); } }); } catch (e) { /* ignore */ } }
      emit(); return M.pluginInfo;
    };
    /* الوضع الفعلي: 'local' | 'mock' | 'unavailable'. لا تحايل: غياب المحرك الحقيقي لا يعني Mock أبداً. */
    M.mode = () => { if (M.prefer === 'mock') return 'mock'; const p = M.plugin(); if (!p) return 'unavailable'; if (M.pluginInfo && M.pluginInfo.available === false) return 'unavailable'; return 'local'; };
    M.unavailableReason = () => (M.pluginInfo && M.pluginInfo.reason) || (M.plugin() ? '' : 'plugin not installed in this build');
    M.hasModel = () => !!(M.path || M.uri);
    M.name = () => M.profile.name;
    M.isDefault = () => M.profile.id === DEFAULT_PROFILE;
    /* اسم العرض: Qwen3-0.6B حين يطابق الملف/GGUF ملف التعريف، وإلا اسم GGUF أو اسم الملف. */
    M.label = () => {
      const i = M.engine && M.engine.info ? M.engine.info() : {}; const cand = [i.name, i.displayName, M.fileName].filter(Boolean);
      if (M.profile.match && cand.some(c => M.profile.match.test(c))) return M.profile.display || M.profile.name;
      return i.displayName || i.name || M.fileName || M.profile.display || M.profile.name;
    };
    /* حالة واحدة مقروءة: mock | unavailable | no-model | idle | loading | ready | generating | load-failed */
    M.state = () => { const m = M.mode(); if (m === 'mock') return M.generating ? 'generating' : 'mock'; if (m === 'unavailable') return 'unavailable'; if (!M.hasModel()) return 'no-model'; if (M.status === 'loading') return 'loading'; if (M.status === 'error') return 'load-failed'; if (M.generating) return 'generating'; return M.status === 'ready' ? 'ready' : 'idle'; };
    M.statusText = () => ({ mock: 'Mock mode — testing only (not AI)', unavailable: 'OmniLlm unavailable', 'no-model': 'No local model configured', idle: M.label() + ' — Not loaded', loading: 'Loading model...', ready: M.label() + ' — Ready', generating: 'Generating...', 'load-failed': 'Model load failed' })[M.state()];
    M.setPrefer = p => { if (!['local', 'mock'].includes(p)) return; M.prefer = p; persist(); M.reset(); };
    M.setSource = s => { s = s || {}; M.path = s.path || ''; M.uri = s.uri || ''; M.fileName = s.name || (M.path ? baseName(M.path) : ''); M.fileSize = s.size != null && s.size >= 0 ? s.size : null; M.fileInfo = null; persist(); if (M.status !== 'idle') M.reset(); else emit(); };
    M.setPath = p => M.setSource({ path: String(p || '').trim() });
    M.clearSource = () => M.setSource({});
    M.stat = async () => {
      const p = M.plugin(); if (!M.hasModel()) { M.fileInfo = null; emit(); return null; }
      if (!p || !p.stat) { M.fileInfo = { unknown: true }; emit(); return M.fileInfo; }
      try { const r = await p.stat(M.uri ? { uri: M.uri } : { path: M.path }); M.fileInfo = r; if (r && r.size >= 0) M.fileSize = r.size; if (r && r.name && M.uri) M.fileName = r.name; } catch (e) { M.fileInfo = { exists: false, error: (e && e.message) || 'stat failed' }; }
      persist(); emit(); return M.fileInfo;
    };
    M.pick = async () => { const p = M.plugin(); if (!p || !p.pickModel) throw Object.assign(new Error('OmniLlm unavailable'), { code: 'UNAVAILABLE' }); const r = await p.pickModel(); M.setSource({ uri: r.uri, name: r.name, size: r.size }); await M.stat(); return r; };
    M.listModels = async () => { const p = M.plugin(); if (!p || !p.listModels) return { dir: '', models: [] }; try { return await p.listModels(); } catch (e) { return { dir: '', models: [] }; } };
    M.setGenerating = b => { M.generating = !!b; if (b) M.cancelled = false; emit(); };
    M.cancel = async () => { M.cancelled = true; const e = M.engine; if (e && e.cancel) { try { await e.cancel(); } catch (x) { /* ignore */ } } else { const p = M.plugin(); if (p && p.cancel && M.status === 'loading') { try { await p.cancel(); } catch (x) { /* ignore */ } } } };
    M.reset = async () => { const e = M.engine; M.engine = null; M.status = 'idle'; M.error = null; M.ctx = null; M.seq++; if (e) { try { await e.unload(); } catch (x) { /* ignore */ } } emit(); };
    M.info = () => M.engine ? M.engine.info() : { kind: M.mode(), ctx: null };
    /* يحمّل النموذج (أو يحاكي التحميل في Mock). يرمي خطأ برسالة واضحة. NO_MODEL/UNAVAILABLE لا تغيّران الحالة إلى error. */
    M.load = async () => {
      if (M.status === 'ready') return M.engine; if (M.status === 'loading') return M.loading;
      const mode = M.mode();
      if (mode === 'unavailable') throw Object.assign(new Error('OmniLlm unavailable' + (M.unavailableReason() ? ' (' + M.unavailableReason() + ')' : '') + '. Mock mode is available only as an explicit testing choice.'), { code: 'UNAVAILABLE' });
      if (mode === 'local' && !M.hasModel()) throw Object.assign(new Error('No local model configured. Choose a GGUF file first.'), { code: 'NO_MODEL' });
      const seq = ++M.seq; M.status = 'loading'; M.error = null; M.cancelled = false; emit();
      M.loading = (async () => {
        try {
          let eng;
          if (mode === 'local') { if (M.path && !M.uri) { const v = validatePath(M.path); if (!v.ok) throw Object.assign(new Error(v.error), { code: 'INVALID_MODEL' }); } eng = LocalEngine(M.profile, M.plugin()); await eng.load(M.uri ? { uri: M.uri } : { path: M.path }); }
          else { eng = MockEngine(M.profile, o.mock); if (M.path) { const v = validatePath(M.path); if (!v.ok) throw Object.assign(new Error(v.error), { code: 'INVALID_MODEL' }); } await eng.load({ path: M.path }); }
          if (seq !== M.seq) { try { await eng.unload(); } catch (x) { /* ignore */ } return null; }
          M.engine = eng; M.status = 'ready'; M.ctx = eng.info().ctx; emit(); return eng;
        } catch (e) { if (seq === M.seq) { M.status = e.code === 'CANCELLED' ? 'idle' : 'error'; M.error = e.code === 'CANCELLED' ? null : e; M.engine = null; emit(); } throw e; }
      })();
      return M.loading;
    };
    M.ensure = async () => { if (M.status === 'ready') return M.engine; if (M.status === 'error') M.status = 'idle'; return M.load(); };
    return M;
  }

  NS.pf.model = { PROFILES, DEFAULT_PROFILE, MOCK_CTX, MockEngine, LocalEngine, ModelManager, validatePath, mockCompose };
  if (typeof module !== 'undefined' && module.exports) module.exports = NS.pf.model;
})(typeof window !== 'undefined' ? window : globalThis);
