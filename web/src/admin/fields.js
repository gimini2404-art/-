/* Schema-driven form widgets for the admin (render + collect). */
import { t } from '../i18n/index.js';
import { html, raw, esc, isEmail, isUrl } from '../util.js';
import { cloudinaryConfig, img, uploadMedia } from '../media.js';
import { toast } from '../ui/toast.js';

const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function control(f, name, value, ctx, extraAttrs = '') {
  const req = f.required ? 'required' : '';
  const id = `ad-${name.replace(/[^\w]/g, '_')}`;
  switch (f.type) {
    case 'textarea': return html`<textarea id="${id}" name="${name}" rows="${f.rows || 5}" ${raw(req)} ${raw(extraAttrs)}>${value ?? ''}</textarea>`;
    case 'int': case 'float': return html`<input id="${id}" type="number" name="${name}" value="${value ?? ''}" ${f.type === 'float' ? raw('step="any"') : raw('step="1"')} ${raw(req)}>`;
    case 'date': return html`<input id="${id}" type="date" name="${name}" value="${value ?? ''}" ${raw(req)}>`;
    case 'datetime': return html`<input id="${id}" type="datetime-local" name="${name}" value="${toLocalInput(value)}">`;
    case 'url': return html`<input id="${id}" type="url" name="${name}" value="${value ?? ''}" dir="ltr" ${raw(req)}>`;
    case 'email': return html`<input id="${id}" type="email" name="${name}" value="${value ?? ''}" dir="ltr" ${raw(req)}>`;
    case 'select': return html`<select id="${id}" name="${name}" ${raw(req)}>${f.required ? '' : html`<option value="">—</option>`}${f.choices.map(([v, l]) => html`<option value="${v}" ${v === (value ?? f.default) ? 'selected' : ''}>${t(l)}</option>`)}</select>`;
    case 'ref': {
      const opts = ctx.refs[f.to] || [];
      return html`<select id="${id}" name="${name}" ${raw(req)}><option value="">—</option>${opts.map((o) => html`<option value="${o.id}" ${o.id === value ? 'selected' : ''}>${o.label}</option>`)}</select>`;
    }
    case 'refs': {
      const opts = ctx.refs[f.to] || [], sel = new Set(value || []);
      return html`<div class="ad-checks" data-refs="${name}">${opts.length ? opts.map((o) => html`<label style="display:flex;gap:8px;font-weight:400"><input type="checkbox" value="${o.id}" ${sel.has(o.id) ? 'checked' : ''}> ${o.label}</label>`) : html`<span class="help">—</span>`}</div>`;
    }
    case 'image': case 'file':
      return html`<div class="ad-img" data-media="${name}" data-kind="${f.type}">
        ${f.type === 'image' && value ? html`<img src="${img(value, 200)}" alt="">` : ''}
        <input type="url" name="${name}" value="${value ?? ''}" placeholder="https://…" dir="ltr" style="flex:1;min-width:200px">
        <label class="ad-btn line sm" style="cursor:pointer">${t('Upload')}<input type="file" hidden accept="${f.type === 'image' ? 'image/*' : 'application/pdf,image/*'}"></label>
        <span class="help" data-status></span></div>`;
    default: return html`<input id="${id}" type="text" name="${name}" value="${value ?? ''}" ${f.max ? raw(`maxlength="${f.max}"`) : ''} ${raw(req)} ${raw(extraAttrs)}>`;
  }
}

/** One field (translatable ones render an EN and an AR pane). */
export function renderField(f, data, ctx) {
  if (f.type === 'bool') {
    return html`<div class="ad-f chk"><label><input type="checkbox" name="${f.name}" ${(data[f.name] ?? f.default) ? 'checked' : ''}> ${t(f.label)}</label>${f.help ? html`<span class="help">${t(f.help)}</span>` : ''}</div>`;
  }
  if (f.type === 'list') return renderList(f, data[f.name] || [], ctx);
  if (f.tr) {
    return html`<div class="ad-f" data-f="${f.name}"><span class="lab ${f.required ? 'req' : ''}">${t(f.label)}</span>
      <div class="lang-pane" data-lang="en">${control(f, `${f.name}_en`, data[`${f.name}_en`], ctx)}</div>
      <div class="lang-pane" data-lang="ar" hidden>${control(f, `${f.name}_ar`, data[`${f.name}_ar`], ctx, 'dir="rtl"')}</div>
      ${f.help ? html`<span class="help">${t(f.help)}</span>` : ''}<div class="err" hidden></div></div>`;
  }
  return html`<div class="ad-f" data-f="${f.name}"><label class="${f.required ? 'req' : ''}" for="ad-${f.name}">${t(f.label)}</label>${control(f, f.name, data[f.name], ctx)}${f.help ? html`<span class="help">${t(f.help)}</span>` : ''}<div class="err" hidden></div></div>`;
}

