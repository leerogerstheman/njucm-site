#!/usr/bin/env node
/**
 * 万代日本站 Premium Bandai（PB 限定）目录抓取器
 *
 * 为什么要单独写一个：
 *   1. PB 商品在 bandai-hobby.net 上没有自己的商品页，它们只在
 *      pb_ 前缀的品牌页里以「外链到 p-bandai.jp」的形式出现。通用抓取器
 *      按 /item/<数字>/ 取 id，PB 的 id 是 item-1000257632 这种带前缀的，
 *      取不到 → 图片下载被整段跳过（PB 图片一张都没落地）。
 *   2. PB 商品图是 CloudFront 签名地址，约一小时过期，必须当场下载。
 *      之前存的 URL 早已失效，所以要重抓品牌页拿新签名。
 *
 * 产出：
 *   public/gundam/pb-<商品号>.webp   480px WebP
 *   src/data/gundam.kits.pb-jp.json  日文名 / 含税定价 / 税目 / 发售日
 *
 * 用法：
 *   node scripts/harvest-gundam-pb-jp.mjs           # 抓取
 *   node scripts/harvest-gundam-pb-jp.mjs --build   # 只整理
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
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.cache', 'gundam-pb-jp');
const JSONL = join(CACHE, 'products.jsonl');
const OUT_FILE = 'src/data/gundam.kits.pb-jp.json';
const ORIGIN = 'https://bandai-hobby.net';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const DELAY = 700;
const MAX_BACKOFF = 300_000;
const IMAGE_WIDTH = 480;
const QUALITY = 78;

/**
 * 相关品牌。
 *
 * PB 商品在日站主站上没有自己的页面，只以「外链到 p-bandai.jp」的形式出现——
 * 既出现在 pb_ 前缀的专属品牌页里，也会混在 HG / MG / RG 等常规品牌页里。
 * 两边都要抓，只抓 pb_ 前缀会漏掉近三成。
 */
const BRANDS = [
  { slug: 'pb_gunpla' },
  { slug: 'pb_hg' },
  { slug: 'pb_mg' },
  { slug: 'pb_rg' },
  { slug: 'pb_pg' },
  { slug: 'pb_bb' },
  { slug: 'hg' },
  { slug: 'mg' },
  { slug: 'rg' },
  { slug: 'mgka' },
  { slug: 'mgsd' },
  { slug: 'pg' },
  { slug: 'entry_grade' },
  { slug: 'entry_grade_g' },
  { slug: 'sdgundamseries' },
  { slug: 're100' },
  { slug: 'fullmechanics' },
  { slug: 'mgex' },
  { slug: 'hguc' },
  { slug: 'hgce' },
  { slug: 'hgac' },
  { slug: 'hgaw' },
  { slug: 'hgfc' },
  { slug: 'hgamplifiedimgn' },
  { slug: 'gundarium_gundam' },
  { slug: 'sdcs' },
  { slug: 'SDEX' },
];

mkdirSync(CACHE, { recursive: true });
mkdirSync(join(ROOT, 'public', 'gundam'), { recursive: true });

async function loadSharp() {
  try {
    return (await import('sharp')).default;
  } catch {
    const require = createRequire(import.meta.url);
    try {
      return require('sharp');
    } catch {
      const { readdirSync } = await import('node:fs');
      const { pathToFileURL } = await import('node:url');
      const store = join(ROOT, 'node_modules', '.pnpm');
      const dir = readdirSync(store).find((d) => d.startsWith('sharp@'));
      if (!dir) throw new Error('找不到 sharp');
      return (
        await import(
          pathToFileURL(join(store, dir, 'node_modules', 'sharp', 'lib', 'index.js')).href
        )
      ).default;
    }
  }
}

