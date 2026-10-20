/* TOML 1.0: محلّل ومُسلسِل مستقلان (بدون تبعيات). التواريخ تُقرأ كنصوص ISO. */
(function (root) {
  'use strict';
  class TomlError extends Error {}
  function parse(src) {
    src = String(src).replace(/^﻿/, ''); let i = 0, line = 1; const n = src.length;
    const err = m => { throw new TomlError(m + ' (السطر ' + line + ')'); };
    const root_ = Object.create(null); let cur = root_; const explicit = new WeakSet(), arrTables = new WeakSet(), inlineT = new WeakSet(), defined = new WeakSet();
    const peek = () => src[i];
    const skipWs = () => { while (i < n && (src[i] === ' ' || src[i] === '\t')) i++; };
    const skipComment = () => { if (src[i] === '#') { while (i < n && src[i] !== '\n') { if (src.charCodeAt(i) < 32 && src[i] !== '\t' && src[i] !== '\r') err('محرف تحكم في التعليق'); i++; } } };
    const eol = () => { skipWs(); skipComment(); if (i >= n) return; if (src[i] === '\r' && src[i + 1] === '\n') i++; if (src[i] !== '\n') err('نص غير متوقع بعد القيمة'); i++; line++; };
    const skipWsNl = () => { for (;;) { skipWs(); if (src[i] === '#') skipComment(); if (src[i] === '\n') { i++; line++; } else if (src[i] === '\r' && src[i + 1] === '\n') { i += 2; line++; } else break; } };
    const ESC = { b: '\b', t: '\t', n: '\n', f: '\f', r: '\r', '"': '"', '\\': '\\' };
    function readEscape() { const c = src[i++]; if (c in ESC) return ESC[c]; if (c === 'u' || c === 'U') { const len = c === 'u' ? 4 : 8; const h = src.substr(i, len); if (!new RegExp('^[0-9A-Fa-f]{' + len + '}$').test(h)) err('تسلسل \\' + c + ' غير صالح'); const cp = parseInt(h, 16); if (cp > 0x10FFFF || (cp >= 0xD800 && cp < 0xE000)) err('نقطة ترميز غير صالحة'); i += len; return String.fromCodePoint(cp); } err('تسلسل هروب غير صالح \\' + (c || '')); }
    function basicStr() { i++; let s = ''; for (;;) { if (i >= n) err('نص غير مغلق'); const c = src[i]; if (c === '"') { i++; return s; } if (c === '\n') err('نص غير مغلق في نهاية السطر'); if (c === '\\') { i++; s += readEscape(); continue; } if (src.charCodeAt(i) < 32 && c !== '\t') err('محرف تحكم داخل النص'); s += c; i++; } }
    function litStr() { i++; const e = src.indexOf("'", i); if (e < 0) err('نص حرفي غير مغلق'); const s = src.slice(i, e); if (s.includes('\n')) err('نص حرفي غير مغلق في نهاية السطر'); i = e + 1; return s; }
    function mlBasic() { i += 3; if (src[i] === '\r' && src[i + 1] === '\n') i++; if (src[i] === '\n') { i++; line++; } let s = ''; for (;;) { if (i >= n) err('نص متعدد الأسطر غير مغلق'); if (src.startsWith('"""', i)) { let k = 3; while (src[i + k] === '"') k++; if (k > 5) err('علامات اقتباس زائدة'); s += '"'.repeat(k - 3); i += k; return s; } const c = src[i]; if (c === '\\') { i++; if (/[ \t\r\n]/.test(src[i])) { let j = i; while (src[j] === ' ' || src[j] === '\t') j++; if (src[j] === '\r' && src[j + 1] === '\n') j++; if (src[j] !== '\n') err('تسلسل \\ غير صالح'); while (j < n && /[ \t\r\n]/.test(src[j])) { if (src[j] === '\n') line++; j++; } i = j; } else s += readEscape(); continue; } if (c === '\n') line++; if (c === '\r' && src[i + 1] !== '\n') err('CR منفرد'); if (src.charCodeAt(i) < 32 && c !== '\t' && c !== '\n' && c !== '\r') err('محرف تحكم'); s += c; i++; } }
    function mlLit() { i += 3; if (src[i] === '\r' && src[i + 1] === '\n') i++; if (src[i] === '\n') { i++; line++; } let s = ''; for (;;) { if (i >= n) err('نص متعدد الأسطر غير مغلق'); if (src.startsWith("'''", i)) { let k = 3; while (src[i + k] === "'") k++; if (k > 5) err('علامات اقتباس زائدة'); s += "'".repeat(k - 3); i += k; return s; } if (src[i] === '\n') line++; s += src[i++]; } }
    function keyPart() { skipWs(); const c = src[i]; if (c === '"') return basicStr(); if (c === "'") return litStr(); const m = /^[A-Za-z0-9_-]+/.exec(src.slice(i, i + 256)); if (!m) err('مفتاح غير صالح'); i += m[0].length; return m[0]; }
    function keyPath() { const p = [keyPart()]; for (;;) { skipWs(); if (src[i] === '.') { i++; p.push(keyPart()); } else break; } return p; }
    const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
    function value() {
      skipWs(); const c = src[i];
      if (c === '"') return src.startsWith('"""', i) ? mlBasic() : basicStr();
      if (c === "'") return src.startsWith("'''", i) ? mlLit() : litStr();
      if (c === '[') return arrayV();
      if (c === '{') return inlineTable();
      const m = /^[^\s,\]\}#]+(?: \d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?/.exec(src.slice(i, i + 80)); if (!m) err('قيمة مفقودة'); const t = m[0]; i += t.length;
      if (t === 'true') return true; if (t === 'false') return false;
      if (/^\d{4}-\d{2}-\d{2}([Tt ]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})?)?$/.test(t) || /^\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(t)) return t.replace(' ', 'T').replace(/z$/, 'Z');
      if (/^[+-]?inf$/.test(t)) return t[0] === '-' ? -Infinity : Infinity; if (/^[+-]?nan$/.test(t)) return NaN;
      if (/^0x[0-9A-Fa-f]+(_[0-9A-Fa-f]+)*$/.test(t)) return numOrBig(parseInt(t.slice(2).replace(/_/g, ''), 16), t.slice(2).replace(/_/g, ''), 16);
      if (/^0o[0-7]+(_[0-7]+)*$/.test(t)) return numOrBig(parseInt(t.slice(2).replace(/_/g, ''), 8), t.slice(2).replace(/_/g, ''), 8);
      if (/^0b[01]+(_[01]+)*$/.test(t)) return numOrBig(parseInt(t.slice(2).replace(/_/g, ''), 2), t.slice(2).replace(/_/g, ''), 2);
      if (/^[+-]?(0|[1-9][0-9]*(_[0-9]+)*)$/.test(t) || /^[+-]?[1-9](_?[0-9])*$/.test(t)) { const d = t.replace(/_/g, ''); const v = Number(d); return Number.isSafeInteger(v) ? v : (BigInt(d) > 9223372036854775807n || BigInt(d) < -9223372036854775808n ? err('عدد صحيح خارج نطاق 64 بت') : v); }
      if (/^[+-]?(0|[1-9](_?[0-9])*)(\.[0-9](_?[0-9])*)?([eE][+-]?[0-9](_?[0-9])*)?$/.test(t) && /[.eE]/.test(t)) return Number(t.replace(/_/g, ''));
      err('قيمة غير صالحة: ' + t.slice(0, 30));
    }
    function numOrBig(v, digits, base) { if (!Number.isSafeInteger(v)) { const b = BigInt((base === 16 ? '0x' : base === 8 ? '0o' : '0b') + digits); if (b > 9223372036854775807n) err('عدد صحيح خارج نطاق 64 بت'); } return v; }
    function arrayV() { i++; const a = []; for (;;) { skipWsNl(); if (src[i] === ']') { i++; return a; } if (i >= n) err('مصفوفة غير مغلقة'); a.push(value()); skipWsNl(); if (src[i] === ',') { i++; continue; } if (src[i] === ']') { i++; return a; } err('متوقع , أو ]'); } }
    function inlineTable() { i++; const t = Object.create(null); inlineT.add(t); skipWs(); if (src[i] === '}') { i++; return t; } for (;;) { skipWs(); const p = keyPath(); skipWs(); if (src[i] !== '=') err('متوقع ='); i++; const v = value(); setPath(t, p, v, true); skipWs(); if (src[i] === ',') { i++; continue; } if (src[i] === '}') { i++; return t; } err('متوقع , أو }'); } }
    function setPath(tbl, path, v) { let t = tbl; for (let k = 0; k < path.length - 1; k++) { const key = path[k]; if (!(key in t)) { const o = Object.create(null); defined.add(o); t[key] = o; } else if (!isObj(t[key]) || inlineT.has(t[key]) || explicit.has(t[key])) err('تعارض في المفتاح ' + key); t = t[key]; } const last = path[path.length - 1]; if (last in t) err('مفتاح مكرر: ' + last); t[last] = v; }
    function descend(path, forArray) { let t = root_; for (let k = 0; k < path.length; k++) { const key = path[k]; const lastK = k === path.length - 1; if (!(key in t)) { if (lastK && forArray) { t[key] = []; arrTables.add(t[key]); } else t[key] = Object.create(null); } let nx = t[key]; if (Array.isArray(nx)) { if (!arrTables.has(nx)) err('لا يمكن توسيع مصفوفة ثابتة: ' + key); if (lastK && forArray) { const o = Object.create(null); nx.push(o); return o; } nx = nx[nx.length - 1]; } else if (lastK && forArray) err('تعارض: ' + key + ' ليس جدول مصفوفة'); if (!isObj(nx) || inlineT.has(nx)) err('تعارض في المفتاح ' + key); if (lastK && !forArray) { if (explicit.has(nx)) err('جدول مكرر: ' + path.join('.')); explicit.add(nx); } t = nx; } return t; }
    while (i < n) {
      skipWsNl(); if (i >= n) break; const c = src[i];
      if (c === '[') { const arr = src[i + 1] === '['; i += arr ? 2 : 1; const p = keyPath(); skipWs(); if (arr ? !src.startsWith(']]', i) : src[i] !== ']') err('متوقع ' + (arr ? ']]' : ']')); i += arr ? 2 : 1; cur = descend(p, arr); eol(); }
      else { const p = keyPath(); skipWs(); if (src[i] !== '=') err('متوقع = بعد المفتاح'); i++; const v = value(); setPath(cur, p, v); eol(); }
    }
    return plain(root_);
  }
  function plain(v) { if (Array.isArray(v)) return v.map(plain); if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) Object.defineProperty(o, k, { value: plain(v[k]), enumerable: true, writable: true, configurable: true }); return o; } return v; }

  const bare = k => /^[A-Za-z0-9_-]+$/.test(k);
  const qkey = k => bare(k) ? k : strQ(k);
  function strQ(s) { return '"' + s.replace(/[\\"\u0000-\u001F\u007F]/g, c => ({ '\\': '\\\\', '"': '\\"', '\n': '\\n', '\t': '\\t', '\r': '\\r', '\b': '\\b', '\f': '\\f' }[c] || '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))) + '"'; }
  const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/.test(s) && false; // النصوص تبقى نصوصاً دائماً (لا تخمين)
  function scalar(v, path) {
    if (v === null || v === undefined) throw new TomlError('TOML لا يدعم null' + (path ? ' (عند ' + path + ')' : ''));
    if (typeof v === 'string') return strQ(v); if (typeof v === 'boolean') return String(v);
    if (typeof v === 'number') return Number.isNaN(v) ? 'nan' : v === Infinity ? 'inf' : v === -Infinity ? '-inf' : Number.isInteger(v) && Math.abs(v) < 1e21 ? String(v) : (/[.eE]/.test(String(v)) ? String(v) : String(v) + '.0');
    if (typeof v === 'bigint') return String(v);
    throw new TomlError('نوع غير مدعوم عند ' + path);
  }
  const isTable = v => v && typeof v === 'object' && !Array.isArray(v);
  const isArrTables = a => Array.isArray(a) && a.length && a.every(isTable);
  function inline(v, path) { if (Array.isArray(v)) return '[' + v.map((x, k) => inline(x, path + '[' + k + ']')).join(', ') + ']'; if (isTable(v)) return '{ ' + Object.keys(v).map(k => qkey(k) + ' = ' + inline(v[k], path + '.' + k)).join(', ') + ' }'; return scalar(v, path); }
  function stringify(obj) {
    if (!isTable(obj)) throw new TomlError('TOML يتطلب كائناً في الجذر');
    const out = []; (function emit(t, prefix, hdr) {
      const keys = Object.keys(t); const simple = keys.filter(k => !isTable(t[k]) && !isArrTables(t[k])); const subs = keys.filter(k => !simple.includes(k));
      if (hdr) out.push(hdr);
      for (const k of simple) out.push(qkey(k) + ' = ' + inline(t[k], prefix.concat(k).join('.')));
      for (const k of subs) { const p = prefix.concat(qkey(k)); if (isTable(t[k])) { if (out.length) out.push(''); emit(t[k], p, '[' + p.join('.') + ']'); } else for (const it of t[k]) { if (out.length) out.push(''); emit(it, p, '[[' + p.join('.') + ']]'); } }
    })(obj, [], null);
    return out.join('\n') + '\n';
  }
  const api = { parse, stringify, TomlError };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else { root.OF = root.OF || {}; root.OF.toml = api; }
})(typeof window !== 'undefined' ? window : globalThis);
