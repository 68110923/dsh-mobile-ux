# 站点构建与维护

三个页面（首页 / 接入指南 / 安装指南）由**一份生成器**产出，只有正文是手写的。

```bash
python3 tools/site/build.py          # 重新生成 docs/*.html 与 docs/assets/locales.js
python3 tools/site/build.py --check  # 只报告哪些文件会变，不写盘
```

## 目录

| 路径 | 作用 |
|---|---|
| `build.py` | 生成器：页眉 / 菜单 / 页脚 / 锚点条 / 页面骨架的唯一来源 |
| `body/<页>.body.html` | 页面正文（手写 HTML），文案只写 `data-i18n="键"` |
| `locales/zh.json` / `locales/en.json` | **所有文案**，键 → 文本 |
| `extract_i18n.py` | 一次性迁移工具：把正文里的 `data-zh`/`data-en` 抽成键 + 词条 |
| `measure.mjs` | 用 CDP 量各尺寸下的真实几何（头部高度、横滚、行宽） |
| `text_snapshot.mjs` | 导出某语言的纯文本，用于对比改版前后文案有没有变 |

## 改文案

只动 `locales/*.json`，然后 `python3 tools/site/build.py`。

## 改页面结构

页眉、菜单、页脚、锚点条在 `build.py` 里改一次，三页同时生效。
页面列表本身也只在 `build.py` 的 `PAGES` 里。

## 加一种语言

1. 新建 `locales/<lang>.json`（可以复制 `zh.json` 再翻译）；
2. 在 `build.py` 的 `Copy()` 默认语言列表里加上它，在 `head()` 的 `lang` 属性里处理 BCP-47 映射；
3. `docs/assets/site.js` 会自动读 `window.__dshMobileUxCopy` 的全部语言，不用改。

## 为什么文案放在 JS 而不是 JSON 请求

`docs/assets/locales.js` 由构建生成。站点也要能直接从磁盘打开（`file://`），
而 `file://` 下 `fetch` 被浏览器拦掉、`<script>` 不会——所以词条以脚本形式发布。

## 生成物也要提交

`docs/assets/locales.js` 是构建产物，但**必须入库**：GitHub Pages 直接发布 `docs/` 目录，
不会在服务端跑构建。改完词条记得 `python3 tools/site/build.py` 并把它一起提交，
否则页面上的文案还是旧的。
