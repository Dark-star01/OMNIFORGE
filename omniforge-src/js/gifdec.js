/* فك GIF (87a/89a): يعيد إطارات RGBA كاملة بعد تطبيق التراكب (disposal) والشفافية. */
(function (root) {
  'use strict';
  function lzw(data, minCode, total) {
    const out = new Uint8Array(total); let op = 0; const clear = 1 << minCode, eoi = clear + 1; let size = minCode + 1, next = eoi + 1, prev = -1;
    const pre = new Int16Array(4096), suf = new Uint8Array(4096), stack = new Uint8Array(4097); for (let i = 0; i < clear; i++) suf[i] = i;
    let bits = 0, acc = 0, ip = 0;
    for (;;) {
      while (bits < size) { if (ip >= data.length) return out.subarray(0, op); acc |= data[ip++] << bits; bits += 8; }
      let code = acc & ((1 << size) - 1); acc >>>= size; bits -= size;
      if (code === clear) { size = minCode + 1; next = eoi + 1; prev = -1; continue; } if (code === eoi) break;
      let sp = 0, c = code;
      if (prev === -1) { if (code >= clear) throw new Error('بيانات LZW تالفة'); out[op++] = suf[code]; prev = code; if (op >= total) break; continue; }
      if (code >= next) { if (code > next) throw new Error('بيانات LZW تالفة'); stack[sp++] = 0; c = prev; } // KwKwK: الحرف الأول يُضاف لاحقاً
      while (c >= clear) { stack[sp++] = suf[c]; c = pre[c]; } stack[sp++] = suf[c]; const first = stack[sp - 1];
      if (code >= next) stack[0] = first;
      while (sp > 0 && op < total) out[op++] = stack[--sp];
      if (next < 4096) { pre[next] = prev; suf[next] = first; next++; if (next === (1 << size) && size < 12) size++; }
      prev = code; if (op >= total) break;
    }
    return out.subarray(0, op);
  }
  function decode(u8, opts) {
    opts = opts || {}; const maxPixels = opts.maxPixels || 300e6; let p = 0;
    const sig = String.fromCharCode(...u8.subarray(0, 6)); if (sig !== 'GIF87a' && sig !== 'GIF89a') throw new Error('ليس ملف GIF صالحاً'); p = 6;
    const u16 = () => { const v = u8[p] | (u8[p + 1] << 8); p += 2; return v; };
    const W = u16(), H = u16(), flags = u8[p++], bgIdx = u8[p++]; p++; if (!W || !H) throw new Error('أبعاد GIF غير صالحة');
    let gct = null; if (flags & 0x80) { const n = 2 << (flags & 7); gct = u8.subarray(p, p + n * 3); p += n * 3; }
    const frames = []; let gce = null; let canvas = new Uint8ClampedArray(W * H * 4); let loop = null;
    while (p < u8.length) {
      const b = u8[p++];
      if (b === 0x3B) break;
      if (b === 0x21) { const lab = u8[p++]; if (lab === 0xF9 && u8[p] >= 4) { gce = { disposal: (u8[p + 1] >> 2) & 7, trans: (u8[p + 1] & 1) ? u8[p + 4] : -1, delay: (u8[p + 2] | (u8[p + 3] << 8)) * 10 }; } else if (lab === 0xFF && u8[p] === 11 && String.fromCharCode(...u8.subarray(p + 1, p + 12)) === 'NETSCAPE2.0') { const q = p + 12; if (u8[q] === 3 && u8[q + 1] === 1) loop = u8[q + 2] | (u8[q + 3] << 8); }
        while (p < u8.length && u8[p]) p += u8[p] + 1; p++; continue; }
      if (b !== 0x2C) throw new Error('بنية GIF غير صالحة عند البايت ' + (p - 1));
      const x = u16(), y = u16(), w = u16(), h = u16(), f = u8[p++]; let pal = gct; if (f & 0x80) { const n = 2 << (f & 7); pal = u8.subarray(p, p + n * 3); p += n * 3; } if (!pal) throw new Error('GIF بلا جدول ألوان');
      const minCode = u8[p++]; if (minCode < 2 || minCode > 8) throw new Error('رمز LZW الأدنى غير صالح'); const chunks = []; let len = 0; while (p < u8.length && u8[p]) { chunks.push(u8.subarray(p + 1, p + 1 + u8[p])); len += u8[p]; p += u8[p] + 1; } p++;
      if ((frames.length + 1) * W * H > maxPixels) throw new Error('GIF كبير جداً (عدد الإطارات × الأبعاد)'); const data = new Uint8Array(len); let o = 0; for (const c of chunks) { data.set(c, o); o += c.length; }
      const idx = lzw(data, minCode, w * h);
      const prevCanvas = gce && gce.disposal === 3 ? canvas.slice() : null; const tr = gce ? gce.trans : -1;
      const rowOf = r => { if (!(f & 0x40)) return r; const pass = [[0, 8], [4, 8], [2, 4], [1, 2]]; let n = 0; for (const [s, st] of pass) { const cnt = Math.max(0, Math.ceil((h - s) / st)); if (r < n + cnt) return s + (r - n) * st; n += cnt; } return r; };
      for (let r = 0; r < h; r++) { const yy = y + rowOf(r); if (yy >= H) continue; for (let c = 0; c < w; c++) { const xx = x + c; if (xx >= W) continue; const k = idx[r * w + c]; if (k === undefined || k === tr) continue; const d = (yy * W + xx) * 4; canvas[d] = pal[k * 3]; canvas[d + 1] = pal[k * 3 + 1]; canvas[d + 2] = pal[k * 3 + 2]; canvas[d + 3] = 255; } }
      frames.push({ rgba: canvas.slice(), delay: gce ? gce.delay : 100, disposal: gce ? gce.disposal : 0 });
      const disp = gce ? gce.disposal : 0; if (disp === 2) { for (let r = 0; r < h; r++) { const yy = y + r; if (yy >= H) break; for (let c = 0; c < w; c++) { if (x + c >= W) break; canvas.fill(0, (yy * W + x + c) * 4, (yy * W + x + c) * 4 + 4); } } } else if (disp === 3 && prevCanvas) canvas = prevCanvas;
      gce = null;
    }
    if (!frames.length) throw new Error('لا توجد إطارات في الملف'); return { width: W, height: H, frames, loop };
  }
  const api = { decode, lzw };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else { root.OF = root.OF || {}; root.OF.gifdec = api; }
})(typeof window !== 'undefined' ? window : globalThis);
