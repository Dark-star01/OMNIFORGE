/* سجل الأدوات المركزي (Tool Registry)
 * لإضافة أداة جديدة:
 *   1) أضف كائناً هنا (id, cat, icon, name, desc, kw, status, file, libs, limits).
 *   2) في ملف js/tools/<file>.js سجّل:  OF.tools['<id>'] = { render(box) { ... } };
 *   لا حاجة لتعديل الراوتر أو الصفحة الرئيسية — يقرآن من هذا السجل.
 * status: ready | partial | requires-service | unavailable
 * limits: قائمة نصية تظهر للمستخدم تحت «القدرات والحدود».
 */
(function () {
  'use strict';
  const L = (n) => 'libs/' + n;
  OF.cats = [
    { id: 'files', name: 'الملفات والمستندات', icon: 'file' },
    { id: 'images', name: 'الصور والتصميم', icon: 'image' },
    { id: 'media', name: 'الصوت والفيديو', icon: 'video' },
    { id: 'text', name: 'النصوص والكتابة', icon: 'text' },
    { id: 'dev', name: 'البيانات والمطورون', icon: 'code' },
    { id: 'web', name: 'الويب والشبكة', icon: 'globe' },
    { id: 'security', name: 'الأمان والخصوصية', icon: 'shield' },
    { id: 'daily', name: 'الأدوات اليومية', icon: 'calc' },
    { id: 'special', name: 'متخصصة', icon: 'apk' },
  ];

  OF.reg = [
    /* ───── الملفات ───── */
    { id: 'pdf-workshop', cat: 'files', icon: 'pdf', name: 'ورشة PDF', desc: 'دمج وتقسيم واستخراج وتدوير وترتيب صفحات PDF، وتحويل الصور إلى PDF', kw: 'pdf دمج تقسيم صفحات تدوير استخراج merge split rotate', status: 'ready', file: 'files', libs: [L('pdf-lib.min.js')],
      limits: ['يعمل محلياً بالكامل دون رفع الملفات.', 'ضغط حجم PDF غير مدعوم (يحتاج محركاً مخصصاً).', 'ملفات PDF المشفرة بكلمة مرور غير مدعومة.', 'حد الحجم المقترح للملف: 150 MB (ذاكرة الهاتف).'] },
    { id: 'archive-manager', cat: 'files', icon: 'archive', name: 'مدير الأرشيفات', desc: 'عرض محتوى ZIP واستخراج ملفات منه وإنشاء ZIP من ملفات', kw: 'zip ارشيف ضغط فك extract archive', status: 'ready', file: 'files', libs: [L('jszip.min.js')],
      limits: ['الصيغة المدعومة: ZIP (وأرشيفات APK/JAR/DOCX لأنها ZIP).', 'RAR و7z و TAR غير مدعومة.', 'ZIP المحمي بكلمة مرور غير مدعوم.'] },
    { id: 'mhtml-workshop', cat: 'files', icon: 'doc', name: 'استخراج صور MHTML', desc: 'استخراج الصور المضمّنة من ملفات MHTML/MHT إلى ZIP مرتب، وإعادة ترقيم صور ZIP (001، 002…)', kw: 'mhtml mht صور استخراج ترقيم renamer', status: 'ready', file: 'files', libs: [L('jszip.min.js')], mine: true,
      limits: ['منقول من أداتك (core.py و renamer.py) إلى JavaScript ويعمل محلياً.', 'الصور الخارجية غير المضمّنة داخل MHTML لا يمكن استخراجها وتظهر في التقرير كـ «بلا مطابقة».', 'الملفات الكبيرة جداً تُقرأ كاملة في الذاكرة؛ يُنصح بما دون 150 MB.'] },
    { id: 'file-audit', cat: 'files', icon: 'eye', name: 'فحص الملفات', desc: 'نوع الملف الحقيقي من التوقيع، الحجم، البصمة، عرض سداسي، وكشف التكرارات', kw: 'فحص ملف نوع توقيع magic تكرار duplicate hex', status: 'ready', file: 'files', libs: [],
      limits: ['يفحص الملفات التي تختارها فقط.', 'كشف التكرار بمقارنة SHA-256 للمحتوى.', 'الحد: 300 MB للملف الواحد.'] },
    { id: 'file-split-join', cat: 'files', icon: 'split', name: 'تقسيم ودمج الملفات', desc: 'تقسيم ملف كبير إلى أجزاء بحجم محدد وإعادة جمع الأجزاء', kw: 'تقسيم دمج split join part اجزاء', status: 'ready', file: 'files', libs: [],
      limits: ['الأجزاء تسمّى name.ext.part001 …؛ الدمج يرتبها بالاسم.', 'لا تُضاف بصمة تحقق تلقائياً؛ استخدم «استوديو البصمات» للتحقق.'] },
    { id: 'doc-converter', cat: 'files', icon: 'doc', name: 'محول المستندات', desc: 'تحويل DOCX/PDF/ODT وغيرها', kw: 'تحويل docx word مستند convert', status: 'unavailable', file: null, libs: [],
      needs: ['يتطلب محرك تحويل مستندات (مثل LibreOffice) أو خدمة خارجية؛ لا يوجد محرك كهذا مضمّن حالياً.', 'متاح بدلاً منه: Markdown ← HTML في «ورشة Markdown»، وتحويل البيانات في «ورشة البيانات».'] },

    /* ───── الصور ───── */
    { id: 'image-workshop', cat: 'images', icon: 'image', name: 'ورشة الصور', desc: 'تغيير الحجم والقص والتدوير والقلب وتحويل الصيغة وضغط الجودة (دفعات)', kw: 'صورة حجم قص تدوير تحويل ضغط jpg png webp resize crop convert compress', status: 'ready', file: 'images', libs: [],
      limits: ['الإخراج: PNG وJPEG وWEBP (حسب دعم المتصفح؛ يُختبر تلقائياً).', 'AVIF/HEIC للقراءة فقط إن دعمها النظام، ولا ترميز إليها.', 'الصور الضخمة جداً (> 100 ميغابكسل) قد تفشل بسبب الذاكرة.'] },
    { id: 'color-studio', cat: 'images', icon: 'palette', name: 'استوديو الألوان', desc: 'تحويل HEX/RGB/HSL، لوحات متناسقة، لوحة ألوان من صورة، فحص التباين، وخلفيات متدرجة', kw: 'لون الوان hex rgb hsl لوحة تباين contrast gradient خلفية', status: 'ready', file: 'images', libs: [],
      limits: ['استخراج اللوحة من الصورة بخوارزمية Median Cut محلية.', 'فحص التباين وفق معادلات WCAG 2.'] },
    { id: 'svg-workshop', cat: 'images', icon: 'svg', name: 'ورشة SVG', desc: 'معاينة SVG وتحقق صيغته وتصغيره وتحويله إلى PNG', kw: 'svg متجه تصغير minify png', status: 'ready', file: 'images', libs: [L('purify.min.js')],
      limits: ['المعاينة تمر عبر منقّح (DOMPurify) يزيل السكربتات.', 'التصغير بسيط (إزالة التعليقات والمسافات الزائدة) وليس SVGO.'] },
    { id: 'gif-studio', cat: 'images', icon: 'gif', name: 'استوديو GIF', desc: 'إنشاء GIF متحرك من عدة صور مع التحكم بالمدة والحجم', kw: 'gif متحرك animation صور', status: 'ready', file: 'images', libs: [],
      limits: ['إنشاء GIF من صور فقط؛ تفكيك GIF إلى إطارات غير مدعوم.', 'اللوحة 256 لوناً (تكميم Median Cut) فتظهر فروق لونية طبيعية.'] },

    /* ───── الوسائط ───── */
    { id: 'audio-workshop', cat: 'media', icon: 'audio', name: 'ورشة الصوت', desc: 'قص ودمج وتحليل الصوت وتعديل مستواه وتصديره WAV', kw: 'صوت قص دمج wav تحليل موجة audio trim merge', status: 'partial', file: 'media', libs: [],
      limits: ['يقرأ الصيغ التي يفكّها نظام الهاتف (MP3 وAAC وWAV وOGG عادةً).', 'التصدير WAV 16-bit فقط؛ لا ترميز MP3/AAC.', 'الملفات الطويلة تُفكّ كاملة في الذاكرة (دقيقة ستيريو ≈ 20 MB).'] },
    { id: 'subtitle-workshop', cat: 'media', icon: 'subtitle', name: 'ورشة الترجمة النصية', desc: 'فتح SRT وVTT، تحويل بينهما، إزاحة التوقيت، تعديل النص، واكتشاف الأخطاء', kw: 'ترجمة srt vtt subtitle توقيت', status: 'ready', file: 'media', libs: [],
      limits: ['الصيغ: SRT وVTT. ASS/SSA غير مدعومة.', 'الترميز المفترض UTF-8 مع محاولة windows-1256 للعربية القديمة.'] },
    { id: 'video-workshop', cat: 'media', icon: 'video', name: 'ورشة الفيديو', desc: 'معلومات الفيديو، التقاط إطار كصورة، وقص/تحويل إلى WebM بالزمن الحقيقي', kw: 'فيديو قص تحويل webm التقاط اطار video trim frame', status: 'partial', file: 'media', libs: [],
      limits: ['لا يوجد محرك FFmpeg مضمّن: القص يتم بإعادة التسجيل في الزمن الحقيقي (مدة القص = مدة المعالجة).', 'الإخراج WebM فقط (حسب دعم النظام)، وبجودة أقل من الأصل.', 'لا دمج مقاطع ولا ضغط متقدم ولا MP4 — تحتاج محرك FFmpeg.', 'الصوت يُسجَّل من العنصر نفسه؛ قد لا يدعم بعض الأجهزة ذلك.'] },
    { id: 'video-link-downloader', cat: 'media', icon: 'download', name: 'تنزيل فيديو من رابط', desc: 'تنزيل فيديو أو صوت من صفحات مواقع ومنصات الفيديو بمحرك استخراج محلي (yt-dlp) — اختيار الجودة، وقوائم متعددة بطابور', kw: 'تنزيل فيديو رابط youtube yt-dlp يوتيوب صوت mp3 جودة قائمة منصات', status: 'partial', file: 'videolink', libs: ['js/video-core.js'],
      limits: ['يعمل داخل تطبيق أندرويد فقط (المحرك أصلي)؛ في المتصفح العادي تظهر رسالة بذلك.', 'يدعم مجموعة واسعة من مواقع ومنصات الفيديو، وقد يختلف الدعم حسب الموقع وتغيّراته؛ يمكن تحديث المحرك من داخل الأداة.', 'لا يتجاوز DRM ولا تسجيل الدخول ولا أي حماية: المحتوى المحمي أو الخاص يظهر سبب تعذّره.', 'الدفعات (عدة فيديوهات) تستخدم جودة واحدة لكل المحدد؛ الجودات التفصيلية تظهر للفيديو المفرد.', 'الدمج والتحويل إلى MP3 يستخدمان FFmpeg المضمّن؛ التنزيل يحتاج مساحة مؤقتة تساوي حجم الفيديو تقريباً إضافة إلى الملف النهائي.', 'لا يعمل التنزيل في الخلفية إذا أُغلق التطبيق أو أوقفه النظام. البث المباشر غير مدعوم.'] },
    { id: 'speech-tools', cat: 'media', icon: 'mic', name: 'أدوات الكلام', desc: 'تحويل الكلام إلى نص وعكسه', kw: 'كلام صوت نص speech tts stt', status: 'unavailable', file: null, libs: [],
      needs: ['التحويل من الكلام إلى نص يحتاج محرك Whisper أو خدمة سحابية؛ لا يوجد محرك مضمّن ولا نضمّن نماذج كبيرة افتراضياً.', 'واجهة Web Speech في WebView غير موثوقة، فلا نعرض الميزة كأنها تعمل.'] },

    /* ───── النصوص ───── */
    { id: 'text-workshop', cat: 'text', icon: 'text', name: 'ورشة النصوص', desc: 'تنظيف وتنسيق النص، تغيير حالة الأحرف، حذف المكرر، ترتيب الأسطر، استبدال، وإحصاءات', kw: 'نص تنظيف تكرار ترتيب استبدال احصاء كلمات case sort dedupe replace', status: 'ready', file: 'text', libs: [],
      limits: ['كل المعالجة محلية. النصوص الضخمة (> 5 MB) قد تبطئ الواجهة.'] },
    { id: 'text-diff', cat: 'text', icon: 'diff', name: 'مقارنة النصوص', desc: 'إظهار الفروق بين نصين سطراً سطراً وكلمة كلمة، ودمج النتيجة', kw: 'مقارنة فرق diff دمج merge', status: 'ready', file: 'text', libs: [],
      limits: ['الحد: ~4000 سطر لكل نص (خوارزمية LCS).'] },
    { id: 'encoder-studio', cat: 'text', icon: 'code', name: 'استوديو الترميز', desc: 'Base64 وURL وHTML Entities وHex وUnicode وBinary — ترميزاً وفكّاً', kw: 'ترميز base64 url html hex unicode encode decode', status: 'ready', file: 'text', libs: [],
      limits: ['يتعامل مع UTF-8 بشكل صحيح (العربية والرموز).', 'فك Base64 لبيانات ثنائية يظهر كنص إن كانت UTF-8 صالحة، وإلا يعرض Hex.'] },
    { id: 'markdown-workshop', cat: 'text', icon: 'note', name: 'ورشة Markdown', desc: 'تحرير Markdown مع معاينة منقّاة، وتصدير HTML', kw: 'markdown md معاينة html', status: 'ready', file: 'text', libs: [L('marked.min.js'), L('purify.min.js')],
      limits: ['المعاينة تمر عبر DOMPurify لإزالة السكربتات.', 'التصدير: HTML وmd. لا تصدير PDF/DOCX.'] },
    { id: 'snippets', cat: 'text', icon: 'save', name: 'القصاصات والقوالب', desc: 'حفظ نصوص وقوالب متكررة على الجهاز مع بحث ونسخ وتصدير', kw: 'قصاصات قوالب snippets templates حفظ', status: 'ready', file: 'text', libs: [],
      limits: ['تُحفظ داخل التطبيق فقط (تخزين المتصفح المحلي) ولا تُرسل لأي مكان.', 'مسح بيانات التطبيق أو إعادة تثبيته يحذفها — استخدم التصدير للنسخ الاحتياطي.'] },
    { id: 'ocr-extractor', cat: 'text', icon: 'eye', name: 'استخراج النص من الصور (OCR)', desc: 'قراءة النص من الصور وملفات PDF الممسوحة', kw: 'ocr استخراج نص صورة', status: 'unavailable', file: null, libs: [],
      needs: ['يحتاج محرك OCR (Tesseract WASM أو ML Kit) مع نماذج لغات بحجم عدة ميغابايتات للغة؛ غير مضمّن حالياً.', 'يمكن إضافته لاحقاً كـ Native plugin (ML Kit) وفق قواعد APKMaker — قرار حجم/ترخيص يعود إليك.'] },

    /* ───── المطورون ───── */
    { id: 'data-workshop', cat: 'dev', icon: 'json', name: 'ورشة البيانات المنظمة', desc: 'JSON وYAML وXML: تنسيق وتحقق وتحويل بينها، وJSON ↔ CSV', kw: 'json yaml xml تحويل تنسيق تحقق csv', status: 'ready', file: 'dev', libs: [L('js-yaml.min.js')],
      limits: ['TOML غير مدعوم (لا مكتبة مضمّنة).', 'تحويل XML ↔ JSON يتبع اصطلاحاً بسيطاً (@attributes و #text) وقد لا يحافظ على كل التفاصيل.', 'YAML يُقرأ بوضع آمن (بدون أنواع JavaScript).'] },
    { id: 'table-workshop', cat: 'dev', icon: 'table', name: 'ورشة الجداول وCSV', desc: 'عرض CSV وترتيبه وتصفيته وتحويله إلى JSON/Markdown/TSV والتحقق منه', kw: 'csv جدول tsv ترتيب تصفية table', status: 'ready', file: 'dev', libs: [],
      limits: ['يدعم الفواصل , ; Tab | مع اكتشاف تلقائي والاقتباس المزدوج.', 'العرض يقتصر على أول 500 صف؛ التحويل يشمل الكل.'] },
    { id: 'regex-lab', cat: 'dev', icon: 'regex', name: 'ورشة التعبيرات النمطية', desc: 'اختبار Regex مع إبراز المطابقات والمجموعات والاستبدال', kw: 'regex تعبير نمطي اختبار مطابقة', status: 'ready', file: 'dev', libs: [],
      limits: ['يستخدم محرك JavaScript RegExp (قد يختلف عن PCRE/Python).', 'مهلة حماية: الأنماط شديدة التعقيد قد تجمّد الصفحة.'] },
    { id: 'test-data', cat: 'dev', icon: 'wand', name: 'مولّد بيانات الاختبار', desc: 'بيانات تجريبية وهمية: أسماء وبريد وأرقام وتواريخ وUUID بصيغة JSON/CSV', kw: 'بيانات اختبار وهمية fake mock uuid', status: 'ready', file: 'dev', libs: [],
      limits: ['كل البيانات وهمية وعشوائية وليست أشخاصاً حقيقيين.', 'ليست مولّد أرقام بطاقات أو هويات.'] },
    { id: 'code-formatter', cat: 'dev', icon: 'code', name: 'تنسيق وتصغير الكود', desc: 'تنسيق JSON وCSS وHTML، وتصغير JSON وCSS وHTML', kw: 'تنسيق تصغير format minify beautify css html json', status: 'partial', file: 'dev', libs: [],
      limits: ['JavaScript: لا تنسيق ولا تصغير (يحتاج محركاً مثل Terser/Prettier غير مضمّن).', 'منسّق CSS وHTML مبسّط (ليس Prettier) ولا يعيد كتابة الكود المضمّن.'] },
    { id: 'jwt-inspector', cat: 'dev', icon: 'key', name: 'فاحص JWT', desc: 'فك ترويسة وحمولة JWT وعرض التواريخ، وفحص توقيع HS256/384/512 بمفتاح تدخله', kw: 'jwt token رمز توقيع hs256', status: 'ready', file: 'dev', libs: [],
      limits: ['فك الترميز ليس تحققاً: يُعرض بوضوح «لم يُتحقق من التوقيع» ما لم تدخل المفتاح.', 'التحقق مدعوم لـ HS256/384/512 فقط؛ RS/ES غير مدعومة.'] },

    /* ───── الويب ───── */
    { id: 'url-workshop', cat: 'web', icon: 'link', name: 'ورشة الروابط', desc: 'تحليل الرابط إلى مكوّناته، تعديل معاملات الاستعلام، وترميزها', kw: 'رابط url معاملات query ترميز parse', status: 'ready', file: 'web', libs: [], limits: ['محلي بالكامل ولا يتصل بالرابط.'] },
    { id: 'api-lab', cat: 'web', icon: 'send', name: 'مختبر طلبات API', desc: 'إرسال طلبات HTTP (GET/POST/…) وعرض الحالة والترويسات والنتيجة', kw: 'api http طلب request rest get post', status: 'partial', file: 'web', libs: [],
      limits: ['داخل APK: يستخدم المحرك الأصلي فلا يتأثر بـCORS.', 'في المتصفح العادي: يُحجب كثير من المواقع بسياسة CORS.', 'الحد الأقصى لجسم الاستجابة المعروض 8 MB.', 'لا تُحفظ الطلبات ولا المفاتيح.'] },
    { id: 'network-tools', cat: 'web', icon: 'wifi', name: 'فحص المواقع والشبكة', desc: 'ترويسات الموقع وعنوان الصفحة وmeta، استعلام DNS عبر DoH، وقياس زمن الاستجابة', kw: 'فحص موقع dns شبكة ping ترويسات website network', status: 'partial', file: 'web', libs: [],
      limits: ['لا ICMP ping ولا فحص منافذ (غير ممكن من WebView) — يقاس زمن طلب HTTP فقط.', 'استعلام DNS يتم عبر Cloudflare DoH فيغادر اسم النطاق جهازك — يُطلب تأكيدك قبل الإرسال.', 'فحص الموقع يعرض ما يُرجعه الخادم للعموم فقط.'] },
    { id: 'html-playground', cat: 'web', icon: 'play', name: 'ساحة HTML/CSS/JS', desc: 'تجربة كود HTML وCSS وJavaScript داخل إطار معزول', kw: 'html css js playground تجربة', status: 'ready', file: 'web', libs: [],
      limits: ['يعمل داخل iframe بوضع sandbox دون وصول إلى بيانات التطبيق.', 'لا يصل iframe إلى الشبكة المحلية ولا ملفات الجهاز.'] },
    { id: 'downloader', cat: 'web', icon: 'download', name: 'تنزيل الملفات وصفحات الويب', desc: 'تنزيل ملف من رابط مباشر مع التقدم الحقيقي، وحفظ مصدر صفحة ويب', kw: 'تنزيل ملف رابط مباشر download حفظ صفحة', status: 'partial', file: 'web', libs: [],
      limits: ['داخل APK: تنزيل أصلي مباشر إلى «التنزيلات/OMNIFORGE» مع تقدم حقيقي.', 'في المتصفح: يخضع لـCORS وبلا تقدم دقيق في بعض الحالات.', 'لا تنزيل في الخلفية ولا استئناف بعد الإغلاق.', 'حفظ الصفحة يحفظ HTML المصدر فقط (بدون الصور/CSS/JS؛ الصفحات الديناميكية لا تُحفظ كاملة).', 'لا يتجاوز تسجيل الدخول ولا DRM؛ نزّل ما تملك حق الوصول إليه فقط.'] },

    /* ───── الأمان ───── */
    { id: 'secure-generator', cat: 'security', icon: 'key', name: 'المولّد الآمن', desc: 'كلمات مرور وPIN وعبارات وتوكنات وUUID بمصدر عشوائية تشفيري', kw: 'كلمة مرور password عشوائي توكن uuid مولد', status: 'ready', file: 'security', libs: [],
      limits: ['يستخدم crypto.getRandomValues مع تفادي الانحياز.', 'لا تُحفظ القيم المولّدة ولا تغادر الجهاز.'] },
    { id: 'hash-studio', cat: 'security', icon: 'hash', name: 'استوديو البصمات', desc: 'SHA-1/256/384/512 وHMAC للنصوص والملفات مع مقارنة بقيمة متوقعة', kw: 'hash sha256 بصمة checksum hmac', status: 'ready', file: 'security', libs: [],
      limits: ['MD5 غير مدعوم في WebCrypto (غير آمن أصلاً).', 'الملفات تُقرأ كاملة في الذاكرة: الحد 300 MB.'] },
    { id: 'metadata-cleaner', cat: 'security', icon: 'eraser', name: 'تنظيف البيانات الوصفية', desc: 'إزالة EXIF/GPS وغيرها من JPEG وPNG وPDF مع عرض ما أُزيل', kw: 'exif gps خصوصية بيانات وصفية metadata تنظيف', status: 'ready', file: 'security', libs: [L('pdf-lib.min.js')],
      limits: ['JPEG وPNG: إزالة بلا إعادة ترميز للصورة (لا فقد جودة).', 'PDF: مسح حقول المعلومات وXMP الأساسية؛ لا يضمن إزالة كل أثر داخل محتوى الصفحات.', 'صيغ أخرى (WEBP، HEIC، فيديو) غير مدعومة.'] },
    { id: 'redactor', cat: 'security', icon: 'eraser', name: 'إخفاء البيانات الحساسة', desc: 'اكتشاف وإخفاء البريد والهواتف وIP والأرقام الطويلة وكلمات مخصصة في النصوص', kw: 'اخفاء حجب redact anonymize بريد هاتف', status: 'partial', file: 'security', libs: [],
      limits: ['للنصوص فقط (الإخفاء داخل ملفات PDF/صور غير مدعوم).', 'الاكتشاف بأنماط عامة وقد يفوّت أو يخطئ؛ راجع النتيجة قبل المشاركة.'] },
    { id: 'encryptor', cat: 'security', icon: 'lock', name: 'تشفير الملفات والنصوص', desc: 'AES-256-GCM بمفتاح مشتق من كلمة مرور (PBKDF2) للنصوص والملفات', kw: 'تشفير فك aes password encrypt decrypt', status: 'ready', file: 'security', libs: [],
      limits: ['خوارزميات WebCrypto القياسية: AES-256-GCM وPBKDF2-SHA256 (600,000 تكرار).', 'لا استرجاع لكلمة المرور: إن نسيتها فُقدت البيانات.', 'الملف يُشفَّر كاملاً في الذاكرة: الحد 150 MB.', 'صيغة الملف .omnienc موثقة في README.'] },

    /* ───── اليومية ───── */
    { id: 'unit-converter', cat: 'daily', icon: 'ruler', name: 'محول الوحدات', desc: 'الطول والكتلة والحجم والمساحة والسرعة والحرارة والبيانات والوقت والضغط والطاقة', kw: 'وحدات تحويل طول وزن حرارة units convert', status: 'ready', file: 'daily', libs: [], limits: ['معاملات تحويل ثابتة معيارية.'] },
    { id: 'datetime-workshop', cat: 'daily', icon: 'clock', name: 'ورشة التاريخ والوقت', desc: 'الفرق بين تاريخين، إضافة/طرح مدة، المناطق الزمنية، طابع يونكس، والتقويم الهجري', kw: 'تاريخ وقت هجري فرق منطقة زمنية unix timestamp date', status: 'ready', file: 'daily', libs: [],
      limits: ['التقويم الهجري: أم القرى عبر Intl إن دعمه النظام (قد يختلف يوماً عن الرؤية الفعلية).'] },
    { id: 'calculator', cat: 'daily', icon: 'calc', name: 'مجموعة الحاسبات', desc: 'حاسبة علمية بمحلل تعابير آمن، نسبة مئوية، خصم وضريبة، وقسط قرض', kw: 'حاسبة علمية نسبة خصم ضريبة قرض calculator', status: 'ready', file: 'daily', libs: [], limits: ['لا يستخدم eval؛ محلل تعابير مخصص.', 'حسابات الفاصلة العائمة قد تُظهر فروقاً صغيرة جداً.'] },
    { id: 'qr-studio', cat: 'daily', icon: 'qr', name: 'استوديو QR', desc: 'إنشاء رموز QR (PNG وSVG) من نص أو رابط أو Wi-Fi، وقراءتها من صورة عند دعم النظام', kw: 'qr باركود رمز qrcode barcode', status: 'partial', file: 'daily', libs: ['js/qr-encoder.js'],
      limits: ['الإنشاء: محرك مكتوب داخل التطبيق (نمط Byte، تصحيح L/M/Q/H، الإصدارات 1–40)، جرى التحقق منه بقارئ OpenCV لكل الإصدارات والمستويات.', 'القراءة من صورة تعتمد على BarcodeDetector في نظامك؛ إن لم يتوفر تظهر رسالة صريحة.', 'لا باركود خطي ولا قراءة بالكاميرا حالياً.'] },

    /* ───── متخصصة ───── */
    { id: 'apk-workshop', cat: 'special', icon: 'apk', name: 'ورشة APK', desc: 'فحص حزم APK، عرض الأذونات والمانيفست، استعراض الملفات، استبدال الأيقونات والموارد، وإعادة التجميع', kw: 'apk اندرويد مانيفست اذونات ايقونة apktool', status: 'partial', file: 'apk', libs: [L('jszip.min.js')],
      limits: ['يعمل محلياً: لا يُرفع أي APK لأي خادم.', 'الفحص: الحزمة والإصدار والأذونات والمكوّنات من AndroidManifest الثنائي، وأنظمة التوقيع المكتشفة.', 'التعديل: استبدال/إضافة/حذف ملفات داخل الحزمة (أيقونات، assets، صور) وإعادة التجميع.', 'غير مدعوم حالياً: فك resources.arsc إلى XML، تعديل AndroidManifest، Smali، والتوقيع — تحتاج محرك Native (apksig / apktool).', 'الحزمة الناتجة غير موقّعة وبالتالي لا تُثبَّت قبل توقيعها بأداة خارجية.', 'لا يتجاوز حماية التطبيقات.'] },
    { id: 'storage-analyzer', cat: 'special', icon: 'disk', name: 'محلل التخزين', desc: 'تحليل ملفات أو مجلد تختاره بحسب النوع والحجم وأكبر الملفات، ومساحة تخزين التطبيق', kw: 'تخزين مساحة حجم تحليل storage', status: 'partial', file: 'special', libs: [],
      limits: ['يحلل ما تختاره فقط — لا يمكنه فحص كامل تخزين الهاتف من WebView.', 'اختيار المجلد يعتمد على دعم النظام؛ إن لم يدعمه اختر عدة ملفات.', 'مساحة التطبيق من navigator.storage.estimate وتقريبية.'] },
    { id: 'font-inspector', cat: 'special', icon: 'font', name: 'فاحص الخطوط', desc: 'معاينة خطوط TTF/OTF/WOFF/WOFF2 وعرض اسم الخط وعدد الحروف وحقوقه', kw: 'خط خطوط font ttf otf woff معاينة', status: 'partial', file: 'special', libs: [],
      limits: ['المعاينة عبر FontFace في النظام؛ قراءة جدول name وmaxp لـ TTF/OTF (وWOFF بعد فك ضغطه عند دعم DecompressionStream).', 'WOFF2: معاينة فقط دون قراءة الجداول.'] },
  ];
})();
