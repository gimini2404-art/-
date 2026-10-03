// Writes public/sitemap.xml and public/robots.txt from the public snapshots in Firestore.
//   VITE_FIREBASE_PROJECT_ID=... VITE_SITE_URL=https://example.com node tools/gen_sitemap.mjs
// Run it before `npm run build` (npm run deploy does not call it automatically, so refresh it after big content changes).
import fs from 'node:fs';
import { initializeApp } from 'firebase/app';
import { doc, getDoc, getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { stateOf } from '../src/data/pure.js';

const site = (process.env.VITE_SITE_URL || '').replace(/\/$/, '');
if (!site) { console.error('Set VITE_SITE_URL (e.g. https://sianexis.web.app)'); process.exit(1); }
const app = initializeApp({ apiKey: process.env.VITE_FIREBASE_API_KEY || 'x', projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'demo-sianexis', appId: process.env.VITE_FIREBASE_APP_ID || 'x' });
const db = getFirestore(app);
if (process.env.FIRESTORE_EMULATOR_HOST) { const [h, p] = process.env.FIRESTORE_EMULATOR_HOST.split(':'); connectFirestoreEmulator(db, h, +p); }

async function items(col) {
  const first = await getDoc(doc(db, 'snapshots', col));
  if (!first.exists()) return [];
  let out = [...(first.data().items || [])];
  for (let i = 1; i < (first.data().parts || 1); i++) out = out.concat((await getDoc(doc(db, 'snapshots', `${col}__${i}`))).data()?.items || []);
  return out.filter((x) => stateOf(x) === 'live');
}

const urls = new Map(); // path -> lastmod
const add = (p, mod = '') => urls.set(p, mod);
for (const p of ['', '/about', '/research-areas', '/services', '/research-hub', '/collaborations', '/projects', '/publications', '/training', '/opportunities', '/contact', '/news']) add(p);
for (const [col, prefix] of [['areas', '/research-areas'], ['hub', '/research-hub'], ['projects', '/projects'], ['publications', '/publications'], ['posts', '/news'], ['pages', '/p'], ['team', '/team']]) {
  for (const it of await items(col)) add(`${prefix}/${it._id}`, String(it.updated || it.created || '').slice(0, 10));
}
const entry = ([p, mod]) => `  <url>\n    <loc>${site}/en${p}/</loc>${mod ? `\n    <lastmod>${mod}</lastmod>` : ''}\n    <xhtml:link rel="alternate" hreflang="en" href="${site}/en${p}/"/>\n    <xhtml:link rel="alternate" hreflang="ar" href="${site}/ar${p}/"/>\n  </url>\n  <url>\n    <loc>${site}/ar${p}/</loc>${mod ? `\n    <lastmod>${mod}</lastmod>` : ''}\n    <xhtml:link rel="alternate" hreflang="en" href="${site}/en${p}/"/>\n    <xhtml:link rel="alternate" hreflang="ar" href="${site}/ar${p}/"/>\n  </url>`;
fs.writeFileSync('public/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${[...urls].map(entry).join('\n')}\n</urlset>\n`);
fs.writeFileSync('public/robots.txt', `User-agent: *\nDisallow: /admin\nDisallow: /en/account\nDisallow: /ar/account\nSitemap: ${site}/sitemap.xml\n`);
console.log(`sitemap.xml: ${urls.size * 2} URLs, robots.txt written`);
