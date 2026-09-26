# Builds docs/install.html from a compact spec, so the bilingual copy stays in
# one readable place and the two language trees are generated together.
from html import escape
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'docs' / 'install.html'

def t(zh, en, tag="span"):
    """A node whose text switches with the language."""
    return f'<{tag} data-zh="{escape(zh, quote=True)}" data-en="{escape(en, quote=True)}">{zh}</{tag}>'

def term(lines, title=None, chip=None, title_bilingual=None, chip_bilingual=None):
    """A terminal-style block. `lines` is raw HTML for the body."""
    if title_bilingual:
        label = t(title_bilingual[0], title_bilingual[1])
    else:
        label = escape(title or "")
    if chip_bilingual:
        badge = t(chip_bilingual[0], chip_bilingual[1])
    else:
        badge = escape(chip or "")
    bar = ('<div class="bar"><span class="dots"><i></i><i></i><i></i></span>'
           f'<span class="file">{label}</span><span class="chip">{badge}</span></div>')
    return f'<div class="term">{bar}<pre><code>{lines}</code></pre></div>'

def shell(lines):
    return f'<pre class="shell"><code>{lines}</code></pre>'

def li(items):
    return "".join(f"<li>{x}</li>" for x in items)

C = '<span class="c">'
CEND = '</span>'

# ---------------------------------------------------------------- page body --
body = []
A = body.append

A(f'''      <div class="hero">
        <p class="eyebrow" data-zh="安装指南" data-en="Install guide">安装指南</p>
        <h1 data-zh="把这个插件装到你的 DSH 上" data-en="Install this plugin on your own DSH">把这个插件装到你的 DSH 上</h1>
        <p class="lead" data-zh="一条命令，不需要构建、不需要服务端组件、不需要改产品源码。装完重启 dsh web 并刷新页面即可，卸载同样是一条命令。"
           data-en="One command. No build step, no server component, no product source changes. Restart dsh web and refresh; removing it is one command too.">一条命令，不需要构建、不需要服务端组件、不需要改产品源码。装完重启 dsh web 并刷新页面即可，卸载同样是一条命令。</p>
        <ul class="pills">
          <li data-zh="Node ≥ 22" data-en="Node ≥ 22">Node ≥ 22</li>
          <li data-zh="DSH Web profile（0.1.x）" data-en="DSH web profile (0.1.x)">DSH Web profile（0.1.x）</li>
          <li data-zh="纯客户端 · 无构建" data-en="client-side only · no build">纯客户端 · 无构建</li>
          <li>MIT</li>
        </ul>
        {shell('<span class="tok-cmd">dsh</span> plugin --profile web add github:68110923/dsh-mobile-ux')}
      </div>''')

# ---- requirements ----
A(f'''      <section id="req">
        <h2 data-zh="开始之前" data-en="Before you start">开始之前</h2>
        <p class="sub" data-zh="三条自查，都不满足的话先补齐再装。"
           data-en="Three checks. Fix any that fail before installing.">三条自查，都不满足的话先补齐再装。</p>
        <div class="cards">
          <div class="card">
            <h3 data-zh="有 dsh CLI 且能启动 Web profile" data-en="A dsh CLI that can boot a web profile">有 dsh CLI 且能启动 Web profile</h3>
            <p class="scope" data-zh="dsh --version" data-en="dsh --version">dsh --version</p>
            <ul>{li([
              t("插件装进的是 profile，所以该 profile 必须已经能跑起来", "Plugins install into a profile, so that profile has to boot first"),
              t("本项目在 DSH 0.1.7-rc.1 上实测；0.1.x 系列预期可用", "Tested on DSH 0.1.7-rc.1; other 0.1.x releases are expected to work"),
            ])}</ul>
          </div>
          <div class="card">
            <h3 data-zh="Node ≥ 22" data-en="Node ≥ 22">Node ≥ 22</h3>
            <p class="scope" data-zh="dsh 自带 pnpm" data-en="pnpm ships with dsh">dsh 自带 pnpm</p>
            <ul>{li([
              t("dsh plugin 底层是 pnpm，由 dsh 自己的运行时提供，不必单独装", "dsh plugin delegates to pnpm, provided by dsh's own runtime"),
              t("若报 spawn pnpm ENOENT，说明 dsh 的 bin 目录不在 PATH 里", "A spawn pnpm ENOENT error means dsh's bin directory is not on PATH"),
            ])}</ul>
          </div>
          <div class="card">
            <h3 data-zh="能连 GitHub 或 npm" data-en="Network access to GitHub or npm">能连 GitHub 或 npm</h3>
            <p class="scope" data-zh="github: 安装需要 git + HTTPS" data-en="a github: install needs git over HTTPS">github: 安装需要 git + HTTPS</p>
            <ul>{li([
              t("内网机器可以先在有网的地方 git clone，再按「方案 C」从目录装", "On an offline box, clone the repo elsewhere and use method C"),
              t("npm 镜像会拖慢或挡住 GitHub 依赖，必要时显式指定官方源", "A registry mirror can stall a GitHub dependency; point at the official registry if needed"),
            ])}</ul>
          </div>
        </div>
        <div class="note">
          <p data-zh="下文一律用 profile 名 web；你的 profile 叫别的名字就替换掉它。"
             data-en="The examples use the profile name web; substitute your own if it differs.">下文一律用 profile 名 web；你的 profile 叫别的名字就替换掉它。</p>
        </div>
      </section>''')

