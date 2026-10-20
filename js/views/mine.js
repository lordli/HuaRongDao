/* 我的關卡 */
(function (root) {
  'use strict';
  const t = (s, p) => root.HRD.i18n.t(s, p);
  const HRD = root.HRD;
  const { h, icon, toast, confirmDialog, formatDate } = HRD.ui;

  function badge(level) {
    if (level.solvable === true) return h('span', { class: 'badge badge-ok' }, icon('check', 14), t('可解'));
    if (level.solvable === false) return h('span', { class: 'badge badge-bad' }, icon('x', 14), t('無解'));
    if (level.solveStatus === 'too-big') return h('span', { class: 'badge badge-warn' }, icon('alert', 14), t('無法判定'));
    return h('span', { class: 'badge badge-warn' }, icon('clock', 14), t('檢查中'));
  }

  function meta(level) {
    const parts = [t('{date} 修改', { date: formatDate(level.updatedAt) })];
    if (level.solvable === true) parts.push(t('最少 {minMoves} 步', { minMoves: level.minMoves }));
    else if (level.solvable === false) parts.push(t('曹操到不了出口'));
    else if (level.solveStatus === 'too-big') parts.push(t('變化太多，算不出來'));
    else parts.push(t('正在計算最少步數'));
    const pr = HRD.store.progress('c:' + level.id);
    if (pr && pr.solved) parts.push(t('你的最佳 {bestSteps} 步', { bestSteps: pr.bestSteps }));
    return parts.join(' · ');
  }

  function mineView(container, ctx) {
    const app = ctx.app;
    let query = '';
    let openMenu = null;

    const count = h('p', { class: 'section-sub' });
    const notice = h('div', { class: 'notice' });
    const grid = h('div', { class: 'level-grid mine-grid' });
    const search = h('input', { id: 'mine-search', type: 'search', class: 'input input-search', placeholder: t('關卡名稱'), autocomplete: 'off' });
    search.addEventListener('input', () => { query = search.value.trim(); app.state.mineSeen = 0; draw(); });
    /*
     * 分頁：手機一排一個、一頁 4 個；寬一點的畫面一頁 3 排。「新增空白關卡」排在最後一頁的最後面。
     * 新增、複製、匯入或編輯過關卡（最新的那一關換了）就回到第 1 頁，才看得到它。
     */
    let pageSize = 12;
    let topPager = h('nav', { hidden: true });
    let bottomPager = h('nav', { hidden: true });

    const page = h('div', { class: 'page mine-page' },
      h('div', { class: 'section-head' },
        h('div', {}, h('h1', { class: 'page-title' }, t('我的關卡')), count),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => HRD.io.importDialog() }, icon('upload', 18), t('匯入關卡')),
          h('button', { type: 'button', class: 'btn btn-secondary', onclick: exportAll }, icon('download', 18), t('全部匯出')),
          h('a', { class: 'btn btn-primary', href: '#/edit/new' }, icon('plus', 18), t('新增關卡')))),
      notice,
      h('div', { class: 'toolbar mine-toolbar' },
        h('div', { class: 'field field-grow' },
          h('label', { class: 'field-label', for: 'mine-search' }, t('搜尋')),
          h('div', { class: 'search-box' }, icon('search', 18, 'search-icon'), search)),
        topPager),
      grid,
      bottomPager);
    container.appendChild(page);

    function exportAll() {
      const list = HRD.store.customLevels();
      if (!list.length) { toast(t('還沒有可以匯出的關卡')); return; }
      HRD.io.exportDialog(list, t('匯出全部關卡'));
    }

    function closeMenu() {
      if (openMenu) { openMenu.menu.hidden = true; openMenu.button.setAttribute('aria-expanded', 'false'); openMenu = null; }
    }

    async function remove(level) {
      const ok = await confirmDialog(t('刪除「{name}」？', { name: level.name }), t('刪除後可以在幾秒內按「復原」找回來。'), t('刪除'), true);
      if (!ok) return;
      const gone = HRD.store.deleteLevel(level.id);
      if (gone) toast(t('已刪除「{name}」', { name: gone.name }), { label: t('復原'), run: () => HRD.store.restoreLevel(gone) });
    }

    function card(level) {
      const menu = h('div', { class: 'menu', role: 'menu', hidden: true },
        h('button', { type: 'button', role: 'menuitem', class: 'menu-item', onclick: () => { closeMenu(); HRD.io.shareDialog(level); } }, icon('share', 18), t('分享…')),
        !HRD.gallery.available() ? null
          : level.publicId ? h('a', { role: 'menuitem', class: 'menu-item', href: '#/g/' + level.publicId, onclick: closeMenu }, icon('users', 18), t('在關卡廣場查看'))
          : h('button', { type: 'button', role: 'menuitem', class: 'menu-item', onclick: () => { closeMenu(); HRD.gallery.publishDialog(level); } }, icon('upload', 18), t('發佈到關卡廣場')),
        h('button', { type: 'button', role: 'menuitem', class: 'menu-item', onclick: () => {
          closeMenu();
          const copy = HRD.store.duplicateLevel(level.id);
          if (copy) toast(t('已建立「{name}」', { name: copy.name }));
        } }, icon('copy', 18), t('複製一份')),
        h('button', { type: 'button', role: 'menuitem', class: 'menu-item', onclick: () => { closeMenu(); HRD.io.exportDialog([level], t('匯出「{name}」', { name: level.name })); } }, icon('download', 18), t('匯出 JSON')),
        h('div', { class: 'menu-sep', role: 'separator' }),
        h('button', { type: 'button', role: 'menuitem', class: 'menu-item menu-danger', onclick: () => { closeMenu(); remove(level); } }, icon('trash', 18), t('刪除')));
      const more = h('button', {
        type: 'button', class: 'icon-btn', 'aria-label': t('更多動作：{name}', { name: level.name }), 'aria-haspopup': 'menu', 'aria-expanded': 'false',
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
        h('a', { class: 'thumb-wrap', href: '#/play/c/' + level.id, 'aria-label': t('遊玩「{name}」', { name: level.name }) }, HRD.thumb(level)),
        h('div', { class: 'card-row' }, h('h2', { class: 'card-name' }, level.name),
          h('span', { class: 'card-badges' }, level.publicId ? h('span', { class: 'badge badge-public' }, icon('users', 14), t('已發佈')) : null, badge(level))),
        h('p', { class: 'card-meta' }, meta(level)),
        h('div', { class: 'card-actions' },
          h('a', { class: 'btn btn-primary btn-sm', href: '#/play/c/' + level.id }, icon('play', 16), t('遊玩')),
          h('a', { class: 'btn btn-secondary btn-sm', href: '#/edit/' + level.id }, icon('edit', 16), t('編輯')),
          h('div', { class: 'menu-anchor' }, more, menu)));
    }

    function draw() {
      closeMenu();
      const all = HRD.store.customLevels();
      const mode = HRD.store.mode();
      count.textContent = t('{n} 個關卡 · {text}', { n: all.length, text: mode === 'cloud' ? t('已存到你的帳號') : mode === 'local' ? t('存在這個瀏覽器') : t('暫存在這個分頁') });
      notice.textContent = '';
      notice.append(icon('info', 20), h('p', {}, mode === 'cloud'
        ? t('關卡已存到你的帳號，只有你看得到。想留一份備份或分享給朋友，可以「全部匯出」成 JSON 檔。')
        : t('關卡存在這個瀏覽器。清除瀏覽資料或換裝置之前，請先「全部匯出」備份成 JSON 檔。')));
      grid.textContent = '';
      if (!all.length) {
        grid.appendChild(h('div', { class: 'empty' },
          h('h2', {}, t('還沒有自訂關卡')),
          h('p', {}, t('用關卡編輯器排一個盤面，或貼上朋友給你的分享碼。')),
          h('div', { class: 'btn-row' },
            h('a', { class: 'btn btn-primary', href: '#/edit/new' }, icon('plus', 18), t('新增關卡')),
            h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => HRD.io.importDialog() }, icon('upload', 18), t('匯入關卡')))));
        pagers(0, 1);
        return;
      }
      const shown = all.filter((l) => !query || l.name.toLowerCase().includes(query.toLowerCase()));
      if (!shown.length) { grid.appendChild(h('p', { class: 'empty-line' }, t('找不到名稱含「{query}」的關卡。', { query }))); pagers(0, 1); return; }
      const top = all[0].id + '@' + all[0].updatedAt;
      if (app.state.mineTop !== top) { app.state.mineTop = top; app.state.mineSeen = 0; }
      const items = shown.map((l) => () => card(l));
      items.push(() => h('a', { class: 'add-card', href: '#/edit/new' }, h('span', { class: 'add-icon' }, icon('plus', 24)), h('strong', {}, t('新增空白關卡')), h('span', {}, t('或從內建關卡改起'))));
      const pages = Math.ceil(items.length / pageSize);
      const page = Math.min(Math.floor((app.state.mineSeen || 0) / pageSize), pages - 1);
      app.state.mineSeen = page * pageSize;
      items.slice(page * pageSize, (page + 1) * pageSize).forEach((make) => grid.appendChild(make()));
      pagers(page, pages);
    }

    function pagers(page, pages) {
      const go = (fromBottom) => (n) => {
        app.state.mineSeen = n * pageSize;
        draw();
        if (!fromBottom) return;
        // 從下面的分頁列換頁：捲回列表開頭，鍵盤焦點移到第一個關卡
        grid.scrollIntoView({ block: 'start', behavior: HRD.settings.reduceMotion() ? 'auto' : 'smooth' });
        const first = grid.querySelector('a');
        if (first) first.focus({ preventScroll: true });
      };
      topPager.replaceWith(topPager = HRD.ui.pager(page, pages, go(false), true));
      bottomPager.replaceWith(bottomPager = HRD.ui.pager(page, pages, go(true)));
    }

    const onDoc = (e) => { if (openMenu && !openMenu.menu.contains(e.target)) closeMenu(); };
    const onKey = (e) => { if (e.key === 'Escape' && openMenu) { const b = openMenu.button; closeMenu(); b.focus(); } };
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    const off = HRD.store.onChange(draw);
    pageSize = HRD.ui.gridPageSize(grid, 3, 4);
    draw();
    HRD.io.verifyPending();
    let resizeTimer = null;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { const size = HRD.ui.gridPageSize(grid, 3, 4); if (size !== pageSize) { pageSize = size; draw(); } }, 150);
    };
    root.addEventListener('resize', onResize);

    return function unmount() {
      off();
      root.removeEventListener('resize', onResize);
      clearTimeout(resizeTimer);
      document.removeEventListener('click', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }

  HRD.views = HRD.views || {};
  HRD.views.mine = mineView;
})(window);
