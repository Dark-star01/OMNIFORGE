package com.yausername.youtubedl_android
open class YoutubeDLRequest(val url: String) { open fun addOption(k: String): YoutubeDLRequest = this; open fun addOption(k: String, v: String): YoutubeDLRequest = this; open fun addOption(k: String, v: Int): YoutubeDLRequest = this; open fun addOption(k: String, v: Long): YoutubeDLRequest = this }
open class YoutubeDLResponse(val out: String = "", val err: String = "", val exitCode: Int = 0)
open class YoutubeDL {
    open fun init(c: android.content.Context) {}
    open fun execute(request: YoutubeDLRequest, processId: String? = null, callback: ((Float, Long, String) -> Unit)? = null): YoutubeDLResponse = YoutubeDLResponse()
    open fun destroyProcessById(id: String): Boolean = true
    open fun updateYoutubeDL(c: android.content.Context, ch: UpdateChannel? = null): UpdateStatus? = null
    open fun versionName(c: android.content.Context): String? = null
    class CanceledException : Exception()
    enum class UpdateStatus { DONE, ALREADY_UP_TO_DATE }
    enum class UpdateChannel { STABLE, NIGHTLY, MASTER }
    companion object { @JvmStatic fun getInstance(): YoutubeDL = YoutubeDL() }
}
