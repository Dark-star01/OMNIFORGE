# Prompt Forge

أداة داخل OMNIFORGE (`#/tools/prompt-forge`، فئة «النصوص والكتابة») تحوّل فكرة المستخدم إلى Prompt جاهز لمولّدات **الصور** أو **الفيديو**. لا تولّد صوراً ولا فيديو.

```
فكرة → Prompt Parser (+ فحص سلامة مسبق) → ai-instructions.json + Preset → OmniLlm → تحليل الناتج → Quality Pass → Prompt نهائي (+ Negative)
```

## الحالة الصادقة
| الجزء | الحالة |
|---|---|
| الواجهة، Presets، التعليمات، خط الأنابيب، Quality Pass، فحص السلامة، السياق، التشخيص | منفَّذ ومُختبَر (Node + Chromium) |
| بلاجن **`omni-llm`** (C++/JNI فوق llama.cpp **v0.7.0** + Kotlin/Capacitor) | **مكتوب ومُختبَر على Linux ضد llama.cpp الحقيقي**: تحميل GGUF، tokenize، توليد، Cancel، تحرير، OOM، ASan/LSan، وجسر JNI عبر JVM |
| بناء APK بالبلاجن (NDK/CMake/Gradle) | **لم يُنفَّذ بعد**: بيئة التطوير بلا Android SDK/NDK. الـworkflow محدَّث لكنه لم يُشغَّل |
| استدلال بـ **Qwen3-0.6B-GGUF الحقيقي** | **لم يُجرَّب**: لا يتوفر الملف في بيئة التطوير (Hugging Face محجوب). الاختبارات استخدمت نموذج `qwen3` صغيراً **بأوزان عشوائية** يُولَّد محلياً (نفس معمارية ومفردات وقالب Qwen) فهي تثبت صحة الآلية لا جودة الناتج ولا سرعة الجهاز |
| وضع **Mock** | وضع اختبار **صريح فقط**. لا يُفعَّل تلقائياً أبداً |
لذلك تبقى الأداة `partial` في السجل إلى أن يُبنى APK ويُجرَّب Qwen3 على جهاز (انظر «كيف تختبر»).

## الملفات
| المسار | الدور |
|---|---|
| `omniforge-src/js/tools/promptforge.js` | الواجهة (`OF.tools['prompt-forge']`) |
| `omniforge-src/js/prompt-forge/logic.js` | منطق نقي: `composeSystem`، `parseOutput`، `qualityPass`، `safetyPrecheck`، `contextBudget`، `run`، `diagnosticsPlan` |
| `omniforge-src/js/prompt-forge/model.js` | `ModelManager` + `LocalEngine` (محوّل OmniLlm) + `MockEngine` + `PROFILES` |
| `omniforge-src/config/prompt-forge/ai-instructions.json` · `presets.json` | تعليمات النموذج وPresets (قابلة للتعديل، ثم أعد بناء الـzip) |
| `plugins/omni-llm/` | البلاجن الأصلي (انظر أدناه) |
| `tests/promptforge.test.js` (48) · `tests/promptforge-ui.test.js` (28) | اختبارات JS |
| `tests/omnillm/` · `tests/kt/jvmtest/OmniLlmJniTest.kt` | اختبارات النواة C++ وجسر JNI |

## الحالات في الواجهة
لا Mock صامت. الوضع الافتراضي «Real Local AI». نص الحالة يظهر أعلى الأداة وفي بطاقة النموذج:
| الحالة | النص |
|---|---|
| لا بلاجن (أو المكتبة الأصلية غير مبنية لهذا الـABI) | `OmniLlm unavailable` (+ السبب) |
| بلاجن بلا ملف نموذج | `No local model configured` |
| جارٍ التحميل | `Loading model...` |
| جاهز | `Qwen3-0.6B — Ready` |
| أثناء التوليد | `Generating...` |
| فشل التحميل | `Model load failed` (+ الرسالة، مثل `Insufficient memory to load this model.`) |
| Mock (اختيار صريح) | `Mock mode — testing only (not AI)` + بانر MOCK MODE في الأداة وفي كل نتيجة |
إلغاء التوليد/التحميل: زر «إلغاء». مغادرة الأداة تلغي ما يجري وتحرر النموذج.

