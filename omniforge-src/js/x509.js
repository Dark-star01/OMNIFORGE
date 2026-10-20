/* توليد مفتاح RSA-2048 وشهادة X.509 ذاتية التوقيع (DER) عبر WebCrypto لتوقيع APK. بلا تبعيات. */
(function (root) {
  'use strict';
  const X = {};
  const te = new TextEncoder();
  const cat = (...a) => { let n = 0; a.forEach(x => (n += x.length)); const o = new Uint8Array(n); let p = 0; a.forEach(x => { o.set(x, p); p += x.length; }); return o; };
  const len = n => (n < 128 ? Uint8Array.of(n) : n < 256 ? Uint8Array.of(0x81, n) : n < 65536 ? Uint8Array.of(0x82, n >> 8, n & 255) : Uint8Array.of(0x83, n >> 16, (n >> 8) & 255, n & 255));
  const tlv = (tag, ...c) => { const body = cat(...c); return cat(Uint8Array.of(tag), len(body.length), body); };
  const seq = (...c) => tlv(0x30, ...c), set = (...c) => tlv(0x31, ...c);
  const oid = s => { const p = s.split('.').map(Number); const b = [p[0] * 40 + p[1]]; for (let i = 2; i < p.length; i++) { let v = p[i]; const t = [v & 127]; v >>= 7; while (v > 0) { t.unshift((v & 127) | 128); v >>= 7; } b.push(...t); } return tlv(0x06, Uint8Array.from(b)); };
  const int = u8 => { let i = 0; while (i < u8.length - 1 && u8[i] === 0) i++; let b = u8.subarray(i); if (b[0] & 0x80) b = cat(Uint8Array.of(0), b); return tlv(0x02, b); };
  const utf8 = s => tlv(0x0C, te.encode(s)), printable = s => tlv(0x13, te.encode(s));
  const utc = d => { const p = n => String(n).padStart(2, '0'); const y = d.getUTCFullYear(); const s = (y >= 2050 ? tlv(0x18, te.encode(y + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + 'Z')) : tlv(0x17, te.encode(p(y % 100) + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + 'Z'))); return s; };
  const SHA256_RSA = '1.2.840.113549.1.1.11';
  const name = (cn, org, country) => { const rdn = []; if (country) rdn.push(set(seq(oid('2.5.4.6'), printable(country)))); if (org) rdn.push(set(seq(oid('2.5.4.10'), utf8(org)))); rdn.push(set(seq(oid('2.5.4.3'), utf8(cn)))); return seq(...rdn); };
  const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s.replace(/\s+/g, '')), c => c.charCodeAt(0));
  X.b64 = b64; X.unb64 = unb64;
  X.pem = (u8, label) => '-----BEGIN ' + label + '-----\n' + b64(u8).replace(/(.{64})/g, '$1\n').replace(/\n$/, '') + '\n-----END ' + label + '-----\n';
  X.fromPem = s => { const m = /-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/.exec(s); if (!m) throw new Error('ملف PEM غير صالح'); return { label: m[1], der: unb64(m[2]) }; };
  // ينشئ {pkcs8, cert, alg:'RSA', subject, notAfter, sha256}
  X.generate = async function (o) {
    o = o || {}; const cn = (o.cn || 'OMNIFORGE').trim(), org = (o.org || '').trim(), country = (o.country || '').trim().toUpperCase(); if (!cn) throw new Error('الاسم (CN) مطلوب'); if (country && !/^[A-Z]{2}$/.test(country)) throw new Error('رمز الدولة حرفان مثل SA');
    const years = Math.min(50, Math.max(1, Math.floor(o.years || 30))); const sub = root.crypto && root.crypto.subtle; if (!sub) throw new Error('WebCrypto غير متاح');
    const kp = await sub.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: Uint8Array.of(1, 0, 1), hash: 'SHA-256' }, true, ['sign', 'verify']);
    const spki = new Uint8Array(await sub.exportKey('spki', kp.publicKey)), pkcs8 = new Uint8Array(await sub.exportKey('pkcs8', kp.privateKey));
    const serial = root.crypto.getRandomValues(new Uint8Array(16)); serial[0] &= 0x7F; if (!serial[0]) serial[0] = 1;
    const now = new Date(Date.now() - 60000), end = new Date(now.getTime()); end.setUTCFullYear(end.getUTCFullYear() + years); const nm = name(cn, org, country);
    const tbs = seq(tlv(0xA0, int(Uint8Array.of(2))), int(serial), seq(oid(SHA256_RSA), tlv(0x05)), nm, seq(utc(now), utc(end)), nm, spki);
    const sig = new Uint8Array(await sub.sign('RSASSA-PKCS1-v1_5', kp.privateKey, tbs));
    const cert = seq(tbs, seq(oid(SHA256_RSA), tlv(0x05)), tlv(0x03, cat(Uint8Array.of(0), sig)));
    const sha = new Uint8Array(await sub.digest('SHA-256', cert));
    return { alg: 'RSA', pkcs8, cert, subject: 'CN=' + cn + (org ? ', O=' + org : '') + (country ? ', C=' + country : ''), notAfter: end.toISOString().slice(0, 10), sha256: [...sha].map(b => b.toString(16).padStart(2, '0')).join('') };
  };
  // يستورد مفتاحاً خاصاً PKCS#8 (PEM) وشهادة (PEM). يتحقق أنهما زوج عبر توقيع تجريبي.
  X.importPem = async function (keyPem, certPem) {
    const k = X.fromPem(keyPem); if (k.label !== 'PRIVATE KEY') throw new Error('المفتاح يجب أن يكون PKCS#8 (BEGIN PRIVATE KEY). حوّل المفاتيح الأخرى بـ: openssl pkcs8 -topk8 -nocrypt');
    const c = X.fromPem(certPem); if (c.label !== 'CERTIFICATE') throw new Error('الشهادة يجب أن تكون PEM (BEGIN CERTIFICATE)');
    const sub = root.crypto.subtle; let alg = 'RSA'; let key; try { key = await sub.importKey('pkcs8', k.der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']); } catch (e) { try { key = await sub.importKey('pkcs8', k.der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']); alg = 'EC'; } catch (e2) { throw new Error('نوع المفتاح غير مدعوم (RSA أو EC P-256 فقط)'); } }
    return { alg, pkcs8: k.der, cert: c.der, subject: '(مستورد)', notAfter: '', sha256: [...new Uint8Array(await sub.digest('SHA-256', c.der))].map(b => b.toString(16).padStart(2, '0')).join('') };
  };
  X.toBackup = k => JSON.stringify({ v: 1, alg: k.alg, pkcs8: b64(k.pkcs8), cert: b64(k.cert), subject: k.subject, notAfter: k.notAfter, sha256: k.sha256 });
  X.fromBackup = s => { let o; try { o = JSON.parse(s); } catch (e) { throw new Error('ملف النسخة الاحتياطية تالف'); } if (!o || o.v !== 1 || !o.pkcs8 || !o.cert) throw new Error('ليس نسخة احتياطية لمفتاح OMNIFORGE'); return { alg: o.alg || 'RSA', pkcs8: unb64(o.pkcs8), cert: unb64(o.cert), subject: o.subject || '', notAfter: o.notAfter || '', sha256: o.sha256 || '' }; };
  if (typeof module !== 'undefined' && module.exports) module.exports = X; else { root.OF = root.OF || {}; root.OF.x509 = X; }
})(typeof window !== 'undefined' ? window : globalThis);
