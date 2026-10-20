/*
 * 華容道核心：盤面模型、移動規則、檢查與解題器。
 * 不碰 DOM，瀏覽器與 Node 都能用（Node 端給測試和關卡工具）。
 */
(function (root) {
  'use strict';
  /* 多語系（js/i18n.js）：瀏覽器裡翻譯，Node 裡直接用原文 */
  const tr = (s, p) => (root.HRD && root.HRD.i18n ? root.HRD.i18n.t(s, p)
    : s.replace(/\{(\w+)\}/g, (m, k) => (p && p[k] != null ? String(p[k]) : m)));
  /* 先回傳原文、顯示時才翻譯的字串（例如檢查結果），用這個標記給 tools/i18n.js 收集 */
  const N = (s) => s;

  // name 是給畫面看的種類名稱（會翻譯）；label 是棋子預設文字，存進關卡資料（顯示時才翻譯）
  const TYPES = {
    king: { w: 2, h: 2, ch: 'K', get name() { return tr('曹操'); }, label: '曹操' },
    tall: { w: 1, h: 2, ch: 'V', get name() { return tr('直將'); }, label: '將' },
    wide: { w: 2, h: 1, ch: 'H', get name() { return tr('橫將'); }, label: '將' },
    soldier: { w: 1, h: 1, ch: 'S', get name() { return tr('小兵'); }, label: '兵' },
  };

  const DIRS = [
    { dx: 0, dy: -1, name: 'up', get label() { return tr('上'); } },
    { dx: 0, dy: 1, name: 'down', get label() { return tr('下'); } },
    { dx: -1, dy: 0, name: 'left', get label() { return tr('左'); } },
    { dx: 1, dy: 0, name: 'right', get label() { return tr('右'); } },
  ];

  const STANDARD = { cols: 4, rows: 5, goal: { x: 1, y: 3 }, exit: { side: 'bottom', at: 1 } };
  const LIMITS = { minCols: 3, maxCols: 6, minRows: 4, maxRows: 7 };
  const SIDES = ['bottom', 'top', 'left', 'right'];
  const SIDE_NAMES = {
    get bottom() { return tr('下方'); }, get top() { return tr('上方'); },
    get left() { return tr('左側'); }, get right() { return tr('右側'); },
  };

  /*
   * 出口：在盤面某一邊，寬兩格（曹操的寬度）。
   * side 是哪一邊；at 是出口第一格的欄（上下邊）或列（左右邊），從 0 起算。
   * 曹操要停在緊鄰出口的位置（goal）才算過關。
   */
  function exitToGoal(cols, rows, exit) {
    if (exit.side === 'bottom') return { x: exit.at, y: rows - 2 };
    if (exit.side === 'top') return { x: exit.at, y: 0 };
    if (exit.side === 'left') return { x: 0, y: exit.at };
    return { x: cols - 2, y: exit.at };
  }

  function goalToExit(cols, rows, goal) {
    if (!goal || !Number.isInteger(goal.x) || !Number.isInteger(goal.y)) return null;
    if (goal.x < 0 || goal.y < 0 || goal.x > cols - 2 || goal.y > rows - 2) return null;
    if (goal.y === rows - 2) return { side: 'bottom', at: goal.x };
    if (goal.y === 0) return { side: 'top', at: goal.x };
    if (goal.x === 0) return { side: 'left', at: goal.y };
    if (goal.x === cols - 2) return { side: 'right', at: goal.y };
    return null;
  }

  function standardExit(cols) {
    return { side: 'bottom', at: Math.floor((cols - 2) / 2) };
  }

  function validExit(cols, rows, exit) {
    if (!exit || SIDES.indexOf(exit.side) < 0 || !Number.isInteger(exit.at) || exit.at < 0) return false;
    const len = exit.side === 'bottom' || exit.side === 'top' ? cols : rows;
    return exit.at <= len - 2;
  }

  function isStandard(st) {
    return st.cols === 4 && st.rows === 5 && st.exit.side === 'bottom' && st.exit.at === 1;
  }

  /* 給人看的出口位置，例如「下方中央」「右側第 2–3 列」 */
  function exitText(st) {
    const e = st.exit;
    const horizontal = e.side === 'bottom' || e.side === 'top';
    const len = horizontal ? st.cols : st.rows;
    const centered = e.at * 2 === len - 2;
    if (centered) return tr('{side}中央', { side: SIDE_NAMES[e.side] });
    const where = { side: SIDE_NAMES[e.side], from: e.at + 1, to: e.at + 2 };
    return horizontal ? tr('{side}第 {from}–{to} 欄', where) : tr('{side}第 {from}–{to} 列', where);
  }
  const MAX_LABEL = 6;

  function typeOfSize(w, h) {
    for (const t in TYPES) if (TYPES[t].w === w && TYPES[t].h === h) return t;
    return null;
  }

  function makePiece(type, x, y, label) {
    const t = TYPES[type];
    const text = label == null || label === '' ? t.label : String(label).slice(0, MAX_LABEL);
    return { type: type, x: x, y: y, w: t.w, h: t.h, label: text };
  }

  function clonePieces(pieces) {
    return pieces.map((p) => Object.assign({}, p));
  }

  /* where 可以是出口 {side, at} 或曹操的目標位置 {x, y}（舊資料） */
  function makeState(cols, rows, where, pieces) {
    let exit = where && where.side ? { side: where.side, at: where.at } : goalToExit(cols, rows, where);
    if (!exit) exit = standardExit(cols);
    return { cols: cols, rows: rows, exit: exit, goal: exitToGoal(cols, rows, exit), pieces: pieces };
  }

  /* 用格子字串描述盤面：同一顆棋子用同一個字元，「.」是空格。 */
  function fromGrid(rows, labels, exit) {
    const R = rows.length, C = rows[0].length;
    const boxes = {}, order = [];
    rows.forEach((row, y) => {
      if (row.length !== C) throw new Error(tr('每一列長度要相同'));
      row.split('').forEach((ch, x) => {
        if (ch === '.') return;
        const b = boxes[ch];
        if (!b) { boxes[ch] = { ch: ch, x0: x, y0: y, x1: x, y1: y, n: 1 }; order.push(ch); }
        else { b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y); b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y); b.n++; }
      });
    });
    const pieces = order.map((ch) => {
      const b = boxes[ch], w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1;
      const type = typeOfSize(w, h);
      if (!type || b.n !== w * h) throw new Error(tr('「{ch}」不是合法的棋子形狀', { ch: ch }));
      return makePiece(type, b.x0, b.y0, labels && labels[ch]);
    });
    return makeState(C, R, exit || standardExit(C), pieces);
  }

  function toGrid(st) {
    const g = [];
    for (let y = 0; y < st.rows; y++) g.push(new Array(st.cols).fill('.'));
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    st.pieces.forEach((p, i) => {
      for (let dy = 0; dy < p.h; dy++) for (let dx = 0; dx < p.w; dx++) {
        if (g[p.y + dy] && g[p.y + dy][p.x + dx] !== undefined) g[p.y + dy][p.x + dx] = letters[i % letters.length];
      }
    });
    return g.map((r) => r.join(''));
  }

  function occupancy(st) {
    const occ = new Int16Array(st.cols * st.rows).fill(-1);
    st.pieces.forEach((p, i) => {
      for (let dy = 0; dy < p.h; dy++) for (let dx = 0; dx < p.w; dx++) {
        const x = p.x + dx, y = p.y + dy;
        if (x >= 0 && y >= 0 && x < st.cols && y < st.rows) occ[y * st.cols + x] = i;
      }
    });
    return occ;
  }

  /* 第 i 顆棋子能不能往 (dx, dy) 滑一格。occ 中標成自己的格子視為可通過。 */
  function canStep(st, occ, i, dx, dy) {
    const p = st.pieces[i], C = st.cols;
    if (!p) return false;
    if (dx) {
      const nx = dx > 0 ? p.x + p.w : p.x - 1;
      if (nx < 0 || nx >= C) return false;
      for (let k = 0; k < p.h; k++) {
        const o = occ[(p.y + k) * C + nx];
        if (o !== -1 && o !== i) return false;
      }
      return true;
    }
    const ny = dy > 0 ? p.y + p.h : p.y - 1;
    if (ny < 0 || ny >= st.rows) return false;
    for (let k = 0; k < p.w; k++) {
      const o = occ[ny * C + p.x + k];
      if (o !== -1 && o !== i) return false;
    }
    return true;
  }

  function openDirs(st, i, occ) {
    const o = occ || occupancy(st);
    return DIRS.filter((d) => canStep(st, o, i, d.dx, d.dy));
  }

  function withPiece(st, i, x, y) {
    const pieces = st.pieces.slice();
    pieces[i] = Object.assign({}, pieces[i], { x: x, y: y });
    return makeState(st.cols, st.rows, st.exit, pieces);
  }

  function kingIndex(st) {
    return st.pieces.findIndex((p) => p.type === 'king');
  }

  function isWon(st) {
    const k = st.pieces[kingIndex(st)];
    return !!k && k.x === st.goal.x && k.y === st.goal.y;
  }

  /* 盤面的「形狀」字串：同種棋子視為相同，用來判斷是否走過同一個局面。 */
  function shapeKey(st) {
    const g = new Array(st.cols * st.rows).fill('.');
    st.pieces.forEach((p) => {
      const ch = TYPES[p.type].ch;
      for (let dy = 0; dy < p.h; dy++) for (let dx = 0; dx < p.w; dx++) g[(p.y + dy) * st.cols + p.x + dx] = ch;
    });
    return st.cols + 'x' + st.rows + '@' + st.exit.side[0] + st.exit.at + ':' + g.join('');
  }

  function validate(st) {
    const errors = [], notes = [];
    const kings = st.pieces.filter((p) => p.type === 'king').length;
    // 檢查結果回傳原文，畫面顯示時才翻譯（編輯器要用原文判斷哪一條跟曹操有關）
    if (!validExit(st.cols, st.rows, st.exit)) errors.push(N('出口位置不在盤面邊上'));
    if (kings === 0) errors.push(N('還沒有放曹操'));
    if (kings > 1) errors.push(N('曹操只能有一個'));
    let outside = false;
    st.pieces.forEach((p) => {
      if (p.x < 0 || p.y < 0 || p.x + p.w > st.cols || p.y + p.h > st.rows) outside = true;
    });
    if (outside) errors.push(N('有棋子超出盤面'));
    const count = new Int16Array(st.cols * st.rows);
    let overlap = false, filled = 0;
    st.pieces.forEach((p) => {
      for (let dy = 0; dy < p.h; dy++) for (let dx = 0; dx < p.w; dx++) {
        const x = p.x + dx, y = p.y + dy;
        if (x < 0 || y < 0 || x >= st.cols || y >= st.rows) continue;
        const c = ++count[y * st.cols + x];
        if (c === 1) filled++; else overlap = true;
      }
    });
    if (overlap) errors.push(N('有棋子重疊'));
    const empties = st.cols * st.rows - filled;
    if (empties === 0) errors.push(N('至少要留一個空格'));
    if (!errors.length && isWon(st)) notes.push(N('曹操一開始就在出口，不用移動就過關'));
    return { ok: errors.length === 0, errors: errors, notes: notes, kings: kings, empties: empties, pieces: st.pieces.length };
  }

  /*
   * 解題器：廣度優先搜尋，一「步」= 一顆棋子移動任意格（可轉彎），
   * 和遊戲計步方式相同，所以找到的就是最少步數。
   * 以 generator 寫成，方便在瀏覽器裡分段執行不卡畫面。
   */
  function* solveSteps(st, options) {
    const opts = options || {};
    const maxStates = opts.maxStates || 600000;
    const C = st.cols, R = st.rows, N = C * R, n = st.pieces.length;
    const W = st.pieces.map((p) => p.w), H = st.pieces.map((p) => p.h);
    const CH = st.pieces.map((p) => TYPES[p.type].ch.charCodeAt(0));
    const ki = kingIndex(st);
    if (ki < 0 || !validate(st).ok) return { status: 'invalid' };
    const gx = st.goal.x, gy = st.goal.y;

    const buf = new Uint8Array(N);
    const keyOf = (pos) => {
      buf.fill(46);
      for (let i = 0; i < n; i++) {
        const x = pos[2 * i], y = pos[2 * i + 1];
        for (let dy = 0; dy < H[i]; dy++) for (let dx = 0; dx < W[i]; dx++) buf[(y + dy) * C + x + dx] = CH[i];
      }
      return String.fromCharCode.apply(null, buf);
    };

    const start = new Int8Array(2 * n);
    st.pieces.forEach((p, i) => { start[2 * i] = p.x; start[2 * i + 1] = p.y; });
    if (start[2 * ki] === gx && start[2 * ki + 1] === gy) return { status: 'solved', minMoves: 0, steps: [], explored: 1 };

    const k0 = keyOf(start);
    const parent = new Map([[k0, null]]);
    const queue = [start], keys = [k0];
    const occ = new Int16Array(N);
    const seen = new Int32Array(N);
    const lq = new Int16Array(N);
    let stamp = 0, sinceYield = 0;

    for (let head = 0; head < queue.length; head++) {
      const pos = queue[head], k = keys[head];
      occ.fill(-1);
      for (let i = 0; i < n; i++) {
        const x = pos[2 * i], y = pos[2 * i + 1];
        for (let dy = 0; dy < H[i]; dy++) for (let dx = 0; dx < W[i]; dx++) occ[(y + dy) * C + x + dx] = i;
      }
      for (let i = 0; i < n; i++) {
        const w = W[i], h = H[i];
        stamp++;
        let qh = 0, qt = 0;
        const s0 = pos[2 * i + 1] * C + pos[2 * i];
        lq[qt++] = s0; seen[s0] = stamp;
        while (qh < qt) {
          const cur = lq[qh++], cx = cur % C, cy = (cur - cx) / C;
          for (let d = 0; d < 4; d++) {
            const dx = DIRS[d].dx, dy = DIRS[d].dy;
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx + w > C || ny + h > R) continue;
            const np = ny * C + nx;
            if (seen[np] === stamp) continue;
            let free = true;
            if (dx) {
              const col = dx > 0 ? cx + w : cx - 1;
              for (let t = 0; t < h && free; t++) { const o = occ[(cy + t) * C + col]; if (o !== -1 && o !== i) free = false; }
            } else {
              const row = dy > 0 ? cy + h : cy - 1;
              for (let t = 0; t < w && free; t++) { const o = occ[row * C + cx + t]; if (o !== -1 && o !== i) free = false; }
            }
            if (!free) continue;
            seen[np] = stamp;
            lq[qt++] = np;
            const child = pos.slice();
            child[2 * i] = nx; child[2 * i + 1] = ny;
            const ck = keyOf(child);
            if (parent.has(ck)) continue;
            parent.set(ck, [k, i, nx, ny]);
            if (i === ki && nx === gx && ny === gy) {
              const steps = [];
              let at = ck;
              while (parent.get(at)) { const e = parent.get(at); steps.push({ piece: e[1], x: e[2], y: e[3] }); at = e[0]; }
              steps.reverse();
              return { status: 'solved', minMoves: steps.length, steps: steps, explored: queue.length };
            }
            queue.push(child); keys.push(ck);
            if (queue.length > maxStates) return { status: 'too-big', explored: queue.length };
          }
        }
      }
      if (++sinceYield >= 150) { sinceYield = 0; yield queue.length; }
    }
    return { status: 'unsolvable', explored: queue.length };
  }

  function solve(st, options) {
    const gen = solveSteps(st, options);
    let r = gen.next();
    while (!r.done) r = gen.next();
    return r.value;
  }

  /* 分段執行的解題，回傳 Promise；signal.aborted 為 true 時停止。 */
  function solveAsync(st, options) {
    const opts = options || {};
    const sliceMs = opts.sliceMs || 12;
    const gen = solveSteps(st, opts);
    return new Promise((resolve, reject) => {
      function run() {
        if (opts.signal && opts.signal.aborted) { resolve({ status: 'cancelled' }); return; }
        const until = Date.now() + sliceMs;
        try {
          let r;
          do { r = gen.next(); } while (!r.done && Date.now() < until);
          if (r.done) resolve(r.value);
          else { if (opts.onProgress) opts.onProgress(r.value); setTimeout(run, 0); }
        } catch (err) { reject(err); }
      }
      setTimeout(run, 0);
    });
  }

  /* 把第 i 顆棋子從目前位置移到 (tx, ty) 的單格路徑；走不到回傳 null。 */
  function pathTo(st, i, tx, ty) {
    const p = st.pieces[i], C = st.cols, R = st.rows;
    const occ = occupancy(st);
    const from = new Map([[p.y * C + p.x, null]]);
    const q = [[p.x, p.y]];
    for (let h = 0; h < q.length; h++) {
      const cx = q[h][0], cy = q[h][1];
      if (cx === tx && cy === ty) {
        const path = [];
        let at = cy * C + cx;
        while (from.get(at)) { const e = from.get(at); path.push([e[1], e[2]]); at = e[0]; }
        return path.reverse();
      }
      for (const d of DIRS) {
        const nx = cx + d.dx, ny = cy + d.dy;
        if (nx < 0 || ny < 0 || nx + p.w > C || ny + p.h > R) continue;
        const np = ny * C + nx;
        if (from.has(np)) continue;
        const probe = withPiece(st, i, cx, cy);
        if (!canStep(probe, occ, i, d.dx, d.dy)) continue;
        from.set(np, [cy * C + cx, d.dx, d.dy]);
        q.push([nx, ny]);
      }
    }
    return null;
  }

  /* ---------- 關卡資料（JSON）---------- */

  function levelToState(level) {
    const b = level.board || {};
    const cols = b.cols || STANDARD.cols, rows = b.rows || STANDARD.rows;
    const where = level.exit && level.exit.side ? level.exit : level.goal || standardExit(cols);
    return makeState(cols, rows, where, level.pieces.map((p) => makePiece(p.type, p.x, p.y, p.label)));
  }

  function stateToPieces(st) {
    return st.pieces.map((p) => ({ type: p.type, x: p.x, y: p.y, label: p.label }));
  }

  /* 檢查並整理外部匯入的關卡；不合格時丟出錯誤訊息。 */
  function normalizeLevel(raw) {
    if (!raw || typeof raw !== 'object') throw new Error(tr('不是關卡資料'));
    if (!Array.isArray(raw.pieces) || raw.pieces.length === 0) throw new Error(tr('缺少棋子資料'));
    if (raw.pieces.length > 40) throw new Error(tr('棋子太多'));
    const b = raw.board || {};
    const cols = b.cols == null ? STANDARD.cols : b.cols, rows = b.rows == null ? STANDARD.rows : b.rows;
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < LIMITS.minCols || cols > LIMITS.maxCols || rows < LIMITS.minRows || rows > LIMITS.maxRows) {
      throw new Error(tr('盤面大小要在 {minCols}–{maxCols} 欄、{minRows}–{maxRows} 列之間', LIMITS));
    }
    let exit = null;
    if (raw.exit) {
      if (!validExit(cols, rows, raw.exit)) throw new Error(tr('出口位置不正確'));
      exit = { side: raw.exit.side, at: raw.exit.at };
    } else if (raw.goal) {
      exit = goalToExit(cols, rows, raw.goal);
      if (!exit) throw new Error(tr('出口位置不正確'));
    } else {
      exit = standardExit(cols);
    }
    const pieces = raw.pieces.map((p) => {
      if (!p || !TYPES[p.type]) throw new Error(tr('有不認得的棋子種類'));
      if (!Number.isInteger(p.x) || !Number.isInteger(p.y)) throw new Error(tr('棋子座標要是整數'));
      return makePiece(p.type, p.x, p.y, typeof p.label === 'string' ? p.label : null);
    });
    const st = makeState(cols, rows, exit, pieces);
    const v = validate(st);
    if (!v.ok) throw new Error(tr(v.errors[0]));
    const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 30) : tr('未命名關卡');
    const difficulty = Number.isInteger(raw.difficulty) && raw.difficulty >= 1 && raw.difficulty <= 5 ? raw.difficulty : null;
    return {
      name: name,
      description: typeof raw.description === 'string' ? raw.description.slice(0, 200) : '',
      difficulty: difficulty,
      board: { cols: cols, rows: rows },
      exit: { side: st.exit.side, at: st.exit.at },
      goal: { x: st.goal.x, y: st.goal.y },
      pieces: stateToPieces(st),
      minMoves: Number.isInteger(raw.minMoves) ? raw.minMoves : null,
      solvable: typeof raw.solvable === 'boolean' ? raw.solvable : null,
    };
  }

  const GENERALS = ['關羽', '張飛', '趙雲', '馬超', '黃忠', '魏延', '姜維'];

  /* 依棋子順序給預設名稱：曹操、兵；第一員橫將叫關羽，其餘將領依序取五虎將。 */
  function defaultLabels(st) {
    const pool = GENERALS.slice();
    const out = new Array(st.pieces.length).fill(null);
    const firstWide = st.pieces.findIndex((p) => p.type === 'wide');
    st.pieces.forEach((p, i) => {
      if (p.type === 'king') out[i] = TYPES.king.label;
      else if (p.type === 'soldier') out[i] = TYPES.soldier.label;
      else if (i === firstWide) { pool.splice(pool.indexOf('關羽'), 1); out[i] = '關羽'; }
    });
    st.pieces.forEach((p, i) => { if (out[i] == null) out[i] = pool.length ? pool.shift() : '將'; });
    return out;
  }

  /* 依最少步數估難度 1–5。 */
  function difficultyFor(minMoves) {
    if (minMoves == null) return null;
    if (minMoves <= 15) return 1;
    if (minMoves <= 35) return 2;
    if (minMoves <= 60) return 3;
    if (minMoves <= 90) return 4;
    return 5;
  }

  /* 用了提示後最多幾顆星：沒用 3、1–2 次 2、3 次以上 1 */
  function hintCap(hints) {
    if (!hints) return 3;
    return hints <= 2 ? 2 : 1;
  }

  /* 依步數給星，再用提示次數設上限 */
  function starsFor(steps, minMoves, hints) {
    let s;
    if (!minMoves || steps <= minMoves) s = 3;
    else if (steps <= Math.ceil(minMoves * 1.5)) s = 2;
    else s = 1;
    return Math.min(s, hintCap(hints));
  }

  const api = {
    TYPES, DIRS, STANDARD, LIMITS, SIDES, SIDE_NAMES,
    exitToGoal, goalToExit, standardExit, validExit, isStandard, exitText,
    makePiece, makeState, clonePieces, fromGrid, toGrid, occupancy, canStep, openDirs, withPiece,
    kingIndex, isWon, shapeKey, validate, solve, solveAsync, solveSteps, pathTo,
    levelToState, stateToPieces, normalizeLevel, difficultyFor, starsFor, hintCap, defaultLabels, GENERALS,
  };

  const HRD = root.HRD || (root.HRD = {});
  HRD.engine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
