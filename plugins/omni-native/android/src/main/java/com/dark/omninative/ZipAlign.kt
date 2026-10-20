package com.dark.omninative

import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * محاذاة ZIP بنمط zipalign: الملفات غير المضغوطة (STORED) تبدأ بياناتها عند مضاعف 4 بايت،
 * وملفات .so غير المضغوطة عند مضاعف 16KB. ضرورية بعد تعديل APK بـJSZip (resources.arsc غير المحاذاة يرفضه أندرويد 11+).
 * تُسقط أي كتلة توقيع APK قديمة — يجب إعادة التوقيع بعدها. لا تدعم ZIP64.
 */
object ZipAlign {
    class Report(val entries: Int, val aligned: Int, val padded: Long)

    private class Ent(
        val nameBytes: ByteArray, val flags: Int, val method: Int, val csize: Long,
        val localOff: Long, val cdBytes: ByteArray
    )

    private fun u16(b: ByteArray, o: Int) = (b[o].toInt() and 255) or ((b[o + 1].toInt() and 255) shl 8)
    private fun u32(b: ByteArray, o: Int) = (u16(b, o).toLong()) or (u16(b, o + 2).toLong() shl 16)

    fun align(input: File, output: File, pageAlign: Int = 16384): Report {
        require(input.canonicalPath != output.canonicalPath) { "المدخل والمخرج يجب أن يختلفا" }
        RandomAccessFile(input, "r").use { raf ->
            val len = raf.length()
            // سجل نهاية الدليل المركزي
            val tailLen = minOf(len, 65557L).toInt()
            val tail = ByteArray(tailLen); raf.seek(len - tailLen); raf.readFully(tail)
            var e = -1
            for (i in tailLen - 22 downTo 0) if (u32(tail, i) == 0x06054b50L) { e = i; break }
            if (e < 0) throw IllegalArgumentException("ليس ملف ZIP/APK صالحاً")
            val count = u16(tail, e + 10); val cdSize = u32(tail, e + 12); val cdOff = u32(tail, e + 16)
            if (count == 0xFFFF || cdOff == 0xFFFFFFFFL) throw IllegalArgumentException("ZIP64 غير مدعوم")
            val comment = tail.copyOfRange(e + 22, tailLen)
            val cd = ByteArray(cdSize.toInt()); raf.seek(cdOff); raf.readFully(cd)
            val ents = ArrayList<Ent>(count)
            var p = 0
            for (i in 0 until count) {
                if (u32(cd, p) != 0x02014b50L) throw IllegalArgumentException("الدليل المركزي تالف")
                val nl = u16(cd, p + 28); val xl = u16(cd, p + 30); val cl = u16(cd, p + 32)
                val total = 46 + nl + xl + cl
                ents.add(Ent(cd.copyOfRange(p + 46, p + 46 + nl), u16(cd, p + 8), u16(cd, p + 10), u32(cd, p + 20), u32(cd, p + 42), cd.copyOfRange(p, p + total)))
                p += total
            }
            val order = ents.sortedBy { it.localOff }
            val newOff = HashMap<Ent, Long>()
            var pos = 0L; var aligned = 0; var padded = 0L
            BufferedOutputStream(FileOutputStream(output), 256 * 1024).use { out ->
                for (en in order) {
                    val h = ByteArray(30); raf.seek(en.localOff); raf.readFully(h)
                    if (u32(h, 0) != 0x04034b50L) throw IllegalArgumentException("ترويسة محلية تالفة")
                    val nl = u16(h, 26); val xl = u16(h, 28)
                    val lname = ByteArray(nl); raf.readFully(lname)
                    val extra = ByteArray(xl); raf.readFully(extra)
                    val name = String(en.nameBytes, Charsets.UTF_8)
                    var pad = 0
                    if (en.method == 0) {
                        val a = if (name.endsWith(".so")) pageAlign else 4
                        val dataOff = pos + 30 + nl + xl
                        pad = ((a - (dataOff % a)) % a).toInt()
                        if (pad > 0) { aligned++; padded += pad }
                    }
                    val nh = h.copyOf(); val bb = ByteBuffer.wrap(nh).order(ByteOrder.LITTLE_ENDIAN); bb.putShort(28, (xl + pad).toShort())
                    newOff[en] = pos
                    out.write(nh); out.write(lname); out.write(extra); if (pad > 0) out.write(ByteArray(pad))
                    pos += 30 + nl + xl + pad
                    // البيانات المضغوطة + واصف البيانات إن وُجد
                    var remain = en.csize
                    raf.seek(en.localOff + 30 + nl + xl)
                    val buf = ByteArray(256 * 1024)
                    while (remain > 0) { val n = raf.read(buf, 0, minOf(remain, buf.size.toLong()).toInt()); if (n < 0) throw IllegalArgumentException("ZIP مقطوع"); out.write(buf, 0, n); remain -= n; pos += n }
                    if (en.flags and 8 != 0) {
                        val d = ByteArray(16); val got = raf.read(d, 0, 16)
                        val dl = if (got >= 4 && u32(d, 0) == 0x08074b50L) 16 else 12
                        out.write(d, 0, dl); pos += dl
                    }
                }
                val cdStart = pos
                for (en in ents) {
                    val c = en.cdBytes.copyOf(); ByteBuffer.wrap(c).order(ByteOrder.LITTLE_ENDIAN).putInt(42, newOff[en]!!.toInt())
                    out.write(c); pos += c.size
                }
                val eo = ByteArray(22 + comment.size); val b = ByteBuffer.wrap(eo).order(ByteOrder.LITTLE_ENDIAN)
                b.putInt(0, 0x06054b50); b.putShort(8, ents.size.toShort()); b.putShort(10, ents.size.toShort())
                b.putInt(12, (pos - cdStart).toInt()); b.putInt(16, cdStart.toInt()); b.putShort(20, comment.size.toShort())
                System.arraycopy(comment, 0, eo, 22, comment.size)
                out.write(eo)
            }
            return Report(ents.size, aligned, padded)
        }
    }
}
