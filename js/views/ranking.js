/* 排行榜：總排行、各關排行 */
(function (root) {
  'use strict';
  const t = (s, p) => root.HRD.i18n.t(s, p);
  const HRD = root.HRD;
  const { h, icon, formatTime } = HRD.ui;
  const R = () => HRD.ranking;

  const MAX_JUMP = 1000; // 名次再後面就不提供「跳到我的名次」（要從頭讀太多筆）

  const TABS = [{ id: 'all', get name() { return t('總排行'); } }, { id: 'level', get name() { return t('各關排行'); } }];

  function rankBadge(n) {
    return h('span', { class: 'rank-no' + (n <= 3 ? ' rank-' + n : '') }, String(n));
  }

  function rankingView(container, ctx) {
    const app = ctx.app;
    let alive = true;
    let tab = ctx.levelId ? 'level' : app.state.rankTab || 'all';
    let levelId = ctx.levelId || app.state.rankLevel || defaultLevel();
    const shell = h('div', { class: 'page' }, h('p', { class: 'empty-line', role: 'status' }, t('載入中…')));
    container.appendChild(shell);

    function defaultLevel() {
      const last = HRD.store.lastGame();
      return last && last.key.startsWith('b:') ? last.key.slice(2) : 'hengdao';
    }

    HRD.cloud.ready().then(() => {
      if (!alive) return;
      shell.remove();
      if (!R().available()) {
        container.appendChild(h('div', { class: 'page' }, h('div', { class: 'empty' },
          h('h1', {}, t('排行榜目前無法使用')),
          h('p', {}, t('排行榜需要部署到 Firebase Hosting（並開啟帳號功能）才能使用。')),
          h('div', { class: 'btn-row' }, h('a', { class: 'btn btn-primary', href: '#/' }, t('回到首頁'))))));
        return;
      }
      build();
    });

    let offs = [];
    function build() {
      const tabs = h('div', { class: 'tabs', role: 'group', 'aria-label': t('排行榜種類') });
      const body = h('div', { class: 'ranking-body' });
      let token = 0;
      let current = null; // 目前顯示的名次清單
      // 每個排行看到第幾名：換分頁、換關卡再回來時停在同一頁
      const seen = app.state.rankSeen || (app.state.rankSeen = {});
      const perPage = () => (root.matchMedia && root.matchMedia('(max-width: 560px)').matches ? 10 : 20);

      function drawTabs() {
        tabs.textContent = '';
        TABS.forEach((tt) => tabs.appendChild(h('button', {
          type: 'button', class: 'tab', 'aria-pressed': tt.id === tab ? 'true' : 'false',
          onclick: () => { tab = tt.id; app.state.rankTab = tt.id; app.replace(tt.id === 'level' ? '#/ranking/' + levelId : '#/ranking'); drawTabs(); draw(); },
        }, tt.name)));
      }

      /* 登入狀態要等 Firebase 載入完才知道，所以每次用到才問 */
      const myUid = () => (HRD.cloud.currentUser() || {}).uid || null;
      function status(text) { return h('p', { class: 'empty-line', role: 'status' }, text); }
      function failed(e, retry) {
        return h('p', { class: 'empty-line', role: 'status' }, t('載入失敗：{errorText} ', { errorText: HRD.gallery.errorText(e) }),
          h('button', { type: 'button', class: 'text-btn', onclick: retry }, t('再試一次')));
      }

      /* 自己的成績；jump：跳到自己那一頁的按鈕 */
      function myCard(content, jump) { return h('section', { class: 'rank-me', 'aria-label': t('我的名次') }, icon('trophy', 22), h('div', {}, content, jump || null)); }
      function signInCard(text) {
        return myCard([h('p', {}, text), h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: () => HRD.cloud.signInDialog() }, t('登入'))]);
      }

      /*
       * 分頁的名次清單。key：記住看到第幾名用的；fetch(after, n)：讀一段；total：伺服器上數的人數（Promise）；
       * row(資料, 名次)：畫一列；prepare(這一頁的資料)：畫之前要先補的東西（例如玩家現在的名字）；
       * onShow()：每畫好一頁就叫一次（自己的名次可能要跟著更正）
       */
      function rankPages(opts) {
        const list = h('ol', { class: 'rank-list' });
        let note = status(t('載入中…'));
        const countEl = h('span', { class: 'list-count' });
        let topPager = HRD.ui.pager(0, 1, null, true), bottomPager = HRD.ui.pager(0, 1);
        const bar = h('div', { class: 'list-bar' }, countEl, topPager);
        const el = h('div', { class: 'rank-board' }, bar, list, note, bottomPager);
        const src = HRD.ui.cursorList(opts.fetch, R().TOP);
        const total = opts.total.catch(() => null);
        let size = perPage(), my = 0;

        async function show(page, fromBottom, then) {
          const mine = ++my;
          list.classList.add('is-loading');
          if (!list.children.length) { note.hidden = false; note.textContent = t('載入中…'); }
          try {
            const [n] = await Promise.all([total, src.ensure((page + 1) * size + 1)]);
            const res = await HRD.ui.cursorPage(src, page, size, n);
            if (opts.prepare) await opts.prepare(res.rows);
            if (mine !== my || !alive) return;
            seen[opts.key] = res.page * size;
            list.classList.remove('is-loading');
            list.textContent = '';
            list.start = res.page * size + 1;
            res.rows.forEach((x, i) => list.appendChild(opts.row(x, res.page * size + i + 1)));
            const people = src.done ? src.items.length : n;
            countEl.textContent = people ? t('{n} 人上榜', { n: people }) : '';
            note.hidden = !!res.rows.length;
            note.textContent = res.rows.length ? '' : opts.empty;
            topPager.replaceWith(topPager = HRD.ui.pager(res.page, res.pages, (k) => show(k), true));
            bottomPager.replaceWith(bottomPager = HRD.ui.pager(res.page, res.pages, (k) => show(k, true)));
            if (fromBottom) {
              bar.scrollIntoView({ block: 'start', behavior: HRD.settings.reduceMotion() ? 'auto' : 'smooth' });
              const first = list.querySelector('button, a');
              if (first) first.focus({ preventScroll: true });
            }
            if (opts.onShow) opts.onShow();
            if (then) then();
          } catch (e) {
            if (mine !== my || !alive) return;
            list.classList.remove('is-loading');
            note.hidden = false;
            note.replaceWith(note = failed(e, () => show(page, fromBottom, then)));
          }
        }

        return {
          el,
          start() { show(Math.floor((seen[opts.key] || 0) / size)); },
          /* 自己在清單裡第幾名（還沒讀到就是 null）；伺服器數的名次會把沒通過驗證的紀錄也算進去 */
          rankOf(uid) { const i = src.items.findIndex((x) => x.uid === uid); return i >= 0 ? i + 1 : null; },
          /* 跳到自己那一頁，把自己那一列捲到畫面中間。rank 是伺服器數的名次，自己只會在它前後 */
          async goTo(uid, rank) {
            try { await src.ensure(rank + size); } catch (e) { /* 讀不到的話 show 會再讀一次並顯示錯誤 */ }
            const at = this.rankOf(uid) || rank;
            show(Math.floor((at - 1) / size), false, () => {
              const row = list.querySelector('.is-me');
              if (row) row.scrollIntoView({ block: 'center', behavior: HRD.settings.reduceMotion() ? 'auto' : 'smooth' });
            });
          },
          resize() { const s = perPage(); if (s !== size) { size = s; show(Math.floor((seen[opts.key] || 0) / size)); } },
          get size() { return size; },
        };
      }

      /* 名次在第一頁以外（也不會遠到要讀上千筆）才需要跳過去的按鈕 */
      function jumpButton(board, uid, rank) {
        if (!(rank > board.size) || rank > MAX_JUMP) return null;
        return h('button', { type: 'button', class: 'text-btn', onclick: () => board.goTo(uid, rank) }, t('跳到我的名次'));
      }

      /* 自己的名次卡：清單讀到自己之後，名次改用清單上的（跟列表上的數字一樣） */
      function meCard(box, board, text) {
        let shown, info = null;
        const draw = () => {
          if (!info) return;
          const rank = info.rank ? board.rankOf(myUid()) || info.rank : null;
          if (rank === shown) return;
          shown = rank;
          box.textContent = '';
          box.appendChild(rank ? myCard(h('p', {}, text(info, rank)), jumpButton(board, myUid(), rank)) : myCard(h('p', {}, info.none)));
        };
        return { set(v) { info = v; draw(); }, draw };
      }

      async function drawAll() {
        const my = ++token;
        body.textContent = '';
        const mine = h('div', {});
        let card = null;
        const board = rankPages({
          key: 'all',
          onShow: () => card && card.draw(),
          fetch: (after, n) => R().players({ after: after, limit: n }),
          total: R().count(),
          empty: t('排行榜還是空的，來搶第一名吧！'),
          row: (p, n) => h('li', { class: 'rank-row' + (p.uid === myUid() ? ' is-me' : '') },
            rankBadge(n),
            h('span', { class: 'rank-name' }, p.name + (p.uid === myUid() ? t('（你）') : '')),
            h('span', { class: 'rank-score' }, starText(p.stars), h('span', { class: 'rank-sub' }, t('過關 {cleared} 關', { cleared: p.cleared })))),
        });
        current = board;
        body.append(mine, board.el);
        board.start();
        if (!HRD.store.account()) { mine.appendChild(signInCard(t('登入後，不用提示過關的成績就會列進排行榜。'))); return; }
        try {
          const me = await R().me();
          if (my !== token || !alive) return;
          card = meCard(mine, board, (x, rank) => [t('你目前是第 {rank} 名', { rank }), ' · ', starText(x.player.stars), ' · ', t('過關 {cleared} 關', { cleared: x.player.cleared })]);
          card.set(me && me.player ? Object.assign({}, me) : { none: t('你還沒有上榜的成績。挑一關內建關卡，不用提示過關就會上榜！') });
        } catch (e) { /* 自己的名次載入失敗就先不顯示，清單還是看得到 */ }
      }

      function starText(n) { return h('span', { class: 'rank-stars' }, icon('star', 15, 'star-on'), String(n)); }

      function levelSelect() {
        const sel = h('select', { id: 'rank-level', class: 'input' },
          HRD.levels.CATEGORIES.map((c) => h('optgroup', { label: c.name },
            HRD.levels.LEVELS.filter((l) => l.category === c.id).map((l) => h('option', { value: l.id }, t('{name}（最少 {minMoves} 步）', { name: l.name, minMoves: l.minMoves }))))));
        sel.value = levelId;
        sel.addEventListener('change', () => { levelId = sel.value; app.state.rankLevel = levelId; app.replace('#/ranking/' + levelId); drawLevel(); });
        return sel;
      }

      async function drawLevel() {
        const my = ++token;
        const level = HRD.levels.LEVELS.find((l) => l.id === levelId) || HRD.levels.LEVELS[0];
        levelId = level.id;
        body.textContent = '';
        const head = h('div', { class: 'rank-level-head' },
          h('div', { class: 'rank-level-thumb' }, HRD.thumb(level, null, 120)),
          h('div', { class: 'field field-grow' }, h('label', { class: 'field-label', for: 'rank-level' }, t('選擇關卡')), levelSelect(),
            h('div', { class: 'btn-row' }, h('a', { class: 'btn btn-secondary btn-sm', href: '#/play/b/' + level.id }, icon('play', 16), t('挑戰這一關')))));
        const mine = h('div', {});
        let card = null;
        const board = rankPages({
          key: 'lv:' + level.id,
          onShow: () => card && card.draw(),
          fetch: (after, n) => R().levelBoard(level.id, { after: after, limit: n }),
          total: R().count(level.id),
          prepare: (rows) => R().currentNames(rows),
          empty: t('這一關還沒有人上榜。'),
          row: (r, n) => h('li', { class: 'rank-row' + (r.uid === myUid() ? ' is-me' : '') },
            rankBadge(n),
            h('span', { class: 'rank-name' }, r.name + (r.uid === myUid() ? t('（你）') : '')),
            h('span', { class: 'rank-score' }, t('{steps} 步', { steps: r.steps }), h('span', { class: 'rank-sub' }, formatTime(r.timeMs))),
            h('button', { type: 'button', class: 'text-btn rank-replay', 'aria-label': t('看 {name} 的走法', { name: r.name }), onclick: () => R().replayDialog(level.id, r) }, t('看走法'))),
        });
        current = board;
        body.append(head, mine, board.el);
        board.start();
        if (!HRD.store.account()) { mine.appendChild(signInCard(t('登入後，不用提示過這一關，成績就會列進來。'))); return; }
        try {
          const me = await R().levelRank(level.id);
          if (my !== token || !alive) return;
          card = meCard(mine, board, (x, rank) => [t('你在這一關是第 {rank} 名', { rank }), ' · ', t('{steps} 步', { steps: x.record.steps }), ' · ', formatTime(x.record.timeMs)]);
          card.set(me || { none: t('你還沒有這一關的成績。') });
        } catch (e) { /* 同上 */ }
      }

      function draw() { if (tab === 'level') drawLevel(); else drawAll(); }

      container.appendChild(h('div', { class: 'page ranking-page' },
        h('div', {},
          h('h1', { class: 'page-title' }, t('排行榜')),
          h('p', { class: 'section-sub' }, t('只計算內建關卡、沒有用提示和自動解題的成績。總排行比星星數，再比過關數；每一關比步數，步數一樣比用時。'))),
        tabs, body));
      drawTabs();
      draw();
      // 登入、登出後重新載入（自己的名次會變）
      let signed = !!HRD.store.account();
      offs.push(HRD.store.onChange(() => { const now = !!HRD.store.account(); if (now !== signed) { signed = now; draw(); } }));
      // 手機和桌機一頁的名次數不一樣
      let resizeTimer = null;
      const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (current) current.resize(); }, 150); };
      root.addEventListener('resize', onResize);
      offs.push(() => { root.removeEventListener('resize', onResize); clearTimeout(resizeTimer); });
    }

    return function unmount() { alive = false; offs.forEach((off) => off()); };
  }

  HRD.views = HRD.views || {};
  HRD.views.ranking = rankingView;
})(window);
