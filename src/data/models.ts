/**
 * 模型数据库 · 数据模型、分类表与检索工具
 * ---------------------------------------------------------------------------
 * 这条数据链是分层的，每一层都可以单独检查：
 *
 *   事实层  src/data/models.*.json    人工核实过的原始记录，人可读
 *   转换层  scripts/build-models-data.mjs 合并、去重、校验、排序
 *   渲染层  src/data/models.kits.ts    生成的类型化模块，页面只读它
 *
 * 页面上任何一条记录都能顺着 source 字段回到最初的出处；没有出处的记录
 * 一律 verified: false，界面上会明确标出来，而不是混在已核实条目里。
 *
 * 库覆盖多家厂商的产品——万代（塑料模型、拼装模型、食玩）、寿屋、良笑、
 * 魔动核等。所以分类表都是**开放词表**：厂商、产品品类（品类 id 前缀即厂商）
 * 与作品线各自成套，不是一套写死的枚举值。
 */

import { MODEL_KITS } from './models.kits';
/** 开放词表的作品线目录，由 scripts/build-models-data.mjs 生成 */
import SERIES_CATALOG from './models.series.json';

/* -------------------------------------------------------------------------- */
/* 厂商                                                                        */
/* -------------------------------------------------------------------------- */

export type MakerId = 'bandai' | 'kotobukiya' | 'goodsmile' | 'modhtoy';

export interface MakerMeta {
  id: MakerId;
  /** 中文厂牌名 */
  label: string;
  /** 英文／原名 */
  labelEn: string;
  /** 官网 */
  site: string;
  /** 总部所在市场：日厂还是国产 */
  origin: 'jp' | 'cn';
  /** 一句话定位 */
  brief: string;
}

export const MAKERS: MakerMeta[] = [
  {
    id: 'bandai',
    label: '万代',
    labelEn: 'BANDAI SPIRITS',
    site: 'https://www.bandaihobbysite.cn/',
    origin: 'jp',
    brief: '塑料模型（Gunpla）的大厂，MG / RG / HG / SD 全线，另有高达集结与拼装模型。',
  },
  {
    id: 'kotobukiya',
    label: '寿屋',
    labelEn: 'KOTOBUKIYA',
    site: 'https://www.kotobukiya.co.jp/',
    origin: 'jp',
    brief: '硬派机甲与静态拼装模型的老厂牌，拼装模型、支援单元与等身手办都做。',
  },
  {
    id: 'goodsmile',
    label: '良笑',
    labelEn: 'GOOD SMILE COMPANY',
    site: 'https://www.goodsmile.info/',
    origin: 'jp',
    brief: 'figma、Nendoroid、比例手办、MODEROID 等，手办与角色模型的头部厂牌。',
  },
  {
    id: 'modhtoy',
    label: '魔动核',
    labelEn: 'MO DONG HE',
    site: 'http://mdhtoy.com/',
    origin: 'cn',
    brief: '东莞东秀的国产机甲品牌，《星甲魂将传》等原创 IP 的超可动拼装与成品。',
  },
];

const MAKER_MAP = new Map(MAKERS.map((m) => [m.id, m]));

export function makerMeta(id: MakerId | string): MakerMeta {
  return MAKER_MAP.get(id as MakerId) ?? MAKER_MAP.get('bandai')!;
}

/* -------------------------------------------------------------------------- */
/* 品类                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * 产品品类。
 *
 * 品类是厂商内部的概念，所以 id 前缀就是厂商（`bandai:hg`、`gsc:figma`）。
 * 塑料模型的「等级」与手办的「比例手办」在同一个维度上：它们都是「这家厂把产品
 * 分成哪几类」的答案。
 */
export interface CategoryMeta {
  id: string;
  maker: MakerId;
  label: string;
  /** 英文名或缩写（MG、figma…） */
  short?: string;
  /** 常见比例，品类没有比例概念时留空 */
  scale?: string;
  /** 一句话定位 */
  brief: string;
}

