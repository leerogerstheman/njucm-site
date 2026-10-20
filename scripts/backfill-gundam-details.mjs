#!/usr/bin/env node
/**
 * 补齐目录条目里缺失的字段。
 *
 * 列表页的商品卡只给出名称、图、价与部分品类的发售月份；发售日期的「日」、
 * 限定渠道商品的日元定价、零件数与材质，都只在商品详情页上。
 * 抓取器把整份目录跑完之后，用这个脚本把缺的那部分补上。
 *
 * 只访问「确实缺字段」的条目，所以请求量很小。源站限流时会自动退避。
 *
 * 用法：node scripts/backfill-gundam-details.mjs [--limit N]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = 'src/data/gundam.kits.catalog.json';
const ORIGIN = 'https://www.bandaihobbysite.cn';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const DELAY = 700;
const MAX_BACKOFF = 300_000;

const limitArg = process.argv.indexOf('--limit');
const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;

const catalog = JSON.parse(readFileSync(join(ROOT, CATALOG), 'utf8'));

/**
 * 只处理确实缺东西的条目。
 *
 * 判据只认「列表页本来就给得出、但这条恰好没解析到」的两个字段：发售日期
 * 与日元定价。拼装难度与全高在万代的规格表里并不存在，拿它们当条件会让
 * 每一条都进队列，等于把全库重抓一遍。
 */
const todo = catalog.filter((k) => !k.released || !k.priceJpy).slice(0, limit);

console.log(`需要补字段的条目：${todo.length} / ${catalog.length}`);

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

/**
 * 商品详情页的规格表是一串 dt/dd：
 *
 *   <dt …><span class="pg-products__labelInner">发售日期</span></dt>
 *   <dd class="pg-products__labelTxt">2026年4月</dd>
 *
 * 「日本地区建议零售价」也在同一张表里；限定品没有这一行——万代对它们
 * 只公布人民币零售价，所以那些条目最终仍然没有日元定价，这是事实而非缺漏。
 */
const SPEC =
  /<dt class="pg-products__label">[\s\S]{0,200}?<span class="pg-products__labelInner">([^<]*)<\/span>[\s\S]{0,200}?<\/dt>\s*<dd class="pg-products__labelTxt">([\s\S]*?)<\/dd>/g;

function specTable(html) {
  const out = new Map();
  let m;
  SPEC.lastIndex = 0;
  while ((m = SPEC.exec(html))) {
    const key = m[1].trim();
    const value = m[2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (key && !out.has(key)) out.set(key, value);
  }
  return out;
}

/**
 * 规格表里的日期写法是「2026年4月」或「2026年4月24日」。
 */
function dateAfter(spec, labels) {
  for (const label of labels) {
    const value = spec.get(label);
    if (!value) continue;
    const m = /(\d{4})\s*年\s*(\d{1,2})\s*月(?:\s*(\d{1,2})\s*日)?/.exec(value);
    if (m) {
      return {
        year: m[1],
        month: String(m[2]).padStart(2, '0'),
        day: m[3] ? String(m[3]).padStart(2, '0') : null,
      };
    }
  }
  return null;
}

let done = 0;
let changed = 0;

for (const kit of todo) {
  const html = await fetchPage(kit.source);
  const spec = specTable(html);

  if (!kit.released) {
    const d = dateAfter(spec, ['发售日期', '预定发售月份', '预定发售日', '発売時期']);
    if (d) {
      kit.released = `${d.year}-${d.month}${d.day ? '-' + d.day : ''}`;
      changed++;
    }
  }

  if (!kit.priceJpy) {
    const raw = spec.get('日本地区建议零售价') || '';
    const m = /([\d,]+)\s*日元/.exec(raw);
    if (m) {
      kit.priceJpy = Number(m[1].replace(/,/g, ''));
      changed++;
    }
  }

  if (!kit.skillLevel) {
    const raw = spec.get('拼装难度') || spec.get('Skill Level') || '';
    const m = /([1-5])/.exec(raw);
    if (m) {
      kit.skillLevel = Number(m[1]);
      changed++;
    }
  }

  if (!kit.heightMm) {
    const raw = spec.get('全高') || spec.get('尺寸') || '';
    const m = /([\d.]+)\s*(?:mm|毫米)/i.exec(raw);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n)) kit.heightMm = n;
    }
  }

  done++;
  if (done % 25 === 0 || done === todo.length) {
    process.stdout.write(`\r  ${done}/${todo.length}  补上 ${changed} 个字段        `);
  }
  await new Promise((r) => setTimeout(r, DELAY));
}

process.stdout.write('\n');
writeFileSync(join(ROOT, CATALOG), JSON.stringify(catalog, null, 2).replace(/\n/g, '\r\n') + '\r\n', 'utf8');
console.log(`补齐 ${changed} 个字段，写回 ${CATALOG}`);
