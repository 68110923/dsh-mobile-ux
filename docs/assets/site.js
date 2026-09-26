/**
 * dsh-mobile-ux — shared site script.
 *
 * Responsibilities, deliberately few:
 *
 *   1. Language switching. Two mechanisms coexist because they fit different
 *      shapes of content:
 *        - a text node inside a single element uses `data-zh` / `data-en`
 *          attributes, so the copy for both languages sits on one line and
 *          cannot drift apart;
 *        - a whole block of markup that differs structurally (a method with its
 *          own list and code sample) uses `data-lang-block="zh" | "en"`, and one
 *          of the two trees is hidden.
 *      Attributes are applied *after* the block toggle only inside the visible
 *      tree, so an element can never inherit the other language's text.
 *   2. Marking the current page in the header navigation.
 *   3. Small visual affordances: terminal blocks get their command token
 *      highlighted, and the anchor strip scrolls the active section into view.
 *
 * With JavaScript disabled the pages still render completely, in Chinese, with
 * every anchor and both language blocks visible.
 */
(function () {
  var LANGUAGE_KEY = 'dsh-mobile-ux:lang';
  var root = document.documentElement;
  var buttons = Array.prototype.slice.call(document.querySelectorAll('.langs button'));
  var nodes = Array.prototype.slice.call(document.querySelectorAll('[data-zh][data-en]'));
  var blocks = Array.prototype.slice.call(document.querySelectorAll('[data-lang-block]'));

  /** @returns the stored preference, or null. */
  function storedLanguage() {
    try {
      var value = localStorage.getItem(LANGUAGE_KEY);
      return value === 'zh' || value === 'en' ? value : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Applies one language to the whole document.
   *
   * @param lang - 'zh' or 'en'.
   */
  function apply(lang) {
    var key = lang === 'en' ? 'en' : 'zh';
    root.setAttribute('lang', key === 'en' ? 'en' : 'zh-CN');

    // 1. Structural blocks first: deciding what is visible before rewriting text
    //    keeps the two mechanisms from fighting over the same node.
    for (var b = 0; b < blocks.length; b += 1) {
      var block = blocks[b];
      var blockLang = block.getAttribute('data-lang-block');
      var hidden = blockLang !== key;
      block.hidden = hidden;
      if (hidden) block.setAttribute('aria-hidden', 'true');
      else block.removeAttribute('aria-hidden');
    }

    // 2. Attribute-based copy, skipping anything inside a hidden block.
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      if (node.closest('[data-lang-block][hidden]') !== null) continue;
      var value = node.getAttribute('data-' + key);
      if (value === null) continue;
      if (node.tagName === 'TITLE') node.textContent = value;
      else node.innerHTML = value;
    }

    for (var j = 0; j < buttons.length; j += 1) {
      buttons[j].setAttribute(
        'aria-pressed',
        buttons[j].getAttribute('data-lang') === key ? 'true' : 'false',
      );
    }

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
  if (initial !== null) apply(initial);
  else if (!/^zh/i.test(navigator.language || '')) apply('en');


  /**
   * Publishes the real header height as `--header-h` so the sticky anchor strip
   * sits exactly under it. The header changes height with the viewport (it
   * becomes two rows on narrow screens) and with the language, so this is
   * measured rather than hard-coded.
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
   * Marks the header link that points at this document.
   */
  (function markCurrentPage() {
    var here = location.pathname.replace(/index\.html$/, '');
    var links = document.querySelectorAll('header.top nav.pages a');
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
   * Keeps the active anchor visible in the horizontal strip as the reader
   * scrolls past the sections.
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
          if (typeof link.scrollIntoView === 'function') {
            link.scrollIntoView({ block: 'nearest', inline: 'center' });
          }
        }
      },
      { rootMargin: '-72px 0px -70% 0px', threshold: 0 },
    );
    for (var t = 0; t < targets.length; t += 1) observer.observe(targets[t]);
  })();
})();
