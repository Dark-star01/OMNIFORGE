# OMNIFORGE — دليل المشروع

صندوق أدوات عربي (RTL) يعمل دون إنترنت، مبني كصفحة ويب ساكنة (بلا bundler) لتُعبَّأ عبر APKMaker 2.0.

## بنية التسليم
| المسار | المحتوى |
|---|---|
| `webapp/omniforge.zip` | التطبيق (`index.html` في جذر الأرشيف + `css/ js/ libs/`)، بلا `package.json` فيُعامَل كمشروع ساكن |
| `plugins/omni-save/` | بلاجن Kotlin للحفظ في التنزيلات وتنزيل بتقدم وطلبات HTTP أصلية، و`saveFromPath` لنقل ملف مؤقت من omni-video |
| `plugins/omni-video/` | بلاجن Kotlin لمحرك استخراج الفيديو (yt-dlp عبر youtubedl-android + FFmpeg) — **لم يُجمَّع ولم يُختبر على أندرويد بعد** |
| `native/android/app/build.gradle` | `abiFilters` (arm64-v8a, armeabi-v7a) + `useLegacyPackaging` لمحرك الفيديو |
| `hooks/` | `pre-build.sh` يرفع minSdk إلى 24؛ `post-build.sh` يسجّل حجم APK لكل معمارية |
| `config.json` | اسم التطبيق وهويته وألوان السبلاش |
| `splash/logo.png` | شعار أصلي مرسوم لهذا المشروع |
| `omniforge-src/` | المصدر الذي يُبنى منه الـzip |
| `tests/` | سكربتات الاختبار (Playwright/Python) |

## إضافة أداة جديدة
1. أضف كائناً في `js/registry.js` داخل `OF.reg`:
   `{ id, cat, icon, name, desc, kw, status, file, libs: [], limits: [] }`
   - `status`: `ready | partial | requires-service | unavailable`
   - `file`: اسم الملف داخل `js/tools/` بلا امتداد، `libs`: مسارات ملفات تُحمَّل كسولاً (مثل `libs/jszip.min.js`).
2. في `js/tools/<file>.js` سجّل: `OF.tools['<id>'] = { render(box) { … } };`
3. استخدم `OF.ui` (card, field, btn, files, tabs, task, out, saveRow) و`OF.save` للحفظ.
لا تعديل على الراوتر ولا الصفحة الرئيسية. الأداة ذات الحالة `unavailable` أو `requires-service` تعرض السبب بلا أزرار تنفيذ.

## الحالات
- **ready (29)**: pdf-workshop, archive-manager, mhtml-workshop (أداتك الأصلية), file-audit, file-split-join, image-workshop, color-studio, svg-workshop, gif-studio, subtitle-workshop, text-workshop, text-diff, encoder-studio, markdown-workshop, snippets, data-workshop, table-workshop, regex-lab, test-data, jwt-inspector, url-workshop, html-playground, secure-generator, hash-studio, metadata-cleaner, encryptor, unit-converter, datetime-workshop, calculator
- **partial (12)**: video-link-downloader (يعمل داخل APK فقط؛ محرك yt-dlp)، audio-workshop (WAV فقط), video-workshop (قص بتسجيل WebM فوري)، code-formatter (CSS/HTML/JSON… لا JS)، api-lab / network-tools / downloader (CORS في المتصفح؛ المحرك الأصلي داخل APK)، redactor (نص فقط)، qr-studio (القراءة تعتمد على BarcodeDetector)، apk-workshop، storage-analyzer، font-inspector (WOFF2 معاينة فقط)
- **requires-service (0)**
- **unavailable (3)**: doc-converter, ocr-extractor, speech-tools

