/* Turns the extractor's result into a `publications` document (port of core/article_import.save_article). */
import { slugify } from '../util.js';

const SIMPLE = ['authors', 'journal', 'year', 'volume', 'issue', 'article_number', 'publisher', 'issn', 'content_type', 'open_access', 'license',
  'license_url', 'keywords', 'subjects', 'abstract', 'abstract_background', 'abstract_methods', 'abstract_results', 'abstract_conclusion', 'rights_text',
  'accesses', 'citations', 'altmetric', 'mentions', 'external_link'];

/** @param data extractor output (+Crossref)  @param opts {pdf: url, images: {number: url}, publish, existing: current document (kept fields)} */
export function buildPublication(data, { pdf = '', images = {}, publish = true, existing = null } = {}) {
  const doc = { ...(existing || {}) };
  delete doc._id;
  for (const f of SIMPLE) if (data[f] !== undefined && data[f] !== null && data[f] !== '') doc[f] = data[f];
  doc.title_en = data.title;
  doc.title_ar ??= '';
  doc.kind = 'paper';
  doc.doi = data.doi || doc.doi || '';
  for (const f of ['received_date', 'accepted_date', 'published_date']) doc[f] = data[f] || '';
  doc.is_published = !!publish;
  doc.order ??= 0;
  if (pdf) doc.pdf = pdf; else doc.pdf ??= '';
  doc.author_list = (data.authors_detail || []).map((a) => ({ name: a.name, given_name: a.given_name || '', family_name: a.family_name || '', affiliation: a.affiliation || '',
    corresponding: !!a.corresponding, email: a.email || '', orcid: a.orcid || '' }));
  doc.sections = (data.sections || []).map((s) => ({ kind: s.kind, heading: s.heading || '', body: s.body }));
  doc.references = (data.references || []).map((r) => ({ number: r.number, text: r.text, authors: r.authors || '', title: r.title || '', source: r.source || '', doi: r.doi || '', url: r.url || '' }));
  doc.figures = (data.figures || []).map((f) => ({ kind: f.kind, number: f.number, label: f.label || '', caption: f.caption || '', table_html: f.table_html || '', note: f.note || '',
    image: (f.kind === 'figure' && images[f.number]) || '' }));
  doc.links = (data.links || []).map((l) => ({ kind: l.kind || 'similar', title: l.title, url: l.url, source: l.source || '' }));
  doc.keywords ??= '';
  return doc;
}

export const articleSlug = (data) => slugify(data.title || 'article').slice(0, 80) || 'article';
