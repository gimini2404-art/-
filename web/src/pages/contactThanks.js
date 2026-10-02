import { t, url } from '../i18n/index.js';
import { pageHead } from '../ui/layout.js';
import { html } from '../util.js';

export default async function thanks() {
  return { title: t('Thank you'), html: html`${pageHead(t('Thank you'), t('Your request was received. We will respond by email soon.'))}<section class="sec"><div class="wrap narrow"><a class="btn" href="${url('/')}">${t('Back to home')}</a></div></section>` };
}