function renderList(f, items, ctx) {
  return html`<div class="ad-f" data-list="${f.name}"><span class="lab">${t(f.label)}</span>
    <div class="ad-items">${items.map((it, i) => listItem(f, it, i, ctx))}</div>
    <button type="button" class="ad-btn line sm" data-add-item="${f.name}">+ ${t('Add')} ${t(f.item)}</button>
    <template data-tpl="${f.name}">${listItem(f, {}, '__I__', ctx)}</template></div>`;
}

function itemControl(sf, value, ctx) {
  // list items are read by data-k, not by name/id
  return raw(control(sf, `x.${sf.name}`, value, ctx).toString().replace(/ name="[^"]*"/, ` data-k="${sf.name}"`).replace(/ id="[^"]*"/, ''));
}

function listItem(f, it, i, ctx) {
  return html`<div class="ad-list-item" data-item><header><span>${t(f.item)} <span data-n>${typeof i === 'number' ? i + 1 : ''}</span></span>
    <span><button type="button" class="ad-btn line sm" data-up>↑</button> <button type="button" class="ad-btn line sm" data-down>↓</button> <button type="button" class="ad-btn danger sm" data-del>×</button></span></header>
    ${f.fields.map((sf) => (sf.type === 'bool'
    ? html`<div class="ad-f chk"><label><input type="checkbox" data-k="${sf.name}" ${(it[sf.name] ?? sf.default) ? 'checked' : ''}> ${t(sf.label)}</label></div>`
    : html`<div class="ad-f"><label class="${sf.required ? 'req' : ''}">${t(sf.label)}</label>${itemControl(sf, it[sf.name], ctx)}${sf.help ? html`<span class="help">${t(sf.help)}</span>` : ''}</div>`))}
  </div>`;
}

/** Wire up dynamic parts (list items, media upload, language tabs) after the form is in the DOM. */
export function wire(root, ctx) {
  root.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add-item]');
    if (add) {
      const wrap = add.closest('[data-list]'), tpl = wrap.querySelector('template');
      const n = wrap.querySelectorAll('[data-item]').length;
      const div = document.createElement('div');
      div.innerHTML = tpl.innerHTML.replace(/__I__/g, n);
      const item = div.firstElementChild;
      wrap.querySelector('.ad-items').appendChild(item);
      renumber(wrap);
      return;
    }
    const item = e.target.closest('[data-item]');
    if (!item) return;
    const wrap = item.closest('[data-list]');
    if (e.target.closest('[data-del]')) { item.remove(); renumber(wrap); }
    if (e.target.closest('[data-up]') && item.previousElementSibling) { item.parentNode.insertBefore(item, item.previousElementSibling); renumber(wrap); }
    if (e.target.closest('[data-down]') && item.nextElementSibling) { item.parentNode.insertBefore(item.nextElementSibling, item); renumber(wrap); }
  });
  root.addEventListener('change', async (e) => {
    const file = e.target.closest('[data-media] input[type=file]');
    if (!file || !file.files[0]) return;
    const box = file.closest('[data-media]'), status = box.querySelector('[data-status]'), urlInput = box.querySelector('input[type=url]');
    const { cloud, preset } = cloudinaryConfig(ctx.settings);
    if (!cloud || !preset) { toast(t('Set the Cloudinary cloud name and upload preset in Site settings first.'), 'error'); return; }
    status.textContent = t('Uploading…');
    try {
      const url = await uploadMedia(file.files[0], ctx.settings, { resource: box.dataset.kind === 'file' ? 'auto' : 'image' });
      urlInput.value = url; status.textContent = '✓';
      let im = box.querySelector('img'); if (!im && box.dataset.kind === 'image') { im = document.createElement('img'); box.prepend(im); }
      if (im) im.src = img(url, 200);
    } catch { status.textContent = ''; toast(t('Upload failed. Please try again.'), 'error'); }
  });
  const tabs = root.querySelector('.ad-tabs');
  if (tabs) tabs.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-lang]'); if (!b) return;
    tabs.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    root.querySelectorAll('.lang-pane').forEach((p) => { p.hidden = p.dataset.lang !== b.dataset.lang; });
  });
}

