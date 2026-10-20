#!/usr/bin/env node
/**
 * 生成中文站事实文件：src/data/gundam.kits.cn.json
 *
 * 两份数据合起来才是一条完整记录：
 *
 *   gundam.kits.catalog.json  按品牌/作品线分类页抓的旧目录 —— 有作品线归属
 *   gundam.kits.itemall.json  按 /item_all 全量总表抓的新目录 —— 更全，
 *                             而且带详情页回填出来的渠道徽章、人民币零售价
 *                             与精确发售日
 *
 * item_all 是 catalog 的严格超集（多 123 条模型，没有一条只存在于旧目录），
 * 所以以 item_all 为主干，作品线信息从旧目录补进来。
 *
 * 用法：node scripts/build-gundam-cn-facts.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { seriesIdOf } from './lib/series-map.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = 'src/data/gundam.kits.catalog.json';
const ITEMALL = 'src/data/gundam.kits.itemall.json';
const OUT_FILE = 'src/data/gundam.kits.cn.json';

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
  /扩张特效组件|扩展组件|扩展配件套装|零件套组|专用零件|改造零件|外形提升零件|形状提升零件|特效件|水贴|贴纸|说明书|胶水|涂装工具|工具套装|可动底座|底座|支架|一番赏|透明保护|装饰品|挂件/;

function gradeOf(name) {
  for (const [re, grade] of GRADE_RULES) if (re.test(name)) return grade;
  return null;
}

function scaleOf(grade, name) {
  const m = /(1\/\d+)/.exec(name);
  if (m) return m[1];
  if (grade === 'SD') return 'SD 比例';
  if (grade === 'MR') return '无比例';
  return grade === 'MG' || grade === 'PG' || grade === 'FM' ? '1/100' : '1/144';
}

const catalog = JSON.parse(readFileSync(join(ROOT, CATALOG), 'utf8'));
const itemall = JSON.parse(readFileSync(join(ROOT, ITEMALL), 'utf8'));

/* 旧目录按商品 id 索引，用来补作品线归属 */
const oldById = new Map();
for (const x of catalog) {
  const detailId = x.id.replace(/^bc-/, '');
  oldById.set(detailId, x);
}

const CHANNEL_FROM_BADGE = [
  [/线上售卖|网络限定|网上限定/, 'wt'],
  [/高达基地限定|GUNDAM\s*BASE/, 'gb'],
  [/Premium\s*Bandai|PB\s*限定/i, 'pb'],
];

const out = [];
let skipped = 0;

for (const item of itemall) {
  const name = (item.name || '').replace(/\s+/g, ' ').trim();
  const grade = gradeOf(name);
  if (!grade) {
    skipped++;
    continue;
  }
  if (NOT_A_MODEL.test(name)) {
    skipped++;
    continue;
  }

  const old = oldById.get(item.detailId);
  const seriesRaw = old?.seriesRaw || item.seriesRaw || '';
  const scale = old?.scale || scaleOf(grade, name);

  /* 渠道：详情页徽章优先，其次旧目录的判断，最后按品名兜底 */
  let channel = item.channel;
  if (!channel) {
    for (const [re, ch] of CHANNEL_FROM_BADGE) {
      if (item.channelText && re.test(item.channelText)) {
        channel = ch;
        break;
      }
    }
  }
  if (!channel) {
    channel = /高达基地限定|GUNDAM\s*BASE/i.test(name)
      ? 'gb'
      : /网络限定|线上限定|淘宝|京东|天猫|线上/i.test(name)
        ? 'wt'
        : /Premium\s*Bandai|PB限定/i.test(name)
          ? 'pb'
          : 'general';
  }

  /* 品名统一成「等级 比例 名称」 */
  const fullName = /^(HG|HGUC|RG|MG|PG|SD|EG|FG|FM|MGSD|MR|METAL|ENTRY|FULL|HIGH|RE)/i.test(name)
    ? name
    : `${grade} ${scale} ${name}`;

  out.push({
    id: `bc-${item.detailId}`,
    name: fullName,
    nameJa: old?.nameJa || '',
    grade,
    maker: 'BANDAI SPIRITS',
    series: old?.series || seriesIdOf(seriesRaw),
    seriesRaw,
    scale,
    released: item.released || old?.released || '',
    priceJpy: item.priceJpy || old?.priceJpy || 0,
    priceCny: item.priceCny || 0,
    channel,
    skillLevel: item.skillLevel ?? old?.skillLevel ?? null,
    parts: item.parts ?? old?.parts ?? null,
    heightMm: item.heightMm ?? old?.heightMm ?? null,
    material: old?.material ?? null,
    tags: old?.tags ?? [],
    note: item.channelText ? `官方渠道标注：${item.channelText}` : (old?.note || ''),
    verified: true,
    source: `https://www.bandaihobbysite.cn/index/index/detail/id/${item.detailId}`,
    image: item.image || old?.image || null,
    imageUrl: item.image || old?.image || null,
  });
}

writeFileSync(
  join(ROOT, OUT_FILE),
  JSON.stringify(out, null, 2).replace(/\n/g, '\r\n') + '\r\n',
  'utf8',
);

const byCh = out.reduce((m, x) => ((m[x.channel] = (m[x.channel] || 0) + 1), m), {});
const byGrade = out.reduce((m, x) => ((m[x.grade] = (m[x.grade] || 0) + 1), m), {});
console.log(`整理出 ${out.length} 条中文站商品（跳过非模型 ${skipped} 条）→ ${OUT_FILE}`);
console.log('  渠道:', JSON.stringify(byCh));
console.log('  等级:', JSON.stringify(byGrade));
console.log('  有人民币价:', out.filter((x) => x.priceCny).length);
console.log('  有作品线:', out.filter((x) => x.series !== 'other').length);
