---
title: "pixiv 关键词爬虫 · LeebertyPixiv"
description: "pixiv 原图下载 + 可检索分类图库（GUI）：关键词/画师/全量/收藏夹四种检索，R-18/AIGC 分级开关，动图转码，画师追更，多维图库检索。纯 Python 标准库，带图形界面。"
date: 2026-09-30
tags: ["pixiv", "crawler", "python", "tkinter", "图库"]
status: "active"
repo: "https://github.com/leerogerstheman/LeebertyPixiv"
draft: false
created: 2026-09-29
updated: 2026-10-04

---

输入关键词 → 抓取 pixiv 搜索结果 → 下载**原图** → 按标签 / 画师 / 关键词建立**硬链接分类**（不占额外空间）
→ 生成 CSV / Markdown / SQLite 索引 → 图库多维检索 + 图形界面。

**纯 Python 标准库实现**（Python 3.9+，无需安装任何第三方包），当前为**测试版**。

> ⚠️ **测试版（BETA）**：核心功能已可用，仍在持续迭代，后续会有大量修改。
> pixiv 随时可能改接口——程序已做结构校验，改版时会**明确报错**而不是静默失效，但修复需要更新版本。
> 遇到问题请提 [Issue](https://github.com/leerogerstheman/LeebertyPixiv/issues)，附上日志最好。

## 下载即用（Windows）

<div class="dl">
  <a class="dl__item dl__item--primary" href="/downloads/PixivCrawler-windows-v0.11.1-beta.zip" download>
    <span class="dl__name">PixivCrawler-windows.zip</span>
    <span class="dl__meta">30.0 MB · Windows 10/11 x64 · v0.11.1-beta</span>
    <span class="dl__how">解压后双击 <code>PixivCrawler.exe</code> 即可运行，无需装 Python</span>
  </a>
</div>

**使用前必看**：

- **请整目录解压**，不要把 exe 单独拷走——它依赖同目录的 `_internal\`（自带 Python 与依赖）
- 首次使用建议先**登录**（程序内有引导，或见下文"登录方式"），否则只能匿名搜索、每种排序约 600 个作品、无 R-18
- 当前为测试版，pixiv 改接口时程序会明确报错，等待更新版本即可
- 官方发布与历史版本：[GitHub Releases](https://github.com/leerogerstheman/LeebertyPixiv/releases)（**v0.11.1-beta 为最新**）

## 快速上手

```powershell
PixivCrawler.exe gui                     # 打开图形界面（6 个标签页）
PixivCrawler.exe auth login --method token   # ① OAuth 登录（推荐）
PixivCrawler.exe crawl 初音ミク --pages 5    # ② 关键词爬取并下载原图
PixivCrawler.exe follow sync              # ③ 或追更订阅的画师（增量）
PixivCrawler.exe search 初音 --tag 雪ミク    # ④ 检索已下载的图库
PixivCrawler.exe selftest                 # 自检（离线 20 项，--offline 跳过网络）
```

## 功能一览

| 能力 | 说明 |
| --- | --- |
| **四种检索** | 关键词 / 画师ID（走作品全集接口，不受翻页上限）/ 全量分段（按时间切分，突破约 6000 条上限）/ **用户收藏夹**（公开可爬、私密需 OAuth） |
| **筛选** | 时间范围（年月日三级联动）、点赞/收藏门槛、**R-18 / R-18G 独立开关**、**AIGC 排除/只要** |
| **动图** | ugoira 转 webp / gif（用 ffmpeg），可自动删原始 zip |
| **画师追更** | 订阅清单（`artists.txt`）+ 增量下载 + 上次追更时间；GUI「追更」页一键同步 |
| **图库检索** | 原TAG（多选+自动补全）/ **画师ID（独立列表区：按作品数排序、可多选）** / 衍生TAG / 时间 / 人气 / 分级 / AIGC；单击缩略图预览、双击打开原图 |
| **衍生标签** | 每张图可加自定义标签；每次爬取自动附「第 N 次爬取」溯源标签；爬完可一键批量加标签 |
| **可靠性** | 接口结构校验（改版响亮报错）、限流自适应、断点续爬、缺页自动修复（`repair`）、自检（`selftest`） |

**图形界面 6 个标签页**：爬取 / 追更 / 图库检索 / 图库位置 / 读取能力（自动体检+三种登录方式）/ 爬取历史。

## 登录（三种方式）

| 方式 | 用法 | 说明 |
| --- | --- | --- |
| **① OAuth（推荐）** | `auth login --method token` | 浏览器打开 pixiv 授权页登录，程序拿长期有效 refresh_token |
| ② 自动读浏览器 | `auth login --method auto-cookie` | 从本机浏览器读 cookie；需先完全退出浏览器 |
| ③ 手动粘贴 | `auth login --method cookie` | F12 → Application → Cookies 复制 `PHPSESSID` 粘贴 |

登录状态下才能突破"每种排序约 600 个作品"的限制并获取 R-18 内容。
凭据保存在 `~/.pixiv_crawler/credentials.json`（用户目录，不写进项目）；refresh_token 轮换自动保存。
**凭据等价于登录态：`config.json` / `credentials.json` 请勿外传或提交**（已 gitignore）。

## 常用命令速查

```powershell
crawl 初音ミク                      # 默认收最新 1 页
crawl 初音ミク --pages 5            # 翻 5 页
crawl 初音ミク --deep               # 深度：最新+最早两段
crawl 初音ミク --full               # 全量：按时间段切分尽量取全（先 --dry-run 看量级）
crawl 初音ミク --dry-run            # 干跑：只报会下多少，不下载
crawl 初音ミク --date-from 2024-01-01 --date-to 2024-12-31   # 时间范围
crawl 初音ミク --min-likes 1000     # 点赞门槛
crawl 初音ミク --keep-r18           # 收 R-18（默认跳过）
crawl 初音ミク --ai-exclude         # 排除 AI 生成
crawl --artist-id 73260619          # 按画师ID爬全部作品
search 初音 --tag 雪ミク            # 检索图库
repair / repair --clean-tags        # 补齐缺失页 / 清洗拼接标签
reindex --relink                    # 重建索引/分类链接
stats                               # 图库统计
```

完整参数用 `PixivCrawler.exe crawl --help` 查看。

## 画师追更

```powershell
follow add 73260619 四宮いずな     # 订阅画师（ID 或主页链接）
follow list                        # 看清单
follow sync                        # 增量下载新作品（可 --dry-run 先看）
```

清单纯文本 `library/artists.txt`，每行 `画师ID|画师名|上次追更时间|备注`，可直接编辑。

## 已知限制

1. **不登录只能搜约 600 个/排序**；要更多、要 R-18 请登录（见上）
2. **pixiv 改接口时程序会明确报错**（不会静默假成功），修复需更新版本；接口地址可在 `config.json` 的 `endpoints` 覆盖
3. 全量模式爬热门关键词可能占大量磁盘——先 `--dry-run` 或 GUI「预估」按钮看量级
4. R-18G（猎奇）默认跳过，需 `--keep-r18g` 单独放开
5. Windows 完整支持；Linux/macOS 可用命令行（动图转码需自装 ffmpeg）

## 从源码运行

```
Python 3.9+，无需 pip install 任何第三方包
```

```bat
git clone https://github.com/leerogerstheman/LeebertyPixiv.git
cd LeebertyPixiv
gui.bat          :: 或 python pixiv_crawler.py gui
```

配置文件 `config.json`：改 proxy、输出目录、并发、限速门槛等，详见文件内注释。