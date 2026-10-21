#!/usr/bin/env node
/**
 * 良笑（Good Smile Company）产品采集
 * ---------------------------------------------------------------------------
 * 良笑的产品库在 goodsmile.info——不是商城，而是产品资料库，每个产品一页，
 * 给出中文品名、作品名、分类、含税定价、发售年月与规格说明。
 * 商城 goodsmileshop.com 正在维护（2026-10-21 起），资料库这条线照常可用。
 *
 * 中文页是繁体，��是良笑官方中文站的写法，原样保留不做转换。
 *
 * 主题（角色）从品名里取：品名的开头是产品线名（figma / 黏土人 / 比例手辦…），
 * 后面才是角色。配件、套组一类没有角色，不进主题维度。
 *
 * 用法：node scripts/harvest-goodsmile.mjs [--limit N] [--pages N] [--concurrency N]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://www.goodsmile.info';
const CACHE_DIR = join(ROOT, '.cache', 'goodsmile');
const OUT_FILE = 'src/data/models.kits.goodsmile.json';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const DELAY = 200;

/** 采集哪几个分类 */
const CATEGORIES = ['figma', 'nendoroid_series', 'scale'];

/**
 * 分类名 → 库里的品类。
 *
 * 良笑的中文页面把 Nendoroid 写成「黏土人」，比例手办按比例写
 * （「1/7比例模型」「1/8比例模型」「其他比例模型」），周边叫「周邊商品」。
 */
const CATEGORY_MAP = {
  figma: 'figma',
  figmaPLUS: 'figma',
  figFIX: 'figma',
  'figma Vehicles': 'figma',
  'figma Vehicle': 'figma',
  'ex:ride': 'figma',
  黏土人: 'nendoroid',
  黏土娃: 'nendoroid',
  坐吧黏土人: 'nendoroid',
  小黏土人: 'nendoroid',
  巨大黏土人: 'nendoroid',
  驚喜黏土人: 'nendoroid',
  黏土人Light: 'nendoroid',
  黏土人Plus: 'nendoroid',
  黏土人配件系列: 'nendoroid',
  黏土人換裝系列: 'nendoroid',
  黏土人場景系列: 'nendoroid',
  比例模型: 'scale',
  其他比例模型: 'scale',
  'WONDERFUL HOBBY SELECTION': 'scale',
  企鵝: 'stiky',
  STICKY: 'stiky',
  'STICKY FIGURE': 'stickyfigure',
  PIXEL: 'pixel',
  MODEROID: 'modroid',
  PLAMATEA: 'plamatea',
  OTHERFIGURE: 'other',
  '其他FIGURE': 'other',
  GOODS: 'goods',
  GOODS其他: 'goods',
  周邊商品: 'goods',
  流行服飾雜貨: 'goods',
  飾品配件: 'goods',
  收藏系列: 'goods',
  文具: 'goods',
  布偶: 'goods',
  書冊: 'goods',
  轉蛋盒玩: 'goods',
  軟膠模型: 'goods',
  其他: 'goods',
};

/** 「1/7比例模型」这类按比例写的分类 */
const SCALE_CATEGORY = /^\d+\/\d+比例模型$/;

/**
 * 分類字段可能是多项的（「周邊商品 , 黏土人Plus」）——
 * 前一项说明它是什么，后一项说明它挂在哪条产品线上。
 * 以第一项能认出的为准；认不出就当周边。
 */
function categoryOf(raw) {
  const parts = raw
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const part of parts) {
    const hit = CATEGORY_MAP[part] ?? (SCALE_CATEGORY.test(part) ? 'scale' : null);
    if (hit) return hit;
  }
  return 'goods';
}

/**
 * 产品线名：品名的开头是它，剥掉之后才是角色。
 *
 * 良笑的产品线名有长有短（黏土人 / 坐吧黏土人！ / 巨大黏土人 / 黏土人Plus…），
 * 后面的标点也一并吃掉。
 */
