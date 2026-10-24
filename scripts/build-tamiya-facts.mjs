#!/usr/bin/env node
/**
 * 田宫（TAMIYA）事实层构建
 * ---------------------------------------------------------------------------
 * 输入：.cache/tamiya-cn/catalog.json（scripts/harvest-tamiya-cn.mjs 抓的商城目录）
 * 输出：src/data/models.kits.tamiya.json
 *
 * 商城把商品分成四大块：模型本体、遥控车配件、颜料工具、周边。
 * 这里只收**模型本体**——自己动手拼的那些：
 *
 *   军事模型   陆军（1/16、1/35、1/48）、飞机（1/32、1/48、1/72）、舰船（1/350、1/700）
 *   比例模型   汽车（1/12、1/18、1/20、1/24）、摩托车（1/6、1/12）、恐龙
 *   迷你四驱车 1/32 四驱车本体
 *   遥控车     RC 套件本体（不含 RTR 预组与完成品）
 *   STEM 教育模型 编程机械人、机械动物等
 *
 * 排除：颜料、工具、旧化材料、贴纸与说明书、配件与补给、马达电池电子件、
 *      车壳与轮毂、赛道、遥控车配件、RTR 预组遥控车与完成品、服饰周边。
 *
 * 字段口径：
 *   - 名称   商城的品名原文（中文或英文），不翻译、不改写
 *   - 品类   商城自己那一级的分类（比例 + 类型）
 *   - 作品线 商城自己的分组（题材或产品线）
 *   - 比例   分类里写明的比例；遥控车与 STEM 从品名里取
 *   - 定价   商城挂的港币标价（原样，不折算人民币）
 *   - 上架   商城把商品挂上去的日期（不是发售日，两者不混）
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IN_FILE = join(ROOT, '.cache', 'tamiya-cn', 'catalog.json');
const OUT_FILE = join(ROOT, 'src', 'data', 'models.kits.tamiya.json');

if (!existsSync(IN_FILE)) {
  console.error(`找不到 ${IN_FILE}，先跑 node scripts/harvest-tamiya-cn.mjs`);
  process.exit(1);
}

const catalog = JSON.parse(readFileSync(IN_FILE, 'utf8'));

/* ------------------------------------------------------------ 分类树 */

const byId = new Map(catalog.categories.map((c) => [c.id, c]));

/** 分类 id → 完整路径，如「军事模型 > 陆军模型 > 1/35 军事微缩模型系列」 */
function catPath(c) {
  const out = [];
  let cur = c;
  const seen = new Set();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.unshift(cur.name);
    cur = byId.get(cur.parent);
  }
  return out.join(' > ');
}
const pathOf = new Map(catalog.categories.map((c) => [c.id, catPath(c)]));

/*
 * 收录规则。
 *
 * path   —— 精确匹配商城那一级的分类
 * prefix —— 匹配这一级及其子级（迷你四驱车的子分类是产品线，同属本体）
 * cat    —— 库里的品类 id
 * depth  —— 作品线取路径里的第几级（2 是题材，3 是车型或产品线）
 * scale  —— 比例（分类里没写就留空，从品名里取）
 */
