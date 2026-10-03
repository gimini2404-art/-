// node tools/pdf_check.mjs file.pdf   -> prints what the browser PDF importer extracts (Node, legacy pdf.js build)
import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extract } from '../src/pdf/extract.js';

const file = process.argv[2];
const r = await extract(pdfjs, new Uint8Array(fs.readFileSync(file)));
const d = r.data;
console.log(JSON.stringify({ title: d.title, doi: d.doi, journal: d.journal, year: d.year, volume: d.volume, article_number: d.article_number, authors: d.authors_detail?.length,
  abstract: ['abstract', 'abstract_background', 'abstract_methods', 'abstract_results', 'abstract_conclusion'].filter((k) => d[k]), keywords: d.keywords,
  sections: d.sections?.map((s) => [s.kind, s.heading, s.body.length]), references: d.references?.length, figures: d.figures?.map((f) => [f.label, f.kind, !!f.table_html]),
  license: d.license, received: d.received_date, accepted: d.accepted_date, content_type: d.content_type, warnings: r.warnings }, null, 1));
if (process.argv[3] === 'full') fs.writeFileSync('/tmp/js_extract.json', JSON.stringify(r, null, 1));
