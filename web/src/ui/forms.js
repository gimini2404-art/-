/* Tiny form toolkit: render fields, collect values, show errors (replaces Django forms). */
import { t } from '../i18n/index.js';
import { html, isEmail, raw } from '../util.js';

export function field(f, value = '') {
  const id = `f-${f.name}`;
  const req = f.required ? 'required' : '';
  let control;
  if (f.type === 'textarea') control = html`<textarea id="${id}" name="${f.name}" rows="${f.rows || 5}" ${raw(req)} ${f.maxlength ? raw(`maxlength="${f.maxlength}"`) : ''}>${value}</textarea>`;
  else if (f.type === 'select') control = html`<select id="${id}" name="${f.name}" ${raw(req)}>${f.blank ? html`<option value="">—</option>` : ''}${f.choices.map(([v, l]) => html`<option value="${v}" ${v === value ? 'selected' : ''}>${t(l)}</option>`)}</select>`;
  else control = html`<input id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${value}" ${raw(req)} ${f.dir ? raw(`dir="${f.dir}"`) : ''} ${f.autocomplete ? raw(`autocomplete="${f.autocomplete}"`) : ''} ${f.maxlength ? raw(`maxlength="${f.maxlength}"`) : ''}>`;
  return html`<div class="field ${f.hp ? 'hp' : ''}" data-field="${f.name}"><label for="${id}">${t(f.label)}${f.required && !f.hp ? '' : ''}</label>${control}<ul class="errorlist" hidden></ul>${f.help ? html`<small class="help">${t(f.help)}</small>` : ''}</div>`;
}

export const honeypot = () => field({ name: 'website', label: 'Website', hp: true, autocomplete: 'off' });

export function formValues(form) {
  const o = {};
  new FormData(form).forEach((v, k) => { o[k] = typeof v === 'string' ? v.trim() : v; });
  return o;
}

export function showErrors(form, errors) {
  form.querySelectorAll('.errorlist').forEach((u) => { u.hidden = true; u.innerHTML = ''; });
  let general = form.querySelector('.form-errors');
  if (!general) { general = document.createElement('ul'); general.className = 'errorlist form-errors'; form.prepend(general); }
  general.innerHTML = ''; general.hidden = true;
  for (const [name, msg] of Object.entries(errors)) {
    const ul = name === '_' ? general : form.querySelector(`[data-field="${name}"] .errorlist`);
    const target = ul || general;
    const li = document.createElement('li'); li.textContent = msg; target.appendChild(li); target.hidden = false;
  }
}

/** Basic client-side validation shared by public forms. Returns { field: message }. */
export function validate(values, fields) {
  const errors = {};
  for (const f of fields) {
    const v = values[f.name] ?? '';
    if (f.required && !v) errors[f.name] = t('This field is required.');
    else if (v && f.type === 'email' && !isEmail(v)) errors[f.name] = t('Enter a valid email address.');
  }
  return errors;
}

/** Spam traps: hidden field must stay empty; humans need at least 3 s to fill a form. */
export function spamCheck(form, startedAt) {
  if (new FormData(form).get('website')) return t('Spam detected.');
  if (Date.now() - startedAt < 3000) return t('The form was submitted too quickly or has expired. Please try again.');
  return null;
}

export function busy(form, on) {
  form.querySelectorAll('button[type=submit]').forEach((b) => { b.disabled = on; });
}
