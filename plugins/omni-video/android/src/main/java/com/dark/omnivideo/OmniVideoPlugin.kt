package com.dark.omnivideo

import android.os.StatFs
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.yausername.ffmpeg.FFmpeg
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Callable
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

/**
 * OmniVideo — محرك استخراج وتنزيل الفيديو لـ OMNIFORGE (yt-dlp عبر youtubedl-android).
 *
 * المسؤوليات (طبقة أصلية رقيقة):
 *   engineInfo   : حالة المحرك (جاهز؟ إصدار yt-dlp؟ FFmpeg؟)
 *   extract      : تشغيل yt-dlp --dump-single-json وإرجاع JSON الخام (يُطبَّع في الواجهة)
 *   download     : تنزيل إلى cacheDir/omni-video/<id>/ مع حدث videoProgress، ويرجع مسار الملف
 *   cancel       : إيقاف عملية جارية وحذف مؤقتاتها
 *   cleanup      : حذف مجلد المهمة المؤقت
 *   updateEngine : تحديث yt-dlp (STABLE)
 *
 * الحفظ في التنزيلات ليس هنا: الواجهة تستدعي OmniSave.saveFromPath بعد اكتمال download.
 * لا نمرّر وسائط عشوائية من الواجهة إلى yt-dlp: نبني الأوامر هنا من قائمة مسموحة فقط.
 *
 * ملاحظة: لم يُجمَّع هذا الملف في بيئة التطوير (لا Android SDK ولا Maven هناك)؛ أول تجميع في GitHub Actions.
 */
@CapacitorPlugin(name = "OmniVideo")
class OmniVideoPlugin : Plugin() {

    private val pool = Executors.newCachedThreadPool()
    private val initLock = Any()
    @Volatile private var initDone = false
    @Volatile private var initError: String? = null
    @Volatile private var ffmpegOk = false
    @Volatile private var ffmpegError: String? = null
    private val cancelled = ConcurrentHashMap.newKeySet<String>()

    private val idRe = Regex("^[A-Za-z0-9_-]{1,64}$")
    private val selectorRe = Regex("^[A-Za-z0-9_\\[\\]<>=!+/,.*()\\-:^\$~&|@ ]{1,400}\$")

    private fun workRoot(): File = File(context.cacheDir, "omni-video")

    override fun load() {
        // مجلدات مؤقتة متبقية من جلسة سابقة (لا توجد تنزيلات جارية عند بدء البلاجن)
        pool.execute { try { workRoot().deleteRecursively() } catch (e: Exception) { /* ignore */ } }
        // تهيئة المحرك في الخلفية: فك Python أول مرة قد يستغرق ثواني
        pool.execute { ensureInit() }
    }

    /** يهيّئ yt-dlp ثم FFmpeg مرة واحدة. يرجع true إذا كان المحرك جاهزاً (FFmpeg اختياري). */
    private fun ensureInit(): Boolean {
        if (initDone) return initError == null
        synchronized(initLock) {
            if (initDone) return initError == null
            try {
                YoutubeDL.getInstance().init(context)
            } catch (t: Throwable) {
                initError = (t.message ?: t.javaClass.simpleName)
            }
            if (initError == null) {
                try {
                    FFmpeg.getInstance().init(context)
                    ffmpegOk = true
                } catch (t: Throwable) {
                    ffmpegOk = false
                    ffmpegError = (t.message ?: t.javaClass.simpleName)
                }
            }
            initDone = true
        }
        return initError == null
    }

    private fun rejectInit(call: PluginCall) {
        call.reject("ENGINE_INIT: " + (initError ?: "init failed"), "ENGINE_INIT")
    }

    @PluginMethod
    fun engineInfo(call: PluginCall) {
        pool.execute {
            val ok = ensureInit()
            val r = JSObject().put("engine", "yt-dlp").put("ready", ok).put("ffmpeg", ffmpegOk)
            if (initError != null) r.put("error", initError)
            if (ffmpegError != null) r.put("ffmpegError", ffmpegError)
            if (ok) {
                try { r.put("ytdlpVersion", YoutubeDL.getInstance().versionName(context) ?: "") } catch (t: Throwable) { /* ignore */ }
            }
            call.resolve(r)
        }
    }

