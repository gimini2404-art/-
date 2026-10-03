/* "Add a research paper": choose a PDF, everything else is automatic (read in the browser with pdf.js, enriched from Crossref). */
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { isEditor } from '../auth.js';
import { settings as publicSettings } from '../data/content.js';
import { buildPublication, articleSlug } from '../data/article.js';
import { db } from '../firebase.js';
import { t } from '../i18n/index.js';
import { cloudinaryConfig, uploadMedia } from '../media.js';
import { html } from '../util.js';
import { toast } from '../ui/toast.js';
import { freeSlug, saveContent } from './data.js';
import { confirmBox } from './ui.js';

const MAX_BYTES = 40 * 1024 * 1024;

const WARNINGS = () => ({
  no_abstract: t('No abstract was detected.'), no_references: t('No references were detected.'), no_sections: t('No body sections were detected.'),
  figure_count_mismatch: t('The number of images does not match the number of figure captions. Check the figures.'),
  images_failed: t('Images could not be extracted. Add figures manually.'), no_doi: t('No DOI was found. You can add it by editing the paper.'),
  crossref_unreachable: t('Crossref could not be reached; details come from the PDF only.'), no_title: t('No title was detected: please type it.'),
  no_authors: t('No authors were detected: add them in the Authors section.'),
  no_cloudinary: t('Cloudinary is not set up (Site settings), so the PDF file and figure images were not uploaded.'),
  upload_failed: t('Some files could not be uploaded to Cloudinary. Add them by editing the paper.'),
});

async function loadPdfjs() {
  // the legacy build carries the polyfills that older browsers need (the modern one needs very recent JavaScript features)
  const [lib, worker] = await Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')]);
  lib.GlobalWorkerOptions.workerSrc = worker.default;
  return lib;
}

