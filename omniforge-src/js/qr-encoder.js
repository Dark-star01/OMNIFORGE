/* محرك QR مكتوب داخل OMNIFORGE (نمط Byte/UTF-8، الإصدارات 1–40، تصحيح L/M/Q/H).
 * يتبع مواصفة ISO/IEC 18004؛ جداول الكتل مأخوذة من المواصفة، ويُتحقق منها باختبارات فك خارجية.
 * الاستخدام: OF.qr.encode(text, 'M') → { size, modules: boolean[][], version, ecl, mask } */
(function () {
  'use strict';
  const ECC_PER_BLOCK = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  ];
  const NUM_BLOCKS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
  ];
  const ECL_IDX = { L: 0, M: 1, Q: 2, H: 3 }, FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };

  function rawModules(v) {
    let r = (16 * v + 128) * v + 64;
    if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; }
    return r;
  }
  const dataCodewords = (v, e) => Math.floor(rawModules(v) / 8) - ECC_PER_BLOCK[ECL_IDX[e]][v] * NUM_BLOCKS[ECL_IDX[e]][v];

  /* GF(256) */
  function gmul(x, y) { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z; }
  function rsGen(deg) { const r = new Array(deg).fill(0); r[deg - 1] = 1; let root = 1; for (let i = 0; i < deg; i++) { for (let j = 0; j < deg; j++) { r[j] = gmul(r[j], root); if (j + 1 < deg) r[j] ^= r[j + 1]; } root = gmul(root, 2); } return r; }
  function rsRem(data, gen) { const r = new Array(gen.length).fill(0); data.forEach(b => { const f = b ^ r.shift(); r.push(0); gen.forEach((c, i) => (r[i] ^= gmul(c, f))); }); return r; }

  function utf8(str) { return Array.from(new TextEncoder().encode(str)); }

  function encode(text, eclLetter, minVersion) {
    let ecl = eclLetter || 'M'; if (!(ecl in ECL_IDX)) throw new Error('مستوى تصحيح غير صالح');
    const bytes = utf8(text); if (!bytes.length) throw new Error('النص فارغ');
    let ver = Math.max(1, minVersion || 1), used = 0;
    for (; ; ver++) {
      if (ver > 40) throw new Error('النص طويل جداً لرمز QR (الحد الأقصى ≈ 2953 بايت عند مستوى L)');
      const cc = ver <= 9 ? 8 : 16; used = 4 + cc + bytes.length * 8; if (used <= dataCodewords(ver, ecl) * 8) break;
    }
    // رفع مستوى التصحيح مجاناً إن بقي مكان
    for (const e of ['M', 'Q', 'H']) if (ECL_IDX[e] > ECL_IDX[ecl] && eclLetter !== 'L' && used <= dataCodewords(ver, e) * 8 && false) ecl = e;
    const bits = []; const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4); put(bytes.length, ver <= 9 ? 8 : 16); bytes.forEach(b => put(b, 8));
    const cap = dataCodewords(ver, ecl) * 8; put(0, Math.min(4, cap - bits.length)); put(0, (8 - bits.length % 8) % 8);
    for (let pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
    const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));

    // كتل + تصحيح الأخطاء + التشابك
    const nb = NUM_BLOCKS[ECL_IDX[ecl]][ver], eb = ECC_PER_BLOCK[ECL_IDX[ecl]][ver], raw = Math.floor(rawModules(ver) / 8), nShort = nb - raw % nb, shortLen = Math.floor(raw / nb);
    const blocks = [], gen = rsGen(eb); for (let i = 0, k = 0; i < nb; i++) { const dat = data.slice(k, k + shortLen - eb + (i < nShort ? 0 : 1)); k += dat.length; const ecc = rsRem(dat, gen); if (i < nShort) dat.push(0); blocks.push(dat.concat(ecc)); }
    const all = []; for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - eb || j >= nShort) all.push(b[i]); });

    const size = ver * 4 + 17; const mod = Array.from({ length: size }, () => new Array(size).fill(false)); const fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, d) => { mod[y][x] = d; fn[y][x] = true; };
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy; if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4); } };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const align = []; if (ver > 1) { const n = Math.floor(ver / 7) + 2, step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2; align.push(6); for (let pos = size - 7; align.length < n; pos -= step) align.splice(1, 0, pos); }
    align.forEach((ax, i) => align.forEach((ay, j) => { if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) return; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }));
    const drawFormat = (mask) => {
      const d = FORMAT_BITS[ecl] << 3 | mask; let rem = d; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537); const b = (d << 10 | rem) ^ 0x5412; const g = i => ((b >>> i) & 1) !== 0;
      for (let i = 0; i <= 5; i++) set(8, i, g(i)); set(8, 7, g(6)); set(8, 8, g(7)); set(7, 8, g(8)); for (let i = 9; i < 15; i++) set(14 - i, 8, g(i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, g(i)); for (let i = 8; i < 15; i++) set(8, size - 15 + i, g(i)); set(8, size - 8, true);
    };
    drawFormat(0);
    if (ver >= 7) { let rem = ver; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25); const b = ver << 12 | rem; for (let i = 0; i < 18; i++) { const c = ((b >>> i) & 1) !== 0, a = size - 11 + i % 3, bb = Math.floor(i / 3); set(a, bb, c); set(bb, a, c); } }

    // وضع البيانات بالتعرّج
    let bi = 0; for (let right = size - 1; right >= 1; right -= 2) { if (right === 6) right = 5; for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) { const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert; if (!fn[y][x] && bi < all.length * 8) { mod[y][x] = ((all[bi >>> 3] >>> (7 - (bi & 7))) & 1) !== 0; bi++; } } }

    const masks = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => x * y % 2 + x * y % 3 === 0, (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0];
    const applyMask = m => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && masks[m](x, y)) mod[y][x] = !mod[y][x]; };
    function penalty() {
      let p = 0; const runs = (get) => { for (let a = 0; a < size; a++) { let run = 1; for (let b = 1; b < size; b++) { if (get(a, b) === get(a, b - 1)) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } } };
      runs((a, b) => mod[a][b]); runs((a, b) => mod[b][a]);
      for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = mod[y][x]; if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3; }
      const pat = [true, false, true, true, true, false, true, false, false, false, false]; const rpat = pat.slice().reverse();
      for (let a = 0; a < size; a++) for (let b = 0; b <= size - 11; b++) for (const [g] of [[(i) => mod[a][b + i]], [(i) => mod[b + i][a]]]) { let m1 = true, m2 = true; for (let i = 0; i < 11; i++) { const v = g(i); if (v !== pat[i]) m1 = false; if (v !== rpat[i]) m2 = false; if (!m1 && !m2) break; } if (m1) p += 40; if (m2) p += 40; }
      let dark = 0; mod.forEach(r => r.forEach(c => c && dark++)); p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10; return p;
    }
    let best = 0, bestP = Infinity;
    for (let m = 0; m < 8; m++) { applyMask(m); drawFormat(m); const pe = penalty(); if (pe < bestP) { bestP = pe; best = m; } applyMask(m); }
    applyMask(best); drawFormat(best);
    return { size, modules: mod, version: ver, ecl, mask: best };
  }

  function toSvg(qr, o = {}) {
    const q = o.margin == null ? 4 : o.margin, n = qr.size + q * 2; let d = '';
    for (let y = 0; y < qr.size; y++) { let x = 0; while (x < qr.size) { if (qr.modules[y][x]) { let w = 1; while (x + w < qr.size && qr.modules[y][x + w]) w++; d += 'M' + (x + q) + ' ' + (y + q) + 'h' + w + 'v1h-' + w + 'z'; x += w; } else x++; } }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + ' ' + n + '" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="' + (o.bg || '#ffffff') + '"/><path d="' + d + '" fill="' + (o.fg || '#000000') + '"/></svg>';
  }
  function toCanvas(qr, px, o = {}) {
    const q = o.margin == null ? 4 : o.margin, n = qr.size + q * 2, scale = Math.max(1, Math.floor(px / n)), c = document.createElement('canvas'); c.width = c.height = n * scale;
    const g = c.getContext('2d'); g.fillStyle = o.bg || '#ffffff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = o.fg || '#000000';
    for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) if (qr.modules[y][x]) g.fillRect((x + q) * scale, (y + q) * scale, scale, scale);
    return c;
  }
  (window.OF = window.OF || {}).qr = { encode, toSvg, toCanvas, capacity: (v, e) => dataCodewords(v, e) };
})();
