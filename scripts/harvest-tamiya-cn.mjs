#!/usr/bin/env node
/**
 * 田宫（TAMIYA）产品采集
 * ---------------------------------------------------------------------------
 * 田宫模型中国旗舰店 tamiya.cn 是 WordPress + WooCommerce，商品资料齐全：
 * 简体中文品名、货号、人民币定价、中文分类树、官方产品图。
 *
 * 站点整站挂在 Sucuri CloudProxy 的 JS 挑战后面：直接发请求会拿到 307
 * 「You are being redirected」，页面里一段 JS 算出 cookie 后才放行。
 * 所以这里用**真实浏览器**去过这道门——启动一个无头 Edge，用 CDP 在
 * tamiya.cn 的页面上下文里发 fetch，cookie 由浏览器自己带上。
 *
 * 限速按 robots.txt 的 Crawl-delay: 5 来（每 5 秒一个请求）。
 *
 * 用法：node scripts/harvest-tamiya-cn.mjs [--pages N] [--limit N] [--port N]
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://tamiya.cn';
const CACHE_DIR = join(ROOT, '.cache', 'tamiya-cn');
const PROFILE_DIR = join(CACHE_DIR, 'edge-profile');
const OUT_FILE = join(CACHE_DIR, 'catalog.json');

/** robots.txt 里写着 Crawl-delay: 5，就照这个来 */
const DELAY = 5_000;

const args = process.argv.slice(2);
const argNum = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const maxPages = argNum('--pages', Infinity);
const limit = argNum('--limit', Infinity);
const PORT = argNum('--port', 9333);

/* ---------------------------------------------------------------- 浏览器 */

const BROWSER_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

function findBrowser() {
  for (const p of BROWSER_CANDIDATES) if (existsSync(p)) return p;
  throw new Error('找不到 Chrome/Edge，可用 CHROME_PATH 环境变量指定');
}

/* ------------------------------------------------------- 极简 CDP 客户端 */

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.listeners.get(msg.method) || []) fn(msg.params);
      }
    });
  }

  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.addEventListener('open', () => resolve(new CDP(ws)));
    ws.addEventListener('error', (e) => reject(new Error(`WebSocket 出错：${e.message || e.type}`)));
  });
}

/* ------------------------------------------------------------ 抓取流程 */

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

const browserPath = findBrowser();
console.log(`浏览器：${browserPath}`);

const browser = spawn(
  browserPath,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-features=Translate,MediaRouter',
    `--remote-debugging-port=${PORT}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${PROFILE_DIR}`,
    'about:blank',
  ],
  { stdio: 'ignore', detached: false },
);

let cdp = null;
let sessionId = null;

/** 等 DevTools 端口起来 */
async function waitForDevTools() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return await res.json();
    } catch {
      /* 还没起来 */
    }
    await sleep(500);
  }
  throw new Error('DevTools 端口没起来');
}

