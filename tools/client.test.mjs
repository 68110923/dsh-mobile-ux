/**
 * Deterministic test for the mobile-keyboard-viewport client half.
 *
 * The client bundle is a script that registers a factory; this harness loads it
 * with a fake `document` and a programmable `visualViewport`, then drives the
 * install and asserts the geometry decisions. It exists because a headless
 * browser cannot fake the iOS visual-viewport pan that the bottom-follow and the
 * scroll lock are written for.
 *
 * Run: node client.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'client.js'), 'utf8');

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name}\n       expected ${JSON.stringify(expected)}\n       actual   ${JSON.stringify(actual)}`);
    console.log(`  FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

/**
 * Builds the fake environment, loads the client bundle into it, and returns the
 * handles a test needs to drive it.
 *
 * @param {{ search?: string, viewport?: object|null, innerHeight?: number }} options
 */
function load(options = {}) {
  const { search = '', innerHeight = 665, userAgent = 'iPhone', maxTouchPoints = 5 } = options;
  const listeners = new Map();
  const timers = [];

  /** Minimal DOM element base, so `instanceof Element` checks behave. */
  class Element {}
  class MouseEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.bubbles = Boolean(init.bubbles);
      this.cancelable = Boolean(init.cancelable);
    }
  }

  const makeElement = (tag) => {
    const element = {
      tagName: tag.toUpperCase(),
      textContent: '',
      style: {
        height: '',
        _props: {},
        setProperty(name, value) {
          if (name === 'height') element.style.height = value;
          else element.style._props[name] = value;
        },
        getPropertyValue(name) {
          if (name === 'height') return element.style.height || '';
          return element.style._props[name] ?? '';
        },
        getPropertyPriority() {
          return '';
        },
        removeProperty(name) {
          if (name === 'height') element.style.height = '';
          else delete element.style._props[name];
        },
      },
      parentNode: null,
      parentElement: null,
      eventListeners: new Map(),
      addEventListener(type, fn) {
        element.eventListeners.set(type, fn);
      },
      removeEventListener(type) {
        element.eventListeners.delete(type);
      },
      /** Fires a registered listener, for tests that simulate a gesture. */
      fire(type) {
        element.eventListeners.get(type)?.();
      },
      append(child) {
        child.parentNode = element;
        child.parentElement = element;
        element.children.push(child);
      },
      contains(other) {
        for (let node = other; node !== null && node !== undefined; node = node.parentNode) {
          if (node === element) return true;
        }
        return false;
      },
      closest(selector) {
        for (let node = element; node !== null && node !== undefined; node = node.parentNode) {
          if (typeof node.matches === 'function' && node.matches(selector)) return node;
        }
        return null;
      },
      remove() {
        if (element.parentNode !== null) {
          const index = element.parentNode.children.indexOf(element);
          if (index >= 0) element.parentNode.children.splice(index, 1);
          element.parentNode = null;
        }
      },
      setAttribute(name, value) {
        element.attributes[name] = String(value);
      },
      removeAttribute(name) {
        delete element.attributes[name];
      },
      hasAttribute(name) {
        return Object.prototype.hasOwnProperty.call(element.attributes, name);
      },
      getAttribute(name) {
        return element.attributes[name] ?? null;
      },
      /** Enough selector support for the handlers under test. */
      matches(selector) {
        return selector.split(',').some((part) => {
          const test = part.trim();
          const classContains = test.match(/^\[class\*="([^"]+)"\]$/);
          if (classContains !== null) return String(element.className).includes(classContains[1]);
          const role = test.match(/^\[role="([^"]+)"\]$/);
          if (role !== null) return element.attributes.role === role[1];
          if (test === 'button' || test === 'input' || test === 'textarea') {
            return element.tagName === test.toUpperCase();
          }
          return false;
        });
      },
      children: [],
      styleSheets: [],
      attributes: {},
    };
    Object.setPrototypeOf(element, Element.prototype);
    return element;
  };

  const head = makeElement('head');
  const body = makeElement('body');
  const documentElement = makeElement('html');
  const root = makeElement('div');
  root.clientHeight = innerHeight;
  // Shipped state: the 100% height comes from the stylesheet, not from an inline
  // style, so every inline height starts unset — exactly what dispose must restore.
  root.style.height = '';
  documentElement.style.height = '';
  body.style.height = '';
  body.append(root);

  const document = {
    documentElement,
    body,
    head,
    activeElement: null,
    getElementById: (id) => (id === 'root' ? root : null),
    querySelector: () => null,
    // §3 prefers the drawer's own toggle button over the layout service.
    querySelectorAll: (selector) =>
      selector.includes('button') ? [collapseButton] : [],
    createElement: makeElement,
    addEventListener(type, fn) {
      listeners.set(`doc:${type}`, fn);
    },
    removeEventListener() {},
  };

  const visualViewport = options.viewport === undefined
    ? {
        width: 390,
        height: 665,
        scale: 1,
        offsetTop: 0,
        offsetLeft: 0,
        listeners: new Map(),
        addEventListener(type, fn) {
          this.listeners.set(type, fn);
        },
        removeEventListener(type) {
          this.listeners.delete(type);
        },
        fire(type) {
          this.listeners.get(type)?.();
        },
        dispatchEvent() {},
      }
    : options.viewport;

  const win = {
    innerHeight,
    innerWidth: 390,
    scrollX: 0,
    scrollY: 0,
    location: { href: `https://example.test/${search}` },
    visualViewport,
    matchMedia: () => ({ matches: true }),
    addEventListener(type, fn) {
      listeners.set(`win:${type}`, fn);
    },
    removeEventListener() {},
    requestAnimationFrame: (fn) => {
      fn();
      return 1;
    },
    cancelAnimationFrame() {},
    setTimeout: (fn, delay) => {
      timers.push({ fn, delay });
      return timers.length;
    },
    clearTimeout() {},
    scrollTo(x, y) {
      win.scrollX = x;
      win.scrollY = y;
    },
    navigator: undefined,
  };

  let sidebarToggles = 0;
  let collapseButtonClicks = 0;
  const collapseButton = {
    tagName: 'BUTTON',
    attributes: { 'aria-label': 'Collapse sidebar' },
    getAttribute(name) {
      return this.attributes[name] ?? null;
    },
    click() {
      collapseButtonClicks += 1;
    },
  };
  const layoutService = {
    toggleSidebar() {
      sidebarToggles += 1;
    },
  };

  let observedCallback = null;
  class MutationObserver {
    constructor(callback) {
      observedCallback = callback;
    }
    observe() {}
    disconnect() {}
  }

  let registration = null;
  const sandbox = {
    window: win,
    document,
    Element,
    MouseEvent,
    MutationObserver,
    navigator: { userAgent, maxTouchPoints },
    URL,
    Math,
    JSON,
    console,
  };
  win.document = document;
  win.navigator = sandbox.navigator;
  sandbox.window.__ModuleLoader__ = {
    load(value) {
      registration = value;
    },
  };

  const keys = Object.keys(sandbox);
  // eslint-disable-next-line no-new-func -- deliberate sandbox evaluation of the bundle.
  const run = new Function(...keys, source);
  run(...keys.map((key) => sandbox[key]));

  const plugin = registration.factory();
  // cordis runs an effect callback and disposes whatever function it returns;
  // a callback that returns nothing is a valid effect.
  const result = plugin.apply({
    effect(callback) {
      return callback();
    },
    get(name) {
      // §1 and §3 look the layout service up without declaring `inject`.
      return name === 'layout' ? layoutService : undefined;
    },
  });
  const dispose = typeof result === 'function' ? result : () => {};

  /** An element that satisfies the plugin's editable selector. */
  const makeEditable = () => {
    const element = makeElement('div');
    element.matches = (selector) => selector.includes('contenteditable');
    element.style.fontSize = '';
    return element;
  };

  return {
    win,
    document,
    makeElement,
    makeEditable,
    get trajectoryObserverCallback() {
      return observedCallback;
    },
    timers,
    root,
    documentElement,
    body,
    head,
    dispose,
    listeners,
    timers,
    sidebarToggles: () => sidebarToggles,
    collapseButtonClicks: () => collapseButtonClicks,
    /** Style elements currently attached to <head>. */
    attached: () => head.children.map((child) => child.textContent.replace(/\s+/g, ' ').trim()),
  };
}

