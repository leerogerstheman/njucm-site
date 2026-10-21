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
  },
  markdown: {
    shikiConfig: {
      theme: 'github-dark-default',
      wrap: true,
    },
  },
});
