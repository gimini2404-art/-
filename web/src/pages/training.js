import { list } from '../data/content.js';
import { seatInfo } from '../data/registration.js';
import { t, tn, tr, url, fmtDate } from '../i18n/index.js';
import { CHOICES } from '../schema.js';
import { img } from '../media.js';
import { ctaBlock, empty, pageHead } from '../ui/layout.js';
import { html, linebreaks } from '../util.js';
import { PLURAL } from './_common.js';

export default async function training(ctx) {
  const items = await list('training');
  const seats = Object.fromEntries(await Promise.all(items.map(async (p) => [p._id, await seatInfo(p)])));
  const groups = CHOICES.trainingKind.map(([k]) => [t(PLURAL.training[k]), items.filter((x) => x.kind === k)]).filter(([, a]) => a.length);
  return {
    title: t('Training & Education'),
    html: html`${pageHead(t('Training & Education'), t('Programs, workshops, courses and mentorship for researchers and institutions.'))}
${groups.length ? groups.map(([lbl, arr], i) => html`<section class="sec ${i % 2 ? 'alt' : ''}"><div class="wrap"><h2>${lbl}</h2><div class="grid">
${arr.map((p) => { const s = seats[p._id]; return html`<div class="card">${p.image ? html`<img src="${img(p.image, 600)}" alt="" loading="lazy">` : ''}<h3>${tr(p, 'title')}</h3><p class="muted">${p.start_date ? fmtDate(p.start_date) + ' · ' : ''}${tr(p, 'duration')}${tr(p, 'format') ? ' · ' + tr(p, 'format') : ''}</p><p>${tr(p, 'summary')}</p>${linebreaks(tr(p, 'description'))}
${p.capacity ? html`<p class="seats ${s.full ? 'full' : ''}">${s.full ? t('Fully booked') : t('%(n)s seats left', { n: s.left })}</p>` : ''}
<a class="btn btn-sm" href="${url('/training/' + p.slug + '/register/')}">${p.registration_open ? t('Register') : t('Details')}</a></div>`; })}
</div></div></section>`) : html`<div class="wrap sec">${empty()}</div>`}
${ctaBlock(ctx.site)}`,
  };
}