console.log('dsh-mobile-ux: client logic');

// 1. Keyboard closed: the shell keeps the layout height, nothing else changes.
{
  const env = load();
  check('closed: root height equals innerHeight', env.root.style.height, '665px');
  check('closed: no scroll lock applied', env.attached().some((css) => css.includes('overscroll-behavior: none')), false);
  env.dispose();
}

// 2. Keyboard open (viewport shrinks) while the editor is focused: the shell
//    follows the visible height and the document is locked.
{
  const env = load();
  const editable = env.makeEditable(); env.document.activeElement = editable;
  env.win.visualViewport.height = 300;
  env.listeners.get('win:focusin')({ target: env.document.activeElement, relatedTarget: null });
  check('open: root follows visible height', env.root.style.height, '300px');
  check('open: document is scroll-locked', env.attached().some((css) => css.includes('overscroll-behavior: none')), true);

  // A pan must never make the shell taller than the visible area: doing so was
  // exactly the empty band between the composer and the keyboard.
  env.win.visualViewport.offsetTop = 60;
  env.win.visualViewport.fire('scroll');
  check('open + pan: shell never grows past the visible area', env.root.style.height, '300px');

  // A document scroll that iOS still performs is undone.
  env.win.scrollY = 25;
  env.listeners.get('win:scroll')();
  check('open: a stray document scroll is reset', env.win.scrollY, 0);

  // Keyboard closes.
  env.document.activeElement = null;
  env.win.visualViewport.height = 665;
  env.win.visualViewport.offsetTop = 0;
  env.listeners.get('win:focusout')({ target: env.document.activeElement, relatedTarget: null });
  check('closed again: layout height restored', env.root.style.height, '665px');
  check('closed again: lock removed', env.attached().some((css) => css.includes('overscroll-behavior: none')), false);
  env.dispose();
  check('dispose: heights removed', env.root.style.height, '');
}

