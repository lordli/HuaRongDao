/* 關卡廣場：列表、單一關卡頁 */
(function (root) {
  'use strict';
  const HRD = root.HRD;
  const E = HRD.engine;
  const { h, icon, toast, confirmDialog, formatTime } = HRD.ui;
  const G = () => HRD.gallery;

  const TABS = [
    { id: 'new', name: '最新' },
    { id: 'likes', name: '最多讚' },
    { id: 'clears', name: '最多人過關' },
    { id: 'mine', name: '我發佈的', signedIn: true },
  ];

  /* 這個網站沒有開帳號功能（例如 Artifact 預覽、只放靜態檔的主機） */
  function unavailable(container) {
    container.appendChild(h('div', { class: 'page' },
      h('div', { class: 'empty' },
        h('h1', {}, '關卡廣場目前無法使用'),
        h('p', {}, '關卡廣場需要部署到 Firebase Hosting（並開啟帳號功能）才能使用。你還是可以用分享碼和朋友交換關卡。'),
        h('div', { class: 'btn-row' }, h('a', { class: 'btn btn-primary', href: '#/' }, '回到首頁')))));
  }

  function loadingPage(container, text) {
    const p = h('div', { class: 'page' }, h('p', { class: 'empty-line', role: 'status' }, text || '載入中…'));
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
      h('p', { class: 'card-meta' }, '作者 ' + d.authorName),
      h('div', { class: 'card-row' },
        HRD.app.dots(d.difficulty),
        h('span', { class: 'card-status status-' + (done ? 'done' : 'fresh') }, done ? icon('check', 16) : null, done ? '最佳 ' + pr.bestSteps + ' 步' : '最少 ' + d.minMoves + ' 步')),
      h('div', { class: 'gallery-stats' },
        stat('heart', d.likes + ' 個讚'),
        stat('users', d.clears + ' 人過關'),
        d.reports >= 3 ? h('span', { class: 'badge badge-warn' }, '被檢舉，已隱藏') : null));
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
      let next = null;
      let token = 0;
      const grid = h('div', { class: 'level-grid gallery-grid' });
      const status = h('p', { class: 'empty-line', role: 'status', 'aria-live': 'polite' });
      const more = h('button', { type: 'button', class: 'btn btn-secondary', hidden: true, onclick: () => load(true) }, '載入更多');
      const tabs = h('div', { class: 'tabs', role: 'group', 'aria-label': '排序' });
      const search = h('input', { id: 'gallery-search', type: 'search', class: 'input input-search', placeholder: '關卡名稱開頭', autocomplete: 'off' });
      let timer = null;
      search.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => { query = search.value.trim(); load(false); }, 350);
      });

      function drawTabs() {
        tabs.textContent = '';
        const signed = !!HRD.store.account();
        if (tab === 'mine' && !signed) tab = 'new';
        TABS.filter((t) => !t.signedIn || signed).forEach((t) => {
          tabs.appendChild(h('button', {
            type: 'button', class: 'tab', 'aria-pressed': t.id === tab ? 'true' : 'false',
            onclick: () => { tab = t.id; app.state.galleryTab = t.id; drawTabs(); load(false); },
          }, t.name));
        });
      }

      async function load(append) {
        const my = ++token;
        if (!append) { grid.textContent = ''; next = null; more.hidden = true; }
        status.textContent = '載入中…';
        more.disabled = true;
        try {
          let res;
          if (tab === 'mine') {
            const all = await G().mine();
            res = { items: all.filter((x) => !query || x.data.name.startsWith(query)), next: null };
          } else {
            res = await G().list({ sort: tab, search: query, after: append ? next : null });
          }
          if (my !== token || !alive) return;
          res.items.forEach((x) => grid.appendChild(card(x)));
          next = res.next;
          more.hidden = !next;
          more.disabled = false;
          status.textContent = grid.children.length ? ''
            : query ? '找不到名稱以「' + query + '」開頭的關卡。'
            : tab === 'mine' ? '你還沒有發佈關卡。' : '廣場上還沒有關卡，來發佈第一個吧！';
        } catch (e) {
          if (my !== token || !alive) return;
          status.textContent = '';
          status.append('載入失敗：' + G().errorText(e) + ' ', h('button', { type: 'button', class: 'text-btn', onclick: () => load(append) }, '再試一次'));
        }
      }

      container.appendChild(h('div', { class: 'page gallery-page' },
        h('div', { class: 'section-head' },
          h('div', {},
            h('h1', { class: 'page-title' }, '關卡廣場'),
            h('p', { class: 'section-sub' }, '挑戰其他玩家設計的關卡，也可以把自己的關卡發佈出來。')),
          h('div', { class: 'btn-row' },
            h('button', { type: 'button', class: 'btn btn-primary', onclick: () => G().pickDialog() }, icon('upload', 18), '發佈我的關卡'))),
        h('div', { class: 'toolbar gallery-toolbar' },
          tabs,
          h('div', { class: 'field field-grow' },
            h('label', { class: 'field-label sr-only', for: 'gallery-search' }, '搜尋關卡名稱'),
            h('div', { class: 'search-box' }, icon('search', 18, 'search-icon'), search))),
        grid, status, h('div', { class: 'btn-row gallery-more' }, more)));

      drawTabs();
      load(false);
      // 登入、登出後「我發佈的」分頁要出現或消失
      let signed = !!HRD.store.account();
      offs.push(HRD.store.onChange(() => {
        const now = !!HRD.store.account();
        if (now !== signed) { signed = now; drawTabs(); if (tab === 'mine' || !now) load(false); }
      }));
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
        shell.append(h('div', { class: 'empty' }, h('h1', {}, '載入失敗'), h('p', {}, G().errorText(e)),
          h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: () => app.go(location.hash || '#/g/' + id) }, '再試一次'))));
        return;
      }
      if (!alive) return;
      shell.remove();
      if (!x) {
        container.appendChild(h('div', { class: 'page' }, h('div', { class: 'empty' },
          h('h1', {}, '找不到這個關卡'), h('p', {}, '可能已經被作者取消發佈。'),
          h('div', { class: 'btn-row' }, h('a', { class: 'btn btn-primary', href: '#/gallery' }, '回到關卡廣場')))));
        return;
      }
      document.title = x.data.name + ' · 關卡廣場 · 華容道';
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
      const likeBtn = h('button', { type: 'button', class: 'btn btn-secondary like-btn', 'aria-pressed': 'false', 'aria-label': '按讚', onclick: toggleLike },
        icon('heart', 18), h('span', { class: 'like-word' }, '讚'), likeCount);
      function drawLike() {
        likeBtn.setAttribute('aria-pressed', liked ? 'true' : 'false');
        likeBtn.classList.toggle('is-on', liked);
        likeCount.textContent = String(likes);
        likeBtn.firstChild.replaceWith(icon(liked ? 'heartFill' : 'heart', 18));
      }
      async function toggleLike() {
        if (busy) return;
        const u = await HRD.cloud.requireUser('按讚要先登入');
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

      const records = h('ol', { class: 'record-list' }, h('li', { class: 'muted' }, '載入中…'));
      G().topRecords(id, 5).then((list) => {
        if (!alive) return;
        records.textContent = '';
        if (!list.length) { records.appendChild(h('li', { class: 'muted record-empty' }, '還沒有人過關，搶第一個吧！')); return; }
        list.forEach((r, i) => records.appendChild(h('li', { class: 'record-row' + (me && r.uid === me.uid ? ' is-me' : '') },
          h('span', { class: 'record-rank' }, String(i + 1)),
          h('span', { class: 'record-name' }, r.name + (me && r.uid === me.uid ? '（你）' : '')),
          h('span', { class: 'record-score' }, r.steps + ' 步 · ' + formatTime(r.timeMs) + (r.hints ? ' · 提示 ' + r.hints + ' 次' : '')))));
      }, () => { if (alive) records.replaceChildren(h('li', { class: 'muted' }, '紀錄載入失敗')); });

      function addToMine() {
        const saved = HRD.store.saveLevel(Object.assign({}, level, {
          id: null, publicId: undefined, author: undefined, authorUid: undefined, source: undefined, shareCode: undefined,
          category: 'custom', name: HRD.store.uniqueName(level.name), solvable: true, solveStatus: 'solved',
          shape: E.shapeKey(st),
        }));
        toast('已加入我的關卡：「' + saved.name + '」', { label: '查看', run: () => app.go('#/mine') });
      }

      async function unpublish() {
        const ok = await confirmDialog('取消發佈「' + d.name + '」？', '其他玩家就看不到這一關了，這一關收到的讚和過關紀錄也會一起刪除。你自己的關卡還會留在「我的關卡」。', '取消發佈', true);
        if (!ok) return;
        try { await G().unpublish(id); toast('已取消發佈'); app.go('#/gallery'); }
        catch (e) { toast(G().errorText(e)); }
      }

      async function edit() {
        const ok = await G().editDialog(id, Object.assign({}, level, { name: d.name, description: d.description, author: d.authorName }));
        if (ok) { toast('已更新'); app.go('#/g/' + id); }
      }

      const sizeText = st.cols + ' × ' + st.rows + (E.isStandard(st) ? '' : ' · 出口在' + E.exitText(st));
      container.appendChild(h('div', { class: 'page gallery-level-page' },
        h('nav', { class: 'crumbs', 'aria-label': '目前位置' },
          h('a', { href: '#/gallery' }, '關卡廣場'), h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'crumb-here' }, d.name)),
        h('div', { class: 'gallery-detail' },
          h('div', { class: 'gallery-preview' }, preview.el, HRD.exitLabel(st)),
          h('div', { class: 'gallery-info' },
            h('div', { class: 'chips' }, h('span', { class: 'chip chip-public' }, '廣場'), HRD.app.dots(d.difficulty)),
            h('h1', { class: 'play-title' }, d.name),
            h('p', { class: 'gallery-author' }, '作者 ', h('strong', {}, d.authorName), mine ? '（你）' : '',
              G().millis(d.createdAt) ? ' · ' + new Date(G().millis(d.createdAt)).toLocaleDateString('zh-TW') + ' 發佈' : ''),
            d.description ? h('p', { class: 'play-desc' }, d.description) : null,
            d.reports >= 3 ? h('p', { class: 'notice notice-warn' }, icon('alert', 18), '這一關被多位玩家檢舉，暫時不會出現在列表裡。') : null,
            h('dl', { class: 'tiles tiles-3' },
              h('div', { class: 'tile' }, h('dt', {}, '最少步數'), h('dd', {}, d.minMoves + ' 步')),
              h('div', { class: 'tile' }, h('dt', {}, '過關人數'), h('dd', {}, d.clears + ' 人')),
              h('div', { class: 'tile' }, h('dt', {}, '你的最佳'), h('dd', {}, pr && pr.solved ? pr.bestSteps + ' 步' : '—'))),
            h('p', { class: 'muted gallery-size' }, '盤面 ' + sizeText + ' · ' + st.pieces.length + ' 顆棋子'),
            h('div', { class: 'btn-row' },
              h('a', { class: 'btn btn-primary', href: '#/play/p/' + id }, icon('play', 18), pr && pr.solved ? '再挑戰一次' : '開始挑戰'),
              likeBtn,
              h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => HRD.io.shareDialog(level) }, icon('share', 18), '分享')),
            h('section', { class: 'gallery-records', 'aria-labelledby': 'records-title' },
              h('h2', { class: 'card-title', id: 'records-title' }, icon('trophy', 18), '最佳紀錄'),
              records),
            h('div', { class: 'gallery-more-actions' },
              h('button', { type: 'button', class: 'text-btn', onclick: addToMine }, '加入我的關卡（可以改編）'),
              mine ? h('button', { type: 'button', class: 'text-btn', onclick: edit }, '編輯名稱與說明') : null,
              mine ? h('button', { type: 'button', class: 'text-btn text-danger', onclick: unpublish }, '取消發佈')
                : h('button', { type: 'button', class: 'text-btn text-muted', onclick: () => G().reportDialog(id) }, '檢舉'))))));
    }

    return function unmount() { alive = false; };
  }

  HRD.views = HRD.views || {};
  HRD.views.gallery = galleryView;
  HRD.views.galleryLevel = galleryLevelView;
})(window);
