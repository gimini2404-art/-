// Dev/test helper: import seed/base.json + seed/extra.mjs into a running Firestore EMULATOR.
//   npx firebase emulators:start --only auth,firestore --project demo-sianexis   (in another terminal)
//   node tools/import_seed.mjs
import fs from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { importSeed } from '../src/data/importer.js';
import { extra } from '../seed/extra.mjs';

export function mergedSeed() {
  const base = JSON.parse(fs.readFileSync(new URL('../seed/base.json', import.meta.url), 'utf8'));
  const seed = { ...base, collections: { ...base.collections } };
  for (const [col, docs] of Object.entries(extra.collections)) seed.collections[col] = [...(seed.collections[col] || []).filter((d) => !docs.some((x) => x._id === d._id)), ...docs];
  return seed;
}

export async function seedEmulator({ host = '127.0.0.1', port = 8080 } = {}) {
  const env = await initializeTestEnvironment({ projectId: 'demo-sianexis', firestore: { host, port, rules: fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') } });
  let n;
  await env.withSecurityRulesDisabled(async (ctx) => { n = await importSeed(ctx.firestore(), mergedSeed()); });
  await env.cleanup();
  return n;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const n = await seedEmulator();
  console.log('imported', n.documents, 'documents');
}
