/**
 * 高达模型数据库 · 数据模型、分类表与检索工具
 *
 * 这条数据链是分层的，每一层都可以单独检查：
 *
 *   事实层  src/data/gundam.kits.*.json   人工核实过的原始记录，人可读
 *   转换层  scripts/build-gundam-data.mjs 合并、去重、校验、排序
 *   渲染层  src/data/gundam.kits.ts       生成的类型化模块，页面只读它
 *
 * 页面上任何一条记录都能顺着 source 字段回到最初的出处；没有出处的记录
 * 一律 verified: false，界面上会明确标出来，而不是混在已核实条目里。
 */

import { GUNDAM_KITS } from './gundam.kits';

/* -------------------------------------------------------------------------- */
/* 类型                                                                        */
/* -------------------------------------------------------------------------- */

export const GRADE_IDS = ['PG', 'MG', 'MGSD', 'RG', 'HG', 'FG', 'SD', 'EG', 'FM', 'MR'] as const;
export type GradeId = (typeof GRADE_IDS)[number];

export const CHANNEL_IDS = ['general', 'pb', 'gb', 'wt'] as const;
export type ChannelId = (typeof CHANNEL_IDS)[number];

export type SeriesId =
  | 'uc'
  | '0080'
  | '0083'
  | '0093'
  | '0094'
  | 'hathaway'
  | 'gundam-x'
  | 'gquuuuuux'
  | 'seed'
  | 'seed-destiny'
  | 'seed-freedom'
  | 'w'
  | '08ms'
  | 'zz'
  | 'zeta'
  | 'f91'
  | 'gundam-build'
  | 'iron-blooded'
  | 'wing-gundam'
  | 'gundam-duelists'
  | 'stargazer'
  | 'crossbone-g'
  | 'gundam-00'
  | 'gundam-age'
  | 'gundam-nt'
  | 'gundam-mv'
  | 'gundam-front'
  | 'gundam-moon'
  | 'gundam-xarx-zero'
  | 'gundam-build-divers'
  | 'ring-of-nergal'
  | 'pilot-season'
  | 'v-gundam'
  | 'g-gundam'
  | 'wfm'
  | 'sd-gundam'
  | 'missing-link'
  | 'other';

/** 一条模型记录的完整形状。字段的语义见 src/content/data/gundam-database.md */
export interface GundamKit {
  id: string;
  /** 中文名，界面上显示的主标题 */
  name: string;
  /** 官方日文名 */
  nameJa: string;
  grade: GradeId;
  maker: string;
  series: SeriesId;
  /** 比例，如 1/100 */
  scale: string;
  /** YYYY | YYYY-MM | YYYY-MM-DD */
  released: string;
  /** 官方建议零售价（含税，日元）。0 表示未查到 */
  priceJpy: number;
  channel: ChannelId;
  /** 官方 skill level 1–5 */
  skillLevel: number | null;
  /** 零件数 */
  parts: number | null;
  /** 全高（mm） */
  heightMm: number | null;
  /** 材质简述 */
  material: string | null;
  /** 特征标签 */
  tags: string[];
  /** 一句话看点 */
  note: string;
  /** 是否已核实到出处 */
  verified: boolean;
  /** 核实所用的来源 */
  source: string | null;
  /**
   * 官方商品图在本地缓存里的路径（如 /gundam/xxx.webp）。
   *
   * 图片由 scripts/fetch-gundam-images.mjs 下载并压缩后放进 public/，站点
   * 不直接引用万代的 CDN——既不依赖对方服务器，也不至于把请求量转嫁过去。
   * 没有图片的条目回落到手绘封面。
   */
  image: string | null;
  /** 官方商品图的原始 URL，保留以便溯源 */
  imageUrl: string | null;
  /**
   * 定价所含的税率：10 或 8。
   *
   * 2019 年 10 月之前日本消费税是 8%，那之前发售的模型，官方标的是
   * 「8% 税込」；之后是 10%。这个数字来自万代日本官网的価格栏，
   * 中文站没有把它单独列出来。
   */
  taxRate: number | null;
  /** 万代日本官网上的商品页，作为日文名与定价的出处 */
  sourceJp: string | null;
}

/* -------------------------------------------------------------------------- */
/* 分类表                                                                      */
/* -------------------------------------------------------------------------- */

export interface GradeMeta {
  id: GradeId;
  label: string;
  /** 英文全称 */
  full: string;
  /** 常见比例 */
  scale: string;
  /** 等级的一句话定位 */
  brief: string;
}

