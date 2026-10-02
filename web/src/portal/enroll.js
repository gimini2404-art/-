import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { auth, db } from '../firebase.js';
import { seatInfo, registrationId } from '../data/registration.js';
import { getLang, t, tr, url } from '../i18n/index.js';
import { toast } from '../ui/toast.js';
import { ensureProfile, notify } from './store.js';

/** "Enroll with my student account": creates the registration (or reuses an existing one) + the enrollment. */
export async function enrollInProgram(program, navigate) {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) { navigate(url('/account/login/') + '?next=' + encodeURIComponent(location.pathname)); return; }
  const profile = await ensureProfile();
  const email = user.email.toLowerCase();
  const regId = registrationId(program._id, email);
  const enrId = `${user.uid}__${program._id}`;
  try {
    if ((await getDoc(doc(db, 'enrollments', enrId))).exists()) { toast(t('You are already enrolled in this program.'), 'info'); navigate(url(`/account/courses/${program._id}/`)); return; }
    let regStatus, existing = null;
    try { const r = await getDoc(doc(db, 'registrations', regId)); if (r.exists()) existing = r.data(); } catch { /* not readable -> not ours */ }
    const batch = writeBatch(db);
    if (existing) regStatus = existing.status;
    else {
      const { taken, full } = await seatInfo(program);
      regStatus = full ? 'waitlist' : 'pending';
      batch.set(doc(db, 'registrations', regId), { program: program._id, program_title: tr(program, 'title'), name: profile.full_name || user.displayName || email, email, organization: profile.university || '', phone: profile.phone || '',
        message: '', status: regStatus, language: getLang(), uid: user.uid, created: serverTimestamp() });
      if (!full) batch.set(doc(db, 'trainingStats', program._id), { taken: taken + 1, last: regId });
    }
    const status = regStatus === 'confirmed' ? 'approved' : regStatus;
    batch.set(doc(db, 'enrollments', enrId), { uid: user.uid, program: program._id, program_title: tr(program, 'title'), status, note: '', registration: regId, created: serverTimestamp(), updated: serverTimestamp() });
    await batch.commit();
    await notify(t('We received your enrollment request for %(program)s.', { program: tr(program, 'title') }), `/account/courses/${program._id}/`);
    toast(status === 'waitlist' ? t('The program is full. You were added to the waiting list.') : t('Your enrollment request was sent. We will review it soon.'));
    navigate(url(`/account/courses/${program._id}/`));
  } catch (err) {
    console.error(err);
    toast(t('Something went wrong'), 'error');
  }
}
