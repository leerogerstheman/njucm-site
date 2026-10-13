/**
 * 分类体系（taxonomy）
 * ---------------------------------------------------------------------------
 * 项目此前的 55 个自由标签里，没有任何一个能用来导航：最高频的只有 `python`（4），
 * 30 多个标签只出现一次，而且"领域 / 语言 / 平台"三种互不兼容的维度混在一起。
 *
 * 所以这里把可导航的那一维单独提出来，成为 `domain` 字段；语言与平台不新增字段，
 * 而是从既有 tags 里推导 —— 不重复录入，也就不会有两处数据打架。
 *
 *   domain —— 显式写在 frontmatter，唯一的导航轴
 *   stack  —— 从 tags 推导，只用于展示，永远不是筛选依据
 */

/** 项目领域。顺序即展示顺序，也是 /projects 的分面顺序。 */
export interface DomainDef {
  /** frontmatter 里写的值 */
  id: string;
  /** 界面显示名 */
  label: string;
  /** 一句话说明这一组在做什么 */
  desc: string;
}

export const DOMAINS: DomainDef[] = [
  {
    id: 'pv',
    label: '药物警戒',
    desc: '信号检测、ICSR 流程与 GVP 体系',
  },
  {
    id: 'clinical',
    label: '临床与合规',
    desc: 'CRA/CRC 工作台与 GxP 质量合规',
  },
  {
    id: 'pharmacy',
    label: '药事与经济学',
    desc: '法规检索、药事管理与卫生经济学',
  },
  {
    id: 'tcm',
    label: '中医药',
    desc: '政策文本语料与真实世界研究',
  },
  {
    id: 'creative',
    label: '创作与工具',
    desc: '游戏、图像处理与桌面小工具',
  },
  {
    id: 'about',
    label: '关于',
    desc: '个人主页与索引',
  },
];

const DOMAIN_MAP = new Map(DOMAINS.map((d) => [d.id, d]));

export function getDomain(id?: string): DomainDef | undefined {
  return id ? DOMAIN_MAP.get(id) : undefined;
}

/**
 * 技术栈关键词。刻意只认这 9 个明确的技术名词，且只在 tags 里查找 ——
 * 这样"展示用"永远不会反过来影响"导航用"的 domain。
 */
const STACK_KEYWORDS = [
  'python',
  'nodejs',
  'csharp',
  'dotnet',
  'javascript',
  'electron',
  'tkinter',
  'webview2',
  'sqlite',
] as const;

/** 从项目 tags 中取出技术栈标签，保持 STACK_KEYWORDS 的声明顺序。 */
export function getStack(tags: string[] = []): string[] {
  const lower = new Set(tags.map((t) => t.toLowerCase()));
  return STACK_KEYWORDS.filter((k) => lower.has(k));
}