export const CATEGORIES: CategoryMeta[] = [
  /* ---- 万代：塑料模型等级 ---------------------------------------------- */
  { id: 'bandai:pg', maker: 'bandai', label: 'PG', short: 'PG', scale: '1/100', brief: '顶点完成度，骨架与分色最讲究' },
  { id: 'bandai:mg', maker: 'bandai', label: 'MG', short: 'MG', scale: '1/100', brief: '1/100 的骨架主力，变形与内构兼顾' },
  { id: 'bandai:mgsd', maker: 'bandai', label: 'MGSD', short: 'MGSD', scale: 'SD 比例', brief: 'SD 造型配上 MG 级别的技术' },
  { id: 'bandai:rg', maker: 'bandai', label: 'RG', short: 'RG', scale: '1/144', brief: '1/144 的高密度内构，细节最扎' },
  { id: 'bandai:hg', maker: 'bandai', label: 'HG', short: 'HG', scale: '1/144', brief: '量最大、门槛最低的主流线' },
  { id: 'bandai:fg', maker: 'bandai', label: 'FG', short: 'FG', scale: '1/144', brief: '骨架结构简单、拼装轻松' },
  { id: 'bandai:sd', maker: 'bandai', label: 'SD', short: 'SD', scale: '非等比', brief: 'Q 版比例，造型取巧、单价低' },
  { id: 'bandai:eg', maker: 'bandai', label: 'EG', short: 'EG', scale: '1/144', brief: '平价入门，零件少、成型好' },
  { id: 'bandai:fm', maker: 'bandai', label: 'FM', short: 'FM', scale: '1/100', brief: '早期的高完成度线，现已停摆' },
  { id: 'bandai:mr', maker: 'bandai', label: 'MR', short: 'MR', scale: '约 1/100', brief: 'METAL ROBOT 魂，完成品，高度还原的收藏向' },
  { id: 'bandai:ga', maker: 'bandai', label: 'GA', short: 'GA', scale: '约 50mm', brief: '高达集结：桌面战棋用的拼装兵人' },
  { id: 'bandai:other', maker: 'bandai', label: '万代其它', brief: '拼装模型、食玩与其它万代产品线' },

  /* ---- 寿屋 ---------------------------------------------------------- */
  { id: 'kotobukiya:kit', maker: 'kotobukiya', label: '拼装模型', short: 'KIT', brief: 'プラモデル本体——寿屋的主力塑料模型' },
  { id: 'kotobukiya:support', maker: 'kotobukiya', label: '支援单元', short: 'M.S.G', brief: 'M.S.G 支援单元，装在机体上当武器与装备' },
  { id: 'kotobukiya:option', maker: 'kotobukiya', label: '选件', short: 'OPTION', brief: '塑料模型选件与追加配件' },
  { id: 'kotobukiya:figure', maker: 'kotobukiya', label: '等身手办', short: 'FIGURE', scale: '1/6、1/8 等', brief: '等身比例的涂装完成品与可动手办' },
  { id: 'kotobukiya:otherfigure', maker: 'kotobukiya', label: '其它手办', short: 'FIG', brief: '非等身比例的手办与套组' },
  { id: 'kotobukiya:garage', maker: 'kotobukiya', label: '树脂老kit', short: 'GARAGE', brief: 'ガレージキット——早期的一体成型树脂套件' },
  { id: 'kotobukiya:goods', maker: 'kotobukiya', label: '寿屋周边', short: 'GOODS', brief: '角色周边与杂货' },
  { id: 'kotobukiya:other', maker: 'kotobukiya', label: '寿屋其它', brief: '工具、贴纸与其它产品线' },

  /* ---- 良笑 ---------------------------------------------------------- */
  { id: 'goodsmile:figma', maker: 'goodsmile', label: 'figma', short: 'figma', scale: '1/12 等', brief: '可动人形手办，自有与授权作品都在这条线' },
  { id: 'goodsmile:nendoroid', maker: 'goodsmile', label: 'Nendoroid', short: 'Nendo', scale: '约 10cm', brief: 'Q 版可动人偶，尺寸小价格低' },
  { id: 'goodsmile:scale', maker: 'goodsmile', label: '比例手办', short: 'Scale', scale: '1/7、1/8 等', brief: '等身比例的收藏级手办' },
  { id: 'goodsmile:stiky', maker: 'goodsmile', label: 'STICKY FIGURE', short: 'STICKY', brief: '良笑自家的原创角色「企鹅」' },
  { id: 'goodsmile:pixel', maker: 'goodsmile', label: 'PIXEL', short: 'PIXEL', brief: '像素造型的可动手办' },
  { id: 'goodsmile:mecha', maker: 'goodsmile', label: 'Mecha Smile', short: 'Mecha', brief: '机甲与机械的 Q 版可动人偶' },
  { id: 'goodsmile:modroid', maker: 'goodsmile', label: 'MODEROID', short: 'MODEROID', brief: '塑料模型线，盒胶与拼装形态的取舍' },
  { id: 'goodsmile:plamatea', maker: 'goodsmile', label: 'PLAMATEA', short: 'PLAMATEA', brief: '角色比例塑料模型' },
  { id: 'goodsmile:other', maker: 'goodsmile', label: '良笑其它', brief: '毛绒、卡牌、周边与其它产品线' },
  { id: 'goodsmile:goods', maker: 'goodsmile', label: '良笑周边', short: 'GOODS', brief: '杯垫、立牌、挂件等杂货周边' },

  /* ---- 魔动核 -------------------------------------------------------- */
  { id: 'modhtoy:action', maker: 'modhtoy', label: '超可动拼装', short: '拼装', brief: '国产机甲的可动拼装模型' },
  { id: 'modhtoy:alloy', maker: 'modhtoy', label: '合金成品', short: '合金', brief: '合金材质涂装完成品' },
  { id: 'modhtoy:finished', maker: 'modhtoy', label: '超可动成品', short: '成品', brief: '预涂装的可动人偶' },
  { id: 'modhtoy:small', maker: 'modhtoy', label: '小比例', short: '小比例', brief: '小尺寸的机甲与角色产品' },
  { id: 'modhtoy:toy', maker: 'modhtoy', label: '机甲潮玩', short: '潮玩', brief: '机甲造型的手办与潮玩' },
  { id: 'modhtoy:other', maker: 'modhtoy', label: '魔动核其它', brief: '其它产品线' },
];

