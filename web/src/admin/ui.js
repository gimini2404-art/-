import { t } from '../i18n/index.js';
import { html, toHtml } from '../util.js';

export function modal(content, wire) {
  const m = document.createElement('div');
  m.className = 'ad-modal';
  m.innerHTML = `<div class="box">${toHtml(content)}<p style="margin-top:14px"><button class="ad-btn line" data-close>${t('Close')}</button></p></div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-close]')) close(); });
  if (wire) wire(m.querySelector('.box'), close);
  return close;
}

export function confirmBox(message) {
  return new Promise((resolve) => {
    const m = document.createElement('div');
    m.className = 'ad-modal';
    m.innerHTML = `<div class="box"><p></p><p><button class="ad-btn danger" data-yes>${t('Yes')}</button> <button class="ad-btn line" data-no>${t('Cancel')}</button></p></div>`;
    m.querySelector('p').textContent = message;
    document.body.appendChild(m);
    const done = (v) => { m.remove(); resolve(v); };
    m.addEventListener('click', (e) => { if (e.target.closest('[data-yes]')) done(true); else if (e.target === m || e.target.closest('[data-no]')) done(false); });
  });
}

export const badge = (status, label) => html`<span class="ad-badge ${status}">${label}</span>`;

export function downloadFile(name, content, type = 'text/csv;charset=utf-8') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const csv = (rows) => rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
