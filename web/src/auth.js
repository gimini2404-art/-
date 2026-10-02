import {
  GoogleAuthProvider, createUserWithEmailAndPassword, onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail,
  signInWithEmailAndPassword, signInWithPopup, signOut as fbSignOut, updateProfile,
} from 'firebase/auth';
import { collection, doc, getCountFromServer, getDoc, query, where } from 'firebase/firestore';
import { auth, db } from './firebase.js';

/** Reactive-ish auth state: { ready, user, staff: {role}|null, unread } */
export const state = { ready: false, user: null, staff: null, unread: 0 };
const listeners = new Set();
let readyResolve;
const readyPromise = new Promise((r) => { readyResolve = r; });

export const onAuthChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => fn(state));

export async function refreshExtras() {
  state.staff = null;
  state.unread = 0;
  if (!state.user) return;
  try {
    const a = await getDoc(doc(db, 'admins', state.user.uid));
    if (a.exists()) state.staff = { role: a.data().role || 'contributor', name: a.data().name || '' };
  } catch { /* not staff */ }
  if (!state.staff && state.user.emailVerified) {
    try {
      const c = await getCountFromServer(query(collection(db, 'notifications'), where('uid', '==', state.user.uid), where('read', '==', false)));
      state.unread = c.data().count;
    } catch { /* ignore */ }
  }
}

onAuthStateChanged(auth, async (user) => {
  state.user = user;
  await refreshExtras();
  state.ready = true;
  readyResolve();
  emit();
});

export const authReady = () => readyPromise;
export const isStaff = () => !!state.staff;
export const canDelete = () => state.staff && state.staff.role !== 'contributor';
export const isEditor = () => state.staff && state.staff.role !== 'contributor';
export const isAdmin = () => state.staff && state.staff.role === 'admin';

export async function signUp(email, password, name) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (name) await updateProfile(cred.user, { displayName: name });
  await sendEmailVerification(cred.user);
  return cred.user;
}
export const signIn = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const signInGoogle = () => signInWithPopup(auth, new GoogleAuthProvider());
export const resetPassword = (email) => sendPasswordResetEmail(auth, email);
export const resendVerification = () => sendEmailVerification(auth.currentUser);
export async function signOut() { await fbSignOut(auth); }
export async function reloadUser() {
  if (!auth.currentUser) return null;
  await auth.currentUser.reload();
  await auth.currentUser.getIdToken(true); // refresh the email_verified claim used by the security rules
  state.user = auth.currentUser;
  await refreshExtras();
  emit();
  return state.user;
}
