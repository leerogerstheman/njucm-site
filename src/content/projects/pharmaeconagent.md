---
title: "药物经济学智能体 · PharmaEconAgent"
description: "面向药学与经济学专业学生的零配置药物经济学学习与计算助手：会讲人话的问答（每条标注出处）、9 个不会算错的计算工具、13 步零基础学习路径。单文件 exe，双击即用，无需 Python / 数据库 / Node。"
date: 2026-10-03
tags: ["药物经济学", "electron", "material-design3", "学习工具", "HEOR"]
status: "active"
repo: "https://github.com/leerogerstheman/PharmaEconAgent"
draft: false
---

**下载即用：不需要安装 Python、pip、数据库、Node.js，也不需要联网。**

药物经济学的数值容错率极低——增量符号、量纲、折现率随手就能算错；而概念又高度抽象，缩写满天飞。
这个软件把三件事合到一起：

| | 解决什么 |
| --- | --- |
| **会讲人话的问答** | 用大白话提问，回答来自内置知识库，**每条都标注出处**，可以回溯原始文献 |
| **不会算错的计算器** | 9 个药经计算工具，**不经过大模型心算**，全部是确定性函数 |
| **零基础的学习路径** | 13 步从「药经在解决什么问题」到「完整评估一个新药」，进度自动保存 |

## 下载

<div class="dl">
  <a class="dl__item dl__item--primary" href="https://github.com/leerogerstheman/PharmaEconAgent/releases/latest/download/PharmaEconAgent-v1.0.0-Windows-x64.exe">
    <span class="dl__name">PharmaEconAgent-v1.0.0-Windows-x64.exe</span>
    <span class="dl__meta">72.6 MB · Windows x64 · 单文件免安装</span>
    <span class="dl__how">下载后直接双击运行，无需装任何东西（从 GitHub 下载）</span>
  </a>
  <a class="dl__item" href="https://github.com/leerogerstheman/PharmaEconAgent/releases/latest/download/PharmaEconAgent-v1.0.0-full-package.zip">
    <span class="dl__name">PharmaEconAgent-v1.0.0-full-package.zip</span>
    <span class="dl__meta">72.6 MB · 完整包（含运行时）· 免安装</span>
    <span class="dl__how">解压后运行，适合放 U 盘或需要完整目录的场景</span>
  </a>
</div>

> 📦 **为什么本站不镜像这两个文件？** 它们各约 72.6 MB，超过了 GitHub API 的实用上限
> （实测 35–40 MB），无法通过接口写入站内仓库，因此这里给出 GitHub 官方直链。
> 下载走 GitHub 的 CDN，速度取决于你与 GitHub 的网络状况。

## 界面

### 智能问答

用大白话提问，回答来自内置知识库，**每条都标注出处**，可以回溯到原始文献。

### 计算器

9 个药经计算工具，**不经过大模型心算**，全部是确定性函数——避免最常见的符号、量纲、折现率错误。

### 学习路径与自检清单

13 步学习路径，从「药经在解决什么问题」到「完整评估一个新药」，**进度自动保存**。

## 功能一览

- **知识问答**：概念、缩写、方法学，回答带出处标注
- **计算工具**：9 个确定性药经计算器（ICER、折现、成本效用等）
- **学习路径**：13 步结构化课程 + 自检清单
- **完全离线**：内置知识库，不需要联网

## 技术要点

- **Electron 32** 打包为单文件 exe，**portable 模式**免安装
- **Material Design 3** 界面规范
- 零配置：不需要 Python / pip / 数据库 / Node.js
- 离线 ≠ 弱化：知识库与计算能力全部内置

## 官方资源

- 源码与历史版本：[GitHub](https://github.com/leerogerstheman/PharmaEconAgent/releases)
- 开发文档与截图：仓库 `docs/` 目录