#!/usr/bin/env node
/**
 * 生成 PB 限定事实文件：src/data/gundam.kits.pb.json
 *
 * 两边是同一批商品，但记的不是一回事：
 *
 *   中文站 PB 专区（onlineshop_topics）给的是官方中文品名、官方商品图和
 *     「PB上新 / PB再贩」的预约公告，但不标价格，也不标实际发售日。
 *   万代日本站的 Premium Bandai 目录给的是官方日文品名、含税定价、发售日，
 *     却没有中文名。
 *
 * 两种文字系统之间没有直接可用的字符串锚点，图像也确实是**不同的照片**
 * （日站是深色特写，中文站是白底合影），所以图像匹配不成立。
 *
 * 这里用「日中对照 + 自助迭代」的办法把它们对上：
 *
 *   1. 先用库里已有的日中对照（同一 id 既有日文名也有中文名）学一张
 *      **词级对照表**：把品名按数字/拉丁字母切成锚点与片段，锚点之间的
 *      汉字假名片段就是可翻译单位。
 *   2. 用这张表把日站 PB 的品名翻成中文，再跟中文站名单逐条算相似度。
 *      高相似度且明显甩开第二名的，算配对成功。
 *   3. 配对成功的中文名与日文名是新的对照对，把它加进训练集**重学一遍**
 *      对照表——新学到的片段（比如「ジリウス → 齐利乌斯」）再拿去翻下一轮。
 *      迭代几轮后覆盖面就够用了。
 *
 * 产出：src/data/gundam.kits.pb.json
 *
 * 用法：node scripts/build-gundam-pb-facts.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENRICHED = 'src/data/gundam.kits.jp-enriched.json';
const CN_FILE = 'src/data/gundam.kits.cn.json';
const ZONE_FILE = 'src/data/gundam.kits.pb-zone.json';
const JP_FILE = 'src/data/gundam.kits.pb-jp.json';
const OUT_FILE = 'src/data/gundam.kits.pb.json';

/* ---------------------------------------------------------------- 切分 */

