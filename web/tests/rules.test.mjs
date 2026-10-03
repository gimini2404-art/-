import assert from 'node:assert/strict';
import fs from 'node:fs';
import { after, before, beforeEach, describe, it } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';

let env;
const D = (ctx) => ctx.firestore();
const anon = () => env.unauthenticatedContext();
const user = (uid = 'u1', email = 'sara@example.com', verified = true) => env.authenticatedContext(uid, { email, email_verified: verified });
const hoursFromNow = (h) => Timestamp.fromMillis(Date.now() + h * 3600_000);

before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-rules', firestore: { rules: fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') } });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admins/boss'), { role: 'admin' });
    await setDoc(doc(db, 'admins/ed'), { role: 'editor' });
    await setDoc(doc(db, 'admins/con'), { role: 'contributor' });
    await setDoc(doc(db, 'posts/live'), { is_published: true, title_en: 'Live' });
    await setDoc(doc(db, 'posts/draft'), { is_published: false, title_en: 'Draft' });
    await setDoc(doc(db, 'posts/future'), { is_published: true, publish_at: hoursFromNow(5) });
    await setDoc(doc(db, 'posts/past'), { is_published: true, publish_at: hoursFromNow(-5) });
    await setDoc(doc(db, 'posts/expired'), { is_published: true, unpublish_at: hoursFromNow(-1) });
    await setDoc(doc(db, 'training/free'), { is_published: true, registration_open: true, title_en: 'Free course', capacity: null });
    await setDoc(doc(db, 'training/small'), { is_published: true, registration_open: true, title_en: 'Small', capacity: 1 });
    await setDoc(doc(db, 'training/closed'), { is_published: true, registration_open: false, capacity: null });
    await setDoc(doc(db, 'training/ext'), { is_published: true, registration_open: true, registration_link: 'https://x.org', capacity: null });
  });
});

describe('public content', () => {
  it('visitors read live documents only, never lists', async () => {
    const db = D(anon());
    await assertSucceeds(getDoc(doc(db, 'posts/live')));
    await assertSucceeds(getDoc(doc(db, 'posts/past')));
    await assertFails(getDoc(doc(db, 'posts/draft')));
    await assertFails(getDoc(doc(db, 'posts/future')));
    await assertFails(getDoc(doc(db, 'posts/expired')));
    await assertFails(getDocs(collection(db, 'posts')));
  });
  it('staff see drafts and list collections', async () => {
    const db = D(user('con', 'con@x.org'));
    await assertSucceeds(getDoc(doc(db, 'posts/draft')));
    await assertSucceeds(getDocs(collection(db, 'posts')));
  });
  it('snapshots are public to read, staff-only to write', async () => {
    await assertSucceeds(getDoc(doc(D(anon()), 'snapshots/posts')));
    await assertFails(setDoc(doc(D(anon()), 'snapshots/posts'), { items: [] }));
    await assertFails(setDoc(doc(D(user('stud')), 'snapshots/posts'), { items: [] }));
    await assertSucceeds(setDoc(doc(D(user('con')), 'snapshots/posts'), { items: [] }));
  });
  it('roles: contributors cannot delete or edit settings, editors can, only admins manage admins', async () => {
    await assertSucceeds(setDoc(doc(D(user('con')), 'posts/new'), { is_published: false }));
    await assertFails(deleteDoc(doc(D(user('con')), 'posts/new')));
    await assertFails(setDoc(doc(D(user('con')), 'settings/main'), { site_name_en: 'x' }));
    await assertSucceeds(setDoc(doc(D(user('ed')), 'settings/main'), { site_name_en: 'x' }));
    await assertSucceeds(deleteDoc(doc(D(user('ed')), 'posts/new')));
    await assertFails(setDoc(doc(D(user('ed')), 'admins/x'), { role: 'admin' }));
    await assertSucceeds(setDoc(doc(D(user('boss')), 'admins/x'), { role: 'editor' }));
    await assertFails(setDoc(doc(D(user('stud')), 'admins/stud'), { role: 'admin' }));
    await assertSucceeds(getDoc(doc(D(user('con')), 'admins/con')));
    await assertFails(getDoc(doc(D(user('stud')), 'admins/boss')));
  });
  it('anonymous users can not write content or history', async () => {
    await assertFails(setDoc(doc(D(anon()), 'posts/hack'), { is_published: true }));
    await assertFails(setDoc(doc(D(anon()), 'history/h'), { a: 1 }));
  });
});

