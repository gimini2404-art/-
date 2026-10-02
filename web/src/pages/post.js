import { list } from '../data/content.js';
import { t, tr, url, fmtDate } from '../i18n/index.js';
import { img } from '../media.js';
import { pageHead } from '../ui/layout.js';
import { html, linebreaks } from '../util.js';
import { seo, visibleItem } from './_common.js';

export default async function post(ctx) {
  const { item, draft } = await visibleItem(ctx, 'posts', ctx.params.slug);
  if (!item) return null;
  const latest = (await list('posts')).filter((p) => p._id !== item._id).slice(0, 3);
  const s = seo(item, tr(item, 'summary'));
  return {
    title: s.title, description: s.description, draft,
    html: html`${pageHead(tr(item, 'title'), tr(item, 'summary'))}
<section class="sec"><div class="wrap narrow"><p class="muted">${fmtDate(item.published_at)}${item.author_name ? ' · ' + item.author_name : ''}</p>
${item.image ? html`<img class="hero-img" src="${img(item.image, 1000)}" alt="">` : ''}
${linebreaks(tr(item, 'body'))}
<p><a class="back" href="${url('/news/')}">${t('All news')}</a></p></div></section>
${latest.length ? html`<section class="sec alt"><div class="wrap"><h2>${t('More news')}</h2><div class="grid">${latest.map((p) => html`<a class="card" href="${url('/news/' + p.slug + '/')}"><span class="tag tag-s">${fmtDate(p.published_at)}</span><h3>${tr(p, 'title')}</h3><p>${tr(p, 'summary')}</p></a>`)}</div></div></section>` : ''}`,
  };
}
