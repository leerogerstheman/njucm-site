/**
 * 良笑商城与良笑资料库的对照
 * ---------------------------------------------------------------------------
 * 良笑有两套系统：
 *
 *   goodsmile.info  产品资料库——中文品名、作品名、发售月、建议零售价
 *   goodsmile.com   线上商城——当下的在售状态、现价、限定标签
 *
 * 两边的 id 各是各的：商城用的是商城系统的商品 id（webrevo 的那串数字），
 * 资料库用的是资料库自己的编号，**同一个产品两边的 id 并不相等**（核对过：
 * id 相同的几千对里品名没有一对能对上）。所以只能靠品名对照。
 *
 * 品名出自同一套翻译，多数差别只是空格与标点，但也有三类对不上：
 *
 *   1. 商城品名带【再販】这类角标        —— 去掉方括号里的内容再比
 *   2. 一边有产品线前缀、一边没有        —— 黏土人 / figma / PLAMATEA…
 *   3. 商城一件商品对应资料库好几件      —— 商城把多个款式写在一个品名里，
 *                                          用 ／ 分隔
 *
 * 去掉前缀之后比对容易误伤（「黏土人 02」这种名字太短），所以前缀比对
 * 额外要求剩下的字至少四个，而且这个键在商城那边只能命中一件商品。
 */

/** 品名归一化：全角转半角、去空格与标点、小写 */
export function normName(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s　]+/g, '')
    .replace(/[·・:：,，.。/\\()（）\[\]{}<>《》「」『』【】\-–—_~〜～!！?？'"、*&#@]/g, '');
}

/** 产品线前缀：商城与资料库可能一边有一边没有 */
const PREFIXES = [
  'figma', '黏土人', '黏土娃', 'ねんどろいど', 'nendoroid', 'plamatea', 'modroid',
  'pixel', 'pop up parade', 'plamax', 'megamax', '比例模型', '1/7比例模型', '1/8比例模型',
  'gsm', 'ex ride', 'exride', 'vividworks', 'eachgear', 'goodsmile figure',
  'figure rise', 'figma plus', 'figma fix', 'figure',
];

/** 去掉品名开头的产品线前缀 */
export function stripPrefix(key) {
  for (const p of PREFIXES) {
    const np = normName(p);
    if (key.startsWith(np) && key.length > np.length) return key.slice(np.length);
  }
  return key;
}

/** 去掉方括号／圆括号里的角标：【再販】、（2021）之类 */
function stripBrackets(text) {
  return String(text).replace(/[【\[（(][^】\]）)]*[】\]）)]/g, '');
}

/** 去掉前缀之后至少要剩下这么多字，太短的键容易撞车 */
const MIN_STRIPPED_LEN = 4;

/**
 * 商城的对照索引。
 *
 * 三张表，键 → 候选商品列表：
 *   full      品名原样归一化后的键 —— 置信度最高
 *   noBracket 去掉角标后的键 —— 次之
 *   stripped  去掉前缀后的键 —— 最松
 *
 * 同一个键可能对应好几件商城商品（同名不同色号）。这时靠**价格**消歧：
 * 资料库那一条的建议零售价对上哪个，就是哪个；一个都對不上就不硬配。
 */
export function buildMallIndex(mall) {
  const full = new Map();
  const noBracket = new Map();
  const stripped = new Map();

  const put = (map, key, record) => {
    if (!key) return;
    const list = map.get(key);
    if (!list) map.set(key, [record]);
    else if (!list.includes(record)) list.push(record);
  };

  for (const m of mall) {
    const raw = String(m.name || '');
    if (!raw.trim()) continue;
    /*
     * 商城把多个款式写进一个品名时分隔符有两种：全角的 ／（如
     * 「…草莓 泳裝Ver.／紅豆 泳裝Ver.／椰子 泳裝Ver.」）与半角的 /
     * （如「怪奇物語 …威爾 (Japan Ver.)/11號 …」）。但半角的 / 同时也出现在
     * 品名内部（「黏土人 Saber/沖田總司」），所以整名与两种切分都建索引。
     */
    const parts = new Set([raw]);
    for (const seg of raw.split(/[／/]/)) parts.add(seg);
    for (const seg of parts) {
      const k = normName(seg);
      if (!k) continue;
      put(full, k, m);
      const kb = normName(stripBrackets(seg));
      if (kb !== k) put(noBracket, kb, m);
      const ks = stripPrefix(k);
      if (ks !== k && ks.length >= MIN_STRIPPED_LEN) put(stripped, ks, m);
    }
  }
  return { full, noBracket, stripped };
}

