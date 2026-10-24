/**
 * CSP 审计：扫 dist 里的每一个 HTML，检查它是否满足站点的内容安全策略。
 * ---------------------------------------------------------------------------
 * 为什么要它：CSP 最怕「改了一行代码就悄悄破掉」。这个脚本把「什么算违规」
 * 写成硬规则，接到 CI 上，改坏了就构建失败，而不是等到线上才发现。
 *
 * 它检查的东西（对应 src/utils/csp.ts 里那份策略）：
 *   1. 没有可执行的内联脚本（<script> 不带 src、且不是 ld+json）
 *   2. 没有内联 <style> 块（style-src-elem 'self' 会拦下它们）
 *   3. 没有 on* 内联事件属性
 *   4. 每个页面都带着同一份 CSP meta
 *   5. 页面不引用站外子资源（http(s):// 开头的图片、样式、脚本、字体）
 *   6. 没有 iframe、没有 blob: / javascript: 这类危险 URL
 *
 * 注意：<a href="https://厂商官网"> 这种普通链接不算违规——CSP 管的是
 * 页面往哪里**加载**东西，不是访客能点去哪里。厂商官网链接是这个站的
 * 全部价值所在，不能因为 CSP 把它们挡了。
 *
 * 用法：node scripts/test-csp.mjs [dist目录]
 */

import fs from 'node:fs';
import path from 'node:path';

const DIST = process.argv[2] || 'dist';

/** 与 src/utils/csp.ts 保持一致。改了那边记得改这里。 */
const EXPECTED_CSP_PARTS = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "form-action 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'none'",
  "style-src 'self' 'unsafe-inline'",
  "style-src-elem 'self'",
  "style-src-attr 'unsafe-inline'",
  "script-src 'self'",
  "upgrade-insecure-requests",
];

const SCRIPT_RE = /<script\b([^>]*)>/gi;
const STYLE_BLOCK_RE = /<style\b[^>]*>/gi;
const ON_ATTR_RE = /\son[a-z]+\s*=\s*["']/gi;
/*
 * CSP 的 content 里全是单引号（'self'），所以外层属性一定是双引号，
 * 这里只能按双引号取内容——早先用 [^"'] 取会被第一个单引号截断。
 */
const META_CSP_RE = /<meta\s+http-equiv="content-security-policy"\s+content="([^"]*)"/i;
const LINK_RE = /<link\b([^>]*)>/gi;
const SUBRESOURCE_RE = /\b(src|poster|data)\s*=\s*["']([^"']*)["']/gi;
const SRCSET_RE = /\bsrcset\s*=\s*["']([^"']*)["']/gi;
const CSS_URL_RE = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
const IFRAME_RE = /<iframe\b/gi;

const problems = [];

