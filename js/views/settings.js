/* 設定頁 */
(function (root) {
  'use strict';
  const HRD = root.HRD;
  const E = HRD.engine;
  const S = HRD.settings;
  const { h, icon, toast, confirmDialog } = HRD.ui;

  let uid = 0;

  /* 一列設定：左邊名稱與說明，右邊控制項 */
  function row(name, desc, control, id) {
    return h('div', { class: 'setting-row' },
      h('div', { class: 'setting-text' },
        h('span', { class: 'setting-name', id: id || null }, name),
        desc ? h('p', { class: 'setting-desc' }, desc) : null),
      control);
  }

  /* 分段選擇（單選） */
  function segmented(key, options, onChange) {
    const id = 'seg-' + key + '-' + (++uid);
    const current = S.get(key);
    const group = h('div', { class: 'seg-options', role: 'radiogroup', 'aria-labelledby': id + '-label' });
    options.forEach((o) => {
      const input = h('input', { type: 'radio', name: id, value: o.value, id: id + '-' + o.value, checked: current === o.value });
      input.addEventListener('change', () => { if (input.checked) { S.set(key, o.value); if (onChange) onChange(o.value); } });
      group.appendChild(h('label', { class: 'seg', for: id + '-' + o.value }, input, h('span', {}, o.label)));
    });
    group.labelId = id + '-label';
    return group;
  }

  /* 開關 */
  function toggle(key, label, onChange) {
    const id = 'sw-' + key + '-' + (++uid);
    const input = h('input', { type: 'checkbox', role: 'switch', class: 'switch', id: id, checked: !!S.get(key), 'aria-label': label });
    input.addEventListener('change', () => { S.set(key, input.checked); if (onChange) onChange(input.checked); });
    return input;
  }

  function settingsView(container, ctx) {
    const preview = new HRD.BoardView({ kind: 'preview' });
    const previewState = E.levelToState(HRD.levels.LEVELS.find((l) => l.id === 'hengdao'));
    const drawPreview = () => preview.render(previewState);

    /* 外觀 */
    const themeSeg = segmented('theme', [
      { value: 'system', label: '跟隨系統' }, { value: 'light', label: '淺色' }, { value: 'dark', label: '深色' },
    ]);
    const styleSeg = segmented('pieceStyle', [
      { value: 'names', label: '人物名稱' }, { value: 'initial', label: '單字' }, { value: 'blocks', label: '純色方塊' },
    ], drawPreview);
    const looks = h('section', { class: 'card settings-card', 'aria-labelledby': 'set-looks' },
      h('h2', { class: 'card-title', id: 'set-looks' }, '外觀'),
      h('div', { class: 'settings-split' },
        h('div', { class: 'settings-rows' },
          S.themeLocked()
            ? row('主題', '預覽版的深淺色跟著 Claude 的主題設定；部署成網站後可以在這裡切換。', h('span', { class: 'muted' }, '跟隨 Claude'))
            : row('主題', '深色在晚上比較不刺眼。', themeSeg, themeSeg.labelId),
          row('棋子樣式', '只影響遊戲畫面；編輯器一律顯示完整名稱。', styleSeg, styleSeg.labelId)),
        h('div', { class: 'settings-preview' }, preview.el, h('p', { class: 'hint-text' }, '預覽'))));

    /* 音效與震動 */
    const volume = h('input', { type: 'range', id: 'set-volume', class: 'range', min: '0', max: '100', step: '5', value: String(Math.round(S.get('volume') * 100)) });
    const volumeValue = h('output', { for: 'set-volume', class: 'range-value' }, Math.round(S.get('volume') * 100) + '%');
    volume.addEventListener('input', () => { volumeValue.textContent = volume.value + '%'; });
    volume.addEventListener('change', () => { S.set('volume', Number(volume.value) / 100); HRD.fx.unlock(); HRD.fx.move('king'); });
    const soundSwitch = toggle('sound', '音效', (on) => { volume.disabled = !on; if (on) { HRD.fx.unlock(); HRD.fx.select(); } });
    volume.disabled = !S.get('sound');
    const sounds = h('section', { class: 'card settings-card', 'aria-labelledby': 'set-sound' },
      h('h2', { class: 'card-title', id: 'set-sound' }, '音效與震動'),
      row('音效', '移動、碰壁、提示和過關時的聲音。', soundSwitch),
      row('音量', null, h('div', { class: 'range-box' },
        h('label', { class: 'sr-only', for: 'set-volume' }, '音量'), volume, volumeValue,
        h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => { HRD.fx.unlock(); HRD.fx.win(); } }, icon('play', 16), '試聽'))),
      HRD.fx.canVibrate()
        ? row('震動', '手機上移動、碰壁和過關時輕輕震動（iPhone 的瀏覽器不支援）。', toggle('haptics', '震動', (on) => { if (on) HRD.fx.move('king'); }))
        : row('震動', '這個裝置不支援震動。', h('span', { class: 'muted' }, '不適用')));

    /* 動畫與操作 */
    const animSeg = segmented('anim', [
      { value: 'normal', label: '標準' }, { value: 'fast', label: '快' }, { value: 'off', label: '關閉' },
    ]);
    const autoSeg = segmented('autoSpeed', [
      { value: 'slow', label: '慢' }, { value: 'normal', label: '標準' }, { value: 'fast', label: '快' },
    ]);
    const motion = h('section', { class: 'card settings-card', 'aria-labelledby': 'set-motion' },
      h('h2', { class: 'card-title', id: 'set-motion' }, '動畫與操作'),
      row('棋子移動動畫', S.reduceMotion() ? '你的系統設定了「減少動態效果」，預設已關閉動畫。' : '關閉後棋子會直接跳到新位置。', animSeg, animSeg.labelId),
      row('自動解題速度', '「自動解題」演示每一格之間的間隔。', autoSeg, autoSeg.labelId),
      row('點一下自動移動', '只能往一個方向走的棋子，點一下就直接移動。關閉後點棋子只會選取，再用箭頭、拖曳或滑動移動。', toggle('tapMove', '點一下自動移動')));

    /* 資料 */
    const where = h('p', { class: 'setting-desc' });
    const drawWhere = () => {
      const mode = HRD.store.mode();
      where.textContent = mode === 'cloud' ? '關卡、紀錄和設定存到你的帳號，只有你看得到。'
        : mode === 'local' ? '關卡、紀錄和設定存在這個瀏覽器。清除瀏覽資料或換裝置前，記得先備份。'
        : '這個分頁無法使用瀏覽器儲存空間，關閉後資料不會保留，請先備份。';
    };
    drawWhere();
    async function clearRecords() {
      const ok = await confirmDialog('清除過關紀錄？', '所有關卡的最佳成績、星星和進行中的局都會清除；自訂關卡和設定會保留。建議先「備份全部資料」。', '清除紀錄', true);
      if (!ok) return;
      HRD.store.clearProgress();
      toast('已清除過關紀錄');
    }
    const dataCard = h('section', { class: 'card settings-card', 'aria-labelledby': 'set-data' },
      h('h2', { class: 'card-title', id: 'set-data' }, '資料'),
      h('div', { class: 'setting-row' }, h('div', { class: 'setting-text' }, h('span', { class: 'setting-name' }, '儲存位置'), where)),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => HRD.io.backupDialog() }, icon('download', 18), '備份全部資料'),
        h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => HRD.io.restoreDialog() }, icon('upload', 18), '還原備份'),
        h('button', { type: 'button', class: 'btn btn-secondary btn-danger-text', onclick: clearRecords }, icon('trash', 18), '清除過關紀錄')));

    /* 帳號與同步（網站有開帳號功能時才出現） */
    const C = HRD.cloud;
    const accountCard = h('section', { class: 'card settings-card', 'aria-labelledby': 'set-account', hidden: true });
    let accountSig = null;
    const syncLine = h('p', { class: 'sync-line' });
    let syncBtn = null;
    const drawSync = () => {
      const st = C.status().state;
      syncLine.className = 'sync-line sync-' + st;
      syncLine.textContent = '';
      syncLine.append(icon(st === 'error' ? 'alert' : st === 'offline' ? 'cloudOff' : 'cloud', 18), h('span', {}, C.statusText()));
      if (syncBtn) syncBtn.disabled = st === 'syncing';
    };
    /* 公開名稱：排行榜、關卡廣場上顯示的名字 */
    function publicNameRow() {
      const input = h('input', { id: 'set-public-name', class: 'input', maxlength: '20', value: HRD.gallery.publicName(), autocomplete: 'nickname' });
      const save = h('button', { type: 'button', class: 'btn btn-secondary btn-sm' }, '儲存');
      save.addEventListener('click', async () => {
        const name = input.value.trim();
        if (!name) { toast('公開名稱不能空白'); input.focus(); return; }
        save.disabled = true;
        HRD.store.setSetting('publicName', name);
        try { await HRD.ranking.rename(name); toast('已更新公開名稱'); }
        catch (e) { toast('排行榜上的名字沒有更新：' + HRD.gallery.errorText(e)); }
        save.disabled = false;
      });
      return h('div', { class: 'setting-row' },
        h('div', { class: 'setting-text' },
          h('label', { class: 'setting-name', for: 'set-public-name' }, '公開名稱'),
          h('p', { class: 'setting-desc' }, '顯示在排行榜、關卡廣場和過關紀錄上，不會顯示電子郵件。')),
        h('div', { class: 'name-box' }, input, save));
    }

    function drawAccount() {
      const acc = HRD.store.account();
      const sig = (C.canSignIn() ? '1' : '0') + (acc ? acc.uid + acc.name + acc.email + acc.photo : '');
      if (sig !== accountSig) {
        accountSig = sig;
        accountCard.hidden = !(C.canSignIn() || acc);
        accountCard.textContent = '';
        accountCard.appendChild(h('h2', { class: 'card-title', id: 'set-account' }, '帳號與同步'));
        if (!acc) {
          accountCard.append(
            h('p', { class: 'setting-desc' }, '登入後，自訂關卡、過關紀錄和設定會存進你的帳號，在手機和電腦之間自動同步。可以用 Google 帳號或電子郵件登入。'),
            h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: () => C.signInDialog() }, icon('user', 18), '登入或建立帳號')));
          syncBtn = null;
        } else {
          syncBtn = h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => C.syncNow() }, icon('sync', 18), '立即同步');
          accountCard.append(
            h('div', { class: 'account-row' }, C.avatar(acc, 52),
              h('div', { class: 'account-text' },
                h('strong', { class: 'account-name' }, acc.name),
                h('span', { class: 'muted account-email' }, [acc.email, acc.method === 'google' ? 'Google 帳號' : '電子郵件帳號'].filter(Boolean).join(' · ')))),
            syncLine,
            publicNameRow(),
            h('div', { class: 'btn-row' }, syncBtn,
              h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => C.signOut() }, icon('logout', 18), '登出')),
            h('div', { class: 'setting-row account-danger' },
              h('div', { class: 'setting-text' },
                h('span', { class: 'setting-name' }, '刪除帳號'),
                h('p', { class: 'setting-desc' }, '帳號和雲端上的資料會永久刪除。')),
              h('button', { type: 'button', class: 'btn btn-secondary btn-danger-text btn-sm', onclick: () => C.deleteAccount() }, icon('trash', 16), '刪除帳號')));
        }
      }
      drawSync();
    }

    container.appendChild(h('div', { class: 'page settings-page' },
      h('div', {}, h('h1', { class: 'page-title' }, '設定'), h('p', { class: 'section-sub' }, '設定會自動儲存。')),
      accountCard, looks, sounds, motion, dataCard,
      h('p', { class: 'hint-text settings-version' }, '華容道 v' + HRD.VERSION)));

    drawPreview();
    drawAccount();
    const offs = [HRD.store.onChange(drawWhere), HRD.store.onChange(drawAccount), C.onChange(drawAccount), C.onChange(drawWhere)];
    // 「已同步 · 3 分鐘前」要跟著時間更新
    const tick = setInterval(drawSync, 30000);
    return function unmount() { offs.forEach((off) => off()); clearInterval(tick); };
  }

  HRD.views = HRD.views || {};
  HRD.views.settings = settingsView;
})(window);
