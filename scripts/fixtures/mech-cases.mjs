/**
 * 机体归并的固定用例。
 *
 * 归并规则是手写的正则与表——改一行就可能让上百条记录的机体名悄悄变掉。
 * 这些用例把已经人工核对过的行为钉住：改规则后跑一遍
 * `node scripts/test-mech.mjs`，不一样的就是改坏的。
 *
 * 每条记录三件事：
 *   name     原始品名
 *   grade    等级（GA 不参与机体维度）
 *   mech     期望的机体名（空字符串表示「不该有机体」）
 *   why      为什么是它——写下来，将来才知道该不该改
 */
export const MECH_CASES = [
  /* ---- 剥前缀 ------------------------------------------------------- */
  { name: 'MG 1/100 RX-78-2 高达', grade: 'MG', mech: 'RX-78-2 高达', why: '等级与比例是商品属性，不是机体' },
  { name: 'HGUC 1/144 RX-78-2 高达', grade: 'HG', mech: 'RX-78-2 高达', why: '不同等级同一台机器，归到同一机体' },
  { name: 'RG 1/144 RX-78-2 高达', grade: 'RG', mech: 'RX-78-2 高达', why: '同上' },
  { name: 'MG 1/100 RX-78-2 高达 Ver.3.0', grade: 'MG', mech: 'RX-78-2 高达', why: 'Ver.3.0 是配色版本，仍是同一台机器' },
  { name: 'SD 1/144 SDCS RX-78-2 高达', grade: 'SD', mech: 'RX-78-2 高达', why: 'SD 比例不改变机体' },

  /* ---- 产品线前缀要剥 ----------------------------------------------- */
  { name: 'HGBD:R 1/144 核心高达Ⅱ', grade: 'HG', mech: '核心高达Ⅱ', why: 'BD:R 是产品线，不是机体' },
  { name: 'HGBD 1/144 核心高达Ⅱ', grade: 'HG', mech: '核心高达Ⅱ', why: '同上' },
  { name: 'SD高达 CROSS SILHOUETTE 旋风高达', grade: 'SD', mech: '旋风高达', why: 'CROSS SILHOUETTE 是产品线' },
  { name: 'SD高达 EX-STANDARD 飞升自由高达', grade: 'SD', mech: '飞升自由高达', why: 'EX-STANDARD 是产品线' },
  { name: 'FULL MECHANICS 1/100 风灵高达 帕梅特刻痕·6', grade: 'FM', mech: '风灵高达 帕梅特刻痕·6', why: 'FULL MECHANICS 要剥，帕梅特刻痕是机体变体' },
  { name: 'ENTRY GRADE 1/144 RX-78-2 高达', grade: 'EG', mech: 'RX-78-2 高达', why: 'ENTRY GRADE 要剥' },
  { name: 'HG 1/72 MAILeS 灵龟', grade: 'HG', mech: 'MAILeS 灵龟', why: 'MAILeS 是零件线名，不是等级' },

  /* ---- 渠道前缀要剥 ------------------------------------------------- */
  { name: 'MG 1/100 高达基地限定 高达F90', grade: 'MG', mech: '高达F90', why: '渠道限定语要剥' },
  { name: 'HG 1/144 PB限定 独角兽高达', grade: 'HG', mech: '独角兽', why: '渠道限定语要剥；「独角兽高达」按同义折叠作「独角兽」' },

  /* ---- 括号里的限定语要剥 ------------------------------------------- */
  { name: 'MG 1/100 RX-78-2 高达 [浮世绘封绘Ver.]', grade: 'MG', mech: 'RX-78-2 高达', why: '括号里是包装与涂装说明' },
  { name: 'HG 1/144 异端高达[交叉对比色 /落英白 ]', grade: 'HG', mech: '异端高达', why: '同上' },

  /* ---- 合装品取第一台 ----------------------------------------------- */
  { name: 'HG 1/144 核心高达&核心高达II 核心转换套装', grade: 'HG', mech: '核心高达', why: '合装品的主体是第一台机器' },
  { name: 'HG 1/144 独角兽高达/双头龙高达 套装', grade: 'HG', mech: '独角兽', why: '同上' },
  { name: 'HG 1/144 Ex-S高达/S高达', grade: 'HG', mech: 'Ex-S高达', why: '同上' },
  { name: 'HG 1/144 独角兽高达', grade: 'HG', mech: '独角兽', why: '同义折叠：独角兽高达 → 独角兽' },

  /* ---- 斜杠：颜色变体保留，多机合集取第一台 ------------------------- */
  { name: 'HGUC 1/144 扎古II TYPE C-6/R6', grade: 'HG', mech: '扎古II TYPE C-6/R6', why: 'C-6 与 R6 是同一台机器的两种配色' },
  { name: 'HG 1/144 扎古Ⅱ C型/C5型', grade: 'HG', mech: '扎古Ⅱ C型/C5型', why: '同上' },
  { name: 'HG 1/144 Ex-S高达/S高达', grade: 'HG', mech: 'Ex-S高达', why: '两台不同的机器，取第一台' },

  /* ---- 刻意保留「改 / 二式 / 量产型」这类词 ------------------------- */
  { name: 'MG 1/100 沙漠高达改 EW', grade: 'MG', mech: '沙漠高达改 EW', why: '「改」是另一台机器，不能并' },
  { name: 'MG 1/100 强袭自由高达二式', grade: 'MG', mech: '强袭自由高达二式', why: '「二式」是另一台机器' },
  { name: 'HG 1/144 量产型吉姆', grade: 'HG', mech: '量产型吉姆', why: '「量产型」是机体类型的一部分' },
  { name: 'HG 1/144 夏亚专用扎古II', grade: 'HG', mech: '夏亚专用扎古II', why: '「专用机」是不同机体' },

  /* ---- 同义折叠与显式并机 ------------------------------------------- */
  { name: 'HG 1/144 扎古', grade: 'HG', mech: '渣古', why: '「扎古」是「渣古」的俗写' },
  { name: 'HGUC 1/144 渣古II', grade: 'HG', mech: '渣古II', why: '罗马数字写法统一' },
  { name: 'HG 1/144 MSN-04FF 沙扎比', grade: 'HG', mech: '渣古II', why: '沙扎比是渣古II的别称（见别名词典）' },
  { name: 'MG 1/100 RX-78-2 元祖高达', grade: 'MG', mech: 'RX-78-2 高达', why: '元祖高达是别称，要折回规范名' },
  { name: 'HG 1/144 基拉·多加', grade: 'HG', mech: '基拉·多加', why: '「·」不参与归一折叠' },

  /* ---- 不该有机体 ---------------------------------------------------- */
  { name: '高达集结 豪华套装 03', grade: 'GA', mech: '', why: '集结套装是产品不是机体' },
  { name: 'HG 1/144 MS配件包9', grade: 'HG', mech: '', why: '零件包不是机体' },
  { name: 'HG 1/144 红色高达用扩展配件包', grade: 'HG', mech: '', why: '配件包不是机体' },
  { name: 'HG 1/144 说明书', grade: 'HG', mech: '', why: '不是模型' },
];