    /** يحذف الحقول الثقيلة غير اللازمة (ترجمات/خريطة حرارة) لتقليل حجم الرد عبر الجسر. */
    private fun slim(json: String): String {
        return try {
            val o = JSONObject(json)
            for (k in arrayOf("automatic_captions", "subtitles", "heatmap", "chapters", "http_headers", "requested_formats", "requested_downloads")) o.remove(k)
            o.toString()
        } catch (t: Throwable) {
            json
        }
    }

    @PluginMethod
    fun extract(call: PluginCall) {
        val url = call.getString("url") ?: return call.reject("INVALID_URL: الرابط مفقود", "INVALID_URL")
        if (!(url.startsWith("http://") || url.startsWith("https://"))) return call.reject("INVALID_URL: http/https فقط", "INVALID_URL")
        val end = (call.getInt("playlistEnd") ?: 100).coerceIn(1, 500)
        val timeout = (call.getInt("timeoutSec") ?: 90).coerceIn(10, 300)
        val pid = "x" + System.nanoTime().toString(36)
        pool.execute {
            if (!ensureInit()) return@execute rejectInit(call)
            val task = pool.submit(Callable<String> {
                val req = YoutubeDLRequest(url)
                req.addOption("--dump-single-json")
                req.addOption("--flat-playlist")
                req.addOption("--playlist-end", end.toString())
                req.addOption("--no-warnings")
                req.addOption("--socket-timeout", "20")
                req.addOption("--extractor-retries", "2")
                YoutubeDL.getInstance().execute(req, processId = pid).out
            })
            try {
                val out = task.get(timeout.toLong(), TimeUnit.SECONDS)
                if (out.isBlank()) return@execute call.reject("لم يُرجع المحرك أي نتيجة (No video found)", "NO_VIDEO")
                call.resolve(JSObject().put("json", slim(out.trim())))
            } catch (e: TimeoutException) {
                try { YoutubeDL.getInstance().destroyProcessById(pid) } catch (t: Throwable) { /* ignore */ }
                task.cancel(true)
                call.reject("TIMEOUT: انتهت مهلة الاستخراج (timed out)", "TIMEOUT")
            } catch (e: ExecutionException) {
                // رسالة YoutubeDLException = stderr الخام من yt-dlp
                call.reject(trim(e.cause?.message ?: e.message ?: "extract failed"))
            } catch (e: Exception) {
                call.reject(trim(e.message ?: "extract failed"))
            }
        }
    }

