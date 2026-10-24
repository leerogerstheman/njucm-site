/*
 * 首帧之前的主题初始化。
 * ---------------------------------------------------------------------------
 * 两件事，都必须在首帧之前同步做完：
 *
 * 1) 主题：提前落定，避免浅色访客看到一闪的深色。
 * 2) 入场动效的分级开关（见 global.css 的 rise-in）：
 *    内容绝不能因为「动画没跑」而看不见，所以动画只在确认脚本可用时
 *    才启用；再由下面的兜底计时器保证它一定会被解除。
 *
 * 为什么是外部文件而不是内联：
 * 内联脚本需要 CSP 用哈希放行，而哈希会随脚本内容变化——内容一改，
 * Cloudflare 上抄好的响应头规则就过期了，症状是「本地正常、线上脚本
 * 被拦」。外部脚本只要同源就能过 `script-src 'self'`，规则从此不用再动。
 *
 * 加载方式见 BaseLayout：preload + async。async 不阻塞解析，CSS 因此
 * 能立刻开始下载；preload 让这个文件在 head 里就被抓取，等到它执行时
 * 通常已经在路上了，首帧因此不会被主题闪一下。
 */
(function () {
  // 1) 主题：提前落定，避免浅色访客看到一闪的深色。
  try {
    var saved = localStorage.getItem('njucm:theme');
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.dataset.theme = saved;
    }
  } catch (e) {
    /* storage blocked: fall through to the dark default */
  }

  // 2) 入场动效的分级开关（见 global.css 的 rise-in）：
  //    内容绝不能因为「动画没跑」而看不见，所以动画只在确认脚本可用时
  //    才启用；再由下面的兜底计时器保证它一定会被解除。
  var root = document.documentElement;
  root.classList.add('js');
  window.setTimeout(function () {
    root.classList.add('reveal-settled');
  }, 2500);
})();
