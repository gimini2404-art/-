import { state, signIn, signInGoogle, signOut, reloadUser, authReady } from '../auth.js';
import { doc, serverTimestamp, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase.js';
import { setLang, t, getLang } from '../i18n/index.js';
import { GROUPS, SCHEMA } from '../schema.js';
import { html, toHtml, esc } from '../util.js';
import { toast } from '../ui/toast.js';

const routes = [
  [/^$/, () => import('./dashboard.js')],
  [/^\/settings$/, () => import('./settings.js')],
  [/^\/c\/(\w+)$/, () => import('./content.js'), 'list'],
  [/^\/c\/(\w+)\/new$/, () => import('./content.js'), 'new'],
  [/^\/c\/(\w+)\/([^/]+)$/, () => import('./content.js'), 'edit'],
  [/^\/import-pdf$/, () => import('./importPdf.js')],
  [/^\/inbox$/, () => import('./requests.js'), 'inbox'],
  [/^\/subscribers$/, () => import('./requests.js'), 'subscribers'],
  [/^\/registrations$/, () => import('./requests.js'), 'registrations'],
  [/^\/students$/, () => import('./students.js'), 'students'],
  [/^\/enrollments$/, () => import('./students.js'), 'enrollments'],
  [/^\/project-requests$/, () => import('./students.js'), 'projects'],
  [/^\/users$/, () => import('./users.js')],
  [/^\/data$/, () => import('./dataTools.js')],
];

export function adminLang() {
  try { const s = localStorage.getItem('sx_admin_lang'); if (s === 'ar' || s === 'en') return s; } catch { /* ignore */ }
  return (navigator.language || '').toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

function applyLang() {
  const l = adminLang();
  setLang(l);
  document.documentElement.lang = l;
  document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
}

const NAV = () => [
  [t('Dashboard'), '/admin/', null],
  ...GROUPS.map(([key, label]) => [t(label), null, Object.entries(SCHEMA).filter(([, s]) => s.group === key).map(([c, s]) => [t(s.plural), `/admin/c/${c}`])]),
  [t('Students'), null, [[t('Students'), '/admin/students'], [t('Course enrollments'), '/admin/enrollments'], [t('Student project requests'), '/admin/project-requests']]],
  [t('Engagement'), null, [[t('Contact requests'), '/admin/inbox'], [t('Training registrations'), '/admin/registrations'], [t('Newsletter subscribers'), '/admin/subscribers']]],
  [t('Users & access'), null, [[t('Site settings'), '/admin/settings'], [t('Staff access'), '/admin/users'], [t('Backup & import'), '/admin/data']]],
];

function shell(active, title, body) {
  const nav = NAV().map(([label, href, children]) => (children
    ? html`<div class="ad-nav"><h4>${label}</h4>${children.map(([l, h]) => html`<a href="${h}" class="${active === h ? 'on' : ''}">${l}</a>`)}</div>`
    : html`<div class="ad-nav"><a href="${href}" class="${active === href ? 'on' : ''}">🏠 ${label}</a></div>`));
  return html`<div class="ad"><aside class="ad-side"><a class="ad-brand" href="/admin/">Sia<b>Nexis</b> CMS</a>${nav}</aside>
  <div class="ad-main"><div class="ad-top"><a href="/${getLang()}/" data-native>${t('View website')}</a><span class="sp"></span>
    <span class="who">${state.user?.email} · ${t(state.staff.role === 'admin' ? 'Administrator' : state.staff.role === 'editor' ? 'Editor' : 'Contributor')}</span>
    <button class="lnk" id="ad-lang">${getLang() === 'ar' ? 'English' : 'العربية'}</button><button class="lnk" id="ad-out">${t('Sign out')}</button></div>
  <div class="ad-content"><h1>${title}</h1>${body}</div></div></div>`;
}

function loginView(root, message) {
  root.innerHTML = toHtml(html`<div class="ad-login"><form class="ad-form ad-f" id="ad-login" novalidate><h1>${t('SiaNexis CMS')}</h1><p class="ad-sub">${t('Staff sign in')}</p>
    ${message ? html`<div class="ad-warn">${message}</div>` : ''}
    <div class="ad-f"><label>${t('Email')}</label><input type="email" name="email" required dir="ltr" autocomplete="username"></div>
    <div class="ad-f"><label>${t('Password')}</label><input type="password" name="password" required autocomplete="current-password"></div>
    <div class="err" id="ad-err" hidden></div>
    <button class="ad-btn" type="submit">${t('Sign in')}</button> <button class="ad-btn line" type="button" id="ad-google">Google</button>
    <p class="ad-sub" style="margin-top:14px"><a href="/${getLang()}/">${t('Back to home')}</a> · <button class="ad-btn line sm" type="button" id="ad-lang">${getLang() === 'ar' ? 'English' : 'العربية'}</button></p></form></div>`);
  const err = root.querySelector('#ad-err');
  const fail = (e) => { err.hidden = false; err.textContent = t('Incorrect email or password.'); console.warn(e?.code); };
  root.querySelector('#ad-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try { await signIn(String(f.get('email')).trim(), String(f.get('password'))); location.reload(); } catch (x) { fail(x); }
  });
  root.querySelector('#ad-google').addEventListener('click', async () => { try { await signInGoogle(); location.reload(); } catch (x) { fail(x); } });
  root.querySelector('#ad-lang').addEventListener('click', toggleLang);
}

function toggleLang() {
  try { localStorage.setItem('sx_admin_lang', adminLang() === 'ar' ? 'en' : 'ar'); } catch { /* ignore */ }
  location.reload();
}

async function accessView(root) {
  const uid = state.user.uid;
  let requested = false;
  try { requested = (await getDoc(doc(db, 'adminRequests', uid))).exists(); } catch { /* ignore */ }
  root.innerHTML = toHtml(html`<div class="ad-login"><div class="ad-form"><h1>${t('No staff access yet')}</h1>
    <p>${t('You are signed in as')} <strong dir="ltr">${state.user.email}</strong> ${t('but this account is not a staff member.')}</p>
    ${state.user.emailVerified ? (requested ? html`<p class="ad-warn">${t('Your access request was sent. An administrator must approve it.')}</p>`
      : html`<button class="ad-btn" id="ad-req">${t('Request staff access')}</button>`) : html`<p class="ad-warn">${t('Verify your email address first (check your inbox), then reload this page.')}</p><button class="ad-btn line" id="ad-reload">${t('I verified my email')}</button>`}
    <p style="margin-top:16px"><button class="ad-btn line sm" id="ad-out">${t('Sign out')}</button> <a href="/${getLang()}/">${t('Back to home')}</a></p>
    <p class="ad-sub" dir="ltr">UID: ${uid}</p></div></div>`);
  root.querySelector('#ad-out')?.addEventListener('click', async () => { await signOut(); location.reload(); });
  root.querySelector('#ad-reload')?.addEventListener('click', async () => { await reloadUser(); location.reload(); });
  root.querySelector('#ad-req')?.addEventListener('click', async () => {
    await setDoc(doc(db, 'adminRequests', uid), { email: state.user.email, name: state.user.displayName || '', created: serverTimestamp() });
    location.reload();
  });
}

export default async function admin({ path, root, navigate }) {
  await authReady();
  applyLang();
  document.title = `${t('SiaNexis CMS')}`;
  if (!state.user) return loginView(root);
  if (!state.staff) return accessView(root);
  const sub = path.replace(/^\/admin/, '').replace(/\/+$/, '');
  let hit = null;
  for (const [rx, load, mode] of routes) { const m = rx.exec(sub); if (m) { hit = { load, mode, args: m.slice(1) }; break; } }
  if (!hit) { root.innerHTML = toHtml(shell('', t('Page not found'), html`<p class="ad-empty">404</p>`)); return wireShell(root); }
  const mod = await hit.load();
  root.innerHTML = toHtml(shell('', '…', html`<p class="ad-empty">…</p>`));
  const view = await mod.default({ mode: hit.mode, args: hit.args, query: new URLSearchParams(location.search), navigate, flash: toast, root });
  const active = view.active || (sub ? '/admin' + sub : '/admin/');
  root.innerHTML = toHtml(shell(active, view.title, view.html));
  wireShell(root);
  if (view.after) await view.after(root.querySelector('.ad-content'));
  window.scrollTo(0, 0);
}

function wireShell(root) {
  root.querySelector('#ad-lang')?.addEventListener('click', toggleLang);
  root.querySelector('#ad-out')?.addEventListener('click', async () => { await signOut(); location.href = '/admin/'; });
}

export { esc };
