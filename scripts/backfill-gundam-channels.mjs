#!/usr/bin/env node
/**
 * 中文站商品详情页回填
 *
 * 列表页给的信息是贫血的：只有中文名、一张图、一个日元建议零售价（限定品
 * 往往没有）和发售月份。真正有价值的几样东西全在详情页上：
 *
 *   - 渠道徽章  <div class="pg-products__tag">线上售卖 / 高达基地限定</div>
 *     这是官方自己给的渠道判定，比从品名里猜「高达基地限定」四个字可靠得多。
 *   - 人民币零售价  高达基地零售价 398元 / 官方旗舰店零售价 xxx元
 *     限定品只有人民币价，之前数据库里这类条目一律记 0。
 *   - 精确发售日期  2026年9月30日（列表页只给到月）
 *   - 官方商品图多张（详情页有轮播图，列表页只有一张）
 *
 * 顺带把限定品从商品卡里看不出来的问题解决掉：网络限定商品的渠道徽章
 * 就是「线上售卖」。
 *
 * 节奏：一次一个请求，固定间隔；遇 405 指数退避；页面落盘可续跑。
 *
 * 用法：node scripts/backfill-gundam-channels.mjs [--limit N] [--all]
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
const CACHE = join(ROOT, '.cache', 'gundam-details');
const JSONL = join(CACHE, 'details.jsonl');
const OUT_FILE = 'src/data/gundam.kits.itemall.json';
const ORIGIN = 'https://www.bandaihobbysite.cn';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const DELAY = 750;
const MAX_BACKOFF = 300_000;

mkdirSync(CACHE, { recursive: true });

const limitArg = process.argv.indexOf('--limit');
const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;
/* --all 表示连普通商品也回填，不只是限定品 */
const onlyLimited = !process.argv.includes('--all');

const catalog = JSON.parse(readFileSync(join(ROOT, OUT_FILE), 'utf8'));

const GRADE_RULES = [
  [/^HGUC/i, 'HG'],
  [/^HG/i, 'HG'],
  [/^RG/i, 'RG'],
  [/^MG\s*Ver\.?\s*Ka/i, 'MG'],
  [/^MGSD/i, 'MGSD'],
  [/^MGEX/i, 'MG'],
  [/^RE\s*\/\s*100/i, 'MG'],
  [/^MG/i, 'MG'],
  [/^PG/i, 'PG'],
  [/^ENTRY\s*GRADE/i, 'EG'],
  [/^EG/i, 'EG'],
  [/^FULL\s*MECHANICS/i, 'FM'],
  [/^FM/i, 'FM'],
  [/^SDCS/i, 'SD'],
  [/^SDEX/i, 'SD'],
  [/^METAL\s*ROBOT/i, 'MR'],
  [/^HIGH[- ]?RESOLUTION/i, 'MR'],
  [/^SD\b/i, 'SD'],
  [/^BB/i, null],
];

const NOT_A_MODEL =
  /扩张特效组件|扩展组件|零件套组|专用零件|改造零件|外形提升零件|形状提升零件|特效件|水贴|贴纸|说明书|胶水|涂装工具|工具套装|可动底座|底座|支架|一番赏|透明保护/;

function gradeOf(name) {
  for (const [re, grade] of GRADE_RULES) if (re.test(name)) return grade;
  return null;
}

const models = catalog.filter((x) => gradeOf(x.name) && !NOT_A_MODEL.test(x.name));

/* 之前抓过的详情页不重复抓 */
const done = new Set();
if (existsSync(JSONL)) {
  for (const line of readFileSync(JSONL, 'utf8').split('\n').filter(Boolean)) {
    try {
      const item = JSON.parse(line);
      done.add(item.detailId);
    } catch {
      /* 半行 */
    }
  }
}

/**
 * 限定品必然没有日元建议零售价（万代对它们只公布人民币零售价），
 * 所以「没有日元价」就是限定品的可靠筛子。
 */
