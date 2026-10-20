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
│   └── gundam/          KitCover, KitCard, KitBrowser, KitStats
├── content/             Markdown content, one folder per section
│   ├── about/           rendered together on /about
│   ├── data/
│   ├── notes/
│   └── projects/
├── content.config.ts    collection definitions + frontmatter schema
├── data/site.ts         site title, tagline, and the navigation table
├── data/gundam.ts       model database: types, taxonomy, query helpers
├── data/gundam.art.ts   hand-drawn SVG line art for the product covers
├── layouts/             BaseLayout, DocLayout
├── pages/               routes (index, per-section index + [slug], 404, rss.xml)
├── styles/              global.css, header.css, footer.css, gundam.css
└── utils/content.ts     collection queries: getDocs / getDoc / renderDoc
scripts/
├── build-gundam-data.mjs merges the raw model records into the typed module
└── make-og.mjs
```

## The Gundam model database

`/data/gundam/` is a searchable database of Gunpla kits. Covers come from
Bandai's own product photography: each image is downloaded once, resized to a
480px WebP and kept in `public/gundam/`, so the site does not depend on
Bandai's CDN staying up. Kits without a photo fall back to hand-drawn SVG
line art (`src/data/gundam.art.ts`) coloured by the kit's series palette,
which also appears on the detail page as four technical views.

Its data lives in four layers, and each one can be inspected on its own:

```
src/data/gundam.kits.classic.json   raw records — the classic lines
src/data/gundam.kits.recent.json    raw records — the recent lines
src/data/gundam.kits.catalog.json   raw records — the full site catalogue
src/data/gundam.kits.seed.json      raw records — individually verified
            │
            ▼  pnpm data:gundam
src/data/gundam.kits.ts              generated, typed, deduplicated, sorted
            │
            ▼  pnpm data:gundam:images
public/gundam/<id>.webp              the cached product images
src/data/gundam.images.json         id → local image path
            │
            ▼  pnpm data:gundam   (again, to attach the image paths)
/data/gundam/                        the browser and the per-kit pages
```

To add a kit, append a record to one of the raw JSON files and run
`pnpm data:gundam`. The script validates the grade, series and channel
against the agreed value sets, reports anything out of range, merges records
that share an id — or that point at the same product page, however they were
id'd — and sorts the result by release date. The same contract is documented
for readers in `src/content/data/gundam-database.md`.

`pnpm data:gundam:catalog` re-harvests the catalogue from Bandai's Chinese
site. It fetches one page at a time and backs off when the site rate-limits
it, so it is safe to leave running; fetched pages are cached under `.cache/`
and the run can be interrupted and resumed at any point.

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