const CATEGORY_MAP = new Map(CATEGORIES.map((c) => [c.id, c]));

export function categoryMeta(id: string): CategoryMeta {
  return (
    CATEGORY_MAP.get(id) ?? {
      id,
      maker: 'bandai',
      label: id.includes(':') ? id.split(':')[1].toUpperCase() : id,
      brief: '',
    }
  );
}

/* -------------------------------------------------------------------------- */
/* 作品线                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * 作品线。
 *
 * 塑料模型这边是「机动战士高达 UC」这种机体作品；手办那边是「初音未来」这种
 * 角色 IP。都是「这款产品属于哪部作品」的答案，所以放在同一张表里。
 */
export interface SeriesMeta {
  id: string;
  maker: MakerId;
  label: string;
  /** 短代号，印在封面上 */
  short?: string;
  /** 配色 [主色, 副色, 点缀色] —— 封面线稿按这三色上色 */
  palette: [string, string, string];
  /** 库里有几条属于这条作品线 */
  count?: number;
}

/**
 * 人工整理的作品线。
 *
 * 万代那边是官网的作品分类页给出的一套固定分类，每条都有人工挑的配色；
 * 魔动核那边是两个原创 IP。寿屋与良笑的作品名来自各自的官网，是开放词表，
 * 由 scripts/build-models-data.mjs 生成到 models.series.json 里。
 */
