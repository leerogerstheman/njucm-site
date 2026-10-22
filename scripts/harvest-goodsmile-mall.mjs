#!/usr/bin/env node
/**
 * 良笑商城（www.goodsmile.com）商品目录采集
 * ---------------------------------------------------------------------------
 * 良笑商城是良笑自家的线上商店（官网 goodsmile.info 是**产品资料库**，只给
 * 品名、发售月与建议零售价；商城才是真正卖东西的地方，给的是**当下的在售
 * 状态、现价与限定标签**）。两边的 id 各是各的（资料库用自己的编号，商城用
 * 商城系统的商品 id），所以这一轮只负责把商城的「现状」原样抓下来，
 * 由 scripts/build-models-data.mjs 负责和资料库对齐。
 *
 * 抓取入口用的是商城前端自己调的那个列表接口：
 *
 *   GET /zh/category/<分类 id>/list?subcategory=0&orderBy=2&limit=100&offset=<n>
 *
 * 它返回商品卡片的 HTML 片段，每张卡片里有：商城商品 id、商城商品番号、
 * 中文品名、日文品名（图片 alt）、制造厂牌、状态标签（開放預購中／附特典／
 * 限定商品…）与现价。
 *
 * 排序用 orderBy=2（依開放預購日期排序）：商城这一侧的繁中资料是近几年的
 * 商品才补齐的，越靠后的老商品卡片上中文名与价格都是空的。排在前面先把
 * 有中文资料的那批拿到手，后面的翻页照样能补全。
 *
 * 为什么不碰检索页：商城的 robots.txt 明确禁掉了检索页（Disallow 的模式是
 * 「任意前缀 + /search」，注释写明是「抑制机器人访问检索页」）。分类列表接口
 * 不在这条规则里，是普通页面资源，所以用它来枚举。
 *
 * 抓取方式对源站保持客气：每个响应都落盘缓存（可中断续跑），
 * 请求之间留间隔，遇到失败退避重试。
 *
 * 用法：node scripts/harvest-goodsmile-mall.mjs [--max-id N] [--limit N]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://www.goodsmile.com';
const LOCALE = 'zh';
const CACHE_DIR = join(ROOT, '.cache', 'gscmall');
const OUT_FILE = 'src/data/models.kits.goodsmile-mall.json';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

/** 请求之间的间隔，毫秒 */
const DELAY = 220;
/** 每页取多少张卡片 */
const PAGE = 100;
/** 分类 id 的上界——超过这个数就当没有更多分类了 */
const DEFAULT_MAX_ID = 200;
/** 单个分类最多翻多少页 */
const MAX_PAGES = 30;
/** 排序：2 = 依開放預購日期排序（新的在前） */
const ORDER_BY = 2;

const maxIdArg = process.argv.indexOf('--max-id');
const MAX_ID = maxIdArg >= 0 ? Number(process.argv[maxIdArg + 1]) : DEFAULT_MAX_ID;
const limitArg = process.argv.indexOf('--limit');
const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url) {
  let backoff = 2_000;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'zh-TW,zh;q=0.9',
        },
        redirect: 'follow',
      });
      if (!res.ok) return '';
      return await res.text();
    } catch {
      if (attempt === 3) return '';
      await sleep(backoff);
      backoff *= 2;
    }
  }
  return '';
}

/** 带缓存的抓取：命中缓存就不再打扰源站 */
async function cached(url, file) {
  const abs = join(CACHE_DIR, file);
  if (existsSync(abs)) return readFileSync(abs, 'utf8');
  const html = await fetchText(url);
  if (html) writeFileSync(abs, html, 'utf8');
  return html;
}

