package com.dark.omninative

import android.content.Intent
import android.net.Uri
import android.os.Environment
import android.os.StatFs
import android.provider.OpenableColumns
import android.util.Base64
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * OmniNative — أدوات أصلية لواجهة OMNIFORGE (كلها تعمل على الجهاز، لا خادم):
 *  job / cleanup                : مجلد عمل مؤقت داخل cacheDir/omni-work
 *  pickFiles                    : اختيار ملفات (SAF) ونسخها بالبث إلى مجلد العمل دون المرور بالـWebView
 *  stageBegin/Chunk/End         : نقل Blob من الواجهة إلى مجلد العمل على دفعات
 *  tcpCheck / dnsResolve        : فحص منفذ TCP وتحليل DNS بمحلّل النظام
 *  storageInfo                  : مساحة التخزين ومساحة التطبيق
 *  pickFolder / scanFolder      : اختيار مجلد وتحليل محتواه أصلياً
 *  download / cancelDownload    : تنزيل قابل للاستئناف (Range) إلى مجلد العمل
 *  signApk / verifyApk          : محاذاة وتوقيع APK والتحقق منه عبر apksig
 *
 * ملاحظة: يُجمَّع أول مرة في GitHub Actions؛ في بيئة التطوير جُمّع فقط مقابل مجسّمات (stubs) دون اختبار على جهاز.
 */
@CapacitorPlugin(name = "OmniNative")
class OmniNativePlugin : Plugin() {
    private val pool = Executors.newCachedThreadPool()
    private val stages = ConcurrentHashMap<String, Pair<OutputStream, File>>()
    private val downloads = ConcurrentHashMap<String, ResumableDownloader>()
    private val scans = ConcurrentHashMap<String, DocScan>()

    private fun root(): File = File(context.cacheDir, "omni-work").also { it.mkdirs() }
    private fun inWork(f: File): Boolean {
        val r = root().canonicalPath
        val p = f.canonicalPath
        return p.startsWith(r + File.separator)
    }
    private fun safeName(n: String?): String {
        val s = (n ?: "file").replace(Regex("[\\\\/:*?\"<>|\\u0000-\\u001f]"), "_").trim().trimStart('.')
        return (if (s.isEmpty()) "file" else s).take(120)
    }
    private fun workFile(path: String?): File {
        val f = File(path ?: throw IllegalArgumentException("المسار مفقود"))
        if (!inWork(f)) throw IllegalArgumentException("مسار خارج مجلد العمل")
        return f
    }
    private fun err(call: PluginCall, e: Throwable, code: String? = null) {
        val m = e.message ?: e.javaClass.simpleName
        if (code != null) call.reject(m, code) else call.reject(m)
    }

    @PluginMethod
    fun job(call: PluginCall) {
        pool.execute {
            try {
                val now = System.currentTimeMillis()
                root().listFiles()?.forEach { d ->
                    val maxAge = if (d.name.startsWith("dl-")) 7L * 86400000 else 86400000L
                    if (now - d.lastModified() > maxAge) d.deleteRecursively()
                }
                val d = File(root(), UUID.randomUUID().toString().substring(0, 8))
                d.mkdirs()
                call.resolve(JSObject().put("dir", d.path))
            } catch (e: Exception) { err(call, e) }
        }
    }

    @PluginMethod
    fun cleanup(call: PluginCall) {
        pool.execute {
            try {
                val d = workFile(call.getString("dir"))
                if (d.canonicalPath != root().canonicalPath) d.deleteRecursively()
                call.resolve()
            } catch (e: Exception) { err(call, e) }
        }
    }