const CURATED_SERIES: SeriesMeta[] = [
  { id: 'uc', maker: 'bandai', label: '机动战士高达 UC', short: 'UC', palette: ['#e3e8ee', '#33518f', '#c0432f'] },
  { id: 'hathaway', maker: 'bandai', label: '闪光的哈萨维', short: 'HATHAWAY', palette: ['#e8e3d8', '#46536b', '#8f9aa8'] },
  { id: 'gundam-x', maker: 'bandai', label: '机动新世纪高达X', short: 'GUNDAM X', palette: ['#e4e9ef', '#2f6fb0', '#d24a35'] },
  { id: 'gquuuuuux', maker: 'bandai', label: '机动战士 Gundam GQuuuuuuX', short: 'GQuuuuuuX', palette: ['#eceae4', '#2b3a5c', '#c0503c'] },
  { id: 'seed', maker: 'bandai', label: '机动战士高达 SEED', short: 'SEED', palette: ['#e6eaef', '#2f5fa8', '#d6482f'] },
  { id: 'seed-destiny', maker: 'bandai', label: '机动战士高达 SEED DESTINY', short: 'SEED DESTINY', palette: ['#e7ebf0', '#3a6ab0', '#d64a30'] },
  { id: 'seed-freedom', maker: 'bandai', label: '机动战士高达 SEED FREEDOM', short: 'SEED FREEDOM', palette: ['#eef1f4', '#2d5a9e', '#d13a2c'] },
  { id: 'w', maker: 'bandai', label: '新机动战记高达 W', short: 'GUNDAM W', palette: ['#edf0f4', '#2b3f8f', '#dfb73a'] },
  { id: '0080', maker: 'bandai', label: '机动战士高达 0080', short: '0080', palette: ['#e7e9ed', '#3c4a5c', '#c0a44a'] },
  { id: '0083', maker: 'bandai', label: '高达 0083 星屑的回忆', short: '0083', palette: ['#dfe4ea', '#4a5a70', '#b8563c'] },
  { id: '0093', maker: 'bandai', label: '机动战士高达 0093', short: '0093', palette: ['#e5e9ee', '#37507f', '#c25338'] },
  { id: '0094', maker: 'bandai', label: '机动战士高达 0094', short: '0094', palette: ['#dde1e6', '#2f4f8f', '#c86a2a'] },
  { id: '08ms', maker: 'bandai', label: '第 08MS 小队', short: '08MS', palette: ['#e4e7ec', '#2f4f8f', '#c0503c'] },
  { id: 'zz', maker: 'bandai', label: '机动战士高达 ZZ', short: 'ZZ', palette: ['#e9ecf0', '#4a5a86', '#c8463a'] },
  { id: 'zeta', maker: 'bandai', label: '机动战士高达 Z', short: 'ZETA', palette: ['#e6e9ed', '#2f4f8f', '#b9342c'] },
  { id: 'f91', maker: 'bandai', label: '机动战士高达 F91', short: 'F91', palette: ['#d9dde2', '#3a3f4a', '#b03a2e'] },
  { id: 'gundam-build', maker: 'bandai', label: '高达 Build 系列', short: 'BUILD', palette: ['#eceff3', '#d94f2b', '#2b3f8f'] },
  { id: 'iron-blooded', maker: 'bandai', label: '铁血的奥尔芬斯', short: 'IRON-BLOODED', palette: ['#7a756c', '#b08d3f', '#2f4f8f'] },
  { id: 'wing-gundam', maker: 'bandai', label: '飞翼高达', short: 'WING GUNDAM', palette: ['#f0f2f4', '#2b3f8f', '#e0b83a'] },
  { id: 'gundam-duelists', maker: 'bandai', label: '高达决斗者', short: 'DUELISTS', palette: ['#e8ebef', '#b03a2e', '#2b3f8f'] },
  { id: 'stargazer', maker: 'bandai', label: '无用则已', short: 'STARGAZER', palette: ['#46515f', '#c0503c', '#d8dde3'] },
  { id: 'crossbone-g', maker: 'bandai', label: '机动战士高达 G', short: 'CROSSBONE G', palette: ['#e9ebef', '#5a6a7a', '#d84a3a'] },
  { id: 'gundam-00', maker: 'bandai', label: '机动战士高达 00', short: 'GUNDAM 00', palette: ['#e8ecf1', '#2f5fa8', '#d98436'] },
  { id: 'gundam-age', maker: 'bandai', label: '机动战士高达 AGE', short: 'GUNDAM AGE', palette: ['#eef1f4', '#d9b23c', '#2f5fa8'] },
  { id: 'gundam-nt', maker: 'bandai', label: '机动战士高达 NT', short: 'GUNDAM NT', palette: ['#e6e9ee', '#2c3a5c', '#8f9bb0'] },
  { id: 'gundam-mv', maker: 'bandai', label: '库库鲁斯·多安的小岛', short: 'GUNDAM MV', palette: ['#e9ecef', '#3f6b8f', '#c8a24a'] },
  { id: 'gundam-front', maker: 'bandai', label: '高达前哨战', short: 'GUNDAM FRONT', palette: ['#e7eaee', '#39506f', '#b04a3a'] },
  { id: 'gundam-moon', maker: 'bandai', label: '机动战士 MOON 高达', short: 'MOON GUNDAM', palette: ['#e9ecf0', '#4a5a86', '#c8b45a'] },
  { id: 'gundam-xarx-zero', maker: 'bandai', label: '机动战士高达 RG XARX-ZERO', short: 'XARX-ZERO', palette: ['#eceff3', '#2f4f8f', '#d94f2b'] },
  { id: 'gundam-build-divers', maker: 'bandai', label: '高达破坏者 对战记录', short: 'BUILD DIVERS', palette: ['#eceff3', '#2f4f8f', '#d94f2b'] },
  { id: 'ring-of-nergal', maker: 'bandai', label: '高达 Reconguista in G', short: 'RING OF NERGAL', palette: ['#e9ecec', '#3f6b52', '#8a9a6b'] },
  { id: 'pilot-season', maker: 'bandai', label: '雷霆宙域', short: 'PILOT SEASON', palette: ['#e8ebef', '#4a5a86', '#c8463a'] },
  { id: 'v-gundam', maker: 'bandai', label: '机动战士高达 V', short: 'V GUNDAM', palette: ['#eceff3', '#b03a2e', '#2f4f8f'] },
  { id: 'g-gundam', maker: 'bandai', label: '机动武斗传 G 高达', short: 'G GUNDAM', palette: ['#e8ebef', '#2f5fa8', '#c0432f'] },
  { id: 'wfm', maker: 'bandai', label: '机动战士高达 水星的魔女', short: 'WFM', palette: ['#eceff3', '#2f4f8f', '#c4553f'] },
  { id: 'sd-gundam', maker: 'bandai', label: 'SD 高达', short: 'SD GUNDAM', palette: ['#e6e9ee', '#7d8894', '#c0432f'] },
  { id: 'missing-link', maker: 'bandai', label: '机动战士高达外传 MISSING LINK', short: 'MISSING LINK', palette: ['#e8ebef', '#3f5a8a', '#c0503c'] },
  { id: 'gundam-assemble', maker: 'bandai', label: '高达集结 GUNDAM ASSEMBLE', short: 'ASSEMBLE', palette: ['#e4e8ec', '#2f4f8f', '#d94f2b'] },
  { id: 'non-gundam', maker: 'bandai', label: '非高达作品', short: 'OTHER IP', palette: ['#e4e4e4', '#5a5a5a', '#8a7a6a'] },
  { id: 'other', maker: 'bandai', label: '其他作品', short: 'OTHER', palette: ['#e2e6ea', '#3c4a5c', '#7a8894'] },

  /* ---- 魔动核 -------------------------------------------------------- */
  { id: 'xjhcz', maker: 'modhtoy', label: '星甲魂将传', short: '星甲', palette: ['#8c2f2f', '#d8a03c', '#2b2b3a'] },
  { id: 'gthq', maker: 'modhtoy', label: '钢铁契约', short: '钢铁', palette: ['#3a4a6a', '#8fb8d8', '#e0e4e8'] },
];

