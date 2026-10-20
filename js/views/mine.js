/* 我的關卡 */
(function (root) {
  'use strict';
  const HRD = root.HRD;
  const { h, icon, toast, confirmDialog, formatDate } = HRD.ui;

  function badge(level) {
    if (level.solvable === true) return h('span', { class: 'badge badge-ok' }, icon('check', 14), '可解');
    if (level.solvable === false) return h('span', { class: 'badge badge-bad' }, icon('x', 14), '無解');
    if (level.solveStatus === 'too-big') return h('span', { class: 'badge badge-warn' }, icon('alert', 14), '無法判定');
    return h('span', { class: 'badge badge-warn' }, icon('clock', 14), '檢查中');
  }

  function meta(level) {
    const parts = [formatDate(level.updatedAt) + ' 修改'];
    if (level.solvable === true) parts.push('最少 ' + level.minMoves + ' 步');
    else if (level.solvable === false) parts.push('曹操到不了出口');
    else if (level.solveStatus === 'too-big') parts.push('變化太多，算不出來');
    else parts.push('正在計算最少步數');
    const pr = HRD.store.progress('c:' + level.id);
    if (pr && pr.solved) parts.push('你的最佳 ' + pr.bestSteps + ' 步');
    return parts.join(' · ');
  }

  function mineView(container, ctx) {
    const app = ctx.app;
    let query = '';
    let openMenu = null;

    const count = h('p', { class: 'section-sub' });
    const notice = h('div', { class: 'notice' });
    const grid = h('div', { class: 'level-grid mine-grid' });
    const search = h('input', { id: 'mine-search', type: 'search', class: 'input input-search', placeholder: '關卡名稱', autocomplete: 'off' });
    search.addEventListener('input', () => { query = search.value.trim(); draw(); });

    const page = h('div', { class: 'page mine-page' },
      h('div', { class: 'section-head' },
        h('div', {}, h('h1', { class: 'page-title' }, '我的關卡'), count),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => HRD.io.importDialog() }, icon('upload', 18), '匯入關卡'),
          h('button', { type: 'button', class: 'btn btn-secondary', onclick: exportAll }, icon('download', 18), '全部匯出'),
          h('a', { class: 'btn btn-primary', href: '#/edit/new' }, icon('plus', 18), '新增關卡'))),
      notice,
      h('div', { class: 'toolbar' },
        h('div', { class: 'field field-grow' },
          h('label', { class: 'field-label', for: 'mine-search' }, '搜尋'),
          h('div', { class: 'search-box' }, icon('search', 18, 'search-icon'), search))),
      grid);
    container.appendChild(page);

    function exportAll() {
      const list = HRD.store.customLevels();
      if (!list.length) { toast('還沒有可以匯出的關卡'); return; }
      HRD.io.exportDialog(list, '匯出全部關卡');
    }

    function closeMenu() {
      if (openMenu) { openMenu.menu.hidden = true; openMenu.button.setAttribute('aria-expanded', 'false'); openMenu = null; }
    }

    async function remove(level) {
      const ok = await confirmDialog('刪除「' + level.name + '」？', '刪除後可以在幾秒內按「復原」找回來。', '刪除', true);
      if (!ok) return;
      const gone = HRD.store.deleteLevel(level.id);
      if (gone) toast('已刪除「' + gone.name + '」', { label: '復原', run: () => HRD.store.restoreLevel(gone) });
    }

    function card(level) {
      const menu = h('div', { class: 'menu', role: 'menu', hidden: true },
        h('button', { type: 'button', role: 'menuitem', class: 'menu-item', onclick: () => { closeMenu(); HRD.io.shareDialog(level); } }, icon('share', 18), '分享…'),
        !HRD.gallery.available() ? null
          : level.publicId ? h('a', { role: 'menuitem', class: 'menu-item', href: '#/g/' + level.publicId, onclick: closeMenu }, icon('users', 18), '在關卡廣場查看')
          : h('button', { type: 'button', role: 'menuitem', class: 'menu-item', onclick: () => { closeMenu(); HRD.gallery.publishDialog(level); } }, icon('upload', 18), '發佈到關卡廣場'),
        h('button', { type: 'button', role: 'menuitem', class: 'menu-item', onclick: () => {
          closeMenu();
          const copy = HRD.store.duplicateLevel(level.id);
          if (copy) toast('已建立「' + copy.name + '」');
        } }, icon('copy', 18), '複製一份'),
        h('button', { type: 'button', role: 'menuitem', class: 'menu-item', onclick: () => { closeMenu(); HRD.io.exportDialog([level], '匯出「' + level.name + '」'); } }, icon('download', 18), '匯出 JSON'),
        h('div', { class: 'menu-sep', role: 'separator' }),
        h('button', { type: 'button', role: 'menuitem', class: 'menu-item menu-danger', onclick: () => { closeMenu(); remove(level); } }, icon('trash', 18), '刪除'));
      const more = h('button', {
        type: 'button', class: 'icon-btn', 'aria-label': '更多動作：' + level.name, 'aria-haspopup': 'menu', 'aria-expanded': 'false',
        onclick: (e) => {
          e.stopPropagation();
          const wasOpen = openMenu && openMenu.menu === menu;
          closeMenu();
          if (!wasOpen) {
            menu.hidden = false; more.setAttribute('aria-expanded', 'true'); openMenu = { menu: menu, button: more };
            const first = menu.querySelector('.menu-item');
            if (first) first.focus();
          }
        },
      }, icon('more', 20));
      return h('article', { class: 'level-card mine-card' },
        h('a', { class: 'thumb-wrap', href: '#/play/c/' + level.id, 'aria-label': '遊玩「' + level.name + '」' }, HRD.thumb(level)),
        h('div', { class: 'card-row' }, h('h2', { class: 'card-name' }, level.name),
          h('span', { class: 'card-badges' }, level.publicId ? h('span', { class: 'badge badge-public' }, icon('users', 14), '已發佈') : null, badge(level))),
        h('p', { class: 'card-meta' }, meta(level)),
        h('div', { class: 'card-actions' },
          h('a', { class: 'btn btn-primary btn-sm', href: '#/play/c/' + level.id }, icon('play', 16), '遊玩'),
          h('a', { class: 'btn btn-secondary btn-sm', href: '#/edit/' + level.id }, icon('edit', 16), '編輯'),
          h('div', { class: 'menu-anchor' }, more, menu)));
    }

    function draw() {
      closeMenu();
      const all = HRD.store.customLevels();
      const mode = HRD.store.mode();
      count.textContent = all.length + ' 個關卡 · ' + (mode === 'cloud' ? '已存到你的帳號' : mode === 'local' ? '存在這個瀏覽器' : '暫存在這個分頁');
      notice.textContent = '';
      notice.append(icon('info', 20), h('p', {}, mode === 'cloud'
        ? '關卡已存到你的帳號，只有你看得到。想留一份備份或分享給朋友，可以「全部匯出」成 JSON 檔。'
        : '關卡存在這個瀏覽器。清除瀏覽資料或換裝置之前，請先「全部匯出」備份成 JSON 檔。'));
      grid.textContent = '';
      if (!all.length) {
        grid.appendChild(h('div', { class: 'empty' },
          h('h2', {}, '還沒有自訂關卡'),
          h('p', {}, '用關卡編輯器排一個盤面，或貼上朋友給你的分享碼。'),
          h('div', { class: 'btn-row' },
            h('a', { class: 'btn btn-primary', href: '#/edit/new' }, icon('plus', 18), '新增關卡'),
            h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => HRD.io.importDialog() }, icon('upload', 18), '匯入關卡'))));
        return;
      }
      const shown = all.filter((l) => !query || l.name.toLowerCase().includes(query.toLowerCase()));
      shown.forEach((l) => grid.appendChild(card(l)));
      if (!shown.length) grid.appendChild(h('p', { class: 'empty-line' }, '找不到名稱含「' + query + '」的關卡。'));
      else grid.appendChild(h('a', { class: 'add-card', href: '#/edit/new' }, h('span', { class: 'add-icon' }, icon('plus', 24)), h('strong', {}, '新增空白關卡'), h('span', {}, '或從內建關卡改起')));
    }

    const onDoc = (e) => { if (openMenu && !openMenu.menu.contains(e.target)) closeMenu(); };
    const onKey = (e) => { if (e.key === 'Escape' && openMenu) { const b = openMenu.button; closeMenu(); b.focus(); } };
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    const off = HRD.store.onChange(draw);
    draw();
    HRD.io.verifyPending();

    return function unmount() {
      off();
      document.removeEventListener('click', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }

  HRD.views = HRD.views || {};
  HRD.views.mine = mineView;
})(window);
