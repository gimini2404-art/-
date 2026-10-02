import { state, isEditor } from '../auth.js';
import { t } from '../i18n/index.js';
import { html } from '../util.js';
import { countWhere } from './data.js';

export default async function dashboard() {
  const [newContact, pendingReg, waitReg, pendingEnr, projReq, subs] = await Promise.all([
    countWhere('contactRequests', 'status', 'new'), countWhere('registrations', 'status', 'pending'), countWhere('registrations', 'status', 'waitlist'),
    countWhere('enrollments', 'status', 'pending'), countWhere('projectRequests', 'status', 'submitted'), countWhere('subscribers', 'is_active', true)]);
  const attention = [
    [t('New contact requests'), newContact, '/admin/inbox', true], [t('Pending training registrations'), pendingReg, '/admin/registrations', true],
    [t('Waiting-list registrations'), waitReg, '/admin/registrations', true], [t('Enrollments waiting for approval'), pendingEnr, '/admin/enrollments', true],
    [t('Student project requests to review'), projReq, '/admin/project-requests', true], [t('Active newsletter subscribers'), subs, '/admin/subscribers', false]];
  const tasks = [
    ['📄', t('Add a research paper'), t('Upload the PDF and publish in one click'), '/admin/import-pdf'],
    ['📰', t('Write a news post'), t('Announcements and updates'), '/admin/c/posts/new'],
    ['🔬', t('Add a project'), t('A study or case study'), '/admin/c/projects/new'],
    ['🎓', t('Add a training workshop'), t('Courses and events with registration'), '/admin/c/training/new'],
    ['👤', t('Add a team member'), t('Photo, role and profile'), '/admin/c/team/new'],
    ['🤝', t('Post an opportunity'), t('Calls for collaborators or students'), '/admin/c/opportunities/new'],
    ['🏠', t('Edit the home page texts'), t('Titles, contact details, announcement bar'), '/admin/settings'],
    ['💾', t('Backup & import'), t('Download all content or import data'), '/admin/data']];
  return {
    title: t('Manage website content'), active: '/admin/',
    html: html`<h2 style="color:var(--sx-heading)">${t('Needs attention')}</h2>
      <div class="ad-cards">${attention.map(([l, n, h, urgent]) => html`<a class="ad-card ${urgent && n ? 'urgent' : ''}" href="${h}"><b>${n}</b><small>${l}</small></a>`)}</div>
      <h2 style="color:var(--sx-heading)">${t('Quick add')}</h2>
      <div class="ad-cards">${tasks.map(([i, l, d, h]) => html`<a class="ad-card" href="${h}"><span class="ico">${i}</span><strong>${l}</strong><small>${d}</small></a>`)}</div>
      ${isEditor() ? '' : html`<p class="ad-sub">${t('Contributor accounts can add and edit content but cannot delete it or change site settings.')}</p>`}`,
  };
}