/**
 * 开放词表的作品线目录（生成物）。
 *
 * 寿屋与良笑的作品名来自各自的官网，日文与中文都有，没法直接当目录名，
 * 所以脚本用作品名的哈希做 id。文件由 scripts/build-models-data.mjs 写出。
 */
const CATALOG_SERIES = (SERIES_CATALOG as SeriesMeta[]).filter(
  (s) => !CURATED_SERIES.some((c) => c.id === s.id),
);

export const SERIES: SeriesMeta[] = [...CURATED_SERIES, ...CATALOG_SERIES];

const SERIES_MAP = new Map(SERIES.map((s) => [s.id, s]));

export function seriesMeta(id: string): SeriesMeta {
  return (
    SERIES_MAP.get(id) ?? {
      id,
      maker: 'bandai',
      label: id,
      short: id.toUpperCase().slice(0, 10),
      palette: ['#e2e6ea', '#3c4a5c', '#7a8894'],
    }
  );
}

/* -------------------------------------------------------------------------- */
/* 销售渠道                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * 销售渠道。
 *
 * 万代这边是「一般销售 / PB 限定 / 高达基地限定 / 网络限定」；别家是「通常版 /
 * 初回限定版 / 店铺限定 / 会场配布」。同一个维度，词表按厂商各添。
 */
