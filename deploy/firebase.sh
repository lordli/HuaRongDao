#!/usr/bin/env bash
# 把華容道部署到 Firebase Hosting，並開啟帳號登入與雲端同步（建議在 Google Cloud Shell 執行）。
# 用法：bash deploy/firebase.sh 你的GCP專案ID
#   不想開帳號功能：NO_ACCOUNTS=1 bash deploy/firebase.sh 你的GCP專案ID
set -euo pipefail

PROJECT="${1:-}"
if [ -z "$PROJECT" ]; then
  echo "用法：bash deploy/firebase.sh 你的GCP專案ID"
  echo "（不知道專案 ID 可以執行：gcloud projects list）"
  exit 1
fi

cd "$(dirname "$0")/.."
FB="npx --yes firebase-tools@15.34.0"
REGION="${FIRESTORE_REGION:-asia-east1}"

# 1. 登入 Firebase CLI（只有第一次需要）
if ! $FB login:list 2>/dev/null | grep -q "@"; then
  echo "== 請依照畫面上的網址登入 Google 帳號，再把授權碼貼回來 =="
  $FB login --no-localhost
fi

# 2. 在這個 GCP 專案啟用 Firebase（已經啟用過就略過）
if ! $FB projects:list 2>/dev/null | grep -q "[[:space:]]$PROJECT[[:space:]]"; then
  echo "== 在專案 $PROJECT 啟用 Firebase =="
  $FB projects:addfirebase "$PROJECT" || echo "（如果訊息是已經啟用過 Firebase，可以忽略）"
fi

if [ -n "${NO_ACCOUNTS:-}" ]; then
  echo "== 不開帳號功能，只上傳網站 =="
  sed -i "s/^if (!('HRD_CLOUD_CONFIG' in window)) window.HRD_CLOUD_CONFIG = 'auto';/window.HRD_CLOUD_CONFIG = null;/" js/cloud-config.js
  $FB deploy --only hosting --project "$PROJECT" -m "華容道 $(date +%Y-%m-%d)"
  echo
  echo "完成！網址：https://$PROJECT.web.app"
  exit 0
fi

# 3. 網頁應用程式：網站靠它取得登入設定（/__/firebase/init.json）
if ! $FB apps:list WEB --project "$PROJECT" 2>/dev/null | grep -q "WEB"; then
  echo "== 建立 Firebase 網頁應用程式 =="
  $FB apps:create WEB "華容道" --project "$PROJECT"
fi

# 4. Firestore 資料庫（存玩家的關卡和紀錄），預設放在台灣 asia-east1
if ! $FB firestore:databases:get "(default)" --project "$PROJECT" >/dev/null 2>&1; then
  echo "== 建立 Firestore 資料庫（$REGION）=="
  $FB firestore:databases:create "(default)" --location "$REGION" --project "$PROJECT"
fi

# 5. 開啟登入方式：Google 帳號、電子郵件／密碼（只需要做一次）
MARK=".auth-enabled-$PROJECT"
if [ ! -f "$MARK" ]; then
  EMAIL="$($FB login:list 2>/dev/null | grep -o '[[:alnum:]._%+-]*@[[:alnum:].-]*' | head -n 1 || true)"
  if [ -z "$EMAIL" ]; then EMAIL="$(gcloud config get-value account 2>/dev/null || true)"; fi
  cat > .firebase-auth.json <<JSON
{
  "auth": {
    "providers": {
      "emailPassword": true,
      "googleSignIn": {
        "oAuthBrandDisplayName": "華容道",
        "supportEmail": "$EMAIL",
        "authorizedRedirectUris": [
          "https://$PROJECT.firebaseapp.com/__/auth/handler",
          "https://$PROJECT.web.app/__/auth/handler"
        ]
      }
    }
  }
}
JSON
  echo "== 開啟登入方式：Google 帳號、電子郵件／密碼 =="
  if $FB deploy --only auth --config .firebase-auth.json --project "$PROJECT"; then
    touch "$MARK"
  else
    echo
    echo "！自動開啟登入方式失敗，請手動開一次（只要做一次）："
    echo "  1. 打開 https://console.firebase.google.com/project/$PROJECT/authentication/providers"
    echo "  2. 按「開始使用」，再到「登入方式」啟用「Google」和「電子郵件/密碼」"
    echo
  fi
  rm -f .firebase-auth.json
fi

# 6. 上傳網站、資料庫規則和索引（排行榜依步數、用時排序要用）
$FB deploy --only hosting,firestore:rules,firestore:indexes --project "$PROJECT" -m "華容道 $(date +%Y-%m-%d)"

echo
echo "完成！網址：https://$PROJECT.web.app"
