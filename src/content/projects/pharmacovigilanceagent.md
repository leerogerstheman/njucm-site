---
title: "药智 · 药物警戒助手"
description: "面向药学学生的离线智能体学习工具：13 大类知识库、34+ 文档，基于 hello-agents 思路与 RAG 构建，完全离线零依赖。双击即用，无需 Python / Node.js / 数据库 / 网络。"
date: 2026-10-03
tags: ["药物警戒", "material-design3", "rag", "学习工具", "离线"]
status: "active"
repo: "https://github.com/leerogerstheman/PharmacovigilanceAgent"
draft: false
---

**面向药学学生的智能体学习工具** —— 基于 [Datawhale hello-agents](https://github.com/datawhalechina/hello-agents)
框架构建，UI 遵循 Material Design 3 设计规范。

帮助学生快速学习药物警戒（Pharmacovigilance）相关知识、法规、术语和实操技能。本项目展示了如何基于
hello-agents 框架的思路，结合 RAG（检索增强生成）技术，构建一个**完全离线、零依赖**的领域智能体应用。

## 下载即用（Windows）

<div class="dl">
  <a class="dl__item dl__item--primary" href="/downloads/PharmacovigilanceAgent-windows-portable.zip" download>
    <span class="dl__name">PharmacovigilanceAgent-windows-portable.zip</span>
    <span class="dl__meta">5.3 MB · 零依赖 · 解压双击即用</span>
    <span class="dl__how">解压后双击 <code>启动药物警戒助手.vbs</code>（无黑窗口）或 <code>启动药物警戒助手.bat</code></span>
  </a>
</div>

**系统要求**：Windows 7 / 10 / 11 或 macOS / Linux + 任意现代浏览器（Edge / Chrome / Firefox / Safari）。

> ✅ **无需** Python / Node.js / 数据库 / 网络连接。程序内置了运行所需的一切。

首次启动后浏览器会自动打开程序界面。如果双击 `.vbs` 没反应，改用 `.bat`（会显示控制台便于排查）。

## 功能模块

### 🎓 核心功能

- **知识问答**：基于内置知识库的离线问答，RAG 检索增强
- **法规与术语速查**：药物警戒相关法规、术语、概念
- **实操技能**：面向真实工作场景的练习内容

### 📚 知识库内容（13 大类，34+ 文档）

覆盖药物警戒的核心知识领域，全部内置、可离线检索。

### 📡 API 接口（双层架构）

前端（`api.js` / `app.js`）+ 本地后端（`src/backend_api.py`），支持 API 文档（见仓库 `API文档.md`）。

## 设计原则

1. **用户友好**：面向药学学生专属设计
2. **Material Design 3**：现代化界面规范
3. **类 hello-agents 框架设计**：借鉴成熟智能体框架思路
4. **完全离线**：不依赖网络，随时可用

## 目录结构（包内）

```
PharmacovigilanceAgent/
├── 药智·药物警戒助手.exe      ← 主启动器（双击即用）
├── 启动药物警戒助手.vbs        ← 备选启动器（无窗口）
├── 启动药物警戒助手.bat        ← 带控制台启动（排查用）
├── index.html / app.js / api.js / styles.css   ← 前端界面
├── data/                      ← 知识库（knowledge_base.js / .json）
├── src/                       ← 后端与打包脚本
└── API文档.md / README.md
```

## 进阶：从源码重新打包

包内已含 `src/build_exe.py` 与 `src/gen_kb_js.py`，需要 Python 时可用于重新生成知识库或重新打包 exe
（普通用户不需要）。

```bat
:: 生成知识库 JS
python src\gen_kb_js.py
:: 重新打包为单一 exe
python src\build_exe.py
```

## 官方资源

- 源码与文档：[GitHub](https://github.com/leerogerstheman/PharmacovigilanceAgent)
- 框架来源：[Datawhale hello-agents](https://github.com/datawhalechina/hello-agents)