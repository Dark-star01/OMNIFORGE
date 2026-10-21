package com.dark.omnillm

import android.app.ActivityManager
import android.content.ComponentCallbacks2
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.util.concurrent.Executors

/**
 * OmniLlm — محرك ذكاء اصطناعي محلي (llama.cpp / GGUF) لأداة Prompt Forge. لا اتصال بالشبكة ولا نموذج داخل APK.
 *
 * العقد (docs/PROMPT_FORGE.md):
 *  info()                      → {available, ready, loaded, name?, ctx?, modelSize?, memAvailable?, memTotal?, processRss?, runtime, abi, modelsDir, …}
 *  pickModel()                 → {uri, name, size}            (منتقي ملفات النظام SAF، بلا نسخ الملف ولا إذن تخزين)
 *  listModels()                → {dir, models:[{name, path, size}]}   (المجلد الخاص بالتطبيق: adb push إليه بلا أذونات)
 *  stat({path|uri})            → {exists, readable, size, name, gguf}
 *  load({path|uri, nCtx?, nThreads?}) → {ctx, name?, modelSize, …}   (يعيد استخدام النموذج المحمّل لنفس المصدر)
 *  unload() · cancel()
 *  tokenize({text})            → {count}
 *  generate({system, user, template, assistantPrefix?, maxTokens, temperature, topK?, topP?, minP?, repeatPenalty?, seed?})
 *                              → {text, promptTokens, generatedTokens, cachedTokens, truncated, ms, promptMs, genMs, tokensPerSec}
 * الأخطاء (call.reject(message, code)): UNAVAILABLE · FILE_NOT_FOUND · PERMISSION_DENIED · INVALID_MODEL · INSUFFICIENT_MEMORY ·
 *   LOAD_FAILED · NOT_LOADED · CONTEXT_OVERFLOW · CANCELLED · GENERATE_FAILED · INVALID
 * حدث: modelUnloaded {reason} عند تحرير النموذج تلقائياً بسبب ضغط الذاكرة.
 *
 * ملاحظة صدق: جُمّع هذا الملف مقابل مجسّمات الواجهة فقط؛ طبقة C++/JNI اختُبرت على Linux (انظر docs/PROMPT_FORGE.md).
 * لم يُبنَ ضمن APK ولم يُجرَّب على جهاز Android في بيئة التطوير.
 */
@CapacitorPlugin(name = "OmniLlm")
class OmniLlmPlugin : Plugin() {
    private val worker = Executors.newSingleThreadExecutor()    // load / tokenize / generate (متسلسلة)
    private val control = Executors.newSingleThreadExecutor()   // unload (يجب أن يقدر على مقاطعة generate الجارية)
    private val light = Executors.newSingleThreadExecutor()     // stat / listModels (لا تنتظر النموذج)

    private class Current(val key: String, val pfd: ParcelFileDescriptor?, val path: String, val uri: String?, val displayName: String, val fileSize: Long)
    @Volatile private var current: Current? = null
    @Volatile private var generating = false
    @Volatile private var nativeReady = false
    @Volatile private var nativeInitError: String? = null
    private val lock = Any()
    private var callbacksRegistered = false

    // ───── مساعدات ─────
    private fun bytes(s: String?) = (s ?: "").toByteArray(Charsets.UTF_8)
    private fun parse(b: ByteArray): JSObject = JSObject(String(b, Charsets.UTF_8))
    private fun modelsDir(): File? = try { context.getExternalFilesDir("models")?.also { it.mkdirs() } } catch (e: Exception) { null }
    private fun availMem(): Long = try {
        val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val mi = ActivityManager.MemoryInfo(); am.getMemoryInfo(mi); mi.availMem
    } catch (e: Exception) { 0L }

