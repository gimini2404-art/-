import { list } from '../data/content.js';
import { t, tr, url } from '../i18n/index.js';
import { ctaBlock, pageHead } from '../ui/layout.js';
import { html, linebreaks, truncateWords } from '../util.js';
import { label, seo, visibleItem } from './_common.js';

export default async function area(ctx) {
  const { item, draft } = await visibleItem(ctx, 'areas', ctx.params.slug);
  if (!item) return null;
  const [projects, hub] = await Promise.all([list('projects'), list('hub')]);
  const ps = projects.filter((p) => p.research_area === item._id || p.research_area === item.slug);
  const hs = hub.filter((h) => h.research_area === item._id || h.research_area === item.slug);
  const s = seo(item, tr(item, 'summary'));
  return {
    title: s.title, description: s.description, draft,
    html: html`${pageHead(tr(item, 'title'), tr(item, 'summary'))}
<section class="sec"><div class="wrap narrow">${linebreaks(tr(item, 'description'))}</div></section>
${ps.length ? html`<section class="sec alt"><div class="wrap"><h2>${t('Projects')}</h2><div class="grid">${ps.map((p) => html`<a class="card" href="${url('/projects/' + p.slug + '/')}"><span class="tag">${label('projectStatus', p.status)}</span><h3>${tr(p, 'title')}</h3><p>${truncateWords(tr(p, 'problem'), 25)}</p></a>`)}</div></div></section>` : ''}
${hs.length ? html`<section class="sec"><div class="wrap"><h2>${t('In the Research Hub')}</h2><div class="grid">${hs.map((i) => html`<a class="card" href="${url('/research-hub/' + i.slug + '/')}"><span class="tag">${label('hubCategory', i.category)}</span><h3>${tr(i, 'title')}</h3><p>${tr(i, 'summary')}</p></a>`)}</div></div></section>` : ''}
${ctaBlock(ctx.site)}`,
  };
}
