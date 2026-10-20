# 部署到 Google Cloud

網站本身是純靜態檔案（HTML、CSS、JS），不需要自己的伺服器。
帳號登入、雲端同步和關卡廣場用 Firebase Authentication 和 Firestore，只有方式一（Firebase Hosting）會自動設定好。
兩種方式都只要在 Google Cloud Shell 執行一行指令，建議用方式一。

| | 方式一：Firebase Hosting（建議） | 方式二：Cloud Storage 公開儲存桶 |
| --- | --- | --- |
| 網址 | `https://專案ID.web.app` | `https://storage.googleapis.com/儲存桶/index.html` |
| HTTPS | 自動 | 自動（googleapis.com 網址） |
| 自訂網域 | 免費，自動申請 SSL 憑證 | 要加負載平衡器才有 HTTPS，約每月 18 美元起 |
| CDN、壓縮 | 有 | 沒有 CDN（上傳時已先壓縮） |
| 免費額度 | 儲存 10 GB、每天傳輸 360 MB | 沒有免費額度，但用量極小 |
| 費用估計 | 一般使用是 0 元 | 每 1,000 次造訪約 0.01 美元以內 |
| 帳號、雲端同步、關卡廣場 | 自動開啟 | 預設不開（見下方說明） |
| 第一次要登入 | Firebase CLI 要登入一次 | 不用（Cloud Shell 已登入） |

網站首次載入約 50 KB（壓縮後）；字型由 Google Fonts 提供，不算你的流量。
價格依 2026 年 10 月的官方公開價格估算，實際以 Google Cloud 帳單為準。

## 準備：把專案傳到 Cloud Shell

1. 打開 https://shell.cloud.google.com
2. 右上角「⋮」→「上傳」，選 `huarongdao.zip`
3. 解壓縮並進入資料夾：
   ```
   unzip huarongdao.zip && cd huarongdao
   ```

## 方式一：Firebase Hosting

```
bash deploy/firebase.sh 你的專案ID
```

- 第一次會要你登入：打開畫面上的網址、同意授權，再把授權碼貼回 Cloud Shell。
- 腳本會依序做這些事（做過的會略過）：
  1. 在這個 GCP 專案啟用 Firebase
  2. 建立 Firebase 網頁應用程式（網站靠它自動取得登入設定）
  3. 建立 Firestore 資料庫，放在 `asia-east1`（台灣）；要換地區可以先設 `FIRESTORE_REGION=asia-northeast1`
  4. 開啟登入方式：Google 帳號、電子郵件／密碼（只做一次；失敗時會印出手動開啟的步驟）
  5. 上傳網站、Firestore 安全規則和索引（`firestore.rules`：個人資料只有自己能讀寫；關卡廣場的讚數、過關人數，排行榜的成績都不能亂改）
- 不想要帳號功能：`NO_ACCOUNTS=1 bash deploy/firebase.sh 你的專案ID`，只上傳網站。
- 專案已經綁定帳單的話，Firebase 會用 Blaze 方案（用多少付多少），在免費額度內一樣是 0 元。
- 自訂網域：Firebase 主控台 →「Hosting」→「新增自訂網域」，照指示在網域商加 DNS 記錄。
  要在自訂網域登入，還要到「Authentication」→「設定」→「授權網域」加上這個網域。

### 帳號功能的費用

| 項目 | 免費額度 | 超過之後（約） |
| --- | --- | --- |
| 登入（Google、電子郵件） | 每月 5 萬名活躍使用者 | 一般小網站用不到 |
| Firestore 寫入 | 每天 2 萬次 | 每 10 萬次約 0.2 美元 |
| Firestore 讀取 | 每天 5 萬次 | 每 10 萬次約 0.06 美元 |
| Firestore 儲存 | 1 GB | 每 GB 每月約 0.2 美元 |

- 每位玩家的資料只有一份文件，通常不到 20 KB。
- 同步會合併變更再上傳：過關、存關卡、改設定大約 1.5 秒內上傳一次；下棋時最多每 20 秒上傳一次。
  一位玩家連續玩一小時大約 200 次寫入，所以每天約 100 位重度玩家都還在免費額度內。
