/**
 * 生成下载文件的校验和清单。
 * ---------------------------------------------------------------------------
 * 下载区挂着 12 个自己打包的工具。访客拿到手之后没法确认这份 zip 是不是
 * 原封不动的那一份——中途被替换过、或者传输中损坏，都看不出来。
 *
 * 一份公开的 SHA-256 清单能解决这件事：下载后对着算一遍，对不上就是
 * 有问题。清单本身放在 /downloads/SHA256SUMS.txt，跟着站点一起发布。
 *
 * 用法：node scripts/write-download-checksums.mjs
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'public/downloads';
const OUT = join(DIR, 'SHA256SUMS.txt');

const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.zip'))
  .sort();

const lines = [];
for (const name of files) {
  const buf = readFileSync(join(DIR, name));
  const hash = createHash('sha256').update(buf).digest('hex');
  lines.push(hash + '  ' + name);
  console.log(hash.slice(0, 16) + '…  ' + name);
}

const header = [
  '# njucm.org 下载文件校验和（SHA-256）',
  '#',
  '# 用法（Windows）：',
  '#   certutil -hashfile <文件名>.zip SHA256',
  '# 用法（macOS / Linux）：',
  '#   shasum -a 256 <文件名>.zip',
  '#',
  '# 对不上请先重下；仍然不一致请联系站点作者。',
  '#',
  '# 生成方式：node scripts/write-download-checksums.mjs',
  '',
].join('\n');

writeFileSync(OUT, header + lines.join('\n') + '\n', 'utf8');
console.log('\n已写入 ' + OUT + '（' + lines.length + ' 个文件）');
