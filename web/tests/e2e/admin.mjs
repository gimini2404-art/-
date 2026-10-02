import assert from 'node:assert/strict';
import { BASE, go, launch, newPage, ready, step, summary } from './lib.mjs';
import { createUser, withAdminDb } from '../emu.mjs';
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';

const browser = await launch();
const errors = [];

async function login(email = 'boss@example.com', password = 'Passw0rd!x') {
  const page = await newPage(browser);
  errors.push(page.errors);
  await go(page, '/admin/'); await page.waitForSelector('#ad-login');
  await page.fill('input[name=email]', email); await page.fill('input[name=password]', password);
  await page.click('#ad-login button[type=submit]');
  await page.waitForSelector('.ad-content', { timeout: 20000 });
  return page;
}
const publicText = async (path) => { const p = await newPage(browser); await go(p, path); await ready(p, '.pagehead h1, .hero'); const t = await p.locator('main').innerText(); await p.context().close(); return t; };
const fillTr = async (page, name, en, ar) => {
  await page.fill(`[name="${name}_en"]`, en);
  if (ar) { await page.click('.ad-tabs [data-lang=ar]'); await page.fill(`[name="${name}_ar"]`, ar); await page.click('.ad-tabs [data-lang=en]'); }
};

console.log('Admin CMS');
let boss;
await step('login: wrong password is rejected, staff reach the dashboard', async () => {
  const page = await newPage(browser);
  await go(page, '/admin/'); await page.waitForSelector('#ad-login');
  await page.fill('input[name=email]', 'boss@example.com'); await page.fill('input[name=password]', 'bad');
  await page.click('#ad-login button[type=submit]'); await page.waitForSelector('#ad-err:not([hidden])');
  await page.context().close();
  boss = await login();
  await boss.waitForSelector('.ad-card');
  assert.ok(await boss.locator('.ad-card').count() >= 10);
  assert.match(await boss.locator('.ad-top').innerText(), /Administrator/);
});
await step('non-staff accounts get the "no staff access" screen with a request button', async () => {
  await createUser('rando@example.com', 'Passw0rd!x', { verified: true });
  const page = await newPage(browser);
  await go(page, '/admin/'); await page.waitForSelector('#ad-login');
  await page.fill('input[name=email]', 'rando@example.com'); await page.fill('input[name=password]', 'Passw0rd!x'); await page.click('#ad-login button[type=submit]');
  await page.waitForSelector('#ad-req');
  assert.equal(await page.locator('.ad-card').count(), 0);
  await page.context().close();
});
await step('create a news post in English + Arabic; it appears on the public site in both languages', async () => {
  await go(boss, '/admin/c/posts/new'); await boss.waitForSelector('#ed');
  await boss.click('#ed button[type=submit]');
  assert.ok(await boss.locator('.err:not([hidden])').count() >= 1); // title + body required
  await fillTr(boss, 'title', 'Grant awarded', 'تم الحصول على منحة');
  await fillTr(boss, 'summary', 'We won a grant', 'حصلنا على منحة');
  await fillTr(boss, 'body', 'Details of the grant.\n\nSecond paragraph.', 'تفاصيل المنحة.');
  await boss.click('#ed button[data-then=list]'); await boss.waitForURL('**/admin/c/posts');
  await boss.waitForSelector('.ad-t');
  assert.match(await boss.locator('.ad-t').innerText(), /Grant awarded/);
  assert.match(await publicText('/en/news/'), /Grant awarded/);
  assert.match(await publicText('/ar/news/'), /تم الحصول على منحة/);
  assert.match(await publicText('/en/news/grant-awarded/'), /Second paragraph/);
});
await step('same title twice creates a unique slug', async () => {
  await go(boss, '/admin/c/posts/new'); await boss.waitForSelector('#ed');
  await fillTr(boss, 'title', 'Grant awarded'); await fillTr(boss, 'body', 'Again');
  await boss.click('#ed button[data-then=list]'); await boss.waitForURL('**/admin/c/posts');
  await go(boss, '/admin/c/posts/grant-awarded-2'); await boss.waitForSelector('#ed');
  assert.equal(await boss.inputValue('[name=slug]'), 'grant-awarded-2');
});
await step('edit + history + restore', async () => {
  await go(boss, '/admin/c/posts/grant-awarded'); await boss.waitForSelector('#ed');
  await boss.fill('[name=title_en]', 'Grant awarded (updated)');
  await boss.click('#ed button[data-then=stay]'); await boss.waitForSelector('#hist');
  assert.match(await publicText('/en/news/grant-awarded/'), /updated/);
  await boss.click('#hist'); await boss.waitForSelector('.ad-modal [data-restore]');
  const n = await boss.locator('.ad-modal [data-restore]').count(); assert.ok(n >= 2);
  await boss.locator('.ad-modal [data-restore]').last().click();
  await boss.click('.ad-modal [data-yes]'); await boss.waitForSelector('.toast');
  await boss.waitForTimeout(500);
  assert.doesNotMatch(await publicText('/en/news/grant-awarded/'), /updated/);
});
await step('unpublish hides it from visitors, staff still preview it with a banner', async () => {
  await go(boss, '/admin/c/posts'); await boss.waitForSelector('.ad-t');
  await boss.locator('tr:has(a[href$="/admin/c/posts/grant-awarded"])').locator('.sel').check();
  await boss.click('[data-act=unpub]'); await boss.waitForSelector('.ad-t .ad-badge.draft');
  const vis = await newPage(browser); await go(vis, '/en/news/grant-awarded/'); await ready(vis, '.pagehead h1');
  assert.equal(await vis.locator('.pagehead h1').innerText(), '404'); await vis.context().close();
  await go(boss, '/en/news/grant-awarded/'); await boss.waitForSelector('.draft-banner');
});
await step('a project with relations, image URL and publishing options', async () => {
  await go(boss, '/admin/c/projects/new'); await boss.waitForSelector('#ed');
  await fillTr(boss, 'title', 'Diet and anxiety', 'النظام الغذائي والقلق');
  await boss.selectOption('[name=research_area]', 'psychiatry');
  await boss.check('[data-refs=institutions] input >> nth=1');
  await boss.fill('[data-media=image] input[type=url]', 'https://res.cloudinary.com/demo/image/upload/sample.jpg');
  await boss.check('[name=featured]');
  await boss.click('#ed button[data-then=list]'); await boss.waitForURL('**/admin/c/projects');
  const page = await publicText('/en/research-areas/psychiatry/'); assert.match(page, /Diet and anxiety/);
  assert.match(await publicText('/en/projects/diet-and-anxiety/'), /London School of Hygiene/);
});
await step('a publication with an article built from inline authors, sections and references', async () => {
  await go(boss, '/admin/c/publications/new'); await boss.waitForSelector('#ed');
  await fillTr(boss, 'title', 'A quick test article');
  await boss.fill('[name=authors]', 'Jane Doe, Roe Rae'); await boss.fill('[name=journal]', 'Test Journal'); await boss.fill('[name=year]', '2026'); await boss.fill('[name=doi]', '10.1000/test.1');
  await boss.locator('details.ad-adv').first().evaluate((d) => { d.open = true; });
  await boss.fill('[name=abstract]', 'A short abstract.');
  await boss.click('[data-add-item=author_list]');
  await boss.fill('[data-list=author_list] [data-k=name]', 'Jane Doe'); await boss.check('[data-list=author_list] [data-k=corresponding]');
  await boss.fill('[data-list=author_list] [data-k=email]', 'jane@example.org');
  await boss.click('[data-add-item=sections]');
  await boss.selectOption('[data-list=sections] [data-k=kind]', 'introduction');
  await boss.fill('[data-list=sections] [data-k=body]', 'Intro text citing [1] and [2].\n\n### Sub heading\n\n- bullet one');
  await boss.click('[data-add-item=references]');
  await boss.fill('[data-list=references] [data-k=number]', '1'); await boss.fill('[data-list=references] [data-k=text]', 'Doe J. A paper. Nature. 2020. https://doi.org/10.1/xyz');
  await boss.click('#ed button[data-then=list]'); await boss.waitForURL('**/admin/c/publications');
  const p = await newPage(browser); await go(p, '/en/publications/a-quick-test-article/'); await ready(p, '.art-hero');
  assert.match(await p.locator('.art-main').innerText(), /Intro text citing/);
  assert.equal(await p.locator('.cite-ref').count(), 1); // [1] linked, [2] has no reference
  assert.equal(await p.locator('.art-refs li').count(), 1);
  assert.match(await p.locator('.art-authors').innerText(), /Jane Doe/);
  await p.context().close();
});
await step('site settings change the public site (EN + AR)', async () => {
  await go(boss, '/admin/settings'); await boss.waitForSelector('#ed');
  await boss.fill('[name=tagline_en]', 'Evidence for better care');
  await boss.click('.ad-tabs [data-lang=ar]'); await boss.fill('[name=tagline_ar]', 'أدلة لرعاية أفضل');
  await boss.fill('[name=phone]', '+20 100 000 0000');
  await boss.click('#ed button[type=submit]'); await boss.waitForSelector('.toast');
  assert.match(await publicText('/en/'), /evidence for better care/i);
  assert.match(await publicText('/ar/'), /أدلة لرعاية أفضل/);
});
await step('inbox: a contact request can be read, noted and closed', async () => {
  await withAdminDb((db) => setDoc(doc(collection(db, 'contactRequests')), { request_type: 'other', name: 'Nora', email: 'nora@example.com', organization: '', subject: 'Hi', message: 'Need help', status: 'new', internal_notes: '', language: 'en', created: serverTimestamp() }));
  await go(boss, '/admin/inbox'); await boss.waitForSelector('.ad-t');
  await boss.click('[data-open]'); await boss.waitForSelector('.ad-modal #notes');
  assert.match(await boss.locator('.ad-modal').innerText(), /Need help/);
  await boss.fill('#notes', 'Called her'); await boss.click('#sv'); await boss.click('.ad-modal [data-close]');
  await boss.selectOption('select.st', 'closed'); await boss.waitForSelector('.toast');
  await withAdminDb(async (db) => { const r = (await getDocs(collection(db, 'contactRequests'))).docs.find((d) => d.data().email === 'nora@example.com').data(); assert.equal(r.status, 'closed'); assert.equal(r.internal_notes, 'Called her'); });
});
await step('registrations: status change recounts seats', async () => {
  const pub = await newPage(browser);
  for (const [n, e] of [['A One', 'seat1@example.com'], ['B Two', 'seat2@example.com']]) {
    await go(pub, '/en/training/meta-analysis-101/register/'); await ready(pub, '#reg-form');
    await pub.fill('#f-name', n); await pub.fill('#f-email', e); await pub.waitForTimeout(3200); await pub.click('#reg-form button[type=submit]'); await pub.waitForSelector('.toast');
  }
  await pub.context().close();
  await go(boss, '/admin/registrations'); await boss.waitForSelector('.ad-t');
  await boss.locator('tr', { hasText: 'seat1@example.com' }).locator('select.st').selectOption('cancelled'); await boss.waitForSelector('.toast');
  let taken; await withAdminDb(async (db) => { taken = (await getDoc(doc(db, 'trainingStats', 'meta-analysis-101'))).data().taken; });
  assert.equal(taken, 1);
});
await step('Arabic admin: RTL layout and translated menu', async () => {
  await boss.click('#ad-lang'); await boss.waitForSelector('.ad-content');
  assert.equal(await boss.getAttribute('html', 'dir'), 'rtl');
  assert.match(await boss.locator('.ad-side').innerText(), /لوحة|المشروعات|الأبحاث/);
  await boss.click('#ad-lang'); await boss.waitForSelector('.ad-content');
});
await step('backup download contains the content', async () => {
  await go(boss, '/admin/data'); await boss.waitForSelector('#bk');
  const [dl] = await Promise.all([boss.waitForEvent('download'), boss.click('#bk')]);
  const fs = await import('node:fs'); const j = JSON.parse(fs.readFileSync(await dl.path(), 'utf8').replace(/^﻿/, ''));
  assert.ok(j.collections.posts.some((p) => p.slug === 'grant-awarded')); assert.ok(j.collections.areas.length >= 7);
});
await step('contributors can add and edit but not delete or change settings', async () => {
  const con = await login('con@example.com');
  await go(con, '/admin/c/posts'); await con.waitForSelector('.ad-t');
  assert.equal(await con.locator('[data-act=del]').count(), 0);
  await go(con, '/admin/c/posts/grant-awarded'); await con.waitForSelector('#ed');
  assert.equal(await con.locator('#del').count(), 0);
  await con.fill('[name=summary_en]', 'edited by contributor'); await con.click('#ed button[data-then=stay]'); await con.waitForSelector('.toast');
  await go(con, '/admin/settings'); await con.waitForSelector('.ad-warn');
  await con.context().close();
});
await step('editors can delete content', async () => {
  const ed = await login('ed@example.com');
  await go(ed, '/admin/c/posts/grant-awarded-2'); await ed.waitForSelector('#del');
  await ed.click('#del'); await ed.click('.ad-modal [data-yes]'); await ed.waitForURL('**/admin/c/posts');
  await ed.waitForSelector('.ad-t');
  assert.doesNotMatch(await ed.locator('.ad-t').innerText(), /grant-awarded-2/);
  await go(ed, '/admin/users'); await ed.waitForSelector('.ad-warn'); // only admins manage staff
  await ed.context().close();
});
await step('staff access: a new account requests access and an administrator approves it', async () => {
  const uid = await createUser('newbie@example.com', 'Passw0rd!x', { verified: true });
  const p = await newPage(browser);
  await go(p, '/admin/'); await p.waitForSelector('#ad-login');
  await p.fill('input[name=email]', 'newbie@example.com'); await p.fill('input[name=password]', 'Passw0rd!x'); await p.click('#ad-login button[type=submit]');
  await p.waitForSelector('#ad-req'); await p.click('#ad-req'); await p.waitForSelector('.ad-warn');
  await go(boss, '/admin/users'); await boss.waitForSelector('[data-approve]');
  await boss.selectOption('select.role', 'editor'); await boss.click('[data-approve]'); await boss.waitForSelector('.toast');
  await withAdminDb(async (db) => { assert.equal((await getDoc(doc(db, 'admins', uid))).data().role, 'editor'); });
  await p.reload(); await p.waitForSelector('.ad-content'); await p.context().close();
});
await step('no JavaScript errors in the admin', async () => { assert.deepEqual(errors.flat(), []); });

await browser.close();
process.exit(summary() ? 0 : 1);