describe('contact + newsletter', () => {
  const contact = (o = {}) => ({ request_type: 'other', name: 'Sara', email: 'sara@example.com', organization: '', subject: '', message: 'Hello', status: 'new', internal_notes: '', language: 'en', created: serverTimestamp(), ...o });
  it('accepts a valid request and hides it from the public', async () => {
    const db = D(anon());
    await assertSucceeds(setDoc(doc(db, 'contactRequests/a'), contact()));
    await assertFails(getDoc(doc(db, 'contactRequests/a')));
    await assertSucceeds(getDoc(doc(D(user('con')), 'contactRequests/a')));
  });
  it('rejects malformed requests', async () => {
    const db = D(anon());
    await assertFails(setDoc(doc(db, 'contactRequests/b'), contact({ request_type: 'hack' })));
    await assertFails(setDoc(doc(db, 'contactRequests/c'), contact({ email: 'nope' })));
    await assertFails(setDoc(doc(db, 'contactRequests/d'), contact({ message: '' })));
    await assertFails(setDoc(doc(db, 'contactRequests/e'), contact({ status: 'closed' })));
    await assertFails(setDoc(doc(db, 'contactRequests/f'), contact({ extra: 1 })));
    await assertFails(setDoc(doc(db, 'contactRequests/g'), contact({ message: 'x'.repeat(5001) })));
    await assertFails(setDoc(doc(db, 'contactRequests/h'), contact({ created: Timestamp.fromMillis(1) })));
  });
  const sub = (db, token, email, key) => {
    const b = writeBatch(db);
    b.set(doc(db, 'subscriberEmails', key), { token, created: serverTimestamp() });
    b.set(doc(db, 'subscribers', token), { email, language: 'en', is_active: true, created: serverTimestamp(), emailKey: key });
    return b.commit();
  };
  it('subscribes once per e-mail key, unsubscribes with the token only', async () => {
    const db = D(anon());
    await assertSucceeds(sub(db, 'tok-aaaaaaaaaaaaaaaa', 'a@x.org', 'k1'));
    await assertFails(sub(db, 'tok-bbbbbbbbbbbbbbbb', 'a@x.org', 'k1')); // duplicate
    await assertFails(getDocs(collection(db, 'subscribers')));
    await assertSucceeds(getDoc(doc(db, 'subscribers/tok-aaaaaaaaaaaaaaaa')));
    await assertFails(updateDoc(doc(db, 'subscribers/tok-aaaaaaaaaaaaaaaa'), { email: 'evil@x.org' }));
    await assertFails(updateDoc(doc(db, 'subscribers/tok-aaaaaaaaaaaaaaaa'), { is_active: true }));
    await assertSucceeds(updateDoc(doc(db, 'subscribers/tok-aaaaaaaaaaaaaaaa'), { is_active: false }));
  });
  it('a subscriber record cannot be created without its e-mail key batch', async () => {
    await assertFails(setDoc(doc(D(anon()), 'subscribers/tok-cccccccccccccccc'), { email: 'a@x.org', language: 'en', is_active: true, created: serverTimestamp(), emailKey: 'k9' }));
  });
});

