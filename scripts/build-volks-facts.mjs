#!/usr/bin/env node
/**
 * VOLKS 事实层
 * ---------------------------------------------------------------------------
 * 输入：.cache/volks/item-*.html（采集脚本抓下来的官方商城商品页）
 * 输出：src/data/models.kits.volks.json
 *
 * 判定「这是不是模型本体」用商城自己的规格字段，不靠商品名猜：
 *   - 商品仕様 / 仕様 里写着「インジェクションプラキット」「組み立てキット」
 *     「レジン製キット」——那是模型本体；
 *   - 写着「ディテールアップパーツ」「エッチング」「挽き物」「メタル」——
 *     那是改套件用的附件，不要；
 *   - シリーズ 写着「SWOP（アフターパーツ）」——整条都是 aftermarket，排除。
 *
 * 字段都来自商品页的规格表：税込価格、発売日、スケール、パーツ数、素材、
 * 原型制作、サイズ。发售日取规格表里的「発売日」第一行——页面顶部那个
 * 「発売日時」是商城的开卖时段，占位值（2054 年），不能用。
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const CACHE = join(ROOT, '.cache', 'volks');
const OUT = join(ROOT, 'src', 'data', 'models.kits.volks.json');

const strip = (s) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

function specRows(html) {
  const out = {};
  for (const m of html.matchAll(/<th[^>]*>([\s\S]{0,60}?)<\/th>\s*<td[^>]*>([\s\S]{0,800}?)<\/td>/g)) {
    const k = strip(m[1]);
    if (k && !(k in out)) out[k] = strip(m[2]);
  }
  return out;
}

const pick = (rows, ...keys) => {
  for (const k of keys) {
    const v = rows[k];
    if (v) return v;
  }
  return '';
};

/** 商城规格表里的「発売日」——可能有多行（首售 + 再贩），取第一行 */
function releaseDate(rows) {
  const raw = pick(rows, '発売日');
  const m = raw.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (!m) return '';
  return `${m[1]}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[3])).padStart(2, '0')}`;
}

function priceOf(html) {
  /*
   * 价格块里夹着标签（「9,680円</span>（税込）」），所以先剥标签再匹配。
   * 商品页自己的价格在推荐位之前，取第一次出现的含税价就是它。
   */
  const text = strip(html);
  const m = text.match(/([\d,]+)\s*円\s*[（(]\s*税込\s*[）)]/);
  const jpy = m ? Number(m[1].replace(/,/g, '')) : 0;
  const b = text.match(/本体価格[：:]\s*([\d,]+)\s*円/);
  const base = b ? Number(b[1].replace(/,/g, '')) : 0;
  return { jpy, base };
}

/** 判定是不是模型本体；返回 null 表示不是 */
function kitCheck(rows, name, seriesRaw) {
  const spec = pick(rows, '商品仕様', '仕様');
  /* 整条都是改件的产品线 */
  if (/SWOP|アフターパーツ/.test(seriesRaw)) return null;
  if (/カスタムパーツ|オプションパーツ/.test(seriesRaw)) return null;
  if (/完成品/.test(spec)) return null;
  const isKit = /インジェクションプラキット|組み立てキット|レジン製キット/.test(spec);
  if (!isKit) return null;
  /* 「ディテールアップパーツ レジン製キット」这类是改件，仍然排除 */
  if (/ディテールアップ|ディティールアップ/.test(spec)) return null;
  return spec;
}

/** 归类：品类 + 作品线（中文） */
function classify(seriesRaw, name) {
  const s = `${seriesRaw} ${name}`;
  if (/SWS-VB|SWS-STM|ハンガーボックス|あなたの描く小さな情景|石畳モジュール|情景/.test(s)) {
    return { category: 'volks:base', series: 'SWS 情景基座与模块' };
  }
  if (/SWS/.test(s)) return { category: 'volks:sws', series: 'SWS 航空模型' };
  if (/ファイブスター物語|F\.?S\.?S\.?|SAV |HSGK|IMS |VSMS|SSS /.test(s)) {
    return { category: 'volks:fss', series: 'F.S.S. 五星物语' };
  }
  if (/ブロッカーズ|BLOCK|FIORE/.test(s)) {
    return { category: 'volks:blockers', series: 'BLOCKer’s FIORE' };
  }
  if (/キャラグミン|自組手办/.test(s)) return { category: 'volks:charagumin', series: '自组手办（チャグミン）' };
  if (/IJ|ATM/.test(s)) return { category: 'volks:mecha', series: '1/24 机甲模型' };
  if (/絶対領域|モエコレ/.test(s)) return { category: 'volks:figure', series: 'VOLKS 角色模型' };
  return { category: 'volks:other', series: 'VOLKS 其他模型' };
}

/** 从品名里剥掉厂牌与比例，剩下的就是「这条产品是关于谁的」 */
function subjectOf(name) {
  let s = name.trim();
  /*
   * 厂牌前缀：SWS / SWOP / SAV / HSGK / IMS …—
   * 数字后缀只允许紧贴厂牌（SWS01），不能跨空格吃掉比例里的「1/32」。
   */
  s = s.replace(
    /^(?:SWS(?:\d+|[- ](?:VB|STM)\d*)?|SWOP|SRS|SROP|F\.?S\.?S\.?|ABSOMEC|HSGK|IMS|SAV|VSMS|SSS|MIGHTY|BKOP|OHS|A3GK|1\/35IJ|1\/24IJ)\s*/,
    '',
  );
  s = s.replace(/^1\/\d+\s*/, '');
  s = s.replace(/^nonスケール\s*/, '');
  s = s.replace(/^自組手办\s*/, '');
  s = s.replace(/^套装\s*/, '');
  return s.trim();
}

