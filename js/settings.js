/* 設定：預設值、讀寫，以及套用到整個網站（主題、動畫速度）。值存在 store 的 settings 裡。 */
(function (root) {
  'use strict';
  const HRD = root.HRD;

  const reduceMotion = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const DEFAULTS = {
    theme: 'system',      // system | light | dark
    pieceStyle: 'names',  // names 人物名稱 | initial 單字 | blocks 純色方塊
    sound: true,
    volume: 0.8,          // 0–1
    haptics: true,
    anim: 'normal',       // normal | fast | off（系統要求減少動態時預設 off）
    autoSpeed: 'normal',  // slow | normal | fast
    tapMove: true,        // 只能往一個方向走的棋子，點一下就移動
    lang: 'auto',         // auto 跟隨瀏覽器 | zh-Hant | zh-Hans | en
  };
  const MOVE_MS = { normal: 140, fast: 70, off: 0 };
  const AUTO_MS = { slow: 320, normal: 170, fast: 80 };

  function get(name) {
    const v = HRD.store.setting(name);
    if (v !== undefined && v !== null) return v;
    if (name === 'anim' && reduceMotion()) return 'off';
    return DEFAULTS[name];
  }

  /* 在 claude.ai 預覽裡，深淺色由 Claude 決定，網頁不去改 */
  const themeLocked = () => !!root.claude;

  function apply() {
    const el = document.documentElement;
    if (!themeLocked()) {
      const t = get('theme');
      if (t === 'light' || t === 'dark') el.setAttribute('data-theme', t);
      else el.removeAttribute('data-theme');
    }
    el.style.setProperty('--move-ms', (MOVE_MS[get('anim')] ?? 140) + 'ms');
  }

  function set(name, value) {
    HRD.store.setSetting(name, value);
    apply();
  }

  /* 棋子上要顯示的字（遊戲畫面用；編輯器一律顯示完整名稱） */
  function pieceText(raw) {
    const s = get('pieceStyle');
    if (s === 'blocks') return '';
    // 預設的人物名稱（曹操、關羽、兵…）跟著語言翻譯；玩家自己取的名字不變
    const label = raw ? HRD.i18n.t(raw) : '';
    if (s === 'initial') return Array.from(label)[0] || '';
    return label;
  }

  HRD.settings = {
    DEFAULTS, MOVE_MS, AUTO_MS,
    get, set, apply, pieceText, themeLocked, reduceMotion,
    autoDelay: () => AUTO_MS[get('autoSpeed')] || AUTO_MS.normal,
  };
})(window);
