import { pageHead } from '../ui/layout.js';
import { tr } from '../i18n/index.js';
import { html, linebreaks } from '../util.js';
import { seo, visibleItem } from './_common.js';

export default async function page(ctx) {
  const { item, draft } = await visibleItem(ctx, 'pages', ctx.params.slug);
  if (!item) return null;
  const s = seo(item, tr(item, 'summary'));
  return { title: s.title, description: s.description, draft, html: html`${pageHead(tr(item, 'title'), tr(item, 'summary'))}<section class="sec"><div class="wrap narrow">${linebreaks(tr(item, 'body'))}</div></section>` };
}