    // ───── اختيار الملفات ─────
    @PluginMethod
    fun pickFiles(call: PluginCall) {
        try {
            workFile(call.getString("dir") ?: throw IllegalArgumentException("dir مفقود"))
            val i = Intent(Intent.ACTION_OPEN_DOCUMENT)
            i.addCategory(Intent.CATEGORY_OPENABLE)
            i.setType("*/*")
            val mimes = call.getArray("mimes")
            if (mimes != null && mimes.length() > 0) {
                val arr = Array(mimes.length()) { k -> mimes.getString(k) }
                i.putExtra(Intent.EXTRA_MIME_TYPES, arr)
            }
            i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, call.getBoolean("multiple", false) ?: false)
            startActivityForResult(call, i, "pickFilesResult")
        } catch (e: Exception) { err(call, e) }
    }

    @ActivityCallback
    private fun pickFilesResult(call: PluginCall?, result: ActivityResult?) {
        if (call == null) return
        if (result == null || result.resultCode != android.app.Activity.RESULT_OK) { call.reject("CANCELLED", "CANCELLED"); return }
        val data = result.data
        val uris = ArrayList<Uri>()
        val clip = data?.clipData
        if (clip != null) { for (k in 0 until clip.itemCount) uris.add(clip.getItemAt(k).uri) }
        else data?.data?.let { uris.add(it) }
        if (uris.isEmpty()) { call.reject("CANCELLED", "CANCELLED"); return }
        pool.execute {
            try {
                val dir = workFile(call.getString("dir"))
                val cr = context.contentResolver
                val out = JSArray()
                var idx = 0
                for (u in uris) {
                    var name = "file"; var size = -1L
                    cr.query(u, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
                        if (c.moveToFirst()) {
                            val a = c.getColumnIndex(OpenableColumns.DISPLAY_NAME); val b = c.getColumnIndex(OpenableColumns.SIZE)
                            if (a >= 0) name = c.getString(a) ?: name
                            if (b >= 0 && !c.isNull(b)) size = c.getLong(b)
                        }
                    }
                    val dest = File(dir, (idx++).toString() + "_" + safeName(name))
                    var got = 0L; var last = 0L
                    (cr.openInputStream(u) ?: throw IllegalStateException("تعذر فتح الملف")).use { input ->
                        FileOutputStream(dest).use { o ->
                            val buf = ByteArray(256 * 1024)
                            while (true) {
                                val n = input.read(buf); if (n < 0) break
                                o.write(buf, 0, n); got += n
                                val now = System.currentTimeMillis()
                                if (now - last > 250) { last = now; notifyListeners("nativeProgress", JSObject().put("phase", "copy").put("name", name).put("received", got).put("total", size)) }
                            }
                        }
                    }
                    out.put(JSObject().put("path", dest.path).put("name", name).put("size", got).put("mime", cr.getType(u) ?: ""))
                }
                call.resolve(JSObject().put("files", out))
            } catch (e: Exception) { err(call, e) }
        }
    }

    // ───── نقل Blob على دفعات ─────
    @PluginMethod
    fun stageBegin(call: PluginCall) {
        try {
            val dir = workFile(call.getString("dir"))
            val f = File(dir, safeName(call.getString("name")))
            val id = UUID.randomUUID().toString()
            stages[id] = Pair(FileOutputStream(f), f)
            call.resolve(JSObject().put("id", id).put("path", f.path))
        } catch (e: Exception) { err(call, e) }
    }

    @PluginMethod
    fun stageChunk(call: PluginCall) {
        try {
            val s = stages[call.getString("id")] ?: throw IllegalStateException("جلسة غير معروفة")
            val b = Base64.decode(call.getString("data") ?: "", Base64.DEFAULT)
            s.first.write(b)
            call.resolve()
        } catch (e: Exception) { err(call, e) }
    }

    @PluginMethod
    fun stageEnd(call: PluginCall) {
        try {
            val id = call.getString("id") ?: ""
            val s = stages.remove(id) ?: throw IllegalStateException("جلسة غير معروفة")
            s.first.flush(); s.first.close()
            call.resolve(JSObject().put("path", s.second.path).put("size", s.second.length()))
        } catch (e: Exception) { err(call, e) }
    }

    // ───── الشبكة ─────
    @PluginMethod
    fun tcpCheck(call: PluginCall) {
        pool.execute {
            try {
                val r = NetProbe.tcp(call.getString("host") ?: "", call.getInt("port", 0) ?: 0, call.getInt("timeoutMs", 3000) ?: 3000)
                val o = JSObject().put("open", r.open).put("ms", r.ms)
                if (r.error != null) o.put("error", r.error)
                if (r.address != null) o.put("address", r.address)
                call.resolve(o)
            } catch (e: IllegalArgumentException) { err(call, e, "INVALID") } catch (e: Exception) { err(call, e) }
        }
    }

    @PluginMethod
    fun dnsResolve(call: PluginCall) {
        pool.execute {
            try {
                val r = NetProbe.dns(call.getString("host") ?: "")
                val arr = JSArray(); r.addresses.forEach { arr.put(it) }
                call.resolve(JSObject().put("addresses", arr).put("ms", r.ms))
            } catch (e: IllegalArgumentException) { err(call, e, "INVALID") }
            catch (e: java.net.UnknownHostException) { err(call, e, "NXDOMAIN") }
            catch (e: Exception) { err(call, e) }
        }
    }

    // ───── التخزين ─────
    private fun dirSize(d: File?, limit: Int = 200000): Long {
        if (d == null || !d.exists()) return 0
        var total = 0L; var n = 0
        val st = ArrayList<File>(); st.add(d)
        while (st.isNotEmpty() && n < limit) {
            val f = st.removeAt(st.size - 1)
            val kids = f.listFiles() ?: continue
            for (k in kids) { n++; if (k.isDirectory) st.add(k) else total += k.length() }
        }
        return total
    }
    private fun vol(f: File?): JSObject? {
        if (f == null) return null
        return try { val s = StatFs(f.path); JSObject().put("total", s.totalBytes).put("free", s.availableBytes) } catch (e: Exception) { null }
    }

    @PluginMethod
    fun storageInfo(call: PluginCall) {
        pool.execute {
            try {
                val o = JSObject()
                vol(context.filesDir)?.let { o.put("internal", it) }
                vol(Environment.getExternalStorageDirectory())?.let { o.put("shared", it) }
                val app = JSObject()
                app.put("files", dirSize(context.filesDir)); app.put("cache", dirSize(context.cacheDir)); app.put("externalCache", dirSize(context.externalCacheDir))
                o.put("app", app)
                call.resolve(o)
            } catch (e: Exception) { err(call, e) }
        }
    }

    @PluginMethod
    fun pickFolder(call: PluginCall) {
        try {
            val i = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            startActivityForResult(call, i, "pickFolderResult")
        } catch (e: Exception) { err(call, e) }
    }

    @ActivityCallback
    private fun pickFolderResult(call: PluginCall?, result: ActivityResult?) {
        if (call == null) return
        val u = result?.data?.data
        if (result == null || result.resultCode != android.app.Activity.RESULT_OK || u == null) { call.reject("CANCELLED", "CANCELLED"); return }
        try { context.contentResolver.takePersistableUriPermission(u, Intent.FLAG_GRANT_READ_URI_PERMISSION) } catch (e: Exception) {}
        val id = try { android.provider.DocumentsContract.getTreeDocumentId(u) } catch (e: Exception) { "" }
        call.resolve(JSObject().put("uri", u.toString()).put("name", id.substringAfterLast(':').substringAfterLast('/')))
    }

    @PluginMethod
    fun scanFolder(call: PluginCall) {
        val uri = call.getString("uri") ?: return call.reject("uri مفقود")
        val id = call.getString("id") ?: "scan"
        pool.execute {
            val sc = DocScan(context.contentResolver) { f, b -> notifyListeners("nativeProgress", JSObject().put("phase", "scan").put("id", id).put("files", f).put("bytes", b)) }
            scans[id] = sc
            try {
                val r = sc.scan(Uri.parse(uri))
                val ext = JSArray(); r.byExt.entries.sortedByDescending { it.value.bytes }.take(60).forEach { ext.put(JSObject().put("ext", it.key).put("count", it.value.count).put("bytes", it.value.bytes)) }
                val big = JSArray(); r.largest.forEach { big.put(JSObject().put("name", it.name).put("size", it.size).put("path", it.path)) }
                call.resolve(JSObject().put("files", r.files).put("dirs", r.dirs).put("bytes", r.bytes).put("byExt", ext).put("largest", big).put("truncated", r.truncated))
            } catch (e: InterruptedException) { call.reject("CANCELLED", "CANCELLED") }
            catch (e: SecurityException) { err(call, e, "PERMISSION") }
            catch (e: Exception) { err(call, e) }
            finally { scans.remove(id) }
        }
    }

    @PluginMethod
    fun cancelScan(call: PluginCall) { scans[call.getString("id") ?: "scan"]?.cancelled = true; call.resolve() }

    // ───── التنزيل القابل للاستئناف ─────
    @PluginMethod
    fun download(call: PluginCall) {
        val url = call.getString("url") ?: return call.reject("الرابط مفقود")
        val id = call.getString("id") ?: "dl"
        val name = safeName(call.getString("name"))
        val hdrs = HashMap<String, String>()
        call.getObject("headers")?.let { h -> val it = h.keys(); while (it.hasNext()) { val k = it.next(); hdrs[k] = h.optString(k) } }
        pool.execute {
            val key = MessageDigest.getInstance("SHA-256").digest((url + "|" + name).toByteArray()).joinToString("") { "%02x".format(it) }.substring(0, 16)
            val dir = File(root(), "dl-$key").also { it.mkdirs() }
            dir.setLastModified(System.currentTimeMillis())
            val dl = ResumableDownloader { r, t -> notifyListeners("nativeProgress", JSObject().put("phase", "download").put("id", id).put("received", r).put("total", t)) }
            downloads[id] = dl
            try {
                val r = dl.download(url, File(dir, name), hdrs)
                call.resolve(JSObject().put("path", r.path).put("bytes", r.bytes).put("resumedFrom", r.resumedFrom))
            } catch (e: ResumableDownloader.DownloadException) { call.reject(e.message, e.code) }
            catch (e: Exception) { call.reject((e.message ?: e.javaClass.simpleName), "NETWORK") }
            finally { downloads.remove(id) }
        }
    }

    @PluginMethod
    fun cancelDownload(call: PluginCall) { downloads[call.getString("id") ?: "dl"]?.cancelled = true; call.resolve() }

    // ───── توقيع APK ─────
    @PluginMethod
    fun signApk(call: PluginCall) {
        pool.execute {
            try {
                val input = workFile(call.getString("input"))
                val dir = input.parentFile ?: throw IllegalArgumentException("مسار غير صالح")
                val output = File(dir, safeName(call.getString("outName") ?: "signed.apk"))
                if (output.canonicalPath == input.canonicalPath) throw IllegalArgumentException("اسم المخرج يطابق المدخل")
                val key = Base64.decode(call.getString("key") ?: throw IllegalArgumentException("المفتاح مفقود"), Base64.DEFAULT)
                val certs = call.getArray("certs") ?: throw IllegalArgumentException("الشهادة مفقودة")
                val list = ArrayList<ByteArray>(); for (k in 0 until certs.length()) list.add(Base64.decode(certs.getString(k), Base64.DEFAULT))
                val r = ApkSign.sign(input, output, dir, key, list, call.getString("alg") ?: "RSA",
                    call.getBoolean("v1", true) ?: true, call.getBoolean("v2", true) ?: true, call.getBoolean("v3", true) ?: true)
                call.resolve(JSObject().put("path", output.path).put("size", output.length()).put("alignedEntries", r.aligned))
            } catch (e: IllegalArgumentException) { err(call, e, "INVALID") }
            catch (e: Exception) { err(call, e, "SIGN_FAILED") }
        }
    }

    @PluginMethod
    fun verifyApk(call: PluginCall) {
        pool.execute {
            try {
                val r = ApkSign.verify(workFile(call.getString("path")))
                val errs = JSArray(); r.errors.take(20).forEach { errs.put(it) }
                val warns = JSArray(); r.warnings.take(20).forEach { warns.put(it) }
                val sha = JSArray(); r.certSha256.forEach { sha.put(it) }
                val subj = JSArray(); r.certSubjects.forEach { subj.put(it) }
                call.resolve(JSObject().put("verified", r.verified).put("v1", r.v1).put("v2", r.v2).put("v3", r.v3).put("errors", errs).put("warnings", warns).put("certSha256", sha).put("certSubjects", subj))
            } catch (e: Exception) { err(call, e, "VERIFY_FAILED") }
        }
    }

    @PluginMethod
    fun info(call: PluginCall) {
        call.resolve(JSObject().put("ok", true).put("version", 1))
    }
}
