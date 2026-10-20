# OMNIFORGE — دليل المشروع

صندوق أدوات عربي (RTL) يعمل دون إنترنت، مبني كصفحة ويب ساكنة (بلا bundler) لتُعبَّأ عبر APKMaker 2.0.

## بنية التسليم
| المسار | المحتوى |
|---|---|
| `webapp/omniforge.zip` | التطبيق (`index.html` في جذر الأرشيف + `css/ js/ libs/`)، بلا `package.json` فيُعامَل كمشروع ساكن |
| `plugins/omni-save/` | بلاجن Kotlin للحفظ في التنزيلات وتنزيل بتقدم وطلبات HTTP أصلية، و`saveFromPath` لنقل ملف مؤقت من omni-video |
| `plugins/omni-video/` | بلاجن Kotlin لمحرك استخراج الفيديو (yt-dlp عبر youtubedl-android + FFmpeg) — **لم يُجمَّع ولم يُختبر على أندرويد بعد** |
| `plugins/omni-native/` | بلاجن Kotlin: تنزيل قابل للاستئناف (Range)، فحص TCP/DNS، مساحة التخزين، اختيار/مسح مجلد (SAF)، نقل الملفات إلى مجلد العمل، **توقيع APK والتحقق منه (apksig 8.7.3)** — **لم يُجمَّع مقابل المكتبات الحقيقية ولم يُختبر على جهاز** |
| `plugins/omni-media/` | بلاجن Kotlin يشغّل FFmpeg المضمّن (نفس ثنائي omni-video، بلا مكتبة إضافية) لقص/تحويل/ضغط/دمج MP4 بتحقق صارم من الوسائط (`FfArgs`) — **لم يُجرَّب على جهاز** |
| `plugins/omni-ocr/` | بلاجن Kotlin لـ OCR عربي/إنجليزي بـ Tesseract4Android 4.9.0 (**من JitPack**؛ إن تعذّر حلّها فاحذف المجلد). النماذج tessdata_fast تُنزَّل في `hooks/pre-build.sh` إلى `assets_inject/tessdata` — **لم يُجمَّع ولم يُجرَّب** |
| `native/android/app/build.gradle` | `abiFilters` (arm64-v8a, armeabi-v7a) + `useLegacyPackaging` لمحرك الفيديو |
| `hooks/` | `pre-build.sh` يرفع minSdk إلى 24 وينزّل نماذج OCR (غير حرج)؛ `post-build.sh` يسجّل حجم APK لكل معمارية |
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

## الحالات (44 أداة)
- **ready (30)**: pdf-workshop, archive-manager (ZIP/TAR/TGZ + ZIP مشفّر ZipCrypto), mhtml-workshop, file-audit, file-split-join, image-workshop, color-studio, svg-workshop, gif-studio (مع تفكيك GIF), subtitle-workshop (SRT/VTT/ASS), text-workshop, text-diff, encoder-studio, markdown-workshop, snippets, data-workshop (مع TOML), table-workshop, regex-lab, test-data, jwt-inspector, url-workshop, html-playground, secure-generator, hash-studio, metadata-cleaner, encryptor, unit-converter, datetime-workshop, calculator, code-formatter (CSS/HTML/JSON/JS)
- **partial (12)**: video-link-downloader, video-workshop (MP4 عبر FFmpeg داخل APK + WebM في المتصفح), audio-workshop (WAV فقط), apk-workshop (تعديل مانيفست تجريبي + توقيع apksig), ocr-extractor (صور فقط، APK فقط), api-lab, network-tools (TCP/DNS محلي داخل APK), downloader (استئناف داخل APK), storage-analyzer (مسح مجلد أصلي داخل APK), redactor, qr-studio, font-inspector
- **requires-service (0)**
- **unavailable (2)**: doc-converter, speech-tools (مؤجَّلان عمداً — راجع «ما أُجِّل عمداً»)
- كل أداة `partial` تعتمد على جزء أصلي **لم يُجرَّب على جهاز**؛ لذلك لم تُوسَم `ready` مهما اجتازت اختبارات المحاكاة.