# ---- method A: github ----
A(f'''      <section id="github">
        <h2 data-zh="方案 A：直接从 GitHub 安装（推荐）" data-en="Method A: install straight from GitHub (recommended)">方案 A：直接从 GitHub 安装（推荐）</h2>
        <p class="sub" data-zh="不需要发布到 npm，也不需要手动拷文件。已实测走通。"
           data-en="No npm publish and no manual copying required. Verified end to end.">不需要发布到 npm，也不需要手动拷文件。已实测走通。</p>
        <div class="plan">
          <header><span class="num">1</span>
            <h3 data-zh="一条命令装进 profile" data-en="Install it into the profile">一条命令装进 profile</h3>
            <span class="badge">github:</span>
          </header>
          <div class="body">
            {term('<span class="tok-cmd">dsh</span> plugin --profile web add github:68110923/dsh-mobile-ux', title_bilingual=("你的电脑", "your machine"), chip="pnpm")}
            <ul class="plain">{li([
              t("pnpm 会拉取仓库并把它登记进 profile 的 dependencies 与 dsh.profile.bundles", "pnpm fetches the repo and registers it in the profile's dependencies and dsh.profile.bundles"),
              t("需要固定版本时可以写 github:68110923/dsh-mobile-ux#v2.0.0（打标签后）", "To pin a revision, use github:68110923/dsh-mobile-ux#v2.0.0 once a tag exists"),
              t("想跟随 main 上的新提交：装完执行 dsh plugin --profile web update dsh-mobile-ux", "To follow new commits on main, run dsh plugin --profile web update dsh-mobile-ux"),
            ])}</ul>
          </div>
        </div>
        <div class="plan">
          <header><span class="num">2</span>
            <h3 data-zh="重启 dsh web" data-en="Restart dsh web">重启 dsh web</h3>
            <span class="badge" data-zh="必须" data-en="mandatory">必须</span>
          </header>
          <div class="body">
            {term('<span class="tok-cmd">systemctl</span> restart dsh-web   ' + C + '# 或用你自己托管 dsh web 的方式' + CEND, title_bilingual=("服务器", "server"), chip="systemctl")}
            <div class="note danger">
              <p data-zh="不重启等于没装：DSH 用文件 mtime/ctime/size 算 bundle 版本号，响应头又是 immutable 一年缓存。不重启则磁盘上是新的、服务端也可能返回新内容，但浏览器仍执行旧代码。"
                 data-en="Installing without restarting looks like nothing happened: DSH derives bundle revisions from file mtime/ctime/size and caches responses as immutable for a year, so the browser keeps running the old code.">不重启等于没装：DSH 用文件 mtime/ctime/size 算 bundle 版本号，响应头又是 <code>immutable</code> 一年缓存。不重启则磁盘上是新的、服务端也可能返回新内容，但浏览器仍执行旧代码。</p>
            </div>
          </div>
        </div>
        <div class="plan">
          <header><span class="num">3</span>
            <h3 data-zh="强制刷新页面" data-en="Hard-refresh the page">强制刷新页面</h3>
            <span class="badge" data-zh="电脑 / 手机都行" data-en="desktop or phone">电脑 / 手机都行</span>
          </header>
          <div class="body">
            <ul class="plain">{li([
              t("电脑：Ctrl/Cmd + Shift + R", "Desktop: Ctrl/Cmd + Shift + R"),
              t("iPhone Safari：下拉刷新，或关掉标签页重新打开", "iPhone Safari: pull to refresh, or close the tab and reopen"),
              t("装到主屏幕的独立窗口：从任务切换器划掉再重开", "A home-screen standalone window: swipe it away and reopen"),
            ])}</ul>
          </div>
        </div>
      </section>''')

