/**
 * 生成 public/og.png（1200×630 分享卡片）
 * ---------------------------------------------------------------------------
 * 站点此前完全没有 og:image，`twitter:card` 挂在 "summary" 上，分享到微信 /
 * Slack / X 就是一张白卡。这张图把首屏的主视觉（标本图 + 印章）压成一张卡片，
 * 所以它不是新画的东西，而是已有设计在另一个尺寸下的重排。
 *
 * 用法：node scripts/make-og.mjs
 *
 * 不新增依赖：sharp 是 Astro 自己的传递依赖，已在 pnpm-lock.yaml 里，
 * 这里只是按 pnpm 的严格 node_modules 布局指到真实路径。
 * 调色板与 CSS 令牌保持一致，改配色时两边一起改。
 */
import sharp from '../node_modules/.pnpm/sharp@0.34.5/node_modules/sharp/lib/index.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../public/og.png');

const W = 1200;
const H = 630;

/** 与 src/styles/global.css 的 tokens 保持一致（深色主题那一侧） */
const C = {
  bg: '#110c0b',
  surface: '#1e1817',
  line: '#322928',
  lineFaint: '#1b2427',
  dot: 'rgba(208,195,167,0.08)',
  text: '#f3efee',
  dim: '#beb5b4',
  faint: '#8c8280',
  accent: '#f3625f',
  accent2: '#f3c64c',
  seal: '#c92f36',
};

const SANS = "'Segoe UI','Helvetica Neue',Arial,'Microsoft YaHei','PingFang SC',sans-serif";
const MONO = "'Cascadia Mono','Consolas','Courier New',monospace";

/** 一枚小叶：与 HeroPlate.astro 同一套轮廓，只按比例放大 */
const LEAF = 'M0 0C22 -22 60 -24 86 -2C60 20 22 18 0 0Z';
const MIDRIB = 'M1 0C28 -5 60 -6 84 -2';

const SPINE_X = 940;
const SPINE_BOTTOM = 452;
const SPINE_TOP = 176;
const LEAF_SCALE = 1.34;

/** 沿主茎交错生长：越往上越小、越收拢 */
const leaves = Array.from({ length: 9 }, (_, i) => {
  const t = 0.04 + (i / 8) * 0.9;
  return {
    y: SPINE_BOTTOM - t * (SPINE_BOTTOM - SPINE_TOP),
    scale: (0.96 - t * 0.5) * LEAF_SCALE,
    angle: 52 - t * 21,
    side: i % 2 === 0 ? 1 : -1,
  };
});

/** 右上角的稀疏节点网络 */
const nodes = [
  { x: 1012, y: 148, r: 6 },
  { x: 1092, y: 184, r: 4.2 },
  { x: 990, y: 214, r: 4.2 },
  { x: 1076, y: 256, r: 5.4 },
  { x: 1018, y: 292, r: 3.6 },
];
const edges = [
  [0, 1],
  [0, 2],
  [1, 3],
  [2, 3],
  [2, 4],
];

