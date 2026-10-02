/* Training registration with seat counters kept in Firestore (see firestore.rules for how they are protected). */
import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../firebase.js';
import { getLang, tr } from '../i18n/index.js';
import { hash } from '../util.js';

export async function seatsTaken(slug) {
  try { const d = await getDoc(doc(db, 'trainingStats', slug)); return d.exists() ? d.data().taken || 0 : 0; } catch { return 0; }
}

export const seatInfo = async (program) => {
  if (program.capacity == null || program.capacity === '') return { taken: 0, left: null, full: false };
  const taken = await seatsTaken(program._id);
  return { taken, left: Math.max(program.capacity - taken, 0), full: taken >= program.capacity };
};

export const registrationId = (slug, email) => `${slug}__${hash(email.trim().toLowerCase())}`;

/** Creates the registration (+ increments the seat counter when a seat is free). Returns the status. */
export async function registerForProgram(program, v, { uid = null, enrollment = false } = {}) {
  const email = v.email.trim().toLowerCase();
  const id = registrationId(program._id, email);
  const { taken, full } = await seatInfo(program);
  const status = full ? 'waitlist' : 'pending';
  const batch = writeBatch(db);
  batch.set(doc(db, 'registrations', id), {
    program: program._id, program_title: tr(program, 'title'), name: v.name, email, organization: v.organization || '', phone: v.phone || '',
    message: v.message || '', status, language: getLang(), uid: uid || '', created: serverTimestamp(),
  });
  if (!full) batch.set(doc(db, 'trainingStats', program._id), { taken: taken + 1, last: id });
  await batch.commit();
  return { status, id };
}
