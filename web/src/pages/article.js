import { list } from '../data/content.js';
import { t, tr, url, fmtDate, getLang } from '../i18n/index.js';
import { choiceLabel } from '../schema.js';
import { abstractParts, hasArticle, orderedSections, renderBody } from '../article/render.js';
import { citeApa, citeBibtex, citeRis, keywordList, subjectList } from '../article/cite.js';
import { html, raw, truncateChars, urlize, esc } from '../util.js';
import { visibleItem } from './_common.js';

const dateOnly = (d) => (d ? String(d).slice(0, 10) : '');
const doiUrl = (p) => (p.doi ? `https://doi.org/${p.doi}` : '');

export default async function article(ctx) {
  const { item: pub, draft } = await visibleItem(ctx, 'publications', ctx.params.slug);
  if (!pub || !hasArticle(pub)) return null;
  const site = ctx.site;
  const { body, tail } = orderedSections(pub);
  const authors = pub.author_list || [];
  const refs = [...(pub.references || [])].sort((a, b) => a.number - b.number);
  const links = pub.links || [];
  const similar = links.filter((l) => l.kind === 'similar'), relatedLinks = links.filter((l) => l.kind === 'related');
  const terms = new Set([...subjectList(pub), ...keywordList(pub)].map((x) => x.toLowerCase()));
  let related = [];
  if (terms.size) {
    related = (await list('publications')).filter((o) => o._id !== pub._id && o.has_article && [...subjectList(o), ...keywordList(o)].some((x) => terms.has(x.toLowerCase()))).slice(0, 5);
  }
  const metrics = [[t('Accesses'), pub.accesses], [t('Citations'), pub.citations], [t('Altmetric'), pub.altmetric], [t('Mentions'), pub.mentions]].filter(([, v]) => v != null && v !== '');
  const parts = abstractParts(pub);
  const toc = [];
  if (parts.length || pub.abstract) toc.push(['abstract', t('Abstract')]);
  body.forEach((s) => toc.push([s.anchor, s.title]));
  tail.filter((s) => s.kind === 'data_availability').forEach((s) => toc.push([s.anchor, s.title]));
  if (refs.length) toc.push(['references', t('References')]);
  tail.filter((s) => s.kind !== 'data_availability').forEach((s) => toc.push([s.anchor, s.title]));
  if (authors.length) toc.push(['author-information', t('Author information')]);
  if (pub.rights_text) toc.push(['rights', t('Rights and permissions')]);
  toc.push(['cite', t('Cite this article')]);
  const apa = citeApa(pub), bib = citeBibtex(pub), ris = citeRis(pub);
  const many = authors.length > 4;
  const corresponding = authors.filter((a) => a.corresponding);
  const pageUrl = location.origin + location.pathname;
  const sec = (s) => html`<section id="${s.anchor}" class="art-sec"><h2>${s.title}</h2>${renderBody(s.body, pub)}</section>`;
  const cr = (kind) => t(choiceLabel('contentType', pub.content_type || 'research'));

  const view = html`
<section class="art-hero"><div class="art-wrap">
  <nav class="art-crumbs" aria-label="Breadcrumb"><a href="${url('/')}">${t('Home')}</a><span>›</span><a href="${url('/publications/')}">${t('Publications')}</a>${pub.journal ? html`<span>›</span><span>${pub.journal}</span>` : ''}<span>›</span><span aria-current="page">${t('Article')}</span></nav>
  <div class="art-badges"><span class="art-type">${cr()}</span>
    ${pub.open_access ? html`<span class="art-oa"><svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0"/></svg>${t('Open access')}</span>` : html`<span class="art-restricted">${t('Restricted')}</span>`}</div>
  <h1 lang="en" dir="ltr">${tr(pub, 'title')}</h1>
  <p class="art-meta">
    ${pub.published_date ? html`<span>${t('Published')}: <time datetime="${dateOnly(pub.published_date)}">${fmtDate(pub.published_date)}</time></span>` : pub.year ? html`<span>${t('Published')}: ${pub.year}</span>` : ''}
    ${pub.journal ? html`<span><em lang="en" dir="ltr">${pub.journal}</em>${pub.volume ? html` <strong dir="ltr">${pub.volume}</strong>` : ''}${pub.article_number ? html`, ${t('Article number')}: <span dir="ltr">${pub.article_number}</span>` : ''}${pub.year ? html` (<span dir="ltr">${pub.year}</span>)` : ''}</span>` : ''}
    ${pub.doi ? html`<span>DOI: <a href="${doiUrl(pub)}" dir="ltr" rel="noopener">${pub.doi}</a></span>` : ''}
  </p>
  <div class="art-actions">
    ${pub.pdf ? html`<a class="art-btn art-btn-light" href="${pub.pdf}" download target="_blank" rel="noopener"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M8 2v8M4.5 7 8 10.5 11.5 7M3 13h10"/></svg>${t('Download PDF')}</a>` : ''}
    <button type="button" class="art-btn art-btn-line" data-open-dialog="cite-dialog">${t('Cite article')}</button>
    <button type="button" class="art-btn art-btn-line" id="save-btn" data-slug="${pub.slug}" data-title="${tr(pub, 'title')}" data-label-save="${t('Save article')}" data-label-saved="${t('Saved')}">${t('Save article')}</button>
    <details class="art-share"><summary class="art-btn art-btn-line">${t('Share')}</summary>
      <div class="art-share-panel"><button type="button" id="share-native" hidden>${t('Share…')}</button><button type="button" id="copy-link" data-done="${t('Link copied')}">${t('Copy link')}</button>
        <a href="mailto:?subject=${encodeURIComponent(tr(pub, 'title'))}&body=${encodeURIComponent(pageUrl)}">${t('Email')}</a>
        <a href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(pageUrl)}" target="_blank" rel="noopener">LinkedIn</a>
        <a href="https://twitter.com/intent/tweet?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(tr(pub, 'title'))}" target="_blank" rel="noopener">X</a></div></details>
  </div>
