# njucm.org 留言后端（Cloudflare Worker + D1）

站点是纯静态的（GitHub Pages），自己存不了留言，所以留言数据放在这里：
一个 **Cloudflare Worker** + **D1**（Cloudflare 的 SQLite）。免费额度足够个人站点使用
（D1 免费档：5 GB 存储、每天 500 万次读）。

访客**无需登录**即可留言。前端在 `src/components/Comments.astro`，只挂在 Notes 详情页底部。

---

## 一、部署步骤（约 5 分钟）

前提：一个 Cloudflare 账号，且 `njucm.org` 已托管在该账号下（当前就是如此）。

```powershell
cd worker
pnpm install

# 1) 登录（浏览器授权；CI 里改用 CLOUDFLARE_API_TOKEN 环境变量）
pnpm exec wrangler login

# 2) 建数据库，把输出的 database_id 填进 wrangler.toml
pnpm exec wrangler d1 create njucm-comments

# 3) 建表（远程）
pnpm exec wrangler d1 execute njucm-comments --remote --file=./schema.sql

# 4) 两个密钥
pnpm exec wrangler secret put IP_SALT       # 任意长随机串，用于给 IP 做哈希
pnpm exec wrangler secret put ADMIN_TOKEN   # 删除留言时用，务必保管好

# 5) 部署
pnpm exec wrangler deploy
```

部署成功后会得到一个 `https://njucm-comments.<子域>.workers.dev` 地址，可以直接用
（此时把 `src/data/site.ts` 里的 `COMMENTS.api` 改成这个完整地址）。

### 更推荐：挂到自己的域名下（同源，免 CORS）

把 `wrangler.toml` 末尾的路由注释打开：

```toml
[[routes]]
pattern = "njucm.org/api/*"
zone_name = "njucm.org"
```

再 `pnpm exec wrangler deploy` 一次。之后浏览器访问的就是 `https://njucm.org/api/comments`——
**同源请求**，没有跨域、没有第三方域名，也不受浏览器第三方 Cookie 策略影响。

### 最后一步：打开前端开关

编辑 `src/data/site.ts`：

```ts
export const COMMENTS = {
  enabled: true,          // ← 改成 true
  api: '/api/comments',   // 挂了路由就用这个；否则填 workers.dev 完整地址
} as const;
```

提交后 GitHub Actions 会重新构建部署，Notes 页底部就会出现留言区。

> `enabled: false` 时前端完全不渲染留言区，所以**在 Worker 可用之前，线上不会出现一个发不出留言的框**。

---

## 二、接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/comments?slug=<slug>` | 该页面的**已通过**留言，按时间升序 |
| `POST` | `/api/comments` | 新建留言，body：`{ slug, name?, body, trap?, elapsed? }` |
| `DELETE` | `/api/comments/<id>` | 删除，需请求头 `x-admin-token` |
| `GET` | `/api/health` | 存活检查，返回留言总数 |

`slug` 来自笔记文件名（如 `disclaimer`）。`trap` 是蜜罐字段，正常用户留空。

---

## 三、防滥用

匿名留言的代价就是必须防刷。当前按顺序执行：

1. **来源限制**：只有 `ALLOWED_ORIGINS` 里的站点能跨域调用（同源请求不受影响）
2. **字段校验**：正文 2–1000 字，昵称截断到 24 字，链接最多 2 个
3. **蜜罐**：`trap` 被填 → 返回成功但**不入库**（不告诉机器人它被识破了）
4. **提交过快**：`elapsed < 1.5s` → 拒绝
5. **限流**：同一 IP 哈希 **10 分钟 3 条 / 24 小时 20 条**
6. **IP 不落库**：只存加盐哈希（`IP_SALT`），仅用于限流

---

## 四、审核与删除

**默认直接显示**（`MODERATION = "0"`）。想改成先审后发：

```powershell
pnpm exec wrangler secret put MODERATION   # 输入 1
pnpm exec wrangler deploy
```

之后新留言状态为 `pending`，公开接口查不到，需要用管理员令牌放行或删除：

```powershell
# 查看待审
pnpm exec wrangler d1 execute njucm-comments --remote --command "SELECT id, slug, substr(body,1,40) FROM comments WHERE status='pending'"

# 放行 / 删除
pnpm exec wrangler d1 execute njucm-comments --remote --command "UPDATE comments SET status='approved' WHERE id=12"
pnpm exec wrangler d1 execute njucm-comments --remote --command "DELETE FROM comments WHERE id=12"

# 或者走接口删除（需要 ADMIN_TOKEN）
curl -X DELETE -H "x-admin-token: <ADMIN_TOKEN>" https://njucm.org/api/comments/12
```

---

## 五、本地开发

```powershell
cd worker
pnpm install
pnpm exec wrangler d1 execute njucm-comments --local --file=./schema.sql
pnpm exec wrangler dev --port 8787
```

`.dev.vars`（**不要提交**，已在 `.gitignore` 与提交脚本中排除）提供本地密钥：

```
IP_SALT = "local-dev-salt-not-a-secret"
ADMIN_TOKEN = "local-dev-admin-token"
ALLOWED_ORIGINS = "https://njucm.org,https://www.njucm.org,http://127.0.0.1:4321"
```

改动 `.dev.vars` 后**必须重启** `wrangler dev` 才会生效（热重载不会重读它）。

配合本地站点联调：

```powershell
cd ..
$env:PUBLIC_COMMENTS_API = "http://127.0.0.1:8787/api/comments"
pnpm build && pnpm preview
```

---

## 六、安全设计

- 留言**只存纯文本**，接口从不返回 HTML；前端一律用 `textContent` 插入，
  因此**留言内容无法变成页面标记**（存储型 XSS 在设计上不可能发生）。
  已用 `<img src=x onerror=...>` 实测验证：不执行脚本、不产生 `<img>` 元素，原样显示为文字。
- 所有 SQL 都走 D1 的**参数绑定**，slug 另有正则白名单。
- 删除接口需要 `ADMIN_TOKEN`，且令牌只存在于 Worker 密钥中。
