import { state } from '../auth.js';
import { registerForProgram, seatInfo } from '../data/registration.js';
import { formValues, honeypot, field, showErrors, spamCheck, validate, busy } from '../ui/forms.js';
import { fmtAP, t, tr, url } from '../i18n/index.js';
import { toast } from '../ui/toast.js';
import { pageHead } from '../ui/layout.js';
import { html, linebreaks } from '../util.js';
import { label, visibleItem } from './_common.js';

const FIELDS = [
  { name: 'name', label: 'Name', required: true, maxlength: 120 }, { name: 'email', label: 'Email', type: 'email', required: true, dir: 'ltr' },
  { name: 'organization', label: 'Organization', maxlength: 200 }, { name: 'phone', label: 'Phone', maxlength: 40 },
  { name: 'message', label: 'Notes (optional)', type: 'textarea', rows: 4 },
];

export default async function trainingRegister(ctx) {
  const { item: p, draft } = await visibleItem(ctx, 'training', ctx.params.slug);
  if (!p) return null;
  const seats = await seatInfo(p);
  const open = p.registration_open !== false && !p.registration_link;
  const signedIn = state.user && !state.staff;
  const started = Date.now();
  return {
    title: tr(p, 'title'), draft,
    html: html`${pageHead(tr(p, 'title'), tr(p, 'summary'))}
<section class="sec"><div class="wrap narrow">
<p><span class="tag">${label('trainingKind', p.kind)}</span>${p.start_date ? html` <span class="tag tag-s">${fmtAP(p.start_date)}</span>` : ''}${tr(p, 'duration') ? html` <span class="tag tag-s">${tr(p, 'duration')}</span>` : ''}${tr(p, 'format') ? html` <span class="tag tag-s">${tr(p, 'format')}</span>` : ''}</p>
${linebreaks(tr(p, 'description'))}
${p.capacity ? html`<p class="seats ${seats.full ? 'full' : ''}">${seats.full ? t('Fully booked — you can join the waiting list.') : t('%(n)s seats left', { n: seats.left })}</p>` : ''}
${p.registration_link ? html`<a class="btn" href="${p.registration_link}" rel="noopener">${t('Register on the external page')}</a>`
    : !open ? html`<p class="empty">${t('Registration is closed for this program.')}</p>`
      : html`${signedIn ? html`<p class="enroll-box"><button class="btn" id="enroll-btn" type="button">${t('Enroll with my student account')}</button></p>`
        : !state.user ? html`<p class="notice">${t('Have a student account?')} <a href="${url('/account/login/')}?next=${encodeURIComponent(location.pathname)}">${t('Sign in to enroll and follow your course')}</a> · <a href="${url('/account/signup/')}">${t('Create an account')}</a></p>` : ''}
<h2>${t('Register')}</h2><form id="reg-form" class="form" novalidate>${honeypot()}${FIELDS.map((f) => field(f))}
<button class="btn" type="submit">${seats.full ? t('Join the waiting list') : t('Register')}</button></form>`}
<p><a class="back" href="${url('/training/')}">${t('All training programs')}</a></p></div></section>`,
    after(root) {
      const form = root.querySelector('#reg-form');
      if (form) form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = formValues(form);
        const errors = validate(v, FIELDS);
        const spam = spamCheck(form, started);
        if (spam) errors._ = spam;
        showErrors(form, errors);
        if (Object.keys(errors).length) return;
        busy(form, true);
        try {
          const r = await registerForProgram(p, v);
          toast(r.status === 'waitlist' ? t('The program is full. You were added to the waiting list.') : t('Thank you! Your registration was received. We will confirm your seat soon.'));
          ctx.navigate(location.pathname);
        } catch (err) {
          showErrors(form, { email: err.code === 'permission-denied' ? t('This email is already registered for this program.') : t('Something went wrong') });
        } finally { busy(form, false); }
      });
      const enroll = root.querySelector('#enroll-btn');
      if (enroll) enroll.addEventListener('click', async () => {
        enroll.disabled = true;
        const { enrollInProgram } = await import('../portal/enroll.js');
        await enrollInProgram(p, ctx.navigate);
      });
    },
  };
}
