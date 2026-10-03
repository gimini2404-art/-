/* Best-effort extraction of a scientific article from a PDF (port of core/pdf_extract.py).
   Works on text PDFs with common journal layouts; everything it returns is meant to be reviewed before publishing. */
import { readLines, PdfProblem } from './read.js';

export { PdfProblem };

const DOI_RE = /\b(10\.\d{4,9}\/[^\s"<>]+?)(?=[\s"<>]|[.,;:)\]]+(?:\s|$)|$)/;
const MONTHS = Object.fromEntries(['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].map((m, i) => [m, i + 1]));

const TOP_LEVEL = [
  [/^introduction$/, 'introduction'], [/^background$/, 'background'], [/^(materials and )?methods?$/, 'methods'], [/^methodology$/, 'methodology'],
  [/^results?( and discussion)?$/, 'results'], [/^discussion$/, 'discussion'], [/^limitations?( and (future|strengths).*)?$/, 'limitations'],
  [/^conclusions?( and .*)?$/, 'conclusion'], [/^(availability of )?data( and materials?)?( availability)?$/, 'data_availability'],
  [/^(declarations?|ethics( declarations?)?)$/, '_declarations'], [/^references?$|^bibliography$/, '_references'], [/^abstract$/, '_abstract'],
  [/^author and article information$|^article information$/, '_skip'], [/^(supplementary (information|material)s?|publisher.?s note|abbreviations?)$/, '_skip'],
];
const DECLARATION_HEADS = /^(ethics approval.*|consent.*|data availability|competing interests?|conflicts? of interest.*|funding|acknowledg(e)?ments?|author contributions?|authors.? contributions?|availability of data.*|declarations?)$/i;
const ABSTRACT_LABELS = {
  background: 'abstract_background', introduction: 'abstract_background', objective: 'abstract_background', objectives: 'abstract_background', aim: 'abstract_background', aims: 'abstract_background',
  purpose: 'abstract_background', methods: 'abstract_methods', method: 'abstract_methods', methodology: 'abstract_methods', design: 'abstract_methods', results: 'abstract_results',
  findings: 'abstract_results', conclusion: 'abstract_conclusion', conclusions: 'abstract_conclusion', interpretation: 'abstract_conclusion',
};
const LAB = 'Background|Introduction|Aims?|Objectives?|Purpose|Methods?|Methodology|Design|Results|Findings|Conclusions?|Interpretation';
const CRED = /^(M\.?\s?D|M\.?\s?Sc|Ph\.?\s?D|M\.?P\.?H|M\.?B\.?B\.?S|B\.?Sc|Pharm\.?D|D\.?D\.?S|R\.?N|M\.?R\.?C\.?P|F\.?R\.?C\.?P|M\.?Phil|MBA|MS|MA|BA|Prof|Dr)\.?$/i;
const AFF_WORDS = /\b(Department|University|Universit[yé]|Faculty|Institute|Hospital|College|School|Cent(er|re)|Laborator|Ministry|Academy|Clinic)\b|@/i;

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z ]/g, '').trim();
const strip = (s, chars) => { let a = 0, b = s.length; while (a < b && chars.includes(s[a])) a++; while (b > a && chars.includes(s[b - 1])) b--; return s.slice(a, b); };
const rstrip = (s, chars) => { let b = s.length; while (b > 0 && chars.includes(s[b - 1])) b--; return s.slice(0, b); };
const mostCommon = (arr) => { const m = new Map(); arr.forEach((x) => m.set(x, (m.get(x) || 0) + 1)); let best = null, n = 0; for (const [k, v] of m) if (v > n) { best = k; n = v; } return best; };
const titleCase = (s) => s.toLowerCase().replace(/(^|\s)(\S)/g, (_, a, b) => a + b.toUpperCase());
const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function bodySize(lines) {
  const c = new Map();
  lines.forEach((l) => { if (l.text.length >= 30) c.set(l.size, (c.get(l.size) || 0) + l.text.length); }); // table cells and labels are short; running text is not
  let best = 10, n = -1;
  for (const [k, v] of c) if (v > n) { best = k; n = v; }
  return best;
}

function dropRunning(lines, dims) {
  const key = (l) => { const n = norm(l.text); return (n || l.text).replace(/\d+/g, '#'); };
  const isEdge = (l) => l.top < dims[l.page][1] * 0.075 || l.top > dims[l.page][1] * 0.93;
  const count = new Map();
  lines.filter(isEdge).forEach((l) => count.set(key(l), (count.get(key(l)) || 0) + 1));
  const npages = Math.max(...Object.keys(dims).map(Number), 1);
  const bad = new Set([...count].filter(([, v]) => v >= Math.max(2, Math.floor(npages / 3))).map(([k]) => k));
  return lines.filter((l) => !(isEdge(l) && (bad.has(key(l)) || /^(page )?\d+( of \d+)?$/i.test(l.text.trim()))));
}