function rel(p) {
  return path.relative(DIST, p).replace(/\\/g, '/');
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

function isExternal(url) {
  if (!url) return false;
  if (!/^(https?:)?\/\//i.test(url)) return false;
  try {
    const origin = new URL(url, 'https://njucm.org').origin;
    return origin !== 'https://njucm.org';
  } catch {
    return false;
  }
}

const files = walk(DIST, []);
console.log('扫描 HTML 文件：' + files.length + ' 个');

let inlineScripts = 0;
let inlineStyles = 0;
let onAttrs = 0;
let styleAttrs = 0;
let jsonLd = 0;
let cspPages = 0;
const cspVariants = new Map();
const offenders = [];
const externalOrigins = new Map();

for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  const where = rel(file);
  const bad = [];

  // 1) 可执行内联脚本
  for (const m of html.matchAll(SCRIPT_RE)) {
    const attrs = m[1] || '';
    if (/type\s*=\s*["']application\/ld\+json["']/i.test(attrs)) {
      jsonLd += 1;
      continue;
    }
    if (/\bsrc\s*=/i.test(attrs)) continue;
    inlineScripts += 1;
    bad.push('可执行内联脚本');
  }

  // 2) 内联 <style> 块
  const styles = html.match(STYLE_BLOCK_RE);
  if (styles) {
    inlineStyles += styles.length;
    bad.push('内联 <style> ×' + styles.length);
  }

  // 3) 内联事件属性
  const ons = html.match(ON_ATTR_RE);
  if (ons) {
    onAttrs += ons.length;
    bad.push('内联事件属性 ×' + ons.length);
  }

  // 4) style 属性（策略里放行了，但记个数，别悄悄涨上去）
  const sa = html.match(/\sstyle\s*=\s*["']/gi);
  if (sa) styleAttrs += sa.length;

  // 5) CSP meta
  const csp = html.match(META_CSP_RE);
  if (csp) {
    cspPages += 1;
    cspVariants.set(csp[1], (cspVariants.get(csp[1]) || 0) + 1);
    for (const part of EXPECTED_CSP_PARTS) {
      if (!csp[1].includes(part)) bad.push('CSP 缺少 ' + part);
    }
  } else {
    bad.push('没有 CSP meta');
  }

  // 6) 站外子资源：图片、脚本、样式、字体、poster……
  const note = (url) => {
    if (!isExternal(url)) return;
    let origin = url;
    try {
      origin = new URL(url, 'https://njucm.org').origin;
    } catch {
      /* 保持原样 */
    }
    externalOrigins.set(origin, (externalOrigins.get(origin) || 0) + 1);
    bad.push('站外子资源 ' + origin);
  };
  for (const m of html.matchAll(SUBRESOURCE_RE)) note(m[2]);
  for (const m of html.matchAll(SRCSET_RE)) {
    for (const part of m[1].split(',')) note(part.trim().split(/\s+/)[0]);
  }
  // <link href> 也是子资源（样式表、图标、preload）
  for (const m of html.matchAll(LINK_RE)) {
    const h = (m[1] || '').match(/\bhref\s*=\s*["']([^"']*)["']/i);
    if (h) note(h[1]);
  }
  for (const m of html.matchAll(CSS_URL_RE)) note(m[1]);

  // 7) 危险的东西
  if (IFRAME_RE.test(html)) bad.push('iframe');
  if (/javascript:/i.test(html)) bad.push('javascript: URL');
  if (/\b(?:src|href)\s*=\s*["']blob:/i.test(html)) bad.push('blob: URL');

  if (bad.length) {
    offenders.push(where + ' → ' + [...new Set(bad)].join('; '));
  }
}

console.log('');
console.log('可执行内联脚本：' + inlineScripts);
console.log('JSON-LD 块：' + jsonLd);
console.log('内联 <style> 块：' + inlineStyles);
console.log('内联事件属性：' + onAttrs);
console.log('style 属性：' + styleAttrs);
console.log('带 CSP meta 的页面：' + cspPages + ' / ' + files.length);
console.log('CSP 变体：' + cspVariants.size);
for (const [k, v] of cspVariants) console.log('   ×' + v + '  ' + k);
if (externalOrigins.size) {
  console.log('站外子资源来源：');
  for (const [k, v] of [...externalOrigins].sort((a, b) => b[1] - a[1])) console.log('   ' + v + '  ' + k);
} else {
  console.log('站外子资源：无');
}

if (offenders.length) {
  console.log('');
  console.log('问题页面（前 40 条，共 ' + offenders.length + '）：');
  for (const o of offenders.slice(0, 40)) console.log('   ' + o);
  problems.push(offenders.length + ' 个页面不符合 CSP 策略');
}

/*
 * 抄到 Cloudflare 里的那行，必须和页面实际用的策略逐字一致。
 *
 * 这一条是给「以后改了 src/utils/csp.ts」准备的：策略改了而文档没改，
 * 用户照抄的就是过期规则——而这类不一致在部署后完全看不出来。
 */
const firstCsp = [...cspVariants.keys()][0];
if (firstCsp) {
  for (const doc of ['deploy/security-headers.md', 'deploy/_headers', 'deploy/Caddyfile']) {
    if (!fs.existsSync(doc)) {
      problems.push('缺少 ' + doc);
      continue;
    }
    const text = fs.readFileSync(doc, 'utf8');
    if (!text.includes(firstCsp)) {
      problems.push(doc + ' 里的 CSP 与 src/utils/csp.ts 不一致');
    } else {
      console.log('规则文档一致：' + doc);
    }
  }
}

if (problems.length) {
  console.log('');
  console.error('CSP 审计未通过。');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log('');
console.log('CSP 审计通过。');
