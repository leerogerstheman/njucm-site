---
title: "为什么给这个站点换掉 Hugo"
description: "从裸 Hugo 骨架迁移到 Astro 的原因，以及这次改动包含什么。"
date: 2026-01-13
tags: ["astro", "meta"]
draft: false
---

这是一篇占位说明，用来验证栏目、列表、标签、日期与排版是否正常。可以直接删掉。

## 为什么换

原来的仓库只有 `hugo.toml` 和几个空的栏目占位文件，加一个 189 字节的
`home.html`。能用，但缺少导航、样式和列表模板，读起来就是一行裸文本。

换到 Astro 的原因是：

1. **内容仍然是 Markdown** —— 原来的 `.md` 可以原样搬过来，写作方式不变。
2. **组件化** —— 导航、页脚、卡片是组件，改一处全站生效。
3. **默认零客户端 JS** —— 输出是静态 HTML，加载快，也不需要维护前端框架。

## 这次包含什么

- 深色主题的设计系统，中文排版优先，不依赖任何外部字体或图片
- 顶部固定导航，移动端有折叠菜单，含可见焦点与跳转到主内容的链接
- `notes` / `data` / `projects` 三个栏目各自有列表页与详情页
- Markdown 内容集合，带 frontmatter 校验（`title` / `date` / `tags` / `draft`）
- RSS 与 sitemap 输出

## 怎么加一篇新笔记

在 `src/content/notes/` 下新建一个 `.md` 文件：

```markdown
---
title: "标题"
description: "一句话摘要，会显示在列表卡片上"
date: 2026-01-13
tags: ["标签"]
draft: false
---

正文……
```

`draft: true` 的文章在本地 `pnpm dev` 时可见，但不会进入生产构建。