async function main() {
  const version = await waitForDevTools();
  console.log(`DevTools：${version.Browser}`);

  cdp = await connect(version.webSocketDebuggerUrl);

  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const attached = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  sessionId = attached.sessionId;

  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);

  /* 先把首页打开——Sucuri 的挑战脚本就是在这一步算出 cookie 的 */
  const loaded = new Promise((resolve) => cdp.on('Page.loadEventFired', resolve));
  await cdp.send('Page.navigate', { url: `${ORIGIN}/` }, sessionId);
  await loaded;
  console.log('首页已打开，等待挑战放行…');
  await sleep(4_000);

  /** 在页面上下文里发请求（带 cookie），返回正文 */
  async function fetchText(url) {
    const r = await cdp.send(
      'Runtime.evaluate',
      {
        expression: `fetch(${JSON.stringify(url)}, { credentials: 'include' }).then(r => r.text())`,
        awaitPromise: true,
        returnByValue: true,
      },
      sessionId,
    );
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || '页面内 fetch 失败');
    return r.result.value;
  }

  /** 商品总数在 X-WP-Total 头里 */
  async function fetchTotal(url) {
    const r = await cdp.send(
      'Runtime.evaluate',
      {
        expression: `fetch(${JSON.stringify(url)}, { credentials: 'include' }).then(r => r.headers.get('x-wp-total'))`,
        awaitPromise: true,
        returnByValue: true,
      },
      sessionId,
    );
    return Number(r.result.value) || 0;
  }

  /* 挑战可能要多转几次，先试到能拿到 JSON 为止 */
  async function fetchJson(url, tries = 6) {
    for (let i = 1; i <= tries; i++) {
      const text = await fetchText(url);
      const trimmed = text.trimStart();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) return JSON.parse(text);
      console.log(`  第 ${i} 次没拿到 JSON（${text.slice(0, 60).replace(/\s+/g, ' ')}…），重试`);
      await sleep(6_000);
    }
    throw new Error(`反复拿不到 JSON：${url}`);
  }

  /* ---------------------------------------------------- 目录总览 */
  const total = await fetchTotal(`${ORIGIN}/wp-json/wc/store/v1/products?per_page=1`);
  console.log(`商品总数：${total}`);

  const pages = Math.min(Math.ceil(total / 100), maxPages);
  const all = [];

  for (let page = 1; page <= pages; page++) {
    const file = join(CACHE_DIR, `products_${page}.json`);
    let items;
    if (existsSync(file)) {
      items = JSON.parse(readFileSync(file, 'utf8'));
      console.log(`第 ${page}/${pages} 页：命中缓存 ${items.length} 条`);
    } else {
      items = await fetchJson(`${ORIGIN}/wp-json/wc/store/v1/products?per_page=100&page=${page}`);
      writeFileSync(file, JSON.stringify(items), 'utf8');
      console.log(`第 ${page}/${pages} 页：抓取 ${items.length} 条`);
      await sleep(DELAY);
    }
    for (const it of items) all.push(it);
    if (all.length >= limit) break;
  }

  /* 分类树：中文分类名，用来映射品类 */
  const cats = [];
  for (let page = 1; page <= 12; page++) {
    const file = join(CACHE_DIR, `cats_${page}.json`);
    let items;
    if (existsSync(file)) {
      items = JSON.parse(readFileSync(file, 'utf8'));
    } else {
      items = await fetchJson(`${ORIGIN}/wp-json/wc/store/v1/products/categories?per_page=100&page=${page}`);
      writeFileSync(file, JSON.stringify(items), 'utf8');
      await sleep(DELAY);
    }
    if (!items.length) break;
    cats.push(...items);
  }
  console.log(`分类 ${cats.length} 个`);

  /*
   * 上架日期。
   *
   * 商品接口不返回日期，但 WordPress 的商品接口给得出发布日——
   * 那是商城把这款商品挂上去的时间。这里单独记成「上架日期」，
   * 不与发售日混为一谈。
   */
  const dates = {};
  const datePages = Math.min(Math.ceil(total / 100), maxPages);
  for (let page = 1; page <= datePages; page++) {
    const file = join(CACHE_DIR, `dates_${page}.json`);
    let items;
    if (existsSync(file)) {
      items = JSON.parse(readFileSync(file, 'utf8'));
    } else {
      items = await fetchJson(
        `${ORIGIN}/wp-json/wp/v2/product?per_page=100&page=${page}&_fields=id,date,modified,slug`,
      );
      writeFileSync(file, JSON.stringify(items), 'utf8');
      await sleep(DELAY);
    }
    for (const it of items) dates[it.slug] = { date: it.date, modified: it.modified, id: it.id };
    if (page % 10 === 0) console.log(`日期 ${page}/${datePages} 页`);
  }
  console.log(`上架日期 ${Object.keys(dates).length} 条`);

  writeFileSync(
    OUT_FILE,
    JSON.stringify({ total, pages, products: all, categories: cats, dates }, null, 1),
    'utf8',
  );
  console.log(`\n写出 ${all.length} 条到 ${OUT_FILE}`);
}

try {
  await main();
} catch (err) {
  console.error('采集失败：', err.message);
  process.exitCode = 1;
} finally {
  try {
    cdp?.ws.close();
  } catch {
    /* ignore */
  }
  browser.kill();
  await sleep(500);
  /* 留掉 profile：cookie 还能用，下次接着跑更快 */
}
