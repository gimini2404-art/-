import './firebase.js';
import { authReady, onAuthChange, state } from './auth.js';
import { initConsent, initPage } from './behaviors.js';
import { liveOnly, settings, snapshot } from './data/content.js';
import { DEFAULT_LANG, LANGS, setLang, t, tr } from './i18n/index.js';
import { match } from './router.js';
import { setHead } from './ui/head.js';
import { articleFooter, articleHeader, cookieBanner, siteFooter, siteHeader, siteName } from './ui/layout.js';
import { html, toHtml } from './util.js';

const $ = (id) => document.getElementById(id);
let navToken = 0;
let current = { path: '', search: '' };

export function preferredLang() {
  try { const s = localStorage.getItem('sx_lang'); if (s && LANGS.some(([c]) => c === s)) return s; } catch { /* ignore */ }
  return (navigator.language || '').toLowerCase().startsWith('ar') ? 'ar' : DEFAULT_LANG;
}

export function navigate(to, { replace = false } = {}) {
  const u = new URL(to, location.origin);
  if (u.origin !== location.origin) { location.href = to; return; }
  const next = u.pathname + u.search + u.hash;
  if (next === location.pathname + location.search + location.hash) { render(); return; }
  history[replace ? 'replaceState' : 'pushState']({}, '', next);
  render();
}
window.sxNavigate = navigate;

function applyLang(lang) {
  setLang(lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  try { localStorage.setItem('sx_lang', lang); } catch { /* ignore */ }
}

function showError(err) {
  console.error(err);
  $('main').innerHTML = `<div class="wrap" style="padding:140px 20px;text-align:center"><h2>${t('Something went wrong')}</h2><p class="muted">${t('Please reload the page and try again.')}</p></div>`;
}

async function render() {
  const token = ++navToken;
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const search = location.search;
  current = { path: location.pathname, search };

  // admin lives outside the language prefix
  if (path === '/admin' || path.startsWith('/admin/')) return renderAdmin(path, token);

  const m = /^\/(en|ar)(\/.*)?$/.exec(path);
  if (!m) {
    const rest = path === '/' ? '/' : path;
    history.replaceState({}, '', `/${preferredLang()}${rest === '/' ? '/' : rest}${search}${location.hash}`);
    return render();
  }
  applyLang(m[1]);
  const sub = m[2] || '';
  await authReady();
  const site = await settings();
  const found = match(sub);
  let result = null;
  try {
    if (found) {
      const mod = await found.load();
      const ctx = { lang: m[1], path: location.pathname, sub, params: found.params, query: new URLSearchParams(search), site, staff: !!state.staff, navigate };
      result = await mod.default(ctx);
      if (token !== navToken) return;
    }
  } catch (err) { return showError(err); }
  if (result && result.redirect) return navigate(result.redirect, { replace: true });
  if (!result) result = { title: t('Page not found'), html: html`<section class="pagehead"><div class="wrap"><h1>404</h1><p class="lead">${t('Page not found')}</p></div></section><section class="sec"><div class="wrap narrow"><a class="btn" href="/${m[1]}/">${t('Back to home')}</a></div></section>`, noindex: true };

  const pages = liveOnly(await snapshot('pages')).filter((p) => p.show_in_menu);
  const kind = result.layout || 'site';
  document.body.className = result.bodyClass || '';
  $('extra-css').disabled = kind !== 'article';
  $('admin-css').disabled = true;
  $('hdr-slot').innerHTML = toHtml(kind === 'article' ? articleHeader(site, location.pathname, search) : siteHeader(site, pages, location.pathname, search));
  $('ftr-slot').innerHTML = toHtml(kind === 'article' ? articleFooter(site) : siteFooter(site));
  $('cookie-slot').innerHTML = toHtml(cookieBanner(site));
  $('draft-slot').innerHTML = result.draft ? toHtml(html`<div class="draft-banner">${t('Preview mode: this page is not public yet')} (${result.draft}).</div>`) : '';
  $('main').innerHTML = toHtml(result.html);
  const name = siteName(site);
  setHead({
    title: result.fullTitle || `${result.title} – ${name}`, description: result.description ?? (tr(site, 'default_meta_description') || tr(site, 'tagline')),
    siteName: name, meta: result.meta, jsonld: result.jsonld, noindex: result.noindex, path: location.pathname,
  });
  initPage($('main'));
  initConsent({ ga: site.ga_measurement_id, plausible: site.plausible_domain, snippet: site.analytics_snippet });
  if (result.after) result.after($('main'), { site, navigate });
  const hash = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (hash) hash.scrollIntoView(); else window.scrollTo(0, 0);
}

async function renderAdmin(path, token) {
  await authReady();
  const mod = await import('./admin/index.js');
  if (token !== navToken) return;
  document.body.className = 'admin-app';
  $('extra-css').disabled = true;
  $('admin-css').disabled = false;
  $('hdr-slot').innerHTML = ''; $('ftr-slot').innerHTML = ''; $('cookie-slot').innerHTML = ''; $('draft-slot').innerHTML = '';
  try { await mod.default({ path, query: new URLSearchParams(location.search), navigate, root: $('main') }); } catch (e) { showError(e); }
}

// ---- global interactions ---------------------------------------------------------------------------
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (a.target && a.target !== '_self') return;
  if (a.hasAttribute('download') || a.dataset.native !== undefined) return;
  const href = a.getAttribute('href');
  if (!href || href.startsWith('#') || /^(mailto:|tel:|javascript:)/.test(href)) return;
  const u = new URL(href, location.href);
  if (u.origin !== location.origin) return;
  e.preventDefault();
  navigate(u.pathname + u.search + u.hash);
});

// GET forms (filters, search) navigate without a page load
document.addEventListener('submit', (e) => {
  const f = e.target;
  if (!f.matches('form[method="get"], form[data-nav]')) return;
  e.preventDefault();
  const action = f.getAttribute('action') || location.pathname;
  const q = new URLSearchParams();
  new FormData(f).forEach((v, k) => { if (String(v).trim() !== '') q.append(k, v); });
  navigate(action + (q.toString() ? '?' + q.toString() : ''));
});

// newsletter box (footer)
document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'newsletter-form') return;
  e.preventDefault();
  const { subscribe } = await import('./data/forms.js');
  await subscribe(e.target);
});

window.addEventListener('popstate', render);
let booted = false;
onAuthChange(() => { if (booted && !/^\/admin/.test(location.pathname)) render(); });
render().finally(() => { booted = true; });
