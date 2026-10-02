import { subscriberEmail, unsubscribe } from '../data/forms.js';
import { t, url } from '../i18n/index.js';
import { pageHead } from '../ui/layout.js';
import { html } from '../util.js';

export default async function unsub(ctx) {
  const tok = ctx.params.token;
  const email = await subscriberEmail(tok);
  if (!email) return null;
  return {
    title: t('Unsubscribe'), noindex: true,
    html: html`${pageHead(t('Unsubscribe'))}<section class="sec"><div class="wrap narrow" id="unsub-box"><p>${t('Stop sending newsletters to %(email)s?', { email })}</p>
<button class="btn" id="unsub-btn" type="button">${t('Yes, unsubscribe')}</button></div></section>`,
    after(root) {
      root.querySelector('#unsub-btn').addEventListener('click', async () => {
        await unsubscribe(tok);
        root.querySelector('#unsub-box').innerHTML = `<h2>${t('Unsubscribed')}</h2><p>${t('You will no longer receive our newsletter.')}</p><a class="btn" href="${url('/')}">${t('Back to home')}</a>`;
      });
    },
  };
}
