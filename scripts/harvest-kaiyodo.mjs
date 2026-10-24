#!/usr/bin/env node
/**
 * 海洋堂（KAIYODO）产品采集
 * ---------------------------------------------------------------------------
 * 海洋堂官网（kaiyodo.co.jp）的商品资料是库里最全的一家：官方日文品名、
 * 税込与税抜两种定价、発売予定月、缩放、材质、商品番号与原型制作人，都在
 * 商品页的规格区里。
 *
 * 目录用官网自己的 WordPress 接口列（/items/wp-json/wp/v2/posts），
 * 只取模型套件那几条线：
 *
 *   プラモケイ               塑料模型套件（ARTPLA 等）
 *   デジタルガレージキット     数字模型套件
 *   アッセンブルボーグネクサス 1/35 机甲套件
 *   マシーネンクリーガー       树脂套件
 *
 * 手办与涂装线不在范围内——这个库收的是「模型」。
 *
 * 用法：node scripts/harvest-kaiyodo.mjs [--delay MS] [--limit N]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://kaiyodo.co.jp';
const API = `${ORIGIN}/items/wp-json/wp/v2/posts`;
const CACHE_DIR = join(ROOT, '.cache', 'kaiyodo');
const OUT_FILE = join(CACHE_DIR, 'catalog.json');

/** 官网自己的分类 id → 库里的品类与作品线 */
const CATEGORIES = [
  { id: 1258, jp: 'プラモケイ', category: 'kaiyodo:plamo', series: 'プラモケイ' },
  { id: 1097, jp: 'デジタルガレージキット', category: 'kaiyodo:dgarage', series: 'デジタルガレージキット' },
  { id: 14, jp: 'アッセンブルボーグネクサス', category: 'kaiyodo:mecha', series: 'アッセンブルボーグネクサス' },
  { id: 1238, jp: 'マシーネンクリーガー', category: 'kaiyodo:mk', series: 'マシーネンクリーガー' },
];

const args = process.argv.slice(2);
const argNum = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const DELAY = argNum('--delay', 1200);
const limit = argNum('--limit', Infinity);

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 取一个 URL（直连优先，不行再走本机代理） */
function fetchRaw(url, file) {
  const abs = join(CACHE_DIR, file);
  if (existsSync(abs)) return readFileSync(abs);
  const base = ['-sL', '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0 Safari/537.36', '--max-time', '40', '-o', abs, url];
  for (const extra of [[], ['--proxy', 'http://127.0.0.1:7897']]) {
    try {
      execFileSync('curl.exe', [...extra, ...base], { stdio: 'ignore' });
    } catch {
      /* 换下一条路 */
    }
    if (existsSync(abs) && readFileSync(abs).length > 200) return readFileSync(abs);
  }
  return Buffer.alloc(0);
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

const strip = (s) => decodeEntities(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/**
 * 规格区。
 *
 * 写法有两种：规格框里的「■サイズ / ■素材表示 / ■JAN / ■原型制作」，
 * 以及正文里的「■スケール：1/200スケール 全高約360mm」。两处都收。
 */
function specOf(html) {
  const box = /<div class="box_spec"[\s\S]*?<\/div>\s*<\/div>/.exec(html);
  const src = box ? box[0] : html;
  const out = {};
  const size = /■(?:サイズ|スケール)[:：]?\s*(?:<br \/>)?\s*([^<]*)/.exec(src);
  if (size) {
    const t = strip(size[1]);
    out.size = t;
    const ratio = /\b(\d{1,2})\/(\d{1,3})\b/.exec(t);
    if (ratio) out.scale = `${ratio[1]}/${ratio[2]}`;
    const h = /全高[^0-9]{0,6}(\d{2,4})\s*mm/.exec(t);
    if (h) out.heightMm = Number(h[1]);
  }
  const material = /■素材表示\s*(?:<br \/>)?\s*([^<]*)/.exec(src);
  if (material) out.material = strip(material[1]);
  else {
    const alt = /■プラスチックモデルキット\s*(?:（接着剤必要）)?/.exec(src);
    if (alt) out.material = 'プラスチックモデルキット';
  }
  const jan = /■JAN\s*(?:<br \/>)?\s*([0-9]+)/.exec(src);
  if (jan) out.jan = jan[1];
  const sculptor = /■原型制作\s*(?:<br \/>)?\s*([^<]*)/.exec(src);
  if (sculptor) out.sculptor = strip(sculptor[1]);
  return out;
}

/** 价格与発売时期（价格在 <span class="pricetxt"> 里，先去标签再取） */
function priceOf(html) {
  const out = {};
  const block = /<div class="price">([\s\S]{0,900}?)<\/div>/.exec(html);
  const text = strip(block ? block[1] : html);
  const taxed = /税込価格[:：]?\s*([\d,]+)\s*円/.exec(text);
  if (taxed) out.priceJpy = Number(taxed[1].replace(/,/g, ''));
  const base = /税抜価格[:：]?\s*([\d,]+)\s*円/.exec(text);
  if (base) out.priceJpyExTax = Number(base[1].replace(/,/g, ''));
  const release = /発売時期[:：]?\s*([0-9]{4})\s*年\s*([0-9]{1,2})?\s*月?/.exec(text);
  if (release) {
    out.released = release[2] ? `${release[1]}-${String(release[2]).padStart(2, '0')}` : release[1];
  }
  const announced = /案内日[:：]?\s*([0-9]{4})\.([0-9]{2})\.([0-9]{2})/.exec(text);
  if (announced) out.announced = `${announced[1]}-${announced[2]}-${announced[3]}`;
  return out;
}

/** 商品图：图集里的第一张 */
function imageOf(html) {
  const m = /<img[^>]+src="(https:\/\/kaiyodo\.co\.jp\/items\/wp-content\/uploads\/[^"]+?\.(?:jpg|jpeg|png))"/i.exec(html);
  return m ? m[1] : null;
}

