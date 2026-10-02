import { esc } from '../util.js';

export function toast(message, type = 'success') {
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${esc(message)}<button type="button" aria-label="Close">×</button>`;
  el.querySelector('button').addEventListener('click', () => el.remove());
  box.appendChild(el);
  setTimeout(() => el.remove(), 7000);
}