## بنية OmniLlm
```
JS  model.js (LocalEngine) ──Capacitor──▶ OmniLlmPlugin.kt ──JNI (byte[] UTF-8 + JSON)──▶ omnillm_jni.cpp ──▶ omnillm_core.cpp ──▶ llama.cpp (libllama/libggml)
```
- **`omnillm_core.cpp`**: لا يعرف JNI ولا Android (يُجمَّع على Linux للاختبار). تحميل GGUF بـmmap، سياق واحد، `tokenize` الحقيقي، توليد بسلسلة samplers (penalties→top-k→top-p→temp→dist، أو greedy عند الحرارة 0)، Cancel عبر علم ذري + `abort_callback` + `progress_callback` (يقطع التحميل والـprompt eval والتوليد)، **إعادة استخدام KV** لبادئة الـprompt المشتركة (الـsystem نفسه عبر Regenerate/أفكار مختلفة فلا يُعاد حسابه)، وكل الأخطاء كنتائج (لا استثناء يعبر JNI).
- **`omnillm_jni.cpp`**: كل النصوص `byte[]` UTF-8 قياسي (وليس modified-UTF-8 الذي يفسد الإيموجي/NUL)، والنتائج JSON مُهرَّب ومُنقَّى من UTF-8 غير الصالح.
- **`OmniLlmPlugin.kt`**: ثلاثة خيوط: `worker` (load/tokenize/generate متسلسلة)، `control` (unload يقاطع التوليد)، `light` (info/stat/listModels لا تنتظر). `cancel` ينفَّذ فوراً من خيط الإضافة. يسجّل `ComponentCallbacks2`: عند ضغط ذاكرة حرج أو دخول التطبيق للخلفية يحرر النموذج (إن لم يكن هناك توليد) ويرسل الحدث `modelUnloaded`؛ والواجهة تعيد التحميل تلقائياً عند الحاجة.
- إن لم تُحمَّل `libomnillm.so` (جهاز 32-بت مثلاً) يبقى البلاجن موجوداً لكن `info()` يرجع `available:false` مع السبب فتعرض الواجهة `OmniLlm unavailable` بدل التعطل.

### العقد (`Capacitor.Plugins.OmniLlm`)
العقد الأصلي (`load/unload/cancel/tokenize/generate`) محفوظ كما هو. **الإضافات (موثّقة لسبب تقني):**
| الدالة | الوصف |
|---|---|
| `info()` | `{available, ready, loaded, name?, ctx?, modelSize?, memAvailable?, memTotal?, processRss?, runtime, abi, modelsDir, reason?}`؛ ما لا يتوفر يُحذف/`null` فتعرضه الواجهة «Unavailable» |
| `load({path \| uri, nCtx?, nThreads?})` | **أُضيف `uri`**: ملف يُختار عبر منتقي النظام (SAF) يُفتح كـ`/proc/self/fd/N` بلا نسخ 600MB+ ولا إذن تخزين. يعيد استخدام النموذج المحمّل لنفس المصدر. → `{ctx, name, displayName, modelSize, threads, reused}` |
| `generate({system,user,template,maxTokens,temperature, assistantPrefix?, topK?, topP?, minP?, repeatPenalty?, seed?})` | **أُضيفت** `assistantPrefix` (لتعطيل التفكير) ومعاملات sampling. `template`: `chatml` أو `model` (قالب GGUF المضمّن). → `{text, promptTokens, generatedTokens, truncated, ms, cachedTokens, promptMs, genMs, tokensPerSec}` |
| `tokenize({text})` | `{count}` بـtokenizer النموذج الفعلي |
| `pickModel()` · `listModels()` · `stat({path\|uri})` | اختيار الملف، قائمة `*.gguf` في مجلد النماذج الخاص بالتطبيق، وفحص (موجود/مقروء/حجم/اسم/GGUF) |
| `unload()` · `cancel()` | تحرير / إيقاف التوليد أو التحميل |
أكواد الأخطاء: `UNAVAILABLE · FILE_NOT_FOUND · PERMISSION_DENIED · INVALID_MODEL · INSUFFICIENT_MEMORY · LOAD_FAILED · NOT_LOADED · CONTEXT_OVERFLOW · CANCELLED · GENERATE_FAILED · INVALID`.

## النموذج وموقعه
- الافتراضي الموصى به: **Qwen3-0.6B-GGUF** (مثلاً `Qwen3-0.6B-Q8_0.gguf` من `Qwen/Qwen3-0.6B-GGUF`). **خارجي دائماً**: ليس في APK ولا الـzip ولا Git ولا يُنزَّل أثناء البناء (اختبار آلي يفشل إن وُجد `.gguf` في المشروع). لا نظام تنزيل تلقائي.
- طرق تحديده (كلها من بطاقة «النموذج»):
  1. **اختيار ملف GGUF** (منتقي النظام): الأسهل، بلا أذونات.
  2. **مجلد النماذج الخاص بالتطبيق**: `/sdcard/Android/data/<appId>/files/models/` — `adb push Qwen3-0.6B-Q8_0.gguf` إليه (يظهر مساره في البطاقة) ثم اختره من القائمة.
  3. مسار يدوي. على Android 11+ مسارات التخزين العام غير مقروءة بلا إذن خاص، فيُرجع `PERMISSION_DENIED` مع الدلالة على الطريقتين أعلاه.
