/* ZIP محمي بكلمة مرور (ZipCrypto التقليدي): قراءة وفك + إنشاء. ملاحظة: ZipCrypto تشفير ضعيف؛ التشفير القوي AES غير مدعوم هنا. */
(function (root) {
  'use strict';
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crcUpd = (crc, b) => (CRC[(crc ^ b) & 255] ^ (crc >>> 8)) >>> 0;
  const crc32 = u => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const te = new TextEncoder(), td = new TextDecoder();
  function Keys(pw) { this.k0 = 0x12345678; this.k1 = 0x23456789; this.k2 = 0x34567890; for (const b of te.encode(pw)) this.upd(b); }
  Keys.prototype.upd = function (c) { this.k0 = crcUpd(this.k0, c); this.k1 = (Math.imul((this.k1 + (this.k0 & 255)) >>> 0, 134775813) + 1) >>> 0; this.k2 = crcUpd(this.k2, this.k1 >>> 24); };
  Keys.prototype.next = function () { const t = (this.k2 | 2) & 0xFFFF; return (Math.imul(t, t ^ 1) >>> 8) & 255; };
  Keys.prototype.dec = function (c) { const p = c ^ this.next(); this.upd(p); return p; };
  Keys.prototype.enc = function (p) { const c = p ^ this.next(); this.upd(p); return c; };
  async function pipe(u8, stream) { const r = new Blob([u8]).stream().pipeThrough(stream); return new Uint8Array(await new Response(r).arrayBuffer()); }
  const inflate = u => pipe(u, new DecompressionStream('deflate-raw')); const deflate = u => pipe(u, new CompressionStream('deflate-raw'));
  const u16 = (u, o) => u[o] | (u[o + 1] << 8), u32 = (u, o) => (u[o] | (u[o + 1] << 8) | (u[o + 2] << 16) | (u[o + 3] << 24)) >>> 0;
  function central(u8) {
    let e = -1; for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (u32(u8, i) === 0x06054b50) { e = i; break; } if (e < 0) throw new Error('ليس أرشيف ZIP صالحاً (لا يوجد سجل النهاية)');
    const n = u16(u8, e + 10); let p = u32(u8, e + 16); const list = [];
    for (let i = 0; i < n; i++) { if (u32(u8, p) !== 0x02014b50) throw new Error('الدليل المركزي تالف'); const fl = u16(u8, p + 8), method = u16(u8, p + 10), time = u16(u8, p + 12), date = u16(u8, p + 14), crc = u32(u8, p + 16), csz = u32(u8, p + 20), usz = u32(u8, p + 24), nl = u16(u8, p + 28), xl = u16(u8, p + 30), cl = u16(u8, p + 32), off = u32(u8, p + 42); const raw = u8.subarray(p + 46, p + 46 + nl); const name = (fl & 0x800) ? td.decode(raw) : td.decode(raw); if (csz === 0xFFFFFFFF || usz === 0xFFFFFFFF || off === 0xFFFFFFFF) throw new Error('ZIP64 غير مدعوم في الأرشيفات المشفرة'); list.push({ name, fl, method, time, date, crc, csz, usz, off }); p += 46 + nl + xl + cl; }
    return list;
  }
  const isEncrypted = u8 => { try { return central(u8).some(x => x.fl & 1); } catch (e) { return false; } };
  async function extract(u8, password, opts) {
    opts = opts || {}; const maxTotal = opts.maxTotal || 4 * 1073741824; const list = central(u8); const out = []; let total = 0, wrong = 0, encCount = 0;
    for (const e of list) {
      const dir = e.name.endsWith('/'); if (u32(u8, e.off) !== 0x04034b50) throw new Error('ترويسة محلية تالفة: ' + e.name); const dataOff = e.off + 30 + u16(u8, e.off + 26) + u16(u8, e.off + 28); let body = u8.subarray(dataOff, dataOff + e.csz);
      if (!(e.fl & 1)) { out.push({ name: e.name, dir, data: dir ? null : await unpack(body, e), size: e.usz }); total += e.usz; continue; }
      if (e.method === 99) throw new Error('الأرشيف مشفّر بـ AES (WinZip) وهذا غير مدعوم؛ المدعوم هو ZipCrypto فقط.');
      if (!password) throw new Error('الأرشيف محمي بكلمة مرور'); if (dir) { out.push({ name: e.name, dir: true, data: null, size: 0 }); continue; } encCount++; if (body.length < 12) throw new Error('بيانات مشفرة قصيرة: ' + e.name);
      const k = new Keys(password); const plain = new Uint8Array(body.length - 12); let last = 0; for (let i = 0; i < body.length; i++) { const p = k.dec(body[i]); if (i < 12) last = p; else plain[i - 12] = p; }
      const check = (e.fl & 8) ? (e.time >>> 8) & 255 : (e.crc >>> 24) & 255; if (last !== check) { wrong++; if (wrong >= 1 && encCount === 1) throw new WrongPassword(); continue; }
      const data = await unpack(plain, e); if (crc32(data) !== e.crc) { if (encCount === 1) throw new WrongPassword(); throw new Error('فشل التحقق CRC للملف ' + e.name + ' (كلمة المرور خاطئة أو الملف تالف)'); }
      total += data.length; if (total > maxTotal) throw new Error('الحجم بعد الفك كبير جداً (احتمال قنبلة أرشيف)'); out.push({ name: e.name, dir: false, data, size: data.length });
    }
    if (wrong) throw new WrongPassword(); return out;
  }
  class WrongPassword extends Error { constructor() { super('كلمة المرور خاطئة'); this.wrongPassword = true; } }
  async function unpack(body, e) { if (e.method === 0) return body.slice(); if (e.method === 8) { try { return await inflate(body); } catch (x) { throw new Error('تعذر فك ضغط ' + e.name + ': ' + x.message); } } throw new Error('طريقة ضغط غير مدعومة (' + e.method + ') للملف ' + e.name); }
  async function create(entries, password) {
    const parts = [], cds = []; let off = 0; const push = u => { parts.push(u); off += u.length; };
    const now = new Date(); const dtime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1), ddate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    for (const e of entries) {
      const nb = te.encode(e.name), dir = e.name.endsWith('/'), data = dir ? new Uint8Array(0) : e.data; let method = 0, body = data; if (!dir && data.length > 32) { const d = await deflate(data); if (d.length < data.length) { method = 8; body = d; } }
      const crc = crc32(data); let enc = body, fl = 0x800; if (password && !dir) { fl |= 1; const k = new Keys(password); const hdr = new Uint8Array(12); crypto.getRandomValues(hdr.subarray(0, 11)); hdr[11] = (crc >>> 24) & 255; enc = new Uint8Array(12 + body.length); for (let i = 0; i < 12; i++) enc[i] = k.enc(hdr[i]); for (let i = 0; i < body.length; i++) enc[12 + i] = k.enc(body[i]); }
      const lh = new Uint8Array(30 + nb.length), dv = new DataView(lh.buffer); dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, fl, true); dv.setUint16(8, method, true); dv.setUint16(10, dtime, true); dv.setUint16(12, ddate, true); dv.setUint32(14, crc, true); dv.setUint32(18, enc.length, true); dv.setUint32(22, data.length, true); dv.setUint16(26, nb.length, true); lh.set(nb, 30);
      cds.push({ nb, fl, method, crc, csz: enc.length, usz: data.length, off, dir }); push(lh); push(enc);
    }
    const cdStart = off; for (const c of cds) { const h = new Uint8Array(46 + c.nb.length), dv = new DataView(h.buffer); dv.setUint32(0, 0x02014b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 20, true); dv.setUint16(8, c.fl, true); dv.setUint16(10, c.method, true); dv.setUint16(12, dtime, true); dv.setUint16(14, ddate, true); dv.setUint32(16, c.crc, true); dv.setUint32(20, c.csz, true); dv.setUint32(24, c.usz, true); dv.setUint16(28, c.nb.length, true); if (c.dir) dv.setUint32(38, 0x10, true); dv.setUint32(42, c.off, true); h.set(c.nb, 46); push(h); }
    const cdLen = off - cdStart; const end = new Uint8Array(22), ev = new DataView(end.buffer); ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, cds.length, true); ev.setUint16(10, cds.length, true); ev.setUint32(12, cdLen, true); ev.setUint32(16, cdStart, true); push(end);
    const outU = new Uint8Array(off); let o = 0; for (const c of parts) { outU.set(c, o); o += c.length; } return outU;
  }
  const api = { extract, create, isEncrypted, crc32, WrongPassword };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else { root.OF = root.OF || {}; root.OF.zipcrypto = api; }
})(typeof window !== 'undefined' ? window : globalThis);
