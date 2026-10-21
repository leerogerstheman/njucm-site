/**
 * 等级判定
 * ---------------------------------------------------------------------------
 * 万代官方中文站的品名格式并不统一，同一个等级能以好几种写法开头：
 *
 *   HG 1/144 RX-78-2 高达              等级在最前（多数）
 *   高达基地限定 HG 1/144 命运高达       渠道徽章在等级前面
 *   第二批 万代模型 RG 1/144 ν高达      批次标记在最前
 *   1/100 FULL MECHANICS 高达巴耶力     比例在等级前面
 *   Ｈ.G 1/144 强人奔流                  全角字母（源站的错字）
 *
 * 判定等级之前先把这些前缀剥掉、全角转半角，否则这些产品会被当成
 * 「不是模型」丢掉——本库里的 SEED 一度只有 16 款 HG 就是这么丢的。
 */

/** 等级 → 规范 id。顺序有意义：先长后短（HGUC 要在 HG 前面） */
export const GRADE_RULES = [
  [/^HGUC/i, 'HG'],
  [/^HG/i, 'HG'],
  [/^RG/i, 'RG'],
  [/^FG/i, 'FG'],
  [/^MG\s*Ver\.?\s*Ka/i, 'MG'],
  [/^MGSD/i, 'MGSD'],
  [/^MGEX/i, 'MG'],
  [/^RE\s*\/\s*100/i, 'MG'],
  [/^MG/i, 'MG'],
  [/^PG/i, 'PG'],
  [/^ENTRY\s*GRADE/i, 'EG'],
  [/^EG/i, 'EG'],
  [/^FULL\s*MECHANICS/i, 'FM'],
  [/^FM/i, 'FM'],
  [/^HIRM/i, 'HIRM'],
  [/^SDCS/i, 'SD'],
  [/^SDEX/i, 'SD'],
  [/^METAL\s*ROBOT/i, 'MR'],
  [/^HIGH[- ]?RESOLUTION/i, 'MR'],
  [/^SD\b/i, 'SD'],
  [/^Figure[- ]?rise/i, 'FIG'],
  [/^BB/i, null],
];

/**
 * 渠道与批次前缀。
 *
 * 这些词标的是「怎么卖」而不是「是什么」，判定等级时要先剥掉。
 */
const LEADING_PREFIX =
  /^(?:(?:高达基地限定|GUNDAM\s*BASE\s*限定|限定品|PB\s*限定|Premium\s*Bandai|网络限定|网上限定|线上限定|线上售卖|活动限定|预售)\s*)+/i;

/** 比例在最前：「1/100 FULL MECHANICS …」 */
const LEADING_SCALE = /^1\/\d+\s+/;

/** 批次标记：「第二批 万代模型 …」 */
const LEADING_BATCH = /^第[一二三四五六七八九十百千\d]+批\s*万代模型\s*/;

/**
 * 全角拉丁字母与数字转半角。
 *
 * 源站偶尔写成「Ｈ.G 1/144 …」，只动这一段字符，
 * 中文括号之类保持原样。
 */
export function halfWidthLatin(text) {
  return text.replace(/[！-～]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0),
  );
}

/**
 * 判定等级用的名字：全角转半角、剥掉渠道与批次前缀、剥掉开头的比例。
 */
export function normalizeForMatch(name) {
  let s = halfWidthLatin(name).trim();
  s = s.replace(LEADING_BATCH, '');
  s = s.replace(LEADING_PREFIX, '');
  s = s.replace(LEADING_SCALE, '');
  return s.trim();
}

/**
 * 存进数据里的名字：剥掉批次标记（它不是产品名的一部分），
 * 渠道徽章保留——它说明这件产品怎么卖，界面上也要显示。
 */
export function cleanName(name) {
  return halfWidthLatin(name).replace(LEADING_BATCH, '').replace(/\s+/g, ' ').trim();
}

/** 等级判定。返回 null 表示这不是模型（或是不收的产品线） */
export function gradeOf(name) {
  const s = normalizeForMatch(name);
  for (const [re, grade] of GRADE_RULES) {
    if (re.test(s)) return grade;
  }
  return null;
}

/** 品名里已经带着产品线名的等级——拼装时不要再补一遍前缀 */
export const NAME_CARRIES_LINE = new Set(['HIRM', 'FIG']);

/**
 * 比例。
 *
 * 优先从品名里取；取不到就按等级的惯例猜。
 * 人偶（FIG）没有统一比例，留空。
 */
export function scaleOf(grade, name) {
  if (grade === 'FIG') return '';
  const m = /(1\/\d+)/.exec(name);
  if (m) return m[1];
  if (grade === 'SD') return 'SD 比例';
  if (grade === 'MR' || grade === 'HIRM') return '无比例';
  return grade === 'MG' || grade === 'PG' || grade === 'FM' ? '1/100' : '1/144';
}

/** 品名开头就是等级或产品线名的那些——补前缀时要认出来 */
const LINE_START =
  /^(?:HGUC|HG|RG|FG|MG|MS?SD|MGEX|PG|ENTRY\s*GRADE|EG|FULL\s*MECHANICS|FM|HIRM|SDCS|SDEX|METAL\s*ROBOT|HIGH[- ]?RESOLUTION|SD|Figure[- ]?rise)\b/i;

/**
 * 品名的最终写法。
 *
 * 源站自己的写法优先：「FULL MECHANICS 1/100 格雷兹·艾因」「MGEX 1/100 …」
 * 都保留原样。只在品名开头不是等级或产品线时，才补上「等级 比例」——
 * 同一台机器在不同等级下是彼此独立的商品，没有等级就分不清。
 */
export function productName(grade, scale, name) {
  const s = cleanName(name);
  if (LINE_START.test(s)) return s;

  /* 源站偶尔把比例写在最前：「1/100 FULL MECHANICS 高达巴耶力」 */
  const withoutScale = s.replace(/^1\/\d+\s+/, '');
  if (LINE_START.test(withoutScale)) return s;

  return `${grade} ${scale} ${withoutScale}`;
}