- 沒有綁帳單（Spark 免費方案）時，用量到上限當天就暫停同步，玩家照樣能玩，資料先存在瀏覽器，隔天會自動補傳。
- 關卡廣場：打開列表讀 24 筆、看一關大約讀 7 筆、按讚或過關寫 2 筆。每天幾百位玩家逛廣場都還在免費額度內。
- 排行榜：看總排行讀 50 筆、看一關排行讀約 40 筆（含玩家名字），過關寫 2 筆。

### 管理關卡廣場

- 被檢舉的關卡：Firebase 主控台 →「Firestore Database」→ `reports` 集合，每筆有關卡 id 和原因。
- 下架關卡：在 `levels` 集合找到那一關直接刪除（它底下的 `likes`、`records` 也可以一起刪）。
- 被檢舉 3 次以上的關卡會自動從列表隱藏；確認沒問題的話，把那一關的 `reports` 欄位改回 0 就會重新出現。

## 方式二：Cloud Storage

```
bash deploy/gcs.sh huarongdao-你的專案ID
```

- 儲存桶名稱全球唯一，被用走了就換一個。預設放在 `asia-east1`（台灣）。
- 如果組織政策禁止公開存取（Public access prevention），這個方式會失敗，請改用方式一。

## 方式三：只更新網站（服務帳號金鑰）

適合在雲端環境、CI，或和其他網站共用的 Firebase 專案。只上傳網頁，不會動 Firestore、登入設定，也不會碰同一個專案裡的其他站台。

```
export HUARONG_DEPLOY_KEY_B64=…   # 服務帳號 JSON 金鑰的 base64（單行）；放在環境變數，不要放進 repo
bash deploy/hosting-only.sh 專案ID 站台ID
```

- 服務帳號只需要「Firebase Hosting 管理員」和「服務使用情形消費者」兩個角色。
- 預設會關掉帳號功能（帳號、同步、關卡廣場、排行榜不會出現），因為這種部署沒有權限設定 Firestore 和登入。
  專案已經用方式一設定好的話，加上 `HUARONG_ACCOUNTS=1` 就會保留。
- 一定要給站台 ID：同一個專案有好幾個網站時，才不會蓋到別的網站。

## 更新網站

改完檔案後，在 Cloud Shell 重新執行同一行指令即可。
瀏覽器每次開網頁都會向伺服器確認檔案有沒有更新（沒變就不重新下載），所以玩家重新整理就會拿到新版。

## 控制費用

- 在 Google Cloud 主控台「帳單」→「預算與快訊」設一個每月 1 美元的預算提醒，超過會寄信通知。
- 停用：
  - Firebase：`npx firebase-tools hosting:disable --project 你的專案ID`
  - Cloud Storage：`gcloud storage rm -r gs://儲存桶名稱`

## 資料存在哪裡

- 沒登入：玩家的自訂關卡和進度存在各自的瀏覽器（localStorage），換裝置不會同步，可以用「設定 → 備份全部資料」搬家。
- 登入後：另外存在 Firestore 的 `users/{玩家 ID}`，在其他裝置登入同一個帳號就會同步。
- 玩家可以在「設定 → 帳號與同步」刪除帳號，雲端上的資料會一起刪掉。
- 發佈到關卡廣場的關卡、按讚和過關紀錄存在 `levels`；所有人都看得到關卡、作者的公開名稱和前幾名的紀錄（不會顯示電子郵件）。
- 想看有哪些玩家：Firebase 主控台 →「Authentication」→「使用者」；資料在「Firestore Database」。

## 放在 Cloud Storage 時要開帳號功能

方式二預設不開帳號功能。要開的話：

1. 先跑一次方式一的腳本（會建好 Firestore、登入方式和規則），或在 Firebase 主控台手動設定。
2. 到 Firebase 主控台「專案設定 → 一般 → 你的應用程式」，複製 `firebaseConfig`，貼到 `js/cloud-config.js`：
   ```js
   window.HRD_CLOUD_CONFIG = { apiKey: '…', authDomain: '專案ID.firebaseapp.com', projectId: '專案ID', appId: '…' };
   ```
3. 到「Authentication → 設定 → 授權網域」加上 `storage.googleapis.com`。
4. 重新執行 `bash deploy/gcs.sh 儲存桶名稱`。
