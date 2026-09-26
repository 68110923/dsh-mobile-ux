# dsh-mobile-ux

**DSH Web 壳层的手机端体验优化插件。** 把窄屏布局修复、iOS 键盘/输入框跟随、侧边栏单击切换会话三件事合成一个纯客户端插件：不改壳层源码、桌面端零影响、装一个就够。

> 为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Web profile 编写，在 iPhone + Safari（iOS 17）上实测打磨。
>
> **在线介绍页：<https://68110923.github.io/dsh-mobile-ux/>**（`docs/` 目录，GitHub Pages，中英双语）
> **安装指南：<https://68110923.github.io/dsh-mobile-ux/install.html>**
> **接入指南：<https://68110923.github.io/dsh-mobile-ux/access.html>** —— 从电脑或手机用上服务器上的 dsh web：SSH 隧道 / nginx + IP / nginx + 域名 + TLS

---

### §4 轨迹面板打开即到最新

点「轨迹」时，面板会**自己滚到最新一条**。轨迹表是虚拟列表，行高要挂载后才稳定，产品内置的那一次"滚到底"经常落在中间，之后再没人纠正——于是你得往下翻半天。

实现按**意图**而不是按距离判断：面板出现后的 60/200/500/1000ms 各补一次到底（虚拟列表通过锚定最后一行），一旦检测到你**主动上滑**就立刻停手。上滑是要读历史，跟你抢滚动比原来的 bug 更糟。


## 安装（一条命令）

```bash
dsh plugin --profile web add github:68110923/dsh-mobile-ux
systemctl restart dsh-web          # 必须重启，见下
```

然后在电脑 / 手机上**强制刷新页面**即可。不需要构建、不需要服务端组件、不改产品源码，卸载同样是一条命令。

