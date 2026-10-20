/* Prompt Forge — طبقة النموذج (Model abstraction).
 *  - ModelManager: النموذج الحالي، مساره، اسمه، حالته، معلومات السياق.
 *  - Engine (واجهة واحدة): info() / load({path}) / unload() / countTokens(text) / generate(args) / cancel()
 *      · LocalEngine: محوّل لبلاجن Capacitor اسمه OmniLlm (llama.cpp/GGUF). **البلاجن غير موجود في هذا المشروع بعد**؛
 *        المحوّل مكتوب على العقد الموثّق في prompt-forge/README.md ومُختبَر فقط ببلاجن مُحاكى.
 *      · MockEngine: قالبي (بلا ذكاء اصطناعي ولا نموذج). يُعرض دائماً على أنه Mock.
 * إضافة نموذج/صيغة مستقبلاً = إضافة عنصر إلى PROFILES (أو محرك جديد بنفس الواجهة) دون لمس المنطق أو الواجهة. */
(function (root) {
  'use strict';
  const NS = (root.OF = root.OF || {}); NS.pf = NS.pf || {};
  const logic = NS.pf.logic || (typeof require !== 'undefined' ? require('./logic.js') : null);

  /* الافتراضي والموصى به: Qwen3-0.6B-GGUF. ملف النموذج خارجي دائماً (لا يُضمَّن في APK ولا الـzip ولا يُنزَّل أثناء البناء). */
  const PROFILES = [
    { id: 'qwen3-0.6b-gguf', name: 'Qwen3-0.6B-GGUF', family: 'qwen3', format: 'gguf', template: 'chatml', noThink: true, recommended: true, source: 'Qwen/Qwen3-0.6B-GGUF' },
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
  function MockEngine(profile, opts) {
    opts = opts || {}; let loaded = false;
    const E = { kind: 'mock', profile, simulated: true };
    E.info = () => ({ kind: 'mock', name: 'Mock (قالبي)', ctx: MOCK_CTX, simulated: true, loaded });
    E.load = async () => { await sleep(opts.delay != null ? opts.delay : 450); if (opts.failLoad) throw Object.assign(new Error('فشل تحميل Mock (محاكاة خطأ)'), { code: 'LOAD_FAILED' }); loaded = true; return E.info(); };
    E.unload = async () => { loaded = false; };
    E.isLoaded = () => loaded;
    E.countTokens = async text => ({ tokens: logic.estimateTokens(text), exact: false });
    E.generate = async a => {
      if (!loaded) throw Object.assign(new Error('النموذج غير محمّل'), { code: 'NOT_LOADED' });
      const t0 = Date.now(); await sleep(opts.genDelay != null ? opts.genDelay : 250);
      if (opts.failGenerate) throw Object.assign(new Error('فشل التوليد (محاكاة خطأ)'), { code: 'GENERATE_FAILED' });
      const text = mockCompose(a);
      return { text, promptTokens: logic.estimateTokens(a.system + '\n' + a.user), generatedTokens: logic.estimateTokens(text), exact: false, ms: Date.now() - t0, truncated: false };
    };
    E.cancel = async () => {};
    return E;
  }

  /* محوّل بلاجن OmniLlm. العقد: info() → {ready,name?,ctx?}، load({path}) → {ctx,name?}، unload()، tokenize({text}) → {count}،
   * generate({system,user,template,maxTokens,temperature}) → {text,promptTokens,generatedTokens,truncated}، cancel(). */
  function LocalEngine(profile, plugin) {
    let ctx = null, name = null, loaded = false;
    const E = { kind: 'local', profile, plugin };
    E.info = () => ({ kind: 'local', name: name || profile.name, ctx, simulated: false, loaded });
    E.load = async o => {
      if (!plugin || !plugin.load) throw Object.assign(new Error('بلاجن OmniLlm غير متاح'), { code: 'UNAVAILABLE' });
      let r; try { r = await plugin.load({ path: o.path }); } catch (e) { throw Object.assign(new Error((e && e.message) || 'تعذّر تحميل النموذج'), { code: (e && e.code) || 'INVALID_MODEL' }); }
      ctx = (r && r.ctx) || null; name = (r && r.name) || null; loaded = true; return E.info();
    };
    E.unload = async () => { try { plugin && plugin.unload && await plugin.unload(); } finally { loaded = false; ctx = null; } };
    E.isLoaded = () => loaded;
    E.countTokens = async text => {
      if (plugin && plugin.tokenize) { try { const r = await plugin.tokenize({ text }); if (r && Number.isFinite(r.count)) return { tokens: r.count, exact: true }; } catch (e) { /* يرجع للتقدير */ } }
      return { tokens: logic.estimateTokens(text), exact: false };
    };
    E.generate = async a => {
      if (!loaded) throw Object.assign(new Error('النموذج غير محمّل'), { code: 'NOT_LOADED' });
      const t0 = Date.now(); let r;
      try { r = await plugin.generate({ system: a.system, user: a.user, template: profile.template, maxTokens: a.maxTokens, temperature: a.temperature != null ? a.temperature : (a.variant ? 0.9 : 0.7) }); } catch (e) { throw Object.assign(new Error((e && e.message) || 'فشل التوليد'), { code: (e && e.code) || 'GENERATE_FAILED' }); }
      return { text: r.text, promptTokens: r.promptTokens, generatedTokens: r.generatedTokens, exact: r.promptTokens != null, ms: r.ms != null ? r.ms : Date.now() - t0, truncated: !!r.truncated };
    };
    E.cancel = async () => { try { plugin && plugin.cancel && await plugin.cancel(); } catch (e) { /* ignore */ } };
    return E;
  }

  /* ───────── ModelManager ───────── */
  function pluginOf() { try { return root.Capacitor && root.Capacitor.Plugins && root.Capacitor.Plugins.OmniLlm || null; } catch (e) { return null; } }
  function validatePath(p) {
    p = String(p || '').trim(); if (!p) return { ok: false, error: 'أدخل مسار ملف النموذج (.gguf)' };
    if (/[\0\r\n]/.test(p)) return { ok: false, error: 'مسار غير صالح' };
    if (!/\.gguf$/i.test(p)) return { ok: false, error: 'نموذج غير صالح: يجب أن ينتهي المسار بـ .gguf' };
    return { ok: true, path: p };
  }
  /* store: كائن get/set (OF.store). prefer: 'auto' | 'local' | 'mock'. */
  function ModelManager(o) {
    o = o || {}; const store = o.store || { get: (k, d) => d, set: () => {} };
    const M = { profiles: PROFILES, listeners: [] };
    const saved = store.get('pf.model', {}) || {};
    M.profile = PROFILES.find(p => p.id === saved.profileId) || PROFILES[0];
    M.path = saved.path || ''; M.prefer = ['auto', 'local', 'mock'].includes(saved.prefer) ? saved.prefer : 'auto';
    M.status = 'idle'; M.error = null; M.engine = null; M.ctx = null; M.seq = 0;
    const emit = () => M.listeners.forEach(f => { try { f(M); } catch (e) { /* ignore */ } });
    M.on = f => { M.listeners.push(f); return () => { M.listeners = M.listeners.filter(x => x !== f); }; };
    const persist = () => store.set('pf.model', { profileId: M.profile.id, path: M.path, prefer: M.prefer });
    M.plugin = () => (o.plugin !== undefined ? o.plugin : pluginOf());
    /* الوضع الفعلي: 'local' | 'mock' | 'unavailable' (طُلب Local والبلاجن غير موجود) */
    M.mode = () => { const hasP = !!M.plugin(); if (M.prefer === 'mock') return 'mock'; if (M.prefer === 'local') return hasP ? 'local' : 'unavailable'; return hasP ? 'local' : 'mock'; };
    M.name = () => M.profile.name; M.isDefault = () => M.profile.id === DEFAULT_PROFILE;
    M.setPrefer = p => { if (!['auto', 'local', 'mock'].includes(p)) return; M.prefer = p; persist(); M.reset(); };
    M.setPath = p => { M.path = String(p || '').trim(); persist(); if (M.status !== 'idle') M.reset(); else emit(); };
    M.reset = async () => { const e = M.engine; M.engine = null; M.status = 'idle'; M.error = null; M.ctx = null; if (e) { try { await e.unload(); } catch (x) { /* ignore */ } } emit(); };
    M.info = () => M.engine ? M.engine.info() : { kind: M.mode(), ctx: null };
    /* يحمّل النموذج (أو يحاكي التحميل في Mock). يرمي خطأ برسالة واضحة ويضع status='error'. */
    M.load = async () => {
      if (M.status === 'ready') return M.engine; if (M.status === 'loading') return M.loading;
      const mode = M.mode(); const seq = ++M.seq;
      M.status = 'loading'; M.error = null; emit();
      M.loading = (async () => {
        try {
          let eng;
          if (mode === 'unavailable') throw Object.assign(new Error('محرك الذكاء الاصطناعي المحلي (OmniLlm) غير متاح في هذا البناء. استخدم وضع Mock أو ابنِ بلاجن OmniLlm.'), { code: 'UNAVAILABLE' });
          if (mode === 'local') { const v = validatePath(M.path); if (!v.ok) throw Object.assign(new Error(v.error), { code: 'INVALID_MODEL' }); eng = LocalEngine(M.profile, M.plugin()); await eng.load({ path: v.path }); }
          else { eng = MockEngine(M.profile, o.mock); if (M.path) { const v = validatePath(M.path); if (!v.ok) throw Object.assign(new Error(v.error), { code: 'INVALID_MODEL' }); } await eng.load({ path: M.path }); }
          if (seq !== M.seq) return null; M.engine = eng; M.status = 'ready'; M.ctx = eng.info().ctx; emit(); return eng;
        } catch (e) { if (seq === M.seq) { M.status = 'error'; M.error = e; M.engine = null; emit(); } throw e; }
      })();
      return M.loading;
    };
    M.ensure = async () => { if (M.status === 'ready') return M.engine; if (M.status === 'error') M.status = 'idle'; return M.load(); };
    return M;
  }

  NS.pf.model = { PROFILES, DEFAULT_PROFILE, MOCK_CTX, MockEngine, LocalEngine, ModelManager, validatePath, mockCompose };
  if (typeof module !== 'undefined' && module.exports) module.exports = NS.pf.model;
})(typeof window !== 'undefined' ? window : globalThis);
