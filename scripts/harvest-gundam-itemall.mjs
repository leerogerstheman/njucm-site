#!/usr/bin/env node
/**
 * 万代中文站全量商品总表抓取器（/item_all）
 *
 * 为什么要有这个：之前只抓了「品牌分类页」和「作品线分类页」，那两处只摆着
 * 当前在售的商品。限定品（PB 限定、网络限定）常常不在品牌页里，而 /item_all
 * 是全站母表——按 id 倒序，298 页，把下架老品和限定品都算在内。
 *
 * 节奏：一次一个请求，固定间隔 900ms；遇 405 指数退避到 5 分钟；页面落盘可续跑。
 *
 * 用法：
 *   node scripts/harvest-gundam-itemall.mjs           # 抓取（可中断续跑）
 *   node scripts/harvest-gundam-itemall.mjs --build   # 只整理已抓到的数据
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  appendFileSync,
  readdirSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.cache', 'gundam-itemall');
const JSONL = join(CACHE, 'products.jsonl');
const OUT_FILE = 'src/data/gundam.kits.itemall.json';
const ORIGIN = 'https://www.bandaihobbysite.cn';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const DELAY = 900;
const MAX_BACKOFF = 300_000;
const MAX_PAGES = 400;

mkdirSync(CACHE, { recursive: true });

/* ---------------------------------------------------------------- 抓取 */

const CARD = /<a href="\/index\/index\/detail\/id\/(\d+)"[^>]*class="c-card p-card[^"]*">([\s\S]*?)<\/a>/g;

function parseCards(html) {
  const items = [];
  CARD.lastIndex = 0;
  let m;
  while ((m = CARD.exec(html))) {
    const block = m[2];
    const title = /<div class="p-card__tit">([\s\S]*?)<\/div>/.exec(block);
    if (!title) continue;
    const img = /<div class="p-card__img">\s*<img src="([^"]+)"/.exec(block);
    const price = /([\d,]+)\s*日元/.exec(block);
    const cny = /[¥￥]\s*([\d,]+)/.exec(block);
    const dateFull = /(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(block);
    const dateMonth = /(\d{4})年(\d{1,2})月/.exec(block);
    const released = dateFull
      ? `${dateFull[1]}-${String(dateFull[2]).padStart(2, '0')}-${dateFull[3]}`
      : dateMonth
        ? `${dateMonth[1]}-${String(dateMonth[2]).padStart(2, '0')}`
        : '';
    items.push({
      detailId: m[1],
      name: title[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
      image: img ? img[1] : null,
      priceJpy: price ? Number(price[1].replace(/,/g, '')) : 0,
      priceCny: cny ? Number(cny[1].replace(/,/g, '')) : 0,
      released,
    });
  }
  return items;
}

function cacheName(page) {
  return `item_all_${String(page).padStart(4, '0')}.html`;
}

async function fetchPage(page) {
  const file = join(CACHE, cacheName(page));
  if (existsSync(file) && readFileSync(file, 'utf8').length > 20000) {
    return { html: readFileSync(file, 'utf8'), cached: true };
  }
  const url = `${ORIGIN}/item_all?page=${page}`;
  let backoff = 5_000;
  for (;;) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          Referer: `${ORIGIN}/item_all`,
        },
      });
      const html = await res.text();
      if (res.status === 405 || html.length < 20000) {
        process.stdout.write(`\r  405 退避 ${Math.round(backoff / 1000)}s → p${page}   `);
        await new Promise((r) => setTimeout(r, backoff));
        backoff = Math.min(backoff * 2, MAX_BACKOFF);
        continue;
      }
      writeFileSync(file, html, 'utf8');
      return { html, cached: false };
    } catch (err) {
      process.stdout.write(`\r  错误 ${String(err.message).slice(0, 40)}，重试 p${page}   `);
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, MAX_BACKOFF);
    }
  }
}

if (!process.argv.includes('--build')) {
  let total = 0;
  let newPages = 0;
  let emptyRun = 0;
  const seen = new Set();

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { html, cached } = await fetchPage(page);
    const items = parseCards(html);
    total += items.length;
    for (const item of items) {
      if (seen.has(item.detailId)) continue;
      seen.add(item.detailId);
      appendFileSync(JSONL, JSON.stringify(item) + '\n', 'utf8');
    }

    if (!cached) newPages++;
    process.stdout.write(`\r  item_all p${page} | 新页 ${newPages} | 商品 ${seen.size}          `);
    await new Promise((r) => setTimeout(r, DELAY));

    emptyRun = items.length === 0 ? emptyRun + 1 : 0;
    if (emptyRun >= 2) break;
  }
  process.stdout.write('\n');
  console.log(`抓取完成：新增页面 ${newPages}，商品 ${seen.size}`);
}

/* ------------------------------------------------------------ 整理成 JSON */

const lines = existsSync(JSONL)
  ? readFileSync(JSONL, 'utf8').split('\n').filter(Boolean)
  : [];

const byId = new Map();
for (const line of lines) {
  try {
    const item = JSON.parse(line);
    if (!byId.has(item.detailId)) byId.set(item.detailId, item);
  } catch {
    /* 半行 */
  }
}

const catalog = [...byId.values()].sort((a, b) => Number(b.detailId) - Number(a.detailId));

writeFileSync(
  join(ROOT, OUT_FILE),
  JSON.stringify(catalog, null, 2).replace(/\n/g, '\r\n') + '\r\n',
  'utf8',
);

console.log(`整理出 ${catalog.length} 条 → ${OUT_FILE}`);

/* 顺带看看这表里都有什么 */
const marks = {
  网络限定: /网络限定|线上限定|淘宝|京东|天猫|官方网络/,
  PB限定: /Premium\s*Bandai|PB\s*限定|premium/i,
  高达基地: /高达基地限定|GUNDAM\s*BASE/i,
  集结: /集结|ASSEMBLE/i,
};
for (const [label, re] of Object.entries(marks)) {
  const hit = catalog.filter((x) => re.test(x.name));
  console.log(`  ${label}: ${hit.length}`);
  for (const x of hit.slice(0, 5)) console.log(`    ${x.detailId} | ${x.name}`);
}
