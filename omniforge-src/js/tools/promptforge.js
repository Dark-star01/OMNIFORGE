/* Prompt Forge — واجهة الأداة. المنطق في js/prompt-forge/logic.js، والنموذج في js/prompt-forge/model.js،
 * والإعدادات في config/prompt-forge/*.json. الأداة لا تولّد صوراً/فيديو: تبني Prompt فقط. */
(function () {
  'use strict';
  const { h, ui } = OF; const T = OF.tools; const PF = OF.pf; const A = PF.logic, M = PF.model;
  const CFG = 'config/prompt-forge/';
  let cfgP = null;
  const getJSON = async n => { const r = await fetch(CFG + n); if (!r.ok) throw new Error('تعذّر تحميل ' + n + ' (' + r.status + ')'); return r.json(); };
  /* يُحمَّل مرة واحدة؛ عند الفشل يُسمح بإعادة المحاولة */
  const loadCfg = () => cfgP || (cfgP = Promise.all([getJSON('ai-instructions.json'), getJSON('presets.json')]).then(([instr, presets]) => ({ instr, presets })).catch(e => { cfgP = null; throw e; }));
  const mgr = (PF.manager = PF.manager || M.ModelManager({ store: OF.store }));
  const MODE = { mock: 'Mock (testing)', local: 'Real Local AI', unavailable: 'Unavailable' };
  const STATE_CLS = { mock: 'b-partial', unavailable: 'b-unavailable', 'no-model': 'b-partial', idle: 'b-partial', loading: 'b-requires-service', ready: 'b-ready', generating: 'b-requires-service', 'load-failed': 'b-unavailable' };
  const fmtN = n => (n == null ? '—' : String(n));
  const NA = 'Unavailable';
  const mb = b => (b == null || b < 0 ? NA : (b / 1048576 >= 1024 ? (b / 1073741824).toFixed(2) + ' GB' : (b / 1048576).toFixed(1) + ' MB'));
  const LOAD_CODES = ['FILE_NOT_FOUND', 'PERMISSION_DENIED', 'INVALID_MODEL', 'INSUFFICIENT_MEMORY', 'LOAD_FAILED'];

  T['prompt-forge'] = {
    render(box) {
      OF.clear(box);
      const st = { type: OF.store.get('pf.type', 'image'), presetId: OF.store.get('pf.preset', null), busy: false, variant: 0, last: null, alive: true, cfg: null };
      if (st.type !== 'image' && st.type !== 'video') st.type = 'image';

      const out = ui.out(); const idea = ui.area({ rows: 5, placeholder: 'اكتب فكرتك بالعربية أو الإنجليزية… مثال: فارس وحيد أمام تنين في عاصفة' });
      idea.dir = 'auto'; idea.setAttribute('aria-label', 'فكرتك'); idea.spellcheck = true;
      const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'النوع' });
      const presetSel = h('select', { 'aria-label': 'Preset' });
      const gen = ui.btn('ولّد Prompt', () => run(false), { kind: 'primary', icon: 'wand' });
      const stage = h('div', { class: 'muted small', 'aria-live': 'polite' });

      /* النتيجة */
      const resP = ui.area({ rows: 8 }); resP.dir = 'ltr'; resP.setAttribute('aria-label', 'Generated Prompt');
      const resN = ui.area({ rows: 3 }); resN.dir = 'ltr'; resN.setAttribute('aria-label', 'Negative Prompt');
      const statBox = h('div');
      const regen = ui.btn('إعادة التوليد', () => run(true), { icon: 'refresh', small: true });
      const resCard = ui.card('', h('div', { class: 'field' }, h('label', { text: 'Generated Prompt' }), resP),
        h('div', { class: 'field' }, h('label', { text: 'Negative Prompt' }), resN),
        ui.row(ui.copyBtn(() => resP.value), ui.btn('نسخ السلبي', () => resN.value ? ui.copy(resN.value) : ui.toast('لا يوجد Negative Prompt', 'error'), { icon: 'copy', small: true }), ui.btn('حفظ', save, { icon: 'save', small: true }), regen), statBox);
      resCard.style.display = 'none';

      function save() {
        if (!resP.value.trim()) return ui.toast('لا يوجد ما يُحفظ', 'error');
        const txt = 'Prompt (' + st.type + ')\n' + resP.value.trim() + '\n' + (resN.value.trim() ? '\nNegative Prompt\n' + resN.value.trim() + '\n' : '');
        OF.save(new Blob([txt], { type: 'text/plain;charset=utf-8' }), 'prompt-forge-' + st.type + '-' + Date.now().toString(36) + '.txt', 'text/plain').catch(e => ui.toast(e.message, 'error'));
      }
      function drawChips() {
        OF.clear(chips);
        [['image', 'صورة'], ['video', 'فيديو']].forEach(([id, label]) => chips.appendChild(h('button', { type: 'button', class: 'chip', 'aria-pressed': String(st.type === id), text: label + ' (' + (id === 'image' ? 'Image' : 'Video') + ')', on: { click: () => { st.type = id; st.presetId = null; OF.store.set('pf.type', id); drawChips(); drawPresets(); } } })));
      }
      function drawPresets() {
        OF.clear(presetSel); const list = st.cfg ? (st.cfg.presets[st.type] || []) : [];
        list.forEach(p => presetSel.appendChild(h('option', { value: p.id, text: p.name })));
        if (list.some(p => p.id === st.presetId)) presetSel.value = st.presetId; else { st.presetId = list[0] ? list[0].id : null; if (st.presetId) presetSel.value = st.presetId; }
      }
      presetSel.addEventListener('change', () => { st.presetId = presetSel.value; OF.store.set('pf.preset', st.presetId); });

      let lastDiag = null;
      function drawStats(r) {
        OF.clear(statBox); if (!r) return; const s = r.stats || {}; const b = s.budget || {}; const ex = s.tokensExact; const mock = r.mode === 'mock';
        const used = s.promptTokens != null ? s.promptTokens + (s.generatedTokens || 0) : null; const d = lastDiag || {}; const ei = mgr.engine && mgr.engine.info ? mgr.engine.info() : {};
        statBox.appendChild(ui.kv([
          ['Type', r.type === 'video' ? 'Video' : 'Image'], ['Mode', MODE[r.mode] || r.mode], ['Model', mock ? 'Mock — لا نموذج (قالبي)' : mgr.label()],
          ['Model loaded', mock ? 'No (mock)' : (mgr.status === 'ready' ? 'Yes' : 'No')],
          ['Characters', fmtN(s.characters)],
          ['Input tokens', s.promptTokens != null ? s.promptTokens + (ex ? '' : ' (تقدير تقريبي — ليس tokenizer)') : NA],
          ['Output tokens', s.generatedTokens != null ? s.generatedTokens + (ex ? '' : ' (تقدير تقريبي)') : NA],
          ['Context size', s.ctx ? s.ctx + (mock ? ' (مُحاكى)' : '') : NA],
          ['Context Used', used != null ? used + (s.ctx ? ' / ' + s.ctx : '') : '—'],
          ['Context Available', s.ctx && used != null ? String(Math.max(0, s.ctx - used)) : (b.known === false ? 'غير معروف' : '—')],
          ['Generation time', s.ms != null ? s.ms + ' ms' + (mock ? ' (محاكاة)' : '') : NA],
          ['Tokens/sec', !mock && s.tokensPerSec != null ? s.tokensPerSec.toFixed(1) : NA],
          ['Prompt cache', !mock && s.cachedTokens != null ? s.cachedTokens + ' tokens reused' : NA],
          ['Model size', mock ? NA : mb(ei.modelSize != null ? ei.modelSize : d.modelSize)],
          ['Available memory', mock ? NA : mb(d.memAvailable)], ['Process memory', mock ? NA : mb(d.processRss)],
          ['حالة الإخراج', s.truncated ? 'قُطع الإخراج (بلغ حد التوليد)' : 'مكتمل'],
        ]));
        if (mock) statBox.appendChild(h('div', { class: 'msg warn' }, OF.icon('info'), h('span', { text: 'MOCK MODE: النتيجة من قوالب وPresets وليست ذكاءً اصطناعياً. أرقام الـTokens والسياق مُحاكاة (نافذة ' + M.MOCK_CTX + ') ولا تعكس نموذجاً أو جهازاً.' })));
        if (r.repeated && r.repeated.length) statBox.appendChild(h('div', { class: 'msg info' }, OF.icon('info'), h('span', { text: 'كلمات متكررة كثيراً: ' + r.repeated.join('، ') })));
      }

      const cancelBtn = ui.btn('إلغاء', () => { stage.textContent = 'Cancelling...'; mgr.cancel(); }, { kind: 'danger', icon: 'x' }); cancelBtn.style.display = 'none';
      async function run(isRegen) {
        if (st.busy) return; st.busy = true; gen.disabled = true; regen.disabled = true; cancelBtn.style.display = ''; out.clear();
        const stageNames = { analyze: 'تحليل الفكرة…', count: 'حساب الرموز…', generate: 'Generating...', quality: 'Quality Pass…' };
        let phase = 'config';
        try {
          if (!st.cfg) st.cfg = await loadCfg();
          if (!idea.value.trim()) throw Object.assign(new Error('اكتب فكرتك أولاً'), { code: 'EMPTY' });
          if (isRegen) st.variant++; else st.variant = 0;
          phase = 'load'; stage.textContent = mgr.mode() === 'mock' ? 'Mock: تحميل…' : 'Loading model...'; const eng = await mgr.ensure();
          phase = 'generate'; mgr.setGenerating(true);
          const r = await A.run({ engine: eng, instr: st.cfg.instr, presets: st.cfg.presets, type: st.type, presetId: st.presetId, idea: idea.value, variant: st.variant, isCancelled: () => mgr.cancelled, onStage: s => { stage.textContent = stageNames[s] || ''; } });
          if (!st.alive) return;
          if (r.mode === 'local' && mgr.plugin() && mgr.plugin().info) { try { lastDiag = await mgr.plugin().info(); } catch (e) { lastDiag = null; } } else lastDiag = null;
          if (r.kind === 'refused') { resCard.style.display = 'none'; out.warn(r.reason); }
          else if (r.kind === 'clarify') { resCard.style.display = 'none'; out.info('سؤال توضيحي: ' + r.question); idea.focus(); }
          else { st.last = r; resP.value = r.prompt; resN.value = r.negative; drawStats(r); resCard.style.display = ''; if (r.stats && r.stats.truncated) out.warn('قُطع الإخراج عند حد التوليد؛ قد يكون الـPrompt ناقصاً.'); }
        } catch (e) {
          if (!st.alive) return;
          let msg;
          if (e.code === 'CANCELLED') { out.info('Generation cancelled.'); msg = null; }
          else if (e.code === 'EMPTY' || e.code === 'CONTEXT_OVERFLOW') msg = e.message;
          else if (e.code === 'NO_MODEL') msg = 'No local model configured. اختر ملف GGUF من قسم «النموذج» أدناه.';
          else if (e.code === 'UNAVAILABLE') msg = e.message;
          else if (phase === 'load' || LOAD_CODES.includes(e.code) && phase !== 'generate') msg = 'Model load failed: ' + e.message;
          else msg = 'فشل التوليد: ' + (e.message || e);
          if (msg) out.error(msg);
        } finally { mgr.setGenerating(false); st.busy = false; gen.disabled = false; regen.disabled = false; cancelBtn.style.display = 'none'; stage.textContent = ''; }
      }

      /* ───── بطاقة النموذج (Model Manager) ───── */
      const stBadge = h('span', { class: 'badge' }), modeBadge = h('span', { class: 'badge b-partial' }); const modelInfo = h('div'); const modelOut = ui.out(); const fileInfoBox = h('div');
      const pathIn = ui.input({ placeholder: '/storage/emulated/0/Android/data/<app>/files/models/Qwen3-0.6B-Q8_0.gguf', dir: 'ltr', code: true, value: mgr.uri ? '' : mgr.path });
      const preferSel = ui.select([['local', 'Real Local AI (OmniLlm)'], ['mock', 'Mock — اختبار فقط (ليس ذكاءً اصطناعياً)']], mgr.prefer);
      const modelsSel = h('select', { 'aria-label': 'Models folder' });
      const pickBtn = ui.btn('اختيار ملف GGUF', async () => { modelOut.clear(); try { await mgr.pick(); pathIn.value = ''; } catch (e) { if (e.code !== 'CANCELLED') modelOut.error(e.message); } }, { small: true, icon: 'file' });
      const checkBtn = ui.btn('فحص الملف', async () => { modelOut.clear(); mgr.setPath(pathIn.value); await mgr.stat(); }, { small: true, icon: 'search' });
      const loadBtn = ui.btn('تحميل النموذج', async () => { modelOut.clear(); try { await mgr.load(); } catch (e) { modelOut.error(e.code === 'NO_MODEL' ? 'No local model configured' : e.message); } }, { small: true, icon: 'download' });
      const unloadBtn = ui.btn('إلغاء التحميل', () => { modelOut.clear(); mgr.reset(); }, { small: true, icon: 'x' });
      const clearBtn = ui.btn('إزالة النموذج', () => { modelOut.clear(); pathIn.value = ''; mgr.clearSource(); }, { small: true, icon: 'x' });
      let modelsDir = '';
      async function refreshModels() {
        const r = await mgr.listModels(); modelsDir = r.dir || ''; OF.clear(modelsSel); modelsSel.appendChild(h('option', { value: '', text: r.models.length ? '— اختر من مجلد التطبيق —' : '(المجلد فارغ)' }));
        r.models.forEach(m => modelsSel.appendChild(h('option', { value: m.path, text: m.name + ' (' + mb(m.size) + ')' }))); drawModel();
      }
      modelsSel.addEventListener('change', () => { if (modelsSel.value) { modelOut.clear(); const o = mgr.listed && mgr.listed[modelsSel.value]; pathIn.value = modelsSel.value; mgr.setSource({ path: modelsSel.value, name: modelsSel.selectedOptions[0].text.replace(/ \(.*$/, '') }); mgr.stat(); } });
      pathIn.addEventListener('change', () => { if (pathIn.value.trim()) { mgr.setPath(pathIn.value); mgr.stat(); } });
      preferSel.addEventListener('change', () => { modelOut.clear(); mgr.setPrefer(preferSel.value); });
      function drawModel() {
        const state = mgr.state(); stBadge.textContent = mgr.statusText(); stBadge.className = 'badge ' + (STATE_CLS[state] || 'b-partial');
        const mode = mgr.mode(); modeBadge.textContent = 'Mode: ' + (MODE[mode] || mode); modeBadge.className = 'badge ' + (mode === 'local' ? 'b-ready' : mode === 'mock' ? 'b-partial' : 'b-unavailable');
        statusLine.textContent = mgr.statusText(); statusLine.className = 'badge ' + (STATE_CLS[state] || 'b-partial'); mockBanner.style.display = mode === 'mock' ? '' : 'none';
        const i = mgr.info(); const fi = mgr.fileInfo; const ready = mgr.status === 'ready';
        OF.clear(modelInfo); modelInfo.appendChild(ui.kv([['Model', mgr.hasModel() ? mgr.label() : (mgr.profile.name + ' — الافتراضي الموصى به')], ['Source', mgr.uri ? 'منتقي الملفات: ' + (mgr.fileName || mgr.uri) : (mgr.path || 'No local model configured')],
          ['File', !mgr.hasModel() ? '—' : fi ? (fi.unknown ? NA : fi.exists ? 'موجود — ' + mb(fi.size) + (fi.gguf === false ? ' (⚠ ليس GGUF)' : '') : 'غير موجود' + (fi.error ? ' (' + fi.error + ')' : '')) : 'لم يُفحص بعد'],
          ['Format', mgr.profile.format.toUpperCase()], ['Model loaded', ready ? 'Yes' : 'No'], ['Context size', ready ? (i.ctx ? i.ctx + (i.simulated ? ' (مُحاكى)' : '') : NA) : 'يظهر بعد التحميل'], ['Model size', ready && mode === 'local' ? mb(i.modelSize) : NA],
          ['Runtime', mgr.pluginInfo && mgr.pluginInfo.runtime ? mgr.pluginInfo.runtime : NA], ['Models folder', (mgr.pluginInfo && mgr.pluginInfo.modelsDir) || modelsDir || NA]]));
        const hasP = !!mgr.plugin() && mode !== 'unavailable'; pickBtn.disabled = !hasP || mode === 'mock'; checkBtn.disabled = !hasP && mode !== 'mock';
        loadBtn.disabled = mgr.status === 'loading' || mgr.status === 'ready' || mode === 'unavailable' || (mode === 'local' && !mgr.hasModel()); unloadBtn.disabled = mgr.status === 'idle' || mgr.status === 'loading'; clearBtn.disabled = !mgr.hasModel();
        if (mgr.status === 'error' && mgr.error && !modelOut.textContent.trim()) modelOut.error('Model load failed: ' + mgr.error.message);
        if (mode === 'unavailable' && !modelOut.textContent.trim()) modelOut.error('OmniLlm unavailable' + (mgr.unavailableReason() ? ': ' + mgr.unavailableReason() : '') + '. هذا البناء لا يحوي المحرك المحلي. لن يُستخدم Mock تلقائياً — يمكنك اختياره صراحةً للاختبار.');
      }
      const unsub = mgr.on(drawModel);
      const modelCard = h('details', { class: 'limits', open: true }, h('summary', { text: 'النموذج (Model Manager)' }),
        h('div', { style: { padding: '0 12px 12px' } },
          h('div', { class: 'row', style: { marginBottom: '8px' } }, modeBadge, stBadge), modelInfo,
          h('div', { class: 'msg warn' }, OF.icon('info'), h('span', { text: 'ملف النموذج (.gguf) خارجي: لا يُضمَّن في التطبيق ولا يُنزَّل تلقائياً. اختر الملف بزر «اختيار ملف GGUF» أو ضعه في مجلد النموذج الخاص بالتطبيق (adb push).' })),
          ui.field('الوضع', preferSel, 'Real Local AI هو الوضع الحقيقي. Mock للاختبار فقط ولا يُفعَّل تلقائياً.'),
          ui.row(pickBtn, clearBtn), ui.field('مجلد النماذج (Models folder)', modelsSel),
          ui.field('أو مسار ملف GGUF يدوياً', pathIn, 'Qwen3-0.6B-GGUF هو الافتراضي الموصى به. لا يُنزَّل النموذج من هنا.'), ui.row(checkBtn),
          ui.row(loadBtn, unloadBtn), modelOut));

      /* ───── تشخيص النموذج (اختياري) ───── */
      const diagOut = ui.out(); const diagTable = h('div'); let diagStop = false, diagRunning = false;
      const diagBtn = ui.btn('ابدأ التشخيص', async () => {
        if (diagRunning) return; diagRunning = true; diagStop = false; diagBtn.disabled = true; diagStopBtn.style.display = ''; diagOut.clear(); OF.clear(diagTable);
        try {
          if (!st.cfg) st.cfg = await loadCfg(); const eng = await mgr.ensure(); const plan = A.diagnosticsPlan(st.cfg.instr, st.type);
          if (eng.kind === 'mock') diagOut.warn('Mock: النتائج محاكاة ولا تقيس أداء الجهاز. التشخيص الحقيقي يتطلب محركاً محلياً.');
          const rows = [];
          for (const p of plan) {
            if (diagStop) { diagOut.warn('أوقفت التشخيص'); break; }
            const row = { size: p.size, chars: p.chars }; const info = eng.info();
            try { const r = await A.run({ engine: eng, instr: st.cfg.instr, presets: st.cfg.presets, type: st.type, presetId: st.presetId, idea: 'A lone knight faces a dragon during a storm', systemOverride: p.system, maxTokens: 256 });
              row.ptok = r.stats && r.stats.promptTokens; row.gtok = r.stats && r.stats.generatedTokens; row.ms = r.stats && r.stats.ms; row.ctxPct = info.ctx && row.ptok != null ? Math.round(((row.ptok + (row.gtok || 0)) / info.ctx) * 100) : null;
              row.rep = Math.round(A.repetition(r.prompt || r.raw || '') * 100); row.fail = r.kind === 'prompt' ? (r.stats.truncated ? 'مقطوع' : '') : r.kind === 'refused' ? 'رُفض' : 'سؤال'; row.resp = (r.prompt || r.reason || r.question || '').slice(0, 80);
            } catch (e) { row.fail = e.code === 'CONTEXT_OVERFLOW' ? 'تجاوز السياق' : 'فشل: ' + e.message; }
            rows.push(row); drawDiag(rows);
          }
          if (!diagStop) diagOut.ok('انتهى التشخيص (' + rows.length + ' حجم). الأحجام عيّنات بالحروف وليست حدوداً؛ المرجع الأساسي هو Tokens.');
        } catch (e) { diagOut.error(e.message); } finally { diagRunning = false; diagBtn.disabled = false; diagStopBtn.style.display = 'none'; }
      }, { small: true, icon: 'play' });
      const diagStopBtn = ui.btn('إيقاف', () => { diagStop = true; }, { small: true, kind: 'danger', icon: 'x' }); diagStopBtn.style.display = 'none';
      function drawDiag(rows) {
        OF.clear(diagTable);
        diagTable.appendChild(h('div', { style: { overflowX: 'auto', maxWidth: '100%' } }, h('table', { class: 'kv' }, h('tbody', null,
          h('tr', null, ['حروف', 'Tokens (إدخال)', 'Tokens (إخراج)', 'سياق %', 'ms', 'تكرار %', 'ملاحظة'].map(x => h('th', { text: x }))),
          rows.map(r => h('tr', null, [r.size + ' (≈' + r.chars + ')', fmtN(r.ptok), fmtN(r.gtok), r.ctxPct == null ? '—' : r.ctxPct, fmtN(r.ms), fmtN(r.rep), r.fail || 'ok'].map(x => h('td', { text: String(x) }))))))));
        const last = rows[rows.length - 1]; if (last && last.resp) diagTable.appendChild(h('div', { class: 'muted small', dir: 'auto', text: 'آخر استجابة: ' + last.resp }));
      }
      const diagCard = h('details', { class: 'limits' }, h('summary', { text: 'تشخيص النموذج (اختياري)' }),
        h('div', { style: { padding: '0 12px 12px' } }, h('p', { class: 'muted small', text: 'يختبر تعليمات بأحجام متدرجة (500 … 5000 حرف) ويقيس Tokens والسياق والزمن والتكرار والقطع. ليس شرطاً لتشغيل الأداة.' }), ui.row(diagBtn, diagStopBtn), diagOut, diagTable));

      const statusLine = h('span', { class: 'badge', role: 'status', 'aria-live': 'polite', 'data-testid': 'model-status' });
      const mockBanner = h('div', { class: 'msg warn' }, OF.icon('info'), h('span', { text: 'MOCK MODE — وضع اختبار: النتائج من قوالب وليست ذكاءً اصطناعياً.' }));
      box.append(
        ui.card('', h('div', { style: { marginBottom: '8px' } }, statusLine), mockBanner, ui.field('النوع', chips), ui.field('Preset', presetSel), ui.field('فكرتك', idea), ui.row(gen, cancelBtn), stage), out, resCard, modelCard, diagCard);
      drawChips(); drawPresets(); drawModel();
      mgr.probe().then(() => { if (st.alive) { drawModel(); if (mgr.hasModel() && !mgr.fileInfo) mgr.stat(); refreshModels(); } });
      loadCfg().then(c => { if (!st.alive) return; st.cfg = c; drawPresets(); }).catch(e => { if (st.alive) out.error('تعذّر تحميل إعدادات Prompt Forge: ' + e.message); });
      return () => { st.alive = false; unsub(); if (mgr.generating || st.busy) mgr.cancel(); mgr.reset(); };
    },
  };
})();
