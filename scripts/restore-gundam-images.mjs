#!/usr/bin/env node
/**
 * 把 .cache/gundam-jp/unused 里用得上的日站图搬回 public/gundam/
 *
 * 之前的 join 脚本会把「没有匹配到中文站条目」的日站图挪进 unused，但
 * GUNDAM ASSEMBLE 这类只有日站来源的新条目后来才加进来，图还在缓存里。
 *
 * 用法：node scripts/restore-gundam-images.mjs <ids...>
 *       node scripts/restore-gundam-images.mjs --prefix jp-01_7
 */

import { readdirSync, renameSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UNUSED = join(ROOT, '.cache', 'gundam-jp', 'unused');
const PUBLIC = join(ROOT, 'public', 'gundam');

if (!existsSync(UNUSED)) {
  console.log('没有 unused 目录，无需搬回');
  process.exit(0);
}

const args = process.argv.slice(2);
const prefix = args.find((a) => a.startsWith('--prefix='))?.split('=')[1];
/* 参数可以带不带扩展名，比对时统一去掉 */
const ids = new Set(
  args
    .filter((a) => !a.startsWith('--'))
    .map((a) => a.replace(/\.webp$/, '')),
);

let moved = 0;
for (const name of readdirSync(UNUSED)) {
  if (!name.endsWith('.webp')) continue;
  const base = name.replace(/\.webp$/, '');
  if (ids.size && !ids.has(base)) continue;
  if (prefix && !base.startsWith(prefix.replace(/\.webp$/, ''))) continue;
  const to = join(PUBLIC, name);
  if (existsSync(to)) continue;
  renameSync(join(UNUSED, name), to);
  moved++;
}
console.log(`搬回 ${moved} 张图片`);
