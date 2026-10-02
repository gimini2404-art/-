import { state } from '../auth.js';
import { t, url } from '../i18n/index.js';
import { html } from '../util.js';

export function auth_buttons() {
  if (state.user && !state.staff) return html`<a class="btn btn-ghost" href="${url('/account/')}">${t('My account')}</a>`;
  return html`<a class="btn btn-ghost" href="${url('/account/login/')}">${t('Student sign in')}</a><a class="btn btn-ghost" href="${url('/account/signup/')}">${t('Create account')}</a>`;
}
