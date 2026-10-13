import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { DOMAINS } from './data/taxonomy';

/** Shared frontmatter contract for every section. */
const docSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  date: z.coerce.date().optional(),
  /**
   * Dates mirrored from the upstream repository, used by the /projects sorter:
   * `created` is when the repo was first uploaded, `updated` is its last push.
   */
  created: z.coerce.date().optional(),
  updated: z.coerce.date().optional(),
  tags: z.array(z.string()).default([]),
  draft: z.boolean().default(false),
});

const notes = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/notes' }),
  schema: docSchema,
});

const data = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/data' }),
  schema: docSchema,
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/projects' }),
  schema: docSchema.extend({
    repo: z.string().url().optional(),
    status: z.enum(['idea', 'active', 'paused', 'done']).default('active'),
    /**
     * The one navigable axis. Typed against DOMAINS rather than left as a free
     * string, so a typo fails the build instead of silently creating a filter
     * pill that matches nothing.
     */
    domain: z.enum(DOMAINS.map((d) => d.id) as [string, ...string[]]).optional(),
  }),
});

const about = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/about' }),
  schema: docSchema,
});

export const collections = { notes, data, projects, about };
