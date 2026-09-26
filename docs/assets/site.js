/**
 * dsh-mobile-ux — shared site script.
 *
 * Responsibilities, deliberately few:
 *
 *   1. Language switching. Every string on the site lives in
 *      `locales/<lang>.json` under a key; the markup carries `data-i18n="<key>"`
 *      and nothing else, plus the Chinese copy as inline fallback. Changing a
 *      sentence, fixing a translation or adding a language therefore never
 *      touches the HTML.
 *   2. Marking the current page in the header and footer navigation, before any
 *      script runs (the builder already does it) and again for the `index.html`
 *      spelling of the home page.
 *   3. Small visual affordances: terminal blocks get their command token
 *      highlighted, and the anchor strip keeps the active section in view.
 *
 * With JavaScript disabled the pages render completely in Chinese, with every
 * anchor and both page menus intact.
 */
(function () {
  var LANGUAGE_KEY = 'dsh-mobile-ux:lang';
  var COPY = window.__dshMobileUxCopy || {};
  var LANGUAGES = Object.keys(COPY);
  var DEFAULT_LANGUAGE = 'zh';
  var root = document.documentElement;
  var buttons = Array.prototype.slice.call(document.querySelectorAll('.langs button'));
  var nodes = Array.prototype.slice.call(document.querySelectorAll('[data-i18n]'));
  var metaNodes = Array.prototype.slice.call(document.querySelectorAll('[data-i18n-content]'));

  /** @returns the stored preference, or null. */
  function storedLanguage() {
    try {
      var value = localStorage.getItem(LANGUAGE_KEY);
      return LANGUAGES.indexOf(value) >= 0 ? value : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Picks the best match for the browser's own preference list.
   *
   * @returns a language code the site actually has.
   */
  function browserLanguage() {
    var tags = navigator.languages || [navigator.language || ''];
    for (var i = 0; i < tags.length; i += 1) {
      var tag = String(tags[i]).toLowerCase();
      for (var j = 0; j < LANGUAGES.length; j += 1) {
        if (tag.indexOf(LANGUAGES[j]) === 0) return LANGUAGES[j];
      }
    }
    return DEFAULT_LANGUAGE;
  }

  /**
   * Resolves one key for one language, falling back to the inline copy.
   *
   * @param key - the `data-i18n` key.
   * @param lang - the language code.
   * @param fallback - what the markup already contains.
   * @returns the string to show.
   */
  function resolve(key, lang, fallback) {
    var table = COPY[lang];
    if (table && typeof table[key] === 'string') return table[key];
    var base = COPY[DEFAULT_LANGUAGE];
    if (base && typeof base[key] === 'string') return base[key];
    return fallback;
  }

  /** @returns the BCP-47 tag for a language code, for the `lang` attribute. */
  function tagFor(lang) {
    return lang === 'zh' ? 'zh-CN' : lang;
  }

  /**
   * Applies one language to the whole document.
   *
   * @param lang - a language code present in the locale table.
   */
  function apply(lang) {
    var key = LANGUAGES.indexOf(lang) >= 0 ? lang : DEFAULT_LANGUAGE;
    root.setAttribute('lang', tagFor(key));

    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      var copyKey = node.getAttribute('data-i18n');
      if (copyKey === null) continue;
      var value = resolve(copyKey, key, node.textContent);
      if (node.tagName === 'TITLE') node.textContent = value;
      else node.textContent = value;
    }

    for (var m = 0; m < metaNodes.length; m += 1) {
      var meta = metaNodes[m];
      var metaKey = meta.getAttribute('data-i18n-content');
      if (metaKey === null) continue;
      meta.setAttribute('content', resolve(metaKey, key, meta.getAttribute('content') || ''));
    }

    for (var b = 0; b < buttons.length; b += 1) {
      buttons[b].setAttribute(
        'aria-pressed',
        buttons[b].getAttribute('data-lang') === key ? 'true' : 'false',
      );
    }

    // Element-level language, so screen readers and hyphenation follow the copy
    // even in the parts that are not translated.
    if (document.body !== null) document.body.setAttribute('lang', tagFor(key));

    try {
      localStorage.setItem(LANGUAGE_KEY, key);
    } catch (error) {
      /* private mode: the choice simply does not persist */
    }
  }

  for (var i = 0; i < buttons.length; i += 1) {
    buttons[i].addEventListener('click', function (event) {
      apply(event.currentTarget.getAttribute('data-lang'));
    });
  }

  var initial = storedLanguage();
  apply(initial !== null ? initial : browserLanguage());

  /**
   * Republishes the header height as `--header-h` so the sticky anchor strip sits
   * exactly under it. The header changes height with the viewport (it becomes two
   * rows on narrow screens) and with the language, so it is measured rather than
   * hard-coded.
   */
  (function trackHeaderHeight() {
    var header = document.querySelector('header.top');
    if (header === null) return;
    var applyHeight = function () {
      var height = Math.round(header.getBoundingClientRect().height);
      root.style.setProperty('--header-h', height + 'px');
    };
    applyHeight();
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(applyHeight).observe(header);
    } else {
      window.addEventListener('resize', applyHeight);
    }
  })();

  // ---------------------------------------------------------------- chrome --

  /**
   * Marks the navigation link that points at this document.
   *
   * The builder already marks the four canonical URLs; this also covers the
   * `index.html` spelling of the home page and keeps header and footer in step.
   */
  (function markCurrentPage() {
    var here = location.pathname.replace(/index\.html$/, '');
    var links = document.querySelectorAll('header.top nav.pages a, footer a');
    for (var i = 0; i < links.length; i += 1) {
      var href = links[i].getAttribute('href') || '';
      if (href.charAt(0) === '#' || /^https?:/.test(href)) continue;
      var target = new URL(href, location.href).pathname.replace(/index\.html$/, '');
      if (target === here) links[i].setAttribute('aria-current', 'page');
    }
  })();

  /**
   * Highlights the first token of a shell line so a long command is scannable.
   * Purely decorative: the text is already there.
   */
  (function highlightCommands() {
    var codes = document.querySelectorAll('.term pre code, pre.shell code');
    for (var i = 0; i < codes.length; i += 1) {
      var code = codes[i];
      if (code.getAttribute('data-plain') === 'yes') continue;
      var html = code.innerHTML;
      // Only the leading command of a line, and never inside an existing tag.
      code.innerHTML = html.replace(
        /(^|\n)([a-z][\w.-]*)(?= )/g,
        function (match, lead, word) {
          return lead + '<span class="tok-cmd">' + word + '</span>';
        },
      );
    }
  })();

  /**
   * Keeps the active anchor visible in the strip as the reader scrolls past the
   * sections. On desktop the strip is a vertical column, where `inline: center`
   * would scroll sideways for no reason, so the axis follows the layout.
   */
  (function followSections() {
    var strip = document.querySelector('.anchors');
    if (strip === null || !('IntersectionObserver' in window)) return;
    var links = Array.prototype.slice.call(strip.querySelectorAll('a[href^="#"]'));
    if (links.length === 0) return;
    var byId = {};
    var targets = [];
    for (var i = 0; i < links.length; i += 1) {
      var id = links[i].getAttribute('href').slice(1);
      var section = document.getElementById(id);
      if (section === null) continue;
      byId[id] = links[i];
      targets.push(section);
    }
    var observer = new IntersectionObserver(
      function (entries) {
        for (var e = 0; e < entries.length; e += 1) {
          if (!entries[e].isIntersecting) continue;
          var link = byId[entries[e].target.id];
          if (link === undefined) continue;
          for (var l = 0; l < links.length; l += 1) links[l].removeAttribute('aria-current');
          link.setAttribute('aria-current', 'true');
        }
      },
      { rootMargin: '-72px 0px -70% 0px', threshold: 0 },
    );
    for (var t = 0; t < targets.length; t += 1) observer.observe(targets[t]);
  })();
})();
