package com.dark.omninative

import com.android.apksig.ApkSigner
import com.android.apksig.ApkVerifier
import java.io.ByteArrayInputStream
import java.io.File
import java.security.KeyFactory
import java.security.MessageDigest
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.security.spec.PKCS8EncodedKeySpec

/** محاذاة + توقيع + تحقق عبر apksig. المفتاح PKCS#8 والشهادة X.509 DER (تُولَّد/تُستورد من الواجهة). */
object ApkSign {
    private fun hex(b: ByteArray) = b.joinToString("") { "%02x".format(it) }

    class SignResult(val aligned: Int, val v1: Boolean, val v2: Boolean, val v3: Boolean)

    fun sign(input: File, output: File, work: File, pkcs8: ByteArray, certDer: List<ByteArray>, keyAlg: String, v1: Boolean, v2: Boolean, v3: Boolean): SignResult {
        require(certDer.isNotEmpty()) { "الشهادة مفقودة" }
        require(keyAlg == "RSA" || keyAlg == "EC") { "خوارزمية مفتاح غير مدعومة" }
        val key = KeyFactory.getInstance(keyAlg).generatePrivate(PKCS8EncodedKeySpec(pkcs8))
        val cf = CertificateFactory.getInstance("X.509")
        val certs = certDer.map { cf.generateCertificate(ByteArrayInputStream(it)) as X509Certificate }
        val aligned = File(work, "aligned.apk")
        val rep = ZipAlign.align(input, aligned)
        try {
            val cfg = ApkSigner.SignerConfig.Builder("OMNIFORGE", key, certs).build()
            ApkSigner.Builder(listOf(cfg))
                .setInputApk(aligned)
                .setOutputApk(output)
                .setV1SigningEnabled(v1)
                .setV2SigningEnabled(v2)
                .setV3SigningEnabled(v3)
                .setCreatedBy("OMNIFORGE")
                .build()
                .sign()
        } finally {
            aligned.delete()
        }
        return SignResult(rep.aligned, v1, v2, v3)
    }

    class VerifyInfo(
        val verified: Boolean, val v1: Boolean, val v2: Boolean, val v3: Boolean,
        val errors: List<String>, val warnings: List<String>, val certSha256: List<String>, val certSubjects: List<String>
    )

    fun verify(apk: File): VerifyInfo {
        val r = ApkVerifier.Builder(apk).build().verify()
        val certs = r.signerCertificates ?: emptyList()
        return VerifyInfo(
            r.isVerified, r.isVerifiedUsingV1Scheme, r.isVerifiedUsingV2Scheme, r.isVerifiedUsingV3Scheme,
            (r.errors ?: emptyList()).map { it.toString() }, (r.warnings ?: emptyList()).map { it.toString() },
            certs.map { hex(MessageDigest.getInstance("SHA-256").digest(it.encoded)) },
            certs.map { it.subjectX500Principal.name }
        )
    }
}
