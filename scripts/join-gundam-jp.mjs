#!/usr/bin/env node
/**
 * 把万代日本站的商品对到中文站的条目上。
 *
 * 两个站是各自独立的库，没有共同的产品编号，所以只能靠「等级 + 比例 +
 * 定价 + 发售月」这个组合键来认人。四个字段同时相等几乎不会认错：定价是
 * 厂商建议零售价（精确到日元），发售月精确到月，比例与等级又限定了产品线。
 *
 * 对上之后，以日本站为准的有三样：
 *   - nameJa      官方日文品名（中文站没有）
 *   - priceJpy    厂商建议零售价（中文站抄的就是这个，但要核对）
 *   - taxRate     税目：10% 税込，还是 2019 年 10 月前那批 8% 减税
 * 外加日本站自己的商品图。
 *
 * 用法：node scripts/join-gundam-jp.mjs
 */

import { readFileSync, writeFileSync, readdirSync, renameSync, mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const JP_ORIGIN = 'https://bandai-hobby.net';
const CN_ORIGIN = 'https://www.bandaihobbysite.cn';

async function fetchText(url) {
  /* 日站会重置连接（ECONNRESET），重试几次再放弃。 */
  let backoff = 2_000;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          Accept: 'text/html',
          Referer: url.includes('bandaihobbysite') ? `${CN_ORIGIN}/` : `${JP_ORIGIN}/`,
        },
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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JP_FILE = 'src/data/gundam.kits.jp.json';
const OUT_FILE = 'src/data/gundam.kits.jp-enriched.json';

const CN_SOURCES = [
  'src/data/gundam.kits.classic.json',
  'src/data/gundam.kits.recent.json',
  'src/data/gundam.kits.catalog.json',
  'src/data/gundam.kits.seed.json',
];

function readJson(rel) {
  const abs = join(ROOT, rel);
  return exists(rel) ? JSON.parse(readFileSync(abs, 'utf8')) : [];
}
function exists(rel) {
  try {
    statSync(join(ROOT, rel));
    return true;
  } catch {
    return false;
  }
}

/** 从品名里取等级与比例 */
function gradeScale(name) {
  const g = /^(HGUC|HG|RG|MG Ver\.?Ka|MGSD|MGEX|MG|RE\/100|PG|ENTRY GRADE|EG|FULL MECHANICS|FM|SDCS|SDEX|SD)\b/.exec(
    name,
  );
  if (!g) return { grade: '', scale: '' };
  const raw = g[1];
  const grade =
    raw === 'HGUC' || raw === 'HG' ? 'HG'
    : raw === 'ENTRY GRADE' ? 'EG'
    : raw === 'FULL MECHANICS' ? 'FM'
    : raw === 'SDCS' || raw === 'SDEX' || raw === 'SD' ? 'SD'
    : raw === 'RE/100' || raw === 'MGEX' ? 'MG'
    : raw === 'MG Ver.Ka' ? 'MG'
    : raw;
  const s = /1\/(\d+)/.exec(name);
  return { grade, scale: s ? `1/${s[1]}` : '' };
}

const jp = readJson(JP_FILE);
if (!jp.length) {
  console.error(`${JP_FILE} 为空，先跑 node scripts/harvest-gundam-jp.mjs`);
  process.exit(1);
}

/*
 * 中文站条目：以商品页 URL 为身份。
 *
 * 同一条产品可能在几个来源文件里各有一个 id，而合并脚本的规矩是
 * 「同一来源页，保留先出现的那条 id」。这里必须跟它一致，
 * 否则叠加层按 id 覆盖时会打在合并结果里不存在的 id 上。
 */
const cnBySource = new Map();
for (const rel of CN_SOURCES) {
  for (const kit of readJson(rel)) {
    const m = /detail\/id\/(\d+)/.exec(kit.source || '');
    if (m && !cnBySource.has(m[1])) cnBySource.set(m[1], { ...kit, _src: rel });
  }
}

/* 联合键 */
function keyOf(grade, scale, price, released) {
  const month = (released || '').slice(0, 7);
  return `${grade}|${scale}|${price}|${month}`;
}

/* 日本站 → 联合键 */
const jpIndex = new Map();
for (const item of jp) {
  const gs = gradeScale(item.nameJa);
  const k = keyOf(gs.grade || item.grade, gs.scale, item.priceJpy, item.released);
  if (!jpIndex.has(k)) jpIndex.set(k, []);
  jpIndex.get(k).push(item);
}

/* 中文站条目也用同样的键（它的比例字段是权威的） */
const cnIndex = new Map();
for (const entry of cnBySource.values()) {
  const k = keyOf(entry.grade, entry.scale, entry.priceJpy, entry.released);
  if (!cnIndex.has(k)) cnIndex.set(k, []);
  cnIndex.get(k).push(entry);
}

/**
 * 型号标识：RX-78-2、MS-06S、ZGMF-X10A 这类。
 *
 * 组合键撞车时（同一个等级、比例、价格、发售月有多款产品），靠它来分辨：
 * 中文名和日文名虽然不同语言，但都带着同一个机体编号。
 */
function designations(name) {
  const set = new Set();
  for (const m of (name || '').toUpperCase().matchAll(/[A-Z]{1,5}-?\d{1,4}(?:-[A-Z]?\d{1,3})?[A-Z]?/g)) {
    const token = m[0].replace(/-/g, '');
    if (token.length >= 3) set.add(token);
  }
  return set;
}

/** 在候选里按型号标识再筛一遍 */
function disambiguate(cnItems, jpItems) {
  const cn = designations(cnItems[0].name);
  const jp = designations(jpItems[0].nameJa);
  if (!cn.size || !jp.size) return null;
  const shared = [...cn].filter((t) => jp.has(t));
  if (!shared.length) return null;
  const pick = (list, nameKey) =>
    list.filter((it) => {
      const d = designations(it[nameKey]);
      return shared.some((t) => d.has(t));
    });
  const cnMatch = pick(cnItems, 'name');
  const jpMatch = pick(jpItems, 'nameJa');
  if (cnMatch.length === 1 && jpMatch.length === 1) return [cnMatch[0], jpMatch[0]];
  return null;
}

/**
 * 组合键撞车时的二次消歧：拉双方详情页，比精确到日的发售日期。
 *
 * 列表页只给到月，所以「同等级、同比例、同价、同月」可能对应好几款产品。
 * 详情页给的是精确日期，把候选各查一遍就能分清。
 */
async function exactDate(url) {
  const html = await fetchText(url);
  const m =
    /(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(html) ||
    /(\d{4})年(\d{1,2})月/.exec(html);
  if (!m) return '';
  return `${m[1]}-${String(m[2]).padStart(2, '0')}${m[3] ? '-' + m[3] : ''}`;
}

const dateCache = new Map();
async function cachedDate(url) {
  if (dateCache.has(url)) return dateCache.get(url);
  const d = await exactDate(url);
  dateCache.set(url, d);
  return d;
}

async function resolveByDate(cnItems, jpItems) {
  const cnDates = await Promise.all(cnItems.map((c) => cachedDate(c.source)));
  const jpDates = await Promise.all(jpItems.map((j) => cachedDate(j.url)));
  const pairs = [];
  for (let i = 0; i < cnItems.length; i++) {
    for (let k = 0; k < jpItems.length; k++) {
      const a = cnDates[i];
      const b = jpDates[k];
      if (!a || !b) continue;
      /* 精确到日相同；一方只有月时，至少月份要相同 */
      const same = a === b || (a.length === 7 && b.length === 7 && a.slice(0, 7) === b.slice(0, 7) && a.length === b.length);
      if (same) pairs.push([cnItems[i], jpItems[k]]);
    }
  }
  return pairs.length === 1 ? pairs[0] : null;
}

const enriched = [];
let matched = 0;
let ambiguous = 0;
let byDesignation = 0;
let byDate = 0;
const priceMismatch = [];

for (const [k, jpItems] of jpIndex) {
  const cnItems = cnIndex.get(k);
  if (!cnItems) continue;

  let cn = cnItems[0];
  let j = jpItems[0];

  if (cnItems.length > 1 || jpItems.length > 1) {
    const pair = disambiguate(cnItems, jpItems);
    if (pair) {
      [cn, j] = pair;
      byDesignation++;
    } else {
      const dated = await resolveByDate(cnItems, jpItems);
      if (!dated) {
        ambiguous++;
        continue;
      }
      [cn, j] = dated;
      byDate++;
    }
  }
  matched++;

  if (cn.priceJpy && j.priceJpy && cn.priceJpy !== j.priceJpy) {
    priceMismatch.push({ cn: cn.name, jp: j.nameJa, cnPrice: cn.priceJpy, jpPrice: j.priceJpy });
  }

  enriched.push({
    id: cn.id,
    nameJa: j.nameJa,
    priceJpy: j.priceJpy,
    taxRate: j.taxRate,
    released: j.released || cn.released,
    image: j.image || null,
    imageUrl: j.imageUrl || null,
    sourceJp: j.url,
  });
}

/*
 * 第二轮：用机体编号做锚点。
 *
 * 四元组（等级 + 比例 + 定价 + 发售月）对不上的时候，编号往往还在——
 * 「RX-79[G] 陆战型高达」的中文品名与日文品名写法完全不同，编号却一样。
 *
 * 两条硬约束：候选必须唯一；两边都知道定价时必须相等。宁可少配几条，
 * 也不能把日文名安到错的商品上——日文名与定价是要写进数据里的。
 */
const jpByDesig = new Map();
for (const item of jp) {
  if (item.isPb) continue;
  const gs = gradeScale(item.nameJa);
  for (const d of designations(item.nameJa)) {
    for (const scale of gs.scale ? [gs.scale] : ['']) {
      const key = `${gs.grade || item.grade}|${scale}|${d}`;
      if (!jpByDesig.has(key)) jpByDesig.set(key, []);
      jpByDesig.get(key).push(item);
    }
  }
}

const matchedIds = new Set(enriched.map((e) => e.id));
let byDesigAnchor = 0;
for (const cn of cnBySource.values()) {
  if (matchedIds.has(cn.id)) continue;
  if (cn.nameJa) continue;

  const cnDesigs = designations(cn.name);
  if (!cnDesigs.size) continue;

  const cands = new Map();
  for (const d of cnDesigs) {
    for (const scale of cn.scale ? [cn.scale] : ['']) {
      for (const j of jpByDesig.get(`${cn.grade}|${scale}|${d}`) || []) cands.set(j.url, j);
    }
  }
  if (cands.size !== 1) continue;

  const j = [...cands.values()][0];
  /* 定价是硬校验：两边都有却不一致，说明不是同一款 */
  if (cn.priceJpy && j.priceJpy && cn.priceJpy !== j.priceJpy) continue;
  /* 发售月也要对得上 */
  const cnMonth = (cn.released || '').slice(0, 7);
  const jpMonth = (j.released || '').slice(0, 7);
  if (cnMonth.length === 7 && jpMonth.length === 7 && cnMonth !== jpMonth) continue;

  enriched.push({
    id: cn.id,
    nameJa: j.nameJa,
    priceJpy: j.priceJpy,
    taxRate: j.taxRate,
    released: j.released || cn.released,
    image: j.image || null,
    imageUrl: j.imageUrl || null,
    sourceJp: j.url,
  });
  matchedIds.add(cn.id);
  byDesigAnchor++;
}

/*
 * 写出一个叠加层，而不是改写中文站的事实文件。
 *
 * 两个来源各有权威之处：中文站给中文品名与商品页 URL，日本站给官方日文
 * 品名、含税定价与税目。叠加层在合并之后按 id 覆盖，事实文件保持原样，
 * 谁先跑、跑几遍都不影响结果。
 */
writeFileSync(
  join(ROOT, OUT_FILE),
  JSON.stringify(
    enriched.map(({ _src, ...rest }) => rest),
    null,
    2,
  ).replace(/\n/g, '\r\n') + '\r\n',
  'utf8',
);

console.log(`\n日本站条目 ${jp.length} 条，中文站条目 ${cnBySource.size} 条`);
console.log(
  `对上的 ${matched} 条（型号标识消歧 ${byDesignation} 条，精确发售日消歧 ${byDate} 条），跳过歧义 ${ambiguous} 条`,
);
console.log(`其中 ${byDesigAnchor} 条是靠机体编号单独对上的`);
if (priceMismatch.length) {
  console.log(`\n定价对不上的 ${priceMismatch.length} 条：`);
  for (const m of priceMismatch.slice(0, 20)) {
    console.log(`  ${m.cn} ¥${m.cnPrice}  ↔  ${m.jp} ¥${m.jpPrice}`);
  }
}
console.log(`\n写出 ${OUT_FILE}`);

/* 日本站的图片是签名地址，当场下载才拿得到，所以采集时把整批都下了。
   但对不上的那些最终用不到，留在 public/ 里只是白占仓库——
   把它们挪进 .cache（已 gitignore），要用时再取。

   注意：要用到的图片不止日站叠加层里的那些。高达集结的套装图也放在
   public/gundam/ 下（名字同样是 jp- 开头，是从日站商品页下来的），
   却记在 assemble 事实文件里——只看叠加层会把它们误当成没用的挪走，
   站点上就缺图了。所以这里要把所有事实文件里引用到的图片都算进去。 */
const used = new Set(
  enriched.map((e) => (e.image || '').split('/').pop()).filter(Boolean),
);
for (const rel of [...CN_SOURCES, 'src/data/gundam.kits.assemble.json', 'src/data/gundam.kits.pb.json']) {
  for (const kit of readJson(rel)) {
    const name = (kit.image || '').split('/').pop();
    if (name && name.startsWith('jp-')) used.add(name);
  }
}
const publicDir = join(ROOT, 'public', 'gundam');
const cacheDir = join(ROOT, '.cache', 'gundam-jp', 'unused');
if (exists('public/gundam')) {
  mkdirSync(cacheDir, { recursive: true });
  let moved = 0;
  for (const name of readdirSync(publicDir)) {
    if (!name.startsWith('jp-') || used.has(name)) continue;
    renameSync(join(publicDir, name), join(cacheDir, name));
    moved++;
  }
  if (moved) console.log(`把 ${moved} 张用不到的日本站图片挪进 .cache/gundam-jp/unused`);
}
