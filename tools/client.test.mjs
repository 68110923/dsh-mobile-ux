/**
 * Deterministic test for the dsh-mobile-ux client half.
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
 * True when the scroll-lock stylesheet is currently attached.
 *
 * @param env - a harness from {@link load}.
 * @returns whether the document is locked.
 */
function lockApplied(env) {
  return env.attached().some((css) => css.includes('overscroll-behavior: none'));
}

/**
 * Builds the fake environment, loads the client bundle into it, and returns the
 * handles a test needs to drive it.
 *
 * @param {{ search?: string, viewport?: object|null, innerHeight?: number,
 *   options?: object }} options
 */
function load(options = {}) {
  const { search = '', innerHeight = 665, userAgent = 'iPhone', maxTouchPoints = 5,
    metaElement = null, deferFrames = false, options: optionOverrides = null } = options;
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
    querySelector: (selector) => (selector.includes('meta') ? metaElement : null),
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
      // Immediate by default, because most behaviour under test resolves within the
      // frame it schedules; tests that need to step frames pass `deferFrames`.
      if (!deferFrames) {
        fn();
        return 1;
      }
      frameQueue.push(fn);
      return frameQueue.length;
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
  const frameQueue = [];
  let resizeCallback = null;
  const resizeTargets = [];
  class ResizeObserver {
    constructor(callback) {
      resizeCallback = callback;
    }
    observe(target) {
      resizeTargets.push(target);
    }
    disconnect() {}
  }

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
    ResizeObserver,
    navigator: { userAgent, maxTouchPoints },
    URL,
    Math,
    JSON,
    console,
  };
  win.document = document;
  win.navigator = sandbox.navigator;
  // The reader's overrides are set before the bundle runs, exactly as the README
  // tells them to; the pack must read this property and never write it.
  if (optionOverrides !== null) win.__dshMobileUxOptions = optionOverrides;
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
    get trajectoryResizeCallback() {
      return resizeCallback;
    },
    get frameQueueLength() {
      return frameQueue.length;
    },
    /** Runs `count` animation frames, for the §4 watchdog. */
    flushFrames(count) {
      for (let i = 0; i < count; i += 1) frameQueue.splice(0).forEach((fn) => fn());
    },
    trajectoryResizeTargets: resizeTargets,
    /** The plugin's own diagnostic API, for assertions about its state. */
    keyboardOpen: () => Boolean(win.__dshMobileUx && win.__dshMobileUx.keyboardOpen()),
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
  check('closed: no scroll lock applied', lockApplied(env), false);
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
  check('open: document is scroll-locked', lockApplied(env), true);

  // A pan is compensated: the shell grows by exactly the pan so that lifting it by
  // the pan leaves the visible area filled. `visible + pan` on screen == visible.
  env.win.visualViewport.offsetTop = 60;
  env.win.visualViewport.fire('scroll');
  check('open + pan: height stays the visible height', env.root.style.height, '300px');
  check('open + pan: the pan is published for the fixed box',
    env.documentElement.style.getPropertyValue('--dsh-mux-pan'), '60px');

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
  check('closed again: lock removed', lockApplied(env), false);
  env.dispose();
  check('dispose: heights removed', env.root.style.height, '');
}

