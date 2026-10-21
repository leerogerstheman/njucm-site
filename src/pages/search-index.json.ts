import type { APIRoute } from 'astro';
import { getSearchableDocs } from '../utils/content';
import { SITE_PAGES } from '../data/site-pages';
import { PRODUCTS, SERIES, releaseYear } from '../data/models';
import SUBJECTS from '../data/models.subjects.json';

/**
 * 站内搜索索引（构建期生成）
 * ---------------------------------------------------------------------------
 * 在这里生成而不是引入 Pagefind 之类的搜索库，是因为这个站点目前是
 * 「零外部资源」的：没有 Web 字体、没有位图、没有第三方脚本。索引在编译期
 * 算好，输出成一个静态 JSON；搜索页只在访客真的开始输入时才去取它，
 * 所以搜索功能不会给任何一个页面的首屏增加任何代价。
 *
 * 索引本身携带正文纯文本（截断到 2500 字符/篇），这样搜「MedDRA」能命中
 * 只在正文里出现过一次的词，而不只是标题和描述。
 *
 * 收三类东西：
 *   1. 有 markdown 的内容页（笔记 / 数据集 / 项目 / 关于）
 *   2. 静态页面清单——它们回答「这个站能做什么」，标题与描述本身就是关键词
 *   3. 作品线页——每条作品线一行，给出规模、年代与代表机体
 *
 * 8735 个模型条目不在这里：它们由 /data/models/index.json 提供，搜索页复用
 * 那一份（列表页本来就要用它），不另造数据。4936 个主题页也不逐条进来——
 * 搜索结果在客户端按主题聚合，体积省下来，命中反而更准。
 */
export const GET: APIRoute = async () => {
  const docs = await getSearchableDocs();

  const entries = docs.map((d) => ({
    t: d.title,
    d: d.description ?? '',
    u: d.href,
    s: d.section,
    g: d.tags,
    x: d.text,
  }));

  /* 静态页面：没有正文，把关键词当检索文本 */
  for (const p of SITE_PAGES) {
    entries.push({
      t: p.title,
      d: p.description,
      u: p.href,
      s: p.section,
      g: p.keywords,
      x: [p.title, p.description, ...p.keywords].join(' '),
    });
  }

  /* 作品线页：每条一行。规模、年代、代表主题都进检索文本。 */
  const subjects = SUBJECTS as Record<string, { label: string; count: number; series: string[] }>;
  for (const s of SERIES) {
    const kits = PRODUCTS.filter((k) => k.series === s.id);
    if (!kits.length) continue;
    const years = kits.map((k) => releaseYear(k.released)).filter(Boolean);
    const top = Object.entries(subjects)
      .filter(([, m]) => m.series.includes(s.id) && m.count > 1)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 8)
      .map(([, m]) => m.label);
    const desc = `${s.label}：库里 ${kits.length} 条记录${
      years.length ? `，${Math.min(...years)}–${Math.max(...years)} 年` : ''
    }。`;
    entries.push({
      t: s.label,
      d: desc,
      u: `/data/models/series/${s.id}/`,
      s: 'gundam',
      g: [s.short, '作品线'],
      x: [s.label, s.short, desc, ...top].join(' '),
    });
  }

  return new Response(JSON.stringify(entries), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // 索引在构建期就是死的，但部署平台可能仍会重新校验；给它一年。
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
