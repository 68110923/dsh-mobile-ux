/**
 * Renders each page in both languages and dumps the readable text.
 *
 * The point is to be able to diff the site before and after a translation-system
 * change: the markup may be completely different, but the words a reader sees
 * must not move by a character.
 *
 * Usage: node tools/site/text_snapshot.mjs <wsUrl> <dirWithPages> <zh|en>
 */
const wsUrl = process.argv[2];
const dir = process.argv[3];
const lang = process.argv[4] || 'zh';

const ws = new WebSocket(wsUrl);
let nextId = 1;
const pending = new Map();
const send = (method, params = {}) => {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => reject(new Error('timeout ' + method)), 20000);
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

ws.addEventListener('open', async () => {
  try {
    await send('Page.enable');
    await send('Runtime.enable');
    const evaluate = async (expression) => {
      const r = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
      return r.result.value;
    };
    for (const page of ['index.html', 'access.html', 'install.html']) {
      await send('Page.navigate', { url: `file://${dir}/${page}` });
      await sleep(800);
      // The site stores the choice; set it and re-render.
      await evaluate(`localStorage.setItem('dsh-mobile-ux:lang', ${JSON.stringify(lang)})`);
      await send('Page.reload');
      await sleep(900);
      const dump = await evaluate(`(() => {
        const out = [];
        const title = document.querySelector('title');
        if (title) out.push('TITLE\\t' + title.textContent.trim());
        const desc = document.querySelector('meta[name="description"]');
        if (desc) out.push('DESC\\t' + desc.getAttribute('content').trim());
        // Text is collected per block, not per text node: inline markup (a
        // highlighted command token, a <b>, a link) splits a sentence into several
        // nodes, and the point of this snapshot is the words, not the DOM shape.
        const BLOCK = new Set(['P', 'LI', 'H1', 'H2', 'H3', 'H4', 'TD', 'TH', 'PRE', 'DIV',
          'SECTION', 'SPAN', 'A', 'B', 'STRONG', 'EM', 'CODE', 'BUTTON', 'TITLE', 'FOOTER',
          'HEADER', 'NAV', 'MAIN', 'OL', 'UL', 'TABLE', 'TR', 'BODY']);
        const emit = (el) => {
          let text = '';
          const collect = (node) => {
            for (const child of node.childNodes) {
              if (child.nodeType === 3) text += child.textContent;
              else if (child.nodeType === 1) {
                if (child.tagName === 'SCRIPT' || child.tagName === 'STYLE') continue;
                collect(child);
              }
            }
          };
          collect(el);
          const normalized = text.replace(/\\s+/g, ' ').trim();
          if (normalized) out.push('TEXT\\t' + normalized);
        };
        // Emit the deepest block that has no block-level descendant, so a card does
        // not also re-emit everything inside it.
        const walk = (el) => {
          const hasBlockChild = [...el.children].some((c) => BLOCK.has(c.tagName));
          if (!hasBlockChild) { emit(el); return; }
          for (const child of el.children) {
            if (child.tagName === 'SCRIPT' || child.tagName === 'STYLE') continue;
            walk(child);
          }
        };
        walk(document.body);
        return out.join('\\n') + '\\n';
      })()`);
      process.stdout.write(`@@@ ${page} @@@\n${dump}`);
    }
  } catch (error) {
    console.error('snapshot failed:', error.message);
    process.exitCode = 1;
  }
  ws.close();
  process.exit(process.exitCode ?? 0);
});
