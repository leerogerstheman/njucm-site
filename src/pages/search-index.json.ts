import type { APIRoute } from 'astro';
import { getSearchableDocs } from '../utils/content';

/**
 * 站内搜索索引（构建期生成）
 * ---------------------------------------------------------------------------
 * 在这里生成而不是引入 Pagefind 之类的搜索库，是因为这个站点目前是
 * 「零外部资源」的：没有 Web 字体、没有位图、没有第三方脚本。索引在编译期
 * 算好，输出成一个静态 JSON；搜索页只在访客真的开始输入时才去取它，
 * 所以搜索功能不会给任何一个页面的首屏增加任何代价。
 *
 * 索引本身携带正文纯文本（截断到 4000 字符/篇），这样搜「MedDRA」能命中
 * 只在正文里出现过一次的词，而不只是标题和描述。
 */
export const GET: APIRoute = async () => {
  const docs = await getSearchableDocs();

  const index = docs.map((d) => ({
    t: d.title,
    d: d.description ?? '',
    u: d.href,
    s: d.section,
    g: d.tags,
    x: d.text,
  }));

  return new Response(JSON.stringify(index), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // 索引在构建期就是死的，但部署平台可能仍会重新校验；给它一年。
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
