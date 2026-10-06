---
title: "GxP 合规工作台 · LeebertyGXP"
description: "面向制药与实验室的本地化合规工作台：覆盖 GMP/GLP/GCP/GVP/GDP/GPP/GAMP 与数据完整性。哈希链审计追踪、电子签名、偏差/CAPA/OOS、文档控制、自检、生产批次执行。零 npm 依赖，双击即用。"
date: 2026-10-02
tags: ["gxp", "合规", "webview2", "电子签名", "数据完整性"]
status: "active"
repo: "https://github.com/leerogerstheman/LeebertyGXP"
draft: false
created: 2026-10-02
updated: 2026-10-04

---

**让日常 GxP 义务可执行、可追溯、可审计。**

面向制药与实验室工作者的本地化合规工作台，覆盖 GMP、GLP、GCP、GVP、GDP、GPP、GAMP
与数据完整性（ALCOA+）：把「文件规定应该怎么做」变成「系统推着你做、做错拦住、做完自动留痕」，
并在检查前告诉你哪里有风险。

## 下载即用（Windows）

<div class="dl">
  <a class="dl__item dl__item--primary" href="/downloads/LeebertyGXP-windows-x64-v1.0.0.zip" download>
    <span class="dl__name">LeebertyGXP-windows-x64-v1.0.0.zip</span>
    <span class="dl__meta">0.4 MB · Windows x64 · v1.0.0 · 解压双击即用</span>
    <span class="dl__how">解压后双击 <code>LeebertyGXP.exe</code>，首次启动自动完成全部初始化（约 5 秒）</span>
  </a>
</div>

**环境要求**：需要 **Node.js 22.5 或更高**（用内置 `node:sqlite`）+ Windows 自带的 WebView2/Edge 引擎
（Win10/11 一般自带）。**零 npm 依赖，不需要 `npm install`，断网可运行。**

**首次启动自动完成**：创建数据库、生成审计链密钥、加载配置库（17 类流程 + 8 张检查表 285 项要求）、
创建演示账号（28 个身份，统一密码 `GxP-Demo-2026!`）、生成演示数据集（质量记录 + 4 个生产批次）、
校验审计链完整性。约 5 秒后打开身份选择页。第二次启动只重载配置，不重复生成。

> 演示账号密码 `GxP-Demo-2026!` 是**刻意标注的风险**（21 CFR Part 11.300(a) 要求账号唯一）——
> 真实的部署请用 `GXP_BUILTIN_ACCOUNTS=0` 启动，进入「创建第一个管理员账号」流程且不生成演示数据。

## 设计核心

1. **领域是数据，不是代码** —— GxP 各领域合规义务高度同构，加一个新流程只需往 `seed/workflows/` 放一个 JSON
2. **控制做进机制，不能靠自觉** —— 审计追踪用**哈希链**实现，改库被触发器拦死、改文件被摘要校验抓出；电子签名强制两个独立识别要素；GxP 记录修改强制填理由；偏差提出人不能自己关闭
3. **就绪度常态可见** —— 法规条款变成可判定检查项，缺陷一键转受控 CAPA，未关闭缺陷/审计欠账/培训过期/校准超期/链完整性汇总成一个就绪度评分并列出阻碍项
4. **工作流自己跑** —— 后台守护进程常驻，定时扫描超期记录、待签步骤、到期校准与培训，生成待办、升级严重超期、条件解除后自动关闭，不需要任何人打开页面

## 启动方式

| 方式 | 说明 |
| --- | --- |
| `LeebertyGXP.exe` | **推荐**。无控制台，托盘出现绿色对勾图标；窗口是程序自带的原生窗口（WinForms + 嵌入式 WebView2），不是浏览器标签页 |
| `start.bat` | 相同行为，带控制台窗口看日志（排查用） |
| `start-silent.bat` | 后台静默启动，日志写入 `logs/server.log` |
| `stop.bat` | 停止后台实例 |

托盘菜单：打开工作台 / 重新生成演示数据 / 校验审计追踪 / 备份数据 / 退出。

## 操作概览

- **第一屏是身份选择**：身份按职责分三组——全域职责（进入领域选择）、各领域负责人（直接进专属界面）、其他岗位。密码真实校验
- **登录后领域优先**：8 张领域卡片在前，点任意领域（如 GLP）第一屏就是该领域的工作流程图（横向步骤、每步责任人名片与权限）
- **「我的待办」按后果轻重排序**，明确标出哪些需电子签名、哪些已超期；底部列出该岗位**不能**做什么
- **批次执行**：演示数据种了 4 个生产批次（`PRD-2026-0001..0004`），操作工按步骤填写（投料量、参数、取样点…），生产负责人独立复核（Annex 11 §12.1 拒绝作者自审），QC/QP 放行判定。谁执行/复核/放行/签名都进审计链
- **新增用户**：仅系统管理员（`user.manage`），可声明所属 GxP 领域、初始密码留空、勾选"首次登录必须改密码"

## 命令行与环境变量

```bat
node src\server.js                           :: 默认 127.0.0.1:8788，首次启动自动初始化
set GXP_HOST=0.0.0.0 && node src\server.js   :: 局域网共享（前面请配 HTTPS）
node scripts\seed-demo.js                    :: 手工重新生成演示数据
```

| 变量 | 作用 |
| --- | --- |
| `GXP_BUILTIN_ACCOUNTS=1` | 演示账号 + 首次自动生成演示数据 |
| `GXP_AUTO_SEED_DEMO=0` | 保留演示账号但出生空库 |
| `GXP_PORT=8790` | 换端口 |
| `GXP_MONITOR=0` | 不启动后台工作流进程 |
| `GXP_HOST=0.0.0.0` | 允许局域网访问（务必前置 HTTPS） |

## 技术说明

- **零 npm 依赖**，运行时构件只有 Node（自带）+ 微软 WebView2 SDK 绑定 + 系统引擎——受验证环境里每个第三方包都要单独供应商评估，这里评估范围极小
- exe 是 18 KB 的单文件启动器（Windows 自带 C# 编译器构建场景），启动器同目录需要 3 个 WebView2 SDK 文件（zip 内已带）
- 配置库含 17 类流程定义、8 张检查表 285 项要求；开发文档见仓库 `docs/`

## 官方资源

- 源码与历史版本：[GitHub](https://github.com/leerogerstheman/LeebertyGXP/releases)
- 架构说明 / 法规对照矩阵 / 验证指南：仓库 `docs/` 目录