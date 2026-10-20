package com.dark.omninative

import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * تنزيل http(s) مع استئناف: يحفظ ما نُزّل في dest.part وبيانات التحقق (ETag/Last-Modified/الحجم) في dest.meta.
 * عند إعادة المحاولة يرسل Range + If-Range؛ إن تغيّر الملف على الخادم يبدأ من الصفر. منطق JVM نقي (يُختبر خارج الجهاز).
 */
class ResumableDownloader(private val onProgress: (received: Long, total: Long) -> Unit) {
    @Volatile var cancelled = false

    class Result(val bytes: Long, val resumedFrom: Long, val path: String)
    class DownloadException(val code: String, message: String) : Exception(message)

    private fun readMeta(f: File): Map<String, String> =
        if (!f.isFile) emptyMap() else f.readLines().mapNotNull { l -> val i = l.indexOf('='); if (i > 0) l.substring(0, i) to l.substring(i + 1) else null }.toMap()

    private fun open(url: String, headers: Map<String, String>, range: Long, validator: String?): HttpURLConnection {
        var cur = url
        for (hop in 0..5) {
            val u = URL(cur)
            if (u.protocol != "http" && u.protocol != "https") throw DownloadException("BAD_URL", "يُسمح فقط برابط http/https")
            val c = u.openConnection() as HttpURLConnection
            c.instanceFollowRedirects = false
            c.connectTimeout = 15000
            c.readTimeout = 30000
            c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14) OMNIFORGE")
            c.setRequestProperty("Accept-Encoding", "identity")
            for ((k, v) in headers) {
                val kl = k.lowercase()
                if (kl == "range" || kl == "if-range" || kl == "host" || kl.startsWith("proxy-")) continue
                c.setRequestProperty(k, v)
            }
            if (range > 0) {
                c.setRequestProperty("Range", "bytes=$range-")
                if (validator != null) c.setRequestProperty("If-Range", validator)
            }
            val code = c.responseCode
            if (code in 301..308 && code != 304) {
                val loc = c.getHeaderField("Location") ?: throw DownloadException("HTTP_$code", "إعادة توجيه بلا عنوان")
                cur = URL(u, loc).toString()
                c.disconnect()
                continue
            }
            return c
        }
        throw DownloadException("TOO_MANY_REDIRECTS", "عدد إعادات التوجيه كبير")
    }

    fun download(url: String, dest: File, headers: Map<String, String> = emptyMap()): Result {
        dest.parentFile?.mkdirs()
        val part = File(dest.path + ".part")
        val metaF = File(dest.path + ".meta")
        if (dest.isFile && !part.exists()) throw DownloadException("EXISTS", "الملف موجود مسبقاً")
        var have = if (part.isFile) part.length() else 0L
        val meta = readMeta(metaF)
        if (meta["url"] != url) { have = 0; part.delete() }
        val validator = meta["etag"] ?: meta["lastmod"]
        if (have > 0 && validator == null) { have = 0; part.delete() } // بلا مُعرِّف لا نخاطر بدمج نسخ مختلفة
        val c = open(url, headers, have, validator)
        try {
            val code = c.responseCode
            var append = false
            var total = -1L
            when (code) {
                206 -> {
                    val cr = c.getHeaderField("Content-Range") // bytes a-b/total
                    val m = cr?.let { Regex("bytes\\s+(\\d+)-(\\d+)/(\\d+|\\*)").find(it) }
                    val start = m?.groupValues?.get(1)?.toLongOrNull()
                    if (m == null || start != have) throw DownloadException("BAD_RANGE", "استجابة Range غير متوافقة")
                    total = m.groupValues[3].toLongOrNull() ?: -1L
                    append = true
                }
                200 -> { have = 0; total = c.contentLengthLong }
                416 -> {
                    // الجزء المحفوظ ربما اكتمل أصلاً
                    val tot = meta["total"]?.toLongOrNull()
                    if (tot != null && have == tot) { part.renameTo(dest); metaF.delete(); return Result(have, have, dest.path) }
                    part.delete(); metaF.delete()
                    throw DownloadException("RANGE_RESET", "تغيّر الملف على الخادم؛ أعد المحاولة للبدء من جديد")
                }
                else -> throw DownloadException("HTTP_$code", "HTTP $code")
            }
            val et = c.getHeaderField("ETag")?.takeIf { !it.startsWith("W/") }
            val lm = c.getHeaderField("Last-Modified")
            if (!append) {
                part.delete()
                metaF.writeText(buildString {
                    append("url=").append(url).append('\n')
                    if (et != null) append("etag=").append(et).append('\n')
                    if (lm != null) append("lastmod=").append(lm).append('\n')
                    if (total > 0) append("total=").append(total).append('\n')
                })
            }
            val resumedFrom = if (append) have else 0L
            var got = have
            FileOutputStream(part, append).use { out ->
                c.inputStream.use { input ->
                    val buf = ByteArray(128 * 1024)
                    var last = 0L
                    while (true) {
                        if (cancelled) throw DownloadException("CANCELLED", "أُلغي التنزيل")
                        val n = input.read(buf)
                        if (n < 0) break
                        out.write(buf, 0, n)
                        got += n
                        val now = System.currentTimeMillis()
                        if (now - last > 250) { last = now; onProgress(got, total) }
                    }
                    out.fd.sync()
                }
            }
            if (total > 0 && got != total) throw DownloadException("INCOMPLETE", "انقطع التنزيل ($got من $total) — أعد المحاولة للاستئناف")
            onProgress(got, if (total > 0) total else got)
            if (dest.exists()) dest.delete()
            if (!part.renameTo(dest)) throw DownloadException("RENAME", "تعذر إنهاء الملف")
            metaF.delete()
            return Result(got, resumedFrom, dest.path)
        } finally {
            try { c.disconnect() } catch (e: Exception) {}
        }
    }
}
