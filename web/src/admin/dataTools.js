import { isAdmin, isEditor } from '../auth.js';
import { rebuildAll, rebuildSettings } from '../data/snapshots.js';
import { importSeed } from '../data/importer.js';
import { db } from '../firebase.js';
import { t } from '../i18n/index.js';
import { SCHEMA } from '../schema.js';
import { html } from '../util.js';
import { toast } from '../ui/toast.js';
import { clearCache } from '../data/content.js';
import { getOne, listAll } from './data.js';
import { confirmBox, downloadFile } from './ui.js';

export default async function dataTools() {
  if (!isEditor()) return { title: t('Backup & import'), active: '/admin/data', html: html`<p class="ad-warn">${t('Only editors and administrators can use these tools.')}</p>` };
  return {
    title: t('Backup & import'), active: '/admin/data',
    html: html`<div class="ad-form"><h2>${t('Backup')}</h2><p>${t('Download all content (pages, projects, publications…) as one JSON file.')}</p><button class="ad-btn" id="bk">${t('Download backup')}</button>
      <h2 style="margin-top:28px">${t('Import data')}</h2><p>${t('Import a backup file or the export of the old Django site (python manage.py export_firebase). Existing documents with the same id are replaced.')}</p>
      <input type="file" id="imp" accept="application/json"> <p class="help" id="imp-s"></p>
      <h2 style="margin-top:28px">${t('Public data')}</h2><p>${t('The public site reads pre-built copies of your content. They refresh automatically when you save; use this button if something looks out of date.')}</p><button class="ad-btn line" id="rb">${t('Rebuild public data')}</button>
      <h2 style="margin-top:28px">${t('Sample content')}</h2><p>${t('Fill an empty site with demo content (research areas, services, one article, training course…).')}</p><button class="ad-btn line" id="sm">${t('Load sample content')}</button></div>`,
    after(root) {
      const status = root.querySelector('#imp-s');
      root.querySelector('#bk').addEventListener('click', async () => {
        const out = { format: 1, collections: {}, raw: {} };
        out.settings = (await getOne('settings', 'main')) || undefined;
        for (const col of Object.keys(SCHEMA)) out.collections[col] = await listAll(col);
        out.raw.contactRequests = (await listAll('contactRequests')).map(({ _id, ...r }) => r);
        out.raw.subscribers = (await listAll('subscribers')).map(({ _id, ...r }) => ({ ...r, token: _id }));
        out.raw.registrations = (await listAll('registrations')).map(({ _id, ...r }) => r);
        downloadFile(`sianexis-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(out, null, 1), 'application/json');
      });
      const run = async (seed) => {
        status.textContent = '…';
        await importSeed(db, seed, { onProgress: (p) => { status.textContent = p.stage === 'documents' ? `${p.done}/${p.total}` : `${t('Rebuild public data')}: ${p.col}`; } });
        clearCache(); status.textContent = ''; toast(t('Import finished.'));
      };
      root.querySelector('#imp').addEventListener('change', async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try { await run(JSON.parse(await f.text())); } catch (err) { console.error(err); status.textContent = ''; toast(t('The file could not be imported.'), 'error'); }
      });
      root.querySelector('#rb').addEventListener('click', async () => {
        await rebuildAll(db); const s = await getOne('settings', 'main'); if (s) await rebuildSettings(db, s); clearCache(); toast(t('Saved.'));
      });
      root.querySelector('#sm').addEventListener('click', async () => {
        if (!(await confirmBox(t('Load the demo content into this site?')))) return;
        const base = (await import('../../seed/base.json')).default;
        const { extra } = await import('../../seed/extra.mjs');
        const seed = { ...base, collections: { ...base.collections } };
        for (const [col, docs] of Object.entries(extra.collections)) seed.collections[col] = [...(seed.collections[col] || []).filter((d) => !docs.some((x) => x._id === d._id)), ...docs];
        await run(seed);
      });
    },
  };
}

export { isAdmin };