更完整的说明（npm 与离线安装、三层验证、安装期排错）见 **[安装指南](https://68110923.github.io/dsh-mobile-ux/install.html)**。

> ⚠️ **不重启等于没装**：DSH 用文件的 mtime/ctime/size 算 bundle 版本号，响应头又是 `immutable` 一年缓存 —— 磁盘上改了、服务端也可能返回新内容，但浏览器仍执行旧代码。

---

## 更新（重要：`add` 不会更新）

从 GitHub 安装的包被 pnpm 锁在一个具体 commit 上，**重复 `add` 不会拉到新代码** —— 它会打印 `Lockfile is up to date, resolution step is skipped` 然后什么都不做。要更新用 `update`：

```bash
dsh plugin --profile web update dsh-mobile-ux
systemctl restart dsh-web          # 然后硬刷新页面
```

| 命令 | 行为 |
|---|---|
| `dsh plugin --profile web add github:68110923/dsh-mobile-ux` | 首次安装用；已装过则**跳过解析**，不更新 |
| `dsh plugin --profile web update dsh-mobile-ux` | 重新解析该依赖，拉到远端最新 commit |
| `dsh plugin --profile web remove dsh-mobile-ux` | 卸载 |

> 更新之后同样要**重启 + 硬刷新**：DSH 的 bundle 版本号由文件 mtime/size 算出、响应头是 `immutable`，只更新文件不重启的话，浏览器仍执行旧代码。

## 它解决什么

DSH 的 Web 壳层是桌面优先的。在手机上用它，会依次撞到这几堵墙：

| # | 现象 | 根因 |
|---|---|---|
| 1 | 设置弹窗被压成一条缝、导航标签挤成一列 | 壳层没有 < 768px 的手机档 |
| 2 | 输入框底部的按钮折行、互相叠住 | 同上，composer 按桌面宽度排版 |
| 3 | 侧边栏一展开就把对话区挤到约 110px 宽 | 侧边栏是栅格列，不浮层 |
| 4 | **点击输入框，整页被放大，输入框看不见了** | 编辑器字号 14px，iOS Safari 对"聚焦时字号 < 16px"的可编辑元素会强制缩放整页 |
| 5 | **打字/回撤后，输入框掉到键盘后面** | 壳层高度是 `height: 100%`（= 布局视口），而 iOS 键盘是覆盖层，只缩小"视觉视口"；页面因此可滚，浏览器把输入框滚出了可视区 |
| 6 | 键盘收起后，输入框和键盘之间留一大段空白 | 键盘动画结束前测到的高度是过期值，之后再没有事件来纠正 |
| 7 | **侧边栏切换会话要点两次，而且不能快速双击** | 行本身是单击打开，但"重命名"挂在行内标题的**双击**上；手机上的第二次点击会被判定成双击，于是变成重命名 |

第 4–6 条是这个插件里唯一**必须靠真机实测**才能定下来的部分：每一条的修法都经过"改一版 → 手机上试 → 看数据 → 再改"，README 最后一节留了当时的判断依据。

## 三个能力（可分别开关）

### §1 窄屏布局（≤ 700px）

- 设置弹窗变全屏纵向布局，导航变成一行可横向滑动的标签
- 输入框底栏不换行：工具区可压缩、发送键不压缩
- 侧边栏**浮在对话之上**（栅格始终保持 56px 轨道，抽屉溢出覆盖），并给对话加一层遮罩
- 适配自 [`AcidGr/dsh-web-mobile-fix`](https://github.com/AcidGr/dsh-web-mobile-fix)（MIT），并参考了 [`TecFancy/dsh-mobile`](https://github.com/TecFancy/dsh-mobile)（MIT）的同类做法

### §2 iOS 键盘与可视视口

- **不改字号**：本插件不写任何 `font-size`。早先版本为了对抗 iOS 的聚焦缩放而把输入框字号提到 17px，那既改变了你没要求的外观，又和 DSH 自己的字号设置（12–17px）打架——已整段删除。iOS 聚焦缩放属于浏览器行为，若要压制，用下面的 `meta` 开关，且本插件不会替你做这个决定
- **输入框跟随键盘**：键盘打开时把外壳高度钉到 `visualViewport.height`（**只允许向下取整**，比可视区高 1px 就会让文档重新可滚，前功尽弃）
- **锁住文档滚动**：键盘打开期间 `html, body { overflow: hidden; overscroll-behavior: none }`，堵掉浏览器借页面滚动把输入框带走的那条路
- **键盘落定后补测**：focus 后按 100/250/500/900ms 补测几次，消掉键盘动画期间测到过期值留下的空白带
- **键盘判定不靠视口数值**：有些机器上键盘弹出时 `innerHeight` 和 `visualViewport.height` 都不变，所以以"可编辑元素获得焦点"为主信号、以可视区收缩为确认

### §3 单击切换会话

- **单击即切换，并自动收起抽屉**：手机上抽屉盖着的正是刚打开的那个会话，切完就退开才顺手（想连续切换可以关掉，见开关表）
- **单击即切换**，不必等双击判定窗口
- **快速双击不再触发重命名**（原先的第二次点击会落进标题的双击手势里）
- 实现方式：在 `pointerup` 捕获阶段先把这一行的 `onClick` 重新派发一次（**复用产品自己的打开逻辑，不重写会话语义**），随后 600ms 内吞掉同一行的 `dblclick`
- 收起抽屉用的是**抽屉自己的开合按钮**（`aria-label="Collapse sidebar"`），也就是用户本来会按的那个控件，走壳层真实代码路径；服务查找只作兜底
- 只在粗指针设备 + 窄屏生效，**桌面端双击重命名照旧**
- 项目/工作区分组行（`data-row-key` 形如 `project:…`）不参与，避免误判

## 安装

```bash
dsh plugin --profile web add github:68110923/dsh-mobile-ux
```

然后重启并按 Ctrl/Cmd + Shift + R 硬刷新：

```bash
systemctl restart dsh-web     # 或你的 dsh web 进程
```

> ⚠️ 改完插件**必须重启服务**：DSH 用文件 mtime/ctime/size 算 bundle 版本号，且响应头是 `immutable` 一年缓存——不重启的话浏览器永远拿不到新代码。

## 开关

手机是唯一能判断这些改动好坏的地方，所以每一节都能单独关掉。URL 参数 `?dshMobileUx=` 后接逗号分隔的值：

| 值 | 作用 |
|---|---|
| `0` / `off` | 整包不生效 |
| `layout` / `keyboard` / `tap` | **只**保留列出的这几节 |
| `nolayout` / `nokeyboard` / `notap` | 关掉列出的这几节 |
| `keepdrawer` | 单击切换后**不**自动收起侧边栏（默认会收起） |
| `notrajectory` | 关掉「轨迹打开即到最新」 |
| `nolock` | 键盘打开时不锁文档滚动 |
| `meta` | 额外把 `maximum-scale=1` 写进 viewport meta |
| `bottom` | 开启可视视口平移补偿（默认关，见下） |
| `hud` | 左上角显示实时读数 |

例：`?dshMobileUx=nokeyboard`、`?dshMobileUx=tap,hud`。也可以在加载前用 `window.__dshMobileUx = { keyboard: false }` 覆盖。

**为什么 `bottom` 默认关**：最初试过"把可视视口平移量加进外壳高度"来跟随 iOS 的平移，结果外壳比可视区高，输入框与键盘之间反而出现一条空白带。补偿只能让外壳**变矮**，不能变高，所以它现在是显式选项而不是默认行为。

**为什么 `meta` 默认关**：`maximum-scale=1` 会同时禁掉双指缩放，这是可访问性上的倒退，不该由页面替用户决定。加 `?dshMobileUx=meta` 可以开启——注意现代 iOS 对 `maximum-scale` 的支持并不稳定，不要把它当成"一定生效"的开关。

## 开发与验证

```bash
node tools/client.test.mjs     # 28 项纯逻辑断言
node --check client.js         # 语法
```

`tools/` 里另有几个用 CDP 直连无头 Chromium 的探针脚本（不改仓库、不装依赖，Node 22 自带 WebSocket）：测量真实 DOM 几何、模拟"可视区被裁"的键盘、验证滚动锁定没有破坏浮层定位。这些脚本是这个插件的来路：上面每一条结论都是用它们量出来的，而不是猜的。

## 参考项目与致谢

| 项目 | 用处 |
|---|---|
| [`AcidGr/dsh-web-mobile-fix`](https://github.com/AcidGr/dsh-web-mobile-fix) | §1 的原始实现（设置面板、浮层侧边栏、遮罩、点击外部收起），MIT |
| [`TecFancy/dsh-mobile`](https://github.com/TecFancy/dsh-mobile) | 手机档适配的另一种做法（断点层 + 状态桥 + `data-slot` 样式表），参考了它的取舍；MIT |
| [`langyo/dsh-mobile-upgrade`](https://github.com/langyo/dsh-mobile-upgrade) | 同类问题的另一种整理方式，安装/排错思路有参考 |
| [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) | 被适配的壳层本体；插件只锚在它的 `data-slot` 与类名前缀契约上 |

致谢以上作者。§1 的样式与 §3 的"点击外部收起侧边栏"逻辑直接源自 `dsh-web-mobile-fix`（MIT），本仓库在其基础上做了整合与修正；§2 是与真机一起磨出来的，没有上游可抄。

## 兼容性

- DSH Web profile，0.1.x 系列（在 `0.1.7-rc.1` 上实测）
- 选择器锚定产品的 `data-slot` 属性与 CSS Module 类名前缀（`_frame` / `_sidebarCol` / `_title` …）。这类契约在同版本线内稳定，**产品大改版后可能需要小改**
- 桌面端（≥ 1024px）：§1 不生效（媒体查询限定）、§3 不生效（粗指针限定）、§2 在非触屏上不做任何写入

## 已知边界

- **本插件不改任何文字大小**，字号完全由 DSH 自己的设置（12–17px）与产品样式决定。代价是：iOS 点输入框时浏览器仍可能把整页放大一点（输入框字号小于 16px 时的系统行为）。之所以不接管它，是因为"把字号改大"既改了外观又和系统设置冲突；能接受的话可用 `?dshMobileUx=meta` 尝试压制缩放。
- §3 目前只处理侧边栏会话列表的行；搜索结果的会话行走的是另一套标记，未纳入
- 插件不改任何产品源码，也不依赖服务端组件

## 安装来源说明

- **从 GitHub 安装（推荐）**：`dsh plugin --profile web add github:68110923/dsh-mobile-ux`
- **本地 / 离线**：`dsh plugin --profile web add /path/to/dsh-mobile-ux` —— 按目录安装是 `link:` 语义，改完源码重启即生效（上一条的 npm 方案未发布，见文末说明）
- **npm**：尚未发布。发布者的 npm 账号启用的是安全密钥型 2FA（Auth & Writes），而构建服务器没有 TOTP 验证器，npm 要求发布必须提供 OTP 或可绕过 2FA 的 token，三种写法实测均被 registry 拒绝。使用者不受影响——GitHub 安装拿到的是同一个包，已逐字节比对。将来要发 npm，走 GitHub Actions + Trusted Publishing（OIDC）即可完全绕开 token 与 OTP。

## License

MIT
