import rss from '@astrojs/rss';
import { SITE } from '../data/site';
import { getDocs, type SectionName } from '../utils/content';

export async function GET(context) {
  const site = /** @type {any} */ (context).site as URL;

  // Newest-first feed across every dated section.
  const sections: SectionName[] = ['notes', 'data', 'projects'];

  const groups = await Promise.all(
    sections.map(async (section) =>
      (await getDocs(section))
        .filter((doc) => doc.date)
        .map((doc) => ({
          title: doc.title,
          description: doc.description ?? '',
          pubDate: doc.date as Date,
          link: doc.href,
          categories: doc.tags,
        }))
    )
  );

  const items = groups
    .flat()
    .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

  return rss({
    title: `${SITE.title} · ${SITE.domain}`,
    description: SITE.description,
    site,
    items,
    customData: `<language>${SITE.lang}</language>`,
  });
}
