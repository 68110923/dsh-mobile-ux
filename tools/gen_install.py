#!/usr/bin/env python3
"""Deprecated: the install page is now built by `tools/site/build.py`.

This file used to generate `docs/install.html` from one big inline spec. The site
has three pages that share a header, a menu, a footer and a locale table, so all
of them are built together now, from `tools/site/body/*.body.html` plus
`tools/site/locales/*.json`.

Kept as a forwarding stub so an old note or script that calls it still works and
prints where to go, instead of silently writing a second, divergent install page.
"""
from pathlib import Path
import runpy

target = Path(__file__).resolve().parent / 'site' / 'build.py'
print(f'gen_install.py is deprecated; running {target.relative_to(Path.cwd()) if target.is_relative_to(Path.cwd()) else target}')
runpy.run_path(str(target), run_name='__main__')
