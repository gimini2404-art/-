/* Embedded raster images of a PDF (browser only: needs a canvas) and their pairing with the "Fig. N" captions.
   Counterpart of _extract_images() in core/pdf_extract.py. */

const MIN_W = 300, MIN_H = 150;

/** [{page, blob, width, height}] for every embedded image that is big enough to be a figure. */
export async function findImages(pdfjs, doc, { max = 40 } = {}) {
  const found = [];
  const OPS = pdfjs.OPS;
  for (let pno = 1; pno <= doc.numPages && found.length < max; pno++) {
    const page = await doc.getPage(pno);
    let list;
    try { list = await page.getOperatorList(); } catch { continue; }
    const seen = new Set();
    for (let i = 0; i < list.fnArray.length; i++) {
      const fn = list.fnArray[i];
      if (fn !== OPS.paintImageXObject && fn !== OPS.paintInlineImageXObject && fn !== OPS.paintImageXObjectRepeat) continue;
      try {
        let obj;
        if (fn === OPS.paintInlineImageXObject) obj = list.argsArray[i][0];
        else {
          const id = list.argsArray[i][0];
          if (seen.has(id)) continue;
          seen.add(id);
          obj = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('timeout')), 8000);
            (id.startsWith('g_') ? page.commonObjs : page.objs).get(id, (o) => { clearTimeout(timer); resolve(o); });
          });
        }
        if (!obj || obj.width < MIN_W || obj.height < MIN_H) continue;
        const blob = await toBlob(obj);
        if (blob && blob.size < 8_000_000) found.push({ page: pno, blob, width: obj.width, height: obj.height });
      } catch { /* an unreadable image is skipped */ }
    }
  }
  return found;
}

async function toBlob(obj) {
  const c = document.createElement('canvas');
  c.width = obj.width; c.height = obj.height;
  const ctx = c.getContext('2d');
  if (obj.bitmap) ctx.drawImage(obj.bitmap, 0, 0);
  else {
    const { width: w, height: h, data } = obj;
    const rgba = new Uint8ClampedArray(w * h * 4);
    if (data.length === w * h * 4) rgba.set(data);
    else if (data.length === w * h * 3) for (let i = 0, j = 0; i < data.length; i += 3, j += 4) { rgba[j] = data[i]; rgba[j + 1] = data[i + 1]; rgba[j + 2] = data[i + 2]; rgba[j + 3] = 255; }
    else if (data.length === w * h) for (let i = 0, j = 0; i < data.length; i++, j += 4) { rgba[j] = rgba[j + 1] = rgba[j + 2] = data[i]; rgba[j + 3] = 255; }
    else return null; // 1-bit masks and other layouts
    ctx.putImageData(new ImageData(rgba, w, h), 0, 0);
  }
  // keep the pictures reasonably light: Cloudinary's free plan has a 10 MB file limit
  const k = Math.min(1, 1800 / Math.max(c.width, c.height));
  let src = c;
  if (k < 1) { src = document.createElement('canvas'); src.width = Math.round(c.width * k); src.height = Math.round(c.height * k); src.getContext('2d').drawImage(c, 0, 0, src.width, src.height); }
  return new Promise((r) => src.toBlob(r, 'image/png'));
}

/** Assign images to figure captions: same page first, then reading order when the counts match.
    Returns [{number, blob, page}] and whether the counts disagreed. */
export function pairImages(figures, found) {
  const figs = figures.filter((f) => f.kind === 'figure').sort((a, b) => ((a.page || 0) - (b.page || 0)) || (a.number - b.number));
  const spare = [...found], pairs = [];
  for (const f of figs) {
    const im = spare.find((x) => x.page === f.page);
    if (im) { spare.splice(spare.indexOf(im), 1); pairs.push([f, im]); }
  }
  if (found.length === figs.length) {
    const rest = figs.filter((f) => !pairs.some((p) => p[0] === f));
    rest.forEach((f, i) => { if (spare[i]) pairs.push([f, spare[i]]); });
  }
  return { images: pairs.map(([f, im]) => ({ number: f.number, blob: im.blob, page: im.page })), mismatch: found.length !== figs.length };
}
