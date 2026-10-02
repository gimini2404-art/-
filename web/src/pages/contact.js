import { submitContact } from '../data/forms.js';
import { t, url } from '../i18n/index.js';
import { CHOICES } from '../schema.js';
import { field, formValues, honeypot, showErrors, spamCheck, validate, busy } from '../ui/forms.js';
import { pageHead } from '../ui/layout.js';
import { html } from '../util.js';

const FIELDS = [
  { name: 'request_type', label: 'Request type', type: 'select', choices: CHOICES.contactType, required: true },
  { name: 'name', label: 'Name', required: true, maxlength: 120 }, { name: 'email', label: 'Email', type: 'email', required: true, dir: 'ltr' },
  { name: 'organization', label: 'Organization', maxlength: 200 }, { name: 'subject', label: 'Subject', maxlength: 200 },
  { name: 'message', label: 'Message', type: 'textarea', rows: 6, required: true },
];

export default async function contact(ctx) {
  const type = CHOICES.contactType.some(([k]) => k === ctx.query.get('type')) ? ctx.query.get('type') : 'research_project';
  const started = Date.now();
  return {
    title: t('Contact / Start a Project'),
    html: html`${pageHead(t('Contact / Start a Project'), t('Tell us what you need and we will get back to you.'))}
<section class="sec"><div class="wrap narrow"><form id="contact-form" class="form" novalidate>${honeypot()}
${FIELDS.map((f) => field(f, f.name === 'request_type' ? type : f.name === 'subject' ? (ctx.query.get('subject') || '') : ''))}
<button class="btn" type="submit">${t('Send request')}</button></form></div></section>`,
    after(root) {
      const form = root.querySelector('#contact-form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = formValues(form);
        const errors = validate(v, FIELDS);
        const spam = spamCheck(form, started);
        if (spam) errors._ = spam;
        showErrors(form, errors);
        if (Object.keys(errors).length) return;
        busy(form, true);
        try { await submitContact(v); ctx.navigate(url('/contact/thanks/')); }
        catch { showErrors(form, { _: t('Something went wrong') }); busy(form, false); }
      });
    },
  };
}
