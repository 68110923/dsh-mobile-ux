/**
 * Real-browser verification of the shipped bundle and its override switches.
 *
 * What a browser can prove here, and what it cannot:
 *
 * - It can prove the bundle loads, runs without exceptions, injects §1/§2/§5, and
 *   leaves the composer's font size alone.
 * - It can prove the reader's programmatic overrides (`window.__dshMobileUxOptions`,
 *   installed before the bundle runs) really change what the page gets — including
 *   the property-collision bug this tool exists to check.
 * - It cannot exercise `?dshMobileUx=` on this server: the shell consumes the query
 *   string during token authentication and the address bar ends up at `/`, so the
 *   pack never sees the parameter. URL switches are covered by `client.test.mjs`,
 *   whose harness sets `location.href` directly.
 * - It cannot open a soft keyboard: Chromium's emulation resizes both viewports, so
 *   the pack correctly concludes there is no keyboard. That geometry is covered by
 *   `client.test.mjs` too.
 *
 * Read-only: it never writes to the profile or the repository.
 *
 * Usage: node cdp-switches.mjs <wsUrl> <baseUrlWithToken>
 */
const wsUrl = process.argv[2];
const base = process.argv[3];

const ws = new WebSocket(wsUrl);
let nextId = 1;
const pending = new Map();

/**
 * Sends one CDP command.
 *
 * @param method - CDP method name.
 * @param params - its parameters.
 * @returns the result.
 */
function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`timeout: ${method}`));
      }
    }, 20000);
  });
}

ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id === undefined) return;
  const entry = pending.get(message.id);
  if (entry === undefined) return;
  pending.delete(message.id);
  if (message.error !== undefined) entry.reject(new Error(JSON.stringify(message.error)));
  else entry.resolve(message.result);
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

ws.addEventListener('open', async () => {
  try {
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true,
    });

    const evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (result.exceptionDetails !== undefined) {
        throw new Error(JSON.stringify(result.exceptionDetails));
      }
      return result.result.value;
    };

    const snapshot = `(() => {
      const de = document.documentElement;
      const root = document.getElementById('root');
      const styles = [...document.querySelectorAll('style')].map((s) => s.textContent);
      const editor = document.querySelector('[contenteditable="true"], textarea');
      return JSON.stringify({
        heightWritten: de.style.height !== '' || root.style.height !== '',
        shellVar: de.style.getPropertyValue('--dsh-app-visual-height') || '-',
        lock: styles.some((css) => css.includes('overscroll-behavior: none')),
        layout: styles.some((css) => css.includes('mobile UI fixes')),
        meta: document.querySelector('meta[name="viewport"]')?.content ?? '(none)',
        hud: Boolean(document.querySelector('[data-dsh-mobile-ux-hud]')),
        fontSize: editor ? getComputedStyle(editor).fontSize : '(no editor)',
        api: typeof window.__dshMobileUx?.metrics,
        override: JSON.stringify(window.__dshMobileUxOptions ?? null),
      });
    })()`;

    /**
     * Loads the app with an optional pre-bundle override and reports what it got.
     *
     * @param label - what this run is checking.
     * @param prelude - JavaScript evaluated before any page script.
     * @returns the observation.
     */
    const observe = async (label, prelude) => {
      const script = await send('Page.addScriptToEvaluateOnNewDocument', { source: prelude });
      try {
        // `about:blank` in between: navigating straight back to the same URL can be
        // treated as a same-document navigation, which would leave the already
        // running app (with its already-consumed switches) in place.
        await send('Page.navigate', { url: 'about:blank' }).catch(() => {});
        await sleep(200);
        await send('Page.navigate', { url: base }).catch(() => {});
        let ready = false;
        for (let attempt = 0; attempt < 30; attempt += 1) {
          ready = await evaluate(
            `Boolean(document.getElementById('root')) && typeof window.__dshMobileUx === 'object'`,
          );
          if (ready) break;
          await sleep(400);
        }
        await sleep(1000);
        return { label, ...JSON.parse(await evaluate(snapshot)) };
      } finally {
        await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: script.identifier });
      }
    };

    const rows = [];
    rows.push(await observe('默认：什么都不覆盖', 'void 0;'));
    rows.push(
      await observe('覆盖 keyboard:false', 'window.__dshMobileUxOptions = { keyboard: false };'),
    );
    rows.push(await observe('覆盖 hud:true', 'window.__dshMobileUxOptions = { hud: true };'));
    rows.push(
      await observe(
        '覆盖 layout:false, zoom:false',
        'window.__dshMobileUxOptions = { layout: false, zoom: false };',
      ),
    );

    for (const row of rows) {
      console.log(`\n${row.label}`);
      console.log(
        `   写了高度=${row.heightWritten} (${row.shellVar})  lock=${row.lock}` +
          `  §1样式=${row.layout}  HUD=${row.hud}  字号=${row.fontSize}`,
      );
      console.log(`   meta=${row.meta}`);
      console.log(`   读数 API=${row.api}   覆盖属性=${row.override}`);
    }
  } catch (error) {
    console.error('probe failed:', error.message);
    process.exitCode = 1;
  }
  ws.close();
  process.exit(process.exitCode ?? 0);
});
