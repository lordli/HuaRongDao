/* 排行榜：總排行、各關排行 */
(function (root) {
  'use strict';
  const HRD = root.HRD;
  const { h, icon, formatTime } = HRD.ui;
  const R = () => HRD.ranking;

  const TABS = [{ id: 'all', name: '總排行' }, { id: 'level', name: '各關排行' }];

  function rankBadge(n) {
    return h('span', { class: 'rank-no' + (n <= 3 ? ' rank-' + n : '') }, String(n));
  }

  function rankingView(container, ctx) {
    const app = ctx.app;
    let alive = true;
    let tab = ctx.levelId ? 'level' : app.state.rankTab || 'all';
    let levelId = ctx.levelId || app.state.rankLevel || defaultLevel();
    const shell = h('div', { class: 'page' }, h('p', { class: 'empty-line', role: 'status' }, '載入中…'));
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
          h('h1', {}, '排行榜目前無法使用'),
          h('p', {}, '排行榜需要部署到 Firebase Hosting（並開啟帳號功能）才能使用。'),
          h('div', { class: 'btn-row' }, h('a', { class: 'btn btn-primary', href: '#/' }, '回到首頁')))));
        return;
      }
      build();
    });

    let offs = [];
    function build() {
      const tabs = h('div', { class: 'tabs', role: 'group', 'aria-label': '排行榜種類' });
      const body = h('div', { class: 'ranking-body' });
      let token = 0;

      function drawTabs() {
        tabs.textContent = '';
        TABS.forEach((t) => tabs.appendChild(h('button', {
          type: 'button', class: 'tab', 'aria-pressed': t.id === tab ? 'true' : 'false',
          onclick: () => { tab = t.id; app.state.rankTab = t.id; app.replace(t.id === 'level' ? '#/ranking/' + levelId : '#/ranking'); drawTabs(); draw(); },
        }, t.name)));
      }

      function status(text) { return h('p', { class: 'empty-line', role: 'status' }, text); }
      function failed(e, retry) {
        return h('p', { class: 'empty-line', role: 'status' }, '載入失敗：' + HRD.gallery.errorText(e) + ' ',
          h('button', { type: 'button', class: 'text-btn', onclick: retry }, '再試一次'));
      }

      /* 自己的成績 */
      function myCard(content) { return h('section', { class: 'rank-me', 'aria-label': '我的名次' }, icon('trophy', 22), h('div', {}, content)); }
      function signInCard(text) {
        return myCard([h('p', {}, text), h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: () => HRD.cloud.signInDialog() }, '登入')]);
      }

      async function drawAll() {
        const my = ++token;
        body.textContent = '';
        const mine = h('div', {});
        const list = h('ol', { class: 'rank-list' });
        body.append(mine, list, status('載入中…'));
        try {
          const [rows, me] = await Promise.all([R().players(R().TOP), R().me()]);
          if (my !== token || !alive) return;
          body.lastChild.remove();
          const uid = HRD.cloud.currentUser() && HRD.cloud.currentUser().uid;
          if (!HRD.store.account()) mine.appendChild(signInCard('登入後，不用提示過關的成績就會列進排行榜。'));
          else if (!me || !me.player) mine.appendChild(myCard(h('p', {}, '你還沒有上榜的成績。挑一關內建關卡，不用提示過關就會上榜！')));
          else mine.appendChild(myCard(h('p', {}, '你目前是第 ', h('strong', {}, String(me.rank)), ' 名 · ', starText(me.player.stars), ' · 過關 ' + me.player.cleared + ' 關')));
          if (!rows.length) { body.appendChild(status('排行榜還是空的，來搶第一名吧！')); return; }
          rows.forEach((p, i) => list.appendChild(h('li', { class: 'rank-row' + (p.uid === uid ? ' is-me' : '') },
            rankBadge(i + 1),
            h('span', { class: 'rank-name' }, p.name + (p.uid === uid ? '（你）' : '')),
            h('span', { class: 'rank-score' }, starText(p.stars), h('span', { class: 'rank-sub' }, '過關 ' + p.cleared + ' 關')))));
        } catch (e) {
          if (my !== token || !alive) return;
          body.lastChild.replaceWith(failed(e, drawAll));
        }
      }

      function starText(n) { return h('span', { class: 'rank-stars' }, icon('star', 15, 'star-on'), String(n)); }

      function levelSelect() {
        const sel = h('select', { id: 'rank-level', class: 'input' },
          HRD.levels.CATEGORIES.map((c) => h('optgroup', { label: c.name },
            HRD.levels.LEVELS.filter((l) => l.category === c.id).map((l) => h('option', { value: l.id }, l.name + '（最少 ' + l.minMoves + ' 步）')))));
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
          h('div', { class: 'field field-grow' }, h('label', { class: 'field-label', for: 'rank-level' }, '關卡'), levelSelect(),
            h('div', { class: 'btn-row' }, h('a', { class: 'btn btn-secondary btn-sm', href: '#/play/b/' + level.id }, icon('play', 16), '挑戰這一關'))));
        const mine = h('div', {});
        const list = h('ol', { class: 'rank-list' });
        body.append(head, mine, list, status('載入中…'));
        try {
          const [rows, me] = await Promise.all([R().levelBoard(level.id, R().LEVEL_TOP), R().levelRank(level.id)]);
          if (my !== token || !alive) return;
          body.lastChild.remove();
          const uid = HRD.cloud.currentUser() && HRD.cloud.currentUser().uid;
          if (!HRD.store.account()) mine.appendChild(signInCard('登入後，不用提示過這一關，成績就會列進來。'));
          else if (!me) mine.appendChild(myCard(h('p', {}, '你還沒有這一關的成績。')));
          else mine.appendChild(myCard(h('p', {}, '你在這一關是第 ', h('strong', {}, String(me.rank)), ' 名 · ' + me.record.steps + ' 步 · ' + formatTime(me.record.timeMs))));
          if (!rows.length) { body.appendChild(status('這一關還沒有人上榜。')); return; }
          rows.forEach((r, i) => list.appendChild(h('li', { class: 'rank-row' + (r.uid === uid ? ' is-me' : '') },
            rankBadge(i + 1),
            h('span', { class: 'rank-name' }, r.name + (r.uid === uid ? '（你）' : '')),
            h('span', { class: 'rank-score' }, r.steps + ' 步', h('span', { class: 'rank-sub' }, formatTime(r.timeMs))),
            h('button', { type: 'button', class: 'text-btn rank-replay', 'aria-label': '看 ' + r.name + ' 的走法', onclick: () => R().replayDialog(level.id, r) }, '看走法'))));
        } catch (e) {
          if (my !== token || !alive) return;
          body.lastChild.replaceWith(failed(e, drawLevel));
        }
      }

      function draw() { if (tab === 'level') drawLevel(); else drawAll(); }

      container.appendChild(h('div', { class: 'page ranking-page' },
        h('div', {},
          h('h1', { class: 'page-title' }, '排行榜'),
          h('p', { class: 'section-sub' }, '只計算內建關卡、沒有用提示和自動解題的成績。總排行比星星數，再比過關數；每一關比步數，步數一樣比用時。')),
        tabs, body));
      drawTabs();
      draw();
      // 登入、登出後重新載入（自己的名次會變）
      let signed = !!HRD.store.account();
      offs.push(HRD.store.onChange(() => { const now = !!HRD.store.account(); if (now !== signed) { signed = now; draw(); } }));
    }

    return function unmount() { alive = false; offs.forEach((off) => off()); };
  }

  HRD.views = HRD.views || {};
  HRD.views.ranking = rankingView;
})(window);
