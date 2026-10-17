# omni-video

بلاجن Capacitor (Kotlin) لـ OMNIFORGE: `Capacitor.Plugins.OmniVideo`.
يشغّل **yt-dlp محلياً داخل التطبيق** عبر مكتبة `youtubedl-android` (Python 3 + yt-dlp + FFmpeg مضمّنة). لا سيرفر ولا مفاتيح.

## الواجهة (JS)
| الدالة | الوصف |
|---|---|
| `engineInfo()` | `{ready, error, ytdlpVersion, ffmpeg, ffmpegError}` |
| `extract({url, playlistEnd, timeoutSec})` | يرجع `{json}` = خرج `yt-dlp --dump-single-json --flat-playlist` الخام (التطبيع يتم في `js/video-core.js`) |
| `download({id, url, selector, mux, audio, estimateBytes})` | ينزّل إلى مجلد مؤقت داخل `cacheDir/omni-video/<id>/` ويرجع `{path, ext, size}`؛ يبثّ الحدث `videoProgress {id, percent, eta, line}` |
| `cancel({id})` | يوقف التنزيل ويحذف المؤقت |
| `cleanup({id})` | يحذف المجلد المؤقت |
| `updateEngine()` | يحدّث yt-dlp من قناة STABLE (يحتاج إنترنت) ويرجع `{status, version}` |

الحفظ النهائي في التنزيلات **لا يتم هنا**: تستدعي الواجهة `OmniSave.saveFromPath` (انظر `plugins/omni-save`).

## رموز الخطأ (`call.reject(msg, code)`)
`NO_SPACE`، `TIMEOUT`، `CANCELLED`، `ENGINE_INIT`، `NO_OUTPUT`، `INVALID_URL`؛ وأي خطأ آخر يمرّر نص stderr الخام لتصنيفه في الواجهة (`OF.video.classifyError`).

## ما يحتاجه التطبيق (يُطبَّق تلقائياً من `native/` و`hooks/`)
- `packaging { jniLibs { useLegacyPackaging = true } }` (المحرك ملفات `.so` تُنفَّذ كبرامج).
- `ndk.abiFilters`: arm64-v8a + armeabi-v7a فقط.
- `minSdk` 24 (يرفعه `hooks/pre-build.sh` إن كان أقل).

## ⚠️ الترخيص
`youtubedl-android` بترخيص **GPL-3.0**، وyt-dlp بترخيص Unlicense، وFFmpeg ضمن المكتبة LGPL/GPL حسب البناء. توزيع APK يتضمّنها يعني الالتزام بشروط GPL-3.0 (إتاحة المصدر). راجع هذا قبل نشر التطبيق علناً.

## ⚠️ حالة الاختبار
كُتب هذا البلاجن بلا إمكانية تجميع أو تشغيل على أندرويد في بيئة التطوير؛ أول تجميع فعلي في GitHub Actions.