const all = JSON.parse(readFileSync(join(ROOT, '.cache', 'volks-list.json'), 'utf8'));
/* 与采集脚本一致：工具/涂料/书籍/周边/服务不是模型本体 */
const NON_KIT = new Set(['H_TOOL', 'H_PAINT', 'H_BOOK', 'H_GOODS', 'H_SERVICE', 'H_EVENT']);
const items = all.filter((it) => {
  const parts = it.category.split(':');
  if (parts.some((c) => NON_KIT.has(c))) return false;
  return parts.includes('H_SCALE') || parts.includes('H_MECHA');
});
const out = [];
const skipped = [];

for (const it of items) {
  const file = join(CACHE, `item-${it.itemCd}.html`);
  if (!existsSync(file)) continue;
  const html = readFileSync(file, 'utf8');
  const rows = specRows(html);

  const name = strip((html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '').split(' | ')[0].trim();
  if (!name) continue;

  const seriesRaw = pick(rows, 'シリーズ', 'シリーズ名');
  const spec = kitCheck(rows, name, seriesRaw);
  if (!spec) {
    skipped.push({ name, reason: '非模型本体', series: seriesRaw, spec: pick(rows, '商品仕様', '仕様') });
    continue;
  }

  const { jpy, base } = priceOf(html);
  const scale = pick(rows, 'スケール').match(/(\d+\s*\/\s*\d+)/)?.[1]?.replace(/\s+/g, '') || '';
  const partsRaw = pick(rows, 'パーツ数', 'パーツ総数').match(/(\d+)/)?.[1];
  /*
   * 全高：规格表里写的是「全高約185mm」「全高252mm」这类，单位可能是 mm 或 cm。
   * 「約」可有可无，数字必须整段取走——不能只抓末位。
   */
  const sizeRaw = pick(rows, 'サイズ');
  const heightMatch = sizeRaw.match(/全高\s*[:：]?\s*(?:約|约)?\s*(\d+(?:\.\d+)?)\s*(mm|cm)/i);
  const heightRaw = heightMatch
    ? Math.round(Number(heightMatch[1]) * (heightMatch[2].toLowerCase() === 'cm' ? 10 : 1))
    : null;
  const material = pick(rows, '素材');
  const sculptor = pick(rows, '原型制作', '原型製作');
  const code = pick(rows, '型番');
  const contents = pick(rows, '商品内容');
  const { category, series } = classify(seriesRaw, name);

  const subject = subjectOf(name);
  const isFigure = /figure|blockers|fss|charagumin/.test(category);

  const noteParts = [];
  if (sculptor) noteParts.push(`原型制作：${sculptor}`);
  if (contents) noteParts.push(contents);

  out.push({
    id: `volks-${it.itemCd}`,
    name,
    /* 商城只给日文名与日文说明，没有中文名——不猜，中文名留空 */
    nameJa: '',
    category,
    grade: category,
    maker: 'VOLKS',
    series,
    scale,
    released: releaseDate(rows),
    listedAt: '',
    priceJpy: jpy,
    priceCny: 0,
    priceHkd: 0,
    channel: 'general',
    skillLevel: null,
    parts: partsRaw ? Number(partsRaw) : null,
    heightMm: heightRaw,
    material: material || null,
    tags: ['VOLKS', '造型村'],
    note: noteParts.join('；'),
    subject: subject || null,
    subjectKind: subject ? (isFigure ? 'character' : 'mech') : null,
    aliases: [it.itemCd, code].filter(Boolean),
    verified: true,
    source: `https://hobby.ec.volks.co.jp/item/${it.itemCd}.html`,
    image: null,
    imageUrl: (html.match(/property="og:image"[^>]*content="([^"]+)"/) || [])[1] || '',
    taxRate: base && jpy ? Math.round(((jpy / base - 1) * 100) * 10) / 10 : null,
    sourceJp: null,
  });
}

out.sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');

console.log(`收 ${out.length} 条 → ${OUT}`);
const byCat = {};
for (const e of out) byCat[e.category] = (byCat[e.category] || 0) + 1;
console.log('品类分布:', byCat);
console.log(`排除 ${skipped.length} 条，原因分布:`);
const reasons = {};
for (const s of skipped) {
  const key = /SWOP|アフターパーツ/.test(s.series) ? 'SWOP 改件' : /完成品/.test(s.spec) ? '完成品' : '附件/非本体';
  reasons[key] = (reasons[key] || 0) + 1;
}
console.log(' ', reasons);
console.log('\n样本：');
for (const e of out.slice(0, 12)) {
  console.log(`  ${e.id}  ¥${e.priceJpy}  ${e.released || '无日期'}  ${e.scale || '-'}  ${e.category}  ${e.name}`);
}
console.log('\n被排除样本：');
for (const s of skipped.slice(0, 12)) console.log(`  [${s.series || '-'}] ${s.name} — ${s.spec || '-'}`);
