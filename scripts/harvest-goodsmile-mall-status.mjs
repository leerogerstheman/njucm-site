#!/usr/bin/env node
/**
 * 良笑商城商品状态采集
 * ---------------------------------------------------------------------------
 * 分类列表接口给出的卡片上有价格与限定标签，但**没有「现在买不买得到」**：
 * 卡片上的「開放預購中」只说明正在开放预购，在售与售罄要在商品详情页上看。
 *
 * 详情页上有三处能判断状态：
 *   <p class="c-text-body b-product-info__status "><em>開放預購中</em> 預購期間：…</p>
 *   <p class="c-text-body b-product-info__note">2027年07月発送予定・お1人様3点まで</p>
 *   订购按钮的文字（立即預購／立即購買／没有按钮＝已结束）
 *
 * 抓哪些：资料库里对得上商城的那批商品，加上商城上正在开放预购的新品。
 * 没对上的商城商品不在库里，没有地方显示它们的状态。
 *
 * 详情页整页 200KB 上下，页头页脚占了大半。这里只把需要的那几个字段抠出来
 * 存成小 JSON，不留整页 HTML，免得缓存把磁盘撑满。
 *
 * 用法：node scripts/harvest-goodsmile-mall-status.mjs [--limit N]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildMallIndex, matchMall, parsePreorderWindow, saleStatusOf } from './lib/mall.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://www.goodsmile.com';
const LOCALE = 'zh';
const CACHE_DIR = join(ROOT, '.cache', 'gscmall-status');
const OUT_FILE = 'src/data/models.kits.goodsmile-mall-status.json';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const DELAY = 500;
/** 同时最多开几个连接 */
const CONCURRENCY = 3;
/** 一次并发里最多连着取多少个，免得一直压在人家服务器上 */
const BATCH = 90;

