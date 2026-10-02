import { fmtDate, t, tn, tr, url } from '../i18n/index.js';
import { CHOICES, choiceLabel } from '../schema.js';
import { esc, html, raw, truncateWords } from '../util.js';
import { getItem, isLive, stateOf } from '../data/content.js';
import { img } from '../media.js';
import { listApa, listBibtex } from '../article/cite.js';
import { empty, pageHead } from '../ui/layout.js';

export { empty, pageHead, tn };

export const label = (name, value) => t(choiceLabel(name, value));
export const labelOf = (name) => Object.fromEntries(CHOICES[name].map(([v, l]) => [v, t(l)]));

export const PLURAL = {
  pub: { paper: 'Published papers', manuscript: 'Ongoing manuscripts', output: 'Research outputs' },
  training: { program: 'Research training programs', workshop: 'Workshops', course: 'Research courses', institutional: 'Institutional training', mentorship: 'Research mentorship' },
  opp: { research: 'Research opportunities', open_project: 'Open projects', collaborators: 'Calls for collaborators', sites: 'Calls for research sites',
    volunteer: 'Volunteer / expert opportunities', student: 'Student / researcher opportunities' },
};

export const dateLong = (d) => fmtDate(d);

/** Detail page lookup: editors can open drafts / scheduled items (preview banner), everyone else only live ones. */
export async function visibleItem(ctx, col, id) {
  const item = await getItem(col, id, { staff: ctx.staff });
  if (!item) return { item: null, draft: null };
  return { item, draft: isLive(item) ? null : stateOf(item) };
}

export const imgTag = (src, w, attrs = '') => (src ? raw(`<img src="${esc(img(src, w))}" ${attrs}>`) : '');

export function avatarOrPhoto(m) {
  return m.photo ? html`<img src="${img(m.photo, 400)}" alt="${tr(m, 'name')}" loading="lazy">` : html`<div class="avatar">${[...tr(m, 'name')][0] || ''}</div>`;
}

export const personCard = (m) => html`<div class="card person">${avatarOrPhoto(m)}
<h3>${m.slug ? html`<a href="${url('/team/' + m.slug + '/')}">${tr(m, 'name')}</a>` : m.profile_url ? html`<a href="${m.profile_url}" rel="noopener">${tr(m, 'name')}</a>` : tr(m, 'name')}</h3>
<p class="muted">${tr(m, 'role')}${tr(m, 'affiliation') ? html`<br>${tr(m, 'affiliation')}` : ''}</p>${truncateWords(tr(m, 'bio'), 22)}</div>`;

export function pubItem(p, { projects = {}, hideProject = false, hasArticle = false } = {}) {
  const art = hasArticle || p.has_article;
  const proj = p.related_project && projects[p.related_project];
  return html`<li class="pub"><strong dir="auto">${art ? html`<a href="${url('/publications/' + p.slug + '/')}">${tr(p, 'title')}</a>` : tr(p, 'title')}</strong><br><span dir="auto">${p.authors}</span>${p.journal ? html`. <em dir="auto">${p.journal}</em>` : ''}${p.year ? ` (${p.year})` : ''}<br>
${p.doi ? html`<a href="https://doi.org/${p.doi}" rel="noopener" dir="ltr">DOI: ${p.doi}</a> ` : ''}${p.external_link ? html`<a href="${p.external_link}" rel="noopener">${t('Link')}</a> ` : ''}${p.pdf ? html`<a href="${p.pdf}" rel="noopener">PDF</a> ` : ''}${art ? html`<a href="${url('/publications/' + p.slug + '/')}">${t('Read article')}</a>` : ''}
<span class="cite" dir="ltr"><button type="button" class="cite-btn" data-copy="${listApa(p)}">${t('Copy citation')}</button><button type="button" class="cite-btn" data-copy="${listBibtex(p)}">BibTeX</button></span>
${proj && !hideProject ? html` · <a href="${url('/projects/' + (proj.slug || proj._id) + '/')}">${tr(proj, 'title')}</a>` : ''}</li>`;
}

export const seo = (item, fallbackDesc = '') => ({
  title: tr(item, 'meta_title') || tr(item, 'title'),
  description: tr(item, 'meta_description') || fallbackDesc,
});