    /** يهيّئ المكتبة الأصلية مرة واحدة. يرجع null عند النجاح أو نص الخطأ. */
    private fun ensureNative(): String? {
        if (nativeReady) return null
        synchronized(lock) {
            if (nativeReady) return null
            if (!OmniLlmNative.available) return "Native library not available for this device (${OmniLlmNative.loadError ?: "unknown"})"
            nativeInitError?.let { return it }
            try {
                val r = parse(OmniLlmNative.nativeInit(bytes(context.applicationInfo.nativeLibraryDir)))
                if (!r.optBoolean("ok", false)) { nativeInitError = r.optString("message", "native init failed"); return nativeInitError }
                nativeReady = true; registerCallbacks(); return null
            } catch (e: Throwable) { nativeInitError = e.message ?: e.javaClass.simpleName; return nativeInitError }
        }
    }

    private fun registerCallbacks() {
        if (callbacksRegistered) return
        callbacksRegistered = true
        try {
            context.registerComponentCallbacks(object : ComponentCallbacks2 {
                override fun onTrimMemory(level: Int) {
                    // التطبيق في الخلفية/مخبأ (≥40) أو ضغط حرج أثناء العمل (15): حرّر النموذج إن لم يكن هناك توليد جارٍ
                    if ((level >= ComponentCallbacks2.TRIM_MEMORY_BACKGROUND || level == ComponentCallbacks2.TRIM_MEMORY_RUNNING_CRITICAL) && !generating && current != null) releaseModel("trim-memory-$level")
                }
                override fun onConfigurationChanged(newConfig: Configuration) {}
                override fun onLowMemory() { if (!generating && current != null) releaseModel("low-memory") }
            })
        } catch (e: Throwable) { /* غير حرج */ }
    }

    private fun releaseModel(reason: String) {
        control.execute {
            try { OmniLlmNative.nativeUnload() } catch (e: Throwable) { /* ignore */ }
            val c = synchronized(lock) { val x = current; current = null; x }
            try { c?.pfd?.close() } catch (e: Exception) { /* ignore */ }
            if (c != null) notifyListeners("modelUnloaded", JSObject().put("reason", reason))
        }
    }

    private fun rejectWith(call: PluginCall, r: JSObject) {
        val code = r.optString("code", "GENERATE_FAILED"); call.reject(r.optString("message", code), code)
    }
    private fun rejectUnavailable(call: PluginCall, why: String) = call.reject("OmniLlm unavailable: $why", "UNAVAILABLE")

    private fun stripName(n: String) = n.removeSuffix(".gguf").removeSuffix(".GGUF")

    private fun queryUri(u: Uri): Pair<String, Long> {
        var name = u.lastPathSegment?.substringAfterLast('/')?.substringAfterLast(':') ?: "model.gguf"; var size = -1L
        try {
            context.contentResolver.query(u, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
                if (c.moveToFirst()) {
                    val a = c.getColumnIndex(OpenableColumns.DISPLAY_NAME); val b = c.getColumnIndex(OpenableColumns.SIZE)
                    if (a >= 0) name = c.getString(a) ?: name
                    if (b >= 0 && !c.isNull(b)) size = c.getLong(b)
                }
            }
        } catch (e: Exception) { /* ignore */ }
        return Pair(name, size)
    }