# ---- method B: npm ----
A(f'''      <section id="npm">
        <h2 data-zh="方案 B：从 npm 安装（暂不可用）" data-en="Method B: install from npm (not available yet)">方案 B：从 npm 安装（暂不可用）</h2>
        <p class="sub" data-zh="本包尚未发布到 npm。下面是发布后会变成的样子，以及目前卡在哪里。"
           data-en="This package is not on npm yet. Below is how it will work once it is, and what is blocking it today.">本包尚未发布到 npm。下面是发布后会变成的样子，以及目前卡在哪里。</p>
        <div class="plan">
          <header><span class="num">1</span>
            <h3 data-zh="发布后会是这样" data-en="Once published, it will look like this">发布后会是这样</h3>
            <span class="badge">npm</span>
          </header>
          <div class="body">
            {term('<span class="tok-cmd">dsh</span> plugin --profile web add @yourscope/dsh-mobile-ux\\n<span class="tok-cmd">systemctl</span> restart dsh-web', chip="terminal")}
            <ul class="plain">{li([
              t("包名会带发布者的作用域，装起来比走 GitHub 快，也不依赖 GitHub 可达", "The name will carry the publisher's scope; installing is faster than GitHub and does not depend on GitHub being reachable"),
              t("registry 是镜像时新版本可能还没同步，加 --registry=https://registry.npmjs.org/", "On a registry mirror a fresh version may not be synced; add --registry=https://registry.npmjs.org/"),
            ])}</ul>
          </div>
        </div>
        <div class="plan">
          <header><span class="num">2</span>
            <h3 data-zh="目前卡在哪里" data-en="What is blocking it today">目前卡在哪里</h3>
            <span class="badge" data-zh="发布方的问题" data-en="publisher side">发布方的问题</span>
          </header>
          <div class="body">
            <p data-zh="发布者的 npm 账号启用了安全密钥型的 2FA（Auth &amp; Writes），而这台服务器没有 TOTP 验证器；npm 对这类账号要求发布时必须提供 OTP，或使用能绕过 2FA 的 token。已实测三种写法（granular token、无作用域包、组织 scope）均被 registry 拒绝。"
               data-en="The publisher's npm account uses a security-key form of 2FA (Auth &amp; Writes) while this server has no TOTP authenticator, and npm demands an OTP — or a 2FA-bypassing token — for publishing. Three attempts (granular token, unscoped package, organization scope) were all rejected by the registry.">发布者的 npm 账号启用了安全密钥型的 2FA（Auth &amp; Writes），而这台服务器没有 TOTP 验证器；npm 对这类账号要求发布时必须提供 OTP，或使用能绕过 2FA 的 token。已实测三种写法均被 registry 拒绝。</p>
            <ul class="plain">{li([
              t("对使用者没有影响：方案 A 装的是一模一样的包，已验证逐字节一致", "Users are unaffected: method A installs the very same package, verified byte for byte"),
              t("将来要发 npm，改用 GitHub Actions + Trusted Publishing（OIDC）即可完全绕开 token 与 OTP", "To publish later, GitHub Actions with Trusted Publishing (OIDC) sidesteps both tokens and OTPs"),
            ])}</ul>
          </div>
        </div>
      </section>''')

