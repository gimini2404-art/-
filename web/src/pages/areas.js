import { list } from '../data/content.js';
import { t, tr, url } from '../i18n/index.js';
import { icon } from '../ui/icons.js';
import { ctaBlock, empty, pageHead } from '../ui/layout.js';
import { html } from '../util.js';

export default async function areas(ctx) {
  const items = await list('areas');
  return {
    title: t('Research Areas'),
    html: html`${pageHead(t('Research Areas'), t('Clinical and computational fields where we design, analyse and coordinate research.'))}
<section class="sec"><div class="wrap"><div class="grid grid-4">
${items.length ? items.map((a) => html`<a class="card area" href="${url('/research-areas/' + a.slug + '/')}"><span class="ico">${icon(a.slug)}</span><h3>${tr(a, 'title')}</h3><p>${tr(a, 'summary')}</p></a>`) : empty()}
</div></div></section>${ctaBlock(ctx.site)}`,
  };
}