/**
 * 品牌页里的商品卡。
 *
 * PB 品牌页里的卡有两种指向：
 *   - p-bandai.jp/item/item-1000257632/  —— PB 独占商品，商品号带前缀
 *   - bandai-hobby.net/item/01_7269/    —— 万代主站也挂着的 PB 商品（集结等）
 * 两边都是 PB，只认一种会漏掉三成。
 */
const CARD =
  /<a href="(https:\/\/p-bandai\.jp\/item\/[^"]+|https:\/\/bandai-hobby\.net\/item\/[0-9_]+\/)"[^>]*class="c-card p-card -landscape[^"]*">([\s\S]*?)<\/a>/g;

function parseCards(html) {
  const out = [];
  CARD.lastIndex = 0;
  let m;
  while ((m = CARD.exec(html))) {
    const block = m[2];
    const img = /<div class="p-card__img">\s*<img src="([^"]+)"/.exec(block);
    const title = /<div class="p-card__tit">([\s\S]*?)<\/div>/.exec(block);
    if (!title) continue;
    const price = /<div class="p-card__price">([\s\S]*?)<\/div>/.exec(block);
    const date = /<div class="p-card_date">([\s\S]*?)<\/div>/.exec(block);
    const priceText = price ? price[1].replace(/<[^>]*>/g, '').trim() : '';
    const num = /([\d,]{3,7})\s*円/.exec(priceText);
    const tax = /税\s*(\d+)%/.exec(priceText);
    const dtext = date ? date[1].replace(/<[^>]*>/g, '').trim() : '';
    const dm = /(\d{4})年(\d{1,2})月(?:(\d{1,2})日)?/.exec(dtext);
    const isPbShop = /p-bandai\.jp/.test(m[1]);
    /* p-bandai 的商品号是 item-1000257632，取数字部分当稳定标识；
       主站商品用它自己的 01_7269 编号 */
    const code = isPbShop
      ? /item-(\d+)/.exec(m[1])?.[1] || m[1].replace(/\D+/g, '')
      : /\/item\/([0-9_]+)\//.exec(m[1])?.[1] || '';
    out.push({
      url: m[1],
      code,
      isPbShop,
      nameJa: title[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(),
      image: img ? img[1] : null,
      priceJpy: num ? Number(num[1].replace(/,/g, '')) : 0,
      taxRate: tax ? Number(tax[1]) : null,
      released: dm
        ? `${dm[1]}-${String(dm[2]).padStart(2, '0')}${dm[3] ? '-' + dm[3] : ''}`
        : '',
    });
  }
  return out;
}

async function fetchText(url) {
  let backoff = 5_000;
  for (;;) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'text/html', Referer: `${ORIGIN}/` },
      });
      const html = await res.text();
      if (res.status === 405 || html.length < 5000) {
        await new Promise((r) => setTimeout(r, backoff));
        backoff = Math.min(backoff * 2, MAX_BACKOFF);
        continue;
      }
      return html;
    } catch {
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, MAX_BACKOFF);
    }
  }
}

/**
 * 图片存哪：
 *   p-bandai 独占商品没有主站编号，用 pb-<商品号>.webp；
 *   主站也挂着的 PB 商品沿用主站编号 jp-<01_7269>.webp，跟通用抓取器一致。
 */
function imageName(item) {
  if (!item.code) return null;
  return item.isPbShop ? `pb-${item.code}.webp` : `jp-${item.code}.webp`;
}

async function saveImage(sharp, item) {
  const name = imageName(item);
  if (!item.image || !name) return null;
  const abs = join(ROOT, 'public', 'gundam', name);
  if (existsSync(abs)) return `/gundam/${name}`;
  try {
    const res = await fetch(item.image, {
      headers: { 'User-Agent': UA, Referer: `${ORIGIN}/` },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const out = await sharp(buf)
      .resize(IMAGE_WIDTH, IMAGE_WIDTH, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toBuffer();
    writeFileSync(abs, out);
    return `/gundam/${name}`;
  } catch {
    return null;
  }
}

async function pool(tasks, limit) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (cursor < tasks.length) await tasks[cursor++]();
  });
  await Promise.all(workers);
}

