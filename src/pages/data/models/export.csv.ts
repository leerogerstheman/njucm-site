/**
 * 数据导出：CSV
 * ---------------------------------------------------------------------------
 * 给要拿数据做表格的人。字段与 JSON 导出一致，数组型字段（别名、标签）
 * 用分号隔开放在一格里。
 *
 * BOM 是有意加的：没有它，Excel 打开中文会乱码。
 */
import { PRODUCTS, seriesMeta, channelMeta, categoryMeta, makerMeta } from '../../../data/models';
import type { APIRoute } from 'astro';

const COLUMNS = [
  'id',
  'name',
  'nameJa',
  'maker',
  'makerLabel',
  'category',
  'categoryLabel',
  'scale',
  'series',
  'seriesLabel',
  'channel',
  'channelLabel',
  'released',
  'priceJpy',
  'priceCny',
  'taxRate',
  'subject',
  'subjectId',
  'subjectKind',
  'aliases',
  'tags',
  'parts',
  'heightMm',
  'skillLevel',
  'material',
  'verified',
  'source',
  'sourceJp',
  'image',
] as const;

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = Array.isArray(value) ? value.join(';') : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const GET: APIRoute = () => {
  const lines = [COLUMNS.join(',')];

  for (const kit of PRODUCTS) {
    const row = {
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
      priceJpy: kit.priceJpy || '',
      priceCny: kit.priceCny || '',
      taxRate: kit.taxRate ?? '',
      subject: kit.subject ?? '',
      subjectId: kit.subjectId ?? '',
      subjectKind: kit.subjectKind ?? '',
      aliases: kit.aliases,
      tags: kit.tags,
      parts: kit.parts ?? '',
      heightMm: kit.heightMm ?? '',
      skillLevel: kit.skillLevel ?? '',
      material: kit.material ?? '',
      verified: kit.verified ? '是' : '否',
      source: kit.source ?? '',
      sourceJp: kit.sourceJp ?? '',
      image: kit.image ?? '',
    };
    lines.push(COLUMNS.map((c) => cell((row as Record<string, unknown>)[c])).join(','));
  }

  const csv = '﻿' + lines.join('\r\n') + '\r\n';

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Content-Disposition': 'attachment; filename="njucm-models.csv"',
    },
  });
};
