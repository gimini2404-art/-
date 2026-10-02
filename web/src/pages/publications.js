import { list } from '../data/content.js';
import { t, tr, url } from '../i18n/index.js';
import { CHOICES } from '../schema.js';
import { empty, pageHead } from '../ui/layout.js';
import { html } from '../util.js';
import { PLURAL, pubItem } from './_common.js';

export default async function publications(ctx) {
  const [all, projects] = await Promise.all([list('publications'), list('projects')]);
  const kinds = CHOICES.pubKind.map(([k]) => k);
  let kind = ctx.query.get('type') || '', year = ctx.query.get('year') || '', project = ctx.query.get('project') || '';
  if (!kinds.includes(kind)) kind = '';
  if (!/^\d+$/.test(year)) year = '';
  const years = [...new Set(all.map((p) => p.year).filter(Boolean))].sort((a, b) => b - a);
  if (project && !projects.some((p) => p._id === project)) project = '';
  let items = all;
  if (kind) items = items.filter((p) => p.kind === kind);
  if (year) items = items.filter((p) => String(p.year) === year);
  if (project) items = items.filter((p) => p.related_project === project);
  const byProject = Object.fromEntries(projects.map((p) => [p._id, p]));
  const usedProjects = projects.filter((p) => all.some((x) => x.related_project === p._id));
  const groups = CHOICES.pubKind.map(([k]) => [t(PLURAL.pub[k]), items.filter((p) => p.kind === k)]).filter(([, a]) => a.length);
  return {
    title: t('Publications'),
    html: html`${pageHead(t('Publications'))}
<section class="sec"><div class="wrap narrow">
<form class="pubfilters" method="get">
<select name="type" aria-label="${t('Type')}"><option value="">${t('All types')}</option>${CHOICES.pubKind.map(([k, l]) => html`<option value="${k}" ${kind === k ? 'selected' : ''}>${t(l)}</option>`)}</select>
<select name="year" aria-label="${t('Year')}"><option value="">${t('All years')}</option>${years.map((y) => html`<option value="${y}" ${year === String(y) ? 'selected' : ''}>${y}</option>`)}</select>
<select name="project" aria-label="${t('Project')}"><option value="">${t('All projects')}</option>${usedProjects.map((p) => html`<option value="${p._id}" ${project === p._id ? 'selected' : ''}>${tr(p, 'title')}</option>`)}</select>
<button class="btn btn-sm" type="submit">${t('Filter')}</button>${kind || year || project ? html`<a href="${url('/publications/')}">${t('Clear')}</a>` : ''}</form>
${groups.length ? groups.map(([lbl, arr]) => html`<h2>${lbl}</h2><ul class="publist">${arr.map((p) => pubItem(p, { projects: byProject, hideProject: !!project }))}</ul>`) : empty()}
</div></section>`,
  };
}