// 3. Pinch-zoom must never be touched.
{
  const env = load();
  const editable = env.makeEditable(); env.document.activeElement = editable;
  env.win.visualViewport.height = 300;
  env.win.visualViewport.scale = 2;
  env.listeners.get('win:focusin')({ target: env.document.activeElement, relatedTarget: null });
  check('zoom: shell untouched', env.root.style.height, '665px');
  check('zoom: no scroll lock', env.attached().some((css) => css.includes('overscroll-behavior: none')), false);
  env.dispose();
}

// 4. Opt-out: `?dshViewport=0` must install nothing.
{
  const env = load({ search: '?dshMobileUx=0' });
  check('opt-out: no style elements', env.attached().length, 0);
  check('opt-out: no height written', env.root.style.height, '');
  check('opt-out: no listeners', env.listeners.size, 0);
  env.dispose();
}

// 5. Individual switches.
{
  const env = load({ search: '?dshMobileUx=nolock' });
  const editable = env.makeEditable(); env.document.activeElement = editable;
  env.win.visualViewport.height = 300;
  env.listeners.get('win:focusin')({ target: editable, relatedTarget: null });
  check('nolock: height still follows', env.root.style.height, '300px');
  check('nolock: no scroll lock', env.attached().some((css) => css.includes('overscroll-behavior: none')), false);
  env.dispose();
}
// Opt-in pan compensation shrinks the shell instead of growing it.
{
  const env = load({ search: '?dshMobileUx=bottom' });
  const editable = env.makeEditable(); env.document.activeElement = editable;
  env.win.visualViewport.height = 300;
  env.win.visualViewport.offsetTop = 60;
  env.listeners.get('win:focusin')({ target: env.document.activeElement, relatedTarget: null });
  check('bottom opt-in: shell shrinks below the visible area', env.root.style.height, '240px');
  env.dispose();
}
// The focus settle schedule re-asserts the height after the keyboard animation.
{
  const env = load();
  const editable = env.makeEditable(); env.document.activeElement = editable;
  env.win.visualViewport.height = 300;
  env.listeners.get('win:focusin')({ target: env.document.activeElement, relatedTarget: null });
  const delays = env.timers.map((timer) => timer.delay);
  check('focus schedules settle passes', delays, [100, 250, 500, 900]);
  // The keyboard animation ends, no viewport event arrives, the height is stale.
  env.win.visualViewport.height = 280;
  for (const timer of env.timers.slice()) timer.fn();
  check('settle pass adopts the final height', env.root.style.height, '280px');
  env.dispose();
}
// The font guard can be turned off on its own.
{
  const env = load({ search: '?dshMobileUx=nofont' });
  check('nofont: no font-size rule injected', env.attached().some((css) => css.includes('font-size: 17px')), false);
  env.dispose();
}

