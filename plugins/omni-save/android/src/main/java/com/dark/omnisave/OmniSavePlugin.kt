package com.dark.omnisave

import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * OmniSave — يخدم واجهة OMNIFORGE:
 *  begin/chunk/finish/abort : حفظ ملف على دفعات إلى التنزيلات/OMNIFORGE
 *  download/cancelDownload  : تنزيل رابط مباشر إلى الملف مع حدث downloadProgress
 *  saveFromPath             : نقل ملف مؤقت (من omni-video) إلى التنزيلات/OMNIFORGE مع saveProgress
 *  request                  : طلب HTTP أصلي (بلا CORS)
 *  info                     : معلومات المحرك
 *
 * ملاحظة: لم يُجمَّع هذا الملف في بيئة التطوير (لا Android SDK هناك)؛ يُجمَّع أول مرة في GitHub Actions.
 */
@CapacitorPlugin(name = "OmniSave")
class OmniSavePlugin : Plugin() {

    private class Sink(val out: OutputStream, val finish: () -> String, val abort: () -> Unit)

    private val sinks = ConcurrentHashMap<String, Sink>()
    private val pool = Executors.newCachedThreadPool()
    @Volatile private var dlCancel = false

    private fun safeName(n: String?): String {
        val s = (n ?: "file").replace(Regex("[\\\\/:*?\"<>|\\u0000-\\u001f]+"), "_").trim().trim('.')
        return if (s.isEmpty()) "file" else s.take(120)
    }

