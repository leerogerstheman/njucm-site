#!/usr/bin/env node
/**
 * 万代日本官网 GUNDAM ASSEMBLE 官方站 · 商品一览抓取器
 *
 * 官方站的产品页比主站品牌页更完整：分类（起始套装/豪华套装/扩张包/…）、
 * 厂商希望零售价、发售月、专用商品图，都在一张表里。图是站内静态资源，
 * 不会像 CloudFront 那样一小时就失效。
 *
 * 产出：src/data/gundam.assemble.products.json
 *
 * 用法：node scripts/harvest-gundam-assemble.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.cache', 'gundam-assemble');
const OUT_FILE = 'src/data/gundam.assemble.products.json';
const URL = 'https://bandai-hobby.net/site/gundam-assemble/products/';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

mkdirSync(CACHE, { recursive: true });

const FILE = join(CACHE, 'products.html');
let html;
if (existsSync(FILE) && readFileSync(FILE, 'utf8').length > 20000) {
  html = readFileSync(FILE, 'utf8');
  console.log('用缓存的页面');
} else {
  let backoff = 5_000;
  for (;;) {
    try {
      const res = await fetch(URL, {
        headers: { 'User-Agent': UA, Accept: 'text/html', Referer: 'https://bandai-hobby.net/' },
      });
      const body = await res.text();
      if (!res.ok || body.length < 20000) {
        await new Promise((r) => setTimeout(r, backoff));
        backoff = Math.min(backoff * 2, 300_000);
        continue;
      }
      html = body;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 300_000);
    }
  }
  writeFileSync(FILE, html, 'utf8');
  console.log('已抓取官方商品页');
}

/* 商品卡：<li class="js-category-…" data-category="…"> <a href="商品页"> … */
const ITEM =
  /<li[^>]*class="js-category-start[^"]*"[^>]*data-category="([^"]*)"[^>]*>\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;

const products = [];
let m;
ITEM.lastIndex = 0;
while ((m = ITEM.exec(html))) {
  const block = m[3];
  const title = /<p class="pg-products__title">([^<]*)<\/p>/.exec(block)?.[1]?.trim();
  if (!title) continue;
  const priceText = /<p class="pg-products__price">([^<]*)<\/p>/.exec(block)?.[1]?.trim() || '';
  const price = /([\d,]{3,7})\s*円/.exec(priceText);
  const dateText = /<p class="pg-products__date">([^<]*)<\/p>/.exec(block)?.[1]?.trim() || '';
  const dm = /(\d{4})[.\/](\d{1,2})/.exec(dateText);
  const img = /<img src="([^"]+)"/.exec(block)?.[1] || '';
  const category = /<p class="pg-products__category">([^<]*)<\/p>/.exec(block)?.[1]?.trim() || '';

  products.push({
    title,
    category,
    url: m[2],
    image: img ? img.replace(/_sp\.jpg$/, '.jpg') : null,
    imageSp: img || null,
    priceJpy: price ? Number(price[1].replace(/,/g, '')) : 0,
    released: dm ? `${dm[1]}-${String(dm[2]).padStart(2, '0')}` : '',
    releasedText: dateText,
  });
}

writeFileSync(
  join(ROOT, OUT_FILE),
  JSON.stringify(products, null, 2).replace(/\n/g, '\r\n') + '\r\n',
  'utf8',
);

console.log(`整理出 ${products.length} 条官方产品 → ${OUT_FILE}`);
for (const p of products) {
  console.log(`  ${p.title} | ${p.category} | ¥${p.priceJpy} | ${p.released} | ${p.image || '无图'}`);
}
