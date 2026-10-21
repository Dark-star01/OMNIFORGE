package com.dark.omnillm

/**
 * جسر JNI إلى libomnillm.so. كل النصوص UTF-8 قياسي عبر ByteArray، والنتائج JSON (ok/code/message …).
 * إن لم تُحمَّل المكتبة (جهاز 32-بت، أو ABI غير مبني) يبقى [available] = false ويعلن البلاجن ذلك بوضوح بدل التعطل.
 */
object OmniLlmNative {
    @Volatile var loadError: String? = null
        private set
    val available: Boolean = try {
        System.loadLibrary("omnillm"); true
    } catch (e: Throwable) {   // UnsatisfiedLinkError أو أي فشل في ربط المكتبات المعتمدة (libllama/libggml)
        loadError = e.message ?: e.javaClass.simpleName; false
    }

    external fun nativeInit(libDir: ByteArray): ByteArray
    external fun nativeLoad(path: ByteArray, nCtx: Int, nThreads: Int, availMem: Long): ByteArray
    external fun nativeUnload(): ByteArray
    external fun nativeCancel()
    external fun nativeTokenize(text: ByteArray, special: Boolean): ByteArray
    external fun nativeGenerate(system: ByteArray, user: ByteArray, template: ByteArray, prefix: ByteArray, maxTokens: Int, temperature: Float, topK: Int, topP: Float, minP: Float, repeatPenalty: Float, seed: Long): ByteArray
    external fun nativeInfo(): ByteArray
}