</div></section>

<div class="art-wrap art-lead">
  ${authors.length ? html`<div class="art-authors" lang="en" dir="ltr"><p>${authors.map((a, i) => html`<span class="au">${a.name}${a.corresponding ? html`<sup title="${t('Corresponding author')}">*</sup>` : ''}</span>${i < authors.length - 1 ? ', ' : ''}`)}
    ${many ? html`<button type="button" class="art-linkbtn" id="show-authors" aria-expanded="false" aria-controls="author-panel" data-more="${t('Show authors')}" data-less="${t('Hide authors')}">${t('Show authors')}</button>` : ''}</p>
    ${many ? html`<ul id="author-panel" class="art-author-panel" hidden>${authors.map((a) => html`<li><strong>${a.name}</strong>${a.affiliation ? ' — ' + a.affiliation : ''}${a.corresponding && a.email ? html` · <a href="mailto:${a.email}">${a.email}</a>` : ''}</li>`)}</ul>` : ''}</div>`
    : pub.authors ? html`<div class="art-authors" lang="en" dir="ltr"><p>${pub.authors}</p></div>` : ''}
  ${metrics.length ? html`<div class="art-metrics-row"><ul>${metrics.map(([l, v]) => html`<li><strong>${v}</strong> ${l}</li>`)}</ul><a href="#metrics">${t('Explore all metrics')} ›</a></div>` : ''}
</div>

