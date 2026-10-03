---
title: "FAERS 药物警戒信号检测 · FAERSSignal"
description: "基于 openFDA 全库约 39,500,000 份不良事件报告，从零实现 PRR / ROR / BCPNN 三种不相称性分析，输出可复现的信号检测报告。纯 Python 标准库。"
date: 2026-10-04
tags: ["药物警戒", "faers", "openfda", "信号检测", "prr", "ror", "bcpnn", "pharmacovigilance"]
status: "active"
repo: "https://github.com/leerogerstheman/FAERSSignal"
draft: false
---

**这不是一个录入界面，而是一次真实的安全性分析。** 对 openFDA 全库做不相称性
（disproportionality）分析，输出可复现的统计结论。

很多药物警戒工具做的是「把 ICSR 录进系统」，本项目做的是**从数据里算出信号** ——
这才是 PV 岗位的硬技能。

## 实测结果（真实数据，非示例）

对 3 个药物 × 45 个首选术语（PT）共 **135 个药物-反应组合**的分析，
全库药物-反应报告对总数 **N = 39,497,182**：

| 指标 | 数值 |
| --- | --- |
| 检出信号数（任一判据满足） | **125 / 135** |
| 三条判据（PRR+ROR+IC025）同时满足 | **111** |
| METFORMIN 信号数 | 42 / 45 |
| IBUPROFEN 信号数 | 41 / 45 |
| ASPIRIN 信号数 | 42 / 45 |

**最强信号：METFORMIN → LACTIC ACIDOSIS（乳酸酸中毒）**

| 统计量 | 数值 |
| --- | --- |
| 报告数 a | 20,130 |
| **PRR** | **157.38**（95% CI 153.85–160.99） |
| **ROR** | **165.01**（95% CI 161.24–168.86） |
| **IC / IC025** | **5.86 / 5.83** |
| χ² | 1,140,825.4 |
| 期望报告数 E | 347.13 |

> 这个结果本身是一次有意义的**方法学验证**：二甲双胍导致乳酸酸中毒是临床上
> 公认的、说明书明确警示的风险。一个信号检测算法如果在真实全库数据上复现不出
> 这个信号，那它一定是错的。本项目复现出了，且强度（PRR 157）与文献报道的量级一致。

## 实现的统计方法

全部**从零实现，不依赖 scipy / statsmodels**，每个公式都在 README 中给出：

| 方法 | 说明 |
| --- | --- |
| **PRR** | 比例报告比，含 χ² 与 95% CI |
| **ROR** | 报告比值比，95% CI 用对数正态近似 |
| **BCPNN** | 贝叶斯置信传播神经网络，实现 IC 与 IC025，含近似方差公式 |
| **判据** | EU 标准（PRR≥2 且 χ²≥4 且 N≥3）、ROR 下限>1、IC025>0 |
| **零值处理** | 所有除数零值均做防护；单元格为 0 时按 Haldane-Anscombe 加 0.5 并在文档中说明 |

**尾部未校正 χ²**：实现的是 Pearson χ²（不校正），与手工复算精确到小数点后 7 位。
Yates 校正版本在本文量级下对 EU 判据（χ²≥4）结论无影响。

## 数据来源

`openFDA` 公开 API（`api.fda.gov/drug/event.json`），使用其 `count=` 聚合接口
构建 2×2 列联表，礼貌限流（每次请求间隔约 1 秒）。

正确处理了两个容易踩的坑：openFDA 在**查无结果时返回 HTTP 404**（不是空 JSON），
把它当故障重试的爬虫会在空查询上死循环；`count` 结果里的 term 大小写不统一，
必须归一化后再配对。

## 快速开始

```bash
git clone https://github.com/leerogerstheman/FAERSSignal
cd FAERSSignal

# 运行一次完整分析并生成报告
python faers_signal.py analyze --drug METFORMIN --drug IBUPROFEN --drug ASPIRIN

# 输出：examples/signals.csv、examples/report.md、examples/faers_example.sqlite
```

**环境要求**：Python 3.9+，**纯标准库，无需 pip install**。

## 测试

```bash
python -m pytest tests/          # 或 python tests/test_stats.py
```

统计函数用手工计算的期望值做断言，而非用被测代码自身生成的"快照"。

## 报告内容

生成的 Markdown 报告包含：方法学说明、2×2 列联表定义、判据、按信号强度排序的
结果表，以及**局限性说明**：

- FAERS 是**自发报告**系统，**没有分母**，不能计算发生率
- 报告数受报告偏倚、媒体关注、诉讼影响
- 存在重复报告与信息不全
- **不相称性不等于因果关系**，信号仅提示需要进一步评估

这些限制不是免责声明，而是 PV 从业者必须能说清楚的专业常识。

## 资源

- 源码与文档：[GitHub](https://github.com/leerogerstheman/FAERSSignal)
- 数据源：[openFDA Drug Adverse Event API](https://open.fda.gov/apis/drug/event/)
