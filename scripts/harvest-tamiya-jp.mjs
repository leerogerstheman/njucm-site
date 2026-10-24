#!/usr/bin/env node
/**
 * 田宫日本官网目录采集
 * ---------------------------------------------------------------------------
 * 日本官网（www.tamiya.com/japan）是田宫自己的一手资料，比中文旗舰店的目录全：
 * 每个产品都有官方日文品名与含税日元价。
 *
 * 目录按分类翻页：/japan/products/list.html?genre_item=<分类>，一页 20 条，
 * 页首写着「全 N 件 1～20 件」，据此翻到最后一页。只收模型类分类——
 * 工具、涂料、配件、周边与书籍不是模型。
 *
 * 页面是 Shift_JIS 编码，解析前要先转码。
 *
 * 用法：node scripts/harvest-tamiya-jp.mjs [--genres 1010,1030] [--delay MS]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://www.tamiya.com';
const CACHE_DIR = join(ROOT, '.cache', 'tamiya-jp');
const OUT_FILE = join(CACHE_DIR, 'catalog.json');

/**
 * 采集哪些分类。
 *
 * `series` 是库里的作品线——沿用中文旗舰店那套中文分组，让两边的条目归到同一条线上。
 */
const GENRES = [
  { id: '1010', jp: 'カーモデル', series: '汽车模型' },
  { id: '1020', jp: 'オートバイモデル', series: '摩托车模型' },
  { id: '1030', jp: 'ミリタリーモデル', series: '陆军模型' },
  { id: '1040', jp: '飛行機モデル', series: '飞机模型' },
  { id: '1050', jp: '艦船モデル', series: '舰船模型' },
  { id: '1060', jp: '恐竜モデル', series: '恐龙模型' },
  { id: '1076', jp: 'スケール限定商品', series: '' },
  { id: '2010', jp: '電動RCカー', series: '遥控车' },
  { id: '2020', jp: 'RCタンク', series: '遥控车' },
  { id: '3010', jp: 'ミニ四駆キット', series: '迷你四驱车' },
  { id: '4010', jp: '楽しい工作シリーズ', series: 'STEM 教育模型' },
  { id: '4040', jp: 'ロボティクス', series: 'STEM 教育模型' },
];

const args = process.argv.slice(2);
const argNum = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const onlyGenres = args.includes('--genres')
  ? new Set(args[args.indexOf('--genres') + 1].split(',').map((s) => s.trim()))
  : null;
/** 每页之间的间隔。官网没有 robots.txt，但大站还是慢一点稳妥 */
const DELAY = argNum('--delay', 1500);

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

/** 取一页（Shift_JIS）。直连优先；本机 DNS 有问题时退回本机代理 */
function fetchPage(url, file) {
  const abs = join(CACHE_DIR, file);
  if (existsSync(abs)) return new TextDecoder('shift_jis').decode(readFileSync(abs));
  const base = ['-sL', '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0 Safari/537.36', '--max-time', '40', '-o', abs, url];
  const routes = [[], ['--proxy', 'http://127.0.0.1:7897']];
  for (const extra of routes) {
    try {
      execFileSync('curl.exe', [...extra, ...base], { stdio: 'ignore' });
    } catch {
      /* 这一条路不通，换下一条 */
    }
    if (existsSync(abs) && readFileSync(abs).length > 1000) {
      return new TextDecoder('shift_jis').decode(readFileSync(abs));
    }
  }
  return '';
}

/** 列表页的条目 */
function parseItems(html) {
  const out = [];
  const re = /<li>\s*<a href="(https:\/\/www\.tamiya\.com\/japan\/products\/(\d+)\/index\.html)"[^>]*>([\s\S]*?)<\/a>\s*<\/li>/g;
  for (const m of html.matchAll(re)) {
    const [, url, no, block] = m;
    const nameMatch = /<h3>([\s\S]*?)<\/h3>/.exec(block);
    const priceMatch = /<p>\s*([\d,]+)\s*円/.exec(block);
    const thumbMatch = /<img[^>]+src="([^"]+)"/.exec(block);
    if (!nameMatch) continue;
    const name = nameMatch[1]
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
    /* 标题里第一段是「ITEM <番号>」，那是编号不是品名 */
    const title = name.replace(/^ITEM\s*\d+\s*/, '').trim();
    out.push({
      no,
      name: title,
      price: priceMatch ? Number(priceMatch[1].replace(/,/g, '')) : 0,
      url,
      thumb: thumbMatch ? thumbMatch[1] : null,
    });
  }
  return out;
}

/** 「全 N 件」 */
function totalOf(html) {
  const m = /全\s*([\d,]+)\s*件/.exec(html);
  return m ? Number(m[1].replace(/,/g, '')) : 0;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const catalog = {};
let pageCount = 0;

for (const genre of GENRES) {
  if (onlyGenres && !onlyGenres.has(genre.id)) continue;
  const first = fetchPage(
    `${ORIGIN}/japan/products/list.html?genre_item=${genre.id}`,
    `genre_${genre.id}_1.html`,
  );
  if (!first) {
    console.log(`${genre.id} ${genre.jp}：取不到，跳过`);
    continue;
  }
  const total = totalOf(first);
  const pages = Math.max(1, Math.ceil(total / 20));
  let found = 0;
  for (let p = 1; p <= pages; p++) {
    const html =
      p === 1
        ? first
        : fetchPage(
            `${ORIGIN}/japan/products/list.html?field_sort=d&cmdarticlesearch=1&genre_item=${genre.id}&absolutepage=${p}`,
            `genre_${genre.id}_${p}.html`,
          );
    if (!html) continue;
    const items = parseItems(html);
    for (const it of items) {
      if (!catalog[it.no]) catalog[it.no] = { ...it, genre: genre.id, series: genre.series };
      found++;
    }
    pageCount++;
    if (p < pages) await sleep(DELAY);
  }
  console.log(`${genre.id} ${genre.jp}：${total} 件（${pages} 页），本页解析 ${found} 条`);
}

writeFileSync(OUT_FILE, JSON.stringify(catalog, null, 1), 'utf8');
console.log(`\n共 ${Object.keys(catalog).length} 个产品，${pageCount} 页`);
console.log(`写出 ${OUT_FILE}`);
