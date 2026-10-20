#!/usr/bin/env node
/**
 * 补下载指定商品的官方图（日站品牌页 → CloudFront 签名 → 480px WebP）
 *
 * 签名约一小时过期，所以每次都要重新取页面拿新的签名地址。
 *
 * 用法：node scripts/fetch-gundam-brand-images.mjs <brandSlug> [更多 slug...]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://bandai-hobby.net';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const IMAGE_WIDTH = 480;
const QUALITY = 78;

async function loadSharp() {
  try {
    return (await import('sharp')).default;
  } catch {
    const require = createRequire(import.meta.url);
    try {
      return require('sharp');
    } catch {
      const { readdirSync } = await import('node:fs');
      const { pathToFileURL } = await import('node:url');
      const store = join(ROOT, 'node_modules', '.pnpm');
      const dir = readdirSync(store).find((d) => d.startsWith('sharp@'));
      if (!dir) throw new Error('找不到 sharp');
      return (
        await import(
          pathToFileURL(join(store, dir, 'node_modules', 'sharp', 'lib', 'index.js')).href
        )
      ).default;
    }
  }
}

const CARD =
  /<a href="(https:\/\/bandai-hobby\.net\/item\/[0-9_]+\/|https:\/\/p-bandai\.jp\/item\/[^"]+)"[^>]*class="c-card p-card -landscape[^"]*">([\s\S]*?)<\/a>/g;

const slugs = process.argv.slice(2);
if (!slugs.length) {
  console.error('用法：node scripts/fetch-gundam-brand-images.mjs <brandSlug> [...]');
  process.exit(1);
}

const sharp = await loadSharp();
mkdirSync(join(ROOT, 'public', 'gundam'), { recursive: true });

let got = 0;
let skipped = 0;

for (const slug of slugs) {
  for (let page = 1; page <= 20; page++) {
    const html = await fetch(`${ORIGIN}/brand/${slug}/?p=${page}`, {
      headers: { 'User-Agent': UA, Accept: 'text/html', Referer: `${ORIGIN}/` },
    }).then((r) => r.text());

    CARD.lastIndex = 0;
    let m;
    let any = false;
    while ((m = CARD.exec(html))) {
      any = true;
      const id = /\/item\/([0-9_]+)\//.exec(m[1])?.[1];
      if (!id) continue;
      const abs = join(ROOT, 'public', 'gundam', `jp-${id}.webp`);
      if (existsSync(abs)) {
        skipped++;
        continue;
      }
      const img = /<div class="p-card__img">\s*<img src="([^"]+)"/.exec(m[2]);
      if (!img) continue;
      try {
        const res = await fetch(img[1], {
          headers: { 'User-Agent': UA, Referer: `${ORIGIN}/` },
        });
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        const out = await sharp(buf)
          .resize(IMAGE_WIDTH, IMAGE_WIDTH, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: QUALITY })
          .toBuffer();
        writeFileSync(abs, out);
        got++;
        process.stdout.write(`\r  下载 ${got} 张        `);
      } catch {
        /* 单张失败不影响整批 */
      }
    }
    if (!any) break;
  }
}

process.stdout.write('\n');
console.log(`新下载 ${got} 张，已存在 ${skipped} 张`);
