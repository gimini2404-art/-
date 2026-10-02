/* Image delivery + upload through Cloudinary (free plan, no card needed). Stored value = the full secure_url. */
import { config } from './config.js';

/** Resize/optimise through Cloudinary URL transformations when the image lives there; otherwise return as is. */
export function img(url, width) {
  if (!url) return '';
  const m = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/.exec(url);
  if (!m || /^(f_|q_|w_|c_)/.test(m[2])) return url;
  return `${m[1]}f_auto,q_auto${width ? ',w_' + width : ''}/${m[2]}`;
}

export function cloudinaryConfig(settings = {}) {
  return { cloud: settings.cloudinary_cloud || config.cloudinary.cloud, preset: settings.cloudinary_preset || config.cloudinary.preset };
}

/** Upload a File to Cloudinary with the unsigned preset. Images are shrunk in the browser first (max 1600 px). */
export async function uploadMedia(file, settings, { resource = 'auto', folder = 'sianexis' } = {}) {
  const { cloud, preset } = cloudinaryConfig(settings);
  if (!cloud || !preset) throw new Error('cloudinary-not-configured');
  let body = file;
  if (file.type.startsWith('image/') && !/svg|gif/.test(file.type)) body = await shrink(file, 1600);
  const fd = new FormData();
  fd.append('file', body);
  fd.append('upload_preset', preset);
  fd.append('folder', folder);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/${resource}/upload`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error('upload-failed');
  const data = await res.json();
  return data.secure_url;
}

export async function shrink(file, max) {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (k === 1 && file.size < 900_000) return file;
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/webp', 0.85));
    return blob || file;
  } catch { return file; }
}
