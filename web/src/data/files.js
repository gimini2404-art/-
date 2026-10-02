/* Private files without Firebase Storage: files are split into base64 chunks stored in Firestore
   (files/{id} + files/{id}/chunks/{n}); the security rules decide who may read them. */
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase.js';

const CHUNK = 500_000; // bytes per chunk -> ~667k base64 characters (< 720k rule limit)
export const MAX_STUDENT_BYTES = 4_000_000;
export const MAX_STAFF_BYTES = 10_000_000;

const toB64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export async function uploadPrivateFile(file, { kind, owner, program = '' }, limit = MAX_STUDENT_BYTES) {
  if (file.size > limit) throw new Error('file-too-large');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const n = Math.max(1, Math.ceil(bytes.length / CHUNK));
  const id = crypto.randomUUID().replace(/-/g, '');
  await setDoc(doc(db, 'files', id), { kind, owner, program, name: file.name.slice(0, 200), size: file.size, type: file.type || 'application/octet-stream', chunks: n, created: serverTimestamp() });
  for (let i = 0; i < n; i++) await setDoc(doc(db, 'files', id, 'chunks', String(i)), { data: toB64(bytes.subarray(i * CHUNK, (i + 1) * CHUNK)) });
  return { id, name: file.name, size: file.size };
}

export async function downloadPrivateFile(id) {
  const meta = await getDoc(doc(db, 'files', id));
  if (!meta.exists()) throw new Error('not-found');
  const m = meta.data();
  const parts = [];
  for (let i = 0; i < m.chunks; i++) parts.push(fromB64((await getDoc(doc(db, 'files', id, 'chunks', String(i)))).data().data));
  return { blob: new Blob(parts, { type: m.type }), name: m.name };
}

export async function saveBlob(id) {
  const { blob, name } = await downloadPrivateFile(id);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

export async function deletePrivateFile(id) {
  const chunks = await getDocs(collection(db, 'files', id, 'chunks'));
  const b = writeBatch(db);
  chunks.docs.forEach((c) => b.delete(c.ref));
  await b.commit();
  await deleteDoc(doc(db, 'files', id));
}
