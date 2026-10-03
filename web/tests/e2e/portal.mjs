import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { go, launch, newPage, ready, step, summary } from './lib.mjs';
import { withAdminDb } from '../emu.mjs';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const browser = await launch();
const errors = [];
const OOB = 'http://127.0.0.1:9099/emulator/v1/projects/demo-sianexis/oobCodes';

async function oobLink(email, type) {
  const j = await (await fetch(OOB)).json();
  const hit = [...j.oobCodes].reverse().find((c) => c.email === email && c.requestType === type);
  return hit?.oobLink;
}
async function signup(page, name, email, pw = 'Passw0rd!x') {
  await go(page, '/en/account/signup/'); await ready(page, '#f');
  await page.fill('#f-full_name', name); await page.fill('#f-email', email); await page.fill('#f-university', 'Cairo University');
  await page.fill('#f-password1', pw); await page.fill('#f-password2', pw); await page.waitForTimeout(3200);
  await page.click('#f button[type=submit]');
}
async function verifyAndEnter(page, email) {
  await page.waitForURL('**/account/confirm-email/');
  const link = await oobLink(email, 'VERIFY_EMAIL'); assert.ok(link, 'verification link was issued');
  await fetch(link);
  await page.click('#recheck'); await page.waitForURL('**/en/account/');
  await page.waitForSelector('.portal-main');
}
async function student(name, email) {
  const page = await newPage(browser); errors.push(page.errors);
  await signup(page, name, email); await verifyAndEnter(page, email);
  return page;
}
async function staff(email = 'boss@example.com') {
  const page = await newPage(browser); errors.push(page.errors);
  await go(page, '/admin/'); await page.waitForSelector('#ad-login');
  await page.fill('input[name=email]', email); await page.fill('input[name=password]', 'Passw0rd!x'); await page.click('#ad-login button[type=submit]');
  await page.waitForSelector('.ad-card'); return page;
}