describe('training registrations and seat counters', () => {
  const regData = (slug, email, status, o = {}) => ({ program: slug, program_title: 'T', name: 'Sara', email, organization: '', phone: '', message: '', status, language: 'en', uid: '', created: serverTimestamp(), ...o });
  const reg = (db, slug, email, id, status = 'pending', { counter = true, taken = 0, extra = {} } = {}) => {
    const b = writeBatch(db);
    b.set(doc(db, 'registrations', id), regData(slug, email, status, extra));
    if (counter) b.set(doc(db, 'trainingStats', slug), { taken: taken + 1, last: id });
    return b.commit();
  };
  it('first registration creates the counter, the next one increments it', async () => {
    const db = D(anon());
    await assertSucceeds(reg(db, 'free', 'a@x.org', 'free__a'));
    await assertSucceeds(reg(db, 'free', 'b@x.org', 'free__b', 'pending', { taken: 1 }));
    let s;
    await env.withSecurityRulesDisabled(async (c) => { s = (await getDoc(doc(c.firestore(), 'trainingStats/free'))).data(); });
    assert.equal(s.taken, 2);
  });
  it('rejects duplicates, forged counters and closed or external programs', async () => {
    const db = D(anon());
    await assertSucceeds(reg(db, 'free', 'a@x.org', 'free__a'));
    await assertFails(reg(db, 'free', 'a@x.org', 'free__a', 'pending', { taken: 1 }));          // duplicate id
    await assertFails(reg(db, 'free', 'c@x.org', 'free__c', 'pending', { taken: 5 }));          // counter jump
    await assertFails(reg(db, 'free', 'd@x.org', 'free__d', 'pending', { counter: false }));    // no counter bump
    await assertFails(reg(db, 'closed', 'e@x.org', 'closed__e'));
    await assertFails(reg(db, 'ext', 'f@x.org', 'ext__f'));
    await assertFails(reg(db, 'nonexistent', 'g@x.org', 'nonexistent__g'));
    await assertFails(reg(db, 'free', 'not-an-email', 'free__h'));
    await assertFails(reg(db, 'free', 'i@x.org', 'wrongprefix__i'));
  });
  it('a stat document can not be changed without a new registration', async () => {
    const db = D(anon());
    await assertSucceeds(reg(db, 'free', 'a@x.org', 'free__a'));
    await assertFails(setDoc(doc(db, 'trainingStats/free'), { taken: 0, last: 'free__a' }));
    await assertFails(setDoc(doc(db, 'trainingStats/free'), { taken: 99, last: 'free__zzz' }));
    await assertSucceeds(setDoc(doc(D(user('ed')), 'trainingStats/free'), { taken: 0, last: '' }));
    await assertSucceeds(getDoc(doc(db, 'trainingStats/free')));
  });
  it('enforces capacity: full programs only accept waiting-list entries', async () => {
    const db = D(anon());
    await assertSucceeds(reg(db, 'small', 'a@x.org', 'small__a'));
    await assertFails(reg(db, 'small', 'b@x.org', 'small__b', 'pending', { taken: 1 }));                       // over capacity
    await assertFails(reg(db, 'small', 'c@x.org', 'small__c', 'waitlist', { counter: true, taken: 1 }));       // waitlist must not bump
    await assertSucceeds(reg(db, 'small', 'd@x.org', 'small__d', 'waitlist', { counter: false }));
    await assertFails(reg(db, 'free', 'e@x.org', 'free__e', 'waitlist', { counter: false }));                  // not full: waitlist forbidden
  });
  it('registrations are private to staff and their verified owner', async () => {
    await assertSucceeds(reg(D(anon()), 'free', 'sara@example.com', 'free__s'));
    await assertFails(getDoc(doc(D(anon()), 'registrations/free__s')));
    await assertFails(getDoc(doc(D(user('x', 'other@x.org')), 'registrations/free__s')));
    await assertSucceeds(getDoc(doc(D(user('u1', 'sara@example.com')), 'registrations/free__s')));
    await assertFails(getDoc(doc(D(user('u1', 'sara@example.com', false)), 'registrations/free__s')));
    await assertSucceeds(getDocs(collection(D(user('ed')), 'registrations')));
    await assertFails(getDocs(collection(D(anon()), 'registrations')));
  });
  it('a student can cancel their own registration and free the seat, nobody else can', async () => {
    const me = D(user('u1', 'sara@example.com'));
    await assertSucceeds(reg(me, 'free', 'sara@example.com', 'free__s', 'pending', { extra: { uid: 'u1' } }));
    await assertFails(updateDoc(doc(D(user('x', 'x@x.org')), 'registrations/free__s'), { status: 'cancelled' }));
    await assertFails(updateDoc(doc(me, 'registrations/free__s'), { status: 'confirmed' }));
    const b = writeBatch(me);
    b.update(doc(me, 'registrations/free__s'), { status: 'cancelled' });
    b.set(doc(me, 'trainingStats/free'), { taken: 0, last: 'free__s' });
    await assertSucceeds(b.commit());
  });
  it('a verified student can only register with their own e-mail and uid', async () => {
    const me = D(user('u1', 'sara@example.com'));
    await assertFails(reg(me, 'free', 'other@x.org', 'free__o', 'pending', { extra: { uid: 'u1' } }));
    await assertFails(reg(D(user('u1', 'sara@example.com', false)), 'free', 'sara@example.com', 'free__p', 'pending', { extra: { uid: 'u1' } }));
    await assertFails(reg(D(anon()), 'free', 'sara@example.com', 'free__q', 'pending', { extra: { uid: 'u1' } }));
  });
});