const ANCHOR = /[A-Za-z0-9][A-Za-z0-9./\-_+&']*/g;

/**
 * 全角英数字先折成半角。
 *
 * 日站的品名用全角（Ｆ０２、ＭＧ），中文站用半角（F02、MG）。不统一的话，
 * 同一件商品在两边切出来的锚点数对不上，片段就配不到一起。
 */
function toHalfWidth(s) {
  return (s || '').replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

function segment(name) {
  const parts = [];
  const src = toHalfWidth(name);
  let last = 0;
  let m;
  const re = new RegExp(ANCHOR.source, 'g');
  while ((m = re.exec(src))) {
    if (m.index > last) parts.push({ t: 's', v: src.slice(last, m.index) });
    parts.push({ t: 'a', v: m[0] });
    last = m.index + m[0].length;
  }
  if (last < src.length) parts.push({ t: 's', v: src.slice(last) });
  return parts;
}

function spans(parts) {
  const out = [];
  let cur = '';
  for (const p of parts) {
    if (p.t === 's') cur += p.v;
    else {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/* ---------------------------------------------------------------- 学表 */

function learnDict(pairs) {
  const table = new Map();
  for (const [jaName, cnName] of pairs) {
    const jpSeg = segment(jaName);
    const cnSeg = segment(cnName);
    const jsp = spans(jpSeg);
    const cnsp = spans(cnSeg);
    if (!jsp.length || jsp.length !== cnsp.length) continue;
    for (let i = 0; i < jsp.length; i++) {
      const key = jsp[i];
      const val = cnsp[i];
      if (!key || !val) continue;
      /* 长度差太多的一对多半是错位切出来的，不学 */
      const ratio = Math.max(key.length, val.length) / Math.max(1, Math.min(key.length, val.length));
      if (ratio > 3) continue;
      if (!table.has(key)) table.set(key, []);
      const list = table.get(key);
      if (!list.includes(val)) list.push(val);
    }
  }
  const dict = new Map();
  for (const [k, v] of table) if (v.length === 1) dict.set(k, v[0]);
  return dict;
}

function translate(name, dict) {
  return segment(name)
    .map((p) => {
      if (p.t === 'a') return p.v;
      const t = dict.get(p.v.trim());
      return t ?? p.v;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ---------------------------------------------------------------- 相似度 */

const PUNCT = /[\s　（）()【】\[\]「」『』・･,，.。/\\|&'"：:；;！!？?~～\-–—+＋*＊]/g;

function normalize(name) {
  return (name || '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(PUNCT, '')
    .toLowerCase();
}

/** 最长公共子序列 */
function lcs(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m || !n) return 0;
  let prev = new Uint16Array(n + 1);
  let cur = new Uint16Array(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = 0;
    for (let j = 1; j <= n; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

function similarity(a, b) {
  if (!a || !b) return 0;
  return (2 * lcs(a, b)) / (a.length + b.length);
}

/* ---------------------------------------------------------------- 读入 */

const enriched = JSON.parse(readFileSync(join(ROOT, ENRICHED), 'utf8'));
const cn = JSON.parse(readFileSync(join(ROOT, CN_FILE), 'utf8'));
const zone = JSON.parse(readFileSync(join(ROOT, ZONE_FILE), 'utf8'));
const jp = JSON.parse(readFileSync(join(ROOT, JP_FILE), 'utf8')).filter((x) => x.isPbShop);

const cnById = new Map(cn.map((x) => [x.id, x]));

/* 初始训练集：库里已有的日中对照 */
let training = [];
for (const e of enriched) {
  const kit = cnById.get(e.id);
  if (kit?.name && e.nameJa) training.push([e.nameJa, kit.name]);
}
console.log(`初始日中对照 ${training.length} 组`);

const normZone = zone.map((z) => ({ ...z, norm: normalize(z.name) }));

let dict = learnDict(training);
console.log(`学出对照片段 ${dict.size} 个`);

let pairs = new Map(); /* 中文条目 id → 日站商品 */

/**
 * 阈值逐轮收紧。
 *
 * 头几轮放宽，是为了给对照表喂足够多的新词（「ジリウス → 齐利乌斯」这类
 * 只有见过具体商品才会学到的片段）；等表长大之后，判定反而要更严，
 * 才不会把错的配对写进数据。
 */
const THRESHOLDS = [0.7, 0.75, 0.8, 0.85];
const MARGIN = 0.04;
/** 最终写进数据的门槛：只认高置信度的配对 */
const FINAL_MIN = 0.85;

for (let round = 1; round <= THRESHOLDS.length; round++) {
  const th = THRESHOLDS[round - 1];
  const translated = jp.map((j) => {
    const t = translate(j.nameJa, dict);
    return { j, t, n: normalize(t) };
  });

  pairs = new Map();
  let accepted = 0;
  for (const z of normZone) {
    let best = null;
    let bestCover = 0;
    let second = 0;
    for (const t of translated) {
      const cover = z.norm.length ? lcs(z.norm, t.n) / z.norm.length : 0;
      if (cover > bestCover) {
        second = bestCover;
        bestCover = cover;
        best = t;
      } else if (cover > second) {
        second = cover;
      }
    }
    if (bestCover >= th && bestCover - second >= MARGIN) {
      pairs.set(z.id, best);
      accepted++;
    }
  }
  console.log(
    `第 ${round} 轮（阈值 ${th}）：配对 ${accepted} / ${normZone.length}（对照片段 ${dict.size}）`,
  );

  if (accepted === 0) break;

  /* 把新配对并入训练集，重学对照表 */
  const fresh = [];
  for (const [zid, t] of pairs) {
    const z = zone.find((x) => x.id === zid);
    if (z) fresh.push([t.j.nameJa, z.name]);
  }
  training = training.concat(fresh);
  dict = learnDict(training);
}

/*
 * 最后按高门槛重挑一次。
 *
 * 两种文字系统之间没有共同锚点，图像也确实是不同的照片，所以机器能确认
 * 的配对只有一小部分。宁缺毋滥：只有覆盖率够高、且明显甩开第二名的
 * 才写进数据；其余条目的定价与发售日就留着空——万代中国确实没公布，
 * 空着比猜一个准。
 */
const finalPairs = new Map();
{
  const translated = jp.map((j) => {
    const t = translate(j.nameJa, dict);
    return { j, t, n: normalize(t) };
  });
  for (const z of normZone) {
    let best = null;
    let bestCover = 0;
    let second = 0;
    for (const t of translated) {
      const cover = z.norm.length ? lcs(z.norm, t.n) / z.norm.length : 0;
      if (cover > bestCover) {
        second = bestCover;
        bestCover = cover;
        best = t;
      } else if (cover > second) {
        second = cover;
      }
    }
    if (bestCover >= FINAL_MIN && bestCover - second >= MARGIN) finalPairs.set(z.id, best);
  }
  pairs = finalPairs;
}

console.log(`\n最终配对 ${pairs.size} 条`);

/* ---------------------------------------------------------------- 产出 */

const GRADE_RULES = [
  [/^HGUC/i, 'HG'], [/^HG/i, 'HG'], [/^RG/i, 'RG'], [/^MG\s*Ver/i, 'MG'],
  [/^MGSD/i, 'MGSD'], [/^MGEX/i, 'MG'], [/^RE\/100/i, 'MG'], [/^MG/i, 'MG'],
  [/^PG/i, 'PG'], [/^ENTRY/i, 'EG'], [/^EG/i, 'EG'], [/^FULL/i, 'FM'], [/^FM/i, 'FM'],
  [/^SDW/i, 'SD'], [/^SD/i, 'SD'], [/^LEGENDBB/i, 'SD'], [/^BB/i, 'SD'],
];

const NOT_A_MODEL = /水贴|贴纸|说明书|胶水|涂装工具|工具套装|可动底座|透明保护|装饰品|挂件/;

function gradeOf(name) {
  for (const [re, g] of GRADE_RULES) if (re.test(name)) return g;
  return '';
}

function scaleOf(grade, name) {
  const m = /(1\/\d+)/.exec(name);
  if (m) return m[1];
  if (grade === 'SD') return '非等比';
  return grade === 'MG' || grade === 'PG' || grade === 'FM' ? '1/100' : '1/144';
}

/** 作品线靠机体编号反查 */
function designations(name) {
  const set = new Set();
  for (const m of (name || '').toUpperCase().matchAll(/[A-Z]{1,5}-?\d{1,4}(?:-[A-Z]?\d{1,3})?[A-Z]?/g)) {
    const t = m[0].replace(/-/g, '');
    if (t.length >= 3) set.add(t);
  }
  return set;
}

const seriesMap = new Map();
for (const kit of cn) {
  if (!kit.series || kit.series === 'other') continue;
  for (const d of designations(kit.name)) {
    const cur = seriesMap.get(d);
    if (!cur) seriesMap.set(d, kit.series);
    else if (cur !== kit.series) seriesMap.set(d, null);
  }
}
function seriesOf(name) {
  for (const d of designations(name)) {
    const s = seriesMap.get(d);
    if (s) return s;
  }
  return 'other';
}

const kits = [];
for (const z of zone) {
  const name = (z.name || '').replace(/\s+/g, ' ').trim();
  const grade = gradeOf(name);
  if (!grade) continue;
  if (NOT_A_MODEL.test(name)) continue;

  const t = pairs.get(z.id);
  const jpName = t?.j?.nameJa || '';
  const scale = scaleOf(grade, name);
  const fullName = /^(HG|HGUC|RG|MG|PG|SD|EG|FG|FM|MGSD|MR|LEGENDBB|ENTRY|FULL|RE|30)/i.test(name)
    ? name
    : `${grade} ${scale} ${name}`;

  const tag = z.tag || '';
  const note = [
    tag === 'PB再贩' ? 'Premium Bandai 再贩' : '',
    tag === 'PB上新' ? 'Premium Bandai 新品' : '',
    z.date ? `官方预约公告日 ${z.date.replace(/\./g, '-')}` : '',
    t ? '' : '万代中国未公布定价与发售日，定价栏留空',
  ]
    .filter(Boolean)
    .join('；');

  kits.push({
    id: `pb-${z.id}`,
    name: fullName,
    nameJa: jpName,
    grade,
    maker: 'BANDAI SPIRITS',
    series: seriesOf(name) !== 'other' ? seriesOf(name) : seriesOf(jpName),
    seriesRaw: '',
    scale,
    released: t?.j?.released || '',
    priceJpy: t?.j?.priceJpy || 0,
    priceCny: 0,
    channel: 'pb',
    skillLevel: null,
    parts: null,
    heightMm: null,
    material: null,
    tags: [tag, 'Premium Bandai'].filter(Boolean).slice(0, 4),
    note,
    verified: true,
    source: `https://www.bandaihobbysite.cn/index/index/pb_detail/id/${z.id}`,
    sourceJp: t?.j?.url || null,
    image: t?.j?.localImage || null,
    imageUrl: z.image || null,
    taxRate: t?.j?.taxRate ?? null,
  });
}

writeFileSync(
  join(ROOT, OUT_FILE),
  JSON.stringify(kits, null, 2).replace(/\n/g, '\r\n') + '\r\n',
  'utf8',
);

console.log(`整理出 ${kits.length} 条 PB 商品 → ${OUT_FILE}`);
console.log(`  有日文名 ${kits.filter((k) => k.nameJa).length}`);
console.log(`  有定价 ${kits.filter((k) => k.priceJpy).length}`);
console.log(`  有发售日 ${kits.filter((k) => k.released).length}`);
console.log(`  有本地图 ${kits.filter((k) => k.image).length}`);
for (const k of kits.slice(0, 10)) {
  console.log(`  ${k.name} | ${k.nameJa || '—'} | ¥${k.priceJpy} | ${k.released || '—'}`);
}
