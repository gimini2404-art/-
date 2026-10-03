// Compare the browser extractor with the Python reference output (/tmp/py_<name>.json made by the Django project).
import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extract } from '../src/pdf/extract.js';

const files = { bmc: '../core/fixtures/mpox_article/paper.pdf', wiley: '/tmp/wiley.pdf', one: '../core/fixtures/test_onecolumn.pdf' };
const only = process.argv[2];
let bad = 0;
for (const [name, path] of Object.entries(files)) {
  if (only && only !== name) continue;
  const py = JSON.parse(fs.readFileSync(`/tmp/py_${name}.json`, 'utf8')).data;
  const js = (await extract(pdfjs, new Uint8Array(fs.readFileSync(path)))).data;
  console.log(`\n== ${name}`);
  const cmp = (label, a, b) => { const A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) { bad++; console.log(`  ✗ ${label}\n     py: ${A?.slice(0, 220)}\n     js: ${B?.slice(0, 220)}`); } else console.log(`  ✓ ${label}`); };
  for (const k of ['title', 'doi', 'journal', 'year', 'volume', 'article_number', 'authors', 'keywords', 'subjects', 'license', 'license_url', 'open_access', 'received_date', 'accepted_date', 'content_type',
    'abstract', 'abstract_background', 'abstract_methods', 'abstract_results', 'abstract_conclusion', 'rights_text']) cmp(k, py[k] ?? null, js[k] ?? null);
  cmp('authors_detail', py.authors_detail, js.authors_detail);
  cmp('sections kinds', py.sections.map((s) => [s.kind, s.heading]), js.sections.map((s) => [s.kind, s.heading]));
  py.sections.forEach((s, i) => { const o = js.sections[i]; if (o && s.body !== o.body) { bad++; let p = 0; while (p < s.body.length && s.body[p] === o.body[p]) p++; console.log(`  ✗ section ${s.kind} body differs at ${p}/${s.body.length}\n     py: …${s.body.slice(Math.max(0, p - 40), p + 80).replace(/\n/g, '⏎')}\n     js: …${o.body.slice(Math.max(0, p - 40), p + 80).replace(/\n/g, '⏎')}`); } });
  cmp('figures', py.figures.map(({ page, image, ...r }) => r), js.figures.map(({ page, image, ...r }) => r));
  cmp('references count', py.references.length, js.references.length);
  const rd = py.references.filter((r, i) => JSON.stringify(r) !== JSON.stringify(js.references[i]));
  if (rd.length) { bad++; const r = rd[0]; const o = js.references.find((x) => x.number === r.number); console.log(`  ✗ ${rd.length} references differ, e.g. #${r.number}\n     py: ${JSON.stringify(r).slice(0, 260)}\n     js: ${JSON.stringify(o).slice(0, 260)}`); } else console.log('  ✓ references identical');
}
console.log(bad ? `\n${bad} differences` : '\nall identical');
