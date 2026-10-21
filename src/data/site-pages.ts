/**
 * 站内静态页面清单
 * ---------------------------------------------------------------------------
 * 搜索索引原本只收「有 markdown 的内容页」，于是 3000 多个路由里只有 27 个
 * 能被搜到——而剩下的绝大多数里，最该被搜到的其实是这些「说明型页面」：
 * 它们回答的是「这个站能做什么」，标题和描述本身就是关键词。
 *
 * 这里把它们显式列出来。静态页面没有 markdown 正文，所以额外给一组
 * keywords：那些写在页面上、但不在标题与描述里的说法（「对比」「统计」…）。
 */

export interface SitePage {
  /** 站内地址 */
  href: string;
  title: string;
  description: string;
  /** 页面之外的别称与关键词，用于匹配「这个功能在哪」这类查询 */
  keywords: string[];
  /** 结果里显示的分组名 */
  section: string;
}

export const SITE_PAGES: SitePage[] = [
  {
    href: '/',
    title: 'njucm.org',
    description: '一个独立的中医药与计算方法学术站：笔记、数据集与项目。',
    keywords: ['首页', '导航', 'home', ' njucm'],
    section: 'site',
  },
  {
    href: '/notes/',
    title: 'Notes',
    description: '中医药与药学领域的笔记：方法、选型与边界条件。',
    keywords: ['笔记', '文章', 'notes'],
    section: 'notes',
  },
  {
    href: '/data/',
    title: 'Data',
    description: '数据集：字段口径、来源、复现方式与已知限制。',
    keywords: ['数据集', '数据说明', 'data'],
    section: 'data',
  },
  {
    href: '/projects/',
    title: 'Projects',
    description: '项目：工具、看板与实验代码。',
    keywords: ['项目', '工具', 'projects'],
    section: 'projects',
  },
  {
    href: '/about/',
    title: 'About',
    description: '关于 njucm.org 这个站点。',
    keywords: ['关于', '联系', 'about', '邮箱'],
    section: 'about',
  },
  {
    href: '/changelog/',
    title: 'Changelog',
    description: 'njucm.org 的更新记录：所有栏目按最后一次变动重新排列。',
    keywords: ['更新记录', '变更', 'changelog', '日志'],
    section: 'site',
  },
  {
    href: '/data/gundam/',
    title: '高达模型数据库',
    description:
      '按等级、系列、发售年代与官方定价检索的高达塑料模型数据库，每条记录都标注出处。',
    keywords: [
      '高达',
      '高达模型',
      'gunpla',
      '万代',
      'bandai',
      '模型',
      '塑料模型',
      '数据库',
      '条目列表',
      '等级',
      '比例',
      '定价',
      '发售',
    ],
    section: 'gundam',
  },
  {
    href: '/data/gundam/mech/',
    title: '按机体浏览',
    description: '同一台高达机体有多个等级与多种配色，这里按机体把它们串起来，附跨等级横向对比。',
    keywords: ['机体', '同一机体', '各等级', '配色', '版本', '对比表', 'mech'],
    section: 'gundam',
  },
  {
    href: '/data/gundam/series/',
    title: '按作品线浏览',
    description: '每条高达作品线在库里的条目数、等级构成、年代跨度、官方定价区间与代表机体。',
    keywords: ['作品线', '系列', '专题', 'series', 'UC', 'SEED', '高达集结'],
    section: 'gundam',
  },
  {
    href: '/data/gundam/stats/',
    title: '数据概览',
    description:
      '高达模型数据库的规模、价格分布、等级与年代交叉、渠道构成，以及每个关键字段的覆盖率。',
    keywords: [
      '统计',
      '概览',
      '数据质量',
      '字段覆盖',
      '价格分布',
      '分布',
      'stats',
      '矩阵',
    ],
    section: 'gundam',
  },
  {
    href: '/data/gundam/compare/',
    title: '条目对比',
    description: '把几个高达模型条目并排放，逐行比较等级、比例、发售、定价、零件数与机体归属。',
    keywords: ['对比', '并排', '比较', '参数对比', 'compare'],
    section: 'gundam',
  },
  {
    href: '/data/gundam-database/',
    title: '数据集：高达模型数据库',
    description: '高达塑料模型条目的结构、来源、核验方式与已知限制。',
    keywords: ['字段口径', '数据说明', '来源', '复现', '限制', '溯源'],
    section: 'gundam',
  },
  {
    href: '/search/',
    title: '搜索',
    description: '搜索 njucm.org 的全部笔记、数据集、项目与高达模型条目。',
    keywords: ['搜索', '查找', 'search'],
    section: 'site',
  },
];
