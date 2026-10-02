import { list } from '../data/content.js';
import { t, tr, url } from '../i18n/index.js';
import { img } from '../media.js';
import { ctaBlock, empty, pageHead } from '../ui/layout.js';
import { html, truncateWords } from '../util.js';
import { label } from './_common.js';

export default async function projects(ctx) {
  const area = ctx.query.get('area') || '';
  const [all, areas] = await Promise.all([list('projects'), list('areas')]);
  const byId = Object.fromEntries(areas.map((a) => [a._id, a]));
  const items = area ? all.filter((p) => byId[p.research_area]?.slug === area) : all;
  return {
    title: t('Projects & Case Studies'),
    html: html`${pageHead(t('Projects & Case Studies'))}
<section class="sec"><div class="wrap">
<div class="filters"><a class="chip ${!area ? 'on' : ''}" href="${url('/projects/')}">${t('All')}</a>${areas.map((a) => html`<a class="chip ${area === a.slug ? 'on' : ''}" href="?area=${a.slug}">${tr(a, 'title')}</a>`)}</div>
<div class="grid">${items.length ? items.map((p) => html`<a class="card" href="${url('/projects/' + p.slug + '/')}">${p.image ? html`<img src="${img(p.image, 600)}" alt="" loading="lazy">` : ''}<span class="tag">${label('projectStatus', p.status)}</span>${byId[p.research_area] ? html` <span class="tag tag-s">${tr(byId[p.research_area], 'title')}</span>` : ''}<h3>${tr(p, 'title')}</h3><p>${truncateWords(tr(p, 'problem'), 28)}</p></a>`) : empty()}</div>
</div></section>${ctaBlock(ctx.site)}`,
  };
}
