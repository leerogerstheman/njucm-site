---
title: "FDA 药品数据 + PubMed 文献爬虫 · PharmaCrawler"
description: "输入检索式 → 抓取 openFDA 七大药品数据源与 PubMed 文献 → 硬链接分类 → 生成 CSV / Excel / SQLite / Markdown / RIS / BibTeX / MEDLINE 索引。纯 Python 标准库，Material Design 3 界面。"
date: 2026-10-03
tags: ["爬虫", "python", "openfda", "pubmed", "文献管理", "material-design3"]
status: "active"
repo: "https://github.com/leerogerstheman/LeebertyPharma"
draft: false
created: 2026-10-03
updated: 2026-10-04

---

**纯 Python 标准库实现。** 输入检索式 → 抓取 openFDA 药品数据与 PubMed 文献 →
按物质名/期刊/检索词建立**硬链接分类**（不占额外空间）→ 生成 CSV / Excel / SQLite /
Markdown / RIS / BibTeX / MEDLINE 索引 → 多维检索 + Material Design 3 图形界面。

## 下载即用（Windows）

<div class="dl">
  <a class="dl__item dl__item--primary" href="/downloads/PharmaCrawler-v1.0.0-portable-win64.zip" download>
    <span class="dl__name">PharmaCrawler-v1.0.0-portable-win64.zip</span>
    <span class="dl__meta">12.8 MB · 官方便携版 · 已内置 Python 运行时，免安装</span>
    <span class="dl__how">解压后双击 <code>PharmaCrawler.exe</code>（或 <code>gui.bat</code>）打开图形界面</span>
  </a>
</div>

**环境要求**：**Windows 10/11 x64。官方便携版已内置 Python 运行时——不需要安装 Python，也不需要
`pip install` 任何东西。**

| 方式 | 用什么 |
| --- | --- |
| **图形界面（推荐）** | 双击 `PharmaCrawler.exe` 或 `gui.bat` |
| 命令行爬取 | `crawl.bat --dataset label --search "..."` |
| 检索已下载数据 | `search.bat` |
| 自检 | `SELFTEST.bat`（加 `--offline` 跳过联网检查） |

> 💡 **数据默认存在程序旁的 `library` 目录**，换机器时整个文件夹拷走即可。

也可以从源码运行（需 Python 3.9+，**纯标准库，无需 pip**）：`python pharma_crawler.py gui`。

## 先申请 API key（免费，配额差 120 倍）

```powershell
python pharma_crawler.py auth set --openfda-key 你的KEY --pubmed-key 你的KEY --pubmed-email 你的邮箱
```

| | 无 key | 有 key |
| --- | --- | --- |
| openFDA | 240 次/分钟、**1,000 次/天** | 240 次/分钟、**120,000 次/天** |
| PubMed | **3 请求/秒** | 10 请求/秒 |

不填也能跑，只是每天爬不了多少；NCBI 还明确要求注册 tool + email，否则被封 IP 后无法解封。

## 功能一览

| 能力 | 说明 |
| --- | --- |
| **七大 FDA 数据源** | 说明书标签 / 药品召回 / 不良事件 / NDC 目录 / drugs@FDA 批准信息 / 药品短缺 / 橙皮书 |
| **PubMed 文献** | E-utilities 全流程：检索 → History server → EFetch 批量取元数据 |
| **联合爬取** | 一条命令同时抓 FDA 与 PubMed（「这药批了什么」+「别人研究了什么」） |
| **突破上游上限** | FDA 超 26,000 条自动切 `search_after` 游标；PubMed 超 9,999 条自动按**年→月→日**递归切分 |
| **进度与状态** | 进度条 + 实时日志 + **安全停止**（下次续跑）+ 段级断点续爬 |
| **多维检索** | 关键词（5 种范围）/ 来源 / 物质名 / 期刊 / 年份 / MeSH / 出版类型 / 摘要 / DOI |
| **七种导出** | CSV · 多工作表 Excel · SQLite（带索引）· Markdown · RIS · BibTeX · MEDLINE |
| **文献工具链** | RIS 可直接拖进 EndNote / Zotero / NoteExpress；BibTeX 可直接 `\cite` |

**图形界面 4 个标签页**：爬取 / 数据检索 / 统计 / 设置（Material Design 3，亮/暗双主题）。

## 常用命令

```powershell
# ---- FDA ----
python pharma_crawler.py crawl --dataset label --search 'openfda.generic_name:"metformin"'
python pharma_crawler.py crawl --dataset enforcement --search 'classification:"Class I"'
python pharma_crawler.py crawl --dataset event --search 'receivedate:[20230101+TO+20231231]'
python pharma_crawler.py crawl --all-datasets --search 'openfda.brand_name:"aspirin"'

# ---- PubMed ----
python pharma_crawler.py crawl --term 'aspirin[Title/Abstract]'
python pharma_crawler.py crawl --term 'metformin[Title/Abstract] AND 2024:2024[PDAT]'

# ---- 检索与自检 ----
python pharma_crawler.py search metformin --scope abstract
python pharma_crawler.py selftest --offline
```

完整参数见 `python pharma_crawler.py --help`。

## ⚠️ 实测发现的文档错误（项目核心价值之一）

这些数字**与官方文档不符**，均由本项目实测核对（详见包内 `docs/DATA_SOURCE_NOTES.md`）：

1. **PubMed `retmax` 上限是 9,999，不是 10,000** —— 官方文档至今写 10,000，实际硬截断到 9999，
   `retstart` 超 9998 直接报错。**按 10,000 切分每片会静默少 1 条**，这种 bug 能在生产环境潜伏数月
2. **openFDA 用 HTTP 404 表示「查无结果」** —— 把它当故障重试的爬虫会在空查询上死循环、白烧配额
3. **openFDA 的 `openfda.*` 字段永远是数组** —— 即使只有一个元素也是 `["TYLENOL"]`，直接索引会写出脏数据
4. **各端点字段前缀不统一** —— `openfda.generic_name` 在 `ndc`/`shortages` 里查不到（那两个端点在顶层），
   `orangebook` 完全没有 `openfda` 对象；写错字段名时查询语法完全合法，只会安静返回 0 条

其他要点：openFDA `limit` 上限 1000、`skip` 上限 25000（可达窗口 26,000）；端点名是
`/drug/shortages.json`（**复数**）；NCBI 的超限响应**可能带 2xx 状态码**回来，必须检查响应体。

## 可靠性设计

- **接口结构校验** —— 上游改版时**大声报错**，绝不静默假成功
- **限流自适应** —— 命中限流自动指数退避，长期正常再逐步恢复
- **自检 `selftest`** —— 一键验证本地环境 + 接口连通 + 结构未变
- **测试覆盖** —— 包内自带 **375 项离线测试**（`python -m unittest discover -p "test_*.py"`）

## 自己打包成 exe（可选）

```powershell
pip install pyinstaller
pyinstaller PharmaCrawler.spec
```

> exe 内含配置与辅助文件，请**整目录解压**，不要把 exe 单独拎走。

## 官方资源

- 源码与文档：[GitHub](https://github.com/leerogerstheman/LeebertyPharma)
- 数据源实测笔记 / M3 设计说明 / 界面截图：仓库 `docs/` 目录