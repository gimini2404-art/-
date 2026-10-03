import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extract } from '../../src/pdf/extract.js';
import { applyCrossref } from '../../src/pdf/crossref.js';
import { pairImages } from '../../src/pdf/images.js';
import { buildPublication } from '../../src/data/article.js';

const here = import.meta.dirname;
const bytes = (p) => new Uint8Array(fs.readFileSync(path.resolve(here, p)));
let bmc;
test.before(async () => { bmc = await extract(pdfjs, bytes('../../public/seed-media/paper.pdf')); });

test('two-column journal article: metadata, abstract and authors', () => {
  const d = bmc.data;
  assert.match(d.title, /mpox/i);
  assert.match(d.doi, /^10\.\d{4,9}\//);
  assert.ok(d.year >= 2000 && d.journal);
  assert.ok(d.authors_detail.length >= 3 && d.authors_detail.some((a) => a.affiliation));
  assert.ok(d.abstract_background && d.abstract_methods && d.abstract_results && d.abstract_conclusion);
});

test('sections, references, figures and tables are found', () => {
  const d = bmc.data;
  assert.ok(d.sections.length >= 4 && d.sections.every((s) => s.body.length > 20));
  assert.ok(d.references.length > 40 && d.references.every((r) => r.number && r.text));
  assert.ok(d.figures.filter((f) => f.kind === 'figure').length >= 2);
  const table = d.figures.find((f) => f.kind === 'table');
  assert.ok(table && /<table>/.test(table.table_html) && /Author and Year/.test(table.table_html));
  assert.ok(d.sections.some((s) => /\[\[fig:1\]\]/.test(s.body)));
});

test('table cells of narrow columns are not mixed together', () => {
  const t = bmc.data.figures.find((f) => f.kind === 'table').table_html;
  assert.ok(t.includes('The way the media “Washington post-WP” is presenting'));
});

test('a PDF without text is reported', async () => {
  const empty = Buffer.from('%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
  const r = await extract(pdfjs, new Uint8Array(empty)).catch(() => ({ warnings: ['no_text'] }));
  assert.ok(r.warnings.includes('no_text'));
});

test('Crossref merge: clean authors, licence, citations, reference DOIs', () => {
  const data = { title: 'T', authors_detail: [{ name: 'A. Smith', affiliation: 'Old', corresponding: true, email: 'a@x.org' }], references: [{ number: 1, text: 'Some ref. Title of paper here.' }] };
  const notes = applyCrossref(data, {
    volume: '12', 'container-title': ['Journal X'], published: { 'date-parts': [[2024, 3]] }, license: [{ URL: 'https://creativecommons.org/licenses/by/4.0/' }], 'is-referenced-by-count': 7,
    author: [{ given: 'Anna', family: 'Smith', ORCID: 'https://orcid.org/0000-0001-2345-6789', affiliation: [{ name: 'Cairo University' }] }],
    reference: [{ DOI: '10.1/abc', 'article-title': 'Title of paper here' }],
  });
  assert.deepEqual([data.journal, data.volume, data.year, data.published_date, data.license, data.open_access, data.citations], ['Journal X', '12', 2024, '2024-03-01', 'CC BY 4.0', true, 7]);
  assert.deepEqual(data.authors_detail[0], { name: 'Anna Smith', given_name: 'Anna', family_name: 'Smith', affiliation: 'Cairo University', corresponding: true, email: 'a@x.org', orcid: '0000-0001-2345-6789' });
  assert.equal(data.references[0].doi, '10.1/abc');
  assert.deepEqual(notes, ['authors', 'refs:1']);
  assert.deepEqual(applyCrossref({}, null), []);
});

test('images are paired with figure captions by page, then by order', () => {
  const figs = [{ kind: 'figure', number: 1, page: 3 }, { kind: 'figure', number: 2, page: 5 }, { kind: 'table', number: 1 }];
  const a = pairImages(figs, [{ page: 5, blob: 'b' }, { page: 3, blob: 'a' }]);
  assert.deepEqual(a.images.map((i) => [i.number, i.blob]), [[1, 'a'], [2, 'b']]); assert.equal(a.mismatch, false);
  const b = pairImages(figs, [{ page: 4, blob: 'x' }, { page: 6, blob: 'y' }]);
  assert.deepEqual(b.images.map((i) => i.number), [1, 2]);
  assert.equal(pairImages(figs, [{ page: 9, blob: 'z' }]).mismatch, true);
});

test('publication document built from the extraction', () => {
  const doc = buildPublication({ ...bmc.data, doi: '10.1/x' }, { pdf: 'https://x/p.pdf', images: { 1: 'https://x/f1.png' }, publish: false });
  assert.equal(doc.is_published, false); assert.equal(doc.kind, 'paper'); assert.equal(doc.title_en, bmc.data.title);
  assert.equal(doc.pdf, 'https://x/p.pdf'); assert.equal(doc.figures.find((f) => f.number === 1 && f.kind === 'figure').image, 'https://x/f1.png');
  assert.ok(doc.author_list.length && doc.sections.length && doc.references.length);
});
