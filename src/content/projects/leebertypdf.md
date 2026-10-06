---
title: "本地 PDF 阅读器 · LeebertyPDF"
description: "为 Windows 打造的本地 PDF 阅读器：PDF.js 渲染内核 + 全自研界面。全文搜索、高亮批注、目录书签、夜间阅读、标签页、阅读进度记忆；批注写回 PDF 文件本身，在 Acrobat / Firefox / Preview 中都能正确打开。"
date: 2026-10-05
tags: ["pdf", "electron", "阅读器", "批注", "离线"]
status: "active"
repo: "https://github.com/leerogerstheman/LeebertyPDF"
draft: false
created: 2026-10-05
updated: 2026-10-05

---

**为 Windows 打造的本地 PDF 阅读器** —— PDF.js 渲染内核 + 全自研界面。

全文搜索 · 高亮批注 · 目录书签 · 夜间阅读 · 标签页 · 阅读进度记忆。

渲染使用 Mozilla 的 **PDF.js 6.3**，外面包一层手写界面，加上一套从零实现的
**对象级 PDF 引擎**（批注编辑、页面操作、增量保存）。

**完全离线**：不需要账号、没有遥测、不上传。高亮、墨迹、文本框与签名**写回 PDF 文件本身**，
所以在这里做的批注，在 Acrobat、Firefox 和 Preview 中打开都是正确的。

## 下载

<div class="dl">
  <a class="dl__item dl__item--primary" href="https://github.com/leerogerstheman/LeebertyPDF/releases/latest/download/LeebertyPDF-1.0.0-portable-win-x64.zip">
    <span class="dl__name">LeebertyPDF-1.0.0-portable-win-x64.zip</span>
    <span class="dl__meta">133 MB · Windows 10/11 x64 · 便携版（绿色免安装）</span>
    <span class="dl__how">解压到任意目录，双击 <code>LeebertyPDF.exe</code> 即可（从 GitHub 下载）</span>
  </a>
</div>

> 📦 **为什么本站不镜像这个文件？** 它约 **133 MB**（内含完整的 Electron/Chromium 运行时，
> 这也是它不依赖任何系统组件、解压即用的原因），远超 GitHub API 的实用上限（实测 35–40 MB），
> 无法写入站内仓库，因此给出 GitHub 官方直链。

**安装版**（可选）：解压后运行 `tools\install.ps1` —— 装到
`%LOCALAPPDATA%\Programs\LeebertyPDF`，建开始菜单与桌面快捷方式，并注册 `.pdf` 的「打开方式」。
`-Uninstall` 可干净卸载。

## 功能

- **阅读**：PDF.js 6.3 渲染、夜间阅读模式、标签页、阅读进度记忆
- **全文搜索**
- **高亮批注**：高亮、墨迹、文本框、签名——**写回文件本身**，跨阅读器通用
- **目录书签**
- **图文重排**：单栏重排，方便小屏或长文阅读
- **命令面板**：模糊搜索，键盘流操作

## 环境要求

- **Windows 10 / 11 (x64)**
- 便携版无需安装任何运行时（Electron/Chromium 已打包在内）
- 从源码构建需要 Node.js 与 pnpm（见仓库「从源码构建」）

## 隐私

所有数据只留在本机——**不联网、不上传**，无需账号。

## 官方资源

- 源码与历史版本：[GitHub](https://github.com/leerogerstheman/LeebertyPDF/releases)