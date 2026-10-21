/**
 * 机体归并
 *
 * 库里 1742 条记录里，很多是同一台机体的不同等级或不同配色——「RX-78-2 高达」
 * 既有 RG 也有 MG，玩家最先想知道的往往就是「这台机体还有哪些版本」。
 *
 * 机体的判定规则是：品名去掉「等级 / 产品线 + 比例」的前缀，再去掉颜色、涂装、
 * 包装之类的限定语，剩下的就是机体本身。刻意保留「改 / 二式 / 量产型 / 专属」
 * 这类词——它们指的是不同的机体，不该并成一台。
 *
 * 同一个机体在不同来源里可能用不同的中文写法（「扎古」与「渣古」、
 * 「独角兽高达」与「独角兽」），所以归一之前先做一次同义词折叠。
 */

/* -------------------------------------------------------------------------- */
/* 前缀                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * 等级与产品线前缀词表。
 *
 * 中文站的品名规范是「等级 / 产品线 + 比例 + 名称」，但前缀比等级复杂得多：
 * 除了 HG / MG / RG / PG，还有 BUILD DIVERS（BD、BD:R）、BUILD CUSTOM（BC）、
 * BUILD FIGHTERS（BF）、FULL MECHANICS、ENTRY GRADE、SD CROSS SILHOUETTE
 * 这些产品线名。剥不掉前缀，同一台机器在不同产品线里就会被拆成好几台。
 */
const PREFIX_WORDS = [
  /* 等级与厂牌 */
  'ENTRY GRADE',
  'FULL MECHANICS',
  'FULLMECHANICS',
  'HIGH-RESOLUTION MODEL',
  'METAL ROBOT 魂',
  'METAL ROBOT',
  'LEGENDBB',
  'RE/100',
  'HIRM',
  /* 人偶线：剥掉产品线名，剩下的才是人物 */
  'FIGURE-RISE STANDARD',
  'FIGURE-RISE BUST',
  'FIGURE-RISE EFFECT',
  'FIGURE-RISE LABO',
  'FIGURE-RISE MECHANICS',
  'FIGURE-RISE',
  /* 产品线 */
  'HG BUILD CUSTOM',
  'SD高达 CROSS SILHOUETTE',
  'SD高达CROSS SILHOUETTE',
  '高达 CROSS SILHOUETTE',
  'CROSS SILHOUETTE',
  'SD高达世界 群英集',
  'SD高达 EX-STANDARD',
  'SD高达 EX STANDARD',
  'SD高达 BB战士',
  'SD高达BB战士',
  'SD CROSS SILHOUETTE',
  'SD GUNDAM EX-STANDARD',
  'EX-STANDARD',
  'HG AMPLIFIED IMGN',
  'BUILD DIVERS',
  'BUILD CUSTOM',
  'BUILD FIGHTERS',
  'GN ARMS TYPE-E',
  'UNLEASHED',
  'HGUC',
  'HGCC',
  'HGBC',
  'HGBD',
  'HGBF',
  'HGPG',
  'HGAW',
  'HGAC',
  'HGCE',
  'HGFC',
  'HGBO',
  'MGEX',
  'MGSD',
  'SDCS',
  'SDEX',
  'SDW',
  'SDBB',
  'SDCL',
  /* 等级缩写 */
  'HG',
  'MG',
  'RG',
  'PG',
  'SD',
  'FG',
  'FM',
  'EG',
  'MR',
  'BB',
  'EX',
  'GA',
];

/** 正则里要转义的字符 */
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/*
 * 前缀的正则：
 *   词表里最长的词先匹配，否则「HGUC」会被「HG」先吃掉
 *   (?![A-Za-z])  后面不能再跟字母，避免「HGUBAR」被拆成「HG」
 *   (?::R)?       BUILD DIVERS 的版本标记：HGBD:R
 *   (?=\s|1\/)    词后面必须跟空格或比例，否则「EX高达」会被拆成「高达」
 */
const PREFIX_RE = new RegExp(
  '^(?:' +
    PREFIX_WORDS.map((w) => escapeRe(w).replace(/ /g, '\\s+'))
      .sort((a, b) => b.length - a.length)
      .join('|') +
    ')(?![A-Za-z])(?::R)?(?=\\s|1\\/)(?:\\s*1\\/\\d+)?\\s*',
  'i',
);

/** 渠道前缀：限定品的名号里带着渠道，先剥掉 */
const CHANNEL_PREFIX =
  /^(?:高达基地限定|GUNDAM\s*BASE\s*限定|PB\s*限定|PB限定|网络限定|线上限定|官方旗舰店限定)\s*/;

/** 比例，单独出现时也要剥 */
const LEADING_SCALE = /^\s*1\/\d+\s*/;

/** 商品编号（EX-STANDARD 001、009 之类），剥掉 */
const LEADING_CODE = /^\d{3}\s+/;

