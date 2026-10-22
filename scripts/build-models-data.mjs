#!/usr/bin/env node
/**
 * 合并各厂商的模型原始记录，生成页面读取的类型化模块。
 *
 *   事实层  src/data/gundam.kits.*.json / src/data/models.kits.*.json  人工核实过的原始记录
 *   转换层  scripts/build-models-data.mjs  本脚本
 *   渲染层  src/data/models.kits.ts      生成物，页面只读它
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
import { createHash } from 'node:crypto';
import { subjectOf, subjectKey, subjectKeyFor } from './lib/subject.mjs';
import { buildMallIndex, matchMall, parsePreorderWindow, saleStatusOf } from './lib/mall.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = 'src/data/models.kits.ts';
const SUBJECTS_FILE = 'src/data/models.subjects.json';
const SERIES_FILE = 'src/data/models.series.json';
/** 本地图片清单，由 scripts/fetch-gundam-images.mjs 生成 */
const IMAGES_FILE = 'src/data/gundam.images.json';

/**
 * 开放词表里的作品名 → 作品线 id。
 *
 * 作品名多是日文与中文，没法直接当目录名，所以用作品名的哈希做 id：
 * 同一个作品名永远得到同一个 id，改动事实文件也不会漂移。
 */
function seriesId(label) {
  return 'w' + createHash('sha1').update(label).digest('hex').slice(0, 10);
}

/**
 * 作品线的配色。
 *
 * 人工整理的万代作品线各有配色；开放词表里的作品线没有人工配色，
 * 按 id 的哈希算一个稳定的色相，配色在同一条作品线里始终一致。
 */
function seriesPalette(id) {
  const h = createHash('sha1').update(id).digest();
  const hue = h[0] * 360 / 256;
  const hue2 = (hue + 186) % 360;
  return [
    `hsl(${hue.toFixed(0)} 26% 68%)`,
    `hsl(${hue.toFixed(0)} 24% 34%)`,
    `hsl(${hue2.toFixed(0)} 58% 56%)`,
  ];
}

/** 作品线目录：id → 作品名 */
const seriesLabels = new Map();

/**
 * 各厂商的事实文件。
 *
 * 品类 id 的前缀就是厂商，所以「万代的 HG」与「良笑的 figma」在同一个维度上，
 * 却不会撞车。作品线同理：万代那边是机体作品，良笑那边是角色 IP。
 *
 * 渠道与品类都是「这家厂把产品分成哪几类」的答案，所以按厂商各添一套；
 * 作品线分两种：
 *   seriesMode 'id'    —— 作品线是人工整理的固定表（万代、魔动核），
 *                         越界的记录会被报告出来并降级到「其他」；
 *   seriesMode 'label' —— 作品线是开放词表（寿屋、良笑），事实文件里直接给
 *                         作品名，脚本为它生成 id 并写进作品线目录。
 */
