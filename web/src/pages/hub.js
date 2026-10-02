import { list } from '../data/content.js';
import { t, tr, url } from '../i18n/index.js';
import { CHOICES } from '../schema.js';
import { img } from '../media.js';
import { ctaBlock, empty, pageHead } from '../ui/layout.js';
import { html } from '../util.js';
import { label } from './_common.js';

export default async function hub(ctx) {
  const valid = CHOICES.hubCategory.map(([k]) => k);
  const cat = valid.includes(ctx.query.get('category')) ? ctx.query.get('category') : '';
  let items = await list('hub');
  if (cat) items = items.filter((i) => i.category === cat);
  return {
    title: t('Research Hub'),
    html: html`${pageHead(t('Research Hub'), t('Programs, studies, networks and opportunities, updated continuously.'))}
<section class="sec"><div class="wrap">
<div class="filters"><a class="chip ${!cat ? 'on' : ''}" href="${url('/research-hub/')}">${t('All')}</a>
${CHOICES.hubCategory.map(([k, l]) => html`<a class="chip ${cat === k ? 'on' : ''}" href="?category=${k}">${t(l)}</a>`)}</div>
<div class="grid">${items.length ? items.map((i) => html`<a class="card" href="${url('/research-hub/' + i.slug + '/')}">${i.image ? html`<img src="${img(i.image, 600)}" alt="" loading="lazy">` : ''}<span class="tag">${label('hubCategory', i.category)}</span> <span class="tag tag-s">${label('hubStatus', i.status)}</span><h3>${tr(i, 'title')}</h3><p>${tr(i, 'summary')}</p></a>`) : empty()}</div>
</div></section>${ctaBlock(ctx.site)}`,
  };
}
