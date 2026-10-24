// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://njucm.org',
  trailingSlash: 'ignore',
  integrations: [
    sitemap({
      // 旧地址的跳转页不进站点地图：它们是给人点的，不是给搜索引擎收录的
      filter: (page) => !page.includes('/data/gundam'),
    }),
  ],
  build: {
    format: 'directory',
    /**
     * 样式不再逐页内联。
     *
     * 作用域样式默认会复制进每个用到它的页面，「对比栏」那 2 KB 与
     * 主题变量那 1.3 KB 于是被复制了 19000 多遍。改成外部文件后，
     * 浏览器缓存一次，全站只多十来个 CSS 文件。
     */
    inlineStylesheets: 'never',
  },
  vite: {
    build: {
      /**
       * 小脚本不再内联进每个页面。
       *
       * Vite 默认把 4 KB 以内的脚本直接内联，于是「复制邮箱」「对比栏」
       * 这些几百字节到两 KB 的模块被复制进了 19000 多个页面——每个页面
       * 多背 8 KB，站点整体多出近 160 MB，而 1 GB 的上限就是这么被吃掉的。
       * 改成外部文件后，浏览器按页面缓存一次，全站只多几个文件。
       */
      assetsInlineLimit: 0,
    },
  },
  markdown: {
    shikiConfig: {
      theme: 'github-dark-default',
      wrap: true,
    },
  },
  /*
   * 内容安全策略不用 Astro 的 experimental.csp。
   *
   * 那个选项只认配置里手写的哈希，不会替用户脚本算；页面上真正跑着的
   * 那几段内联脚本一条都不在它的哈希表里——照抄的结果是「策略看起来
   * 很严，实际把所有脚本都拦了」。所以策略自己写在 src/utils/csp.ts，
   * 由 BaseLayout 以 meta 的形式注入每个页面，Cloudflare 那边用同一份
   * 字符串做响应头。
   */
});
