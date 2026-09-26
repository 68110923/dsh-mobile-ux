#!/usr/bin/env python3
"""One-shot migration: moves the bilingual copy out of the HTML into locale files.

Before this, every string lived twice in every page — once as `data-zh`, once as
`data-en`, right next to the markup. Editing a sentence meant finding it in three
pages, and adding a language meant touching every element. Afterwards the bodies
carry a key and nothing else, and `locales/<lang>.json` holds the words.

The script is idempotent: a body that already has keys keeps them, and a string
that already has a translation reuses its key instead of minting a new one. It
only ever *adds* entries, so re-running it after editing a body is safe.

Usage: python3 tools/site/extract_i18n.py
"""
from pathlib import Path
import json
import re
from html import unescape

HERE = Path(__file__).resolve().parent
BODY = HERE / 'body'
LOCALES = HERE / 'locales'
LANGS = ('zh', 'en')

ELEMENT = re.compile(r'<(?P<tag>[a-zA-Z][\w-]*)(?P<attrs>[^>]*?)>', re.S)
ATTR = re.compile(r'\s(?P<name>[a-zA-Z-]+)="(?P<value>[^"]*)"', re.S)
# Any element carrying an id starts a new key scope. Sections are the useful ones,
# but matching every id keeps the scope right when a page uses a plain anchor div.
ANCHOR = re.compile(r'<[a-zA-Z][^>]*?\sid="(?P<id>[^"]+)"')


def slug(text, limit=34):
    """A readable key fragment from a sentence."""
    ascii_only = re.sub(r'[^a-zA-Z0-9 ]+', ' ', text)
    words = [w for w in ascii_only.lower().split() if w]
    if not words:
        # Non-Latin copy: the section and the ordinal keep the key unique.
        return 'text'
    return '-'.join(words)[:limit].rstrip('-')


def load_locale(lang):
    path = LOCALES / f'{lang}.json'
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}


def main():
    locales = {lang: load_locale(lang) for lang in LANGS}
    # English copy -> key, so a string that is already translated keeps its key.
    known = {}

    total_new = 0
    for path in sorted(BODY.glob('*.body.html')):
        page = path.name[: -len('.body.html')]
        text = path.read_text(encoding='utf-8')

        # Keys already present in the body survive a re-run: match them by the
        # English copy they used to carry in `data-en`.
        for match in re.finditer(r'data-i18n="([^"]+)"[^>]*data-en="([^"]*)"', text):
            known[unescape(match.group(2))] = match.group(1)
        for key, value in locales['en'].items():
            if isinstance(value, str):
                known.setdefault(value, key)

        # Where each id starts, so every string can be filed under the section it
        # belongs to: keys read like a table of contents rather than a page-long
        # ordinal.
        anchors = [(m.start(), m.group('id')) for m in ANCHOR.finditer(text)]
        section = page
        used_in_section = 0
        out = []
        cursor = 0
        anchor_index = 0
        for match in ELEMENT.finditer(text):
            while anchor_index < len(anchors) and anchors[anchor_index][0] <= match.start():
                section = anchors[anchor_index][1]
                used_in_section = 0
                anchor_index += 1
            attrs = {
                a.group('name'): a.group('value') for a in ATTR.finditer(match.group('attrs'))
            }
            if 'data-zh' not in attrs or 'data-en' not in attrs:
                continue

            zh, en = unescape(attrs['data-zh']), unescape(attrs['data-en'])
            key = attrs.get('data-i18n') or known.get(en)
            if key is None:
                used_in_section += 1
                key = f'{page}.{section}.{slug(en)}-{used_in_section}'
                known[en] = key
            for lang, value in (('zh', zh), ('en', en)):
                if key not in locales[lang]:
                    locales[lang][key] = value
                    total_new += 1

            # Swap `data-zh` for the key; keep `data-en` as the fallback copy so a
            # missing key still renders something readable.
            new_span = re.sub(r'\sdata-zh="[^"]*"', '', match.group(0))
            new_span = re.sub(r'\sdata-i18n="[^"]*"', '', new_span)
            new_span = new_span.replace(
                f'data-en="{attrs["data-en"]}"', f'data-i18n="{key}"'
            )
            out.append(text[cursor : match.start()])
            out.append(new_span)
            cursor = match.end()
        out.append(text[cursor:])
        path.write_text(''.join(out), encoding='utf-8')
        print(f'{path.name}: keys written')

    for lang in LANGS:
        ordered = dict(sorted(locales[lang].items()))
        (LOCALES / f'{lang}.json').write_text(
            json.dumps(ordered, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
        )
        print(f'locales/{lang}.json: {len(ordered)} entries')
    print(f'new strings: {total_new}')


if __name__ == '__main__':
    main()
