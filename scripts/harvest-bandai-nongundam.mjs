#!/usr/bin/env node
/**
 * 万代非高达产品线采集
 * ---------------------------------------------------------------------------
 * 万代官方中文站（bandaihobbysite.cn）除了高达模型，还卖好几条别的产品线：
 * 宝可梦拼装模型、30MS/30MP 人偶、30MM/HAROPLA 机甲模型、MECHA COLLECTION
 * 宇宙战舰模型、猫武装、黏土模型套件。它们在中文站上与高达放在同一份目录里，
 * 但等级（PG/MG/HG…）那套分类法套不上去，所以本库里另立一档。
 *
 * 数据来源是中文站的全量商品总表（gundam.kits.itemall.json），筛选出这几条线，
 * 再逐条抓详情页——详情页上有中文站自己的分类面包屑（作品线在哪一级）、
 * 日本地区建议零售价、发售日期、适合年龄与商品信息（里面写着全高）。
 *
 * **配件不收**：30MM 的配件套组与拓展包、30MS 的造型服饰与可选身体配件，
 * 跟水贴、底座、说明书一样不是模型，和本库既有的排除口径一致。
 * **BB 战士不收**：那是一条被刻意排除的产品线（源站上另有 50 条），不在本次范围内。
 *
 * 用法：node scripts/harvest-bandai-nongundam.mjs [--limit N]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://www.bandaihobbysite.cn';
const CACHE_DIR = join(ROOT, '.cache', 'bandai-ng');
const OUT_FILE = 'src/data/models.kits.bandai-nongundam.json';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const DELAY = 400;
const CONCURRENCY = 3;
const BATCH = 60;

const limitArg = process.argv.indexOf('--limit');
const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 品名前缀 → 产品线。
 *
 * 30MM 里有 HAROPLA（1/144 那批）与机战佣兵VI（1/72）两个分支，品名上分得开。
 */
const LINES = [
  { re: /^30MM|^HAROPLA/, line: '30MM', category: '30MM', kind: 'mech' },
  { re: /^30MS/, line: '30MS', category: '30MS', kind: 'character' },
  { re: /^30MP/, line: '30MP', category: '30MP', kind: 'character' },
  { re: /^宝可梦/, line: '宝可梦', category: '宝可梦拼装模型', kind: 'character' },
  { re: /^MECHA COLLECTION/i, line: 'MECHA COLLECTION', category: 'MECHA COLLECTION', kind: 'mech' },
  { re: /^猫武装/, line: '猫武装', category: '猫武装', kind: 'character' },
  { re: /^黏土模型套件/, line: '黏土模型套件', category: '黏土模型套件', kind: 'none' },
];

/**
 * 配件与工具类：不是模型。
 *
 * 和本库既有的排除口径一致——水贴、零件套组、底座、工具、说明书、立牌都不收。
 * 30MM 的可选装甲/武器/背包/推进单元与 30MS 的可选发型、面部配件同理。
 */
const NOT_A_MODEL =
  /(配件套组|通用配件|拓展包|配件包|武器套组|可选(?:发型|面部|身体)配件|造型服饰|附属品|连接零件|展示底座|专用底座|说明书|水贴|贴纸|包装盒|收纳|工具|镊子|美工刀|胶水|颜料|专用装甲|自定义装甲|定义装甲|自定义武器|自定义背包|突击单元|推进单元|装甲套装)/;

function lineOf(name) {
  for (const l of LINES) if (l.re.test(name)) return l;
  return null;
}

/* -------------------------------------------------------------------------- */
/* 抓取                                                                        */
/* -------------------------------------------------------------------------- */

async function fetchText(url) {
  let backoff = 3_000;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          Referer: `${ORIGIN}/item_all`,
        },
        redirect: 'follow',
      });
      if (!res.ok) return '';
      return await res.text();
    } catch {
      if (attempt === 2) return '';
      await sleep(backoff);
      backoff *= 2;
    }
  }
  return '';
}

