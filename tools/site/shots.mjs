/**
 * Screenshots the site at phone, iPad and desktop sizes, in every language.
 *
 * A picture is the only way to review spacing changes, and the numeric probes in
 * `measure.mjs` deliberately do not notice "this just looks wrong". Read-only:
 * it writes PNGs to the output directory and nothing else.
 *
 * Usage: node tools/site/shots.mjs <wsUrl> <outDir> [pagesDir]
 */
import fs from 'node:fs';
import path from 'node:path';

const wsUrl = process.argv[2];
const outDir = process.argv[3] ?? '/tmp/dsh-site-shots';
// Either a directory (file:// URLs) or an http origin; the HTTP form is the one
// that behaves like the deployed site, and the query string defeats the cache —
// a stale stylesheet once made a working rule look dead for several rounds.
const pagesDir = process.argv[4] ?? '/root/dsh-mobile-ux/docs';
const isHttp = pagesDir.startsWith('http');
const pageUrl = (page) =>
  isHttp
    ? `${pagesDir}/${page}.html?v=${Date.now()}`
    : `file://${pagesDir}/${page}.html`;

const ws = new WebSocket(wsUrl);
let nextId = 1;
const pending = new Map();
const send = (method, params = {}) => {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => reject(new Error(`timeout ${method}`)), 25000);
  });
};
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id === undefined) return;
  const entry = pending.get(message.id);
  if (entry === undefined) return;
  pending.delete(message.id);
  if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
  else entry.resolve(message.result);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DEVICES = [
  ['phone', 390, 844, true],
  ['ipad', 834, 1112, true],
  ['desktop', 1440, 900, false],
];
const PAGES = ['index', 'access', 'install'];
const LANGS = ['zh', 'en'];

ws.addEventListener('open', async () => {
  try {
    fs.mkdirSync(outDir, { recursive: true });
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    const evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };

    for (const [device, width, height, mobile] of DEVICES) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile,
      });
      for (const page of PAGES) {
        for (const lang of LANGS) {
          await send('Page.navigate', { url: pageUrl(page) }).catch(() => {});
          await sleep(600);
          await evaluate(`localStorage.setItem('dsh-mobile-ux:lang', ${JSON.stringify(lang)})`);
          await send('Page.reload');
          await sleep(800);
          const shot = await send('Page.captureScreenshot', { format: 'png' });
          const file = path.join(outDir, `${device}-${page}-${lang}.png`);
          fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
          console.log(`written  ${file}`);
        }
      }
    }
  } catch (error) {
    console.error('shots failed:', error.message);
    process.exitCode = 1;
  }
  ws.close();
  process.exit(process.exitCode ?? 0);
});
