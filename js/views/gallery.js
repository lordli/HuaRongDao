/* 關卡廣場：列表、單一關卡頁 */
(function (root) {
  'use strict';
  const t = (s, p) => root.HRD.i18n.t(s, p);
  const HRD = root.HRD;
  const E = HRD.engine;
  const { h, icon, toast, confirmDialog, formatTime } = HRD.ui;
  const G = () => HRD.gallery;

  const TABS = [
    { id: 'new', get name() { return t('最新'); } },
    { id: 'likes', get name() { return t('最多讚'); } },
    { id: 'clears', get name() { return t('最多人過關'); } },
    { id: 'mine', get name() { return t('我發佈的'); }, signedIn: true },
  ];

  /* 這個網站沒有開帳號功能（例如 Artifact 預覽、只放靜態檔的主機） */
  function unavailable(container) {
    container.appendChild(h('div', { class: 'page' },
      h('div', { class: 'empty' },
        h('h1', {}, t('關卡廣場目前無法使用')),
        h('p', {}, t('關卡廣場需要部署到 Firebase Hosting（並開啟帳號功能）才能使用。你還是可以用分享碼和朋友交換關卡。')),
        h('div', { class: 'btn-row' }, h('a', { class: 'btn btn-primary', href: '#/' }, t('回到首頁'))))));
  }

  function loadingPage(container, text) {
    const p = h('div', { class: 'page' }, h('p', { class: 'empty-line', role: 'status' }, text || t('載入中…')));
    container.appendChild(p);
    return p;
  }

  function stat(name, text) { return h('span', { class: 'gallery-stat' }, icon(name, 16), text); }

  function card(x) {
    const d = x.data;
    const pr = HRD.store.progress('p:' + x.id);
    const done = pr && pr.solved;
    const size = d.cols === 4 && d.rows === 5 ? null : h('span', { class: 'chip chip-variant' }, d.cols + ' × ' + d.rows);
    return h('a', { class: 'level-card gallery-card', href: '#/g/' + x.id },
      h('div', { class: 'thumb-wrap' }, HRD.thumb(x.level)),
      h('div', { class: 'card-row' }, h('span', { class: 'card-name' }, d.name), size),
      h('p', { class: 'card-meta' }, t('作者 {authorName}', { authorName: d.authorName })),
      h('div', { class: 'card-row' },
        HRD.app.dots(d.difficulty),
        h('span', { class: 'card-status status-' + (done ? 'done' : 'fresh') }, done ? icon('check', 16) : null, done ? t('最佳 {bestSteps} 步', { bestSteps: pr.bestSteps }) : t('最少 {minMoves} 步', { minMoves: d.minMoves }))),
      h('div', { class: 'gallery-stats' },
        stat('heart', t('{likes} 個讚', { likes: d.likes })),
        stat('users', t('{clears} 人過關', { clears: d.clears })),
        d.reports >= 3 ? h('span', { class: 'badge badge-warn' }, t('被檢舉，已隱藏')) : null));
  }

  function galleryView(container, ctx) {
    const app = ctx.app;
    let alive = true;
    const shell = loadingPage(container);

    HRD.cloud.ready().then(() => {
      if (!alive) return;
      shell.remove();
      if (!G().available()) { unavailable(container); return; }
      build();
    });

    let offs = [];
    function build() {
      let tab = app.state.galleryTab || 'new';
      let query = '';
      let src = null;
      let token = 0;
      let pageSize = 12;
      // 每個分頁（排序）看到第幾個關卡：從關卡頁回來時停在同一頁；搜尋都從第一頁開始
      const seen = app.state.gallerySeen || (app.state.gallerySeen = {});
      const key = () => tab + '|' + query;
      const grid = h('div', { class: 'level-grid gallery-grid' });
      const status = h('p', { class: 'empty-line', role: 'status', 'aria-live': 'polite' });
      const countEl = h('span', { class: 'list-count' });
      let topPager = HRD.ui.pager(0, 1, null, true), bottomPager = HRD.ui.pager(0, 1);
      const bar = h('div', { class: 'list-bar' }, countEl, topPager);
      const tabs = h('div', { class: 'tabs', role: 'group', 'aria-label': t('排序') });
      const search = h('input', { id: 'gallery-search', type: 'search', class: 'input input-search', placeholder: t('關卡名稱開頭'), autocomplete: 'off' });
      let timer = null;
      search.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          const q = search.value.trim();
          if (q === query) return;
          query = q;
          delete seen[key()];
          reset();
        }, 350);
      });

      function drawTabs() {
        tabs.textContent = '';
        const signed = !!HRD.store.account();
        if (tab === 'mine' && !signed) tab = 'new';
        TABS.filter((tt) => !tt.signedIn || signed).forEach((tt) => {
          tabs.appendChild(h('button', {
            type: 'button', class: 'tab', 'aria-pressed': tt.id === tab ? 'true' : 'false',
            onclick: () => { if (tt.id === tab) return; tab = tt.id; app.state.galleryTab = tt.id; drawTabs(); reset(); },
          }, tt.name));
        });
      }

      /* 換排序、搜尋、登入登出：重新從雲端讀 */
      function reset() {
        const sort = tab, q = query;
        const fetch = sort === 'mine'
          ? async () => { const all = await G().mine(); return { items: all.filter((x) => !q || x.data.name.startsWith(q)), next: null }; }
          : (after, n) => G().list({ sort: sort, search: q, after: after, limit: n });
        src = { list: HRD.ui.cursorList(fetch, 24), total: sort === 'mine' ? Promise.resolve(null) : G().count({ search: q }).catch(() => null) };
        grid.textContent = '';
        countEl.textContent = '';
        pagers(0, 1);
        show(Math.floor((seen[key()] || 0) / pageSize));
      }

      async function show(page, fromBottom) {
        const my = ++token;
        const cur = src;
        status.textContent = t('載入中…');
        grid.classList.add('is-loading');
        try {
          const [total] = await Promise.all([cur.total, cur.list.ensure((page + 1) * pageSize + 1)]);
          const res = await HRD.ui.cursorPage(cur.list, page, pageSize, total);
          if (my !== token || !alive) return;
          seen[key()] = res.page * pageSize;
          grid.classList.remove('is-loading');
          grid.textContent = '';
          res.rows.forEach((x) => grid.appendChild(card(x)));
          const n = cur.list.done ? cur.list.items.length : total;
          countEl.textContent = n ? t('共 {n} 個關卡', { n }) : '';
          status.textContent = res.rows.length ? ''
            : query ? t('找不到名稱以「{query}」開頭的關卡。', { query })
            : tab === 'mine' ? t('你還沒有發佈關卡。') : t('廣場上還沒有關卡，來發佈第一個吧！');
          pagers(res.page, res.pages);
          if (fromBottom) {
            // 從下面的分頁列換頁：捲回列表開頭，鍵盤焦點移到第一個關卡
            bar.scrollIntoView({ block: 'start', behavior: HRD.settings.reduceMotion() ? 'auto' : 'smooth' });
            const first = grid.querySelector('a');
            if (first) first.focus({ preventScroll: true });
          }
        } catch (e) {
          if (my !== token || !alive) return;
          grid.classList.remove('is-loading');
          status.textContent = '';
          status.append(t('載入失敗：{errorText} ', { errorText: G().errorText(e) }), h('button', { type: 'button', class: 'text-btn', onclick: () => show(page, fromBottom) }, t('再試一次')));
        }
      }

      function pagers(page, pages) {
        topPager.replaceWith(topPager = HRD.ui.pager(page, pages, (n) => show(n), true));
        bottomPager.replaceWith(bottomPager = HRD.ui.pager(page, pages, (n) => show(n, true)));
      }

      container.appendChild(h('div', { class: 'page gallery-page' },
        h('div', { class: 'section-head' },
          h('div', {},
            h('h1', { class: 'page-title' }, t('關卡廣場')),
            h('p', { class: 'section-sub' }, t('挑戰其他玩家設計的關卡，也可以把自己的關卡發佈出來。'))),
          h('div', { class: 'btn-row' },
            h('button', { type: 'button', class: 'btn btn-primary', onclick: () => G().pickDialog() }, icon('upload', 18), t('發佈我的關卡')))),
        h('div', { class: 'toolbar gallery-toolbar' },
          tabs,
          h('div', { class: 'field field-grow' },
            h('label', { class: 'field-label sr-only', for: 'gallery-search' }, t('搜尋關卡名稱')),
            h('div', { class: 'search-box' }, icon('search', 18, 'search-icon'), search))),
        bar, grid, status, bottomPager));

      pageSize = HRD.ui.gridPageSize(grid);
      drawTabs();
      reset();
      // 登入、登出後「我發佈的」分頁要出現或消失
      let signed = !!HRD.store.account();
      offs.push(HRD.store.onChange(() => {
        const now = !!HRD.store.account();
        if (now !== signed) { signed = now; drawTabs(); reset(); }
      }));
      // 視窗變寬變窄：一頁放的數量跟著格線欄數變，停在原本看的那幾個關卡
      let resizeTimer = null;
      const onResize = () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          const size = HRD.ui.gridPageSize(grid);
          if (size !== pageSize) { pageSize = size; show(Math.floor((seen[key()] || 0) / pageSize)); }
        }, 150);
      };
      root.addEventListener('resize', onResize);
      offs.push(() => { root.removeEventListener('resize', onResize); clearTimeout(resizeTimer); clearTimeout(timer); });
    }

    return function unmount() { alive = false; offs.forEach((off) => off()); };
  }

  /* ---------- 單一關卡 ---------- */
  function galleryLevelView(container, ctx) {
    const app = ctx.app;
    const id = ctx.id;
    let alive = true;
    const shell = loadingPage(container);

    HRD.cloud.ready().then(async () => {
      if (!alive) return;
      if (!G().available()) { shell.remove(); unavailable(container); return; }
      let x;
      try { x = await G().get(id); } catch (e) {
        if (!alive) return;
        shell.textContent = '';
        shell.append(h('div', { class: 'empty' }, h('h1', {}, t('載入失敗')), h('p', {}, G().errorText(e)),
          h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: () => app.go(location.hash || '#/g/' + id) }, t('再試一次')))));
        return;
      }
      if (!alive) return;
      shell.remove();
      if (!x) {
        container.appendChild(h('div', { class: 'page' }, h('div', { class: 'empty' },
          h('h1', {}, t('找不到這個關卡')), h('p', {}, t('可能已經被作者取消發佈。')),
          h('div', { class: 'btn-row' }, h('a', { class: 'btn btn-primary', href: '#/gallery' }, t('回到關卡廣場'))))));
        return;
      }
      document.title = t('{name} · 關卡廣場 · 華容道', { name: x.data.name });
      render(x);
    });

    function render(x) {
      const d = x.data, level = x.level;
      const me = HRD.cloud.currentUser();
      const mine = !!(me && me.uid === d.authorUid);
      const st = E.levelToState(level);
      const preview = new HRD.BoardView({ kind: 'preview', maxHeight: 360 });
      preview.render(st);
      const pr = HRD.store.progress('p:' + id);

      let likes = d.likes, liked = false, busy = false;
      const likeCount = h('span', {}, String(likes));
      const likeBtn = h('button', { type: 'button', class: 'btn btn-secondary like-btn', 'aria-pressed': 'false', 'aria-label': t('按讚'), onclick: toggleLike },
        icon('heart', 18), h('span', { class: 'like-word' }, t('讚')), likeCount);
      function drawLike() {
        likeBtn.setAttribute('aria-pressed', liked ? 'true' : 'false');
        likeBtn.classList.toggle('is-on', liked);
        likeCount.textContent = String(likes);
        likeBtn.firstChild.replaceWith(icon(liked ? 'heartFill' : 'heart', 18));
      }
      async function toggleLike() {
        if (busy) return;
        const u = await HRD.cloud.requireUser(t('按讚要先登入'));
        if (!u || !alive) return;
        if (!likeBtn.dataset.checked) { liked = await G().liked(id); likeBtn.dataset.checked = '1'; }
        busy = true;
        const on = !liked;
        liked = on; likes += on ? 1 : -1; drawLike();
        try { await G().setLike(id, on); }
        catch (e) { liked = !on; likes += on ? -1 : 1; drawLike(); toast(G().errorText(e)); }
        busy = false;
      }
      if (me) G().liked(id).then((v) => { if (!alive) return; liked = v; likeBtn.dataset.checked = '1'; drawLike(); }, () => {});

      const records = h('ol', { class: 'record-list' }, h('li', { class: 'muted' }, t('載入中…')));
      G().topRecords(id, 5).then((list) => {
        if (!alive) return;
        records.textContent = '';
        if (!list.length) { records.appendChild(h('li', { class: 'muted record-empty' }, t('還沒有人過關，搶第一個吧！'))); return; }
        list.forEach((r, i) => records.appendChild(h('li', { class: 'record-row' + (me && r.uid === me.uid ? ' is-me' : '') },
          h('span', { class: 'record-rank' }, String(i + 1)),
          h('span', { class: 'record-name' }, r.name + (me && r.uid === me.uid ? t('（你）') : '')),
          h('span', { class: 'record-score' }, t('{steps} 步 · {time}{text}', { steps: r.steps, time: formatTime(r.timeMs), text: r.hints ? t(' · 提示 {hints} 次', { hints: r.hints }) : '' })))));
      }, () => { if (alive) records.replaceChildren(h('li', { class: 'muted' }, t('紀錄載入失敗'))); });

      function addToMine() {
        const saved = HRD.store.saveLevel(Object.assign({}, level, {
          id: null, publicId: undefined, author: undefined, authorUid: undefined, source: undefined, shareCode: undefined,
          category: 'custom', name: HRD.store.uniqueName(level.name), solvable: true, solveStatus: 'solved',
          shape: E.shapeKey(st),
        }));
        toast(t('已加入我的關卡：「{name}」', { name: saved.name }), { label: t('查看'), run: () => app.go('#/mine') });
      }

      async function unpublish() {
        const ok = await confirmDialog(t('取消發佈「{name}」？', { name: d.name }), t('其他玩家就看不到這一關了，這一關收到的讚和過關紀錄也會一起刪除。你自己的關卡還會留在「我的關卡」。'), t('取消發佈'), true);
        if (!ok) return;
        try { await G().unpublish(id); toast(t('已取消發佈')); app.go('#/gallery'); }
        catch (e) { toast(G().errorText(e)); }
      }

      async function edit() {
        const ok = await G().editDialog(id, Object.assign({}, level, { name: d.name, description: d.description, author: d.authorName }));
        if (ok) { toast(t('已更新')); app.go('#/g/' + id); }
      }

      const sizeText = st.cols + ' × ' + st.rows + (E.isStandard(st) ? '' : t(' · 出口在{exitText}', { exitText: E.exitText(st) }));
      container.appendChild(h('div', { class: 'page gallery-level-page' },
        h('nav', { class: 'crumbs', 'aria-label': t('目前位置') },
          h('a', { href: '#/gallery' }, t('關卡廣場')), h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'crumb-here' }, d.name)),
        h('div', { class: 'gallery-detail' },
          h('div', { class: 'gallery-preview' }, preview.el, HRD.exitLabel(st)),
          h('div', { class: 'gallery-info' },
            h('div', { class: 'chips' }, h('span', { class: 'chip chip-public' }, t('廣場')), HRD.app.dots(d.difficulty)),
            h('h1', { class: 'play-title' }, d.name),
            h('p', { class: 'gallery-author' }, t('作者 '), h('strong', {}, d.authorName), mine ? t('（你）') : '',
              G().millis(d.createdAt) ? t(' · {date} 發佈', { date: new Date(G().millis(d.createdAt)).toLocaleDateString(HRD.i18n.dateLocale()) }) : ''),
            d.description ? h('p', { class: 'play-desc' }, d.description) : null,
            d.reports >= 3 ? h('p', { class: 'notice notice-warn' }, icon('alert', 18), t('這一關被多位玩家檢舉，暫時不會出現在列表裡。')) : null,
            h('dl', { class: 'tiles tiles-3' },
              h('div', { class: 'tile' }, h('dt', {}, t('最少步數')), h('dd', {}, t('{minMoves} 步', { minMoves: d.minMoves }))),
              h('div', { class: 'tile' }, h('dt', {}, t('過關人數')), h('dd', {}, t('{clears} 人', { clears: d.clears }))),
              h('div', { class: 'tile' }, h('dt', {}, t('你的最佳')), h('dd', {}, pr && pr.solved ? t('{bestSteps} 步', { bestSteps: pr.bestSteps }) : '—'))),
            h('p', { class: 'muted gallery-size' }, t('盤面 {sizeText} · {n} 顆棋子', { sizeText, n: st.pieces.length })),
            h('div', { class: 'btn-row' },
              h('a', { class: 'btn btn-primary', href: '#/play/p/' + id }, icon('play', 18), pr && pr.solved ? t('再挑戰一次') : t('開始挑戰')),
              likeBtn,
              h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => HRD.io.shareDialog(level) }, icon('share', 18), t('分享'))),
            h('section', { class: 'gallery-records', 'aria-labelledby': 'records-title' },
              h('h2', { class: 'card-title', id: 'records-title' }, icon('trophy', 18), t('最佳紀錄')),
              records),
            h('div', { class: 'gallery-more-actions' },
              h('button', { type: 'button', class: 'text-btn', onclick: addToMine }, t('加入我的關卡（可以改編）')),
              mine ? h('button', { type: 'button', class: 'text-btn', onclick: edit }, t('編輯名稱與說明')) : null,
              mine ? h('button', { type: 'button', class: 'text-btn text-danger', onclick: unpublish }, t('取消發佈'))
                : h('button', { type: 'button', class: 'text-btn text-muted', onclick: () => G().reportDialog(id) }, t('檢舉')))))));
    }

    return function unmount() { alive = false; };
  }

  HRD.views = HRD.views || {};
  HRD.views.gallery = galleryView;
  HRD.views.galleryLevel = galleryLevelView;
})(window);
