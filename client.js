window.__ModuleLoader__.load({
  id: 'dsh-mobile-ux',
  factory() {

    /**
     * The tallest shell this pack is willing to write. Only a safety net for a
     * broken viewport report; never reached on a real phone.
     */
    const MAX_SHELL_HEIGHT = 5000;

    /**
     * How much shorter than the last keyboard-free height the visible area must
     * get before an overlay keyboard is assumed. A collapsing address bar moves
     * the viewport by tens of pixels; a keyboard by hundreds.
     */
    const MIN_KEYBOARD_HEIGHT = 80;

    /** Pinch-zoom threshold; above it the user is panning on purpose. */
    const MAX_EFFECTIVE_SCALE = 1.01;

    /** Width at or below which the narrow-screen layout applies. */
    const NARROW_QUERY = '(max-width: 700px)';

    /** The size a focused editable is raised to; see §2. */
    const FOCUS_FONT_SIZE = '17px';

    /** How long a tap on a session row suppresses rename; see §3. */
    const TAP_RENAME_SUPPRESS_MS = 600;

    /**
     * The `data-row-key` prefix the shell gives an openable session row.
     *
     * Measured on the live shell: sessions are `session:session-<uuid>`, and the
     * project rows that group them are `workspace:<uuid>`.
     */
    const SESSION_ROW_PREFIX = 'session:';

    /** The CSS custom property other packages may read as the live shell height. */
    const HEIGHT_VARIABLE = '--dsh-app-visual-height';

    // ---------------------------------------------------------------- styles --

    /**
     * Documents the custom property written by §2.
     */
    const HEIGHT_STYLES = `:root { ${HEIGHT_VARIABLE}: 100%; }\n`;

    /**
     * The font guard of §2.
     *
     * Sizing alone loses the cascade: the composer declares 14px with a single
     * attribute selector and comes later, so a plain `font-size: 17px` measured as
     * 14px on the live page. Two things make this rule win:
     *
     * - `!important` puts the declaration above the composer's normal one.
     * - The `[class*="_"]` head arms a descendant rule, which outranks a compound
     *   `[contenteditable="true"][class*="_input"]` selector.
     *
     * It has to win *before* the tap, not on `focusin`: iOS decides whether to
     * zoom when focus moves, so an inline override written inside the focus
     * handler is already too late for the first tap of a session. A stylesheet
     * applies from load, which removes that first-tap window entirely.
     *
     * Scoped to coarse pointers, so a desktop window keeps its own sizing.
     */
    const ZOOM_GUARD_STYLES =
      '@media (hover: none) and (pointer: coarse) {\n' +
      '  [contenteditable=""], [contenteditable="true"],\n' +
      '  textarea:not([disabled]),\n' +
      '  input:not([disabled]):not([type]),\n' +
      '  input[type="text"]:not([disabled]),\n' +
      '  input[type="number"]:not([disabled]),\n' +
      '  input[type="search"]:not([disabled]),\n' +
      '  input[type="url"]:not([disabled]):not([readonly]),\n' +
      '  input[type="email"]:not([disabled]):not([readonly]),\n' +
      '  input[type="password"]:not([disabled]) {\n' +
      '    font-size: 17px !important;\n' +
      '  }\n' +
      '  [class*="_"] [contenteditable=""], [class*="_"] [contenteditable="true"],\n' +
      '  [class*="_"] textarea:not([disabled]) {\n' +
      '    font-size: 17px !important;\n' +
      '  }\n' +
      '}\n';

    /**
     * Locks the document itself while an overlay keyboard is up (§2).
     *
     * On iOS the pan of `visualViewport.offsetTop` and the scroll of the layout
     * viewport are two views of the same motion. A document that can scroll gives
     * the browser a way to move the whole shell, and that motion is what carries
     * the composer off-screen. `overscroll-behavior: none` also stops the
     * rubber-band scroll that can fire while the keyboard animates in, before the
     * follower below has the right height.
     */
    const LOCK_STYLES =
      'html, body {\n' +
      '  overflow: hidden;\n' +
      '  overscroll-behavior: none;\n' +
      '}\n';

    // ------------------------------------------------------------ §1 styles --

    /**
     * Narrow-screen layout fixes (<= 700px).
     *
     * Adapted from `dsh-web-mobile-fix` by AcidGr (MIT):
     * https://github.com/AcidGr/dsh-web-mobile-fix
     *
     * Four repairs, all inside the media query below, all anchored on the shell's
     * stable slot/class hooks:
     *
     * 1. The settings dialog becomes a full-screen column with a horizontally
     *    scrollable tab row. It also fixes the stock tab-label bug where the label
     *    is `flex: 1` with `flex-basis: 0` inside a content-sized button, which
     *    collapses the text to zero width.
     * 2. The composer bar stops wrapping: the tool cluster may shrink, the send
     *    button may not.
     * 3. The expanded sidebar floats over the conversation instead of squeezing
     *    it. The grid keeps its 56px rail in both states and the drawer overflows
     *    its column. Deliberately no transform: a transformed column would become
     *    the containing block for `position: fixed` descendants, and the settings
     *    dialog renders inside the sidebar DOM.
     * 4. A scrim over the conversation while the drawer is open.
     */
    const LAYOUT_STYLES =
'/* ── mobile UI fixes (≤700px) ── */\n' +
      '@media (max-width: 700px) {\n' +
      '  /* 1. Settings panel: stacked full-screen layout */\n' +
      '  [role="dialog"][aria-modal="true"][aria-labelledby] {\n' +
      '    flex-direction: column !important;\n' +
      '    width: 100vw !important;\n' +
      '    max-width: 100vw !important;\n' +
      '    height: 100vh !important;\n' +
      '    height: 100dvh !important;\n' +
      '    max-height: 100vh !important;\n' +
      '    max-height: 100dvh !important;\n' +
      '    border-radius: 0 !important;\n' +
      '  }\n' +
      '  [role="dialog"][aria-modal="true"][aria-labelledby] > nav {\n' +
      '    flex: none !important;\n' +
      '    flex-direction: column !important;\n' +
      '    width: 100% !important;\n' +
      '    box-sizing: border-box !important;\n' +
      '    padding: 12px 12px 6px !important;\n' +
      '    gap: 8px !important;\n' +
      '  }\n' +
      '  [role="dialog"][aria-modal="true"][aria-labelledby] > nav > div:last-child {\n' +
      '    flex-direction: row !important;\n' +
      '    flex-wrap: nowrap !important;\n' +
      '    gap: 6px !important;\n' +
      '    overflow-x: auto !important;\n' +
      '  }\n' +
      '  [role="dialog"][aria-modal="true"][aria-labelledby] > nav button {\n' +
      '    flex: 0 0 auto !important;\n' +
      '    height: 36px !important;\n' +
      '    padding: 6px 12px !important;\n' +
      '    gap: 6px !important;\n' +
      '    justify-content: center !important;\n' +
      '  }\n' +
      '  /* Keep every tab label visible: the stock label is flex:1 with\n' +
      '        flex-basis 0, which collapses to zero width inside a content-sized\n' +
      '        button; let the text drive the button width instead (0 1 auto). */\n' +
      '  [role="dialog"][aria-modal="true"][aria-labelledby] > nav button > :last-child {\n' +
      '    flex: 0 1 auto !important;\n' +
      '    min-width: 0 !important;\n' +
      '  }\n' +
      '  [role="dialog"][aria-modal="true"][aria-labelledby] > nav button[aria-current="true"] {\n' +
      '    background: var(--dsw-specific-sidebar-nav-item-active, #e8ebf1) !important;\n' +
      '  }\n' +
      '  [role="dialog"][aria-modal="true"][aria-labelledby] > nav + div {\n' +
      '    flex: 1 1 0 !important;\n' +
      '    min-height: 0 !important;\n' +
      '  }\n' +
      '  [role="dialog"][aria-modal="true"][aria-labelledby] > nav + div > div:first-child {\n' +
      '    padding: 12px 12px 6px !important;\n' +
      '  }\n' +
      '  [role="dialog"][aria-modal="true"][aria-labelledby] > nav + div > div:last-child {\n' +
      '    padding: 0 16px 16px !important;\n' +
      '  }\n' +
      '  /* 2. Composer bar: keep all tools and actions on a single row without wrapping */\n' +
      '  [data-composer-seat], [data-slot="conversation.composer.bar"] {\n' +
      '    --dsh-composer-side-clearance: 8px !important;\n' +
      '  }\n' +
      '  [data-slot="conversation.composer.bar"] [class*="_row"] {\n' +
      '    flex-wrap: nowrap !important;\n' +
      '    gap: 6px !important;\n' +
      '    padding: 2px 6px 6px !important;\n' +
      '    align-items: center !important;\n' +
      '  }\n' +
      '  [data-slot="conversation.composer.bar"] [class*="_tools"],\n' +
      '  [data-slot="conversation.composer.bar"] [class*="_modes"],\n' +
      '  [data-slot="conversation.composer.bar"] [class*="_trailing"] {\n' +
      '    gap: 6px !important;\n' +
      '  }\n' +
      '  [data-slot="conversation.composer.bar"] [class*="_tools"] {\n' +
      '    min-width: 0 !important;\n' +
      '    flex-shrink: 1 !important;\n' +
      '  }\n' +
      '  [data-slot="conversation.composer.bar"] [class*="_trailing"] {\n' +
      '    flex-shrink: 0 !important;\n' +
      '  }\n' +
      '  [data-slot="conversation.composer.bar"] [class*="_select"] {\n' +
      '    max-width: 96px !important;\n' +
      '    padding: 0 16px 0 4px !important;\n' +
      '    text-overflow: ellipsis !important;\n' +
      '  }\n' +
      '  [data-slot="conversation.input.model"] > div > button {\n' +
      '    max-width: 120px !important;\n' +
      '    padding: 0 4px !important;\n' +
      '    gap: 2px !important;\n' +
      '  }\n' +
      '  [data-slot="conversation.input.model"] > div > button > span {\n' +
      '    overflow: hidden !important;\n' +
      '    text-overflow: ellipsis !important;\n' +
      '    white-space: nowrap !important;\n' +
      '  }\n' +
      '  /* 3. Left sidebar on narrow screens: keep the grid fixed at 56px rail in\n' +
      '        BOTH states (center column never moves or squeezes) and let the\n' +
      '        expanded sidebar OVERFLOW its 56px column to float over the center\n' +
      '        (z-index 60 on the grid item) instead of positioning it absolutely.\n' +
      '        No transform is applied: a transform on the sidebar column would\n' +
      '        become the containing block for its position:fixed descendants —\n' +
      '        the settings modal renders inside the sidebar DOM and would be\n' +
      '        trapped/positioned relative to the drawer instead of the viewport.\n' +
      '        The product\'s own wide-sidebar interactions (rail buttons, search\n' +
      '        focus, settings dialog) keep working natively, and the stock\n' +
      '        wide-content fade-in remains the only animation. */\n' +
      '  [class*="_frame"] {\n' +
      '    grid-template-columns: 56px minmax(0, 1fr) 0 !important;\n' +
      '  }\n' +
      '  [class*="_frame"] [class*="_handle"] {\n' +
      '    display: none !important;\n' +
      '  }\n' +
      '  [class*="_frame"]:not([data-sidebar-collapsed]) [class*="_sidebarCol"] {\n' +
      '    overflow: visible !important;\n' +
      '    z-index: 60 !important;\n' +
      '  }\n' +
      '  [class*="_frame"]:not([data-sidebar-collapsed]) [class*="_sidebarCol"] > div {\n' +
      '    box-shadow: 4px 0 24px rgba(0, 0, 0, 0.22) !important;\n' +
      '    position: relative !important;\n' +
      '    z-index: 61 !important;\n' +
      '  }\n' +
      '  [class*="_frame"]:not([data-sidebar-collapsed]) [class*="_centerCol"] {\n' +
      '    position: relative !important;\n' +
      '  }\n' +
      '  [class*="_frame"]:not([data-sidebar-collapsed]) [class*="_centerCol"]::before {\n' +
      '    content: "" !important;\n' +
      '    position: absolute !important;\n' +
      '    inset: 0 !important;\n' +
      '    background: rgba(0, 0, 0, 0.3) !important;\n' +
      '    z-index: 50 !important;\n' +
      '    pointer-events: none !important;\n' +
      '  }\n' +
      '}\n'

    // --------------------------------------------------------------- helpers --

    /**
     * Resolves the pack's section switches.
     *
     * `keep`/`drop` parsing keeps the URL readable: `?dshMobileUx=tap` asks for
     * one section, `?dshMobileUx=nokeyboard` removes one, and everything else
     * keeps its default. Programmatic overrides win over the URL.
     *
     * @returns {{ layout: boolean, keyboard: boolean, tap: boolean, hud: boolean,
     *   lock: boolean, font: boolean, meta: boolean, bottom: boolean }}
     */
    function readPackSwitches() {
      const raw = new URL(window.location.href).searchParams.get('dshMobileUx');
      const parts = (raw ?? '').split(',').map((part) => part.trim()).filter(Boolean);
      const off = parts.includes('0') || parts.includes('off');
      const keep = parts.filter(
        (part) => !part.startsWith('no') && !['0', 'off', 'hud', 'lock', 'font', 'meta',
          'bottom'].includes(part),
      );
      /**
       * @param name - switch name, also the `no<name>` spelling.
       * @param fallback - value when the URL says nothing.
       * @returns the resolved switch.
       */
      const pick = (name, fallback) => {
        if (off) return false;
        if (window.__dshMobileUx?.[name] !== undefined) return Boolean(window.__dshMobileUx[name]);
        if (parts.includes(`no${name}`)) return false;
        if (keep.length > 0) return keep.includes(name);
        return fallback;
      };
      const optIn = (name) => {
        if (off) return false;
        if (window.__dshMobileUx?.[name] !== undefined) return Boolean(window.__dshMobileUx[name]);
        if (parts.includes(`no${name}`)) return false;
        return parts.includes(name);
      };
      return {
        layout: pick('layout', true),
        keyboard: pick('keyboard', true),
        tap: pick('tap', true),
        // `?dshMobileUx=keepdrawer` leaves the drawer open after a tap, for
        // switching through several sessions in a row.
        closeDrawer: pick('closeDrawer', true),
        hud: optIn('hud'),
        lock: pick('lock', true),
        font: pick('font', true),
        meta: optIn('meta'),
        bottom: optIn('bottom'),
      };
    }

    /**
     * @returns current geometry, for the HUD and the console API.
     */
    function readMetrics() {
      const viewport = window.visualViewport ?? null;
      const root = document.getElementById('root');
      return {
        /** Visible height reported by the browser, or the window height. */
        visualHeight: viewport === null ? window.innerHeight : viewport.height,
        /** Full layout viewport height; does not shrink for an overlay keyboard. */
        layoutHeight: window.innerHeight,
        /** How far the browser panned its own visual viewport. */
        offsetTop: viewport === null ? 0 : viewport.offsetTop,
        /** Effective zoom factor. */
        scale: viewport === null ? 1 : viewport.scale,
        /** Page scroll position, in the layout viewport. */
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        /** Actual rendered height of the app root. */
        rootHeight: root === null ? 0 : root.clientHeight,
        /** Height currently written by this plugin. */
        appliedHeight: document.documentElement.style.height,
        /** Scroll height of the document, i.e. how far it could scroll. */
        documentScrollHeight: document.documentElement.scrollHeight,
      };
    }

    /**
     * The "keyboard is open" latch.
     *
     * A stateless check such as `innerHeight - visualViewport.height > 80` is not
     * enough: on the phone that reported this bug both numbers can stay at the
     * same value while the keyboard is up, so the difference never grows and the
     * shell is never adjusted at all. Focus is therefore the primary signal — a
     * phone only overlays a keyboard for a focused editable field — and the
     * shrink of the visible area is the confirmation.
     *
     * `referenceHeight` tracks the tallest keyboard-free visible height seen so
     * far, which doubles as the orientation-change reset: a rotated phone reports
     * a taller or shorter baseline and the next comparison simply follows.
     */
    const keyboard = {
      /** Tallest keyboard-free visible height seen so far. */
      referenceHeight: 0,
      /** Visible height observed on the previous check. */
      lastHeight: 0,
      /** True when the current focus opened (or kept) a keyboard. */
      open: false,
    };

    /** @returns true on the phone-like surfaces this bundle targets. */
    function touchDevice() {
      const viewport = window.visualViewport;
      if (viewport === undefined) return false;
      return (
        window.matchMedia('(hover: none) and (pointer: coarse)').matches ||
        /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
      );
    }

    /**
     * Editable elements the keyboard can open for.
     *
     * Attribute-based rather than class-based so it survives a composer rebuild,
     * with the non-text input types excluded because they never open a keyboard.
     */
    const EDITABLE_SELECTOR =
      '[contenteditable=""], [contenteditable="true"], textarea:not([disabled]), ' +
      'input:not([disabled]):not([readonly]):not([type="checkbox"]):not([type="radio"])' +
      ':not([type="button"]):not([type="submit"]):not([type="range"])';

    /**
     * The editable element currently holding the raised font size, if any.
     *
     * Focus is tracked through focusin/focusout rather than by reading
     * `document.activeElement`: iOS moves the active element around while the
     * keyboard animates and around deletions, and a latch that depends on the
     * DOM's current idea of focus drops out mid-session — which silently switches
     * the height follower and the scroll lock off.
     */
    let focusedEditable = null;
    /** Removes the inline font-size override from {@link focusedEditable}. */
    let restoreFontSize = () => {};

    /** @returns true when an editable field holds focus, per focusin/focusout. */
    function editableFocused() {
      return focusedEditable !== null;
    }

    /**
     * Raises one editable element above the platform's focus-zoom threshold.
     *
     * The stylesheet rule is the primary path and normally wins on its own. This
     * inline copy is the fallback for a build where the composer's own `font-size`
     * outranks it, and it runs from a capture-phase `pointerdown`/`touchstart` as
     * well as from `focusin`, so the size is already in place when the platform
     * evaluates the zoom.
     *
     * @param element - the element receiving focus or the touch.
     */
    function raiseFontSize(element) {
      if (element === null || element.style === undefined) return;
      restoreFontSize();
      const previous = element.style.fontSize;
      element.style.fontSize = FOCUS_FONT_SIZE;
      focusedEditable = element;
      restoreFontSize = () => {
        if (previous === '') element.style.removeProperty('font-size');
        else element.style.fontSize = previous;
        focusedEditable = null;
        restoreFontSize = () => {};
      };
    }

    /**
     * Refreshes the keyboard latch from focus plus the visible height.
     *
     * @returns true when an on-screen keyboard is (very likely) open.
     */
    function refreshKeyboardState() {
      const viewport = window.visualViewport ?? null;
      const visible = viewport === null ? window.innerHeight : viewport.height;
      const zoomed = viewport !== null && viewport.scale > MAX_EFFECTIVE_SCALE;
      const previous = keyboard.lastHeight;
      keyboard.lastHeight = visible;
      if (previous === 0 || visible > keyboard.referenceHeight) keyboard.referenceHeight = visible;
      // While nothing editable is focused, a changed height is a window resize or
      // a rotation, not a keyboard: adopt it as the new baseline.
      if (!editableFocused() && Math.abs(visible - previous) > MIN_KEYBOARD_HEIGHT) {
        keyboard.referenceHeight = visible;
      }
      if (!editableFocused() || zoomed || !touchDevice()) {
        keyboard.open = false;
        return false;
      }
      keyboard.open = visible < keyboard.referenceHeight - MIN_KEYBOARD_HEIGHT;
      return keyboard.open;
    }

    /** @returns true when the on-screen keyboard is (very likely) open. */
    function keyboardOpen() {
      return keyboard.open;
    }

    /**
     * Builds the optional on-screen readout. `?dshMobileUx=hud` requests it.
     *
     * The readout deliberately follows the *visual* viewport instead of trusting
     * `position: fixed`: an overlay keyboard moves the visual viewport without
     * scrolling the document, which is exactly the state under investigation, and
     * a fixed box in the layout viewport would slide out of sight in it.
     *
     * @returns {{ update: (text: string) => void, remove: () => void }}
     */
    function createHud() {
      const element = document.createElement('div');
      element.setAttribute('data-dsh-mobile-ux-hud', '');
      element.style.cssText = [
        'position:fixed',
        'left:0',
        'top:0',
        'z-index:2147483647',
        'max-width:100vw',
        'max-height:50vh',
        'overflow:hidden',
        'margin:0',
        'padding:4px 6px',
        'font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace',
        'white-space:pre-wrap',
        'color:#0f0',
        'background:rgba(0,0,0,.82)',
        'pointer-events:none',
      ].join(';');
      (document.body ?? document.documentElement).append(element);

      /** Keeps the readout glued to the visible area. */
      const follow = () => {
        const viewport = window.visualViewport ?? null;
        const x = viewport === null ? 0 : viewport.offsetLeft;
        const y = viewport === null ? 0 : viewport.offsetTop;
        element.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      };
      follow();
      window.visualViewport?.addEventListener('resize', follow);
      window.visualViewport?.addEventListener('scroll', follow);

      return {
        update: (text) => {
          element.textContent = text;
          follow();
        },
        remove: () => {
          window.visualViewport?.removeEventListener('resize', follow);
          window.visualViewport?.removeEventListener('scroll', follow);
          element.remove();
        },
      };
    }


    /**
     * Installs the pack.
     *
     * Every section is optional, and a pack with nothing enabled writes nothing
     * and installs no listener, so the shipped shell behaviour is untouched.
     *
     * @returns {() => void} Cleanup removing every listener and style this pack
     *   wrote, and restoring every style property it overwrote.
     */
    function install(context) {
      const doc = document;
      const root = doc.getElementById('root');
      if (root === null) return () => {};

      const switches = readPackSwitches();
      if (!switches.layout && !switches.keyboard && !switches.tap) return () => {};

      /** Style elements this pack owns, so disposal removes exactly them. */
      const injectedStyles = [];
      /**
       * Appends one stylesheet and remembers it.
       *
       * @param css - the stylesheet text.
       * @returns {HTMLStyleElement} the created element.
       */
      const addStyles = (css) => {
        const element = doc.createElement('style');
        element.textContent = css;
        (doc.head ?? doc.documentElement).append(element);
        injectedStyles.push(element);
        return element;
      };

      /**
       * Optionally pins `maximum-scale` so the platform cannot zoom on focus.
       *
       * @returns {() => void} restores the previous content attribute.
       */
      const applyViewportMeta = () => {
        if (!switches.meta) return () => {};
        const meta = doc.querySelector('meta[name="viewport"]');
        if (meta === null) return () => {};
        const previousContent = meta.getAttribute('content') ?? '';
        const content = previousContent
          .replace(/(maximum-scale|user-scalable)=[^,]*/gi, '')
          .replace(/,\s*,/g, ',')
          .replace(/^,|,$/g, '')
          .trim();
        meta.setAttribute(
          'content',
          `${content}${content === '' ? '' : ', '}maximum-scale=1, user-scalable=no`,
        );
        return () => {
          meta.setAttribute('content', previousContent);
        };
      };
      const restoreViewportMeta = applyViewportMeta();

      // NOTE: this must NOT go through a `styles` service. The client runtime
      // provides no such service, and cordis' Context is a Proxy that THROWS on
      // any property that is neither provided nor declared in `inject`
      // (cordis/lib/index.js: `cannot get property "..." without inject`).
      // Listing `styles` in `inject` would leave the plugin `pending` forever.
      if (switches.layout) addStyles(LAYOUT_STYLES);
      if (switches.keyboard && switches.font) addStyles(ZOOM_GUARD_STYLES);
      const lockElement = doc.createElement('style');
      lockElement.textContent = LOCK_STYLES;
      // The scroll lock is appended and removed with the keyboard; a <style>
      // element that is not in the document applies nothing.
      const setScrollLock = (wanted) => {
        const parent = doc.head ?? doc.documentElement;
        if (wanted) {
          if (lockElement.parentNode === null) parent.append(lockElement);
        } else {
          lockElement.remove();
        }
      };

      const documentElement = doc.documentElement;
      const body = doc.body;
      /**
       * Inline styles this module overwrites, so disposal restores them exactly.
       *
       * A plain array, not a Map: `height` is written on three different elements
       * and an element-keyed map would silently keep only the last one, leaving
       * an inline height behind on dispose.
       */
      const previous = [];
      const ownedStyles = switches.keyboard
        ? [
            [documentElement, HEIGHT_VARIABLE],
            [documentElement, 'height'],
            [body, 'height'],
            [root, 'height'],
          ]
        : [];
      for (const [element, property] of ownedStyles) {
        previous.push({
          element,
          property,
          value: element.style.getPropertyValue(property),
          priority: element.style.getPropertyPriority(property),
        });
      }

      /** Until when a follow-up tap on a session row must not rename (§3). */
      let suppressRowTapUntil = 0;
      /**
       * The layout service, looked up without declaring `inject` (§1).
       *
       * The guarded client context throws on undeclared property access, so the
       * optional lookup and the try/catch are both load-bearing.
       */
      let layoutService = null;
      try {
        layoutService = context?.get?.('layout') ?? null;
      } catch {
        layoutService = null;
      }

      /** Last height actually written, so redundant events perform no writes. */
      let applied = null;
      /** Frame guard shared by the caret/viewport settle path. */
      let frame = null;
      /** True while the document-level scroll lock is in force. */
      let locked = false;
      const history = [];
      const hud = switches.hud ? createHud() : null;

      /**
       * The height the shell should have right now.
       *
       * Keyboard open → the visible area, floored. Two mistakes are baked into
       * this one decision, both learned on a real phone:
       *
       * 1. Rounding up (`Math.round`) makes the document one pixel scrollable and
       *    hands iOS back the ability to scroll the composer away, so the pixel is
       *    floored.
       * 2. *Adding* `offsetTop` to follow the pan makes the shell taller than the
       *    visible area, and the excess shows up as a band of empty space between
       *    the composer and the keyboard. Compensation for a pan must shrink the
       *    shell, so when it is enabled at all it subtracts, and it can never grow
       *    the shell past the visible height.
       *
       * Keyboard closed → the layout height, which is what `height: 100%` already
       * resolves to, so a desktop window resize or a pinch-zoom pan is untouched.
       *
       * @returns {number} shell height in CSS pixels.
       */
      const targetHeight = () => {
        if (!keyboardOpen()) return window.innerHeight;
        const viewport = window.visualViewport ?? null;
        const visible = viewport === null ? window.innerHeight : viewport.height;
        const pan = viewport === null ? 0 : Math.max(0, viewport.offsetTop);
        const compensated = switches.bottom ? visible - pan : visible;
        return Math.min(MAX_SHELL_HEIGHT, Math.max(1, Math.floor(compensated)));
      };
      /**
       * Pins the shell to {@link targetHeight}.
       *
       * Always writes, even when the number is unchanged: an identical height does
       * not imply an identical document, because iOS can drop the document's own
       * scroll offset while the keyboard settles, and only a fresh write (with the
       * scroll reset in the caller) collapses that leftover offset.
       */
      const applyHeight = () => {
        const value = `${targetHeight()}px`;
        applied = value;
        documentElement.style.height = value;
        body.style.height = value;
        root.style.height = value;
        documentElement.style.setProperty(HEIGHT_VARIABLE, value);
      };

      /**
       * Undoes a document scroll that iOS performed to follow the caret. Only a
       * pinch-zoomed visual viewport may stay scrolled, because there the user
       * is panning on purpose.
       *
       * @returns true when a non-zero scroll position was found.
       */
      const resetDocumentScroll = () => {
        if (window.scrollX === 0 && window.scrollY === 0) return false;
        const scale = window.visualViewport?.scale ?? 1;
        if (scale > MAX_EFFECTIVE_SCALE) return false;
        // No resetting guard is needed: a scroll event caused by this call sees
        // scrollX/scrollY back at 0 and returns immediately.
        window.scrollTo(0, 0);
        return true;
      };

      /** Records an interesting change, so a phone screenshot tells the story. */
      const note = (reason) => {
        const metrics = readMetrics();
        const ref = Math.round(keyboard.referenceHeight);
        history.push(
          `#${history.length + 1} ${reason}` +
            ` vvH=${Math.round(metrics.visualHeight)} ref=${ref} lvh=${metrics.layoutHeight}` +
            ` root=${metrics.rootHeight} wrote=${metrics.appliedHeight || '-'}` +
            ` y=${metrics.scrollY} oT=${Math.round(metrics.offsetTop)}` +
            ` docH=${metrics.documentScrollHeight}`,
        );
        if (history.length > 40) history.shift();
        // Keep the readout present even when nothing has gone wrong yet: the
        // interesting moment is a state the user is looking at, not an event.
        report(metrics, ref);
      };

      /** Draws the optional readout for the state the user is looking at. */
      const report = (metrics, ref) => {
        if (hud === null) return;
        const switches =
          `kb=${keyboardOpen() ? 1 : 0} focus=${editableFocused() ? 1 : 0}` +
          ` lock=${locked ? 1 : 0} bot=${switches.bottom ? 1 : 0}` +
          ` font=${switches.font ? 17 : 0} meta=${switches.meta ? 1 : 0}`;
        const position =
          `y=${metrics.scrollY} oT=${Math.round(metrics.offsetTop)}` +
          ` s=${metrics.scale.toFixed(2)} docH=${metrics.documentScrollHeight}`;
        hud.update(
          [
            'dsh-mobile-ux',
            `vvH=${Math.round(metrics.visualHeight)} ref=${ref} lvh=${metrics.layoutHeight}`,
            `root=${metrics.rootHeight} wrote=${metrics.appliedHeight || '-'}`,
            switches,
            position,
            `win=${window.innerWidth}x${window.innerHeight}` +
              ` scr=${window.screen?.width ?? '?'}x${window.screen?.height ?? '?'}`,
            ...history.slice(-6),
          ].join('\n'),
        );
      };

      /**
       * Keeps the document-level scroll lock in step with the keyboard.
       *
       * This is what stops iOS from moving the shell: while the lock is on, the
       * layout viewport cannot scroll, so the only thing that can move is the
       * visual viewport — which `targetHeight` follows.
       */
      const toggleScrollLock = () => {
        const wanted = switches.lock && keyboard.open;
        if (wanted === locked) return;
        locked = wanted;
        setScrollLock(locked);
      };

      /**
       * A viewport/caret event. Runs synchronously on purpose: deferring to an
       * animation frame leaves the old height in place for one frame, and that
       * is exactly the window in which iOS scrolls the page after the caret
       * moved.
       */
      const onViewportChange = (reason) => {
        // Refresh the latch first: `applyHeight` reads `keyboardOpen()`.
        const wasOpen = keyboard.open;
        refreshKeyboardState();
        toggleScrollLock();
        applyHeight();
        if (wasOpen !== keyboard.open) note(`kb=${keyboard.open ? 'open' : 'closed'}(${reason})`);
        if (resetDocumentScroll()) note(`reset(${reason})`);
        // The readout must describe the state the user is looking at, not only
        // the events that happened to be interesting.
        report(readMetrics(), Math.round(keyboard.referenceHeight));
      };

      /** Coalesces caret/focus events that can arrive several times per keystroke. */
      const settle = (reason) => {
        if (frame !== null) return;
        frame = window.requestAnimationFrame(() => {
          frame = null;
          onViewportChange(reason);
        });
      };

      /**
       * Re-asserts the height on a fixed schedule after the keyboard changes
       * state.
       *
       * Why a schedule and not events: on the reporting phone the keyboard
       * sometimes finishes animating without any viewport event arriving
       * afterwards, so the last measurement is taken while the keyboard is still
       * moving and its height is stale. That stale value leaves a band of empty
       * space between the composer and the keyboard which no further input ever
       * clears. The passes live inside the keyboard animation window
       * (100/250/500/900 ms), where a handful of extra style writes cost nothing.
       */
      const settlePassTimers = [];
      const scheduleSettlePasses = () => {
        while (settlePassTimers.length > 0) window.clearTimeout(settlePassTimers.pop());
        for (const delay of [100, 250, 500, 900]) {
          settlePassTimers.push(
            window.setTimeout(() => {
              onViewportChange(`settle+${delay}`);
            }, delay),
          );
        }
      };
      const cancelSettlePasses = () => {
        while (settlePassTimers.length > 0) window.clearTimeout(settlePassTimers.pop());
      };

      const handleViewport = () => onViewportChange('viewport');
      const handleWindow = () => onViewportChange('window');
      /**
       * Opens a session from a single tap, and stops a second fast tap from
       * being read as a rename (§3).
       *
       * The shell's session row is a `[role="treeitem"]` whose own click handler
       * opens the session, while the *title span inside it* carries the
       * double-click handler that starts a rename. On a phone that means the
       * first tap's click is held back by the platform's double-tap window, and a
       * second tap during that window is delivered as a double-click — the rename
       * the user never asked for.
       *
       * The fix: commit the tap on `pointerup` (before any double-click can be
       * assembled) by re-dispatching the row's own click, then swallow the
       * follow-up events at the capture phase for a short window. The product's
       * handler does the actual work, so nothing about session semantics is
       * reimplemented here, and desktop keeps its double-click rename because the
       * whole section is gated on a coarse pointer.
       *
       * @param event - the pointerup/touchend that ended a tap.
       */
      const onSessionTap = (event) => {
        if (!touchDevice() || !window.matchMedia(NARROW_QUERY).matches) return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest('button, input, textarea, [role="menu"], [role="dialog"]') !== null) {
          return;
        }
        const title = target.closest('[class*="_title"]');
        if (title === null) return;
        const row = title.parentElement?.closest('[role="treeitem"]');
        const key = row?.getAttribute('data-row-key') ?? null;
        // Row keys are prefixed by kind — measured on the live shell:
        //   session:session-<uuid>   the rows this section is for
        //   workspace:<uuid>         the project rows that group them
        // Only the first kind is an openable session, so match the prefix instead
        // of guessing from the presence of a colon.
        if (row === null || key === null || !key.startsWith(SESSION_ROW_PREFIX)) return;
        if (row.getAttribute('aria-selected') === 'true') return;
        // A second tap inside the suppression window is the accidental one.
        if (Date.now() < suppressRowTapUntil) {
          event.stopPropagation();
          event.preventDefault();
          return;
        }
        suppressRowTapUntil = Date.now() + TAP_RENAME_SUPPRESS_MS;
        row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        // Getting out of the way is part of switching: on a phone the drawer
        // covers the conversation the tap just opened. Collapsing on the click
        // frame (not after a delay) keeps it from being seen as a second gesture.
        if (switches.closeDrawer) collapseSidebar();
        event.preventDefault();
      };

      /** Swallows the rename gesture that would otherwise complete a double tap. */
      const onSessionTapSuppress = (event) => {
        if (Date.now() >= suppressRowTapUntil) return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest('[class*="_title"]') === null) return;
        event.stopPropagation();
        event.preventDefault();
      };

      /**
       * Collapses the sidebar drawer.
       *
       * The drawer's own toggle button is preferred over the layout service: the
       * button is the same control the user would press, it goes through the
       * shell's real code path (including persisted state), and it still works
       * when the service lookup is unavailable. The service is the fallback.
       *
       * @returns true when a collapse was requested.
       */
      const collapseSidebar = () => {
        const toggle = [...document.querySelectorAll('button')].find(
          (button) =>
            /collapse sidebar|收起.*侧边栏|收起侧栏/i.test(button.getAttribute('aria-label') ?? '') ||
            /collapse sidebar/i.test(button.getAttribute('title') ?? ''),
        );
        if (toggle !== undefined) {
          toggle.click();
          return true;
        }
        if (layoutService !== null && typeof layoutService.toggleSidebar === 'function') {
          layoutService.toggleSidebar();
          return true;
        }
        return false;
      };

      /**
       * Collapses the floating sidebar when a tap lands outside it (§1).
       *
       * Adapted from `dsh-web-mobile-fix`: clicks inside the drawer, inside any
       * portal (menus, dialogs, the task context menu) and inside overlay roles
       * are all ignored, so only a genuine tap on the conversation collapses it.
       * The layout service is looked up through `ctx.get` rather than `ctx.layout`
       * because the guarded client context throws on undeclared property access.
       *
       * @param event - the click to classify.
       */
      const onOutsideTap = (event) => {
        if (!window.matchMedia(NARROW_QUERY).matches) return;
        const frame =
          document.querySelector('[class*="_frame"]') ??
          document.querySelector('[data-slot="root"] > div');
        if (frame === null || frame.hasAttribute('data-sidebar-collapsed')) return;
        const sidebarColumn =
          frame.querySelector('[class*="_sidebarCol"]') ?? frame.firstElementChild;
        if (sidebarColumn === null) return;
        const target = event.target instanceof Element ? event.target : null;
        if (target === null) return;
        if (sidebarColumn.contains(target)) return;
        if (!frame.contains(target)) return;
        if (
          target.closest(
            '[role="menu"], [role="menuitem"], [role="dialog"], [role="alertdialog"], ' +
              '[role="listbox"], [role="tooltip"], [data-dockkit-tab-menu]',
          ) !== null
        ) {
          return;
        }
        if (collapseSidebar()) {
          event.preventDefault();
          event.stopPropagation();
        }
      };

      /**
       * Raises the font size on the way *down*, before the platform moves focus.
       *
       * iOS evaluates the focus-zoom when focus changes, so anything written in
       * the focus handler is one event too late for the first tap. The stylesheet
       * rule normally wins this race on its own; this is the belt-and-braces path
       * for a build where the composer's own declaration outranks it.
       */
      const onPreFocus = (event) => {
        if (!switches.font) return;
        const target = event.target;
        if (target?.matches?.(EDITABLE_SELECTOR)) raiseFontSize(target);
      };

      /**
       * Focus events run in the capture phase: the composer is a contenteditable
       * React tree that can stop propagation, and the latch must not depend on
       * whether some intermediate handler allowed the event through.
       */
      const onFocusIn = (event) => {
        const target = event.target;
        if (switches.font && target?.matches?.(EDITABLE_SELECTOR)) raiseFontSize(target);
        onViewportChange('focusin');
        scheduleSettlePasses();
      };
      const onFocusOut = (event) => {
        // Focus moving *between* two editables must not clear the latch.
        const next = event.relatedTarget;
        if (next === null || !next?.matches?.(EDITABLE_SELECTOR)) restoreFontSize();
        settle('focusout');
        scheduleSettlePasses();
      };
      const handleSelection = () => settle('selection');
      const handleScroll = () => onViewportChange('scroll');

      window.visualViewport?.addEventListener('resize', handleViewport);
      window.visualViewport?.addEventListener('scroll', handleViewport);
      window.addEventListener('resize', handleWindow);
      window.addEventListener('orientationchange', handleWindow);
      // Some iOS versions open the keyboard without firing a viewport resize.
      window.addEventListener('focusin', onFocusIn, true);
      window.addEventListener('focusout', onFocusOut, true);
      window.addEventListener('pointerdown', onPreFocus, true);
      window.addEventListener('touchstart', onPreFocus, true);
      if (switches.tap) {
        // Capture phase, on the way up: commit the tap before the platform can
        // assemble a double click, and swallow that double click if it comes.
        window.addEventListener('pointerup', onSessionTap, true);
        window.addEventListener('touchend', onSessionTap, true);
        window.addEventListener('dblclick', onSessionTapSuppress, true);
      }
      if (switches.layout) document.addEventListener('click', onOutsideTap, true);
      // Caret movement is the trigger for the second, buggy iOS scroll.
      doc.addEventListener('selectionchange', handleSelection);
      window.addEventListener('scroll', handleScroll);

      // Console API: `__dshMobileUx.metrics()` and `.history()`.
      const api = {
        metrics: readMetrics,
        history: () => history.slice(),
        keyboardOpen,
        note,
      };
      window.__dshMobileUx = api;

      // Seed the keyboard-free baseline before the first focus.
      refreshKeyboardState();
      applyHeight();
      note('install');

      return () => {
        window.visualViewport?.removeEventListener('resize', handleViewport);
        window.visualViewport?.removeEventListener('scroll', handleViewport);
        window.removeEventListener('resize', handleWindow);
        window.removeEventListener('orientationchange', handleWindow);
        window.removeEventListener('focusin', onFocusIn, true);
        window.removeEventListener('focusout', onFocusOut, true);
        window.removeEventListener('pointerdown', onPreFocus, true);
        window.removeEventListener('touchstart', onPreFocus, true);
        window.removeEventListener('pointerup', onSessionTap, true);
        window.removeEventListener('touchend', onSessionTap, true);
        window.removeEventListener('dblclick', onSessionTapSuppress, true);
        document.removeEventListener('click', onOutsideTap, true);
        doc.removeEventListener('selectionchange', handleSelection);
        window.removeEventListener('scroll', handleScroll);
        if (frame !== null) window.cancelAnimationFrame(frame);
        cancelSettlePasses();
        restoreViewportMeta();
        restoreFontSize();
        for (const record of previous) {
          if (record.value === '') {
            record.element.style.removeProperty(record.property);
          } else {
            record.element.style.setProperty(record.property, record.value, record.priority);
          }
        }
        hud?.remove();
        lockElement.remove();
        if (window.__dshMobileUx === api) delete window.__dshMobileUx;
      };
    }

    return {
      // Hard dependency kept minimal and real: the Client slot layer is what
      // makes a Client half load at all.
      inject: ['slots'],
      apply(context) {
        // `install` deliberately takes no arguments and reads nothing off the
        // plugin context, so it can be handed to cordis as a plain effect
        // callback. cordis invokes it with no positional arguments, binding
        // `this` to the Fiber (cordis/lib/index.js: `runner.execute.call(this)`).
        //
        // The effect's return value MUST be handed back: cordis reads it as the
        // disposer. Dropping it (as an earlier version did) leaves every listener
        // and injected style behind when the plugin is disabled or reloaded, and
        // the leftovers then fight the next generation of the plugin.
        return context.effect(() => install(context), 'dsh-mobile-ux');
      },
    };
  },
});
