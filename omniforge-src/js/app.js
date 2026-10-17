/* OMNIFORGE — الراوتر والصفحة الرئيسية وإطار صفحات الأدوات */
(function () {
  'use strict';
  const { h, ui, icon } = OF;
  const view = document.getElementById('view');
  const topbar = document.getElementById('topbar');
  let navCount = 0, homeState = { q: '', cat: 'all' }, cleanup = null;

  const byId = id => OF.reg.find(t => t.id === id);
  const catOf = id => OF.cats.find(c => c.id === id);

  function applyTheme() {
    const t = OF.store.get('theme', 'auto');
    if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
  }
  applyTheme();

  const favs = () => OF.store.get('fav', []);
  const recents = () => OF.store.get('recent', []);
  function toggleFav(id) { const f = favs(); const i = f.indexOf(id); if (i >= 0) f.splice(i, 1); else f.unshift(id); OF.store.set('fav', f); return i < 0; }
  function pushRecent(id) { const r = recents().filter(x => x !== id); r.unshift(id); OF.store.set('recent', r.slice(0, 8)); }

  function setTopbar(opts) {
    OF.clear(topbar);
    if (opts.back) {
      const b = h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'رجوع', on: { click: goBack } }, icon('back'));
      b.firstChild.style.transform = 'scaleX(-1)'; // RTL: السهم يشير لليمين
      topbar.appendChild(b);
      topbar.appendChild(h('div', { class: 'ttl', text: opts.title || '' }));
    } else {
      topbar.appendChild(h('div', { class: 'brand' }, 'OMNIFORGE'));
    }
    if (opts.home) topbar.appendChild(h('a', { class: 'iconbtn', href: '#/', 'aria-label': 'الرئيسية' }, icon('home')));
    if (opts.extra) topbar.appendChild(opts.extra);
    if (!opts.back) topbar.appendChild(h('a', { class: 'iconbtn', href: '#/settings', 'aria-label': 'الإعدادات' }, icon('gear')));
  }
  function goBack() { if (navCount > 0) history.back(); else location.hash = '#/'; }

  /* ───────── الرئيسية ───────── */
  function card(t) {
    const cat = catOf(t.cat);
    return h('a', { class: 'tcard', href: '#/tools/' + t.id },
      h('div', { class: 'ico' }, icon(t.icon || (cat && cat.icon))),
      h('div', null,
        h('div', { class: 't' }, t.name, ui.badge(t.status), t.mine ? ui.badge('mine') : null),
        h('div', { class: 'd', text: t.desc })));
  }

  function matches(t, q) {
    if (!q) return true;
    const hay = OF.norm([t.name, t.desc, t.kw, t.id].join(' '));
    return OF.norm(q).split(/\s+/).filter(Boolean).every(w => hay.includes(w));
  }

  function renderHome() {
    setTopbar({});
    OF.clear(view);
    const input = h('input', { type: 'search', placeholder: 'ابحث عن أداة بالاسم أو الوظيفة…', 'aria-label': 'بحث', value: homeState.q, autocomplete: 'off' });
    const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'التصنيفات' });
    const body = h('div');
    view.appendChild(h('div', { class: 'search' }, icon('search'), input));
    view.appendChild(chips); view.appendChild(body);

    function draw() {
      OF.clear(chips); OF.clear(body);
      [{ id: 'all', name: 'الكل' }].concat(OF.cats).forEach(c => chips.appendChild(h('button', { type: 'button', class: 'chip', 'aria-pressed': String(homeState.cat === c.id), text: c.name, on: { click: () => { homeState.cat = c.id; draw(); } } })));
      const list = OF.reg.filter(t => (homeState.cat === 'all' || t.cat === homeState.cat) && matches(t, homeState.q));
      if (!homeState.q && homeState.cat === 'all') {
        const fv = favs().map(byId).filter(Boolean), rc = recents().map(byId).filter(t => t && !fv.includes(t));
        if (fv.length) { body.appendChild(h('div', { class: 'sec-title' }, icon('star'), 'المفضلة')); body.appendChild(h('div', { class: 'grid' }, fv.map(card))); }
        if (rc.length) { body.appendChild(h('div', { class: 'sec-title' }, icon('clock'), 'استُخدمت مؤخراً')); body.appendChild(h('div', { class: 'grid' }, rc.slice(0, 4).map(card))); }
      }
      if (!list.length) { body.appendChild(h('div', { class: 'empty', text: 'لا توجد أدوات مطابقة لبحثك.' })); return; }
      const cats = homeState.cat === 'all' ? OF.cats : OF.cats.filter(c => c.id === homeState.cat);
      cats.forEach(c => {
        const items = list.filter(t => t.cat === c.id); if (!items.length) return;
        body.appendChild(h('div', { class: 'sec-title' }, icon(c.icon), c.name, h('span', { class: 'muted small', text: '(' + items.length + ')' })));
        body.appendChild(h('div', { class: 'grid' }, items.map(card)));
      });
      const ready = OF.reg.filter(t => t.status === 'ready').length;
      body.appendChild(h('p', { class: 'muted small', style: { marginTop: '22px' }, text: OF.reg.length + ' أداة: ' + ready + ' جاهزة، والباقي جزئية أو تحتاج خدمة أو غير متاحة — الحالة مكتوبة على كل بطاقة وفي صفحة الأداة.' }));
    }
    input.addEventListener('input', () => { homeState.q = input.value; draw(); });
    draw();
  }

  /* ───────── صفحة الأداة ───────── */
  async function renderTool(id) {
    const t = byId(id);
    if (!t) { setTopbar({ back: true, title: 'غير موجودة' }); OF.clear(view); view.appendChild(h('div', { class: 'empty' }, 'الأداة غير موجودة. ', h('a', { href: '#/', text: 'العودة للرئيسية' }))); return; }
    pushRecent(id);
    const star = h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'مفضلة', 'aria-pressed': String(favs().includes(id)) }, icon('star'));
    star.addEventListener('click', () => { const on = toggleFav(id); star.setAttribute('aria-pressed', String(on)); ui.toast(on ? 'أُضيفت إلى المفضلة' : 'أُزيلت من المفضلة'); });
    setTopbar({ back: true, title: t.name, home: true, extra: star });
    OF.clear(view);
    const cat = catOf(t.cat);
    view.appendChild(h('div', { class: 'thead' }, h('div', { class: 'ico' }, icon(t.icon)),
      h('div', null, h('div', { class: 'crumb', text: cat ? cat.name : '' }), h('h1', { text: t.name }), h('div', { class: 'row', style: { marginTop: '4px' } }, ui.badge(t.status), t.mine ? ui.badge('mine') : null))));
    view.appendChild(h('p', { class: 'muted', text: t.desc }));

    if (t.needs) {
      const box = h('div', { class: 'unavail' }, h('h2', { text: t.status === 'unavailable' ? 'هذه الأداة غير متاحة حالياً' : 'هذه الأداة تحتاج خدمة أو محركاً إضافياً' }), h('ul', null, t.needs.map(n => h('li', { text: n }))));
      view.appendChild(box); return;
    }
    if (t.limits && t.limits.length) view.appendChild(h('details', { class: 'limits' }, h('summary', { text: 'القدرات والحدود' }), h('ul', null, t.limits.map(x => h('li', { text: x })))));

    const box = h('div'); view.appendChild(box);
    box.appendChild(h('p', { class: 'muted', text: 'جارٍ التحميل…' }));
    try {
      await OF.loadAll(t.libs);
      if (!OF.tools[id]) await OF.load('js/tools/' + t.file + '.js');
      if (!OF.tools[id]) throw new Error('وحدة الأداة غير مسجلة: ' + id);
      if (location.hash !== '#/tools/' + id) return; // المستخدم غادر أثناء التحميل
      OF.clear(box);
      const r = OF.tools[id].render(box);
      if (typeof r === 'function') cleanup = r;
    } catch (e) { console.error(e); OF.clear(box); box.appendChild(h('div', { class: 'msg error' }, icon('x'), h('span', { text: 'تعذر فتح الأداة: ' + e.message }))); }
  }

  /* ───────── الإعدادات ───────── */
  function renderSettings() {
    setTopbar({ back: true, title: 'الإعدادات', home: true });
    OF.clear(view);
    const theme = ui.select([['auto', 'تلقائي (حسب النظام)'], ['dark', 'داكن'], ['light', 'فاتح']], OF.store.get('theme', 'auto'));
    theme.addEventListener('change', () => { OF.store.set('theme', theme.value); applyTheme(); });
    const out = ui.out();
    view.appendChild(ui.card('المظهر', ui.field('السمة', theme)));
    view.appendChild(ui.card('البيانات المحلية', h('p', { class: 'muted small', text: 'يخزّن التطبيق على جهازك فقط: المفضلة، والأدوات المستخدمة مؤخراً (أسماء الأدوات فقط)، والسمة، وقصاصاتك. لا يُحفظ محتوى ملفاتك أو روابطك تلقائياً.' }),
      ui.btn('مسح كل البيانات المحلية', () => { if (confirm('سيُحذف كل ما حفظه OMNIFORGE على هذا الجهاز بما فيه القصاصات. متابعة؟')) { OF.store.clearAll(); applyTheme(); out.clear(); out.ok('تم المسح.'); } }, { kind: 'danger', icon: 'trash' }), out));
    const nat = OF.native();
    view.appendChild(ui.card('المحركات والبيئة', ui.kv([
      ['الإصدار', OF.version], ['البيئة', OF.isNative() ? 'تطبيق أندرويد (Capacitor)' : 'متصفح'],
      ['الحفظ في التنزيلات', nat ? 'بلاجن OmniSave متاح' : 'غير متاح — تنزيل المتصفح (قد لا يعمل داخل WebView بدون البلاجن)'],
      ['طلبات الشبكة', nat && nat.request ? 'محرك أصلي (بلا CORS)' : 'fetch (يخضع لـCORS)'],
      ['WebCrypto', crypto && crypto.subtle ? 'متاح' : 'غير متاح'],
      ['BarcodeDetector', 'BarcodeDetector' in window ? 'متاح' : 'غير متاح'],
    ])));
    view.appendChild(ui.card('عن التطبيق', h('p', { class: 'small muted', text: 'OMNIFORGE صندوق أدوات يعمل محلياً قدر الإمكان. الأدوات مصنّفة بصدق: جاهزة، جزئية، تحتاج خدمة، أو غير متاحة. إضافة أداة جديدة: سجّلها في js/registry.js وأنشئ وحدتها في js/tools/ (انظر README).' })));
  }

  /* ───────── الراوتر ───────── */
  function route() {
    if (typeof cleanup === 'function') { try { cleanup(); } catch (e) { /* ignore */ } cleanup = null; }
    const hash = location.hash || '#/';
    let m;
    if ((m = /^#\/tools\/([\w-]+)/.exec(hash))) renderTool(m[1]);
    else if (hash.startsWith('#/settings')) renderSettings();
    else renderHome();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', () => { navCount++; route(); });
  window.addEventListener('error', e => console.error('OMNIFORGE error:', e.message));
  route();
})();
