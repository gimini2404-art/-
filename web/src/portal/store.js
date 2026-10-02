import { collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { auth, db } from '../firebase.js';
import { norm } from '../data/content.js';
import { getLang } from '../i18n/index.js';

const uid = () => auth.currentUser.uid;

export async function getProfile() {
  const d = await getDoc(doc(db, 'students', uid()));
  return d.exists() ? norm(d.data()) : null;
}

/** First verified visit: create the student profile. */
export async function ensureProfile() {
  let p = await getProfile();
  if (!p) {
    const u = auth.currentUser;
    await setDoc(doc(db, 'students', u.uid), { full_name: (u.displayName || '').slice(0, 120), email: u.email.toLowerCase(), university: '', field_of_study: '', phone: '', language: getLang(), created: serverTimestamp() });
    p = await getProfile();
    await notify('Welcome to SiaNexis! Your email is confirmed.', '/account/');
  }
  return p;
}

export const updateProfile = (fields) => updateDoc(doc(db, 'students', uid()), fields);

/** Notification for the signed-in student themselves (the text is already in the active language). */
export async function notify(text, url = '') {
  await setDoc(doc(collection(db, 'notifications')), { uid: uid(), text: String(text).slice(0, 300), url, read: false, created: serverTimestamp() });
}

const mine = (col, order = 'created') => getDocs(query(collection(db, col), where('uid', '==', uid()), orderBy(order, 'desc')))
  .then((r) => r.docs.map((d) => ({ _id: d.id, ...norm(d.data()) })));

export const myEnrollments = () => mine('enrollments');
export const myRequests = () => mine('projectRequests', 'updated');
export const myNotifications = () => mine('notifications').then((l) => l.slice(0, 50));

export async function getMine(col, id) {
  const d = await getDoc(doc(db, col, id));
  return d.exists() && d.data().uid === uid() ? { _id: d.id, ...norm(d.data()) } : null;
}

export async function markAllRead(list) {
  const unread = list.filter((n) => !n.read);
  for (let i = 0; i < unread.length; i += 400) {
    const b = writeBatch(db);
    unread.slice(i, i + 400).forEach((n) => b.update(doc(db, 'notifications', n._id), { read: true }));
    await b.commit();
  }
}
