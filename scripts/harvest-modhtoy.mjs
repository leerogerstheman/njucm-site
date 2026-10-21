#!/usr/bin/env node
/**
 * 魔动核（MO DONG HE）产品采集
 * ---------------------------------------------------------------------------
 * 东莞东秀文化传播有限公司的国风机甲品牌。官网 mdhtoy.com 有完整的产品目录：
 * 五个产品线页（合金成品 / 超可动拼装 / 小比例 / 机甲潮玩 / 超可动成品）里
 * 列着每一款的货号与详情页，详情页给出品名、造型与图片。
 *
 * 官网**不公布价格与发售日期**——定价在淘宝店，官网的产品页上写的是
 * 「敬请期待」。所以这两项留空，不猜。
 *
 * 一款产品按货号计（厂牌就是按货号卖的），同一货号下的不同造型记为别名。
 *
 * 作品线只有两个：星甲魂将传（占四个产品线）与钢铁契约。
 * 「合金成品 / 超可动拼装 / 小比例 / 机甲潮玩 / 超可动成品」是**产品形态**，
 * 不是作品线——它们落在品类维度上。
 *
 * 用法：node scripts/harvest-modhtoy.mjs [--limit N]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'http://www.mdhtoy.com';
const CACHE_DIR = join(ROOT, '.cache', 'modhtoy');
const OUT_FILE = 'src/data/models.kits.modhtoy.json';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const DELAY = 900;

/**
 * 产品线页 → 作品线 id 与品类。
 *
 * 作品线 id 与 src/data/models.ts 里的 SERIES 对应；品类是原始写法，
 * 由 scripts/build-models-data.mjs 映射成 modhtoy:* 的正式 id。
 */
const SERIES_PAGES = [
  { page: 'MNQ', series: 'xjhcz', category: '合金成品' },
  { page: 'MNP', series: 'xjhcz', category: '超可动拼装' },
  { page: 'MNQQ', series: 'xjhcz', category: '小比例' },
  { page: 'MNM', series: 'xjhcz', category: '机甲潮玩' },
  { page: 'MNZ', series: 'gthq', category: '超可动成品' },
];

/**
 * 货号：MNQ-XH01、MNP-XH03T、MNM-XH-A、MNZ-GT01、MNPQ-XH04
 *
 * 货号里的字母数字段最长六个（XH02CE、XH05X），所以段长上限给到 6。
 * 厂商段是 MN 加一到两个字母（MNM / MNQ / MNPQ）。后面可以再跟一段
 * （MNM-XH-A），但只认字母数字，中文名不会被吃进来。
 */
const CODE_RE = /MN[A-Z]{0,2}-[A-Z0-9]{1,6}(?:-[A-Z0-9]{1,4})?/;

/** 导航与页脚里的固定词，不是品名 */
const NOT_NAME =
  /^(上一篇|下一篇|敬请期待|没有了|首页|品牌资讯|公司简介|新闻中心|产品中心|原创IP|联系我们|商务合作|加入我们|详情)/;

/**
 * 站点素材的上传日期——logo、二维码与页脚横幅，每个详情页都有。
 * 排除掉它们，剩下的最新一组才是这一款的商品图。
 */
const SITE_ASSET_DATES = new Set(['20201201', '20201210', '20240617']);

const limitArg = process.argv.indexOf('--limit');
const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

async function fetchText(url) {
  let backoff = 3_000;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
        redirect: 'follow',
      });
      if (!res.ok) return '';
      return await res.text();
    } catch {
      if (attempt === 3) return '';
      await new Promise((r) => setTimeout(r, backoff));
      backoff *= 2;
    }
  }
  return '';
}

async function cached(url, file) {
  const abs = join(CACHE_DIR, file);
  if (existsSync(abs)) return readFileSync(abs, 'utf8');
  const html = await fetchText(url);
  if (html) writeFileSync(abs, html, 'utf8');
  return html;
}

/** 从 HTML 里剥出纯文本节点 */
function textNodes(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, '\n')
    .split('\n')
    .map((s) => s.replace(/&nbsp;/g, ' ').replace(/ /g, ' ').trim())
    .filter(Boolean);
}

/** 详情页里的商品图：排除站点素材后取最新的一组 */
function productImage(html) {
  const byDate = new Map();
  for (const m of html.matchAll(
    /(?:https?:\/\/www\.mdhtoy\.com)?(\/static\/upload\/image\/(\d{8})\/[^"'\s]+?\.(?:jpg|jpeg|png|webp))/g,
  )) {
    const path = m[1];
    const date = m[3];
    if (SITE_ASSET_DATES.has(date)) continue;
    if (!byDate.has(date)) byDate.set(date, `${ORIGIN}${path}`);
  }
  if (!byDate.size) return null;
  const newest = [...byDate.keys()].sort().at(-1);
  return byDate.get(newest);
}

/**
 * 主题（这条产品是关于谁的）。
 *
 * 星甲魂将传那边，品名是「星号-称号-角色名」三段式，角色才是主题：
 * 「地会星-寒龙子-敖丙」讲的是敖丙。而「威远式-剑斗型」「契武-白虎」
 * 讲的是机体本身。
 *
 * 判据取首段：星号与宫号（地会星、摇光宫…）是角色系列，其余是机体。
 */
function subjectOf(title, variants) {
  const base = title.replace(/[（(][^）)]*[）)]\s*$/, '').trim();
  const parts = base.split('-').filter(Boolean);
  if (parts.length >= 3 && /[星宫]$/.test(parts[0])) {
    return { subject: parts.at(-1), kind: 'character' };
  }
  /* 机甲潮玩第一弹是「一弹多造型」：白起、敖丙、威远式-剑斗型、吕布各一款，
     主题取第一个造型，完整造型列表留在别名与备注里。 */
  if (parts.length === 1 && variants.length) {
    return { subject: variants[0].replace(/[（(][^）)]*[）)]\s*$/, '').trim(), kind: 'character' };
  }
  return { subject: base, kind: 'mech' };
}

