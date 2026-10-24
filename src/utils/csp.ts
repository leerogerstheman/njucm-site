/**
 * 内容安全策略（CSP）
 * ---------------------------------------------------------------------------
 * 这个站的内容一半是抓来的：品名、备注、主题名、价格、发售日，都来自
 * 各家厂商的网页。这些字符串最终会落进 HTML，所以「万一某条记录里混进
 * 了标记」不是一个假设性问题，而是一个迟早要处理的问题。
 *
 * CSP 就是那道闸。它写在两个地方：
 *
 *   1. 每个页面的 <head> 里一条 <meta http-equiv="Content-Security-Policy">
 *      —— 静态托管拿不到响应头，meta 是唯一能随页面走的策略。
 *   2. Cloudflare 的响应头（见 deploy/security-headers.md）—— 补上
 *      meta 表达不了的东西（frame-ancestors），并且在 meta 之前就生效。
 *
 * 两处用的是**同一份字符串**。这不是巧合，是刻意的：
 *
 *   - 页面上没有任何可执行的内联脚本，全部是同源的外部文件。所以
 *     script-src 只要 'self'，不需要哈希，也不需要 'unsafe-inline'。
 *   - 策略里没有哈希，就永远不会「改一行代码 → 哈希过期 → 线上脚本
 *     被拦 → 本地却好的」这种最难查的故障。抄到 Cloudflare 里的规则
 *     从此不用再动。
 *
 * 代价是每个页面都要带一条约 300 字节的 meta。19662 个页面合计 6 MB，
 * 相对 780 MB 的站点体积可以忽略。
 */

/**
 * 策略正文。
 *
 * 逐条说明：
 *   default-src 'self'        没有单列的指令都以它为准
 *   base-uri 'self'           不许用 <base> 把相对路径骗到别的站
 *   object-src 'none'         没有 <object>/<embed>
 *   frame-ancestors 'none'    不许被套进 iframe（只在响应头里有效）
 *   frame-src 'none'          不许加载别人的 iframe
 *   form-action 'self'        表单不许往别处提交
 *   img-src 'self' data:      图片全在本地；data: 用于内联 SVG
 *   font-src 'self'           没有外链字体
 *   connect-src 'self'        fetch 只取同源的索引 JSON
 *   worker-src 'none'         不用 Web Worker
 *   style-src 'self' 'unsafe-inline'
 *                             兜底：老浏览器（Safari 15.4 以前）不认识
 *                             style-src-elem / style-src-attr，只能靠它
 *   style-src-elem 'self'     现代浏览器：<style> 块必须来自本站
 *   style-src-attr 'unsafe-inline'
 *                             现代浏览器：style 属性放行——品名条那些
 *                             进度条宽度是算出来的，只能写成行内样式
 *   script-src 'self'         脚本全是同源外部文件，没有内联脚本
 *   upgrade-insecure-requests
 *                             页面里出现的 http:// 链接自动升成 https
 */
export const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "form-action 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'none'",
  "style-src 'self' 'unsafe-inline'",
  "style-src-elem 'self'",
  "style-src-attr 'unsafe-inline'",
  "script-src 'self'",
  "upgrade-insecure-requests",
].join('; ');

/**
 * meta 标签的完整内容。
 *
 * 浏览器会忽略 meta 里的 frame-ancestors（规范明说不支持），但留着它
 * 没有坏处：同一份字符串复制到 Cloudflare 响应头里时它是有效的，而
 * 两边保持一致比「哪边少一条」更不容易搞错。
 */
export const CSP_META_CONTENT = CSP;