<div class="art-wrap art-layout">
  <aside class="art-side" aria-label="${t('Article tools')}">
    <details class="side-details" id="side-details" open><summary class="side-summary">${t('Article tools')}</summary>
      ${pub.pdf ? html`<a class="art-btn art-btn-dark art-btn-block" href="${pub.pdf}" download target="_blank" rel="noopener">${t('Download PDF')}</a>` : ''}
      <section class="side-sec"><h2>${t('On this page')}</h2><ol class="art-toc">${toc.map(([a, l]) => html`<li><a href="#${a}" data-toc="${a}">${l}</a></li>`)}</ol></section>
      <section class="side-sec"><h2>${t('Journal info')}</h2><dl class="art-dl">
        ${pub.journal ? html`<dt>${t('Journal')}</dt><dd lang="en" dir="ltr"><em>${pub.journal}</em></dd>` : ''}
        ${pub.volume || pub.article_number ? html`<dt>${t('Volume / article')}</dt><dd dir="ltr">${pub.volume || ''}${pub.issue ? `(${pub.issue})` : ''}${pub.article_number ? ', ' + pub.article_number : ''}</dd>` : ''}
        ${pub.publisher ? html`<dt>${t('Publisher')}</dt><dd dir="ltr">${pub.publisher}</dd>` : ''}${pub.issn ? html`<dt>ISSN</dt><dd dir="ltr">${pub.issn}</dd>` : ''}
        ${pub.received_date ? html`<dt>${t('Received')}</dt><dd>${fmtDate(pub.received_date)}</dd>` : ''}${pub.accepted_date ? html`<dt>${t('Accepted')}</dt><dd>${fmtDate(pub.accepted_date)}</dd>` : ''}
        ${pub.published_date ? html`<dt>${t('Published')}</dt><dd>${fmtDate(pub.published_date)}</dd>` : pub.year ? html`<dt>${t('Year')}</dt><dd>${pub.year}</dd>` : ''}
        ${pub.license ? html`<dt>${t('License')}</dt><dd dir="ltr">${pub.license_url ? html`<a href="${pub.license_url}" rel="noopener">${pub.license}</a>` : pub.license}</dd>` : ''}</dl></section>
      ${metrics.length ? html`<section class="side-sec" id="metrics"><h2>${t('Article metrics')}</h2><dl class="art-dl">${metrics.map(([l, v]) => html`<dt>${l}</dt><dd>${v}</dd>`)}</dl></section>` : ''}
      <section class="side-sec"><h2>${t('Cite this article')}</h2><p class="side-cite" lang="en" dir="ltr">${apa}</p>
        <p class="side-links"><button type="button" class="art-linkbtn" data-open-dialog="cite-dialog">${t('Cite article')}</button> · <a href="#" data-download="ris">RIS</a> · <a href="#" data-download="bib">BibTeX</a></p></section>
    </details>
  </aside>

  <article class="art-main" lang="en" dir="ltr">
    ${parts.length || pub.abstract ? html`<section id="abstract" class="art-sec"><h2>${t('Abstract')}</h2>
      ${parts.length ? parts.map(([h, x]) => html`<h3 class="abs-h">${h}</h3><p>${x}</p>`) : html`<p>${pub.abstract}</p>`}
      ${keywordList(pub).length ? html`<p class="art-keywords"><strong>${t('Keywords')}:</strong> ${pub.keywords}</p>` : ''}</section>` : ''}

    ${related.length || similar.length ? html`<section class="art-aside-list" aria-label="${t('Similar content')}"><h2>${t('Similar content being viewed')}</h2><ul>
      ${related.map((o) => html`<li><a href="${url('/publications/' + o.slug + '/')}">${tr(o, 'title')}</a>${o.journal ? html` <span>${o.journal}${o.year ? ', ' + o.year : ''}</span>` : ''}</li>`)}
      ${similar.map((l) => html`<li><a href="${l.url}" rel="noopener">${l.title}</a>${l.source ? html` <span>${l.source}</span>` : ''}</li>`)}</ul></section>` : ''}
    ${subjectList(pub).length || relatedLinks.length ? html`<section class="art-aside-list" aria-label="${t('Related subjects')}"><h2>${t('Related subjects')}</h2><ul class="subjects">
      ${subjectList(pub).map((s) => html`<li><a href="${url('/search/')}?q=${encodeURIComponent(s)}">${s}</a></li>`)}
      ${relatedLinks.map((l) => html`<li><a href="${l.url}" rel="noopener">${l.title}</a></li>`)}</ul></section>` : ''}

    ${body.map(sec)}
    ${tail.filter((s) => s.kind === 'data_availability').map(sec)}

    ${refs.length ? html`<section id="references" class="art-sec"><h2>${t('References')}</h2><ol class="art-refs">
      ${refs.map((r) => html`<li id="ref-${r.number}" value="${r.number}">
        ${r.authors && r.title ? html`<span class="r-au">${r.authors}.</span> <span class="r-ti">${r.title}</span> <span class="r-so">${urlize(r.source || '')}</span>` : urlize(r.text)}
        <span class="r-links">${r.doi || r.url ? html`<a href="${r.doi ? 'https://doi.org/' + r.doi : r.url}" rel="noopener" target="_blank">${t('Article')}</a>` : ''}<a href="https://scholar.google.com/scholar_lookup?title=${encodeURIComponent((r.title || r.text || '').slice(0, 200))}" rel="noopener" target="_blank">Google Scholar</a></span></li>`)}</ol></section>` : ''}

    ${tail.filter((s) => s.kind === 'author_info').map(sec)}
    ${authors.length ? html`<section id="author-information" class="art-sec"><h2>${t('Author information')}</h2><ul class="art-affil">
      ${authors.map((a) => html`<li><strong>${a.name}</strong>${a.corresponding ? html` <span class="tag-corr">${t('Corresponding author')}</span>` : ''}${a.affiliation ? html`<br><span>${a.affiliation}</span>` : ''}${a.email ? html`<br><a href="mailto:${a.email}">${a.email}</a>` : ''}${a.orcid ? html`<br><a href="https://orcid.org/${a.orcid}" rel="noopener">ORCID ${a.orcid}</a>` : ''}</li>`)}</ul>
      ${corresponding.length ? html`<p>${t('Correspondence to')} ${corresponding.map((a, i) => html`<a href="mailto:${a.email}">${a.name}</a>${i < corresponding.length - 1 ? ', ' : ''}`)}.</p>` : ''}</section>` : ''}
    ${tail.filter((s) => s.kind === 'ethics').map(sec)}
    ${pub.rights_text ? html`<section id="rights" class="art-sec"><h2>${t('Rights and permissions')}</h2><p>${pub.rights_text}</p>
      ${pub.license_url ? html`<p><a href="${pub.license_url}" rel="noopener">${pub.license || 'License'}</a></p>` : ''}</section>` : ''}
    <section id="cite" class="art-sec"><h2>${t('Cite this article')}</h2>
      <p class="cite-text">${apa}</p>
      <p class="cite-actions"><button type="button" class="art-btn art-btn-line art-btn-sm" data-copy="${apa}">${t('Copy citation')}</button>
        <a class="art-btn art-btn-line art-btn-sm" href="#" data-download="ris">${t('Download RIS')}</a>
        <a class="art-btn art-btn-line art-btn-sm" href="#" data-download="bib">${t('Download BibTeX')}</a></p></section>
  </article>
