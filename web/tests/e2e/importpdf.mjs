import assert from 'node:assert/strict';
import path from 'node:path';
import { go, launch, newPage, ready, step, summary } from './lib.mjs';
import { withAdminDb } from '../emu.mjs';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';

const PDF = path.resolve(import.meta.dirname, '../../public/seed-media/paper.pdf');
// withAdminDb() does not return the callback's value: capture it
const read = async (fn) => { let out; await withAdminDb(async (db) => { out = await fn(db); }); return out; };
const browser = await launch();
const errors = [];
async function login(email = 'ed@example.com') {
  const page = await newPage(browser); errors.push(page.errors);
  await go(page, '/admin/'); await page.waitForSelector('#ad-login');
  await page.fill('input[name=email]', email); await page.fill('input[name=password]', 'Passw0rd!x'); await page.click('#ad-login button[type=submit]');
  await page.waitForSelector('.ad-content', { timeout: 20000 }); return page;
}

console.log('PDF article importer');
let ed;
await step('contributors cannot use the importer', async () => {
  const p = await login('con@example.com'); await go(p, '/admin/import-pdf'); await p.waitForSelector('.ad-warn'); await p.context().close();
});
await step('a PDF becomes a publication with authors, sections, references and figures', async () => {
  ed = await login(); await go(ed, '/admin/import-pdf'); await ed.waitForSelector('#pdf');
  assert.equal(await ed.locator('#draft').isDisabled(), true);
  await ed.setInputFiles('#pdf', PDF);
  await ed.click('#draft');
  // the sample site already has this paper (same DOI): confirm the replacement
  await ed.waitForSelector('#notes h3, .ad-modal [data-yes]', { timeout: 90000 });
  if (await ed.locator('.ad-modal [data-yes]').count()) { await ed.click('.ad-modal [data-yes]'); await ed.waitForSelector('#notes h3', { timeout: 90000 }); }
  const summaryText = await ed.locator('#notes').innerText();
  assert.match(summaryText, /sections/);
  const docs = await read(async (db) => (await getDocs(collection(db, 'publications'))).docs.map((d) => ({ id: d.id, ...d.data() })));
  const imp = docs.find((d) => (d.title_en || '').length > 20 && d.sections?.length && d.references?.length && d.is_published === false);
  assert.ok(imp, 'imported draft exists');
  assert.ok(imp.author_list.length >= 3 && imp.abstract_background, 'authors and structured abstract');
  assert.ok(imp.figures.some((f) => f.kind === 'figure') && imp.figures.some((f) => f.kind === 'table'));
  // without Cloudinary the user is told that files were not uploaded
  assert.match(summaryText, /Cloudinary/);
});
await step('importing the same DOI asks before replacing', async () => {
  await go(ed, '/admin/import-pdf'); await ed.waitForSelector('#pdf');
  await ed.setInputFiles('#pdf', PDF); await ed.click('#pub');
  await ed.waitForSelector('.ad-modal [data-no]', { timeout: 60000 });
  await ed.click('.ad-modal [data-no]');
  await ed.waitForFunction(() => !document.querySelector('.ad-modal'));
  const n = await read(async (db) => (await getDocs(collection(db, 'publications'))).size);
  await ed.setInputFiles('#pdf', PDF); await ed.click('#pub');
  await ed.waitForSelector('.ad-modal [data-yes]', { timeout: 60000 }); await ed.click('.ad-modal [data-yes]');
  await ed.waitForSelector('#notes h3', { timeout: 90000 });
  assert.equal(await read(async (db) => (await getDocs(collection(db, 'publications'))).size), n);
});
await step('the published article page renders for visitors', async () => {
  const id = await read(async (db) => (await getDocs(collection(db, 'publications'))).docs.find((d) => d.data().sections?.length && d.data().is_published)?.id);
  assert.ok(id);
  const v = await newPage(browser); await go(v, `/en/publications/${id}/`); await ready(v, 'h1');
  assert.ok((await v.locator('main').innerText()).length > 500); await v.context().close();
});
await step('no JavaScript errors in the importer', async () => { assert.deepEqual(errors.flat().filter((e) => !/pdf|worker/i.test(e) || /TypeError|ReferenceError/.test(e)), []); });
await browser.close();
process.exit(summary() ? 0 : 1);
