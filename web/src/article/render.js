/* Article body rendering: section order, light markup -> HTML, figures/tables (ported from core/article.py). */
import { t } from '../i18n/index.js';
import { choiceLabel } from '../schema.js';
import { esc, raw } from '../util.js';
import { img } from '../media.js';
import { anchorOf } from './cite.js';

const IMRAD = ['introduction', 'background', 'methodology', 'methods', 'results', 'discussion', 'limitations', 'conclusion', 'conclusions'];
const SHORT = ['background', 'methods', 'results', 'conclusion', 'introduction', 'methodology', 'discussion', 'limitations', 'conclusions'];
const TAIL = ['data_availability', 'author_info', 'ethics'];

export const sectionTitle = (s) => s.heading || t(choiceLabel('sectionKind', s.kind));

export function orderedSections(pub) {
  const secs = (pub.sections || []).map((s, i) => ({ ...s, _i: i, anchor: '', title: '' }));
  secs.forEach((s) => { s.title = sectionTitle(s); s.anchor = anchorOf(s.title, s.kind); });
  const order = secs.some((s) => s.kind === 'introduction') ? IMRAD : SHORT;
  const rank = Object.fromEntries(order.map((k, i) => [k, i]));
  const body = secs.filter((s) => s.kind in rank || s.kind === 'other')
    .sort((a, b) => ((rank[a.kind] ?? order.length) - (rank[b.kind] ?? order.length)) || a._i - b._i);
  const tail = secs.filter((s) => TAIL.includes(s.kind)).sort((a, b) => (TAIL.indexOf(a.kind) - TAIL.indexOf(b.kind)) || a._i - b._i);
  return { body, tail };
}

const CITE = /\[(\d+(?:\s*[–-]\s*\d+)?(?:\s*,\s*\d+(?:\s*[–-]\s*\d+)?)*)\]/g;

function linkCitations(text, maxRef) {
  return text.replace(CITE, (_m, inner) => '[' + inner.split(/\s*,\s*/).map((tok) => {
    const first = parseInt(tok, 10);
    return first <= maxRef ? `<a href="#ref-${first}" class="cite-ref">${tok}</a>` : tok;
  }).join(', ') + ']');
}

export function figureHtml(fig) {
  const label = esc(fig.label || `${t(choiceLabel('figKind', fig.kind))} ${fig.number}`);
  const cap = esc(fig.caption || '');
  const note = fig.note ? `<p class="fig-note">${esc(fig.note)}</p>` : '';
  let inner = '';
  if (fig.kind === 'table') {
    if (!fig.table_html) return '';
    inner = `<div class="table-wrap" tabindex="0">${fig.table_html}</div>`
      + `<p class="fig-full"><button type="button" class="art-linkbtn" data-open-dialog="table-dialog-${fig.number}">${esc(t('Full size table'))}</button></p>`
      + `<dialog id="table-dialog-${fig.number}" class="art-dialog art-dialog-wide" aria-label="${label}">`
      + `<form method="dialog" class="dlg-close"><button aria-label="${esc(t('Close'))}">×</button></form>`
      + `<h2>${label}</h2><p>${cap}</p><div class="table-wrap table-full" tabindex="0">${fig.table_html}</div>${note}</dialog>`;
  } else if (fig.image) {
    inner = `<a href="${esc(fig.image)}" target="_blank" rel="noopener"><img src="${esc(img(fig.image, 1200))}" alt="${label}. ${cap}" loading="lazy"></a>`;
  }
  return `<figure class="art-fig" id="${fig.kind}-${fig.number}"><figcaption><strong>${label}</strong> ${cap}</figcaption>${inner}${note}</figure>`;
}

/** Light markup -> escaped HTML. The only raw HTML is an admin-entered table (from `figures`). */
export function renderBody(text, pub) {
  const refs = pub.references || [];
  const maxRef = refs.reduce((m, r) => Math.max(m, r.number || 0), 0);
  const figures = {};
  (pub.figures || []).forEach((f) => { figures[`${f.kind}:${f.number}`] = f; });
  const out = [];
  let items = [];
  const flush = () => { if (items.length) { out.push('<ul>' + items.map((i) => `<li>${i}</li>`).join('') + '</ul>'); items = []; } };
  for (let block of String(text || '').trim().split(/\n\s*\n/)) {
    block = block.trim();
    if (!block) continue;
    const m = /^\[\[(fig|figure|table):(\d+)\]\]$/.exec(block);
    if (m) {
      flush();
      const fig = figures[`${m[1] === 'table' ? 'table' : 'figure'}:${parseInt(m[2], 10)}`];
      if (fig) out.push(figureHtml(fig));
      continue;
    }
    if (block.startsWith('### ')) { flush(); out.push(`<h3>${esc(block.slice(4))}</h3>`); continue; }
    const lines = block.split('\n');
    if (lines.every((l) => l.startsWith('- '))) { lines.forEach((l) => items.push(linkCitations(esc(l.slice(2)), maxRef))); flush(); continue; }
    flush();
    out.push(`<p>${linkCitations(esc(block), maxRef)}</p>`);
  }
  flush();
  return raw(out.join('\n'));
}

export function abstractParts(pub) {
  return [[t('Background'), pub.abstract_background], [t('Methods'), pub.abstract_methods], [t('Results'), pub.abstract_results],
    [t('Conclusion'), pub.abstract_conclusion]].filter(([, x]) => x);
}

export const hasArticle = (p) => !!(p.slug && (p.abstract || p.abstract_background || p.abstract_results || (p.sections || []).length));
