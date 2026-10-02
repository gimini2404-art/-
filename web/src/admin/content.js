import { canDelete } from '../auth.js';
import { settings as publicSettings, sortItems, stateOf } from '../data/content.js';
import { fmtDate, getLang, t, tr } from '../i18n/index.js';
import { SCHEMA, choiceLabel } from '../schema.js';
import { html, raw, esc } from '../util.js';
import { hasArticle } from '../article/render.js';
import { toast } from '../ui/toast.js';
import { freeSlug, getOne, historyOf, listAll, removeContent, restoreVersion, saveContent, setPublished } from './data.js';
import { collect, renderField, showFieldErrors, wire } from './fields.js';
import { confirmBox, modal } from './ui.js';

const labelOf = (o) => tr(o, 'title') || tr(o, 'name') || tr(o, 'organization_name') || tr(o, 'label') || o._id;

const ROUTES = { pages: '/p/', team: '/team/', areas: '/research-areas/', projects: '/projects/', publications: '/publications/', hub: '/research-hub/', posts: '/news/' };
function previewUrl(col, id) {
  if (col === 'training') return `/${getLang()}/training/${id}/register/`;
  return ROUTES[col] ? `/${getLang()}${ROUTES[col]}${id}/` : null;
}

export default async function content({ mode, args, navigate }) {
  const col = args[0];
  const spec = SCHEMA[col];
  if (!spec) return { title: t('Page not found'), html: html`<p class="ad-empty">404</p>` };
  return mode === 'list' ? list(col, spec, navigate) : edit(col, spec, mode === 'new' ? null : decodeURIComponent(args[1]), navigate);
}

// ------------------------------------------------------------------------------------ list
async function list(col, spec, navigate) {
  const items = sortItems(col, await listAll(col));
  const kindField = spec.fields.find((f) => f.type === 'select');
  // kind labels: resolve against the field's own choices
  const kindLabel = (o) => (kindField && o[kindField.name] ? t((kindField.choices.find(([v]) => v === o[kindField.name]) || [0, o[kindField.name]])[1]) : '');
  const body = html`<div class="ad-bar"><a class="ad-btn" href="/admin/c/${col}/new">+ ${t('Add')} ${t(spec.label)}</a>${col === 'publications' ? html`<a class="ad-btn line" href="/admin/import-pdf">📄 ${t('Import article from PDF')}</a>` : ''}
    <input class="ad-search" id="q" type="search" placeholder="${t('Search')}…"><span class="sp"></span>
    ${spec.publish ? html`<button class="ad-btn line sm" data-act="pub">${t('Publish selected (make live now)')}</button><button class="ad-btn line sm" data-act="unpub">${t('Unpublish selected (draft)')}</button>` : ''}
    ${canDelete() ? html`<button class="ad-btn danger sm" data-act="del">${t('Delete selected')}</button>` : ''}</div>
  <div class="ad-panel">${items.length ? html`<table class="ad-t"><thead><tr><th><input type="checkbox" id="all"></th><th>${t(spec.fields.find((f) => f.name === spec.title)?.label || 'Title')}</th>${kindField ? html`<th>${t(kindField.label)}</th>` : ''}${spec.publish ? html`<th>${t('Visibility')}</th><th>${t('Display order')}</th>` : ''}<th>${t('Updated')}</th></tr></thead>
    <tbody>${items.map((o) => { const st = spec.publish ? stateOf(o) : null; return html`<tr data-q="${(labelOf(o) + ' ' + (o.slug || '') + ' ' + (o.authors || '')).toLowerCase()}"><td><input type="checkbox" class="sel" value="${o._id}"></td>
      <td><a href="/admin/c/${col}/${encodeURIComponent(o._id)}">${labelOf(o)}</a></td>${kindField ? html`<td>${kindLabel(o)}</td>` : ''}
      ${spec.publish ? html`<td><span class="ad-badge ${st}">${t({ live: 'Live', scheduled: 'Scheduled', expired: 'Expired', draft: 'Draft' }[st])}</span></td><td class="num">${o.order ?? 0}</td>` : ''}
      <td class="num">${o.updated ? fmtDate(o.updated) : ''}</td></tr>`; })}</tbody></table>` : html`<p class="ad-empty">${t('Nothing here yet. Check back soon.')}</p>`}</div>`;
  return {
    title: t(spec.plural), active: `/admin/c/${col}`, html: body,
    after(root) {
      const sel = () => [...root.querySelectorAll('.sel:checked')].map((c) => c.value);
      root.querySelector('#q')?.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        root.querySelectorAll('tbody tr').forEach((tr_) => { tr_.hidden = q && !tr_.dataset.q.includes(q); });
      });
      root.querySelector('#all')?.addEventListener('change', (e) => root.querySelectorAll('.sel').forEach((c) => { c.checked = e.target.checked && !c.closest('tr').hidden; }));
      root.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-act]'); if (!b) return;
        const ids = sel();
        if (!ids.length) { toast(t('Select at least one item.'), 'error'); return; }
        if (b.dataset.act === 'del') {
          if (!(await confirmBox(t('Delete %(n)s item(s)? This cannot be undone.', { n: ids.length })))) return;
          for (const id of ids) await removeContent(col, id);
        } else await setPublished(col, ids, b.dataset.act === 'pub');
        toast(t('%(n)s item(s) updated and students notified.').replace(/ and students notified/, '', 1).replace('%(n)s', ids.length));
        navigate(location.pathname);
      });
    },
  };
}

