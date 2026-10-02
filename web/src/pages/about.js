import { list } from '../data/content.js';
import { t, tr } from '../i18n/index.js';
import { ctaBlock, empty, pageHead } from '../ui/layout.js';
import { html, linebreaks } from '../util.js';
import { personCard } from './_common.js';

export default async function about(ctx) {
  const [sections, members] = await Promise.all([list('aboutSections'), list('team')]);
  const of = (k) => sections.filter((s) => s.kind === k);
  const block = (arr, alt) => arr.map((s) => html`<section class="sec${alt ? ' alt' : ''}"><div class="wrap narrow"><h2>${tr(s, 'title')}</h2>${linebreaks(tr(s, 'body'))}</div></section>`);
  const team = members.filter((x) => x.group === 'team'), advisory = members.filter((x) => x.group === 'advisory');
  return {
    title: t('About'),
    html: html`${pageHead(t('About SiaNexis'))}${block(of('about'))}${block(of('mission'), true)}${block(of('approach'))}
<section class="sec alt"><div class="wrap"><h2>${t('Team')}</h2><div class="grid grid-4">${team.length ? team.map(personCard) : empty()}</div></div></section>
<section class="sec"><div class="wrap"><h2>${t('Advisory Board')}</h2><div class="grid grid-4">${advisory.length ? advisory.map(personCard) : empty()}</div></div></section>
${ctaBlock(ctx.site)}`,
  };
}
