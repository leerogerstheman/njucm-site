#!/usr/bin/env node
/**
 * 万代日本官网（bandai-hobby.net）商品目录抓取器
 *
 * 为什么要有这个：中文站（bandaihobbysite.cn）给的是中文品名，日文官方品名、
 * 精确税目（10% 税込，还是 2019 年 10 月前那批 8% 减税），以及更早的老款，
 * 中文站都拿不到。日本站是这些字段的源头。
 *
 * 页面结构（已确认）：
 *   品牌页 https://bandai-hobby.net/brand/<slug>/?p=<页码>，每页 10 条
 *     <a href="https://bandai-hobby.net/item/01_7269/" class="c-card p-card -landscape">
 *       <div class="p-card__img"><img src="<CloudFront 签名地址>"></div>
 *       <div class="p-card__tit">MG 1/100 ガンダムリバティアストレイ レッドフレーム</div>
 *       <div class="p-card__price">8,250円(税10%込)</div>
 *       <div class="p-card_date">2026年12月</div>
 *   图片是 CloudFront 签名地址，约一小时后失效，所以必须当场下载。
 *
 * 用法：
 *   node scripts/harvest-gundam-jp.mjs            # 抓取（可中断续跑）
 *   node scripts/harvest-gundam-jp.mjs --build    # 只整理已抓到的数据
 *   node scripts/harvest-gundam-jp.mjs --no-image # 只抓数据不下图
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.cache', 'gundam-jp');
const JSONL = join(CACHE, 'products.jsonl');
const OUT_FILE = 'src/data/gundam.kits.jp.json';
const ORIGIN = 'https://bandai-hobby.net';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const DELAY = 700;
const MAX_BACKOFF = 300_000;
const CONCURRENCY = 4;
const IMAGE_WIDTH = 480;
const QUALITY = 78;

/** 高达模型相关的品牌。顺序即抓取顺序，条目多的先跑。 */
const BRANDS = [
  { slug: 'hg', grade: 'HG' },
  { slug: 'mg', grade: 'MG' },
  { slug: 'rg', grade: 'RG' },
  { slug: 'mgka', grade: 'MG' },
  { slug: 'mgsd', grade: 'MGSD' },
  { slug: 'pg', grade: 'PG' },
  { slug: 'entry_grade', grade: 'EG' },
  { slug: 'entry_grade_g', grade: 'EG' },
  { slug: 'sdcs', grade: 'SD' },
  { slug: 'SDEX', grade: 'SD' },
  { slug: 'sdgundamseries', grade: 'SD' },
  { slug: 're100', grade: 'MG' },
  { slug: 'fullmechanics', grade: 'FM' },
  { slug: 'mgex', grade: 'MG' },
  { slug: 'hguc', grade: 'HG' },
  { slug: 'hgac', grade: 'HG' },
  { slug: 'hgaw', grade: 'HG' },
  { slug: 'hgce', grade: 'HG' },
  { slug: 'hgfc', grade: 'HG' },
  { slug: 'hgamplifiedimgn', grade: 'HG' },
  { slug: 'gundam_g40', grade: 'HG' },
  { slug: 'gundam-assemble', grade: 'HG' },
  { slug: 'gundarium_gundam', grade: 'SD' },
  { slug: 'gunpla40th', grade: 'HG' },
  { slug: 'expo2025-gunpla', grade: 'HG' },
  { slug: 'op-grandship', grade: 'HG' },
  { slug: 'optionpartsset', grade: 'MG' },
  { slug: 'pb_gunpla', grade: 'HG' },
  { slug: 'pb_hg', grade: 'HG' },
  { slug: 'pb_rg', grade: 'RG' },
  { slug: 'pb_mg', grade: 'MG' },
  { slug: 'pb_pg', grade: 'PG' },
  { slug: 'pb_bb', grade: 'SD' },
];

/** 明显不是模型本体的类目，不抓 */
const SKIP = new Set(['gundam_decal']);

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
      return (await import(pathToFileURL(join(store, dir, 'node_modules', 'sharp', 'lib', 'index.js')).href)).default;
    }
  }
}