export default async function importPdf({ navigate }) {
  if (!isEditor()) return { title: t('Import article from PDF'), active: '/admin/c/publications', html: html`<p class="ad-warn">${t('Only editors and administrators can use these tools.')}</p>` };
  return {
    title: t('Add a research paper'), active: '/admin/c/publications',
    html: html`<div class="ad-form"><p>${t('Choose the PDF of the paper. The title, authors, abstract, sections, figures, tables and references are filled in automatically, and the details are completed from Crossref when the paper has a DOI.')}</p>
      <div class="field"><label for="pdf">${t('PDF file')}</label><input type="file" id="pdf" accept="application/pdf,.pdf"></div>
      <div class="field"><label for="doi">${t('DOI (optional)')}</label><input id="doi" dir="ltr" placeholder="10.1000/xyz123"><small class="help">${t('Only needed when the DOI is not printed on the first pages.')}</small></div>
      <button class="ad-btn" id="pub" disabled>${t('Publish now')}</button> <button class="ad-btn line" id="draft" disabled>${t('Save as draft')}</button>
      <p class="help" id="st" aria-live="polite"></p><div id="notes"></div></div>`,
    after(root) {
      const file = root.querySelector('#pdf'), st = root.querySelector('#st'), notes = root.querySelector('#notes'), buttons = [...root.querySelectorAll('#pub,#draft')];
      file.addEventListener('change', () => buttons.forEach((b) => { b.disabled = !file.files[0]; }));
      const run = async (publish) => {
        const f = file.files[0]; if (!f) return;
        buttons.forEach((b) => { b.disabled = true; }); notes.innerHTML = '';
        const say = (m) => { st.textContent = m; };
        try {
          if (!/\.pdf$/i.test(f.name) || f.size > MAX_BYTES) throw new Error('bad-file');
          const bytes = new Uint8Array(await f.arrayBuffer());
          if (String.fromCharCode(...bytes.slice(0, 4)) !== '%PDF') throw new Error('bad-file');
          say(t('Reading the PDF…'));
          const pdfjs = await loadPdfjs();
          const [{ extract, PdfProblem }, { findImages, pairImages }, { fetchCrossref, applyCrossref }] = await Promise.all([import('../pdf/extract.js'), import('../pdf/images.js'), import('../pdf/crossref.js')]);
          let res;
          try { res = await extract(pdfjs, bytes.slice()); } catch (e) { if (e instanceof PdfProblem) throw new Error('encrypted'); throw e; }
          if (res.warnings.includes('no_text')) throw new Error('no_text');
          const data = res.data, warnings = [...res.warnings];
          const doi = (root.querySelector('#doi').value.trim() || data.doi || '').replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
          data.doi = doi;
          say(t('Looking up the paper on Crossref…'));
          const cr = doi ? await fetchCrossref(doi) : null;
          if (cr) applyCrossref(data, cr); else warnings.push(doi ? 'crossref_unreachable' : 'no_doi');
          if (!data.title) { data.title = f.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim(); warnings.push('no_title'); }
          if (!data.authors_detail || !data.authors_detail.length) warnings.push('no_authors');

          let existing = null;
          if (doi) { const q = await getDocs(query(collection(db, 'publications'), where('doi', '==', doi), limit(1))); if (!q.empty) existing = { _id: q.docs[0].id, ...q.docs[0].data() }; }
          if (existing && !(await confirmBox(t('A paper with this DOI already exists ("%(title)s"). Replace its article content with this PDF?', { title: existing.title_en || existing._id })))) { say(''); buttons.forEach((b) => { b.disabled = false; }); return; }

          say(t('Extracting figures…'));
          let images = {}, blobs = [];
          try {
            const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, verbosity: 0 }).promise;
            const paired = pairImages(data.figures, await findImages(pdfjs, doc));
            blobs = paired.images; if (paired.mismatch) warnings.push('figure_count_mismatch');
          } catch { warnings.push('images_failed'); }

          const stg = await publicSettings();
          const { cloud, preset } = cloudinaryConfig(stg);
          let pdfUrl = '';
          if (cloud && preset) {
            say(t('Uploading files…'));
            try {
              pdfUrl = await uploadMedia(f, stg, { resource: 'raw', folder: 'sianexis/papers' });
              for (const im of blobs) images[im.number] = await uploadMedia(new File([im.blob], `fig${im.number}.png`, { type: 'image/png' }), stg, { resource: 'image', folder: 'sianexis/papers' });
            } catch { warnings.push('upload_failed'); }
          } else warnings.push('no_cloudinary');

          say(t('Saving…'));
          const id = existing ? existing._id : await freeSlug('publications', articleSlug(data));
          const base = existing || { slug: id };
          const docData = buildPublication(data, { pdf: pdfUrl, images, publish, existing: base });
          docData.slug = id;
          await saveContent('publications', id, docData, { isNew: !existing, label: 'imported from PDF' });

          const texts = WARNINGS();
          const list = warnings.filter((w) => texts[w]).map((w) => texts[w]);
          for (const w of warnings) { const m = /^table_(\d+)_needs_manual_entry$/.exec(w); if (m) list.push(t('Table %(n)s could not be rebuilt automatically: add it under Figures & tables.', { n: m[1] })); }
          say('');
          toast(publish ? t('The paper was published.') : t('Saved as a draft.'));
          notes.innerHTML = `<h3>✓ ${esc(docData.title_en)}</h3><p>${esc(t('%(a)s authors · %(s)s sections · %(f)s figures and tables · %(r)s references', { a: docData.author_list.length, s: docData.sections.length, f: docData.figures.length, r: docData.references.length }))}</p>`
            + (list.length ? `<div class="ad-warn"><strong>${esc(t('Please check:'))}</strong><ul>${list.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '')
            + `<p><a class="ad-btn" href="/admin/c/publications/${encodeURIComponent(id)}">${esc(t('Review and edit'))}</a> <a class="ad-btn line" href="/en/publications/${encodeURIComponent(id)}/" target="_blank" rel="noopener">${esc(t('View'))}</a></p>`;
          buttons.forEach((b) => { b.disabled = false; });
        } catch (e) {
          console.error(e);
          const map = { 'bad-file': t('The file is not a valid PDF or is larger than 40 MB.'), encrypted: t('This PDF is password-protected. Remove the password and try again.'),
            no_text: t('This PDF has no selectable text (it looks scanned). Use a text PDF or add the article manually.') };
          say(''); toast(map[e.message] || t('The PDF could not be read. Try another file.'), 'error');
          buttons.forEach((b) => { b.disabled = !file.files[0]; });
        }
      };
      root.querySelector('#pub').addEventListener('click', () => run(true));
      root.querySelector('#draft').addEventListener('click', () => run(false));
    },
  };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
