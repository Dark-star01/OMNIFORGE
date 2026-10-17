/* الأدوات اليومية: الوحدات، التاريخ والوقت، الحاسبات، QR */
(function () {
  'use strict';
  const { h, ui } = OF;
  const T = OF.tools;
  const num = x => (Number.isFinite(x) ? String(parseFloat(x.toPrecision(12))) : 'غير معرّف');
  const toLatin = s => String(s).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/٫/g, '.').replace(/٬/g, '').replace(/،/g, ',');

  /* ───────────── محول الوحدات ───────────── */
  const UNITS = {
    'الطول': { m: 1, units: { 'مليمتر mm': 0.001, 'سنتيمتر cm': 0.01, 'متر m': 1, 'كيلومتر km': 1000, 'إنش in': 0.0254, 'قدم ft': 0.3048, 'ياردة yd': 0.9144, 'ميل mi': 1609.344, 'ميل بحري nmi': 1852 } },
    'الكتلة': { units: { 'ملغ mg': 1e-6, 'غرام g': 0.001, 'كيلوغرام kg': 1, 'طن t': 1000, 'أونصة oz': 0.028349523125, 'رطل lb': 0.45359237, 'ستون st': 6.35029318 } },
    'الحجم': { units: { 'مل ml': 0.001, 'لتر L': 1, 'متر مكعب m³': 1000, 'ملعقة شاي (US)': 0.00492892159375, 'ملعقة كبيرة (US)': 0.01478676478125, 'أونصة سائلة (US)': 0.0295735295625, 'كوب (US)': 0.2365882365, 'باينت (US)': 0.473176473, 'كوارت (US)': 0.946352946, 'غالون (US)': 3.785411784 } },
    'المساحة': { units: { 'سم² cm²': 0.0001, 'م² m²': 1, 'كم² km²': 1e6, 'هكتار ha': 10000, 'إنش² in²': 0.00064516, 'قدم² ft²': 0.09290304, 'فدان acre': 4046.8564224, 'ميل² mi²': 2589988.110336 } },
    'السرعة': { units: { 'م/ث m/s': 1, 'كم/س km/h': 1 / 3.6, 'ميل/س mph': 0.44704, 'عقدة kn': 1852 / 3600, 'قدم/ث ft/s': 0.3048 } },
    'البيانات': { units: { 'بت bit': 0.125, 'بايت B': 1, 'KB (1000)': 1e3, 'MB (1000²)': 1e6, 'GB (1000³)': 1e9, 'TB (1000⁴)': 1e12, 'KiB (1024)': 1024, 'MiB (1024²)': 1048576, 'GiB (1024³)': 1073741824, 'TiB (1024⁴)': 1099511627776 } },
    'الوقت': { units: { 'ميلي ثانية ms': 0.001, 'ثانية s': 1, 'دقيقة min': 60, 'ساعة h': 3600, 'يوم d': 86400, 'أسبوع': 604800, 'سنة (365.25 يوم)': 31557600 } },
    'الضغط': { units: { 'باسكال Pa': 1, 'كيلوباسكال kPa': 1000, 'بار bar': 1e5, 'ضغط جوي atm': 101325, 'psi': 6894.757293168, 'mmHg': 133.322387415 } },
    'الطاقة': { units: { 'جول J': 1, 'كيلوجول kJ': 1000, 'سعر cal': 4.184, 'كيلو سعر kcal': 4184, 'واط·ساعة Wh': 3600, 'كيلوواط·ساعة kWh': 3.6e6, 'BTU': 1055.05585262 } },
    'الحرارة': { temp: true, units: { 'مئوية °C': 0, 'فهرنهايت °F': 0, 'كلفن K': 0 } },
  };
  const toC = { '°C': v => v, '°F': v => (v - 32) * 5 / 9, K: v => v - 273.15 }, fromC = { '°C': v => v, '°F': v => v * 9 / 5 + 32, K: v => v + 273.15 };
  const tkey = name => name.split(' ').pop();
  function convert(cat, from, to, v) {
    const c = UNITS[cat];
    if (c.temp) return fromC[tkey(to)](toC[tkey(from)](v));
    return v * c.units[from] / c.units[to];
  }
  T['unit-converter'] = {
    convert,
    render(box) {
      const cat = ui.select(Object.keys(UNITS)); const val = ui.input({ type: 'text', inputmode: 'decimal', value: '1', dir: 'ltr' }); const from = ui.select([]), to = ui.select([]); const out = ui.out(); const res = h('div');
      function fill() { const names = Object.keys(UNITS[cat.value].units); [from, to].forEach(s => { OF.clear(s); names.forEach(n => s.appendChild(h('option', { value: n, text: n }))); }); from.value = names[0]; to.value = names[Math.min(2, names.length - 1)]; calc(); }
      function calc() {
        out.clear(); OF.clear(res); const v = parseFloat(toLatin(val.value)); if (!isFinite(v)) { if (val.value.trim()) out.warn('أدخل رقماً صحيحاً'); return; }
        if (!from.value || !to.value) return; const r = convert(cat.value, from.value, to.value, v);
        out.add(h('div', { class: 'card', style: { fontSize: '1.3rem', fontWeight: 700 }, dir: 'ltr' }, num(v) + ' ' + from.value.split(' ').pop() + ' = ' + num(r) + ' ' + to.value.split(' ').pop()));
        res.appendChild(ui.kv(Object.keys(UNITS[cat.value].units).map(u => [u, h('span', { class: 'mono', text: num(convert(cat.value, from.value, u, v)) })])));
      }
      [cat].forEach(e => e.addEventListener('change', fill)); [val].forEach(e => e.addEventListener('input', calc)); [from, to].forEach(e => e.addEventListener('change', calc));
      box.append(ui.card('', ui.field('الفئة', cat), ui.field('القيمة', val), ui.row(h('div', { class: 'grow' }, ui.field('من', from)), h('div', { class: 'grow' }, ui.field('إلى', to))), ui.btn('تبديل', () => { const a = from.value; from.value = to.value; to.value = a; calc(); }, { small: true })), out, ui.card('كل الوحدات', res));
      fill();
    },
  };

  /* ───────────── التاريخ والوقت ───────────── */
  const ZONES = ['Asia/Riyadh', 'UTC', 'Africa/Cairo', 'Asia/Dubai', 'Europe/Istanbul', 'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Los_Angeles', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney'];
  function zoneParts(ms, zone) { const f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); const o = {}; f.formatToParts(new Date(ms)).forEach(p => (o[p.type] = p.value)); return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour, mi: +o.minute, s: +o.second }; }
  const zoneOffset = (ms, zone) => { const p = zoneParts(ms, zone); return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000; };
  function wallToUtc(y, mo, d, h_, mi, zone) { const guess = Date.UTC(y, mo - 1, d, h_, mi); let t = guess - zoneOffset(guess, zone); t = guess - zoneOffset(t, zone); return t; }
  function hijri(ms) { const f = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC' }); const o = {}; f.formatToParts(new Date(ms)).forEach(p => (o[p.type] = p.value)); return { y: parseInt(o.year), m: +o.month, d: +o.day }; }
  const HM = ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'];
  function diffYMD(a, b) { // a<=b (UTC dates)
    let y = b.getUTCFullYear() - a.getUTCFullYear(), m = b.getUTCMonth() - a.getUTCMonth(), d = b.getUTCDate() - a.getUTCDate();
    if (d < 0) { m--; d += new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 0)).getUTCDate(); } if (m < 0) { y--; m += 12; } return { y, m, d };
  }
  T['datetime-workshop'] = {
    hijri, wallToUtc,
    render(box) {
      OF.clear(box); const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
      box.appendChild(ui.tabs([
        { id: 'diff', label: 'الفرق', render(p) {
          const a = ui.input({ type: 'datetime-local', value: nowLocal() }), b = ui.input({ type: 'datetime-local', value: nowLocal() }); const out = ui.out();
          p.append(ui.card('', ui.field('من', a), ui.field('إلى', b), ui.btn('احسب', () => { out.clear(); if (!a.value || !b.value) return out.warn('أدخل التاريخين'); let x = new Date(a.value), y = new Date(b.value); let neg = false; if (x > y) { [x, y] = [y, x]; neg = true; } const ms = y - x; const r = diffYMD(new Date(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())), new Date(Date.UTC(y.getFullYear(), y.getMonth(), y.getDate())));
            out.kv([['الفرق', (neg ? '(الثاني قبل الأول) ' : '') + r.y + ' سنة، ' + r.m + ' شهر، ' + r.d + ' يوم'], ['إجمالي الأيام', num(ms / 864e5)], ['إجمالي الساعات', num(ms / 36e5)], ['إجمالي الدقائق', num(ms / 6e4)], ['إجمالي الثواني', num(ms / 1000)], ['الأسابيع', num(ms / 6048e5)]]); }, { kind: 'primary' })), out);
        } },
        { id: 'add', label: 'إضافة/طرح', render(p) {
          const a = ui.input({ type: 'date', value: nowLocal().slice(0, 10) }); const n = ui.input({ type: 'number', value: 30 }); const u = ui.select([['d', 'أيام'], ['w', 'أسابيع'], ['m', 'أشهر'], ['y', 'سنوات']]); const out = ui.out();
          p.append(ui.card('', ui.field('التاريخ', a), ui.row(h('div', { class: 'grow' }, ui.field('المقدار (سالب للطرح)', n)), h('div', { class: 'grow' }, ui.field('الوحدة', u))), ui.btn('احسب', () => { out.clear(); if (!a.value) return out.warn('أدخل تاريخاً'); const k = Math.trunc(+n.value); if (!isFinite(k)) return out.warn('أدخل عدداً'); const d = new Date(a.value + 'T00:00:00'); if (u.value === 'd') d.setDate(d.getDate() + k); else if (u.value === 'w') d.setDate(d.getDate() + 7 * k); else if (u.value === 'm') { const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + k); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); } else { const day = d.getDate(), mo = d.getMonth(); d.setDate(1); d.setFullYear(d.getFullYear() + k); d.setMonth(mo); d.setDate(Math.min(day, new Date(d.getFullYear(), mo + 1, 0).getDate())); }
            out.kv([['النتيجة', d.toLocaleDateString('ar-u-nu-latn', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })], ['ISO', d.toISOString().slice(0, 10).replace(/^/, '') && (d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'))]]); }, { kind: 'primary' })), out);
        } },
        { id: 'zones', label: 'المناطق الزمنية', render(p) {
          const a = ui.input({ type: 'datetime-local', value: nowLocal() }); const z = ui.select(ZONES, 'Asia/Riyadh'); const out = ui.out();
          p.append(ui.card('', ui.field('الوقت (بتوقيت المنطقة المختارة)', a), ui.field('المنطقة المصدر', z), ui.btn('حوّل', () => { out.clear(); if (!a.value) return out.warn('أدخل وقتاً'); const [d, t] = a.value.split('T'); const [Y, M, D] = d.split('-').map(Number), [H, Mi] = t.split(':').map(Number); const utc = wallToUtc(Y, M, D, H, Mi, z.value);
            out.kv(ZONES.map(zn => [zn, new Intl.DateTimeFormat('ar-u-nu-latn', { timeZone: zn, dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' }).format(new Date(utc))])); }, { kind: 'primary' })), out);
        } },
        { id: 'unix', label: 'طابع يونكس', render(p) {
          const ts = ui.input({ placeholder: 'مثال: 1700000000 (ثوانٍ) أو 1700000000000 (ميلي)', dir: 'ltr', code: true }); const dt = ui.input({ type: 'datetime-local', value: nowLocal() }); const out = ui.out();
          p.append(ui.card('طابع ← تاريخ', ui.field('الطابع', ts), ui.btn('حوّل', () => { out.clear(); const v = Number(toLatin(ts.value).trim()); if (!isFinite(v) || ts.value.trim() === '') return out.warn('أدخل رقماً'); const ms = Math.abs(v) > 1e11 ? v : v * 1000; const d = new Date(ms); if (isNaN(d)) return out.error('قيمة خارج النطاق'); out.kv([['التفسير', Math.abs(v) > 1e11 ? 'ميلي ثانية' : 'ثوانٍ'], ['UTC', d.toISOString()], ['محلي', d.toLocaleString('ar-u-nu-latn')]]); }, { kind: 'primary' }), ui.btn('الآن', () => { ts.value = Math.floor(Date.now() / 1000); })), ui.card('تاريخ ← طابع', ui.field('التاريخ (محلي)', dt), ui.btn('حوّل', () => { out.clear(); if (!dt.value) return out.warn('أدخل تاريخاً'); const ms = new Date(dt.value).getTime(); out.kv([['ثوانٍ', Math.floor(ms / 1000)], ['ميلي ثانية', ms]]); })), out);
        } },
        { id: 'hijri', label: 'هجري ⇄ ميلادي', render(p) {
          const g = ui.input({ type: 'date', value: nowLocal().slice(0, 10) }); const out = ui.out(); const hy = ui.input({ type: 'number', value: 1447 }), hm = ui.select(HM.map((m, i) => [String(i + 1), m]), '1'), hd = ui.input({ type: 'number', value: 1, min: 1, max: 30 }); const out2 = ui.out();
          const fmtH = ms => { const x = hijri(ms); return x.d + ' ' + HM[x.m - 1] + ' ' + x.y + ' هـ'; };
          p.append(ui.card('ميلادي ← هجري (أم القرى)', ui.field('التاريخ', g), ui.btn('حوّل', () => { out.clear(); if (!g.value) return out.warn('أدخل تاريخاً'); try { const ms = Date.parse(g.value + 'T00:00:00Z'); out.kv([['الهجري', fmtH(ms)], ['اليوم', new Date(ms).toLocaleDateString('ar', { weekday: 'long', timeZone: 'UTC' })]]); out.info('تقويم أم القرى حسابي وقد يختلف يوماً عن الرؤية الفعلية.'); } catch (e) { out.error('نظام التشغيل لا يدعم التقويم الهجري: ' + e.message); } }, { kind: 'primary' })), out,
            ui.card('هجري ← ميلادي', ui.row(h('div', { class: 'grow' }, ui.field('اليوم', hd)), h('div', { class: 'grow' }, ui.field('الشهر', hm)), h('div', { class: 'grow' }, ui.field('السنة', hy))), ui.btn('حوّل', () => {
              out2.clear(); const Y = +hy.value, M = +hm.value, D = +hd.value; if (!(Y > 1300 && Y < 1600 && D >= 1 && D <= 30)) return out2.warn('أدخل سنة هجرية بين 1300 و1600 ويوماً بين 1 و30');
              try { const est = Date.UTC(622, 6, 16) + ((Y - 1) * 354.367 + (M - 1) * 29.53 + D - 1) * 864e5; let found = null; for (let k = -45; k <= 45 && !found; k++) { const ms = Math.round(est / 864e5) * 864e5 + k * 864e5; const x = hijri(ms); if (x.y === Y && x.m === M && x.d === D) found = ms; }
                found ? out2.kv([['الميلادي', new Date(found).toLocaleDateString('ar-u-nu-latn', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })], ['ISO', new Date(found).toISOString().slice(0, 10)]]) : out2.error('تاريخ هجري غير صالح (الشهر قد يكون 29 يوماً).'); } catch (e) { out2.error('نظام التشغيل لا يدعم التقويم الهجري: ' + e.message); }
            }, { kind: 'primary' })), out2);
        } },
      ]));
    },
  };

  /* ───────────── الحاسبة ───────────── */
  function evalExpr(src, deg) {
    const s = toLatin(src).replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/π/g, 'pi').replace(/√/g, 'sqrt').replace(/\s+/g, ''); let i = 0;
    const FN = { sin: x => Math.sin(deg ? x * Math.PI / 180 : x), cos: x => Math.cos(deg ? x * Math.PI / 180 : x), tan: x => Math.tan(deg ? x * Math.PI / 180 : x), asin: x => (deg ? 180 / Math.PI : 1) * Math.asin(x), acos: x => (deg ? 180 / Math.PI : 1) * Math.acos(x), atan: x => (deg ? 180 / Math.PI : 1) * Math.atan(x), sqrt: Math.sqrt, cbrt: Math.cbrt, ln: Math.log, log: Math.log10, log2: Math.log2, exp: Math.exp, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round, fact: fact };
    function fact(n) { if (!Number.isInteger(n) || n < 0 || n > 170) throw new Error('المضروب يتطلب عدداً صحيحاً بين 0 و170'); let r = 1; for (let k = 2; k <= n; k++) r *= k; return r; }
    const peek = () => s[i];
    function parseExpr() { let v = parseTerm(); while (peek() === '+' || peek() === '-') { const op = s[i++]; const r = parseTerm(); v = op === '+' ? v + r : v - r; } return v; }
    function parseTerm() { let v = parsePow(); while (peek() === '*' || peek() === '/' || peek() === '%') { const op = s[i++]; const r = parsePow(); v = op === '*' ? v * r : op === '/' ? v / r : v % r; } return v; }
    function parsePow() { const b = parseUnary(); if (peek() === '^') { i++; return Math.pow(b, parsePow()); } return b; }
    function parseUnary() { if (peek() === '-') { i++; return -parseUnary(); } if (peek() === '+') { i++; return parseUnary(); } return parsePost(); }
    function parsePost() { let v = parseAtom(); while (peek() === '!') { i++; v = fact(v); } return v; }
    function parseAtom() {
      if (peek() === '(') { i++; const v = parseExpr(); if (peek() !== ')') throw new Error('قوس إغلاق ناقص'); i++; return v; }
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i)); if (m) { i += m[0].length; return parseFloat(m[0]); }
      const id = /^[a-z][a-z0-9]*/i.exec(s.slice(i)); if (id) { const name = id[0].toLowerCase(); i += name.length; if (name === 'pi') return Math.PI; if (name === 'e') return Math.E; if (FN[name]) { if (peek() !== '(') throw new Error('الدالة ' + name + ' تحتاج أقواساً'); i++; const a = parseExpr(); if (peek() !== ')') throw new Error('قوس إغلاق ناقص'); i++; return FN[name](a); } throw new Error('اسم غير معروف: ' + name); }
      throw new Error(i >= s.length ? 'التعبير ناقص' : 'رمز غير متوقع: ' + s[i]);
    }
    if (!s) throw new Error('أدخل تعبيراً');
    const v = parseExpr(); if (i < s.length) throw new Error('رمز غير متوقع: ' + s[i]); return v;
  }
  T['calculator'] = {
    evalExpr,
    render(box) {
      OF.clear(box);
      box.appendChild(ui.tabs([
        { id: 'sci', label: 'علمية', render(p) {
          const inp = ui.input({ placeholder: 'مثال: 2*(3+4)^2 / sqrt(16) + sin(30)', dir: 'ltr', code: true }); const deg = ui.check('الزوايا بالدرجات (وإلا راديان)', true); const out = ui.out(); const hist = h('div');
          const go = () => { out.clear(); try { const v = evalExpr(inp.value, deg.input.checked); if (!Number.isFinite(v)) throw new Error('النتيجة غير معرّفة (قسمة على صفر أو خارج المجال)'); out.add(h('div', { class: 'card mono', style: { fontSize: '1.4rem', fontWeight: 700 } }, num(v))); hist.prepend(h('div', { class: 'saverow' }, h('span', { class: 'nm mono', text: inp.value + ' = ' + num(v) }), ui.btn('استخدم', () => { inp.value = num(v); }, { small: true }))); } catch (e) { out.error(e.message); } };
          inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
          const keys = ['7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', '.', '(', ')', '+', '^', '!', '%', 'pi', 'e', 'sqrt(', 'sin(', 'cos(', 'tan(', 'ln(', 'log('];
          p.append(ui.card('', inp, deg, h('div', { class: 'row', style: { marginTop: '8px' } }, keys.map(k => ui.btn(k, () => { inp.value += k; inp.focus(); }, { small: true }))), ui.row(ui.btn('احسب', go, { kind: 'primary' }), ui.btn('مسح', () => { inp.value = ''; out.clear(); }), ui.btn('⌫', () => { inp.value = inp.value.slice(0, -1); }))), out, ui.card('السجل (في الذاكرة فقط)', hist));
        } },
        { id: 'pct', label: 'نسبة مئوية', render(p) {
          const a = ui.input({ type: 'text', inputmode: 'decimal', dir: 'ltr' }), b = ui.input({ type: 'text', inputmode: 'decimal', dir: 'ltr' }); const out = ui.out(); const n = x => parseFloat(toLatin(x));
          p.append(ui.card('', ui.field('A', a), ui.field('B', b), ui.row(ui.btn('A% من B', () => { out.clear(); const x = n(a.value), y = n(b.value); if (!isFinite(x) || !isFinite(y)) return out.warn('أدخل رقمين'); out.ok(num(x) + '% من ' + num(y) + ' = ' + num(x * y / 100)); }), ui.btn('A كم % من B', () => { out.clear(); const x = n(a.value), y = n(b.value); if (!isFinite(x) || !isFinite(y)) return out.warn('أدخل رقمين'); if (y === 0) return out.error('لا يمكن القسمة على صفر'); out.ok(num(x) + ' هو ' + num(x / y * 100) + '% من ' + num(y)); }), ui.btn('التغير من A إلى B', () => { out.clear(); const x = n(a.value), y = n(b.value); if (!isFinite(x) || !isFinite(y)) return out.warn('أدخل رقمين'); if (x === 0) return out.error('القيمة الأصلية صفر'); const c = (y - x) / Math.abs(x) * 100; out.ok('التغير: ' + (c > 0 ? '+' : '') + num(c) + '%'); }))), out);
        } },
        { id: 'vat', label: 'خصم وضريبة', render(p) {
          const price = ui.input({ type: 'text', inputmode: 'decimal', dir: 'ltr' }), disc = ui.input({ type: 'text', inputmode: 'decimal', value: '0', dir: 'ltr' }), vat = ui.input({ type: 'text', inputmode: 'decimal', value: '15', dir: 'ltr' }); const incl = ui.check('السعر المُدخل شامل الضريبة'); const out = ui.out(); const n = x => parseFloat(toLatin(x));
          p.append(ui.card('', ui.field('السعر', price), ui.field('الخصم %', disc), ui.field('الضريبة %', vat), incl, ui.btn('احسب', () => { out.clear(); let pr = n(price.value); const d = n(disc.value) || 0, t = n(vat.value) || 0; if (!isFinite(pr) || pr < 0) return out.warn('أدخل سعراً صحيحاً'); if (d < 0 || d > 100 || t < 0) return out.warn('نسب غير صالحة'); if (incl.input.checked) pr = pr / (1 + t / 100); const afterD = pr * (1 - d / 100), tax = afterD * t / 100; out.kv([['السعر قبل الضريبة', num(pr)], ['قيمة الخصم', num(pr * d / 100)], ['بعد الخصم', num(afterD)], ['الضريبة', num(tax)], ['الإجمالي', num(afterD + tax)]]); }, { kind: 'primary' })), out);
        } },
        { id: 'loan', label: 'قسط قرض', render(p) {
          const pr = ui.input({ type: 'text', inputmode: 'decimal', dir: 'ltr' }), rate = ui.input({ type: 'text', inputmode: 'decimal', dir: 'ltr' }), months = ui.input({ type: 'number', value: 60 }); const out = ui.out(); const n = x => parseFloat(toLatin(x));
          p.append(ui.card('', ui.field('أصل القرض', pr), ui.field('نسبة الفائدة السنوية %', rate, 'نسبة متناقصة (قسط ثابت). صيغة تقريبية لا تشمل الرسوم.'), ui.field('المدة بالأشهر', months), ui.btn('احسب', () => { out.clear(); const P = n(pr.value), r = (n(rate.value) || 0) / 1200, N = Math.floor(+months.value); if (!(P > 0) || !(N >= 1) || r < 0) return out.warn('أدخل قيماً صحيحة'); const m = r === 0 ? P / N : P * r / (1 - Math.pow(1 + r, -N)); out.kv([['القسط الشهري', num(Math.round(m * 100) / 100)], ['إجمالي المدفوع', num(Math.round(m * N * 100) / 100)], ['إجمالي الفائدة', num(Math.round((m * N - P) * 100) / 100)]]); }, { kind: 'primary' })), out);
        } },
      ]));
    },
  };

  /* ───────────── QR ───────────── */
  const wifiEsc = s => String(s).replace(/([\\;,:"])/g, '\\$1');
  T['qr-studio'] = {
    render(box) {
      OF.clear(box);
      box.appendChild(ui.tabs([
        { id: 'gen', label: 'إنشاء', render(p) {
          const type = ui.select([['text', 'نص / رابط'], ['wifi', 'شبكة Wi-Fi'], ['mail', 'بريد إلكتروني'], ['tel', 'اتصال هاتفي'], ['sms', 'رسالة SMS']]); const fields = h('div'); const ecl = ui.select([['L', 'L — منخفض'], ['M', 'M — متوسط'], ['Q', 'Q — جيد'], ['H', 'H — عالٍ']], 'M'); const px = ui.input({ type: 'number', value: 512, min: 128, max: 2048 }); const fg = ui.input({ type: 'text', value: '#000000', dir: 'ltr' }), bg = ui.input({ type: 'text', value: '#ffffff', dir: 'ltr' });
          const f = { text: ui.area({ rows: 3, placeholder: 'النص أو الرابط' }), ssid: ui.input({ placeholder: 'اسم الشبكة SSID' }), pass: ui.input({ placeholder: 'كلمة المرور', type: 'password' }), sec: ui.select([['WPA', 'WPA/WPA2/WPA3'], ['WEP', 'WEP'], ['nopass', 'بدون كلمة مرور']]), hidden: ui.check('شبكة مخفية'), to: ui.input({ placeholder: 'name@example.com', dir: 'ltr' }), subj: ui.input({ placeholder: 'الموضوع' }), body: ui.area({ rows: 3, placeholder: 'النص' }), tel: ui.input({ placeholder: '+9665XXXXXXXX', dir: 'ltr' }) };
          const layouts = { text: [f.text], wifi: [f.ssid, f.pass, f.sec, f.hidden], mail: [f.to, f.subj, f.body], tel: [f.tel], sms: [f.tel, f.body] };
          const showFields = () => { OF.clear(fields); layouts[type.value].forEach(e => fields.appendChild(e instanceof HTMLTextAreaElement || e instanceof HTMLInputElement || e instanceof HTMLSelectElement ? ui.field('', e) : e)); }; type.addEventListener('change', showFields); showFields();
          const out = ui.out(); const prev = h('div'); let current = null;
          const payload = () => { switch (type.value) { case 'text': return f.text.value; case 'wifi': if (!f.ssid.value) throw new Error('أدخل اسم الشبكة'); return 'WIFI:T:' + f.sec.value + ';S:' + wifiEsc(f.ssid.value) + ';' + (f.sec.value !== 'nopass' ? 'P:' + wifiEsc(f.pass.value) + ';' : '') + (f.hidden.input.checked ? 'H:true;' : '') + ';'; case 'mail': if (!f.to.value) throw new Error('أدخل البريد'); return 'mailto:' + f.to.value + '?subject=' + encodeURIComponent(f.subj.value) + '&body=' + encodeURIComponent(f.body.value); case 'tel': if (!f.tel.value) throw new Error('أدخل الرقم'); return 'tel:' + f.tel.value; case 'sms': if (!f.tel.value) throw new Error('أدخل الرقم'); return 'SMSTO:' + f.tel.value + ':' + f.body.value; } };
          const go = ui.btn('إنشاء', () => {
            out.clear(); OF.clear(prev); current = null;
            try { const data = payload(); if (!data) throw new Error('أدخل المحتوى'); const colorOk = c => /^#[0-9a-f]{6}$/i.test(c); if (!colorOk(fg.value) || !colorOk(bg.value)) throw new Error('الألوان بصيغة #RRGGBB'); const size = Math.max(128, Math.min(2048, +px.value || 512)); const qr = OF.qr.encode(data, ecl.value); const o = { fg: fg.value, bg: bg.value };
              const canvas = OF.qr.toCanvas(qr, size, o); canvas.style.cssText = 'max-width:100%;height:auto;border-radius:8px;image-rendering:pixelated'; prev.appendChild(canvas); current = { qr, o, canvas };
              out.ok('الإصدار ' + qr.version + ' — ' + qr.size + '×' + qr.size + ' وحدة — تصحيح ' + qr.ecl); if (type.value === 'wifi') out.warn('الرمز يحتوي كلمة المرور بنص واضح؛ لا تنشره علناً.');
            } catch (e) { out.error(e.message); }
          }, { kind: 'primary' });
          p.append(ui.card('', ui.field('النوع', type), fields, ui.row(h('div', { class: 'grow' }, ui.field('التصحيح', ecl)), h('div', { class: 'grow' }, ui.field('الحجم px', px))), ui.row(h('div', { class: 'grow' }, ui.field('لون الرمز', fg)), h('div', { class: 'grow' }, ui.field('الخلفية', bg))), go), out, ui.card('الرمز', prev, ui.row(ui.btn('حفظ PNG', async () => { if (!current) return ui.toast('أنشئ الرمز أولاً', 'error'); try { await OF.save(await OF.canvasBlob(current.canvas, 'image/png'), 'qr.png', 'image/png'); } catch (e) { ui.toast(e.message, 'error'); } }, { icon: 'save', small: true }), ui.btn('حفظ SVG', async () => { if (!current) return ui.toast('أنشئ الرمز أولاً', 'error'); await OF.save(new Blob([OF.qr.toSvg(current.qr, current.o)], { type: 'image/svg+xml' }), 'qr.svg', 'image/svg+xml'); }, { icon: 'save', small: true }))));
        } },
        { id: 'read', label: 'قراءة من صورة', render(p) {
          const f = ui.files({ accept: 'image/*', exts: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'], mimes: ['image/'], label: 'اختر صورة تحتوي رمز QR', maxMB: 30 }); const out = ui.out(); const btn = ui.btn('اقرأ', null, { kind: 'primary' });
          p.append(ui.card('', 'BarcodeDetector' in window ? null : h('div', { class: 'msg warn' }, OF.icon('info'), h('span', { text: 'هذا النظام لا يوفّر BarcodeDetector، فلا يمكن قراءة الرموز هنا حالياً. إنشاء الرموز يعمل بشكل طبيعي.' })), f, btn), out);
          ui.task(btn, out, async () => {
            if (!('BarcodeDetector' in window)) throw new Error('القراءة غير مدعومة في هذا النظام (BarcodeDetector غير متوفر).'); const file = f.first(); if (!file) throw new Error('اختر صورة أولاً');
            const formats = await BarcodeDetector.getSupportedFormats(); if (!formats.includes('qr_code')) throw new Error('النظام لا يدعم قراءة qr_code'); const img = await OF.loadImage(file); const det = new BarcodeDetector({ formats: ['qr_code'] }); const res = await det.detect(img);
            if (!res.length) { out.warn('لم يُعثر على رمز QR في الصورة.'); return; } res.forEach(r => { out.ok('تمت القراءة'); out.pre(r.rawValue); out.add(ui.copyBtn(() => r.rawValue)); });
          });
        } },
      ]));
    },
  };
})();
