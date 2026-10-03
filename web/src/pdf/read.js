/* PDF -> text lines with font size / bold / position (the JavaScript counterpart of read_lines() in core/pdf_extract.py).
   `pdfjs` is the pdf.js module (browser build or the legacy build in Node). */

export class PdfProblem extends Error {}

const BOLD = /bold|black|heavy|semibold|demi|[-_ ][789]00$/i;
const ws = (s) => s.replace(/\s+/g, ' ');

export async function openPdf(pdfjs, bytes) {
  const task = pdfjs.getDocument({ data: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), useSystemFonts: true, isEvalSupported: false, verbosity: 0 });
  try { return await task.promise; } catch (e) {
    if (e && (e.name === 'PasswordException' || /password/i.test(e.message || ''))) throw new PdfProblem('encrypted');
    throw e;
  }
}

async function fontNames(page, items) {
  const names = {};
  try { await page.getOperatorList(); } catch { /* fonts may stay unresolved */ }
  for (const id of new Set(items.map((i) => i.fontName))) {
    // in the browser the font objects arrive from the worker asynchronously: wait for them (the sync form throws until they are ready)
    const f = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 4000);
      try { page.commonObjs.get(id, (o) => { clearTimeout(timer); resolve(o); }); } catch { clearTimeout(timer); resolve(null); }
    });
    names[id] = (f && (f.name || f.loadedName)) || id;
  }
  return names;
}

export async function readLines(pdfjs, bytes) {
  const doc = await openPdf(pdfjs, bytes);
  const lines = [], dims = {};
  for (let pno = 1; pno <= doc.numPages; pno++) {
    const page = await doc.getPage(pno);
    const view = page.view; // [x0, y0, x1, y1]
    const W = view[2] - view[0], H = view[3] - view[1];
    dims[pno] = [W, H];
    const tc = await page.getTextContent({ normalizeWhitespace: true });
    const raw = tc.items.filter((i) => typeof i.str === 'string' && i.transform && Math.abs(i.transform[1]) < 0.3 * Math.abs(i.transform[0] || 1)); // rotated (landscape / margin) text is not read
    const names = await fontNames(page, raw);
    const items = raw.map((i) => {
      const size = Math.hypot(i.transform[2], i.transform[3]) || Math.abs(i.transform[3]) || 0;
      return { str: i.str, x0: i.transform[4] - view[0], x1: i.transform[4] - view[0] + (i.width || 0), base: i.transform[5] - view[1], size, bold: BOLD.test(names[i.fontName] || ''), blank: !i.str.trim() };
    }).filter((i) => i.size > 0 && (!i.blank || i.str.length));
    // whitespace-only items are dropped from the layout, but remember that a space followed the previous word
    let ord = 0; items.forEach((i) => { if (!i.blank) i.ord = ord++; }); // stream order: words of one cell/line are drawn one after another
    items.forEach((i, k) => { if (i.blank) for (let j = k - 1; j >= 0; j--) if (!items[j].blank) { items[j].spAfter = true; break; } });
    // group into lines by baseline (superscripts sit slightly higher but overlap vertically)
    const sorted = [...items].filter((i) => !i.blank).sort((a, b) => b.base - a.base || a.x0 - b.x0);
    const groups = [];
    for (const it of sorted) {
      const g = groups.find((x) => Math.abs(x.base - it.base) <= 0.5 * Math.max(x.size, it.size));
      if (g) { g.items.push(it); if (it.size > g.size) { g.size = it.size; g.base = it.base; } } else groups.push({ base: it.base, size: it.size, items: [it] });
    }
    for (const g of groups) {
      const its = g.items.sort((a, b) => a.x0 - b.x0);
      // split into segments at large horizontal gaps (columns)
      const segs = [];
      let cur = [its[0]];
      for (let i = 1; i < its.length; i++) {
        const gap = its[i].x0 - cur[cur.length - 1].x1;
        if (gap > 1.0 * Math.max(its[i].size, cur[cur.length - 1].size) || (gap > 0.5 * its[i].size && Math.abs(its[i].ord - cur[cur.length - 1].ord) > 3)) { segs.push(cur); cur = []; }
        cur.push(its[i]);
      }
      segs.push(cur);
      for (const seg of segs) {
        const mx = Math.max(...seg.map((i) => i.size));
        if (mx < 6.2) continue; // vector-figure labels / micro text
        let text = '', bp = '', prefixOpen = true, nb = 0, ns = 0, plain = '';
        seg.forEach((it, idx) => {
          const prev = seg[idx - 1];
          const gap = prev ? it.x0 - prev.x1 : 0;
          const needSpace = prev && (gap > 0.12 * it.size || prev.spAfter) && !/\s$/.test(text) && !/^\s/.test(it.str);
          const piece = (needSpace ? ' ' : '') + it.str;
          text += piece;
          const nonSpace = it.str.replace(/\s/g, '').length;
          ns += nonSpace; if (it.bold) nb += nonSpace;
          if (prefixOpen) { if (it.bold || !nonSpace) bp += piece; else prefixOpen = false; }
          if (it.size >= mx * 0.78) plain += piece;
        });
        text = ws(text).trim();
        if (!text) continue;
        const x0 = Math.min(...seg.map((i) => i.x0)), x1 = Math.max(...seg.map((i) => i.x1));
        const topEdge = H - (g.base + g.size * 0.85);
        lines.push({ page: pno, x0, x1, top: topEdge, size: Math.round(mx * 10) / 10, bold: ns > 0 && nb / ns > 0.8, text, bold_prefix: ws(bp).trim(), plain: ws(plain).trim(), col: 0, band: 0 });
      }
    }
  }
  return { lines, dims };
}
