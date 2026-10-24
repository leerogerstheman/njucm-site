#!/usr/bin/env bash
#
# 把构建好的站点推到远程主机。
#
#   dist/  →  $DEPLOY_HOST:/srv/njucm/www/
#
# rsync 只传改动过的文件（按大小与修改时间判断），所以 900 MB 的站点
# 日常更新只传几百 KB。站点是纯静态的，推完即生效，不需要重启任何进程。
#
# 用法：
#   DEPLOY_HOST=user@host ./deploy/deploy.sh
#   DEPLOY_HOST=user@host ./deploy/deploy.sh --dry-run   只看会传什么，不真传
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"

: "${DEPLOY_HOST:?设置 DEPLOY_HOST，例如 user@203.0.113.10}"
: "${DEPLOY_PATH:=/srv/njucm/www}"
SSH_KEY="${DEPLOY_KEY:-${HOME}/.ssh/id_ed25519}"
DRY_RUN=""

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN="--dry-run" ;;
    *) echo "不认识的参数：$arg" >&2; exit 1 ;;
  esac
done

if [ ! -d "$ROOT/dist" ]; then
  echo "还没有构建产物，先跑 pnpm build" >&2
  exit 1
fi

SIZE="$(du -sh "$ROOT/dist" | cut -f1)"
echo "→ $DEPLOY_HOST:$DEPLOY_PATH （$SIZE）"

RSYNC_ARGS=(
  --archive --compress --human-readable
  --delete                 # 服务器上多出来的文件删掉
  --exclude '.git' --exclude '.DS_Store'
  --rsh "ssh -i $SSH_KEY -o StrictHostKeyChecking=accept-new"
)

if [ -n "$DRY_RUN" ]; then
  RSYNC_ARGS+=(--dry-run --itemize-changes)
else
  RSYNC_ARGS+=(--itemize-changes)
fi

rsync "${RSYNC_ARGS[@]}" "$ROOT/dist/" "$DEPLOY_HOST:$DEPLOY_PATH/"

if [ -n "$DRY_RUN" ]; then
  echo "（试运行，没有真的传）"
  exit 0
fi

echo "推送完毕，检查一下站点："
echo "  curl -sI https://njucm.org/ | head -1"
