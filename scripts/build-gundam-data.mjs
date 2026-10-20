#!/usr/bin/env node
/**
 * 合并高达模型原始记录，生成页面读取的类型化模块。
 *
 *   事实层  src/data/gundam.kits.*.json   人工核实过的原始记录
 *   转换层  scripts/build-gundam-data.mjs  本脚本
 *   渲染层  src/data/gundam.kits.ts       生成物，页面只读它
 *
 * 脚本做五件事：
 *   1. 校验  —— 等级、系列、渠道必须落在约定的取值范围内，越界的记录会被
 *               报告出来（系列越界时降级到「其他」，等级越界时整条丢弃，
 *               因为等级错了等于把这条记录放错了货架）
 *   2. 归一  —— 字符串去空白、数字容错、空值统一成 null
 *   3. 去重  —— 同 id 的记录合并；同来源页的记录也合并（不同文件用不同 id
 *               收录了同一款产品时，靠来源 URL 认出来）
 *   4. 排序  —— 按发售时间倒序，同一天按名称排，保证构建结果稳定
 *   5. 挂图  —— 合并 scripts/fetch-gundam-images.mjs 下载的本地图片路径
 *
 * 用法：node scripts/build-gundam-data.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = [
  'src/data/gundam.kits.classic.json',
  'src/data/gundam.kits.recent.json',
  'src/data/gundam.kits.catalog.json',
  'src/data/gundam.kits.seed.json',
];
const OUT_FILE = 'src/data/gundam.kits.ts';
/** 本地图片清单，由 scripts/fetch-gundam-images.mjs 生成 */
const IMAGES_FILE = 'src/data/gundam.images.json';

const GRADES = new Set(['PG', 'MG', 'MGSD', 'RG', 'HG', 'FG', 'SD', 'EG', 'FM', 'MR']);
const CHANNELS = new Set(['general', 'pb', 'gb', 'wt']);
const SERIES = new Set([
  'uc', '0080', '0083', '0093', '0094', 'hathaway', 'gundam-x', 'gquuuuuux',
  'seed', 'seed-destiny', 'seed-freedom', 'w', '08ms', 'zz', 'zeta', 'f91',
  'gundam-build', 'iron-blooded', 'wing-gundam', 'gundam-duelists', 'stargazer',
  'crossbone-g', 'gundam-00', 'gundam-age', 'gundam-nt', 'gundam-mv', 'gundam-front',
  'gundam-moon', 'gundam-xarx-zero', 'gundam-build-divers', 'ring-of-nergal',
  'pilot-season', 'v-gundam', 'g-gundam', 'wfm', 'sd-gundam', 'missing-link', 'other',
]);

/** 等级缺比例时用它兜底 */
const DEFAULT_SCALE = {
  PG: '1/100', MG: '1/100', MGSD: 'SD 比例', RG: '1/144', HG: '1/144',
  FG: '1/144', SD: '非等比', EG: '1/144', FM: '1/100', MR: '约 1/100',
};

const problems = [];
const note = (msg) => problems.push(msg);

