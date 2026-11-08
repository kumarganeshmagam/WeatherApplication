#!/usr/bin/env node
// CLIME UI tester: opens the built page in headless Chromium, runs checks, saves screenshots + results.json.
// Run (from the repo root; it starts its own static server inside this same process):
//   node tests/ui/run.mjs [--live] [--no-sandbox] [--label before|after] [--out evidence/ui]
// Playwright and the browser live OUTSIDE the repo: PW_MODULE (default /home/factory/tools/playwright/node_modules/playwright/index.mjs)
// --live : do not mock open-meteo / Nominatim (smoke check; run it OUTSIDE the OS sandbox)
// Exit code 0 = all checks passed, 1 = at least one failed. Screenshots: <out>/<label>-<light|dark|mobile>.png, results: <out>/<label>-results.json
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { forecastFixture, searchFixture, reverseFixture } from './fixtures.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const LIVE = flag('--live');
const NOSANDBOX = flag('--no-sandbox');
const LABEL = opt('--label', LIVE ? 'live' : 'run');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.resolve(ROOT, opt('--out', 'evidence/ui'));
const PW = process.env.PW_MODULE || '/home/factory/tools/playwright/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(PW).href);

fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(ROOT, u === '/' ? 'main.html' : u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/main.html`;

const browser = await chromium.launch({ headless: true, args: NOSANDBOX ? ['--no-sandbox'] : [] });
const results = { label: LABEL, live: LIVE, base: BASE, startedAt: new Date().toISOString(), browser: browser.version(), noSandbox: NOSANDBOX, checks: [], screenshots: [] };
const add = (viewport, name, pass, detail = '') => results.checks.push({ viewport, name, pass: !!pass, detail: String(detail).slice(0, 300) });

// Runs inside the page: WCAG contrast ratio of text colour against the nearest opaque background.
function contrastInPage() {
  const parse = (c) => {
    let m = c.match(/rgba?\(([^)]+)\)/);
    if (m) { const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] }; }
    m = c.match(/color\(srgb ([^)]+)\)/);
    if (m) { const p = m[1].split(/[ \/]+/).filter(Boolean).map(Number); return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p[3] === undefined ? 1 : p[3] }; }
    return null;
  };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0.99) return c; } return { r: 255, g: 255, b: 255, a: 1 }; };
  const out = [];
  for (const sel of ['h1', '.current', '.fact dd', '.fact dt', 'label', '.btn-primary', 'th']) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const fg = parse(getComputedStyle(el).color);
    if (!fg) continue;
    const L1 = lum(fg), L2 = lum(bgOf(el));
    out.push({ sel, ratio: Math.round((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05) * 100) / 100 });
  }
  return out;
}

function inspectPage() {
  const main = document.querySelector('main#weather') || document.querySelector('main');
  const text = document.body.innerText;
  const q = (s) => (document.querySelector(s) || {}).textContent || '';
  const content = document.querySelector('#content');
  return {
    mainChildren: main ? main.children.length : -1,
    mainText: main ? main.innerText.trim().slice(0, 100) : '',
    cards: document.querySelectorAll('main .card, main .current').length,
    contentVisible: !!content && !content.hidden && content.getClientRects().length > 0,
    badText: ['Date', 'timeZone', 'Error fetching data'].filter((t) => new RegExp('(^|[^A-Za-z])' + t + '([^A-Za-z]|$)').test(text)),
    chartMarks: document.querySelectorAll('main svg:not(.icon) circle, main svg:not(.icon) rect, main svg:not(.icon) path, main svg:not(.icon) polyline').length,
    apparent: q('#apparent').trim(), sunrise: q('#sunrise').trim(), sunset: q('#sunset').trim(), uv: q('#uv').trim(),
    scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth,
    contrast: contrastInPage(),
  };
}

const VIEWS = [
  { id: 'light', viewport: { width: 1400, height: 1000 }, scheme: 'light' },
  { id: 'dark', viewport: { width: 1400, height: 1000 }, scheme: 'dark' },
  { id: 'mobile', viewport: { width: 390, height: 844 }, scheme: 'light' },
];

for (const v of VIEWS) {
  const errors = [];
  const ctx = await browser.newContext({ viewport: v.viewport, colorScheme: v.scheme, locale: 'en-GB', timezoneId: 'Europe/London' });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/i.test(m.text() + (m.location().url || ''))) errors.push(m.text().slice(0, 150)); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 150)));
  page.on('response', (r) => { if (r.status() >= 400 && !/favicon/i.test(r.url())) errors.push(`HTTP ${r.status()} ${r.url()}`); });
  if (!LIVE) {
    await page.route(/api\.open-meteo\.com/, (r) => r.fulfill({ json: forecastFixture() }));
    await page.route(/nominatim\.openstreetmap\.org\/search/, (r) => r.fulfill({ json: searchFixture }));
    await page.route(/nominatim\.openstreetmap\.org\/reverse/, (r) => r.fulfill({ json: reverseFixture }));
  }
  try {
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForFunction(() => { const c = document.querySelector('#content'); return c && !c.hidden; }, null, { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(600);
    const i = await page.evaluate(`(() => { ${contrastInPage.toString()}; return (${inspectPage.toString()})(); })()`);
    add(v.id, 'main has content cards (not empty)', i.mainChildren >= 2 && i.cards >= 2, `children=${i.mainChildren} cards=${i.cards} mainText="${i.mainText.replace(/\s+/g, ' ')}"`);
    add(v.id, 'weather panel visible', i.contentVisible, `contentVisible=${i.contentVisible}`);
    add(v.id, "no 'Date' / 'timeZone' / 'Error fetching data' text", i.badText.length === 0, i.badText.join(','));
    add(v.id, 'rain chart SVG has marks', i.chartMarks >= 8, `marks=${i.chartMarks}`);
    add(v.id, 'feels-like present', /\d/.test(i.apparent), i.apparent);
    add(v.id, 'sunrise present', /\d/.test(i.sunrise), i.sunrise);
    add(v.id, 'sunset present', /\d/.test(i.sunset), i.sunset);
    add(v.id, 'UV index present', /\d/.test(i.uv), i.uv);
    add(v.id, 'no console errors (favicon 404 ignored)', errors.length === 0, errors.join(' | '));
    add(v.id, 'no horizontal scroll', i.scrollW <= i.innerW + 1, `scrollWidth=${i.scrollW} innerWidth=${i.innerW}`);
    const low = i.contrast.filter((c) => c.ratio < 4.5);
    add(v.id, `readable (${v.scheme}): text contrast >= 4.5`, i.contrast.length >= 3 && low.length === 0, JSON.stringify(low.length ? low : i.contrast.slice(0, 4)));
    const shot = path.join(OUT, `${LABEL}-${v.id}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    results.screenshots.push(path.relative(ROOT, shot));

    if (v.id === 'light') {
      // keyboard order: Tab must reach search, pin (or unpin), locate
      const seen = [];
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      for (let n = 0; n < 25; n++) {
        await page.keyboard.press('Tab');
        seen.push(await page.evaluate(() => { const a = document.activeElement; return a ? (a.id || a.getAttribute('aria-label') || a.tagName) : ''; }));
      }
      const idx = (s) => seen.findIndex((x) => x === s);
      const pinI = Math.min(...['pin', 'unpin'].map(idx).filter((x) => x >= 0).concat([999]));
      add(v.id, 'Tab reaches search, pin, locate', idx('search-input') >= 0 && pinI < 999 && idx('locate') >= 0, seen.slice(0, 10).join(' > '));
      // search flow
      if (!LIVE) {
        try {
          await page.fill('#search-input', 'Paris');
          await page.waitForSelector('#suggestions li', { timeout: 6000 });
          const n = await page.locator('#suggestions li').count();
          await page.locator('#suggestions li').first().click();
          await page.waitForTimeout(800);
          const loc = await page.evaluate(() => (document.querySelector('#loc') || {}).textContent || '');
          add(v.id, 'search shows suggestions and selecting one loads it', n >= 1 && /paris/i.test(loc), `suggestions=${n} heading="${loc.trim()}"`);
        } catch (e) { add(v.id, 'search shows suggestions and selecting one loads it', false, e.message); }
      }
    }
  } catch (e) {
    add(v.id, 'page runs', false, e.message);
  }
  await ctx.close();
}
await browser.close();
server.close();
results.finishedAt = new Date().toISOString();
results.passed = results.checks.filter((c) => c.pass).length;
results.failed = results.checks.filter((c) => !c.pass).length;
results.ok = results.failed === 0;
fs.writeFileSync(path.join(OUT, `${LABEL}-results.json`), JSON.stringify(results, null, 2));
for (const c of results.checks) console.log(`${c.pass ? 'PASS' : 'FAIL'} [${c.viewport}] ${c.name}${c.pass ? '' : ' -> ' + c.detail}`);
console.log(`\n${results.passed} passed, ${results.failed} failed (${LIVE ? 'live' : 'mocked'}), screenshots in ${path.relative(ROOT, OUT)}`);
process.exit(results.ok ? 0 : 1);
