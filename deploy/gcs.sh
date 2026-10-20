#!/usr/bin/env bash
# 把華容道放到 Cloud Storage 的公開儲存桶（在 Google Cloud Shell 執行，不需另外登入）。
# 用法：bash deploy/gcs.sh 儲存桶名稱 [地區，預設 asia-east1 台灣]
set -euo pipefail

BUCKET="${1:-}"
REGION="${2:-asia-east1}"
if [ -z "$BUCKET" ]; then
  echo "用法：bash deploy/gcs.sh 儲存桶名稱 [地區]"
  echo "（儲存桶名稱全球唯一，例如 huarongdao-你的專案ID）"
  exit 1
fi

cd "$(dirname "$0")/.."

# 1. 第一次：建立儲存桶並設為公開可讀
if ! gcloud storage buckets describe "gs://$BUCKET" >/dev/null 2>&1; then
  echo "== 建立儲存桶 gs://$BUCKET（$REGION）=="
  gcloud storage buckets create "gs://$BUCKET" --location="$REGION" --uniform-bucket-level-access
  gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member=allUsers --role=roles/storage.objectViewer
  gcloud storage buckets update "gs://$BUCKET" --web-main-page-suffix=index.html
fi

# 2. 上傳網站（-Z 先壓縮再存，下載量約為原本的三分之一）
gcloud storage cp -r -Z --cache-control="no-cache" index.html css js "gs://$BUCKET/"

echo
echo "完成！網址：https://storage.googleapis.com/$BUCKET/index.html"