    // ───── info ─────
    @PluginMethod
    fun info(call: PluginCall) {
        light.execute {
            val o = JSObject()
            o.put("abi", try { android.os.Build.SUPPORTED_ABIS.joinToString(",") } catch (e: Throwable) { "" })
            o.put("modelsDir", modelsDir()?.absolutePath ?: "")
            val err = ensureNative()
            if (err != null) {
                o.put("available", false).put("ready", false).put("loaded", false).put("reason", err)
                call.resolve(o); return@execute
            }
            try {
                val n = parse(OmniLlmNative.nativeInfo())
                o.put("available", true).put("loaded", n.optBoolean("loaded", false)).put("ready", n.optBoolean("loaded", false)).put("busy", n.optBoolean("busy", false))
                o.put("runtime", n.optString("runtime", "llama.cpp"))
                if (n.optBoolean("loaded", false)) {
                    o.put("ctx", n.optInt("ctx")).put("threads", n.optInt("threads")).put("modelSize", n.optLong("modelSize")).put("fileSize", n.optLong("fileSize"))
                    if (n.has("name")) o.put("name", n.optString("name"))
                    current?.let { o.put("displayName", it.displayName).put("path", it.path).put("uri", it.uri ?: "") }
                }
                // الذاكرة: availMem من ActivityManager هي المرجع؛ وإلا /proc/meminfo عبر النواة. null = غير متاح
                val am = availMem()
                if (am > 0) o.put("memAvailable", am) else if (!n.isNull("memAvailable")) o.put("memAvailable", n.optLong("memAvailable"))
                if (!n.isNull("memTotal")) o.put("memTotal", n.optLong("memTotal"))
                if (!n.isNull("processRss")) o.put("processRss", n.optLong("processRss"))
                call.resolve(o)
            } catch (e: Throwable) { o.put("available", false).put("ready", false).put("reason", e.message ?: "info failed"); call.resolve(o) }
        }
    }

    // ───── الملفات ─────
    @PluginMethod
    fun listModels(call: PluginCall) {
        light.execute {
            try {
                val dir = modelsDir(); val arr = JSArray()
                dir?.listFiles()?.filter { it.isFile && it.name.endsWith(".gguf", ignoreCase = true) }?.sortedBy { it.name.lowercase() }?.forEach {
                    arr.put(JSObject().put("name", it.name).put("path", it.absolutePath).put("size", it.length()))
                }
                call.resolve(JSObject().put("dir", dir?.absolutePath ?: "").put("models", arr))
            } catch (e: Exception) { call.reject(e.message ?: "listModels failed", "GENERATE_FAILED") }
        }
    }

    @PluginMethod
    fun stat(call: PluginCall) {
        val uri = call.getString("uri"); val path = call.getString("path")
        light.execute {
            try {
                if (!uri.isNullOrEmpty()) {
                    val u = Uri.parse(uri); val (name, size) = queryUri(u)
                    var ok = false; var gguf = false
                    try { context.contentResolver.openInputStream(u)?.use { s -> ok = true; val h = ByteArray(4); gguf = s.read(h) == 4 && String(h, Charsets.ISO_8859_1) == "GGUF" } } catch (e: Exception) { ok = false }
                    call.resolve(JSObject().put("exists", ok).put("readable", ok).put("size", size).put("name", name).put("gguf", gguf)); return@execute
                }
                if (path.isNullOrBlank()) { call.reject("path or uri required", "INVALID"); return@execute }
                val f = File(path); val exists = f.exists() && f.isFile
                var gguf = false
                if (exists && f.canRead()) try { f.inputStream().use { s -> val h = ByteArray(4); gguf = s.read(h) == 4 && String(h, Charsets.ISO_8859_1) == "GGUF" } } catch (e: Exception) { /* غير مقروء */ }
                call.resolve(JSObject().put("exists", exists).put("readable", exists && f.canRead()).put("size", if (exists) f.length() else -1L).put("name", f.name).put("gguf", gguf))
            } catch (e: Exception) { call.reject(e.message ?: "stat failed", "GENERATE_FAILED") }
        }
    }

    @PluginMethod
    fun pickModel(call: PluginCall) {
        try {
            val i = Intent(Intent.ACTION_OPEN_DOCUMENT)
            i.addCategory(Intent.CATEGORY_OPENABLE)
            i.setType("*/*")   // GGUF بلا نوع MIME معروف
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
            startActivityForResult(call, i, "pickModelResult")
        } catch (e: Exception) { call.reject(e.message ?: "picker failed", "GENERATE_FAILED") }
    }