if (!process.argv.includes('--build')) {
  const sharp = await loadSharp();
  const crawled = new Set();
  if (existsSync(JSONL)) {
    for (const line of readFileSync(JSONL, 'utf8').split('\n').filter(Boolean)) {
      try {
        const item = JSON.parse(line);
        if (item.brand) crawled.add(item.brand);
      } catch {
        /* 半行 */
      }
    }
  }

  /* --rebrands=<a,b>：重抓指定品牌（解析规则改过之后要补一遍） */
  const reArg = process.argv.find((a) => a.startsWith('--rebrands='));
  const rebrands = reArg
    ? new Set(reArg.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean))
    : null;
  if (rebrands) for (const s of rebrands) crawled.delete(s);

  let total = 0;
  let images = 0;

  for (const brand of BRANDS) {
    if (crawled.has(brand.slug)) continue;
    let emptyRun = 0;

    for (let page = 1; page <= 200; page++) {
      const html = await fetchText(`${ORIGIN}/brand/${brand.slug}/?p=${page}`);
      const items = parseCards(html);
      total += items.length;

      if (sharp) {
        const jobs = items
          .filter((it) => it.image && it.code)
          .map((it) => async () => {
            it.localImage = await saveImage(sharp, it);
            if (it.localImage) images++;
          });
        await pool(jobs, 8);
      }

      for (const item of items) {
        item.brand = brand.slug;
        appendFileSync(JSONL, JSON.stringify(item) + '\n', 'utf8');
      }

      process.stdout.write(`\r  ${brand.slug} p${page} | 条目 ${total} | 图片 ${images}          `);
      await new Promise((r) => setTimeout(r, DELAY));

      emptyRun = items.length === 0 ? emptyRun + 1 : 0;
      if (emptyRun >= 2) break;
    }
  }
  process.stdout.write('\n');
  console.log(`PB 抓取完成：条目 ${total}，图片 ${images}`);
}

/* ------------------------------------------------------------ 整理成 JSON */

const lines = existsSync(JSONL)
  ? readFileSync(JSONL, 'utf8').split('\n').filter(Boolean)
  : [];

const byCode = new Map();
for (const line of lines) {
  try {
    const item = JSON.parse(line);
    if (!item.code) continue;
    /* 老记录没有 isPbShop 标记，从 URL 补出来 */
    const isPbShop = item.isPbShop ?? /p-bandai\.jp/.test(item.url || '');
    /* p-bandai 的商品号是纯数字，主站编号带 01_ 前缀，不会撞；
       仍然加上来源标记，免得以后改编号格式时撞车 */
    const key = `${isPbShop ? 'p' : 'j'}:${item.code}`;
    const prev = byCode.get(key);
    byCode.set(key, {
      code: item.code,
      isPbShop,
      url: item.url || prev?.url,
      nameJa: item.nameJa || prev?.nameJa || '',
      priceJpy: item.priceJpy || prev?.priceJpy || 0,
      taxRate: item.taxRate ?? prev?.taxRate ?? null,
      released: item.released || prev?.released || '',
      image: item.image || prev?.image || null,
      localImage: item.localImage || prev?.localImage || null,
    });
  } catch {
    /* 半行 */
  }
}

const catalog = [...byCode.values()].filter((x) => x.nameJa);

writeFileSync(
  join(ROOT, OUT_FILE),
  JSON.stringify(catalog, null, 2).replace(/\n/g, '\r\n') + '\r\n',
  'utf8',
);

console.log(`整理出 ${catalog.length} 条 PB 商品 → ${OUT_FILE}`);
console.log(
  '  有本地图:',
  catalog.filter((x) => x.localImage).length,
  ' 有定价:',
  catalog.filter((x) => x.priceJpy).length,
  ' 有发售日:',
  catalog.filter((x) => x.released).length,
);