export interface ChannelMeta {
  id: string;
  maker: MakerId | 'all';
  label: string;
  brief: string;
}

export const CHANNELS: ChannelMeta[] = [
  { id: 'general', maker: 'all', label: '一般销售', brief: '常规零售渠道可买到' },
  { id: 'pb', maker: 'bandai', label: 'PB 限定', brief: 'Premium Bandai 独占' },
  { id: 'gb', maker: 'bandai', label: '高达基地限定', brief: 'GUNDAM BASE 店限定' },
  { id: 'wt', maker: 'bandai', label: '网络限定', brief: '官方线上商店专属' },
  { id: 'limited', maker: 'all', label: '限定版', brief: '有数量或销售期限制的版本' },
  { id: 'exclusive', maker: 'all', label: '店铺 / 会场限定', brief: '只在特定店铺或会场发售' },
  { id: 'web', maker: 'all', label: '网络限定', brief: '只在官方线上商店发售' },
];

const CHANNEL_MAP = new Map(CHANNELS.map((c) => [c.id, c]));

export function channelMeta(id: string): ChannelMeta {
  return CHANNEL_MAP.get(id) ?? CHANNEL_MAP.get('general')!;
}

/* -------------------------------------------------------------------------- */
/* 主题（机体 / 角色 / 作品）                                                   */
/* -------------------------------------------------------------------------- */

/** 高达集结套装里收录的兵人 */
export interface AssembleUnit {
  /** 官方单元卡编号，如 ST01-U01 */
  code: string;
  /** 机体编号，如 RX-78-2 */
  designation: string;
  /** 中文名 */
  name: string;
  /** 官方日文名 */
  nameJa: string;
  /** 该机体出自哪条作品线 */
  series: string;
}

/** 主题的类型：机体、角色，还是整部作品 */
export type SubjectKind = 'mech' | 'character' | 'work';

/* -------------------------------------------------------------------------- */
/* 产品                                                                        */
/* -------------------------------------------------------------------------- */

