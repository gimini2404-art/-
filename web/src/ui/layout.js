import { LANGS, fmtDate, getLang, switchLangPath, t, tr, url } from '../i18n/index.js';
import { esc, html, raw } from '../util.js';
import { state } from '../auth.js';
import { img } from '../media.js';

const year = () => new Date().getFullYear();

export function siteName(s) { return tr(s, 'site_name') || 'SiaNexis'; }

export function brand(s) {
  return s.logo ? html`<img src="${img(s.logo, 120)}" alt="${siteName(s)}" height="36">` : raw('Sia<b>Nexis</b>');
}

export function accountLinks() {
  if (state.user && !state.staff) {
    return html`<a class="btn btn-sm btn-outline nav-account" href="${url('/account/')}">${t('My account')}${state.unread ? html` <span class="badge">${state.unread}</span>` : ''}</a>`;
  }
  return html`<a class="nav-login" href="${url('/account/login/')}">${t('Sign in')}</a><a class="btn btn-sm btn-outline nav-account" href="${url('/account/signup/')}">${t('Create account')}</a>`;
}

function langLinks(path, search, cls = 'lang') {
  return LANGS.filter(([c]) => c !== getLang()).map(([code, name]) =>
    html`<a class="${cls}" href="${switchLangPath(path, code) + search}" hreflang="${code}" lang="${code}" data-lang-switch="${code}">${name}</a>`);
}

export function siteHeader(s, menuPages, path, search) {
  return html`<a class="skip" href="#main">${t('Skip to content')}</a>
<header class="hdr">
  <div class="wrap hdr-in">
    <a class="brand" href="${url('/')}">${brand(s)}</a>
    <input type="checkbox" id="nav-toggle" class="nav-toggle" aria-hidden="true">
    <label for="nav-toggle" class="burger" aria-label="${t('Menu')}">☰</label>
    <nav class="nav" aria-label="Main">
      <a href="${url('/about/')}">${t('About')}</a>
      <a href="${url('/research-areas/')}">${t('Research Areas')}</a>
      <a href="${url('/services/')}">${t('Services')}</a>
      <a href="${url('/research-hub/')}">${t('Research Hub')}</a>
      <a href="${url('/projects/')}">${t('Projects')}</a>
      <a href="${url('/publications/')}">${t('Publications')}</a>
      <div class="more-menu"><button type="button" class="more-btn" aria-haspopup="true">${t('More')} <span aria-hidden="true">▾</span></button>
        <div class="dropdown">
          <a href="${url('/collaborations/')}">${t('Collaborations')}</a>
          <a href="${url('/training/')}">${t('Training')}</a>
          <a href="${url('/opportunities/')}">${t('Opportunities')}</a>
          <a href="${url('/news/')}">${t('News')}</a>
          ${menuPages.map((p) => html`<a href="${url('/p/' + p.slug + '/')}">${tr(p, 'title')}</a>`)}
        </div></div>
      <a class="search-link" href="${url('/search/')}" aria-label="${t('Search')}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg></a>
      ${langLinks(path, search)}
      ${accountLinks()}
      <a class="btn btn-sm" href="${url('/contact/')}">${t('Start a Project')}</a>
    </nav>
  </div>
</header>`;
}

export function siteFooter(s) {
  return html`<footer class="ftr">
  <div class="wrap news-box"><div><strong>${t('Subscribe to our newsletter')}</strong><p>${t('Research updates, opportunities and training announcements.')}</p></div>
    <form id="newsletter-form" class="news-form" novalidate>
      <input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <input type="email" name="email" required placeholder="${t('Your email address')}" aria-label="${t('Your email address')}" dir="ltr"><button class="btn btn-sm" type="submit">${t('Subscribe')}</button></form></div>
  <div class="wrap ftr-in">
    <div><strong>${siteName(s)}</strong><p>${tr(s, 'tagline')}</p>
      ${s.contact_email ? html`<p><a href="mailto:${s.contact_email}">${s.contact_email}</a></p>` : ''}
      ${s.phone ? html`<p>${s.phone}</p>` : ''}${tr(s, 'address') ? html`<p>${tr(s, 'address')}</p>` : ''}</div>
    <div><strong>${t('Explore')}</strong>
      <a href="${url('/research-areas/')}">${t('Research Areas')}</a><a href="${url('/services/')}">${t('Services')}</a>
      <a href="${url('/research-hub/')}">${t('Research Hub')}</a><a href="${url('/publications/')}">${t('Publications')}</a></div>
    <div><strong>${t('Get involved')}</strong>
      <a href="${url('/opportunities/')}">${t('Opportunities')}</a><a href="${url('/training/')}">${t('Training')}</a><a href="${url('/news/')}">${t('News')}</a>
      <a href="${url('/contact/')}">${t('Contact')}</a>
      <a href="${url('/account/login/')}">${t('Student sign in')}</a>${state.staff ? html`<a href="${url('/admin/')}">${t('Admin panel')}</a>` : ''}
      <a href="#" data-cookie-settings>${t('Cookie settings')}</a>
      ${s.linkedin_url ? html`<a href="${s.linkedin_url}" rel="noopener">LinkedIn</a>` : ''}
      ${s.twitter_url ? html`<a href="${s.twitter_url}" rel="noopener">X / Twitter</a>` : ''}</div>
  </div>
  <div class="wrap copy">© ${year()} ${siteName(s)}. ${t('All rights reserved.')} ${tr(s, 'footer_text')}</div>
</footer>`;
}

