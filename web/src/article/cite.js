/* Citation exports for article pages (ported from core/article.py and the Publication model properties). */
import { slugify } from '../util.js';

const doiUrl = (p) => (p.doi ? `https://doi.org/${p.doi}` : '');
const titleOf = (p) => p.title_en || p.title || '';
const keywordList = (p) => String(p.keywords || '').split(',').map((s) => s.trim()).filter(Boolean);
export const subjectList = (p) => String(p.subjects || '').split(',').map((s) => s.trim()).filter(Boolean);
export { keywordList };

export function authorParts(a) {
  const family = a.family_name || a.name.trim().split(/\s+/).slice(-1)[0];
  const given = a.given_name ? a.given_name : (!a.family_name ? a.name.trim().split(/\s+/).slice(0, -1).join(' ') : a.name.replace(a.family_name, '').trim());
  const initials = given.replace(/-/g, ' ').split(/\s+/).filter(Boolean).map((p) => `${p[0]}.`).join(' ');
  return { family, given, initials };
}

function authorsOf(pub) {
  const list = pub.author_list || [];
  if (list.length) return list.map((a) => { const { family, given, initials } = authorParts(a); return [family, given, initials]; });
  return String(pub.authors || '').split(',').map((s) => s.trim()).filter(Boolean).map((name) => {
    const parts = name.split(/\s+/);
    return [parts[parts.length - 1], parts.slice(0, -1).join(' '), parts.slice(0, -1).map((x) => `${x[0]}.`).join(' ')];
  });
}

export function citeApa(pub) {
  const au = authorsOf(pub);
  const names = au.map(([f, , i]) => `${f}, ${i}`.trim().replace(/,$/, ''));
  const who = names.length > 1 ? names.slice(0, -1).join(', ') + ', & ' + names[names.length - 1] : (names[0] || '');
  const vol = pub.volume ? pub.volume + (pub.issue ? `(${pub.issue})` : '') : '';
  const src = [pub.journal, vol, pub.article_number].filter(Boolean).join(', ');
  const parts = [`${who} (${pub.year || 'n.d.'}). ${titleOf(pub).replace(/\.+$/, '')}.`];
  if (src) parts.push(`${src}.`);
  if (pub.doi) parts.push(doiUrl(pub));
  return parts.join(' ');
}

export function citeBibtex(pub) {
  const au = authorsOf(pub);
  const key = (au[0] ? au[0][0] : 'ref').replace(/[^A-Za-z0-9]/g, '') + String(pub.year || '');
  const fields = [['title', titleOf(pub)], ['author', au.map(([f, g]) => `${f}, ${g}`.replace(/^, |, $/g, '')).join(' and ')], ['journal', pub.journal],
    ['year', pub.year || ''], ['volume', pub.volume], ['number', pub.issue], ['pages', pub.article_number], ['publisher', pub.publisher],
    ['doi', pub.doi], ['url', doiUrl(pub)]];
  return `@article{${key},\n${fields.filter(([, v]) => v).map(([k, v]) => `  ${k} = {${v}}`).join(',\n')}\n}`;
}

export function citeRis(pub) {
  const lines = ['TY  - JOUR', `TI  - ${titleOf(pub)}`];
  authorsOf(pub).forEach(([f, g]) => lines.push(`AU  - ${f}, ${g}`.replace(/, $/, '')));
  [['JO', pub.journal], ['PY', pub.year], ['VL', pub.volume], ['IS', pub.issue], ['SP', pub.article_number], ['DO', pub.doi], ['UR', doiUrl(pub)],
    ['PB', pub.publisher], ['SN', pub.issn]].forEach(([tag, val]) => { if (val) lines.push(`${tag}  - ${val}`); });
  keywordList(pub).forEach((k) => lines.push(`KW  - ${k}`));
  const abstract = pub.abstract || [pub.abstract_background, pub.abstract_methods, pub.abstract_results, pub.abstract_conclusion].filter(Boolean).join(' ');
  if (abstract) lines.push(`AB  - ${abstract}`);
  lines.push('ER  - ');
  return lines.join('\r\n') + '\r\n';
}

/** Shorter citations used on list pages (Publication.citation_apa / citation_bibtex). */
export function listApa(p) {
  const parts = [String(p.authors || '').replace(/\.+$/, ''), p.year ? `(${p.year})` : '(n.d.)', titleOf(p).replace(/\.+$/, '') + '.'];
  if (p.journal) parts.push(p.journal + '.');
  if (p.doi) parts.push(doiUrl(p));
  return parts.join(' ');
}

export function listBibtex(p) {
  const first = String(p.authors || '').split(',')[0].trim().split(/\s+/).slice(-1)[0] || 'ref';
  const key = (first + String(p.year || '')).replace(/[^A-Za-z0-9]/g, '') || 'ref';
  const fields = [['title', titleOf(p)], ['author', String(p.authors || '').replace(/, /g, ' and ')], ['journal', p.journal], ['year', p.year || ''], ['doi', p.doi]];
  return `@article{${key},\n${fields.filter(([, v]) => v).map(([k, v]) => `  ${k} = {${v}}`).join(',\n')}\n}`;
}

export const anchorOf = (title, kind) => slugify(title) || kind;
