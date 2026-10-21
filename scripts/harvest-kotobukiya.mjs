#!/usr/bin/env node
/**
 * 寿屋（KOTOBUKIYA）产品采集
 * ---------------------------------------------------------------------------
 * 官方直销商城 shop.kotobukiya.co.jp 挂着完整的在售目录：分类页翻页能列出
 * 全部商品，每个商品页给出品名、作品名（作品线）、分类、比例、发售日、
 * 含税定价、尺寸与素材。
 *
 * 主站 www.kotobukiya.co.jp 前面挡着 Cloudflare 的机器验证，命令行过不去；
 * 直销商城不走那套验证，所以从这里取数据——同一家公司的官方渠道。
 *
 * 商城是 Shift_JIS 编码的 .NET 站点，解析前要先转码。
 *
 * 用法：node scripts/harvest-kotobukiya.mjs [--limit N] [--pages N] [--concurrency N]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://shop.kotobukiya.co.jp';
const CACHE_DIR = join(ROOT, '.cache', 'kotobukiya');
const OUT_FILE = 'src/data/models.kits.kotobukiya.json';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const DELAY = 260;

/**
 * 采集哪些分类。
 *
 * 只取模型本体与手办——工具、贴纸、展示箱这些不是「模型」，不进库。
 * c2010 拼装模型本体、c2020 支援单元与选件、
 * c1010 比例手办、c1030 其它手办。
 */
const CATEGORIES = [
  { id: 'c2010', label: 'プラモデル本体' },
  { id: 'c2020', label: 'サポートユニット(M.S.G)・オプションパーツ' },
  { id: 'c1010', label: 'スケールフィギュア' },
  { id: 'c1030', label: 'その他フィギュア' },
];

/**
 * 分类 id → 库里的品类（产品形态）
 *
 * 商城自己的「カテゴリ」字段就是答案，原样写进事实文件，
 * 由 scripts/build-models-data.mjs 映射成 kotobukiya:* 的正式 id。
 */
const CATEGORY_MAP = {
  プラモデル本体: 'プラモデル本体',
  'サポートユニット(M.S.G)': 'サポートユニット(M.S.G)',
  プラモデルオプションパーツ: 'プラモデルオプションパーツ',
  スケールフィギュア: 'スケールフィギュア',
  その他フィギュア: 'その他フィギュア',
  ガレージキット: 'ガレージキット',
  キャラグッズ: 'キャラグッズ',
};

/** 这些形态下的产品讲的是机体，其余讲的是人物 */
const MECH_CATEGORIES = new Set(['プラモデル本体', 'サポートユニット・オプション']);

const args = process.argv.slice(2);
const argNum = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const limit = argNum('--limit', Infinity);
const maxPages = argNum('--pages', Infinity);
const CONCURRENCY = argNum('--concurrency', 4);

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

/** 商城是 Shift_JIS，读进来要转码 */
function decode(buffer) {
  try {
    return new TextDecoder('shift_jis').decode(buffer);
  } catch {
    return buffer.toString('utf8');
  }
}

async function fetchBuffer(url) {
  let backoff = 3_000;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'ja,en;q=0.9',
          Referer: `${ORIGIN}/shop/`,
        },
        redirect: 'follow',
      });
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch {
      if (attempt === 3) return null;
      await new Promise((r) => setTimeout(r, backoff));
      backoff *= 2;
    }
  }
  return null;
}

async function cached(url, file) {
  const abs = join(CACHE_DIR, file);
  if (existsSync(abs)) return decode(readFileSync(abs));
  const buf = await fetchBuffer(url);
  if (!buf) return '';
  writeFileSync(abs, buf);
  await new Promise((r) => setTimeout(r, DELAY));
  return decode(buf);
}

/** 去掉 HTML 标签 */
function strip(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/\s+/g, ' ')
    .trim();
}

/** 规格表：一行一个「項目: 値」 */
function specRows(html) {
  const rows = {};
  for (const m of html.matchAll(/<dt[^>]*>([\s\S]{0,120}?)<\/dt>\s*<dd[^>]*>([\s\S]{0,600}?)<\/dd>/g)) {
    const key = strip(m[1]);
    const value = strip(m[2]);
    if (key && value && !rows[key]) rows[key] = value;
  }
  return rows;
}

