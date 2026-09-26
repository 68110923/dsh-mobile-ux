#!/usr/bin/env python3
"""Builds every page of the dsh-mobile-ux site from one set of fragments.

Three things used to be duplicated per page and are now defined once:

* the header, the page menu and the footer — which is exactly how the menu lost
  its install-guide entry: the copies in `index.html` and `access.html` predated
  that page and never learned about it;
* the bilingual copy — every string now lives in `locales/<lang>.json` under a
  key, and the markup carries only the key. Editing a sentence is one edit in one
  file, and adding a language is one new JSON file;
* the anchor strip, whose entries come from the page table below.

Page bodies stay hand-written HTML in `body/<slug>.body.html`; they are content,
not chrome.

Usage:
    python3 tools/site/build.py            # write docs/*.html
    python3 tools/site/build.py --check    # report drift, write nothing
"""
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / 'docs'
HERE = Path(__file__).resolve().parent
BODY = HERE / 'body'
LOCALES = HERE / 'locales'

# The page menu, in order. `slug` doubles as the output file stem and the prefix
# of that page's locale keys.
PAGES = [
    {
        'slug': 'index',
        'href': './',
        'nav': 'nav.home',
        'in_nav': True,
        'anchors': [
            ('why', 'anchor.index.why'),
            ('features', 'anchor.index.features'),
            ('install', 'anchor.index.install'),
            ('switches', 'anchor.index.switches'),
            ('credits', 'anchor.index.credits'),
            ('limits', 'anchor.index.limits'),
        ],
    },
    {
        'slug': 'access',
        'href': './access.html',
        'nav': 'nav.access',
        'in_nav': True,
        'anchors': [
            ('prereq', 'anchor.access.prereq'),
            ('tunnel', 'anchor.access.tunnel'),
            ('nginx-ip', 'anchor.access.nginx-ip'),
            ('nginx-domain', 'anchor.access.nginx-domain'),
            ('mobile', 'anchor.access.mobile'),
            ('chooser', 'anchor.access.chooser'),
            ('trouble', 'anchor.access.trouble'),
        ],
    },
    {
        'slug': 'install',
        'href': './install.html',
        'nav': 'nav.install',
        'in_nav': True,
        'anchors': [
            ('req', 'anchor.install.req'),
            ('github', 'anchor.install.github'),
            ('npm', 'anchor.install.npm'),
            ('local', 'anchor.install.local'),
            ('verify', 'anchor.install.verify'),
            ('switches', 'anchor.install.switches'),
            ('uninstall', 'anchor.install.uninstall'),
            ('trouble', 'anchor.install.trouble'),
        ],
    },
]

VIEWPORT = 'width=device-width, initial-scale=1, viewport-fit=cover'


class Copy:
    """The locale files, resolved once per build."""

    def __init__(self, languages=('zh', 'en')):
        self.languages = languages
        self.tables = {
            lang: json.loads((LOCALES / f'{lang}.json').read_text(encoding='utf-8'))
            for lang in languages
        }

    def __call__(self, key, lang='zh'):
        """The copy for one key.

        A missing key is a build error rather than a blank spot in the page: the
        whole point of moving the strings here is that a stale key is noticed.
        """
        table = self.tables[lang]
        if key not in table:
            raise KeyError(f'no {lang} copy for key: {key}')
        return table[key]

    def attrs(self, key):
        """The `data-i18n` attribute plus the Chinese copy as inline fallback."""
        return f'data-i18n="{key}"'


def head(page, copy):
    return f'''<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="{VIEWPORT}" />
    <title {copy.attrs(f"{page['slug']}.title")}>{copy(f"{page['slug']}.title")}</title>
    <meta name="description" data-i18n-content="{page['slug']}.description" content="{copy(f"{page['slug']}.description")}" />
    <link rel="icon" href="./assets/icon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="./assets/site.css" />
  </head>
  <body>
    <a class="skip" href="#main" {copy.attrs('nav.skip')}>{copy('nav.skip')}</a>'''


def header(page, copy):
    """The site header, shared by every page.

    The menu lists every page with `in_nav`, so adding a page in one place is
    enough for it to appear everywhere. The current page is marked here rather
    than at runtime, so the menu is correct before any script runs.
    """
    items = []
    for other in PAGES:
        if not other['in_nav']:
            continue
        current = ' aria-current="page"' if other['slug'] == page['slug'] else ''
        items.append(
            f'            <a href="{other["href"]}" {copy.attrs(other["nav"])}{current}>'
            f'{copy(other["nav"])}</a>'
        )
    menu = '\n'.join(items)
    return f'''

    <header class="top">
      <div class="wrap">
        <a class="brand" href="./" title="dsh-mobile-ux">
          <img src="./assets/icon.svg" alt="" aria-hidden="true" />
          <span class="name">dsh-mobile-ux</span>
        </a>
        <span class="navslot">
          <nav class="pages" aria-label="{copy('nav.pages_label')}">
{menu}
          </nav>
          <span class="langs" role="group" aria-label="{copy('nav.language_label')}">
            <button type="button" data-lang="zh" aria-pressed="true">中文</button>
            <button type="button" data-lang="en" aria-pressed="false">EN</button>
          </span>
        </span>
      </div>
    </header>'''


