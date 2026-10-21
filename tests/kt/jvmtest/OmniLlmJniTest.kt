package com.dark.omnillm.test

import com.dark.omnillm.OmniLlmNative
import java.io.File

/**
 * اختبار جسر JNI الحقيقي (libomnillm.so المبنية على Linux ضد llama.cpp) عبر JVM: byte[] UTF-8، JSON، cancel من خيط آخر، info أثناء التوليد.
 * الاستخدام: java -Djava.library.path=<build> -cp … com.dark.omnillm.test.OmniLlmJniTestKt <model.gguf> <tmpdir>
 */
private var pass = 0; private var fail = 0
private fun t(name: String, f: () -> Unit) { try { f(); pass++; println("  ✓ $name") } catch (e: Throwable) { fail++; println("  ✗ $name\n      ${e.javaClass.simpleName}: ${e.message}") } }
private fun check(c: Boolean, m: String = "assertion failed") { if (!c) throw AssertionError(m) }

// JSON مصغّر للاختبار فقط (يتحقق أيضاً من أن ما تُنتجه النواة JSON صالح بالكامل)
private class J(val s: String) {
    var i = 0
    fun ws() { while (i < s.length && s[i].isWhitespace()) i++ }
    fun parse(): Any? { val v = value(); ws(); if (i != s.length) throw IllegalStateException("trailing garbage at $i"); return v }
    fun value(): Any? { ws(); return when (s[i]) { '{' -> obj(); '[' -> arr(); '"' -> str(); 't' -> lit("true", true); 'f' -> lit("false", false); 'n' -> lit("null", null); else -> numv() } }
    fun lit(w: String, v: Any?): Any? { if (!s.startsWith(w, i)) throw IllegalStateException("bad literal at $i"); i += w.length; return v }
    fun numv(): Any { val st = i; while (i < s.length && (s[i].isDigit() || s[i] in "+-.eE")) i++; if (st == i) throw IllegalStateException("bad value at $i: ${s[i]}"); return s.substring(st, i).toDouble() }
    fun str(): String {
        val sb = StringBuilder(); i++
        while (true) { val c = s[i++]; when {
            c == '"' -> return sb.toString()
            c == '\\' -> { when (val e = s[i++]) { 'n' -> sb.append('\n'); 'r' -> sb.append('\r'); 't' -> sb.append('\t'); '"' -> sb.append('"'); '\\' -> sb.append('\\'); '/' -> sb.append('/'); 'u' -> { sb.append(s.substring(i, i + 4).toInt(16).toChar()); i += 4 }; else -> throw IllegalStateException("bad escape \\$e") } }
            c < ' ' -> throw IllegalStateException("raw control char in JSON string")
            else -> sb.append(c) } }
    }
    fun obj(): Map<String, Any?> { val m = LinkedHashMap<String, Any?>(); i++; ws(); if (s[i] == '}') { i++; return m }; while (true) { ws(); val k = str(); ws(); if (s[i++] != ':') throw IllegalStateException("expected :"); m[k] = value(); ws(); val c = s[i++]; if (c == '}') return m; if (c != ',') throw IllegalStateException("expected , or }") } }
    fun arr(): List<Any?> { val l = ArrayList<Any?>(); i++; ws(); if (s[i] == ']') { i++; return l }; while (true) { l.add(value()); ws(); val c = s[i++]; if (c == ']') return l; if (c != ',') throw IllegalStateException("expected , or ]") } }
}
@Suppress("UNCHECKED_CAST") private fun js(b: ByteArray): Map<String, Any?> = J(String(b, Charsets.UTF_8)).parse() as Map<String, Any?>
private fun b(s: String) = s.toByteArray(Charsets.UTF_8)
private fun gen(user: String, max: Int = 16, temp: Float = 0f, system: String = "You are a prompt engineer.") =
    js(OmniLlmNative.nativeGenerate(b(system), b(user), b("chatml"), b("<think>\n\n</think>\n\n"), max, temp, 20, 0.8f, 0f, 1.05f, 42L))

