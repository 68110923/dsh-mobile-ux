# dsh-mobile-ux

**DSH Web 壳层的手机端体验优化插件。** 把窄屏布局修复、iOS 键盘/输入框跟随、侧边栏单击切换会话、轨迹面板打开即到最新、页面缩放钉住五件事合成一个纯客户端插件：不改壳层源码、桌面端零影响、每一节都能单独关掉。

> 为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Web profile 编写，在 iPhone + Safari（iOS 17）上实测打磨。
>
> **在线介绍页：<https://68110923.github.io/dsh-mobile-ux/>**（`docs/` 目录，GitHub Pages，中英双语）
> **安装指南：<https://68110923.github.io/dsh-mobile-ux/install.html>**
> **接入指南：<https://68110923.github.io/dsh-mobile-ux/access.html>** —— 从电脑或手机用上服务器上的 dsh web：SSH 隧道 / nginx + IP / nginx + 域名 + TLS

---

### §4 轨迹面板打开即到最新

点「轨迹」时，面板会**自己滚到最新一条**。

**为什么手机上有问题、电脑上没有（这是关键线索）**：轨迹表是虚拟列表，行高与总高都要挂载后才稳定。手机上这个会话有 34 行虚拟行，定时补正跑完时列表**还在长高**，最后一次补正就把面板留在了当时的总高位置——实测停在 `scrollTop=365 / 最大 1013`，离底部 648px；桌面上行数少得多，最后一次补正之前早就稳定了，所以同一份代码在电脑上看起来是对的。

**做法**：两层配合。

1. **定时补正**（60/200/500/1000/1800ms）：快速覆盖常见情况
2. **逐帧看门狗**（约 2 秒）：每帧走一次到底，只要列表还在长高就跟上去

判断依据是**意图而不是距离**——面板一打开，补正就把滚动位置设到底了，而新行是**追加在下方**，此时"距底部多远"这个判据恰好不成立，所以不能用它。改为：打过一次到底就持续跟随，一旦检测到你**主动上滑**（滚轮事件且非本插件所致）立刻停手——上滑是要读历史，跟你抢滚动比原来的 bug 更糟。

开关：`?dshMobileUx=notrajectory`


### §1 窄屏布局（≤ 700px）

