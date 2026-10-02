/* Builds the public "snapshot" documents from the collections (run by editors after each change). */
import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { SCHEMA, SNAPSHOT_COLLECTIONS } from '../schema.js';
import { chunkSnapshot, norm, publicCopy } from './pure.js';

export async function rebuildSnapshot(db, col) {
  const spec = SCHEMA[col];
  const res = await getDocs(collection(db, col));
  const items = res.docs.map((d) => ({ id: d.id, data: norm(d.data()) }))
    .filter(({ data }) => !spec.publish || data.is_published !== false)
    .map(({ id, data }) => publicCopy(id, data, spec.heavy || []));
  const docs = chunkSnapshot(col, items, { at: serverTimestamp() });
  for (const d of docs) await setDoc(doc(db, 'snapshots', d.id), d.data);
  // remove leftovers of a previous, longer snapshot
  for (let i = docs.length; i < docs.length + 5; i++) { try { await deleteDoc(doc(db, 'snapshots', `${col}__${i}`)); } catch { /* none */ } }
  return items.length;
}

export async function rebuildSettings(db, settingsData) {
  await setDoc(doc(db, 'snapshots', 'settings'), { ...norm(settingsData), at: serverTimestamp() });
}

export async function rebuildAll(db, onProgress = () => {}) {
  for (const col of SNAPSHOT_COLLECTIONS) { onProgress(col); await rebuildSnapshot(db, col); }
}
