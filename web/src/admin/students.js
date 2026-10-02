import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { isEditor } from '../auth.js';
import { saveBlob } from '../data/files.js';
import { db } from '../firebase.js';
import { fmtDate, t } from '../i18n/index.js';
import { CHOICES, choiceLabel } from '../schema.js';
import { html } from '../util.js';
import { toast } from '../ui/toast.js';
import { freeSlug, getOne, listAll, notifyStudent, syncSeats } from './data.js';
import { modal } from './ui.js';

const when = (d) => (d ? fmtDate(d, { dateStyle: 'medium', timeStyle: 'short' }) : '');
const byDate = (a, b) => String(b.created).localeCompare(String(a.created));
const ENR_TO_REG = { pending: 'pending', approved: 'confirmed', completed: 'confirmed', waitlist: 'waitlist', rejected: 'cancelled', cancelled: 'cancelled' };

export default async function students({ mode, navigate }) {
  if (mode === 'students') return studentList();
  if (mode === 'enrollments') return enrollments(navigate);
  return projectRequests(navigate);
}

async function studentList() {
  const items = (await listAll('students')).sort(byDate);
  return {
    title: t('Students'), active: '/admin/students',
    html: html`<div class="ad-panel">${items.length ? html`<table class="ad-t"><thead><tr><th>${t('Full name')}</th><th>${t('Email')}</th><th>${t('University / organization')}</th><th>${t('Language')}</th><th>${t('Created')}</th></tr></thead><tbody>
    ${items.map((s) => html`<tr><td>${s.full_name}</td><td dir="ltr">${s.email}</td><td>${s.university}</td><td>${s.language}</td><td class="num">${when(s.created)}</td></tr>`)}</tbody></table>` : html`<p class="ad-empty">—</p>`}</div>`,
  };
}

/** Change an enrollment: keeps the linked registration + seat counter in step and notifies the student. */
export async function setEnrollment(enr, status, note) {
  await updateDoc(doc(db, 'enrollments', enr._id), { status, note: note ?? enr.note ?? '', updated: serverTimestamp() });
  if (enr.registration) {
    try { await updateDoc(doc(db, 'registrations', enr.registration), { status: ENR_TO_REG[status] }); } catch { /* registration may be gone */ }
    await syncSeats(enr.program);
  }
  if (status !== enr.status || (note && note !== enr.note)) {
    await notifyStudent(enr.uid, (tl) => `${tl('Your enrollment in %(program)s is now: %(status)s', { program: enr.program_title, status: tl(choiceLabel('enrollStatus', status)) })}${note ? ' — ' + note : ''}`, `/account/courses/${enr.program}/`);
  }
}

async function enrollments(navigate) {
  const [items, studs] = await Promise.all([listAll('enrollments'), listAll('students')]);
  items.sort(byDate);
  const name = (uid) => studs.find((s) => s._id === uid)?.full_name || uid;
  return {
    title: t('Course enrollments'), active: '/admin/enrollments',
    html: html`<div class="ad-panel">${items.length ? html`<table class="ad-t"><thead><tr><th>${t('Created')}</th><th>${t('Students')}</th><th>${t('Program')}</th><th>${t('Status')}</th><th></th></tr></thead><tbody>
    ${items.map((e) => html`<tr data-id="${e._id}"><td class="num">${when(e.created)}</td><td>${name(e.uid)}</td><td>${e.program_title}</td><td><span class="ad-badge ${e.status}">${t(choiceLabel('enrollStatus', e.status))}</span></td>
      <td><button class="ad-btn sm" data-set="approved">${t('Approve')}</button> <button class="ad-btn line sm" data-set="rejected">${t('Reject')}</button> <button class="ad-btn line sm" data-set="completed">${t('Completed')}</button> <button class="ad-btn line sm" data-note>${t('Message to the student')}</button></td></tr>`)}</tbody></table>` : html`<p class="ad-empty">—</p>`}</div>`,
    after(root) {
      root.addEventListener('click', async (ev) => {
        const row = ev.target.closest('tr[data-id]'); if (!row) return;
        const enr = items.find((x) => x._id === row.dataset.id);
        const set = ev.target.closest('[data-set]');
        if (set) { await setEnrollment(enr, set.dataset.set); toast(t('Saved.')); navigate(location.pathname); return; }
        if (ev.target.closest('[data-note]')) {
          modal(html`<h2>${t('Message to the student')}</h2><textarea id="n" class="ad-input" rows="4">${enr.note || ''}</textarea><p><button class="ad-btn" id="s">${t('Save')}</button></p>`,
            (box, close) => box.querySelector('#s').addEventListener('click', async () => { await setEnrollment(enr, enr.status, box.querySelector('#n').value.trim()); close(); toast(t('Saved.')); navigate(location.pathname); }));
        }
      });
    },
  };
}

