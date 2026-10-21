import { getCollection } from 'astro:content';

export type SectionName = 'notes' | 'data' | 'projects' | 'about';

/** A normalised view of a markdown entry, safe to pass to components. */
export interface Doc {
  id: string;
  slug: string;
  title: string;
  description?: string;
  date?: Date;
  /** repo upload date, mirrored from GitHub (used by the projects sorter) */
  created?: Date;
  /** repo last-push date, mirrored from GitHub (used by the projects sorter) */
  updated?: Date;
  tags: string[];
  draft: boolean;
  status?: string;
  /** the single navigable axis for projects (see src/data/taxonomy.ts) */
  domain?: string;
  repo?: string;
  href: string;
}

function stripExt(id: string): string {
  return id.replace(/\.(md|mdx)$/i, '');
}

function normalise(section: SectionName, entry: any): Doc {
  const data = (entry.data ?? {}) as Record<string, any>;
  const slug = stripExt(String(entry.id));
  return {
    id: String(entry.id),
    slug,
    title: String(data.title ?? slug),
    description: typeof data.description === 'string' ? data.description : undefined,
    date: data.date instanceof Date ? data.date : undefined,
    created: data.created instanceof Date ? data.created : undefined,
    updated: data.updated instanceof Date ? data.updated : undefined,
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    draft: data.draft === true,
    status: typeof data.status === 'string' ? data.status : undefined,
    domain: typeof data.domain === 'string' ? data.domain : undefined,
    repo: typeof data.repo === 'string' ? data.repo : undefined,
    href: `/${section}/${slug}/`,
  };
}

/** Entries for a section; drafts are visible in dev, hidden in production. */
export async function getDocs(section: SectionName): Promise<Doc[]> {
  const entries = (await (getCollection as any)(section)) as any[];
  const includeDrafts = import.meta.env.DEV;

  return entries
    .map((entry) => normalise(section, entry))
    .filter((doc) => includeDrafts || !doc.draft)
    .sort((a, b) => {
      const at = a.date ? a.date.getTime() : 0;
      const bt = b.date ? b.date.getTime() : 0;
      if (bt !== at) return bt - at;
      return a.title.localeCompare(b.title, 'zh-Hans-CN');
    });
}

/**
 * Finds the raw collection entry behind a normalised Doc, so dynamic routes
 * can hand it to `render()`. Every [slug].astro uses this.
 */
export async function getRawEntry(section: SectionName, slug: string) {
  const entries = (await (getCollection as any)(section)) as any[];
  const wanted = stripExt(slug);
  return entries.find((e) => stripExt(String(e.id)) === wanted);
}

/** A Doc plus its body flattened to plain text, for the search index. */
export interface SearchableDoc extends Doc {
  text: string;
}

/**
 * Markdown -> plain text, for indexing only.
 *
 * Deliberately crude: it throws away every construct that is not prose, which
 * is exactly right for a search index (nobody searches for a closing code
 * fence) and keeps this dependency-free. What matters is that it can never
 * *lose* a word, so a miss here means a miss in search.
 */
function markdownToText(md: string): string {
  return md
    .replace(/^---[\s\S]*?\n---/, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/[*_~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Per-document cap: enough to match on, small enough to ship.
 *
 * 2500 字符是一个刻意选过的数字——实测 26 篇文档在这个上限下索引约 60 KB
 * （gzip 后更小），而摘录本身只显示命中点前后约 120 个字符，所以再多存
 * 只是让首屏那次 fetch 变慢，换不来任何一次更准的命中。
 */
const INDEX_TEXT_LIMIT = 2500;

/**
 * Every doc across the content sections, flattened for search.
 *
 * Built at compile time and served as one static JSON file, so the search page
 * itself stays a few kilobytes and the index is only fetched when the visitor
 * actually starts typing.
 *
 * The `about` section is a single page rendered at /about/, not one page per
 * entry — so its href is fixed rather than derived from the slug.
 */
export async function getSearchableDocs(): Promise<SearchableDoc[]> {
  const sections: SectionName[] = ['notes', 'data', 'projects', 'about'];

  const all = await Promise.all(
    sections.map(async (section) => {
      const docs = await getDocs(section);
      return Promise.all(
        docs.map(async (doc) => {
          const entry = await getRawEntry(section, doc.slug);
          const body = typeof entry?.body === 'string' ? entry.body : '';
          const href = section === 'about' ? '/about/' : doc.href;
          return { ...doc, href, section, text: markdownToText(body).slice(0, INDEX_TEXT_LIMIT) };
        }),
      );
    }),
  );

  return all.flat();
}

/** YYYY-MM-DD, timezone-stable (no locale surprises between machines). */
export function formatDate(date?: Date): string {
  if (!date) return '';
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