# ---- method C: local / offline ----
A(f'''      <section id="local">
        <h2 data-zh="方案 C：本地目录 / 离线安装" data-en="Method C: local directory or offline">方案 C：本地目录 / 离线安装</h2>
        <p class="sub" data-zh="不想依赖 GitHub，或者机器不能出网时用这个。"
           data-en="Use this when GitHub is not an option or the machine has no outbound network.">不想依赖 GitHub，或者机器不能出网时用这个。</p>
        <div class="plan">
          <header><span class="num">1</span>
            <h3 data-zh="把仓库拷到服务器上" data-en="Copy the repo onto the server">把仓库拷到服务器上</h3>
            <span class="badge" data-zh="任选一种" data-en="pick one">任选一种</span>
          </header>
          <div class="body">
            {term('<span class="tok-cmd">git</span> clone https://github.com/68110923/dsh-mobile-ux /opt/dsh-mobile-ux\\n' + C + '# 或从本地机器上传：' + CEND + '\\n<span class="tok-cmd">scp</span> -r ./dsh-mobile-ux root@SERVER_IP:/opt/', title_bilingual=("服务器", "server"), chip="clone")}
          </div>
        </div>
        <div class="plan">
          <header><span class="num">2</span>
            <h3 data-zh="按目录安装并重启" data-en="Install from the directory and restart">按目录安装并重启</h3>
            <span class="badge">link:</span>
          </header>
          <div class="body">
            {term('<span class="tok-cmd">dsh</span> plugin --profile web add /opt/dsh-mobile-ux\\n<span class="tok-cmd">systemctl</span> restart dsh-web', chip="terminal")}
            <ul class="plain">{li([
              t("按目录安装是 link（软链）语义：改完源码只要重启 dsh-web 即生效，不用重装", "A directory install is a symlink: edit the source, restart dsh-web, done"),
              t("离线包也可以先在有网的机器执行 npm pack 生成 tgz，再 dsh plugin --profile web add ./dsh-mobile-ux-2.0.0.tgz", "For a fully offline box, npm pack elsewhere and install the resulting tgz"),
            ])}</ul>
          </div>
        </div>
      </section>''')

# ---- verify ----
A(f'''      <section id="verify">
        <h2 data-zh="装完怎么确认成功了" data-en="Confirming it worked">装完怎么确认成功了</h2>
        <p class="sub" data-zh="三层验证：装上了、服务认了、浏览器真的跑了。"
           data-en="Three layers: it is installed, the server resolved it, and the browser is actually running it.">三层验证：装上了、服务认了、浏览器真的跑了。</p>
        <ol class="steps">
          <li>
            <b data-zh="第一层：包在 profile 里" data-en="Layer 1: the package is in the profile">第一层：包在 profile 里</b>
            {term(C + '# 应该看到插件出现在 dependencies 与 bundles 里' + CEND + '\\n<span class="tok-cmd">cat</span> ~/.dsh/profiles/web/package.json', title_bilingual=("服务器", "server"), chip="cat")}
          </li>
          <li>
            <b data-zh="第二层：服务能解析它（这一步最容易被忽略）" data-en="Layer 2: the server can resolve it (the step people skip)">第二层：服务能解析它（这一步最容易被忽略）</b>
            {term(C + '# 组装配置里应出现插件的行；出现 skipping profile bundle 就是没解析到' + CEND + '\\n<span class="tok-cmd">dsh</span> --profile web --dump-config | grep -A2 mobile-keyboard-viewport\\n<span class="tok-cmd">journalctl</span> -u dsh-web --since "-5 min" | grep -c "skipping profile bundle"   ' + C + '# 期望 0' + CEND, title_bilingual=("服务器", "server"), chip="verify")}
          </li>
          <li>
            <b data-zh="第三层：浏览器控制台里摸得到它" data-en="Layer 3: the browser exposes it">第三层：浏览器控制台里摸得到它</b>
            <span data-zh="在装了插件的页面里打开控制台（手机可用 Safari 的「检查」或地址栏 javascript: 前缀），执行："
                   data-en="Open the console on the instrumented page (Safari's inspector, or prefix an address-bar snippet with javascript:) and run:">在装了插件的页面里打开控制台（手机可用 Safari 的「检查」或地址栏 <code>javascript:</code> 前缀），执行：</span>
            {term('typeof window.__dshMobileUx   ' + C + '# object 表示插件已执行' + CEND + '\\nwindow.__dshMobileUx.metrics()   ' + C + '# 打印可视视口、外壳高度等实时数据' + CEND, title_bilingual=("浏览器控制台", "browser console"), chip="console")}
          </li>
          <li>
            <b data-zh="肉眼验收（手机上最直观）" data-en="By eye, which is fastest on a phone">肉眼验收（手机上最直观）</b>
            <ul>{li([
              t("侧边栏浮在对话之上并带遮罩，点空白处收起", "The sidebar floats over the conversation with a scrim; tapping outside collapses it"),
              t("输入框底部按钮保持一行；设置面板全屏纵向", "The composer buttons stay on one row; settings is a full-screen column"),
              t("点输入框页面不放大；打字与回撤时输入框不掉到键盘后面", "Tapping the composer does not zoom; typing and backspace keep it above the keyboard"),
              t("点一个未选中的会话：单击即切换，且抽屉自动收起", "Tapping an unselected session switches in one tap and collapses the drawer"),
            ])}</ul>
          </li>
        </ol>
        <div class="note ok">
          <p data-zh="想要实时诊断面板，在页面地址后加 ?dshMobileUx=hud —— 左上角会出现 vvH / root / kb / lock 等读数，手机截图就能定位问题。"
             data-en="For a live readout, append ?dshMobileUx=hud to the page URL: vvH / root / kb / lock appear in the corner, and a phone screenshot is enough to diagnose.">想要实时诊断面板，在页面地址后加 <code>?dshMobileUx=hud</code> —— 左上角会出现 <code>vvH / root / kb / lock</code> 等读数，手机截图就能定位问题。</p>
        </div>
      </section>''')

