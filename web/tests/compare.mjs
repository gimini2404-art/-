// Visual/text parity check: the same URL on the Django site (:8000) and on the Firebase site (:5173), both filled with the same data.
import { launch, newPage } from './e2e/lib.mjs';
const DJ = 'http://127.0.0.1:8000', JS = 'http://127.0.0.1:5173';
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const browser = await launch();

async function grab(base, path) {
  const page = await newPage(browser);
  const failed = [];
  page.on('response', (r) => { if (r.status() >= 400 && !/favicon|fonts|tile\./.test(r.url())) failed.push(`${r.status()} ${r.url().replace(base, '')}`); });
  await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
  await page.waitForSelector('main, #main > *', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(base === JS ? 1500 : 500);
  const d = await page.evaluate(() => {
    const t = (s) => (document.querySelector(s)?.innerText || '').replace(/\s+/g, ' ').trim();
    const main = document.querySelector('main') || document.body;
    const clone = main.cloneNode(true); clone.querySelectorAll('script,style,noscript,svg').forEach((n) => n.remove());
    const attr = (s, a) => document.querySelector(s)?.getAttribute(a) || '';
    return {
      title: document.title, lang: document.documentElement.lang, dir: document.documentElement.dir || getComputedStyle(document.documentElement).direction,
      h1: [...main.querySelectorAll('h1')].map((n) => n.innerText.trim()), h2: [...main.querySelectorAll('h2,h3')].map((n) => n.innerText.replace(/\s+/g, ' ').trim()),
      text: (clone.querySelectorAll('*').forEach((n) => n.append(' ')), clone.textContent).replace(/\s+/g, ' ').trim(), links: [...main.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).filter((h) => !/^#|^javascript/.test(h)),
      imgs: main.querySelectorAll('img').length, forms: main.querySelectorAll('form').length, cards: main.querySelectorAll('.card, article').length,
      nav: [...document.querySelectorAll('header a, nav a')].map((a) => a.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean),
      footer: (document.querySelector('footer')?.innerText || '').replace(/\s+/g, ' ').trim(),
      desc: attr('meta[name=description]', 'content'), canon: attr('link[rel=canonical]', 'href'), ogt: attr('meta[property="og:title"]', 'content'),
      alt: [...document.querySelectorAll('link[rel=alternate][hreflang]')].map((l) => l.hreflang).sort().join(','),
      jsonld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => { try { return JSON.parse(s.textContent)['@type']; } catch { return '?'; } }).join(','),
    };
  });
  await page.context().close();
  return { ...d, failed };
}

const cl = (u) => u.replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '');
async function pathsFrom() {
  const set = new Set();
  const page = await newPage(browser);
  for (const lang of ['en', 'ar']) for (const p of ['', '/about', '/research-areas', '/services', '/research-hub', '/collaborations', '/projects', '/publications', '/training', '/opportunities', '/contact', '/news', '/search?q=celiac', '/p/privacy']) set.add(`/${lang}${p}/`.replace('/?', '?').replace(/\/$/, p.includes('?') ? '' : '/'));
  await page.goto(DJ + '/en/', { waitUntil: 'domcontentloaded' });
  for (const sec of ['research-areas', 'research-hub', 'projects', 'publications', 'training', 'opportunities', 'news']) {
    await page.goto(`${DJ}/en/${sec}/`, { waitUntil: 'domcontentloaded' });
    for (const h of await page.$$eval('main a[href]', (as) => as.map((a) => a.getAttribute('href')))) if (new RegExp(`^/en/${sec}/[^/]+/?$`).test(h)) { set.add(h); set.add(h.replace('/en/', '/ar/')); }
  }
  await page.goto(`${DJ}/en/about/`); for (const h of await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')))) if (/^\/en\/team\/[^/]+\/?$/.test(h)) { set.add(h); set.add(h.replace('/en/', '/ar/')); }
  await page.context().close();
  return [...set];
}

const words = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
function wordDiff(a, b) {
  const A = words(a), B = words(b), cA = new Map(), cB = new Map();
  A.forEach((w) => cA.set(w, (cA.get(w) || 0) + 1)); B.forEach((w) => cB.set(w, (cB.get(w) || 0) + 1));
  const only = (X, Y) => [...X].filter(([w, n]) => n > (Y.get(w) || 0)).map(([w]) => w);
  return { onlyDj: only(cA, cB), onlyJs: only(cB, cA) };
}

const paths = (await pathsFrom()).filter((p) => !process.argv[2] || p.includes(process.argv[2]));
console.log(`${paths.length} pages to compare\n`);
let bad = 0;
for (const p of paths) {
  const [a, b] = await Promise.all([grab(DJ, p), grab(JS, p)]).catch((e) => { console.log('✗', p, 'ERROR', e.message); return [null, null]; }); if (!a) { bad++; continue; }
  const issues = [];
  if (a.lang !== b.lang) issues.push(`html lang: dj=${a.lang} js=${b.lang}`);
  if (a.dir !== b.dir) issues.push(`dir: dj=${a.dir} js=${b.dir}`);
  if (norm(a.title) !== norm(b.title)) issues.push(`title: dj="${a.title}" js="${b.title}"`);
  if (JSON.stringify(a.h1) !== JSON.stringify(b.h1)) issues.push(`h1: dj=${JSON.stringify(a.h1)} js=${JSON.stringify(b.h1)}`);
  if (JSON.stringify(a.h2) !== JSON.stringify(b.h2)) issues.push(`h2/h3: dj=${JSON.stringify(a.h2).slice(0, 200)} js=${JSON.stringify(b.h2).slice(0, 200)}`);
  const wd = wordDiff(a.text, b.text);
  if (wd.onlyDj.length || wd.onlyJs.length) issues.push(`text words only in Django: [${wd.onlyDj.slice(0, 15)}] only in JS: [${wd.onlyJs.slice(0, 15)}]`);
  if (a.imgs !== b.imgs) issues.push(`images: dj=${a.imgs} js=${b.imgs}`);
  if (a.forms !== b.forms) issues.push(`forms: dj=${a.forms} js=${b.forms}`);
  if (a.links.length !== b.links.length) issues.push(`links in main: dj=${a.links.length} js=${b.links.length}`);
  if (JSON.stringify(a.nav) !== JSON.stringify(b.nav)) issues.push(`menu: dj=${JSON.stringify(a.nav).slice(0, 160)} js=${JSON.stringify(b.nav).slice(0, 160)}`);
  if (norm(a.footer) !== norm(b.footer)) issues.push('footer text differs');
  if (a.desc !== b.desc) issues.push(`meta description: dj="${a.desc.slice(0, 60)}" js="${b.desc.slice(0, 60)}"`);
  if (cl(a.canon).replace(/\/(\?|$)/, '$1') !== cl(b.canon).replace(/\/(\?|$)/, '$1') && !/search/.test(p)) issues.push(`canonical: dj=${cl(a.canon)} js=${cl(b.canon)}`);
  if (a.alt !== b.alt.replace(',x-default', '')) issues.push(`hreflang: dj=${a.alt} js=${b.alt}`);
  if (a.jsonld !== b.jsonld) issues.push(`json-ld: dj=${a.jsonld} js=${b.jsonld}`);
  if (b.failed.length) issues.push(`JS site failed requests: ${b.failed.slice(0, 3)}`);
  if (issues.length) { bad++; console.log(`✗ ${p}\n   ${issues.join('\n   ')}`); } else console.log(`✓ ${p}`);
}
console.log(`\n${paths.length - bad}/${paths.length} pages identical`);
await browser.close();
