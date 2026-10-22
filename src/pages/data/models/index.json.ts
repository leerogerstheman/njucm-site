/**
 * 列表页用的数据索引
 * ---------------------------------------------------------------------------
 * 1742 条记录如果全部内联进 HTML，列表页会有 2 MB。改成：HTML 里只放
 * 一页（60 张卡），完整数据由这个 JSON 提供，浏览器取回后自己渲染与分页。
 *
 * 行用数组而不是对象，字段顺序由 fields 定——同样一份数据，数组形式
 * 大概省掉三分之一的体积。
 */
import { PRODUCTS, seriesMeta, channelMeta, categoryMeta, makerMeta, SALE_STATUS_LABEL,
} from '../../../data/models';
import type { APIRoute } from 'astro';

export const GET: APIRoute = () => {
  const fields = [
    'id',
    'name',
    'maker',
    'nameJa',
    'category',
    'scale',
    'series',
    'channel',
    'released',
    'priceJpy',
    'priceCny',
    'image',
    'subject',
    'subjectId',
    'aliases',
    'tags',
    /* 对比页要用的几个字段。空的占位不少，但整库加起来也只多二十来 KB。 */
    'parts',
    'heightMm',
    'skillLevel',
    'material',
    'note',
    /* 商城那边���现状：现在能不能买到、现价多少 */
    'saleStatus',
    'salePriceJpy',
  ];

  const rows = PRODUCTS.map((kit) => [
    kit.id,
    kit.name,
    kit.maker,
    kit.nameJa,
    kit.category,
    kit.scale,
    kit.series,
    kit.channel,
    kit.released,
    kit.priceJpy,
    kit.priceCny,
    kit.image,
    kit.subject,
    kit.subjectId,
    kit.aliases,
    kit.tags,
    kit.parts,
    kit.heightMm,
    kit.skillLevel,
    kit.material,
    kit.note,
    kit.saleStatus,
    kit.salePriceJpy,
  ]);

  /*
   * 品类的排序顺序。
   *
   * 万代那十一条按「完成度从高到低」排，是人工定过的；别家厂商的品类
   * 按收录条数排，条数多的在前——这样「按品类排序」在综合库里也有意义。
   */
  const BANDAI_ORDER = [
    'bandai:pg',
    'bandai:mg',
    'bandai:mgsd',
    'bandai:rg',
    'bandai:mr',
    'bandai:fm',
    'bandai:ga',
    'bandai:fg',
    'bandai:hg',
    'bandai:eg',
    'bandai:sd',
  ];
  const categoryCounts = new Map<string, number>();
  for (const kit of PRODUCTS) {
    categoryCounts.set(kit.category, (categoryCounts.get(kit.category) ?? 0) + 1);
  }
  const categoryOrder = [
    ...BANDAI_ORDER.filter((id) => categoryCounts.has(id)),
    ...[...categoryCounts.entries()]
      .filter(([id]) => !BANDAI_ORDER.includes(id))
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id),
  ];

  const payload = {
    fields,
    series: Object.fromEntries(
      [...new Set(PRODUCTS.map((k) => k.series))].map((id) => [id, seriesMeta(id).label]),
    ),
    seriesShort: Object.fromEntries(
      [...new Set(PRODUCTS.map((k) => k.series))].map((id) => [id, seriesMeta(id).short]),
    ),
    categoryLabels: Object.fromEntries(
      [...new Set(PRODUCTS.map((k) => k.category))].map((id) => [id, categoryMeta(id).label]),
    ),
    categoryShort: Object.fromEntries(
      [...new Set(PRODUCTS.map((k) => k.category))].map((id) => [id, categoryMeta(id).short ?? id]),
    ),
    makers: Object.fromEntries(
      [...new Set(PRODUCTS.map((k) => k.maker))].map((id) => [id, makerMeta(id).label]),
    ),
    /* 厂牌的英文名——客户端渲染的封面角标用它 */
    makerEn: Object.fromEntries(
      [...new Set(PRODUCTS.map((k) => k.maker))].map((id) => [id, makerMeta(id).labelEn]),
    ),
    channels: Object.fromEntries(
      [...new Set(PRODUCTS.map((k) => k.channel))].map((id) => [id, channelMeta(id).label]),
    ),
    /* 商城在售状态的说法，客户端画角标用 */
    saleStatus: SALE_STATUS_LABEL,
    categories: Object.fromEntries(
      [...new Set(PRODUCTS.map((k) => k.category))].map((id) => [id, categoryMeta(id).brief]),
    ),
    categoryOrder,
    rows,
  };

  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
