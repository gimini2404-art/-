import { list, isLive } from '../data/content.js';
import { t, tr, url } from '../i18n/index.js';
import { pageHead } from '../ui/layout.js';
import { html, linebreaks } from '../util.js';
import { avatarOrPhoto, label, pubItem, visibleItem } from './_common.js';

export default async function team(ctx) {
  const { item, draft } = await visibleItem(ctx, 'team', ctx.params.slug);
  if (!item) return null;
  const all = await list('publications');
  const pubs = (item.publications || []).map((id) => all.find((p) => p._id === id)).filter(Boolean);
  const orcidUrl = item.orcid ? `https://orcid.org/${item.orcid}` : '';
  return {
    title: tr(item, 'name'), draft,
    html: html`${pageHead(tr(item, 'name'), tr(item, 'role'))}
<section class="sec"><div class="wrap narrow profile">
  <div class="profile-head">${avatarOrPhoto(item)}
    <div><p class="muted">${label('teamGroup', item.group)}${tr(item, 'affiliation') ? ' · ' + tr(item, 'affiliation') : ''}</p>
      <p class="links">${item.orcid ? html`<a class="chip" href="${orcidUrl}" rel="noopener" target="_blank" dir="ltr">ORCID ${item.orcid}</a>` : ''}
      ${item.google_scholar_url ? html`<a class="chip" href="${item.google_scholar_url}" rel="noopener" target="_blank">Google Scholar</a>` : ''}
      ${item.profile_url ? html`<a class="chip" href="${item.profile_url}" rel="noopener" target="_blank">${t('Profile')}</a>` : ''}</p></div></div>
  ${tr(item, 'bio') ? html`<h2>${t('Biography')}</h2>${linebreaks(tr(item, 'bio'))}` : ''}
  ${pubs.length ? html`<h2>${t('Selected publications')}</h2><ul class="publist">${pubs.map((p) => pubItem(p))}</ul>` : ''}
  <p><a class="back" href="${url('/about/')}">${t('Back to the team')}</a></p></div></section>`,
  };
}
