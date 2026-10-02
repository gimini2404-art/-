import { list } from '../data/content.js';
import { t, tr, url, fmtDate } from '../i18n/index.js';
import { img } from '../media.js';
import { ctaBlock, empty, pageHead } from '../ui/layout.js';
import { html } from '../util.js';

export default async function posts(ctx) {
  const items = await list('posts');
  return {
    title: t('News'),
    html: html`${pageHead(t('News'), t('Announcements, research updates and stories from SiaNexis.'))}
<section class="sec"><div class="wrap"><div class="grid">
${items.length ? items.map((p) => html`<a class="card" href="${url('/news/' + p.slug + '/')}">${p.image ? html`<img src="${img(p.image, 600)}" alt="" loading="lazy">` : ''}<span class="tag tag-s">${fmtDate(p.published_at)}</span><h3>${tr(p, 'title')}</h3><p>${tr(p, 'summary')}</p><span class="more arrow">${t('Read more')}</span></a>`) : empty()}
</div></div></section>${ctaBlock(ctx.site)}`,
  };
}
