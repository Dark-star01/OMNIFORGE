package com.dark.omniocr

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.googlecode.tesseract.android.TessBaseAPI
import java.io.File
import java.util.concurrent.Executors

/**
 * OmniOcr — OCR على الجهاز (Tesseract). الصور فقط (لا OCR لملفات PDF الممسوحة).
 *  info      : النماذج المتاحة في assets/tessdata (تُنزَّل في CI بواسطة hooks/pre-build.sh)
 *  recognize : {path (ملف داخل cacheDir/omni-work)، langs: "ara+eng"، psm: "auto"|"block"|"line"} → {text, confidence, langs}
 * TessBaseAPI ليست آمنة للخيوط: خيط واحد وبنسخة جديدة لكل طلب.
 *
 * ملاحظة: لم يُجمَّع مقابل المكتبة الحقيقية ولم يُجرَّب على جهاز؛ جُمّع مقابل مجسّم للواجهة المستخدمة فقط.
 */
@CapacitorPlugin(name = "OmniOcr")
class OmniOcrPlugin : Plugin() {
    private val single = Executors.newSingleThreadExecutor()
    private val maxSide = 3000

    private fun work() = File(context.cacheDir, "omni-work")
    private fun dataRoot() = File(context.filesDir, "tesseract")

    /** ينسخ النماذج من assets إلى filesDir/tesseract/tessdata (مرة واحدة أو عند تغيّر الحجم). يرجع قائمة اللغات الجاهزة. */
    private fun prepare(): List<String> {
        val dst = File(dataRoot(), "tessdata").also { it.mkdirs() }
        val names = context.assets.list("tessdata")?.filter { it.endsWith(".traineddata") } ?: emptyList()
        val ready = ArrayList<String>()
        for (n in names) {
            val f = File(dst, n)
            val len = try { context.assets.openFd("tessdata/$n").use { it.length } } catch (e: Exception) { -1L }
            if (!f.exists() || (len > 0 && f.length() != len)) {
                val tmp = File(dst, "$n.part")
                context.assets.open("tessdata/$n").use { i -> tmp.outputStream().use { o -> i.copyTo(o) } }
                if (!tmp.renameTo(f)) { f.delete(); tmp.renameTo(f) }
            }
            if (f.length() > 100_000) ready.add(n.removeSuffix(".traineddata"))
        }
        return ready
    }

    @PluginMethod
    fun info(call: PluginCall) {
        single.execute {
            try {
                val l = prepare(); val a = JSArray(); l.forEach { a.put(it) }
                call.resolve(JSObject().put("ready", l.isNotEmpty()).put("langs", a).put("engine", "tesseract"))
            } catch (e: Throwable) { call.resolve(JSObject().put("ready", false).put("langs", JSArray()).put("error", e.message ?: e.javaClass.simpleName)) }
        }
    }

    @PluginMethod
    fun recognize(call: PluginCall) {
        single.execute {
            var api: TessBaseAPI? = null; var bmp: Bitmap? = null
            try {
                val f = File(call.getString("path") ?: throw IllegalArgumentException("المسار مفقود"))
                if (!f.canonicalPath.startsWith(work().canonicalPath + File.separator) || !f.isFile) throw IllegalArgumentException("ملف خارج مجلد العمل أو غير موجود")
                val have = prepare(); if (have.isEmpty()) throw IllegalStateException("OCR_DATA_MISSING: لم تُضمَّن نماذج اللغات في هذا البناء (تعذّر تنزيلها في CI)")
                val req = (call.getString("langs") ?: "eng").split('+').map { it.trim() }.filter { Regex("^[a-z_]{2,12}$").matches(it) }
                val use = req.filter { it in have }; if (use.isEmpty()) throw IllegalArgumentException("اللغات المطلوبة غير متوفرة. المتوفر: " + have.joinToString("+"))
                val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }; BitmapFactory.decodeFile(f.path, o)
                if (o.outWidth <= 0 || o.outHeight <= 0) throw IllegalArgumentException("تعذّر قراءة الصورة")
                var ss = 1; while (maxOf(o.outWidth, o.outHeight) / ss > maxSide) ss *= 2
                bmp = BitmapFactory.decodeFile(f.path, BitmapFactory.Options().apply { inSampleSize = ss; inPreferredConfig = Bitmap.Config.ARGB_8888 }) ?: throw IllegalStateException("تعذّر فك الصورة")
                api = TessBaseAPI()
                if (!api.init(dataRoot().path, use.joinToString("+"))) throw IllegalStateException("فشل تهيئة محرك OCR")
                api.setPageSegMode(when (call.getString("psm")) { "block" -> TessBaseAPI.PageSegMode.PSM_SINGLE_BLOCK; "line" -> TessBaseAPI.PageSegMode.PSM_SINGLE_LINE; else -> TessBaseAPI.PageSegMode.PSM_AUTO })
                api.setImage(bmp)
                val text = api.getUTF8Text() ?: ""
                val conf = api.meanConfidence()
                call.resolve(JSObject().put("text", text).put("confidence", conf).put("langs", use.joinToString("+")).put("width", bmp.width).put("height", bmp.height))
            } catch (e: IllegalArgumentException) { call.reject(e.message ?: "INVALID", "INVALID") }
            catch (e: OutOfMemoryError) { call.reject("نفدت الذاكرة: جرّب صورة أصغر", "OOM") }
            catch (e: Throwable) { val m = e.message ?: e.javaClass.simpleName; call.reject(m, if (m.startsWith("OCR_DATA_MISSING")) "OCR_DATA_MISSING" else "OCR_FAILED") }
            finally { try { api?.recycle() } catch (_: Throwable) {}; bmp?.recycle() }
        }
    }
}