/**
 * 是不是一个像品名的词。
 *
 * 品名是中文，通常带「-」分隔的层级；导航词、系列名（…系列）与
 * 「敬请期待」都不是品名。
 */
function looksLikeName(text) {
  if (!text) return false;
  if (NOT_NAME.test(text)) return false;
  if (/系列$/.test(text)) return false;
  if (!/[一-龥]/.test(text)) return false;
  if (text.length < 2 || text.length > 40) return false;
  return true;
}

/**
 * 详情页里的品名与造型。
 *
 * 页面上货号与品名被竖线隔开，但排版有三种：
 *   「CODE | 品名」            —— 同一行
 *   「CODE」换行「| 品名」    —— 货号独占一行，名字带竖线
 *   「CODE」换行「品名」      —— 货号独占一行，名字不带竖线
 *
 * 所以判据只有一个：某个节点里货号后面紧跟着的东西，是品名。
 * 页面中第一次出现品名的地方是这一款的标题，之后再出现的是造型变体。
 */
function extractTitle(nodes, code) {
  const hits = [];
  for (let i = 0; i < nodes.length; i++) {
    const parts = nodes[i]
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    const at = parts.indexOf(code);
    if (at < 0) continue;
    const after = parts.slice(at + 1);
    if (!after.length) continue;
    if (!looksLikeName(after[0])) continue;
    hits.push({ name: after[0].trim(), at: i });
  }

  /* 货号独占一行、名字在下一行的情况（造型变体多见于机甲潮玩那几款） */
  for (let i = 0; i < nodes.length - 1; i++) {
    const parts = nodes[i]
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length !== 1 || parts[0] !== code) continue;
    const next = nodes[i + 1]
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!next.length || next.length > 1) continue;
    if (!looksLikeName(next[0])) continue;
    hits.push({ name: next[0], at: i + 1 });
  }

  hits.sort((a, b) => a.at - b.at);
  if (!hits.length) return { title: null, variants: [] };

  const title = hits[0].name;
  const base = title.replace(/[（(][^）)]*[）)]\s*$/, '').trim() || title;
  const variants = [];
  for (const hit of hits.slice(1)) {
    /* 面包屑里常出现去掉版本后缀的品名，那是同一个东西，不是另一个造型 */
    const bare = hit.name.replace(/[（(][^）)]*[）)]\s*$/, '').trim();
    if (bare === base) continue;
    if (!variants.includes(hit.name)) variants.push(hit.name);
  }
  return { title, variants };
}

const products = [];
const seen = new Set();

for (const sp of SERIES_PAGES) {
  const listHtml = await cached(`${ORIGIN}/${sp.page}.html`, `series_${sp.page}.html`);
  if (!listHtml) {
    console.log(`${sp.page}.html 取不到，跳过`);
    continue;
  }

  /* 产品线页上每个链接都带着「货号 | 品名」，货号由此而来 */
  const entries = [];
  for (const m of listHtml.matchAll(
    /<a[^>]+href="\/([A-Z]{3,4}\/\d+)\.html"[^>]*>([\s\S]{0,300}?)<\/a>/g,
  )) {
    const text = m[2]
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const hit = text.match(CODE_RE);
    if (!hit) continue;
    entries.push({ link: m[1], code: hit[0] });
  }

  for (const { link, code } of entries) {
    if (products.length >= limit) break;
    if (seen.has(code)) continue;
    seen.add(code);

    const html = await cached(`${ORIGIN}/${link}.html`, `item_${link.replace('/', '_')}.html`);
    if (!html) continue;

    const nodes = textNodes(html);
    const { title, variants } = extractTitle(nodes, code);
    if (!title) continue;

    const cleanTitle = title.replace(/[（(][^）)]*[）)]\s*$/, '').trim() || title;
    const { subject, kind } = subjectOf(title, variants);
    const image = productImage(html);

    const aliases = new Set();
    if (cleanTitle !== title) aliases.add(cleanTitle);
    if (subject !== cleanTitle) aliases.add(subject);
    /* 三段式品名里的中间一段也是常见叫法（「寒龙子」「破军星君」） */
    const mid = cleanTitle.split('-').filter(Boolean);
    if (mid.length >= 3) aliases.add(mid.at(-2));
    for (const v of variants) if (v !== title) aliases.add(v);

    products.push({
      id: `modhtoy-${code.toLowerCase()}`,
      name: `${code} ${title}`,
      nameJa: '',
      maker: 'modhtoy',
      category: sp.category,
      series: sp.series,
      scale: '',
      released: '',
      priceJpy: 0,
      priceCny: 0,
      channel: 'general',
      subject,
      subjectKind: kind,
      aliases: [...aliases].filter(Boolean).slice(0, 8),
      tags: [],
      note: variants.length ? `同一货号下的造型：${variants.join('、')}` : '',
      verified: true,
      source: `${ORIGIN}/${link}.html`,
      image: null,
      imageUrl: image,
      taxRate: null,
      sourceJp: null,
    });

    console.log(`${code} ${title}${variants.length ? `（+${variants.length} 个造型）` : ''}`);
    await new Promise((r) => setTimeout(r, DELAY));
  }
}

writeFileSync(join(ROOT, OUT_FILE), JSON.stringify(products, null, 2) + '\n', 'utf8');
console.log(`\n共 ${products.length} 条，写出 ${OUT_FILE}`);
console.log('注：官网不公布价格与发售日期，这两项留空。');