export const GRADES: GradeMeta[] = [
  { id: 'PG', label: 'PG', full: 'Perfect Grade', scale: '1/100', brief: '顶点完成度，骨架与分色最讲究' },
  { id: 'MG', label: 'MG', full: 'Master Grade', scale: '1/100', brief: '1/100 的骨架主力，变形与内构兼顾' },
  { id: 'MGSD', label: 'MGSD', full: 'MG SD', scale: 'SD 比例', brief: 'SD 造型配上 MG 级别的技术' },
  { id: 'RG', label: 'RG', full: 'Real Grade', scale: '1/144', brief: '1/144 的高密度内构，细节最扎' },
  { id: 'HG', label: 'HG', full: 'High Grade', scale: '1/144', brief: '量最大、门槛最低的主流线' },
  { id: 'FG', label: 'FG', full: 'Figure/Full Mechanics Grade', scale: '1/144', brief: '骨架结构简单、拼装轻松' },
  { id: 'SD', label: 'SD', full: 'Super Deformed', scale: '非等比', brief: 'Q 版比例，造型取巧、单价低' },
  { id: 'EG', label: 'EG', full: 'Entry Grade', scale: '1/144', brief: '平价入门，零件少、成型好' },
  { id: 'FM', label: 'FM', full: 'Full Mechanics', scale: '1/100', brief: '早期的高完成度线，现已停摆' },
  { id: 'MR', label: 'MR', full: 'METAL ROBOT 魂', scale: '约 1/100', brief: '完成品，高度还原的收藏向' },
];

export interface ChannelMeta {
  id: ChannelId;
  label: string;
  brief: string;
}

export const CHANNELS: ChannelMeta[] = [
  { id: 'general', label: '一般销售', brief: '常规零售渠道可买到' },
  { id: 'pb', label: 'PB 限定', brief: 'Premium Bandai 独占' },
  { id: 'gb', label: '高达基地限定', brief: 'GUNDAM BASE 店限定' },
  { id: 'wt', label: '网络限定', brief: '网络商店专属' },
];

export interface SeriesMeta {
  id: SeriesId;
  label: string;
  /** 短代号，印在封面上 */
  short: string;
  /** 机体配色 [主色, 副色, 点缀色] —— 封面线稿按这三色上色 */
  palette: [string, string, string];
}

