/**
 * 数据导出：JSON
 * ---------------------------------------------------------------------------
 * 这个库本来就是给别人拿去用的——每条记录都有稳定的 id 和官方出处，
 * 拿去做表格、喂脚本、做自己的检索都应该是件顺理成章的事。
 *
 * 导出的是事实层的内容，不是渲染层：没有 HTML，没有图片文件本身，
 * 只有字段与图片的站内路径。
 */
import { KITS, seriesMeta, channelMeta, gradeMeta } from '../../../data/gundam';
import type { APIRoute } from 'astro';

export const GET: APIRoute = () => {
  const rows = KITS.map((kit) => ({
    id: kit.id,
    name: kit.name,
    nameJa: kit.nameJa,
    grade: kit.grade,
    gradeLabel: gradeMeta(kit.grade).label,
    scale: kit.scale,
    series: kit.series,
    seriesLabel: seriesMeta(kit.series).label,
    channel: kit.channel,
    channelLabel: channelMeta(kit.channel).label,
    released: kit.released,
    priceJpy: kit.priceJpy,
    priceCny: kit.priceCny,
    taxRate: kit.taxRate,
    maker: kit.maker,
    mech: kit.mech,
    mechId: kit.mechId,
    aliases: kit.aliases,
    tags: kit.tags,
    parts: kit.parts,
    heightMm: kit.heightMm,
    skillLevel: kit.skillLevel,
    material: kit.material,
    note: kit.note,
    verified: kit.verified,
    source: kit.source,
    sourceJp: kit.sourceJp,
    image: kit.image,
    imageUrl: kit.imageUrl,
  }));

  const payload = {
    generatedAt: new Date().toISOString().slice(0, 10),
    count: rows.length,
    license: '本站数据供学习与研究使用；商品图片版权归万代南梦宫所有。',
    fields: Object.keys(rows[0] ?? {}),
    rows,
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Content-Disposition': 'attachment; filename="njucm-gundam.json"',
    },
  });
};
