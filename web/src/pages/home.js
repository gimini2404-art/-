import { liveOnly, list, snapshot, sortItems } from '../data/content.js';
import { t, tn, tr, url, fmtDate } from '../i18n/index.js';
import { CHOICES } from '../schema.js';
import { ctaBlock, empty } from '../ui/layout.js';
import { icon } from '../ui/icons.js';
import { html, truncateWords, raw } from '../util.js';
import { img } from '../media.js';
import { auth_buttons } from './_home_auth.js';
import { label } from './_common.js';

export default async function home(ctx) {
  const { site } = ctx;
  const [areas, categories, services, hubAll, projects, posts, metrics, orgs] = await Promise.all([
    list('areas'), list('serviceCategories'), list('services'), list('hub'), list('projects'), list('posts'), list('metrics'), snapshot('organizations'),
  ]);
  const programs = hubAll.filter((i) => ['program', 'ongoing', 'multicenter'].includes(i.category)).slice(0, 6);
  const featured = projects.filter((p) => p.featured).slice(0, 3);
  const news = posts.slice(0, 3);
  const partners = orgs.filter((o) => o.is_partner && o.logo);
  const stats = [[areas.length, t('Research areas')], [categories.length, t('Service lines')], [services.length, t('Specialised services')], [CHOICES.hubCategory.length, t('Research Hub streams')]];

  const body = html`
<section class="hero">
  <canvas id="net" aria-hidden="true"></canvas><div class="hero-glow"></div>
  <div class="wrap hero-grid">
    <div class="hero-text">
      <span class="eyebrow">${tr(site, 'tagline')}</span>
      <h1>${tr(site, 'hero_title')}</h1>
      <p class="lead">${tr(site, 'hero_text') || tr(site, 'tagline')}</p>
      <div class="actions"><a class="btn btn-light" href="${url('/contact/')}">${t('Start a project')}</a><a class="btn btn-ghost" href="${url('/services/')}">${t('Our services')}</a>${auth_buttons()}</div>
    </div>
    <div class="orbit" aria-hidden="true">
      <div class="ring r1"></div><div class="ring r2"></div><div class="ring r3"></div>
      <div class="core"><span>Sia<b>Nexis</b></span></div>
      <div class="sat s1">${icon('neuroscience')}</div><div class="sat s2">${icon('data')}</div>
      <div class="sat s3">${icon('cardiology')}</div><div class="sat s4">${icon('computational')}</div>
      <div class="sat s5">${icon('public-health')}</div>
    </div>
  </div>
  <div class="wave"><svg viewBox="0 0 1440 80" preserveAspectRatio="none"><path d="M0 40C240 80 480 0 720 30s480 50 720 10V80H0z" fill="#fff"/></svg></div>
</section>

<section class="statband"><div class="wrap stats">
  ${metrics.length ? metrics.map((m) => html`<div class="stat"><b><span data-count="${m.value}">${m.value}</span>${m.suffix || ''}</b><span>${tr(m, 'label')}</span></div>`)
    : stats.map(([n, l]) => html`<div class="stat"><b data-count="${n}">${n}</b><span>${l}</span></div>`)}
</div></section>

${tr(site, 'intro_text') ? html`<section class="sec"><div class="wrap split">
  <div class="split-art"><svg viewBox="0 0 400 320" aria-hidden="true"><defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b7a8c"/><stop offset="1" stop-color="#0b3d5c"/></linearGradient></defs>
    <rect x="30" y="30" width="340" height="260" rx="26" fill="url(#g1)"/><g stroke="#9fe3ee" stroke-width="2" fill="none" opacity=".8"><path d="M70 230L140 160 210 200 290 100 340 130"/></g>
    <g fill="#fff"><circle cx="70" cy="230" r="7"/><circle cx="140" cy="160" r="7"/><circle cx="210" cy="200" r="7"/><circle cx="290" cy="100" r="7"/><circle cx="340" cy="130" r="7"/></g>
    <g fill="#ffffff" opacity=".22"><rect x="70" y="60" width="120" height="12" rx="6"/><rect x="70" y="84" width="80" height="12" rx="6"/></g></svg></div>
  <div><span class="kicker">${t('About SiaNexis')}</span><h2>${t('Where clinical insight meets data and computation')}</h2>${paragraphs(tr(site, 'intro_text'))}<a class="btn" href="${url('/about/')}">${t('Learn more')}</a></div>
</div></section>` : ''}

<section class="sec alt"><div class="wrap"><span class="kicker">${t('What we do')}</span><h2>${t('Main services')}</h2>
  <div class="grid grid-4">${categories.length ? categories.map((c) => html`<a class="card feat" href="${url('/services/')}#${c.slug}"><span class="ico">${icon(c.slug)}</span><h3>${tr(c, 'title')}</h3><p>${tr(c, 'description')}</p><span class="more arrow">${t('Explore')}</span></a>`) : empty()}</div></div></section>

<section class="sec"><div class="wrap"><span class="kicker">${t('Where we work')}</span><h2>${t('Research areas')}</h2>
  <div class="grid grid-4">${areas.length ? areas.map((a) => html`<a class="card area" href="${url('/research-areas/' + a.slug + '/')}"><span class="ico">${icon(a.slug)}</span><h3>${tr(a, 'title')}</h3><p>${tr(a, 'summary')}</p></a>`) : empty()}</div></div></section>

<section class="sec process"><div class="wrap"><span class="kicker light">${t('How we work')}</span><h2>${t('From question to publication')}</h2>
  <div class="steps">
    <div class="step"><i>01</i><h3>${t('Define')}</h3><p>${t('Sharpen the research question and design the study.')}</p></div>
    <div class="step"><i>02</i><h3>${t('Plan')}</h3><p>${t('Protocol, ethics and regulatory documentation.')}</p></div>
    <div class="step"><i>03</i><h3>${t('Analyse')}</h3><p>${t('Data management, statistics and computational methods.')}</p></div>
    <div class="step"><i>04</i><h3>${t('Publish')}</h3><p>${t('Scientific writing and publication support.')}</p></div>
  </div></div></section>

${programs.length || featured.length ? html`<section class="sec"><div class="wrap"><span class="kicker">${t('In progress')}</span><h2>${t('Current programs & projects')}</h2>
  <div class="grid">${programs.map((i) => html`<a class="card" href="${url('/research-hub/' + i.slug + '/')}">${i.image ? html`<img src="${img(i.image, 600)}" alt="" loading="lazy">` : ''}<span class="tag">${label('hubCategory', i.category)}</span><h3>${tr(i, 'title')}</h3><p>${tr(i, 'summary')}</p></a>`)}
  ${featured.map((p) => html`<a class="card" href="${url('/projects/' + p.slug + '/')}">${p.image ? html`<img src="${img(p.image, 600)}" alt="" loading="lazy">` : ''}<span class="tag">${t('Project')}</span><h3>${tr(p, 'title')}</h3><p>${truncateWords(tr(p, 'problem'), 25)}</p></a>`)}</div>
  <p><a class="btn" href="${url('/research-hub/')}">${t('Visit the Research Hub')}</a></p></div></section>` : ''}
${partners.length ? html`<section class="sec partners"><div class="wrap"><span class="kicker">${t('Our partners')}</span><h2>${t('Trusted by research institutions')}</h2></div>
  <div class="marquee" aria-label="${t('Partner logos')}"><div class="marquee-track">${[0, 1].map(() => partners.map((o) => html`<a href="${o.website || '#'}" ${o.website ? raw('target="_blank" rel="noopener"') : ''} class="plogo" title="${tr(o, 'name')}"><img src="${img(o.logo, 300)}" alt="${tr(o, 'name')}" loading="lazy"></a>`))}</div></div></section>` : ''}
${news.length ? html`<section class="sec alt"><div class="wrap"><span class="kicker">${t('Latest')}</span><h2>${t('News')}</h2><div class="grid">${news.map((p) => html`<a class="card" href="${url('/news/' + p.slug + '/')}">${p.image ? html`<img src="${img(p.image, 600)}" alt="" loading="lazy">` : ''}<span class="tag tag-s">${fmtDate(p.published_at)}</span><h3>${tr(p, 'title')}</h3><p>${tr(p, 'summary')}</p></a>`)}</div><p><a class="btn" href="${url('/news/')}">${t('All news')}</a></p></div></section>` : ''}
${ctaBlock(site)}`;
  return { title: `${tr(site, 'site_name')} – ${tr(site, 'tagline')}`, fullTitle: `${tr(site, 'site_name')} – ${tr(site, 'tagline')}`, html: body };
}

import { linebreaks } from '../util.js';
function paragraphs(text) { return linebreaks(text); }
