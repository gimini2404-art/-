import { getItem, isLive } from '../data/content.js';
import { t, tr, url } from '../i18n/index.js';
import { img } from '../media.js';
import { pageHead } from '../ui/layout.js';
import { html, linebreaks } from '../util.js';
import { label, seo, visibleItem } from './_common.js';

export default async function hubItem(ctx) {
  const { item, draft } = await visibleItem(ctx, 'hub', ctx.params.slug);
  if (!item) return null;
  const [area, project] = await Promise.all([
    item.research_area ? getItem('areas', item.research_area, { staff: ctx.staff }) : null,
    item.related_project ? getItem('projects', item.related_project, { staff: ctx.staff }) : null]);
  const s = seo(item, tr(item, 'summary'));
  return {
    title: s.title, description: s.description, draft,
    html: html`${pageHead(tr(item, 'title'), tr(item, 'summary'))}
<section class="sec"><div class="wrap narrow"><p><span class="tag">${label('hubCategory', item.category)}</span> <span class="tag tag-s">${label('hubStatus', item.status)}</span>${area ? html` <a href="${url('/research-areas/' + area.slug + '/')}">${tr(area, 'title')}</a>` : ''}</p>
${item.image ? html`<img class="hero-img" src="${img(item.image, 1000)}" alt="">` : ''}
${linebreaks(tr(item, 'description'))}
${project ? html`<p><a href="${url('/projects/' + project.slug + '/')}">${t('Related project')}: ${tr(project, 'title')}</a></p>` : ''}
${item.link ? html`<p><a class="btn" href="${item.link}" rel="noopener">${t('Learn more')}</a></p>` : ''}
<p><a href="${url('/contact/')}?type=collaboration&subject=${encodeURIComponent(tr(item, 'title'))}">${t('Get involved')}</a> · <a class="back" href="${url('/research-hub/')}">${t('Back to Research Hub')}</a></p></div></section>`,
  };
}
