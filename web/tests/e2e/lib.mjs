import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(require('node:child_process').execSync('npm root -g').toString().trim() + '/playwright')); }

export const BASE = process.env.E2E_BASE || 'http://127.0.0.1:5173';
export const results = [];

export async function launch() {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
  return browser;
}

export async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|googletagmanager|plausible|tile\.openstreetmap/, (r) => r.abort());
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_|favicon|Failed to load resource|Could not reach Cloud Firestore|WebChannel/.test(m.text())) page.errors.push(m.text().slice(0, 300)); });
  return page;
}

export async function step(name, fn) {
  try { await fn(); results.push([true, name]); console.log('  ✓', name); } catch (e) { results.push([false, name, e]); console.log('  ✗', name, '\n     ', String(e.message).split('\n')[0]); }
}

export function summary() {
  const failed = results.filter((r) => !r[0]);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  return failed.length === 0;
}

export const go = (page, path) => page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
export const ready = (page, sel = '#main > *', t = 15000) => page.waitForSelector(sel, { timeout: t });