/** 零宽字符：中文站的名字里偶尔混着，不清掉会变成看不见的空白 */
const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;

/** 括号里的限定语（配色、涂装、版本、包装…） */
const BRACKETED = /[（(【\[［].*?[)）\]］]/g;

/** 尾部变体后缀 */
const TRAILING_VARIANT =
  /\s*(?:Ver\.?\s*Ka|Ver\.?\s*[0-9A-Za-z]*(?:\.[0-9A-Za-z]+)?|Spec\.?\s*(?:I{1,3}|\d+)|修正版|特别版|特别配色|换色版|透明版|规格版|旧色版|配色版|典藏版|豪华版|豪华|套装\s*[①②③④⑤⑥⑦⑧⑨⑩\d]*|通常版|初回限定版|简易版|完全形态|毁灭模式|放大版)\s*$/i;

/**
 * 零件包一类的商品不是机体。
 *
 * 万代把通用零件包、水贴、说明书、底座和模型放在同一个目录里卖，名字上也带
 * 等级前缀（「HG 1/144 MS配件包9」）。它们没有对应的机体，不该占一个机体条目。
 */
const PARTS_PACK = /(配件包|零件包|扩展包|武器包|贴纸|说明书|底座|支架|徽章)/;

/** 会指向不同机体、不能剥掉的词 */
const DISTINCT_MACHINE = /(改|二式|三式|量产型|试作型|专属|专用|指挥官|新型|重制|小队|母舰|型机|形态)/;

/* -------------------------------------------------------------------------- */
/* 合装品                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * 合装品：一条记录里有多台机器，或者机器加配件。
 *
 * 中文站用「&」和「＋」连接（「核心高达&核心高达II 核心转换套装」、
 * 「拂晓高达 & 宙斯魅影 + 连接件套装」）。这类产品的主体是第一台机器，
 * 取第一段即可——它本来就是这台机器的一个版本。
 */
const BUNDLE_SEP = /[&＆+＋]/;

/**
 * 斜杠后面是颜色 / 编号变体时不该拆。
 *
 * 「扎古II TYPE C-6/R6」「扎古Ⅱ C型/C5型」是同一台机器的两款配色，
 * 而「Ex-S高达/S高达」「吉姆/吉姆II/吉姆III 套装」是几台不同的机器。
 */
const VARIANT_TAIL = /^(?:[A-Za-z]{1,2}\d|C\d)/;

/* -------------------------------------------------------------------------- */
/* 同义词与显式并机                                                            */
/* -------------------------------------------------------------------------- */

/**
 * 同义折叠：把常见的中文别名归一到规范写法。
 *
 * 键是折叠后的形式，值是规范名。这些都是同一台机体的不同中文叫法。
 */
const ALIAS_FOLD = {
  扎古: '渣古',
  扎古II: '渣古II',
  扎古2: '渣古II',
  扎古Ⅱ: '渣古II',
  沙扎比: '渣古II',
  独角兽高达: '独角兽',
  牛高达: 'ν高达',
  魔蟹: '魔蟹',
  吉翁克: '基尔克',
  基尔克: '基尔克',
  雷比尔将军: '雷比尔',
};

/**
 * 明确并成同一台机体的几对写法。
 *
 * 同一台机器，有的条目带机体编号（MS-06S 渣古II），有的不带（渣古II），
 * 这里给出规范名。键是剥完前缀后的写法。
 */
const MECH_MERGE = {
  'MS-06S 扎古II': '渣古II',
  'MS-06S 渣古II': '渣古II',
  'MS-06F 渣古II': '渣古II',
  'MS-06R-2 强尼·莱汀专用渣古II': '渣古II',
  'MS-06R-2 强尼·莱汀专用扎古II': '渣古II',
  'MS-07B 魔蟹': '魔蟹',
  'MS-07B 弗库萨': '魔蟹',
  'ASW-G-08 巴巴托斯': '巴巴托斯',
  'ASW-G-66 巴巴托斯': '巴巴托斯',
  'ASW-G-08 勇者古夫': '巴巴托斯',
  'ASW-G-66 勇者古夫': '巴巴托斯',
  'OZ-13MS 埃比昂高达': '埃比昂高达',
  'OZ-13MS 高达埃比昂': '埃比昂高达',
  'XXXG-00W0 飞翼高达零式': '飞翼高达零式',
  'ASW-G-XX 维达尔': '维达尔',
  'RX-78-2': 'RX-78-2 高达',
  'RX-78-3': 'RX-78-3 G高达',
  'RX-78-2 高达 Ver.2.0': 'RX-78-2 高达',
  'RX-78-2 高达2.0': 'RX-78-2 高达',
  'MS-06J 渣古II': '渣古II',
  'MS-06G 渣古II': '渣古II',
  /* 别名词典里说「元祖高达」就是 RX-78-2 高达，品名里两种写法都要归到同一台 */
  'RX-78-2 元祖高达': 'RX-78-2 高达',
  'RX-78-3 G3高达': 'RX-78-3 G-3高达',
  '基拉祖鲁': '基拉·祖鲁',
  '独角兽高达2号机 报丧女妖・命运女神': '独角兽高达2号机 报丧女妖·命运女神',
  /* 带机体编号的沙扎比也要折回来 */
  'MSN-04FF 沙扎比': '渣古II',
  'MSN-04 沙扎比': '渣古II',
};

