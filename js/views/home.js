/* 首頁・關卡選擇 */
(function (root) {
  'use strict';
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
    if (pr && pr.solved) return { cls: 'done', icon: 'check', text: '最佳 ' + pr.bestSteps + ' 步', stars: pr.stars || 0 };
    if (sv && sv.hist && sv.hist.length) return { cls: 'playing', icon: 'clock', text: '進行中 · 第 ' + sv.hist.length + ' 步' };
    return { cls: 'fresh', icon: null, text: level.minMoves != null ? '最少 ' + level.minMoves + ' 步' : '未挑戰' };
  }

  function starsSmall(n) {
    const box = h('span', { class: 'stars-sm', role: 'img', 'aria-label': n + ' 顆星（滿分 3）' });
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
      lead = h('section', { class: 'lead-card', 'aria-label': '繼續上一局' },
        h('div', { class: 'lead-thumb' }, HRD.thumb(lastInfo.level, savedState(lastInfo.level, last.game), 190)),
        h('div', { class: 'lead-body' },
          h('span', { class: 'eyebrow' }, '繼續上一局'),
          h('h1', { class: 'lead-title' }, lastInfo.level.name),
          h('p', { class: 'lead-meta' }, '已走 ' + (last.game.hist || []).length + ' 步 · 用時 ' + formatTime(last.game.elapsed || 0)),
          h('div', { class: 'btn-row' },
            h('a', { class: 'btn btn-primary', href: '#/play/' + last.key.replace(':', '/') }, icon('play', 18), '繼續遊戲'))));
    } else {
      const next = levels.find((l) => { const p = HRD.store.progress('b:' + l.id); return !(p && p.solved); }) || levels[0];
      const cat = cats.find((c) => c.id === next.category);
      const solvedAny = levels.some((l) => { const p = HRD.store.progress('b:' + l.id); return p && p.solved; });
      lead = h('section', { class: 'lead-card', 'aria-label': '下一關' },
        h('div', { class: 'lead-thumb' }, HRD.thumb(next, null, 190)),
        h('div', { class: 'lead-body' },
          h('span', { class: 'eyebrow' }, solvedAny ? '下一關' : '從這裡開始'),
          h('h1', { class: 'lead-title' }, next.name),
          h('p', { class: 'lead-meta' }, cat.name + ' · 最少 ' + next.minMoves + ' 步'),
          h('p', { class: 'lead-desc' }, next.description),
          h('div', { class: 'btn-row' },
            h('a', { class: 'btn btn-primary', href: '#/play/b/' + next.id }, icon('play', 18), '開始挑戰'))));
    }

    const mineCount = HRD.store.customLevels().length;
    const create = h('section', { class: 'create-card', 'aria-label': '自己出題' },
      h('div', {},
        h('h2', {}, '自己出題'),
        h('p', {}, '在編輯器排好棋子，會自動檢查能不能解、最少要幾步。存起來慢慢玩，或產生分享連結給朋友挑戰。')),
      h('div', { class: 'btn-row' },
        h('a', { class: 'btn btn-gold', href: '#/edit/new' }, icon('plus', 18), '開啟關卡編輯器'),
        h('button', { type: 'button', class: 'link-light link-btn', onclick: () => HRD.io.importDialog() }, '輸入分享碼'),
        h('a', { class: 'link-light', href: '#/mine' }, '我的關卡（' + mineCount + '）')));

    /* 關卡列表 */
    const solved = levels.filter((l) => { const p = HRD.store.progress('b:' + l.id); return p && p.solved; });
    const starTotal = solved.reduce((n, l) => n + (HRD.store.progress('b:' + l.id).stars || 0), 0);
    const grid = h('div', { class: 'level-grid' });
    const tabs = h('div', { class: 'tabs', role: 'group', 'aria-label': '分類' });
    const tabDefs = [{ id: 'all', name: '全部' }].concat(cats);
    const isSolved = (l) => { const p = HRD.store.progress('b:' + l.id); return !!(p && p.solved); };
    tabDefs.forEach((c) => {
      const inCat = levels.filter((l) => c.id === 'all' || l.category === c.id);
      const left = inCat.filter((l) => !isSolved(l)).length;
      tabs.appendChild(h('button', {
        type: 'button', class: 'tab', 'data-id': c.id,
        'aria-label': c.name + '，' + inCat.length + ' 關' + (left < inCat.length ? '，還有 ' + left + ' 關沒過' : ''),
        onclick: () => { filter = c.id; app.state.homeFilter = c.id; drawGrid(); },
      }, c.name, h('span', { class: 'tab-count', 'aria-hidden': 'true' }, String(inCat.length))));
    });
    // 關卡很多，可以只看還沒過關的
    const unsolvedOnly = h('input', { type: 'checkbox', class: 'switch', id: 'home-unsolved', checked: !!app.state.homeUnsolved });
    unsolvedOnly.addEventListener('change', () => { app.state.homeUnsolved = unsolvedOnly.checked; drawGrid(); });

    function drawGrid() {
      grid.textContent = '';
      const shown = levels.filter((l) => (filter === 'all' || l.category === filter) && !(unsolvedOnly.checked && isSolved(l)));
      shown.forEach((l) => grid.appendChild(levelCard(l)));
      if (!shown.length) grid.appendChild(h('p', { class: 'empty-line' }, '這個分類全部過關了，太厲害了！'));
      tabs.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-pressed', t.dataset.id === filter ? 'true' : 'false'));
    }
    drawGrid();

    /* 有玩過、但還沒登入：提一下可以登入同步（可以關掉） */
    let nudge = null;
    let dismissed = false;
    try { dismissed = root.localStorage.getItem(NUDGE_KEY) === '1'; } catch (e) { /* 讀不到就照常顯示 */ }
    if (HRD.cloud.canSignIn() && !HRD.store.account() && !dismissed && (solved.length || mineCount)) {
      nudge = h('section', { class: 'sync-nudge', 'aria-label': '登入同步' },
        icon('cloud', 22),
        h('p', {}, '登入帳號，就能在手機和電腦之間同步關卡和過關紀錄。'),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: () => HRD.cloud.signInDialog() }, '登入'),
          h('button', {
            type: 'button', class: 'icon-btn ghost', 'aria-label': '不再顯示',
            onclick: () => { try { root.localStorage.setItem(NUDGE_KEY, '1'); } catch (e) { /* 只關這一次 */ } nudge.remove(); },
          }, icon('x', 20))));
    }

    container.appendChild(h('div', { class: 'page home-page' },
      h('div', { class: 'home-top' }, lead, create),
      nudge,
      h('section', { class: 'levels', 'aria-labelledby': 'levels-title' },
        h('div', { class: 'section-head' },
          h('div', {},
            h('h2', { id: 'levels-title', class: 'section-title' }, '關卡'),
            h('p', { class: 'section-sub' }, '已過關 ' + solved.length + ' / ' + levels.length + ' · 共 ' + starTotal + ' 顆星'))),
        h('div', { class: 'levels-bar' }, tabs,
          h('label', { class: 'switch-row', for: 'home-unsolved' }, unsolvedOnly, h('span', {}, '只看還沒過關的'))),
        grid)));

    return null;
  }

  HRD.views = HRD.views || {};
  HRD.views.home = homeView;
})(window);
