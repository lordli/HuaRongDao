/* 首頁・關卡選擇 */
(function (root) {
  'use strict';
  const t = (s, p) => root.HRD.i18n.t(s, p);
  const HRD = root.HRD;
  const E = HRD.engine;
  const { h, icon, formatTime } = HRD.ui;
  const NUDGE_KEY = 'huarongdao.nudge';

  function savedState(level, game) {
    let st = E.levelToState(level);
    if (game && Array.isArray(game.pos) && game.pos.length === st.pieces.length) {
      game.pos.forEach((xy, i) => { st = E.withPiece(st, i, xy[0], xy[1]); });
    }
    return st;
  }

  function levelStatus(key, level) {
    const pr = HRD.store.progress(key);
    const sv = HRD.store.savedGame(key);
    if (pr && pr.solved) return { cls: 'done', icon: 'check', text: t('最佳 {bestSteps} 步', { bestSteps: pr.bestSteps }), stars: pr.stars || 0 };
    if (sv && sv.hist && sv.hist.length) return { cls: 'playing', icon: 'clock', text: t('進行中 · 第 {n} 步', { n: sv.hist.length }) };
    return { cls: 'fresh', icon: null, text: level.minMoves != null ? t('最少 {minMoves} 步', { minMoves: level.minMoves }) : t('未挑戰') };
  }

  function starsSmall(n) {
    const box = h('span', { class: 'stars-sm', role: 'img', 'aria-label': t('{n} 顆星（滿分 3）', { n }) });
    for (let i = 1; i <= 3; i++) box.appendChild(icon('star', 14, i <= n ? 'star-on' : 'star-off'));
    return box;
  }

  function levelCard(level) {
    const key = 'b:' + level.id;
    const s = levelStatus(key, level);
    const cat = HRD.levels.CATEGORIES.find((c) => c.id === level.category);
    return h('a', { class: 'level-card', href: '#/play/b/' + level.id },
      h('div', { class: 'thumb-wrap' }, HRD.thumb(level, savedState(level, HRD.store.savedGame(key)))),
      h('div', { class: 'card-row' },
        h('span', { class: 'card-name' }, level.name),
        h('span', { class: 'chip chip-' + level.category }, cat.name)),
      h('div', { class: 'card-row' },
        HRD.app.dots(level.difficulty),
        h('span', { class: 'card-status status-' + s.cls }, s.icon ? icon(s.icon, 16) : null, s.text, s.stars ? starsSmall(s.stars) : null)));
  }

  function homeView(container, ctx) {
    const app = ctx.app;
    const levels = HRD.levels.LEVELS;
    const cats = HRD.levels.CATEGORIES;
    let filter = app.state.homeFilter || 'all';

    /* 上方：繼續上一局／下一關，以及出題入口 */
    let lead;
    const last = HRD.store.lastGame();
    const lastInfo = last ? app.resolve(last.key) : null;
    if (lastInfo && lastInfo.kind !== 'draft') {
      lead = h('section', { class: 'lead-card', 'aria-label': t('繼續上一局') },
        h('div', { class: 'lead-thumb' }, HRD.thumb(lastInfo.level, savedState(lastInfo.level, last.game), 190)),
        h('div', { class: 'lead-body' },
          h('span', { class: 'eyebrow' }, t('繼續上一局')),
          h('h1', { class: 'lead-title' }, lastInfo.level.name),
          h('p', { class: 'lead-meta' }, t('已走 {n} 步 · 用時 {time}', { n: (last.game.hist || []).length, time: formatTime(last.game.elapsed || 0) })),
          h('div', { class: 'btn-row' },
            h('a', { class: 'btn btn-primary', href: '#/play/' + last.key.replace(':', '/') }, icon('play', 18), t('繼續遊戲')))));
    } else {
      const next = levels.find((l) => { const p = HRD.store.progress('b:' + l.id); return !(p && p.solved); }) || levels[0];
      const cat = cats.find((c) => c.id === next.category);
      const solvedAny = levels.some((l) => { const p = HRD.store.progress('b:' + l.id); return p && p.solved; });
      lead = h('section', { class: 'lead-card', 'aria-label': t('下一關') },
        h('div', { class: 'lead-thumb' }, HRD.thumb(next, null, 190)),
        h('div', { class: 'lead-body' },
          h('span', { class: 'eyebrow' }, solvedAny ? t('下一關') : t('從這裡開始')),
          h('h1', { class: 'lead-title' }, next.name),
          h('p', { class: 'lead-meta' }, t('{name} · 最少 {minMoves} 步', { name: cat.name, minMoves: next.minMoves })),
          h('p', { class: 'lead-desc' }, next.description),
          h('div', { class: 'btn-row' },
            h('a', { class: 'btn btn-primary', href: '#/play/b/' + next.id }, icon('play', 18), t('開始挑戰')))));
    }

    const mineCount = HRD.store.customLevels().length;
    const create = h('section', { class: 'create-card', 'aria-label': t('自己出題') },
      h('div', {},
        h('h2', {}, t('自己出題')),
        h('p', {}, t('在編輯器排好棋子，會自動檢查能不能解、最少要幾步。存起來慢慢玩，或產生分享連結給朋友挑戰。'))),
      h('div', { class: 'btn-row' },
        h('a', { class: 'btn btn-gold', href: '#/edit/new' }, icon('plus', 18), t('開啟關卡編輯器')),
        h('button', { type: 'button', class: 'link-light link-btn', onclick: () => HRD.io.importDialog() }, t('輸入分享碼')),
        h('a', { class: 'link-light', href: '#/mine' }, t('我的關卡（{mineCount}）', { mineCount }))));

    /* 關卡列表 */
    const solved = levels.filter((l) => { const p = HRD.store.progress('b:' + l.id); return p && p.solved; });
    const starTotal = solved.reduce((n, l) => n + (HRD.store.progress('b:' + l.id).stars || 0), 0);
    const grid = h('div', { class: 'level-grid' });
    const tabs = h('div', { class: 'tabs', role: 'group', 'aria-label': t('分類') });
    const tabDefs = [{ id: 'all', name: t('全部') }].concat(cats);
    const isSolved = (l) => { const p = HRD.store.progress('b:' + l.id); return !!(p && p.solved); };
    tabDefs.forEach((c) => {
      const inCat = levels.filter((l) => c.id === 'all' || l.category === c.id);
      const left = inCat.filter((l) => !isSolved(l)).length;
      tabs.appendChild(h('button', {
        type: 'button', class: 'tab', 'data-id': c.id,
        'aria-label': left < inCat.length ? t('{name}，{n} 關，還有 {left} 關沒過', { name: c.name, n: inCat.length, left }) : t('{name}，{n} 關', { name: c.name, n: inCat.length }),
        onclick: () => { filter = c.id; app.state.homeFilter = c.id; drawGrid(); },
      }, c.name, h('span', { class: 'tab-count', 'aria-hidden': 'true' }, String(inCat.length))));
    });
    // 關卡很多，可以只看還沒過關的
    const unsolvedOnly = h('input', { type: 'checkbox', class: 'switch', id: 'home-unsolved', checked: !!app.state.homeUnsolved });
    unsolvedOnly.addEventListener('change', () => { app.state.homeUnsolved = unsolvedOnly.checked; drawGrid(); });

    /*
     * 分頁：一頁放滿幾排（手機 2 欄 × 4 排、其他 3 排），欄數跟著畫面寬度。
     * 記住每個分類看到哪一關（換頁大小時也能停在同一個位置）；第一次打開跳到第一個還沒過的關卡。
     */
    const seen = app.state.homeSeen || (app.state.homeSeen = {});
    let pageSize = 15;
    let topPager = h('nav', { hidden: true });
    let bottomPager = h('nav', { hidden: true });
    const levelsSection = h('section', { class: 'levels', 'aria-labelledby': 'levels-title' });
    const listKey = () => filter + (unsolvedOnly.checked ? ':unsolved' : '');
    const measure = () => HRD.ui.gridPageSize(grid);

    function drawGrid(scroll) {
      const shown = levels.filter((l) => (filter === 'all' || l.category === filter) && !(unsolvedOnly.checked && isSolved(l)));
      const pages = Math.max(1, Math.ceil(shown.length / pageSize));
      let first = seen[listKey()];
      if (first == null) first = Math.max(0, shown.findIndex((l) => !isSolved(l)));
      const page = Math.min(Math.floor(first / pageSize), pages - 1);
      seen[listKey()] = page * pageSize;
      grid.textContent = '';
      shown.slice(page * pageSize, (page + 1) * pageSize).forEach((l) => grid.appendChild(levelCard(l)));
      if (!shown.length) grid.appendChild(h('p', { class: 'empty-line' }, t('這個分類全部過關了，太厲害了！')));
      const go = (fromBottom) => (n) => { seen[listKey()] = n * pageSize; drawGrid(fromBottom); };
      topPager.replaceWith(topPager = HRD.ui.pager(page, pages, go(false), true));
      bottomPager.replaceWith(bottomPager = HRD.ui.pager(page, pages, go(true)));
      tabs.querySelectorAll('.tab').forEach((tt) => tt.setAttribute('aria-pressed', tt.dataset.id === filter ? 'true' : 'false'));
      if (scroll) {
        // 從下面的分頁列換頁：捲回關卡列表的開頭，鍵盤焦點移到第一關
        levelsSection.scrollIntoView({ block: 'start', behavior: HRD.settings.reduceMotion() ? 'auto' : 'smooth' });
        const firstCard = grid.querySelector('a');
        if (firstCard) firstCard.focus({ preventScroll: true });
      }
    }

    /* 有玩過、但還沒登入：提一下可以登入同步（可以關掉） */
    let nudge = null;
    let dismissed = false;
    try { dismissed = root.localStorage.getItem(NUDGE_KEY) === '1'; } catch (e) { /* 讀不到就照常顯示 */ }
    if (HRD.cloud.canSignIn() && !HRD.store.account() && !dismissed && (solved.length || mineCount)) {
      nudge = h('section', { class: 'sync-nudge', 'aria-label': t('登入同步') },
        icon('cloud', 22),
        h('p', {}, t('登入帳號，就能在手機和電腦之間同步關卡和過關紀錄。')),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: () => HRD.cloud.signInDialog() }, t('登入')),
          h('button', {
            type: 'button', class: 'icon-btn ghost', 'aria-label': t('不再顯示'),
            onclick: () => { try { root.localStorage.setItem(NUDGE_KEY, '1'); } catch (e) { /* 只關這一次 */ } nudge.remove(); },
          }, icon('x', 20))));
    }

    levelsSection.append(
      h('div', { class: 'section-head' },
        h('div', {},
          h('h2', { id: 'levels-title', class: 'section-title' }, t('關卡')),
          h('p', { class: 'section-sub' }, t('已過關 {n} / {n2} · 共 {starTotal} 顆星', { n: solved.length, n2: levels.length, starTotal }))),
        topPager),
      h('div', { class: 'levels-bar' }, tabs,
        h('label', { class: 'switch-row', for: 'home-unsolved' }, unsolvedOnly, h('span', {}, t('只看還沒過關的')))),
      grid,
      bottomPager);
    container.appendChild(h('div', { class: 'page home-page' },
      h('div', { class: 'home-top' }, lead, create),
      nudge,
      levelsSection));

    // 放進畫面之後才量得到一排幾欄
    pageSize = measure();
    drawGrid();
    let resizeTimer = null;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { const size = measure(); if (size !== pageSize) { pageSize = size; drawGrid(); } }, 150);
    };
    root.addEventListener('resize', onResize);
    return function unmount() { root.removeEventListener('resize', onResize); clearTimeout(resizeTimer); };
  }

  HRD.views = HRD.views || {};
  HRD.views.home = homeView;
})(window);
