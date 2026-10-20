# Prompt Forge

أداة داخل OMNIFORGE (`#/tools/prompt-forge`، فئة «النصوص والكتابة») تحوّل فكرة المستخدم إلى Prompt جاهز لمولّدات **الصور** أو **الفيديو**. لا تولّد صوراً ولا فيديو.

```
فكرة → تحليل (+ فحص سلامة مسبق) → بناء التعليمات → المحرك → تحليل الناتج → Quality Pass → Prompt نهائي (+ Negative)
```

## الحالة الصادقة
| الجزء | الحالة |
|---|---|
| الواجهة، الـPresets، التعليمات، خط الأنابيب، Quality Pass، فحص السلامة، حساب السياق، التشخيص | منفَّذ ومُختبَر (Node + Chromium) |
| وضع **Mock** | منفَّذ: قوالب وPresets **بلا ذكاء اصطناعي**، يُعرض دائماً «Mode: Mock» وأرقام Tokens/السياق فيه تقديرية/مُحاكاة |
| وضع **Local AI** (Qwen3-0.6B-GGUF عبر llama.cpp) | **غير مدمج**: لا يوجد بلاجن `OmniLlm` في المشروع. المحوّل `LocalEngine` مكتوب على العقد أدناه ومُختبَر **ببلاجن مُحاكى فقط**. لم يُجرَّب أي استدلال حقيقي ولا أي نموذج |
لذلك صُنّفت الأداة `partial`.

## الملفات
| المسار | الدور |
|---|---|
| `omniforge-src/js/tools/promptforge.js` | الواجهة (سجّل في `OF.tools['prompt-forge']`) |
| `omniforge-src/js/prompt-forge/logic.js` | منطق نقي: `composeSystem`، `parseOutput`، `qualityPass`، `safetyPrecheck`، `estimateTokens`، `contextBudget`، `run`، `diagnosticsPlan` |
| `omniforge-src/js/prompt-forge/model.js` | `ModelManager` + `MockEngine` + `LocalEngine` + `PROFILES` |
| `omniforge-src/config/prompt-forge/ai-instructions.json` | تعليمات النموذج (مستقلة، Model-agnostic) |
| `omniforge-src/config/prompt-forge/presets.json` | Presets صورة (8) وفيديو (5) كتعليمات مساعدة |
| `tests/promptforge.test.js` | 33 اختباراً (Node) |
| `tests/promptforge-ui.test.js` | 19 سيناريو (Chromium، 390px) |
الإعدادات تحت `omniforge-src/` لأن التطبيق ساكن ويُحمَّل من داخل `omniforge.zip` (`fetch('config/prompt-forge/…')`). عدّلها وأعد بناء الـzip.

## النموذج (Model Manager)
- الافتراضي الموصى به: **Qwen3-0.6B-GGUF** (`PROFILES[0]`، قالب `chatml`، `noThink` يضيف `/no_think` لمنع وسم `<think>`؛ وأي `<think>` في الناتج يُحذف).
- ملف GGUF **خارجي دائماً**: لا يُضمَّن في APK ولا الـzip ولا يُنزَّل أثناء البناء (يوجد اختبار يفشل إن وُجد ملف `.gguf` في المشروع). المستخدم يحدد مساره.
- الحالة: `idle | loading | ready | error`. الوضع: `Mock | Local AI | Local AI (غير متاح)`. اختيار «Local AI» دون بلاجن يُظهر خطأً صريحاً ولا يتحوّل تلقائياً إلى Mock.
- إضافة نموذج/صيغة لاحقاً: عنصر جديد في `PROFILES` (أو محرك جديد بنفس واجهة Engine) دون لمس المنطق أو الواجهة. لا Marketplace.

## عقد بلاجن `OmniLlm` (للمرحلة القادمة)
`Capacitor.Plugins.OmniLlm`:
- `load({path})` → `{ctx, name?}` · `unload()` · `cancel()`
- `tokenize({text})` → `{count}` (عدّ حقيقي بـtokenizer النموذج)
- `generate({system, user, template, maxTokens, temperature})` → `{text, promptTokens, generatedTokens, truncated, ms?}`
عند وجود `tokenize` تُعرض الأرقام «دقيقة»، وإلا تُوسَم «تقدير تقريبي».

**التكامل الأصلي المقترح (لم يُنفَّذ):** بلاجن Kotlin جديد `plugins/omni-llm/` يغلّف llama.cpp عبر JNI + CMake (`externalNativeBuild`) بنفس نمط بلاجنات المشروع (`capacitor.android.src`). لم يُضَف الآن لأنه يتطلب NDK ومصدر llama.cpp وبناءً أصلياً (arm64-v8a) لم يُجرَّب في Actions، وأي خطأ فيه يكسر بناء APK كله بينما بلاجنات Kotlin الحالية نفسها لم تُجمَّع بعد على جهاز. يوصى بإضافته في مرحلة مستقلة بعد نجاح بناء Actions الحالي، ثم اختبار Qwen3-0.6B على جهاز حقيقي.

## Tokens والسياق
- لا حد حروف اعتباطياً. قبل التوليد: `Tokens(الإدخال) + الحجز للتوليد (512) ≤ نافذة السياق` وإلا `CONTEXT_OVERFLOW` برسالة بالأرقام، دون توليد.
- يعرض: Characters، Tokens (إدخال/إخراج)، Context Used، Context Available، الزمن.
- نافذة Mock = 4096 **مُحاكاة** ولا تمثل نموذجاً أو جهازاً.

## تشخيص النموذج (اختياري)
قسم قابل للطي يختبر تعليمات بأحجام 500/1000/1500/2000/3000/5000 حرف (عيّنات لا حدود) ويقيس Tokens الإدخال/الإخراج، نسبة السياق، الزمن، التكرار (ثلاثيات كلمات)، القطع/الفشل، ومقتطف الاستجابة. على Mock يُعلن أن النتائج محاكاة. ليس شرطاً لتشغيل الأداة.

## السلامة
- السياسة الكاملة في `ai-instructions.json → safety_policy` وتُرسل للنموذج؛ الحكم السياقي له.
- فحص مسبق **ضيّق عمداً** في `logic.js` (يعمل في Mock أيضاً): لا يحجب كلمات مفردة (blood/weapon/horror/violence)، بل اجتماع مؤشرين: قاصر+جنسي، deepfake+جنسي/شخص حقيقي، شخص حقيقي+جنسي، «كيف أصنع»+متفجرات/سموم، اختراق+حساب/كلمة سر، ملاحقة/ابتزاز+شخص حقيقي. هو شبكة أمان بسيطة وليس بديلاً عن حكم النموذج، وقد يفوته صياغات أخرى.

## حدود معروفة
- Mock لا يترجم الفكرة ولا يبتكر تفاصيل؛ يضيف facets من الـPreset ومؤشرات بسيطة (ليل، مطر، ضباب…).
- `/no_think` وقالب `chatml` مبنيان على المعروف عن Qwen3 ولم يُجرَّبا على نموذج فعلي هنا.
- حجم التعليمات الحالية ≈ 860 رمزاً (تقدير) للصورة؛ استخدم التشخيص على الجهاز لتقليصها لنموذج بحجم 0.6B.
