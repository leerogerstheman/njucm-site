#!/usr/bin/env node
/**
 * 下载官方商品图，压缩后放进 public/gundam/。
 *
 *   事实层  src/data/gundam.kits.ts        合并后的条目（含官方图片 URL）
 *            │
 *            ▼  本脚本
 *   缓存层  public/gundam/<id>.webp        压缩后的本地图片
 *            public 清单 src/data/gundam.images.json
 *            │
 *            ▼  再跑一次 scripts/build-gundam-data.mjs
 *   渲染层  条目上的 image 字段
 *
 * 为什么下载而不直接引 CDN：
 *   - 万代的 CDN 不保证长期可用，站点不该把可用性押在别人家服务器上；
 *   - 直接引 CDN 会把每次浏览的图片请求都打到对方那里；
 *   - 原图动辄几百 KB，压缩成 480px 的 WebP 之后能小一个数量级。
 *
 * 用法：node scripts/fetch-gundam-images.mjs [--limit N] [--concurrency N] [--force]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KITS_FILE = 'src/data/gundam.kits.ts';
const OUT_DIR = 'public/gundam';
/** public/ 会被整个拷到站点根，所以站内路径要剥掉 public 这一层 */
const URL_PREFIX = '/gundam';
const MANIFEST = 'src/data/gundam.images.json';

/** 卡片与详情页共用的宽度：480px 足够撑满列表卡片，详情页放大也不至于糊 */
const TARGET_WIDTH = 480;
const QUALITY = 78;
const CONCURRENCY = 4;
/** 每个请求之间的间隔。源站对高频访问会直接返回 405，慢一点换稳定。 */
const DELAY = 250;

const args = process.argv.slice(2);
const limitArg = args.indexOf('--limit');
const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity;
const force = args.includes('--force');

/* sharp 是 Astro 的可选依赖，pnpm 会把它装进虚拟 store，直接按名字 import
   未必解析得到，所以先试普通 import，再退回 store 里的实际路径。 */
async function loadSharp() {
  try {
    return (await import('sharp')).default;
  } catch {
    const require = createRequire(import.meta.url);
    try {
      return require('sharp');
    } catch {
      /* 顺着 pnpm 的虚拟 store 找 */
      const { readdirSync } = await import('node:fs');
      const { pathToFileURL } = await import('node:url');
      const store = join(ROOT, 'node_modules', '.pnpm');
      if (!existsSync(store)) throw new Error('找不到 sharp');
      const dir = readdirSync(store).find((d) => d.startsWith('sharp@'));
      if (!dir) throw new Error('找不到 sharp');
      const entry = join(store, dir, 'node_modules', 'sharp', 'lib', 'index.js');
      return (await import(pathToFileURL(entry).href)).default;
    }
  }
}

function readKits() {
  const raw = readFileSync(join(ROOT, KITS_FILE), 'utf8');
  const start = raw.indexOf('= [') + 2;
  return JSON.parse(raw.slice(start, raw.lastIndexOf(']') + 1));
}

async function fetchBuffer(url, asText = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Referer: 'https://www.bandaihobbysite.cn/',
        Accept: asText
          ? 'text/html,application/xhtml+xml'
          : 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
    });
    if (!res.ok) {
      if (res.status === 405) originBlocked = true;
      throw new Error(`HTTP ${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return asText ? buf.toString('utf8') : buf;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 源站被限流时置位：之后不再去打扰详情页，直接标记为无图。
 * 记录本身带 imageUrl 的条目不受影响——图片在 CDN 上，不受源站限流影响。
 */
let originBlocked = false;

async function resolveImageUrl(kit) {
  if (kit.imageUrl) return kit.imageUrl;
  if (originBlocked) return null;
  const source = kit.source || '';
  if (!/bandaihobbysite\.cn/.test(source)) return null;

  const html = await fetchBuffer(source, true);
  const main = html.indexOf('js-swiper__main');
  if (main < 0) return null;
  const slide = /<a[^>]+class="swiper-slide"[^>]+href="([^"]+)"/.exec(html.slice(main, main + 4000));
  if (slide) return slide[1];
  const img = /<img[^>]+src="(https:\/\/staticcdn[^"]+)"/.exec(html.slice(main, main + 4000));
  return img ? img[1] : null;
}

const sharp = await loadSharp();
const kits = readKits();

const wanted = kits.filter((k) => k.imageUrl || /bandaihobbysite\.cn/.test(k.source || '')).slice(0, limit);
mkdirSync(join(ROOT, OUT_DIR), { recursive: true });

const manifest = existsSync(join(ROOT, MANIFEST))
  ? JSON.parse(readFileSync(join(ROOT, MANIFEST), 'utf8'))
  : {};

let done = 0;
let fetched = 0;
let failed = 0;
let skipped = 0;
let bytesIn = 0;
let bytesOut = 0;

async function handle(kit) {
  const ext = '.webp';
  const filename = `${kit.id}${ext}`;
  const abs = join(ROOT, OUT_DIR, filename);

  if (!force && existsSync(abs) && statSync(abs).size > 0) {
    manifest[kit.id] = { path: `${URL_PREFIX}/${filename}`, source: kit.imageUrl };
    skipped++;
    return;
  }

  try {
    const url = await resolveImageUrl(kit);
    if (!url) throw new Error('找不到商品图');
    const raw = await fetchBuffer(url);
    bytesIn += raw.length;
    const out = await sharp(raw)
      .resize(TARGET_WIDTH, TARGET_WIDTH, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toBuffer();
    writeFileSync(abs, out);
    bytesOut += out.length;
    manifest[kit.id] = { path: `${URL_PREFIX}/${filename}`, source: url };
    fetched++;
  } catch (err) {
    failed++;
    manifest[kit.id] = { path: null, source: kit.imageUrl || null, error: String(err.message || err) };
  } finally {
    done++;
  }
}

/* 固定并发的小队列 */
let cursor = 0;
const workers = Array.from({ length: Math.min(CONCURRENCY, wanted.length) }, async () => {
  while (cursor < wanted.length) {
    const kit = wanted[cursor++];
    await handle(kit);
    await new Promise((r) => setTimeout(r, DELAY));
    if (done % 50 === 0 || done === wanted.length) {
      const pct = ((done / wanted.length) * 100).toFixed(0);
      process.stdout.write(`\r  ${done}/${wanted.length} (${pct}%)  失败 ${failed}  `);
    }
  }
});
await Promise.all(workers);
process.stdout.write('\n');

writeFileSync(
  join(ROOT, MANIFEST),
  JSON.stringify(
    Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b))),
    null,
    2,
  ),
  'utf8',
);

console.log(`处理 ${wanted.length} 条：新下载 ${fetched}，跳过已有 ${skipped}，失败 ${failed}`);
console.log(
  `体积 ${(bytesIn / 1024 / 1024).toFixed(1)} MB → ${(bytesOut / 1024 / 1024).toFixed(1)} MB`,
);
console.log(`清单写入 ${MANIFEST}`);