- يعرض «فحص الملف»: موجود؟ الحجم، الاسم. وبعد التحميل: اسم النموذج من GGUF، السياق، حجم الأوزان.
- **Non-thinking افتراضياً**: يُضاف بعد `<|im_start|>assistant\n` الكتلة `<think>\n\n</think>\n\n` (ما يفعله قالب Qwen3 الرسمي مع `enable_thinking=false`) فلا يستهلك النموذج رموزاً في التفكير. الإعداد في `PROFILES[0]` (`thinkControl`, `assistantPrefix`) وقابل للتعديل. أي `<think>` في الناتج يُحذف ولا يُعرض؛ يظهر Final Prompt فقط. معاملات Qwen3 للوضع غير التفكيري: temperature 0.7، top-k 20، top-p 0.8، repeat 1.05. Regenerate يرفع الحرارة 0.2.

## Tokens والسياق والتشخيص
- لا حد حروف: قبل التوليد `Tokens(الإدخال, بـtokenizer النموذج) + 512 محجوزة ≤ نافذة السياق` وإلا `CONTEXT_OVERFLOW` بالأرقام. السياق الافتراضي 2048 (يكفي: التعليمات ≈ 860 رمزاً) لتقليل ذاكرة KV؛ يُخفَّض تلقائياً عند ضيق الذاكرة ويُعرض الرقم الفعلي.
- التشخيص (في نتيجة كل توليد): Model loaded، Context size، Input/Output tokens، Generation time، Tokens/sec، Prompt cache (رموز أُعيد استخدامها)، Model size، Available memory، Process memory. **أي رقم لا يوفّره الجهاز يظهر «Unavailable»**؛ في Mock تُوسَم الأرقام محاكاة. قسم «تشخيص النموذج» القديم (500…5000 حرف) ما زال متاحاً.

## الذاكرة والأداء
- تحميل عند الحاجة فقط (أول توليد أو زر التحميل)، ومرة واحدة، ويُعاد استخدامه طوال جلسة الأداة؛ يُحرَّر عند مغادرتها، وعند ضغط الذاكرة/الخلفية.
- قبل التحميل: ملف أكبر من الذاكرة المتاحة → `INSUFFICIENT_MEMORY` فوراً. بعده: تقدير (أوزان + KV + ≈192MB) مقابل 92% من المتاحة؛ إن لم يكفِ يُخفَّض السياق (حتى 512) ثم يفشل بـ`Insufficient memory to load this model.` وتُحرَّر الأوزان. فشل `mmap`/تخصيص مخازن الحساب يُصنَّف كذلك (اختُبر بـ`ulimit -v`).
- **حد صريح**: هذه فحوص استباقية. أندرويد يسمح بالـovercommit فقد يقتل `lmkd` العملية دون أي فشل في التخصيص؛ لا يمكن منع ذلك كلياً. وإن استدعى ggml `abort()` داخلياً (خطأ لا يمكن التقاطه) تنتهي العملية. تقلّل الفحوص أعلاه حدوثه لكنها لا تلغيه.

## ABI والبناء
- **المدعوم: `arm64-v8a`** (كل الهواتف الحديثة). `armeabi-v7a` **غير مبني**: llama.cpp نفسه لا يدعمه على أندرويد (لا في مثاله ولا في CI الخاص به)، والـAPK الحالي يضم v7a لبقية الأدوات. على جهاز 32-بت تظهر `OmniLlm unavailable` ولا يتعطل شيء. للمحاكي أضف `x86_64`: `-PomniLlmAbis=arm64-v8a,x86_64`.
- يبني llama.cpp backends ديناميكية بكل متغيرات المعالج (`GGML_BACKEND_DL` + `GGML_CPU_ALL_VARIANTS`) ويختار الأنسب وقت التشغيل؛ تُحمَّل من `nativeLibraryDir` (يعمل لأن التطبيق يستخدم `useLegacyPackaging=true`). `GGML_OPENMP/LLAMAFILE/KLEIDIAI` مُعطَّلة (أقل اعتماداً). STL ساكن (`c++_static`) لتفادي تعارض `libc++_shared.so` مع Tesseract/FFmpeg. محاذاة صفحات 16KB مفعّلة (Android 15+).
- المتطلبات (يثبّتها الـworkflow: خطوة «تجهيز NDK وCMake»): NDK **27.2.12479018**، CMake **3.22.1**، `git` وإنترنت أثناء Gradle (CMake `FetchContent` يجلب `ggml-org/llama.cpp` **عند الوسم `v0.7.0`**؛ غيّر `OMNILLM_LLAMA_REF` بعد اختبار، فواجهة `llama.h` تتغير بين الإصدارات).
- حجم الأثر: الـAPK يحمل المحرك فقط (لا نموذج). **لم يُقَس حجمه** لأن APK لم يُبنَ هنا.