const LINE_PREFIX =
  /^(?:figmaPLUS|figma|figFIX|ex:ride|坐吧黏土人|巨大黏土人|驚喜黏土人|小黏土人|黏土人Plus|黏土人配件|黏土人|黏土娃|比例手辦|企鵝|PIXEL|MODEROID|PLAMATEA|STICKY FIGURE|STICKY|其他FIGURE|OTHER FIGURE)[\s!！:：]*/i;

/** 配件与套组：没有角色，不进主题维度 */
const ACCESSORY = /(配件|套組|零件|台座|底座|支架|替換|武器|素体|body|裝備|底盤|光源|本体only)/i;

const args = process.argv.slice(2);
const argNum = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const limit = argNum('--limit', Infinity);
const maxPages = argNum('--pages', Infinity);
const CONCURRENCY = argNum('--concurrency', 4);

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

async function fetchText(url) {
  let backoff = 3_000;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'zh-TW,zh;q=0.9',
          Referer: `${ORIGIN}/zh/products`,
        },
        redirect: 'follow',
      });
      if (!res.ok) return '';
      return await res.text();
    } catch {
      if (attempt === 3) return '';
      await new Promise((r) => setTimeout(r, backoff));
      backoff *= 2;
    }
  }
  return '';
}

async function cached(url, file) {
  const abs = join(CACHE_DIR, file);
  if (existsSync(abs)) return readFileSync(abs, 'utf8');
  const html = await fetchText(url);
  if (html) writeFileSync(abs, html, 'utf8');
  if (html) await new Promise((r) => setTimeout(r, DELAY));
  return html;
}

function strip(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/\s+/g, ' ')
    .trim();
}

/** 规格表 */
function specRows(html) {
  const rows = {};
  for (const m of html.matchAll(/<dt[^>]*>([\s\S]{0,120}?)<\/dt>\s*<dd[^>]*>([\s\S]{0,800}?)<\/dd>/g)) {
    const key = strip(m[1]);
    const value = strip(m[2]);
    if (key && value && !rows[key]) rows[key] = value;
  }
  return rows;
}

