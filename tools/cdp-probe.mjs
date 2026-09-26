/**
 * Minimal CDP driver (no npm deps) used to inspect the running DSH Web GUI in a
 * real Chromium. Node 22 ships a global WebSocket, so this speaks CDP directly.
 *
 * Usage: node cdp-probe.mjs <wsUrl>
 */
const wsUrl = process.argv[2];
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

const events = [];
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id !== undefined) {
    const entry = pending.get(message.id);
    if (entry === undefined) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
    else entry.resolve(message.result);
    return;
  }
  events.push(message);
});

await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

const targets = await send('Target.getTargets');
const page = targets.targetInfos.find((t) => t.type === 'page');
if (page === undefined) throw new Error('no page target');

const attached = await send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
const session = attached.sessionId;

await send('Page.enable', {}, session);
await send('Runtime.enable', {}, session);
await send('Network.enable', {}, session);

const evaluate = async (expression) => {
  const result = await send(
    'Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise: true },
    session,
  );
  if (result.exceptionDetails !== undefined) {
    throw new Error(result.exceptionDetails.exception?.description ?? 'evaluate failed');
  }
  return result.result.value;
};

const cookie = process.argv[3];
const url = process.argv[4] ?? 'http://127.0.0.1:3081/';
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

await send('Page.navigate', { url }, session);
await new Promise((resolve) => setTimeout(resolve, 5000));

const report = await evaluate(`(() => {
  const lines = [];
  const push = (s) => lines.push(s);
  push('url=' + location.href);
  push('inner=' + innerWidth + 'x' + innerHeight + ' dpr=' + devicePixelRatio);
  push('vv=' + Math.round(visualViewport.width) + 'x' + Math.round(visualViewport.height) + ' scale=' + visualViewport.scale);
  push('documentElement.scrollHeight=' + document.documentElement.scrollHeight + ' clientHeight=' + document.documentElement.clientHeight);
  push('body.scrollHeight=' + document.body.scrollHeight + ' clientHeight=' + document.body.clientHeight);
  const root = document.getElementById('root');
  push('root.clientHeight=' + (root ? root.clientHeight : -1) + ' root.style.height=' + (root ? root.style.height : '-'));

  const editor = document.querySelector('[contenteditable="true"], textarea');
  push('editor=' + (editor ? editor.tagName + '.' + (editor.className || '') : 'MISSING'));
  if (editor) {
    const r = editor.getBoundingClientRect();
    push('editor.rect top=' + Math.round(r.top) + ' bottom=' + Math.round(r.bottom) + ' h=' + Math.round(r.height));
    const chain = [];
    let node = editor;
    while (node && node !== document.body) {
      const cs = getComputedStyle(node);
      chain.push(
        node.tagName.toLowerCase() +
          '[' + (node.className ? String(node.className).slice(0, 28) : '') + ']' +
          ' oy=' + cs.overflowY +
          ' sh=' + node.scrollHeight +
          ' ch=' + node.clientHeight +
          (node.hasAttribute('data-conversation-scroll') ? ' *CONV-SCROLL*' : '')
      );
      node = node.parentElement;
    }
    push('--- ancestor chain (editor -> body) ---');
    for (const row of chain) push(row);
  }
  const scrollport = document.querySelector('[data-conversation-scroll]');
  push('conversation-scroll: ' + (scrollport ? ('clientHeight=' + scrollport.clientHeight + ' scrollHeight=' + scrollport.scrollHeight + ' scrollTop=' + scrollport.scrollTop) : 'MISSING'));
  return lines.join('\\n');
})()`);

console.log(report);
ws.close();