// ------------------------------------------------------------------------------------ edit
const isAdvanced = (f) => f.advanced || f.seo;

async function edit(col, spec, id, navigate) {
  const isNew = id === null;
  const data = isNew ? defaults(spec) : await getOne(col, id);
  if (!isNew && !data) return { title: t('Page not found'), html: html`<p class="ad-empty">404</p>` };
  const settings = await publicSettings();
  const refs = {};
  for (const f of spec.fields.filter((x) => x.type === 'ref' || x.type === 'refs')) {
    if (!refs[f.to]) refs[f.to] = (await listAll(f.to)).map((o) => ({ id: o._id, label: labelOf(o) })).sort((a, b) => a.label.localeCompare(b.label));
  }
  const ctx = { refs, settings };
  const main = spec.fields.filter((f) => !isAdvanced(f) && !f.article && f.type !== 'slug');
  const article = spec.fields.filter((f) => f.article);
  const adv = spec.fields.filter(isAdvanced);
  const hasTr = spec.fields.some((f) => f.tr);
  const slugField = spec.fields.find((f) => f.type === 'slug');
  const preview = !isNew && previewUrl(col, id);
  const title = isNew ? `${t('Add')} ${t(spec.label)}` : (labelOf(data) || t(spec.label));
  const body = html`<div class="ad-bar"><a class="ad-btn line sm" href="/admin/c/${col}">← ${t(spec.plural)}</a>${preview ? html`<a class="ad-btn line sm" href="${preview}" data-native target="_blank">${t('View on site')}</a>` : ''}
    ${!isNew ? html`<button class="ad-btn line sm" id="hist">${t('History')}</button>` : ''}<span class="sp"></span>${!isNew && spec.publish ? html`<span class="ad-badge ${stateOf(data)}">${t({ live: 'Live', scheduled: 'Scheduled', expired: 'Expired', draft: 'Draft' }[stateOf(data)])}</span>` : ''}</div>
  <form class="ad-form" id="ed" novalidate>
    ${hasTr ? html`<div class="ad-tabs"><button type="button" class="on" data-lang="en">English</button><button type="button" data-lang="ar">العربية</button></div>` : ''}
    ${main.map((f) => renderField(f, data, ctx))}
    ${slugField ? html`<div class="ad-f" data-f="slug"><label>${t('Slug')}</label><input type="text" name="slug" value="${data.slug || ''}" dir="ltr" ${isNew ? '' : 'readonly'} placeholder="${t('Auto-filled from the title.')}"><span class="help">${isNew ? t('Auto-filled from the title.') : t('The address of the page. It cannot be changed after creation.')}</span></div>` : ''}
    ${article.length ? html`<details class="ad-adv" ${data.sections?.length || data.abstract || data.abstract_background ? 'open' : ''}><summary>${t('Full article page (optional)')}</summary><div style="padding-top:14px">${article.map((f) => renderField(f, data, ctx))}</div></details>` : ''}
    ${adv.length ? html`<details class="ad-adv"><summary>${t('Publishing')} / SEO</summary><div style="padding-top:14px">${adv.map((f) => renderField(f, data, ctx))}</div></details>` : ''}
    <div class="ad-bar"><button class="ad-btn" type="submit" data-then="list">${t('Save')}</button><button class="ad-btn line" type="submit" data-then="stay">${t('Save and continue editing')}</button><span class="sp"></span>
      ${!isNew && canDelete() ? html`<button class="ad-btn danger" type="button" id="del">${t('Delete')}</button>` : ''}</div></form>`;
  return {
    title, active: `/admin/c/${col}`, html: body,
    after(root) {
      const form = root.querySelector('#ed');
      wire(form, ctx);
      let then = 'list';
      form.querySelectorAll('button[type=submit]').forEach((b) => b.addEventListener('click', () => { then = b.dataset.then; }));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const { data: values, errors } = collect(form, spec.fields.filter((f) => f.type !== 'slug'));
        showFieldErrors(form, errors);
        if (Object.keys(errors).length) { toast(t('Please correct the highlighted fields.'), 'error'); return; }
        const btns = form.querySelectorAll('button'); btns.forEach((b) => { b.disabled = true; });
        try {
          let docId = id;
          if (isNew) {
            const typed = (form.querySelector('[name=slug]')?.value || '').trim();
            docId = spec.slug || col === 'publications'
              ? await freeSlug(col, typed || values[`${spec.title}_en`] || values[spec.title] || 'item')
              : crypto.randomUUID().replace(/-/g, '').slice(0, 20);
          }
          const out = { ...data, ...values };
          delete out._id;
          if (spec.slug) out.slug = docId;
          if (spec.publish && out.is_published === undefined) out.is_published = true;
          if (col === 'publications') out.has_article = hasArticle({ ...out, slug: docId });
          if (col === 'training' && out.capacity === null) delete out.capacity;
          await saveContent(col, docId, out, { isNew });
          toast(t('Saved.'));
          if (then === 'list') navigate(`/admin/c/${col}`); else navigate(`/admin/c/${col}/${encodeURIComponent(docId)}`);
        } catch (err) {
          console.error(err);
          toast(t('Something went wrong'), 'error');
          btns.forEach((b) => { b.disabled = false; });
        }
      });
      root.querySelector('#del')?.addEventListener('click', async () => {
        if (!(await confirmBox(t('Delete this item? This cannot be undone.')))) return;
        await removeContent(col, id);
        toast(t('Deleted.'));
        navigate(`/admin/c/${col}`);
      });
      root.querySelector('#hist')?.addEventListener('click', async () => {
        const versions = await historyOf(col, id);
        modal(html`<h2>${t('History')}</h2>${versions.length ? html`<table class="ad-t"><tbody>${versions.map((v) => html`<tr><td class="num">${v.at ? fmtDate(v.at, { dateStyle: 'medium', timeStyle: 'short' }) : ''}</td><td>${v.by}</td><td>${v.label}</td><td><button class="ad-btn line sm" data-restore="${v._id}">${t('Restore')}</button></td></tr>`)}</tbody></table>` : html`<p class="ad-empty">—</p>`}`,
          async (box, close) => {
            box.addEventListener('click', async (e) => {
              const b = e.target.closest('[data-restore]'); if (!b) return;
              const v = versions.find((x) => x._id === b.dataset.restore);
              if (!(await confirmBox(t('Restore this version?')))) return;
              await restoreVersion(v); close(); toast(t('Restored.')); navigate(location.pathname);
            });
          });
      });
    },
  };
}

function defaults(spec) {
  const d = {};
  for (const f of spec.fields) {
    if (f.default !== undefined) d[f.name] = f.default;
    if (f.defaultToday) d[f.name] = new Date().toISOString().slice(0, 10);
    if (f.type === 'list') d[f.name] = [];
    if (f.type === 'refs') d[f.name] = [];
  }
  return d;
}

export { esc, raw };
