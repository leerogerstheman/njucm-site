#!/usr/bin/env node
/**
 * 回填精确发售日
 * ---------------------------------------------------------------------------
 * 列表页给的发售时间常常只到月（「2025-06」），精确到日的那天在商品详情页的
 * 规格表里（键名是「发售日期」或「预定发售月份」）。这一趟只补这一个字段。
 *
 * 输出是一个叠加层 src/data/gundam.kits.dates.json（{ id, released }），
 * 合并脚本会优先采用它——比事实文件里的「只到月」更精确。
 *
 * 抓取对源站是客气的：一次一个请求，中间固定间隔；遇到 405（限流）指数退避，
 * 最多等 5 分钟再试。抓过的页面原样存进 .cache/gundam-details/，可以中断续跑。
 *
 * 用法：node scripts/backfill-gundam-release-dates.mjs [--limit N]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://www.bandaihobbysite.cn';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const DELAY = 700;
const MAX_BACKOFF = 300_000;

const CACHE_DIR = join(ROOT, '.cache/gundam-details');
const OUT_FILE = 'src/data/gundam.kits.dates.json';

/** 与合并脚本同一批事实文件 */
const SOURCES = [
  'src/data/gundam.kits.classic.json',
  'src/data/gundam.kits.recent.json',
  'src/data/gundam.kits.cn.json',
  'src/data/gundam.kits.seed.json',
  'src/data/gundam.kits.pb.json',
  'src/data/gundam.kits.assemble.json',
];

const limitArg = process.argv.indexOf('--limit');
const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;

/** 规格表：<dt>键</dt><dd>值</dd> */
const SPEC = /<dt[^>]*>([\s\S]{0,300}?)<\/dt>\s*<dd[^>]*>([\s\S]{0,400}?)<\/dd>/g;

function readJson(rel) {
  const abs = join(ROOT, rel);
  return existsSync(abs) ? JSON.parse(readFileSync(abs, 'utf8')) : [];
}

function detailId(url) {
  const m = /detail\/id\/(\d+)/.exec(url || '');
  return m ? m[1] : null;
}

/* 汇总事实文件里出现过的条目（同 id 保留字段更全的那条） */
const byId = new Map();
for (const rel of SOURCES) {
  for (const kit of readJson(rel)) {
    if (!kit || !kit.id) continue;
    const prev = byId.get(kit.id);
    if (!prev) byId.set(kit.id, kit);
    else if ((kit.released || '').length > (prev.released || '').length) byId.set(kit.id, kit);
  }
}

/* 只补「只到月」的条目 */
const todo = [];
for (const kit of byId.values()) {
  if (!kit.source) continue;
  if (!/^\d{4}(-\d{2})?$/.test(kit.released || '')) continue;
  const id = detailId(kit.source);
  if (!id) continue;
  todo.push({ id: kit.id, detailId: id, url: kit.source, released: kit.released });
}
todo.sort((a, b) => a.detailId.localeCompare(b.detailId));

const target = todo.slice(0, limit);
console.log(`需要补精确发售日的条目：${target.length} / ${todo.length}`);

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

async function fetchPage(url) {
  let backoff = 5_000;
  for (;;) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          Referer: `${ORIGIN}/`,
        },
      });
      const html = await res.text();
      if (res.status === 405 || html.length < 20000) {
        await new Promise((r) => setTimeout(r, backoff));
        backoff = Math.min(backoff * 2, MAX_BACKOFF);
        continue;
      }
      return html;
    } catch {
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, MAX_BACKOFF);
    }
  }
}

/** 从规格表里取发售日期 */
function parseDate(html) {
  SPEC.lastIndex = 0;
  let m;
  const spec = new Map();
  while ((m = SPEC.exec(html))) {
    const k = m[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const v = m[2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (k && !spec.has(k)) spec.set(k, v);
  }
  for (const label of ['发售日期', '预定发售月份', '预定发售日', '预定发售日时间', '発売時期']) {
    const raw = spec.get(label);
    if (!raw) continue;
    const dm = /(\d{4})\s*年\s*(\d{1,2})\s*月(?:\s*(\d{1,2})\s*日)?/.exec(raw);
    if (!dm) continue;
    const day = dm[3] ? String(Number(dm[3])).padStart(2, '0') : '';
    return `${dm[1]}-${String(Number(dm[2])).padStart(2, '0')}${day ? '-' + day : ''}`;
  }
  return '';
}

const results = [];
let done = 0;
let fromCache = 0;
let failed = 0;

for (const item of target) {
  const cacheFile = join(CACHE_DIR, `detail_${item.detailId}.html`);
  let html = '';
  if (existsSync(cacheFile)) {
    html = readFileSync(cacheFile, 'utf8');
    fromCache++;
  } else {
    html = await fetchPage(item.url);
    writeFileSync(cacheFile, html, 'utf8');
  }

  const released = parseDate(html);
  if (released && released.length === 10) {
    results.push({ id: item.id, released, source: item.url });
  } else {
    failed++;
  }
  done++;
  if (done % 25 === 0) {
    process.stdout.write(
      `\r  ${done}/${target.length}  取到 ${results.length} 条，缓存命中 ${fromCache}，页面无日期 ${failed}   `,
    );
    /* 每 25 条落一次盘，中途被打断也不丢进度 */
    const sofar = new Map(readJson(OUT_FILE).map((e) => [e.id, e]));
    for (const r of results) sofar.set(r.id, r);
    writeFileSync(
      join(ROOT, OUT_FILE),
      JSON.stringify([...sofar.values()].sort((a, b) => a.id.localeCompare(b.id)), null, 2) + '\n',
      'utf8',
    );
  }
  await new Promise((r) => setTimeout(r, DELAY));
}

console.log(`\n\n取到精确发售日 ${results.length} 条（页面里没有日期 ${failed} 条）`);

/* 合并已有的叠加层 */
const prev = readJson(OUT_FILE);
const merged = new Map(prev.map((e) => [e.id, e]));
for (const r of results) merged.set(r.id, r);
const out = [...merged.values()].sort((a, b) => a.id.localeCompare(b.id));

writeFileSync(join(ROOT, OUT_FILE), JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(`写出 ${OUT_FILE}（共 ${out.length} 条）`);
