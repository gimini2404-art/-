/* Pure helpers shared by the browser app and the Node tools (no Firebase initialisation here). */
export function norm(v) {
  if (v && typeof v === 'object') {
    if (typeof v.toDate === 'function') return v.toDate().toISOString();
    if (Array.isArray(v)) return v.map(norm);
    const o = {};
    for (const k of Object.keys(v)) o[k] = norm(v[k]);
    return o;
  }
  return v;
}

export function stateOf(item, now = new Date()) {
  if (item.is_published === false) return 'draft';
  if (item.publish_at && new Date(item.publish_at) > now) return 'scheduled';
  if (item.unpublish_at && new Date(item.unpublish_at) <= now) return 'expired';
  return 'live';
}

const MAX_BYTES = 700_000; // stay well below Firestore's 1 MiB document limit

const byteLength = (o) => new TextEncoder().encode(JSON.stringify(o)).length;

/** Split snapshot items into documents of at most ~700 KB. Returns [{ id, data }]. */
export function chunkSnapshot(col, items, extra = {}) {
  const parts = [];
  let cur = [], size = 0;
  for (const it of items) {
    const n = byteLength(it);
    if (cur.length && size + n > MAX_BYTES) { parts.push(cur); cur = []; size = 0; }
    cur.push(it); size += n;
  }
  parts.push(cur);
  return parts.map((p, i) => ({ id: i === 0 ? col : `${col}__${i}`, data: { items: p, parts: parts.length, ...(i === 0 ? extra : {}) } }));
}

/** Public copy of a content document: heavy article parts removed, id added. */
export function publicCopy(id, data, heavy = []) {
  const o = { _id: id, ...data };
  heavy.forEach((k) => delete o[k]);
  return o;
}
