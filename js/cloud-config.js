/*
 * 帳號與雲端同步的設定。
 * 'auto'（預設）：部署在 Firebase Hosting 時，自動讀取專案設定，不用改任何東西。
 * null：不開帳號功能，資料只存在瀏覽器。
 * 放在其他主機時，可以改成 Firebase 主控台「專案設定 → 你的應用程式」裡的 firebaseConfig 物件。
 */
if (!('HRD_CLOUD_CONFIG' in window)) window.HRD_CLOUD_CONFIG = 'auto';
