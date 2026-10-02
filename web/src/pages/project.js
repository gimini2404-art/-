import { getItem, list, snapshot } from '../data/content.js';
import { t, tr, url } from '../i18n/index.js';
import { img } from '../media.js';
import { pageHead } from '../ui/layout.js';
import { html, linebreaks, truncateChars } from '../util.js';
import { label, pubItem, visibleItem } from './_common.js';

export default async function project(ctx) {
  const { item, draft } = await visibleItem(ctx, 'projects', ctx.params.slug);
  if (!item) return null;
  const [area, orgs, pubs] = await Promise.all([
    item.research_area ? getItem('areas', item.research_area, { staff: ctx.staff }) : null, snapshot('organizations'), list('publications')]);
  const insts = (item.institutions || []).map((id) => orgs.find((o) => o._id === id)).filter(Boolean);
  const related = pubs.filter((p) => p.related_project === item._id);
  const desc = truncateChars(tr(item, 'meta_description') || tr(item, 'problem'), 160);
  const sec = (h, text) => (text ? html`<h2>${t(h)}</h2>${linebreaks(text)}` : '');
  return {
    title: tr(item, 'meta_title') || tr(item, 'title'), description: desc, draft,
    html: html`${pageHead(tr(item, 'title'))}
<section class="sec"><div class="wrap narrow">
<p><span class="tag">${label('projectStatus', item.status)}</span>${area ? html` <a href="${url('/research-areas/' + area.slug + '/')}">${tr(area, 'title')}</a>` : ''}</p>
${item.image ? html`<img class="hero-img" src="${img(item.image, 1000)}" alt="">` : ''}
${sec('Research question / problem', tr(item, 'problem'))}${sec('SiaNexis role', tr(item, 'role'))}${sec('Methodology', tr(item, 'methodology'))}${sec('Outcome / status', tr(item, 'outcome'))}
${insts.length ? html`<h2>${t('Collaborating institutions')}</h2><ul>${insts.map((o) => html`<li>${o.website ? html`<a href="${o.website}" rel="noopener">${tr(o, 'name')}</a>` : tr(o, 'name')}${tr(o, 'country') ? ', ' + tr(o, 'country') : ''}</li>`)}</ul>` : ''}
${related.length ? html`<h2>${t('Publications & outputs')}</h2><ul class="publist">${related.map((p) => pubItem(p))}</ul>` : ''}
<p><a class="back" href="${url('/projects/')}">${t('All projects')}</a></p></div></section>`,
  };
}
