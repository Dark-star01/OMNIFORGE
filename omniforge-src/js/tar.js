/* TAR / TAR.GZ: قراءة (ustar + GNU long names + pax) وكتابة (ustar + pax للأسماء الطويلة). gzip عبر DecompressionStream/CompressionStream. */
(function (root) {
  'use strict';
  const td = new TextDecoder(), te = new TextEncoder();
  const str = (u, o, l) => { let e = o; const m = o + l; while (e < m && u[e]) e++; return td.decode(u.subarray(o, e)); };
  const oct = (u, o, l) => { if (u[o] & 0x80) { let v = 0; for (let i = 1; i < l; i++) v = v * 256 + u[o + i]; return v; } const s = str(u, o, l).trim(); return s ? parseInt(s, 8) : 0; };
  function checksumOK(u, o) { let sum = 0, sg = 0; for (let i = 0; i < 512; i++) { const b = (i >= 148 && i < 156) ? 32 : u[o + i]; sum += b; sg += (b << 24) >> 24; } const want = oct(u, o + 148, 8); return want === sum || want === sg; }
  function parse(u8, opts) {
    opts = opts || {}; const maxTotal = opts.maxTotal || 4 * 1073741824; const entries = []; let p = 0, total = 0, longName = null, pax = {}, gpax = {};
    while (p + 512 <= u8.length) {
      let zero = true; for (let i = 0; i < 512; i++) if (u8[p + i]) { zero = false; break; } if (zero) break;
      if (!checksumOK(u8, p)) throw new Error('ترويسة TAR تالفة عند البايت ' + p + ' (مجموع التحقق غير مطابق)');
      let name = str(u8, p, 100); const type = String.fromCharCode(u8[p + 156] || 48); let size = oct(u8, p + 124, 12); const mode = oct(u8, p + 100, 8), mtime = oct(u8, p + 136, 12); const prefix = str(u8, p + 345, 155); if (prefix && /^ustar/.test(str(u8, p + 257, 6))) name = prefix + '/' + name; const link = str(u8, p + 157, 100);
      p += 512; if (type === 'x' || type === 'g' || type === 'L' || type === 'K') { const body = u8.subarray(p, p + size); p += Math.ceil(size / 512) * 512; if (type === 'L') longName = str(body, 0, body.length); else if (type === 'K') { /* رابط طويل: يُتجاهل */ } else { const t = type === 'x' ? (pax = {}) : gpax; let q = 0; while (q < body.length) { let sp = q; while (sp < body.length && body[sp] !== 32) sp++; const len = parseInt(td.decode(body.subarray(q, sp)), 10); if (!(len > 0)) break; const rec = td.decode(body.subarray(sp + 1, q + len - 1)); const eq = rec.indexOf('='); if (eq > 0) t[rec.slice(0, eq)] = rec.slice(eq + 1); q += len; } } continue; }
      const px = Object.assign({}, gpax, pax); if (longName) name = longName; if (px.path) name = px.path; if (px.size) size = +px.size; longName = null; pax = {};
      if (p + size > u8.length) throw new Error('الأرشيف مقطوع: "' + name + '" يتجاوز نهاية الملف');
      const isDir = type === '5' || name.endsWith('/'); const isFile = type === '0' || type === '\0' || type === '7'; total += size; if (total > maxTotal) throw new Error('الحجم بعد الفك كبير جداً (احتمال قنبلة أرشيف)');
      if (isFile || isDir) entries.push({ name: isDir && !name.endsWith('/') ? name + '/' : name, dir: isDir, size: isDir ? 0 : size, mode, mtime: px.mtime ? Math.floor(+px.mtime) : mtime, data: isDir ? null : u8.subarray(p, p + size) });
      else entries.push({ name, dir: false, skipped: type === '1' || type === '2' ? (type === '2' ? 'رابط رمزي → ' + link : 'رابط صلب → ' + link) : 'نوع ' + type, size: 0, data: null });
      p += Math.ceil(size / 512) * 512;
    }
    return entries;
  }
  function octStr(v, len) { return v.toString(8).padStart(len - 1, '0') + '\0'; }
  function header(name, size, type, mode, mtime) {
    const h = new Uint8Array(512); const put = (s, o) => { const b = te.encode(s); h.set(b.subarray(0, 100 > b.length ? b.length : b.length), o); };
    const nb = te.encode(name); h.set(nb.subarray(0, 100), 0); put(octStr(mode, 8), 100); put(octStr(0, 8), 108); put(octStr(0, 8), 116); put(octStr(size, 12), 124); put(octStr(mtime, 12), 136); h.fill(32, 148, 156); h[156] = type.charCodeAt(0); put('ustar\u000000', 257);
    let sum = 0; for (let i = 0; i < 512; i++) sum += h[i]; put(sum.toString(8).padStart(6, '0') + '\0 ', 148); return h;
  }
  function paxRec(k, v) { const body = ' ' + k + '=' + v + '\n'; let len = te.encode(body).length + 1; len = te.encode(String(len)).length + te.encode(body).length; len = te.encode(String(len)).length + te.encode(body).length; return te.encode(len + body); }
  function build(entries) {
    const parts = []; let total = 0; const push = u => { parts.push(u); total += u.length; };
    for (const e of entries) {
      let name = e.name.replace(/^\/+/, ''); const dir = e.dir || name.endsWith('/'); if (dir && !name.endsWith('/')) name += '/'; const data = dir ? new Uint8Array(0) : e.data; const mtime = Math.max(0, Math.floor(e.mtime || Date.now() / 1000));
      if (te.encode(name).length > 100 || data.length > 8589934591) { const rec = paxRec('path', name); const body = new Uint8Array(rec.length); body.set(rec); push(header('PaxHeader/' + name.slice(0, 60).replace(/[^\x20-\x7e]/g, '_'), body.length, 'x', 0o644, mtime)); push(body); const pad = (512 - body.length % 512) % 512; if (pad) push(new Uint8Array(pad)); }
      push(header(name, data.length, dir ? '5' : '0', e.mode || (dir ? 0o755 : 0o644), mtime)); if (data.length) { push(data); const pad = (512 - data.length % 512) % 512; if (pad) push(new Uint8Array(pad)); }
    }
    push(new Uint8Array(1024)); const out = new Uint8Array(total); let o = 0; for (const c of parts) { out.set(c, o); o += c.length; } return out;
  }
  async function pipe(u8, stream) { const r = new Blob([u8]).stream().pipeThrough(stream); return new Uint8Array(await new Response(r).arrayBuffer()); }
  const gzip = u8 => pipe(u8, new CompressionStream('gzip')); const gunzip = u8 => pipe(u8, new DecompressionStream('gzip'));
  const isGzip = u8 => u8[0] === 0x1f && u8[1] === 0x8b;
  async function open(u8, opts) { if (isGzip(u8)) { try { u8 = await gunzip(u8); } catch (e) { throw new Error('ملف gzip تالف: ' + e.message); } } return parse(u8, opts); }
  const api = { parse, build, gzip, gunzip, isGzip, open };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else { root.OF = root.OF || {}; root.OF.tar = api; }
})(typeof window !== 'undefined' ? window : globalThis);