export function cookieBanner(s) {
  return html`<div id="cookie-banner" class="cookie" role="dialog" aria-label="${t('Cookie consent')}" hidden>
  <p>${t('We use cookies to understand how the site is used and to improve it. You can accept or decline analytics cookies.')}
    ${s.privacy_url ? html`<a href="${s.privacy_url}">${t('Privacy policy')}</a>` : ''}</p>
  <div class="cookie-actions"><button type="button" class="btn btn-sm" data-consent="granted">${t('Accept')}</button><button type="button" class="btn btn-sm btn-ghost-dark" data-consent="denied">${t('Decline')}</button></div>
</div>`;
}

// ---- article layout (Springer-style header / footer) ---------------------------------------------
export function articleHeader(s, path, search) {
  return html`${tr(s, 'announcement_text') ? html`<div class="art-alert" role="status"><div class="art-wrap">${s.announcement_url ? html`<a href="${s.announcement_url}">${tr(s, 'announcement_text')}</a>` : tr(s, 'announcement_text')}</div></div>` : ''}
<a class="skip" href="#main">${t('Skip to content')}</a>
<header class="art-hdr"><div class="art-wrap art-hdr-in">
  <a class="art-brand" href="${url('/')}">${s.logo ? html`<img src="${img(s.logo, 120)}" alt="${siteName(s)}" height="30">` : siteName(s)}</a>
  <nav class="art-hdr-nav" aria-label="Main">
    <details class="art-menu"><summary>${t('Menu')} <span aria-hidden="true">▾</span></summary>
      <div class="art-menu-panel">
        <a href="${url('/about/')}">${t('About')}</a><a href="${url('/research-areas/')}">${t('Research Areas')}</a><a href="${url('/services/')}">${t('Services')}</a>
        <a href="${url('/research-hub/')}">${t('Research Hub')}</a><a href="${url('/projects/')}">${t('Projects')}</a><a href="${url('/publications/')}">${t('Publications')}</a>
        <a href="${url('/collaborations/')}">${t('Collaborations')}</a><a href="${url('/training/')}">${t('Training')}</a><a href="${url('/opportunities/')}">${t('Opportunities')}</a>
        <a href="${url('/news/')}">${t('News')}</a><a href="${url('/contact/')}">${t('Contact')}</a>
        <hr>${langLinks(path, search, '')}
      </div></details>
    <details class="art-search"><summary aria-label="${t('Search')}"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg> <span>${t('Search')}</span></summary>
      <form action="${url('/search/')}" method="get" role="search"><input type="search" name="q" placeholder="${t('Search the site')}" aria-label="${t('Search')}"><button type="submit">${t('Search')}</button></form></details>
    <a class="art-login" href="${url('/account/login/')}">${t('Login')}</a>
  </nav>
</div></header>`;
}

export function articleFooter(s) {
  return html`<footer class="art-ftr"><div class="art-wrap"><div class="art-ftr-in"><span>© ${year()} ${siteName(s)}</span>
  <nav aria-label="Footer"><a href="${url('/publications/')}">${t('Publications')}</a><a href="${url('/contact/')}">${t('Contact')}</a>${s.privacy_url ? html`<a href="${s.privacy_url}">${t('Privacy policy')}</a>` : ''}<a href="#" data-cookie-settings>${t('Cookie settings')}</a></nav></div></div></footer>`;
}

export const pageHead = (title, lead) => html`<section class="pagehead"><div class="ph-orb o1"></div><div class="ph-orb o2"></div>
<div class="wrap"><h1>${title}</h1>${lead ? html`<p class="lead">${lead}</p>` : ''}</div></section>`;

export const empty = () => html`<p class="empty">${t('Nothing here yet. Check back soon.')}</p>`;

export const ctaBlock = (s) => html`<section class="cta"><div class="cta-orb"></div><div class="wrap reveal"><h2>${tr(s, 'cta_title')}</h2><p>${tr(s, 'cta_text') || t('Tell us about your research question, data or collaboration idea.')}</p>
<a class="btn btn-light" href="${url('/contact/')}">${t('Start a project')}</a> <a class="btn btn-ghost" href="${url('/contact/')}?type=collaboration">${t('Propose a collaboration')}</a></div></section>`;

export const fmt = fmtDate;
export { esc };
