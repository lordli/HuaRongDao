/* 關卡編輯器 */
(function (root) {
  'use strict';
  const HRD = root.HRD;
  const E = HRD.engine;
  const { h, icon, toast, confirmDialog } = HRD.ui;

  const PALETTE = ['king', 'tall', 'wide', 'soldier'];
  const GENERALS = ['關羽', '張飛', '趙雲', '馬超', '黃忠', '魏延', '姜維'];

  function editorView(container, ctx) {
    const app = ctx.app;
    const routeId = ctx.id;
    let levelId = null;
    let st, meta, dirty = false;
    let undoStack = [], redoStack = [];

    const draft = app.draft && app.draft.editId === routeId ? app.draft : null;
    if (draft) {
      st = draft.st; meta = Object.assign({}, draft.meta); levelId = draft.levelId; dirty = draft.dirty;
      undoStack = draft.undo || []; redoStack = draft.redo || [];
    } else if (routeId !== 'new') {
      const l = HRD.store.customLevel(routeId);
      if (!l) {
        container.appendChild(h('div', { class: 'page' },
          h('div', { class: 'empty' }, h('h1', {}, '找不到這個關卡'), h('p', {}, '它可能已經被刪除了。'),
            h('div', { class: 'btn-row' }, h('a', { class: 'btn btn-primary', href: '#/mine' }, '回我的關卡')))));
        return null;
      }
      levelId = l.id;
      st = E.levelToState(l);
      meta = { name: l.name, description: l.description || '', difficulty: l.difficultySet ? l.difficulty : null };
    } else {
      st = E.makeState(E.STANDARD.cols, E.STANDARD.rows, E.STANDARD.exit, []);
      meta = { name: '', description: '', difficulty: null };
    }
    app.draft = null;

    let tool = st.pieces.some((p) => p.type === 'king') ? 'select' : 'place';
    let placeType = st.pieces.some((p) => p.type === 'king') ? 'tall' : 'king';
    let nextLabel = '', labelTouched = false;
    let sel = null, ghost = null, cursor = { x: 0, y: 0 }, drag = null, suppressClick = false;
    let check = { shape: null, status: 'idle' };
    let solveToken = null, checkTimer = null;
    let leaving = false;

    /* ---------- 小工具 ---------- */
    const kingCount = () => st.pieces.filter((p) => p.type === 'king').length;
    const snapshot = () => JSON.stringify({ c: st.cols, r: st.rows, e: st.exit, p: st.pieces });
    function restoreSnapshot(text) {
      const s = JSON.parse(text);
      if (Array.isArray(s)) setPieces(s); else setBoard(s.c, s.r, s.e, s.p);
    }
    function pushUndo() {
      undoStack.push(snapshot());
      if (undoStack.length > 100) undoStack.shift();
      redoStack = [];
    }
    function setBoard(cols, rows, exit, pieces) {
      st = E.makeState(cols, rows, exit, pieces);
      dirty = true;
      scheduleCheck();
      syncBoardControls();
    }
    function setPieces(pieces) {
      setBoard(st.cols, st.rows, st.exit, pieces);
    }
    function fits(type, x, y, ignore) {
      const t = E.TYPES[type];
      if (x < 0 || y < 0 || x + t.w > st.cols || y + t.h > st.rows) return false;
      for (let i = 0; i < st.pieces.length; i++) {
        if (i === ignore) continue;
        const p = st.pieces[i];
        if (x < p.x + p.w && p.x < x + t.w && y < p.y + p.h && p.y < y + t.h) return false;
      }
      return true;
    }
    function clampAnchor(type, x, y) {
      const t = E.TYPES[type];
      return { x: Math.min(x, st.cols - t.w), y: Math.min(y, st.rows - t.h) };
    }
    function suggestLabel(type) {
      if (type === 'king') return '曹操';
      if (type === 'soldier') return '兵';
      const used = new Set(st.pieces.map((p) => p.label));
      const pool = type === 'wide' ? GENERALS : GENERALS.slice(1).concat(['關羽']);
      return pool.find((n) => !used.has(n)) || '將';
    }
    function refreshLabel() {
      if (!labelTouched) nextLabel = suggestLabel(placeType);
    }

    /* ---------- 編輯動作 ---------- */
    function placeAt(x, y) {
      if (placeType === 'king' && kingCount() >= 1) { toast('曹操只能有一個，先刪掉原本的曹操再放'); return false; }
      const a = clampAnchor(placeType, x, y);
      if (!fits(placeType, a.x, a.y, null)) { toast('這裡放不下' + E.TYPES[placeType].name); return false; }
      pushUndo();
      setPieces(st.pieces.concat([E.makePiece(placeType, a.x, a.y, nextLabel || null)]));
      HRD.fx.place(placeType);
      if (placeType === 'king') placeType = 'tall';
      labelTouched = false;
      refreshLabel();
      sel = null;
      render();
      return true;
    }
    function removePiece(i) {
      if (i == null || !st.pieces[i]) return;
      pushUndo();
      const name = st.pieces[i].label;
      setPieces(st.pieces.filter((_, n) => n !== i));
      HRD.fx.remove();
      sel = null;
      refreshLabel();
      render();
      toast('已刪除「' + name + '」');
    }
    function movePiece(i, x, y) {
      pushUndo();
      HRD.fx.place(st.pieces[i].type);
      setPieces(st.pieces.map((p, n) => (n === i ? Object.assign({}, p, { x: x, y: y }) : p)));
      render();
    }
    function undo() {
      if (!undoStack.length) return;
      redoStack.push(snapshot());
      restoreSnapshot(undoStack.pop());
      sel = null; render();
    }
    function redo() {
      if (!redoStack.length) return;
      undoStack.push(snapshot());
      restoreSnapshot(redoStack.pop());
      sel = null; render();
    }
    function flip() {
      if (!st.pieces.length) return;
      pushUndo();
      setPieces(st.pieces.map((p) => Object.assign({}, p, { x: st.cols - p.x - p.w })));
      render();
    }
    async function clearAll() {
      if (!st.pieces.length) return;
      const ok = await confirmDialog('清空盤面？', '所有棋子都會被移除，之後可以按「復原」找回來。', '清空', true);
      if (!ok) return;
      pushUndo();
      setPieces([]);
      sel = null; tool = 'place'; placeType = 'king'; labelTouched = false; refreshLabel();
      render();
    }
    async function loadTemplate(levelIdToLoad) {
      const tpl = HRD.levels.LEVELS.find((l) => l.id === levelIdToLoad);
      if (!tpl) return;
      if (st.pieces.length) {
        const ok = await confirmDialog('換成「' + tpl.name + '」的盤面？', '目前盤面上的棋子會被取代，之後可以按「復原」找回來。', '換成這個盤面');
        if (!ok) { templateSelect.value = ''; return; }
      }
      pushUndo();
      const tst = E.levelToState(tpl);
      setBoard(tst.cols, tst.rows, tst.exit, tst.pieces);
      if (!meta.name) { meta.name = tpl.name + ' 改編'; nameInput.value = meta.name; }
      sel = null; tool = 'select';
      templateSelect.value = '';
      render();
    }

    /* ---------- 檢查與解題 ---------- */
    function scheduleCheck() {
      clearTimeout(checkTimer);
      if (solveToken) { solveToken.aborted = true; solveToken = null; }
      checkTimer = setTimeout(runCheck, 250);
    }
    async function runCheck() {
      const v = E.validate(st);
      const shape = E.shapeKey(st);
      if (!v.ok) { check = { shape: shape, status: 'invalid' }; renderCheck(); return; }
      if (check.shape === shape && check.status !== 'running') { renderCheck(); return; }
      const token = { aborted: false };
      solveToken = token;
      check = { shape: shape, status: 'running' };
      renderCheck();
      const snap = E.makeState(st.cols, st.rows, st.exit, E.clonePieces(st.pieces));
      const res = await E.solveAsync(snap, { signal: token, maxStates: 600000 });
      if (token.aborted || res.status === 'cancelled') return;
      solveToken = null;
      check = { shape: shape, status: res.status, minMoves: res.minMoves };
      if (levelId && !dirty) HRD.store.setSolveResult(levelId, shape, resultFor(check));
      renderCheck();
    }
    function resultFor(c) {
      if (c.status === 'solved') return { solvable: true, minMoves: c.minMoves, status: 'solved' };
      if (c.status === 'unsolvable') return { solvable: false, minMoves: null, status: 'unsolvable' };
      if (c.status === 'too-big') return { solvable: null, minMoves: null, status: 'too-big' };
      return { solvable: null, minMoves: null, status: null };
    }

    /* ---------- 儲存、試玩 ---------- */
    function buildLevel() {
      const shape = E.shapeKey(st);
      const done = check.shape === shape && check.status !== 'running' && check.status !== 'idle';
      const r = done ? resultFor(check) : { solvable: null, minMoves: null, status: null };
      return {
        id: levelId,
        name: meta.name.trim(),
        description: meta.description.trim(),
        difficulty: meta.difficulty || E.difficultyFor(r.minMoves),
        difficultySet: !!meta.difficulty,
        category: 'custom',
        board: { cols: st.cols, rows: st.rows },
        exit: { side: st.exit.side, at: st.exit.at },
        goal: { x: st.goal.x, y: st.goal.y },
        pieces: E.stateToPieces(st),
        shape: shape,
        minMoves: r.minMoves,
        solvable: r.solvable,
        solveStatus: r.status,
      };
    }
    function save() {
      const v = E.validate(st);
      if (!meta.name.trim()) {
        nameError.hidden = false;
        nameInput.setAttribute('aria-invalid', 'true');
        nameInput.focus();
        toast('請先幫關卡取個名字');
        return false;
      }
      if (!v.ok) { toast('還不能儲存：' + v.errors[0]); return false; }
      const level = buildLevel();
      if (!levelId) level.name = HRD.store.uniqueName(level.name);
      const saved = HRD.store.saveLevel(level);
      const wasNew = !levelId;
      levelId = saved.id;
      dirty = false;
      meta.name = saved.name; nameInput.value = saved.name;
      toast('已儲存「' + saved.name + '」');
      if (wasNew) app.replace('#/edit/' + saved.id);
      if (saved.solvable == null && !saved.solveStatus) {
        if (check.status === 'running') { /* 算完時 runCheck 會寫回 */ } else HRD.io.verifyPending();
      }
      render();
      return true;
    }
    function shareCurrent() {
      const v = E.validate(st);
      if (!v.ok) { toast('還不能分享：' + v.errors[0]); return; }
      const level = buildLevel();
      level.name = meta.name.trim() || '未命名關卡';
      HRD.io.shareDialog(level);
    }

    function testPlay() {
      const v = E.validate(st);
      if (!v.ok) { toast('還不能試玩：' + v.errors[0]); return; }
      const level = buildLevel();
      level.name = meta.name.trim() || '未命名關卡';
      app.draft = {
        editId: levelId || 'new', levelId: levelId, st: st, meta: Object.assign({}, meta), dirty: dirty,
        undo: undoStack, redo: redoStack, level: level,
      };
      leaving = true;
      app.go('#/play/draft');
    }

    /* ---------- 畫面 ---------- */
    const board = new HRD.BoardView({ kind: 'edit' });
    board.bed.tabIndex = 0;
    board.bed.setAttribute('aria-label', '編輯中的盤面。放置模式下可用方向鍵移動游標，按 Enter 放下棋子。');

    const saveState = h('p', { class: 'save-state', 'aria-live': 'polite' });
    const undoBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': '復原', onclick: undo }, icon('undo', 20));
    const redoBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': '重做', onclick: redo }, icon('redo', 20));

    const paletteBtns = {};
    const palette = h('div', { class: 'palette' });
    PALETTE.forEach((type) => {
      const t = E.TYPES[type];
      const count = h('span', { class: 'tile-sub' });
      const b = h('button', {
        type: 'button', class: 'tile-btn',
        onclick: () => { tool = 'place'; placeType = type; sel = null; labelTouched = false; refreshLabel(); render(); },
      }, h('span', { class: 'shape shape-' + type, 'aria-hidden': 'true' }), h('span', { class: 'tile-text' }, h('span', { class: 'tile-name' }, t.name + ' ' + t.w + ' × ' + t.h), count));
      paletteBtns[type] = { button: b, count: count };
      palette.appendChild(b);
    });

    const toolBtn = (name, label, onClick) => h('button', { type: 'button', class: 'btn btn-tool btn-tool-row', onclick: onClick }, icon(name, 18), h('span', {}, label));
    const selectBtn = toolBtn('pointer', '選取／移動', () => { tool = 'select'; ghost = null; render(); });
    const eraseBtn = toolBtn('eraser', '刪除', () => { tool = 'erase'; sel = null; ghost = null; render(); });
    const flipBtn = toolBtn('flip', '左右翻轉', flip);
    const clearBtn = toolBtn('trash', '清空盤面', clearAll);
    clearBtn.classList.add('btn-tool-danger');

    const pieceTitle = h('h2', { class: 'card-title' });
    const pieceDesc = h('p', { class: 'hint-text' });
    const labelInput = h('input', { id: 'piece-label', type: 'text', class: 'input', maxlength: '6', autocomplete: 'off' });
    const labelField = h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'piece-label' }, '棋子文字'), labelInput);
    const deleteBtn = h('button', { type: 'button', class: 'btn btn-secondary btn-sm btn-danger-text', onclick: () => removePiece(sel) }, icon('trash', 16), '刪除這顆棋子');
    let labelUndoPushed = false;
    labelInput.addEventListener('focus', () => { labelUndoPushed = false; });
    labelInput.addEventListener('input', () => {
      const text = labelInput.value.slice(0, 6);
      if (sel != null && st.pieces[sel]) {
        if (!labelUndoPushed) { pushUndo(); labelUndoPushed = true; }
        const pieces = st.pieces.slice();
        pieces[sel] = Object.assign({}, pieces[sel], { label: text || E.TYPES[pieces[sel].type].label });
        st = E.makeState(st.cols, st.rows, st.exit, pieces);
        dirty = true;
        renderBoard(); renderMeta();
      } else {
        nextLabel = text; labelTouched = true; renderBoard();
      }
    });

    const nameInput = h('input', { id: 'lv-name', type: 'text', class: 'input', maxlength: '30', value: meta.name, placeholder: '例如：我的第一關', autocomplete: 'off', 'aria-describedby': 'lv-name-error' });
    const nameError = h('p', { id: 'lv-name-error', class: 'field-error', hidden: true }, '請輸入關卡名稱');
    nameInput.addEventListener('input', () => {
      meta.name = nameInput.value; dirty = true;
      if (meta.name.trim()) { nameError.hidden = true; nameInput.removeAttribute('aria-invalid'); }
      renderMeta();
    });
    const diffSelect = h('select', { id: 'lv-diff', class: 'input' },
      h('option', { value: '' }, '依最少步數自動判定'),
      [1, 2, 3, 4, 5].map((n) => h('option', { value: String(n) }, n + ' 顆點')));
    diffSelect.value = meta.difficulty ? String(meta.difficulty) : '';
    diffSelect.addEventListener('change', () => { meta.difficulty = diffSelect.value ? Number(diffSelect.value) : null; dirty = true; renderMeta(); });
    const descInput = h('textarea', { id: 'lv-desc', class: 'input', rows: 3, maxlength: '200', placeholder: '給挑戰者的一句話（可不填）' });
    descInput.value = meta.description;
    descInput.addEventListener('input', () => { meta.description = descInput.value; dirty = true; renderMeta(); });

    const templateSelect = h('select', { id: 'lv-template', class: 'input' },
      h('option', { value: '' }, '選擇內建關卡…'),
      HRD.levels.LEVELS.map((l) => h('option', { value: l.id }, l.name + '（最少 ' + l.minMoves + ' 步）')));
    templateSelect.addEventListener('change', () => { if (templateSelect.value) loadTemplate(templateSelect.value); });

    /* ---------- 盤面大小與出口 ---------- */
    const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
    const colsSelect = h('select', { id: 'bd-cols', class: 'input' }, range(E.LIMITS.minCols, E.LIMITS.maxCols).map((n) => h('option', { value: String(n) }, n + ' 欄')));
    const rowsSelect = h('select', { id: 'bd-rows', class: 'input' }, range(E.LIMITS.minRows, E.LIMITS.maxRows).map((n) => h('option', { value: String(n) }, n + ' 列')));
    const sideSelect = h('select', { id: 'bd-side', class: 'input' }, E.SIDES.map((s) => h('option', { value: s }, E.SIDE_NAMES[s])));
    const atSelect = h('select', { id: 'bd-at', class: 'input' });
    const resetBoardBtn = h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => changeBoard(4, 5, 'bottom', 1) }, '恢復標準 4 × 5');

    function syncBoardControls() {
      colsSelect.value = String(st.cols);
      rowsSelect.value = String(st.rows);
      sideSelect.value = st.exit.side;
      const horizontal = st.exit.side === 'bottom' || st.exit.side === 'top';
      const len = horizontal ? st.cols : st.rows;
      atSelect.textContent = '';
      range(0, len - 2).forEach((i) => {
        const center = i * 2 === len - 2;
        atSelect.appendChild(h('option', { value: String(i) }, '第 ' + (i + 1) + '–' + (i + 2) + (horizontal ? ' 欄' : ' 列') + (center ? '（中央）' : '')));
      });
      atSelect.value = String(st.exit.at);
      resetBoardBtn.hidden = E.isStandard(st);
    }

    /* 換盤面大小或出口；超出新盤面的棋子會先問過再移除 */
    async function changeBoard(cols, rows, side, at) {
      const horizontal = side === 'bottom' || side === 'top';
      const len = horizontal ? cols : rows;
      let a = at;
      if (a == null || a > len - 2) a = Math.floor((len - 2) / 2);
      const out = st.pieces.filter((p) => p.x + p.w > cols || p.y + p.h > rows);
      if (out.length) {
        const ok = await confirmDialog('縮小盤面？', '有 ' + out.length + ' 顆棋子會超出新的盤面並被移除，之後可以按「復原」找回來。', '縮小並移除', true);
        if (!ok) { syncBoardControls(); return; }
      }
      pushUndo();
      setBoard(cols, rows, { side: side, at: a }, st.pieces.filter((p) => out.indexOf(p) < 0));
      sel = null;
      cursor = { x: Math.min(cursor.x, cols - 1), y: Math.min(cursor.y, rows - 1) };
      render();
    }
    const recenter = (oldLen, newLen) => (st.exit.at * 2 === oldLen - 2 ? null : st.exit.at);
    colsSelect.addEventListener('change', () => {
      const c = Number(colsSelect.value);
      const at = st.exit.side === 'bottom' || st.exit.side === 'top' ? recenter(st.cols, c) : st.exit.at;
      changeBoard(c, st.rows, st.exit.side, at);
    });
    rowsSelect.addEventListener('change', () => {
      const r = Number(rowsSelect.value);
      const at = st.exit.side === 'left' || st.exit.side === 'right' ? recenter(st.rows, r) : st.exit.at;
      changeBoard(st.cols, r, st.exit.side, at);
    });
    sideSelect.addEventListener('change', () => changeBoard(st.cols, st.rows, sideSelect.value, null));
    atSelect.addEventListener('change', () => changeBoard(st.cols, st.rows, st.exit.side, Number(atSelect.value)));

    const checkList = h('ul', { class: 'check-list' });
    const boardInfo = h('span', {});
    const sizeInfo = h('span', {});
    const exitBox = h('div', {});
    let exitSig = '';
    const modeHint = h('p', { class: 'stage-hint' });

    const page = h('div', { class: 'page editor-page' },
      h('div', { class: 'section-head' },
        h('div', {},
          h('nav', { class: 'crumbs', 'aria-label': '目前位置' }, h('a', { href: '#/mine' }, '我的關卡'), h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'crumb-here' }, routeId === 'new' && !levelId ? '新增' : '編輯')),
          h('h1', { class: 'page-title' }, '關卡編輯器'),
          saveState),
        h('div', { class: 'btn-row' }, undoBtn, redoBtn,
          h('button', { type: 'button', class: 'btn btn-secondary', onclick: shareCurrent }, icon('share', 18), '分享'),
          h('button', { type: 'button', class: 'btn btn-outline', onclick: testPlay }, icon('play', 18), '試玩'),
          h('button', { type: 'button', class: 'btn btn-primary', onclick: save }, icon('save', 18), '儲存關卡'))),
      h('div', { class: 'editor-layout' },
        h('aside', { class: 'editor-tools', 'aria-label': '棋子與工具' },
          h('section', { class: 'card' }, h('h2', { class: 'card-title' }, '棋子'), palette),
          h('section', { class: 'card' }, h('h2', { class: 'card-title' }, '工具'),
            h('div', { class: 'tool-grid' }, selectBtn, eraseBtn, flipBtn, clearBtn)),
          h('section', { class: 'card' }, pieceTitle, pieceDesc, labelField, deleteBtn)),
        h('section', { class: 'editor-stage', 'aria-label': '盤面' },
          h('div', { class: 'stage-info' }, sizeInfo, boardInfo),
          h('div', { class: 'board-wrap' }, board.el),
          exitBox,
          modeHint),
        h('aside', { class: 'editor-side', 'aria-label': '關卡設定' },
          h('section', { class: 'card' }, h('h2', { class: 'card-title' }, '關卡資訊'),
            h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'lv-name' }, '名稱'), nameInput, nameError),
            h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'lv-diff' }, '難度'), diffSelect),
            h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'lv-desc' }, '說明'), descInput)),
          h('section', { class: 'card' }, h('h2', { class: 'card-title' }, '盤面大小與出口'),
            h('div', { class: 'field-pair' },
              h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'bd-cols' }, '寬'), colsSelect),
              h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'bd-rows' }, '高'), rowsSelect)),
            h('div', { class: 'field-pair' },
              h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'bd-side' }, '出口在'), sideSelect),
              h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'bd-at' }, '位置'), atSelect)),
            h('p', { class: 'hint-text' }, '出口寬兩格，曹操要移到緊鄰出口的位置。盤面越大，解題器要算越久。'),
            resetBoardBtn),
          h('section', { class: 'card' }, h('h2', { class: 'card-title' }, '從內建關卡改起'),
            h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'lv-template' }, '載入盤面'), templateSelect)),
          h('section', { class: 'card', 'aria-labelledby': 'chk-title' }, h('h2', { class: 'card-title', id: 'chk-title' }, '檢查'), checkList))));
    container.appendChild(page);

    /* ---------- 繪製 ---------- */
    function renderBoard() {
      let g = ghost;
      if (!g && tool === 'place' && document.activeElement === board.bed && !drag) {
        const a = clampAnchor(placeType, cursor.x, cursor.y);
        g = { type: placeType, x: a.x, y: a.y, ok: fits(placeType, a.x, a.y, null) && !(placeType === 'king' && kingCount() >= 1), label: nextLabel };
      }
      board.render(st, { selected: sel, ghost: g, dim: drag && drag.moved ? [drag.i] : null });
      board.el.classList.toggle('tool-erase', tool === 'erase');
      board.el.classList.toggle('tool-place', tool === 'place');
      const empties = E.validate(st).empties;
      boardInfo.textContent = '棋子 ' + st.pieces.length + ' · 空格 ' + empties;
      sizeInfo.textContent = st.cols + ' × ' + st.rows + ' · 出口在' + E.exitText(st);
      const sig = st.cols + 'x' + st.rows + st.exit.side + st.exit.at;
      if (sig !== exitSig) { exitSig = sig; exitBox.replaceChildren(HRD.exitLabel(st)); }
    }

    function renderMeta() {
      saveState.textContent = dirty ? '有未儲存的變更' : levelId ? '已儲存' : '還沒儲存';
      saveState.classList.toggle('is-dirty', dirty);
    }

    function renderTools() {
      PALETTE.forEach((type) => {
        const n = st.pieces.filter((p) => p.type === type).length;
        const pb = paletteBtns[type];
        const active = tool === 'place' && placeType === type;
        pb.button.setAttribute('aria-pressed', active ? 'true' : 'false');
        const full = type === 'king' && n >= 1;
        pb.button.disabled = full;
        pb.count.textContent = active ? '放置中' : type === 'king' ? (full ? '已放 1 / 1' : '每關 1 個') : '已放 ' + n;
      });
      selectBtn.setAttribute('aria-pressed', tool === 'select' ? 'true' : 'false');
      eraseBtn.setAttribute('aria-pressed', tool === 'erase' ? 'true' : 'false');
      flipBtn.disabled = clearBtn.disabled = !st.pieces.length;
      undoBtn.disabled = !undoStack.length;
      redoBtn.disabled = !redoStack.length;

      const p = sel != null ? st.pieces[sel] : null;
      if (p) {
        pieceTitle.textContent = '選取的棋子';
        pieceDesc.textContent = E.TYPES[p.type].name + '，第 ' + (p.x + 1) + ' 欄第 ' + (p.y + 1) + ' 列。拖曳可以移動，方向鍵可以微調。';
        labelField.hidden = false;
        if (document.activeElement !== labelInput) labelInput.value = p.label;
        deleteBtn.hidden = false;
      } else if (tool === 'place') {
        pieceTitle.textContent = '下一顆：' + E.TYPES[placeType].name;
        pieceDesc.textContent = '點盤面上的空格放下棋子。';
        labelField.hidden = false;
        if (document.activeElement !== labelInput) labelInput.value = nextLabel;
        deleteBtn.hidden = true;
      } else {
        pieceTitle.textContent = tool === 'erase' ? '刪除模式' : '選取模式';
        pieceDesc.textContent = tool === 'erase' ? '點一顆棋子就會刪掉它。' : '點棋子可以選取、改文字；拖曳可以移動。';
        labelField.hidden = true;
        deleteBtn.hidden = true;
      }
      modeHint.textContent = tool === 'place'
        ? '點空格放下「' + E.TYPES[placeType].name + '」 · 拖曳棋子可以移動'
        : tool === 'erase' ? '點棋子刪除 · 按「選取／移動」回到一般模式' : '點棋子選取 · 拖曳移動 · 選取後按 Delete 刪除';
    }

    function line(kind, text, strong) {
      const ic = { ok: 'ok', bad: 'bad', warn: 'alert', info: 'info', run: 'clock' }[kind];
      const label = { ok: '通過', bad: '有問題', warn: '注意', info: '資訊', run: '計算中' }[kind];
      const svg = icon(ic, 20);
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', label);
      svg.removeAttribute('aria-hidden');
      return h('li', { class: 'check check-' + kind }, svg, h('span', {}, strong ? h('strong', {}, strong) : null, text));
    }

    function renderCheck() {
      const v = E.validate(st);
      checkList.textContent = '';
      if (!st.pieces.length) {
        checkList.appendChild(line('info', '先從「棋子」選曹操，點盤面放下去。'));
        return;
      }
      checkList.appendChild(v.kings === 1 ? line('ok', '曹操剛好 1 個') : line('bad', v.kings === 0 ? '還沒有放曹操' : '曹操只能有一個'));
      v.errors.filter((e) => e.indexOf('曹操') < 0).forEach((e) => checkList.appendChild(line('bad', e)));
      if (v.empties > 0) {
        const std = E.isStandard(st);
        checkList.appendChild(line(!std || v.empties === 2 ? 'ok' : 'info', std && v.empties !== 2 ? '（標準開局是 2 格）' : '', '空格 ' + v.empties + ' 格'));
      }
      v.notes.forEach((n) => checkList.appendChild(line('warn', n)));
      if (!v.ok) return;
      if (check.status === 'running' || check.status === 'idle' || check.shape !== E.shapeKey(st)) checkList.appendChild(line('run', '正在計算能不能過關…'));
      else if (check.status === 'solved') checkList.appendChild(line('ok', ' · 最少 ' + check.minMoves + ' 步', '可以過關'));
      else if (check.status === 'unsolvable') checkList.appendChild(line('bad', '：曹操怎麼走都到不了出口', '無解'));
      else if (check.status === 'too-big') checkList.appendChild(line('warn', '：盤面變化太多，算不出來', '無法判定'));
    }

    function render() {
      renderBoard();
      renderTools();
      renderMeta();
      renderCheck();
    }

    /* ---------- 盤面操作 ---------- */
    board.bed.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const t = e.target.closest('.piece');
      if (t && tool !== 'erase') {
        const i = Number(t.dataset.i);
        const c = board.cellAt(e.clientX, e.clientY);
        const p = st.pieces[i];
        drag = { i: i, ox: c.x - p.x, oy: c.y - p.y, moved: false, id: e.pointerId };
        try { t.setPointerCapture(e.pointerId); } catch (err) { /* 舊瀏覽器 */ }
      } else if (!t) {
        drag = { empty: true, id: e.pointerId };
      }
    });
    board.bed.addEventListener('pointermove', (e) => {
      if (drag && !drag.empty && e.pointerId === drag.id) {
        const c = board.cellAt(e.clientX, e.clientY);
        const p = st.pieces[drag.i];
        const t = E.TYPES[p.type];
        const x = Math.max(0, Math.min(st.cols - t.w, c.x - drag.ox));
        const y = Math.max(0, Math.min(st.rows - t.h, c.y - drag.oy));
        if (x !== p.x || y !== p.y) drag.moved = true;
        if (drag.moved) {
          ghost = { type: p.type, x: x, y: y, ok: fits(p.type, x, y, drag.i), label: p.label };
          drag.tx = x; drag.ty = y;
          renderBoard();
        }
        return;
      }
      if (tool === 'place' && e.pointerType !== 'touch' && !drag) {
        const c = board.cellAt(e.clientX, e.clientY);
        if (!c.inside) { if (ghost) { ghost = null; renderBoard(); } return; }
        const a = clampAnchor(placeType, c.x, c.y);
        const ok = fits(placeType, a.x, a.y, null) && !(placeType === 'king' && kingCount() >= 1);
        const overPiece = e.target.closest('.piece');
        const next = overPiece ? null : { type: placeType, x: a.x, y: a.y, ok: ok, label: nextLabel };
        if (JSON.stringify(next) !== JSON.stringify(ghost)) { ghost = next; renderBoard(); }
      }
    });
    board.bed.addEventListener('pointerleave', () => { if (!drag && ghost) { ghost = null; renderBoard(); } });
    const endPointer = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      if (d.empty) {
        if (e.type === 'pointerup' && e.target.closest('.board-bed') && !e.target.closest('.piece')) {
          const c = board.cellAt(e.clientX, e.clientY);
          if (c.inside) {
            if (tool === 'place') { ghost = null; placeAt(c.x, c.y); }
            else if (sel != null) { sel = null; render(); }
          }
        }
        return;
      }
      if (d.moved) {
        suppressClick = true;
        ghost = null;
        if (e.type === 'pointerup' && fits(st.pieces[d.i].type, d.tx, d.ty, d.i)) { sel = d.i; movePiece(d.i, d.tx, d.ty); }
        else { renderBoard(); if (e.type === 'pointerup') toast('那裡放不下'); }
      }
    };
    board.bed.addEventListener('pointerup', endPointer);
    board.bed.addEventListener('pointercancel', endPointer);
    board.bed.addEventListener('click', (e) => {
      const t = e.target.closest('.piece');
      if (!t) return;
      if (suppressClick) { suppressClick = false; return; }
      const i = Number(t.dataset.i);
      if (tool === 'erase') { removePiece(i); return; }
      sel = sel === i ? null : i;
      if (tool === 'place') tool = 'select';
      render();
    });
    board.bed.addEventListener('keydown', (e) => {
      const dirs = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
      const d = dirs[e.key];
      const onPiece = e.target.closest('.piece');
      if (onPiece) {
        const i = Number(onPiece.dataset.i);
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removePiece(i); board.bed.focus(); return; }
        if (d) {
          e.preventDefault();
          const p = st.pieces[i];
          if (fits(p.type, p.x + d[0], p.y + d[1], i)) { sel = i; movePiece(i, p.x + d[0], p.y + d[1]); }
          const b = board.pieceButton(i);
          if (b) b.focus({ preventScroll: true });
        }
        return;
      }
      if (e.target !== board.bed) return;
      if (e.key === 'Escape') { sel = null; render(); return; }
      if (tool !== 'place') return;
      if (d) {
        e.preventDefault();
        cursor = { x: Math.max(0, Math.min(st.cols - 1, cursor.x + d[0])), y: Math.max(0, Math.min(st.rows - 1, cursor.y + d[1])) };
        renderBoard();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        placeAt(cursor.x, cursor.y);
      }
    });
    board.bed.addEventListener('focus', () => renderBoard());
    board.bed.addEventListener('blur', () => renderBoard());

    const onUnload = (e) => { if (dirty && !leaving) { e.preventDefault(); e.returnValue = ''; } };
    root.addEventListener('beforeunload', onUnload);

    refreshLabel();
    syncBoardControls();
    render();
    scheduleCheck();

    return {
      unmount() {
        clearTimeout(checkTimer);
        if (solveToken) solveToken.aborted = true;
        root.removeEventListener('beforeunload', onUnload);
      },
      /* 離開前提醒：有未儲存的變更時回傳要顯示的訊息 */
      guard() {
        if (!dirty || leaving) return null;
        return { message: '這個關卡還有未儲存的變更。', save: save };
      },
    };
  }

  HRD.views = HRD.views || {};
  HRD.views.editor = editorView;
})(window);