const todo = models
  .filter((x) => !done.has(x.detailId))
  .filter((x) => (onlyLimited ? !x.priceJpy : true))
  .slice(0, limit);

console.log(
  `待回填 ${todo.length} 条（模型共 ${models.length}，已抓 ${done.size}）` +
    (onlyLimited ? '，只处理无日元定价的限定品' : '，全量'),
);

/* ---------------------------------------------------------------- 解析 */

const SPEC =
  /<dt class="pg-products__label">[\s\S]{0,200}?<span class="pg-products__labelInner[^"]*">([^<]*)<\/span>[\s\S]{0,200}?<\/dt>\s*<dd class="pg-products__labelTxt">([\s\S]*?)<\/dd>/g;

function specTable(html) {
  const out = new Map();
  let m;
  SPEC.lastIndex = 0;
  while ((m = SPEC.exec(html))) {
    const k = m[1].trim();
    const v = m[2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (k && !out.has(k)) out.set(k, v);
  }
  return out;
}

function parseDetail(html) {
  const spec = specTable(html);

  /* 渠道徽章 */
  const badge = /<div class="pg-products__tag"[^>]*>([^<]+)<\/div>/.exec(html);
  const channelText = badge ? badge[1].trim() : '';

  /* 精确发售日期 */
  let released = '';
  for (const label of ['发售日期', '预定发售月份', '预定发售日', '発売時期']) {
    const raw = spec.get(label);
    if (!raw) continue;
    const m = /(\d{4})\s*年\s*(\d{1,2})\s*月(?:\s*(\d{1,2})\s*日)?/.exec(raw);
    if (m) {
      released = `${m[1]}-${String(m[2]).padStart(2, '0')}${m[3] ? '-' + m[3] : ''}`;
      break;
    }
  }

  /* 人民币零售价：键名以「零售价」结尾 */
  let priceCny = 0;
  let priceLabel = '';
  for (const [k, v] of spec) {
    if (!/零售价/.test(k)) continue;
    const m = /([\d,]+)\s*元/.exec(v);
    if (m) {
      priceCny = Number(m[1].replace(/,/g, ''));
      priceLabel = k;
      break;
    }
  }

  /* 日元建议零售价 */
  let priceJpy = 0;
  for (const [k, v] of spec) {
    if (!/日本地区建议零售价/.test(k)) continue;
    const m = /([\d,]+)\s*日元/.exec(v);
    if (m) {
      priceJpy = Number(m[1].replace(/,/g, ''));
      break;
    }
  }

  /* 详情页的轮播图：第一张是主图，后面是补充图 */
  const images = [...new Set([...html.matchAll(/<img[^>]+src="(https:\/\/staticcdn\.bandaihobbysite\.cn\/www\/uploads\/[^"]+)"/g)].map((m) => m[1]))];

  /* 作品线：详情页的「相关商品」区里有作品标签 */
  const seriesRaw = /<span class="p-card__flatTit">([^<]+)<\/span>/.exec(html)?.[1]?.trim() || '';

  /* 官方商品名（详情页 H1 比列表页更完整） */
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html);
  const title = h1 ? h1[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : '';

  /* 拼装难度 / 全高 / 零件数 */
  const skill = /([1-5])/.exec(spec.get('拼装难度') || spec.get('Skill Level') || '')?.[1];
  const height = /([\d.]+)\s*(?:mm|毫米)/i.exec(spec.get('全高') || spec.get('尺寸') || '')?.[1];
  const parts = /([\d,]+)\s*个/.exec(spec.get('零件数') || spec.get('附件数量') || '')?.[1];

  return {
    channelText,
    released,
    priceCny,
    priceLabel,
    priceJpy,
    images: images.slice(0, 6),
    seriesRaw,
    title,
    skillLevel: skill ? Number(skill) : null,
    heightMm: height ? Number(height) : null,
    parts: parts ? Number(parts.replace(/,/g, '')) : null,
  };
}

/* ---------------------------------------------------------------- 抓取 */

function cacheName(id) {
  return `detail_${id}.html`;
}

async function fetchDetail(id) {
  const file = join(CACHE, cacheName(id));
  if (existsSync(file) && readFileSync(file, 'utf8').length > 15000) {
    return readFileSync(file, 'utf8');
  }
  const url = `${ORIGIN}/index/index/detail/id/${id}`;
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
      if (res.status === 405 || html.length < 15000) {
        process.stdout.write(`\r  405 退避 ${Math.round(backoff / 1000)}s → id ${id}   `);
        await new Promise((r) => setTimeout(r, backoff));
        backoff = Math.min(backoff * 2, MAX_BACKOFF);
        continue;
      }
      writeFileSync(file, html, 'utf8');
      return html;
    } catch (err) {
      process.stdout.write(`\r  错误 ${String(err.message).slice(0, 40)}，重试 id ${id}   `);
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, MAX_BACKOFF);
    }
  }
}