const seal = (x, y, size) => `
  <g transform="translate(${x} ${y})">
    <rect width="${size}" height="${size}" rx="${size * 0.09}" fill="${C.seal}"/>
    <rect x="${size * 0.08}" y="${size * 0.08}" width="${size * 0.84}" height="${size * 0.84}"
      rx="${size * 0.05}" fill="none" stroke="${C.accent2}" stroke-width="${size * 0.028}" opacity="0.75"/>
    <text x="${size / 2}" y="${size / 2}" text-anchor="middle" dominant-baseline="central"
      font-family="'Songti SC','Source Han Serif SC','SimSun',serif"
      font-size="${size * 0.56}" font-weight="600" fill="#ffffff">藥</text>
  </g>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse">
      <circle cx="1.5" cy="1.5" r="1.6" fill="${C.dot}"/>
    </pattern>
    <radialGradient id="washA" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${C.accent}" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="${C.accent}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="washB" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${C.accent2}" stop-opacity="0.13"/>
      <stop offset="100%" stop-color="${C.accent2}" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="sheet">
      <rect x="740" y="64" width="396" height="502" rx="16"/>
    </clipPath>
  </defs>

  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  <rect width="${W}" height="${H}" fill="url(#dots)"/>
  <ellipse cx="180" cy="-40" rx="520" ry="300" fill="url(#washA)"/>
  <ellipse cx="1150" cy="-90" rx="420" ry="280" fill="url(#washB)"/>

  <!-- 左栏：站印 / 站名 / 题眼 / 一句说明 -->
  ${seal(88, 78, 54)}

  <text x="88" y="244" font-family="${SANS}" font-size="116" font-weight="700"
    letter-spacing="-4" fill="${C.text}">njucm<tspan fill="${C.faint}" font-weight="400">.org</tspan></text>

  <text x="88" y="346" font-family="${SANS}" font-size="36" letter-spacing="5"
    fill="${C.accent}">中医药 · 药学 · 计算方法</text>

  <text x="88" y="410" font-family="${SANS}" font-size="25" fill="${C.dim}">传统中医药、药学与现代计算方法的独立学术站点</text>
  <text x="88" y="450" font-family="${SANS}" font-size="25" fill="${C.dim}">阅读笔记、可复现数据集与工具。</text>

  <text x="88" y="556" font-family="${MONO}" font-size="19" letter-spacing="4"
    fill="${C.faint}">NOTES · DATA · PROJECTS · ABOUT</text>

  <!-- 右栏：把首屏那张标本图原样搬过来 -->
  <g clip-path="url(#sheet)">
    <rect x="740" y="64" width="396" height="502" rx="16" fill="${C.surface}" opacity="0.5"/>
    <rect x="740" y="64" width="396" height="502" rx="16" fill="url(#dots)"/>

    <circle cx="${SPINE_X}" cy="330" r="132" fill="none" stroke="${C.line}"
      stroke-width="1.4" stroke-dasharray="3 10" stroke-linecap="round"/>

    <path d="M${SPINE_X} ${SPINE_BOTTOM}C${SPINE_X + 12} 380 ${SPINE_X - 12} 310 ${SPINE_X + 2} 190"
      fill="none" stroke="${C.dim}" stroke-width="3" stroke-linecap="round"/>

    ${leaves
      .map(
        (l) => `<g transform="translate(${SPINE_X} ${l.y.toFixed(1)}) rotate(${(l.angle * l.side).toFixed(1)}) scale(${l.scale.toFixed(3)})">
        <path d="${LEAF}" fill="${C.accent}" fill-opacity="0.14" stroke="${C.accent}" stroke-width="2.1" stroke-linejoin="round"/>
        <path d="${MIDRIB}" fill="none" stroke="${C.accent}" stroke-width="1.4" stroke-linecap="round" opacity="0.65"/>
      </g>`,
      )
      .join('\n      ')}

    <g transform="translate(942 168)">
      <path d="M0 26C-2 13 3 3 0 -11" fill="none" stroke="${C.dim}" stroke-width="2.4" stroke-linecap="round"/>
      <ellipse cx="0" cy="-19" rx="7.5" ry="11" fill="${C.accent2}" fill-opacity="0.16" stroke="${C.accent2}" stroke-width="2"/>
      <ellipse cx="-11" cy="-5" rx="5" ry="7.5" fill="${C.bg}" stroke="${C.accent2}" stroke-width="1.7"/>
      <ellipse cx="11" cy="-3" rx="5" ry="7.5" fill="${C.bg}" stroke="${C.accent2}" stroke-width="1.7"/>
    </g>

    ${edges
      .map(
        ([a, b]) =>
          `<line x1="${nodes[a].x}" y1="${nodes[a].y}" x2="${nodes[b].x}" y2="${nodes[b].y}" stroke="${C.accent2}" stroke-width="1.8" opacity="0.5"/>`,
      )
      .join('\n    ')}
    ${nodes
      .map(
        (n, i) =>
          `<circle cx="${n.x}" cy="${n.y}" r="${n.r}" fill="${i === 0 ? C.accent2 : C.bg}" stroke="${C.accent2}" stroke-width="2"/>`,
      )
      .join('\n    ')}

    <text x="772" y="536" font-family="${MONO}" font-size="16" letter-spacing="3"
      fill="${C.faint}" opacity="0.8">PL. 07 — HERBARIUM / NETWORK</text>
  </g>

  <rect x="740" y="64" width="396" height="502" rx="16" fill="none" stroke="${C.line}" stroke-width="1.6"/>
</svg>`;

mkdirSync(dirname(OUT), { recursive: true });

const png = await sharp(Buffer.from(svg), { density: 96 })
  .png({ compressionLevel: 9, palette: true, quality: 92 })
  .toBuffer();

writeFileSync(OUT, png);
console.log(`wrote ${OUT}`);
console.log(`size  ${W}x${H}  ${(png.length / 1024).toFixed(1)} KB`);
