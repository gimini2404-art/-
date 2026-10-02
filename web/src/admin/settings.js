import { isEditor } from '../auth.js';
import { settings as publicSettings } from '../data/content.js';
import { t } from '../i18n/index.js';
import { SETTINGS_FIELDS } from '../schema.js';
import { html } from '../util.js';
import { toast } from '../ui/toast.js';
import { getOne, historyOf, restoreVersion, saveSettings } from './data.js';
import { collect, renderField, showFieldErrors, wire } from './fields.js';
import { confirmBox, modal } from './ui.js';
import { fmtDate } from '../i18n/index.js';

export default async function settingsView({ navigate }) {
  if (!isEditor()) return { title: t('Site settings'), html: html`<p class="ad-warn">${t('Only editors and administrators can change the site settings.')}</p>`, active: '/admin/settings' };
  const data = (await getOne('settings', 'main')) || {};
  const ctx = { refs: {}, settings: await publicSettings() };
  return {
    title: t('Site settings'), active: '/admin/settings',
    html: html`<div class="ad-bar"><button class="ad-btn line sm" id="hist">${t('History')}</button></div><form class="ad-form" id="ed" novalidate>
      <div class="ad-tabs"><button type="button" class="on" data-lang="en">English</button><button type="button" data-lang="ar">العربية</button></div>
      ${SETTINGS_FIELDS.map((f) => renderField(f, data, ctx))}
      <div class="ad-bar"><button class="ad-btn" type="submit">${t('Save')}</button></div></form>`,
    after(root) {
      const form = root.querySelector('#ed');
      wire(form, ctx);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const { data: values, errors } = collect(form, SETTINGS_FIELDS);
        showFieldErrors(form, errors);
        if (Object.keys(errors).length) return;
        await saveSettings({ ...data, ...values, _id: undefined });
        toast(t('Saved.'));
        navigate('/admin/settings');
      });
      root.querySelector('#hist').addEventListener('click', async () => {
        const versions = await historyOf('settings', 'main');
        modal(html`<h2>${t('History')}</h2>${versions.length ? html`<table class="ad-t"><tbody>${versions.map((v) => html`<tr><td class="num">${v.at ? fmtDate(v.at, { dateStyle: 'medium', timeStyle: 'short' }) : ''}</td><td>${v.by}</td><td><button class="ad-btn line sm" data-restore="${v._id}">${t('Restore')}</button></td></tr>`)}</tbody></table>` : html`<p class="ad-empty">—</p>`}`,
          (box, close) => box.addEventListener('click', async (e) => {
            const b = e.target.closest('[data-restore]'); if (!b) return;
            if (!(await confirmBox(t('Restore this version?')))) return;
            await restoreVersion(versions.find((x) => x._id === b.dataset.restore)); close(); toast(t('Restored.')); navigate('/admin/settings');
          }));
      });
    },
  };
}
