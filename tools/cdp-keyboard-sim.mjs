/**
 * CDP harness for the mobile keyboard bug.
 *
 * Chromium cannot show an iOS soft keyboard, so this crops the viewport the way
 * an overlay keyboard does — but in the order a phone experiences it: the editor
 * is focused *first*, then the visible area shrinks. That ordering is what the
 * plugin's keyboard latch depends on, and it is also why focusing the editor
 * itself is the closest thing to "tap the input field" available headlessly.
 *
 * Usage: node cdp-keyboard-sim.mjs <wsUrl> <cookie> [url]
 */
const wsUrl = process.argv[2];
const cookie = process.argv[3];
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
await send('Page.enable', {}, session);
await send('Runtime.enable', {}, session);
await send('Network.enable', {}, session);

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
await send('Emulation.setUserAgentOverride', { userAgent: IPHONE_UA }, session);
await send(
  'Emulation.setTouchEmulationEnabled',
  { enabled: true, maxTouchPoints: 5 },
  session,
);

if (cookie) {
  await send(
    'Network.setCookie',
    {
      name: cookie.split('=')[0],
      value: cookie.slice(cookie.indexOf('=') + 1),
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
    },
    session,
  );
}

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

const CHROME = { width: 390, height: 844 };
const KEYBOARD = { width: 390, height: 520 };

const setViewport = async (size) => {
  await send(
    'Emulation.setDeviceMetricsOverride',
    { width: size.width, height: size.height, deviceScaleFactor: 2, mobile: true },
    session,
  );
  await new Promise((resolve) => setTimeout(resolve, 600));
};

const snapshot = async (label) => {
  const value = await evaluate(`(() => {
    const rect = (el) => {
      if (!el) return '-';
      const r = el.getBoundingClientRect();
      return 'top=' + Math.round(r.top) + ' bottom=' + Math.round(r.bottom) + ' h=' + Math.round(r.height);
    };
    const editor = document.querySelector('[contenteditable="true"], textarea');
    const seat = editor ? editor.closest('[class*="composerSeat"], [class*="composerStack"]') : null;
    const scroller = document.querySelector('[data-conversation-scroll]');
    const api = window.__dshViewport;
    const m = api ? api.metrics() : null;
    return [
      'inner=' + innerWidth + 'x' + innerHeight + ' vv=' + Math.round(visualViewport.height) + ' oT=' + Math.round(visualViewport.offsetTop),
      'root.clientH=' + (document.getElementById('root')?.clientHeight ?? -1) + ' style=' + (document.getElementById('root')?.style.height || '-'),
      'docH=' + document.documentElement.scrollHeight + ' scrollY=' + window.scrollY,
      'kbOpen=' + (api ? api.keyboardOpen() : 'no-api'),
      'editor ' + rect(editor),
      'seat   ' + rect(seat),
      'convScroll ' + rect(scroller) + ' scrollTop=' + (scroller?.scrollTop ?? '-') + ' scrollH=' + (scroller?.scrollHeight ?? '-'),
      'editorInsideVisible=' + (editor ? editor.getBoundingClientRect().bottom <= Math.round(visualViewport.height) : 'n/a'),
      'metrics=' + JSON.stringify(m),
    ].join('\\n  ');
  })()`);
  console.log(`--- ${label}\n  ${value}`);
};

const url = process.argv[4] ?? 'http://127.0.0.1:3081/?dshViewport=1';
await send('Page.navigate', { url }, session);
await new Promise((resolve) => setTimeout(resolve, 6000));

await setViewport(CHROME);
await snapshot('1. phone viewport, keyboard closed');

// The tap: focus the editor first, exactly like a finger on the composer.
const focused = await evaluate(
  `(() => { const e = document.querySelector('[contenteditable="true"], textarea'); if (!e) return 'no editor'; e.focus(); return document.activeElement === e ? 'focused' : 'focus-failed'; })()`,
);
console.log(`  [focus] ${focused}`);
await new Promise((resolve) => setTimeout(resolve, 500));

await setViewport(KEYBOARD);
await snapshot('2. focused, then keyboard opens (viewport 844 -> 520)');

// Typing: insert text the way an IME commit does, and re-measure.
await evaluate(`(() => {
  const e = document.querySelector('[contenteditable="true"], textarea');
  if (!e) return 'no editor';
  if (e.isContentEditable) {
    e.focus();
    document.execCommand('insertText', false, 'ni hao');
  } else {
    e.value = 'ni hao';
    e.dispatchEvent(new Event('input', { bubbles: true }));
  }
  return 'typed';
})()`);
await new Promise((resolve) => setTimeout(resolve, 500));
await snapshot('3. after typing while keyboard is open');

await setViewport(CHROME);
await snapshot('4. keyboard closed (height restored)');

ws.close();
