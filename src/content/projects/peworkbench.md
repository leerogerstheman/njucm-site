---
title: "药物经济学工作台 · PE-Workbench"
description: "面向 HEOR/HTA 工作者的本地化受控工作台：把「方案-证据-建模-分析-报告-申报」变成受控工作流，哈希链审计、双要素电子签名、RBAC 职责分离，内置 CHEERS 2022 / 中国药经评价指南 / ISPOR-SMDM 检查表。原生窗口双击即用。"
date: 2026-10-03
tags: ["药物经济学", "hea", "hta", "webview2", "审计追踪", "电子签名"]
status: "active"
repo: "https://github.com/leerogerstheman/PE-Workbench"
draft: false
created: 2026-10-03
updated: 2026-10-03

---

**让药物经济学工作的每一步可理解、可追溯、可审查。**

一个面向药物经济学 / 卫生技术评估（HEOR/HTA）工作者的本地化工作台。把「方案-证据-建模-分析-报告-申报」
这条链变成**受控工作流**：谁在哪个步骤做什么、要不要电子签名、改过没有、能不能复现——全部写进界面，
全部留痕在审计链里。

## 下载即用（Windows）

<div class="dl">
  <a class="dl__item dl__item--primary" href="/downloads/PEWorkbench-windows-portable.zip" download>
    <span class="dl__name">PEWorkbench-windows-portable.zip</span>
    <span class="dl__meta">2.6 MB · 含原生窗口启动器（已预编译）· 解压双击即用</span>
    <span class="dl__how">解压后双击 <code>PEWorkbench.exe</code>，首次启动自动初始化</span>
  </a>
</div>

**环境要求**：**需要 Node.js 22.5 或更高**（用内置 `node:sqlite`）。**零第三方依赖，断网可运行。**

> `PEWorkbench.exe` 是**原生 Windows 桌面窗口**（自己的标题栏、任务栏图标、托盘图标），
> 不是浏览器窗口，也不依赖用户浏览器——内嵌 **WebView2**（Windows 10/11 自带引擎）。
> 启动器已预编译好放在包内（20 KB + 3 个 WebView2 DLL），由 Windows 自带 C# 编译器构建。

## 启动方式

| 文件 | 作用 |
| --- | --- |
| `PEWorkbench.exe` | **推荐**。自己的桌面应用窗口 |
| `start.bat` | 备用：带控制台 + 服务 |
| `stop.bat` | 停止后台实例 |

## 快速开始

1. 解压后双击 `PEWorkbench.exe`
2. 首次启动自动初始化（创建数据库、加载配置库、生成演示账号与数据）
3. **先登录**：内置演示账号见登录页
4. 第一屏是**领域选择**——点任意领域卡，第一屏就是该领域的工作流程图

## 核心能力

- **受控工作流（10 条）**：方案评审、系统文献综述、间接比较、效用研究、成本测算、
  模型验证、预算影响、报告核查等——**加一条新流程只需往 `seed/workflows/` 放一个 JSON 文件**
- **审计追踪（哈希链）**：只可追加，改库被触发器拦截，绕过触发器改文件会被摘要校验抓出
- **双要素电子签名**：密码 + 动态口令/一次性挑战码，强制两个独立识别要素
- **RBAC 与职责分离**：所有记录修改强制填写理由；数据问题的提出人不能自己关闭；
  **模型开发者不能自己发布自己的模型**
- **三态权限矩阵**：允许 / 不允许 / ⚠ 有约束——如实呈现「界面说允许、内核仍会拒绝」的情况
  （例如 HEOR 负责人持有 `record.close`，但内核仍拒绝他关闭自己起草的记录）
- **检查就绪度**：把 **CHEERS 2022**、**中国药物经济学评价指南（2020）**、**ISPOR-SMDM 模型验证七问**、
  **ALCOA+** 变成可逐条判定的检查表；负面判定**必须**附客观证据
- **后台监控进程**：定时扫描超期记录并升级、提示文件定期审核到期、提醒未关闭的严重缺陷

## 与 LeebertyGXP 的关系

本工作台与 [LeebertyGXP](https://njucm.org/projects/leebertygxp/) 同源：合规内核（哈希链审计、
双要素电子签名、职责分离）与「领域是数据」的设计一致，领域集合替换为药物经济学 / HTA 工作内容。

## 命令行

```bat
node src\server.js          :: 默认 127.0.0.1:8788，首次启动自动初始化
node scripts\verify-audit.js    :: 校验审计追踪完整性
node scripts\seed-demo.js       :: 手工重新生成演示数据
node scripts\backup.js          :: 备份数据
node test\core.js               :: 运行测试
```

## 自检

```bat
PEWorkbench.exe --shot D:\window-check.png   :: 渲染窗口截图后退出（自检用）
```

## 免责与定位

本项目为**技术演示与参考实现**，用于展示受控工作流与数据完整性机制，**不是经过验证的系统**，
不可直接用于法规申报。评分与检查表**不构成法规符合性的最终判定**；实际 HEOR/HTA 工作请以
现行指南（CHEERS、ISPOR-SMDM、中国药物经济学评价指南等）与申办方 SOP 为准。

## 官方资源

- 源码与文档：[GitHub](https://github.com/leerogerstheman/PE-Workbench)
- 架构说明与方法学文档：仓库 `docs/` 目录