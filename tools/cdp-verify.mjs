/**
 * End-to-end verification of the shipped bundle in a real Chromium.
 *
 * Opens the running DSH Web GUI with an auth token, emulates a phone, then opens
 * the soft keyboard the way iOS does: an *overlay* that shrinks the visual
 * viewport while the layout viewport (`window.innerHeight`) does not move. That
 * distinction is the whole point — emulating the keyboard by resizing the window
 * makes the pack correctly report "no keyboard", which is not the state under
 * test.
 *
 * Read-only: it never writes to the profile or the repository.
 *
 * Usage: node cdp-verify.mjs <wsUrl> <pageUrlWithToken>
 */
const wsUrl = process.argv[2];
const target = process.argv[3];

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

/** The layout viewport the phone reports; the soft keyboard never changes it. */
const SCREEN_HEIGHT = 844;
/** The visual viewport once the keyboard covers the lower part of the screen. */
const KEYBOARD_VISIBLE = 500;

ws.addEventListener('open', async () => {
  try {
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: SCREEN_HEIGHT,
      deviceScaleFactor: 3,
      mobile: true,
    });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await sleep(300);

    // Not awaited: the app keeps an SSE connection open, so `Page.navigate` can
    // resolve long after the document is ready — or not at all.
    await send('Page.navigate', { url: target }).catch(() => {});

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

    // The shell is a React app: measuring before it mounts reads an empty document
    // and produces a report full of zeroes that looks like a total regression.
    let mounted = false;
    let lastSeen = '';
    for (let attempt = 0; attempt < 40; attempt += 1) {
      lastSeen = await evaluate(
        `JSON.stringify({` +
          ` editableCount: document.querySelectorAll('[contenteditable]').length,` +
          ` textareaCount: document.querySelectorAll('textarea').length,` +
          ` editor: Boolean(document.querySelector('[contenteditable="true"], textarea')),` +
          ` pack: typeof window.__dshMobileUx,` +
          ` url: location.href,` +
          ` ready: document.readyState })`,
      );
      const seen = JSON.parse(lastSeen);
      mounted = seen.editor && seen.pack === 'object';
      if (mounted) break;
      await sleep(500);
    }
    if (!mounted) throw new Error(`the shell never mounted the composer plus the pack: ${lastSeen}`);
    await sleep(800);

    const geometry = () =>
      evaluate(`(() => {
        const vv = window.visualViewport;
        const root = document.getElementById('root');
        const editor = document.querySelector('[contenteditable="true"], textarea');
        const rect = editor?.getBoundingClientRect() ?? null;
        const de = document.documentElement;
        const rootStyle = root ? getComputedStyle(root) : null;
        return JSON.stringify({
          lvh: window.innerHeight,
          vvH: Math.round(vv?.height ?? 0),
          vvScale: Number((vv?.scale ?? 1).toFixed(2)),
          vvTop: Math.round(vv?.offsetTop ?? 0),
          rootH: root ? root.clientHeight : 0,
          rootPos: rootStyle ? rootStyle.position : null,
          rootTop: rootStyle ? rootStyle.top : null,
          shellH: de.style.getPropertyValue('--dsh-app-visual-height') || '-',
          pan: de.style.getPropertyValue('--dsh-mux-pan') || '-',
          slack: de.scrollHeight - de.clientHeight,
          scrollY: Math.round(window.scrollY),
          editorBottom: rect ? Math.round(rect.bottom) : null,
          editorVisible: rect ? rect.bottom <= Math.round(vv.height) + 1 : null,
          editorFont: editor ? getComputedStyle(editor).fontSize : null,
          kb: window.__dshMobileUx?.keyboardOpen?.() ?? null,
          lock: [...document.querySelectorAll('style')].some((s) => s.textContent.includes('overscroll-behavior: none')),
          layoutStyles: [...document.querySelectorAll('style')].some((s) => s.textContent.includes('mobile UI fixes')),
          meta: document.querySelector('meta[name="viewport"]')?.content ?? null,
        });
      })()`);

    /**
     * Prints one measurement block.
     *
     * @param label - the report heading.
     * @param raw - a geometry JSON string.
     */
    const report = (label, raw) => {
      const g = JSON.parse(raw);
      console.log(`\n${label}`);
      console.log(
        `   lvh=${g.lvh} vvH=${g.vvH} scale=${g.vvScale} oT=${g.vvTop} kb=${g.kb ? 1 : 0}` +
          `  →  root=${g.rootH} (${g.rootPos}, top=${g.rootTop})  外壳变量=${g.shellH} pan=${g.pan}`,
      );
      console.log(
        `   slack=${g.slack} scrollY=${g.scrollY}  输入框底边=${g.editorBottom}` +
          ` 在可视区内=${g.editorVisible} 字号=${g.editorFont}`,
      );
      console.log(`   lock=${g.lock} layoutStyles=${g.layoutStyles}   meta=${g.meta}`);
    };

    report('1. 初始（键盘未开）', await geometry());

    // Focus the composer the way a tap does; the pack latches on focusin.
    await evaluate(`(() => {
      const editor = document.querySelector('[contenteditable="true"], textarea');
      if (!editor) return false;
      editor.focus();
      return document.activeElement === editor;
    })()`);
    await sleep(500);
    report('2. 聚焦输入框', await geometry());

    // The keyboard: an overlay that shrinks only the visual viewport.
    await send('Emulation.setVisibleSize', { width: 390, height: KEYBOARD_VISIBLE });
    await sleep(1500);
    report('3. 键盘弹出（可视视口 844→500，布局视口不变）', await geometry());

    // iOS also pans the visual viewport; the shell has to publish the pan.
    await evaluate('window.visualViewport.dispatchEvent(new Event("scroll"))');
    await sleep(600);
    report('4. 可视视口滚动事件后', await geometry());

    // Typing: the reader's actual complaint was the composer dropping behind it.
    await send('Input.insertText', { text: '验证' });
    await sleep(900);
    report('5. 打字后', await geometry());

    // A deliberate document scroll must be clamped back to zero.
    await evaluate('window.scrollTo(0, 400)');
    await sleep(700);
    report('6. 强行滚动 400px 后', await geometry());
  } catch (error) {
    console.error('probe failed:', error.message);
    process.exitCode = 1;
  }
  ws.close();
  process.exit(process.exitCode ?? 0);
});
