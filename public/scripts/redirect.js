/*
 * 旧地址的跳转兜底。
 * ---------------------------------------------------------------------------
 * 页面本身已经带 meta refresh（0 秒），正常情况下浏览器立刻就跳走了，
 * 这个脚本根本轮不到执行。它只负责少数不认 meta refresh 的浏览器：
 * 从 canonical 链接上读出目标地址，跳过去。
 *
 * 之所以不内联，是因为内联脚本需要 CSP 按哈希放行，脚本一改规则就过期。
 */
(function () {
  var link = document.querySelector('link[rel="canonical"]');
  if (link && link.href) {
    location.replace(link.href);
  }
})();