    private fun openSink(ctx: Context, name: String, mime: String): Sink {
        val fname = safeName(name)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, fname)
                put(MediaStore.Downloads.MIME_TYPE, mime)
                put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/OMNIFORGE")
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val resolver = ctx.contentResolver
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: throw IllegalStateException("تعذّر إنشاء الملف في التنزيلات")
            val os = resolver.openOutputStream(uri) ?: throw IllegalStateException("تعذّر فتح الملف للكتابة")
            // MediaStore يعيد تسمية الملف تلقائياً إذا وُجد بنفس الاسم ("name (1).mp4"): نقرأ الاسم الفعلي
            var shown = fname
            try {
                resolver.query(uri, arrayOf(MediaStore.Downloads.DISPLAY_NAME), null, null, null)?.use { c ->
                    if (c.moveToFirst()) shown = c.getString(0) ?: fname
                }
            } catch (e: Exception) { /* نبقي الاسم المطلوب */ }
            return Sink(os, {
                os.close()
                val v = ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }
                resolver.update(uri, v, null, null)
                "Download/OMNIFORGE/$shown"
            }, {
                try { os.close() } catch (e: Exception) {}
                try { resolver.delete(uri, null, null) } catch (e: Exception) {}
            })
        }
        // أندرويد 9 وأقل: مجلد التطبيق الخاص على التخزين الخارجي (لا يتطلب إذناً)
        val dir = File(ctx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "OMNIFORGE")
        dir.mkdirs()
        var f = File(dir, fname)
        var i = 1
        while (f.exists()) { f = File(dir, fname.substringBeforeLast('.', fname) + "-" + i + (if (fname.contains('.')) "." + fname.substringAfterLast('.') else "")); i++ }
        val os = FileOutputStream(f)
        return Sink(os, { os.close(); f.absolutePath }, { try { os.close() } catch (e: Exception) {}; f.delete() })
    }

    @PluginMethod
    fun begin(call: PluginCall) {
        try {
            val sink = openSink(context, call.getString("name") ?: "file", call.getString("mime") ?: "application/octet-stream")
            val id = UUID.randomUUID().toString()
            sinks[id] = sink
            call.resolve(JSObject().put("id", id))
        } catch (e: Exception) { call.reject(e.message ?: "begin failed") }
    }

    @PluginMethod
    fun chunk(call: PluginCall) {
        val s = sinks[call.getString("id") ?: ""] ?: return call.reject("معرّف الحفظ غير معروف")
        try {
            val bytes = Base64.decode(call.getString("data") ?: "", Base64.DEFAULT)
            s.out.write(bytes)
            call.resolve()
        } catch (e: Exception) { call.reject(e.message ?: "chunk failed") }
    }

    @PluginMethod
    fun finish(call: PluginCall) {
        val id = call.getString("id") ?: ""
        val s = sinks.remove(id) ?: return call.reject("معرّف الحفظ غير معروف")
        try { call.resolve(JSObject().put("path", s.finish())) } catch (e: Exception) { call.reject(e.message ?: "finish failed") }
    }

    @PluginMethod
    fun abort(call: PluginCall) {
        sinks.remove(call.getString("id") ?: "")?.let { it.abort() }
        call.resolve()
    }

    @PluginMethod
    fun download(call: PluginCall) {
        val url = call.getString("url") ?: return call.reject("الرابط مفقود")
        if (!url.startsWith("http://") && !url.startsWith("https://")) return call.reject("http/https فقط")
        val name = call.getString("name") ?: "download"
        dlCancel = false
        pool.execute {
            var conn: HttpURLConnection? = null
            var sink: Sink? = null
            try {
                conn = URL(url).openConnection() as HttpURLConnection
                conn.connectTimeout = 20000; conn.readTimeout = 30000; conn.instanceFollowRedirects = true
                conn.setRequestProperty("User-Agent", "OMNIFORGE/1.0")
                val code = conn.responseCode
                if (code !in 200..299) throw IllegalStateException("الخادم أعاد الحالة $code")
                val total = conn.contentLengthLong
                val ctype = conn.contentType ?: ""
                val sk = openSink(context, name, ctype.substringBefore(';').ifEmpty { "application/octet-stream" })
                sink = sk
                val buf = ByteArray(64 * 1024)
                var got = 0L
                var lastEmit = 0L
                conn.inputStream.use { input ->
                    while (true) {
                        if (dlCancel) throw InterruptedException("cancelled")
                        val n = input.read(buf)
                        if (n < 0) break
                        sk.out.write(buf, 0, n)
                        got += n
                        val now = System.currentTimeMillis()
                        if (now - lastEmit > 250) {
                            lastEmit = now
                            notifyListeners("downloadProgress", JSObject().put("received", got).put("total", total))
                        }
                    }
                }
                notifyListeners("downloadProgress", JSObject().put("received", got).put("total", total))
                val path = sk.finish()
                call.resolve(JSObject().put("path", path).put("bytes", got).put("contentType", ctype))
            } catch (e: Exception) {
                try { sink?.let { it.abort() } } catch (e2: Exception) {}
                call.reject(if (e is InterruptedException) "cancelled" else (e.message ?: "download failed"))
            } finally { conn?.disconnect() }
        }
    }

    /**
     * saveFromPath: ينقل ملفاً أنتجه بلاجن آخر (omni-video) من مجلد التطبيق المؤقت إلى التنزيلات/OMNIFORGE
     * عبر نفس منطق الحفظ (MediaStore). يسمح فقط بالملفات داخل cacheDir/omni-video/ لمنع قراءة ملفات التطبيق الأخرى.
     * يبثّ saveProgress {received,total}. deleteSource=true يحذف الأصل بعد النجاح.
     */
    @PluginMethod
    fun saveFromPath(call: PluginCall) {
        val path = call.getString("path") ?: return call.reject("المسار مفقود")
        val name = call.getString("name") ?: "file"
        val mime = call.getString("mime") ?: "application/octet-stream"
        val del = call.getBoolean("deleteSource") ?: false
        pool.execute {
            var sink: Sink? = null
            try {
                val base = File(context.cacheDir, "omni-video").canonicalFile
                val src = File(path).canonicalFile
                if (!src.path.startsWith(base.path + File.separator) || !src.isFile) throw IllegalArgumentException("مسار غير مسموح أو الملف غير موجود")
                val total = src.length()
                val sk = openSink(context, name, mime)
                sink = sk
                var got = 0L
                var lastEmit = 0L
                src.inputStream().use { input ->
                    val buf = ByteArray(256 * 1024)
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        sk.out.write(buf, 0, n)
                        got += n
                        val now = System.currentTimeMillis()
                        if (now - lastEmit > 250) {
                            lastEmit = now
                            notifyListeners("saveProgress", JSObject().put("received", got).put("total", total))
                        }
                    }
                }
                notifyListeners("saveProgress", JSObject().put("received", got).put("total", total))
                val saved = sk.finish()
                sink = null
                if (del) {
                    src.delete()
                    val parent = src.parentFile
                    if (parent != null && parent != base) parent.delete() // لا يحذف إلا إن كان فارغاً
                }
                call.resolve(JSObject().put("path", saved).put("bytes", got))
            } catch (e: Exception) {
                try { sink?.let { it.abort() } } catch (e2: Exception) {}
                call.reject(e.message ?: "save failed")
            }
        }
    }

    @PluginMethod
    fun cancelDownload(call: PluginCall) { dlCancel = true; call.resolve() }

    @PluginMethod
    fun request(call: PluginCall) {
        val url = call.getString("url") ?: return call.reject("الرابط مفقود")
        if (!url.startsWith("http://") && !url.startsWith("https://")) return call.reject("http/https فقط")
        val method = (call.getString("method") ?: "GET").uppercase()
        val body = call.getString("body") ?: ""
        val timeout = call.getInt("timeoutMs") ?: 20000
        val maxBytes = call.getInt("maxBytes") ?: (8 * 1024 * 1024)
        val headers = call.getObject("headers")
        pool.execute {
            var conn: HttpURLConnection? = null
            try {
                conn = URL(url).openConnection() as HttpURLConnection
                conn.connectTimeout = timeout; conn.readTimeout = timeout
                conn.instanceFollowRedirects = true
                conn.requestMethod = method
                if (headers != null) {
                    val it = headers.keys()
                    while (it.hasNext()) { val k = it.next(); conn.setRequestProperty(k, headers.optString(k)) }
                }
                if (body.isNotEmpty() && method != "GET" && method != "HEAD") {
                    conn.doOutput = true
                    conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
                }
                val code = conn.responseCode
                val stream = if (code >= 400) conn.errorStream else conn.inputStream
                val bos = java.io.ByteArrayOutputStream()
                var truncated = false
                if (stream != null) stream.use { s ->
                    val buf = ByteArray(16 * 1024)
                    while (true) {
                        val n = s.read(buf); if (n < 0) break
                        if (bos.size() + n > maxBytes) { bos.write(buf, 0, maxBytes - bos.size()); truncated = true; break }
                        bos.write(buf, 0, n)
                    }
                }
                val hs = JSObject()
                for ((k, v) in conn.headerFields) if (k != null) hs.put(k.lowercase(), v.joinToString(", "))
                call.resolve(JSObject()
                    .put("status", code).put("statusText", conn.responseMessage ?: "")
                    .put("headers", hs).put("url", conn.url.toString()).put("truncated", truncated)
                    .put("bodyBase64", Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP)))
            } catch (e: Exception) { call.reject(e.message ?: "request failed") }
            finally { conn?.disconnect() }
        }
    }

    @PluginMethod
    fun info(call: PluginCall) {
        call.resolve(JSObject().put("name", "OmniSave").put("version", "1.0.0").put("sdk", Build.VERSION.SDK_INT))
    }
}