export const SERIES: SeriesMeta[] = [
  { id: 'uc', label: '机动战士高达 UC', short: 'UC', palette: ['#e3e8ee', '#33518f', '#c0432f'] },
  { id: 'hathaway', label: '闪光的哈萨维', short: 'HATHAWAY', palette: ['#e8e3d8', '#46536b', '#8f9aa8'] },
  { id: 'gundam-x', label: '机动新纪元高达 X', short: 'GUNDAM X', palette: ['#e4e9ef', '#2f6fb0', '#d24a35'] },
  {
    id: 'gquuuuuux',
    label: '机动战士 Gundam GQuuuuuuX',
    short: 'GQuuuuuuX',
    palette: ['#eceae4', '#2b3a5c', '#c0503c'],
  },
  { id: 'seed', label: '机动战士高达 SEED', short: 'SEED', palette: ['#e6eaef', '#2f5fa8', '#d6482f'] },
  { id: 'seed-destiny', label: 'SEED DESTINY', short: 'SEED DESTINY', palette: ['#e7ebf0', '#3a6ab0', '#d64a30'] },
  { id: 'seed-freedom', label: 'SEED FREEDOM', short: 'SEED FREEDOM', palette: ['#eef1f4', '#2d5a9e', '#d13a2c'] },
  { id: 'w', label: '新机动战记高达 W', short: 'GUNDAM W', palette: ['#edf0f4', '#2b3f8f', '#dfb73a'] },
  { id: '0080', label: '机动战士高达 0080', short: '0080', palette: ['#e7e9ed', '#3c4a5c', '#c0a44a'] },
  { id: '0083', label: '高达 0083 星屑的回忆', short: '0083', palette: ['#dfe4ea', '#4a5a70', '#b8563c'] },
  { id: '0093', label: '机动战士高达 0093', short: '0093', palette: ['#e5e9ee', '#37507f', '#c25338'] },
  { id: '0094', label: '机动战士高达 0094', short: '0094', palette: ['#dde1e6', '#2f4f8f', '#c86a2a'] },
  { id: '08ms', label: '第 08MS 小队', short: '08MS', palette: ['#e4e7ec', '#2f4f8f', '#c0503c'] },
  { id: 'zz', label: '机动战士高达 ZZ', short: 'ZZ', palette: ['#e9ecf0', '#4a5a86', '#c8463a'] },
  { id: 'zeta', label: '机动战士高达 Z', short: 'ZETA', palette: ['#e6e9ed', '#2f4f8f', '#b9342c'] },
  { id: 'f91', label: '机动战士高达 F91', short: 'F91', palette: ['#d9dde2', '#3a3f4a', '#b03a2e'] },
  { id: 'gundam-build', label: '高达 Build 系列', short: 'BUILD', palette: ['#eceff3', '#d94f2b', '#2b3f8f'] },
  {
    id: 'iron-blooded',
    label: '铁血的奥尔芬斯',
    short: 'IRON-BLOODED',
    palette: ['#7a756c', '#b08d3f', '#2f4f8f'],
  },
  { id: 'wing-gundam', label: '飞翼高达', short: 'WING GUNDAM', palette: ['#f0f2f4', '#2b3f8f', '#e0b83a'] },
  { id: 'gundam-duelists', label: '高达决斗者', short: 'DUELISTS', palette: ['#e8ebef', '#b03a2e', '#2b3f8f'] },
  { id: 'stargazer', label: '无用则已', short: 'STARGAZER', palette: ['#46515f', '#c0503c', '#d8dde3'] },
  { id: 'crossbone-g', label: '机动战士高达 G', short: 'CROSSBONE G', palette: ['#e9ebef', '#5a6a7a', '#d84a3a'] },
  { id: 'gundam-00', label: '机动战士高达 00', short: 'GUNDAM 00', palette: ['#e8ecf1', '#2f5fa8', '#d98436'] },
  { id: 'gundam-age', label: '机动战士高达 AGE', short: 'GUNDAM AGE', palette: ['#eef1f4', '#d9b23c', '#2f5fa8'] },
  { id: 'gundam-nt', label: '机动战士高达 NT', short: 'GUNDAM NT', palette: ['#e6e9ee', '#2c3a5c', '#8f9bb0'] },
  { id: 'gundam-mv', label: '库库鲁斯·多安的小岛', short: 'GUNDAM MV', palette: ['#e9ecef', '#3f6b8f', '#c8a24a'] },
  { id: 'gundam-front', label: '高达前哨战', short: 'GUNDAM FRONT', palette: ['#e7eaee', '#39506f', '#b04a3a'] },
  { id: 'gundam-moon', label: '机动战士 MOON 高达', short: 'MOON GUNDAM', palette: ['#e9ecf0', '#4a5a86', '#c8b45a'] },
  {
    id: 'gundam-xarx-zero',
    label: '机动战士高达 RG XARX-ZERO',
    short: 'XARX-ZERO',
    palette: ['#eceff3', '#2b3f8f', '#d94f2b'],
  },
  {
    id: 'gundam-build-divers',
    label: '高达破坏者 对战记录',
    short: 'BUILD DIVERS',
    palette: ['#eceff3', '#2b3f8f', '#d94f2b'],
  },
  {
    id: 'ring-of-nergal',
    label: '高达 Reconguista in G',
    short: 'RING OF NERGAL',
    palette: ['#e9ecec', '#3f6b52', '#8a9a6b'],
  },
  { id: 'pilot-season', label: '雷霆宙域', short: 'PILOT SEASON', palette: ['#e8ebef', '#4a5a86', '#c8463a'] },
  { id: 'v-gundam', label: '机动战士高达 V', short: 'V GUNDAM', palette: ['#eceff3', '#b03a2e', '#2b3f8f'] },
  { id: 'g-gundam', label: '机动武斗传 G 高达', short: 'G GUNDAM', palette: ['#e8ebef', '#2f5fa8', '#c0432f'] },
  { id: 'wfm', label: '机动战士高达 水星的魔女', short: 'WFM', palette: ['#eceff3', '#c4553f', '#2f5fa8'] },
  { id: 'sd-gundam', label: 'SD 高达', short: 'SD GUNDAM', palette: ['#e6e9ee', '#7d8894', '#c0432f'] },
  {
    id: 'missing-link',
    label: '机动战士高达外传 MISSING LINK',
    short: 'MISSING LINK',
    palette: ['#e8ebef', '#3f5a8a', '#c0503c'],
  },
  { id: 'other', label: '其他作品', short: 'OTHER', palette: ['#e2e6ea', '#3c4a5c', '#7a8894'] },
];

const SERIES_MAP = new Map(SERIES.map((s) => [s.id, s]));
const GRADE_MAP = new Map(GRADES.map((g) => [g.id, g]));
const CHANNEL_MAP = new Map(CHANNELS.map((c) => [c.id, c]));

export function seriesMeta(id: SeriesId | string): SeriesMeta {
  return SERIES_MAP.get(id as SeriesId) ?? SERIES_MAP.get('other')!;
}

export function gradeMeta(id: GradeId | string): GradeMeta {
  return GRADE_MAP.get(id as GradeId) ?? GRADES[1];
}

export function channelMeta(id: ChannelId | string): ChannelMeta {
  return CHANNEL_MAP.get(id as ChannelId) ?? CHANNEL_MAP.get('general')!;
}

/* -------------------------------------------------------------------------- */
/* 查询                                                                        */
/* -------------------------------------------------------------------------- */

