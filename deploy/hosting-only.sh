#!/usr/bin/env bash
# 只更新網站（Firebase Hosting），用服務帳號金鑰部署；適合雲端環境或 CI。
# 不會碰 Firestore、登入設定，也不會動同一個專案裡的其他網站。
#
# 用法：bash deploy/hosting-only.sh 專案ID 站台ID
# 需要環境變數 HUARONG_DEPLOY_KEY_B64：服務帳號 JSON 金鑰的 base64（單行）。
#   服務帳號只需要 Firebase Hosting 管理員、服務使用情形消費者兩個角色。
# 預設關掉帳號功能（專案沒有幫華容道設定 Firestore 和登入時用）；
#   已經設定好的話，加上 HUARONG_ACCOUNTS=1 就會保留 'auto'。
set -euo pipefail

PROJECT="${1:-}"
SITE="${2:-}"
if [ -z "$PROJECT" ] || [ -z "$SITE" ]; then
  echo "用法：bash deploy/hosting-only.sh 專案ID 站台ID"
  exit 1
fi
if [ -z "${HUARONG_DEPLOY_KEY_B64:-}" ]; then
  echo "找不到環境變數 HUARONG_DEPLOY_KEY_B64（服務帳號金鑰的 base64）"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
KEY="$(mktemp)"
trap 'rm -rf "$WORK" "$KEY"' EXIT

# 1. 金鑰放在專案資料夾以外，結束時刪掉
printf '%s' "$HUARONG_DEPLOY_KEY_B64" | base64 -d > "$KEY"
chmod 600 "$KEY"
export GOOGLE_APPLICATION_CREDENTIALS="$KEY"

# 2. 只上傳網頁本身
mkdir -p "$WORK/public"
cp -r "$ROOT/index.html" "$ROOT/css" "$ROOT/js" "$WORK/public/"
if [ -z "${HUARONG_ACCOUNTS:-}" ]; then
  echo "== 關掉帳號功能（帳號、同步、關卡廣場、排行榜不會出現）=="
  printf '%s\n' '/* 由 deploy/hosting-only.sh 產生：這個網站沒有開帳號功能 */' 'window.HRD_CLOUD_CONFIG = null;' > "$WORK/public/js/cloud-config.js"
fi

# 3. 一定指定站台，避免覆蓋同一個專案裡的其他網站
cat > "$WORK/firebase.json" <<JSON
{
  "hosting": {
    "site": "$SITE",
    "public": "public",
    "headers": [
      { "source": "**/*.@(js|css|html)", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
      { "source": "/", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] }
    ]
  }
}
JSON

VERSION="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || date +%Y-%m-%d)"
cd "$WORK"
npx --yes firebase-tools@15.34.0 deploy --only hosting --project "$PROJECT" --non-interactive -m "華容道 $VERSION"

echo
echo "完成！網址：https://$SITE.web.app"