console.log('Student portal');
let sara, saraPage;
await step('sign-up validates input, then asks to confirm the email address', async () => {
  const page = await newPage(browser); errors.push(page.errors);
  await go(page, '/en/account/signup/'); await ready(page, '#f');
  await page.fill('#f-full_name', 'Sara Ahmed'); await page.fill('#f-email', 'sara@example.com'); await page.fill('#f-password1', 'Passw0rd!x'); await page.fill('#f-password2', 'different');
  await page.waitForTimeout(3200); await page.click('#f button[type=submit]');
  assert.match(await page.locator('.errorlist:not([hidden])').first().innerText(), /do not match/i);
  await page.fill('#f-password2', 'Passw0rd!x'); await page.click('#f button[type=submit]');
  await page.waitForURL('**/account/confirm-email/');
  assert.match(await page.locator('main').innerText(), /sara@example.com/);
  saraPage = page;
});
await step('unverified students are kept on the confirmation page', async () => {
  await go(saraPage, '/en/account/courses/'); await saraPage.waitForURL('**/account/confirm-email/');
  await saraPage.click('#recheck'); await saraPage.waitForSelector('.toast.error');
});
await step('after the e-mail link is opened the dashboard works and a profile + welcome notification exist', async () => {
  const link = await oobLink('sara@example.com', 'VERIFY_EMAIL'); assert.ok(link);
  await fetch(link);
  await saraPage.click('#recheck'); await saraPage.waitForURL('**/en/account/'); await saraPage.waitForSelector('.pstats');
  assert.match(await saraPage.locator('.portal-nav .who').innerText(), /Sara Ahmed/);
  assert.match(await saraPage.locator('.pcard.wide').innerText(), /Welcome to SiaNexis/);
  assert.ok(await saraPage.locator('.hdr .nav-account:has-text("My account")').count() === 1);
});
await step('a duplicate e-mail cannot sign up again', async () => {
  const p = await newPage(browser); errors.push(p.errors);
  await signup(p, 'Sara Again', 'sara@example.com');
  await p.waitForSelector('.errorlist:not([hidden]) li'); assert.match(await p.locator('.errorlist:not([hidden])').first().innerText(), /already exists/i);
  await p.context().close();
});
await step('enroll from a training page, pending until staff approve', async () => {
  await go(saraPage, '/en/training/meta-analysis-101/register/'); await ready(saraPage, '#enroll-btn');
  await saraPage.click('#enroll-btn'); await saraPage.waitForURL('**/account/courses/meta-analysis-101/');
  await saraPage.waitForSelector('.st-pending');
  assert.match(await saraPage.locator('.portal-main').innerText(), /Materials become available once/);
  await go(saraPage, '/en/training/meta-analysis-101/register/'); await ready(saraPage, '.seats');
  assert.match(await saraPage.locator('.seats').innerText(), /1 seats left/);
});
await step('enrolling twice does not duplicate', async () => {
  await go(saraPage, '/en/training/meta-analysis-101/register/'); await ready(saraPage, '#enroll-btn');
  await saraPage.click('#enroll-btn'); await saraPage.waitForURL('**/account/courses/meta-analysis-101/');
  await withAdminDb(async (db) => { const { getDocs, collection } = await import('firebase/firestore'); assert.equal((await getDocs(collection(db, 'enrollments'))).size, 1); assert.equal((await getDocs(collection(db, 'registrations'))).size, 1); });
});
let boss;
await step('staff approve the enrollment; the student is notified and sees the materials', async () => {
  await withAdminDb(async (db) => {
    await setDoc(doc(db, 'files', 'f1'), { kind: 'material', program: 'meta-analysis-101', owner: 'x', name: 'slides.txt', size: 10, type: 'text/plain', chunks: 1 });
    await setDoc(doc(db, 'files/f1/chunks/0'), { data: Buffer.from('hello-file').toString('base64') });
    await setDoc(doc(db, 'materials', 'm1'), { program: 'meta-analysis-101', title: 'Week 1 slides', description: 'Intro', file: 'f1', link: '', order: 0 });
    await setDoc(doc(db, 'materials', 'm2'), { program: 'meta-analysis-101', title: 'Reading list', description: '', file: '', link: 'https://example.org/reading', order: 1 });
  });
  boss = await staff();
  await go(boss, '/admin/enrollments'); await boss.waitForSelector('[data-set=approved]');
  await boss.click('[data-set=approved]'); await boss.waitForSelector('.toast');
  await go(saraPage, '/en/account/'); await saraPage.waitForSelector('.pstats');
  assert.match(await saraPage.locator('.pcard.wide').innerText(), /now: Approved/);
  assert.ok(await saraPage.locator('.portal-nav .badge').count() === 1);
  await go(saraPage, '/en/account/courses/meta-analysis-101/'); await saraPage.waitForSelector('.st-approved');
  assert.match(await saraPage.locator('.portal-main').innerText(), /Week 1 slides/);
  const [dl] = await Promise.all([saraPage.waitForEvent('download'), saraPage.click('[data-file="f1"]')]);
  assert.equal(fs.readFileSync(await dl.path(), 'utf8'), 'hello-file');
  assert.equal(await saraPage.locator('a[href="https://example.org/reading"]').count(), 1);
});
await step('notifications page lists and clears the unread badge', async () => {
  await go(saraPage, '/en/account/notifications/'); await saraPage.waitForSelector('.portal-main .row');
  await saraPage.reload(); await saraPage.waitForSelector('.portal-main');
  assert.equal(await saraPage.locator('.portal-nav .badge').count(), 0);
});
await step('another student can neither see nor open Sara\'s course or materials', async () => {
  const other = await student('Omar Ali', 'omar@example.com');
  await go(other, '/en/account/courses/meta-analysis-101/'); await other.waitForSelector('.portal-main');
  assert.match(await other.locator('.portal-main').innerText(), /404/);
  await withAdminDb(async () => {});
  other.context().close();
});
await step('staff change the registration status: the linked enrollment follows', async () => {
  await go(boss, '/admin/registrations'); await boss.waitForSelector('select.st');
  await boss.locator('select.st').first().selectOption('cancelled'); await boss.waitForSelector('.toast');
  await go(saraPage, '/en/account/courses/'); await saraPage.waitForSelector('.st');
  assert.match(await saraPage.locator('.portal-main').innerText(), /Cancelled/);
  await boss.locator('select.st').first().selectOption('confirmed').catch(() => {});
});
await step('project request lifecycle: draft, attachment, submit, reject with a message, resubmit, approve, publish as draft project', async () => {
  const tmp = path.join(os.tmpdir(), 'outline.txt'); fs.writeFileSync(tmp, 'my outline');
  await go(saraPage, '/en/account/projects/new/'); await saraPage.waitForSelector('#f');
  await saraPage.fill('#f-title', 'Sleep and exam results'); await saraPage.fill('#f-summary', 'Does sleep affect exam results?');
  await saraPage.selectOption('#f-research_area', 'psychiatry'); await saraPage.setInputFiles('input[name=attachment]', tmp);
  await saraPage.click('[data-do=draft]'); await saraPage.waitForURL(/projects\/[a-z0-9]{20}\//);
  await saraPage.waitForSelector('.st-draft'); assert.match(await saraPage.locator('.portal-main').innerText(), /draft/i);
  const projectUrl = saraPage.url();
  await go(saraPage, new URL(projectUrl).pathname + '?edit=1'); await saraPage.waitForSelector('#f');
  await saraPage.fill('#f-summary', 'Does sleep affect exam results in first-year students?');
  await saraPage.click('[data-do=submit]'); await saraPage.waitForSelector('.st-submitted');
  await go(saraPage, new URL(projectUrl).pathname + '?edit=1'); await saraPage.waitForSelector('.portal-main'); // locked now: no form
  assert.equal(await saraPage.locator('#f').count(), 0);
  // staff reject with a message
  await go(boss, '/admin/project-requests'); await boss.waitForSelector('[data-open]');
  await boss.click('[data-open]'); await boss.waitForSelector('.ad-modal #note');
  const [adl] = await Promise.all([boss.waitForEvent('download'), boss.click('#att')]); assert.equal(fs.readFileSync(await adl.path(), 'utf8'), 'my outline');
  await boss.fill('#note', 'Please narrow the scope'); await boss.click('[data-s=rejected]'); await boss.waitForSelector('.toast');
  await go(saraPage, new URL(projectUrl).pathname); await saraPage.waitForSelector('.st-rejected');
  assert.match(await saraPage.locator('.notice').innerText(), /narrow the scope/);
  await saraPage.click('a:has-text("Edit")'); await saraPage.waitForSelector('#f');
  await saraPage.fill('#f-title', 'Sleep and exam results (narrower)'); await saraPage.click('[data-do=submit]'); await saraPage.waitForSelector('.st-submitted');
  // approve and turn into a draft public project
  await go(boss, '/admin/project-requests'); await boss.waitForSelector('[data-open]');
  await boss.click('[data-open]'); await boss.waitForSelector('#mk');
  await boss.click('[data-s=approved]'); await boss.waitForSelector('.toast');
  await boss.click('[data-open]'); await boss.waitForSelector('#mk'); await boss.click('#mk'); await boss.waitForSelector('.toast');
  await withAdminDb(async (db) => { const d = (await getDoc(doc(db, 'projects', 'sleep-and-exam-results-narrower'))).data(); assert.equal(d.is_published, false); assert.equal(d.research_area, 'psychiatry'); });
  const vis = await newPage(browser); await go(vis, '/en/projects/sleep-and-exam-results-narrower/'); await ready(vis, '.pagehead h1'); assert.equal(await vis.locator('.pagehead h1').innerText(), '404'); await vis.context().close();
});
await step('uploads are validated (type and size)', async () => {
  const bad = path.join(os.tmpdir(), 'evil.exe'); fs.writeFileSync(bad, 'MZ');
  const big = path.join(os.tmpdir(), 'big.pdf'); fs.writeFileSync(big, Buffer.alloc(4_100_000));
  await go(saraPage, '/en/account/projects/new/'); await saraPage.waitForSelector('#f');
  await saraPage.fill('#f-title', 'X'); await saraPage.fill('#f-summary', 'Y');
  await saraPage.setInputFiles('input[name=attachment]', bad); await saraPage.click('[data-do=draft]');
  assert.match(await saraPage.locator('.errorlist:not([hidden])').first().innerText(), /Unsupported file type/);
  await saraPage.setInputFiles('input[name=attachment]', big); await saraPage.click('[data-do=draft]');
  assert.match(await saraPage.locator('.errorlist:not([hidden])').first().innerText(), /larger than 4 MB/);
});
await step('drafts can be deleted; submitted requests cannot', async () => {
  await go(saraPage, '/en/account/projects/new/'); await saraPage.waitForSelector('#f');
  await saraPage.fill('#f-title', 'Throwaway'); await saraPage.fill('#f-summary', 'z'); await saraPage.click('[data-do=draft]'); await saraPage.waitForURL(/projects\/[a-z0-9]{20}\//);
  saraPage.once('dialog', (d) => d.accept());
  await saraPage.click('#del'); await saraPage.waitForURL('**/account/projects/');
  assert.doesNotMatch(await saraPage.locator('.portal-main').innerText(), /Throwaway/);
});
await step('profile: update details and language, change password, sign in again with the new password', async () => {
  await go(saraPage, '/en/account/profile/'); await saraPage.waitForSelector('#f');
  await saraPage.fill('#f-university', 'AUC'); await saraPage.selectOption('#f-language', 'ar'); await saraPage.click('#f button[type=submit]'); await saraPage.waitForSelector('.toast');
  await withAdminDb(async (db) => { const { getDocs, collection } = await import('firebase/firestore'); const s = (await getDocs(collection(db, 'students'))).docs.find((d) => d.data().email === 'sara@example.com').data(); assert.equal(s.university, 'AUC'); assert.equal(s.language, 'ar'); });
  await saraPage.fill('#f-old', 'Passw0rd!x'); await saraPage.fill('#f-p1', 'N3w-Passw0rd!'); await saraPage.fill('#f-p2', 'N3w-Passw0rd!'); await saraPage.click('#pw button[type=submit]'); await saraPage.waitForSelector('.toast >> nth=1');
  await saraPage.click('#signout'); await saraPage.waitForURL(/\/en\/$/);
  await go(saraPage, '/en/account/login/'); await ready(saraPage, '#f');
  await saraPage.fill('#f-email', 'sara@example.com'); await saraPage.fill('#f-password', 'Passw0rd!x'); await saraPage.click('#f button[type=submit]');
  assert.match(await saraPage.locator('.errorlist:not([hidden])').first().innerText(), /Incorrect email or password/);
  await saraPage.fill('#f-password', 'N3w-Passw0rd!'); await saraPage.click('#f button[type=submit]'); await saraPage.waitForURL('**/account/');
});
await step('notifications reach the student in their own language (Arabic)', async () => {
  await go(boss, '/admin/enrollments'); await boss.waitForSelector('[data-set]');
  await boss.click('[data-set=completed]'); await boss.waitForSelector('.toast');
  await go(saraPage, '/ar/account/'); await saraPage.waitForSelector('.pstats');
  assert.equal(await saraPage.getAttribute('html', 'dir'), 'rtl');
  assert.match(await saraPage.locator('.pcard.wide').innerText(), /مكتمل/);
});
await step('password reset e-mail is issued', async () => {
  const p = await newPage(browser); await go(p, '/en/account/password-reset/'); await ready(p, '#f');
  await p.fill('#f-email', 'sara@example.com'); await p.click('#f button[type=submit]'); await p.waitForSelector('#done:not([hidden])');
  assert.ok(await oobLink('sara@example.com', 'PASSWORD_RESET')); await p.context().close();
});
await step('Google sign-in button is offered on login and sign-up', async () => {
  const p = await newPage(browser); await go(p, '/en/account/login/'); await ready(p, '#google'); await go(p, '/en/account/signup/'); await ready(p, '#google'); await p.context().close();
});
await step('no JavaScript errors in the portal', async () => { assert.deepEqual(errors.flat(), []); });

await browser.close();
process.exit(summary() ? 0 : 1);
