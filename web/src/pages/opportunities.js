import { list } from '../data/content.js';
import { t, tr, url, fmtDate } from '../i18n/index.js';
import { CHOICES } from '../schema.js';
import { empty, pageHead } from '../ui/layout.js';
import { html, linebreaks } from '../util.js';
import { PLURAL } from './_common.js';

export default async function opportunities(ctx) {
  const items = await list('opportunities');
  const groups = CHOICES.oppKind.map(([k]) => [t(PLURAL.opp[k]), items.filter((o) => o.kind === k)]).filter(([, a]) => a.length);
  return {
    title: t('Opportunities'),
    html: html`${pageHead(t('Opportunities'), t('Open projects and calls for collaborators, sites, experts and students.'))}
${groups.length ? groups.map(([lbl, arr], i) => html`<section class="sec ${i % 2 ? 'alt' : ''}"><div class="wrap"><h2>${lbl}</h2><div class="grid">
${arr.map((o) => html`<div class="card"><h3>${tr(o, 'title')}</h3>${o.deadline ? html`<p class="muted">${t('Deadline')}: ${fmtDate(o.deadline)}</p>` : ''}<p>${tr(o, 'summary')}</p>${linebreaks(tr(o, 'description'))}
<a class="btn btn-sm" href="${o.apply_link || url('/contact/') + '?type=collaboration&subject=' + encodeURIComponent(tr(o, 'title'))}">${t('Apply / express interest')}</a></div>`)}
</div></div></section>`) : html`<div class="wrap sec">${empty()}</div>`}`,
  };
}
