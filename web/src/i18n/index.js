import ar from './ar.json';

export const LANGS = [['en', 'English'], ['ar', 'العربية']];
export const DEFAULT_LANG = 'en';
let current = DEFAULT_LANG;

export function setLang(l) { current = LANGS.some(([c]) => c === l) ? l : DEFAULT_LANG; return current; }
export const getLang = () => current;
export const isRtl = () => current === 'ar';

/** Translate an English UI string; `{name}` / `%(name)s` placeholders are filled from vars. */
export function t(key, vars) {
  let s = current === 'ar' ? (ar.strings[key] ?? key) : key;
  if (vars) s = s.replace(/%\((\w+)\)s|\{(\w+)\}/g, (m, a, b) => (vars[a || b] ?? m));
  return s;
}

/** Plural-aware message. `one`/`many` are the English singular/plural msgids; Arabic uses the 6-form list in ar.plurals. */
export function tn(one, many, n, vars = {}) {
  const v = { counter: n, ...vars };
  const fill = (s) => s.replace(/%\((\w+)\)s/g, (m, k) => v[k] ?? m);
  if (current === 'ar' && ar.plurals[one]) {
    const forms = ar.plurals[one];
    const i = n === 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n % 100 >= 3 && n % 100 <= 10 ? 3 : n % 100 >= 11 ? 4 : 5;
    return fill(forms[i]);
  }
  return fill(n === 1 ? one : many);
}

/** Field value in the active language, falling back to English (like django-modeltranslation). */
export function tr(obj, field) {
  if (!obj) return '';
  const v = obj[`${field}_${current}`];
  if (v !== undefined && v !== null && v !== '') return v;
  return obj[`${field}_en`] ?? obj[field] ?? '';
}

const LOCALE = { en: 'en-GB', ar: 'ar-EG-u-nu-latn' };

/** Format a Date / Timestamp / ISO string, e.g. fmtDate(x) -> "2 October 2026". */
export function fmtDate(d, opts = { day: 'numeric', month: 'long', year: 'numeric' }) {
  const date = toDate(d);
  if (!date) return '';
  return new Intl.DateTimeFormat(LOCALE[current], opts).format(date);
}

export function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v.toDate === 'function') return v.toDate();
  if (typeof v === 'object' && 'seconds' in v) return new Date(v.seconds * 1000);
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Prefix an internal path with the active language: "/about" -> "/en/about". */
export function url(path = '/') {
  const p = path.startsWith('/') ? path : '/' + path;
  return `/${current}${p === '/' ? '/' : p}`;
}

export function switchLangPath(path, to) {
  return path.replace(/^\/(en|ar)(?=\/|$)/, '/' + to);
}