# ---- switches & uninstall ----
A(f'''      <section id="switches">
        <h2 data-zh="不想全要？按需开关" data-en="Not all of it? Turn sections off">不想全要？按需开关</h2>
        <p class="sub" data-zh="装完就能用；下面是常用的两个开关，完整清单见首页。"
           data-en="It works as-is. These are the two switches people reach for; the full list is on the home page.">装完就能用；下面是常用的两个开关，完整清单见首页。</p>
        <div class="table-scroll">
          <table>
            <thead><tr>
              <th data-zh="用法" data-en="Usage">用法</th>
              <th data-zh="作用" data-en="Effect">作用</th>
            </tr></thead>
            <tbody>
              <tr><td><code>?dshMobileUx=hud</code></td>
                <td data-zh="左上角显示实时读数，排障用" data-en="Live readout in the corner, for debugging">左上角显示实时读数，排障用</td></tr>
              <tr><td><code>?dshMobileUx=0</code></td>
                <td data-zh="整包临时停用（不改安装状态）" data-en="Disable the whole pack for that page load, without uninstalling">整包临时停用（不改安装状态）</td></tr>
              <tr><td><code>?dshMobileUx=notap</code></td>
                <td data-zh="只关「单击切换会话」，保留其余两节" data-en="Keep everything except single-tap session switching">只关「单击切换会话」，保留其余两节</td></tr>
              <tr><td><code>?dshMobileUx=notrajectory</code></td>
                <td data-zh="关掉「轨迹打开即到最新」" data-en="Turn off the trajectory auto-scroll">关掉「轨迹打开即到最新」</td></tr>
              <tr><td><code>?dshMobileUx=nofont</code></td>
                <td data-zh="不做字号提升（关掉防聚焦缩放）" data-en="Skip the font-size raise (the focus-zoom guard)">不做字号提升（关掉防聚焦缩放）</td></tr>
            </tbody>
          </table>
        </div>
      </section>''')

A(f'''      <section id="uninstall">
        <h2 data-zh="卸载与升级" data-en="Uninstall and upgrade">卸载与升级</h2>
        <p class="sub" data-zh="完全可逆：插件只注入样式、挂监听器和几个内联样式，卸载时逐一还原。"
           data-en="Fully reversible: the plugin only injects styles, listeners and a few inline properties, and removes them all on unload.">完全可逆：插件只注入样式、挂监听器和几个内联样式，卸载时逐一还原。</p>
        <div class="cards">
          <div class="card">
            <h3 data-zh="卸载" data-en="Uninstall">卸载</h3>
            <p class="scope" data-zh="一条命令 + 重启" data-en="one command plus a restart">一条命令 + 重启</p>
            {term('<span class="tok-cmd">dsh</span> plugin --profile web remove dsh-mobile-ux\\n<span class="tok-cmd">systemctl</span> restart dsh-web', chip="terminal")}
          </div>
          <div class="card">
            <h3 data-zh="升级" data-en="Upgrade">升级</h3>
            <p class="scope" data-zh="必须用 update，add 不会更新" data-en="use update; add does not upgrade">必须用 update，add 不会更新</p>
            {term('<span class="tok-cmd">dsh</span> plugin --profile web update dsh-mobile-ux\\n<span class="tok-cmd">systemctl</span> restart dsh-web', chip="terminal")}
          </div>
        </div>
        <div class="note">
          <p data-zh="为什么 add 不行：从 git 安装的包会被锁在一个具体 commit 上。重复执行 add 时 pnpm 认为 spec 没变，直接打印 Lockfile is up to date, resolution step is skipped 就结束了 —— 文件一个字节都不会变。update 才会重新解析该依赖并拉取远端最新 commit。"
             data-en="Why add is not enough: a git-installed package is pinned to one commit. On a second add, pnpm sees an unchanged specifier, prints “Lockfile is up to date, resolution step is skipped” and stops — not a byte changes. update re-resolves the dependency and fetches the newest commit.">为什么 <code>add</code> 不行：从 git 安装的包会被锁在一个具体 commit 上。重复执行 <code>add</code> 时 pnpm 认为 spec 没变，直接打印 <code>Lockfile is up to date, resolution step is skipped</code> 就结束了 —— 文件一个字节都不会变。<code>update</code> 才会重新解析该依赖并拉取远端最新 commit。</p>
        </div>
      </section>''')

