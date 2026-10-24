#!/usr/bin/env node
/**
 * 良笑官方日文商品页采集
 * ---------------------------------------------------------------------------
 * 良笑的条目 id 就是官网商品号（goodsmile-10000 ↔ /product/10000/），
 * 所以官网日文页可以按 id 精确对上——不需要任何模糊匹配。
 *
 * 日文页给的是：官方日文品名、含税定价、発売時期（YYYY年MM月）、比例、
 * 分类（スケールフィギュア/ねんどろいど/figma…）。
 *
 * 该站没有 robots.txt（404），所以没有抓取限制；脚本仍然限速 + 指数退避，
 * 并且把原始 HTML 缓存在 .cache/gs-jp/ 下，断点续跑不用重下。
 *
 * 用法：
 *   node scripts/harvest-goodsmile-jp.mjs [--limit N] [--probe N] [--concurrency N]
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const CACHE_DIR = join(ROOT, '.cache', 'gs-jp');
const OUT = join(ROOT, 'src', 'data', 'models.kits.goodsmile-jp.json');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const argv = process.argv.slice(2);
const argOf = (flag, dflt) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : dflt;
};
const LIMIT = argOf('--limit', 0);
const PROBE = argOf('--probe', 0);
const CONCURRENCY = Math.max(1, argOf('--concurrency', 4));
const DELAY_MS = 400;

mkdirSync(CACHE_DIR, { recursive: true });

function loadAny(path) {
  const j = JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
  if (Array.isArray(j)) return j;
  const arr = Object.values(j).find((v) => Array.isArray(v) && v.length && typeof v[0] === 'object');
  return arr || [];
}

/* 良笑的全部条目 id —— 商城预购那批也在里面 */
const ids = new Set();
for (const path of ['src/data/models.kits.goodsmile.json', 'src/data/models.kits.goodsmile-preorder.json']) {
  for (const e of loadAny(path)) {
    const m = /^goodsmile-(\d+)$/.exec(e.id || '');
    if (m) ids.add(m[1]);
  }
}
const list = [...ids].sort((a, b) => Number(a) - Number(b));
console.log(`良笑条目 id：${list.length} 个`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function strip(html) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h\d|td|dd|dt)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\u00a0]+/g, ' ')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\n');
}

/** 取 <dt>标签</dt><dd>值</dd> 这类规格表里的某一项 */
function dtValue(html, label) {
  const re = new RegExp(`<dt[^>]*>\\s*${label}\\s*</dt>\\s*<dd[^>]*>([\\s\\S]{0,600}?)</dd>`, 'i');
  const m = html.match(re);
  if (!m) return '';
  return decodeEntities(m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function parse(num, html) {
  const h1 = (html.match(/<h1[^>]*itemprop="name"[^>]*>([\s\S]{0,300}?)<\/h1>/i) || [])[1] ||
    (html.match(/<h1[^>]*>([\s\S]{0,300}?)<\/h1>/i) || [])[1] || '';
  const nameJa = decodeEntities(h1.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());

  /* 価格：官网写的是含税价（円（税込））。千分位逗号被编码成 &#44;，要先还原 */
  let priceJpy = 0;
  const pm = dtValue(html, '価格').match(/([\d,]+)\s*円/);
  if (pm) priceJpy = Number(pm[1].replace(/,/g, '')) || 0;

  /* 販売価格：税抜价 */
  let priceBase = 0;
  const bm = dtValue(html, '販売価格').match(/([\d,]+)\s*円/);
  if (bm) priceBase = Number(bm[1].replace(/,/g, '')) || 0;

  /* 発売時期：<dd itemprop="releaseDate">YYYY/MM</dd> */
  let released = '';
  const rm = html.match(/itemprop="releaseDate"[^>]*>\s*(\d{4})\s*\/\s*(\d{1,2})/i);
  if (rm) released = `${rm[1]}-${String(Number(rm[2])).padStart(2, '0')}`;

  /* カテゴリー：官网自己写的分类，里面常常带比例（1/8スケールフィギュア…） */
  const categoryRaw = dtValue(html, 'カテゴリー');
  let scale = '';
  const sm = categoryRaw.match(/(\d+\s*\/\s*\d+)/);
  if (sm) scale = sm[1].replace(/\s+/g, '');

  const spec = dtValue(html, '仕様');
  const sculptor = dtValue(html, '原型制作');
  const maker = dtValue(html, '発売元');
  const reissue = dtValue(html, '再販');

  const og = (html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i) || [])[1] || '';

  return {
    id: `goodsmile-${num}`,
    nameJa: nameJa || '',
    priceJpy,
    priceBase,
    released,
    scale,
    categoryRaw,
    spec,
    sculptor,
    maker,
    reissue,
    sourceJp: `https://www.goodsmile.info/ja/product/${num}/`,
    imageUrl: og || '',
  };
}

async function fetchOne(num, attempt = 0) {
  const cache = join(CACHE_DIR, `${num}.html`);
  if (existsSync(cache)) return { num, html: readFileSync(cache, 'utf8'), cached: true };
  const url = `https://www.goodsmile.info/ja/product/${num}/`;
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'ja' } });
    if (res.status === 404) {
      writeFileSync(cache, '');
      return { num, html: '', missing: true };
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    writeFileSync(cache, html);
    return { num, html };
  } catch (err) {
    if (attempt < 3) {
      await sleep(1200 * 2 ** attempt);
      return fetchOne(num, attempt + 1);
    }
    return { num, html: '', error: String(err.message || err) };
  }
}

const out = [];
let done = 0;
let cursor = 0;

async function worker() {
  while (cursor < list.length) {
    const num = list[cursor++];
    if (LIMIT && done >= LIMIT) return;
    const r = await fetchOne(num);
    done++;
    if (r.missing || r.error) {
      if (r.error) console.error(`  ! ${num} ${r.error}`);
      continue;
    }
    const parsed = parse(num, r.html);
    if (!parsed.nameJa) continue;
    out.push(parsed);
    if (PROBE && out.length <= PROBE) console.log(JSON.stringify(parsed));
    if (done % 200 === 0) console.log(`  …${done}/${list.length}`);
    await sleep(DELAY_MS);
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

out.sort((a, b) => Number(a.id.slice(10)) - Number(b.id.slice(10)));
writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
console.log(`写出 ${out.length} 条 → ${OUT}`);
