import { list } from '../data/content.js';
import { t, tr } from '../i18n/index.js';
import { CHOICES } from '../schema.js';
import { img } from '../media.js';
import { ctaBlock, empty, pageHead } from '../ui/layout.js';
import { html, linebreaks, raw } from '../util.js';

export default async function collaborations(ctx) {
  const items = await list('collaborations');
  const groups = CHOICES.collabType.map(([k, l]) => [t(l), items.filter((c) => c.collaboration_type === k)]).filter(([, a]) => a.length);
  const points = items.filter((c) => c.latitude != null && c.longitude != null).map((c) => ({
    lat: c.latitude, lng: c.longitude, name: tr(c, 'organization_name'), country: tr(c, 'country'),
    type: t(CHOICES.collabType.find(([k]) => k === c.collaboration_type)?.[1] || ''), link: c.link || '' }));
  return {
    title: t('Collaborations'),
    html: html`${pageHead(t('Collaborations'), t('Academic, hospital, research-center and international partners.'))}
${points.length ? html`<section class="sec mapsec"><div class="wrap"><div id="collab-map" class="map" role="img" aria-label="${t('Map of our collaborations')}"></div></div></section>
<script type="application/json" id="map-points">${raw(JSON.stringify(points).replace(/</g, '\\u003c'))}</script>` : ''}
${groups.length ? groups.map(([lbl, arr], i) => html`<section class="sec ${i % 2 ? 'alt' : ''}"><div class="wrap"><h2>${lbl}</h2><div class="grid">
${arr.map((c) => html`<div class="card">${c.logo ? html`<img class="logo" src="${img(c.logo, 300)}" alt="${tr(c, 'organization_name')}" loading="lazy">` : ''}<h3>${c.link ? html`<a href="${c.link}" rel="noopener">${tr(c, 'organization_name')}</a>` : tr(c, 'organization_name')}</h3><p class="muted">${tr(c, 'country')}</p>${linebreaks(tr(c, 'description'))}</div>`)}
</div></div></section>`) : html`<div class="wrap sec">${empty()}</div>`}
${ctaBlock(ctx.site)}`,
  };
}
