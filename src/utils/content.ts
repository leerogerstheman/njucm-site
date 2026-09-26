import { getCollection } from 'astro:content';

export type SectionName = 'notes' | 'data' | 'projects' | 'about';

/** A normalised view of a markdown entry, safe to pass to components. */
export interface Doc {
  id: string;
  slug: string;
  title: string;
  description?: string;
  date?: Date;
  tags: string[];
  draft: boolean;
  status?: string;
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
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    draft: data.draft === true,
    status: typeof data.status === 'string' ? data.status : undefined,
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

/** YYYY-MM-DD, timezone-stable (no locale surprises between machines). */
export function formatDate(date?: Date): string {
  if (!date) return '';
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
