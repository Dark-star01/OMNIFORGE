package com.dark.omnimedia

import java.io.File

/**
 * مدقّق وسائط FFmpeg — منطق JVM نقي (يُختبر على JVM مقابل أوامر ffcmd.js الحقيقية).
 * الواجهة تبني الأوامر، لكن لا نثق بها: يُسمح فقط بقائمة بيضاء من الخيارات وقيمها، والملفات داخل مجلد العمل فقط،
 * والمرشّحات من قائمة بيضاء (يُمنع movie/subtitles/drawtext… التي تقرأ ملفات أو شبكة).
 */
object FfArgs {
    private val noValue = setOf("-y", "-nostats", "-hide_banner", "-an", "-vn")
    private val withValue = setOf(
        "-progress", "-ss", "-t", "-i", "-map", "-c", "-c:v", "-c:a", "-preset", "-crf", "-pix_fmt", "-b:v", "-b:a", "-ac",
        "-movflags", "-avoid_negative_ts", "-vf", "-q:v", "-f", "-safe", "-filter_complex"
    )
    private val codecs = setOf("copy", "libx264", "libopenh264", "mpeg4", "aac", "libmp3lame")
    private val presets = setOf("ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow")
    private val filters = setOf("scale", "pad", "setsar", "fps", "format", "aresample", "aformat", "concat")
    private val outExt = setOf("mp4", "m4a", "mp3", "mkv")
    private val num = Regex("^\\d{1,6}(\\.\\d{1,3})?$")
    private val int = Regex("^\\d{1,3}$")
    private val kbps = Regex("^\\d{2,5}k$")
    private val mapRe = Regex("^(\\d{1,2}:[vas](:\\d{1,2})?\\??|\\[[va]\\d*\\])$")
    private val filterChars = Regex("^[A-Za-z0-9_=:,.;\\[\\]()'*/+\\- ]{1,4000}$")
    private val label = Regex("\\[[A-Za-z0-9_:]+\\]")
    private val quoted = Regex("'[^']*'")

    class Parsed(val inputs: List<String>, val output: String, val concat: Boolean)

    fun inWork(f: File, root: File): Boolean = f.canonicalPath.startsWith(root.canonicalPath + File.separator)

    /** يتحقق من قائمة وسائط (دون اسم الثنائي). يرمي IllegalArgumentException بسبب واضح. */
    fun validate(args: List<String>, root: File): Parsed {
        require(args.isNotEmpty() && args.size <= 200) { "عدد الوسائط غير صالح" }
        val inputs = ArrayList<String>(); var concat = false; var output: String? = null; var safe = false
        var i = 0
        while (i < args.size) {
            val a = args[i]
            require(a.length <= 4096 && !a.contains('\u0000')) { "وسيط غير صالح" }
            if (a.startsWith("-")) {
                if (a in noValue) { i++; continue }
                require(a in withValue) { "خيار غير مسموح: $a" }
                require(i + 1 < args.size) { "قيمة مفقودة للخيار $a" }
                val v = args[i + 1]; require(v.length <= 4096 && !v.contains('\u0000')) { "قيمة غير صالحة" }
                when (a) {
                    "-progress" -> require(v == "pipe:1") { "قيمة -progress" }
                    "-ss", "-t" -> require(num.matches(v)) { "زمن غير صالح: $v" }
                    "-i" -> { val f = File(v); require(inWork(f, root) && f.isFile) { "ملف مدخل خارج مجلد العمل أو غير موجود" }; inputs.add(v) }
                    "-map" -> require(mapRe.matches(v)) { "-map غير مسموح: $v" }
                    "-c", "-c:v", "-c:a" -> require(v in codecs) { "ترميز غير مسموح: $v" }
                    "-preset" -> require(v in presets) { "preset غير مسموح" }
                    "-crf" -> require(int.matches(v) && v.toInt() in 0..51) { "crf" }
                    "-pix_fmt" -> require(v == "yuv420p") { "pix_fmt" }
                    "-b:v", "-b:a" -> require(kbps.matches(v)) { "معدل البت" }
                    "-ac" -> require(v == "1" || v == "2") { "-ac" }
                    "-movflags" -> require(v == "+faststart") { "movflags" }
                    "-avoid_negative_ts" -> require(v == "make_zero") { "avoid_negative_ts" }
                    "-q:v" -> require(int.matches(v) && v.toInt() in 1..31) { "q:v" }
                    "-f" -> { require(v == "concat") { "-f غير مسموح" }; concat = true }
                    "-safe" -> { require(v == "0") { "-safe" }; safe = true }
                    "-vf", "-filter_complex" -> checkFilter(v)
                }
                i += 2
            } else {
                require(i == args.size - 1) { "وسيط غير متوقع: $a" }
                output = a; i++
            }
        }
        val out = File(output ?: throw IllegalArgumentException("ملف المخرج مفقود"))
        require(inWork(out, root)) { "المخرج خارج مجلد العمل" }
        require(out.extension.lowercase() in outExt) { "امتداد المخرج غير مسموح" }
        require(inputs.isNotEmpty()) { "لا ملف مدخل" }
        require(inputs.none { File(it).canonicalPath == out.canonicalPath }) { "المخرج يطابق المدخل" }
        require(!concat || safe) { "concat يتطلب -safe 0" }
        return Parsed(inputs, output, concat)
    }

    /** يتحقق من تعبير مرشّحات: الأحرف المسموحة + أسماء المرشّحات من القائمة البيضاء فقط. */
    fun checkFilter(expr: String) {
        require(filterChars.matches(expr)) { "أحرف غير مسموحة في المرشّح" }
        val flat = quoted.replace(expr, "Q")                    // الاقتباس قد يحوي فواصل (min(720,ih))
        for (part in flat.split(';')) {
            val chain = label.replace(part, "")                 // أزل [تسميات]
            for (el in chain.split(',')) {
                val s = el.trim(); if (s.isEmpty()) continue
                val name = s.substringBefore('=').trim()
                require(name in filters) { "مرشّح غير مسموح: $name" }
            }
        }
    }

    /** محتوى ملف قائمة concat (مسارات مُهرَّبة). */
    fun concatList(paths: List<String>): String = paths.joinToString("") { "file '" + it.replace("'", "'\\''") + "'\n" }
}