## ما أُجِّل عمداً (الفائدة العملية وحجم التطبيق أهم من نسبة الاكتمال)
| الأداة/الميزة | السبب |
|---|---|
| speech-tools (STT/TTS) | Whisper/Vosk بنماذج عشرات الميغابايتات أو خدمة سحابية؛ طُلب عدم تضمينها |
| doc-converter | محرك مستندات بمئات الميغابايتات أو خدمة خارجية |
| تصدير MP3/AAC في audio-workshop | يُغطّى بتبويب التحويل في ورشة الفيديو (M4A/MP3 عبر FFmpeg المضمّن إن توفّر libmp3lame) |
| قراءة QR بالكاميرا / باركود خطي | ML Kit/ZXing بحجم إضافي لفائدة محدودة |
| ضغط PDF وPDF المشفّر وOCR لـ PDF | محرك صور/فك تشفير كبير |
| WOFF2 (قراءة الجداول) | Brotli + تحويل glyf؛ فائدة قليلة |
| «حفظ الصفحة كاملة بمواردها» في downloader | تُرك لعدم وضوح جدواه مقابل تعقيد إعادة كتابة الروابط |
| تنزيل في الخلفية بعد إغلاق التطبيق | يحتاج Foreground Service |

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
- كل كود Kotlin (omni-save, omni-video, omni-native, omni-media, omni-ocr) جُمّع هنا **مقابل مجسّمات** (`tests/kt`) للتحقق من الأنواع فقط؛ أول تجميع حقيقي في GitHub Actions وقد يحتاج إصلاحاً. **لم يُجرَّب أي جزء أصلي على جهاز أندرويد.**
- ما اختُبر فعلاً على JVM (`tests/kt/run_jvm.sh`، 57 حالة): تنزيل مستأنَف مقابل خادم Range حقيقي، TCP/DNS، محاذاة ZIP (يقبلها `unzip`)، ومدقّق وسائط FFmpeg + مشغّل العمليات مقابل **ffmpeg حقيقي** (أوامر `ffcmd.js` تُنفَّذ، وأوامر خبيثة تُرفض، والإلغاء والتقدّم).
- غير مُتحقَّق منه: apksig الحقيقي (توقيع/تحقق)، SAF، مسار ثنائي FFmpeg في APK (`nativeLibraryDir/libffmpeg.so` + `LD_LIBRARY_PATH` مبنيان على بنية youtubedl-android)، توفّر libx264/libmp3lame فيه (يُكتشف وقت التشغيل)، Tesseract ونماذجه، وحلّ تبعية JitPack.
- تعديل AXML تجريبي: تحقّق منه مدقّق بنيوي مستقل لا APK حقيقية؛ جرّب الحزمة المعدّلة على جهازك.
- مفتاح التوقيع يُخزَّن في تخزين التطبيق الخاص دون تشفير؛ احتفظ بنسخة احتياطية.
- فك `resources.arsc` وSmali وتغيير اسم الحزمة غير مدعومة. لا يتجاوز التطبيق DRM أو الحماية.

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

## الاختبارات (تشغيل)
- Node: `node tests/<name>.test.js` لـ toml, tar, zipcrypto, gifdec, ffcmd, axml (يحتاج python3)، x509 (يحتاج openssl/java)، jsfmt, video-core.
- Chromium (خادم ساكن على 8765 لمجلد التطبيق، `BASE` لتغييره): `small-ui`, `video-ui`, `apk-ui`, `video-ff-ui`, `ocr-ui`, `native-ui` — البلاجنات الأصلية مُحاكاة (تتحقق من الاستدعاءات والواجهة فقط).
- JVM/Kotlin: `node tests/kt/gen_ff_cases.js && tests/kt/run_jvm.sh` (يتطلب ffmpeg على المضيف وGradle lib لمترجم Kotlin).

## الأدوات الأصلية الجديدة (ملخص التدفق)
- **توقيع APK**: JS يعيد بناء الحزمة (محاذاة 4 بايت/4096 لـ .so) ← `OF.nat.stage` (دفعات 3MB) ← `signApk` (ZipAlign 16KB لـ .so ثم apksig v1/v2/v3) ← `verifyApk` ← `saveFromPath`. المفتاح/الشهادة من `js/x509.js` (RSA-2048، PKCS#8 + X.509).
- **MP4**: `js/ffcmd.js` يبني الأوامر ← `OmniMedia.run` يتحقق (قائمة بيضاء للخيارات والمرشّحات، ملفات داخل `cacheDir/omni-work` فقط، قائمة concat تُكتب أصلياً) ← تقدّم عبر `mediaProgress` ← `saveFromPath`.
- **OCR**: JS يصغّر الصورة (≤2400px، JPEG، رمادي اختيارياً) ← stage ← `OmniOcr.recognize` (ara/eng، يُنسخ tessdata من assets عند أول استخدام).
