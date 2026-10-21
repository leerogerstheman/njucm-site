/**
 * 数据导出：JSON
 * ---------------------------------------------------------------------------
 * 这个库本来就是给别人拿去用的——每条记录都有稳定的 id 和官方出处，
 * 拿去做表格、喂脚本、做自己的检索都应该是件顺理成章的事。
 *
 * 导出的是事实层的内容，不是渲染层：没有 HTML，没有图片文件本身，
 * 只有字段与图片的站内路径。
 */
import { PRODUCTS, seriesMeta, channelMeta, categoryMeta, makerMeta,
} from '../../../data/models';
import type { APIRoute } from 'astro';

export const GET: APIRoute = () => {
  const rows = PRODUCTS.map((kit) => ({
    id: kit.id,
    name: kit.name,
    nameJa: kit.nameJa,
    maker: kit.maker,
    makerLabel: makerMeta(kit.maker).label,
    category: kit.category,
    categoryLabel: categoryMeta(kit.category).label,
    scale: kit.scale,
    series: kit.series,
    seriesLabel: seriesMeta(kit.series).label,
    channel: kit.channel,
    channelLabel: channelMeta(kit.channel).label,
    released: kit.released,
    priceJpy: kit.priceJpy,
    priceCny: kit.priceCny,
    taxRate: kit.taxRate,
    subject: kit.subject,
    subjectId: kit.subjectId,
    subjectKind: kit.subjectKind,
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
    license:
      '本站数据供学习与研究使用；商品名称与图片的著作权归各自厂商所有，条目仅作索引与检索之用。',
    fields: Object.keys(rows[0] ?? {}),
    rows,
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Content-Disposition': 'attachment; filename="njucm-models.json"',
    },
  });
};