/** 分类页 → 商品链接 */
function productLinks(html) {
  return [...new Set([...html.matchAll(/\/shop\/g\/g(\d+)\//g)].map((m) => m[1]))];
}

/** 分类页的总页数 */
function pageCount(html) {
  const pages = [...html.matchAll(/\/shop\/c\/c\d+_p(\d+)\//g)].map((m) => Number(m[1]));
  return pages.length ? Math.max(...pages) : 1;
}

/** 解析一个商品页 */
function parseProduct(html, jan) {
  const rows = specRows(html);

  const nameMatch = /<h1[^>]*class="goods_name_"[^>]*>([\s\S]{0,300}?)<\/h1>/.exec(html);
  if (!nameMatch) return null;
  /* 标题里可能带一个 span，放的是假名读音（「ブイトール （ブイトール）」） */
  const inner = nameMatch[1];
  const readingMatch = /<span[^>]*class="name2_"[^>]*>([\s\S]{0,200}?)<\/span>/.exec(inner);
  const reading = readingMatch ? strip(readingMatch[1]).replace(/[（）()]/g, '') : '';
  const name = strip(inner.replace(/<span[^>]*class="name2_"[^>]*>[\s\S]*?<\/span>/g, ' '));
  if (!name) return null;

  /* 作品名（作品线）在标题上方 */
  const seriesMatch = /<div[^>]*class="goods_series_"[^>]*>([\s\S]{0,300}?)<\/div>/.exec(html);
  const series = seriesMatch ? strip(seriesMatch[1]) : rows['作品名'] || '';

  /* 价格：正文里的含税价，JS 的 tot 只是给统计用的 */
  let price = 0;
  const priceMatch = /<span[^>]*class="price_num_"[^>]*>([\d,]+)<\/span>/.exec(html);
  if (priceMatch) price = Number(priceMatch[1].replace(/,/g, ''));

  /* 发售月：标题旁那份更细（2023年12月22日），规格表里只有月 */
  let released = '';
  const releaseMatch = /<dl[^>]*class="goods_release_"[^>]*>[\s\S]{0,200}?<dd>([\s\S]{0,120}?)<\/dd>/.exec(html);
  const releaseText = releaseMatch ? strip(releaseMatch[1]) : rows['発売月'] || '';
  const rm = /(\d{4})年(\d{1,2})月(?:(\d{1,2})日)?/.exec(releaseText);
  if (rm) {
    released = rm[3]
      ? `${rm[1]}-${rm[2].padStart(2, '0')}-${rm[3].padStart(2, '0')}`
      : `${rm[1]}-${rm[2].padStart(2, '0')}`;
  }

  const limited = rows['限定品・特典'] || '';
  const channel = /直営店|専売|店舗/.test(limited)
    ? 'exclusive'
    : /限定/.test(limited)
      ? 'limited'
      : 'general';

  const category = CATEGORY_MAP[rows['カテゴリ'] || ''] || rows['カテゴリ'] || '';

  /* 尺寸：本体全長約210mm 这样的描述 */
  let heightMm = null;
  const sizeMatch = /(\d{2,4})\s*mm/.exec(rows['サイズ'] || '');
  if (sizeMatch) heightMm = Number(sizeMatch[1]);

  const material = rows['素材'] || null;
  const sculptor = rows['原型/設計'] || '';

  const imageUrl = `${ORIGIN}/img/goods/L/${jan}_1.jpg`;

  return {
    id: `kotobukiya-${jan}`,
    name,
    /* 官方品名本身就是日文，nameJa 与 name 重复就没有意义 */
    nameJa: '',
    maker: 'kotobukiya',
    category,
    series,
    scale: rows['スケール'] || '',
    released,
    priceJpy: price,
    priceCny: 0,
    channel,
    subject: null,
    subjectKind: null,
    aliases: [reading].filter(Boolean),
    tags: [rows['カテゴリ'], rows['仕様']].filter(Boolean),
    note: sculptor ? `原型／設計：${sculptor}` : '',
    verified: true,
    source: `${ORIGIN}/shop/g/g${jan}/`,
    image: null,
    imageUrl,
    /* 商城只标「税込」，没写税率，不猜 */
    taxRate: null,
    sourceJp: `${ORIGIN}/shop/g/g${jan}/`,
  };
}

/* ---------------------------------------------------------------- 分类页 */

const jans = [];
for (const cat of CATEGORIES) {
  const first = await cached(`${ORIGIN}/shop/c/${cat.id}/`, `cat_${cat.id}_1.html`);
  if (!first) {
    console.log(`${cat.id} 取不到，跳过`);
    continue;
  }
  const pages = Math.min(pageCount(first), maxPages);
  for (let p = 1; p <= pages; p++) {
    const html =
      p === 1
        ? first
        : await cached(`${ORIGIN}/shop/c/${cat.id}_p${p}/`, `cat_${cat.id}_${p}.html`);
    if (!html) continue;
    const links = productLinks(html);
    console.log(`${cat.id} 第 ${p}/${pages} 页：${links.length} 个商品`);
    for (const jan of links) if (!jans.includes(jan)) jans.push(jan);
  }
}

console.log(`\n共 ${jans.length} 个商品，开始逐个取详情页`);

/* ---------------------------------------------------------------- 详情页 */

const products = [];
let cursor = 0;
let done = 0;
let failed = 0;

async function worker() {
  while (cursor < jans.length) {
    const jan = jans[cursor++];
    if (products.length >= limit) return;
    const html = await cached(`${ORIGIN}/shop/g/g${jan}/`, `item_${jan}.html`);
    if (html) {
      const record = parseProduct(html, jan);
      if (record) products.push(record);
      else failed++;
    } else {
      failed++;
    }
    done++;
    if (done % 100 === 0) {
      process.stdout.write(`\r  ${done}/${jans.length}  失败 ${failed}  `);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
process.stdout.write('\n');

/* 同一个商品可能在两个分类下出现，按 id 去重 */
const byId = new Map();
for (const p of products) {
  const old = byId.get(p.id);
  if (!old) {
    byId.set(p.id, p);
    continue;
  }
  /* 保留信息更全的一条 */
  const score = (r) => (r.priceJpy ? 2 : 0) + (r.released ? 2 : 0) + (r.series ? 1 : 0);
  if (score(p) > score(old)) byId.set(p.id, p);
}

const list = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(join(ROOT, OUT_FILE), JSON.stringify(list, null, 2) + '\n', 'utf8');

const withPrice = list.filter((p) => p.priceJpy).length;
const withDate = list.filter((p) => p.released).length;
console.log(`\n写出 ${list.length} 条到 ${OUT_FILE}`);
console.log(`  有定价 ${withPrice} 条 · 有发售日 ${withDate} 条 · 失败 ${failed} 条`);
const byCat = new Map();
for (const p of list) byCat.set(p.category, (byCat.get(p.category) || 0) + 1);
console.log('  品类分布：', [...byCat].map(([k, v]) => `${k}=${v}`).join(' / '));
const series = new Set(list.map((p) => p.series));
console.log(`  作品线 ${series.size} 条`);
