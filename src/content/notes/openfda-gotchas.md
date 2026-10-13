---
title: "openFDA 接口实战：两个会静默出错的坑"
description: "查无结果返回 404 而不是空 JSON，以及 count 结果里 term 大小写不统一 —— 两个都不会抛异常。"
date: 2026-10-12
tags: ["药物警戒", "openfda", "api", "爬虫", "数据质量"]
draft: false
---

在 openFDA 上做批量统计时，踩到两个坑。它们共同的特点是：**不抛异常，只是悄悄
给你错的结果。**

## 坑一：查无结果返回 HTTP 404，而不是空的 JSON 数组

直觉上"没找到"应该返回 200 + 空结果。但 `api.fda.gov/drug/event.json` 在查询无命中
时返回 **404**。

于是这段看起来完全正常的代码会出事：

```python
for drug in drug_list:          # 假设 45 个药
    resp = fetch(url)
    if resp.status_code != 200:
        retry(resp)             # "可能是临时故障，重试"
```

一个不存在的药-反应组合 → 404 → 被当成故障 → 重试 → 还是 404 → 无限重试。

**表现是任务卡死、CPU 打满、日志里全是同一个请求。** 最糟的情况是它不报错，只是
永远跑不完，你以为在算大任务。

对策很直接：**404 在这个 API 上是有效的业务结果，不是故障。** 只对 429/5xx 重试，
404 直接记为"该组合无数据"跳过。

## 坑二：`count` 结果里的 term 大小写不统一

用 `count=` 聚合接口统计报告数，返回的 term 字段大小写不统一。同一批数据里可能同时
出现 `METFORMIN` 和 `Metformin`。

如果直接用 term 字符串去和你的查询词配对：

```python
counts = {row.term: row.count for row in resp.results}
a = counts.get(query.upper(), 0)     # 对上了
b = counts.get(query.title(), 0)     # 没对上，静默取 0
```

未命中的那一路静默变成 **0** —— 而 0 在列联表里意味着"该组合没有报告"，会让不成
比例性分析得出荒谬的强信号。

**这是最危险的一类 bug**：`a` 被当 0 时，计算照常进行，结论看起来比平时更强。

对策：**配对前统一归一化**，并且断言"命中了预期的项数"。如果预期 45 个 PT 却只
匹配到 30 个，说明归一化没做干净 —— 这个断言比任何事后检查都便宜。

## 共同教训

两个坑的共同点是：**失败以数据的形式出现，而不是以错误的形式出现。**

所以对外部数据源的默认值应该是"怀疑"，具体到这里就是：

- 分母为 0 时，先问"是真的 0，还是我没匹配上"
- 聚合结果的项数对不上预期时，**中止**而不是继续
- 限流保持礼貌（FAERSSignal 用每次请求间隔约 1 秒），别把公开接口打成负担

---

延伸：[FAERSSignal](https://github.com/leerogerstheman/FAERSSignal)

相关：[不相称性分析的三种方法与选型边界](./disproportionality-methods/) ·
[三个由真实数据暴露的 SQL 缺陷](./sql-silent-failure/)
