/* 打開分享連結（#/s/分享碼）時看到的頁面：先預覽，再決定要玩還是收進我的關卡。 */
(function (root) {
  'use strict';
  const t = (s, p) => root.HRD.i18n.t(s, p);
  const HRD = root.HRD;
  const E = HRD.engine;
  const { h, icon, toast, copyText } = HRD.ui;

  /* 我的關卡裡是不是已經有同一個分享碼的關卡 */
  function findSaved(code, name) {
    return HRD.store.customLevels().find((l) => {
      try { return HRD.share.encode(Object.assign({}, l, { name: name })) === code; } catch (e) { return false; }
    }) || null;
  }

  function sharedView(container, ctx) {
    const app = ctx.app;
    let level;
    try { level = HRD.share.decode(ctx.code); }
    catch (err) { return broken(container, err.message); }
    const code = level.shareCode;
    const st = E.levelToState(level);
    const v = E.validate(st);

    const solveLine = h('p', { class: 'shared-solve', 'aria-live': 'polite' }, icon('clock', 18), t('正在計算最少步數…'));
    const actions = h('div', { class: 'btn-row' });
    let token = { aborted: false };

    function drawActions() {
      actions.textContent = '';
      actions.appendChild(h('a', { class: 'btn btn-primary', href: '#/play/s/' + code + (ctx.challenge ? '/' + HRD.share.scoreToken(ctx.challenge) : '') }, icon('play', 18), t('開始挑戰')));
      const saved = findSaved(code, level.name);
      if (saved) {
        actions.appendChild(h('a', { class: 'btn btn-secondary', href: '#/play/c/' + saved.id }, icon('check', 18), t('已在我的關卡')));
      } else {
        actions.appendChild(h('button', { type: 'button', class: 'btn btn-secondary', onclick: addToMine }, icon('plus', 18), t('加入我的關卡')));
      }
    }

    function addToMine() {
      const saved = HRD.store.saveLevel(Object.assign({}, level, {
        id: null, name: HRD.store.uniqueName(level.name), category: 'custom',
        shape: E.shapeKey(st), solvable: level.solvable, minMoves: level.minMoves, solveStatus: level.solveStatus || null,
      }));
      toast(t('已加入「{name}」', { name: saved.name }), { label: t('打開我的關卡'), run: () => app.go('#/mine') });
      if (saved.solvable == null) HRD.io.verifyPending();
      drawActions();
    }

    container.appendChild(h('div', { class: 'page shared-page' },
      h('nav', { class: 'crumbs', 'aria-label': t('目前位置') }, h('a', { href: '#/' }, t('關卡')), h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'crumb-here' }, t('朋友分享的關卡'))),
      h('section', { class: 'shared-card' },
        h('div', { class: 'shared-board' }, HRD.thumb(level, st, 280)),
        h('div', { class: 'shared-body' },
          h('span', { class: 'eyebrow' }, t('朋友分享的關卡')),
          h('h1', { class: 'lead-title' }, level.name),
          ctx.challenge ? h('p', { class: 'challenge-note' }, icon('flag', 18), t('朋友用 {steps} 步、{time} 過關，換你挑戰！', { steps: ctx.challenge.steps, time: HRD.ui.formatTime(ctx.challenge.timeMs) })) : null,
          h('p', { class: 'lead-meta' }, t('{n} 顆棋子 · 空格 {empties} 格', { n: st.pieces.length, empties: v.empties })),
          solveLine,
          actions,
          h('details', { class: 'shared-code' },
            h('summary', {}, t('分享碼')),
            h('div', { class: 'copy-row' },
              h('code', { class: 'code-inline' }, code),
              h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => copyText(code) }, icon('copy', 16), t('複製'))))))));

    drawActions();
    E.solveAsync(st, { signal: token, maxStates: 600000 }).then((r) => {
      if (token.aborted) return;
      solveLine.textContent = '';
      if (r.status === 'solved') {
        level.solvable = true; level.minMoves = r.minMoves; level.solveStatus = 'solved';
        if (!level.difficultySet) level.difficulty = E.difficultyFor(r.minMoves);
        solveLine.append(icon('ok', 18), t('可以過關 · 最少 {minMoves} 步', { minMoves: r.minMoves }), HRD.app.dots(level.difficulty));
      } else if (r.status === 'unsolvable') {
        level.solvable = false; level.solveStatus = 'unsolvable';
        solveLine.classList.add('is-bad');
        solveLine.append(icon('bad', 18), t('這一關無解：曹操怎麼走都到不了出口'));
      } else {
        solveLine.append(icon('alert', 18), t('盤面變化太多，算不出最少步數'));
      }
    });

    return function unmount() { token.aborted = true; };
  }

  /* 分享碼壞掉時：說明原因，並讓使用者重新貼上 */
  function broken(container, message) {
    const input = h('textarea', { id: 'shared-paste', class: 'code-area', rows: 3, spellcheck: 'false', placeholder: 'HRD1-…' });
    const error = h('p', { class: 'field-error', 'aria-live': 'polite' });
    const open = () => {
      const codes = HRD.share.find(input.value);
      if (!codes.length) { error.textContent = t('找不到分享碼。分享碼是以「HRD1-」開頭的一串文字。'); return; }
      HRD.app.go('#/s/' + codes[0]);
    };
    container.appendChild(h('div', { class: 'page shared-page' },
      h('section', { class: 'empty' },
        h('h1', {}, t('這個分享碼打不開')),
        h('p', {}, message),
        h('div', { class: 'field shared-retry' },
          h('label', { class: 'field-label', for: 'shared-paste' }, t('重新貼上分享碼或分享連結')),
          input, error),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn btn-primary', onclick: open }, t('打開關卡')),
          h('a', { class: 'btn btn-secondary', href: '#/' }, t('回到首頁'))))));
    return null;
  }

  HRD.views = HRD.views || {};
  HRD.views.shared = sharedView;
})(window);
