/* Page behaviours (ported from the Django site's site.js / consent.js / article.js / map.js) made route-aware:
   `initPage()` runs after every navigation and cleans up what the previous page started. */
import { getLang } from './i18n/index.js';

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let observers = [];
let raf = 0;
let netCleanup = null;

function cleanup() {
  observers.forEach((o) => o.disconnect());
  observers = [];
  if (netCleanup) { netCleanup(); netCleanup = null; }
  cancelAnimationFrame(raf);
}

function headerScroll() {
  const hdr = document.querySelector('.hdr');
  if (hdr) hdr.classList.toggle('scrolled', window.scrollY > 10);
}
window.addEventListener('scroll', headerScroll, { passive: true });

function reveal(root) {
  const els = root.querySelectorAll('.card, .sec h2, .sec .lead, .step, .stat, .pub, .reveal, .grid > *');
  els.forEach((el, i) => { el.classList.add('rv'); el.style.setProperty('--d', (i % 6) * 70 + 'ms'); });
  if ('IntersectionObserver' in window && !reduceMotion()) {
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    els.forEach((el) => io.observe(el));
    observers.push(io);
  } else els.forEach((el) => el.classList.add('in'));
}

function counters(root) {
  root.querySelectorAll('[data-count]').forEach((el) => {
    const target = +el.dataset.count;
    if (reduceMotion() || !('IntersectionObserver' in window)) { el.textContent = target; return; }
    const o = new IntersectionObserver((es) => {
      if (!es[0].isIntersecting) return;
      o.disconnect();
      const t0 = performance.now();
      (function tick(t) {
        const k = Math.min((t - t0) / 1200, 1);
        el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(tick);
      })(t0);
    });
    o.observe(el);
    observers.push(o);
  });
}

function network(root) {
  const c = root.querySelector('#net');
  if (!c || reduceMotion()) return;
  const ctx = c.getContext('2d');
  let W, H, pts = [], N;
  const mouse = { x: -999, y: -999 };
  function size() {
    const r = c.getBoundingClientRect(), d = window.devicePixelRatio || 1;
    W = r.width; H = r.height; c.width = W * d; c.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0);
    N = Math.max(28, Math.min(70, Math.floor(W * H / 14000)));
    pts = [];
    for (let i = 0; i < N; i++) pts.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .35 });
  }
  const move = (e) => { const r = c.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; };
  c.parentNode.addEventListener('mousemove', move);
  function frame() {
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < N; i++) {
      const p = pts[i]; p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
      for (let j = i + 1; j < N; j++) {
        const q = pts[j], dx = p.x - q.x, dy = p.y - q.y, d = Math.sqrt(dx * dx + dy * dy);
        if (d < 130) { ctx.strokeStyle = 'rgba(120,220,235,' + (0.28 * (1 - d / 130)) + ')'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
      }
      const md = Math.hypot(p.x - mouse.x, p.y - mouse.y);
      if (md < 160) { ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 * (1 - md / 160)) + ')'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke(); }
      ctx.fillStyle = 'rgba(160,235,245,.9)'; ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, 6.3); ctx.fill();
    }
    raf = requestAnimationFrame(frame);
  }
  size(); frame();
  window.addEventListener('resize', size);
  netCleanup = () => { window.removeEventListener('resize', size); c.parentNode && c.parentNode.removeEventListener('mousemove', move); };
}

export function copyText(text, btn) {
  const old = btn ? btn.textContent : '';
  const done = () => { if (btn) { btn.textContent = btn.getAttribute('data-done') || '✓'; setTimeout(() => { btn.textContent = old; }, 1500); } };
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(done);
  else { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); done(); }
}

// delegated handlers (registered once)
document.addEventListener('click', (e) => {
  const b = e.target.closest('.cite-btn');
  if (b) { copyText(b.getAttribute('data-copy'), b); return; }
  const dlgOpen = e.target.closest('[data-open-dialog]');
  if (dlgOpen) {
    const d = document.getElementById(dlgOpen.getAttribute('data-open-dialog'));
    if (d && d.showModal) { e.preventDefault(); d.showModal(); }
    return;
  }
  const cp = e.target.closest('[data-copy]');
  if (cp && !cp.classList.contains('cite-btn')) { copyText(cp.getAttribute('data-copy'), cp); return; }
  if (e.target.matches('dialog.art-dialog')) e.target.close();
  document.querySelectorAll('details.art-menu[open], details.art-search[open], details.art-share[open]').forEach((d) => { if (!d.contains(e.target)) d.open = false; });
});