/* -------------------------------------------------------------------------- */
/* 归并                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * 取机体的规范名。
 *
 * 返回空字符串表示这条记录不该参与机体维度（集结套装是产品而不是机体）。
 */
export function subjectOf(name, grade) {
  if (grade === 'GA') return '';

  /* 0. 零件包不是机体 */
  if (PARTS_PACK.test(name || '')) return '';

  let s = (name || '').trim();
  if (!s) return '';

  /* 1. 清掉零宽字符 */
  s = s.replace(ZERO_WIDTH, '').replace(/\s{2,}/g, ' ').trim();

  /* 1. 合装品取第一台机器 */
  const bundle = s.split(BUNDLE_SEP)[0];
  if (bundle.trim()) s = bundle.trim();

  /* 2. 等级 / 产品线前缀 + 比例 */
  for (let i = 0; i < 4; i++) {
    const next = s
      .replace(PREFIX_RE, '')
      .replace(LEADING_SCALE, '')
      .replace(LEADING_CODE, '')
      .trim();
    if (next === s) break;
    s = next;
  }

  /* 3. 渠道前缀可能在等级之前也可能在之后，两个位置都剥 */
  for (let i = 0; i < 3; i++) {
    const next = s.replace(CHANNEL_PREFIX, '').trim();
    if (next === s) break;
    s = next;
  }

  /* 4. 括号里的限定语 */
  s = s.replace(BRACKETED, '').replace(/\s{2,}/g, ' ').trim();

  /* 5. 尾部变体后缀（可能连着好几个） */
  for (let i = 0; i < 3; i++) {
    const next = s.replace(TRAILING_VARIANT, '').trim();
    if (next === s) break;
    s = next;
  }

  /* 6. 斜杠：颜色变体留着，几台机器只取第一台 */
  const slash = s.indexOf('/');
  if (slash > 0) {
    const parts = s.split('/');
    const tail = parts[parts.length - 1].trim();
    const head = parts[0].trim();
    /* 斜杠属于比例（1/144）时不拆 */
    const isScale = /1\/\d*$/.test(head) || (/^\d/.test(tail) && /\d$/.test(head));
    if (!isScale && !VARIANT_TAIL.test(tail)) s = head;
  }

  if (!s) return '';

  /* 7. 同义折叠 */
  s = ALIAS_FOLD[s] || s;
  s = MECH_MERGE[s] || s;

  /* 8. 「高达集结 …」这类整套产品不算机体 */
  if (/^高达集结/.test(s)) return '';

  /* 9. 只剩符号或数字的不算机体 */
  if (!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}A-Za-z]/u.test(s)) return '';

  return s;
}

/**
 * 主题的检索键：URL 与文件名都能安全使用。
 *
 * 键同时是目录名（构建时会写成 dist/data/gundam/mech/<key>/index.html），
 * 所以 Windows 的非法字符必须去掉；空格直接去掉，这样「ν 高达」和「ν高达」
 * 会归到同一台机体上。
 */
export function subjectKey(mech) {
  return (mech || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s　]+/g, '')
    .replace(/[<>:"|?*\\/&#%+,;=!'`~()（）「」【】\[\]{}]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
}

/**
 * 良笑的角色名尾巴：版本后缀。
 *
 * 「figma 我妻善逸 DX版」与「figma 我妻善逸」是同一个角色的两件产品，
 * 归到同一个主题下才看得出「这个角色还出过哪些东西」。
 */
const GSC_VERSION_TAIL =
  /\s*(?:DX版|DX|Ver\.?|ver|Version|初回限定版|初回版|限定版|彩色版|透明版|初回生産限定版)$/i;

/**
 * 按厂商算主题的检索键。
 *
 * 万代那边是机体编号与中文写法；良笑那边是角色名，版本后缀要去掉。
 */
export function subjectKeyFor(maker, subject) {
  if (maker === 'goodsmile') {
    const stripped = (subject || '').replace(GSC_VERSION_TAIL, '').trim();
    return subjectKey(stripped || subject);
  }
  return subjectKey(subject);
}

/**
 * 是否应该与别的记录并成同一台机体。
 *
 * 保守起见，只在两边剥完之后完全一致时才合并。
 */
export function sameMech(a, b) {
  if (!a || !b) return false;
  if (DISTINCT_MACHINE.test(a) && DISTINCT_MACHINE.test(b)) return false;
  return mechKey(a) === mechKey(b);
}
