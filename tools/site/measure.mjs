/**
 * Measures the site pages across phone, tablet and desktop viewports.
 *
 * Reports the numbers that decide whether the layout actually adapts: does the
 * header wrap, how much vertical space the sticky furniture eats, is anything
 * overflowing sideways, and how wide the text column ends up.
 *
 * Usage: node tools/site/measure.mjs <wsUrl> <fileUrlPrefix>
 */
const wsUrl = process.argv[2];
const prefix = process.argv[3];

const ws = new WebSocket(wsUrl);
let nextId = 1;
const pending = new Map();
const send = (method, params = {}) => {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => reject(new Error('timeout ' + method)), 20000);
  });
};
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id === undefined) return;
  const entry = pending.get(message.id);
  if (entry === undefined) return;
  pending.delete(message.id);
  if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
  else entry.resolve(message.result);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DEVICES = [
  ['iPhone SE', 320, 568, true],
  ['iPhone 12', 390, 844, true],
  ['iPhone Pro Max', 430, 932, true],
  ['iPad mini', 744, 1133, true],
  ['iPad Pro 11"', 834, 1194, true],
  ['笔记本', 1280, 800, false],
  ['桌面宽屏', 1680, 1050, false],
];

const PAGES = ['index.html', 'access.html', 'install.html'];

ws.addEventListener('open', async () => {
  try {
    await send('Page.enable');
    await send('Runtime.enable');
    const evaluate = async (expression) => {
      const r = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
      return r.result.value;
    };

    for (const [label, width, height, mobile] of DEVICES) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile,
      });
      await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 5 });
      console.log(`\n=== ${label}  ${width}×${height} ===`);
      for (const page of PAGES) {
        await send('Page.navigate', { url: `${prefix}/${page}` }).catch(() => {});
        await sleep(700);
        const raw = await evaluate(`(() => {
          const de = document.documentElement;
          const header = document.querySelector('header.top');
          const strip = document.querySelector('.anchors');
          const main = document.getElementById('main');
          const hero = document.querySelector('.hero');
          const hr = header.getBoundingClientRect();
          const sr = strip.getBoundingClientRect();
          const mr = main.getBoundingClientRect();
          const navLinks = [...document.querySelectorAll('header.top nav.pages a')];
          const navW = navLinks.reduce((sum, a) => sum + a.getBoundingClientRect().width, 0);
          const navBox = document.querySelector('header.top nav.pages').getBoundingClientRect();
          // Overflow inside a deliberately scrollable container is fine (tables,
          // code blocks); what matters is content that escapes its box and forces
          // the whole document to scroll sideways.
          const escaped = [...document.querySelectorAll('main *')]
            .filter((el) => {
              for (let p = el.parentElement; p !== null; p = p.parentElement) {
                const o = getComputedStyle(p).overflowX;
                if (o === 'auto' || o === 'scroll' || o === 'hidden') return false;
              }
              return true;
            })
            .map((el) => el.getBoundingClientRect().right)
            .reduce((max, right) => Math.max(max, right), 0);
          const bubbles = [...document.querySelectorAll('main *')]
            .filter((el) => getComputedStyle(el).overflowX === 'auto' || getComputedStyle(el).overflowX === 'scroll');
          const bubbleOverflow = bubbles
            .map((el) => Math.round(el.scrollWidth - el.clientWidth))
            .reduce((max, value) => Math.max(max, value), 0);
          const bubbleTight = bubbles.some((el) => el.scrollWidth > el.clientWidth + 1);
          // Pick the widest text paragraph, so the reading measure is measured on
          // prose rather than on a two-word label.
          const para = [...document.querySelectorAll('main p')]
            .filter((el) => el.textContent.trim().length > 60)
            .sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0] ?? null;
          const lineWidth = para ? Math.round(para.getBoundingClientRect().width) : 0;
          const lineChars = para
            ? Math.round(lineWidth / (parseFloat(getComputedStyle(para).fontSize) * 0.5))
            : 0;
          return JSON.stringify({
            docScrollW: de.scrollWidth,
            viewportW: window.innerWidth,
            hScroll: de.scrollWidth > window.innerWidth + 1,
            headerH: Math.round(hr.height),
            stripH: Math.round(sr.height),
            stripTop: Math.round(sr.top),
            stickyTotal: Math.round(sr.bottom),
            mainTop: Math.round(mr.top),
            mainW: Math.round(mr.width),
            heroTitleSize: hero ? getComputedStyle(hero.querySelector('h1')).fontSize : null,
            scrollMargin: getComputedStyle(document.querySelector('section')).scrollMarginTop,
            navFits: navW <= navBox.width + 1,
            navOverflow: Math.round(navW - navBox.width),
            escapedRight: Math.round(escaped),
            bubbleOverflow,
            bubbleTight,
            lineWidth,
            lineChars,
            headerRows: Math.round(hr.height) > 70 ? 2 : 1,
          });
        })()`);
        const m = JSON.parse(raw);
        console.log(
          `  ${page.padEnd(12)} 头部=${m.headerH}px(${m.headerRows}行) 锚条=${m.stripH}px@${m.stripTop}` +
            ` 正文top=${m.mainTop} 正文宽=${m.mainW} 标题=${m.heroTitleSize}` +
            ` 横向滚动=${m.hScroll ? '⚠️有' : '无'}(${m.docScrollW}/${m.viewportW})` +
            ` 菜单放得下=${m.navFits ? '是' : '否(' + m.navOverflow + 'px)'}` +
            ` 溢出容器=${m.bubbleTight ? '⚠️' + m.bubbleOverflow + 'px' : '无'}` +
            ` 正文行宽=${m.lineWidth}px(≈${m.lineChars}字)`,
        );
      }
    }
    // The tablet column has to actually follow the reader, not just be positioned.
    await send('Emulation.setDeviceMetricsOverride', {
      width: 834,
      height: 1194,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await send('Page.navigate', { url: `${prefix}/install.html` }).catch(() => {});
    await sleep(700);
    const stickyAt = async (y) => {
      await evaluate(`window.scrollTo(0, ${y})`);
      await sleep(250);
      return evaluate(`JSON.stringify({
        scrolled: Math.round(window.scrollY),
        navTop: Math.round(document.querySelector('.anchors').getBoundingClientRect().top),
        navH: Math.round(document.querySelector('.anchors').getBoundingClientRect().height),
        navInner: document.querySelector('.anchors').scrollHeight > document.querySelector('.anchors').clientHeight,
      })`);
    };
    console.log('\n=== 平板侧栏跟随（iPad Pro 11", 834×1194）===');
    for (const y of [0, 800, 2400]) {
      const r = JSON.parse(await stickyAt(y));
      console.log(
        `  scrollY=${String(r.scrolled).padStart(4)}  侧栏 top=${String(r.navTop).padStart(4)}` +
          ` 高=${r.navH}${r.navInner ? ' (内部可滚)' : ''}`,
      );
    }
  } catch (error) {
    console.error('measure failed:', error.message);
    process.exitCode = 1;
  }
  ws.close();
  process.exit(process.exitCode ?? 0);
});
