/**
 * JSON-LD 的安全序列化
 * ---------------------------------------------------------------------------
 * 结构化数据用 <script type="application/ld+json"> 装在页面里，写法是
 * set:html + JSON.stringify。但 JSON.stringify **不转义 `</`**——
 * 只要字符串里出现 `</script>`，浏览器就会在那里结束 script 块，
 * 后面的内容变成真正的 HTML/脚本。
 *
 * 这个站的品名、备注、主题名都是从各家厂商站点抓来的：第三方站上出现什么，
 * 这里就可能出现什么。所以这不是假想问题，而是「下一轮抓取就可能带进来」
 * 的结构性风险。
 *
 * 把 `<`、`>`、`&` 换成 JSON 里的 Unicode 转义，语义完全不变
 * （JSON.parse 之后还是原来的字符），但 HTML 解析器再看不到尖括号。
 */
export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&]/g, (c) => {
    return '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0');
  });
}