/** 读本地图片清单（按 id 索引的对象）；没有就当作一张图都没有 */
function readImages() {
  try {
    const parsed = JSON.parse(readFileSync(join(ROOT, IMAGES_FILE), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** 读一个 JSON 数组文件；没有或坏了就当作空 */
function readJsonArray(rel) {
  try {
    const parsed = JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function optionalText(value) {
  const t = text(value);
  return t.length ? t : null;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function readSource(rel) {
  const abs = join(ROOT, rel);
  let raw;
  try {
    raw = readFileSync(abs, 'utf8');
  } catch {
    note(`${rel} 不存在，跳过`);
    return [];
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    note(`${rel} JSON 解析失败：${err.message}`);
    return [];
  }
  if (!Array.isArray(parsed)) {
    note(`${rel} 顶层不是数组`);
    return [];
  }
  return parsed.map((entry) => ({ entry, file: rel }));
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function releaseKey(released) {
  const m = /^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/.exec(released);
  if (!m) return 0;
  return Number(m[1]) * 10000 + Number(m[2] ?? 1) * 100 + Number(m[3] ?? 1);
}

function normalise(entry, file) {
  const id = slugify(entry.id ?? '');
  if (!id) {
    note(`${file}: 有一条记录缺少 id，已丢弃`);
    return null;
  }

  const grade = text(entry.grade).toUpperCase();
  if (!GRADES.has(grade)) {
    note(`${file} / ${id}: 等级「${entry.grade}」不在约定范围内，已丢弃`);
    return null;
  }

  let series = text(entry.series).toLowerCase();
  if (!SERIES.has(series)) {
    note(`${file} / ${id}: 系列「${entry.series}」不在约定范围内，归入「其他」`);
    series = 'other';
  }

  let channel = text(entry.channel).toLowerCase();
  if (!CHANNELS.has(channel)) {
    note(`${file} / ${id}: 渠道「${entry.channel}」不在约定范围内，归入「一般销售」`);
    channel = 'general';
  }

  let released = text(entry.released);
  if (!/^\d{4}/.test(released)) {
    note(`${file} / ${id}: 发售日期「${released}」无法解析，已清空`);
    released = '';
  }

  const price = numberOrNull(entry.priceJpy);
  if (price !== null && price < 0) {
    note(`${file} / ${id}: 价格为负，已清空`);
  }

  const skill = numberOrNull(entry.skillLevel);
  const parts = numberOrNull(entry.parts);
  const height = numberOrNull(entry.heightMm);

  const name = text(entry.name) || text(entry.nameJa) || id;
  const tags = Array.isArray(entry.tags)
    ? entry.tags.map((t) => text(t)).filter(Boolean).slice(0, 6)
    : [];

  const source = optionalText(entry.source);
  /* 原始记录里的 image 是官方 CDN 上的图片地址；本地路径由图片清单挂上 */
  const imageUrl = optionalText(entry.image) || optionalText(entry.imageUrl);

  return {
    id,
    name,
    nameJa: text(entry.nameJa),
    grade,
    maker: text(entry.maker) || 'BANDAI SPIRITS',
    series,
    scale: text(entry.scale) || DEFAULT_SCALE[grade],
    released,
    priceJpy: price !== null && price >= 0 ? price : 0,
    channel,
    skillLevel: skill !== null && skill >= 1 && skill <= 5 ? skill : null,
    parts,
    heightMm: height,
    material: optionalText(entry.material),
    tags,
    note: text(entry.note),
    verified: entry.verified === true && source !== null,
    source,
    image: null,
    imageUrl,
    taxRate: Number.isFinite(entry.taxRate) ? entry.taxRate : null,
    sourceJp: optionalText(entry.sourceJp),
  };
}

/** 两条记录同 id 时，哪一条更完整 */
function richer(a, b) {
  const score = (r) =>
    (r.priceJpy ? 4 : 0) + (r.verified ? 2 : 0) + (r.note ? 1 : 0) + (r.parts ? 1 : 0);
  return score(b) > score(a) ? b : a;
}

/** 同 id 合并：逐字段取更完整的一份 */
function merge(a, b) {
  const keep = richer(a, b);
  const other = keep === a ? b : a;
  return {
    id: keep.id,
    name: keep.name || other.name,
    nameJa: keep.nameJa || other.nameJa,
    grade: keep.grade,
    maker: keep.maker || other.maker,
    series: keep.series !== 'other' ? keep.series : other.series,
    scale: keep.scale || other.scale,
    released: keep.released || other.released,
    priceJpy: keep.priceJpy || other.priceJpy,
    channel: keep.channel !== 'general' ? keep.channel : other.channel,
    skillLevel: keep.skillLevel ?? other.skillLevel,
    parts: keep.parts ?? other.parts,
    heightMm: keep.heightMm ?? other.heightMm,
    material: keep.material ?? other.material,
    tags: keep.tags.length ? keep.tags : other.tags,
    note: keep.note || other.note,
    verified: keep.verified || other.verified,
    source: keep.source ?? other.source,
    image: keep.image ?? other.image,
    imageUrl: keep.imageUrl ?? other.imageUrl,
    taxRate: keep.taxRate ?? other.taxRate,
    sourceJp: keep.sourceJp ?? other.sourceJp,
  };
}

/**
 * 同一个来源页就是同一款产品。
 *
 * 不同来源文件会用不同的 id 收录同一款产品（人工整理的经典线用语义化 id，
 * 全量目录抓取用商品 id），靠 id 合并会漏掉，所以再按来源 URL 认一次。
 *
 * 但只有商品详情页算产品级来源：系列列表页、新闻稿这类 URL 会被同一页上的
 * 多款产品共用，拿它当身份会把不同的产品错并成一条。
 */
function sourceKey(source) {
  if (!source) return null;
  const m = /\/detail\/id\/(\d+)/.exec(source);
  return m ? `detail:${m[1]}` : null;
}

const byId = new Map();
const bySource = new Map();
let read = 0;
let dropped = 0;

for (const file of SOURCES) {
  for (const { entry } of readSource(file)) {
    read++;
    const kit = normalise(entry, file);
    if (!kit) {
      dropped++;
      continue;
    }

    /* 先按 id 合并 */
    let current = byId.has(kit.id) ? merge(byId.get(kit.id), kit) : kit;
    byId.set(current.id, current);

    /* 再按来源页认一次：同款产品被不同文件用不同 id 收录时，这里把它们捏到一起。
       合并后保留先出现的那条 id，id 才不会随文件读取顺序漂移。 */
    const key = sourceKey(current.source);
    if (key) {
      if (bySource.has(key)) {
        const twin = bySource.get(key);
        const merged = { ...merge(twin, current), id: twin.id };
        byId.delete(current.id);
        byId.set(twin.id, merged);
        bySource.set(key, merged);
      } else {
        bySource.set(key, current);
      }
    }
  }
}

const kits = [...byId.values()].sort(
  (a, b) => releaseKey(b.released) - releaseKey(a.released) || a.name.localeCompare(b.name, 'zh-Hans-CN'),
);

/* 挂上本地缓存的图片路径（由 scripts/fetch-gundam-images.mjs 生成） */
const images = readImages();
let withImage = 0;
for (const kit of kits) {
  const hit = images[kit.id];
  if (hit && hit.path) {
    kit.image = hit.path;
    withImage++;
  }
}

/*
 * 万代日本官网的叠加层。
 *
 * 中文站给中文品名与商品页 URL，日本站给官方日文品名、含税定价与税目。
 * 两者对同一条记录时，以日本站为准——它才是这些字段的源头。
 */
const jpOverlay = readJsonArray('src/data/gundam.kits.jp-enriched.json');
let withJp = 0;
if (jpOverlay.length) {
  const byId = new Map(jpOverlay.map((e) => [e.id, e]));
  for (const kit of kits) {
    const jp = byId.get(kit.id);
    if (!jp) continue;
    if (jp.nameJa) kit.nameJa = jp.nameJa;
    if (jp.priceJpy) kit.priceJpy = jp.priceJpy;
    if (jp.taxRate) kit.taxRate = jp.taxRate;
    if (jp.released) kit.released = jp.released;
    if (jp.image && !kit.image) kit.image = jp.image;
    if (jp.imageUrl) kit.imageUrl = jp.imageUrl;
    if (jp.sourceJp) kit.sourceJp = jp.sourceJp;
    withJp++;
  }
}

const banner = `/* 本文件由 scripts/build-gundam-data.mjs 生成，请勿手工编辑。
 * 原始记录见 ${SOURCES.join(' 与 ')}，改动请改原始记录后重新运行脚本。 */
import type { GundamKit } from './gundam';

export const GUNDAM_KITS: GundamKit[] = ${JSON.stringify(kits, null, 2)};
`;

writeFileSync(join(ROOT, OUT_FILE), banner, 'utf8');

const withPrice = kits.filter((k) => k.priceJpy > 0).length;
const verified = kits.filter((k) => k.verified).length;

console.log(`读到 ${read} 条记录，丢弃 ${dropped} 条重复或不合规的记录`);
console.log(
  `合并后 ${kits.length} 条，其中 ${verified} 条已核实出处，${withPrice} 条有官方定价，${withImage} 条有本地图片`,
);
if (withJp) console.log(`其中 ${withJp} 条已用万代日本官网的数据校准（日文名、含税定价与税目）`);
if (problems.length) {
  console.log('\n需要人工确认的问题：');
  for (const p of problems) console.log(`  - ${p}`);
}
console.log(`\n已写入 ${OUT_FILE}`);