- 设置弹窗变全屏纵向布局，导航变成一行可横向滑动的标签
- 输入框底栏不换行：工具区可压缩、发送键不压缩
- 侧边栏**浮在对话之上**（栅格始终保持 56px 轨道，抽屉溢出覆盖），并给对话加一层遮罩
- 适配自 [`AcidGr/dsh-web-mobile-fix`](https://github.com/AcidGr/dsh-web-mobile-fix)（MIT），并参考了 [`TecFancy/dsh-mobile`](https://github.com/TecFancy/dsh-mobile)（MIT）的同类做法

### §2 iOS 键盘与可视视口

- **不改字号，改限制缩放**：本插件不写任何 `font-size`。iOS 会在聚焦小于 16px 的输入框时把整页放大，早先版本靠「把字号提到 17px」来对抗——那既改了你没要求的外观，又和 DSH 自己的字号设置（12–17px）打架，已整段删除。现在改为在 viewport meta 上钉 `maximum-scale=1`：不动任何文字大小，页面也不再被放大（实测可视高度从 345 恢复到 500）。不想要可用 `freezoom` 关掉
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
| `layout` / `keyboard` / `tap` / `trajectory` | **只**保留列出的这几节（白名单，见下方提醒） |
| `nolayout` / `nokeyboard` / `notap` / `notrajectory` | 关掉列出的这几节 |
| `keepdrawer` | 单击切换后**不**自动收起侧边栏（默认会收起） |
| `freezoom` / `nozoom` | 允许 / 禁止页面被放大（默认钉住缩放） |
| `nolock` | 键盘打开时不锁文档滚动 |
| `hud` | 左上角显示实时读数 |

例：`?dshMobileUx=nokeyboard`、`?dshMobileUx=nolayout,hud`。也可以在加载前用 `window.__dshMobileUxOptions = { keyboard: false }` 覆盖（**注意是 `…Options`**：`window.__dshMobileUx` 是插件自己的读数 API，写在另一个属性上，两者互不覆盖）。

> ⚠️ **白名单是排他的**：`?dshMobileUx=tap` 的含义是「**只**留单击切换」，连键盘跟随一起关掉。想让某一节失效请用 `no<节名>`。`hud` / `lock` / `zoom` 是修饰开关，不参与白名单，所以 `?dshMobileUx=tap,hud` 是安全的。

**为什么钉住缩放**：iOS 对小于 16px 的可编辑元素会在聚焦时放大整页，这是浏览器行为，无法靠布局纠正。能压住它的只有两个手段——改字号（已否决，那会覆盖产品与用户的设置）或限制缩放。后者不动任何文字大小，只限制缩放倍率，是唯一同时满足这两条的选择；代价是双指缩放也不再可用（`?dshMobileUx=freezoom` 可以换回来）。

**为什么让 `#root` 脱离文档流**：`#root` 是 `position: static` 的普通块，只改它的高度并不会让内容上移，而是**在文档下方留下可滚动余量**，平台为把光标滚进视野就会滚进这段余量——那正是「输入框与键盘之间一条空白带」的来源。键盘期把它设为 `position: fixed` 后余量归零，fixed 盒子无法被滚动，空白带从物理上无法产生，页脚自然贴在键盘上沿。

## 开发与验证

```bash
node tools/client.test.mjs     # 72 项纯逻辑断言
node --check client.js         # 语法
```

`tools/` 里另有几个用 CDP 直连无头 Chromium 的探针脚本（不改仓库、不装依赖，Node 22 自带 WebSocket）：测量真实 DOM 几何、模拟"可视区被裁"的键盘、验证滚动锁定没有破坏浮层定位。这些脚本是这个插件的来路：上面每一条结论都是用它们量出来的，而不是猜的。

其中两个是给**真浏览器验证**用的，也各自写清了**它们证不了什么**：

| 脚本 | 用途 | 证不了的 |
|---|---|---|
| `cdp-verify.mjs` | 打开运行中的 GUI，量 `visualViewport` / 外壳 / 输入框底边 / 文档余量 | 无头 Chromium 的 `Emulation` 会同时改两个视口，所以**造不出软键盘态**（那条路径由 `client.test.mjs` 的桩覆盖） |
| `cdp-switches.mjs` | 在页面脚本之前注入 `window.__dshMobileUxOptions`，验证每个开关真的改变了页面 | 本站**无法验证 URL 开关**：壳层在 token 校验时把查询串吃掉了，地址栏最终是 `/` |

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

- **本插件不改任何文字大小**，字号完全由 DSH 自己的设置（12–17px）与产品样式决定。页面放大是通过限制缩放倍率压制的（`maximum-scale=1`），代价是双指缩放一并失效；`?dshMobileUx=freezoom` 可换回双指缩放，代价是聚焦放大也会回来。
- §3 目前只处理侧边栏会话列表的行；搜索结果的会话行走的是另一套标记，未纳入
- 插件不改任何产品源码，也不依赖服务端组件

## 安装来源说明

- **从 GitHub 安装（推荐）**：`dsh plugin --profile web add github:68110923/dsh-mobile-ux`
- **本地 / 离线**：`dsh plugin --profile web add /path/to/dsh-mobile-ux` —— 按目录安装是 `link:` 语义，改完源码重启即生效（上一条的 npm 方案未发布，见文末说明）
- **npm**：尚未发布。发布者的 npm 账号启用的是安全密钥型 2FA（Auth & Writes），而构建服务器没有 TOTP 验证器，npm 要求发布必须提供 OTP 或可绕过 2FA 的 token，三种写法实测均被 registry 拒绝。使用者不受影响——GitHub 安装拿到的是同一个包，已逐字节比对。将来要发 npm，走 GitHub Actions + Trusted Publishing（OIDC）即可完全绕开 token 与 OTP。

## License

MIT