function orderLines(lines, dims) {
  const out = [];
  for (const pno of Object.keys(dims).map(Number).sort((a, b) => a - b)) {
    const w = dims[pno][0];
    const pl = lines.filter((l) => l.page === pno).sort((a, b) => (Math.round(a.top) - Math.round(b.top)) || (a.x0 - b.x0));
    const mid = w / 2;
    const left = pl.filter((l) => l.x1 < mid + 8).length, right = pl.filter((l) => l.x0 > mid - 8).length;
    if (!(left >= 6 && right >= 6)) { pl.forEach((l) => { l.col = 0; l.band = 0; }); out.push(...pl); continue; }
    const wide = (l) => l.x0 < mid - 12 && l.x1 > mid + 12;
    const seq = []; let buf = [];
    for (const l of pl) {
      if (wide(l)) { if (buf.length) { seq.push(['cols', buf]); buf = []; } seq.push(['wide', [l]]); } else buf.push(l);
    }
    if (buf.length) seq.push(['cols', buf]);
    for (const [kind, items] of seq) {
      if (kind === 'wide') { items[0].col = 0; out.push(items[0]); } else {
        const L = items.filter((l) => l.x0 < mid - 5).sort((a, b) => a.top - b.top), R = items.filter((l) => l.x0 >= mid - 5).sort((a, b) => a.top - b.top);
        L.forEach((l) => { l.col = 1; }); R.forEach((l) => { l.col = 2; });
        out.push(...L, ...R);
      }
    }
  }
  return out;
}

