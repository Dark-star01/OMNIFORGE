package com.dark.omninative

import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket

/** فحص TCP وDNS المحلي (محلّل النظام). منطق JVM نقي بلا اعتماد على Android فيُختبر خارج الجهاز. */
object NetProbe {
    private val HOST_RE = Regex("^[A-Za-z0-9:]([A-Za-z0-9._:-]{0,253})\$")

    fun validHost(h: String?): Boolean = h != null && h.length <= 255 && HOST_RE.matches(h) && !h.contains("..")

    class TcpResult(val open: Boolean, val ms: Long, val error: String?, val address: String?)

    fun tcp(host: String, port: Int, timeoutMs: Int): TcpResult {
        require(validHost(host)) { "اسم المضيف غير صالح" }
        require(port in 1..65535) { "رقم المنفذ يجب أن يكون بين 1 و 65535" }
        val t = timeoutMs.coerceIn(200, 10000)
        val t0 = System.nanoTime()
        val s = Socket()
        return try {
            val addr = InetSocketAddress(host, port)
            if (addr.isUnresolved) {
                TcpResult(false, (System.nanoTime() - t0) / 1_000_000, "تعذّر تحليل الاسم", null)
            } else {
                s.connect(addr, t)
                TcpResult(true, (System.nanoTime() - t0) / 1_000_000, null, addr.address?.hostAddress)
            }
        } catch (e: java.net.SocketTimeoutException) {
            TcpResult(false, (System.nanoTime() - t0) / 1_000_000, "انتهت المهلة (مفلتر أو لا يستجيب)", null)
        } catch (e: java.net.ConnectException) {
            TcpResult(false, (System.nanoTime() - t0) / 1_000_000, "رُفض الاتصال (المنفذ مغلق)", null)
        } catch (e: Exception) {
            TcpResult(false, (System.nanoTime() - t0) / 1_000_000, e.message ?: e.javaClass.simpleName, null)
        } finally {
            try { s.close() } catch (e: Exception) {}
        }
    }

    class DnsResult(val addresses: List<String>, val ms: Long)

    fun dns(host: String): DnsResult {
        require(validHost(host)) { "اسم المضيف غير صالح" }
        val t0 = System.nanoTime()
        val all = InetAddress.getAllByName(host)
        val ips = all.mapNotNull { it.hostAddress }.distinct()
        return DnsResult(ips, (System.nanoTime() - t0) / 1_000_000)
    }
}