# ---- troubleshooting ----
A(f'''      <section id="trouble">
        <h2 data-zh="安装期排错" data-en="Install-time troubleshooting">安装期排错</h2>
        <p class="sub" data-zh="按报错原文找就行。"
           data-en="Find your error text below.">按报错原文找就行。</p>
        <div class="table-scroll">
          <table>
            <thead><tr>
              <th data-zh="报错 / 现象" data-en="Error or symptom">报错 / 现象</th>
              <th data-zh="原因与处理" data-en="Cause and fix">原因与处理</th>
            </tr></thead>
            <tbody>
              <tr>
                <td><code>spawn pnpm ENOENT</code></td>
                <td data-zh="dsh 找不到自己的 pnpm。把 dsh 的 bin 目录加进 PATH 后重试（本机为 ~/.hermes/node/bin）。"
                       data-en="dsh cannot find its bundled pnpm. Put dsh's bin directory on PATH and retry.">dsh 找不到自己的 pnpm。把 dsh 的 bin 目录加进 PATH 后重试（本机为 <code>~/.hermes/node/bin</code>）。</td>
              </tr>
              <tr>
                <td><code>skipping profile bundle</code></td>
                <td data-zh="bundle 没能从 profile 的 node_modules 解析出来：确认包已装在同一个 profile 下，然后重启 dsh web。"
                       data-en="The bundle could not be resolved from the profile's node_modules: confirm it is installed into that same profile, then restart dsh web.">bundle 没能从 profile 的 node_modules 解析出来：确认包已装在同一个 profile 下，然后重启 dsh web。</td>
              </tr>
              <tr>
                <td data-zh="装完界面毫无变化" data-en="Nothing changed after installing">装完界面毫无变化</td>
                <td data-zh="九成是没重启 dsh-web，或者页面没硬刷新（immutable 缓存）。"
                       data-en="Almost always a missing dsh-web restart or a page that was not hard-refreshed (immutable cache).">九成是没重启 dsh-web，或者页面没硬刷新（immutable 缓存）。</td>
              </tr>
              <tr>
                <td><code>404 Not Found - PUT .../dsh-mobile-ux</code></td>
                <td data-zh="包尚未发布到 npm（见方案 B），改用方案 A 从 GitHub 安装。"
                       data-en="The package is not on npm yet (see method B); use method A from GitHub.">包尚未发布到 npm（见方案 B），改用方案 A 从 GitHub 安装。</td>
              </tr>
              <tr>
                <td><code>Failed to connect to github.com</code></td>
                <td data-zh="网络到 GitHub 不通：改用 npm 方案，或按方案 C 从目录安装。"
                       data-en="No route to GitHub: use the npm method, or method C from a local directory.">网络到 GitHub 不通：换 npm 方案，或按方案 C 从目录安装。</td>
              </tr>
              <tr>
                <td data-zh="插件在设置里显示为 failed" data-en="The plugin shows as failed in settings">插件在设置里显示为 failed</td>
                <td data-zh="apply() 执行时抛异常，不是依赖问题。看 journalctl -u dsh-web 里的堆栈，对照 client.js。"
                       data-en="apply() threw at runtime — this is not a dependency problem. Read the stack in journalctl -u dsh-web against client.js.">apply() 执行时抛异常，不是依赖问题。看 <code>journalctl -u dsh-web</code> 里的堆栈，对照 <code>client.js</code>。</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="note">
          <p data-zh="注意 cordis 的客户端 Context 是 Proxy：访问未声明的服务会直接抛错而不是返回 undefined。写插件时用 ctx.get() 可选查找，别写 ctx.styles 这种不存在的服务。"
             data-en="Remember that cordis' client Context is a Proxy: reaching for an undeclared service throws instead of returning undefined. Use ctx.get() for optional lookups, and never assume a service such as ctx.styles exists.">注意 cordis 的客户端 Context 是 Proxy：访问未声明的服务会直接抛错而不是返回 undefined。写插件时用 <code>ctx.get()</code> 可选查找，别写 <code>ctx.styles</code> 这种不存在的服务。</p>
        </div>
      </section>''')

