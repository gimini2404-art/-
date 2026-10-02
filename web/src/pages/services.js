import { list, sortItems } from '../data/content.js';
import { t, tr } from '../i18n/index.js';
import { icon } from '../ui/icons.js';
import { ctaBlock, empty, pageHead } from '../ui/layout.js';
import { html, linebreaks } from '../util.js';

export default async function services(ctx) {
  const [cats, svcs] = await Promise.all([list('serviceCategories'), list('services')]);
  const all = sortItems('services', svcs, cats);
  return {
    title: t('Services'),
    html: html`${pageHead(t('Services'), t('End-to-end support from research question to publication.'))}
${cats.length ? cats.map((c, i) => html`<section class="sec ${i % 2 ? 'alt' : ''}" id="${c.slug}"><div class="wrap"><div class="svc-head"><span class="ico">${icon(c.slug)}</span><div><h2>${tr(c, 'title')}</h2></div></div><p class="muted">${tr(c, 'description')}</p>
<div class="grid">${all.filter((s) => s.category === c._id).map((s) => html`<div class="card"><h3>${tr(s, 'title')}</h3>${linebreaks(tr(s, 'description'))}</div>`)}</div></div></section>`) : html`<div class="wrap">${empty()}</div>`}
${ctaBlock(ctx.site)}`,
  };
}
