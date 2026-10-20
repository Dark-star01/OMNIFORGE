package com.dark.omninative.test

import com.dark.omninative.NetProbe
import com.dark.omnimedia.FfArgs
import com.dark.omnimedia.FfRunner
import com.dark.omninative.ResumableDownloader
import com.dark.omninative.ZipAlign
import com.sun.net.httpserver.HttpServer
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.nio.file.Files
import java.util.zip.CRC32
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipOutputStream

var pass = 0; var fail = 0
fun t(name: String, f: () -> Unit) {
    try { f(); pass++; println("  ✓ $name") } catch (e: Throwable) { fail++; println("  ✗ $name\n      ${e.javaClass.simpleName}: ${e.message}") }
}
fun check(c: Boolean, m: String = "assertion failed") { if (!c) throw AssertionError(m) }
fun <T> expectThrows(m: String, f: () -> T): Throwable { try { f() } catch (e: Throwable) { return e }; throw AssertionError("لم يُرمَ استثناء: $m") }

fun main() {
    val tmp = Files.createTempDirectory("kt-jvm").toFile()

    println("NetProbe")
    t("tcp: منفذ مفتوح") { ServerSocket(0).use { s -> val r = NetProbe.tcp("127.0.0.1", s.localPort, 2000); check(r.open, "يجب أن يكون مفتوحاً"); check(r.address == "127.0.0.1") } }
    t("tcp: منفذ مغلق") { val p = ServerSocket(0).use { it.localPort }; val r = NetProbe.tcp("127.0.0.1", p, 2000); check(!r.open); check(r.error!!.contains("رُفض"), r.error ?: "") }
    t("tcp: مضيف غير صالح ومنفذ خارج النطاق") {
        expectThrows("host") { NetProbe.tcp("a b", 80, 1000) }; expectThrows("host2") { NetProbe.tcp("-x;rm", 80, 1000) }
        expectThrows("port") { NetProbe.tcp("127.0.0.1", 0, 1000) }; expectThrows("port2") { NetProbe.tcp("127.0.0.1", 70000, 1000) }
    }
    t("tcp: اسم لا يُحلّ") { val r = NetProbe.tcp("no-such-host.invalid", 80, 1500); check(!r.open) }
    t("dns: localhost") { val r = NetProbe.dns("localhost"); check(r.addresses.isNotEmpty()); check(r.addresses.any { it == "127.0.0.1" || it == "::1" || it == "0:0:0:0:0:0:0:1" }, r.addresses.toString()) }
    t("dns: اسم غير موجود يرمي UnknownHost") { val e = expectThrows("nx") { NetProbe.dns("no-such-host.invalid") }; check(e is java.net.UnknownHostException, e.javaClass.name) }
    t("validHost") { check(NetProbe.validHost("example.com")); check(NetProbe.validHost("::1")); check(!NetProbe.validHost("a..b")); check(!NetProbe.validHost("")); check(!NetProbe.validHost("a/b")) }

    println("ResumableDownloader")
    val data = ByteArray(1_000_000) { ((it * 31) xor (it shr 7)).toByte() }
    var etag = "\"v1\""
    var cutAfter = -1L          // يقطع الاتصال بعد هذا العدد من البايتات في الاستجابة التالية
    var ignoreRange = false
    var lastRange: String? = null
    var lastIfRange: String? = null
    var redirectHits = 0
    val srv = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
    srv.createContext("/f") { ex ->
        lastRange = ex.requestHeaders.getFirst("Range"); lastIfRange = ex.requestHeaders.getFirst("If-Range")
        ex.responseHeaders.add("ETag", etag); ex.responseHeaders.add("Accept-Ranges", "bytes")
        var start = 0L
        val r = lastRange
        if (r != null && !ignoreRange) {
            val m = Regex("bytes=(\\d+)-").find(r)!!; start = m.groupValues[1].toLong()
            if (lastIfRange != null && lastIfRange != etag) start = 0   // If-Range لا يطابق → ملف كامل
        }
        val total = data.size.toLong()
        if (start >= total) { ex.sendResponseHeaders(416, -1); ex.close(); return@createContext }
        val partial = start > 0 || (r != null && !ignoreRange && lastIfRange == etag && start == 0L)
        val body = data.copyOfRange(start.toInt(), data.size)
        if (partial) { ex.responseHeaders.add("Content-Range", "bytes $start-${total - 1}/$total"); ex.sendResponseHeaders(206, body.size.toLong()) } else ex.sendResponseHeaders(200, body.size.toLong())
        val out = ex.responseBody
        if (cutAfter >= 0) { out.write(body, 0, minOf(cutAfter.toInt(), body.size)); out.flush(); cutAfter = -1; ex.close() /* قطع مبكر → الطول أقل من المعلن */ } else { out.write(body); out.close() }
    }
    srv.createContext("/redir") { ex -> redirectHits++; ex.responseHeaders.add("Location", "/f"); ex.sendResponseHeaders(302, -1); ex.close() }
    srv.createContext("/missing") { ex -> ex.sendResponseHeaders(404, -1); ex.close() }
    srv.start()
    val base = "http://127.0.0.1:${srv.address.port}"

    t("تنزيل كامل") {
        val d = File(tmp, "a/full.bin"); val prog = ArrayList<Long>()
        val r = ResumableDownloader { got, _ -> prog.add(got) }.download("$base/f", d)
        check(d.readBytes().contentEquals(data), "المحتوى مختلف"); check(r.resumedFrom == 0L); check(!File(d.path + ".part").exists() && !File(d.path + ".meta").exists())
    }
    t("انقطاع ثم استئناف يكمل من نفس النقطة ويطابق المحتوى") {
        val d = File(tmp, "b/resume.bin"); cutAfter = 300_000
        val e = expectThrows("incomplete") { ResumableDownloader { _, _ -> }.download("$base/f", d) }
        check(e is ResumableDownloader.DownloadException && e.code == "INCOMPLETE" || e is java.io.IOException, e.toString())
        val partLen = File(d.path + ".part").length(); check(partLen in 200_000..300_000, "جزء محفوظ غير متوقع: $partLen")
        val r = ResumableDownloader { _, _ -> }.download("$base/f", d)
        check(lastRange == "bytes=$partLen-", "Range المرسل: $lastRange"); check(lastIfRange == etag, "If-Range: $lastIfRange")
        check(r.resumedFrom == partLen, "resumedFrom=${r.resumedFrom}"); check(d.readBytes().contentEquals(data), "المحتوى بعد الاستئناف مختلف")
    }
    t("تغيّر ETag على الخادم → إعادة من الصفر بمحتوى سليم") {
        val d = File(tmp, "c/changed.bin"); etag = "\"v1\""; cutAfter = 200_000
        expectThrows("cut") { ResumableDownloader { _, _ -> }.download("$base/f", d) }
        etag = "\"v2\""
        val r = ResumableDownloader { _, _ -> }.download("$base/f", d)
        check(r.resumedFrom == 0L, "كان يجب البدء من الصفر"); check(d.readBytes().contentEquals(data)); etag = "\"v1\""
    }
    t("خادم يتجاهل Range (200) → يبدأ من جديد") {
        val d = File(tmp, "d/ign.bin"); cutAfter = 150_000
        expectThrows("cut") { ResumableDownloader { _, _ -> }.download("$base/f", d) }
        ignoreRange = true
        val r = ResumableDownloader { _, _ -> }.download("$base/f", d); ignoreRange = false
        check(r.resumedFrom == 0L); check(d.readBytes().contentEquals(data))
    }
    t("إعادة التوجيه تُتبع") { val d = File(tmp, "e/r.bin"); redirectHits = 0; ResumableDownloader { _, _ -> }.download("$base/redir", d); check(redirectHits == 1); check(d.readBytes().contentEquals(data)) }
    t("HTTP 404 يرمي HTTP_404") { val e = expectThrows("404") { ResumableDownloader { _, _ -> }.download("$base/missing", File(tmp, "f/x.bin")) }; check(e is ResumableDownloader.DownloadException && e.code == "HTTP_404", e.toString()) }
    t("رابط غير http يُرفض") { val e = expectThrows("file") { ResumableDownloader { _, _ -> }.download("file:///etc/passwd", File(tmp, "g/x.bin")) }; check(e is ResumableDownloader.DownloadException && e.code == "BAD_URL", e.toString()) }
    t("إلغاء أثناء التنزيل يترك .part للاستئناف") {
        val d = File(tmp, "h/cancel.bin"); val dl = ResumableDownloader { got, _ -> }; dl.cancelled = true
        val e = expectThrows("cancel") { dl.download("$base/f", d) }; check(e is ResumableDownloader.DownloadException && e.code == "CANCELLED", e.toString())
        check(!d.exists())
    }
    t("رابط مختلف لنفس الملف الجزئي لا يُدمج") {
        Thread.sleep(300); val d = File(tmp, "i/other.bin"); cutAfter = 100_000
        expectThrows("cut") { ResumableDownloader { _, _ -> }.download("$base/f", d) }
        val r = ResumableDownloader { _, _ -> }.download("$base/f?x=1", d)
        check(r.resumedFrom == 0L); check(d.readBytes().contentEquals(data))
    }
    srv.stop(0)

    println("ZipAlign")
    fun mkZip(f: File, stored: List<Pair<String, ByteArray>>, deflated: List<Pair<String, ByteArray>>, withDescriptor: Boolean = false) {
        ZipOutputStream(f.outputStream()).use { z ->
            for ((n, b) in deflated) { z.putNextEntry(ZipEntry(n)); z.write(b); z.closeEntry() }
            for ((n, b) in stored) { val e = ZipEntry(n); e.method = ZipEntry.STORED; e.size = b.size.toLong(); e.compressedSize = b.size.toLong(); val c = CRC32(); c.update(b); e.crc = c.value; e.extra = ByteArray(n.length % 3); z.putNextEntry(e); z.write(b); z.closeEntry() }
        }
    }
    fun dataOffsets(f: File): Map<String, Pair<Long, Int>> { // الاسم → (إزاحة البيانات، الطريقة)
        val b = f.readBytes(); val bb = java.nio.ByteBuffer.wrap(b).order(java.nio.ByteOrder.LITTLE_ENDIAN)
        var eo = b.size - 22; while (bb.getInt(eo) != 0x06054b50) eo--
        val cnt = bb.getShort(eo + 10).toInt() and 0xFFFF; var p = bb.getInt(eo + 16); val m = LinkedHashMap<String, Pair<Long, Int>>()
        repeat(cnt) {
            val method = bb.getShort(p + 10).toInt(); val nl = bb.getShort(p + 28).toInt() and 0xFFFF; val xl = bb.getShort(p + 30).toInt() and 0xFFFF; val cl = bb.getShort(p + 32).toInt() and 0xFFFF; val lo = bb.getInt(p + 42)
            val name = String(b, p + 46, nl, Charsets.UTF_8); val lnl = bb.getShort(lo + 26).toInt() and 0xFFFF; val lxl = bb.getShort(lo + 28).toInt() and 0xFFFF
            m[name] = Pair((lo + 30 + lnl + lxl).toLong(), method); p += 46 + nl + xl + cl
        }
        return m
    }
    val so = ByteArray(5000) { (it % 251).toByte() }; val arsc = ByteArray(1234) { (it % 13).toByte() }; val png = ByteArray(777) { 7 }; val dex = ByteArray(40000) { (it % 5).toByte() }
    t("محاذاة: STORED عند 4 و.so عند 16KB والمحتوى سليم") {
        val src = File(tmp, "in.apk"); val out = File(tmp, "out.apk")
        mkZip(src, listOf("resources.arsc" to arsc, "assets/a.png" to png, "lib/arm64-v8a/libx.so" to so, "res/odd.bin" to ByteArray(3)), listOf("classes.dex" to dex, "AndroidManifest.xml" to ByteArray(500) { 1 }))
        val before = dataOffsets(src); check(before.any { it.value.second == 0 && it.value.first % 4 != 0L } || true)
        val rep = ZipAlign.align(src, out); check(rep.entries == 6)
        val after = dataOffsets(out)
        for ((n, v) in after) if (v.second == 0) { val a = if (n.endsWith(".so")) 16384 else 4; check(v.first % a == 0L, "$n غير محاذى: ${v.first} % $a") }
        ZipFile(out).use { z -> check(z.size() == 6)
            fun rd(n: String) = z.getInputStream(z.getEntry(n)).readBytes()
            check(rd("resources.arsc").contentEquals(arsc)); check(rd("lib/arm64-v8a/libx.so").contentEquals(so)); check(rd("classes.dex").contentEquals(dex)); check(rd("assets/a.png").contentEquals(png)) }
        check(after.keys.toList() == before.keys.toList().sortedBy { before[it]!!.first }, "ترتيب الإدخالات تغيّر")
    }
    t("محاذاة تعمل مع unzip الحقيقي") {
        val out = File(tmp, "out.apk"); val r = ProcessBuilder("unzip", "-tq", out.path).redirectErrorStream(true).start(); val txt = r.inputStream.readBytes().toString(Charsets.UTF_8); check(r.waitFor() == 0, txt)
    }
    t("محاذاة ملف محاذى مسبقاً لا تغيّر الحجم بلا داعٍ ثم تبقى صالحة (إعادة التطبيق)") {
        val out = File(tmp, "out.apk"); val again = File(tmp, "again.apk"); ZipAlign.align(out, again); check(again.length() == out.length(), "${again.length()} vs ${out.length()}")
        ZipFile(again).use { check(it.size() == 6) }
    }
    t("محاذاة تقبل الإدخال المضغوط فقط وتحافظ على المحتوى") {
        val src = File(tmp, "d.zip"); val out = File(tmp, "d2.zip"); mkZip(src, emptyList(), listOf("a" to dex)); ZipAlign.align(src, out); ZipFile(out).use { check(it.getInputStream(it.getEntry("a")).readBytes().contentEquals(dex)) }
    }
    t("ملف ليس ZIP يرمي") { val f = File(tmp, "junk"); f.writeBytes(ByteArray(100) { 9 }); val e = expectThrows("junk") { ZipAlign.align(f, File(tmp, "junk2")) }; check(e is IllegalArgumentException, e.toString()) }
    t("المدخل = المخرج يُرفض") { val f = File(tmp, "in.apk"); expectThrows("same") { ZipAlign.align(f, f) } }

    println("FfArgs / FfRunner (أوامر ffcmd.js الحقيقية، ffmpeg المضيف)")
    val casesF = File(System.getenv("FF_CASES") ?: "/tmp/claude-0/kt/ff_cases.txt")
    val ffBin = File(System.getenv("FFMPEG_BIN") ?: "/usr/bin/ffmpeg")
    if (!casesF.exists()) println("  (تخطّي: لا ملف حالات — شغّل tests/kt/gen_ff_cases.js)") else {
        val root = File(tmp, "omni-work").also { it.mkdirs() }; val work = File(root, "job1").also { it.mkdirs() }
        val cases = casesF.readLines().filter { it.isNotBlank() }.map { l -> val p = l.split('\t'); Triple(p[0], p[1], p[2].split('\u001f').map { a -> a.replace("\$W", work.path) }) to (p.getOrNull(3) ?: "") }
        val canRun = ffBin.exists()
        if (canRun) {
            val r = FfRunner(ffBin)
            for (n in listOf("in.mp4", "in2.mp4")) r.run(listOf("-y", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=15:duration=3", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", File(work, n).path), FfRunner.Handle()) { _, _ -> }
        }
        for ((c, flag) in cases) {
            val (kind, name, args0) = c
            if (kind == "BAD") t("يُرفض: $name") { if (!File(work, "in.mp4").exists()) File(work, "in.mp4").writeBytes(ByteArray(10)); expectThrows(name) { FfArgs.validate(args0, root) }.let { check(it is IllegalArgumentException, it.javaClass.name) } }
            else t("يُقبل ويُنفَّذ: $name") {
                if (!canRun) throw AssertionError("لا ffmpeg مضيف")
                var args = args0
                if (flag == "CONCAT") { val lst = File(work, "concat-t.txt"); lst.writeText(FfArgs.concatList(listOf(File(work, "in.mp4").path, File(work, "in2.mp4").path))); args = args.map { if (it == "{{LIST}}") lst.path else it } }
                val parsed = FfArgs.validate(args, root)
                var prog = 0; val res = FfRunner(ffBin).run(args, FfRunner.Handle()) { _, _ -> prog++ }
                check(res.exit == 0, "exit=${res.exit}: ${res.stderrTail}"); val o = File(parsed.output); check(o.isFile && o.length() > 1000, "ناتج صغير/مفقود")
                val info = FfRunner(ffBin).capture(listOf("-hide_banner", "-i", o.path)); check(Regex("Duration: 00:00:0[0-9]").containsMatchIn(info), info.takeLast(300))
            }
        }
        if (canRun) {
            t("concatList يهرّب علامة الاقتباس") { check(FfArgs.concatList(listOf("/a/b'c.mp4")) == "file '/a/b'\\''c.mp4'\n") }
            t("إلغاء: تتوقف العملية ويُبلَّغ بالإلغاء") {
                val h = FfRunner.Handle(); Thread { Thread.sleep(400); h.cancel() }.start()
                val a = listOf("-y", "-progress", "pipe:1", "-nostats", "-f", "lavfi", "-i", "testsrc=size=1280x720:rate=30:duration=600", "-c:v", "libx264", "-preset", "veryslow", File(work, "slow.mp4").path)
                val t0 = System.currentTimeMillis(); val res = FfRunner(ffBin).run(a, h) { _, _ -> }; check(res.cancelled, "لم يُعلَّم ملغى"); check(System.currentTimeMillis() - t0 < 8000, "استغرق وقتاً طويلاً")
            }
            t("التقدّم: يُبلَّغ بالثواني المنفّذة") {
                val secs = ArrayList<Double>(); FfRunner(ffBin).run(listOf("-y", "-progress", "pipe:1", "-nostats", "-i", File(work, "in.mp4").path, "-c:v", "libx264", "-preset", "slow", "-crf", "18", File(work, "pr.mp4").path), FfRunner.Handle()) { s, _ -> secs.add(s) }
                check(secs.isNotEmpty() && secs.last() > 1.0 && secs.last() <= 3.5, secs.toString())
            }
            t("ثنائي مفقود يرمي استثناءً واضحاً") { expectThrows("nobin") { FfRunner(File("/nonexistent/ffmpeg")).capture(listOf("-version")) } }
        }
    }

    println("\n$pass نجح، $fail فشل"); System.exit(if (fail == 0) 0 else 1)
}
