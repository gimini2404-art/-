import { t } from '../i18n/index.js';
import { html } from '../util.js';
export default async function importPdf() { return { title: t('Import article from PDF'), active: '/admin/c/publications', html: html`<p class="ad-empty">…</p>` }; }