## المكتبات الخارجية (نسخ محلية، لا CDN)
| المكتبة | الحجم | السبب |
|---|---|---|
| pdf-lib 1.17.1 | 525 KB | دمج/تقسيم/تعديل PDF وتنظيفه |
| JSZip 3.10.1 | 98 KB | قراءة/كتابة ZIP |
| js-yaml 3.15.1 | 42 KB | YAML (safeLoad فقط) |
| marked | 44 KB | معاينة Markdown |
| DOMPurify | 29 KB | تعقيم HTML الناتج |
كل ما عداها مكتوب داخلياً: QR، GIF، AXML، قارئ/كاتب ZIP خام مع zipalign، محلل MHTML، منظّفات JPEG/PNG/PDF، محلل التعابير (بلا eval).

## صيغة التشفير `.omnienc`
`"OMNI" | ver(1) | kdf(1) | iterations u32 | salt 16 | iv 12 | AES-256-GCM(ciphertext+tag)`؛ الترويسة (26 بايت) تُمرَّر AAD؛ المحتوى `u16 nameLen + name + data`؛ المفتاح PBKDF2-SHA256 بـ 600000 تكرار. لا استعادة لكلمة المرور.

## حدود صريحة
- **توقيع APK** غير منفَّذ (يحتاج apksig أصلياً)؛ ناتج ورشة APK **غير موقّع**.
- فك `resources.arsc` وتعديل المانيفست الثنائي وSmali غير مدعومة.
- بلاجن `omni-save` لم يُجمَّع هنا (لا Kotlin/Android SDK)؛ أول تجميع في GitHub Actions، وقد يحتاج إصلاحاً.
- الأدوات بلا نسخة ويب كاملة: تحويل المستندات، OCR، الصوت إلى نص — موسومة `unavailable`.
- لا يتجاوز التطبيق DRM أو الحماية.

## نتائج الاختبار (بيئة Chromium/Playwright)
نُفِّذت داخل بيئة التطوير؛ لم يُختبر شيء على جهاز أندرويد.
- فتح كل الأدوات الـ44 على عرض 390px: بلا أخطاء كونسول ولا تمرير أفقي.
- محقَّق بمخرجات تُفحص خارجياً: QR (160 توليفة إصدار/مستوى بقارئ OpenCV)، GIF (Pillow)، دمج/استخراج/تحويل PDF (pypdf)، ZIP (`unzip -t`/zipfile)، المقاطع الصوتية والفيديو (ffprobe/ffmpeg)، تنظيف EXIF/PNG/PDF، تقسيم ثم دمج ملف (SHA-256 متطابق)، قراءة خطوط TTF/WOFF، AXML بنمطي UTF-16/UTF-8 (ملفات اختبار مولَّدة، **لا APK حقيقي**)، إعادة كتابة ZIP بمحاذاة 4 بايت.
- فُتحت دون اختبار وظيفي معمّق: text-workshop, encoder-studio, markdown-workshop, data-workshop, table-workshop, test-data, html-playground, snippets, redactor, svg/color/subtitle (واجهات)، calculator (واجهة).
- أخطاء وُجدت وأُصلحت أثناء الاختبار: قراءة نوع قيم AXML، صياغة CSS المضغوط، قوس زائد في images.js.

## أداة «تنزيل فيديو من رابط» (محرك yt-dlp المحلي)
التدفق: `js/tools/videolink.js` (واجهة) ← `js/video-core.js` (`OF.video`: extract/buildOptions/download/queue/classifyError) ← بلاجن `OmniVideo` (Kotlin، yt-dlp) ← `OmniSave.saveFromPath` (الحفظ في التنزيلات/OMNIFORGE).
- الروابط المباشرة (.mp4 وغيرها) لا تمر بالمحرك: `OmniSave.download` مباشرة.
- استبدال المحرك: adapter جديد (`OF.video.useAdapter`) + بلاجن بنفس واجهة `extract/download/cancel`، بلا لمس الواجهة. تحديث yt-dlp نفسه من داخل الأداة (`updateEngine`).
- الترخيص: youtubedl-android بـ GPL-3.0 — راجع plugins/omni-video/README.md.
- الاختبارات: `node tests/video-core.test.js` (وحدة، 75 حالة) و`node tests/video-ui.test.js` (Chromium بمحرك وهمي، 27 سيناريو). **لا تغطي Kotlin ولا yt-dlp ولا أندرويد.**
