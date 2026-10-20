#!/usr/bin/env node
/**
 * 万代商品目录抓取器（自限速 + 自动退避）
 *
 * 源站对高频访问会直接返回 405。与其硬冲，不如把节奏降下来：
 *   - 一次只发一个请求，中间固定间隔；
 *   - 遇到 405 指数退避（最长 5 分钟）再重试，页面照常落盘，不丢进度；
 *   - 已经抓过的页面跳过，随时可以中断续跑。
 *
 * 每个页面原样存到 cache/，商品条目边解析边追加进 products.jsonl。
 * 最后一步把 jsonl 整理成 src/data/gundam.kits.catalog.json。
 *
 * 用法：
 *   node scripts/harvest-gundam-catalog.mjs            # 抓取（可随时 Ctrl-C）
 *   node scripts/harvest-gundam-catalog.mjs --build    # 只整理已抓到的数据
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.cache', 'gundam-catalog');
const JSONL = join(CACHE, 'products.jsonl');
const ORIGIN = 'https://www.bandaihobbysite.cn';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** 固定间隔：源站对密集访问会直接挡掉，慢一点反而快 */
const DELAY = 900;
const MAX_BACKOFF = 300_000;

mkdirSync(CACHE, { recursive: true });

/* ---------------------------------------------------------------- 品牌分类 */

const BRANDS = {
  HG: 6,
  RG: 8,
  MG: 9,
  'MG Ver.Ka': 10,
  MGSD: 71,
  PG: 14,
  'ENTRY GRADE': 15,
  'FULL MECHANICS': 12,
  MGEX: 11,
  'RE/100': 13,
  'Hi-Resolution Model': 16,
  SDCS: 17,
  SDEX: 68,
  'CROSS CONTRAST COLORS': 102,
  '高达模型 配件套组': 123,
  高达汇战: 148,
};

/** 这些是明显不是模型的类别，跳过 */
const SKIP_BRANDS = new Set(['高达水贴', '可动底座', 'BUILDERS PARTS', 'PETIT\'GGUY']);

/* ---------------------------------------------------------------- 作品系列 */

/**
 * 站点上的作品分类（cate → 中文名）存在 src/data/gundam.series.json，
 * 是从万代 /gunpla 落地页一次性抓下来的，之后不必再访问源站。
 */
const SERIES_RAW = existsSync(join(ROOT, 'src/data/gundam.series.json'))
  ? JSON.parse(readFileSync(join(ROOT, 'src/data/gundam.series.json'), 'utf8'))
  : {};

/** 站点作品名 → 站内的作品线 id */
const SERIES_MAP = {
  '机动战士高达 闪光的哈萨维': 'hathaway',
  '机动战士高达 铁血的奥尔芬斯': 'iron-blooded',
  '机动战士高达独角兽（UC）': 'uc',
  '机动战士高达SEED': 'seed',
  '机动战士高达SEED DESTINY': 'seed-destiny',
  '新机动战记高达W': 'w',
  '机动战士高达': 'uc',
  '机动战士高达 逆袭的夏亚': 'uc',
  '高达创形者 再起': 'gundam-build',
  '高达创形者': 'gundam-build',
  '高达创战者': 'gundam-build',
  '高达创战元宇宙': 'gundam-build',
  '机动战士高达 THE ORIGIN': 'uc',
  '机动战士高达Z高达': 'zeta',
  '机动战士Z高达': 'zeta',
  '机动战士高达 水星的魔女': 'wfm',
  '机动战士高达SEED FREEDOM': 'seed-freedom',
  '机动战士高达SEED FREEDOM ZERO': 'seed-freedom',
  '机动战士高达F91': 'f91',
  '机动战士高达0080 口袋中的战争': '0080',
  '机动战士高达ZZ': 'zz',
  '机动战士高达NT': 'gundam-nt',
  '机动战士高达AGE': 'gundam-age',
  '机动战士高达MOON高达': 'gundam-moon',
  '机动战士高达 雷霆宙域': 'pilot-season',
  '机动战士高达 库库鲁斯·多安的小岛': 'gundam-mv',
  '机动战士高达 高达前哨战': 'gundam-front',
  '机动战士高达外传 MISSING LINK': 'missing-link',
  '高达Reconguista in G': 'ring-of-nergal',
  '机动战士高达00': 'gundam-00',
  '机动战士高达 海盗高达': 'uc',
  '机动战士高达RG XARX-ZERO': 'gundam-xarx-zero',
  '机动武斗传G高达': 'g-gundam',
  '机动战士V高达': 'v-gundam',
  '高达模型君': 'other',
  '机动战士Gundam GQuuuuuuX': 'gquuuuuux',
  '机动新世纪高达X': 'gundam-x',
  '高达 异轨征途': 'other',
  '高达破坏者 对战记录': 'gundam-build-divers',
  'SD高达世界 群英集': 'sd-gundam',
  'SD三国创杰传': 'sd-gundam',
};

