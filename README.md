# njucm-site

Source for **[njucm.org](https://njucm.org)** — an independent academic and technical
site exploring traditional Chinese medicine, pharmacy, and modern computational methods.

Built with [Astro](https://astro.build). Static output, no client-side framework,
no external fonts or CDN assets.

## Stack

| | |
| --- | --- |
| Framework | Astro 5 (static output) |
| Content | Markdown content collections with Zod-validated frontmatter |
| Styling | Hand-written CSS, dark theme design tokens in `src/styles/global.css` |
| Hosting | GitHub Pages via GitHub Actions |

## Commands

```bash
pnpm install     # install dependencies
pnpm dev         # dev server at http://localhost:4321
pnpm build       # production build into dist/
pnpm preview     # preview the built site
```

> If the default npm registry is unreachable, `.npmrc` already points at
> `registry.npmmirror.com`.

## Project layout

```
src/
├── components/          Nav, Header, Footer, DocList, SectionIndex
├── content/             Markdown content, one folder per section
│   ├── about/           rendered together on /about
│   ├── data/
│   ├── notes/
│   └── projects/
├── content.config.ts    collection definitions + frontmatter schema
├── data/site.ts         site title, tagline, and the navigation table
├── layouts/             BaseLayout, DocLayout
├── pages/               routes (index, per-section index + [slug], 404, rss.xml)
├── styles/              global.css, header.css, footer.css
└── utils/content.ts     collection queries: getDocs / getDoc / renderDoc
```

## Adding content

Create a `.md` file in the matching folder under `src/content/`:

```markdown
---
title: "标题"
description: "一句话摘要，显示在列表卡片上"
date: 2026-01-13
tags: ["标签"]
draft: false
---

正文……
```

`projects` entries additionally accept `repo` (URL) and
`status` (`idea` | `active` | `paused` | `done`).

Drafts (`draft: true`) show up in `pnpm dev` but are excluded from the
production build.

## Adding a navigation section

1. Add an entry to `NAV` in `src/data/site.ts`.
2. Create `src/content/<name>/` with at least one `.md` file.
3. Create `src/pages/<name>/index.astro` and `src/pages/<name>/[slug].astro`
   (copy an existing section — they differ only by the collection name).
4. Register the collection in `src/content.config.ts`.

## Deployment

`.github/workflows/deploy.yml` builds the site on every push to `main` and
publishes `dist/` to GitHub Pages. To serve the custom domain, either add a
`public/CNAME` containing `njucm.org`, or set it in
**Settings → Pages → Custom domain**.
