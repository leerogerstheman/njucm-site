---
title: "鬼泣式动作游戏模板 · STYLISH ACTION"
description: "零依赖、纯静态的 2D 横版动作游戏模板 + Demo：清版波次 → 精英压制 → Boss 三阶段决战，方向码支援律令、无敌帧翻滚、风格评级 SSS。双击 index.html 即玩，无构建无依赖。"
date: 2026-10-06
tags: ["游戏", "javascript", "动作游戏", "模板", "零依赖"]
status: "active"
repo: "https://github.com/leerogerstheman/ActionGameTemplate"
draft: false
created: 2026-10-06
updated: 2026-10-06

---

**一个零依赖、纯静态的 2D 横版动作游戏模板。双击 `index.html` 即可在浏览器直接游玩。**

战斗流程参考《**鬼泣 / Devil May Cry**》：清版波次 → 精英压制 → Boss 三阶段决战。
招式与技能设计参考《**地狱潜兵 / Helldivers**》（方向码支援律令）、《**血咒之城 / Code Vein**》
（血技、无敌帧构装、影缝位移）、《**传说系列 / Tales of**》（多段极技与秘奥义演出）。

## 下载即玩（Windows / 任意系统）

<div class="dl">
  <a class="dl__item dl__item--primary" href="/downloads/ActionGameTemplate-portable.zip" download>
    <span class="dl__name">ActionGameTemplate-portable.zip</span>
    <span class="dl__meta">0.04 MB · 纯静态 · 解压双击即玩</span>
    <span class="dl__how">解压后双击 <code>index.html</code> 即可开始（无需构建、无需依赖、file:// 下可运行）</span>
  </a>
</div>

**环境要求**：**任意现代浏览器**（Edge / Chrome / Firefox）。没有 Node.js、没有 npm install、没有构建步骤。

## 操作

| 按键 | 功能 |
| --- | --- |
| `←/→` 或 `A/D` | 移动 |
| `空格` | 跳跃（可二段跳） |
| `J` | 轻击连段（连按接招 / 空中浮空追打） |
| `K` | 重击（大伤害 + 击退） |
| `L` | 挑空（把敌人打上天 → 空中连段） |
| `Shift` | 翻滚（**0.3s 无敌帧**，可取消技能硬直） |
| `U / I` | 角色技能 1 / 2（各自冷却） |
| `Q` | **支援律令**：按下后按角色指定的方向码（如 `▶▶◀`）完成呼叫，输错/超时律令中断 |
| `O` | 奥义（计量满 100 时释放，参考秘奥义演出：慢镜头 + 无敌） |
| `Esc` | 暂停 / 撤退 · `M` 节拍音效开关 |

## 关卡流程（5 波）

1. **血港潮涌** — 疾魔犬 × 浮火小鬼（热身刷风格评级）
2. **邪念增援** — 腐肉巨人 + 邪教法师远程火力
3. **精英来袭 · 圣殿看守** — 霸体精英，循环出招〔盾冲 → 圣锤砸地 → 回旋横扫〕
4. **双重威胁** — 双精英（圣殿看守 + 尖啸使）+ 杂兵
5. **BOSS · 灰烬僭主摩迪凯** — 三阶段：
   - **P1**：双连斩 / 魔弹 / 突斩
   - **P2**（60%）：+ 大地崩裂、召唤杂兵
   - **P3**（25%）：+ 灰烬逆位（瞬移背后）、焚天陨雨，节奏大幅加快

## 风格评级系统（DMC 核心）

造成伤害 / 技能命中都会积累风格值，**同招重复命中收益递减**、超时衰减、
**受击直接腰斩并清连段**。评级 `D → C → B → A → S → SS → SSS`，
评级越高收益手感越强（右上角大字实时显示）。

## 模板结构（内聚分层，改内容不碰逻辑）

```
ActionGameTemplate/
├─ index.html            入口（脚本加载即插即用）
├─ core/
│  ├─ engine.js          引擎底座：常量 / 输入 / 合成音效(Fx) / 粒子系统
│  ├─ entities.js        战斗实体：Hitbox / 弹幕 / 冲击环 / 光柱 / 火区
│  │                     + 玩家状态机 + 敌人 AI + Boss 阶段机
│  └─ game.js            流程与 HUD：场景（标题/选人/战斗/结算）、波次脚本、
│                        风格评级、律令输入、判定解算
├─ data/
│  ├─ characters.js      10 名可操作角色（连段/技能/律令/奥义 全在此表）
│  └─ enemies.js         小怪 ×4 · 精英 ×2 · Boss ×1 + WAVES 波次脚本
└─ README.md
```

### 加一个新角色（唯一需要动的文件：`data/characters.js`）

往 `CHARS` 数组里加一条（`id` / `name` / 配色 / `hp` / `spd` / `combo` 连段 / `heavy` / `launcher` /
`skills` / `strat` 支援律令 / `ult` 奥义），**选人界面、面板、HUD 全部自动出现**。

### 加一个新敌人 / 新波次（`data/enemies.js`）

- **杂兵**：往 `MOBS` 加一条（`shape` 选 `hound/imp/robe/brute` 之一，或自己在 `entities.js` 加新绘制分支）
- **精英**：往 `ELITES` 加一条，用 `seq:['a','b','c']` 指定循环出招顺序，`armorF` 越小越霸体
- **波次**：往 `WAVES` 追加 `{name, sub, spawns:[['runner', 延迟, x 位置], ...]}`

技能层可用 API（在 `core/game.js` 的 Game 类实现）：
`G.hitRel` / `G.hitAbs` / `G.proj` / `G.shock` / `G.beam` / `G.meteors` / `G.fire` / `G.orb` / `G.spawn` …

## 官方资源

- 源码：[GitHub](https://github.com/leerogerstheman/ActionGameTemplate)
- 包内 `README.md` 有完整的模板指南（角色/敌人/波次/技能层 API）