## كيف تختبر
1. **النواة + JNI على Linux** (يعمل هنا): `tests/omnillm/run.sh` (يجلب llama.cpp ويبني ويولّد النموذج الصغير). `ASAN=1 tests/omnillm/run.sh` لـAddressSanitizer+LeakSanitizer. بنموذج حقيقي: `tests/omnillm/real_model_smoke.sh /path/Qwen3-0.6B-Q8_0.gguf`.
2. **JS**: `node tests/promptforge.test.js`؛ ثم خادم ساكن على 8765 لمجلد `omniforge-src` و`PLAYWRIGHT=… node tests/promptforge-ui.test.js`.
3. **على الجهاز (مطلوب لإعلان النجاح)**: شغّل workflow ← ثبّت APK ← انسخ GGUF ← Prompt Forge ← «اختيار ملف GGUF» ← يجب أن تظهر `Qwen3-0.6B — Ready` ثم ولّد صورة/فيديو، وسجّل Tokens/sec والذاكرة من التشخيص، وجرّب Cancel وRegenerate. راقب `adb logcat -s OmniLlm`.
ما اختُبر فعلاً: انظر «الحالة الصادقة». اختبارات Kotlin تُجمَّع مقابل مجسّمات الواجهة فقط (`tests/kt/compile.sh`)؛ منطق `OmniLlmPlugin.kt` (SAF، ComponentCallbacks) لم يُنفَّذ وقت التشغيل.

## إضافة نموذج GGUF آخر
- **ملف آخر للنموذج نفسه** (كم مختلف/Q4): اختره فقط؛ لا تغيير.
- **عائلة أخرى (Llama، Mistral، Qwen أكبر…)** بلا إعادة بناء المنطق: أضف عنصراً في `PROFILES` (`model.js`): `template: 'chatml'` (Qwen) أو `'model'` (قالب GGUF المضمّن، يدعم ما تدعمه `llama_chat_apply_template`)، `noThink/thinkControl/assistantPrefix` إن لزم، `sampling`، `nCtx`، و`match` (regex لاسم الملف لعرضه). النواة لا تحوي أي افتراض خاص بـQwen. إن كانت المعمارية جديدة على llama.cpp v0.7.0 يرجع `INVALID_MODEL: Unsupported model architecture` ولزم رفع `OMNILLM_LLAMA_REF`. لا Marketplace ولا واجهة لاختيار profile بعد (الافتراضي الوحيد حالياً).

## السلامة
السياسة الكاملة في `ai-instructions.json → safety_policy` وتُرسل للنموذج، والحكم السياقي له؛ لم تتغير. فحص مسبق **ضيّق عمداً** في `logic.js` (يعمل قبل أي محرك): لا يحجب كلمات مفردة (blood/weapon/horror/violence)، بل اجتماع مؤشرين: قاصر+جنسي، deepfake+جنسي/شخص حقيقي، شخص حقيقي+جنسي، «كيف أصنع»+متفجرات/سموم، اختراق+حساب، ملاحقة/ابتزاز+شخص حقيقي. هو شبكة أمان وليس بديلاً عن حكم النموذج، وقد يفوته صياغات أخرى؛ **ولم يُقيَّم التزام Qwen3-0.6B بالسياسة** (نموذج صغير) لأن الاستدلال الحقيقي لم يُجرَّب.

## بلا خدمات خارجية
لا OpenAI/Gemini/Claude/HuggingFace API ولا أي اتصال استدلال. النموذج يعمل على الجهاز. (الشبكة مطلوبة وقت **بناء** APK فقط لجلب مصدر llama.cpp.)

## حدود معروفة
- لم يُبنَ APK ولم يُختبر Qwen3-0.6B ولا الأداء على جهاز (انظر أعلاه). أي أرقام سرعة/ذاكرة على Android غير متوفرة بعد.
- أول طلب يعالج الـsystem كاملاً (≈860 رمزاً)؛ الطلبات اللاحقة تعيد استخدام بادئته. أول طلب على هاتف متوسط قد يستغرق عدة ثوانٍ.
- Qwen3-0.6B صغير: جودة الـPrompt والتزامه بصيغة `PROMPT:/NEGATIVE:` غير مضمونين (المحلل يتسامح مع غياب العلامات).
- Cancel وقت الخمول لا يؤثر؛ وCancel الذي يصل قبل بدء استدعاء التوليد الأصلي مباشرةً يعالجه JS (يمنع الاستدعاء)، وثمة نافذة سباق ضيقة جداً بينهما.
- لا بثّ تدريجي للرموز (النتيجة تظهر كاملة).
- Mock لا يترجم الفكرة ولا يبتكر؛ يضيف facets من الـPreset فقط.
