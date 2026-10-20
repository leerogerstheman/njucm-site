#!/usr/bin/env node
/**
 * 万代中文站「网上商店 · PB 商品预约信息专区」抓取器
 *
 * 这个专区是中文站里唯一一块带中文名、且成规模陈列 PB 限定商品的地方：
 *   https://www.bandaihobbysite.cn/index/index/onlineshop_topics?page=N
 *   每页 20 条，共 48 页；每条一个 pb_detail 详情页。
 *
 * 专区本身是「预约信息板」：给的是中文名、官方商品图、预约/新贩日期和
 * 通往天猫/京东的传送门，**不标价格与实际发售日**。价格与发售日要靠
 * 日站 Premium Bandai 目录补齐——所以这个脚本负责产出中文名与图片，
 * 联表交给 join 脚本去做。
 *
 * 节奏：一次一个请求，固定间隔 900ms；遇 405 指数退避；页面落盘可续跑。
 *
 * 用法：
 *   node scripts/harvest-gundam-pb.mjs            # 抓取
 *   node scripts/harvest-gundam-pb.mjs --build    # 只整理
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  appendFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.cache', 'gundam-pb');
const JSONL = join(CACHE, 'products.jsonl');
const OUT_FILE = 'src/data/gundam.kits.pb-zone.json';
const ORIGIN = 'https://www.bandaihobbysite.cn';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const DELAY = 900;
const MAX_BACKOFF = 300_000;
const MAX_PAGES = 60;

mkdirSync(CACHE, { recursive: true });

/* ---------------------------------------------------------------- 抓取 */

/** 专区的列表结构：图片和标题是两个独立锚点，靠 id 归并 */
function parseZone(html) {
  const items = new Map();

  for (const m of html.matchAll(
    /<a href="\/index\/index\/pb_detail\/id\/(\d+)"[^>]*>\s*<img src="([^"]+)"/g,
  )) {
    if (!items.has(m[1])) items.set(m[1], { id: m[1], image: m[2] });
  }

  for (const m of html.matchAll(
    /<a href="\/index\/index\/pb_detail\/id\/(\d+)"[^>]*>\s*([^<]{2,120}?)\s*<\/a>/g,
  )) {
    const name = m[2].replace(/\s+/g, ' ').trim();
    if (!items.has(m[1])) items.set(m[1], { id: m[1] });
    if (name && !items.get(m[1]).name) items.get(m[1]).name = name;
  }

  /* 标签与日期：条目所在区块里的「PB再贩 / PB上新」和 YYYY.MM.DD */
  for (const m of html.matchAll(
    /<a href="\/index\/index\/pb_detail\/id\/(\d+)"[\s\S]{0,400}?<\/a>[\s\S]{0,900}?p-newslist__tag[^>]*>([^<]{1,20})<[\s\S]{0,600}?p-newslist__date">([^<]+)</g,
  )) {
    const item = items.get(m[1]);
    if (!item) continue;
    if (!item.tag) item.tag = m[2].trim();
    if (!item.date) item.date = m[3].trim();
  }

  return [...items.values()];
}

function cacheName(page) {
  return `zone_${String(page).padStart(3, '0')}.html`;
}

async function fetchPage(page) {
  const file = join(CACHE, cacheName(page));
  if (existsSync(file) && readFileSync(file, 'utf8').length > 15000) {
    return { html: readFileSync(file, 'utf8'), cached: true };
  }
  const url = `${ORIGIN}/index/index/onlineshop_topics?page=${page}`;
  let backoff = 5_000;
  for (;;) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          Referer: `${ORIGIN}/index/index/onlineshop_topics`,
        },
      });
      const html = await res.text();
      if (res.status === 405 || html.length < 15000) {
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
  let newPages = 0;
  let emptyRun = 0;
  const seen = new Set();

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { html, cached } = await fetchPage(page);
    const items = parseZone(html);
    for (const item of items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      appendFileSync(JSONL, JSON.stringify(item) + '\n', 'utf8');
    }

    if (!cached) newPages++;
    process.stdout.write(`\r  PB 专区 p${page} | 新页 ${newPages} | 商品 ${seen.size}          `);
    await new Promise((r) => setTimeout(r, DELAY));

    emptyRun = items.length === 0 ? emptyRun + 1 : 0;
    if (emptyRun >= 2) break;
  }
  process.stdout.write('\n');
  console.log(`PB 专区抓取完成：商品 ${seen.size}`);
}

/* ------------------------------------------------------------ 整理成 JSON */

const lines = existsSync(JSONL)
  ? readFileSync(JSONL, 'utf8').split('\n').filter(Boolean)
  : [];

const byId = new Map();
for (const line of lines) {
  try {
    const item = JSON.parse(line);
    const prev = byId.get(item.id);
    /* 后抓到的补齐前面缺的字段 */
    byId.set(item.id, {
      id: item.id,
      name: item.name || prev?.name || '',
      image: item.image || prev?.image || null,
      tag: item.tag || prev?.tag || '',
      date: item.date || prev?.date || '',
    });
  } catch {
    /* 半行 */
  }
}

const catalog = [...byId.values()].filter((x) => x.name);

writeFileSync(
  join(ROOT, OUT_FILE),
  JSON.stringify(catalog, null, 2).replace(/\n/g, '\r\n') + '\r\n',
  'utf8',
);

console.log(`整理出 ${catalog.length} 条 PB 商品 → ${OUT_FILE}`);
const tags = catalog.reduce((m, x) => ((m[x.tag || '未知'] = (m[x.tag || '未知'] || 0) + 1), m), {});
console.log('标签分布:', JSON.stringify(tags));
