import { LANGS, getLang } from '../i18n/index.js';
import { esc } from '../util.js';

const KEY = 'data-managed';

function add(tag, attrs) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.setAttribute(KEY, '');
  document.head.appendChild(el);
  return el;
}

/** Replace the per-page <head> tags (title, description, canonical, hreflang, Open Graph, JSON-LD, extra meta). */
export function setHead({ title, description, siteName, meta = [], jsonld = null, noindex = false, path = location.pathname }) {
  document.head.querySelectorAll(`[${KEY}]`).forEach((n) => n.remove());
  document.title = title;
  const origin = location.origin;
  const alt = (l) => origin + path.replace(/^\/(en|ar)(?=\/|$)/, '/' + l);
  add('meta', { name: 'description', content: description || '' });
  add('link', { rel: 'canonical', href: origin + path });
  for (const [code] of LANGS) add('link', { rel: 'alternate', hreflang: code, href: alt(code) });
  add('link', { rel: 'alternate', hreflang: 'x-default', href: alt('en') });
  add('meta', { property: 'og:locale', content: getLang() === 'ar' ? 'ar_AR' : 'en_US' });
  add('meta', { property: 'og:type', content: 'website' });
  add('meta', { property: 'og:site_name', content: siteName || '' });
  add('meta', { property: 'og:title', content: title });
  add('meta', { property: 'og:url', content: origin + path });
  if (description) add('meta', { property: 'og:description', content: description });
  if (noindex) add('meta', { name: 'robots', content: 'noindex' });
  for (const [name, content] of meta) add('meta', { name, content });
  const org = { '@context': 'https://schema.org', '@type': 'Organization', name: siteName || '', url: origin + '/' };
  const s = add('script', { type: 'application/ld+json' });
  s.textContent = JSON.stringify(org);
  if (jsonld) {
    const s2 = add('script', { type: 'application/ld+json' });
    s2.textContent = JSON.stringify(jsonld);
  }
}

export const escAttr = esc;