describe('student portal', () => {
  const profile = (o = {}) => ({ full_name: 'Sara', email: 'sara@example.com', university: 'AUC', field_of_study: '', phone: '', language: 'en', created: serverTimestamp(), ...o });
  it('profiles: verified owner only', async () => {
    await assertSucceeds(setDoc(doc(D(user('u1')), 'students/u1'), profile()));
    await assertFails(setDoc(doc(D(user('u2')), 'students/u1'), profile()));
    await assertFails(setDoc(doc(D(user('u3', 'sara@example.com', false)), 'students/u3'), profile()));
    await assertFails(setDoc(doc(D(user('u4')), 'students/u4'), profile({ email: 'someone@else.org' })));
    await assertSucceeds(updateDoc(doc(D(user('u1')), 'students/u1'), { university: 'Cairo U' }));
    await assertFails(updateDoc(doc(D(user('u1')), 'students/u1'), { email: 'x@x.org' }));
    await assertFails(getDoc(doc(D(user('u2')), 'students/u1')));
    await assertSucceeds(getDoc(doc(D(user('ed')), 'students/u1')));
  });
  const enroll = (db, uid, email, slug, status = 'pending', taken = 0) => {
    const b = writeBatch(db);
    const rid = `${slug}__k${uid}`;
    b.set(doc(db, 'registrations', rid), { program: slug, program_title: 'T', name: 'S', email, organization: '', phone: '', message: '', status, language: 'en', uid, created: serverTimestamp() });
    if (status === 'pending') b.set(doc(db, 'trainingStats', slug), { taken: taken + 1, last: rid });
    b.set(doc(db, 'enrollments', `${uid}__${slug}`), { uid, program: slug, program_title: 'T', status, note: '', registration: rid, created: serverTimestamp(), updated: serverTimestamp() });
    return b.commit();
  };
  it('enrollment: own record, registration must match, staff approve, student may only cancel', async () => {
    const me = D(user('u1', 'sara@example.com'));
    await assertSucceeds(enroll(me, 'u1', 'sara@example.com', 'free'));
    await assertFails(enroll(D(user('u2', 'b@x.org')), 'u1', 'b@x.org', 'free'));                       // wrong uid
    await assertFails(updateDoc(doc(me, 'enrollments/u1__free'), { status: 'approved' }));
    await assertSucceeds(updateDoc(doc(D(user('ed')), 'enrollments/u1__free'), { status: 'approved', note: 'Welcome' }));
    await assertFails(getDoc(doc(D(user('u2', 'b@x.org')), 'enrollments/u1__free')));
    await assertSucceeds(updateDoc(doc(me, 'enrollments/u1__free'), { status: 'cancelled', updated: serverTimestamp() }));
  });
  it('reading a missing enrollment answers "not found" for the owner only', async () => {
    const snap = await assertSucceeds(getDoc(doc(D(user('u1', 'sara@example.com')), 'enrollments/u1__free')));
    assert.equal(snap.exists(), false);
    await assertFails(getDoc(doc(D(user('u2', 'b@x.org')), 'enrollments/u1__free')));   // somebody else's id
    await assertFails(getDoc(doc(D(user('u1', 'sara@example.com', false)), 'enrollments/u1__free'))); // e-mail not verified
    await assertFails(getDoc(doc(D(anon()), 'enrollments/u1__free')));
  });
  it('materials and private files are for approved students and staff only', async () => {
    const me = D(user('u1', 'sara@example.com'));
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'materials/m1'), { program: 'free', title: 'Slides', file: 'f1' });
      await setDoc(doc(db, 'files/f1'), { kind: 'material', program: 'free', owner: 'ed', name: 'a.pdf', size: 3, type: 'application/pdf', chunks: 1 });
      await setDoc(doc(db, 'files/f1/chunks/0'), { data: 'QUJD' });
    });
    await assertFails(getDoc(doc(me, 'materials/m1')));
    await assertFails(getDoc(doc(me, 'files/f1/chunks/0')));
    await enroll(me, 'u1', 'sara@example.com', 'free');
    await assertFails(getDoc(doc(me, 'materials/m1'))); // still pending
    await env.withSecurityRulesDisabled((c) => updateDoc(doc(c.firestore(), 'enrollments/u1__free'), { status: 'approved' }));
    await assertSucceeds(getDoc(doc(me, 'materials/m1')));
    await assertSucceeds(getDocs(query(collection(me, 'materials'), where('program', '==', 'free'))));
    await assertSucceeds(getDoc(doc(me, 'files/f1/chunks/0')));
    await assertFails(getDoc(doc(D(user('u9', 'z@x.org')), 'materials/m1')));
    await assertFails(getDoc(doc(D(anon()), 'files/f1')));
    await assertFails(setDoc(doc(me, 'materials/m2'), { program: 'free', title: 'x' }));
  });
  const pr = (o = {}) => ({ uid: 'u1', title: 'Sleep study', summary: 'Why?', research_area: '', supervisor: '', attachment: '', attachment_name: '', status: 'draft', review_note: '', submitted_at: null, project: '', created: serverTimestamp(), updated: serverTimestamp(), ...o });
  it('project requests: owner drafts/submits/edits, staff review, nobody else sees them', async () => {
    const me = D(user('u1', 'sara@example.com'));
    await assertSucceeds(setDoc(doc(me, 'projectRequests/p1'), pr()));
    await assertFails(setDoc(doc(me, 'projectRequests/p2'), pr({ status: 'approved' })));
    await assertFails(setDoc(doc(me, 'projectRequests/p3'), pr({ uid: 'u2' })));
    await assertFails(setDoc(doc(me, 'projectRequests/p4'), pr({ review_note: 'looks great' })));
    await assertSucceeds(updateDoc(doc(me, 'projectRequests/p1'), { title: 'New title', status: 'submitted', submitted_at: serverTimestamp(), updated: serverTimestamp() }));
    await assertFails(updateDoc(doc(me, 'projectRequests/p1'), { title: 'after submit' }));                // locked while under review
    await assertFails(updateDoc(doc(me, 'projectRequests/p1'), { status: 'approved' }));
    await assertSucceeds(updateDoc(doc(D(user('ed')), 'projectRequests/p1'), { status: 'rejected', review_note: 'narrow it' }));
    await assertSucceeds(updateDoc(doc(me, 'projectRequests/p1'), { title: 'Narrower', status: 'submitted', updated: serverTimestamp() }));
    await assertFails(getDoc(doc(D(user('u2', 'b@x.org')), 'projectRequests/p1')));
    await assertSucceeds(getDocs(query(collection(me, 'projectRequests'), where('uid', '==', 'u1'))));
    await assertFails(getDocs(collection(me, 'projectRequests')));
    await assertFails(deleteDoc(doc(me, 'projectRequests/p1')));       // submitted: no delete
    await assertSucceeds(setDoc(doc(me, 'projectRequests/p5'), pr()));
    await assertSucceeds(deleteDoc(doc(me, 'projectRequests/p5')));    // drafts can be deleted
  });
  it('private attachment files: owner can write chunks within limits', async () => {
    const me = D(user('u1', 'sara@example.com'));
    await assertSucceeds(setDoc(doc(me, 'files/a1'), { kind: 'attachment', owner: 'u1', name: 'p.pdf', size: 1000, type: 'application/pdf', chunks: 1 }));
    await assertSucceeds(setDoc(doc(me, 'files/a1/chunks/0'), { data: 'QUJD' }));
    await assertFails(setDoc(doc(me, 'files/a2'), { kind: 'attachment', owner: 'u1', name: 'big.pdf', size: 99_000_000, type: 'application/pdf', chunks: 1 }));
    await assertFails(setDoc(doc(me, 'files/a3'), { kind: 'material', owner: 'u1', program: 'free', name: 'x', size: 1, type: 't', chunks: 1 }));
    await assertFails(setDoc(doc(D(user('u2', 'b@x.org')), 'files/a1/chunks/1'), { data: 'x' }));
    await assertSucceeds(getDoc(doc(me, 'files/a1/chunks/0')));
    await assertFails(getDoc(doc(D(user('u2', 'b@x.org')), 'files/a1/chunks/0')));
    await assertSucceeds(getDoc(doc(D(user('con')), 'files/a1/chunks/0')));
  });
  it('notifications belong to their owner', async () => {
    const me = D(user('u1', 'sara@example.com'));
    await assertSucceeds(setDoc(doc(D(user('ed')), 'notifications/n1'), { uid: 'u1', text: 'Approved', url: '', read: false, created: serverTimestamp() }));
    await assertSucceeds(getDocs(query(collection(me, 'notifications'), where('uid', '==', 'u1'))));
    await assertFails(getDoc(doc(D(user('u2', 'b@x.org')), 'notifications/n1')));
    await assertSucceeds(updateDoc(doc(me, 'notifications/n1'), { read: true }));
    await assertFails(updateDoc(doc(me, 'notifications/n1'), { text: 'hacked' }));
    await assertSucceeds(setDoc(doc(me, 'notifications/n2'), { uid: 'u1', text: 'Welcome', url: '', read: false, created: serverTimestamp() }));
    await assertFails(setDoc(doc(me, 'notifications/n3'), { uid: 'u2', text: 'Spoof', url: '', read: false, created: serverTimestamp() }));
  });
});
