import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore } from 'firebase/firestore';
import { config } from './config.js';

export const app = initializeApp(config.firebase);
export const auth = getAuth(app);
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });

if (config.useEmulators) {
  connectFirestoreEmulator(db, ...config.emulator.firestore);
  connectAuthEmulator(auth, config.emulator.auth, { disableWarnings: true });
}