    @ActivityCallback
    private fun pickModelResult(call: PluginCall?, result: ActivityResult?) {
        if (call == null) return
        val u = result?.data?.data
        if (result == null || result.resultCode != android.app.Activity.RESULT_OK || u == null) { call.reject("CANCELLED", "CANCELLED"); return }
        try { context.contentResolver.takePersistableUriPermission(u, Intent.FLAG_GRANT_READ_URI_PERMISSION) } catch (e: Exception) { /* قد لا يدعم المزوّد الحفظ الدائم */ }
        val (name, size) = queryUri(u)
        call.resolve(JSObject().put("uri", u.toString()).put("name", name).put("size", size))
    }

    // ───── load / unload ─────
    @PluginMethod
    fun load(call: PluginCall) {
        val uri = call.getString("uri"); val path = call.getString("path")
        val nCtx = call.getInt("nCtx", 2048) ?: 2048; val nThreads = call.getInt("nThreads", 0) ?: 0
        worker.execute {
            val err = ensureNative(); if (err != null) { rejectUnavailable(call, err); return@execute }
            var pfd: ParcelFileDescriptor? = null
            try {
                val key: String; val nativePath: String; val display: String; val fsize: Long
                if (!uri.isNullOrEmpty()) {
                    val u = Uri.parse(uri); val (name, size) = queryUri(u)
                    key = "uri:$uri|$nCtx|$nThreads"; display = stripName(name); fsize = size
                    val reuse = current
                    if (reuse != null && reuse.key == key && parse(OmniLlmNative.nativeInfo()).optBoolean("loaded", false)) { call.resolve(loadedInfo(reuse, true)); return@execute }
                    pfd = try { context.contentResolver.openFileDescriptor(u, "r") } catch (e: Exception) { null }
                    if (pfd == null) { call.reject("Cannot open the selected file. Choose it again.", "FILE_NOT_FOUND"); return@execute }
                    nativePath = "/proc/self/fd/" + pfd.fd
                } else {
                    if (path.isNullOrBlank()) { call.reject("No local model configured", "INVALID"); return@execute }
                    val f = File(path)
                    if (!f.exists() || !f.isFile) { call.reject("Model file not found: $path", "FILE_NOT_FOUND"); return@execute }
                    if (!f.canRead()) { call.reject("Cannot read this file (permission denied). Use \"Choose file\" or copy it to: ${modelsDir()?.absolutePath ?: "the app models folder"}", "PERMISSION_DENIED"); return@execute }
                    key = "path:${f.absolutePath}|$nCtx|$nThreads"; display = stripName(f.name); fsize = f.length(); nativePath = f.absolutePath
                    val reuse = current
                    if (reuse != null && reuse.key == key && parse(OmniLlmNative.nativeInfo()).optBoolean("loaded", false)) { call.resolve(loadedInfo(reuse, true)); return@execute }
                }
                // مصدر مختلف (أو لم يعد محمّلاً): حرّر السابق ثم حمّل
                val old = synchronized(lock) { val x = current; current = null; x }
                if (old != null) { OmniLlmNative.nativeUnload(); try { old.pfd?.close() } catch (e: Exception) { /* ignore */ } }
                val r = parse(OmniLlmNative.nativeLoad(bytes(nativePath), nCtx, nThreads, availMem()))
                if (!r.optBoolean("ok", false)) { try { pfd?.close() } catch (e: Exception) { /* ignore */ }; rejectWith(call, r); return@execute }
                val c = Current(key, pfd, nativePath.takeIf { uri.isNullOrEmpty() } ?: "", uri, display, if (fsize >= 0) fsize else r.optLong("fileSize"))
                synchronized(lock) { current = c }
                val out = r; out.put("displayName", display); out.put("reused", false); out.put("path", c.path); out.put("uri", uri ?: "")
                if (!out.has("name") || out.optString("name").isEmpty()) out.put("name", display)
                call.resolve(out)
            } catch (e: Throwable) {
                try { pfd?.close() } catch (x: Exception) { /* ignore */ }
                call.reject(if (e is OutOfMemoryError) "Insufficient memory to load this model." else (e.message ?: "Model load failed"), if (e is OutOfMemoryError) "INSUFFICIENT_MEMORY" else "LOAD_FAILED")
            }
        }
    }

