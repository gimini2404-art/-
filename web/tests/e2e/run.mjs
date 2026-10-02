// Runs every end-to-end scenario against the emulators + the Vite dev server (see docs/FIREBASE_SPARK.md, "Tests").
import { spawnSync } from 'node:child_process';
import { reset } from './reset.mjs';

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
let failed = 0;
for (const file of process.argv.slice(2).length ? process.argv.slice(2) : ['public', 'admin', 'portal']) {
  console.log(`\n=== ${file} ===`);
  await reset();
  const r = spawnSync('node', [new URL(`./${file}.mjs`, import.meta.url).pathname], { stdio: 'inherit', env: process.env });
  if (r.status !== 0) failed++;
}
process.exit(failed ? 1 : 0);