/** 一条模型记录的完整形状。字段的语义见 src/content/data/models-database.md */
export interface ModelProduct {
  id: string;
  /** 中文品名，界面上显示的主标题 */
  name: string;
  /** 官方日文品名 */
  nameJa: string;
  /** 厂商 */
  maker: MakerId;
  /** 产品品类，如 bandai:hg、goodsmile:figma */
  category: string;
  /** 作品线，如 uc、figma */
  series: string;
  /** 比例，如 1/100、1/12；不按比例出品的品类留空 */
  scale: string;
  /** YYYY | YYYY-MM | YYYY-MM-DD */
  released: string;
  /** 官方建议零售价（含税，日元）。0 表示未查到 */
  priceJpy: number;
  /**
   * 中国内地官方零售价（元）。
   *
   * 限定品常在中文站公布人民币价而没有日元建议零售价——这类条目靠这个字段
   * 才有价可显示。0 表示未公布。
   */
  priceCny: number;
  /** 销售渠道 */
  channel: string;
  /** 官方拼装难度 1–5 */
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
   * 不直接引用厂牌的 CDN——既不依赖对方服务器，也不至于把请求量转嫁过去。
   * 没有图片的条目回落到手绘封面。
   */
  image: string | null;
  /** 官方商品图的原始 URL，保留以便溯源 */
  imageUrl: string | null;
  /**
   * 定价所含的税率：10 或 8。
   *
   * 2019 年 10 月之前日本消费税是 8%，那之前发售的模型，官方标的是
   * 「8% 税込」；之后是 10%。这个数字来自厂牌官网的価格栏。
   */
  taxRate: number | null;
  /** 厂牌官网上的商品页，作为日文名与定价的出处 */
  sourceJp: string | null;
  /** 收录的兵人（高达集结专用） */
  units?: AssembleUnit[];
  /**
   * 主题名——这条产品是关于谁的。
   *
   * 塑料模型这边是机体（「RX-78-2 高达」），手办那边是角色（「初音未来」）。
   * 同一个机体的各等级与各配色会归到同一个主题，用来把版本串起来。
   */
  subject: string | null;
  /** 主题的检索键，同时是它的页面地址 */
  subjectId: string | null;
  /** 主题的类型 */
  subjectKind: SubjectKind | null;
  /** 其它常见写法：英文名、俗称、旧译、机体编号。检索时一并匹配。 */
  aliases: string[];
}

/* -------------------------------------------------------------------------- */
/* 查询                                                                        */
/* -------------------------------------------------------------------------- */

/** 全部产品，按发售时间倒序（新的在前） */
export const PRODUCTS: ModelProduct[] = [...MODEL_KITS].sort(
  (a, b) => releaseSortKey(b.released) - releaseSortKey(a.released) || a.name.localeCompare(b.name, 'zh-Hans-CN'),
);

export function getProduct(id: string): ModelProduct | undefined {
  return PRODUCTS.find((k) => k.id === id);
}

export function productHref(product: ModelProduct): string {
  return `/data/models/${product.id}/`;
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
export function searchHaystack(product: ModelProduct): string {
  return [
    product.name,
    product.nameJa,
    product.id,
    product.maker,
    categoryMeta(product.category).label,
    categoryMeta(product.category).short ?? '',
    seriesMeta(product.series).label,
    seriesMeta(product.series).short ?? '',
    channelMeta(product.channel).label,
    product.scale,
    product.subject ?? '',
    ...product.aliases,
    ...product.tags,
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
  products: ModelProduct[],
  pick: (product: ModelProduct) => T,
  label: (id: T) => string,
): FacetCount<T>[] {
  const map = new Map<T, number>();
  for (const product of products) {
    const key = pick(product);
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
 * 相关产品：同作品线优先，其次同品类；同一档里发售时间接近的更有参考价值。
 */
export function relatedProducts(product: ModelProduct, all: ModelProduct[], limit = 6): ModelProduct[] {
  const score = (other: ModelProduct) => {
    if (other.id === product.id) return -1;
    let s = 0;
    if (other.series === product.series) s += 100;
    if (other.category === product.category) s += 40;
    if (other.channel === product.channel) s += 8;
    const gap = Math.abs(releaseYear(other.released) - releaseYear(product.released));
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

/** 库里出现过的全部品类，按条目数倒序 */
export function categoriesInUse(products: ModelProduct[] = PRODUCTS): CategoryMeta[] {
  const counts = countBy(products, (p) => p.category, (id) => categoryMeta(id).label);
  const order = new Map(counts.map((c, i) => [c.id, i]));
  return CATEGORIES.filter((c) => order.has(c.id)).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
}