    private fun loadedInfo(c: Current, reused: Boolean): JSObject {
        val n = parse(OmniLlmNative.nativeInfo())
        return JSObject().put("ctx", n.optInt("ctx")).put("name", if (n.has("name")) n.optString("name") else c.displayName).put("displayName", c.displayName)
            .put("modelSize", n.optLong("modelSize")).put("fileSize", n.optLong("fileSize")).put("threads", n.optInt("threads")).put("reused", reused).put("path", c.path).put("uri", c.uri ?: "")
    }

    @PluginMethod
    fun unload(call: PluginCall) {
        control.execute {
            try {
                OmniLlmNative.nativeCancel()
                if (OmniLlmNative.available) OmniLlmNative.nativeUnload()
                val c = synchronized(lock) { val x = current; current = null; x }
                try { c?.pfd?.close() } catch (e: Exception) { /* ignore */ }
                call.resolve()
            } catch (e: Throwable) { call.reject(e.message ?: "unload failed", "GENERATE_FAILED") }
        }
    }

    @PluginMethod
    fun cancel(call: PluginCall) {
        try { if (OmniLlmNative.available) OmniLlmNative.nativeCancel() } catch (e: Throwable) { /* ignore */ }
        call.resolve()
    }

    // ───── tokenize / generate ─────
    @PluginMethod
    fun tokenize(call: PluginCall) {
        val text = call.getString("text") ?: ""
        worker.execute {
            val err = ensureNative(); if (err != null) { rejectUnavailable(call, err); return@execute }
            try {
                val r = parse(OmniLlmNative.nativeTokenize(bytes(text), call.getBoolean("special", true) ?: true))
                if (!r.optBoolean("ok", false)) rejectWith(call, r) else call.resolve(JSObject().put("count", r.optInt("count")))
            } catch (e: Throwable) { call.reject(e.message ?: "tokenize failed", "GENERATE_FAILED") }
        }
    }

    @PluginMethod
    fun generate(call: PluginCall) {
        val system = call.getString("system") ?: ""; val user = call.getString("user") ?: ""
        val template = call.getString("template") ?: "chatml"; val prefix = call.getString("assistantPrefix") ?: ""
        val maxTokens = call.getInt("maxTokens", 512) ?: 512
        val temp = (call.getDouble("temperature") ?: 0.7).toFloat(); val topK = call.getInt("topK", 20) ?: 20
        val topP = (call.getDouble("topP") ?: 0.8).toFloat(); val minP = (call.getDouble("minP") ?: 0.0).toFloat()
        val rep = (call.getDouble("repeatPenalty") ?: 1.05).toFloat(); val seed = (call.getDouble("seed") ?: -1.0).toLong()
        worker.execute {
            val err = ensureNative(); if (err != null) { rejectUnavailable(call, err); return@execute }
            generating = true
            try {
                val r = parse(OmniLlmNative.nativeGenerate(bytes(system), bytes(user), bytes(template), bytes(prefix), maxTokens, temp, topK, topP, minP, rep, seed))
                if (!r.optBoolean("ok", false)) { rejectWith(call, r); return@execute }
                r.remove("ok"); call.resolve(r)
            } catch (e: Throwable) {
                call.reject(if (e is OutOfMemoryError) "Insufficient memory to generate." else (e.message ?: "Generation failed"), if (e is OutOfMemoryError) "INSUFFICIENT_MEMORY" else "GENERATE_FAILED")
            } finally { generating = false }
        }
    }

    override fun handleOnDestroy() {
        try { if (OmniLlmNative.available && nativeReady) { OmniLlmNative.nativeCancel(); OmniLlmNative.nativeUnload() } } catch (e: Throwable) { /* ignore */ }
        try { current?.pfd?.close() } catch (e: Exception) { /* ignore */ }
        current = null
        worker.shutdown(); control.shutdown(); light.shutdown()
    }
}