function seriesIdOf(seriesRaw) {
  return SERIES_MAP[seriesRaw] || 'other';
}

const CARD = /<a href="\/index\/index\/detail\/id\/(\d+)" class="c-card p-card[^"]*">([\s\S]*?)<\/a>/g;

function parseCards(html) {
  const items = [];
  let m;
  CARD.lastIndex = 0;
  while ((m = CARD.exec(html))) {
    const block = m[2];
    const img = /<div class="p-card__img">\s*<img src="([^"]+)"/.exec(block);
    const title = /<div class="p-card__tit">([\s\S]*?)<\/div>/.exec(block);
    if (!img || !title) continue;
    const price = /([\d,]+)\s*日元/.exec(block);
    /* 列表页的日期有两种写法：「2024年5月发售」与「2024年5月3日发售」 */
    const dateFull = /(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(block);
    const dateMonth = /(\d{4})年(\d{1,2})月/.exec(block);
    const released = dateFull
      ? `${dateFull[1]}-${String(dateFull[2]).padStart(2, '0')}-${dateFull[3]}`
      : dateMonth
        ? `${dateMonth[1]}-${String(dateMonth[2]).padStart(2, '0')}`
        : '';
    items.push({
      detailId: m[1],
      image: img[1],
      name: title[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
      price: price ? Number(price[1].replace(/,/g, '')) : 0,
      released,
    });
  }
  return items;
}

function cacheName(url) {
  return url.replace(/^https?:\/\//, '').replace(/[?&=]/g, '_').replace(/\//g, '_') + '.html';
}

async function fetchPage(url) {
  const file = join(CACHE, cacheName(url));
  if (existsSync(file) && readFileSync(file, 'utf8').length > 20000) {
    return { html: readFileSync(file, 'utf8'), cached: true };
  }

  let backoff = 5_000;
  for (;;) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          Referer: `${ORIGIN}/`,
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'same-origin',
          'Upgrade-Insecure-Requests': '1',
        },
      });
      const html = await res.text();
      if (res.status === 405 || html.length < 20000) {
        /* 被限流：退避后重试 */
        process.stdout.write(`\r  405 退避 ${Math.round(backoff / 1000)}s → ${url.slice(-40)}   `);
        await new Promise((r) => setTimeout(r, backoff));
        backoff = Math.min(backoff * 2, MAX_BACKOFF);
        continue;
      }
      writeFileSync(file, html, 'utf8');
      return { html, cached: false };
    } catch (err) {
      process.stdout.write(`\r  错误 ${String(err.message).slice(0, 40)}，重试   `);
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, MAX_BACKOFF);
    }
  }
}

/* ------------------------------------------------------------- 目标 URL 清单 */

function buildTargets() {
  const groups = [];
  for (const [label, cate] of Object.entries(BRANDS)) {
    if (SKIP_BRANDS.has(label)) continue;
    groups.push({
      label,
      cate,
      kind: 'brand',
      seriesRaw: '',
      pages: Array.from({ length: 60 }, (_, i) => i + 1),
    });
  }
  /* 作品线页面：同一个商品在这里能拿到它属于哪条作品线 */
  for (const [cate, name] of Object.entries(SERIES_RAW)) {
    groups.push({
      label: name,
      cate,
      kind: 'series',
      seriesRaw: name,
      pages: Array.from({ length: 40 }, (_, i) => i + 1),
    });
  }
  return groups;
}

/* --------------------------------------------------------------------- 跑 */

const buildOnly = process.argv.includes('--build');

if (!buildOnly) {
  const groups = buildTargets();
  const seen = new Map();
  let fetched = 0;
  let total = 0;

  for (const group of groups) {
    const base =
      group.kind === 'series'
        ? `${ORIGIN}/index/index/series/cate/${group.cate}`
        : `${ORIGIN}/index/index/brand/cate/${group.cate}`;
    let emptyRun = 0;

    for (const page of group.pages) {
      const url = `${base}?page=${page}`;
      const { html, cached } = await fetchPage(url);
      const items = parseCards(html);
      total += items.length;

      for (const item of items) {
        const key = item.detailId;
        const existing = seen.get(key);
        /* 作品线页面带来的信息更具体，优先保留 */
        if (!existing || (!existing.seriesRaw && group.seriesRaw)) {
          const merged = { ...item, brand: group.label, seriesRaw: group.seriesRaw };
          seen.set(key, merged);
          appendFileSync(JSONL, JSON.stringify(merged) + '\n', 'utf8');
        }
      }

      if (!cached) fetched++;
      process.stdout.write(
        `\r  ${group.label} p${page} | 新页 ${fetched} | 商品 ${seen.size}          `,
      );
      await new Promise((r) => setTimeout(r, DELAY));

      /* 连续两页没有商品，这一组就到头了，不必再往后翻 */
      emptyRun = items.length === 0 ? emptyRun + 1 : 0;
      if (emptyRun >= 2) break;
    }
  }
  process.stdout.write('\n');
  console.log(`抓取完成：新增页面 ${fetched}，商品 ${total}`);
}