const VENDORS = [
  {
    id: 'bandai',
    label: 'BANDAI SPIRITS',
    sources: [
      'src/data/gundam.kits.classic.json',
      'src/data/gundam.kits.recent.json',
      'src/data/gundam.kits.cn.json',
      'src/data/gundam.kits.seed.json',
      'src/data/gundam.kits.pb.json',
      'src/data/gundam.kits.assemble.json',
      /* 非高达产品线：宝可梦拼装模型、30MS/30MP、30MM、MECHA COLLECTION… */
      'src/data/models.kits.bandai-nongundam.json',
    ],
    /** 原始等级 → 规范品类 id */
    categories: {
      PG: 'bandai:pg', MG: 'bandai:mg', MGSD: 'bandai:mgsd', RG: 'bandai:rg',
      HG: 'bandai:hg', FG: 'bandai:fg', SD: 'bandai:sd', EG: 'bandai:eg',
      FM: 'bandai:fm', MR: 'bandai:mr', GA: 'bandai:ga',
      HIRM: 'bandai:hirm', FIG: 'bandai:figure',
      /* 非高达产品线：等级那套分类法套不上去，各给一个品类 */
      '30MM': 'bandai:30mm', '30MS': 'bandai:30ms', '30MP': 'bandai:30mp',
      '宝可梦拼装模型': 'bandai:plamodel', 'MECHA COLLECTION': 'bandai:mecha',
      '猫武装': 'bandai:neco', '黏土模型套件': 'bandai:clay',
    },
    defaultCategory: 'bandai:other',
    /** 缺比例时用它兜底 */
    defaultScale: {
      PG: '1/100', MG: '1/100', MGSD: 'SD 比例', RG: '1/144', HG: '1/144',
      FG: '1/144', SD: '非等比', EG: '1/144', FM: '1/100', MR: '约 1/100',
      GA: '约 50mm', HIRM: '1/100', FIG: '',
      '30MM': '1/72', '30MS': '', '30MP': '', '宝可梦拼装模型': '',
      'MECHA COLLECTION': '', '猫武装': '', '黏土模型套件': '',
    },
    seriesMode: 'id',
    series: new Set([
      'uc', '0080', '0083', '0093', '0094', 'hathaway', 'gundam-x', 'gquuuuuux',
      'seed', 'seed-destiny', 'seed-freedom', 'w', '08ms', 'zz', 'zeta', 'f91',
      'gundam-build', 'iron-blooded', 'wing-gundam', 'gundam-duelists', 'stargazer',
      'crossbone-g', 'gundam-00', 'gundam-age', 'gundam-nt', 'gundam-mv', 'gundam-front',
      'gundam-moon', 'gundam-xarx-zero', 'gundam-build-divers', 'ring-of-nergal',
      'pilot-season', 'v-gundam', 'g-gundam', 'wfm', 'sd-gundam', 'missing-link',
      'gundam-assemble', 'non-gundam', 'other',
    ]),
    channels: new Set(['general', 'pb', 'gb', 'wt']),
    /** 主题的类型：塑料模型的主题是机体 */
    subjectKind: 'mech',
  },
  {
    id: 'modhtoy',
    label: '摩动核 MO DONG HE',
    sources: ['src/data/models.kits.modhtoy.json'],
    categories: {
      超可动拼装: 'modhtoy:action',
      合金成品: 'modhtoy:alloy',
      超可动成品: 'modhtoy:finished',
      小比例: 'modhtoy:small',
      机甲潮玩: 'modhtoy:toy',
    },
    defaultCategory: 'modhtoy:other',
    defaultScale: {},
    seriesMode: 'id',
    series: new Set(['xjhcz', 'gthq', 'other']),
    channels: new Set(['general', 'limited', 'exclusive']),
    /** 主题的类型由事实文件逐条给：机体潮玩是角色，机体产品是机体 */
    subjectKind: null,
  },
  {
    id: 'kotobukiya',
    label: 'KOTOBUKIYA',
    sources: ['src/data/models.kits.kotobukiya.json'],
    categories: {
      プラモデル本体: 'kotobukiya:kit',
      'サポートユニット(M.S.G)': 'kotobukiya:support',
      プラモデルオプションパーツ: 'kotobukiya:option',
      スケールフィギュア: 'kotobukiya:figure',
      その他フィギュア: 'kotobukiya:otherfigure',
      ガレージキット: 'kotobukiya:garage',
      キャラグッズ: 'kotobukiya:goods',
    },
    defaultCategory: 'kotobukiya:other',
    defaultScale: {},
    /* 作品名是开放词表：ヘキサギア、新世紀エヴァンゲリオン、銀河英雄伝説… */
    seriesMode: 'label',
    series: null,
    channels: new Set(['general', 'limited', 'exclusive']),
    subjectKind: null,
  },
  {
    id: 'goodsmile',
    label: 'GOOD SMILE COMPANY',
    sources: [
      'src/data/models.kits.goodsmile.json',
      /* 商城上正在开放预购、资料库里还没有的新品 */
      'src/data/models.kits.goodsmile-preorder.json',
    ],
    categories: {
      figma: 'goodsmile:figma',
      nendoroid: 'goodsmile:nendoroid',
      scale: 'goodsmile:scale',
      stiky: 'goodsmile:stiky',
      pixel: 'goodsmile:pixel',
      modroid: 'goodsmile:modroid',
      plamatea: 'goodsmile:plamatea',
      other: 'goodsmile:other',
      goods: 'goodsmile:goods',
    },
    defaultCategory: 'goodsmile:other',
    defaultScale: {},
    /* 作品名是开放词表：鬼滅之刃、蔚藍檔案 Blue Archive… */
    seriesMode: 'label',
    series: null,
    channels: new Set(['general', 'limited', 'exclusive']),
    subjectKind: null,
  },
];

