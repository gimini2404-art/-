import { list } from '../data/content.js';
import { t, tn, tr, url } from '../i18n/index.js';
import { empty, pageHead } from '../ui/layout.js';
import { html, truncateChars } from '../util.js';

const SPEC = [
  ['areas', 'Research Areas', ['title', 'summary', 'description'], (o) => url('/research-areas/' + o.slug + '/')],
  ['services', 'Services', ['title', 'description'], null],
  ['projects', 'Projects', ['title', 'problem', 'methodology', 'outcome'], (o) => url('/projects/' + o.slug + '/')],
  ['hub', 'Research Hub', ['title', 'summary', 'description'], (o) => url('/research-hub/' + o.slug + '/')],
  ['posts', 'News', ['title', 'summary', 'body'], (o) => url('/news/' + o.slug + '/')],
  ['training', 'Training', ['title', 'summary', 'description'], (o) => url('/training/' + o.slug + '/register/')],
  ['opportunities', 'Opportunities', ['title', 'summary', 'description'], null],
  ['collaborations', 'Collaborations', ['organization_name', 'description'], null],
  ['publications', 'Publications', ['title', 'authors', 'journal', 'doi'], (o) => (o.has_article ? url('/publications/' + o.slug + '/') : null)],
];

export default async function search(ctx) {
  const q = (ctx.query.get('q') || '').trim().slice(0, 100);
  const groups = [];
  if (q.length >= 2) {
    const needle = q.toLowerCase();
    for (const [col, label, fields, link] of SPEC) {
      const found = (await list(col)).filter((o) => fields.some((f) => ['', '_en', '_ar'].some((s) => String(o[f + s] ?? '').toLowerCase().includes(needle)))).slice(0, 20);
      if (found.length) groups.push([t(label), found, link, col]);
    }
  }
  const count = groups.reduce((n, g) => n + g[1].length, 0);
  const titleOf = (o) => tr(o, 'title') || tr(o, 'organization_name');
  return {
    title: t('Search'), noindex: !!q,
    html: html`${pageHead(t('Search'))}
<section class="sec"><div class="wrap narrow">
<form class="searchbox" method="get" action="${url('/search/')}"><input type="search" name="q" value="${q}" placeholder="${t('Search projects, publications, news…')}" aria-label="${t('Search')}" autofocus><button class="btn" type="submit">${t('Search')}</button></form>
${q ? (count ? html`<p class="muted">${tn('%(counter)s result for “%(q)s”', '%(counter)s results for “%(q)s”', count, { q })}</p>
${groups.map(([lbl, found, link]) => html`<h2>${lbl}</h2><ul class="results">${found.map((o) => { const href = link && link(o); return html`<li>${href ? html`<a href="${href}">${titleOf(o)}</a>` : titleOf(o)}${tr(o, 'summary') ? html`<span>${truncateChars(tr(o, 'summary'), 140)}</span>` : ''}</li>`; })}</ul>`)}`
    : html`<p class="empty">${t('No results found. Try different keywords.')}</p>`) : ''}
</div></section>`,
  };
}
