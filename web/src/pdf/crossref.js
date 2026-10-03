/* Enrich an extracted article with Crossref metadata (port of core/crossref.py). Crossref allows browser requests (CORS). */

export async function fetchCrossref(doi, { timeout = 12000, mailto = '' } = {}) {
  if (!doi) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch('https://api.crossref.org/works/' + encodeURI(doi).replace(/#/g, '%23') + (mailto ? `?mailto=${encodeURIComponent(mailto)}` : ''), { signal: ctl.signal });
    if (!res.ok) return null;
    return (await res.json()).message || null;
  } catch { return null; } finally { clearTimeout(timer); }
}

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function license(url) {
  const m = /creativecommons\.org\/licenses\/(by(?:-[a-z]+)*)\/(\d\.\d)/.exec(url || '');
  return m ? [`CC ${m[1].toUpperCase()} ${m[2]}`, `https://creativecommons.org/licenses/${m[1]}/${m[2]}/`] : [null, null];
}

function dateOf(cr) {
  for (const key of ['published', 'published-online', 'published-print', 'issued']) {
    const p = ((cr[key] || {})['date-parts'] || [[]])[0];
    if (p && p[0]) return [`${String(p[0]).padStart(4, '0')}-${String(p[1] || 1).padStart(2, '0')}-${String(p[2] || 1).padStart(2, '0')}`, p[0]];
  }
  return [null, null];
}

/** Merge Crossref into `data` (PDF wins for text, Crossref for bibliographic facts). Returns change notes. */
export function applyCrossref(data, cr) {
  const notes = [];
  if (!cr) return notes;
  if (cr.title && cr.title[0] && !data.title) data.title = cr.title[0];
  for (const [key, val] of [['journal', (cr['container-title'] || [])[0]], ['volume', cr.volume], ['issue', cr.issue], ['article_number', cr['article-number'] || cr.page],
    ['publisher', cr.publisher], ['issn', (cr.ISSN || [])[0]]]) if (val) data[key] = val;
  const [pdate, year] = dateOf(cr);
  if (pdate) { data.published_date = pdate; data.year = year; }
  const lic = (cr.license || []).map((l) => l.URL).find((u) => u && u.includes('creativecommons'));
  const [name, lurl] = license(lic);
  if (name) { data.license = name; data.license_url = lurl; data.open_access = true; }
  if (cr['is-referenced-by-count'] != null) data.citations = cr['is-referenced-by-count'];
  if (cr.subject && cr.subject.length && !data.subjects) data.subjects = cr.subject.join(', ');
  if (cr.abstract && !(data.abstract || data.abstract_background)) data.abstract = cr.abstract.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  const old = {};
  for (const a of data.authors_detail || []) old[norm((a.name.split(' ').pop()))] = a;
  const authors = [];
  for (const a of cr.author || []) {
    const fam = a.family || '', giv = a.given || '';
    if (!fam) continue;
    const prev = old[norm(fam)] || {};
    const aff = (a.affiliation || []).map((x) => x.name).filter(Boolean).join('; ') || prev.affiliation || '';
    authors.push({ name: `${giv} ${fam}`.trim(), given_name: giv, family_name: fam, affiliation: aff, corresponding: prev.corresponding || false, email: prev.email || '',
      orcid: (a.ORCID || '').replace(/^https?:\/\/orcid\.org\//, '') });
  }
  if (authors.length && authors.length >= (data.authors_detail || []).length) {
    data.authors_detail = authors;
    data.authors = authors.map((a) => a.name).join(', ');
    notes.push('authors');
  }

  const refs = data.references || [], crefs = cr.reference || [];
  if (refs.length && crefs.length) {
    let pairs;
    if (refs.length === crefs.length) pairs = refs.map((r, i) => [r, crefs[i]]);
    else {
      pairs = [];
      for (const r of refs) {
        const n = norm(r.text);
        const match = crefs.find((c) => c['article-title'] && n.includes(norm(c['article-title'])));
        if (match) pairs.push([r, match]);
      }
    }
    let filled = 0;
    for (const [r, c] of pairs) {
      if (c.DOI && !r.doi) { r.doi = c.DOI; filled++; }
      if (!r.title && c['article-title']) {
        r.title = c['article-title'];
        r.authors = r.authors || c.author || '';
        r.source = r.source || [c['journal-title'], String(c.year || ''), c.volume || ''].filter(Boolean).join(' ');
      }
    }
    if (filled) notes.push(`refs:${filled}`);
  }
  return notes;
}
