#!/usr/bin/env node
/**
 * VOLKS（ボークス／造形村）官方 EC 商城采集
 * ---------------------------------------------------------------------------
 * 来源：https://hobby.ec.volks.co.jp/ —— VOLKS 自营的「ホビー天国」商城。
 *
 * 列表页把每个商品放在隐藏表单里（ITEM_CD / ITEM_NAME / ITEM_TEIKA / ITEM_CATEGORY），
 * 一页 30 条，翻页参数是 request=page&next_page=N。
 *
 * 商品页给的字段很全：商品名、税込価格、本体価格、発売日時、シリーズ、スケール、
 * パーツ総数、素材、原型制作、商品图片。
 *
 * 收的是 VOLKS 自家的**模型套件**（SWS 航空套件、1/12 摩托 V.F. 等），
 * 工具/涂料/书籍/周边/完成品手办一律排除——这个库记的是模型本体。
 *
 * robots.txt 允许抓取，Crawl-delay: 1，所以这里限速 1 秒。
 *
 * 用法：
 *   node scripts/harvest-volks.mjs [--list-only] [--categories H_SCALE,H_MECHA]
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const CACHE_DIR = join(ROOT, '.cache', 'volks');
const LIST_OUT = join(ROOT, '.cache', 'volks-list.json');
const OUT = join(ROOT, 'src', 'data', 'models.kits.volks.json');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const argv = process.argv.slice(2);
const LIST_ONLY = argv.includes('--list-only');
const argOf = (flag, dflt) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const CATEGORIES = argOf('--categories', 'H_SCALE,H_MECHA').split(',').filter(Boolean);
const CONCURRENCY = Math.max(1, Number(argOf('--concurrency', 3)));
const DELAY_MS = 1200;

mkdirSync(CACHE_DIR, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, cacheName) {
  const cache = join(CACHE_DIR, `${cacheName}.html`);
  if (existsSync(cache)) return readFileSync(cache, 'utf8');
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'ja' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      writeFileSync(cache, html);
      return html;
    } catch (err) {
      if (attempt === 3) throw err;
      await sleep(1500 * 2 ** attempt);
    }
  }
  return '';
}

/** 列表页里的隐藏表单：一件商品一组 ITEM_CD / ITEM_NAME / ITEM_TEIKA / ITEM_CATEGORY */
function parseList(html) {
  const items = [];
  const re = /<input[^>]*name="ITEM_CD"[^>]*value="([^"]+)"\s*\/>\s*<input[^>]*name="ITEM_NAME"[^>]*value="([^"]*)"\s*\/>\s*<input[^>]*name="ITEM_TEIKA"[^>]*value="([^"]*)"\s*\/>\s*(?:<input[^>]*name="ITEM_CATEGORY"[^>]*value="([^"]*)"\s*\/>)?/g;
  let m;
  while ((m = re.exec(html))) {
    items.push({ itemCd: m[1], name: m[2], price: m[3], category: m[4] || '' });
  }
  return items;
}

const all = new Map();
for (const cat of CATEGORIES) {
  let page = 1;
  let lastCount = -1;
  while (page <= 40) {
    const url =
      `https://hobby.ec.volks.co.jp/category/${cat}/` +
      `?SEARCH_MAX_ROW_LIST=30&item_list_mode=2&sort_order=1&request=page&next_page=${page}`;
    const html = await get(url, `list-${cat}-${page}`);
    const items = parseList(html);
    let added = 0;
    for (const it of items) {
      if (!all.has(it.itemCd)) { all.set(it.itemCd, { ...it, cat }); added++; }
    }
    console.log(`${cat} 第${page}页：${items.length} 条，新增 ${added} 条`);
    if (!items.length || (lastCount > 0 && added === 0)) break;
    lastCount = items.length;
    page++;
    await sleep(DELAY_MS);
  }
}

const list = [...all.values()];
writeFileSync(LIST_OUT, JSON.stringify(list, null, 2), 'utf8');
console.log(`\n列表合计 ${list.length} 件 → ${LIST_OUT}`);

/* 工具/涂料/书籍/周边/服务不是模型本体，先剔掉 */
const NON_KIT = new Set(['H_TOOL', 'H_PAINT', 'H_BOOK', 'H_GOODS', 'H_SERVICE', 'H_EVENT']);
const candidates = list.filter((it) => {
  const parts = it.category.split(':');
  if (parts.some((c) => NON_KIT.has(c))) return false;
  return parts.includes('H_SCALE') || parts.includes('H_MECHA');
});
console.log(`候选（模型/机甲类，去掉工具涂料书籍周边）：${candidates.length} 件`);

if (LIST_ONLY) {
  const byCat = {};
  for (const it of list) byCat[it.category] = (byCat[it.category] || 0) + 1;
  console.log('\n子类分布：');
  for (const [k, v] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
  console.log('\n名称样本：');
  for (const it of list.slice(0, 40)) console.log(`  ${it.itemCd}  ${it.price}  ${it.category}\n      ${it.name}`);
  process.exit(0);
}

/* 逐件抓商品页 */
const facts = [];
let cursor = 0;
async function worker() {
  while (cursor < candidates.length) {
    const it = candidates[cursor++];
    const url = `https://hobby.ec.volks.co.jp/item/${it.itemCd}.html`;
    let html = '';
    try {
      html = await get(url, `item-${it.itemCd}`);
    } catch (err) {
      console.error(`  ! ${it.itemCd} ${err.message}`);
      continue;
    }
    facts.push({ ...it, url });
    if (facts.length % 20 === 0) console.log(`  …商品页 ${facts.length}/${candidates.length}`);
    await sleep(DELAY_MS);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

writeFileSync(join(CACHE_DIR, 'items.json'), JSON.stringify(facts, null, 2), 'utf8');
console.log(`商品页抓取完成：${facts.length} 件`);