function article(root) {
  const $ = (s, r = root) => r.querySelector(s), $$ = (s, r = root) => [...r.querySelectorAll(s)];
  const side = $('#side-details'), mq = window.matchMedia('(max-width: 1000px)');
  const syncSide = () => { if (side) side.open = !mq.matches; };
  syncSide();
  const dlg = $('#cite-dialog');
  if (dlg) {
    $$('.dlg-tabs button', dlg).forEach((tab) => tab.addEventListener('click', () => {
      $$('.dlg-tabs button', dlg).forEach((x) => x.setAttribute('aria-selected', x === tab ? 'true' : 'false'));
      $$('.dlg-pane', dlg).forEach((p) => { p.hidden = p.getAttribute('data-pane') !== tab.getAttribute('data-tab'); });
    }));
    const cp = $('#dlg-copy', dlg);
    if (cp) cp.addEventListener('click', () => copyText($('.dlg-pane:not([hidden])', dlg).textContent, cp));
  }
  const cl = $('#copy-link'); if (cl) cl.addEventListener('click', () => copyText(location.href, cl));
  const ns = $('#share-native');
  if (ns && navigator.share) { ns.hidden = false; ns.addEventListener('click', () => navigator.share({ title: document.title, url: location.href }).catch(() => {})); }
  const sb = $('#save-btn');
  if (sb) {
    const KEY = 'sx_saved_articles';
    const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
    const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignore */ } };
    const slug = sb.getAttribute('data-slug');
    const paint = () => { const on = read().some((x) => x.slug === slug); sb.textContent = on ? '✓ ' + sb.getAttribute('data-label-saved') : sb.getAttribute('data-label-save'); sb.setAttribute('aria-pressed', on); };
    sb.addEventListener('click', () => {
      const list = read(), i = list.findIndex((x) => x.slug === slug);
      if (i >= 0) list.splice(i, 1); else list.push({ slug, title: sb.getAttribute('data-title'), url: location.pathname });
      write(list); paint();
    });
    paint();
  }
  const sa = $('#show-authors'), panel = $('#author-panel');
  if (sa && panel) sa.addEventListener('click', () => {
    const open = panel.hidden; panel.hidden = !open; sa.setAttribute('aria-expanded', open); sa.textContent = sa.getAttribute(open ? 'data-less' : 'data-more');
  });
  const links = $$('[data-toc]');
  if (links.length && 'IntersectionObserver' in window) {
    const map = {}; links.forEach((a) => { map[a.getAttribute('data-toc')] = a; });
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) { links.forEach((a) => a.classList.remove('active')); const a = map[e.target.id]; if (a) a.classList.add('active'); } });
    }, { rootMargin: '0px 0px -70% 0px', threshold: 0 });
    Object.keys(map).forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
    observers.push(io);
  }
}

async function map(root) {
  const el = root.querySelector('#collab-map'), data = root.querySelector('#map-points');
  if (!el || !data) return;
  await loadLeaflet();
  const L = window.L, pts = JSON.parse(data.textContent);
  const m = L.map(el, { scrollWheelZoom: false, worldCopyJump: true }).setView([25, 20], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 12, attribution: '&copy; OpenStreetMap contributors' }).addTo(m);
  const esc = (s) => { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; };
  const bounds = [];
  pts.forEach((p) => {
    const icon = L.divIcon({ className: 'pin-wrap', html: '<span class="pin"></span>', iconSize: [22, 22], iconAnchor: [11, 11] });
    const h = '<strong>' + esc(p.name) + '</strong><br>' + esc(p.country) + '<br><em>' + esc(p.type) + '</em>' +
      (p.link ? '<br><a href="' + encodeURI(p.link) + '" target="_blank" rel="noopener">' + esc(p.link.replace(/^https?:\/\//, '')) + '</a>' : '');
    L.marker([p.lat, p.lng], { icon }).addTo(m).bindPopup(h);
    bounds.push([p.lat, p.lng]);
  });
  if (bounds.length > 1) m.fitBounds(bounds, { padding: [40, 40], maxZoom: 5 });
  else if (bounds.length === 1) m.setView(bounds[0], 5);
  el.addEventListener('click', () => m.scrollWheelZoom.enable());
}

let leafletPromise;
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  if (!leafletPromise) {
    leafletPromise = new Promise((resolve, reject) => {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/vendor/leaflet/leaflet.css'; document.head.appendChild(css);
      const s = document.createElement('script'); s.src = '/vendor/leaflet/leaflet.js'; s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
    });
  }
  return leafletPromise;
}

// ---- analytics consent (ported from consent.js) -------------------------------------------------
const CONSENT_KEY = 'sx_consent';
let analyticsLoaded = false;
const loadScript = (src, attrs = {}) => { const s = document.createElement('script'); s.src = src; s.async = true; Object.entries(attrs).forEach(([k, v]) => s.setAttribute(k, v)); document.head.appendChild(s); };
const getConsent = () => { try { return localStorage.getItem(CONSENT_KEY); } catch { return null; } };
const setConsent = (v) => { try { localStorage.setItem(CONSENT_KEY, v); } catch { /* ignore */ } };
let consentCfg = {};
let plausibleLoaded = false;

function enableAnalytics() {
  if (analyticsLoaded) return;
  analyticsLoaded = true;
  if (consentCfg.ga) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date()); window.gtag('config', consentCfg.ga, { anonymize_ip: true });
    loadScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(consentCfg.ga));
  }
  if (consentCfg.snippet) { const s = document.createElement('script'); s.text = consentCfg.snippet; document.head.appendChild(s); }
}

export function initConsent(cfg) {
  consentCfg = cfg;
  const banner = document.getElementById('cookie-banner');
  if (cfg.plausible && !plausibleLoaded) { plausibleLoaded = true; loadScript('https://plausible.io/js/script.js', { 'data-domain': cfg.plausible, defer: '' }); }
  const state = getConsent();
  if (state === 'granted') enableAnalytics();
  else if (state === null && banner && (cfg.ga || cfg.snippet)) banner.hidden = false;
}
document.addEventListener('click', (e) => {
  const banner = document.getElementById('cookie-banner');
  const b = e.target.closest('[data-consent]');
  if (b && b.closest('#cookie-banner')) { setConsent(b.getAttribute('data-consent')); banner.hidden = true; if (b.getAttribute('data-consent') === 'granted') enableAnalytics(); }
  if (e.target.closest('[data-cookie-settings]')) { e.preventDefault(); if (banner) banner.hidden = false; }
});

export function initPage(root = document.getElementById('main')) {
  cleanup();
  headerScroll();
  reveal(root);
  counters(root);
  network(root);
  article(root);
  map(root);
}

export const _lang = getLang;
