---
title: "中国集采 / 医保卫生经济学分析 · ChinaHTA"
description: "面向中国市场准入场景的卫生经济学分析工具：集采降价测算、预算影响分析（BIA）、成本-效果分析（ICER/PSA/CEAC）、Markov 队列模型、DRG/DIP 支付影响。"
date: 2026-10-04
tags: ["卫生经济学", "集采", "vbp", "医保", "drg", "icer", "qaly", "预算影响分析", "markov"]
status: "active"
repo: "https://github.com/leerogerstheman/ChinaHTA"
draft: false
---

**面向中国市场准入（market access）场景**，而不是照搬欧美 HTA 模板。

国内 HEOR / 市场准入岗真正在做的事是：集采降价后患者的年治疗费用变了多少？
一个新产品进医保后未来五年对医保基金的预算冲击有多大？在 DRG 付费下,
某类药品的成本结构是盈余还是亏损？本项目把这些做成可复现的计算流程。

## 实测结果（示例数据集）

在 39 条中选记录、15 个通用名的示例数据上运行完整流程：

### 集采降价幅度分析

| 指标 | 数值 |
| --- | --- |
| 不加权平均降幅 | **54.06%** |
| **按约定采购量加权平均降幅** | **78.90%** |
| 中位降幅 | 84.39% |
| 降幅区间 | 0.00% – 94.56% |
| 集采前采购额（参考价口径） | 676,768,442 元 |
| 集采后采购额（中选价口径） | 152,004,878 元 |

> **加权与不加权差 24.8 个百分点**，这本身就是一个有意义的观察：采购量大的品种
> 降幅更深。只报不加权平均值会显著低估集采的实际影响 —— 这正是本项目同时给出
> 两个口径的原因。

### 其他模块

| 模块 | 输出 |
| --- | --- |
| **预算影响分析 BIA** | 5 年逐年预算影响、市场份额爬坡曲线、单因素敏感性（龙卷风图）、多情景对比、5% 贴现 |
| **成本-效果分析 CEA** | ICER、QALY、WTP 阈值、5000 次 Monte Carlo 概率敏感性分析、CEAC 可接受性曲线 |
| **Markov 队列模型** | 3 状态模型、周期长度可配、2000 次 PSA |
| **DRG/DIP 支付影响** | 按病组测算每例盈余/亏损 |

## 数据来源与合规说明（重要）

国家医保局、NMPA 等站点部署了 JavaScript 反爬保护，普通 HTTP 客户端无法访问。

**本项目不抓取政府网站，也不尝试绕过任何反爬保护。** 工具围绕**用户自备的
结构化数据**设计：你从国家医保局或省级药采平台下载集采中选结果（PDF/Excel），
整理为文档化的表头后喂给工具。

`examples/` 中的样本数据**明确标注为示意性数据（ILLUSTRATIVE SAMPLE DATA）**，
不是真实药品价格，仅用于演示数据格式与计算流程。文件头、README、字段说明中均
有醒目标注。列名支持中文别名，便于直接使用中文表格。

## 快速开始

```bash
git clone https://github.com/leerogerstheman/ChinaHTA
cd ChinaHTA

# 用自备数据运行完整分析
python china_hta.py run --data 你的集采数据.csv --outdir 输出目录

# 用示例数据跑通全流程
python china_hta.py run --data examples/vbp_sample.csv --outdir examples/example_output
```

输出：SQLite + CSV + Excel（多工作表）+ Markdown 报告。

**环境要求**：Python 3.9+，依赖 numpy / pandas / openpyxl / XlsxWriter。

## 测试

```bash
python tests/run_tests.py     # 或 python -m pytest tests/
```

ICER、贴现、Markov 队列轨迹、BIA 总额等关键计算均有**手工核算**的期望值断言。

## 验证方式

报告中的每一个数字都可以被独立复算：示例数据的降幅统计（54.06% / 78.90% /
84.39%）已用独立的 pandas 脚本重新计算核对，结果完全一致。

## 局限

- 样本数据为示意性数据，**不代表任何真实药品的实际价格**
- BIA 与 CEA 的结果**高度依赖输入假设**（市场规模、爬坡曲线、贴现率、效用值），
  工具的作用是让假设显式化并可做敏感性分析，而不是给出"正确"答案
- DRG 测算基于给定的权重与费率，实际支付规则因病组、地区、医院等级而异
- 本工具输出**不构成医保决策或临床建议**

## 资源

- 源码与文档：[GitHub](https://github.com/leerogerstheman/ChinaHTA)