const RULES = [
  /* 军事模型 */
  { path: '军事模型 > 陆军模型 > 1/35 军事微缩模型系列', cat: 'tamiya:mm35', depth: 2, scale: '1/35' },
  { path: '军事模型 > 陆军模型 > 1/48 军事微缩模型系列', cat: 'tamiya:mm48', depth: 2, scale: '1/48' },
  { path: '军事模型 > 陆军模型 > 1/16 军事战车模型系列', cat: 'tamiya:mm16', depth: 2, scale: '1/16' },
  { path: '军事模型 > 陆军模型 > 1/16 全球军人系列', cat: 'tamiya:soldier16', depth: 2, scale: '1/16' },
  { path: '军事模型 > 飞机模型 > 1/32 飞机模型', cat: 'tamiya:air32', depth: 2, scale: '1/32' },
  { path: '军事模型 > 飞机模型 > 1/48 飞机模型', cat: 'tamiya:air48', depth: 2, scale: '1/48' },
  { path: '军事模型 > 飞机模型 > 1/72 飞机模型', cat: 'tamiya:air72', depth: 2, scale: '1/72' },
  { path: '军事模型 > 舰船模型 > 1/350 舰船模型', cat: 'tamiya:ship350', depth: 2, scale: '1/350' },
  { path: '军事模型 > 舰船模型 > 1/700 吃水线系列 舰船模型', cat: 'tamiya:ship700', depth: 2, scale: '1/700' },

  /* 比例模型 */
  { path: '比例模型 > 汽车模型 > 1/24 跑车模型系列', cat: 'tamiya:car24', depth: 2, scale: '1/24' },
  { path: '比例模型 > 汽车模型 > 1/12 汽车模型系列', cat: 'tamiya:car12', depth: 2, scale: '1/12' },
  { path: '比例模型 > 汽车模型 > 1/18 汽车模型系列', cat: 'tamiya:car18', depth: 2, scale: '1/18' },
  { path: '比例模型 > 汽车模型 > 1/20 格兰披治赛车模型', cat: 'tamiya:race20', depth: 2, scale: '1/20' },
  { path: '比例模型 > 摩托车模型 > 1/12 摩托车模型系列', cat: 'tamiya:bike12', depth: 2, scale: '1/12' },
  { path: '比例模型 > 摩托车模型 > 1/6 摩托车模型系列', cat: 'tamiya:bike6', depth: 2, scale: '1/6' },
  { path: '比例模型 > 恐龙模型系列', cat: 'tamiya:dino', depth: 2, scale: '' },

  /* 迷你四驱车：子分类是产品线，本体同属一类 */
  { prefix: '迷你四驱车 > 1/32 迷你四驱车', cat: 'tamiya:mini4wd', depth: 3, scale: '1/32' },

  /* 遥控车：排除 RTR 预组（成品）与拖挂车完成品 */
  { prefix: '遥控车 > 平路车 > ', cat: 'tamiya:rc', depth: 3, scale: '' },
  { prefix: '遥控车 > 越野车 > ', cat: 'tamiya:rc', depth: 3, scale: '' },
  { path: '遥控车 > 坦克及拖头卡车 > 遥控坦克系列', cat: 'tamiya:rc', depth: 3, scale: '' },
  { path: '遥控车 > 坦克及拖头卡车 > 1/14拖挂车系列', cat: 'tamiya:rc', depth: 3, scale: '' },

  /* STEM 教育模型：机械组装配件是零件，不收 */
  { path: 'STEM 教育模型 > 机械彷生动物', cat: 'tamiya:stem', depth: 3, scale: '' },
  { path: 'STEM 教育模型 > 编程机械人', cat: 'tamiya:stem', depth: 3, scale: '' },
  { path: 'STEM 教育模型 > 水上机械人', cat: 'tamiya:stem', depth: 3, scale: '' },
  { path: 'STEM 教育模型 > 机械创意车/工程车', cat: 'tamiya:stem', depth: 3, scale: '' },
  { path: 'STEM 教育模型 > 遥控对战机械人', cat: 'tamiya:stem', depth: 3, scale: '' },
  { path: 'STEM 教育模型 > 再生能源系列', cat: 'tamiya:stem', depth: 3, scale: '' },
];

/* 作品线：遥控车与迷你四驱车的分组在第三级（车型 / 产品线），先按规则取 */
function ruleFor(paths) {
  for (const rule of RULES) {
    for (const p of paths) {
      if (rule.path && p === rule.path) return { rule, path: p };
      if (rule.prefix && p.startsWith(rule.prefix)) return { rule, path: p };
    }
  }
  return null;
}

/* ------------------------------------------------------------ 文本处理 */

const ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': "'",
  '&nbsp;': ' ', '&#8221;': '"', '&#8220;': '"', '&#8211;': '–', '&#8212;': '—',
};

function decodeEntities(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&[a-z]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m);
}