/**
 * 候选里有好几件时，用价格挑一件。
 *
 * 同名的商城商品多半是两种情况：
 *   同一件挂在不同分类下（价格一样，随便挑哪件都对）
 *   同一角色的不同比例（价格不同，靠资料库的建议零售价区分）
 *
 * 价格一个都对不上，就挑最接近的一件——名字已经精确对上了，
 * 价格只是最后一道消歧，值得用。挑法与理由一并记下来，方便以后复查。
 */
function pickByPrice(candidates, price) {
  if (!candidates || !candidates.length) return null;
  if (candidates.length === 1) return { mall: candidates[0], how: '' };
  if (price) {
    const same = candidates.filter((m) => m.priceJpy && m.priceJpy === price);
    if (same.length === 1) return { mall: same[0], how: '' };
    if (same.length > 1) return { mall: same[0], how: 'same-price' };
    let best = candidates[0];
    for (const m of candidates) {
      if (Math.abs((m.priceJpy || 0) - price) < Math.abs((best.priceJpy || 0) - price)) best = m;
    }
    return { mall: best, how: 'approx-price' };
  }
  return { mall: candidates[0], how: 'no-price' };
}

/**
 * 商城在售状态的判定。
 *
 * 商城的**状态文字会留旧值**：一件 2020 年就结束预购的商品，页面上仍然写着
 * 「預購期間：2020年11月05日~至 (JST)2021年01月06日」。所以不能拿状态文字
 * 判断「现在能不能订」。
 *
 * 可靠的是**订购按钮**：还能下单的才有那个按钮。核对下来，
 * 写着「開放預購中」的全都有按钮，写着「預購截止」与只留旧預購期間的都没有。
 *
 *   preorder  预约中——按钮写「立即預購」
 *   available  在售——按钮写「立即購買」
 *   soldout   已售罄——页面写着完売／售罄
 *   ended     已结束——商城还留着页面与价格，但已经不能下单
 *   no-data   这一站没有这件商品的资料
 */
export function saleStatusOf(statusText, orderButton, priceJpy) {
  const text = String(statusText || '');
  const btn = String(orderButton || '');
  const hay = `${text} ${btn}`;

  if (!text && !btn && !priceJpy) return 'no-data';
  if (/開放預購中|予約受付中|予約中|预约中/.test(hay)) return 'preorder';
  if (/立即預購|今すぐ予約注文/.test(btn)) return 'preorder';
  if (/完売|売り切れ|售罄|完售/.test(hay)) return 'soldout';
  if (/立即購買|今すぐ注文|購入|立即订购/.test(btn)) return 'available';
  if (btn) return 'available';
  if (priceJpy > 0) return 'ended';
  return 'unknown';
}

/**
 * 从商城的状态原文里取出预约期间。
 *
 * 原文长这样：「開放預購中 預購期間：2026年10月06日〜至 (JST)2026年12月09日」。
 * 抓取器与合并层都用这一份解析——抓取器顺手存下来，合并层再从原文兜一次，
 * 这样即使缓存里的结构化字段是空的（比如规则改过），页面上仍然有预约区间。
 */
export function parsePreorderWindow(statusText) {
  const m = /(\d{4})年(\d{1,2})月(\d{1,2})日[^〜~]{0,12}[〜~]\s*(?:至\s*)?(?:\(JST\)\s*)?(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(
    String(statusText || ''),
  );
  if (!m) return { from: '', to: '' };
  return {
    from: `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`,
    to: `${m[4]}-${m[5].padStart(2, '0')}-${m[6].padStart(2, '0')}`,
  };
}

/**
 * 把资料库的一条记录对到商城那一条。
 *
 * 返回 { mall, how } 或 null。how 说明是对上的方式，写进合并层的备注里，
 * 方便以后回头查是哪一条规则对上的。
 *
 * price 是资料库那一条的建议零售价，用来在同名商品之间消歧。
 */
export function matchMall(index, name, price) {
  const k = normName(name);
  if (!k) return null;

  const exact = pickByPrice(index.full.get(k), price);
  if (exact) return { mall: exact.mall, how: exact.how };

  const noB = pickByPrice(index.noBracket.get(k), price);
  if (noB) return { mall: noB.mall, how: noB.how || 'no-bracket' };

  const ks = stripPrefix(k);
  if (ks.length >= MIN_STRIPPED_LEN) {
    const s = pickByPrice(index.stripped.get(ks), price);
    if (s) return { mall: s.mall, how: s.how || 'prefix' };
  }
  return null;
}
