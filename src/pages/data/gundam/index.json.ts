/**
 * 列表页用的数据索引
 * ---------------------------------------------------------------------------
 * 1742 条记录如果全部内联进 HTML，列表页会有 2 MB。改成：HTML 里只放
 * 一页（60 张卡），完整数据由这个 JSON 提供，浏览器取回后自己渲染与分页。
 *
 * 行用数组而不是对象，字段顺序由 fields 定——同样一份数据，数组形式
 * 大概省掉三分之一的体积。
 */
import { KITS, seriesMeta, channelMeta, gradeMeta } from '../../../data/gundam';
import type { APIRoute } from 'astro';

export const GET: APIRoute = () => {
  const fields = [
    'id',
    'name',
    'nameJa',
    'grade',
    'scale',
    'series',
    'channel',
    'released',
    'priceJpy',
    'priceCny',
    'image',
    'mech',
    'aliases',
    'tags',
    /* 对比页要用的几个字段。空的占位不少，但整库加起来也只多二十来 KB。 */
    'parts',
    'heightMm',
    'skillLevel',
    'material',
    'note',
  ];

  const rows = KITS.map((kit) => [
    kit.id,
    kit.name,
    kit.nameJa,
    kit.grade,
    kit.scale,
    kit.series,
    kit.channel,
    kit.released,
    kit.priceJpy,
    kit.priceCny,
    kit.image,
    kit.mech,
    kit.aliases,
    kit.tags,
    kit.parts,
    kit.heightMm,
    kit.skillLevel,
    kit.material,
    kit.note,
  ]);

  const payload = {
    fields,
    series: Object.fromEntries(
      [...new Set(KITS.map((k) => k.series))].map((id) => [id, seriesMeta(id).label]),
    ),
    seriesShort: Object.fromEntries(
      [...new Set(KITS.map((k) => k.series))].map((id) => [id, seriesMeta(id).short]),
    ),
    channels: Object.fromEntries(
      [...new Set(KITS.map((k) => k.channel))].map((id) => [id, channelMeta(id).label]),
    ),
    grades: Object.fromEntries(
      [...new Set(KITS.map((k) => k.grade))].map((id) => [id, gradeMeta(id).full]),
    ),
    rows,
  };

  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