fun main(args: Array<String>) {
    val model = args[0]; val tmp = File(args[1]).also { it.mkdirs() }
    t("المكتبة الأصلية تُحمَّل (OmniLlmNative.available)") { check(OmniLlmNative.available, "loadError=" + OmniLlmNative.loadError) }
    if (!OmniLlmNative.available) { println("\n$pass نجح، ${++fail} فشل"); System.exit(1) }
    t("nativeInit: ok + اسم المحرك والإصدار") { val r = js(OmniLlmNative.nativeInit(b(""))); check(r["ok"] == true); check((r["runtime"] as String).startsWith("llama.cpp v")); println("      ${r["runtime"]}") }
    t("nativeInfo قبل التحميل: loaded=false وذاكرة متاحة") { val r = js(OmniLlmNative.nativeInfo()); check(r["ok"] == true && r["loaded"] == false && r["ctx"] == null); check((r["memAvailable"] as Double) > 0); check((r["processRss"] as Double) > 0) }
    t("load: ملف مفقود → FILE_NOT_FOUND") { val r = js(OmniLlmNative.nativeLoad(b("/nope/x.gguf"), 2048, 0, 0)); check(r["ok"] == false && r["code"] == "FILE_NOT_FOUND") }
    t("load: ملف نصي → INVALID_MODEL") { val f = File(tmp, "bad.gguf"); f.writeText("hello"); val r = js(OmniLlmNative.nativeLoad(b(f.path), 2048, 0, 0)); check(r["code"] == "INVALID_MODEL") }
    t("load: مسار بحروف عربية وإيموجي في اسم الملف") { val f = File(tmp, "نموذج-🐉.gguf"); f.writeText("x"); val r = js(OmniLlmNative.nativeLoad(b(f.path), 2048, 0, 0)); check(r["code"] == "INVALID_MODEL", r.toString()) }
    t("load: ذاكرة متاحة صغيرة → INSUFFICIENT_MEMORY") { val r = js(OmniLlmNative.nativeLoad(b(model), 2048, 0, 1L shl 20)); check(r["code"] == "INSUFFICIENT_MEMORY"); check((r["message"] as String).startsWith("Insufficient memory to load this model.")) }
    t("load صالح عبر مسار /proc/self/fd (كما في اختيار SAF)") {
        val ins = java.io.FileInputStream(model); try {
            val fdPath = "/proc/self/fd/" + fdOf(ins); val r = js(OmniLlmNative.nativeLoad(b(fdPath), 1024, 0, 0)); check(r["ok"] == true, r.toString()); check((r["ctx"] as Double).toInt() == 1024)
            js(OmniLlmNative.nativeUnload())
        } finally { ins.close() } }
    t("load صالح") { val r = js(OmniLlmNative.nativeLoad(b(model), 2048, 0, 0)); check(r["ok"] == true, r.toString()); check((r["ctx"] as Double).toInt() == 2048); check((r["modelSize"] as Double) > 1e6); println("      name=${r["name"]} arch=${r["arch"]} ctx=${r["ctx"]} threads=${r["threads"]} modelSize=${(r["modelSize"] as Double).toLong()}") }
    t("nativeInfo بعد التحميل") { val r = js(OmniLlmNative.nativeInfo()); check(r["loaded"] == true && (r["ctx"] as Double).toInt() == 2048 && r["name"] != null) }
    t("tokenize: إنجليزي/عربي/إيموجي/NUL") {
        fun n(s: String, sp: Boolean = false): Int { val r = js(OmniLlmNative.nativeTokenize(b(s), sp)); check(r["ok"] == true, r.toString()); return (r["count"] as Double).toInt() }
        check(n("A lone knight faces a dragon") in 5..12); check(n("فارس وحيد أمام تنين") > 3); check(n("🐉 👑 ⚔️") > 2); check(n("a\u0000b") >= 2); check(n("") == 0) }
    t("generate: نص عربي+إيموجي+علامات اقتباس/شرطات/أسطر عبر JNI يعيد JSON صالحاً") {
        val r = gen("فارس 🐉 \"quoted\" back\\slash\nnew line\ttab \u0001 تنين", 20, 0f, "Sys \"prompt\"\nline2 \\ end"); check(r["ok"] == true, r.toString())
        check((r["promptTokens"] as Double) > 20 && (r["generatedTokens"] as Double) in 1.0..20.0); check((r["text"] as String).isNotEmpty()); check(r["truncated"] != null && r["tokensPerSec"] != null && r["genMs"] != null)
        println("      prompt=${r["promptTokens"]} gen=${r["generatedTokens"]} cached=${r["cachedTokens"]} ms=${r["ms"]} tps=${r["tokensPerSec"]}") }
    t("generate: نتيجة حتمية (greedy) ومعاد استخدام KV في الطلب الثاني") { val a = gen("same idea"); val c = gen("same idea"); check(a["text"] == c["text"]); check((c["cachedTokens"] as Double) > 0) }
    t("info لا يُحجب أثناء التوليد (<300ms) و busy=true") {
        var res: Map<String, Any?>? = null; val th = Thread { res = gen("long story please", 3000, 0.9f) }; th.start(); Thread.sleep(80)
        val t0 = System.nanoTime(); val inf = js(OmniLlmNative.nativeInfo()); val ms = (System.nanoTime() - t0) / 1e6
        check(ms < 300, "info took $ms ms"); check(inf["busy"] == true, inf.toString()); OmniLlmNative.nativeCancel(); th.join(); check(res!!["code"] == "CANCELLED", res.toString()) }
    t("cancel من خيط آخر → CANCELLED، ثم يعمل التوليد التالي") { var res: Map<String, Any?>? = null; val th = Thread { res = gen("another long story", 3000, 0.9f) }; th.start(); Thread.sleep(100); val t0 = System.nanoTime(); OmniLlmNative.nativeCancel(); th.join(); check(res!!["code"] == "CANCELLED"); check((System.nanoTime() - t0) / 1e6 < 2000); check(gen("after cancel")["ok"] == true) }
    t("unload أثناء التوليد: يُلغى التوليد ويتحرر النموذج") { var res: Map<String, Any?>? = null; val th = Thread { res = gen("yet another long story", 3000, 0.9f) }; th.start(); Thread.sleep(100); val u = js(OmniLlmNative.nativeUnload()); th.join(); check(u["ok"] == true && res!!["code"] == "CANCELLED"); check(js(OmniLlmNative.nativeInfo())["loaded"] == false); check(gen("x")["code"] == "NOT_LOADED") }
    t("10 دورات load→generate→unload عبر JNI") { repeat(10) { val l = js(OmniLlmNative.nativeLoad(b(model), 2048, 0, 0)); check(l["ok"] == true, l.toString()); check(gen("cycle $it", 6)["ok"] == true); check(js(OmniLlmNative.nativeUnload())["ok"] == true) }; check(js(OmniLlmNative.nativeInfo())["loaded"] == false) }
    println("\n$pass نجح، $fail فشل"); System.exit(if (fail == 0) 0 else 1)
}

// الحصول على رقم FileDescriptor عبر الانعكاس (JDK لا يكشفه علناً)
private fun fdOf(s: java.io.FileInputStream): Int { val f = java.io.FileDescriptor::class.java.getDeclaredField("fd"); f.isAccessible = true; return f.getInt(s.fd) }
