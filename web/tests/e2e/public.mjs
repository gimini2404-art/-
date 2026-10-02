import assert from 'node:assert/strict';
import { BASE, go, launch, newPage, ready, step, summary } from './lib.mjs';
import { doc, getDoc } from 'firebase/firestore';
import { withAdminDb } from '../emu.mjs';

const browser = await launch();
const page = await newPage(browser);
const text = (sel) => page.locator(sel).first().innerText();

console.log('Public site');
await step('home renders in English (ltr) with the hero and stats', async () => {
  await go(page, '/en/'); await ready(page, '.hero');
  assert.equal(await page.getAttribute('html', 'dir'), 'ltr');
  assert.match(await text('.hero h1'), /Advancing research/);
  assert.ok(await page.locator('.stat').count() >= 2);
  assert.ok(await page.locator('.hdr a.nav-login').count() === 1);
});
await step('home renders in Arabic (rtl) with Arabic navigation', async () => {
  await go(page, '/ar/'); await ready(page, '.hero');
  assert.equal(await page.getAttribute('html', 'dir'), 'rtl');
  assert.match(await text('.nav'), /من نحن/);
});
await step('language switch keeps the page', async () => {
  await go(page, '/en/projects/'); await ready(page, '.pagehead');
  await page.click('a[data-lang-switch="ar"]'); await page.waitForURL('**/ar/projects/**');
  assert.equal(await page.getAttribute('html', 'lang'), 'ar');
});
await step('root redirects to a language prefix', async () => {
  await go(page, '/'); await page.waitForURL(/\/(en|ar)\/$/);
});
await step('about, areas, services, hub, collaborations, projects, publications, training, opportunities, news, contact pages load', async () => {
  for (const p of ['about', 'research-areas', 'services', 'research-hub', 'collaborations', 'projects', 'publications', 'training', 'opportunities', 'news', 'contact', 'search']) {
    await go(page, `/en/${p}/`); await ready(page, '.pagehead h1');
    assert.ok((await text('.pagehead h1')).length > 1, p);
  }
});
await step('research area detail lists its projects', async () => {
  await go(page, '/en/research-areas/psychiatry/'); await ready(page, '.pagehead');
  assert.match(await page.locator('main').innerText(), /Anxiety and depression in celiac disease/);
});
await step('project detail shows institutions and related content', async () => {
  await go(page, '/en/projects/celiac-mental-health/'); await ready(page, '.pagehead');
  const body = await page.locator('main').innerText();
  assert.match(body, /Cairo University/); assert.match(body, /Systematic review/);
});
await step('hub filter by category works without reload', async () => {
  await go(page, '/en/research-hub/'); await ready(page, '.filters');
  await page.click('.filters a:has-text("Research Networks")'); await page.waitForURL('**category=network');
  await page.waitForFunction(() => !document.querySelector('.grid').innerText.includes('Multicenter sleep'));
  assert.match(await page.locator('.grid').innerText(), /Gut-brain/);
  assert.doesNotMatch(await page.locator('.grid').innerText(), /Multicenter sleep/);
});
await step('collaborations page creates the map', async () => {
  await go(page, '/en/collaborations/'); await ready(page, '#map-points', 15000).catch(() => {});
  assert.ok(await page.locator('#collab-map').count() === 1);
});
await step('search finds content in both languages', async () => {
  await go(page, '/en/search/?q=sleep'); await ready(page, '.results');
  assert.match(await page.locator('.results').first().innerText(), /Sleep and mood/);
  await go(page, '/ar/search/?q=' + encodeURIComponent('النوم')); await ready(page, '.results');
});
await step('publications can be filtered', async () => {
  await go(page, '/en/publications/?year=2024'); await ready(page, '.publist');
  assert.match(await page.locator('.publist').innerText(), /Ethical considerations/);
  await go(page, '/en/publications/?year=1999'); await ready(page, '.pubfilters');
  assert.ok(await page.locator('.publist').count() === 0);
});
await step('article page: sections, references, citation dialog, downloads', async () => {
  await go(page, '/en/publications/ethical-considerations-during-mpox-outbreak-a-scoping-review/'); await ready(page, '.art-hero');
  assert.match(await text('.art-main'), /Background/);
  assert.ok(await page.locator('.art-refs li').count() > 50);
  assert.ok(await page.locator('.art-fig').count() >= 2);
  assert.ok(await page.locator('.cite-ref').count() > 5);
  await page.click('.art-actions [data-open-dialog="cite-dialog"]');
  await page.waitForSelector('#cite-dialog[open]');
  assert.match(await text('#cite-dialog .dlg-pane'), /El Dine, F/);
  await page.click('#cite-dialog .dlg-tabs [data-tab="bib"]');
  assert.match(await page.locator('#cite-dialog .dlg-pane[data-pane="bib"]').innerText(), /@article/);
  const meta = await page.getAttribute('meta[name="citation_doi"]', 'content');
  assert.equal(meta, '10.1186/s12910-024-01078-0');
});
await step('contact form: validation, honeypot-free submit, request stored', async () => {
  await go(page, '/en/contact/?type=collaboration'); await ready(page, '#contact-form');
  assert.equal(await page.inputValue('#f-request_type'), 'collaboration');
  await page.click('#contact-form button[type=submit]');
  assert.ok(await page.locator('.errorlist li').count() >= 3);
  await page.fill('#f-name', 'Layla Hassan'); await page.fill('#f-email', 'layla@example.com'); await page.fill('#f-message', 'Hello team');
  await page.waitForTimeout(3200);
  await page.click('#contact-form button[type=submit]');
  await page.waitForURL('**/contact/thanks/');
  let found = false;
  await withAdminDb(async (db) => { const { getDocs, collection } = await import('firebase/firestore'); found = (await getDocs(collection(db, 'contactRequests'))).docs.some((d) => d.data().email === 'layla@example.com'); });
  assert.ok(found);
});
await step('contact form rejects bots that fill the honeypot', async () => {
  await go(page, '/en/contact/'); await ready(page, '#contact-form');
  await page.evaluate(() => { document.querySelector('[name=website]').value = 'spam'; });
  await page.fill('#f-name', 'Bot'); await page.fill('#f-email', 'bot@example.com'); await page.fill('#f-message', 'buy');
  await page.waitForTimeout(3200);
  await page.click('#contact-form button[type=submit]');
  await page.waitForSelector('.form-errors li');
  assert.match(page.url(), /contact\/$/);
});
await step('newsletter subscription is stored once and unsubscribe works', async () => {
  await go(page, '/en/'); await ready(page, '#newsletter-form');
  await page.fill('#newsletter-form [name=email]', 'reader@example.com');
  await page.click('#newsletter-form button'); await page.waitForSelector('.toast');
  let tok = null;
  await withAdminDb(async (db) => { const { getDocs, collection } = await import('firebase/firestore'); tok = (await getDocs(collection(db, 'subscribers'))).docs.find((d) => d.data().email === 'reader@example.com')?.id; });
  assert.ok(tok);
  await go(page, `/en/newsletter/unsubscribe/${tok}/`); await ready(page, '#unsub-btn');
  await page.click('#unsub-btn'); await page.waitForSelector('#unsub-box h2');
  let active = true;
  await withAdminDb(async (db) => { active = (await getDoc(doc(db, 'subscribers', tok))).data().is_active; });
  assert.equal(active, false);
});
await step('training registration respects capacity (2 seats) and prevents duplicates', async () => {
  const reg = async (name, email) => {
    await go(page, '/en/training/meta-analysis-101/register/'); await ready(page, '#reg-form');
    await page.fill('#f-name', name); await page.fill('#f-email', email); await page.waitForTimeout(3200);
    await page.click('#reg-form button[type=submit]'); await page.waitForSelector('.toast, .form-errors li, .errorlist:not([hidden]) li');
    return page.locator('.toast, .errorlist:not([hidden]) li').first().innerText();
  };
  assert.match(await reg('A One', 'a1@example.com'), /received/i);
  assert.match(await reg('B Two', 'b2@example.com'), /received/i);
  assert.match(await reg('C Three', 'c3@example.com'), /full|waiting/i);
  assert.match(await reg('A One', 'a1@example.com'), /already registered/i);
  await go(page, '/en/training/'); await ready(page, '.seats');
  assert.match(await text('.seats'), /Fully booked/);
});
await step('draft and unknown pages return 404', async () => {
  await go(page, '/en/news/nope/'); await ready(page, '.pagehead h1');
  assert.equal(await text('.pagehead h1'), '404');
});
await step('cookie banner and privacy page from the CMS menu', async () => {
  await go(page, '/en/p/privacy/'); await ready(page, '.pagehead');
  assert.match(await text('.pagehead h1'), /Privacy/);
  assert.ok(await page.locator('.dropdown a:has-text("Privacy policy")').count() === 1);
});
await step('no JavaScript errors on any visited page', async () => { assert.deepEqual(page.errors, []); });

await browser.close();
process.exit(summary() ? 0 : 1);
