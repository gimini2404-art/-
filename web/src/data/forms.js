/* Public form submissions written straight to Firestore (the security rules validate the shape). */
import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../firebase.js';
import { getLang, t } from '../i18n/index.js';
import { toast } from '../ui/toast.js';
import { hash, isEmail } from '../util.js';

const token = () => [...crypto.getRandomValues(new Uint8Array(18))].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 28);

export async function subscribe(form) {
  const email = String(new FormData(form).get('email') || '').trim().toLowerCase();
  if (new FormData(form).get('website')) return;
  if (!isEmail(email)) { toast(t('Please enter a valid email address.'), 'error'); return; }
  const tok = token();
  const batch = writeBatch(db);
  batch.set(doc(db, 'subscriberEmails', hash(email)), { token: tok, created: serverTimestamp() });
  batch.set(doc(db, 'subscribers', tok), { email, language: getLang(), is_active: true, created: serverTimestamp() });
  try { await batch.commit(); } catch { /* already subscribed: same friendly answer */ }
  form.reset();
  toast(t('Thank you for subscribing to our newsletter.'));
}

export async function submitContact(values) {
  const ref = doc(db, 'contactRequests', token());
  await writeBatch(db).set(ref, {
    request_type: values.request_type, name: values.name, email: values.email.toLowerCase(), organization: values.organization || '',
    subject: values.subject || '', message: values.message, status: 'new', internal_notes: '', language: getLang(), created: serverTimestamp(),
  }).commit();
}

export async function unsubscribe(tok) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'subscribers', tok), { is_active: false });
  await batch.commit();
}

export async function subscriberEmail(tok) {
  try { const d = await getDoc(doc(db, 'subscribers', tok)); return d.exists() ? d.data().email : null; } catch { return null; }
}
