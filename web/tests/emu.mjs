// Helpers for tests against the Firebase emulators (auth :9099, firestore :8080).
import fs from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';

const AUTH = 'http://127.0.0.1:9099';
const KEY = 'fake-api-key';

export async function createUser(email, password, { verified = true, name = '' } = {}) {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${KEY}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, displayName: name, returnSecureToken: true }) });
  const j = await r.json();
  if (!j.localId) throw new Error('signUp failed: ' + JSON.stringify(j));
  if (verified) {
    await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/demo-sianexis/accounts:update`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify({ localId: j.localId, emailVerified: true }) });
  }
  return j.localId;
}

export async function withAdminDb(fn) {
  const env = await initializeTestEnvironment({ projectId: 'demo-sianexis', firestore: { host: '127.0.0.1', port: 8080, rules: fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') } });
  try { await env.withSecurityRulesDisabled(async (ctx) => { await fn(ctx.firestore()); }); } finally { await env.cleanup(); }
}

export async function makeStaff(uid, role = 'admin', email = '') {
  await withAdminDb((db) => setDoc(doc(db, 'admins', uid), { role, email }));
}

export async function clearAll() {
  await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-sianexis/databases/(default)/documents', { method: 'DELETE' });
  await fetch(`${AUTH}/emulator/v1/projects/demo-sianexis/accounts`, { method: 'DELETE' });
}