function buildVocab(lines) {
  const v = new Map();
  for (const l of lines) for (const w of l.text.match(/[A-Za-z][A-Za-z\-’']*[A-Za-z]/g) || []) if (!l.text.endsWith(w + '-')) v.set(w.toLowerCase(), (v.get(w.toLowerCase()) || 0) + 1);
  return v;
}
const V = (vocab, k) => vocab.get(k) || 0;

function join(a, b, vocab) {
  if (a.endsWith('-') && /^[a-z]/.test(b)) {
    const last = a.split(' ').pop();
    if (/[/:]|https?/.test(last)) return a + b;
    const stem = last.replace(/[^A-Za-z’']/g, ''), first = b.split(' ')[0].replace(/[^A-Za-z’']/g, '');
    const joined = (stem + first).toLowerCase(), hy = (stem + '-' + first).toLowerCase();
    return V(vocab, hy) > 0 && V(vocab, joined) === 0 ? a + b : a.slice(0, -1) + b;
  }
  return a + ' ' + b;
}

function parseDate(text) {
  const m = /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(text || '');
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3].padStart(4, '0')}-${String(MONTHS[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

function slugKind(text) {
  const n = norm(text);
  for (const [rx, kind] of TOP_LEVEL) if (rx.test(n)) return kind;
  return null;
}

const trunc = (n) => Math.round(n * 10) / 10;

export async function extract(pdfjs, bytes) {
  const res = { data: {}, images: [], warnings: [] };
  let { lines, dims } = await readLines(pdfjs, bytes);
  const rawLines = lines.slice(0, 600);
  if (!lines.length || lines.reduce((n, l) => n + l.text.length, 0) < 800) { res.warnings.push('no_text'); return res; }
  const bsize = bodySize(lines);
  lines = dropRunning(lines, dims);
  lines = orderLines(lines, dims);
  const vocab = buildVocab(lines);
  const d = (res.data = { sections: [], references: [], figures: [], authors_detail: [] });

  const first = lines.filter((l) => l.page === 1);
  let front = first.map((l) => l.text).join(' ');
  front = front.replace(/(10\.\d{4,9}\/\S*[./-])\s+([a-z0-9]\S*)/g, '$1$2');
  const dm = DOI_RE.exec(front);
  d.doi = dm ? rstrip(dm[1], '.,;') : '';
  for (const l of first) {
    const jm = /^([A-Z][A-Za-z&: ]+?)\.?\s+(\d{4});\s*(\d+)(?:\(\d+\))?:(\d+)\s*[–‐-]\s*(\d+)/.exec(l.text.trim());
    if (jm) { Object.assign(d, { journal: jm[1].trim(), year: +jm[2], volume: jm[3], article_number: `${jm[4]}–${jm[5]}` }); break; }
  }

  // title: largest text on page 1
  const big = Math.max(...first.map((l) => l.size), bsize);
  const tl = first.filter((l) => l.size >= big - 0.3 && l.text.length > 3);
  d.title = big > bsize + 1.5 ? tl.map((l) => l.text).join(' ').trim() : '';
  const titleEnd = tl.length ? Math.max(...tl.map((l) => first.indexOf(l))) : -1;

  const runHead = /et al\.?\s+(.+?)\s*\((\d{4})\)\s*(\d+):(\d+)/;
  const rows = new Map(); // running headers are often split in two pieces on the same baseline
  for (const l of rawLines) { const k = `${l.page}:${Math.round(l.top / 2)}`; if (!rows.has(k)) rows.set(k, []); rows.get(k).push(l); }
  const rowTexts = [...rows.values()].map((r) => r.sort((a, b) => a.x0 - b.x0).map((l) => l.text).join(' '));
  for (const txt of [...lines.map((l) => l.text), ...rowTexts]) { const hm = runHead.exec(txt); if (hm) { Object.assign(d, { journal: hm[1].trim(), year: +hm[2], volume: hm[3], article_number: hm[4] }); break; } }

  // abstract + keywords (page 1), authors (between title and abstract)
  let absI = first.findIndex((l) => /^abstract$/i.test(l.text.trim()) || norm(l.bold_prefix) === 'abstract');
  if (absI < 0) absI = null;
  let unheaded = null;
  const labRx = new RegExp(`^(Background|Introduction|Aims?|Objectives?|Purpose|Methods?|Methodology|Design|Results|Findings|Conclusions?)\\s*:\\s`, 'i');
  if (absI === null) {
    const starts = first.filter((l) => l.size < bsize - 0.3 && labRx.test(l.text));
    if (new Set(starts.map((l) => labRx.exec(l.text)[1].toLowerCase())).size >= 3) {
      const fs = starts[0];
      const box = first.filter((l) => Math.abs(l.size - fs.size) < 0.05 && l.top >= fs.top - 1);
      unheaded = { fs, box };
      absI = first.indexOf(fs);
    }
  }
  let authorLines = [];
  if (absI !== null && titleEnd >= 0) {
    authorLines = first.slice(titleEnd + 1, absI).filter((l) => l.size >= bsize - 0.5 && !/^(research|review|open access|case|original)/i.test(l.text));
    authorLines.sort((a, b) => (Math.round(a.top / 3) - Math.round(b.top / 3)) || (a.x0 - b.x0));
  }
  authorLines = authorLines.filter((l) => !AFF_WORDS.test(l.text));
  const rawDigits = authorLines.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim();
  const people = [];
  if (!/\d/.test(rawDigits) && rawDigits.split(',').some((x) => CRED.test(x.trim()))) {
    for (let tok of rawDigits.split(/,|\band\b/)) {
      tok = strip(tok, ' .');
      if (tok && !CRED.test(tok) && tok.split(/\s+/).length >= 2 && tok.length < 60) people.push([tok, [], false]);
    }
  }
  if (!people.length) {
    const rx = /([A-Z][^,\d*]*?[A-Za-z’'.])\s*(\d{1,2}(?:\s*,\s*\d{1,2})*)?\s*(\*)?\s*(?:,|\band\b|$)/g;
    let m2;
    while ((m2 = rx.exec(rawDigits))) {
      if (m2[0] === '') { rx.lastIndex++; continue; }
      let nm = strip(m2[1].replace(/\s+/g, ' '), ' ,');
      nm = nm.replace(/^and\s+/, '');
      if (nm.split(/\s+/).length >= 2) people.push([nm, (m2[2] || '').match(/\d+/g)?.map(Number) || [], !!m2[3]]);
    }
  }
  // affiliations: small numbered lines on page 1
  const aff = {};
  const small1 = first.filter((l) => l.size < bsize - 0.5 && !/Correspondence|©|Creative Commons|Open Access|permits use|licen[sc]e|^\*/.test(l.text));
  const blocks1 = new Map();
  small1.forEach((l) => { if (!blocks1.has(l.col)) blocks1.set(l.col, []); blocks1.get(l.col).push(l); });
  for (const [, ls2] of blocks1) {
    const sorted = [...ls2].sort((a, b) => a.top - b.top);
    const rows = []; let row = [];
    for (const l of sorted) { if (row.length && l.top - row[0].top > 2.0) { rows.push(row.sort((a, b) => a.x0 - b.x0)); row = []; } row.push(l); }
    if (row.length) rows.push(row.sort((a, b) => a.x0 - b.x0));
    let curN = null;
    for (const r of rows) for (const l of r) {
      const t2 = l.text.trim();
      const mm = /^(\d{1,2})$/.exec(t2) || /^(\d{1,2})\s*([A-Z].*)/.exec(t2);
      if (mm && (r.length === 1 || l === r[0])) { curN = +mm[1]; aff[curN] = mm[2] ? [mm[2]] : []; } else if (curN !== null) (aff[curN] ||= []).push(t2);
    }
  }
  const emailM = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.exec(first.map((l) => l.text).join(' '));
  d.authors = people.map(([n]) => n).join(', ');
  for (const [nm, nums, star] of people) {
    const affil = nums.filter((n) => aff[n]?.length).map((n) => aff[n].join(' ').trim()).join('; ');
    d.authors_detail.push({ name: nm, affiliation: affil.replace(/\s+/g, ' '), corresponding: star, email: star && emailM ? emailM[0] : '' });
  }

  let absEnd = 0, cutTop = 0;
  if (unheaded) {
    let flat = '';
    for (const bl of unheaded.box) flat = flat ? join(flat, bl.text, vocab) : bl.text;
    flat = flat.replace(/‐\s+(?=[a-z])/g, '‐');
    const labs = [...flat.matchAll(new RegExp(`(?:^|(?<=[.!?]\\s))(${LAB.replace('|Interpretation', '')})\\s*:\\s`, 'g'))];
    labs.forEach((lm, i2) => {
      const end = i2 + 1 < labs.length ? labs[i2 + 1].index : flat.length;
      const k2 = ABSTRACT_LABELS[lm[1].toLowerCase()];
      d[k2] = ((d[k2] || '') + ' ' + flat.slice(lm.index + lm[0].length, end).trim()).trim();
    });
    const kw = first.find((l) => /^keywords?\b/i.test(l.text));
    d.keywords = kw ? strip(kw.text.replace(/^keywords?\s*[:-]?\s*/i, ''), ', ') : '';
    d.subjects = d.keywords;
    cutTop = Math.max(...unheaded.box.map((l) => l.top));
  } else if (absI !== null) {
    let cur = null; const abstract = {};
    let j = absI + 1;
    while (j < first.length) {
      const l = first[j];
      if (/^keywords?\b/i.test(l.text)) {
        d.keywords = l.text.replace(/^keywords?\s*[:-]?\s*/i, '').trim();
        let k = j + 1;
        while (k < first.length && first[k].size <= l.size + 0.2 && first[k].bold === false && !first[k].bold_prefix && first[k].text.length < 90 && k === j + 1) { d.keywords += ' ' + first[k].text; k++; }
        break;
      }
      const lab = norm(l.bold_prefix);
      if (lab in ABSTRACT_LABELS && l.bold_prefix.length < 20) { cur = ABSTRACT_LABELS[lab]; abstract[cur] = l.text.slice(l.bold_prefix.length).trim(); }
      else if (cur) abstract[cur] = join(abstract[cur], l.text, vocab);
      else abstract.abstract = ((abstract.abstract || '') + ' ' + l.text).trim();
      j++;
    }
    Object.assign(d, abstract);
    const flat = d.abstract || '';
    const labels = [...flat.matchAll(new RegExp(`(?:^|(?<=[.!?]\\s))(Background|Introduction|Objectives?|Aims?|Purpose|Methods?|Methodology|Design|Results|Findings|Conclusions?|Interpretation)\\s*[:.]\\s`, 'g'))];
    if (flat && labels.length >= 2 && !d.abstract_background) {
      d.abstract = '';
      labels.forEach((lm, i2) => {
        const end = i2 + 1 < labels.length ? labels[i2 + 1].index : flat.length;
        const k2 = ABSTRACT_LABELS[lm[1].toLowerCase()];
        d[k2] = ((d[k2] || '') + ' ' + flat.slice(lm.index + lm[0].length, end).trim()).trim();
      });
    }
    d.keywords = strip(d.keywords || '', ', ');
    d.subjects = d.keywords;
    absEnd = j + 1;
  } else res.warnings.push('no_abstract');

  // licence / open access / dates
  const allText = lines.map((l) => l.text).join(' ');
  const blob = allText.replace(/‐/g, '-');
  const cc = /Creative Commons (Attribution(?:-\w+)*)\s*(?:License\s*)?(\d\.\d)?/.exec(blob);
  if (cc) {
    const parts = { Attribution: 'CC BY', 'Attribution-NonCommercial': 'CC BY-NC', 'Attribution-NoDerivs': 'CC BY-ND', 'Attribution-ShareAlike': 'CC BY-SA' };
    const ver = cc[2] || '4.0';
    d.license = `${parts[cc[1]] || 'CC BY'} ${ver}`;
    d.license_url = d.license.startsWith('CC BY ') ? `https://creativecommons.org/licenses/by/${ver}/` : '';
    d.open_access = true;
    const rm = /©.{0,40}Open Access This article is licensed.*?(?:otherwise stated in a credit line to the data\.?|credit line to the data\.)/.exec(blob);
    if (rm) d.rights_text = rm[0];
  }
  let rec = (/Received:?\s*(\d{1,2} \w+ \d{4})/.exec(blob) || [])[1], acc = (/Accepted:?\s*(\d{1,2} \w+ \d{4})/.exec(blob) || [])[1];
  if (!rec) { const r2 = /Received\s+([A-Z][a-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(blob); rec = r2 ? `${r2[2]} ${r2[1]} ${r2[3]}` : null; }
  if (!acc) { const a2 = /accepted\s+([A-Z][a-z]+)\s+(\d{1,2}),?\s*(\d{4})/.exec(blob); acc = a2 ? `${a2[2]} ${a2[1]} ${a2[3]}` : null; }
  if (!d.authors_detail.some((a) => a.affiliation)) {
    const am = /AUTHOR AND ARTICLE INFORMATION\s*(.*?)(?:Send correspondence|This is an open access|©|Received )/s.exec(allText);
    if (am) {
      const rx = /([^()]+?)\s*\(([\p{L}][\p{L}\p{N}_’' -]+(?:,\s*[\p{L}][\p{L}\p{N}_’' -]+)*)\)/gu;
      let im;
      while ((im = rx.exec(am[1]))) {
        let inst = strip(im[1].replace(/(\w)-\s+(?=[a-z])/g, '$1').replace(/\s+/g, ' '), ' ;,.');
        inst = inst.replace(/^and\s+/, '');
        for (const sn of im[2].split(/,\s*/)) for (const a of d.authors_detail) {
          if (a.name.split(/\s+/).pop().toLowerCase() === sn.trim().toLowerCase()) a.affiliation = strip((a.affiliation ? a.affiliation + '; ' : '') + inst, '; ');
        }
      }
    }
  }
  if (d.authors_detail.length && !d.authors_detail.some((a) => a.email)) {
    const cm = /correspondence to (?:Dr\.|Prof\.|Mr\.|Ms\.)?\s*([A-Z][\w’'-]+)\s*\(([^)]*@[^)]*)\)/.exec(allText.replace(/- /g, '-'));
    if (cm) for (const a of d.authors_detail) if (a.name.split(/\s+/).pop().toLowerCase() === cm[1].toLowerCase()) { a.corresponding = true; a.email = cm[2].replace(/\s+/g, ''); }
  }
  d.received_date = rec ? parseDate(rec) : null;
  d.accepted_date = acc ? parseDate(acc) : null;
  let ctype = 'research';
  const head = first.slice(0, 6).map((l) => l.text).join(' ').toLowerCase();
  for (const [word, t2] of [['review', 'review'], ['case report', 'case_study'], ['case study', 'case_study'], ['short report', 'short_report'], ['brief report', 'short_report']]) {
    if (new RegExp(`^\\W*${word}\\b`).test(head) || new RegExp(`\\b${word}\\s+open access`).test(head)) ctype = t2;
  }
  d.content_type = ctype;

  // body
  let rest;
  if (unheaded) { const ids = new Set(unheaded.box); rest = lines.filter((l) => l.page > 1 || (l.top > cutTop && !ids.has(l))); }
  else rest = lines.filter((l) => l.page > 1 || (first.includes(l) && first.indexOf(l) >= absEnd));
  const bodyLines = [], refLines = [];
  let inRefs = false;
  for (const l of rest) {
    const t2 = l.text.trim();
    const caps = t2 === t2.toUpperCase() && /[A-Z]/.test(t2) && t2.length < 60;
    const k = (l.bold || l.bold_prefix === t2 || l.size > bsize + 0.2 || caps) ? slugKind(t2) : null;
    if (k === '_references') { inRefs = true; continue; }
    if (inRefs) {
      if (/^publisher.?s note/i.test(t2) || (k && k !== '_references' && l.size >= bsize - 0.3 && l.bold && k !== '_skip')) inRefs = false;
      else { refLines.push(l); continue; }
    }
    bodyLines.push(l);
  }

  // captions
  const capRe = /^(Fig\.?|Figure|Table)\s*(S?\d+)\b[.:]?\s*(.*)/i;
  const clean = [], tables = {}, figCaps = {}, consumed = new Set();
  for (const l of bodyLines) {
    const m = capRe.exec(l.text.trim());
    if (m && m[1].toLowerCase() === 'table' && (l.bold_prefix || l.size < bsize - 0.2) && !m[2].startsWith('S')) {
      const tl2 = bodyLines.filter((x) => x.page === l.page && x.top > l.top + 3 && x.size < bsize - 0.25 && x !== l && !capRe.test(x.text.trim()));
      tables[+m[2]] = { cap_line: l, lines: tl2 };
      tl2.forEach((x) => consumed.add(x));
    }
  }
  let j = 0;
  while (j < bodyLines.length) {
    const l = bodyLines[j];
    if (consumed.has(l)) { j++; continue; }
    const m = capRe.exec(l.text.trim());
    if (m && (l.bold_prefix || l.size < bsize - 0.2) && !m[2].startsWith('S')) {
      const kind = m[1].toLowerCase() === 'table' ? 'table' : 'figure';
      const num = +m[2];
      let cap = m[3];
      let k2 = j + 1;
      while (k2 < bodyLines.length && !consumed.has(bodyLines[k2]) && bodyLines[k2].page === l.page && bodyLines[k2].size <= l.size + 0.3 && !capRe.test(bodyLines[k2].text)
        && bodyLines[k2].top - bodyLines[k2 - 1].top > 0 && bodyLines[k2].top - bodyLines[k2 - 1].top < l.size * 2.0 && bodyLines[k2].size < bsize - 0.2 && !bodyLines[k2].bold_prefix) {
        cap = cap ? join(cap, bodyLines[k2].text, vocab) : bodyLines[k2].text; k2++;
      }
      const label = `${kind === 'table' ? 'Table' : 'Fig.'} ${num}`;
      if (kind === 'table') { if (tables[num]) Object.assign(tables[num], { label, caption: cap.trim(), page: l.page }); }
      else figCaps[num] = { label, caption: cap.trim(), page: l.page, top: l.top };
      j = k2; continue;
    }
    clean.push(l); j++;
  }
  for (const n of Object.keys(tables)) { tables[n].caption ??= ''; tables[n].label ??= `Table ${n}`; tables[n].page ??= tables[n].cap_line.page; }

  // paragraphs
  const paras = [];
  const newpar = (kind, text, extra = {}) => paras.push({ kind, text, ...extra });
  const stepC = new Map();
  for (let i = 0; i + 1 < clean.length; i++) {
    const a = clean[i], b = clean[i + 1];
    if (a.page === b.page && a.col === b.col && b.top - a.top > 0 && b.top - a.top < 30) { const k = trunc(b.top - a.top); stepC.set(k, (stepC.get(k) || 0) + 1); }
  }
  let lh = bsize * 1.2; { let n = 0; for (const [k, v] of stepC) if (v > n) { lh = k; n = v; } }
  const colLeft = new Map();
  for (const l of clean) if (Math.abs(l.size - bsize) < 0.6) { const k = `${l.page}:${l.col}`; colLeft.set(k, Math.min(colLeft.get(k) ?? 1e9, l.x0)); }
  let prev = null, declOpen = false;
  const maxX1 = (page, col) => Math.max(...clean.filter((x) => x.page === page && x.col === col).map((x) => x.x1));
  for (const l of clean) {
    const t2 = l.text.trim();
    const small = l.size < bsize - 0.5;
    const k = slugKind(t2);
    const caps = t2 === t2.toUpperCase() && /[A-Z]/.test(t2) && t2.length < 60 && !!k;
    const isHead = (l.bold || caps || (l.bold_prefix && l.bold_prefix === t2)) && t2.length < 110 && !/[,;]$/.test(t2) && (l.size >= bsize - 0.8 || DECLARATION_HEADS.test(t2) || !!k);
    if (isHead && k && k !== '_references') { declOpen = declOpen || k === '_declarations'; newpar('h2', t2.replace(/^\d+(\.\d+)*\.?\s*/, ''), { kind_hint: k }); prev = null; continue; }
    if (isHead && DECLARATION_HEADS.test(t2)) declOpen = true;
    if (isHead && (DECLARATION_HEADS.test(t2) || t2.split(/\s+/).length <= 14)) {
      const lp0 = paras[paras.length - 1];
      if (lp0 && lp0.kind === 'h3' && prev && prev.bold && prev.page === l.page && Math.abs(l.top - prev.top) < lh * 1.4 && !lp0.closed) lp0.text = join(lp0.text, t2, vocab);
      else newpar('h3', t2.replace(/^\d+(\.\d+)*\.?\s+/, ''));
      prev = l; continue;
    }
    if (small && !declOpen) continue;
    if (/^(Received|Accepted|Published|Revised)\s*:/.test(t2)) continue;
    const col = colLeft.get(`${l.page}:${l.col}`) ?? 1e9;
    const dx = l.x0 - col;
    const bullet = /^[•·▪‣–-]\s+/.exec(t2);
    if (bullet) newpar('li', t2.slice(bullet[0].length));
    else if (!paras.length || ['h2', 'h3'].includes(paras[paras.length - 1].kind)) newpar('p', t2);
    else {
      const lp = paras[paras.length - 1];
      const gap = prev && prev.page === l.page && prev.col === l.col ? l.top - prev.top : 0;
      const indent = lh * 0.35 < dx && dx < lh * 2.6;
      if (lp.kind === 'li') {
        if ((dx > lh * 0.9 && !indent) || (dx >= lh * 1.3 && gap < lh * 1.7)) lp.text = join(lp.text, t2, vocab);
        else if (indent) newpar('p', t2);
        else lp.text = join(lp.text, t2, vocab);
      } else if ((indent && gap < lh * 3) || gap > lh * 1.55 || (prev && prev.x1 < (dims[l.page][0] * (l.col ? 0.5 : 0.9) - bsize * 3) && /[.!?]$/.test(prev.text.trimEnd()) && /^[A-Z]/.test(t2) && prev.col === l.col && prev.page === l.page && gap < lh * 1.5 && (prev.x1 - col) < 0.8 * (maxX1(l.page, l.col) - col))) newpar('p', t2);
      else lp.text = join(lp.text, t2, vocab);
    }
    prev = l;
  }

  // sections
  const outSections = new Map();
  let kind = unheaded ? 'introduction' : null, headTxt = unheaded ? 'Introduction' : null, buf = [], inDecl = false;
  const flush = () => {
    if (kind && buf.length) {
      const body = buf.join('\n\n').replace(/\n\n- /g, '\n- ');
      const key = JSON.stringify([kind, headTxt]);
      outSections.set(key, outSections.has(key) ? outSections.get(key) + '\n\n' + body : body);
    }
    buf = [];
  };
  for (const p of paras) {
    const t2 = p.text.trim();
    if (p.kind === 'h2') {
      const kh = p.kind_hint;
      if (kh === '_declarations') { flush(); kind = 'ethics'; headTxt = 'Ethics declarations'; inDecl = true; continue; }
      if (kh === '_skip' || kh === '_abstract') { flush(); kind = null; headTxt = null; continue; }
      flush(); inDecl = false;
      kind = kh; headTxt = t2 === t2.toUpperCase() ? titleCase(t2) : t2;
      if (kh === 'results') headTxt = t2;
      continue;
    }
    if (p.kind === 'h3') {
      if (DECLARATION_HEADS.test(t2) && !inDecl) {
        if (/^(availability of data|data availability)/i.test(t2)) { flush(); kind = 'data_availability'; headTxt = 'Data availability'; continue; }
        flush(); kind = 'ethics'; headTxt = 'Ethics declarations'; inDecl = true;
      }
      if (kind) buf.push('### ' + t2);
      continue;
    }
    if (kind) buf.push((p.kind === 'li' ? '- ' : '') + t2);
  }
  flush();
  for (const [key, body0] of outSections) {
    let [kd, hd] = JSON.parse(key);
    let body = body0;
    if (kd === 'data_availability' && body.startsWith('### ')) body = body.replace(/^### [^\n]*\n\n/, '');
    if (kd === 'ethics') {
      const m2 = /### (Availability of data[^\n]*|Data availability)\n\n([\s\S]*?)(?=\n\n### |$)/.exec(body);
      if (m2) { d.sections.push({ kind: 'data_availability', heading: 'Data availability', body: m2[2].trim() }); body = (body.slice(0, m2.index) + body.slice(m2.index + m2[0].length)).trim(); }
    }
    if (body) d.sections.push({ kind: kd, heading: kd !== 'ethics' ? hd : 'Ethics declarations', body: body.trim() });
  }
  // figure / table markers
  const figsOut = [], tablesOut = [];
  for (const num of Object.keys(figCaps).map(Number).sort((a, b) => a - b)) {
    const f = figCaps[num];
    figsOut.push({ label: f.label, kind: 'figure', caption: f.caption, number: num, page: f.page });
    insertMarker(d.sections, new RegExp(`\\b(Fig\\.?|Figure)\\s*${num}\\b`), `[[fig:${num}]]`);
  }
  for (const num of Object.keys(tables).map(Number).sort((a, b) => a - b)) {
    const f = tables[num];
    const [htmlT, note] = tableHtml(f.lines || []);
    tablesOut.push({ label: f.label, kind: 'table', caption: f.caption, number: num, table_html: htmlT, note });
    if (!htmlT) res.warnings.push(`table_${num}_needs_manual_entry`);
    insertMarker(d.sections, new RegExp(`\\bTable\\s*${num}\\b`), `[[table:${num}]]`);
  }
  d.figures = [...figsOut, ...tablesOut];
  d.references = parseReferences(refLines, vocab);
  if (!d.references.length) res.warnings.push('no_references');
  if (!d.sections.length) res.warnings.push('no_sections');
  d.abstract_present = !!(d.abstract || d.abstract_background);
  return res;
}

function insertMarker(sections, rx, marker) {
  for (const s of sections) {
    const paras = s.body.split('\n\n');
    for (let idx = 0; idx < paras.length; idx++) {
      const p = paras[idx];
      if (/^(### |- |\[\[)/.test(p)) continue;
      if (rx.test(p)) { paras.splice(idx + 1, 0, marker); s.body = paras.join('\n\n'); return true; }
    }
  }
  return false;
}

function tableHtml(tlines) {
  if (tlines.length < 6) return ['', ''];
  try {
    let ls = [...tlines].sort((a, b) => (a.top - b.top) || (a.x0 - b.x0));
    const note = []; const body = [...ls];
    const xsAll = [...new Set(ls.map((l) => Math.round(l.x0)))].sort((a, b) => a - b);
    const firstW = xsAll.length > 1 ? xsAll[1] - xsAll[0] : 60;
    while (body.length && body[body.length - 1].x0 <= xsAll[0] + 2 && (body[body.length - 1].x1 - body[body.length - 1].x0) > firstW + 40) note.unshift(body.pop());
    ls = body;
    const header = ls.filter((l) => Math.abs(l.top - ls[0].top) < 3);
    const xs = [...new Set(header.map((l) => Math.round(l.x0)))].sort((a, b) => a - b);
    const cols = [xs[0]];
    for (const x of xs.slice(1)) if (x - cols[cols.length - 1] > 14) cols.push(x);
    const n = cols.length;
    if (n < 2) return ['', ''];
    const colOf = (x) => { let idx = 0; cols.forEach((c, i) => { if (x >= c - 8) idx = i; }); return idx; };
    const percol = new Map();
    ls.forEach((l) => { const c = colOf(l.x0); if (!percol.has(c)) percol.set(c, []); percol.get(c).push(l.top); });
    const steps = [];
    for (const t of percol.values()) { const s = [...t].sort((a, b) => a - b); for (let i = 1; i < s.length; i++) { const dd = s[i] - s[i - 1]; if (dd > 4 && dd < 30) steps.push(trunc(dd)); } }
    const lh = steps.length ? mostCommon(steps) : 10;
    const gapstart = new Map();
    for (const [c, tops] of percol) {
      const s = [...tops].sort((a, b) => a - b);
      s.forEach((t, i) => { if (i === 0 || t - s[i - 1] > lh * 1.1) { const k = Math.round(t * 2) / 2; if (!gapstart.has(k)) gapstart.set(k, new Set()); gapstart.get(k).add(c); } });
    }
    const starts = [...gapstart.keys()].sort((a, b) => a - b).filter((t) => gapstart.get(t).size >= Math.max(2, Math.floor(n / 2)));
    if (!starts.length) return ['', ''];
    const rows = starts.map(() => new Map());
    for (const l of ls) {
      let ri = 0;
      if (l.top >= starts[0] - 1.5) { starts.forEach((t, i) => { if (l.top >= t - 1.5) ri = i; }); }
      const c = colOf(l.x0); if (!rows[ri].has(c)) rows[ri].set(c, []); rows[ri].get(c).push(l.text);
    }
    const cell = (parts) => { let out = ''; for (const p of parts || []) out = out.endsWith('-') && /^[a-z]/.test(p) ? out.slice(0, -1) + p : (out + ' ' + p).trim(); return esc(out); };
    let h = '<table><thead><tr>' + [...Array(n).keys()].map((i) => `<th>${cell(rows[0].get(i))}</th>`).join('') + '</tr></thead><tbody>';
    for (const r of rows.slice(1)) h += '<tr>' + [...Array(n).keys()].map((i) => `<td>${cell(r.get(i))}</td>`).join('') + '</tr>';
    return [h + '</tbody></table>', note.map((l) => l.text).join(' ')];
  } catch { return ['', '']; }
}

const NUM_ONLY = /^\[?(\d{1,3})[\].]?$/;
const INLINE = /^\[?(\d{1,3})[\].]\s+(\S.*)/;

function parseReferences(refLines, vocab) {
  const refs = new Map(); const blocks = new Map();
  for (const l of refLines) { const k = `${l.page}:${l.col}`; if (!blocks.has(k)) blocks.set(k, []); blocks.get(k).push(l); }
  let cur = null;
  for (const ls0 of blocks.values()) {
    const ls = [...ls0].sort((a, b) => a.top - b.top);
    const rows = []; let row = [];
    for (const l of ls) { if (row.length && l.top - row[0].top > 2.0) { rows.push(row.sort((a, b) => a.x0 - b.x0)); row = []; } row.push(l); }
    if (row.length) rows.push(row.sort((a, b) => a.x0 - b.x0));
    const left = Math.min(...ls.map((l) => l.x0));
    for (const r of rows) for (const l of r) {
      const t2 = l.text.trim();
      const mo = NUM_ONLY.exec(t2), m = INLINE.exec(t2);
      if (mo && l.x0 <= left + 6) { cur = +mo[1]; if (!refs.has(cur)) refs.set(cur, []); }
      else if (m && l.x0 <= left + 6) { cur = +m[1]; refs.set(cur, [m[2]]); }
      else if (cur !== null) { if (!refs.has(cur)) refs.set(cur, []); refs.get(cur).push(t2); }
    }
  }
  const out = [];
  for (const n of [...refs.keys()].sort((a, b) => a - b)) {
    const parts = refs.get(n).filter(Boolean);
    if (!parts.length) continue;
    let text = parts[0];
    for (const t2 of parts.slice(1)) {
      const last = text.split(' ').pop();
      const t0 = t2.split(' ')[0];
      if (/(https?:\/\/|doi\.org\/|\b10\.\d{4,9}\/)\S*[/.\-\u2010]$/.test(last) && /^[A-Za-z0-9]/.test(t2)) text += t2;
      else if (text.endsWith('-') && (/[/:]|https?/.test(last) || /^\d/.test(t2))) text += t2;
      else if (text.endsWith('-') && /^[a-z]/.test(t2)) {
        const stem = last.replace(/[^A-Za-z’']/g, ''), first = t0.replace(/[^A-Za-z’']/g, '');
        text = V(vocab, `${stem}-${first}`.toLowerCase()) > 0 && V(vocab, `${stem}${first}`.toLowerCase()) === 0 ? text + t2 : text.slice(0, -1) + t2;
      } else if (/(https?:\/\/|www\.)\S*$/.test(text) && !last.includes(' ') && !text.endsWith('.') && ((t0.split('/').length - 1) + (t0.split('-').length - 1)) > 0 && !/^[A-Z][a-z]+\.?$/.test(t0)) text += t2;
      else text += ' ' + t2;
    }
    text = text.replace(/‐/g, '-').replace(/\s+([.,;])/g, '$1').replace('doi. org', 'doi.org').replace('&#8230', '…');
    // join DOI / URL fragments broken over lines
    const mm = /^(.+?(?:et al|[A-Z]{1,3}|Organization|Agency|Prevention))\.\s+(.+?[.?])\s+(.*)$/s.exec(text);
    const [au, ti, so] = mm && !mm[1].includes('http') ? [mm[1], mm[2], mm[3]] : ['', '', ''];
    const doi = DOI_RE.exec(text), url = /https?:\/\/\S+/.exec(text);
    out.push({ number: n, text, authors: au, title: ti, source: so, doi: doi ? rstrip(doi[1], '.,;') : '', url: url ? rstrip(url[0], '.,;') : '' });
  }
  return out;
}
