/**
 * Single source of truth for site-wide chrome.
 * Adding a section = add one entry here + create the matching route.
 */

export interface NavItem {
  /** URL path, no trailing slash (except the root) */
  href: string;
  /** label shown in the header */
  label: string;
  /** one-line description used on the home page and section fallbacks */
  desc: string;
}

export const SITE = {
  title: 'njucm',
  /** short mark shown next to the wordmark */
  domain: 'njucm.org',
  tagline: '中医药 · 药学 · 计算方法',
  description:
    'An independent academic and technical site exploring traditional Chinese medicine, pharmacy, and modern computational methods.',
  lang: 'zh-CN',
  author: 'leerogerstheman',
  /** GitHub profile, linked from the footer and the about page */
  github: 'https://github.com/leerogerstheman',
  repo: 'https://github.com/leerogerstheman/njucm-site',
  email: 'leerogers072605@gmail.com',
} as const;

export const NAV: NavItem[] = [
  {
    href: '/notes',
    label: 'Notes',
    desc: '阅读笔记、文献梳理与方法论备忘。',
  },
  {
    href: '/data',
    label: 'Data',
    desc: '数据集、整理好的表格与可复现的数据说明。',
  },
  {
    href: '/projects',
    label: 'Projects',
    desc: '正在做的工具、实验与软件项目。',
  },
  {
    href: '/about',
    label: 'About',
    desc: '关于这个站点，以及它在做什么。',
  },
];

/**
 * Anonymous comments, served by the Cloudflare Worker in ./worker.
 *
 * `enabled` stays false until the Worker is deployed and answering, so the live
 * site never shows a comment box that cannot post. Once deployed, flip it to
 * true (and set `api` if the Worker is not routed under the site's own domain).
 */
export const COMMENTS = {
  enabled: false,
  api: '/api/comments',
} as const;