/** 去掉标签、实体与多余空白 */
function clean(html) {
  return decodeEntities(
    String(html || '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/ /g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** 商城的中文标题：short_description 里的 <h2> */
function chineseTitle(p) {
  const short = String(p.short_description || '');
  const h2 = /<h2[^>]*>([\s\S]*?)<\/h2>/i.exec(short);
  if (h2) {
    const t = clean(h2[1]);
    if (t) return t;
  }
  /* 没有 h2 时，整段短说明里若没有标签残留，就当它是标题 */
  const plain = clean(short);
  if (plain && !/[{}<>]/.test(plain) && plain.length <= 120) return plain;
  return '';
}

/** 品名里取比例：1/35、1/700 这种 */
function scaleFrom(text) {
  const m = /\b(\d{1,2}\/\d{1,3})\b/.exec(text || '');
  return m ? m[1] : '';
}

/** 货号：SKU 里是「TA 95707」，取数字那截 */
function itemNumber(p) {
  const sku = String(p.sku || '').trim();
  const m = /\b(\d{4,6})\b/.exec(sku);
  if (m) return m[1];
  const n = /\b(\d{4,6})\b/.exec(p.name || '');
  return n ? n[1] : '';
}

/**
 * 商城把品名放在两处：商品的 name 字段，与简介里的 h2 标题。
 *
 * 两条都可能是中文、也可能是英文——同一件商品里，中英文有时各占一处，
 * 换个字段就调换。所以这里不按字段分，而是按「哪一串是中文」来分：
 * 中文那串作主名，英文那串作别名。
 */
const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;

function pickNames(p) {
  const candidates = [chineseTitle(p), clean(p.name)].filter(Boolean);
  const chinese = candidates.find((c) => CJK.test(c)) || '';
  const english = candidates.find((c) => !CJK.test(c)) || '';
  return { chinese, english, name: chinese || english };
}

/* ------------------------------------------------------------ 逐条处理 */

const dates = catalog.dates || {};
const used = new Map();
const out = [];
const stats = { kept: 0, skipped: 0, noTitle: 0, noPrice: 0, finished: 0 };

for (const p of catalog.products) {
  const paths = (p.categories || []).map((c) => pathOf.get(c.id) || c.name).filter(Boolean);
  const hit = ruleFor(paths);
  if (!hit) {
    stats.skipped++;
    continue;
  }

  const rule = hit.rule;
  const { chinese, english, name } = pickNames(p);
  if (!name) {
    stats.skipped++;
    continue;
  }
  if (!chinese) stats.noTitle++;

  /*
   * 完成品不收。
   *
   * 田宫同一款模型常有「拼装套件」与「完成品（预涂装）」两个版本，
   * 完成品不是拼装模型——与遥控车那边的 RTR 预组、完成品系列同理。
   */
  if (/完成品|成品|预涂装|涂装完成/.test(name)) {
    stats.finished++;
    continue;
  }

  /* 货号与 id */
  const no = itemNumber(p);
  let id = no ? `tamiya-${no}` : `tamiya-wp${p.id}`;
  if (used.has(id) && used.get(id) !== p.slug) {
    /* 同一货号在商城里有多条（不同配色或配件），加后缀区分 */
    id = `${id}-${p.id}`;
  }
  used.set(id, p.slug);

  /* 比例：分类写明的优先，遥控车与 STEM 从品名里取 */
  const scale = rule.scale || scaleFrom(name) || scaleFrom(english);

  /* 作品线：商城自己那一级的分组（题材或车型、产品线） */
  const parts = hit.path.split(' > ');
  const series = parts[rule.depth - 1] || parts[parts.length - 1];

  /* 定价：商城挂的是港币，最小单位是分 */
  const minor = Number(p.prices?.currency_minor_unit ?? 2);
  const priceHkd = p.prices?.price ? Number(p.prices.price) / 10 ** minor : 0;
  if (!priceHkd) stats.noPrice++;

  /* 上架日期：WordPress 的发布日，不是发售日 */
  const listed = dates[p.slug]?.date ? String(dates[p.slug].date).slice(0, 10) : '';

  /* 别名：另一种写法的品名 + 货号 */
  const aliases = [];
  if (english && english !== name) aliases.push(english);
  if (no) aliases.push(no);

  /* 限定标记：商城标签里写了才算 */
  const tags = Array.isArray(p.tags) ? p.tags.map((t) => clean(t)).filter(Boolean) : [];
  const channel = tags.some((t) => /限定|limited/i.test(t)) ? 'limited' : 'general';

  out.push({
    id,
    name,
    nameJa: '',
    /* 商城自己的分类路径——库里的品类 id 由转换层按这张表映射 */
    grade: hit.path,
    maker: 'TAMIYA',
    series,
    scale,
    released: '',
    listedAt: listed,
    priceJpy: 0,
    priceCny: 0,
    priceHkd,
    channel,
    skillLevel: null,
    parts: null,
    heightMm: null,
    material: null,
    tags: tags.slice(0, 4),
    note: '',
    subject: null,
    subjectKind: null,
    aliases,
    verified: true,
    source: p.permalink,
    image: null,
    imageUrl: p.images?.[0]?.src || null,
  });
  stats.kept++;
}

/* 同一 id 留信息更全的一条 */
const merged = new Map();
for (const r of out) {
  const old = merged.get(r.id);
  if (!old) {
    merged.set(r.id, r);
    continue;
  }
  const score = (x) => (x.priceHkd ? 2 : 0) + (x.listedAt ? 1 : 0) + (x.aliases.length ? 1 : 0);
  if (score(r) > score(old)) merged.set(r.id, r);
}

const list = [...merged.values()].sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(OUT_FILE, JSON.stringify(list, null, 2) + '\n', 'utf8');

/* ------------------------------------------------------------------ 汇总 */

const byCat = new Map();
const bySeries = new Map();
for (const r of list) {
  byCat.set(r.grade, (byCat.get(r.grade) || 0) + 1);
  bySeries.set(r.series, (bySeries.get(r.series) || 0) + 1);
}
console.log(`写出 ${list.length} 条到 src/data/models.kits.tamiya.json`);
console.log(`  收录 ${stats.kept} 条，未收 ${stats.skipped} 条（工具、颜料、配件、成品与周边）`);
console.log(`  其中完成品 ${stats.finished} 条不收（预涂装成品，不是拼装模型）`);
console.log(`  有定价 ${list.filter((r) => r.priceHkd).length} 条 · 有上架日期 ${list.filter((r) => r.listedAt).length} 条`);
console.log(`  商城没给中文名的 ${stats.noTitle} 条（用官方英文名）`);
console.log('  品类分布：');
for (const [k, v] of [...byCat].sort((a, b) => b[1] - a[1])) console.log(`    ${String(v).padStart(5)}  ${k}`);
console.log(`  作品线 ${bySeries.size} 条：`);
for (const [k, v] of [...bySeries].sort((a, b) => b[1] - a[1])) console.log(`    ${String(v).padStart(5)}  ${k}`);
