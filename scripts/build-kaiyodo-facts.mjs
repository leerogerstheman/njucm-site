#!/usr/bin/env node
/**
 * 海洋堂（KAIYODO）事实层构建
 * ---------------------------------------------------------------------------
 * 输入：.cache/kaiyodo/catalog.json（scripts/harvest-kaiyodo.mjs 抓的官网目录）
 * 输出：src/data/models.kits.kaiyodo.json
 *
 * 海洋堂的商品页给的是库里最全的一套资料：官方日文品名、税込与税抜两种价、
 * 発売予定月、缩放、材质、商品番号、原型制作人、JAN 与官方图。
 *
 * 官网那几个分类里混着不是模型的东西——预涂装完成品、成型板零件、扭蛋与盒装周边、
 * 图钉一类的小物。这些按项目一贯的口径排除。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = join(ROOT, '.cache', 'kaiyodo', 'catalog.json');
const OUT_FILE = join(ROOT, 'src', 'data', 'models.kits.kaiyodo.json');

if (!existsSync(CATALOG)) {
  console.error('找不到采集结果，先跑 node scripts/harvest-kaiyodo.mjs');
  process.exit(1);
}

const catalog = JSON.parse(readFileSync(CATALOG, 'utf8'));

/**
 * 官网的产品线 → 库里的作品线。
 *
 * 官网的品名前缀就是它自己的产品线（ARTPLA SCULPTURE WORKS、ARTPLA、
 * デジタルガレージキット、アッセンブルボーグ…），照录。
 */
const LINE_PREFIX = [
  'ARTPLA SCULPTURE WORKS',
  'ARTPLA Marble Q',
  'ARTPLA',
  'デジタルガレージキット',
  'アッセンブルボーグNEXUS',
  'アッセンブルボーグ カスタムスタイル',
  'アッセンブルボーグ',
  'ASSEMBLE BORG',
  'マシーネンクリーガー',
  'ドーヤネン',
  '新サクラ大戦',
  'リコンビナント',
  'パックレーテ',
  'アーモロイド',
  'AB0',
  'ABR',
];

/** 作品线：品名前缀里认得出来的那一段 */
function seriesOf(name) {
  for (const p of LINE_PREFIX) {
    if (name.startsWith(p)) return p;
  }
  return 'other';
}

/**
 * 不是模型的东西。
 *
 * 官网那几个分类里混着预涂装完成品、成型板零件（マルチシート）、扭蛋与盒装周边、
 * 图钉磁铁一类的小物，还有别的厂牌做的模型（HOW2WORK、Ma.k.）。
 * 按项目一贯的口径，这些不收。
 */
const EXCLUDE =
  /完成品|塗装済み|マルチシート|カプセル|ガチャ|BOX版|全\d+種|ピン|マグネット|HOW2WORK|Ma\.k\.|WSC|ガレージセット|マッチ|ホチキス/;

const out = [];
let skipped = 0;

for (const p of catalog) {
  const name = p.name.trim();
  if (!name) {
    skipped++;
    continue;
  }
  if (EXCLUDE.test(name)) {
    skipped++;
    continue;
  }

  const code = String(p.code || '').toLowerCase();
  const id = code ? `kaiyodo-${code}` : `kaiyodo-${name.replace(/[^\w]+/g, '-').toLowerCase()}`;

  out.push({
    id,
    name,
    nameJa: '',
    grade: p.category,
    maker: 'KAIYODO',
    series: seriesOf(name),
    scale: p.scale || '',
    released: p.released || '',
    listedAt: '',
    priceJpy: p.priceJpy || 0,
    priceCny: 0,
    priceHkd: 0,
    channel: 'general',
    skillLevel: null,
    parts: null,
    heightMm: p.heightMm || null,
    material: p.material || null,
    /* JAN 与原型制作人放标签里——note 是「一句话看点」那栏，放编号不合适 */
    tags: [p.jan ? `JAN ${p.jan}` : '', p.sculptor ? `原型：${p.sculptor}` : ''].filter(Boolean),
    note: '',
    subject: null,
    subjectKind: null,
    aliases: code ? [code] : [],
    verified: true,
    source: p.url,
    image: null,
    imageUrl: p.imageUrl || null,
  });
}

out.sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + '\n', 'utf8');

const bySeries = new Map();
for (const r of out) bySeries.set(r.series, (bySeries.get(r.series) || 0) + 1);
console.log(`写出 ${out.length} 条到 src/data/models.kits.kaiyodo.json（排除 ${skipped} 条非模型）`);
console.log(`  有定价 ${out.filter((r) => r.priceJpy).length} · 有発売 ${out.filter((r) => r.released).length} · 有图 ${out.filter((r) => r.imageUrl).length}`);
console.log('  作品线：');
for (const [k, v] of [...bySeries].sort((a, b) => b[1] - a[1])) console.log(`    ${String(v).padStart(4)}  ${k}`);
