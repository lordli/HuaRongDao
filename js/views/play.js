/* 遊戲畫面 */
(function (root) {
  'use strict';
  const HRD = root.HRD;
  const E = HRD.engine;
  const { h, icon, toast, dialog, confirmDialog, formatTime } = HRD.ui;

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function playView(container, ctx) {
    const { app, key, level, kind } = ctx;
    const startState = E.levelToState(level);
    const progress = key ? HRD.store.progress(key) : null;

    let st = startState;
    let hist = [], fut = [];
    let elapsed = 0, runningSince = null, pausedByHide = false;
    let won = false, autoUsed = false, hintsUsed = 0;
    let sel = null, hint = null;
    let playing = false, playToken = 0;
    let busy = null;
    let restored = false;
    let saveTimer = null;
    let drag = null, suppressClick = false;
    const cache = new Map();

    const saved = key ? HRD.store.savedGame(key) : null;
    const startShape = E.shapeKey(startState);
    if (saved && Array.isArray(saved.pos) && saved.pos.length === st.pieces.length && (!saved.start || saved.start === startShape || saved.start === startShape.replace(/@\w+:/, ':'))) {
      let s2 = st;
      saved.pos.forEach((xy, i) => { s2 = E.withPiece(s2, i, xy[0], xy[1]); });
      if (E.validate(s2).ok && !E.isWon(s2)) {
        st = s2;
        hist = Array.isArray(saved.hist) ? saved.hist.filter((s) => s && Number.isInteger(s.i)) : [];
        elapsed = saved.elapsed || 0;
        hintsUsed = Number.isInteger(saved.hints) ? saved.hints : 0;
        restored = hist.length > 0;
      }
    }

    /* ---------- 畫面 ---------- */
    const board = new HRD.BoardView({ kind: 'play' });
    const els = {};
    const cat = HRD.levels.CATEGORIES.find((c) => c.id === level.category);

    const crumbs = kind === 'draft'
      ? h('div', { class: 'draft-bar' },
          h('span', { class: 'draft-text' }, icon('edit', 18), '試玩中：這一關還沒儲存'),
          h('a', { class: 'btn btn-secondary btn-sm', href: '#/edit/' + (ctx.editId || 'new') }, icon('back', 18), '回到編輯器'))
      : h('nav', { class: 'crumbs', 'aria-label': '目前位置' },
          kind === 'builtin'
            ? [h('a', { href: '#/' }, '關卡'), h('span', { 'aria-hidden': 'true' }, '/'), h('span', {}, cat ? cat.name : '')]
            : kind === 'shared' ? [h('a', { href: '#/s/' + ctx.code }, '朋友分享的關卡')]
            : kind === 'public' ? [h('a', { href: '#/gallery' }, '關卡廣場')]
            : [h('a', { href: '#/mine' }, '我的關卡')],
          h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'crumb-here' }, level.name));

    els.bestText = h('span', {});
    els.bestShare = h('button', { type: 'button', class: 'tile-share', hidden: true, onclick: () => shareBest() }, icon('share', 14), '分享');
    els.best = h('dd', { class: 'tile-best' }, els.bestText, els.bestShare);
    const challenge = ctx.challenge || null;
    const info = h('section', { class: 'play-info', 'aria-label': '關卡資訊' },
      h('div', { class: 'chips' },
        h('span', { class: 'chip chip-' + (level.category || 'custom') }, cat ? cat.name : kind === 'draft' ? '試玩' : kind === 'shared' ? '分享' : kind === 'public' ? '廣場' : '自訂'),
        els.dots = HRD.app.dots(level.difficulty || E.difficultyFor(level.minMoves)),
        h('span', { class: 'chips-end' },
          els.soundBtn = h('button', { type: 'button', class: 'icon-btn toggle-btn', onclick: () => toggleSetting('sound') }),
          HRD.fx.canVibrate() ? (els.hapticBtn = h('button', { type: 'button', class: 'icon-btn toggle-btn', onclick: () => toggleSetting('haptics') })) : null,
          h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => HRD.io.shareDialog(level) }, icon('share', 16), '分享'))),
      h('h1', { class: 'play-title' }, level.name),
      kind === 'public' && level.author ? h('p', { class: 'gallery-author' }, '作者 ', h('a', { href: '#/g/' + ctx.publicId }, level.author)) : null,
      challenge ? h('p', { class: 'challenge-note' }, icon('flag', 18), '挑戰朋友的成績：' + challenge.steps + ' 步 · ' + formatTime(challenge.timeMs)) : null,
      level.description ? h('p', { class: 'play-desc' }, level.description) : null,
      h('dl', { class: 'tiles' },
        h('div', { class: 'tile' }, h('dt', {}, '最少步數'), els.min = h('dd', {}, level.minMoves != null ? level.minMoves + ' 步' : kind === 'shared' ? '計算中…' : '—')),
        h('div', { class: 'tile' }, h('dt', {}, '你的最佳'), els.best)),
      h('div', { class: 'goal-note' }, icon('flag', 20), h('p', {}, h('strong', {}, '目標：'), '把曹操移到' + E.exitText(startState) + '的出口。')),
      h('details', { class: 'howto', open: true },
        h('summary', {}, '怎麼玩'),
        h('ul', {},
          h('li', {}, '拖曳或滑動棋子；只能往一個方向走的棋子，點一下就會移動'),
          h('li', {}, '能走多個方向時，點出現的黃色箭頭'),
          h('li', {}, '鍵盤：Tab 選棋子，方向鍵移動'),
          h('li', {}, '同一顆棋子連續移動只算 1 步'),
          h('li', {}, '用了提示：1–2 次最多 2 星，3 次以上最多 1 星'))));

    els.status = h('p', { class: 'play-status', 'aria-live': 'polite' });
    const stage = h('section', { class: 'play-stage', 'aria-label': '棋盤' },
      h('p', { class: 'stage-stats', 'aria-hidden': 'true' },
        h('span', {}, '步數 ', els.mSteps = h('strong', {})),
        h('span', {}, '時間 ', els.mTime = h('strong', {})),
        level.minMoves != null || kind === 'shared' ? h('span', {}, '最少 ', els.mMin = h('strong', {})) : null),
      h('div', { class: 'board-wrap' }, board.el),
      HRD.exitLabel(startState),
      els.status);

    els.steps = h('span', { class: 'stat-value' });
    els.time = h('span', { class: 'stat-value' });
    const btn = (name, label, onClick, cls) => h('button', { type: 'button', class: 'btn ' + (cls || 'btn-tool'), onclick: onClick }, icon(name, 20), h('span', {}, label));
    els.undo = btn('undo', '復原', () => undo());
    els.redo = btn('redo', '重做', () => redo());
    els.reset = btn('restart', '重新開始', () => restart());
    els.hint = btn('hint', '提示', () => doHint(), 'btn-outline');
    els.hintCount = h('span', { class: 'hint-count', 'aria-hidden': 'true', hidden: true });
    els.hint.appendChild(els.hintCount);
    els.autoIcon = h('span', { class: 'auto-icon' });
    els.autoLabel = h('span', {});
    els.auto = h('button', { type: 'button', class: 'btn btn-indigo', onclick: () => toggleAuto() }, els.autoIcon, els.autoLabel);

    const dpadBtn = (dx, dy, label, rot, area) => {
      const b = h('button', { type: 'button', class: 'dpad-btn', style: { gridArea: area }, 'aria-label': label, onclick: () => { if (sel != null && userCanMove()) move(sel, dx, dy); } }, icon('arrow', 22));
      b.firstChild.style.transform = 'rotate(' + rot + 'deg)';
      return b;
    };
    els.dUp = dpadBtn(0, -1, '往上移', 0, 'u');
    els.dLeft = dpadBtn(-1, 0, '往左移', 270, 'l');
    els.dRight = dpadBtn(1, 0, '往右移', 90, 'r');
    els.dDown = dpadBtn(0, 1, '往下移', 180, 'd');
    els.selName = h('strong', {});

    const controls = h('section', { class: 'play-controls', 'aria-label': '控制' },
      h('div', { class: 'stats' },
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, '步數'), els.steps),
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, '時間'), els.time)),
      h('div', { class: 'tool-row' }, els.undo, els.redo, els.reset),
      h('div', { class: 'tool-row tool-row-2' }, els.hint, els.auto),
      h('div', { class: 'dpad-card' },
        h('div', { class: 'dpad-head' }, h('h2', {}, '方向鍵'), h('span', {}, '已選取：', els.selName)),
        h('div', { class: 'dpad' }, els.dUp, els.dLeft, h('span', { class: 'dpad-mid', style: { gridArea: 'm' } }), els.dRight, els.dDown)));

    container.appendChild(h('div', { class: 'page play-page' }, crumbs, h('div', { class: 'play-layout' }, info, stage, controls)));

    /* ---------- 狀態 ---------- */
    const now = () => Date.now();
    const timeMs = () => elapsed + (runningSince != null ? now() - runningSince : 0);
    const userCanMove = () => !playing && !won && !busy;
    const posKey = (s) => s.pieces.map((p) => p.x + ',' + p.y).join(';');

    function startClock() { if (runningSince == null && !won) runningSince = now(); }
    function stopClock() { if (runningSince != null) { elapsed += now() - runningSince; runningSince = null; } }

    function persist(immediate) {
      if (!key) return;
      clearTimeout(saveTimer);
      const write = () => {
        if (won) return;
        if (!hist.length && !hintsUsed) { if (HRD.store.savedGame(key)) HRD.store.clearGame(key); return; }
        HRD.store.saveGame(key, { start: startShape, pos: st.pieces.map((p) => [p.x, p.y]), hist: hist, elapsed: timeMs(), hints: hintsUsed });
      };
      if (immediate) write(); else saveTimer = setTimeout(write, 500);
    }

    function move(i, dx, dy) {
      if (won) return false;
      const occ = E.occupancy(st);
      if (!E.canStep(st, occ, i, dx, dy)) return false;
      const p = st.pieces[i];
      const nx = p.x + dx, ny = p.y + dy;
      st = E.withPiece(st, i, nx, ny);
      const last = hist[hist.length - 1];
      if (last && last.i === i) {
        last.tx = nx; last.ty = ny;
        if (last.tx === last.fx && last.ty === last.fy) hist.pop();
      } else {
        hist.push({ i: i, fx: p.x, fy: p.y, tx: nx, ty: ny });
      }
      fut = [];
      startClock();
      if (hint) {
        if (hint.piece !== i) hint = null;
        else if (nx === hint.x && ny === hint.y) hint = null;
        else if (!E.pathTo(st, i, hint.x, hint.y)) hint = null;
      }
      sel = i;
      HRD.fx.move(p.type);
      afterChange();
      return true;
    }

    function toggleSetting(name) {
      const on = HRD.store.setting(name) !== false;
      HRD.store.setSetting(name, !on);
      if (!on) { HRD.fx.unlock(); if (name === 'sound') HRD.fx.select(); }
      toast(name === 'sound' ? (on ? '已關閉音效' : '已開啟音效') : (on ? '已關閉震動' : '已開啟震動'));
      render();
    }

    function afterChange() {
      if (!won && E.isWon(st)) {
        won = true;
        stopClock();
        sel = null; hint = null;
        render();
        finish();
        return;
      }
      persist(false);
      render();
    }

    function undo() {
      if (playing || busy || !hist.length) return;
      const s = hist.pop();
      st = E.withPiece(st, s.i, s.fx, s.fy);
      fut.push(s);
      HRD.fx.undo();
      won = false; hint = null; sel = s.i;
      persist(false);
      render();
    }

    function redo() {
      if (playing || busy || !fut.length) return;
      const s = fut.pop();
      st = E.withPiece(st, s.i, s.tx, s.ty);
      hist.push(s);
      HRD.fx.undo();
      hint = null; sel = s.i;
      startClock();
      afterChange();
    }

    async function restart() {
      if (busy) return;
      if (hist.length && !won) {
        const ok = await confirmDialog('重新開始？', '目前已走 ' + hist.length + ' 步，重新開始後這局的進度會清除。', '重新開始', true);
        if (!ok) return;
      }
      stopAuto();
      st = startState; hist = []; fut = [];
      elapsed = 0; runningSince = null;
      won = false; autoUsed = false; hintsUsed = 0;
      sel = null; hint = null; restored = false;
      if (key) HRD.store.clearGame(key);
      render();
    }

    function tap(i) {
      if (!userCanMove()) return;
      const dirs = E.openDirs(st, i);
      if (dirs.length === 1 && HRD.settings.get('tapMove')) { move(i, dirs[0].dx, dirs[0].dy); return; }
      if (dirs.length === 0) HRD.fx.blocked(); else HRD.fx.select();
      sel = i;
      if (hint && hint.piece !== i) hint = null;
      render();
    }

    /* ---------- 解題 ---------- */
    async function solveCurrent() {
      const k = posKey(st);
      if (cache.has(k)) return cache.get(k);
      const token = { aborted: false };
      busy = token;
      render();
      let res;
      try {
        res = await E.solveAsync(st, { signal: token, maxStates: 400000 });
      } finally {
        if (busy === token) busy = null;
      }
      if (token.aborted || res.status === 'cancelled') { render(); return null; }
      if (posKey(st) !== k) { render(); return null; }
      cache.set(k, res);
      if (res.status === 'solved') {
        let s2 = st;
        res.steps.forEach((step, n) => {
          s2 = E.withPiece(s2, step.piece, step.x, step.y);
          cache.set(posKey(s2), { status: 'solved', minMoves: res.steps.length - n - 1, steps: res.steps.slice(n + 1) });
        });
      }
      render();
      return res;
    }

    function explain(res) {
      if (res.status === 'unsolvable') return '從目前的盤面已經走不到出口，按「重新開始」再試一次。';
      if (res.status === 'too-big') return '這個盤面變化太多，提示算不出來。';
      return '目前沒辦法提供提示。';
    }

    async function doHint() {
      if (!userCanMove()) return;
      if (hint) {
        HRD.fx.select();
        const b0 = board.pieceButton(hint.piece);
        if (b0) b0.focus({ preventScroll: true });
        return;
      }
      const res = await solveCurrent();
      if (!res) return;
      if (res.status !== 'solved' || !res.steps.length) { toast(explain(res)); return; }
      const step = res.steps[0];
      hint = { piece: step.piece, x: step.x, y: step.y };
      sel = step.piece;
      hintsUsed++;
      persist(false);
      HRD.fx.hint();
      if (hintsUsed === 1 || hintsUsed === 3) toast('用了 ' + hintsUsed + ' 次提示，這局最多 ' + E.hintCap(hintsUsed) + ' 星');
      render();
      const b = board.pieceButton(step.piece);
      if (b) b.focus({ preventScroll: true });
    }

    async function toggleAuto() {
      if (playing) { stopAuto(); render(); return; }
      if (won || busy) return;
      const res = await solveCurrent();
      if (!res) return;
      if (res.status !== 'solved') { toast(explain(res)); return; }
      playing = true; autoUsed = true; sel = null; hint = null;
      const token = ++playToken;
      render();
      for (const step of res.steps) {
        const path = E.pathTo(st, step.piece, step.x, step.y);
        if (!path) break;
        for (const d of path) {
          await wait(HRD.settings.autoDelay());
          if (token !== playToken) return;
          move(step.piece, d[0], d[1]);
        }
        await wait(HRD.settings.autoDelay());
        if (token !== playToken) return;
      }
      if (token === playToken) { playing = false; render(); }
    }

    function stopAuto() { playToken++; playing = false; }

    /* ---------- 過關 ---------- */
    function finish() {
      HRD.fx.win();
      const steps = hist.length;
      const ms = elapsed;
      const stars = E.starsFor(steps, level.minMoves, autoUsed ? 0 : hintsUsed);
      let newBest = false;
      if (key && !autoUsed) newBest = HRD.store.recordWin(key, { steps: steps, timeMs: ms, stars: stars, hints: hintsUsed }).newBest;
      else if (key) HRD.store.clearGame(key);
      render();
      setTimeout(() => showWin(steps, ms, stars, newBest), 320);
    }

    function subtitle() {
      if (kind === 'builtin') return (cat ? cat.name : '') + '關卡';
      if (kind === 'shared') return '朋友分享的關卡';
      if (kind === 'public') return '關卡廣場' + (level.author ? ' · ' + level.author + ' 設計' : '');
      if (kind === 'draft') return '自製關卡（試玩）';
      return '自製關卡';
    }

    function compareNote(steps, ms) {
      const d = steps - challenge.steps;
      if (d < 0) return h('p', { class: 'win-best' }, '比朋友少 ' + (-d) + ' 步，挑戰成功！');
      if (d === 0) return h('p', { class: ms < challenge.timeMs ? 'win-best' : 'win-sub' }, ms < challenge.timeMs ? '和朋友一樣 ' + steps + ' 步，而且比較快！' : '和朋友一樣都是 ' + steps + ' 步。');
      return h('p', { class: 'win-sub' }, '比朋友多 ' + d + ' 步，再試一次看看？');
    }

    /* 關卡廣場的關卡：把成績送上去，結果出來再補一行字 */
    function galleryNote(steps, ms) {
      const line = h('p', { class: 'win-sub', role: 'status' }, '正在記錄到關卡廣場…');
      HRD.gallery.submitRecord(ctx.publicId, { steps: steps, timeMs: ms, hints: hintsUsed }).then((r) => {
        line.textContent = r.status === 'signed-out' ? '登入後過關，成績就會列進這一關的最佳紀錄。'
          : r.status === 'first' ? '已記錄到關卡廣場，你是第 ' + r.clears + ' 位過關的玩家！'
          : r.status === 'better' ? '已更新你在關卡廣場的最佳紀錄。'
          : '關卡廣場保留你之前比較好的紀錄。';
        if (r.status === 'first' || r.status === 'better') line.className = 'win-best';
      }, (e) => { line.textContent = '成績沒有記錄到關卡廣場：' + HRD.gallery.errorText(e); });
      return line;
    }

    function shareBest() {
      const p = key ? HRD.store.progress(key) : null;
      if (!p || p.bestSteps == null) return;
      const hints = p.bestHints || 0;
      HRD.io.scoreDialog({ level: level, steps: p.bestSteps, timeMs: p.bestTime, stars: E.starsFor(p.bestSteps, level.minMoves, hints), hints: hints, subtitle: subtitle() + ' · 最佳成績' });
    }

    function showWin(steps, ms, stars, newBest) {
      const starRow = h('div', { class: 'stars', role: 'img', 'aria-label': (autoUsed ? 0 : stars) + ' 顆星（滿分 3）' });
      for (let n = 1; n <= 3; n++) starRow.appendChild(icon('star', 34, !autoUsed && n <= stars ? 'star-on' : 'star-off'));
      let note;
      const noHintStars = E.starsFor(steps, level.minMoves, 0);
      if (autoUsed) note = '這次是自動解題完成的，不列入紀錄。自己挑戰看看吧！';
      else if (hintsUsed) {
        note = '這局用了 ' + hintsUsed + ' 次提示，最多 ' + E.hintCap(hintsUsed) + ' 星。'
          + (noHintStars > stars ? '不用提示的話，這個步數可以拿 ' + noHintStars + ' 星！' : '');
      }
      else if (level.minMoves != null && steps <= level.minMoves) note = '達到最少步數，拿下三星！';
      else if (level.minMoves != null) note = '再少 ' + (steps - level.minMoves) + ' 步就能拿到三星。';
      else note = '';
      const actions = [];
      const shareAction = autoUsed ? null : {
        label: '分享成績',
        onClick: () => { HRD.io.scoreDialog({ level: level, steps: steps, timeMs: ms, stars: stars, hints: hintsUsed, subtitle: subtitle() }); return false; },
      };
      if (kind === 'draft') {
        actions.push({ label: '回到編輯器', primary: true, value: 'edit' });
        if (shareAction) actions.push(shareAction);
        actions.push({ label: '再玩一次', value: 'again' });
      } else if (kind === 'public') {
        actions.push({ label: '再玩一次', value: 'again', primary: true });
        if (shareAction) actions.push(shareAction);
        actions.push({ label: '查看這一關', value: 'public' });
        actions.push({ label: '回關卡廣場', value: 'gallery' });
      } else if (kind === 'shared') {
        actions.push({ label: '再玩一次', value: 'again', primary: true });
        if (shareAction) actions.push(shareAction);
        actions.push({ label: '查看這一關', value: 'shared' });
        actions.push({ label: '回首頁', value: 'home' });
      } else {
        if (ctx.nextKey) actions.push({ label: '下一關：' + ctx.nextName, primary: true, value: 'next' });
        if (shareAction) actions.push(shareAction);
        actions.push({ label: '再玩一次', value: 'again', primary: !ctx.nextKey });
        actions.push({ label: kind === 'builtin' ? '回關卡列表' : '回我的關卡', value: 'list' });
      }
      dialog({
        title: autoUsed ? '解題完成' : '曹操脫逃成功！',
        body: h('div', { class: 'win' },
          h('span', { class: 'seal', 'aria-hidden': 'true' }, '過關'),
          h('dl', { class: 'win-stats' },
            h('div', {}, h('dt', {}, '步數'), h('dd', {}, String(steps))),
            h('div', {}, h('dt', {}, '最少'), h('dd', {}, level.minMoves != null ? String(level.minMoves) : '—')),
            h('div', {}, h('dt', {}, '用時'), h('dd', {}, formatTime(ms)))),
          starRow,
          note ? h('p', { class: 'win-note' }, note) : null,
          newBest && progress && progress.bestSteps != null ? h('p', { class: 'win-best' }, '新紀錄！比上次少了 ' + (progress.bestSteps - steps) + ' 步') : null,
          challenge && !autoUsed ? compareNote(steps, ms) : null,
          kind === 'public' && !autoUsed ? galleryNote(steps, ms) : null),
        actions: actions,
      }).then((v) => {
        if (v === 'next') app.go('#/play/' + ctx.nextKey.replace(':', '/'));
        else if (v === 'again') restartNow();
        else if (v === 'list') app.go(kind === 'builtin' ? '#/' : '#/mine');
        else if (v === 'edit') app.go('#/edit/' + (ctx.editId || 'new'));
        else if (v === 'shared') app.go('#/s/' + ctx.code);
        else if (v === 'public') app.go('#/g/' + ctx.publicId);
        else if (v === 'gallery') app.go('#/gallery');
        else if (v === 'home') app.go('#/');
      });
    }

    function restartNow() {
      stopAuto();
      st = startState; hist = []; fut = []; elapsed = 0; runningSince = null;
      won = false; autoUsed = false; hintsUsed = 0; sel = null; hint = null; restored = false;
      render();
    }

    /* ---------- 繪製 ---------- */
    function render() {
      const canMove = userCanMove();
      let arrows = null;
      if (sel != null && canMove) {
        let hotDir = null;
        if (hint && hint.piece === sel) {
          const path = E.pathTo(st, sel, hint.x, hint.y);
          if (path && path.length) hotDir = path[0];
        }
        const name = st.pieces[sel].label;
        arrows = E.openDirs(st, sel).map((d) => ({
          dx: d.dx, dy: d.dy, hot: !!hotDir && hotDir[0] === d.dx && hotDir[1] === d.dy,
          label: '把' + name + '往' + d.label + '移',
        }));
      }
      const ghost = hint && !playing ? { type: st.pieces[hint.piece].type, x: hint.x, y: hint.y, ok: true } : null;
      board.render(st, { selected: sel, hint: hint ? hint.piece : null, arrows: arrows, ghost: ghost });
      board.el.classList.toggle('is-locked', !canMove);

      els.steps.textContent = els.mSteps.textContent = String(hist.length);
      els.time.textContent = els.mTime.textContent = formatTime(timeMs());
      if (els.mMin) els.mMin.textContent = level.minMoves != null ? String(level.minMoves) : '…';
      const soundOn = HRD.store.setting('sound') !== false;
      els.soundBtn.textContent = '';
      els.soundBtn.appendChild(icon(soundOn ? 'volume' : 'mute', 20));
      els.soundBtn.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
      els.soundBtn.setAttribute('aria-label', '音效');
      els.soundBtn.title = soundOn ? '音效：開' : '音效：關';
      if (els.hapticBtn) {
        const hapOn = HRD.store.setting('haptics') !== false;
        els.hapticBtn.textContent = '';
        els.hapticBtn.appendChild(icon(hapOn ? 'vibrate' : 'vibrateOff', 20));
        els.hapticBtn.setAttribute('aria-pressed', hapOn ? 'true' : 'false');
        els.hapticBtn.setAttribute('aria-label', '震動');
        els.hapticBtn.title = hapOn ? '震動：開' : '震動：關';
      }
      els.undo.disabled = !hist.length || playing || !!busy;
      els.redo.disabled = !fut.length || playing || !!busy;
      els.reset.disabled = !!busy;
      els.hint.disabled = !canMove;
      els.hintCount.hidden = !hintsUsed;
      els.hintCount.textContent = String(hintsUsed);
      els.hint.setAttribute('aria-label', hintsUsed ? '提示（已用 ' + hintsUsed + ' 次）' : '提示');
      els.hint.title = hintsUsed ? '已用 ' + hintsUsed + ' 次提示，這局最多 ' + E.hintCap(hintsUsed) + ' 星' : '用了提示，這局最多 2 星';
      els.auto.disabled = won || (!!busy && !playing);
      els.autoIcon.textContent = '';
      els.autoIcon.appendChild(icon(playing ? 'pause' : 'play', 18));
      els.autoLabel.textContent = playing ? '停止演示' : '自動解題';
      els.auto.setAttribute('aria-pressed', playing ? 'true' : 'false');

      const open = sel != null && canMove ? E.openDirs(st, sel).map((d) => d.name) : [];
      els.dUp.disabled = !open.includes('up');
      els.dDown.disabled = !open.includes('down');
      els.dLeft.disabled = !open.includes('left');
      els.dRight.disabled = !open.includes('right');
      els.selName.textContent = sel != null ? st.pieces[sel].label : '尚未選取';

      const p = key ? HRD.store.progress(key) : null;
      els.bestText.textContent = p && p.bestSteps != null ? p.bestSteps + ' 步 · ' + formatTime(p.bestTime) : '—';
      els.bestShare.hidden = !(p && p.bestSteps != null);

      let msg;
      if (playing) msg = '自動解題中…按「停止演示」可以暫停。';
      else if (busy) msg = '正在計算最佳走法…';
      else if (won) msg = autoUsed ? '解題完成。' : '過關！曹操從出口脫逃了。';
      else if (hint) msg = '提示：把「' + st.pieces[hint.piece].label + '」移到虛線框的位置。（已用 ' + hintsUsed + ' 次提示，最多 ' + E.hintCap(hintsUsed) + ' 星）';
      else if (sel != null && arrows && arrows.length) msg = '已選取「' + st.pieces[sel].label + '」：' + (HRD.fx.touchDevice() ? '往要去的方向滑動，或點黃色箭頭。' : '拖曳、點黃色箭頭或按方向鍵移動。');
      else if (sel != null) msg = '「' + st.pieces[sel].label + '」旁邊沒有空位，換一顆試試。';
      else if (restored) msg = '已接續上次的進度。';
      else if (!HRD.settings.get('tapMove')) msg = HRD.fx.touchDevice() ? '在棋子上往要去的方向滑一下就會移動，或點棋子再點黃色箭頭。' : '點選或拖曳棋子開始。';
      else msg = HRD.fx.touchDevice() ? '在棋子上往要去的方向滑一下就會移動。只能往一個方向走的棋子，點一下也可以。' : '點選或拖曳棋子開始。只能往一個方向走的棋子，點一下就會移動。';
      if (els.status.textContent !== msg) els.status.textContent = msg;
    }

    /* ---------- 操作：拖曳、點擊、鍵盤 ---------- */
    board.bed.addEventListener('pointerdown', (e) => {
      const t = e.target.closest('.piece');
      if (!t || !userCanMove() || (e.pointerType === 'mouse' && e.button !== 0)) return;
      drag = { i: Number(t.dataset.i), x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: Date.now(), moved: false, bumped: false, touch: e.pointerType !== 'mouse', id: e.pointerId };
      try { t.setPointerCapture(e.pointerId); } catch (err) { /* 舊瀏覽器 */ }
    });
    board.bed.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const unit = board.unitPx();
      const limit = unit * (drag.touch ? 0.35 : 0.45);
      for (let guard = 0; guard < 8; guard++) {
        const ddx = e.clientX - drag.x, ddy = e.clientY - drag.y;
        const ax = Math.abs(ddx), ay = Math.abs(ddy);
        if (Math.max(ax, ay) < limit) break;
        const tries = ax >= ay ? [[Math.sign(ddx), 0, ax], [0, Math.sign(ddy), ay]] : [[0, Math.sign(ddy), ay], [Math.sign(ddx), 0, ax]];
        let stepped = false;
        for (const tr of tries) {
          if (tr[2] < limit || (!tr[0] && !tr[1])) continue;
          if (move(drag.i, tr[0], tr[1])) {
            drag.x += tr[0] * unit; drag.y += tr[1] * unit;
            drag.moved = true; stepped = true;
            break;
          }
        }
        if (!stepped && !drag.bumped) { drag.bumped = true; HRD.fx.blocked(); }
        if (!stepped || won) break;
      }
    });
    const endDrag = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      suppressClick = d.moved;
      if (d.moved || e.type !== 'pointerup' || !userCanMove()) return;
      // 快速滑一下（沒拖滿半格）也算：往滑動方向移一格
      const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      if (dist < (d.touch ? 16 : 22) || Date.now() - d.t0 > 400) return;
      suppressClick = true;
      const dir = Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
      if (!move(d.i, dir[0], dir[1]) && !d.bumped) HRD.fx.blocked();
    };
    board.bed.addEventListener('pointerup', endDrag);
    board.bed.addEventListener('pointercancel', endDrag);
    board.bed.addEventListener('click', (e) => {
      const arrow = e.target.closest('.move-arrow');
      if (arrow) {
        if (sel != null && userCanMove()) move(sel, Number(arrow.dataset.dx), Number(arrow.dataset.dy));
        return;
      }
      const t = e.target.closest('.piece');
      if (!t) return;
      if (suppressClick) { suppressClick = false; return; }
      tap(Number(t.dataset.i));
    });
    board.bed.addEventListener('keydown', (e) => {
      const t = e.target.closest('.piece');
      if (e.key === 'Escape') { sel = null; hint = null; render(); return; }
      if (!t) return;
      const d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
      if (!d) return;
      e.preventDefault();
      const i = Number(t.dataset.i);
      if (!userCanMove()) return;
      if (!move(i, d[0], d[1])) { sel = i; HRD.fx.blocked(); render(); }
      const b = board.pieceButton(i);
      if (b && document.activeElement !== b) b.focus({ preventScroll: true });
    });

    const onVisibility = () => {
      if (document.hidden) {
        if (runningSince != null) { stopClock(); pausedByHide = true; persist(true); }
      } else if (pausedByHide) {
        pausedByHide = false;
        if (!won && hist.length) startClock();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    const clock = setInterval(() => { if (runningSince != null) els.time.textContent = els.mTime.textContent = formatTime(timeMs()); }, 500);

    const minToken = { aborted: false };
    // 分享和廣場的關卡：最少步數自己再算一次（廣場上的數字是發佈的人送上來的）
    if ((level.minMoves == null && kind === 'shared') || kind === 'public') {
      E.solveAsync(startState, { signal: minToken, maxStates: 600000 }).then((r) => {
        if (minToken.aborted) return;
        if (r.status === 'solved') {
          level.minMoves = r.minMoves;
          els.min.textContent = r.minMoves + ' 步';
          if (els.mMin) els.mMin.textContent = String(r.minMoves);
          if (!level.difficulty) els.dots.replaceWith(els.dots = HRD.app.dots(E.difficultyFor(r.minMoves)));
        } else {
          els.min.textContent = r.status === 'unsolvable' ? '無解' : '—';
        }
      });
    }

    render();

    return function unmount() {
      minToken.aborted = true;
      stopAuto();
      if (busy) busy.aborted = true;
      clearInterval(clock);
      document.removeEventListener('visibilitychange', onVisibility);
      if (!won) persist(true);
    };
  }

  HRD.views = HRD.views || {};
  HRD.views.play = playView;
})(window);
