/* Small helpers: safe HTML templates, text formatting, slugs. No dependencies. */

class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = (s) => new Raw(String(s ?? ''));
export const isRaw = (v) => v instanceof Raw;

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

function render(v) {
  if (v == null || v === false || v === true) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  return esc(String(v));
}

/** Tagged template: interpolated values are HTML-escaped unless they are `raw()` or nested `html` results. */
export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += render(vals[i]) + strings[i + 1];
  return new Raw(out);
}

export const toHtml = (v) => render(v);

/** Django-style `linebreaks`: blank line = paragraph, single newline = <br>. Input is escaped. */
export function linebreaks(text) {
  const t = String(text ?? '').replace(/\r\n?/g, '\n').trim();
  if (!t) return raw('');
  return raw(t.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('\n'));
}

export function truncateWords(text, n) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  return words.length <= n ? words.join(' ') : words.slice(0, n).join(' ') + '…';
}

export function truncateChars(text, n) {
  const t = String(text ?? '');
  return t.length <= n ? t : t.slice(0, Math.max(0, n - 1)).trimEnd() + '…';
}

/** Escape text and turn bare URLs into links (Django `urlize`). */
export function urlize(text) {
  return raw(esc(text).replace(/\b(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"”])/g,
    (u) => `<a href="${u}" rel="noopener" target="_blank">${u}</a>`));
}

export function slugify(s, max = 80) {
  const base = String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '').trim().replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '');
  return base;
}

export const clone = (o) => JSON.parse(JSON.stringify(o));

export function debounce(fn, ms = 200) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** Simple hash (cyrb53) for stable document ids (e.g. one registration per e-mail and program). */
export function hash(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim());
export const isUrl = (s) => { try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; } };
