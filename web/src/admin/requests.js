import { isEditor } from '../auth.js';
import { fmtDate, getLang, t } from '../i18n/index.js';
import { CHOICES, choiceLabel } from '../schema.js';
import { html } from '../util.js';
import { toast } from '../ui/toast.js';
import { getOne, listAll, patch, removeContent, syncSeats, notifyStudent } from './data.js';
import { confirmBox, csv, downloadFile, modal } from './ui.js';
import { deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase.js';

const when = (d) => (d ? fmtDate(d, { dateStyle: 'medium', timeStyle: 'short' }) : '');
const byDate = (a, b) => String(b.created).localeCompare(String(a.created));
const statusSelect = (choices, value, cls) => html`<select class="${cls}">${choices.map(([v, l]) => html`<option value="${v}" ${v === value ? 'selected' : ''}>${t(l)}</option>`)}</select>`;

export default async function requests({ mode, navigate }) {
  if (mode === 'inbox') return inbox(navigate);
  if (mode === 'subscribers') return subscribers(navigate);
  return registrations(navigate);
}

async function inbox(navigate) {
  const items = (await listAll('contactRequests')).sort(byDate);
  return {
    title: t('Contact requests'), active: '/admin/inbox',
    html: html`<div class="ad-bar"><span class="sp"></span><button class="ad-btn line sm" id="csv">${t('Export selected requests as CSV')}</button></div>
    <div class="ad-panel">${items.length ? html`<table class="ad-t"><thead><tr><th>${t('Created')}</th><th>${t('Name')}</th><th>${t('Request type')}</th><th>${t('Subject')}</th><th>${t('Status')}</th></tr></thead><tbody>
    ${items.map((r) => html`<tr data-id="${r._id}"><td class="num">${when(r.created)}</td><td><a href="#" data-open="${r._id}">${r.name}</a><br><small dir="ltr">${r.email}</small></td>
      <td>${t(choiceLabel('contactType', r.request_type))}</td><td>${r.subject}</td><td>${statusSelect(CHOICES.contactStatus, r.status, 'st')}</td></tr>`)}</tbody></table>` : html`<p class="ad-empty">—</p>`}</div>`,
    after(root) {
      root.addEventListener('change', async (e) => {
        const s = e.target.closest('select.st'); if (!s) return;
        await patch('contactRequests', s.closest('tr').dataset.id, { status: s.value }); toast(t('Saved.'));
      });
      root.addEventListener('click', (e) => {
        const o = e.target.closest('[data-open]'); if (!o) return;
        e.preventDefault();
        const r = items.find((x) => x._id === o.dataset.open);
        modal(html`<h2>${r.name}</h2><p dir="ltr"><a href="mailto:${r.email}">${r.email}</a></p><p>${r.organization}</p><h3>${r.subject}</h3><div class="ad-pre">${r.message}</div>
          <div class="ad-f" style="margin-top:12px"><label>${t('Internal notes')}</label><textarea id="notes" rows="3" class="ad-input">${r.internal_notes || ''}</textarea></div><button class="ad-btn sm" id="sv">${t('Save')}</button>`,
        (box) => box.querySelector('#sv').addEventListener('click', async () => { await patch('contactRequests', r._id, { internal_notes: box.querySelector('#notes').value }); r.internal_notes = box.querySelector('#notes').value; toast(t('Saved.')); }));
      });
      root.querySelector('#csv')?.addEventListener('click', () => downloadFile('contact-requests.csv', csv([['created', 'type', 'name', 'email', 'organization', 'subject', 'message', 'status', 'notes'],
        ...items.map((r) => [r.created, r.request_type, r.name, r.email, r.organization, r.subject, r.message, r.status, r.internal_notes])])));
    },
  };
}

async function subscribers(navigate) {
  const items = (await listAll('subscribers')).sort(byDate);
  return {
    title: t('Newsletter subscribers'), active: '/admin/subscribers',
    html: html`<div class="ad-bar"><span class="sp"></span><button class="ad-btn line sm" id="csv">${t('Export selected subscribers as CSV')}</button></div>
    <div class="ad-panel">${items.length ? html`<table class="ad-t"><thead><tr><th>${t('Email')}</th><th>${t('Language')}</th><th>${t('Active')}</th><th>${t('Created')}</th><th></th></tr></thead><tbody>
    ${items.map((s) => html`<tr data-id="${s._id}"><td dir="ltr">${s.email}</td><td>${s.language}</td><td><input type="checkbox" class="act" ${s.is_active ? 'checked' : ''}></td><td class="num">${when(s.created)}</td>
      <td>${isEditor() ? html`<button class="ad-btn danger sm" data-del>×</button>` : ''}</td></tr>`)}</tbody></table>` : html`<p class="ad-empty">—</p>`}</div>`,
    after(root) {
      root.addEventListener('change', async (e) => { const c = e.target.closest('.act'); if (c) { await patch('subscribers', c.closest('tr').dataset.id, { is_active: c.checked }); toast(t('Saved.')); } });
      root.addEventListener('click', async (e) => {
        const d = e.target.closest('[data-del]'); if (!d) return;
        if (!(await confirmBox(t('Delete this item? This cannot be undone.')))) return;
        const id = d.closest('tr').dataset.id; const s = items.find((x) => x._id === id);
        await deleteDoc(doc(db, 'subscribers', id));
        const { hash } = await import('../util.js'); try { await deleteDoc(doc(db, 'subscriberEmails', hash(s.email.toLowerCase()))); } catch { /* ignore */ }
        navigate(location.pathname);
      });
      root.querySelector('#csv')?.addEventListener('click', () => downloadFile('subscribers.csv', csv([['email', 'language', 'active', 'created', 'unsubscribe_link'],
        ...items.map((s) => [s.email, s.language, s.is_active, s.created, `${location.origin}/${s.language || 'en'}/newsletter/unsubscribe/${s._id}/`])])));
    },
  };
}

const REG_TO_ENR = { confirmed: 'approved', cancelled: 'cancelled', waitlist: 'waitlist', pending: 'pending' };

async function registrations(navigate) {
  const items = (await listAll('registrations')).sort(byDate);
  const programs = [...new Set(items.map((r) => r.program))];
  return {
    title: t('Training registrations'), active: '/admin/registrations',
    html: html`<div class="ad-bar"><select id="pf" class="ad-input" style="max-width:260px"><option value="">${t('Program')}: ${t('All')}</option>${programs.map((p) => html`<option value="${p}">${items.find((r) => r.program === p).program_title || p}</option>`)}</select>
      <span class="sp"></span><button class="ad-btn line sm" id="csv">${t('Export selected registrations as CSV')}</button></div>
    <div class="ad-panel">${items.length ? html`<table class="ad-t"><thead><tr><th>${t('Created')}</th><th>${t('Name')}</th><th>${t('Program')}</th><th>${t('Organization')}</th><th>${t('Status')}</th><th></th></tr></thead><tbody>
    ${items.map((r) => html`<tr data-id="${r._id}" data-p="${r.program}"><td class="num">${when(r.created)}</td><td>${r.name}<br><small dir="ltr">${r.email}${r.phone ? ' · ' + r.phone : ''}</small></td><td>${r.program_title || r.program}</td><td>${r.organization}</td>
      <td>${statusSelect(CHOICES.regStatus, r.status, 'st')}</td><td>${isEditor() ? html`<button class="ad-btn danger sm" data-del>×</button>` : ''}</td></tr>`)}</tbody></table>` : html`<p class="ad-empty">—</p>`}</div>`,
    after(root) {
      root.querySelector('#pf')?.addEventListener('change', (e) => root.querySelectorAll('tbody tr').forEach((r) => { r.hidden = e.target.value && r.dataset.p !== e.target.value; }));
      root.addEventListener('change', async (e) => {
        const s = e.target.closest('select.st'); if (!s) return;
        const tr_ = s.closest('tr'), r = items.find((x) => x._id === tr_.dataset.id);
        await setRegistrationStatus(r, s.value); toast(t('Saved.'));
      });
      root.addEventListener('click', async (e) => {
        const d = e.target.closest('[data-del]'); if (!d) return;
        if (!(await confirmBox(t('Delete this item? This cannot be undone.')))) return;
        const r = items.find((x) => x._id === d.closest('tr').dataset.id);
        await deleteDoc(doc(db, 'registrations', r._id)); await syncSeats(r.program); navigate(location.pathname);
      });
      root.querySelector('#csv')?.addEventListener('click', () => downloadFile('registrations.csv', csv([['created', 'program', 'name', 'email', 'organization', 'phone', 'status', 'notes'],
        ...items.map((r) => [r.created, r.program_title || r.program, r.name, r.email, r.organization, r.phone, r.status, r.message])])));
    },
  };
}

/** Staff changes a registration status: seats are recounted and a linked student account is updated + notified. */
export async function setRegistrationStatus(r, status) {
  await updateDoc(doc(db, 'registrations', r._id), { status });
  r.status = status;
  await syncSeats(r.program);
  const linked = (await listAll('enrollments')).filter((e) => e.registration === r._id);
  for (const enr of linked) {
    if (enr.status !== 'completed' && enr.status !== REG_TO_ENR[status]) {
      await updateDoc(doc(db, 'enrollments', enr._id), { status: REG_TO_ENR[status] });
      await notifyStudent(enr.uid, (tl) => tl('Your enrollment in %(program)s is now: %(status)s', { program: r.program_title, status: tl(choiceLabel('enrollStatus', REG_TO_ENR[status])) }), `/account/courses/${r.program}/`);
    }
  }
}

export { removeContent };