/** 品牌页里的商品卡 */
const CARD = /<a href="(https:\/\/bandai-hobby\.net\/item\/[0-9_]+\/|https:\/\/p-bandai\.jp\/item\/[^"]+)"[^>]*class="c-card p-card -landscape[^"]*">([\s\S]*?)<\/a>/g;

function parseCards(html) {
  const out = [];
  let m;
  CARD.lastIndex = 0;
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
    out.push({
      url: m[1],
      id: /\/item\/([0-9_]+)\//.exec(m[1])?.[1] || null,
      isPb: /p-bandai\.jp/.test(m[1]),
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

async function saveImage(sharp, id, url) {
  if (!url || !id) return null;
  const abs = join(ROOT, 'public', 'gundam', `jp-${id}.webp`);
  if (existsSync(abs)) return `/gundam/jp-${id}.webp`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: `${ORIGIN}/` } });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const out = await sharp(buf)
      .resize(IMAGE_WIDTH, IMAGE_WIDTH, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toBuffer();
    writeFileSync(abs, out);
    return `/gundam/jp-${id}.webp`;
  } catch {
    return null;
  }
}

/** 并发跑一批任务，避免逐个 await 把速度拖死 */
async function pool(tasks, limit) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const task = tasks[cursor++];
      await task();
    }
  });
  await Promise.all(workers);
}

const buildOnly = process.argv.includes('--build');
const noImage = process.argv.includes('--no-image');
const sharp = noImage ? null : await loadSharp();

if (!buildOnly) {
  let done = 0;
  let images = 0;
  let total = 0;

  /* 已经抓过的品牌就不重来了：JSONL 里记着 brand */
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

  for (const brand of BRANDS) {
    if (SKIP.has(brand.slug)) continue;
    if (crawled.has(brand.slug)) continue;
    let emptyRun = 0;

    for (let page = 1; page <= 200; page++) {
      const url = `${ORIGIN}/brand/${brand.slug}/?p=${page}`;
      const html = await fetchText(url);
      const items = parseCards(html);
      total += items.length;

      /* 图片并行下：CloudFront 是另一个域名，不吃列表页的节奏限制 */
      if (sharp) {
        const jobs = items
          .filter((it) => it.image && it.id)
          .map((it) => async () => {
            it.localImage = await saveImage(sharp, it.id, it.image);
            if (it.localImage) images++;
          });
        await pool(jobs, 8);
      }
      for (const item of items) {
        item.brand = brand.slug;
        item.grade = brand.grade;
        appendFileSync(JSONL, JSON.stringify(item) + '\n', 'utf8');
      }

      done += items.length;
      process.stdout.write(
        `\r  ${brand.slug} p${page} | 条目 ${done} | 图片 ${images}          `,
      );
      await new Promise((r) => setTimeout(r, DELAY));

      emptyRun = items.length === 0 ? emptyRun + 1 : 0;
      if (emptyRun >= 2) break;
    }
  }
  process.stdout.write('\n');
  console.log(`抓取完成：条目 ${total}，图片 ${images}`);
}

/* ------------------------------------------------------------ 整理成 JSON */

/*
 * 品牌分类页没覆盖到全部商品——万代把 2019 年以前的老品从品牌页里撤了，
 * 但商品页还在。所以再走一遍 sitemap，把 sitemap 里还没抓过的商品页逐个补上：
 * 详情页里有 h1（品名）、価格、発売日和带签名的商品图，够用了。
 */
