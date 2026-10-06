---
title: "CRA/CRC 临床试验工作台 · LeebertyCR"
description: "本地运行、零依赖的临床试验岗位辅助应用：把 CRA/CRC 的工作流程、核查清单、场景练习与文件模板结构化，配合受控工作流、电子签名与审计追踪。原生 Windows 窗口，双击即用。"
date: 2026-10-03
tags: ["临床试验", "cra", "crc", "webview2", "审计追踪"]
status: "active"
repo: "https://github.com/leerogerstheman/LeebertyCR"
draft: false
created: 2026-10-03
updated: 2026-10-03

---

**让临床监查员（CRA）与临床协调员（CRC）的日常工作，看得懂、学得会、做得对。**

LeebertyCR 是一个**本地运行、零依赖**的药物临床试验岗位辅助应用：把 CRA/CRC 的工作流程细节与背后理念，
用大白话、流程图、可勾选核查清单、场景练习和案例讲清楚，并把高频工作文件模板与个人任务台直接给到用户手上。

## 下载即用（Windows）

<div class="dl">
  <a class="dl__item dl__item--primary" href="/downloads/LeebertyCR-windows-portable.zip" download>
    <span class="dl__name">LeebertyCR-windows-portable.zip</span>
    <span class="dl__meta">2.5 MB · 含原生窗口启动器 · 解压双击即用</span>
    <span class="dl__how">解压后双击 <code>LeebertyCR.exe</code>（推荐）或 <code>start.bat</code></span>
  </a>
</div>

**环境要求**：**只需要 Node.js 18+**（推荐 22+）。零第三方依赖，**断网可运行**。

> `LeebertyCR.exe` 是真正的原生 Windows 桌面应用（WinForms），**不依赖任何浏览器**：
> 双击后出现的是本程序自己的窗口（原生边框、自己的任务栏图标），窗口内部完成登录、导航、
> 核查清单、工作流执行、双要素签名与用户管理。本地 Node 引擎由窗口自动以隐藏进程启动/管理，普通用户全程无感。
>
> exe 由 Windows 自带的 C# 编译器现场编译，不依赖任何第三方组件。

**内置演示账号**：统一演示口令 `CRA-Demo-2026!`（登录页有说明）。

## 启动方式

| 文件 | 作用 |
| --- | --- |
| `LeebertyCR.exe` | **推荐**。原生窗口，无控制台 |
| `start.bat` | 等价于双击 exe |
| `stop.bat` | 停止后台实例 |
| `安装快捷方式.bat` | 在桌面创建快捷方式 |

系统托盘（窗口最小化后）：打开窗口 / 备份数据 / 自检 / 停止退出。

> Web 界面（http://127.0.0.1:8816）仅作为**可选的备用访问方式**保留，应用窗口本身不依赖它。

## 打开后你会看到什么

1. **先登录**：内置演示账号见登录页，确认当前账号身份（CRA / CRC / 研究者 / QA / 管理员）
2. **首页**：按三条学习路线进入
3. **功能地图**：核查清单、工作流执行、文件模板、个人任务台

## 核心能力

- **理念先行**：先讲「为什么」——CRA 为什么存在（监查三大目的）、CRC 为什么存在
- **可勾选核查清单**：把法规条款变成可逐条判定的工作清单
- **受控工作流执行**：参照 GxP-Workbench 引擎，含角色与签名门槛
- **登录与权限系统**：参照 GxP-Workbench 的 `core/auth.js` + `rbac.js`，含职责分离
- **双要素电子签名**：签名需两个独立识别要素
- **审计追踪**：关键操作留痕
- **场景练习与案例**：把高频疑问做成结构化内容
- **文件模板**：高频工作文件模板开箱可用

## 目录结构（包内）

```
LeebertyCR/
├── LeebertyCR.exe        ← 原生窗口启动器（双击即用）
├── start.bat / stop.bat / start-silent.bat
├── src/                  ← Node 引擎
├── desktop/              ← C# 原生客户端源码
├── web/                  ← 网页界面（可选备用）
├── seed/                 ← 演示数据与配置
├── docs/                 ← 使用说明与截图
└── scripts/              ← 构建与自检脚本
```

## 自检

```bat
node scripts\selfcheck.js      :: 自检
node scripts\verify-audit.js   :: 校验审计追踪
```

## 免责声明

本应用为**岗位学习与工作辅助工具**，不构成法规符合性的最终判定，也不替代申办方 SOP 与监管要求；
实际临床试验工作请以现行法规、方案与机构 SOP 为准。

## 官方资源

- 源码与文档：[GitHub](https://github.com/leerogerstheman/LeebertyCR)