// 3. A zoomed page is still followed, not ignored.
//
// This used to assert the opposite ("zoom: shell untouched"), which encoded the
// very bug that made the composer drop behind the keyboard: iOS zooms the page
// itself for a focused editable under 16px, and ignoring that shrink meant the
// shell never followed the visible area. See the later regression block.
{
  const env = load();
  const editable = env.makeEditable(); env.document.activeElement = editable;
  env.win.visualViewport.height = 300;
  env.win.visualViewport.scale = 2;
  env.listeners.get('win:focusin')({ target: env.document.activeElement, relatedTarget: null });
  check('zoom: shell follows the visible height', env.root.style.height, '300px');
  check('zoom: document is locked', lockApplied(env), true);
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
  check('nolock: no scroll lock', lockApplied(env), false);
  env.dispose();
}
// The focus settle schedule re-asserts the height after the keyboard animation.
{
  const env = load();
  const editable = env.makeEditable(); env.document.activeElement = editable;
  env.win.visualViewport.height = 300;
  env.listeners.get('win:focusin')({ target: env.document.activeElement, relatedTarget: null });
  const delays = env.timers.map((timer) => timer.delay);
  check('focus schedules settle passes', delays, [100, 250, 500, 900, 1500]);
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

// 9b. §4: the trajectory pane is followed to its tail, but never against the reader.
//
// The regression this pins: the pane mounts parked mid-history (measured on a real
// page: scrollTop 365 of a 1013 scroll range). An intent test based on distance
// fires on mount and permanently disables the correction meant to run next — which
// is why opening 轨迹 still left the reader scrolling down for the newest rows.
{
  const env = load();
  const pane = env.makeElement('div');
  pane.setAttribute('data-trajectory-scroll', '');
  pane.scrollHeight = 1698;
  pane.clientHeight = 685;
  pane.scrollTop = 365;                        // parked mid-history, like the bug
  let lastRowScrolledIntoView = 0;
  const row = env.makeElement('tr');
  row.setAttribute('data-record-index', '812');
  row.scrollIntoView = () => {
    lastRowScrolledIntoView += 1;
    pane.scrollTop = pane.scrollHeight - pane.clientHeight;   // lands on the tail
  };
  pane.querySelectorAll = (selector) => (selector.includes('record-index') ? [row] : []);
  env.document.querySelector = (selector) => (selector.includes('trajectory') ? pane : null);
  env.document.querySelectorAll = (selector) =>
    selector.includes('trajectory') ? [pane] : [];

  // The panel opening is a resize, not an insertion: the pane lives in the DOM at
  // 0x0 while the drawer is closed.
  const resized = env.trajectoryResizeCallback;
  const mutated = env.trajectoryObserverCallback;
  check('trajectory: a resize observer is wired', typeof resized, 'function');
  check('trajectory: an insertion observer is wired', typeof mutated, 'function');
  // Real order: the pane is inserted measuring 0x0, then the drawer opens and gives
  // it a size. Both signals are needed — the insertion is what registers the resize
  // observer, the resize is what says "the panel is open now".
  pane.clientHeight = 0;
  mutated();
  check('trajectory: the pane is registered for resize', env.trajectoryResizeTargets.includes(pane), true);
  pane.clientHeight = 685;
  mutated();
  resized([{ target: pane }]);
  for (const timer of env.timers.slice()) timer.fn();
  check('trajectory: the tail is chased on open', lastRowScrolledIntoView > 0, true);
  // A real browser clamps to scrollHeight - clientHeight; the stub keeps the write.
  check('trajectory: the pane is scrolled at least to its tail',
    pane.scrollTop >= pane.scrollHeight - pane.clientHeight, true);

  // The reader scrolls up after the pack has finished: that must be respected, which
  // means the pack stops moving the pane. The stub keeps fired timers in its array,
  // so it is cleared first — otherwise the earlier passes fire a second time and the
  // count would rise for reasons that have nothing to do with intent.
  const before = lastRowScrolledIntoView;
  env.timers.length = 0;
  pane.scrollTop = 0;
  pane.fire('scroll');
  for (const timer of env.timers.slice()) timer.fn();
  check('trajectory: a deliberate scroll up is respected', lastRowScrolledIntoView, before);

  // A pane inside a closed drawer measures 0x0 and must not be mistaken for a
  // settled pane the reader has scrolled.
  const hidden = env.makeElement('div');
  hidden.setAttribute('data-trajectory-scroll', '');
  hidden.clientHeight = 0;
  hidden.scrollHeight = 0;
  env.document.querySelectorAll = (selector) =>
    selector.includes('trajectory') ? [hidden] : [];
  const beforeHidden = lastRowScrolledIntoView;
  env.timers.length = 0;
  resized([{ target: hidden }]);
  for (const timer of env.timers.slice()) timer.fn();
  check('trajectory: a zero-height pane is left alone', lastRowScrolledIntoView, beforeHidden);

  // And the important half: because a 0x0 pane is *not* recorded as handled, the
  // same pane is followed once it does get measured. Getting this wrong is what
  // consumed a pane's single attempt and left the reader scrolling.
  hidden.clientHeight = 685;
  hidden.scrollHeight = 1698;
  hidden.querySelectorAll = (selector) => (selector.includes('record-index') ? [row] : []);
  env.timers.length = 0;
  resized([{ target: hidden }]);
  for (const timer of env.timers.slice()) timer.fn();
  check('trajectory: a pane measured later is still followed',
    lastRowScrolledIntoView > beforeHidden, true);
  env.dispose();
}
// 9c. §4 can be switched off.
{
  const env = load({ search: '?dshMobileUx=notrajectory' });
  check('notrajectory: no observer', env.trajectoryObserverCallback, null);
  env.dispose();
}

// 9d. §4 is frame-driven as well as timer-driven, and it stops on request.
//
// The frames are what make it survive a virtualised list that is still measuring its
// rows: the timed passes alone can all run before the range has finished growing, and
// whichever runs last leaves the pane wherever the range happened to end. Verified in
// a real browser (iPhone metrics emulation) by opening the panel and sampling for ten
// seconds: scrollTop 1013 of max 1013, distanceFromBottom 0 throughout. That end-to-end
// check is the authority here — the stub below only pins the wiring that makes it work.
{
  const env = load({ deferFrames: true });
  const pane = env.makeElement('div');
  pane.setAttribute('data-trajectory-scroll', '');
  pane.clientHeight = 685;
  pane.scrollHeight = 1698;
  pane.scrollTop = 365;                     // parked mid-history, like the real bug
  let rowHits = 0;
  const row = env.makeElement('div');
  row.setAttribute('data-record-index', '40');
  row.scrollIntoView = () => {
    rowHits += 1;
    pane.scrollTop = pane.scrollHeight - pane.clientHeight;
  };
  pane.querySelectorAll = (selector) => (selector.includes('record-index') ? [row] : []);
  env.document.querySelector = (selector) => (selector.includes('trajectory') ? pane : null);
  env.document.querySelectorAll = (selector) =>
    selector.includes('trajectory') ? [pane] : [];

  env.trajectoryObserverCallback();
  env.trajectoryResizeCallback([{ target: pane }]);
  check('watchdog: animation frames are scheduled', env.frameQueueLength > 0, true);
  for (const timer of env.timers.slice()) timer.fn();
  check('watchdog: the timed passes already reach the tail', rowHits > 0, true);
  check('watchdog: the pane sits on its tail',
    pane.scrollHeight - pane.clientHeight - pane.scrollTop < 3, true);

  // A reader who scrolls up is never fought again, frames or no frames.
  const before = rowHits;
  env.timers.length = 0;
  pane.scrollTop = 0;
  pane.fire('scroll');
  for (const timer of env.timers.slice()) timer.fn();
  env.flushFrames(3);
  check('watchdog: a deliberate scroll up ends the follow', rowHits, before);
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

// 11. §2 must keep following while the page is zoomed.
//
// The regression this pins: the keyboard latch used to treat `scale > 1` as "the
// reader is panning, there is no keyboard here". iOS zooms the page itself when a
// focused editable is under 16px, so the latch reported "no keyboard", the shell
// stopped tracking the visible height, and the composer dropped behind the
// keyboard. It only surfaced once the pack stopped overriding the font size.
{
  const env = load();
  const editable = env.makeEditable();
  env.document.activeElement = editable;
  // Focus first, then the page zooms and the visible box shrinks — the iOS order.
  env.listeners.get('win:focusin')({ target: editable, relatedTarget: null });
  env.win.visualViewport.scale = 1.6;
  env.win.visualViewport.height = 300;
  env.win.visualViewport.fire('resize');
  check('zoomed: shell still follows the visible height', env.root.style.height, '300px');
  check('zoomed: the keyboard is still considered open', env.keyboardOpen(), true);
  check('zoomed: the document is still locked', lockApplied(env), true);

  // And a document scroll is still undone while zoomed.
  env.win.scrollY = 40;
  env.listeners.get('win:scroll')();
  check('zoomed: a stray document scroll is still reset', env.win.scrollY, 0);
  env.dispose();
}

// 12. The page scale is pinned by default: that is what stops the focus magnify.
{
  const meta = () => {
    const element = { name: 'viewport', content: 'width=device-width, initial-scale=1' };
    element.getAttribute = (key) => (key === 'content' ? element.content : null);
    element.setAttribute = (key, value) => {
      if (key === 'content') element.content = value;
    };
    return element;
  };

  const pinned = load({ metaElement: meta() });
  check('zoom: scale pinned by default',
    /maximum-scale=1/.test(pinned.document.querySelector('meta').content), true);
  check('zoom: existing settings preserved',
    /width=device-width/.test(pinned.document.querySelector('meta').content), true);
  pinned.dispose();
  check('zoom: meta restored on dispose',
    pinned.document.querySelector('meta').content, 'width=device-width, initial-scale=1');

  const free = load({ search: '?dshMobileUx=freezoom', metaElement: meta() });
  check('freezoom: scale left alone',
    /maximum-scale/.test(free.document.querySelector('meta').content), false);
  free.dispose();
}

// 13. `nokeyboard` is a real switch: no height is written and no baseline is kept.
//
// The regression this pins: the section switches used to be consulted for the
// stylesheet and for the cleanup bookkeeping but not for the writes themselves, so
// `?dshMobileUx=nokeyboard` still pinned the shell — and because the bookkeeping
// had been told the section was off, disposal restored nothing and the inline
// heights stayed on `#root`, `body` and `<html>` for the rest of the page's life.
{
  const env = load({ search: '?dshMobileUx=nokeyboard' });
  const editable = env.makeEditable();
  env.document.activeElement = editable;
  env.listeners.get('win:focusin')({ target: editable, relatedTarget: null });
  env.win.visualViewport.height = 300;
  env.win.visualViewport.fire('resize');
  check('nokeyboard: no height on #root', env.root.style.height, '');
  check('nokeyboard: no height on <html>', env.documentElement.style.height, '');
  check('nokeyboard: no height on <body>', env.body.style.height, '');
  check('nokeyboard: the document is not locked', lockApplied(env), false);
  check('nokeyboard: no settle passes are scheduled', env.timers.length, 0);
  env.dispose();
  check('nokeyboard: dispose leaves nothing behind', env.root.style.height, '');
}

// 14. The pack must read the reader's overrides and never write that property.
//
// The regression this pins: the readout API used to be published on the very
// property the README tells readers to configure (`window.__dshMobileUx`), so the
// first load consumed the overrides and replaced them with the API — after which
// every documented override was silently ignored.
{
  const env = load({ options: { keyboard: false } });
  check('options: keyboard override disables the height writer', env.root.style.height, '');
  check('options: the override property is still the reader\'s',
    env.win.__dshMobileUxOptions?.keyboard, false);
  check('options: the readout API lives on its own property',
    typeof env.win.__dshMobileUx?.metrics, 'function');
  check('options: the API did not take over the override property',
    typeof env.win.__dshMobileUx.keyboard, 'undefined');
  env.dispose();
  check('options: the override survives disposal', env.win.__dshMobileUxOptions?.keyboard, false);
}

// 15. A keep-list is exclusive, and the readout is not part of it.
//
// `?dshMobileUx=tap,hud` reads like "tap plus the readout"; it is really "only the
// tap section, and show the readout". The readout must never cost a section.
{
  const tapOnly = load({ search: '?dshMobileUx=tap' });
  const editable = tapOnly.makeEditable();
  tapOnly.document.activeElement = editable;
  tapOnly.listeners.get('win:focusin')({ target: editable, relatedTarget: null });
  tapOnly.win.visualViewport.height = 300;
  tapOnly.win.visualViewport.fire('resize');
  check('keep-list: a named section disables the others', tapOnly.root.style.height, '');
  check('keep-list: the tap listener is installed', tapOnly.listeners.has('win:pointerup'), true);
  check('keep-list: no trajectory observer', tapOnly.trajectoryObserverCallback, null);
  tapOnly.dispose();

  const withHud = load({ search: '?dshMobileUx=tap,hud' });
  check('keep-list: hud does not turn the keyboard section off',
    withHud.document.querySelector('[data-dsh-mobile-ux-hud]') !== null ||
      withHud.body.children.some((child) => child.hasAttribute('data-dsh-mobile-ux-hud')), true);
  withHud.dispose();
}

// 16. Disposal removes the scroll lock, which is a stylesheet and not an inline style.
//
// The regression this pins: disposal restored every inline property it had written
// but never removed `LOCK_STYLES`, so disabling the pack with the keyboard open left
// `#root` fixed and the document unscrollable until a full page reload.
{
  const env = load();
  const editable = env.makeEditable();
  env.document.activeElement = editable;
  env.listeners.get('win:focusin')({ target: editable, relatedTarget: null });
  env.win.visualViewport.height = 300;
  env.win.visualViewport.fire('resize');
  check('dispose: the lock is on while the keyboard is open', lockApplied(env), true);
  env.dispose();
  check('dispose: the lock is removed', lockApplied(env), false);
  check('dispose: the height is restored', env.root.style.height, '');
}

// 17. Reopening a drawer at the same height still re-follows the pane.
//
// The regression this pins: `noteTrajectoryPane` returned early whenever the pane's
// height matched the last one it had measured, but a hidden pane (measured 0x0) was
// never recorded. Closing and reopening the drawer at the same height therefore
// looked like "no change" and the panel stayed parked mid-history.
{
  const env = load({ deferFrames: true });
  const pane = env.makeElement('div');
  pane.setAttribute('data-trajectory-scroll', '');
  pane.clientHeight = 685;
  pane.scrollHeight = 1698;
  pane.scrollTop = 365;
  let rowHits = 0;
  const row = env.makeElement('div');
  row.setAttribute('data-record-index', '7');
  row.scrollIntoView = () => {
    rowHits += 1;
    pane.scrollTop = pane.scrollHeight - pane.clientHeight;
  };
  pane.querySelectorAll = (selector) => (selector.includes('record-index') ? [row] : []);
  env.document.querySelector = (selector) => (selector.includes('trajectory') ? pane : null);
  env.document.querySelectorAll = (selector) =>
    selector.includes('trajectory') ? [pane] : [];

  env.trajectoryObserverCallback();
  env.trajectoryResizeCallback([{ target: pane }]);
  for (const timer of env.timers.slice()) timer.fn();
  const firstOpen = rowHits;

  // The drawer closes (the pane measures 0x0) and reopens at the same height.
  pane.clientHeight = 0;
  env.trajectoryResizeCallback([{ target: pane }]);
  pane.clientHeight = 685;
  pane.scrollTop = 365;
  env.timers.length = 0;
  env.trajectoryResizeCallback([{ target: pane }]);
  check('reopen: the tail is chased again', env.timers.length > 0, true);
  for (const timer of env.timers.slice()) timer.fn();
  check('reopen: the panel reaches its tail again', rowHits > firstOpen, true);
  env.dispose();
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log('\nfailures:');
  for (const failure of failures) console.log(` - ${failure}`);
  process.exitCode = 1;
}
