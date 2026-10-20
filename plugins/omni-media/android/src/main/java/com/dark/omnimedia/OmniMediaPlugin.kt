package com.dark.omnimedia

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.yausername.ffmpeg.FFmpeg
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * OmniMedia — تشغيل FFmpeg المضمّن على ملفات ورشة الفيديو (MP4: قص/تحويل/ضغط/دمج).
 *  info    : هل FFmpeg جاهز؟
 *  probe   : `ffmpeg -i file` (نص stderr يحلّله ffcmd.js)
 *  encoders: `ffmpeg -encoders` (لاختيار libx264 ثم libopenh264 ثم mpeg4 وكشف libmp3lame)
 *  run     : ينفّذ أوامر من ffcmd.js بعد التحقق الصارم (FfArgs) مع أحداث mediaProgress
 *  cancel  : إيقاف العملية
 * الملفات كلها داخل cacheDir/omni-work (نفس مجلد OmniNative: pickFiles/stage/job/cleanup؛ والحفظ عبر OmniSave.saveFromPath).
 *
 * ملاحظة: يُجمَّع أول مرة في GitHub Actions؛ هنا جُمّع مقابل مجسّمات واختُبر منطق FfArgs/FfRunner على JVM بـ ffmpeg المضيف فقط.
 * مسار الثنائي (nativeLibraryDir/libffmpeg.so) و LD_LIBRARY_PATH مبنيان على بنية youtubedl-android ولم يُجرَّبا على جهاز.
 */
@CapacitorPlugin(name = "OmniMedia")
class OmniMediaPlugin : Plugin() {
    private val pool = Executors.newCachedThreadPool()
    private val jobs = ConcurrentHashMap<String, FfRunner.Handle>()
    @Volatile private var runner: FfRunner? = null
    @Volatile private var initError: String? = null

    private fun root(): File = File(context.cacheDir, "omni-work").also { it.mkdirs() }
    private fun workFile(p: String?): File { val f = File(p ?: throw IllegalArgumentException("المسار مفقود")); if (!FfArgs.inWork(f, root())) throw IllegalArgumentException("مسار خارج مجلد العمل"); return f }

    @Synchronized private fun runner(): FfRunner {
        runner?.let { return it }
        try { FFmpeg.getInstance().init(context) } catch (t: Throwable) { initError = t.message ?: t.javaClass.simpleName; throw IllegalStateException("FFMPEG_MISSING: " + initError) }
        val bin = File(context.applicationInfo.nativeLibraryDir, "libffmpeg.so")
        if (!bin.exists()) throw IllegalStateException("FFMPEG_MISSING: ثنائي FFmpeg غير موجود في " + bin.path)
        val base = File(context.noBackupFilesDir, "youtubedl-android/packages")
        val ld = listOf("python", "ffmpeg", "aria2c").map { File(base, "$it/usr/lib").path }.filter { File(it).isDirectory }.joinToString(":")
        val r = FfRunner(bin, if (ld.isNotEmpty()) mapOf("LD_LIBRARY_PATH" to ld) else emptyMap()); runner = r; return r
    }
    private fun fail(call: PluginCall, e: Throwable) {
        val m = e.message ?: e.javaClass.simpleName
        val code = when { m.startsWith("FFMPEG_MISSING") -> "FFMPEG_MISSING"; e is IllegalArgumentException -> "INVALID"; else -> "FFMPEG_FAILED" }
        call.reject(m, code)
    }

    @PluginMethod
    fun info(call: PluginCall) {
        pool.execute {
            try { val v = runner().capture(listOf("-hide_banner", "-version")).lineSequence().firstOrNull() ?: ""; call.resolve(JSObject().put("ready", true).put("version", v)) }
            catch (e: Throwable) { call.resolve(JSObject().put("ready", false).put("error", e.message ?: e.javaClass.simpleName)) }
        }
    }

    @PluginMethod
    fun probe(call: PluginCall) {
        pool.execute {
            try { val f = workFile(call.getString("path")); if (!f.isFile) throw IllegalArgumentException("الملف غير موجود")
                call.resolve(JSObject().put("text", runner().capture(listOf("-hide_banner", "-i", f.path)))) } catch (e: Throwable) { fail(call, e) }
        }
    }

    @PluginMethod
    fun encoders(call: PluginCall) {
        pool.execute { try { call.resolve(JSObject().put("text", runner().capture(listOf("-hide_banner", "-encoders")))) } catch (e: Throwable) { fail(call, e) } }
    }

    @PluginMethod
    fun run(call: PluginCall) {
        val id = call.getString("id") ?: "job"
        pool.execute {
            val h = FfRunner.Handle(); jobs[id] = h
            var output: File? = null
            try {
                val arr = call.getArray("args") ?: throw IllegalArgumentException("args مفقود")
                var args = ArrayList<String>(); for (k in 0 until arr.length()) args.add(arr.getString(k))
                val cc = call.getArray("concat")
                if (cc != null && cc.length() >= 2) {
                    val paths = ArrayList<String>(); for (k in 0 until cc.length()) { val f = workFile(cc.getString(k)); if (!f.isFile) throw IllegalArgumentException("ملف الدمج غير موجود"); paths.add(f.path) }
                    val list = File(workFile(paths[0]).parentFile, "concat-" + id.filter { it.isLetterOrDigit() }.take(16) + ".txt"); list.writeText(FfArgs.concatList(paths))
                    args = ArrayList(args.map { if (it == "{{LIST}}") list.path else it })
                }
                val parsed = FfArgs.validate(args, root()); output = File(parsed.output)
                val r = runner().run(args, h) { sec, speed -> notifyListeners("mediaProgress", JSObject().put("id", id).put("sec", sec).put("speed", speed ?: "")) }
                if (r.cancelled) { output.delete(); call.reject("CANCELLED", "CANCELLED"); return@execute }
                if (r.exit != 0 || !output.isFile || output.length() == 0L) { output.delete(); call.reject("FFmpeg خرج بالرمز ${r.exit}: " + r.stderrTail.takeLast(600), "FFMPEG_FAILED"); return@execute }
                call.resolve(JSObject().put("path", output.path).put("size", output.length()).put("exit", r.exit))
            } catch (e: Throwable) { output?.delete(); fail(call, e) } finally { jobs.remove(id) }
        }
    }

    @PluginMethod
    fun cancel(call: PluginCall) { jobs[call.getString("id") ?: "job"]?.cancel(); call.resolve() }
}
