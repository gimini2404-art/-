// Public Firebase web config (not secret). Set VITE_* variables in web/.env.production, see docs/FIREBASE_SPARK.md.
const env = import.meta.env;
export const config = {
  firebase: {
    apiKey: env.VITE_FIREBASE_API_KEY || 'demo-api-key',
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || `${env.VITE_FIREBASE_PROJECT_ID || 'demo-sianexis'}.firebaseapp.com`,
    projectId: env.VITE_FIREBASE_PROJECT_ID || 'demo-sianexis',
    appId: env.VITE_FIREBASE_APP_ID || '1:000000000000:web:0000000000000000',
  },
  useEmulators: env.VITE_USE_EMULATORS === '1',
  emulator: { firestore: [env.VITE_EMULATOR_HOST || '127.0.0.1', 8080], auth: `http://${env.VITE_EMULATOR_HOST || '127.0.0.1'}:9099` },
  cloudinary: { cloud: env.VITE_CLOUDINARY_CLOUD || '', preset: env.VITE_CLOUDINARY_PRESET || '' },
  siteUrl: env.VITE_SITE_URL || '',
};
