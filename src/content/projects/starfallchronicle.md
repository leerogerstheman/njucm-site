---
title: "星陨纪年 · Starfall Chronicle"
description: "一个零依赖的 JRPG 战斗模板与可玩 Demo：行动条推条、弱点击破、战技点、终结技插入；全部人物形象由代码生成 SVG，没有一张位图。双击 start.bat 即玩，原生窗口，不需要浏览器。"
date: 2026-10-05
tags: ["游戏", "jrpg", "nodejs", "程序化美术", "webview2"]
status: "active"
repo: "https://github.com/leerogerstheman/StarfallChronicle"
draft: false
---

**一个零依赖的 JRPG 战斗模板与可玩 Demo。**

战斗流程参考《崩坏：星穹铁道》（行动条推条、弱点击破、战技点、终结技插入），
角色技能与效果设计致敬 Persona（状态异常与弱点）、轨迹（导力魔法与推条）、
伊苏（高速连击与闪避）、炼金工房（道具调合与引爆）。

**所有人物形象都是代码生成的 SVG**——5 名角色的全身立绘与战斗头像、6 种敌人插画
（含 Boss 二阶段）、城镇 NPC 头像，全部由 `src/art/` 在请求时算出来。
**没有一张位图，没有一个外部素材。**

## 下载即玩（Windows）

<div class="dl">
  <a class="dl__item dl__item--primary" href="/downloads/StarfallChronicle-v0.2.0.zip" download>
    <span class="dl__name">StarfallChronicle-v0.2.0.zip</span>
    <span class="dl__meta">3.5 MB · v0.2.0 · 解压双击即玩</span>
    <span class="dl__how">解压后双击 <code>start.bat</code>，弹出独立窗口「星陨纪年 · Starfall Chronicle」</span>
  </a>
</div>

**环境要求**：**只需要 Node.js 22 或更新版本**，其余什么都不用装。

> 原生窗口启动器在发行包里**已经编译好**（`desktop/bin/StarfallChronicle.exe`）；若缺失，
> 首次运行会自动用 Windows 自带的 C# 编译器现场构建（约 2 秒），之后每次都是秒开。
> 游戏跑在自己的原生窗口里——**不占用浏览器标签页**。

## 开始玩

```
双击  start.bat
→ 弹出独立窗口「星陨纪年 · Starfall Chronicle」
→ 选起始等级，点「开始新游戏」
→ 城镇操作栏点「📖 图鉴」看全部 13 个形象
```

## 它是什么

两样东西合在一起：

**它是一个模板。** `src/` 是一套数据驱动的回合制战斗引擎。加一个新角色、新技能、新敌人、
新地图节点，都是**改数据文件**，不改引擎代码——`src/core/skills.js` 里的一个技能就是一段
声明式效果列表；`src/core/enemies.js` 里的一个 Boss 就是属性 + 技能表 + AI 描述符。

**它也是一个能从头玩到尾的 Demo。** 5 名可操控角色、小怪/精英/Boss 三段战斗、
一张有 5 个节点的地图、城镇服务（旅店 / 军需处 / 队伍编成）、升级与装备成长、
Boss 战两阶段 + 召唤 + 蓄力终结技。**序章可以通关。**

**它还自带一套原创人物美术。** 立绘、头像、敌人插画、NPC 头像都是 `src/art/` 里的纯函数
生成的矢量图——加一个新角色，是写一条 spec，不是找画师。

## 图鉴：全部 13 个形象

游戏里点城镇的 **📖 图鉴**，可以看一个按「可操控角色 / 城镇居民 / 敌人」分组的画廊：
点任意一张放大，右侧列出称号、属性、定位、背景故事，角色还会并排列出**全部四种表情**，
灰烬之王则并排列出**两个阶段**。

包内还附了 `node tools/art-sheet.js` 生成的美术对照表（由无头浏览器渲染并逐张测量）。

## 自检

启动时服务器会自动跑一遍自检（**59 项**），全部通过才会进入游戏。

## 官方资源

- 源码与变更历史：[GitHub](https://github.com/leerogerstheman/StarfallChronicle) · `CHANGELOG.md`
- 美术系统说明：`docs/ART.md`