def anchors(page, copy):
    """The in-page anchor strip: shared markup, page-specific entries."""
    items = '\n'.join(
        f'        <li><a href="#{anchor}" {copy.attrs(key)}>{copy(key)}</a></li>'
        for anchor, key in page['anchors']
    )
    return f'''

    <nav class="anchors" aria-label="{copy('nav.anchors_label')}">
      <ul>
{items}
      </ul>
    </nav>'''


def footer(page, copy):
    """The site footer, shared by every page.

    Every page links to every other page here as well as in the header: on a phone
    the footer is where a reader ends up after reading, and by then the header is a
    scroll away.
    """
    links = [
        '<a href="https://github.com/68110923/dsh-mobile-ux"'
        f' {copy.attrs("nav.repo")}>{copy("nav.repo")}</a>'
    ]
    for other in PAGES:
        if other['slug'] == page['slug'] or not other['in_nav']:
            continue
        links.append(
            f'<a href="{other["href"]}" {copy.attrs(other["nav"])}>{copy(other["nav"])}</a>'
        )
    links.append(
        '<a href="https://github.com/68110923/dsh-mobile-ux/blob/main/LICENSE">MIT License</a>'
    )
    note = f'{page["slug"]}.footer.note'
    links.append(f'<span {copy.attrs(note)}>{copy(note)}</span>')
    body = '\n        <span class="sep">·</span>\n        '.join(links)
    return f'''

    <footer>
      <div class="wrap row">
        {body}
      </div>
    </footer>

    <script src="./assets/locales.js"></script>
    <script src="./assets/site.js"></script>
  </body>
</html>
'''


def body(page):
    return (BODY / f'{page["slug"]}.body.html').read_text(encoding='utf-8')


def render(page, copy):
    main = body(page).rstrip('\n')
    return (
        head(page, copy)
        + header(page, copy)
        + anchors(page, copy)
        + f'\n\n    <main class="wrap" id="main">\n{main}\n    </main>'
        + footer(page, copy)
    )


def write_locales():
    """Publishes the locale tables for the browser to load.

    A JS file rather than JSON: the site is also opened straight from disk, and
    `fetch` on a `file://` URL is blocked while a script tag is not.
    """
    tables = {
        lang: json.loads((LOCALES / f'{lang}.json').read_text(encoding='utf-8'))
        for lang in ('zh', 'en')
    }
    lines = [
        '/* Generated by tools/site/build.py — edit tools/site/locales/*.json instead.',
        ' *',
        ' * Loaded as a script rather than fetched as JSON so the site also works when',
        ' * the HTML is opened from disk, where `fetch` is blocked by the file:// origin.',
        ' */',
        'window.__dshMobileUxCopy = {',
    ]
    for lang, table in tables.items():
        lines.append(f'  {json.dumps(lang)}: {{')
        for key, value in sorted(table.items()):
            lines.append(f'    {json.dumps(key)}: {json.dumps(value, ensure_ascii=False)},')
        lines.append('  },')
    lines.append('};')
    return '\n'.join(lines) + '\n'


def main():
    check = '--check' in sys.argv[1:]
    copy = Copy()
    changed = 0
    for page in PAGES:
        path = DOCS / f'{page["slug"]}.html'
        html = render(page, copy)
        before = path.read_text(encoding='utf-8') if path.exists() else None
        if before == html:
            print(f'unchanged  {path.name}')
            continue
        changed += 1
        if check:
            print(f'would change  {path.name}')
            continue
        path.write_text(html, encoding='utf-8')
        print(f'written    {path.name}  {len(html.encode("utf-8"))} bytes')

    locales_js = DOCS / 'assets' / 'locales.js'
    generated = write_locales()
    if not locales_js.exists() or locales_js.read_text(encoding='utf-8') != generated:
        changed += 1
        if not check:
            locales_js.write_text(generated, encoding='utf-8')
            print(f'written    assets/locales.js  {len(generated.encode("utf-8"))} bytes')

    if check:
        print('all pages up to date' if changed == 0 else f'{changed} file(s) out of date')


if __name__ == '__main__':
    main()
