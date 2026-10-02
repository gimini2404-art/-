/* Import of the JSON produced by `python manage.py export_firebase` (and of re-exports). Works in the browser
   (admin "Import data") and in Node with a Firestore instance that may write (emulator). */
import { Timestamp, doc, writeBatch } from 'firebase/firestore';
import { hash } from '../util.js';
import { rebuildAll, rebuildSettings } from './snapshots.js';

const TS = new Set(['created', 'updated', 'publish_at', 'unpublish_at']);

function toFirestore(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === '_id') continue;
    out[k] = TS.has(k) && typeof v === 'string' ? Timestamp.fromDate(new Date(v)) : v;
  }
  return out;
}

const tok = () => [...crypto.getRandomValues(new Uint8Array(18))].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 28);

export async function importSeed(db, seed, { onProgress = () => {}, mediaMap = {}, snapshots = true } = {}) {
  const rewrite = (v) => {
    if (typeof v === 'string') return mediaMap[v] || v;
    if (Array.isArray(v)) return v.map(rewrite);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rewrite(x)]));
    return v;
  };
  const writes = []; // [path-array, data]
  const add = (col, id, data) => writes.push([[col, id], data]);

  if (seed.settings) add('settings', 'main', toFirestore(rewrite(seed.settings)));
  for (const [col, docs] of Object.entries(seed.collections || {})) for (const d of docs) add(col, d._id, toFirestore(rewrite(d)));

  const raw = seed.raw || {};
  const now = Timestamp.now();
  for (const c of raw.contactRequests || []) add('contactRequests', tok(), { ...c, created: c.created ? Timestamp.fromDate(new Date(c.created)) : now });
  for (const s of raw.subscribers || []) {
    const key = hash(s.email.toLowerCase());
    add('subscriberEmails', key, { token: s.token, created: s.created ? Timestamp.fromDate(new Date(s.created)) : now });
    add('subscribers', s.token, { email: s.email.toLowerCase(), language: s.language || '', is_active: s.is_active !== false, created: s.created ? Timestamp.fromDate(new Date(s.created)) : now, emailKey: key });
  }
  const taken = {};
  for (const r of raw.registrations || []) {
    const id = `${r.program}__${hash(r.email.toLowerCase())}`;
    add('registrations', id, { ...r, email: r.email.toLowerCase(), uid: '', created: r.created ? Timestamp.fromDate(new Date(r.created)) : now });
    if (!['waitlist', 'cancelled'].includes(r.status)) taken[r.program] = (taken[r.program] || 0) + 1;
  }
  for (const [slug, n] of Object.entries(taken)) add('trainingStats', slug, { taken: n, last: '' });

  let done = 0;
  for (let i = 0; i < writes.length; i += 400) {
    const batch = writeBatch(db);
    for (const [[col, id], data] of writes.slice(i, i + 400)) batch.set(doc(db, col, id), data);
    await batch.commit();
    done += Math.min(400, writes.length - i);
    onProgress({ stage: 'documents', done, total: writes.length });
  }
  if (snapshots) {
    if (seed.settings) await rebuildSettings(db, rewrite(seed.settings));
    await rebuildAll(db, (col) => onProgress({ stage: 'snapshot', col }));
  }
  return { documents: writes.length };
}
