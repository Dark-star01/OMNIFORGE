package com.dark.omninative

import android.content.ContentResolver
import android.net.Uri
import android.provider.DocumentsContract

/** مسح شجرة مجلد (SAF) وتجميع الإحصاءات أصلياً: العدد/الحجم لكل امتداد وأكبر الملفات. */
class DocScan(private val cr: ContentResolver, private val onProgress: (files: Long, bytes: Long) -> Unit) {
    @Volatile var cancelled = false
    class Big(val name: String, val size: Long, val path: String)
    class Stat(var count: Long = 0, var bytes: Long = 0)
    class Result(val files: Long, val dirs: Long, val bytes: Long, val byExt: Map<String, Stat>, val largest: List<Big>, val truncated: Boolean)

    fun scan(tree: Uri, maxEntries: Int = 300000, maxMs: Long = 90000, topN: Int = 30): Result {
        val t0 = System.currentTimeMillis()
        val byExt = HashMap<String, Stat>()
        val top = ArrayList<Big>()
        var files = 0L; var dirs = 0L; var bytes = 0L; var truncated = false; var seen = 0
        val rootId = DocumentsContract.getTreeDocumentId(tree)
        val stack = ArrayList<Pair<String, String>>() // (documentId, عرض المسار)
        stack.add(rootId to "")
        var lastEmit = 0L
        while (stack.isNotEmpty()) {
            if (cancelled) throw InterruptedException("cancelled")
            val (id, path) = stack.removeAt(stack.size - 1)
            val children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, id)
            val proj = arrayOf(
                DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_MIME_TYPE, DocumentsContract.Document.COLUMN_SIZE
            )
            val c = try { cr.query(children, proj, null, null, null) } catch (e: Exception) { null } ?: continue
            c.use { cur ->
                while (cur.moveToNext()) {
                    val did = cur.getString(0) ?: continue
                    val name = cur.getString(1) ?: "?"
                    val mime = cur.getString(2) ?: ""
                    if (mime == DocumentsContract.Document.MIME_TYPE_DIR) { dirs++; stack.add(did to "$path/$name"); continue }
                    val size = if (cur.isNull(3)) 0L else cur.getLong(3)
                    files++; bytes += size; seen++
                    val dot = name.lastIndexOf('.')
                    val ext = if (dot in 1 until name.length - 1 && name.length - dot <= 8) name.substring(dot + 1).lowercase() else "(بلا امتداد)"
                    val st = byExt.getOrPut(ext) { Stat() }; st.count++; st.bytes += size
                    if (top.size < topN || size > top[top.size - 1].size) {
                        top.add(Big(name, size, "$path/$name")); top.sortByDescending { it.size }
                        while (top.size > topN) top.removeAt(top.size - 1)
                    }
                }
            }
            val now = System.currentTimeMillis()
            if (now - lastEmit > 300) { lastEmit = now; onProgress(files, bytes) }
            if (seen >= maxEntries || now - t0 > maxMs) { truncated = true; break }
        }
        onProgress(files, bytes)
        return Result(files, dirs, bytes, byExt, top, truncated)
    }
}