/* ------------------------------------------------------------ 目录枚举 */

const products = new Map();

for (const cat of CATEGORIES) {
  const raw = fetchRaw(`${API}?categories=${cat.id}&per_page=100`, `api_${cat.id}.json`);
  let list = [];
  try {
    list = JSON.parse(raw.toString('utf8'));
  } catch {
    console.log(`${cat.jp}：接口没取到`);
    continue;
  }
  console.log(`${cat.jp}：${list.length} 条`);
  for (const item of list) {
    const slug = item.slug || '';
    const code = (slug.split('/').pop() || '').toUpperCase();
    if (!products.has(code)) {
      products.set(code, {
        code,
        name: decodeEntities(item.title.rendered),
        url: item.link,
        category: cat.category,
        series: cat.series,
      });
    }
  }
}

console.log(`去重后 ${products.size} 件，开始逐个取商品页`);

/* ------------------------------------------------------------ 逐条详情 */

let done = 0;
let failed = 0;
for (const p of products.values()) {
  const file = `item_${p.code}.html`;
  const html = fetchRaw(p.url, file).toString('utf8');
  if (html.length > 500) {
    Object.assign(p, specOf(html), priceOf(html));
    p.imageUrl = imageOf(html);
    /* 商品番号：页面上写的编号优先，没有就用 slug */
    const no = /商品番号[:：]?\s*([A-Z0-9\-]{3,12})/i.exec(html);
    if (no) p.itemNo = no[1].toUpperCase();
  } else {
    failed++;
  }
  done++;
  if (done % 25 === 0) console.log(`  ${done}/${products.size}（失败 ${failed}）`);
  if (products.size - done < 1) break;
  await sleep(DELAY);
}

const list = [...products.values()];
writeFileSync(OUT_FILE, JSON.stringify(list, null, 1), 'utf8');

const withPrice = list.filter((p) => p.priceJpy).length;
const withDate = list.filter((p) => p.released).length;
const withImage = list.filter((p) => p.imageUrl).length;
console.log(`\n写出 ${list.length} 条到 ${OUT_FILE}`);
console.log(`  有定价 ${withPrice} · 有発売时期 ${withDate} · 有图 ${withImage} · 失败 ${failed}`);