    @PluginMethod
    fun download(call: PluginCall) {
        val id = call.getString("id") ?: ""
        if (!idRe.matches(id)) return call.reject("معرّف المهمة غير صالح", "INVALID_URL")
        val url = call.getString("url") ?: ""
        if (!(url.startsWith("http://") || url.startsWith("https://"))) return call.reject("INVALID_URL: http/https فقط", "INVALID_URL")
        val selector = (call.getString("selector") ?: "bv*+ba/b").trim()
        if (selector.startsWith("-") || !selectorRe.matches(selector)) return call.reject("محدّد الصيغة غير صالح", "FORMAT_UNAVAILABLE")
        val mux = call.getBoolean("mux") ?: false
        val audio = call.getString("audio") ?: ""
        if (audio != "" && audio != "best" && audio != "mp3") return call.reject("صيغة الصوت غير مدعومة", "FORMAT_UNAVAILABLE")
        val estimate = call.getDouble("estimateBytes") ?: 0.0

        pool.execute {
            if (!ensureInit()) return@execute rejectInit(call)
            if ((mux || audio == "mp3") && !ffmpegOk) {
                return@execute call.reject("FFMPEG_MISSING: ffmpeg not found (" + (ffmpegError ?: "") + ")", "FFMPEG_MISSING")
            }
            val dir = File(workRoot(), id)
            try {
                dir.mkdirs()
                // مساحة التخزين: نحتاج حجم الفيديو مؤقتاً (+ نسخة نهائية في التنزيلات لاحقاً)
                val free = StatFs(workRoot().path).availableBytes
                val need = (estimate * 1.15).toLong() + 64L * 1024 * 1024
                if (free < need) {
                    dir.deleteRecursively()
                    return@execute call.reject("NO_SPACE: No space left on device (free=$free need=$need)", "NO_SPACE")
                }
                val req = YoutubeDLRequest(url)
                req.addOption("-f", selector)
                req.addOption("-o", File(dir, "media.%(ext)s").absolutePath)
                req.addOption("--no-playlist")
                req.addOption("--newline")
                req.addOption("--no-warnings")
                req.addOption("--no-mtime")
                req.addOption("--retries", "5")
                req.addOption("--fragment-retries", "5")
                req.addOption("--socket-timeout", "30")
                req.addOption("--concurrent-fragments", "4")
                if (mux) req.addOption("--merge-output-format", "mp4")
                if (audio == "mp3") {
                    req.addOption("-x")
                    req.addOption("--audio-format", "mp3")
                    req.addOption("--audio-quality", "0")
                }
                var lastEmit = 0L
                YoutubeDL.getInstance().execute(req, processId = id, callback = { progress: Float, eta: Long, line: String ->
                    val now = System.currentTimeMillis()
                    val isDl = line.startsWith("[download]") && line.contains("%")
                    if (!isDl || now - lastEmit > 250) {
                        lastEmit = now
                        notifyListeners("videoProgress", JSObject().put("id", id).put("percent", progress.toDouble()).put("eta", eta).put("line", line))
                    }
                })
                val out = dir.listFiles()
                    ?.filter { it.isFile && it.name.startsWith("media.") && !it.name.endsWith(".part") && !it.name.endsWith(".ytdl") && !it.name.endsWith(".temp") && !it.name.contains(".part-") }
                    ?.maxByOrNull { it.length() }
                if (out == null || out.length() == 0L) {
                    dir.deleteRecursively()
                    return@execute call.reject("NO_OUTPUT: لم يُنتج المحرك ملفاً (no video formats found)", "NO_OUTPUT")
                }
                call.resolve(JSObject().put("id", id).put("path", out.absolutePath).put("ext", out.extension).put("size", out.length()))
            } catch (e: Exception) {
                val wasCancelled = cancelled.remove(id)
                try { dir.deleteRecursively() } catch (t: Throwable) { /* ignore */ }
                if (wasCancelled) call.reject("cancelled", "CANCELLED")
                else call.reject(trim(e.message ?: "download failed"))
            } finally {
                cancelled.remove(id)
            }
        }
    }

    @PluginMethod
    fun cancel(call: PluginCall) {
        val id = call.getString("id") ?: ""
        if (idRe.matches(id)) {
            cancelled.add(id)
            try { YoutubeDL.getInstance().destroyProcessById(id) } catch (t: Throwable) { /* ignore */ }
        }
        call.resolve()
    }

    @PluginMethod
    fun cleanup(call: PluginCall) {
        val id = call.getString("id") ?: ""
        if (idRe.matches(id)) {
            pool.execute { try { File(workRoot(), id).deleteRecursively() } catch (t: Throwable) { /* ignore */ } }
        }
        call.resolve()
    }

    @PluginMethod
    fun updateEngine(call: PluginCall) {
        pool.execute {
            if (!ensureInit()) return@execute rejectInit(call)
            try {
                val st = YoutubeDL.getInstance().updateYoutubeDL(context)
                val r = JSObject().put("status", st?.toString() ?: "UNKNOWN")
                try { r.put("version", YoutubeDL.getInstance().versionName(context) ?: "") } catch (t: Throwable) { /* ignore */ }
                call.resolve(r)
            } catch (e: Exception) {
                call.reject(trim(e.message ?: "update failed"))
            }
        }
    }

    private fun trim(s: String): String = if (s.length > 4000) s.takeLast(4000) else s
}