/** 列表页 → 产品 id */
function productIds(html) {
  return [...new Set([...html.matchAll(/\/(?:zh|en|ja)\/product\/(\d+)\//g)].map((m) => m[1]))];
}

/** 列表页的总页数 */
function pageCount(html) {
  const m = /頁數：\d+\s*\/\s*(\d+)/.exec(html);
  return m ? Number(m[1]) : 1;
}

/** 主题（角色）：剥掉产品线前缀 */
function subjectOfName(name) {
  if (ACCESSORY.test(name)) return null;
  const bare = name.replace(LINE_PREFIX, '').trim();
  if (!bare) return null;
  if (ACCESSORY.test(bare)) return null;
  return bare;
}

/** 解析一个产品页 */
function parseProduct(html, id) {
  const rows = specRows(html);
  const name = rows['商品名稱'] || '';
  if (!name) return null;

  const series = rows['作品名稱'] || '';
  const rawCategory = rows['分類'] || '';
  const category = categoryOf(rawCategory);

  /* 價格：10,500日圓 （含稅） */
  let priceJpy = 0;
  const pm = /([\d,]+)\s*日圓/.exec(rows['價格'] || '');
  if (pm) priceJpy = Number(pm[1].replace(/,/g, ''));

  /* 發售日期：2022/02 或 2022/02/25 */
  let released = '';
  const rm = /(\d{4})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{1,2}))?/.exec(rows['發售日期'] || '');
  if (rm) {
    released = rm[3]
      ? `${rm[1]}-${rm[2].padStart(2, '0')}-${rm[3].padStart(2, '0')}`
      : `${rm[1]}-${rm[2].padStart(2, '0')}`;
  }

  /* 規格：ABS&PVC 塗裝完成可動模型・無比例・附專用台座・全高：約130mm */
  const spec = rows['商品規格'] || '';
  let heightMm = null;
  const hm = /全高[：:]\s*約\s*(\d{2,4})\s*mm/.exec(spec);
  if (hm) heightMm = Number(hm[1]);
  const material = spec
    .split('・')
    .map((s) => s.trim())
    .find((s) => /PVC|ABS| polystyrene|聚氯乙烯|聚苯乙烯/i.test(s)) ?? null;

  const ogImage = /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/.exec(html);
  const imageUrl = ogImage ? ogImage[1].replace(/^http:/, 'https:') : null;

  const subject = subjectOfName(name);

  return {
    id: `goodsmile-${id}`,
    name,
    nameJa: '',
    maker: 'goodsmile',
    category,
    series,
    scale: '',
    released,
    priceJpy,
    priceCny: 0,
    channel: 'general',
    subject,
    subjectKind: subject ? 'character' : null,
    aliases: [rows['原稱']].filter(Boolean).filter((a) => a !== name),
    /* 良笑的目录里也收录别家公司代工或代发的产品，制造与发售厂商记在这里，
       免得把 FREEing、TOMYTEC 之类说成良笑自己做的 */
    tags: [rows['製造商'], rows['發售商']].filter(Boolean),
    note: rows['原型製作'] ? `原型製作：${rows['原型製作']}` : '',
    verified: true,
    source: `${ORIGIN}/zh/product/${id}/`,
    image: null,
    imageUrl,
    /* 页面只标「含稅」，没写税率，不猜 */
    taxRate: null,
    sourceJp: `${ORIGIN}/en/product/${id}/`,
  };
}

/* ---------------------------------------------------------------- 分类页 */

const ids = [];
for (const cat of CATEGORIES) {
  const first = await cached(`${ORIGIN}/zh/products/category/${cat}`, `cat_${cat}_1.html`);
  if (!first) {
    console.log(`${cat} 取不到，跳过`);
    continue;
  }
  const pages = Math.min(pageCount(first), maxPages);
  for (let p = 1; p <= pages; p++) {
    const html =
      p === 1
        ? first
        : await cached(`${ORIGIN}/zh/products/category/${cat}/page/${p}`, `cat_${cat}_${p}.html`);
    if (!html) continue;
    const list = productIds(html);
    console.log(`${cat} 第 ${p}/${pages} 页：${list.length} 个产品`);
    for (const id of list) if (!ids.includes(id)) ids.push(id);
  }
}

console.log(`\n共 ${ids.length} 个产品，开始逐个取详情页`);

/* ---------------------------------------------------------------- 详情页 */

const products = [];
let cursor = 0;
let done = 0;
let failed = 0;

async function worker() {
  while (cursor < ids.length) {
    const id = ids[cursor++];
    if (products.length >= limit) return;
    const html = await cached(`${ORIGIN}/zh/product/${id}/`, `item_${id}.html`);
    if (html) {
      const record = parseProduct(html, id);
      if (record) products.push(record);
      else failed++;
    } else {
      failed++;
    }
    done++;
    if (done % 100 === 0) {
      process.stdout.write(`\r  ${done}/${ids.length}  失败 ${failed}  `);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
process.stdout.write('\n');

const byId = new Map();
for (const p of products) if (!byId.has(p.id)) byId.set(p.id, p);

const list = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(join(ROOT, OUT_FILE), JSON.stringify(list, null, 2) + '\n', 'utf8');

const withPrice = list.filter((p) => p.priceJpy).length;
const withDate = list.filter((p) => p.released).length;
const withSubject = list.filter((p) => p.subject).length;
console.log(`\n写出 ${list.length} 条到 ${OUT_FILE}`);
console.log(
  `  有定价 ${withPrice} 条 · 有发售日 ${withDate} 条 · 有角色 ${withSubject} 条 · 失败 ${failed} 条`,
);
const byCat = new Map();
for (const p of list) byCat.set(p.category, (byCat.get(p.category) || 0) + 1);
console.log('  品类分布：', [...byCat].map(([k, v]) => `${k}=${v}`).join(' / '));
console.log(`  作品线 ${new Set(list.map((p) => p.series)).size} 条`);
