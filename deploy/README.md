# 把站点托管到自己的服务器

GitHub Pages 给静态站点定死了 1 GB 的上限，而这个库的条目页是**一条记录一个 HTML**：
13000 条记录就是 13000 个页面，光它们就 600 MB。数据本身只有 20 MB——
撑爆上限的不是数据，是预渲染出来的页面。

换到自己的服务器，容量问题就不存在了：40 GB 磁盘能放 200 GB 以上的站点，
构建产物想多大就多大。

这份配置是**纯静态托管**：构建流程一个字不改，服务器上只放 `dist/`，
由 Caddy 发出去（自动 TLS、压缩、按路径给缓存头）。

---

## 一、买什么样的机器

| 项 | 建议 | 说明 |
| --- | --- | --- |
| 位置 | **香港 / 新加坡 / 日本** | 现在站点在 GitHub Pages（境外），换到境外就不用 ICP 备案；换到大陆机房要备案，流程以周计 |
| 配置 | 1 vCPU / 1–2 GB 内存 / 40 GB 磁盘 | 只发静态文件，1 GB 内存够用；磁盘按站点大小留余量 |
| 流量 | 1 TB/月 起步 | 站点现在 923 MB，含图片 82 MB |
| 费用 | 约 ¥30–80/月 | 境外小厂牌常见价位；Hetzner / Vultr / DigitalOcean 更便宜 |

不需要大内存，也不需要 GPU——**这是静态站点，不在服务器上算东西**。

## 二、第一次部署

在服务器上（Ubuntu 24.04 为例）：

```bash
# 1. 装 Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker

# 2. 把仓库里的 deploy/ 目录传上去（scp 或 git clone 都行）
mkdir -p ~/njucm && cd ~/njucm
#   把 deploy/ 与 dist/ 放进来

# 3. 起服务
cd ~/njucm/deploy
docker compose up -d

# 4. 看日志确认证书签下来了
docker compose logs -f site
```

## 三、域名指向

1. 在 DNS 里把 `njucm.org` 与 `www.njucm.org` 的 A 记录指到服务器 IP（**先把 DNS 改掉再起 Caddy**，否则证书签发会失败）。
2. 安全组放行 80 与 443 端口。

证书由 Caddy 自动签发并续期，不用管。

## 四、之后每次更新

本地：

```bash
pnpm build                       # 构建
DEPLOY_HOST=user@服务器IP ./deploy/deploy.sh
```

或者让 CI 来推（`.github/workflows/deploy-server.yml` 已写好），在仓库
Settings → Secrets 里加三个：

| Secret | 内容 |
| --- | --- |
| `SERVER_SSH_KEY` | 用来推服务器的私钥（`cat ~/.ssh/id_ed25519`） |
| `SERVER_KNOWN_HOSTS` | 服务器的 host key（`ssh-keyscan 服务器IP`） |
| `SERVER_HOST` | `user@服务器IP` |
| `SERVER_PATH` | `/srv/njucm/www`（默认值写在脚本里，可不改） |

rsync 是增量的：923 MB 的站点日常更新只传改动过的文件。
推完即生效——纯静态文件不需要重启任何进程。

## 五、验证与回退

```bash
curl -sI https://njucm.org/ | head -1          # 期望 200
curl -s https://njucm.org/data/models/index.json | head -c 120
```

回退很简单：服务器上的 `www/` 目录每次推送前 rsync 会先备份一份，
或者直接把 GitHub Pages 切回来（那条 CI 一直在跑，仓库是同一份）。

---

## 六、第二阶段：把数据搬进 SQLite，条目页改成按请求渲染

上面这套解决的是**容量**，不解决「每条记录一个页面」这件事本身。
真要让库继续按现在的速度长大（每轮 +1500～3000 条），可以把条目页
改成服务端渲染：

- Astro 开 `output: 'server'`，只让 `/data/models/[id]`、`/series/`、
  `/subject/` 与列表页按请求渲染，其余页面继续预渲染（`prerender` 按路由控制）；
- 数据从 `models.kits.ts` 灌进 SQLite（13000 行约 4–6 MB，比现在的 JSON 还小）；
- 服务器上跑 Node（Astro 的 Node adapter），前面仍然用 Caddy 反代。

这样每条记录在磁盘上的成本从 **47 KB 降到 0.4 KB**，站点总量从 923 MB
降到 230 MB 左右，能再涨十倍数据。

代价：
- 部署不再是「push 即上线」，要变成「CI 部署服务 + 迁移数据库」；
- 数据库要备份；
- 缓存策略要重新定（Caddy 可以缓存渲染出来的 HTML，但数据更新时要能刷新）。

**这一步要等服务器就位再做**——GitHub Pages 不能跑服务端代码，
先切 SSR 会让现网站点直接挂掉。顺序必须是：先有服务器 → 静态站上服务器
→ 确认无误 → 再改 SSR。

## 七、顺带可以做的小事

- 把「相关条目」从 6 张减到 4 张：13000 个页面各省 2 KB，约 26 MB；
- 机体线稿定义（ArtDefs，8.4 KB/页）只在真的渲染线稿的页面内联，约省 160 MB；
- 页脚里「复制邮箱」那段内联脚本挪到公共 JS，约省 40 MB。

这三条都是纯瘦身，与托管方式无关，做了哪边都受益。