</div>

<dialog id="cite-dialog" class="art-dialog" aria-labelledby="cite-dialog-title"><form method="dialog" class="dlg-close"><button aria-label="${t('Close')}">×</button></form>
  <h2 id="cite-dialog-title">${t('Cite this article')}</h2>
  <div class="dlg-tabs" role="tablist"><button role="tab" aria-selected="true" data-tab="apa">APA</button><button role="tab" aria-selected="false" data-tab="bib">BibTeX</button><button role="tab" aria-selected="false" data-tab="ris">RIS</button></div>
  <pre class="dlg-pane" data-pane="apa" dir="ltr">${apa}</pre><pre class="dlg-pane" data-pane="bib" dir="ltr" hidden>${bib}</pre><pre class="dlg-pane" data-pane="ris" dir="ltr" hidden>${ris}</pre>
  <p class="dlg-actions"><button type="button" class="art-btn art-btn-dark art-btn-sm" id="dlg-copy" data-done="${t('Copied')}">${t('Copy')}</button>
    <a class="art-btn art-btn-line art-btn-sm" href="#" data-download="ris">${t('Download RIS')}</a><a class="art-btn art-btn-line art-btn-sm" href="#" data-download="bib">${t('Download BibTeX')}</a></p>
</dialog>`;

  const meta = [['citation_title', tr(pub, 'title')], ...authors.map((a) => ['citation_author', a.name])];
  if (pub.journal) meta.push(['citation_journal_title', pub.journal]);
  if (pub.year) meta.push(['citation_publication_date', pub.published_date ? dateOnly(pub.published_date).replace(/-/g, '/') : String(pub.year)]);
  if (pub.volume) meta.push(['citation_volume', pub.volume]);
  if (pub.article_number) meta.push(['citation_firstpage', pub.article_number]);
  if (pub.doi) meta.push(['citation_doi', pub.doi]);
  if (pub.issn) meta.push(['citation_issn', pub.issn]);
  if (pub.pdf) meta.push(['citation_pdf_url', pub.pdf]);
  meta.push(['citation_abstract_html_url', pageUrl], ['citation_language', 'en'], ...keywordList(pub).map((k) => ['citation_keywords', k]));
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'ScholarlyArticle', headline: tr(pub, 'title'), name: tr(pub, 'title'),
    ...(pub.doi ? { sameAs: doiUrl(pub), identifier: pub.doi } : {}), inLanguage: 'en', isAccessibleForFree: !!pub.open_access,
    ...(pub.year ? { datePublished: pub.published_date ? dateOnly(pub.published_date) : String(pub.year) } : {}),
    author: authors.map((a) => ({ '@type': 'Person', name: a.name })), ...(pub.journal ? { isPartOf: { '@type': 'Periodical', name: pub.journal } } : {}), url: pageUrl,
  };
  const desc = truncateChars(parts.length ? parts[0][1] : pub.abstract || '', 240);
  return {
    layout: 'article', bodyClass: 'article-page', draft, meta, jsonld, description: desc,
    fullTitle: `${tr(pub, 'title')} | ${pub.journal || tr(site, 'site_name')}`, title: tr(pub, 'title'), html: view,
    after(root) {
      root.querySelectorAll('[data-download]').forEach((a) => a.addEventListener('click', (e) => {
        e.preventDefault();
        const kind = a.dataset.download;
        const blob = new Blob([kind === 'ris' ? ris : bib], { type: (kind === 'ris' ? 'application/x-research-info-systems' : 'application/x-bibtex') + ';charset=utf-8' });
        const l = document.createElement('a'); l.href = URL.createObjectURL(blob); l.download = `${pub.slug}.${kind}`; l.click(); setTimeout(() => URL.revokeObjectURL(l.href), 1000);
      }));
    },
  };
}
