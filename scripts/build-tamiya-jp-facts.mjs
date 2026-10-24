#!/usr/bin/env node
/**
 * 田宫日本官网事实层构建
 * ---------------------------------------------------------------------------
 * 输入：.cache/tamiya-jp/catalog.json（scripts/harvest-tamiya-jp.mjs 抓的日文目录）
 *       src/data/models.kits.tamiya.json（商城那批）
 * 输出：
 *   src/data/models.kits.tamiya-jp.json          日本官网独有的产品（新增条目）
 *   src/data/models.kits.tamiya-jp-enriched.json 商城条目的日文补充（叠加层）
 *
 * 分成两个文件，是因为两者的身份不同：
 *   - 商城那批已经有中文名与出处了，日文官网只是补上**官方日文品名**与
 *     **厂商希望小売价（日元）**——它俩是同一款产品的两份资料，用叠加层接上；
 *   - 日本官网有、商城没有的产品，是**新产品**，按新条目建档。
 *
 * 品类沿用商城那套（比例 + 类型），作品线也用中文分组，两边的条目归到同一条线上。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = join(ROOT, '.cache', 'tamiya-jp', 'catalog.json');
const STORE = join(ROOT, 'src', 'data', 'models.kits.tamiya.json');
const OUT_NEW = join(ROOT, 'src', 'data', 'models.kits.tamiya-jp.json');
const OUT_OVERLAY = join(ROOT, 'src', 'data', 'models.kits.tamiya-jp-enriched.json');

if (!existsSync(CATALOG)) {
  console.error('找不到日文目录，先跑 node scripts/harvest-tamiya-jp.mjs');
  process.exit(1);
}

const catalog = JSON.parse(readFileSync(CATALOG, 'utf8'));
const store = JSON.parse(readFileSync(STORE, 'utf8'));
const storeByNo = new Map();
for (const r of store) {
  /* id 是 `tamiya-<货号>`，货号相同的有多条时后面会跟一段后缀 */
  const m = /^tamiya-(\d+)/.exec(r.id);
  if (m) storeByNo.set(m[1], r);
}

/* ------------------------------------------------------------ 分类映射 */

/** 比例：品名里第一处「1/xx」 */
function scaleOf(name) {
  const m = /\b(\d{1,2})\/(\d{1,3})\b/.exec(name);
  return m ? `${m[1]}/${m[2]}` : '';
}

/**
 * 品类：按日文官网的分类 + 比例落到商城那套品类 id。
 *
 * 限定商品（スケール限定商品）跨了好几个类型，只能按比例归——
 * 比例是官网写明的事实，类型在那一条里并不总是能一眼看出来。
 */
function categoryOf(genre, scale, name) {
  const s = scale;
  switch (genre) {
    case '1010':
      return s === '1/12' ? 'tamiya:car12' : s === '1/18' ? 'tamiya:car18' : s === '1/20' ? 'tamiya:race20' : 'tamiya:car24';
    case '1020':
      return s === '1/6' ? 'tamiya:bike6' : 'tamiya:bike12';
    case '1030':
      return s === '1/16' ? 'tamiya:mm16' : s === '1/48' ? 'tamiya:mm48' : 'tamiya:mm35';
    case '1040':
      return s === '1/32' ? 'tamiya:air32' : s === '1/48' ? 'tamiya:air48' : 'tamiya:air72';
    case '1050':
      return s === '1/350' ? 'tamiya:ship350' : 'tamiya:ship700';
    case '1060':
      return 'tamiya:dino';
    case '2010':
    case '2020':
      return 'tamiya:rc';
    case '3010':
      return 'tamiya:mini4wd';
    case '4010':
    case '4040':
      return 'tamiya:stem';
    case '1076': {
      /* 限定商品：按比例归，比例之外的落到汽车模型（限定车模最常见） */
      if (s === '1/12') return 'tamiya:car12';
      if (s === '1/18') return 'tamiya:car18';
      if (s === '1/20') return 'tamiya:race20';
      if (s === '1/24') return 'tamiya:car24';
      if (s === '1/16') return 'tamiya:mm16';
      if (s === '1/35') return 'tamiya:mm35';
      if (s === '1/48') return 'tamiya:mm48';
      if (s === '1/32') return 'tamiya:air32';
      if (s === '1/72') return 'tamiya:air72';
      if (s === '1/350') return 'tamiya:ship350';
      if (s === '1/700') return 'tamiya:ship700';
      if (/戦車|戦艦|空母|潜水|自走砲|戦鬪機|戦闘機|偵察|爆撃|水上機||Schwere|Panzer|Tiger|Panther|T-34/i.test(name)) return 'tamiya:mm35';
      if (/F-\d|A-6| Spaceship|爆撃機|水上爆撃|ゼロ戦|Ju\s?87|MiG|Su-\d|F-4|F-15|F-16/i.test(name)) return 'tamiya:air72';
      if (/艦|carrier|destroyer|巡洋|戦艦|空母/i.test(name)) return 'tamiya:ship700';
      return 'tamiya:car24';
    }
    default:
      return null;
  }
}

