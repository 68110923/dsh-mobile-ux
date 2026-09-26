/**
 * Integration probe: does the mobile shell still behave once the keyboard
 * plugin locks the document?
 *
 * Runs against the live GUI with the plugin installed. It focuses the editor so
 * the scroll lock engages, then checks that the surfaces the other mobile plugin
 * turns into overlays (sidebar drawer, settings dialog, menus) are still laid out
 * and positioned sanely.
 *
 * Usage: node cdp-integration.mjs <wsUrl> <token>
 */
const wsUrl = process.argv[2];
const token = process.argv[3];
const ws = new WebSocket(wsUrl);
let nextId = 1;
const pending = new Map();

function send(method, params = {}, sessionId) {
  const id = nextId++;
  const message = { id, method, params };
  if (sessionId !== undefined) message.sessionId = sessionId;
  ws.send(JSON.stringify(message));
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
  if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
  else entry.resolve(message.result);
});

await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

const targets = await send('Target.getTargets');
const page = targets.targetInfos.find((t) => t.type === 'page');
const attached = await send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
const session = attached.sessionId;
for (const domain of ['Page', 'Runtime', 'Network']) await send(`${domain}.enable`, {}, session);
await send(
  'Emulation.setUserAgentOverride',
  {
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
  session,
);
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, session);

const evaluate = async (expression) => {
  const result = await send(
    'Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise: true },
    session,
  );
  if (result.exceptionDetails !== undefined) {
    return `ERROR ${result.exceptionDetails.exception?.description}`;
  }
  return result.result.value;
};

const setViewport = async (height) => {
  await send(
    'Emulation.setDeviceMetricsOverride',
    { width: 390, height, deviceScaleFactor: 2, mobile: true },
    session,
  );
  await new Promise((r) => setTimeout(r, 700));
};

const LOCKED = () =>
  evaluate(`(() => {
    const styles = [...document.querySelectorAll('style')].map((s) => s.textContent.replace(/\\s+/g, ' '));
    return styles.some((css) => css.includes('overscroll-behavior: none'));
  })()`);

const summary = () =>
  evaluate(`(() => {
    const editor = document.querySelector('[contenteditable="true"], textarea');
    const frame = document.querySelector('[class*="_frame"]');
    const center = document.querySelector('[class*="_centerCol"]');
    const sidebar = document.querySelector('[class*="_sidebarCol"]');
    const dialogs = [...document.querySelectorAll('[role="dialog"]')];
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        pos: cs.position, z: cs.zIndex, visible: r.width > 0 && r.height > 0,
      };
    };
    return JSON.stringify({
      lockApplied: [...document.querySelectorAll('style')]
        .some((s) => s.textContent.includes('overscroll-behavior: none')),
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
      bodyOverflow: getComputedStyle(document.body).overflow,
      docScrollable: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      // The pack injects plain <style> elements with no marker attribute, so it is
      // identified by the comment its §1 stylesheet starts with. (This used to look
      // for `style[data-plugin="dsh-web-mobile-fix"]`, an attribute no version of
      // this pack ever set — the check was permanently false.)
      layoutStyles: [...document.querySelectorAll('style')]
        .some((s) => s.textContent.includes('mobile UI fixes')),
      frameGrid: frame ? getComputedStyle(frame).gridTemplateColumns : null,
      sidebarCollapsed: frame?.hasAttribute('data-sidebar-collapsed') ?? null,
      editorVisible: editor ? editor.getBoundingClientRect().bottom <= Math.round(visualViewport.height) : null,
      editor: box(editor),
      center: box(center),
      sidebar: box(sidebar),
      dialogs: dialogs.map((d) => ({ ...box(d), modal: d.getAttribute('aria-modal') })),
      bodyScrollHeight: document.body.scrollHeight,
      bodyClientHeight: document.body.clientHeight,
    });
  })()`);

const openSettings = () =>
  evaluate(`(() => {
    const buttons = [...document.querySelectorAll('button')];
    const target = buttons.find((b) => /settings|设置/i.test(b.getAttribute('aria-label') || b.title || ''));
    if (!target) return 'no settings button';
    target.click();
    return 'clicked';
  })()`);

const openSidebar = () =>
  evaluate(`(() => {
    const buttons = [...document.querySelectorAll('button')];
    const target = buttons.find((b) => /sidebar|侧边|menu|导航/i.test(b.getAttribute('aria-label') || ''));
    if (!target) return 'no sidebar button';
    target.click();
    return 'clicked';
  })()`);

await send('Page.navigate', { url: `http://127.0.0.1:3081/?token=${token}` }, session);
await new Promise((r) => setTimeout(r, 7000));

await setViewport(844);
console.log('1. narrow viewport, keyboard closed');
console.log('   ', await summary());

// Keyboard-like crop + focus: this is when the scroll lock engages.
await evaluate(
  `(() => { const e = document.querySelector('[contenteditable="true"], textarea'); if (e) e.focus(); return !!e; })()`,
);
await setViewport(560);
console.log('2. editor focused, visible area 560 (scroll lock on)');
console.log('   ', await summary());

console.log('3. can the document scroll while locked?');
console.log('   scrollTo(0,50) ->', await evaluate(`(() => { window.scrollTo(0, 50); return { y: window.scrollY, docH: document.documentElement.scrollHeight, clientH: document.documentElement.clientHeight }; })()`));

console.log('4. sidebar toggle while locked:', await openSidebar());
await new Promise((r) => setTimeout(r, 800));
console.log('   ', await summary());

console.log('5. settings dialog while locked:', await openSettings());
await new Promise((r) => setTimeout(r, 900));
console.log('   ', await summary());

console.log('6. opt-out check: reload with ?dshViewport=0');
await send('Page.navigate', { url: `http://127.0.0.1:3081/?token=${token}&dshViewport=0` }, session);
await new Promise((r) => setTimeout(r, 7000));
await setViewport(560);
console.log('   lock applied =', await LOCKED(), '(must be false)');
console.log('   ', await summary());

ws.close();
