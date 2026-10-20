/* منسّق ومصغّر JavaScript مكتوب داخل التطبيق (بلا مكتبات).
 *  OF.jsfmt.tokenize(src)        → قائمة رموز
 *  OF.jsfmt.beautify(src, indent)→ نص منسّق
 *  OF.jsfmt.minify(src)          → نص مصغّر (إزالة تعليقات ومسافات فقط، بلا إعادة تسمية متغيرات)
 * الضمانات (تُختبر في tests/jsfmt.test.js): لا يغيّر أي رمز، ولا يحذف سطراً جديداً قد يعتمد عليه ASI،
 * وينتج كوداً يمر بفحص الصياغة ويعطي نفس سلوك الأصل. ليس بديلاً عن Terser (لا mangling ولا tree-shaking). */
(function (root) {
  'use strict';
  const KW_REGEX_BEFORE = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
  const PUNCT = ['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=', '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>', '**'];
  const isIdStart = c => /[A-Za-z_$\u0080-￿\\]/.test(c);
  const isIdPart = c => /[A-Za-z0-9_$\u0080-￿\\]/.test(c);

  function tokenize(s) {
    const toks = []; let i = 0; const n = s.length; let nl = false; // nl: كان هناك سطر جديد قبل الرمز التالي
    const push = (type, value) => { toks.push({ type, value, nl }); nl = false; };
    const lastSig = () => { for (let k = toks.length - 1; k >= 0; k--) if (toks[k].type !== 'comment') return toks[k]; return null; };
    function skipTemplate(j) { // j عند ` ؛ يرجع الموضع بعد ` الإغلاق
      j++;
      while (j < n) {
        const c = s[j];
        if (c === '\\') { j += 2; continue; }
        if (c === '`') return j + 1;
        if (c === '$' && s[j + 1] === '{') { j = skipBraces(j + 1); continue; }
        j++;
      }
      throw new Error('قالب نصي غير مغلق');
    }
    function skipBraces(j) { // j عند { ؛ يرجع بعد } المطابقة
      let d = 0;
      while (j < n) {
        const c = s[j];
        if (c === '{') { d++; j++; } else if (c === '}') { d--; j++; if (!d) return j; }
        else if (c === '"' || c === "'") { j = skipStr(j); }
        else if (c === '`') { j = skipTemplate(j); }
        else if (c === '/' && s[j + 1] === '/') { while (j < n && s[j] !== '\n') j++; }
        else if (c === '/' && s[j + 1] === '*') { const e = s.indexOf('*/', j + 2); j = e < 0 ? n : e + 2; }
        else j++;
      }
      throw new Error('أقواس قالب نصي غير متوازنة');
    }
    function skipStr(j) {
      const q = s[j]; j++;
      while (j < n && s[j] !== q) { if (s[j] === '\\') j++; if (s[j] === '\n' && s[j - 1] !== '\\') throw new Error('نص غير مغلق'); j++; }
      if (j >= n) throw new Error('نص غير مغلق');
      return j + 1;
    }
    function regexAllowed() {
      const p = lastSig(); if (!p) return true;
      if (p.type === 'num' || p.type === 'str' || p.type === 'tpl' || p.type === 'regex') return false;
      if (p.type === 'id') return KW_REGEX_BEFORE.has(p.value);
      if (p.type === 'punct') return !(p.value === ')' || p.value === ']' || p.value === '}' || p.value === '++' || p.value === '--');
      return true;
    }
    while (i < n) {
      const c = s[i];
      if (c === '\n' || c === '\r' || c === ' ' || c === ' ') { nl = true; i++; continue; }
      if (c === ' ' || c === '\t' || c === '\f' || c === '\v' || c === ' ' || c === '﻿') { i++; continue; }
      if (c === '/' && s[i + 1] === '/') { let j = i; while (j < n && s[j] !== '\n' && s[j] !== '\r') j++; push('comment', s.slice(i, j)); toks[toks.length - 1].line = true; i = j; continue; }
      if (c === '/' && s[i + 1] === '*') { const e = s.indexOf('*/', i + 2); if (e < 0) throw new Error('تعليق غير مغلق'); const body = s.slice(i, e + 2); push('comment', body); if (/[\r\n]/.test(body)) nl = true; i = e + 2; continue; }
      if (c === '"' || c === "'") { const j = skipStr(i); push('str', s.slice(i, j)); i = j; continue; }
      if (c === '`') { const j = skipTemplate(i); push('tpl', s.slice(i, j)); i = j; continue; }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] || ''))) {
        let j = i; const m = /^(0[xX][0-9a-fA-F_]+n?|0[oO][0-7_]+n?|0[bB][01_]+n?|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?n?)/.exec(s.slice(i, i + 80));
        j = i + m[0].length; push('num', s.slice(i, j)); i = j; continue;
      }
      if (isIdStart(c) || (c === '#' && isIdStart(s[i + 1] || ''))) { let j = i + 1; while (j < n && isIdPart(s[j])) { if (s[j] === '\\') j++; j++; } push('id', s.slice(i, j)); i = j; continue; }
      if (c === '/' && regexAllowed()) {
        let j = i + 1, inCls = false;
        while (j < n) { const d = s[j]; if (d === '\\') { j += 2; continue; } if (d === '\n') throw new Error('تعبير نمطي غير مغلق'); if (d === '[') inCls = true; else if (d === ']') inCls = false; else if (d === '/' && !inCls) break; j++; }
        if (j >= n) throw new Error('تعبير نمطي غير مغلق');
        j++; while (j < n && isIdPart(s[j])) j++; push('regex', s.slice(i, j)); i = j; continue;
      }
      let p = null; for (const op of PUNCT) if (s.startsWith(op, i)) { p = op; break; }
      if (!p) p = c;
      push('punct', p); i += p.length;
    }
    return toks;
  }

  const wordish = t => t.type === 'id' || t.type === 'num';
  const lastCh = t => t.value[t.value.length - 1];
  function needSpace(a, b) {
    if (wordish(a) && (wordish(b) || b.type === 'regex' && false)) return true;
    if ((a.type === 'str' || a.type === 'tpl' || a.type === 'regex') && wordish(b) && false) return true;
    if (a.type === 'punct' && b.type === 'punct') {
      const x = a.value, y = b.value;
      if ((lastCh(a) === '+' && y[0] === '+') || (lastCh(a) === '-' && y[0] === '-')) return true;
      if (lastCh(a) === '/' && (y[0] === '/' || y[0] === '*')) return true;
    }
    if (a.type === 'num' && b.type === 'punct' && b.value[0] === '.' && !/[.eExXn]/.test(a.value)) return true;
    if (a.type === 'punct' && lastCh(a) === '/' && b.type === 'regex') return true;
    if (a.type === 'regex' && b.type === 'id') return true; // /x/ in y
    if (a.type === 'punct' && a.value === '/' && b.type === 'punct' && b.value === '/') return true;
    if (a.type === 'id' && (b.type === 'str' || b.type === 'tpl')) return true;       // return"x" يصح لكن نُبقي مسافة للوضوح في المنسّق فقط (المصغّر يحذفها)
    return false;
  }
  const noNlBefore = new Set(['{', ';', ',', '(', '[', ':', '=', '+=', '-=', '*=', '/=', '%=', '&&', '||', '??', '==', '===', '!=', '!==', '<', '>', '<=', '>=', '*', '%', '&', '|', '^', '<<', '>>', '>>>', '?', '.', '?.', '=>', '**', '&=', '|=', '^=', '<<=', '>>=', '>>>=', '**=', '&&=', '||=', '??=', '!', '~', '...']);
  const noNlAfter = new Set([')', ']', '}', '.', ',', ';', '?', ':', '(', '[', '=>', '=', '&&', '||', '??', '==', '===', '!=', '!==', '<', '>', '<=', '>=', '*', '%', '&', '|', '^', '<<', '>>', '>>>', '?.', '**', '+=', '-=', '*=', '/=', '%=', '+', '-', '/']);

  /* هل يجب إبقاء السطر الجديد بين الرمزين؟ (محافظ: الحذف فقط حين لا يؤثر على ASI) */
  function asiKeep(prev, t) {
    const pv = prev.type === 'punct' ? prev.value : null; const nv = t.type === 'punct' ? t.value : null;
    if (nv === '++' || nv === '--') return true;
    const dropByPrev = pv && noNlBefore.has(pv) && pv !== '}';
    const dropByNext = nv && noNlAfter.has(nv) && !(nv === '+' || nv === '-' || nv === '/');
    const contOp = nv && (nv === '+' || nv === '-' || nv === '/') && !(prev.type === 'id' && /^(return|break|continue|throw|yield|async)$/.test(prev.value));
    return !(dropByPrev || dropByNext || contOp);
  }

  function minify(src) {
    const toks = tokenize(src).filter(t => !(t.type === 'comment' && !/^\/\*[!@]|@license|@preserve/.test(t.value)));
    // ملاحظة: التعليقات المحذوفة تحمل علم nl؛ نعيد نقله للرمز التالي عبر إعادة الحساب
    const all = tokenize(src); let out = ''; let prev = null; let pendingNl = false;
    for (const t of all) {
      if (t.type === 'comment') { if (/^\/\*[!@]|@license|@preserve/.test(t.value)) { if (prev) out += '\n'; out += t.value + '\n'; prev = null; pendingNl = false; } else if (t.nl) pendingNl = true; continue; }
      const nl = t.nl || pendingNl; pendingNl = false;
      if (prev) {
        const keepNl = nl && asiKeep(prev, t);
        if (keepNl) out += '\n'; else if (needSpace(prev, t)) out += ' ';
      }
      out += t.value; prev = t;
    }
    return out;
  }

  function beautify(src, indentStr) {
    const IND = indentStr == null ? '  ' : indentStr;
    const toks = tokenize(src); let out = ''; const lines = []; let level = 0; let atLineStart = true;
    const ctx = []; // سياق الأقواس: '{' '(' '['
    let prev = null; let ternary = 0; let caseOpen = false; let blankPending = false;
    const rtrim = (re) => { let e = out.length; while (e > 0 && (out.charCodeAt(e - 1) === 32 || (re === 'ws' && out.charCodeAt(e - 1) === 9))) e--; if (e !== out.length) out = out.slice(0, e); };
    const nlOut = () => { rtrim('ws'); if (out !== '') { lines.push(out); out = ''; } atLineStart = true; };
    const write = (s) => { if (atLineStart) { out += IND.repeat(Math.max(0, level)); atLineStart = false; } out += s; };
    const space = () => { const c = out.charAt(out.length - 1); if (!atLineStart && c !== ' ' && c !== '\n' && c !== '(' && c !== '[') out += ' '; };
    const top = () => (ctx[ctx.length - 1] || {}).c; const topObj = () => ctx[ctx.length - 1];
    let pendingSwitch = false;
    const isUnaryCtx = () => { if (!prev) return true; if (prev.type === 'punct') return !(prev.value === ')' || prev.value === ']' || prev.value === '}' || prev.value === '++' || prev.value === '--'); if (prev.type === 'id') return KW_REGEX_BEFORE.has(prev.value); return false; };
    const nextSig = new Array(toks.length + 1).fill(-1); for (let q = toks.length - 1; q >= 0; q--) nextSig[q] = q + 1 < toks.length ? (toks[q + 1].type !== 'comment' ? q + 1 : nextSig[q + 1]) : -1;
    for (let k = 0; k < toks.length; k++) {
      const t = toks[k]; const nx = nextSig[k] >= 0 ? toks[nextSig[k]] : null; const v = t.value;
      if (t.type !== 'comment' && prev && t.nl && asiKeep(prev, t) && !atLineStart) nlOut();
      if (t.type === 'comment') {
        if (t.line || t.nl) { if (!atLineStart && t.nl) nlOut(); else if (!atLineStart) space(); }
        else space();
        write(v); if (t.line || /\n/.test(v)) nlOut(); else out += ' ';
        continue;
      }
      if (t.type !== 'punct') {
        // كلمات/نصوص/أرقام
        if (prev && !atLineStart) {
          if (prev.type === 'punct') {
            const pv = prev.value;
            if (pv === '.' || pv === '?.' || pv === '(' || pv === '[' || pv === '...' ) { /* بلا مسافة */ }
            else if ((pv === '!' || pv === '~' || ((pv === '+' || pv === '-' || pv === '++' || pv === '--') && prev.unary))) { /* بلا مسافة */ }
            else space();
          } else space();
        }
        if (t.type === 'id' && v === 'switch') pendingSwitch = true;
        if (t.type === 'id' && (v === 'case' || (v === 'default' && nx && nx.type === 'punct' && nx.value === ':'))) {
          const o = topObj(); if (o && o.sw && o.open) { level--; o.open = false; if (!atLineStart) nlOut(); }
          if (v === 'case') caseOpen = true;
        }
        write(v); prev = t; continue;
      }
      if (prev && prev.type === 'punct' && ((lastCh(prev) === '+' && v[0] === '+') || (lastCh(prev) === '-' && v[0] === '-'))) space();
      switch (v) {
        case '{': {
          if (prev && !atLineStart && !(prev.type === 'punct' && (prev.value === '(' || prev.value === '[' || prev.value === '${'))) space();
          write('{');
          if (nx && nx.type === 'punct' && nx.value === '}') { out += '}'; k = nextSig[k]; prev = nx; if (k >= 0) { const after = nextSig[k] >= 0 ? toks[nextSig[k]] : null; if (after && after.type === 'punct' && /^[,;)\].]$/.test(after.value)) { /* يبقى على السطر */ } else if (after && !(after.type === 'id' && /^(else|catch|finally|while)$/.test(after.value))) nlOut(); } break; }
          ctx.push({ c: '{', sw: pendingSwitch && prev && prev.value === ')', open: false }); pendingSwitch = false; level++; nlOut(); prev = t; break;
        }
        case '}': {
          { const o = topObj(); if (o && o.sw && o.open) level--; } level--; ctx.pop(); nlOut(); write('}'); prev = t;
          if (nx && ((nx.type === 'id' && /^(else|catch|finally)$/.test(nx.value)) || (nx.type === 'id' && nx.value === 'while' && false))) { /* تبقى على نفس السطر */ }
          else if (nx && nx.type === 'punct' && /^[,;)\].]$/.test(nx.value)) { /* تلتصق */ }
          else if (nx && nx.type === 'punct' && (nx.value === '(' || nx.value === '=>' || nx.value === '?' || nx.value === ':' || nx.value === '+' || nx.value === '||' || nx.value === '&&')) { /* تعبير يكمل */ }
          else if (nx) nlOut();
          break;
        }
        case '(': case '[': {
          if (prev && !atLineStart) {
            if (v === '(' && prev.type === 'id' && /^(if|for|while|switch|catch|with|return|typeof|void|delete|in|of|new|await|yield|case|else|do|throw)$/.test(prev.value) && !(prev.value === 'new')) space();
            else if (prev.type === 'punct' && !/^[)\]}]$/.test(prev.value) && !/^(\.|\?\.|\(|\[|!|~|\.\.\.)$/.test(prev.value) && !(prev.unary)) space();
            else if (prev.type === 'id' && v === '[' && /^(return|typeof|in|of|case|else|do|throw|new|delete|void)$/.test(prev.value)) space();
          }
          write(v); ctx.push({ c: v }); prev = t; break;
        }
        case ')': case ']': { ctx.pop(); rtrim(); write(v); prev = t; break; }
        case ';': {
          rtrim(); write(';');
          if (top() === '(' ) out += ' '; else if (nx && nx.type === 'punct' && nx.value === '}') nlOut(); else nlOut();
          prev = t; break;
        }
        case ',': {
          rtrim(); write(',');
          if (top() === '{' && !(nx && nx.type === 'comment' && !nx.nl && false)) nlOut(); else out += ' ';
          prev = t; break;
        }
        case ':': {
          if (ternary > 0) { ternary--; space(); write(':'); out += ' '; }
          else if (caseOpen || (prev && prev.type === 'id' && prev.value === 'default' && top() === '{' && topObj().sw)) { caseOpen = false; rtrim(); write(':'); const o = topObj(); if (o && o.sw) { o.open = true; level++; } nlOut(); }
          else { rtrim(); write(':'); out += ' '; }
          prev = t; break;
        }
        case '?': { if (nx && nx.type === 'punct' && (nx.value === '.' )) { write('?'); } else { ternary++; space(); write('?'); out += ' '; } prev = t; break; }
        case '.': case '?.': { write(v); prev = t; break; }
        case '...': { if (prev && !atLineStart && !(prev.type === 'punct' && /^[(\[]$/.test(prev.value))) space(); write('...'); prev = t; break; }
        case '=>': { space(); write('=>'); out += ' '; prev = t; break; }
        case '!': case '~': { if (prev && !atLineStart && !(prev.type === 'punct' && /^[(\[!~]$/.test(prev.value)) && !(prev.unary)) space(); write(v); prev = t; break; }
        case '++': case '--': {
          const un = isUnaryCtx(); t.unary = un;
          if (un) { if (prev && !atLineStart && !(prev.type === 'punct' && /^[(\[!~]$/.test(prev.value)) && !prev.unary) space(); write(v); }
          else { rtrim(); write(v); }
          prev = t; break;
        }
        case '+': case '-': {
          const un = isUnaryCtx(); t.unary = un;
          if (un) { if (prev && !atLineStart && !(prev.type === 'punct' && /^[(\[!~]$/.test(prev.value)) && !prev.unary) space(); write(v); }
          else { space(); write(v); out += ' '; }
          prev = t; break;
        }
        default: { space(); write(v); out += ' '; prev = t; }
      }
    }
    rtrim('ws'); if (out !== '') lines.push(out);
    return lines.join('\n') + '\n';
  }

  const api = { tokenize, beautify, minify };
  if (root.OF) root.OF.jsfmt = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