/* ------------------------------------------------------- 整理成目录 JSON */

const lines = existsSync(JSONL)
  ? readFileSync(JSONL, 'utf8')
      .split('\n')
      .filter(Boolean)
  : [];

const byId = new Map();
for (const line of lines) {
  try {
    const item = JSON.parse(line);
    const existing = byId.get(item.detailId);
    /* 作品线信息更具体的那份优先 */
    if (!existing || (!existing.seriesRaw && item.seriesRaw)) {
      byId.set(item.detailId, item);
    }
  } catch {
    /* 跳过半行 */
  }
}

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

function gradeOf(name) {
  for (const [re, grade] of GRADE_RULES) {
    if (re.test(name)) return grade;
  }
  return null;
}

function scaleOf(grade, name) {
  const m = /(1\/\d+)/.exec(name);
  if (m) return m[1];
  if (grade === 'SD') return 'SD 比例';
  if (grade === 'MR') return '无比例';
  return grade === 'MG' || grade === 'PG' || grade === 'FM' ? '1/100' : '1/144';
}

/**
 * 销售渠道只能从品名认。
 *
 * 列表页的商品卡对限定品只给人民币零售价，不给日本建议零售价——所以限定品
 * 的 priceJpy 天然是 0，这不是数据缺失，而是万代确实没公布日元定价。
 */
function channelOf(name) {
  if (/高达基地限定|GUNDAM\s*BASE/i.test(name)) return 'gb';
  if (/Premium\s*Bandai|PB限定| premiums?/i.test(name)) return 'pb';
  if (/网络限定|淘宝|京东|天猫|线上限定/i.test(name)) return 'wt';
  return 'general';
}

/**
 * 不是模型本体的东西：特效组件、水贴、零件套组、底座、工具……
 *
 * 万代把它们和模型放在同一个目录里卖，名字也带等级（"HG 1/144 …专用水贴"），
 * 所以光看等级筛不掉。数据库是"模型"的库，这些要单独剔出去。
 */
const NOT_A_MODEL =
  /扩张特效组件|扩展组件|零件套组|专用零件|改造零件|外形提升零件|形状提升零件|特效件|水贴|贴纸|说明书|胶水|涂装工具|工具套装|可动底座|底座|支架|一番赏|透明保护/;

const catalog = [];
for (const item of byId.values()) {
  const grade = gradeOf(item.name);
  if (!grade) continue;
  const name = item.name.replace(/\s+/g, ' ').trim();
  if (NOT_A_MODEL.test(name)) continue;
  const scale = scaleOf(grade, name);
  catalog.push({
    id: `bc-${item.detailId}`,
    name: /^(HG|HGUC|RG|MG|PG|SD|EG|FG|FM|MGSD|MR|METAL|ENTRY|FULL|HIGH|RE)/i.test(name)
      ? name
      : `${grade} ${scale} ${name}`,
    nameJa: '',
    grade,
    maker: 'BANDAI SPIRITS',
    series: seriesIdOf(item.seriesRaw || ''),
    seriesRaw: item.seriesRaw || '',
    scale,
    released: item.released,
    priceJpy: item.price,
    channel: channelOf(name),
    skillLevel: null,
    parts: null,
    heightMm: null,
    material: null,
    tags: [],
    note: '',
    verified: true,
    source: `${ORIGIN}/index/index/detail/id/${item.detailId}`,
    image: item.image,
  });
}

const outFile = join(ROOT, 'src/data/gundam.kits.catalog.json');
writeFileSync(outFile, JSON.stringify(catalog, null, 2).replace(/\n/g, '\r\n') + '\r\n', 'utf8');

const grades = catalog.reduce((m, x) => ((m[x.grade] = (m[x.grade] || 0) + 1), m), {});
console.log(`整理出 ${catalog.length} 条商品，等级分布 ${JSON.stringify(grades)}`);
console.log(`写入 ${outFile}`);
