#!/usr/bin/env node
/**
 * 良笑商城「预约中新品」的事实文件
 * ---------------------------------------------------------------------------
 * 良笑商城上正在开放预购的商品里，有一部分产品资料库里还没有——
 * 它们是刚开预购的新品，或者资料库那套分类页没有收录到的款式。
 *
 * 这一轮把它们单独收成一份事实文件（`models.kits.goodsmile-preorder.json`），
 * 由 scripts/build-models-data.mjs 合并进库：
 *
 *   id        goodsmile-mall-<商城商品 id>
 *   name      商城上的中文品名（去掉【再販】这类角标，角标内容进 tags）
 *   nameJa    商城商品图的 alt——良笑官方日文品名
 *   category  按品名的产品线前缀判定（与资料库那套分类口径一致）
 *   series    商城详情页页头那枚作品名徽章（「勝利女神：妮姬」这种）
 *   released  商城详情页写的预定寄送月
 *   priceJpy  商城现价
 *   source    商城商品页
 *
 * 已经收进资料库的那些不在这里重复出现——重复条目是这个库里最该避免的事。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildMallIndex, matchMall } from './lib/mall.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = 'src/data/models.kits.goodsmile-preorder.json';

function readJson(rel) {
  try {
    return JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
  } catch {
    return [];
  }
}

/**
 * 品名的产品线前缀 → 品类。
 *
 * 口径跟资料库那套一致：黏土人、黏土娃、黏土人配件系列都算黏土人那条线；
 * 比例手办、figma、PLAMATEA、MODEROID、PIXEL 各自一条；
 * POP UP PARADE、PLAMAX 这类归到「良笑其它」。
 */
const LINE_PREFIX =
  /^(figmaPLUS|figma|figFIX|ex:ride|坐吧黏土人|巨大黏土人|驚喜黏土人|小黏土人|黏土人Plus|黏土人配件系列|黏土人配件|黏土人|黏土娃|比例手辦|1\/7比例模型|1\/8比例模型|比例模型|企鵝|PIXEL|MODEROID|PLAMATEA|STICKY FIGURE|STICKY|POP UP PARADE|PLAMAX|MEGAMAX|SSR FIGURE)/i;

const CATEGORY_RULES = [
  [/^figma/i, 'figma'],
  [/^(黏土人|黏土娃|坐吧黏土人|巨大黏土人|驚喜黏土人|小黏土人)/, 'nendoroid'],
  [/^(比例手辦|1\/7比例模型|1\/8比例模型|比例模型)/, 'scale'],
  [/^PLAMATEA/i, 'plamatea'],
  [/^MODEROID/i, 'modroid'],
  [/^PIXEL/i, 'pixel'],
  [/^STICKY/i, 'stiky'],
];

/**
 * 品类与比例。
 *
 * 商城详情页的「規格」里写着比例——「塑膠製塗裝完成品・1/7比例模型・附專用台座」，
 * 比从品名猜准得多。品名只在这时候兜底：带产品线前缀的按前缀算，
 * 剩下的（POP UP PARADE、PLAMAX、可動模型这些）归「良笑其它」。
 */
function categoryAndScale(name, spec) {
  const ratio = /(\d+\/\d+)\s*比例模型/.exec(spec || '');
  if (ratio) return { category: 'scale', scale: ratio[1] };
  for (const [re, cat] of CATEGORY_RULES) {
    if (re.test(name)) return { category: cat, scale: '' };
  }
  return { category: 'other', scale: '' };
}

/** 配件与套组没有角色，不进主题维度 */
const ACCESSORY =
  /(配件|套組|零件|台座|底座|支架|替換|武器|素体|body|裝備|底盤|光源|本体only|壓克力|立牌|鑰匙圈|徽章|收納箱|服裝套組|耳環|耳飾|項鍊|項鏈|手鍊|戒指|手機殼|貼紙|書|名片|胸章|杯)/i;

const info = readJson('src/data/models.kits.goodsmile.json');
const mall = readJson('src/data/models.kits.goodsmile-mall.json');
const status = readJson('src/data/models.kits.goodsmile-mall-status.json');

if (!mall.length || !status.length) {
  console.error('先跑 harvest-goodsmile-mall.mjs 与 harvest-goodsmile-mall-status.mjs');
  process.exit(1);
}

const statusById = new Map(status.map((s) => [String(s.mallId), s]));

/* 资料库已经对上的商城商品，不再重复收 */
const index = buildMallIndex(mall);
const matched = new Set();
for (const r of info) {
  const hit = matchMall(index, r.name, r.priceJpy);
  if (hit) matched.add(String(hit.mall.mallId));
}

/* 商城上正在开放预购的 */
const preorder = mall.filter((m) => (m.labels || []).some((l) => /開放預購中/.test(l)));
const fresh = preorder.filter((m) => !matched.has(String(m.mallId)));

const records = [];
let skipped = 0;
for (const m of fresh) {
  const st = statusById.get(String(m.mallId));
  if (!st) {
    skipped++;
    continue;
  }

  const raw = String(m.name || '').trim();
  /* 角标（【再販】这种）是发售批次，不是品名的一部分 */
  const brackets = [...raw.matchAll(/[【\[]([^】\]]+)[】\]]/g)].map((x) => x[1]);
  const name = raw.replace(/[【\[（(][^】\]）)]*[】\]）)]/g, '').trim() || raw;

  /* 作品名：详情页页头那枚徽章 */
  const series = (st.works || '').trim();

  const labels = (m.labels || []).filter((l) => l && !/^開放預購中$/.test(l));
  const tags = [];
  if (m.maker && m.maker !== 'Good Smile Company') tags.push(m.maker);
  tags.push(...brackets, ...labels);

  const bare = name.replace(LINE_PREFIX, '').trim();
  const subject = bare && !ACCESSORY.test(name) ? bare : null;
  const { category, scale } = categoryAndScale(name, st.spec);

  /* 商品图的 alt 是日文品名——但英文名的商品那里写的也是英文，别当日文名收 */
  const jaName = /[぀-ヿ一-鿿]/.test(m.nameJa || '') ? m.nameJa : '';

  records.push({
    id: `goodsmile-mall-${m.mallId}`,
    name,
    nameJa: jaName,
    maker: 'goodsmile',
    category,
    series,
    scale,
    released: st.shipMonth || '',
    priceJpy: m.priceJpy || st.priceJpy || 0,
    priceCny: 0,
    channel: labels.some((l) => /限定/.test(l)) ? 'limited' : 'general',
    subject,
    subjectKind: subject ? 'character' : null,
    aliases: [],
    tags: [...new Set(tags)].slice(0, 6),
    note: st.note || '',
    verified: true,
    source: m.url,
    image: null,
    imageUrl: m.imageUrl || st.imageUrl || null,
    taxRate: null,
    sourceJp: null,
  });
}

records.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
writeFileSync(join(ROOT, OUT_FILE), JSON.stringify(records, null, 2) + '\n', 'utf8');

console.log(`商城開放預購中 ${preorder.length} 件：资料库已有 ${preorder.length - fresh.length} 件，新收 ${records.length} 件（跳过 ${skipped} 件没有详情页的）`);
console.log(`写出 ${OUT_FILE}`);
const noSeries = records.filter((r) => !r.series).length;
console.log(`其中 ${noSeries} 件没拿到作品名（详情页页头没有作品徽章）`);