function all(re, html) {
  return [
    ...html.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`)),
  ].map((m) => m[1]);
}

/**
 * 产品线 → 品名前缀（用来剥出「关于谁」）。
 *
 * 30MM 里有 HAROPLA 与 30MM 两个写法；宝可梦那批的品名以「宝可梦拼装模型收藏」
 * 开头；猫武装后面跟着弹数或「第二弹」。
 */
const LINE_PREFIX = {
  '30MM': /^(?:30MM|HAROPLA)\s*/,
  '30MS': /^30MS\s*/,
  '30MP': /^30MP\s*/,
  '宝可梦拼装模型': /^宝可梦拼装模型收藏?\s*/,
  'MECHA COLLECTION': /^MECHA\s+COLLECTION\s*/i,
  '猫武装': /^猫武装\S*\s*/,
  '黏土模型套件': /^黏土模型套件\s*/,
};

/**
 * 主题里要去掉的「系列」字样。
 *
 * 宝可梦那批的品名分三段：「宝可梦拼装模型收藏」「64 特选系列」「超级快龙」，
 * 中间那段是宝可梦自己的系列，不是这只宝可梦的名字。
 */
const SUBJECT_NOISE = {
  '宝可梦拼装模型': /^(?:\d+\s*特选系列|快快拼！！\s*\d+|化石宝可梦系列|进化系列)\s*/,
};

/**
 * 面包屑：角色模型 / [产品线] / [作品] / 商品名。
 *
 * 页面里有两组面包屑——页头一组、商品区一组。取**最后一组**：
 * 以最后一个顶级分类（「角色模型」）为起点往后看。
 */
function lineWorkFromCrumbs(crumbs) {
  const list = crumbs.filter((s) => s && s !== 'TOP');
  let from = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i] === '角色模型' || list[i] === '高达模型') {
      from = i;
      break;
    }
  }
  const group = list.slice(from);
  const title = group.at(-1) ?? '';
  const line = group.length >= 3 ? group[1] : '';
  const work = group.length >= 4 ? group[2] : '';
  return { title, line, work };
}

/** 面包屑：角色模型 / [产品线] / [作品] / 商品名 */
function parseBreadcrumb(html) {
  const crumbs = all(/p-breadcrumb__txt"[^>]*>([\s\S]{0,80}?)<\/a>/g, html)
    .map((s) => s.replace(/<[^>]+>/g, '').trim())
    .filter(Boolean);
  const { title, line, work } = lineWorkFromCrumbs(crumbs);
  return { crumbs, title, line, work };
}

/** 商品信息整段（描述在第一段，全高在后面的条目里） */
function parseDescription(html) {
  const i = html.indexOf('商品信息');
  if (i < 0) return { lead: '', full: '' };
  const block = html.slice(i, i + 4000).replace(/<br\s*\/?>/gi, '\n');
  const paras = block
    .replace(/<[^>]+>/g, '\n')
    .split('\n')
    .map((s) => s.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const first = paras.find((p) => p.length > 20 && !/^【|^■/.test(p));
  return { lead: first ?? '', full: paras.join(' ') };
}

function parseDetail(html) {
  const { crumbs, title, line, work } = parseBreadcrumb(html);
  const fields = new Map();
  const re = /pg-products__labelInner">([\s\S]{0,60}?)<\/span>\s*<\/dt>\s*<dd class="pg-products__labelTxt">([\s\S]{0,300}?)<\/dd>/g;
  for (const m of html.matchAll(re)) {
    fields.set(m[1].replace(/<[^>]+>/g, '').trim(), m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  }

  const priceRaw = fields.get('日本地区建议零售价') ?? '';
  const priceJpy = Number((priceRaw.match(/([\d,]+)\s*日元/) || [])[1]?.replace(/,/g, '') ?? 0) || 0;

  const dateRaw = fields.get('发售日期') ?? '';
  const dm = dateRaw.match(/(\d{4})年(\d{1,2})月(?:(\d{1,2})日)?/);
  const released = dm
    ? dm[3]
      ? `${dm[1]}-${dm[2].padStart(2, '0')}-${dm[3].padStart(2, '0')}`
      : `${dm[1]}-${dm[2].padStart(2, '0')}`
    : '';

  const age = fields.get('适合年龄') ?? '';

  const description = parseDescription(html);
  const hm = description.full.match(/全高\s*约?\s*(\d{2,4})\s*(cm|mm|厘米|毫米)/);
  const heightMm = hm
    ? hm[2] === 'mm' || hm[2] === '毫米'
      ? Number(hm[1])
      : Number(hm[1]) * 10
    : null;

  const image =
    all(/<a class="swiper-slide" href="([^"]+)"[^>]*data-fancybox="gallery"/g, html)[0] ??
    all(/<img[^>]+src="(\/www\/uploads\/[^"]+)"/g, html)[0] ??
    '';

  return {
    title,
    line,
    work,
    priceJpy,
    released,
    age,
    description: description.lead,
    heightMm,
    image: image ? (image.startsWith('http') ? image : `${ORIGIN}${image}`) : '',
    crumbs,
  };
}

/* -------------------------------------------------------------------------- */
/* 主流程                                                                      */
/* -------------------------------------------------------------------------- */

const all_ = JSON.parse(readFileSync(join(ROOT, 'src/data/gundam.kits.itemall.json'), 'utf8'));

const picked = [];
let skippedPart = 0;
for (const r of all_) {
  const line = lineOf(r.name);
  if (!line) continue;
  if (NOT_A_MODEL.test(r.name)) {
    skippedPart++;
    continue;
  }
  picked.push({ ...r, line });
}
picked.sort((a, b) => Number(b.detailId) - Number(a.detailId));
const targets = picked.slice(0, limit);

console.log(`非高达产品线：候选 ${picked.length} 条（排除配件类 ${skippedPart} 条），开始抓详情页`);

const records = [];
let done = 0;
let failed = 0;

for (let i = 0; i < targets.length; i += BATCH) {
  const batch = targets.slice(i, i + BATCH);
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async (_, k) => {
      for (let j = k; j < batch.length; j += CONCURRENCY) {
        const item = batch[j];
        const file = join(CACHE_DIR, `p_${item.detailId}.json`);
        let detail;
        if (existsSync(file)) {
          detail = JSON.parse(readFileSync(file, 'utf8'));
          /* 面包屑的切组规则改过之后，从缓存里也能重算，不必重抓 */
          const lw = lineWorkFromCrumbs(detail.crumbs ?? []);
          detail.line = lw.line;
          detail.work = lw.work;
          detail.title = lw.title || detail.title;
        } else {
          const html = await fetchText(`${ORIGIN}/index/index/detail/id/${item.detailId}`);
          if (!html) {
            failed++;
            continue;
          }
          detail = parseDetail(html);
          writeFileSync(file, JSON.stringify(detail), 'utf8');
          await sleep(DELAY);
        }
        records.push({ item, detail });
        done++;
      }
    }),
  );
  console.log(`  ${done}/${targets.length}（失败 ${failed}）`);
}

/* -------------------------------------------------------------------------- */
/* 写事实文件                                                                  */
/* -------------------------------------------------------------------------- */

/** 从品名里去掉产品线前缀与比例，剩下的是「关于谁」 */
function subjectOf(name, category, work) {
  let s = name;
  const prefix = LINE_PREFIX[category];
  if (prefix) s = s.replace(prefix, '');
  const noise = SUBJECT_NOISE[category];
  if (noise) s = s.replace(noise, '');
  s = s.replace(/^[\s　]*\d+\/\d+[\s　]*/, '');
  if (work && s.startsWith(work)) s = s.slice(work.length);
  s = s.replace(/^[\s　·・]+/, '').trim();
  return s || null;
}

/** 比例：品名里写了才填 */
function scaleOf(name) {
  const m = /(\d+\/\d+)/.exec(name);
  return m ? m[1] : '';
}

const out = records
  .map(({ item, detail }) => {
    const line = item.line;
    const series = detail.work || detail.line || '';
    const subject = line.kind === 'none' ? null : subjectOf(item.name, line.category, detail.work);
    return {
      id: `bc-${item.detailId}`,
      name: detail.title || item.name,
      nameJa: '',
      grade: line.category,
      maker: 'BANDAI SPIRITS',
      series,
      scale: scaleOf(item.name),
      released: detail.released || item.released || '',
      priceJpy: detail.priceJpy || item.priceJpy || 0,
      priceCny: 0,
      channel: 'general',
      skillLevel: null,
      parts: null,
      heightMm: detail.heightMm ?? null,
      material: null,
      tags: detail.age ? [detail.age] : [],
      note: detail.description ?? '',
      subject,
      subjectKind: subject ? line.kind : null,
      verified: true,
      source: `${ORIGIN}/index/index/detail/id/${item.detailId}`,
      image: null,
      imageUrl: detail.image || item.image || null,
    };
  })
  .sort((a, b) => b.released.localeCompare(a.released) || a.name.localeCompare(b.name, 'zh-Hans-CN'));

writeFileSync(join(ROOT, OUT_FILE), JSON.stringify(out, null, 2) + '\n', 'utf8');

console.log(`\n共 ${out.length} 条，写出 ${OUT_FILE}（失败 ${failed}）`);
const byLine = new Map();
for (const r of out) byLine.set(r.grade, (byLine.get(r.grade) || 0) + 1);
console.log('产品线分布：', Object.fromEntries(byLine));
const bySeries = new Map();
for (const r of out) bySeries.set(r.series || '(空)', (bySeries.get(r.series || '(空)') || 0) + 1);
console.log('作品线分布：', Object.fromEntries([...bySeries.entries()].sort((a, b) => b[1] - a[1])));
console.log('缺价格', out.filter((r) => !r.priceJpy).length, '｜缺发售月', out.filter((r) => !r.released).length, '｜缺作品线', out.filter((r) => !r.series).length);
