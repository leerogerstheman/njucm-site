#!/usr/bin/env node
/**
 * 清理没被任何条目引用的商品图
 *
 * 采集过程中会下载很多候选图（同一件商品在日站与中文站各有一张、PB 商品在
 * 日站品牌页与官方专区分列），最后只有一部分真正进了条目。剩下的挪进
 * .cache/gundam-unused，需要时再取回。
 *
 * 用法：node scripts/prune-gundam-images.mjs [--dry]
 */

import { readFileSync, readdirSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'public', 'gundam');
const UNUSED = join(ROOT, '.cache', 'gundam-unused');
const dry = process.argv.includes('--dry');

/* 引用集合：图片清单 + 事实文件里写死的本地路径 */
const used = new Set();

try {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'src/data/gundam.images.json'), 'utf8'));
  for (const v of Object.values(manifest)) if (v?.path) used.add(v.path);
} catch {
  /* 没有清单就只看事实文件 */
}

for (const rel of [
  'src/data/gundam.kits.cn.json',
  'src/data/gundam.kits.pb.json',
  'src/data/gundam.kits.assemble.json',
  'src/data/gundam.kits.classic.json',
  'src/data/gundam.kits.recent.json',
  'src/data/gundam.kits.seed.json',
]) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) continue;
  for (const kit of JSON.parse(readFileSync(abs, 'utf8'))) {
    if (typeof kit.image === 'string' && kit.image.startsWith('/gundam/')) used.add(kit.image);
  }
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.webp'));
let moved = 0;
let bytes = 0;

for (const name of files) {
  const path = `/gundam/${name}`;
  if (used.has(path)) continue;
  if (!dry) {
    mkdirSync(UNUSED, { recursive: true });
    const to = join(UNUSED, name);
    if (!existsSync(to)) {
      renameSync(join(DIR, name), to);
      moved++;
    }
  } else {
    moved++;
  }
}

for (const name of files) {
  if (used.has(`/gundam/${name}`)) continue;
  try {
    bytes += readFileSync(join(UNUSED, name)).length;
  } catch {
    /* 已经挪走了 */
  }
}

console.log(
  `${dry ? '将要挪走' : '挪走'} ${moved} 张未被引用的图片（约 ${(bytes / 1024 / 1024).toFixed(1)} MB）` +
    (dry ? '' : ` → .cache/gundam-unused`),
);
console.log(`仍在用的 ${used.size} 张`);