/** 从 HTML 片段里剥出纯文本 */
function textOf(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 解析一张商品卡片。
 *
 * 卡片结构（商城的 p-product-list__item）：
 *   <a class="p-product-list__link" href="/zh/product/1145974">
 *     <figure class="b-product-item__image">
 *       <picture><img src=".../product/image/1145974/xxx.jpg" alt="figma ソーダ：トゥインクルバニー"></picture>
 *       <figcaption class="b-product-item__image__caption">710</figcaption>   ← 商城商品番号
 *     </figure>
 *     <div class="b-product-item__logo">
 *       <picture><img src=".../maker/1/logo_gsc.png" alt="Good Smile Company"></picture>
 *     </div>
 *     <ul class="b-product-list__label">
 *       <li class="c-label c-label--third "> 開放預購中 </li>                 ← 状态标签
 *     </ul>
 *     <div class="b-product-item__title"><h2 class="c-title c-title--level8">figma 索達：閃亮兔女郎</h2></div>
 *     <div class="b-product-item__price"><span class="c-price__main">￥14,800</span></div>
 */
function parseCard(card, categoryId) {
  const idm = card.match(/href="\/zh\/product\/(\d+)"/);
  if (!idm) return null;
  const mallId = idm[1];

  const imgm = card.match(/\/gsc-webrevo-sdk-storage-prd\/product\/image\/([^"']+?\.(?:jpg|jpeg|png|webp))/);
  const imageUrl = imgm ? `${ORIGIN}/gsc-webrevo-sdk-storage-prd/product/image/${imgm[1]}` : null;

  /* alt 有两处：商品图（日文名）与厂牌 logo（厂牌名）。商品图在前。 */
  const alts = [...card.matchAll(/<img[^>]+alt="([^"]*)"/g)].map((m) => m[1]);
  const nameJa = alts.length ? alts[0].trim() : '';
  const makerName = alts.length > 1 ? alts[1].trim() : '';

  const makerm = card.match(/maker\/(\d+)\/([^"']+?)\.(?:png|jpg|svg|webp)/);
  const makerId = makerm ? makerm[1] : '';
  const makerSlug = makerm ? makerm[2] : '';

  const nom = card.match(/b-product-item__image__caption">\s*([\dA-Za-z\-]+)\s*</);
  const mallNo = nom ? nom[1] : '';

  const labelBlock = card.match(/<ul class="b-product-item__label">([\s\S]*?)<\/ul>/);
  const labels = labelBlock
    ? [...labelBlock[1].matchAll(/<li class="c-label[^"]*"[^>]*>([\s\S]*?)<\/li>/g)]
        .map((m) => textOf(m[1]))
        .filter(Boolean)
    : [];

  const titlem = card.match(/<h2 class="c-title c-title--level8">([\s\S]*?)<\/h2>/);
  const name = titlem ? textOf(titlem[1]) : '';

  const pricem = card.match(/c-price__main">([^<]*)<\/span>/);
  const priceJpy = pricem ? Number(pricem[1].replace(/[^\d]/g, '')) || 0 : 0;

  return {
    mallId,
    mallNo,
    name,
    nameJa,
    maker: makerName,
    makerId,
    makerSlug,
    labels,
    priceJpy,
    imageUrl,
    categoryIds: [categoryId],
    url: `${ORIGIN}/${LOCALE}/product/${mallId}`,
  };
}

/* -------------------------------------------------------------------------- */
/* 枚举                                                                        */
/* -------------------------------------------------------------------------- */

const products = new Map();
let requests = 0;
let emptyCategories = 0;

for (let cat = 1; cat <= MAX_ID; cat++) {
  if (products.size >= limit) break;

  let got = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * PAGE;
    const url = `${ORIGIN}/${LOCALE}/category/${cat}/list?subcategory=0&orderBy=${ORDER_BY}&limit=${PAGE}&offset=${offset}`;
    const html = await cached(url, `list_o${ORDER_BY}_${cat}_${offset}.html`);
    requests++;
    if (!html) break;

    const chunks = html.split('<div class="p-product-list__item">').slice(1);
    if (!chunks.length) break;

    for (const chunk of chunks) {
      const rec = parseCard(chunk, cat);
      if (!rec) continue;
      got++;
      const prev = products.get(rec.mallId);
      if (prev) {
        if (!prev.categoryIds.includes(cat)) prev.categoryIds.push(cat);
      } else {
        products.set(rec.mallId, rec);
      }
    }

    if (chunks.length < PAGE) break;
    await sleep(DELAY);
  }

  if (got) {
    emptyCategories = 0;
    process.stdout.write(`分类 ${cat}: ${got} 条\n`);
  } else {
    emptyCategories++;
    /* 连续 25 个空分类就认为到头了 */
    if (emptyCategories >= 25) {
      console.log(`\n连续 ${emptyCategories} 个空分类，停在 ${cat}`);
      break;
    }
  }
  await sleep(DELAY);
}

const list = [...products.values()].sort((a, b) => Number(a.mallId) - Number(b.mallId));
writeFileSync(join(ROOT, OUT_FILE), JSON.stringify(list, null, 2) + '\n', 'utf8');

/* -------------------------------------------------------------------------- */
/* 汇报                                                                        */
/* -------------------------------------------------------------------------- */

const labelCounts = new Map();
for (const p of list) for (const l of p.labels) labelCounts.set(l, (labelCounts.get(l) || 0) + 1);

console.log(`\n共 ${list.length} 个商城商品，写出 ${OUT_FILE}`);
console.log(`请求 ${requests} 次`);
console.log('\n标签词表：');
for (const [l, c] of [...labelCounts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(c).padStart(5)}  ${l}`);
}
