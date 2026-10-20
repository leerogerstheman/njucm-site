/**
 * 中文站作品线名 → 站内作品线 id
 *
 * 中文站的作品线分类页给的分类名是「机动战士高达 水星的魔女」这种长名，
 * 站内要的是简短的 id。这里是唯一的对照表，采集脚本与合并脚本共用。
 */

export const SERIES_MAP = {
  '机动战士高达 闪光的哈萨维': 'hathaway',
  '机动战士高达 铁血的奥尔芬斯': 'iron-blooded',
  '机动战士高达独角兽（UC）': 'uc',
  '机动战士高达SEED': 'seed',
  '机动战士高达SEED DESTINY': 'seed-destiny',
  '新机动战记高达W': 'w',
  '机动战士高达': 'uc',
  '机动战士高达 逆袭的夏亚': 'uc',
  '高达创形者 再起': 'gundam-build',
  '高达创形者': 'gundam-build',
  '高达创战者': 'gundam-build',
  '高达创战元宇宙': 'gundam-build',
  '机动战士高达 THE ORIGIN': 'uc',
  '机动战士高达Z高达': 'zeta',
  '机动战士Z高达': 'zeta',
  '机动战士高达 水星的魔女': 'wfm',
  '机动战士高达SEED FREEDOM': 'seed-freedom',
  '机动战士高达SEED FREEDOM ZERO': 'seed-freedom',
  '机动战士高达F91': 'f91',
  '机动战士高达0080 口袋中的战争': '0080',
  '机动战士高达ZZ': 'zz',
  '机动战士高达NT': 'gundam-nt',
  '机动战士高达AGE': 'gundam-age',
  '机动战士高达MOON高达': 'gundam-moon',
  '机动战士高达 雷霆宙域': 'pilot-season',
  '机动战士高达 库库鲁斯·多安的小岛': 'gundam-mv',
  '机动战士高达 高达前哨战': 'gundam-front',
  '机动战士高达外传 MISSING LINK': 'missing-link',
  '高达Reconguista in G': 'ring-of-nergal',
  '机动战士高达00': 'gundam-00',
  '机动战士高达 海盗高达': 'uc',
  '机动战士高达RG XARX-ZERO': 'gundam-xarx-zero',
  '机动武斗传G高达': 'g-gundam',
  '机动战士V高达': 'v-gundam',
  '高达模型君': 'other',
  '机动战士Gundam GQuuuuuuX': 'gquuuuuux',
  '机动新世纪高达X': 'gundam-x',
  '高达 异轨征途': 'other',
  '高达破坏者 对战记录': 'gundam-build-divers',
  'SD高达世界 群英集': 'sd-gundam',
  'SD三国创杰传': 'sd-gundam',
  '高达集结': 'gundam-assemble',
  'GUNDAM ASSEMBLE': 'gundam-assemble',
};

export function seriesIdOf(seriesRaw) {
  return SERIES_MAP[seriesRaw] || 'other';
}
