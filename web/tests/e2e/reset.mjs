// Reset the emulators to a known state: sample content + three staff accounts.
import { createUser, clearAll, makeStaff } from '../emu.mjs';
import { seedEmulator } from '../../tools/import_seed.mjs';

export async function reset() {
  await clearAll();
  const n = await seedEmulator();
  for (const [email, role] of [['boss@example.com', 'admin'], ['ed@example.com', 'editor'], ['con@example.com', 'contributor']]) {
    const uid = await createUser(email, 'Passw0rd!x', { name: email.split('@')[0] });
    await makeStaff(uid, role, email);
  }
  return n;
}

if (import.meta.url === `file://${process.argv[1]}`) console.log('reset', (await reset()).documents, 'documents');