/** 全部条目，按发售时间倒序（新的在前） */
export const KITS: GundamKit[] = [...GUNDAM_KITS].sort(
  (a, b) => releaseSortKey(b.released) - releaseSortKey(a.released) || a.name.localeCompare(b.name, 'zh-Hans-CN'),
);

export function getKit(id: string): GundamKit | undefined {
  return KITS.find((k) => k.id === id);
}

export function kitHref(kit: GundamKit): string {
  return `/data/gundam/${kit.id}/`;
}

/** 发售年月 → 可比较的数值。日期不完整时按年处理，月/日缺失补 1 */
export function releaseSortKey(released: string): number {
  const m = /^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/.exec(released ?? '');
  if (!m) return 0;
  const y = Number(m[1]);
  const mo = Number(m[2] ?? 1);
  const d = Number(m[3] ?? 1);
  return y * 10000 + mo * 100 + d;
}

export function releaseYear(released: string): number {
  const m = /^(\d{4})/.exec(released ?? '');
  return m ? Number(m[1]) : 0;
}

/** 2026-12 → 2026年12月；2026 → 2026年 */
export function releaseLabel(released: string): string {
  const m = /^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/.exec(released ?? '');
  if (!m) return '—';
  if (!m[2]) return `${m[1]} 年`;
  if (!m[3]) return `${m[1]} 年 ${Number(m[2])} 月`;
  return `${m[1]} 年 ${Number(m[2])} 月`;
}

/** 精确到月或日时给一个短标签，用于卡片角标 */
export function releaseShort(released: string): string {
  const m = /^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/.exec(released ?? '');
  if (!m) return '';
  if (!m[2]) return m[1];
  if (!m[3]) return `${m[1]}.${String(Number(m[2])).padStart(2, '0')}`;
  return `${m[1]}.${String(Number(m[2])).padStart(2, '0')}.${String(Number(m[3])).padStart(2, '0')}`;
}

export function formatJPY(value: number): string {
  if (!value) return '—';
  return `¥${value.toLocaleString('en-US')}`;
}

/** 搜索用的归一化文本：小写、去掉空格与标点，中日文原样保留 */
export function searchHaystack(kit: GundamKit): string {
  return [
    kit.name,
    kit.nameJa,
    kit.id,
    kit.maker,
    kit.grade,
    gradeMeta(kit.grade).full,
    seriesMeta(kit.series).label,
    seriesMeta(kit.series).short,
    channelMeta(kit.channel).label,
    kit.scale,
    ...kit.tags,
  ]
    .join(' ')
    .toLowerCase()
    .replace(/[\s　·・,，.。/\\()（）\-_]/g, '');
}

export interface FacetCount<T extends string> {
  id: T;
  label: string;
  count: number;
}

export function countBy<T extends string>(
  kits: GundamKit[],
  pick: (kit: GundamKit) => T,
  label: (id: T) => string,
): FacetCount<T>[] {
  const map = new Map<T, number>();
  for (const kit of kits) {
    const key = pick(kit);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([id, count]) => ({ id, label: label(id), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-Hans-CN'));
}

/** 年代分组，按十年一档 */
export function decadeOf(year: number): string {
  if (!year) return '未知';
  return `${Math.floor(year / 10) * 10}s`;
}

/**
 * 相关条目：同系列优先，其次同等级；同一档里发售时间接近的更有参考价值。
 */
export function relatedKits(kit: GundamKit, all: GundamKit[], limit = 6): GundamKit[] {
  const score = (other: GundamKit) => {
    if (other.id === kit.id) return -1;
    let s = 0;
    if (other.series === kit.series) s += 100;
    if (other.grade === kit.grade) s += 40;
    if (other.channel === kit.channel) s += 8;
    const gap = Math.abs(releaseYear(other.released) - releaseYear(kit.released));
    s += Math.max(0, 20 - gap);
    return s;
  };
  return all
    .map((k) => ({ k, s: score(k) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s || releaseSortKey(b.k.released) - releaseSortKey(a.k.released))
    .slice(0, limit)
    .map((x) => x.k);
}

/** 库里出现过的全部等级，按固定顺序 */
export function gradesInUse(kits: GundamKit[] = KITS): GradeMeta[] {
  const used = new Set(kits.map((k) => k.grade));
  return GRADES.filter((g) => used.has(g.id));
}

/** 库里出现过的全部系列，按条目数倒序 */
export function seriesInUse(kits: GundamKit[] = KITS): SeriesMeta[] {
  const counts = countBy(kits, (k) => k.series, (id) => seriesMeta(id).label);
  const order = new Map(counts.map((c, i) => [c.id, i]));
  return SERIES.filter((s) => order.has(s.id)).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
}