html = f'''<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title data-zh="安装指南 — 把 dsh-mobile-ux 装到你的 DSH 上" data-en="Install guide — put dsh-mobile-ux on your own DSH">安装指南 — 把 dsh-mobile-ux 装到你的 DSH 上</title>
    <meta name="description" content="dsh-mobile-ux 的安装指南：从 GitHub、npm 或本地目录安装到 DSH Web profile，含三层验证、按需开关、卸载升级与安装期排错。" />
    <link rel="icon" href="./assets/icon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="./assets/site.css" />
  </head>
  <body>
    <a class="skip" href="#main" data-zh="跳到正文" data-en="Skip to content">跳到正文</a>

    <header class="top">
      <div class="wrap">
        <a class="brand" href="./" title="dsh-mobile-ux">
          <img src="./assets/icon.svg" alt="" aria-hidden="true" />
          <span class="name">dsh-mobile-ux</span>
        </a>
        <span class="navslot">
          <nav class="pages" aria-label="Pages / 页面">
            <a href="./" data-zh="首页" data-en="Home">首页</a>
            <a href="./install.html" data-zh="安装" data-en="Install">安装</a>
            <a href="./access.html" data-zh="接入" data-en="Access">接入</a>
          </nav>
          <span class="langs" role="group" aria-label="Language / 语言">
            <button type="button" data-lang="zh" aria-pressed="true">中文</button>
            <button type="button" data-lang="en" aria-pressed="false">EN</button>
          </span>
        </span>
      </div>
    </header>

    <nav class="anchors" aria-label="Sections / 本页导航">
      <ul>
        <li><a href="#req" data-zh="开始之前" data-en="Before you start">开始之前</a></li>
        <li><a href="#github" data-zh="GitHub 安装" data-en="From GitHub">GitHub 安装</a></li>
        <li><a href="#npm" data-zh="npm" data-en="npm">npm</a></li>
        <li><a href="#local" data-zh="本地/离线" data-en="Local / offline">本地/离线</a></li>
        <li><a href="#verify" data-zh="验证" data-en="Verify">验证</a></li>
        <li><a href="#switches" data-zh="开关" data-en="Switches">开关</a></li>
        <li><a href="#uninstall" data-zh="卸载升级" data-en="Uninstall">卸载升级</a></li>
        <li><a href="#trouble" data-zh="排错" data-en="Troubleshooting">排错</a></li>
      </ul>
    </nav>

    <main class="wrap" id="main">
{chr(10).join(body)}
    </main>

    <footer>
      <div class="wrap row">
        <a href="https://github.com/68110923/dsh-mobile-ux" data-zh="GitHub 仓库" data-en="GitHub repository">GitHub 仓库</a>
        <span class="sep">·</span>
        <a href="./access.html" data-zh="接入指南" data-en="Access guide">接入指南</a>
        <span class="sep">·</span>
        <a href="https://github.com/68110923/dsh-mobile-ux/blob/main/LICENSE">MIT License</a>
        <span class="sep">·</span>
        <span data-zh="命令里的 profile 名请替换成你自己的" data-en="Replace the profile name with your own">命令里的 profile 名请替换成你自己的</span>
      </div>
    </footer>

    <script src="./assets/site.js"></script>
  </body>
</html>
'''

OUT.write_text(html, encoding='utf-8')
print('install.html written:', len(html), 'bytes')
