import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { isAdmin, state } from '../auth.js';
import { db } from '../firebase.js';
import { fmtDate, t } from '../i18n/index.js';
import { CHOICES } from '../schema.js';
import { html } from '../util.js';
import { toast } from '../ui/toast.js';
import { listAll } from './data.js';

export default async function users({ navigate }) {
  if (!isAdmin()) return { title: t('Staff access'), active: '/admin/users', html: html`<p class="ad-warn">${t('Only administrators can manage staff access.')}</p>` };
  const [admins, reqs] = await Promise.all([listAll('admins'), listAll('adminRequests')]);
  return {
    title: t('Staff access'), active: '/admin/users',
    html: html`<h2 style="color:var(--sx-heading)">${t('Access requests')}</h2><div class="ad-panel">${reqs.length ? html`<table class="ad-t"><tbody>
      ${reqs.map((r) => html`<tr data-uid="${r._id}"><td dir="ltr">${r.email}<br><small>${r.name || ''}</small></td><td class="num">${r.created ? fmtDate(r.created) : ''}</td>
        <td><select class="role ad-input" style="max-width:160px">${CHOICES.role.map(([v, l]) => html`<option value="${v}" ${v === 'contributor' ? 'selected' : ''}>${t(l)}</option>`)}</select></td>
        <td><button class="ad-btn sm" data-approve>${t('Approve')}</button> <button class="ad-btn danger sm" data-reject>${t('Reject')}</button></td></tr>`)}</tbody></table>` : html`<p class="ad-empty">${t('No pending requests.')}</p>`}</div>
      <h2 style="color:var(--sx-heading);margin-top:26px">${t('Staff')}</h2><div class="ad-panel"><table class="ad-t"><tbody>
      ${admins.map((a) => html`<tr data-uid="${a._id}"><td dir="ltr">${a.email || a._id}<br><small>${a.name || ''}</small></td>
        <td><select class="role-set ad-input" style="max-width:160px">${CHOICES.role.map(([v, l]) => html`<option value="${v}" ${v === a.role ? 'selected' : ''}>${t(l)}</option>`)}</select></td>
        <td>${a._id === state.user.uid ? '' : html`<button class="ad-btn danger sm" data-remove>${t('Remove')}</button>`}</td></tr>`)}</tbody></table></div>
      <p class="ad-sub" style="margin-top:14px">${t('A new staff member signs in at /admin once, verifies their email and presses “Request staff access”. Then approve them here.')}</p>`,
    after(root) {
      root.addEventListener('click', async (e) => {
        const row = e.target.closest('tr[data-uid]'); if (!row) return;
        const uid = row.dataset.uid;
        if (e.target.closest('[data-approve]')) {
          const r = reqs.find((x) => x._id === uid);
          await setDoc(doc(db, 'admins', uid), { role: row.querySelector('.role').value, email: r.email, name: r.name || '', created: serverTimestamp() });
          await deleteDoc(doc(db, 'adminRequests', uid)); toast(t('Saved.')); navigate(location.pathname);
        }
        if (e.target.closest('[data-reject]')) { await deleteDoc(doc(db, 'adminRequests', uid)); navigate(location.pathname); }
        if (e.target.closest('[data-remove]')) { await deleteDoc(doc(db, 'admins', uid)); navigate(location.pathname); }
      });
      root.addEventListener('change', async (e) => {
        const s = e.target.closest('.role-set'); if (!s) return;
        await updateDoc(doc(db, 'admins', s.closest('tr').dataset.uid), { role: s.value }); toast(t('Saved.'));
      });
    },
  };
}
