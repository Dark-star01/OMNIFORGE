/* Prompt Forge — المنطق النقي (بلا DOM): بناء التعليمات، تحليل الناتج، Quality Pass، فحص السلامة، السياق، التشخيص.
 * يعمل في المتصفح (OF.pf.logic) وفي Node للاختبار. لا يعرف شيئاً عن نموذج بعينه: المحرك يُمرَّر إليه (انظر model.js). */
(function (root) {
  'use strict';
  const L = {};

  /* ───────── التعليمات ───────── */
  const arr = x => (Array.isArray(x) ? x : []);
  /* يركّب نص System من ai-instructions.json: الدور + المهمة + السلوك + قواعد النوع + الجودة + الإخراج + السلامة.
   * قواعد الصورة تُضمَّن للصورة فقط، وقواعد الفيديو للفيديو فقط (توفيراً لنافذة السياق). */
  L.composeSystem = function (instr, type, preset) {
    instr = instr || {}; const sec = [];
    if (instr.role) sec.push(instr.role);
    if (instr.mission) sec.push(instr.mission);
    const bl = (title, list) => { list = arr(list).filter(Boolean); if (list.length) sec.push(title + ':\n' + list.map(x => '- ' + x).join('\n')); };
    bl('Behavior', instr.behavior);
    bl(type === 'video' ? 'Video prompt rules' : 'Image prompt rules', type === 'video' ? instr.video_prompt_rules : instr.image_prompt_rules);
    bl('Quality rules', instr.quality_rules);
    const sp = instr.safety_policy || {};
    const pol = [];
    if (sp.principle) pol.push(sp.principle);
    if (arr(sp.allowed).length) pol.push('Allowed: ' + sp.allowed.join('; ') + '.');
    if (arr(sp.refuse_or_redirect).length) pol.push('Refuse or redirect: ' + sp.refuse_or_redirect.join('; ') + '.');
    if (pol.length) sec.push('Safety policy:\n' + pol.join('\n'));
    if (preset && preset.hint) sec.push('Preset guidance (a helpful hint, not a hard constraint): ' + preset.hint);
    const out = arr(instr.output_rules); if (out.length) sec.push('Output rules:\n' + out.join('\n'));
    return sec.join('\n\n');
  };
  /* رسالة المستخدم. بعض النماذج (Qwen3) تُفعّل وضع التفكير افتراضياً؛ المحرك يطلب تعطيله عبر profile.noThink. */
  L.buildUser = function (idea, type, profile) {
    const head = type === 'video' ? 'Create a video generation prompt for this idea:' : 'Create an image generation prompt for this idea:';
    return head + '\n' + String(idea).trim() + (profile && profile.noThink && profile.thinkControl !== 'prefix' ? '\n/no_think' : '');
  };

  /* ───────── الناتج ───────── */
  L.stripThink = s => String(s || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*?<\/think>/i, '').replace(/<think>[\s\S]*$/i, '').trim();
  /* يحلل الصيغة PROMPT:/NEGATIVE:/REFUSED:/CLARIFY:. بلا علامات → النص كله Prompt. */
  L.parseOutput = function (raw) {
    const s = L.stripThink(raw).replace(/\r/g, '');
    if (!s) return { kind: 'empty' };
    let m;
    if ((m = /^\s*REFUSED\s*:\s*([\s\S]*)$/i.exec(s))) return { kind: 'refused', reason: m[1].trim() };
    if ((m = /^\s*CLARIFY\s*:\s*([\s\S]*)$/i.exec(s))) return { kind: 'clarify', question: m[1].trim() };
    const pi = s.search(/(^|\n)\s*PROMPT\s*:/i), ni = s.search(/(^|\n)\s*NEGATIVE(\s+PROMPT)?\s*:/i);
    let prompt, neg = '';
    if (pi >= 0) {
      const ps = s.indexOf(':', pi) + 1;
      prompt = s.slice(ps, ni > pi ? ni : undefined);
    } else prompt = ni >= 0 ? s.slice(0, ni) : s;
    if (ni >= 0) neg = s.slice(s.indexOf(':', ni) + 1);
    neg = neg.trim(); if (/^(none|no|n\/a|-|—|لا يوجد)\.?$/i.test(neg)) neg = '';
    return { kind: 'prompt', prompt: prompt.trim(), negative: neg };
  };

  /* Quality Pass: تنظيف آمن لا يغيّر المعنى (يحذف التكرار الحرفي فقط ويُبلغ عن تكرار الصفات). */
  L.qualityPass = function (text) {
    let s = L.stripThink(text).replace(/\r/g, '');
    s = s.replace(/^```[a-z]*\n?|```$/gim, '').trim();
    s = s.replace(/^\s*(final\s+)?prompt\s*:\s*/i, '');
    if (/^(["'“”«])[\s\S]*(["'“”»])$/.test(s) && s.length > 2) s = s.slice(1, -1).trim();
    s = s.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n');
    const notes = [];
    // كلمات متتالية مكررة: "very very" → "very"
    const before = s; s = s.replace(/\b([A-Za-z؀-ۿ']{2,})(\s+\1\b)+/gi, '$1'); if (s !== before) notes.push('collapsed repeated words');
    // مقاطع مفصولة بفواصل مكررة (بلا حساسية لحالة الأحرف)
    const lines = s.split('\n').map(line => {
      const seen = new Set(); const parts = line.split(/,\s*/); const keep = [];
      for (const p of parts) { const k = p.trim().toLowerCase().replace(/[.\s]+$/, ''); if (!k) continue; if (seen.has(k)) { notes.push('removed duplicate phrase'); continue; } seen.add(k); keep.push(p.trim()); }
      return keep.join(', ');
    });
    s = lines.join('\n');
    // جمل مكررة حرفياً
    const sents = s.split(/(?<=[.!?])\s+/); const ss = new Set(); const sk = [];
    for (const x of sents) { const k = x.trim().toLowerCase(); if (!k) continue; if (ss.has(k)) { notes.push('removed duplicate sentence'); continue; } ss.add(k); sk.push(x.trim()); }
    s = sk.join(' ').replace(/[,\s]+$/, '').trim();
    // تبليغ فقط: كلمة طويلة تتكرر أكثر من 3 مرات
    const freq = {}; (s.toLowerCase().match(/[a-z؀-ۿ]{5,}/g) || []).forEach(w => (freq[w] = (freq[w] || 0) + 1));
    const repeated = Object.keys(freq).filter(w => freq[w] > 3);
    return { text: s, notes: Array.from(new Set(notes)), repeated };
  };

  /* ───────── فحص السلامة المسبق (محدود عمداً) ─────────
   * ليس فلتر كلمات: كل قاعدة تتطلب اجتماع مؤشرين من سياق واحد. الحكم الحقيقي في سياسة التعليمات للنموذج.
   * كلمات مثل blood/weapon/horror/violence وحدها لا تُرفض أبداً. */
  const R = {
    minor: /\b(child|children|kid|kids|minor|underage|under[- ]?age|toddler|infant|schoolgirl|schoolboy|teen(ager)?s?|loli\w*|shota)\b|(?:\b(?:[1-9]|1[0-7])[- ]?(?:years?[- ]old|yo|y\/o)\b)|طفل|طفلة|اطفال|أطفال|قاصر|قاصرة|صغير[ةه]? السن|مراهق|مراهقة|تحت (?:سن )?(?:ال)?(?:18|ثمان)/i,
    sexual: /\b(nude|naked|nsfw|sex|sexual|sexy|porn\w*|erotic|explicit|topless|genital\w*|orgasm|lingerie)\b|عاري|عارية|عراة|جنس|جنسي|جنسية|إباح|اباح/i,
    deepfake: /deep[- ]?fake|face[- ]?swap|ديب ?فيك|تبديل (?:ال)?وجه/i,
    realperson: /\b(real person|celebrity|actress|actor|politician|my (?:ex|neighbou?r|coworker|classmate|teacher|boss)|her real face|his real face)\b|شخص حقيقي|مشهور[ةه]?|ممثل[ةه]?|سياسي|جارتي|جاري|زميلتي|زميلي|طليق[تة]ي|وجه حقيقي|صور[ةه] (?:شخص|فلان)/i,
    howto: /\b(how to (?:make|build|synthesi[sz]e|cook|assemble)|step[- ]by[- ]step|recipe for|instructions? (?:to|for)|ingredients? (?:for|to))\b|كيف(?:ية)? (?:أ|ا)?(?:صنع|اصنع|تصنيع|صناعة|أصنع|أحضر|اجهز)|طريق[ةه] (?:صنع|تصنيع|عمل|تحضير)|خطوات (?:صنع|تصنيع)|مقادير|مكونات (?:صنع|تحضير)/i,
    dangerous: /\b(bomb|explosive|detonator|nerve agent|sarin|ricin|poison|toxic gas|molotov|ied|pipe bomb|3d[- ]printed gun|untraceable gun)\b|قنبل[ةه]|متفجر|عبو[ةه] ناسف|سم قاتل|غاز سام|مولوتوف|سلاح (?:مطبوع|بلا رقم)/i,
    hack: /\b(hack|steal|crack|bypass|phish\w*|keylog\w*|brute[- ]?force|dox\w*)\b|اخترق|اختراق|سرق[ةه]|تجاوز (?:ال)?حماي|تصيد|فك (?:ال)?حماي/i,
    account: /\b(account|password|credentials?|login|wifi|private (?:photos?|messages?|data)|someone'?s (?:phone|email))\b|حساب|كلمة (?:السر|المرور)|بيانات (?:دخول|خاص)|هاتف (?:شخص|زوج)|رسائل (?:خاص|شخص)/i,
    harmReal: /\b(stalk\w*|revenge porn|blackmail|harass\w*|swat(?:ting)?|find (?:her|his|their) (?:address|home)|track (?:her|him|them))\b|ابتزاز|مطارد|تتبع (?:شخص|فتا|زوج)|انتقام (?:إباحي|اباحي)|عنوان (?:سكن|منزل)/i,
  };
  L.safetyPrecheck = function (idea) {
    const s = String(idea || '');
    const hit = (code, ar, en) => ({ blocked: true, code, reason_ar: ar, reason_en: en });
    if (R.minor.test(s) && R.sexual.test(s)) return hit('MINOR_SEXUAL', 'لا يمكن المساعدة في أي محتوى جنسي يتعلق بقاصرين.', 'Cannot help with any sexual content involving minors.');
    if (R.deepfake.test(s) && (R.sexual.test(s) || R.realperson.test(s))) return hit('DEEPFAKE', 'لا يمكن المساعدة في محتوى مزيّف (deepfake) عن أشخاص حقيقيين. يمكنني مساعدتك بشخصية خيالية بدلاً منه.', 'Cannot help with deepfake content about real people. A fictional character is possible instead.');
    if (R.realperson.test(s) && R.sexual.test(s)) return hit('REAL_PERSON_SEXUAL', 'لا يمكن إنشاء محتوى جنسي عن أشخاص حقيقيين دون موافقتهم. يمكنني مساعدتك بشخصية خيالية بدلاً منه.', 'Cannot create sexual content about real people without consent. A fictional character is possible instead.');
    if (R.howto.test(s) && R.dangerous.test(s)) return hit('WEAPON_HOWTO', 'لا يمكن تقديم تعليمات عملية لصنع أسلحة أو متفجرات أو مواد سامة. يمكنني وصف مشهد خيالي دون تفاصيل تنفيذية.', 'Cannot provide practical instructions for weapons, explosives or toxic substances. A fictional scene without actionable detail is possible.');
    if (R.hack.test(s) && R.account.test(s)) return hit('ACCOUNT_THEFT', 'لا يمكن المساعدة في سرقة الحسابات أو انتهاك الخصوصية أو تجاوز الحماية.', 'Cannot help with account theft, privacy violations or bypassing protections.');
    if (R.harmReal.test(s) && R.realperson.test(s)) return hit('HARM_REAL', 'لا يمكن المساعدة في إيذاء أو استغلال أشخاص حقيقيين.', 'Cannot help with harming or exploiting real people.');
    return { blocked: false };
  };

  /* ───────── Tokens والسياق ───────── */
  /* تقدير تقريبي فقط (ليس tokenizer): يُستخدم حين لا يوفّر المحرك عدّاً حقيقياً ويُعرض دائماً بعلامة «تقدير». */
  L.estimateTokens = function (text) {
    const s = String(text || ''); if (!s) return 0;
    let latin = 0, other = 0, ws = 0;
    for (const ch of s) { if (/\s/.test(ch)) ws++; else if (/[A-Za-z0-9]/.test(ch)) latin++; else other++; }
    return Math.max(1, Math.ceil(latin / 3.8 + other / 1.6 + ws / 6));
  };
  /* ctx = null إن كان غير معروف. reserve = رموز محجوزة للتوليد. */
  L.contextBudget = function (promptTokens, reserve, ctx) {
    if (!ctx) return { known: false, used: promptTokens, available: null, needed: promptTokens + reserve, ok: true };
    const needed = promptTokens + reserve; return { known: true, used: promptTokens, available: Math.max(0, ctx - promptTokens), needed, ctx, ok: needed <= ctx };
  };
  /* نسبة تكرار ثلاثيات الكلمات (0..1) لقياس التكرار في التشخيص */
  L.repetition = function (text) {
    const w = String(text || '').toLowerCase().match(/[a-z؀-ۿ0-9']+/g) || []; if (w.length < 6) return 0;
    const seen = new Set(); let rep = 0, tot = 0;
    for (let i = 0; i + 2 < w.length; i++) { const k = w[i] + ' ' + w[i + 1] + ' ' + w[i + 2]; tot++; if (seen.has(k)) rep++; else seen.add(k); }
    return tot ? rep / tot : 0;
  };

  /* ───────── خط الأنابيب الكامل ─────────
   * opts: { engine, instr, presets, type, presetId, idea, variant, maxTokens, onStage }
   * الأخطاء: Error مع .code = EMPTY | CONTEXT_OVERFLOW | ENGINE_*. الرفض/السؤال التوضيحي نتائج لا أخطاء. */
  const fail = (code, msg, extra) => Object.assign(new Error(msg), { code }, extra || {});
  L.presetOf = (presets, type, id) => arr(presets && presets[type]).find(p => p.id === id) || arr(presets && presets[type])[0] || null;
  L.run = async function (o) {
    const stage = s => { try { o.onStage && o.onStage(s); } catch (e) { /* ignore */ } };
    const type = o.type === 'video' ? 'video' : 'image';
    const idea = String(o.idea || '').trim();
    if (!idea) throw fail('EMPTY', 'اكتب فكرتك أولاً');
    stage('analyze');
    const sf = L.safetyPrecheck(idea);
    if (sf.blocked) return { kind: 'refused', reason: sf.reason_ar, code: sf.code, source: 'precheck', type, mode: o.engine.kind };
    const preset = L.presetOf(o.presets, type, o.presetId);
    const system = o.systemOverride != null ? o.systemOverride : L.composeSystem(o.instr, type, preset);
    const user = L.buildUser(idea, type, o.engine.profile);
    const maxTokens = o.maxTokens || 512;
    stage('count');
    const cnt = await o.engine.countTokens(system + '\n' + user);
    const info = o.engine.info(); const budget = L.contextBudget(cnt.tokens, maxTokens, info.ctx);
    if (!budget.ok) throw fail('CONTEXT_OVERFLOW', 'الفكرة والتعليمات أكبر من نافذة السياق: تحتاج ≈ ' + budget.needed + ' رمزاً (' + cnt.tokens + ' للإدخال + ' + maxTokens + ' محجوزة للتوليد) والمتاح ' + budget.ctx + '. اختصر الفكرة أو قلّل التعليمات.', { budget, tokens: cnt });
    if (o.isCancelled && o.isCancelled()) throw fail('CANCELLED', 'Generation cancelled.');
    stage('generate');
    const g = await o.engine.generate({ system, user, type, preset, idea, variant: o.variant || 0, maxTokens, temperature: o.temperature });
    stage('quality');
    const p = L.parseOutput(g.text);
    const stats = { characters: 0, promptTokens: g.promptTokens != null ? g.promptTokens : cnt.tokens, generatedTokens: g.generatedTokens, tokensExact: !!(cnt.exact && g.exact !== false && g.promptTokens != null), ms: g.ms, promptMs: g.promptMs != null ? g.promptMs : null, genMs: g.genMs != null ? g.genMs : null, tokensPerSec: g.tokensPerSec != null ? g.tokensPerSec : null, cachedTokens: g.cachedTokens != null ? g.cachedTokens : null, ctx: info.ctx || null, truncated: !!g.truncated, budget };
    if (p.kind === 'empty') throw fail('EMPTY_OUTPUT', 'لم يُنتج النموذج أي نص');
    if (p.kind === 'refused') return { kind: 'refused', reason: p.reason || 'تعذّر تنفيذ الطلب.', source: 'model', type, mode: o.engine.kind, stats };
    if (p.kind === 'clarify') return { kind: 'clarify', question: p.question, type, mode: o.engine.kind, stats };
    const q = L.qualityPass(p.prompt), nq = p.negative ? L.qualityPass(p.negative).text : '';
    if (!q.text) throw fail('EMPTY_OUTPUT', 'لم يُنتج النموذج Prompt صالحاً');
    stats.characters = q.text.length + nq.length;
    return { kind: 'prompt', prompt: q.text, negative: nq, type, presetId: preset && preset.id, mode: o.engine.kind, notes: q.notes, repeated: q.repeated, stats, raw: g.text, system, user };
  };

  /* ───────── خطة التشخيص ─────────
   * يبني تعليمات اختبار بأحجام محاكاة تقريبية (بالحروف) بأخذ أسطر التعليمات الحقيقية بالتتابع (مع التدوير) حتى يقترب الحجم.
   * الأحجام عيّنات لا حدود. المقياس الأساسي هو Tokens حين يوفّرها المحرك. */
  L.DIAG_SIZES = [500, 1000, 1500, 2000, 3000, 5000];
  L.diagnosticsPlan = function (instr, type, sizes) {
    const full = L.composeSystem(instr, type, null); const lines = full.split('\n').filter(x => x.trim()); if (!lines.length) return [];
    return (sizes || L.DIAG_SIZES).map(size => {
      let out = '', i = 0; while (out.length < size && i < lines.length * 50) { const next = lines[i % lines.length]; if (out && out.length + next.length + 1 > size && out.length > size * 0.8) break; out += (out ? '\n' : '') + next; i++; }
      if (out.length > size * 1.15) out = out.slice(0, size); return { size, system: out, chars: out.length };
    });
  };

  const NS = (root.OF = root.OF || {}); NS.pf = NS.pf || {}; NS.pf.logic = L;
  if (typeof module !== 'undefined' && module.exports) module.exports = L;
})(typeof window !== 'undefined' ? window : globalThis);
