/**
 * dsh-mobile-ux — client half.
 *
 * A mobile-first UX pack for the DeepSeek Harness Web shell. Five sections, each
 * independently switchable, each readable on its own:
 *
 *   §1 narrow-screen layout    settings dialog, composer bar, floating sidebar
 *                              drawer and its scrim (<= 700px).
 *   §2 iOS keyboard & viewport visual-viewport height following, document scroll
 *                              lock, and the focus watchdog that re-asserts the
 *                              height after a keyboard settles.
 *   §3 sidebar single tap      one tap opens a session; a second, fast tap no
 *                              longer falls through to rename.
 *   §4 trajectory tail         the trajectory panel opens on its newest entry
 *                              instead of somewhere in the middle of history.
 *   §5 zoom pin                the viewport meta gets `maximum-scale=1`, so the
 *                              iOS focus-zoom cannot magnify the whole page.
 *
 * What this pack deliberately does NOT do: change any text size. An earlier
 * version raised the composer's font size on touch devices to defeat the iOS
 * focus-zoom, which is both a visible change the reader did not ask for and a
 * fight with the product's own font-size setting (12..17px). §5 covers the same
 * ground by limiting the scale instead of writing typography.
 *
 * Credits and upstream projects
 * -----------------------------
 * - §1 is adapted from `dsh-web-mobile-fix` by AcidGr (MIT)
 *   https://github.com/AcidGr/dsh-web-mobile-fix
 *   with the equivalent feature set of `dsh-mobile` by TecFancy (MIT) as a
 *   second reference: https://github.com/TecFancy/dsh-mobile
 * - §2 and §3 come from measuring a real iPhone; every constant in them was
 *   derived from a measurement rather than a guess.
 * - §4 corrects a layout race in the shell's virtualised trajectory table.
 *
 * Switches
 * --------
 * `?dshMobileUx=0` disables the pack. A comma-separated list otherwise:
 *
 *   layout | keyboard | tap | trajectory | zoom   keep only the listed sections
 *   nolayout | nokeyboard | notap | notrajectory | nozoom   drop the listed ones
 *   keepdrawer   leave the sidebar drawer open after a session tap
 *   lock | nolock    document scroll lock while the keyboard is open
 *   freezoom         let the page be magnified (by default the scale is pinned)
 *   hud              show the live readout
 *
 * The same switches can be set before load as `window.__dshMobileUxOptions = {...}`
 * — a separate property from the `window.__dshMobileUx` readout API this pack
 * publishes afterwards, so the two can never overwrite each other.
 */

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

    /** Width at or below which the narrow-screen layout applies. */
    const NARROW_QUERY = '(max-width: 700px)';

    /**
     * How close to the bottom counts as "the reader is following the tail" (§4).
     * Same two pixels the shell's own panels use, so the pack and the product agree
     * on what "at the bottom" means.
     */
    const TAIL_THRESHOLD_PX = 2;

    /**
     * Re-assertion delays after the keyboard changes state (§2).
     *
     * The keyboard sometimes finishes animating without a viewport event arriving
     * afterwards, so the last measurement is taken while it is still moving and its
     * height is stale — which leaves a band of empty space no further input clears.
     * These passes live inside the keyboard animation window.
     */
    const SETTLE_PASS_MS = [100, 250, 500, 900, 1500];

    /**
     * How many frames the post-focus watchdog keeps sampling (§2).
     *
     * About 1.5 seconds at 60Hz, covering a focus-zoom that never reports itself.
     */
    const HEIGHT_WATCHDOG_FRAMES = 90;

    /**
     * Re-assertion delays after a trajectory panel opens (§4).
     *
     * The product already scrolls its table to the end on mount, but a virtualised
     * list keeps changing its row heights while settling, so that first attempt can
     * land short and nothing corrects it afterwards.
     */
    const TRAJECTORY_SETTLE_MS = [60, 200, 500, 1000, 1800];

    /**
     * How many frames the trajectory watchdog keeps walking the tail down (§4).
     *
     * About two seconds at 60Hz: long enough for a large virtualised table to finish
     * measuring its rows, short enough that the reader never waits on it.
     */
    const TRAJECTORY_WATCH_FRAMES = 120;

    /** How long a tap on a session row suppresses rename; see §3. */
    const TAP_RENAME_SUPPRESS_MS = 600;

    /**
     * The `data-row-key` prefix the shell gives an openable session row.
     *
     * Measured on the live shell: sessions are `session:session-<uuid>`, and the
     * project rows that group them are `workspace:<uuid>`.
     */
    const SESSION_ROW_PREFIX = 'session:';

    /** The CSS custom property the fixed `#root` takes its height from. */
    const HEIGHT_VARIABLE = '--dsh-app-visual-height';

    /**
     * How far the platform has panned its visual viewport.
     *
     * iOS does not only shrink the visual viewport when a keyboard opens; it also
     * slides it, and the shell stays anchored to the *layout* viewport. The result
     * is a band of nothing between the composer and the keyboard: the app sits at
     * the top of the layout viewport while the visible window has moved down.
     * `#root` is fixed, so shifting its `top` by the same amount keeps its bottom
     * edge on the keyboard's top edge. The height stays exactly the visible height
     * — a pan is never compensated by growing the box.
     */
    const PAN_VARIABLE = '--dsh-mux-pan';

    // ---------------------------------------------------------------- styles --

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
      '}\n' +
      // The whole fix, in one declaration.
      //
      // `#root` is a normal static block, so writing a smaller height on it does
      // not move anything up — it only leaves scrollable slack underneath, and the
      // platform scrolls into that slack to bring the caret into view. What the
      // reader then sees is the app pushed up with a band of nothing between the
      // composer and the keyboard.
      //
      // Taking `#root` out of the flow removes the slack entirely: a fixed box
      // cannot be scrolled, so there is nowhere for the blank band to come from and
      // the footer stays on the keyboard's top edge. Its height is the visible
      // height, which the follower below writes.
      'body > #root {\n' +
      '  position: fixed;\n' +
      `  top: var(${PAN_VARIABLE}, 0px);\n` +
      '  left: 0;\n' +
      '  right: 0;\n' +
      `  height: var(${HEIGHT_VARIABLE}, 100%);\n` +
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
     * A keep-list is exclusive — naming one section turns the others off. That is
     * the point (`?dshMobileUx=tap` is "only the tap fix"), but it also means
     * `?dshMobileUx=tap,hud` silently drops the keyboard follower. `hud`, `lock`
     * and `zoom` are therefore read as modifiers that never take part in the
     * keep-list: they can only be opted into or out of by name.
     *
     * @returns {{ layout: boolean, keyboard: boolean, tap: boolean,
     *   trajectory: boolean, zoom: boolean, hud: boolean, lock: boolean }}
     */
    function readPackSwitches() {
      const raw = new URL(window.location.href).searchParams.get('dshMobileUx');
      const parts = (raw ?? '').split(',').map((part) => part.trim()).filter(Boolean);
      const off = parts.includes('0') || parts.includes('off');
      /**
       * The reader's own overrides, set before this bundle runs. Deliberately a
       * different property from `window.__dshMobileUx`, which this pack owns.
       */
      const options = window.__dshMobileUxOptions ?? {};
      const keep = parts.filter(
        (part) => !part.startsWith('no') && !['0', 'off', 'hud', 'lock', 'zoom'].includes(part),
      );
      /**
       * A section: on by default, off when named in the keep-list's complement.
       *
       * @param name - switch name, also the `no<name>` spelling.
       * @param fallback - value when the URL says nothing.
       * @returns the resolved switch.
       */
      const pick = (name, fallback) => {
        if (off) return false;
        if (options[name] !== undefined) return Boolean(options[name]);
        if (parts.includes(`no${name}`)) return false;
        if (keep.length > 0) return keep.includes(name);
        return fallback;
      };
      /**
       * A modifier: on by default, but never inferred from the keep-list.
       *
       * @param name - switch name; opted out with `free<name>`.
       * @returns true unless the URL or the reader turned it off.
       */
      const pickModifier = (name) => {
        if (off) return false;
        if (options[name] !== undefined) return Boolean(options[name]);
        if (parts.includes(`no${name}`)) return false;
        return !parts.includes(`free${name}`);
      };
      /**
       * A readout: off unless asked for.
       *
       * @param name - switch name.
       * @returns true only when the URL or the reader asked for it.
       */
      const optIn = (name) => {
        if (off) return false;
        if (options[name] !== undefined) return Boolean(options[name]);
        if (parts.includes(`no${name}`)) return false;
        return parts.includes(name);
      };
      return {
        layout: pick('layout', true),
        keyboard: pick('keyboard', true),
        tap: pick('tap', true),
        // §4: keep the trajectory panel's tail in view when it opens.
        trajectory: pick('trajectory', true),
        // `?dshMobileUx=keepdrawer` leaves the drawer open after a tap, for
        // switching through several sessions in a row.
        closeDrawer: pick('closeDrawer', true),
        hud: optIn('hud'),
        lock: pick('lock', true),
        // §5, pinning the page scale, is a modifier rather than a section: it
        // cannot be asked for by name in a keep-list, only switched off.
        zoom: pickModifier('zoom'),
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
     * True while an editable field holds focus.
     *
     * Tracked through focusin/focusout rather than by reading
     * `document.activeElement`: iOS moves the active element around while the
     * keyboard animates and around deletions, and a latch that depends on the
     * DOM's current idea of focus drops out mid-session — which silently switches
     * the height follower and the scroll lock off.
     */
    let editableHasFocus = false;

    /** @returns true when an editable field holds focus, per focusin/focusout. */
    function editableFocused() {
      return editableHasFocus;
    }

    /**
     * Refreshes the keyboard latch from focus plus the visible height.
     *
     * @returns true when an on-screen keyboard is (very likely) open.
     */
    function refreshKeyboardState() {
      const viewport = window.visualViewport ?? null;
      const visible = viewport === null ? window.innerHeight : viewport.height;
      const previous = keyboard.lastHeight;
      keyboard.lastHeight = visible;
      if (previous === 0 || visible > keyboard.referenceHeight) keyboard.referenceHeight = visible;
      // While nothing editable is focused, a changed height is a window resize or
      // a rotation, not a keyboard: adopt it as the new baseline.
      if (!editableFocused() && Math.abs(visible - previous) > MIN_KEYBOARD_HEIGHT) {
        keyboard.referenceHeight = visible;
      }
      if (!editableFocused() || !touchDevice()) {
        keyboard.open = false;
        return false;
      }
      // A page zoom is NOT a reason to stop following the viewport. iOS zooms the
      // page itself when a focused editable renders below 16px, and treating that
      // zoom as "the user is panning, no keyboard here" is exactly what let the
      // composer drop behind the keyboard once this pack stopped overriding the
      // product's font size. Whatever the scale, the visible height is the box the
      // keyboard left us.
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
      // Every section resolves to a boolean, so this is the one place that has to
      // know which of them exist. `trajectory` and `zoom` are sections too, not
      // extras: with every one of them off the pack must write nothing at all.
      const anySection =
        switches.layout ||
        switches.keyboard ||
        switches.tap ||
        switches.trajectory ||
        switches.zoom;
      if (!anySection) return () => {};

      /**
       * Keeps the tail of the trajectory panel in view (§4).
       *
       * The trajectory table already scrolls itself to the end once, on mount. On a
       * phone that single attempt is not enough: the list is virtualised, its rows
       * receive their real heights a frame or two later, and the panel ends up
       * parked somewhere in the middle of the history — which leaves the reader
       * scrolling down for a long time to reach the newest activity.
       *
       * This re-asserts the tail a few times while the pane settles, and stops as
       * soon as the reader is no longer at the bottom: scrolling up is an
       * intention, and fighting it would be worse than the original bug.
       */
      const trajectoryPanes = new WeakMap();
      /**
       * Every pending timed pass, so disposal and a new panel both cancel exactly
       * the timers this section started. Per pane rather than one flat list: two
       * panes must not cancel each other's passes.
       */
      const trajectoryTimers = new Map();
      /**
       * The panes currently being followed.
       *
       * Kept separately from {@link trajectoryTimers} because a pane keeps being
       * followed after its last timer has fired — the watchdog frames and their
       * `following` reset are still in flight — and those are exactly the writes
       * that must stop when the reader scrolls up.
       */
      const trajectoryFollowing = new Set();
      /**
       * Per-pane state for §4.
       *
       * @param pane - a trajectory scroll container.
       * @returns that pane's record, creating it on first sight.
       */
      const trajectoryState = (pane) => {
        let state = trajectoryPanes.get(pane);
        if (state === undefined) {
          state = {
            away: false,
            generation: 0,
            landedAt: null,
            measuredHeight: -1,
            hidden: true,
            onScroll: null,
            watchFrames: 0,
          };
          trajectoryPanes.set(pane, state);
        }
        return state;
      };
      /**
       * Starts watching one pane for a deliberate scroll away from its tail.
       *
       * Intent has to be observed, not inferred from distance: the pane mounts parked
       * mid-history (measured: scrollTop 365 of a 1013 scroll range on a phone), so a
       * distance test fires immediately and disables the correction meant to run next.
       * Only a scroll the pack did not cause counts.
       *
       * Installed as soon as the pane is registered rather than when the watchdog
       * retires: a scroll landing where the pack just wrote the pane is the pack's
       * own write coming back, so a reader's swipe is never mistaken for it however
       * soon it arrives.
       *
       * @param pane - the trajectory scroll container.
       */
      const watchTrajectoryIntent = (pane) => {
        const state = trajectoryState(pane);
        if (state.onScroll !== null) return;
        state.onScroll = () => {
          // A scroll event that lands exactly where this pack just put the pane is
          // the pack's own write coming back. Comparing positions rather than
          // consulting a "we are writing" flag matters: the flag is cleared on the
          // next frame, so a reader's swipe arriving inside that frame would be
          // mistaken for the pack's own scroll and silently swallowed.
          if (state.landedAt !== null && Math.abs(pane.scrollTop - state.landedAt) < 1) return;
          const distance = pane.scrollHeight - pane.clientHeight - pane.scrollTop;
          if (distance > Math.max(TAIL_THRESHOLD_PX, pane.clientHeight / 2)) {
            // Stop the pending passes as well as the flag: a pass queued a moment
            // ago would otherwise put the pane straight back on its tail, which is
            // exactly the fight this section refuses to pick.
            state.away = true;
            stopTrajectoryFollow(pane);
          }
        };
        pane.addEventListener('scroll', state.onScroll, { passive: true });
      };
      /**
       * Stops following one pane and unhooks everything §4 attached to it.
       *
       * @param pane - the trajectory scroll container.
       */
      const stopTrajectoryFollow = (pane) => {
        const state = trajectoryState(pane);
        trajectoryFollowing.delete(pane);
        // Bumping the generation retires every frame already in flight. That is
        // stronger than cancelling the last id: `putTrajectoryOnTail` queues its own
        // frame to clear `following`, and a frame that has run leaves no id behind,
        // so an id-based cancel cannot reach everything the watchdog scheduled.
        state.generation += 1;
        state.watchFrames = 0;
        for (const timer of trajectoryTimers.get(pane) ?? []) window.clearTimeout(timer);
        trajectoryTimers.delete(pane);
        if (state.onScroll !== null) {
          pane.removeEventListener('scroll', state.onScroll);
          state.onScroll = null;
        }
      };
      /**
       * @returns true while the pane is still part of the document.
       *
       * A pane inside a collapsed drawer measures 0x0 and must keep its state; a
       * pane React has thrown away must lose it, or its pending passes keep
       * scrolling an orphan.
       *
       * @param pane - the trajectory scroll container.
       */
      const paneConnected = (pane) => pane.parentNode !== null;
      /**
       * Puts one pane on its tail and remembers the range it settled at.
       *
       * @param pane - the trajectory scroll container.
       */
      const putTrajectoryOnTail = (pane) => {
        const state = trajectoryState(pane);
        // The virtualised rows carry `data-record-index` on `div`s, so this is a
        // plain attribute selector rather than a `tr` one.
        const rows = pane.querySelectorAll('[data-record-index]');
        const last = rows[rows.length - 1] ?? null;
        if (last !== null) last.scrollIntoView({ block: 'end', behavior: 'auto' });
        // Write the offset as well: a virtualised list can ignore the first attempt,
        // and doing both is idempotent when both work.
        pane.scrollTop = pane.scrollHeight;
        // Remember where this write landed, so the intent listener can tell the
        // scroll event it is about to receive apart from one the reader caused.
        state.landedAt = pane.scrollTop;
        // The browser dispatches the resulting scroll event asynchronously, so the
        // mark has to survive at least one frame.
        window.requestAnimationFrame(() => {
          state.landedAt = null;
        });
      };
      /**
       * Walks the tail down as the list grows.
       *
       * Why a watchdog rather than a fixed schedule: the panel's scroll range is still
       * growing after any set of delays one could pick, and whichever pass runs last
       * leaves the pane wherever the range happened to end. On a desktop the panel has
       * a fraction of the rows and settles long before the last pass, which is why the
       * same code looks correct there and fails on a phone.
       *
       * @param pane - the pane being followed.
       */
      const runTrajectoryWatchdog = (pane, generation) => {
        const state = trajectoryState(pane);
        // Two ways a frame becomes stale: the pane stopped being followed, or this
        // frame was queued by an earlier run of the watchdog.
        if (generation !== state.generation) return;
        if (state.watchFrames <= 0 || state.away) return;
        state.watchFrames -= 1;
        // The intent is "stay on the tail", not "be within N pixels of it": once the
        // pack has put a pane on its tail, later rows extend the range *below* the
        // current offset, so a distance test is false at exactly the moment the pane
        // needs following. A deliberate scroll up stops this loop entirely.
        putTrajectoryOnTail(pane);
        window.requestAnimationFrame(() => {
          runTrajectoryWatchdog(pane, generation);
        });
      };
      /**
       * Starts following a pane and keeps watching it while its layout settles.
       *
       * @param pane - the pane that just became measurable.
       */
      const scheduleTrajectoryFollow = (pane) => {
        // Follow exactly one pane: two watchdogs would each drag the other's pane
        // around, and an earlier panel's pending passes would fire into a pane the
        // reader has already left.
        cancelTrajectoryFollow();
        const state = trajectoryState(pane);
        trajectoryFollowing.add(pane);
        watchTrajectoryIntent(pane);
        // A few timed passes catch the common case quickly...
        trajectoryTimers.set(
          pane,
          TRAJECTORY_SETTLE_MS.map((delay) =>
            window.setTimeout(() => {
              putTrajectoryOnTail(pane);
            }, delay),
          ),
        );
        // ...and the watchdog covers a list that is still growing when they are done.
        state.watchFrames = TRAJECTORY_WATCH_FRAMES;
        runTrajectoryWatchdog(pane, state.generation);
      };
      /** Stops every pane this section is following. */
      const cancelTrajectoryFollow = () => {
        for (const pane of [...trajectoryFollowing]) stopTrajectoryFollow(pane);
      };
      /**
       * Reacts to a pane becoming measurable, which is when the panel actually opens.
       *
       * @param pane - the pane to inspect.
       */
      const noteTrajectoryPane = (pane) => {
        const state = trajectoryState(pane);
        if (pane.clientHeight <= 0) {
          // A collapsed drawer parks the pane at 0x0. Remember that it was hidden,
          // so that reopening it at the very same height is not mistaken for "no
          // change" and skipped — which is what left a reopened panel parked in the
          // middle of its history.
          state.hidden = true;
          return;
        }
        const reopened = state.hidden;
        state.hidden = false;
        if (!reopened && state.measuredHeight === pane.clientHeight) return;
        state.measuredHeight = pane.clientHeight;
        if (state.away) return;
        scheduleTrajectoryFollow(pane);
      };
      // The pane exists while the drawer is closed and measures 0x0, so it is a resize
      // — not a DOM insertion — that says the panel has opened. Registration therefore
      // has to be redone for every pane the DOM grows, because React is free to replace
      // the element and a replaced element is a new target.
      const trajectoryResizeObserver =
        switches.trajectory && typeof ResizeObserver === 'function'
          ? new ResizeObserver((entries) => {
              for (const entry of entries) noteTrajectoryPane(entry.target);
            })
          : null;
      const trajectoryObserver = switches.trajectory
        ? new MutationObserver(() => {
            // A streaming chat mutates the DOM constantly; without this guard every
            // token would cost a querySelectorAll.
            if (doc.querySelector('[data-trajectory-scroll]') === null) return;
            const live = doc.querySelectorAll('[data-trajectory-scroll]');
            for (const pane of live) {
              trajectoryResizeObserver?.observe(pane);
              noteTrajectoryPane(pane);
            }
            // Drop the state of panes React has removed: they cannot be followed
            // any more, and their pending passes would fight the new panel.
            for (const pane of [...trajectoryTimers.keys()]) {
              if (!live.includes(pane)) stopTrajectoryFollow(pane);
            }
          })
        : null;
      if (trajectoryObserver !== null) {
        trajectoryObserver.observe(doc.body ?? documentElement, { childList: true, subtree: true });
        for (const pane of doc.querySelectorAll('[data-trajectory-scroll]')) {
          trajectoryResizeObserver?.observe(pane);
          noteTrajectoryPane(pane);
        }
      }

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
       * Pins the page scale so a focused editable cannot magnify the page.
       *
       * This is the one problem the follower cannot solve on its own. iOS magnifies
       * when an editable below 16px takes focus; raising the font size would defeat
       * that, but text size belongs to the product and the reader's own setting, so
       * the pack limits the scale instead. Measured effect of not limiting it: the
       * visible height fell from 500 to 345 on a 390x844 phone, which is the
       * "page got magnified" the reader reported.
       *
       * `?dshMobileUx=freezoom` opts out.
       *
       * @returns {() => void} restores the previous content attribute.
       */
      const applyViewportMeta = () => {
        if (!switches.zoom) return () => {};
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
      const documentElement = doc.documentElement;
      const body = doc.body;

      if (switches.layout) addStyles(LAYOUT_STYLES);
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

      /**
       * Every inline property §2 overwrites, so disposal restores it exactly.
       *
       * A plain array, not a Map: the same property is written on three different
       * elements, and an element-keyed map would silently keep only the last one,
       * leaving an inline height behind on dispose.
       */
      const previous = [];
      /**
       * Remembers one property before this pack writes it.
       *
       * @param element - the element about to be written.
       * @param property - the CSS property name.
       */
      const rememberStyle = (element, property) => {
        previous.push({
          element,
          property,
          value: element.style.getPropertyValue(property),
          priority: element.style.getPropertyPriority(property),
        });
      };
      // Only §2 writes inline styles, and only while it is enabled: with
      // `nokeyboard` the pack must leave the document exactly as it found it.
      if (switches.keyboard) {
        rememberStyle(documentElement, 'height');
        rememberStyle(body, 'height');
        rememberStyle(root, 'height');
        rememberStyle(documentElement, HEIGHT_VARIABLE);
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

      /** Frame guard shared by the caret/viewport settle path. */
      let frame = null;
      /** True while the document-level scroll lock is in force. */
      let locked = false;
      /** The height §2 last pinned, or null when it is not pinning. */
      let pinnedShellHeight = null;
      const history = [];
      const hud = switches.hud ? createHud() : null;

      /**
       * Pins the shell to the visible height while §2 is on.
       *
       * Keyboard open → the visible area, floored. Two mistakes are baked into
       * this one decision, both learned on a real phone:
       *
       * 1. Rounding up (`Math.round`) makes the document one pixel scrollable and
       *    hands iOS back the ability to scroll the composer away, so the pixel is
       *    floored.
       * 2. Compensating the visual-viewport pan by *growing* the box makes the shell
       *    taller than the visible area, and the excess shows up as a band of empty
       *    space between the composer and the keyboard. The pan is carried by the
       *    fixed box's `top` instead, so the height is never anything but the
       *    visible height.
       *
       * Keyboard closed → the layout height, which is what `height: 100%` already
       * resolves to, so a desktop window resize or a pinch-zoom pan is untouched.
       *
       * Always writes, even when the number is unchanged: an identical height does
       * not imply an identical document, because iOS can scroll the document while
       * the keyboard settles, and only a fresh write plus the scroll clamp below
       * collapses that leftover offset.
       */
      const applyHeight = () => {
        if (!switches.keyboard) return;
        const visible = window.visualViewport?.height ?? window.innerHeight;
        const height = keyboardOpen()
          ? Math.min(MAX_SHELL_HEIGHT, Math.max(1, Math.floor(visible)))
          : window.innerHeight;
        const value = `${height}px`;
        pinnedShellHeight = value;
        documentElement.style.height = value;
        body.style.height = value;
        root.style.height = value;
        documentElement.style.setProperty(HEIGHT_VARIABLE, value);
        // Follow the platform's visual-viewport pan (see PAN_VARIABLE). Applied only
        // while the keyboard is open, because a pan with no keyboard is just the
        // reader moving around a zoomed page and must not be fought.
        const pan = keyboard.open ? Math.max(0, window.visualViewport?.offsetTop ?? 0) : 0;
        documentElement.style.setProperty(PAN_VARIABLE, `${pan}px`);
        // The clamp. A viewport whose scrollHeight exceeds its clientHeight is
        // slack, and slack is where the blank band between the composer and the
        // keyboard comes from: iOS scrolls into the leftover instead of letting the
        // shell end at the keyboard's top edge. Zeroing the offset makes the
        // document unscrollable again, whatever the pan did.
        if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0);
        if (documentElement.scrollTop !== 0) documentElement.scrollTop = 0;
        if (body.scrollTop !== 0) body.scrollTop = 0;
      };

      /**
       * One line describing the geometry the reader is looking at.
       *
       * Shared by the history and the readout: they used to build the same fields
       * twice, which is how a stale `wrote=` survived in both.
       *
       * @param metrics - a {@link readMetrics} snapshot.
       * @returns the line.
       */
      const geometryLine = (metrics) =>
        `vvH=${Math.round(metrics.visualHeight)} ref=${Math.round(keyboard.referenceHeight)}` +
        ` lvh=${metrics.layoutHeight} root=${metrics.rootHeight}` +
        ` wrote=${pinnedShellHeight ?? '-'} y=${metrics.scrollY}` +
        ` oT=${Math.round(metrics.offsetTop)} docH=${metrics.documentScrollHeight}`;

      /** Records an interesting change, so a phone screenshot tells the story. */
      const note = (reason) => {
        if (hud === null) return;
        const metrics = readMetrics();
        const line = `#${history.length + 1} ${reason} ${geometryLine(metrics)}`;
        // Consecutive samples that say the same thing carry no information; the
        // watchdog alone would otherwise fill the whole buffer with copies.
        if (history[history.length - 1] !== line) history.push(line);
        if (history.length > 40) history.shift();
        // Keep the readout present even when nothing has gone wrong yet: the
        // interesting moment is a state the user is looking at, not an event.
        report(metrics);
      };

      /** Draws the optional readout for the state the user is looking at. */
      const report = (metrics) => {
        if (hud === null) return;
        const flags =
          `kb=${keyboardOpen() ? 1 : 0} focus=${editableFocused() ? 1 : 0}` +
          ` lock=${locked ? 1 : 0}` +
          ` zoom=${switches.zoom ? 1 : 0}`;
        hud.update(
          [
            'dsh-mobile-ux',
            `vvH=${Math.round(metrics.visualHeight)} ref=${Math.round(keyboard.referenceHeight)}` +
              ` lvh=${metrics.layoutHeight}`,
            `root=${metrics.rootHeight} wrote=${pinnedShellHeight ?? '-'}`,
            flags,
            `y=${metrics.scrollY} oT=${Math.round(metrics.offsetTop)}` +
              ` s=${metrics.scale.toFixed(2)} docH=${metrics.documentScrollHeight}`,
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
       * visual viewport — which the pinned height follows.
       *
       * The lock belongs to §2: with `nokeyboard` there is no follower to keep
       * still, so nothing here may be touched at all.
       */
      const toggleScrollLock = () => {
        const wanted = switches.keyboard && switches.lock && keyboard.open;
        if (wanted === locked) return;
        locked = wanted;
        setScrollLock(locked);
      };

      /**
       * A viewport/caret event. Runs synchronously on purpose: deferring to an
       * animation frame leaves the old height in place for one frame, and that
       * is exactly the window in which iOS scrolls the page after the caret
       * moved.
       *
       * The document scroll clamp lives in `applyHeight`, which runs on every one
       * of these events; a separate reset afterwards would be dead code, because
       * the clamp has already put the offsets back to zero by the time it ran.
       */
      const onViewportChange = (reason) => {
        if (watchdogFrames > 0) {
          watchdogFrames -= 1;
          window.requestAnimationFrame(() => onViewportChange('watchdog'));
        }
        // Refresh the latch first: `applyHeight` reads `keyboardOpen()`.
        const wasOpen = keyboard.open;
        refreshKeyboardState();
        toggleScrollLock();
        applyHeight();
        if (wasOpen !== keyboard.open) note(`kb=${keyboard.open ? 'open' : 'closed'}(${reason})`);
        // The readout must describe the state the user is looking at, not only
        // the events that happened to be interesting.
        report(readMetrics());
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
       * clears. The passes live inside the keyboard animation window, where a
       * handful of extra style writes cost nothing.
       */
      const settlePassTimers = [];
      /**
       * Frames left in the post-focus watchdog.
       *
       * The events are not enough. Measurements showed iOS can finish a
       * focus-zoom without any `visualViewport.resize` arriving (an event probe
       * during a simulated focus-zoom recorded zero events), and a height that is
       * never recomputed is one of the two ways the blank band appears. So for a
       * second after each focus change the follower also samples every frame.
       */
      let watchdogFrames = 0;
      const startHeightWatchdog = () => {
        watchdogFrames = HEIGHT_WATCHDOG_FRAMES;
      };
      /** Drops every pending settle pass. */
      const cancelSettlePasses = () => {
        while (settlePassTimers.length > 0) window.clearTimeout(settlePassTimers.pop());
      };
      const scheduleSettlePasses = () => {
        if (!switches.keyboard) return;
        cancelSettlePasses();
        for (const delay of SETTLE_PASS_MS) {
          settlePassTimers.push(
            window.setTimeout(() => {
              onViewportChange(`settle+${delay}`);
            }, delay),
          );
        }
      };

      const handleViewport = () => {
        // Any viewport event means the platform is moving: watch the next second.
        startHeightWatchdog();
        onViewportChange('viewport');
      };
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
       * Focus events run in the capture phase: the composer is a contenteditable
       * React tree that can stop propagation, and the latch must not depend on
       * whether some intermediate handler allowed the event through.
       *
       * Nothing here touches the element's own styling: the composer's text size
       * belongs to the product and to the reader's own setting, so this pack never
       * writes one.
       */
      const onFocusIn = (event) => {
        const target = event.target;
        if (target?.matches?.(EDITABLE_SELECTOR)) editableHasFocus = true;
        // A focus-zoom can land without any viewport event, so sample frames.
        startHeightWatchdog();
        onViewportChange('focusin');
        scheduleSettlePasses();
      };
      const onFocusOut = (event) => {
        // Focus moving *between* two editables must not clear the latch.
        const next = event.relatedTarget;
        if (next === null || !next?.matches?.(EDITABLE_SELECTOR)) editableHasFocus = false;
        settle('focusout');
        scheduleSettlePasses();
      };
      const handleSelection = () => settle('selection');
      const handleScroll = () => {
        // The clamp inside `applyHeight` already zeroes the document offsets, so a
        // plain page scroll has nothing left to correct. Skipping it keeps desktop
        // scrolling from running the whole follower on every wheel tick.
        if (!switches.keyboard || !editableFocused()) return;
        onViewportChange('scroll');
      };

      window.visualViewport?.addEventListener('resize', handleViewport);
      window.visualViewport?.addEventListener('scroll', handleViewport);
      window.addEventListener('resize', handleWindow);
      window.addEventListener('orientationchange', handleWindow);
      // Some iOS versions open the keyboard without firing a viewport resize.
      window.addEventListener('focusin', onFocusIn, true);
      window.addEventListener('focusout', onFocusOut, true);
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
        window.removeEventListener('pointerup', onSessionTap, true);
        window.removeEventListener('touchend', onSessionTap, true);
        window.removeEventListener('dblclick', onSessionTapSuppress, true);
        document.removeEventListener('click', onOutsideTap, true);
        doc.removeEventListener('selectionchange', handleSelection);
        window.removeEventListener('scroll', handleScroll);
        if (frame !== null) window.cancelAnimationFrame(frame);
        cancelSettlePasses();
        // The lock is a stylesheet, not an inline style, so restoring `previous`
        // below cannot remove it: without this the document stays unscrollable and
        // `#root` stays fixed until a full page reload.
        locked = false;
        setScrollLock(false);
        restoreViewportMeta();
        for (const record of previous) {
          if (record.value === '') {
            record.element.style.removeProperty(record.property);
          } else {
            record.element.style.setProperty(record.property, record.value, record.priority);
          }
        }
        hud?.remove();
        // Retires every pending pass and watchdog frame for every followed pane.
        cancelTrajectoryFollow();
        trajectoryObserver?.disconnect();
        trajectoryResizeObserver?.disconnect();
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