export async function setProjectRequest(req, status, note) {
  await updateDoc(doc(db, 'projectRequests', req._id), { status, review_note: note ?? req.review_note ?? '', updated: serverTimestamp() });
  if (status !== req.status || (note && note !== req.review_note)) {
    await notifyStudent(req.uid, (tl) => `${tl('Your project request "%(title)s" is now: %(status)s', { title: req.title, status: tl(choiceLabel('requestStatus', status)) })}${note ? ' — ' + note : ''}`, `/account/projects/${req._id}/`);
  }
}

async function projectRequests(navigate) {
  const [items, studs] = await Promise.all([listAll('projectRequests'), listAll('students')]);
  items.sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
  const name = (uid) => studs.find((s) => s._id === uid)?.full_name || uid;
  return {
    title: t('Student project requests'), active: '/admin/project-requests',
    html: html`<div class="ad-panel">${items.length ? html`<table class="ad-t"><thead><tr><th>${t('Updated')}</th><th>${t('Title')}</th><th>${t('Students')}</th><th>${t('Status')}</th><th></th></tr></thead><tbody>
    ${items.map((r) => html`<tr data-id="${r._id}"><td class="num">${when(r.updated)}</td><td><a href="#" data-open>${r.title}</a></td><td>${name(r.uid)}</td><td><span class="ad-badge ${r.status}">${t(choiceLabel('requestStatus', r.status))}</span></td><td></td></tr>`)}</tbody></table>` : html`<p class="ad-empty">—</p>`}</div>`,
    after(root) {
      root.addEventListener('click', (ev) => {
        const o = ev.target.closest('[data-open]'); if (!o) return;
        ev.preventDefault();
        const r = items.find((x) => x._id === o.closest('tr').dataset.id);
        modal(html`<h2>${r.title}</h2><p><span class="ad-badge ${r.status}">${t(choiceLabel('requestStatus', r.status))}</span> ${name(r.uid)}</p>
          <div class="ad-pre">${r.summary}</div>${r.supervisor ? html`<p><strong>${t('Preferred supervisor')}:</strong> ${r.supervisor}</p>` : ''}
          ${r.attachment ? html`<p><button class="ad-btn line sm" id="att">📎 ${r.attachment_name || t('Attachment')}</button></p>` : ''}
          <div class="ad-f"><label>${t('Message to the student')}</label><textarea id="note" class="ad-input" rows="3">${r.review_note || ''}</textarea></div>
          <p>${[['in_review', 'Start review (selected)'], ['approved', 'Approve'], ['running', 'Running'], ['completed', 'Completed'], ['rejected', 'Reject']].map(([s, l]) => html`<button class="ad-btn ${s === 'approved' ? '' : 'line'} sm" data-s="${s}">${t(l)}</button> `)}
          ${!r.project && r.status !== 'draft' && r.status !== 'rejected' ? html`<button class="ad-btn line sm" id="mk">${t('Create a draft public project from selected')}</button>` : ''}</p>`,
        (box, close) => {
          box.querySelector('#att')?.addEventListener('click', () => saveBlob(r.attachment));
          box.addEventListener('click', async (e) => {
            const b = e.target.closest('[data-s]');
            if (b) { await setProjectRequest(r, b.dataset.s, box.querySelector('#note').value.trim()); close(); toast(t('Saved.')); navigate(location.pathname); }
            if (e.target.closest('#mk')) {
              const slug = await freeSlug('projects', r.title);
              await setDoc(doc(db, 'projects', slug), { slug, title_en: r.title, title_ar: '', problem_en: r.summary, problem_ar: '', role_en: '', role_ar: '', methodology_en: '', methodology_ar: '', outcome_en: '', outcome_ar: '',
                research_area: r.research_area || '', status: 'planned', institutions: [], image: '', featured: false, is_published: false, publish_at: null, unpublish_at: null, order: 0, meta_title_en: '', meta_title_ar: '', meta_description_en: '', meta_description_ar: '', created: serverTimestamp(), updated: serverTimestamp() });
              await updateDoc(doc(db, 'projectRequests', r._id), { project: slug });
              close(); toast(t('%(n)s draft project(s) created. Review and publish them under Projects.', { n: 1 })); navigate(location.pathname);
            }
          });
        });
      });
    },
  };
}

export { isEditor, getOne, deleteDoc };
