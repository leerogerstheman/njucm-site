#!/usr/bin/env node
/**
 * 生成高达集结（GUNDAM ASSEMBLE）事实文件：src/data/gundam.kits.assemble.json
 *
 * GUNDAM ASSEMBLE 是万代 2026 年 10 月起发售的桌面战棋产品线：约 50mm 的
 * 拼装级兵人，配战术卡与六角格地图在桌面上对战。它不是 1/144 或 1/100 的
 * 比例模型，所以单独给一个等级 GA 和一条作品线。
 *
 * 数据来源：
 *   - 万代日本官网 GUNDAM ASSEMBLE 官方站的商品一览（品名、厂商希望零售价、
 *     发售月、套装分类、专用商品图）
 *   - 官方单元卡清单（起始套装里的六台机体及其机体编号）
 *
 * 用法：node scripts/build-gundam-assemble-facts.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PRODUCTS = 'src/data/gundam.assemble.products.json';
const OUT_FILE = 'src/data/gundam.kits.assemble.json';

/** 套装类型 → 中文名 */
const TYPE_CN = {
  STARTER: '起始套装',
  DELUXE: '豪华套装',
  EXPANSION: '扩张包',
  SCENARIO: '场景包',
  PAINT: '涂装包',
};

/** 官方日文分类 → 中文类型名 */
const CATEGORY_CN = {
  スターターセット: '起始套装',
  デラックスセット: '豪华套装',
  エキスパンションパック: '扩张包',
  OTHERS: '其他',
};

/**
 * 官方单元卡清单（https://bandai-hobby.net/site/gundam-assemble/unitlist/）。
 *
 * 起始套装收录的六台机体，附官方机体编号——编号能反查机体出自哪部作品，
 * 也方便和库里的其它条目对上。
 */
const UNITS = {
  ST01: [
    { code: 'ST01-U01', num: 'RX-78-2', nameJa: 'ガンダム', nameCn: 'RX-78-2 高达', series: 'uc' },
    {
      code: 'ST01-U02',
      num: 'XXXG-00W0',
      nameJa: 'ウイングガンダムゼロ(EW)',
      nameCn: '飞翼高达零式(EW)',
      series: 'w',
    },
    {
      code: 'ST01-U03',
      num: 'ASW-G-08',
      nameJa: 'ガンダム・バルバトスルプスレクス',
      nameCn: '巴巴托斯·猛犬',
      series: 'iron-blooded',
    },
    { code: 'ST01-U04', num: 'MS-06S', nameJa: 'シャア専用ザクⅡ', nameCn: '沙扎比', series: 'uc' },
    {
      code: 'ST01-U05',
      num: 'OZ-13MS',
      nameJa: 'ガンダムエピオン(EW)',
      nameCn: '艾比昂高达(EW)',
      series: 'gundam-00',
    },
    {
      code: 'ST01-U06',
      num: 'ASW-G-XX',
      nameJa: 'ガンダム・ヴィダール',
      nameCn: '维达尔',
      series: 'gundam-nt',
    },
  ],
};

if (!existsSync(join(ROOT, PRODUCTS))) {
  console.error(`缺少 ${PRODUCTS}，先跑 node scripts/harvest-gundam-assemble.mjs`);
  process.exit(1);
}

const products = JSON.parse(readFileSync(join(ROOT, PRODUCTS), 'utf8'));

/*
 * 商品图。
 *
 * 官方站的图在 /site/gundam-assemble/images/ 下，这台机器连不上（TLS 被重置），
 * 所以实际用的是万代主站商品页的官方商品图（CloudFront，已下到本地压缩成 WebP）。
 * 官方站的地址仍保留在 imageUrl 里备查。
 */
const JP_CACHE = '.cache/gundam-jp/products.jsonl';
const localByCode = new Map();
if (existsSync(join(ROOT, JP_CACHE))) {
  for (const line of readFileSync(join(ROOT, JP_CACHE), 'utf8').split('\n').filter(Boolean)) {
    try {
      const item = JSON.parse(line);
      if (item.brand !== 'gundam-assemble' || !item.id) continue;
      const abs = join(ROOT, 'public', 'gundam', `jp-${item.id}.webp`);
      if (existsSync(abs)) {
        localByCode.set(item.id, {
          local: `/gundam/jp-${item.id}.webp`,
          remote: item.image || null,
        });
      }
    } catch {
      /* 半行 */
    }
  }
}
console.log(`本地集结商品图 ${localByCode.size} 张`);

const kits = [];

for (const p of products) {
  const m = /GUNDAM ASSEMBLE\s+(STARTER SET|DELUXE SET|EXPANSION PACK|SCENARIO PACK|PAINT PACK)\s*(\d{2})\s*\[([A-Z]{2}\d{2})\]/.exec(
    p.title,
  );
  if (!m) continue;

  const typeKey = m[1]
    .toUpperCase()
    .replace('STARTER SET', 'STARTER')
    .replace('DELUXE SET', 'DELUXE')
    .replace('EXPANSION PACK', 'EXPANSION')
    .replace('SCENARIO PACK', 'SCENARIO')
    .replace('PAINT PACK', 'PAINT');
  const type = TYPE_CN[typeKey] || m[1];
  const code = m[3];

  const units = UNITS[code] || [];
  const tags = [type];
  for (const u of units) tags.push(u.nameCn);

  /* 商品页编号（01_7332 之类），用来找本地缓存的官方图 */
  const itemId = /\/item\/([0-9_]+)\//.exec(p.url || '')?.[1] || '';
  const local = localByCode.get(itemId);

  const note =
    (units.length
      ? `收录机体：${units.map((u) => `${u.nameCn}（${u.num}）`).join('、')}。`
      : '') +
    '万代 2026 年 10 月起发售的桌面战棋产品线：兵人约 50 高，插销式拼装、需自行涂装，' +
    '配战术卡与六角格地图在桌面上对战。不是 1/144 或 1/100 的比例模型。';

  kits.push({
    id: `ga-${code.toLowerCase()}`,
    name: `高达集结 ${type} ${m[2]}`,
    nameJa: p.title,
    grade: 'GA',
    maker: 'BANDAI SPIRITS',
    series: 'gundam-assemble',
    scale: '约 50mm',
    released: p.released,
    priceJpy: p.priceJpy,
    channel: 'general',
    skillLevel: null,
    parts: null,
    heightMm: null,
    material: null,
    tags: tags.slice(0, 6),
    note,
    verified: true,
    source: 'https://bandai-hobby.net/site/gundam-assemble/products/',
    sourceJp: p.url,
    image: local?.local || null,
    imageUrl: local?.remote || p.image || null,
    taxRate: 10,
    units: units.map((u) => ({
      code: u.code,
      designation: u.num,
      name: u.nameCn,
      nameJa: u.nameJa,
      series: u.series,
    })),
  });
}

kits.sort((a, b) => a.id.localeCompare(b.id));

writeFileSync(
  join(ROOT, OUT_FILE),
  JSON.stringify(kits, null, 2).replace(/\n/g, '\r\n') + '\r\n',
  'utf8',
);

console.log(`整理出 ${kits.length} 条高达集结产品 → ${OUT_FILE}`);
for (const k of kits) {
  console.log(`  ${k.id} | ${k.name} | ¥${k.priceJpy} | ${k.released} | ${k.nameJa}`);
}