/** 品类 id → 原始等级（万代那边等级就是品类名） */
const CATEGORY_LABEL = {
  'bandai:pg': 'PG', 'bandai:mg': 'MG', 'bandai:mgsd': 'MGSD', 'bandai:rg': 'RG',
  'bandai:hg': 'HG', 'bandai:fg': 'FG', 'bandai:sd': 'SD', 'bandai:eg': 'EG',
  'bandai:fm': 'FM', 'bandai:mr': 'MR', 'bandai:ga': 'GA',
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

/** 同上，但返回原始数组（带来源标记的那个版本是给事实文件用的） */
function readJsonRaw(rel) {
  return readJsonArray(rel);
}

/** 读一个 JSON 对象文件；没有或坏了就当作空 */
function readJsonObject(rel) {
  try {
    const parsed = JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
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

/* -------------------------------------------------------------------------- */
/* 良笑商城：在售状态与现价                                                     */
/* -------------------------------------------------------------------------- */

/**
 * 良笑有两套系统：
 *
 *   goodsmile.info  产品资料库——中文品名、作品名、发售月、建议零售价
 *   goodsmile.com   线上商城——当下的在售状态、现价、限定标签
 *
 * 两边的 id 各是各的，**同一个产品两边的 id 并不相等**，只能靠品名对照。
 * 对照规则见 scripts/lib/mall.mjs。
 */
const MALL = readJsonRaw('src/data/models.kits.goodsmile-mall.json');
const MALL_STATUS = readJsonRaw('src/data/models.kits.goodsmile-mall-status.json');

const MALL_INDEX = buildMallIndex(MALL);
const MALL_STATUS_BY_ID = new Map(
  MALL_STATUS.filter((s) => s && s.mallId).map((s) => [String(s.mallId), s]),
);

/** 商城状态标签里属于「状态」而不是「限定」的几个 */
const MALL_STATUS_LABELS = new Set(['開放預購中', '予約受付中', '販売中', '完売', '売り切れ']);

/** 状态 → 界面上的说法 */
const SALE_STATUS_LABEL = {
  preorder: '预约中',
  available: '在售',
  soldout: '已售罄',
  ended: '已结束',
};

/** 商城那边的现状，挂到资料库记录上 */
function saleOverlay(mall, how) {
  if (!mall) {
    return {
      saleStatus: null,
      saleStatusText: '',
      salePriceJpy: 0,
      saleLabels: [],
      saleUrl: null,
      saleCode: '',
      saleNote: '',
      saleMatch: '',
      salePreorderFrom: '',
      salePreorderTo: '',
    };
  }
  const st = MALL_STATUS_BY_ID.get(String(mall.mallId));
  /* 状态在这里重新算一遍：判定规则改过之后不必重抓详情页 */
  const status = st
    ? saleStatusOf(st.statusText, st.orderButton, st.priceJpy || mall.priceJpy || 0)
    : null;
  const labels = (mall.labels || []).filter((l) => l && !MALL_STATUS_LABELS.has(l));
  /* 预约区间：抓取器顺手存了一份，这里再从状态原文兜一次（规则改过也能兜住） */
  const window = st
    ? st.preorderFrom || st.preorderTo
      ? { from: st.preorderFrom || '', to: st.preorderTo || '' }
      : parsePreorderWindow(st.statusText)
    : { from: '', to: '' };
  return {
    saleStatus: status && status !== 'no-data' && status !== 'unknown' ? status : null,
    saleStatusText: st ? st.statusText || '' : '',
    salePriceJpy: (st && st.priceJpy) || mall.priceJpy || 0,
    saleLabels: labels,
    saleUrl: mall.url || `https://www.goodsmile.com/zh/product/${mall.mallId}`,
    saleCode: mall.mallNo || '',
    saleNote: st ? st.note || '' : '',
    saleMatch: how || '',
    salePreorderFrom: window.from,
    salePreorderTo: window.to,
  };
}

function normalise(entry, file, vendor) {
  const id = slugify(entry.id ?? '');
  if (!id) {
    note(`${file}: 有一条记录缺少 id，已丢弃`);
    return null;
  }

  /* 品类：原始写法（万代是等级，良笑是系列名）→ 规范 id */
  const rawCategory = text(entry.category || entry.grade);
  let category = vendor.categories[rawCategory];
  if (!category) {
    const fallback = vendor.categories[rawCategory.toUpperCase()];
    if (!fallback) {
      note(`${file} / ${id}: 品类「${rawCategory}」不在 ${vendor.label} 的约定范围内，已丢弃`);
      return null;
    }
    category = fallback;
  }

  /*
   * 作品线。
   *
   * 两种模式：
   *   'id'    —— 事实文件里给的是人工整理的 id，越界就降级到「其他」；
   *   'label' —— 事实文件里给的是作品名（寿屋的「ヘキサギア」、良笑的「鬼滅之刃」），
   *              脚本为它生成稳定的 id，并写进作品线目录。
   */
  let series;
  if (vendor.seriesMode === 'label') {
    const label = text(entry.series);
    series = label ? seriesId(label) : 'other';
    if (label) {
      if (!seriesLabels.has(series)) {
        seriesLabels.set(series, { label, maker: vendor.id });
      }
    } else {
      note(`${file} / ${id}: 没有作品名，归入「其他」`);
    }
  } else {
    const raw = text(entry.series);
    series = raw.toLowerCase();
    if (!series) {
      /* 事实文件里没给作品名——留给后面的规则补齐 */
      series = 'other';
    } else if (vendor.series.has(series)) {
      /* 人工整理过的固定 id，原样用 */
    } else if (series === 'other') {
      /* 留给后面的规则补齐（机体编号、主题名、作品关键词） */
    } else {
      /*
       * 固定表里没有、又不是「其他」——那是万代非高达产品线的作品名
       * （Fate/stay night、宝可梦、机战佣兵VI 境界天火…）。这些是开放词表，
       * 与寿屋、良笑一样为它们生成稳定 id，写进作品线目录。
       */
      series = seriesId(raw);
      if (!seriesLabels.has(series)) {
        seriesLabels.set(series, { label: raw, maker: vendor.id });
      }
    }
  }

  let channel = text(entry.channel).toLowerCase();
  if (!vendor.channels.has(channel)) {
    note(`${file} / ${id}: 渠道「${entry.channel}」不在约定范围内，归入「一般销售」`);
    channel = 'general';
  }

  let released = text(entry.released);
  if (!/^\d{4}/.test(released)) {
    /* 只有「填了却解析不出来」才需要人管；本来就没填的不算问题 */
    if (released) {
      note(`${file} / ${id}: 发售日期「${released}」无法解析，已清空`);
    }
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
  /* 事实文件里直接给的主题与别名（寿屋、良笑、魔动核的条目都是这样） */
  const subject = optionalText(entry.subject);
  const subjectKind = subject
    ? text(entry.subjectKind) || vendor.subjectKind || null
    : null;
  const aliases = Array.isArray(entry.aliases)
    ? entry.aliases.map((a) => text(a)).filter(Boolean).slice(0, 10)
    : [];

  const source = optionalText(entry.source);
  /* 原始记录里的 image 官方 CDN 上的图片地址；本地路径由图片清单挂上。
     少数来源（PB 目录）直接把下载好的本地图路径写在这里，站点路径以
     /gundam/ 开头，认出它就不必再走一遍下载。 */
  const rawImage = optionalText(entry.image);
  const localImage = rawImage?.startsWith('/gundam/') ? rawImage : null;
  const imageUrl = localImage ? null : rawImage || optionalText(entry.imageUrl);

  /* 良笑：把商城那边的现状挂上来（在售状态、现价、限定标签） */
  const sale =
    vendor.id === 'goodsmile'
      ? (() => {
          const hit = matchMall(MALL_INDEX, name, price ?? undefined);
          return saleOverlay(hit ? hit.mall : null, hit ? hit.how : '');
        })()
      : {
          saleStatus: null,
          saleStatusText: '',
          salePriceJpy: 0,
          saleLabels: [],
          saleUrl: null,
          saleCode: '',
          saleNote: '',
          saleMatch: '',
          salePreorderFrom: '',
          salePreorderTo: '',
        };

  return {
    id,
    name,
    nameJa: text(entry.nameJa),
    maker: vendor.id,
    category,
    series,
    scale: text(entry.scale) || vendor.defaultScale[CATEGORY_LABEL[category]] || '',
    released,
    priceJpy: price !== null && price >= 0 ? price : 0,
    priceCny: numberOrNull(entry.priceCny) ?? 0,
    channel,
    skillLevel: skill !== null && skill >= 1 && skill <= 5 ? skill : null,
    parts,
    heightMm: height,
    material: optionalText(entry.material),
    tags,
    note: text(entry.note),
    subject,
    subjectKind,
    aliases,
    verified: entry.verified === true && source !== null,
    source,
    image: localImage,
    imageUrl,
    taxRate: Number.isFinite(entry.taxRate) ? entry.taxRate : null,
    sourceJp: optionalText(entry.sourceJp),
    units: Array.isArray(entry.units) && entry.units.length ? entry.units : undefined,
    ...sale,
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
    category: keep.category,
    maker: keep.maker || other.maker,
    subject: keep.subject ?? other.subject,
    subjectId: keep.subjectId ?? other.subjectId,
    subjectKind: keep.subjectKind ?? other.subjectKind,
    series: keep.series !== 'other' ? keep.series : other.series,
    scale: keep.scale || other.scale,
    released: keep.released || other.released,
    priceJpy: keep.priceJpy || other.priceJpy,
    priceCny: keep.priceCny || other.priceCny,
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
    units: keep.units ?? other.units,
    saleStatus: keep.saleStatus ?? other.saleStatus,
    saleStatusText: keep.saleStatusText || other.saleStatusText,
    salePriceJpy: keep.salePriceJpy || other.salePriceJpy,
    saleLabels: keep.saleLabels.length ? keep.saleLabels : other.saleLabels,
    saleUrl: keep.saleUrl ?? other.saleUrl,
    saleCode: keep.saleCode || other.saleCode,
    saleNote: keep.saleNote || other.saleNote,
    saleMatch: keep.saleMatch || other.saleMatch,
    salePreorderFrom: keep.salePreorderFrom || other.salePreorderFrom,
    salePreorderTo: keep.salePreorderTo || other.salePreorderTo,
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

for (const vendor of VENDORS) {
  for (const file of vendor.sources) {
  for (const { entry } of readSource(file)) {
    read++;
    const kit = normalise(entry, file, vendor);
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
 * 精确发售日的叠加层。
 *
 * 列表页给的发售时间常常只到月，精确到日的那天在商品详情页的规格表里。
 * scripts/backfill-gundam-release-dates.mjs 抓回来写在这里，合并时优先采用
 * ——比事实文件里的「只到月」更精确。
 */
const dateOverlay = readJsonArray('src/data/gundam.kits.dates.json');
let withPreciseDate = 0;
if (dateOverlay.length) {
  const byId = new Map(dateOverlay.map((e) => [e.id, e]));
  for (const kit of kits) {
    const d = byId.get(kit.id);
    if (!d || !d.released) continue;
    if ((kit.released || '').length >= 10) continue;
    /* 只补同日或同月的——月份对不上的说明是另一款，不能乱补 */
    if (kit.released && kit.released.slice(0, 7) !== d.released.slice(0, 7)) continue;
    kit.released = d.released;
    withPreciseDate++;
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

/*
 * 主题维度。
 *
 * 同一个主题常有多个等级与多种配色——「RX-78-2 高达」既有 RG 也有 MG；
 * 手办那边则是同一个人物的手办与 Nendoroid。主题是「这条产品是关于谁的」：
 * 塑料模型是机体，手办是角色。
 *
 * 于是：
 *   - 每条记录多一个 subject 字段，详情页能列出「这个主题的其它版本」；
 *   - 同一主题的其它条目如果已经归在某条作品线里，本条跟着归，
 *     作品线不再只靠官网那 40 条分类反查。
 */
const subjectMeta = readJsonObject('src/data/models.subject-meta.json');
const subjectGroups = new Map();
for (const kit of kits) {
  const vendor = VENDORS.find((v) => v.id === kit.maker);
  /* 事实文件里直接给了主题就用它；万代那边靠规则从品名里归一 */
  const subject =
    text(kit.subject) ||
    (vendor?.subjectKind === 'mech' ? subjectOf(kit.name, CATEGORY_LABEL[kit.category] || '') : '');
  kit.subject = subject || null;
  kit.subjectId = null;
  kit.subjectKind = subject ? kit.subjectKind || vendor?.subjectKind || null : null;
  if (!subject) continue;
  const key = subjectKeyFor(kit.maker, subject);
  if (!subjectGroups.has(key)) subjectGroups.set(key, { labels: new Map(), items: [] });
  const group = subjectGroups.get(key);
  group.labels.set(subject, (group.labels.get(subject) ?? 0) + 1);
  group.items.push(kit);
  kit.subjectId = key;
}

/*
 * 同一台机体可能有几种写法（「RX-78-2 高达」与「RX-78-2高达」），
 * 归一后撞进同一个键。取出现最多的那种写法当规范名，条数相同时取短的。
 */
for (const group of subjectGroups.values()) {
  group.label = [...group.labels.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].length - b[0].length,
  )[0][0];
  /* 每条记录都改用规范名，界面上不会出现同一主题两种写法 */
  for (const item of group.items) item.subject = group.label;
}

/* 别名词典按主题的所有写法一起查，避免换了个写法就查不到 */
const subjectMetaById = {};
for (const [key, group] of subjectGroups) {
  const merged = { en: null, alt: [] };
  for (const label of group.labels.keys()) {
    const meta = subjectMeta[label];
    if (!meta) continue;
    if (meta.en && !merged.en) merged.en = meta.en;
    for (const a of meta.alt || []) if (!merged.alt.includes(a)) merged.alt.push(a);
  }
  subjectMetaById[key] = merged;
}

let seriesInherited = 0;
for (const group of subjectGroups.values()) {
  /* 只有当同一主题的其它条目全都指向同一条作品线时才继承，否则宁可不归 */
  const known = new Set(group.items.map((i) => i.series).filter((s) => s && s !== 'other'));
  if (known.size !== 1) continue;
  const [series] = known;
  for (const item of group.items) {
    if (item.series === 'other') {
      item.series = series;
      seriesInherited++;
    }
  }
}

/* 别名：机体编号 + 词典里的英文名与俗称 */
const DESIGNATION = /[A-Z]{1,5}-?\d{1,4}(?:-[A-Z]?\d{1,3})?[A-Z]?/g;

/*
 * 作品线归类规则。
 *
 * 官网的作品分类页只维护 40 条分类，库里有近 500 条落进「其他作品」——这些
 * 产品的整条产品线都没被官网归过类，机器没法从别处反推。规则是人工整理的
 * （src/data/gundam.series-rules.json），可逐条审阅。
 *
 * 官网已经给了作品线的条目不动——这里只填「其他作品」的洞。
 */
const seriesRules = readJsonObject('src/data/models.series-rules.json');
const NON_GUNDAM_KEYWORDS = seriesRules.nonGundam.keywords;
const SERIES_KEYWORDS = Object.entries(seriesRules.byKeyword);

/** 查表用的机体编号：字母 + 连字符 + 数字（可带尾部字母数字） */
const RULE_DESIGNATION = /\b([A-Z]{1,5}-\d{1,4}[A-Z]?\d?(?:-[A-Z]?\d{1,3})?)\b/g;

/** 机体编号归一：去掉连字符与空格，便于查表 */
function desigKey(d) {
  return d.replace(/[\s-]/g, '').toUpperCase();
}

let seriesByRule = 0;
let seriesNonGundam = 0;
for (const kit of kits) {
  /* 规则表是照着万代的作品分类整理的，别家不适用 */
  if (kit.maker !== 'bandai') continue;
  if (kit.series !== 'other') continue;

  /* 1. 是不是别的 IP（Macross、EVA、奥特曼…）——中文站把它们和高达放在同一目录 */
  if (NON_GUNDAM_KEYWORDS.some((kw) => kit.name.includes(kw))) {
    kit.series = 'non-gundam';
    seriesNonGundam++;
    continue;
  }

  /* 2. 机体编号——不会歧义，最可靠。
        查表用专门的正则：字母后必须带连字符，尾部的数字与字母一起吃掉，
        否则「MS-07B3 老虎特装型」会被截成「MS-07B」（格鲁古古），把老虎
        归到 0080 去。 */
  let hit = null;
  for (const d of kit.name.match(RULE_DESIGNATION) || []) {
    const key = desigKey(d);
    if (seriesRules.byDesignation[key]) {
      hit = seriesRules.byDesignation[key];
      break;
    }
  }
  if (hit) {
    kit.series = hit;
    seriesByRule++;
    continue;
  }

  /* 3. 主题名 */
  if (kit.subject && seriesRules.bySubject[kit.subject]) {
    kit.series = seriesRules.bySubject[kit.subject];
    seriesByRule++;
    continue;
  }

  /* 4. 品名关键词（产品线名） */
  for (const [kw, sid] of SERIES_KEYWORDS) {
    if (kit.name.includes(kw)) {
      kit.series = sid;
      seriesByRule++;
      break;
    }
  }
}

/* 别名：事实文件里给的别名 + 万代的机体编号 + 词典里的英文名与俗称 */
for (const kit of kits) {
  const alt = new Set(kit.aliases || []);
  /* 机体编号是万代那边的写法，别的厂商不适用 */
  if (kit.maker === 'bandai') {
    for (const m of kit.name.match(DESIGNATION) || []) {
      if (m.length >= 3) alt.add(m);
    }
  }
  if (kit.subjectId) {
    const meta = subjectMetaById[kit.subjectId];
    if (meta) {
      if (meta.en) alt.add(meta.en);
      for (const a of meta.alt || []) alt.add(a);
    }
  }
  kit.aliases = [...alt].slice(0, 10);
}

/* 主题索引：给聚合页与导出用 */
const subjectIndex = {};
for (const [key, group] of subjectGroups) {
  const meta = subjectMetaById[key];
  const categories = {};
  for (const item of group.items) categories[item.category] = (categories[item.category] || 0) + 1;
  subjectIndex[key] = {
    label: group.label,
    en: meta.en || null,
    alt: meta.alt || [],
    count: group.items.length,
    categories,
    series: [...new Set(group.items.map((i) => i.series))],
    kits: group.items.map((i) => i.id),
  };
}
writeFileSync(
  join(ROOT, SUBJECTS_FILE),
  JSON.stringify(subjectIndex, null, 2).replace(/\n/g, '\r\n') + '\r\n',
  'utf8',
);

/*
 * 作品线目录。
 *
 * 万代与魔动核的作品线是人工整理的固定表，写在 src/data/models.ts 里；
 * 寿屋与良笑的作品名来自各自的官网，是开放词表，这里为它们生成一份目录：
 * id、作品名、配色与条目数。页面读这份目录来渲染作品线页。
 */
const seriesCatalog = [...seriesLabels.entries()]
  .map(([id, info]) => {
    const count = kits.filter((k) => k.series === id).length;
    return {
      id,
      maker: info.maker,
      label: info.label,
      short: info.label.length > 12 ? `${info.label.slice(0, 11)}…` : info.label,
      palette: seriesPalette(id),
      count,
    };
  })
  .filter((s) => s.count > 0)
  .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-Hans-CN'));

writeFileSync(
  join(ROOT, SERIES_FILE),
  JSON.stringify(seriesCatalog, null, 2).replace(/\n/g, '\r\n') + '\r\n',
  'utf8',
);

const banner = `/* 本文件由 scripts/build-models-data.mjs 生成，请勿手工编辑。
 * 原始记录见各厂商的事实文件，改动请改原始记录后重新运行脚本。 */
import type { ModelProduct } from './models';

export const MODEL_KITS: ModelProduct[] = ${JSON.stringify(kits, null, 2)};
`;

writeFileSync(join(ROOT, OUT_FILE), banner, 'utf8');

const withPrice = kits.filter((k) => k.priceJpy > 0).length;
const verified = kits.filter((k) => k.verified).length;
const withAlias = kits.filter((k) => k.aliases.length > 0).length;
const multiVersion = [...subjectGroups.values()].filter((g) => g.items.length > 1).length;

console.log(`读到 ${read} 条记录，丢弃 ${dropped} 条重复或不合规的记录`);
console.log(
  `合并后 ${kits.length} 条，其中 ${verified} 条已核实出处，${withPrice} 条有官方定价，${withImage} 条有本地图片`,
);
if (withJp) console.log(`其中 ${withJp} 条已用万代日本官网的数据校准（日文名、含税定价与税目）`);
const stillOther = kits.filter((k) => k.series === "other").length;
const nonGundam = kits.filter((k) => k.series === "non-gundam").length;
console.log(
  `主题 ${subjectGroups.size} 个，其中 ${multiVersion} 个有多个版本；靠同主题继承作品线 ${seriesInherited} 条；${withAlias} 条带别名`,
);
console.log(
  `作品线：规则补齐 ${seriesByRule} 条，标为非高达作品 ${seriesNonGundam} 条，仍待考 ${stillOther} 条`,
);
console.log(`精确发售日补齐 ${withPreciseDate} 条`);
if (problems.length) {
  console.log('\n需要人工确认的问题：');
  for (const p of problems) console.log(`  - ${p}`);
}
const byMaker = new Map();
for (const k of kits) byMaker.set(k.maker, (byMaker.get(k.maker) || 0) + 1);
console.log('厂商分布：', [...byMaker].map(([k, v]) => `${k}=${v}`).join(' / '));
console.log(`开放词表作品线 ${seriesCatalog.length} 条`);
console.log(`\n已写入 ${OUT_FILE}`);
console.log(`已写入 ${SUBJECTS_FILE}`);
console.log(`已写入 ${SERIES_FILE}`);