const limitArg = process.argv.indexOf('--limit');
const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url) {
  let backoff = 3_000;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'zh-TW,zh;q=0.9',
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

/** 从 HTML 里剥出纯文本 */
function textOf(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function all(re, html) {
  return [...html.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`))].map(
    (m) => m[1],
  );
}

/**
 * 抠出状态相关的字段。
 *
 * 繁中站的说法：
 *   開放預購中            正在开放预购
 *   預購截止              预购窗口已关闭
 *   完売／售罄            卖光了
 *   沒有狀態文字又沒有訂購按鈕  这一件已经下架（商城还留着页面与价格）
 */
function parseDetail(html) {
  const title = textOf(all(/<h1[^>]*id="product-name"[^>]*>([\s\S]{0,200}?)<\/h1>/, html)[0] || '');
  const priceRaw = all(/c-price__main">([^<]*)</, html)[0] || '';
  const priceJpy = Number(priceRaw.replace(/[^\d]/g, '')) || 0;

  const statusRaw = textOf(all(/b-product-info__status[^>]*>([\s\S]{0,400}?)<\/p>/, html)[0] || '');
  const note = textOf(all(/b-product-info__note[^>]*>([\s\S]{0,400}?)<\/p>/, html)[0] || '');
  const labels = all(/<li class="c-label[^"]*"[^>]*>([\s\S]{0,100}?)<\/li>/, html)
    .map(textOf)
    .filter(Boolean);
  const buttons = all(/c-button__body">\s*([^<]{2,24}?)\s*<\/span>/, html).map(textOf);

  /* 订购按钮：立即預購／立即購買＝还能下单；没有这一档＝已经结束 */
  const orderBtn = buttons.find((b) => /預購|購買|订购|注文|購入|予約/.test(b)) || '';

  const status = saleStatusOf(statusRaw, orderBtn, priceJpy);

  /* 预约期间：2026年09月25日〜至 (JST)2026年11月04日 */
  const period = parsePreorderWindow(statusRaw);

  /* 预定寄送月：2027年07月發售・每人限購3個 */
  const ship = /(\d{4})年(\d{1,2})月/.exec(note);

  /* 作品名：页头那枚 hashtag 按钮，指向 search_title=<作品 id> */
  const works = textOf(
    all(/<a[^>]+href="[^"]*search_title=\d+"[^>]*>([\s\S]{0,120}?)<\/a>/, html)[0] || '',
  );

  /* 商品图：详情页第一张产品图 */
  const img = all(/\/gsc-webrevo-sdk-storage-prd\/product\/image\/([^"']+?\.(?:jpg|jpeg|png|webp))/, html)[0] || '';

  /* 商品規格：塑膠製塗裝完成品・1/7比例模型・附專用台座・全高：約260mm */
  const spec = textOf(
    all(
      /<dt[^>]*>\s*<h3[^>]*>\s*規格\s*<\/h3>\s*<\/dt>\s*<dd[^>]*>([\s\S]{0,600}?)<\/dd>/,
      html,
    )[0] || '',
  );

  return {
    title,
    priceJpy,
    status,
    statusText: statusRaw,
    orderButton: orderBtn,
    note,
    spec,
    labels: labels.filter((l) => !/^[A-Z]{0,2}-?\d+[a-z]?$/.test(l)),
    preorderFrom: period.from,
    preorderTo: period.to,
    shipMonth: ship ? `${ship[1]}-${ship[2].padStart(2, '0')}` : '',
    works,
    imageUrl: img ? `${ORIGIN}/gsc-webrevo-sdk-storage-prd/product/image/${img}` : '',
  };
}

/* -------------------------------------------------------------------------- */

function readJson(rel) {
  try {
    return JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
  } catch {
    return [];
  }
}

const mall = readJson('src/data/models.kits.goodsmile-mall.json');
const info = readJson('src/data/models.kits.goodsmile.json');
if (!mall.length) {
  console.error('先跑 scripts/harvest-goodsmile-mall.mjs 生成商城清单');
  process.exit(1);
}

/* 资料库里对得上商城的那批 */
const index = buildMallIndex(mall);
const wanted = new Set();
for (const r of info) {
  const hit = matchMall(index, r.name, r.priceJpy);
  if (hit) wanted.add(String(hit.mall.mallId));
}

/* 再加上商城上正在开放预购的新品（资料库里还没有的） */
const preorderMall = mall.filter((m) => (m.labels || []).some((l) => /開放預購中/.test(l)));
for (const m of preorderMall) wanted.add(String(m.mallId));

const targets = mall.filter((m) => wanted.has(String(m.mallId))).slice(0, limit);
console.log(`资料库对上 ${wanted.size} 件，取详情 ${targets.length} 件（${LOCALE} 站）`);

const results = [];
let done = 0;
let failed = 0;

for (let i = 0; i < targets.length; i += BATCH) {
  const batch = targets.slice(i, i + BATCH);
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async (_, k) => {
      for (let j = k; j < batch.length; j += CONCURRENCY) {
        const m = batch[j];
        const file = join(CACHE_DIR, `${LOCALE}_${m.mallId}.json`);
        let rec;
        if (existsSync(file)) {
          rec = JSON.parse(readFileSync(file, 'utf8'));
          /* 判定规则改过之后不必重抓：状态在这里按新规则重算一遍 */
          rec.status = saleStatusOf(rec.statusText, rec.orderButton, rec.priceJpy);
          /* 核对日期 = 缓存文件写下的那天，也就是真正抓到这一页的那天 */
          if (!rec.checked) rec.checked = statSync(file).mtime.toISOString().slice(0, 10);
        } else {
          const html = await fetchText(`${ORIGIN}/${LOCALE}/product/${m.mallId}`);
          if (!html) {
            failed++;
            continue;
          }
          rec = { mallId: m.mallId, locale: LOCALE, ...parseDetail(html) };
          rec.checked = new Date().toISOString().slice(0, 10);
          writeFileSync(file, JSON.stringify(rec), 'utf8');
          await sleep(DELAY);
        }
        results.push(rec);
        done++;
      }
    }),
  );
  console.log(`  ${done}/${targets.length}（失败 ${failed}）`);
  /* 每批写一次盘：跑得久，中途被打断也不会丢掉已经抓到的结果 */
  results.sort((a, b) => String(a.mallId).localeCompare(String(b.mallId), 'en'));
  writeFileSync(join(ROOT, OUT_FILE), JSON.stringify(results, null, 2) + '\n', 'utf8');
}

results.sort((a, b) => String(a.mallId).localeCompare(String(b.mallId), 'en'));
writeFileSync(join(ROOT, OUT_FILE), JSON.stringify(results, null, 2) + '\n', 'utf8');

const counts = new Map();
for (const r of results) counts.set(r.status, (counts.get(r.status) || 0) + 1);
console.log(`\n共 ${results.length} 条，写出 ${OUT_FILE}（失败 ${failed}）`);
for (const [s, c] of [...counts.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${s}: ${c}`);
