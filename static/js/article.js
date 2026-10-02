(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  // sidebar: open on desktop, collapsed on small screens
  var side = $('#side-details'), mq = window.matchMedia('(max-width: 1000px)');
  function syncSide() { if (side) side.open = !mq.matches; }
  syncSide(); (mq.addEventListener ? mq.addEventListener('change', syncSide) : mq.addListener(syncSide));
  // dialog
  $$('[data-open-dialog]').forEach(function (b) {
    b.addEventListener('click', function (e) {
      var d = document.getElementById(b.getAttribute('data-open-dialog'));
      if (d && d.showModal) { e.preventDefault(); d.showModal(); } else { location.hash = '#cite'; }
    });
  });
  var dlg = $('#cite-dialog');
  if (dlg) {
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    $$('.dlg-tabs button', dlg).forEach(function (t) {
      t.addEventListener('click', function () {
        $$('.dlg-tabs button', dlg).forEach(function (x) { x.setAttribute('aria-selected', x === t ? 'true' : 'false'); });
        $$('.dlg-pane', dlg).forEach(function (p) { p.hidden = p.getAttribute('data-pane') !== t.getAttribute('data-tab'); });
      });
    });
    var cp = $('#dlg-copy');
    if (cp) cp.addEventListener('click', function () { var pane = $('.dlg-pane:not([hidden])', dlg); copy(pane.textContent, cp); });
  }
  function copy(text, btn) {
    var old = btn ? btn.textContent : '', done = function () { if (btn) { btn.textContent = btn.getAttribute('data-done') || '✓'; setTimeout(function () { btn.textContent = old; }, 1500); } };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done);
    else { var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); done(); }
  }
  $$('[data-copy]').forEach(function (b) { b.setAttribute('data-done', '✓'); b.addEventListener('click', function () { copy(b.getAttribute('data-copy'), b); }); });
  // share
  var cl = $('#copy-link'); if (cl) cl.addEventListener('click', function () { copy(location.href, cl); });
  var ns = $('#share-native');
  if (ns && navigator.share) { ns.hidden = false; ns.addEventListener('click', function () { navigator.share({ title: document.title, url: location.href }).catch(function () {}); }); }
  // save article (browser only)
  var sb = $('#save-btn');
  if (sb) {
    var KEY = 'sx_saved_articles';
    var read = function () { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } };
    var write = function (v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} };
    var slug = sb.getAttribute('data-slug');
    var paint = function () { var on = read().some(function (x) { return x.slug === slug; }); sb.textContent = on ? '✓ ' + sb.getAttribute('data-label-saved') : sb.getAttribute('data-label-save'); sb.setAttribute('aria-pressed', on); };
    sb.addEventListener('click', function () {
      var list = read(), i = list.findIndex(function (x) { return x.slug === slug; });
      if (i >= 0) list.splice(i, 1); else list.push({ slug: slug, title: sb.getAttribute('data-title'), url: location.pathname });
      write(list); paint();
    });
    paint();
  }
  // show authors
  var sa = $('#show-authors'), panel = $('#author-panel');
  if (sa && panel) sa.addEventListener('click', function () {
    var open = panel.hidden; panel.hidden = !open; sa.setAttribute('aria-expanded', open); sa.textContent = sa.getAttribute(open ? 'data-less' : 'data-more');
  });
  // table of contents scroll-spy
  var links = $$('[data-toc]');
  if (links.length && 'IntersectionObserver' in window) {
    var map = {}; links.forEach(function (a) { map[a.getAttribute('data-toc')] = a; });
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { links.forEach(function (a) { a.classList.remove('active'); }); var a = map[e.target.id]; if (a) a.classList.add('active'); } });
    }, { rootMargin: '0px 0px -70% 0px', threshold: 0 });
    Object.keys(map).forEach(function (id) { var el = document.getElementById(id); if (el) io.observe(el); });
  }
  // close menus when clicking elsewhere
  document.addEventListener('click', function (e) { $$('details.art-menu[open], details.art-search[open], details.art-share[open]').forEach(function (d) { if (!d.contains(e.target)) d.open = false; }); });
})();