// 6. Desktop: no viewport API, editor focused, must stay inert.
{
  const env = load({ viewport: null });
  const editable = env.makeEditable(); env.document.activeElement = editable;
  env.listeners.get('win:focusin')({ target: env.document.activeElement, relatedTarget: null });
  check('desktop: shell untouched', env.root.style.height, '665px');
  env.dispose();
}

// 7. §3: a single tap opens a session and a second fast tap does not rename.
{
  const env = load();
  const row = env.makeElement('div');
  row.setAttribute('role', 'treeitem');
  let rowKey = 'session:session-1234';
  const baseGetAttribute = row.getAttribute.bind(row);
  row.getAttribute = (name) => {
    if (name === 'data-row-key') return rowKey;
    if (name === 'aria-selected') return 'false';
    return baseGetAttribute(name);
  };
  const title = env.makeElement('span');
  title.className = 'Rows_title';
  row.append(title);

  const clicks = [];
  row.dispatchEvent = (event) => {
    clicks.push(event.type);
    return true;
  };
  const tap = (type) => {
    const event = {
      target: title,
      type,
      preventDefault() {},
      stopPropagation() {},
    };
    // The handlers are installed on window; feed them the event directly.
    env.listeners.get(`win:${type}`)?.(event);
  };

  tap('pointerup');
  check('tap: opens the session on the first tap', clicks, ['click']);
  check('tap: collapses the drawer after switching', env.collapseButtonClicks(), 1);
  // Second tap inside the suppression window must be swallowed, not opened again.
  tap('pointerup');
  check('tap: a second fast tap does not open or rename', clicks, ['click']);
  check('tap: the suppressed tap does not collapse again', env.collapseButtonClicks(), 1);
  // A key that belongs to a project row is not a session.
  rowKey = 'workspace:681f8e86';
  tap('pointerup');
  check('tap: workspace rows are ignored', clicks, ['click']);
}
// 8. `?dshMobileUx=keepdrawer` leaves the drawer open.
{
  const env = load({ search: '?dshMobileUx=keepdrawer' });
  const row = env.makeElement('div');
  row.setAttribute('role', 'treeitem');
  const baseGet = row.getAttribute.bind(row);
  row.getAttribute = (name) => {
    if (name === 'data-row-key') return 'session:session-1';
    if (name === 'aria-selected') return 'false';
    return baseGet(name);
  };
  const title = env.makeElement('span');
  title.className = 'Rows_title';
  row.append(title);
  row.dispatchEvent = () => true;
  env.listeners.get('win:pointerup')?.({ target: title, preventDefault() {}, stopPropagation() {} });
  check('keepdrawer: drawer is left open', env.collapseButtonClicks(), 0);
  env.dispose();
}
// 9. Section switches gate the tap handler.
{
  const env = load({ search: '?dshMobileUx=notap' });
  check('notap: no tap listener installed', env.listeners.has('win:pointerup'), false);
  env.dispose();
}

// 10. The pack must never write a text size.
//
// An earlier version raised the composer's font size on touch devices to defeat
// the iOS focus-zoom; on a touch-screen laptop that enlarged input text the
// reader never asked to change, and it fought the product's own font-size
// setting. This pins the guarantee so it cannot come back.
{
  const env = load();
  const written = new Set();
  const originalCreate = env.document.createElement;
  env.document.createElement = (tag) => {
    const element = originalCreate(tag);
    const style = element.style;
    const originalSetProperty = style.setProperty.bind(style);
    style.setProperty = (name, value) => {
      written.add(String(name).toLowerCase());
      return originalSetProperty(name, value);
    };
    return element;
  };
  // Re-install so the creation spy sees the stylesheets too.
  const env2 = load();
  const editable = env2.makeEditable();
  env2.document.activeElement = editable;
  env2.document.querySelector = () => null;
  env2.document.querySelectorAll = () => [];
  env2.listeners.get('win:focusin')?.({ target: editable, relatedTarget: null });
  env2.win.visualViewport.height = 300;
  env2.listeners.get('win:focusin')?.({ target: editable, relatedTarget: null });
  check('no font-size inline override on focus', editable.style.fontSize, '');
  check('no font-size in the injected stylesheets',
    env2.attached().some((css) => /font-size/i.test(css)), false);
  check('no zoom-guard attribute is set',
    Object.prototype.hasOwnProperty.call(env2.documentElement.attributes, 'data-dsh-mux-guard-font'), false);
  env2.dispose();
  env.dispose();
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log('\nfailures:');
  for (const failure of failures) console.log(` - ${failure}`);
  process.exitCode = 1;
}