if (process.argv.includes('--from-sitemap')) {
  const sitemap = await fetchText(`${ORIGIN}/sitemap/jp/hobby-jp-dynamic-1.xml`);
  const urls = [...sitemap.matchAll(/<loc>(https:\/\/bandai-hobby\.net\/item\/[0-9_]+\/)<\/loc>/g)].map(
    (m) => m[1],
  );
  const known = new Set();
  if (existsSync(JSONL)) {
    for (const line of readFileSync(JSONL, 'utf8').split('\n').filter(Boolean)) {
      try {
        const item = JSON.parse(line);
        if (item.id) known.add(item.id);
      } catch {
        /* 半行 */
      }
    }
  }
  const todo = urls.filter((u) => !known.has(/\/item\/([0-9_]+)\//.exec(u)[1]));
  console.log(`sitemap 里的商品页 ${urls.length} 个，其中没抓过的 ${todo.length} 个`);

  const SPEC_JP =
    /<dt class="pg-products__label">[\s\S]{0,200}?<span class="pg-products__labelInner">([^<]*)<\/span>[\s\S]{0,200}?<\/dt>\s*<dd class="pg-products__labelTxt">([\s\S]*?)<\/dd>/g;

  let cursor = 0;
  let fetched = 0;
  const workers = Array.from({ length: 6 }, async () => {
    while (cursor < todo.length) {
      const url = todo[cursor++];
      const id = /\/item\/([0-9_]+)\//.exec(url)[1];
      const html = await fetchText(url);
      const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html);
      if (!h1) continue;
      const nameJa = h1[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      const spec = new Map();
      let m;
      SPEC_JP.lastIndex = 0;
      while ((m = SPEC_JP.exec(html))) {
        spec.set(m[1].trim(), m[2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
      }
      const priceText = spec.get('価格') || '';
      const num = /([\d,]{3,7})\s*円/.exec(priceText);
      const tax = /税\s*(\d+)%/.exec(priceText);
      const dtext = spec.get('発売日') || '';
      const dm = /(\d{4})年(\d{1,2})月(?:(\d{1,2})日)?/.exec(dtext);
      const img = /<img[^>]+src="(https:\/\/d3bk8pkqsprcvh\.cloudfront\.net\/[^"]+)"/.exec(html);
      const item = {
        id,
        url,
        isPb: false,
        nameJa,
        image: img ? img[1] : null,
        priceJpy: num ? Number(num[1].replace(/,/g, '')) : 0,
        taxRate: tax ? Number(tax[1]) : null,
        released: dm
          ? `${dm[1]}-${String(dm[2]).padStart(2, '0')}${dm[3] ? '-' + dm[3] : ''}`
          : '',
        brand: 'sitemap',
        grade: gradeOfName(nameJa),
      };
      if (sharp && item.image) {
        item.localImage = await saveImage(sharp, id, item.image);
      }
      appendFileSync(JSONL, JSON.stringify(item) + '\n', 'utf8');
      fetched++;
      if (fetched % 100 === 0) process.stdout.write(`\r  sitemap 补齐 ${fetched}/${todo.length}      `);
    }
  });
  await Promise.all(workers);
  process.stdout.write('\n');
  console.log(`sitemap 补齐完成：${fetched} 条`);
}

/** 从品名里认等级 */
function gradeOfName(name) {
  const g = /^(HGUC|HG|RG|MG Ver\.?Ka|MGSD|MGEX|MG|RE\/100|PG|ENTRY GRADE|FULL MECHANICS|FM|SDCS|SDEX|SD)\b/.exec(
    name || '',
  );
  if (!g) return '';
  const raw = g[1];
  if (raw === 'HGUC' || raw === 'HG') return 'HG';
  if (raw === 'ENTRY GRADE') return 'EG';
  if (raw === 'FULL MECHANICS') return 'FM';
  if (raw === 'SDCS' || raw === 'SDEX' || raw === 'SD') return 'SD';
  if (raw === 'RE/100' || raw === 'MGEX') return 'MG';
  if (raw === 'MG Ver.Ka') return 'MG';
  return raw;
}

const lines = existsSync(JSONL) ? readFileSync(JSONL, 'utf8').split('\n').filter(Boolean) : [];
const byId = new Map();
for (const line of lines) {
  try {
    const item = JSON.parse(line);
    const key = item.id || item.url;
    if (!byId.has(key)) byId.set(key, item);
  } catch {
    /* 半行 */
  }
}

const catalog = [];
for (const item of byId.values()) {
  const name = item.nameJa || '';
  if (!name) continue;
  catalog.push({
    id: item.id ? `jp-${item.id}` : null,
    jpId: item.id,
    url: item.url,
    nameJa: name,
    grade: item.grade,
    priceJpy: item.priceJpy,
    taxRate: item.taxRate,
    released: item.released,
    channel: item.isPb ? 'pb' : 'general',
    image: item.localImage || null,
    imageUrl: item.image || null,
  });
}

if (buildOnly) {
  writeFileSync(
    join(ROOT, OUT_FILE),
    JSON.stringify(catalog, null, 2).replace(/\n/g, '\r\n') + '\r\n',
    'utf8',
  );
  console.log(`整理出 ${catalog.length} 条日本站商品 → ${OUT_FILE}`);
}
