# 安全响应头

GitHub Pages 不支持自定义响应头，所以这些头得由 **Cloudflare** 加（域名已经在
Cloudflare 后面）。这个文件是**可直接照抄的规则清单**。

- 生效位置：Cloudflare 后台 → **Rules** → **Transform Rules** → **Modify Response Header**
- 作用范围：`njucm.org`（以及 `www.njucm.org`）
- 改完大约一分钟内全站生效，不需要重新构建站点。

---

## 一、Transform Rules → Modify Response Header

新建一条规则，名字叫 `security-headers`，动作选 **Set static response header**，
下面几行各填一条（Static header / Value 一列一对）：

| Static header | Value |
| --- | --- |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=(), interest-cohort=()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |

`X-Frame-Options` 这里用 `SAMEORIGIN` 而不是 `DENY`：站点没有内嵌第三方页面，
但 `DENY` 会让「被别人用 iframe 套进去」这件事彻底断掉——如果以后想给
Cloudflare 的某些功能留口子，`SAMEORIGIN` 更稳。

再单独加一条头（Static header 填 `Content-Security-Policy`，Value 填下面这一整行）：

```
default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src 'none'; form-action 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'none'; style-src 'self' 'unsafe-inline'; style-src-elem 'self'; style-src-attr 'unsafe-inline'; script-src 'self'; upgrade-insecure-requests
```

**这一行抄进去就不用再动了。** 原因见下一节。

### 还要顺手确认的两处设置

1. **SSL/TLS → Edge Certificates → Always Use HTTPS**：开。
   浏览器 HSTS 之前，这一条负责把 http 顶回 https（现在站点已经是 301 了）。
2. **SSL/TLS → Edge Certificates → Minimum TLS Version**：设成 **TLS 1.2**。

---

## 二、CSP 为什么是「同一份抄两遍」

策略的正文只有一份，写在仓库的 `src/utils/csp.ts` 里。它同时出现在两个地方：

| 位置 | 形式 | 作用 |
| --- | --- | --- |
| 每个页面的 `<head>` | `<meta http-equiv="Content-Security-Policy">` | 静态托管拿不到响应头，meta 是唯一能随页面走的策略；而且它在页面开头就生效，覆盖正文里的每一个字节 |
| Cloudflare 响应头 | `Content-Security-Policy` | 补上 meta 表达不了的东西（`frame-ancestors` 在 meta 里会被浏览器忽略），并且在 meta 之前就已生效 |

浏览器会把两条策略**取交集**，所以两边一致时效果就是那一份策略。

### 为什么策略里没有哈希

早先的做法是：页面里有内联脚本，于是给每段脚本算 SHA-256 哈希写进策略。
这种做法的致命处在于**哈希会随内容变化**：改一行脚本注释，策略里的哈希就过期了，
于是「本地正常、线上脚本被拦」。而 Cloudflare 上那行静态规则也得跟着改，
忘了改就是线上事故。

现在页面上**没有任何可执行的内联脚本**——主题初始化、搜索、项目排序、
清单、对比、旧地址跳转，全部是同源的外部文件（`public/scripts/*.js`）。
于是 `script-src 'self'` 就够了：同源文件永远放行，内容怎么改都不用动规则。

内联样式也一样：站点的 CSS 全部是外部文件（`build.inlineStylesheets: 'never'`），
`<style>` 块在产物里一个都没有。

### 逐条说明

| 指令 | 作用 |
| --- | --- |
| `default-src 'self'` | 没有单列的指令都以它为准 |
| `base-uri 'self'` | 不许用 `<base>` 把相对路径骗到别的站 |
| `object-src 'none'` | 没有 `<object>` / `<embed>` |
| `frame-ancestors 'none'` | 不许被套进 iframe（**只在响应头里有效**） |
| `frame-src 'none'` | 不许加载别人的 iframe |
| `form-action 'self'` | 表单不许往别处提交 |
| `img-src 'self' data:` | 图片全在本地；`data:` 用于内联 SVG |
| `font-src 'self'` | 没有外链字体 |
| `connect-src 'self'` | `fetch` 只取同源的索引 JSON |
| `worker-src 'none'` | 不用 Web Worker |
| `style-src 'self' 'unsafe-inline'` | 兜底：老浏览器（Safari 15.4 以前）不认识下面两条 |
| `style-src-elem 'self'` | 现代浏览器：`<style>` 块必须来自本站（现在一个都没有） |
| `style-src-attr 'unsafe-inline'` | 现代浏览器：行内 `style="…"` 放行——品名条那些进度条宽度是算出来的，只能写成行内样式 |
| `script-src 'self'` | 脚本全是同源外部文件，没有内联脚本 |
| `upgrade-insecure-requests` | 页面里出现的 http:// 子资源自动升成 https |

### 如果以后要加内联脚本

别加。要么写成外部文件放 `public/scripts/`，要么在 `src/utils/csp.ts` 里
改策略——但只要用了哈希，Cloudflare 那行就得跟着改。仓库里有一个
`scripts/test-csp.mjs` 会在构建后扫一遍产物，发现内联脚本就让 CI 失败，
就是为了拦住这种「改忘了」。

---

## 三、迁移到别的托管方式时

- **Cloudflare Pages / Netlify**：把 `deploy/_headers` 复制进 `public/` 即可生效
  （内容与上面这两张表一致）。
- **自建服务器**：`deploy/Caddyfile` 里已经带上了同样这几条头，
  用 `deploy/deploy.sh` 起 Caddy 就不需要再配 Cloudflare 规则。
