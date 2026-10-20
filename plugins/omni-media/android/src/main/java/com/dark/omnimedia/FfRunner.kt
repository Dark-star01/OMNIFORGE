package com.dark.omnimedia

import java.io.File
import java.util.concurrent.TimeUnit

/** يشغّل ثنائي ffmpeg كعملية منفصلة ويقرأ -progress pipe:1. منطق JVM نقي (يُختبر بـ ffmpeg الجهاز المضيف). */
class FfRunner(private val bin: File, private val env: Map<String, String> = emptyMap()) {
    class Handle { @Volatile var cancelled = false; @Volatile var proc: Process? = null
        fun cancel() { cancelled = true; val p = proc; if (p != null) { p.destroy(); Thread { try { if (!p.waitFor(2, TimeUnit.SECONDS)) p.destroyForcibly() } catch (_: Throwable) {} }.start() } } }
    class Result(val exit: Int, val cancelled: Boolean, val stderrTail: String)

    private fun builder(args: List<String>): ProcessBuilder {
        val pb = ProcessBuilder(listOf(bin.path, "-nostdin") + args); pb.environment().putAll(env); return pb
    }

    /** تشغيل مع تقدّم: onProgress(ثوانٍ منفّذة، السرعة كنص أو null). */
    fun run(args: List<String>, handle: Handle, onProgress: (Double, String?) -> Unit): Result {
        val p = builder(args).start(); handle.proc = p; try { p.outputStream.close() } catch (_: Throwable) {}
        if (handle.cancelled) p.destroy()
        val err = StringBuilder()
        val th = Thread { try { p.errorStream.bufferedReader().use { r -> val buf = CharArray(4096); while (true) { val n = r.read(buf); if (n < 0) break; synchronized(err) { err.append(buf, 0, n); if (err.length > 8000) err.delete(0, err.length - 6000) } } } } catch (_: Throwable) {} }
        th.isDaemon = true; th.start()
        var speed: String? = null; var last = 0L; var lastV = -1.0; var lastSent = -1.0
        try {
            p.inputStream.bufferedReader().use { r ->
                while (true) {
                    val line = r.readLine() ?: break
                    val t = line.trim()
                    if (t.startsWith("speed=")) speed = t.substring(6).trim().takeIf { it.isNotEmpty() && it != "N/A" }
                    else if (t.startsWith("out_time_us=") || t.startsWith("out_time_ms=")) {
                        val v = t.substringAfter('=').toLongOrNull() ?: continue
                        val now = System.currentTimeMillis()
                        if (v >= 0) { lastV = v / 1e6; if (now - last >= 250) { last = now; lastSent = lastV; onProgress(lastV, speed) } }
                    }
                }
            }
        } catch (e: java.io.IOException) { if (!handle.cancelled) throw e }   // إغلاق التدفق بعد الإلغاء متوقَّع
        finally { handle.proc = null }
        if (lastV > lastSent && !handle.cancelled) onProgress(lastV, speed)
        val code = p.waitFor(); th.join(1000)
        val tail = synchronized(err) { err.toString() }.takeLast(2500)
        return Result(code, handle.cancelled, tail)
    }

    /** تشغيل قصير يجمع stdout+stderr (probe / -encoders). مهلة افتراضية 20 ثانية. */
    fun capture(args: List<String>, timeoutSec: Long = 20): String {
        val pb = builder(args); pb.redirectErrorStream(true); val p = pb.start(); try { p.outputStream.close() } catch (_: Throwable) {}
        val sb = StringBuilder(); val th = Thread { try { p.inputStream.bufferedReader().use { r -> val buf = CharArray(4096); while (true) { val n = r.read(buf); if (n < 0) break; if (sb.length < 200_000) synchronized(sb) { sb.append(buf, 0, n) } } } } catch (_: Throwable) {} }
        th.isDaemon = true; th.start()
        if (!p.waitFor(timeoutSec, TimeUnit.SECONDS)) { p.destroyForcibly(); throw IllegalStateException("انتهت مهلة FFmpeg") }
        th.join(1000); return synchronized(sb) { sb.toString() }
    }
}
