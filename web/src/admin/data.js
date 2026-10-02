/* Admin data layer: saving with history + public snapshot refresh, notifications, seat counters. */
import {
  Timestamp, collection, deleteDoc, doc, getCountFromServer, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc, where, writeBatch, limit,
} from 'firebase/firestore';
import { auth, db } from '../firebase.js';
import { clearCache, norm } from '../data/content.js';
import { rebuildSettings, rebuildSnapshot } from '../data/snapshots.js';
import { tLang } from '../i18n/index.js';
import { SCHEMA } from '../schema.js';
import { slugify } from '../util.js';

const TS = new Set(['created', 'updated', 'publish_at', 'unpublish_at', 'submitted_at']);

export const listAll = async (col) => (await getDocs(collection(db, col))).docs.map((d) => ({ _id: d.id, ...norm(d.data()) }));
export const getOne = async (col, id) => { const d = await getDoc(doc(db, col, id)); return d.exists() ? { _id: d.id, ...norm(d.data()) } : null; };

export async function countWhere(col, field, value) {
  try { return (await getCountFromServer(query(collection(db, col), where(field, '==', value)))).data().count; } catch { return 0; }
}

/** Free slug (document id) for a new document. */
export async function freeSlug(col, base) {
  const root = slugify(base) || 'item';
  let slug = root, n = 2;
  while ((await getDoc(doc(db, col, slug))).exists()) slug = `${root}-${n++}`;
  return slug;
}

function stamp(data) {
  const out = {};
  for (const [k, v] of Object.entries(data)) out[k] = TS.has(k) && typeof v === 'string' && v ? Timestamp.fromDate(new Date(v)) : v;
  return out;
}

async function history(col, id, data, label) {
  try {
    await setDoc(doc(collection(db, 'history')), { col, id, label: label || '', data: JSON.stringify(norm(data)), by: auth.currentUser?.email || '', at: serverTimestamp() });
  } catch { /* history is best effort */ }
}

/** Create or update a content document; refreshes the public snapshot. Returns the document id. */
export async function saveContent(col, id, data, { isNew = false, label = '' } = {}) {
  const spec = SCHEMA[col];
  const payload = stamp({ ...data });
  if (isNew) payload.created = serverTimestamp();
  payload.updated = serverTimestamp();
  if (isNew) await setDoc(doc(db, col, id), payload); else await setDoc(doc(db, col, id), payload, { merge: false });
  await history(col, id, { ...data, updated: new Date().toISOString() }, label || (isNew ? 'created' : 'edited'));
  if (spec?.snapshot) await rebuildSnapshot(db, col);
  clearCache();
  return id;
}

export async function saveSettings(data) {
  await setDoc(doc(db, 'settings', 'main'), { ...data, updated: serverTimestamp() });
  await history('settings', 'main', data, 'edited');
  await rebuildSettings(db, data);
  clearCache();
}

export async function removeContent(col, id) {
  const cur = await getOne(col, id);
  if (cur) await history(col, id, cur, 'deleted');
  await deleteDoc(doc(db, col, id));
  if (SCHEMA[col]?.snapshot) await rebuildSnapshot(db, col);
  clearCache();
}

export async function setPublished(col, ids, on) {
  const batch = writeBatch(db);
  ids.forEach((id) => batch.update(doc(db, col, id), { is_published: on, ...(on ? { publish_at: null, unpublish_at: null } : {}), updated: serverTimestamp() }));
  await batch.commit();
  await rebuildSnapshot(db, col);
  clearCache();
}

export async function historyOf(col, id) {
  const res = await getDocs(query(collection(db, 'history'), where('col', '==', col), where('id', '==', id), orderBy('at', 'desc'), limit(30)));
  return res.docs.map((d) => ({ _id: d.id, ...d.data(), at: d.data().at?.toDate?.() || null }));
}

export async function restoreVersion(version) {
  const data = JSON.parse(version.data);
  const { _id, ...rest } = data;
  if (version.col === 'settings') return saveSettings(rest);
  return saveContent(version.col, version.id, rest, { isNew: false, label: 'restored' });
}

/** In-site notification for a student, written in the student's own language: build(tl) gets a translator for that language. */
export async function notifyStudent(uid, build, url = '') {
  let lang = 'en';
  try { const s = await getDoc(doc(db, 'students', uid)); if (s.exists()) lang = s.data().language || 'en'; } catch { /* default */ }
  const text = String(build((key, vars) => tLang(lang, key, vars))).slice(0, 300);
  await setDoc(doc(collection(db, 'notifications')), { uid, text, url, read: false, created: serverTimestamp() });
}

/** Re-count the taken seats of a program (pending + confirmed registrations). */
export async function syncSeats(program) {
  const res = await getDocs(query(collection(db, 'registrations'), where('program', '==', program)));
  const taken = res.docs.filter((d) => !['waitlist', 'cancelled'].includes(d.data().status)).length;
  await setDoc(doc(db, 'trainingStats', program), { taken, last: '' });
  return taken;
}

export async function patch(col, id, fields) {
  await updateDoc(doc(db, col, id), { ...fields });
}