let n = 0;
for (const item of todo) {
  const html = await fetchDetail(item.detailId);
  const parsed = parseDetail(html);
  appendFileSync(JSONL, JSON.stringify({ detailId: item.detailId, ...parsed }) + '\n', 'utf8');
  n++;
  if (n % 20 === 0 || n === todo.length) {
    process.stdout.write(`\r  回填 ${n}/${todo.length}          `);
  }
  await new Promise((r) => setTimeout(r, DELAY));
}
process.stdout.write('\n');

/* ------------------------------------------------------------ 写回目录 */

/* 详情页可能多给了几张图，一并记下 */
const details = new Map();
if (existsSync(JSONL)) {
  for (const line of readFileSync(JSONL, 'utf8').split('\n').filter(Boolean)) {
    try {
      const d = JSON.parse(line);
      details.set(d.detailId, d);
    } catch {
      /* 半行 */
    }
  }
}

const CHANNEL_OF_BADGE = [
  [/线上售卖|网络限定|网上限定/, 'wt'],
  [/高达基地限定|GUNDAM\s*BASE/, 'gb'],
  [/Premium\s*Bandai|PB\s*限定/i, 'pb'],
];

for (const item of catalog) {
  const d = details.get(item.detailId);
  if (!d) continue;

  if (d.channelText) {
    for (const [re, ch] of CHANNEL_OF_BADGE) {
      if (re.test(d.channelText)) {
        item.channel = ch;
        break;
      }
    }
    item.channelText = d.channelText;
  }
  if (d.released) item.released = d.released;
  if (d.priceCny) item.priceCny = d.priceCny;
  if (d.priceJpy && !item.priceJpy) item.priceJpy = d.priceJpy;
  if (d.priceLabel) item.priceLabel = d.priceLabel;
  if (d.seriesRaw && !item.seriesRaw) item.seriesRaw = d.seriesRaw;
  if (d.skillLevel) item.skillLevel = d.skillLevel;
  if (d.heightMm) item.heightMm = d.heightMm;
  if (d.parts) item.parts = d.parts;
  if (d.images?.length) item.images = d.images;
}

writeFileSync(
  join(ROOT, OUT_FILE),
  JSON.stringify(catalog, null, 2).replace(/\n/g, '\r\n') + '\r\n',
  'utf8',
);

const withBadge = catalog.filter((x) => x.channelText).length;
const withCny = catalog.filter((x) => x.priceCny).length;
const byCh = catalog.reduce((m, x) => ((m[x.channel || '-'] = (m[x.channel || '-'] || 0) + 1), m), {});
console.log(`回填 ${n} 条，写回 ${OUT_FILE}`);
console.log(`  有渠道徽章: ${withBadge}  有人民币价: ${withCny}`);
console.log('  渠道分布:', JSON.stringify(byCh));
