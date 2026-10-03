/* Public content access. Pages read pre-built "snapshot" documents (one read per collection) instead of
   querying every document, which keeps a busy site inside the free Firestore quota.
   Staff (editors) additionally see drafts / scheduled items directly from the collections (preview). */
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase.js';
import { SCHEMA } from '../schema.js';
import { getLang, tr } from '../i18n/index.js';

const TTL = 2 * 60 * 1000;
const mem = new Map();

export { norm } from './pure.js';
import { norm, stateOf as _stateOf } from './pure.js';

function cached(key) {
  const hit = mem.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  try {
    const raw = sessionStorage.getItem('sx:' + key);
    if (raw) {
      const { at, value } = JSON.parse(raw);
      if (Date.now() - at < TTL) { mem.set(key, { at, value }); return value; }
    }
  } catch { /* storage unavailable */ }
  return undefined;
}

function remember(key, value) {
  const at = Date.now();
  mem.set(key, { at, value });
  try { sessionStorage.setItem('sx:' + key, JSON.stringify({ at, value })); } catch { /* quota */ }
}

export function clearCache() {
  mem.clear();
  try { Object.keys(sessionStorage).filter((k) => k.startsWith('sx:')).forEach((k) => sessionStorage.removeItem(k)); } catch { /* ignore */ }
}

/** All published items of a collection, as stored in its snapshot. */
export async function snapshot(col) {
  const hit = cached('snap:' + col);
  if (hit) return hit;
  const first = await getDoc(doc(db, 'snapshots', col));
  let items = [];
  if (first.exists()) {
    const d = first.data();
    items = d.items || [];
    for (let i = 1; i < (d.parts || 1); i++) {
      const more = await getDoc(doc(db, 'snapshots', `${col}__${i}`));
      if (more.exists()) items = items.concat(more.data().items || []);
    }
  }
  items = norm(items);
  remember('snap:' + col, items);
  return items;
}

// Same defaults as the SiteSettings model of the Django site, so a brand-new (empty) site still looks complete.
const SETTINGS_DEFAULTS = {
  site_name_en: 'SiaNexis', tagline_en: 'Research, data and computation for better science',
  hero_title_en: 'Advancing research through design, data and collaboration', cta_title_en: 'Start a project or propose a collaboration',
};

export async function settings() {
  const hit = cached('settings');
  if (hit) return hit;
  const d = await getDoc(doc(db, 'snapshots', 'settings'));
  const value = { ...(d.exists() ? norm(d.data()) : {}) };
  for (const [k, v] of Object.entries(SETTINGS_DEFAULTS)) if (!value[k]) value[k] = v;
  remember('settings', value);
  return value;
}

/** Everything of a collection straight from Firestore (editors only: includes drafts). */
export async function allDocs(col) {
  const res = await getDocs(collection(db, col));
  return res.docs.map((d) => ({ _id: d.id, ...norm(d.data()) }));
}

// ---- visibility ----------------------------------------------------------------------------------
export const stateOf = _stateOf;
export const isLive = (item) => stateOf(item) === 'live';
export const liveOnly = (items) => items.filter(isLive);

// ---- ordering (mirrors each model's Meta.ordering) ------------------------------------------------
const TEXT_KEYS = new Set(['title', 'name', 'organization_name', 'label']);

function sortValue(item, key, col) {
  if (TEXT_KEYS.has(key)) return String(tr(item, key) || '').toLowerCase();
  let v = item[key];
  if (key === 'category' && col === 'services') v = item.category;
  if (v === undefined || v === null || v === '') return null;
  return v;
}

export function sortItems(col, items, categories) {
  const spec = SCHEMA[col].order;
  const catOrder = categories ? Object.fromEntries(categories.map((c) => [c._id, c.order ?? 0])) : null;
  const out = [...items];
  out.sort((a, b) => {
    for (const [key, dir] of spec) {
      let va = sortValue(a, key, col), vb = sortValue(b, key, col);
      if (col === 'services' && key === 'category' && catOrder) { va = catOrder[a.category] ?? 0; vb = catOrder[b.category] ?? 0; }
      if (va === vb) continue;
      if (va === null) return 1; // nulls last
      if (vb === null) return -1;
      const c = typeof va === 'string' ? va.localeCompare(vb, getLang()) : va - vb;
      if (c) return c * dir;
    }
    return 0;
  });
  return out;
}

export const byId = (items) => Object.fromEntries(items.map((i) => [i._id, i]));
export const bySlug = (items, slug) => items.find((i) => i.slug === slug || i._id === slug);

/** Single document: editors get any state (draft preview), everyone else only live ones. */
export async function getItem(col, id, { staff = false } = {}) {
  if (staff) {
    const d = await getDoc(doc(db, col, id));
    return d.exists() ? { _id: d.id, ...norm(d.data()) } : null;
  }
  if (SCHEMA[col]?.snapshot && col !== 'publications') {
    const found = bySlug(await snapshot(col), id);
    return found && isLive(found) ? found : null;
  }
  try {
    const d = await getDoc(doc(db, col, id));
    if (!d.exists()) return null;
    const item = { _id: d.id, ...norm(d.data()) };
    return isLive(item) ? item : null;
  } catch { return null; }
}

/** Items to list on a public page (live only). */
export async function list(col) {
  return sortItems(col, liveOnly(await snapshot(col)));
}