/** 作品线：与商城那套中文分组同名，两边的条目归到同一条线上 */
const SERIES_BY_GENRE = {
  '1010': '汽车模型',
  '1020': '摩托车模型',
  '1030': '陆军模型',
  '1040': '飞机模型',
  '1050': '舰船模型',
  '1060': '恐龙模型',
  '1076': '限定模型',
  '2010': '遥控车',
  '2020': '遥控车',
  '3010': '迷你四驱车',
  '4010': 'STEM 教育模型',
  '4040': 'STEM 教育模型',
};

/* ------------------------------------------------------------ 逐条处理 */

const overlay = [];
const fresh = [];

for (const [no, jp] of Object.entries(catalog)) {
  const id = `tamiya-${no}`;
  const scale = scaleOf(jp.name);
  const storeRecord = storeByNo.get(no);

  /* 商城有这款：用叠加层补官方日文名与日元定价 */
  if (storeRecord) {
    overlay.push({
      id,
      nameJa: jp.name,
      priceJpy: jp.price || 0,
      sourceJp: jp.url,
      /* 商城那张图若缺了，用日文官网的图顶上 */
      imageUrl: storeRecord.imageUrl || null,
    });
    continue;
  }

  /* 日本官网独有：建新条目 */
  const category = categoryOf(jp.genre, scale, jp.name);
  if (!category) continue;
  const series = SERIES_BY_GENRE[jp.genre] || '其他';
  fresh.push({
    id,
    /* 官网只有日文名，照录（与寿屋那批一个口径） */
    name: jp.name,
    nameJa: '',
    grade: category,
    maker: 'TAMIYA',
    series,
    scale,
    released: '',
    listedAt: '',
    priceJpy: jp.price || 0,
    priceCny: 0,
    priceHkd: 0,
    channel: 'general',
    skillLevel: null,
    parts: null,
    heightMm: null,
    material: null,
    tags: [],
    note: '',
    subject: null,
    subjectKind: null,
    aliases: [no],
    verified: true,
    source: jp.url,
    image: null,
    imageUrl: imageUrlOf(jp.thumb),
    sourceJp: jp.url,
  });
}

/* 商城条目的图若缺，用日文官网的原图地址补上 */
const jpImageByNo = new Map(Object.entries(catalog).map(([no, jp]) => [no, jp]));
for (const o of overlay) {
  if (o.imageUrl) continue;
  const m = /^tamiya-(\d+)/.exec(o.id);
  const jp = m ? jpImageByNo.get(m[1]) : null;
  if (jp?.thumb) o.imageUrl = imageUrlOf(jp.thumb);
}

/**
 * 日文官网的商品图。
 *
 * 列表页给的是缩略图（400px，`_s.jpg`），商品页的原图是 1000px（`_1.jpg`），
 * 这里取原图，下载脚本失败时再退回缩略图。
 */
function imageUrlOf(thumb) {
  const t = String(thumb || '').trim();
  if (!t) return null;
  const url = t.startsWith('//') ? `https:${t}` : t;
  return url.replace(/_s\.jpg/, '_1.jpg');
}

overlay.sort((a, b) => a.id.localeCompare(b.id));
fresh.sort((a, b) => a.id.localeCompare(b.id));

writeFileSync(OUT_NEW, JSON.stringify(fresh, null, 2) + '\n', 'utf8');
writeFileSync(OUT_OVERLAY, JSON.stringify(overlay, null, 2) + '\n', 'utf8');

const withPrice = fresh.filter((r) => r.priceJpy).length;
console.log(`日文目录 ${Object.keys(catalog).length} 条`);
console.log(`  叠加层 ${overlay.length} 条（商城已有的，补日文名与日元价）→ ${OUT_OVERLAY.split('/').pop()}`);
console.log(`  新增 ${fresh.length} 条（日本官网独有）→ ${OUT_NEW.split('/').pop()}`);
console.log(`  新增里有定价 ${withPrice} 条`);
const byCat = new Map();
for (const r of fresh) byCat.set(r.grade, (byCat.get(r.grade) || 0) + 1);
console.log('  品类分布：');
for (const [k, v] of [...byCat].sort((a, b) => b[1] - a[1])) console.log(`    ${String(v).padStart(5)}  ${k}`);