function renumber(wrap) {
  wrap.querySelectorAll('[data-item]').forEach((it, i) => { const n = it.querySelector('[data-n]'); if (n) n.textContent = i + 1; });
}

const num = (v, type) => (v === '' || v == null ? null : (type === 'int' ? parseInt(v, 10) : parseFloat(v)));

/** Read the form back into a plain object. Returns { data, errors }. */
export function collect(form, fields) {
  const data = {}, errors = {};
  const val = (el) => (el.type === 'checkbox' ? el.checked : el.value.trim());
  const one = (f, name, scope = form) => {
    const el = scope.querySelector(`[name="${name}"]`) || scope.querySelector(`[data-k="${f.name}"]`);
    if (f.type === 'ref') return el ? el.value : '';
    if (!el) return f.type === 'bool' ? false : '';
    let v = val(el);
    if (f.type === 'int' || f.type === 'float') v = num(v, f.type);
    else if (f.type === 'datetime') v = v ? new Date(v).toISOString() : null;
    else if (f.type === 'date') v = v || '';
    return v;
  };
  for (const f of fields) {
    if (f.type === 'list') {
      const wrap = form.querySelector(`[data-list="${f.name}"]`);
      data[f.name] = wrap ? [...wrap.querySelectorAll('[data-item]')].map((it) => {
        const o = {};
        for (const sf of f.fields) {
          const el = it.querySelector(`[data-k="${sf.name}"]`);
          if (!el) continue;
          let v = el.type === 'checkbox' ? el.checked : el.value.trim();
          if (sf.type === 'int') v = num(v, 'int');
          o[sf.name] = v;
        }
        for (const sf of f.fields) if (sf.required && (o[sf.name] === '' || o[sf.name] == null)) errors[f.name] = `${t(f.item)}: ${t(sf.label)} — ${t('This field is required.')}`;
        return o;
      }) : [];
      continue;
    }
    if (f.type === 'refs') {
      data[f.name] = [...form.querySelectorAll(`[data-refs="${f.name}"] input:checked`)].map((c) => c.value);
      continue;
    }
    if (f.type === 'bool') { data[f.name] = !!form.querySelector(`[name="${f.name}"]`)?.checked; continue; }
    const names = f.tr ? [`${f.name}_en`, `${f.name}_ar`] : [f.name];
    for (const n of names) {
      const v = one(f, n);
      data[n] = v;
      if (f.required && (n === f.name || n.endsWith('_en')) && (v === '' || v == null)) errors[f.name] = t('This field is required.');
      if (v && f.type === 'email' && !isEmail(v)) errors[f.name] = t('Enter a valid email address.');
      if (v && (f.type === 'url' || f.type === 'image' || f.type === 'file') && !isUrl(v) && !String(v).startsWith('/')) errors[f.name] = t('Enter a valid URL.');
    }
  }
  return { data, errors };
}

export const showFieldErrors = (form, errors) => {
  form.querySelectorAll('.err').forEach((e) => { e.hidden = true; e.textContent = ''; });
  for (const [name, msg] of Object.entries(errors)) {
    const box = form.querySelector(`[data-f="${name}"] .err`) || form.querySelector(`[data-list="${name}"]`);
    if (box && box.classList.contains('err')) { box.textContent = msg; box.hidden = false; }
    else if (box) { const d = document.createElement('div'); d.className = 'err'; d.textContent = msg; box.appendChild(d); }
  }
  const first = form.querySelector('.err:not([hidden])');
  if (first) first.scrollIntoView({ block: 'center' });
};

export { esc };
