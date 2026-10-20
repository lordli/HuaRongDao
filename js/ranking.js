/*
 * 排行榜：只收內建關卡、沒用提示和自動解題的成績。
 * - players/{uid}：總成績（星星、過關數），依 score = 星星 × 1000 + 過關數 排名。
 * - boards/{關卡}/records/{uid}：每關每人一筆最佳紀錄（步數少的優先，再比用時），附上走法。
 * 規則（firestore.rules）會檢查步數不少於最少步數、總成績跟紀錄對得上；
 * 顯示每關排行時，瀏覽器會照走法重播一次，走不到出口的紀錄不顯示。
 */
(function (root) {
  'use strict';
  const HRD = root.HRD || (root.HRD = {});
  const E = HRD.engine || require('./engine.js');

  const TOP = 50; // 總排行顯示幾名
  const LEVEL_TOP = 20; // 每關顯示幾名
  const MS_PER_STEP = 200; // 每一步至少要這麼久，太快的成績規則會擋下

  /* ---------- 走法：每一步 3 個字（棋子編號、目的地欄、列），都用 base36 ---------- */
  function encodeMoves(hist) {
    return hist.map((s) => s.i.toString(36) + s.tx.toString(36) + s.ty.toString(36)).join('');
  }

  function decodeMoves(text) {
    const out = [];
    if (typeof text !== 'string' || text.length % 3) return null;
    for (let k = 0; k < text.length; k += 3) {
      const [i, x, y] = [0, 1, 2].map((d) => parseInt(text[k + d], 36));
      if ([i, x, y].some((n) => Number.isNaN(n))) return null;
      out.push({ i: i, x: x, y: y });
    }
    return out;
  }

  /* 照走法從頭走一次：每一步都要走得到，最後曹操要到出口。回傳每一步之後的盤面，不合法就是 null */
  function replay(level, moves) {
    const list = Array.isArray(moves) ? moves : decodeMoves(moves);
    if (!list || !list.length) return null;
    let st = E.levelToState(level);
    const states = [st];
    for (const m of list) {
      const p = st.pieces[m.i];
      if (!p || (p.x === m.x && p.y === m.y)) return null;
      if (!E.pathTo(st, m.i, m.x, m.y)) return null;
      st = E.withPiece(st, m.i, m.x, m.y);
      states.push(st);
    }
    return E.isWon(st) ? states : null;
  }

  function verify(level, rec) {
    if (!rec || typeof rec.steps !== 'number' || rec.steps < (level.minMoves || 0)) return false;
    if (typeof rec.moves !== 'string' || rec.moves.length !== rec.steps * 3) return false;
    if (!(rec.timeMs >= rec.steps * MS_PER_STEP)) return false;
    return !!replay(level, rec.moves);
  }

  const starsOf = (steps, min) => E.starsFor(steps, min, 0);

  if (typeof module !== 'undefined' && module.exports && typeof window === 'undefined') {
    module.exports = { encodeMoves, decodeMoves, replay, verify, starsOf, MS_PER_STEP };
    return;
  }

  const { h, icon, dialog, formatTime } = HRD.ui;
  const C = () => HRD.cloud;
  const builtin = (id) => HRD.levels.LEVELS.find((l) => l.id === id) || null;

  async function fs() {
    const fb = await C().firebase();
    return { F: fb.F, db: fb.db };
  }

  function available() { return !!(HRD.cloud && HRD.cloud.canSignIn()); }

  /* 目前登入的 Firebase 使用者（剛打開網頁時要等登入狀態載入完） */
  async function user() {
    if (!HRD.store.account()) return null;
    await C().firebase();
    return C().currentUser();
  }

  /*
   * 過關後送出成績。r: { steps, timeMs, hints, auto, hist }
   * 回傳 { status, rank? }：status 是 'hints' | 'signed-out' | 'first' | 'better' | 'kept'
   */
  async function submit(levelId, r) {
    const level = builtin(levelId);
    if (!level || r.auto) return { status: 'skip' };
    if (r.hints) return { status: 'hints' };
    const u = await user();
    if (!u) return { status: 'signed-out' };
    const { F, db } = await fs();
    const steps = r.hist.length;
    const timeMs = Math.max(Math.round(r.timeMs), steps * MS_PER_STEP);
    const moves = encodeMoves(r.hist);
    const name = HRD.gallery.publicName();
    const pRef = F.doc(db, 'players', u.uid);
    const rRef = F.doc(db, 'boards', levelId, 'records', u.uid);
    const status = await F.runTransaction(db, async (tx) => {
      const [ps, rs] = [await tx.get(pRef), await tx.get(rRef)];
      const old = rs.exists() ? rs.data() : null;
      if (old && !(steps < old.steps || (steps === old.steps && timeMs < old.timeMs))) return 'kept';
      const p = ps.exists() ? ps.data() : { stars: 0, cleared: 0 };
      const stars = p.stars + starsOf(steps, level.minMoves) - (old ? starsOf(old.steps, level.minMoves) : 0);
      const cleared = p.cleared + (old ? 0 : 1);
      tx.set(rRef, { name: name, steps: steps, timeMs: timeMs, moves: moves, at: F.serverTimestamp() });
      tx.set(pRef, { name: name, stars: stars, cleared: cleared, score: stars * 1000 + cleared, last: levelId, updatedAt: F.serverTimestamp() });
      return old ? 'better' : 'first';
    });
    const rank = await levelRank(levelId).catch(() => null);
    return { status: status, rank: rank && rank.rank };
  }

  /* 我在某一關的名次（沒有紀錄就是 null） */
  async function levelRank(levelId) {
    const u = await user();
    if (!u) return null;
    const { F, db } = await fs();
    const mine = await F.getDoc(F.doc(db, 'boards', levelId, 'records', u.uid));
    if (!mine.exists()) return null;
    const m = mine.data();
    const col = F.collection(db, 'boards', levelId, 'records');
    const [fewer, faster] = await Promise.all([
      F.getCountFromServer(F.query(col, F.where('steps', '<', m.steps))),
      F.getCountFromServer(F.query(col, F.where('steps', '==', m.steps), F.where('timeMs', '<', m.timeMs))),
    ]);
    return { rank: fewer.data().count + faster.data().count + 1, record: m };
  }

  /* 每關排行：照走法驗證過的前幾名；名字用玩家現在的公開名稱 */
  async function levelBoard(levelId, n) {
    const level = builtin(levelId);
    const { F, db } = await fs();
    const snap = await F.getDocs(F.query(F.collection(db, 'boards', levelId, 'records'), F.orderBy('steps'), F.orderBy('timeMs'), F.limit(n || LEVEL_TOP)));
    const rows = snap.docs.map((d) => Object.assign({ uid: d.id }, d.data())).filter((x) => verify(level, x));
    const uids = rows.map((r) => r.uid);
    for (let i = 0; i < uids.length; i += 30) {
      const ps = await F.getDocs(F.query(F.collection(db, 'players'), F.where(F.documentId(), 'in', uids.slice(i, i + 30))));
      const names = {};
      ps.docs.forEach((d) => { names[d.id] = d.data().name; });
      rows.forEach((r) => { if (names[r.uid]) r.name = names[r.uid]; });
    }
    return rows;
  }

  async function players(n) {
    const { F, db } = await fs();
    const snap = await F.getDocs(F.query(F.collection(db, 'players'), F.orderBy('score', 'desc'), F.limit(n || TOP)));
    return snap.docs.map((d) => Object.assign({ uid: d.id }, d.data()));
  }

  /* 我的總成績和名次 */
  async function me() {
    const u = await user();
    if (!u) return null;
    const { F, db } = await fs();
    const snap = await F.getDoc(F.doc(db, 'players', u.uid));
    if (!snap.exists()) return { player: null };
    const p = snap.data();
    const above = await F.getCountFromServer(F.query(F.collection(db, 'players'), F.where('score', '>', p.score)));
    return { player: p, rank: above.data().count + 1 };
  }

  /* 改公開名稱：總成績上的名字跟著改（每關紀錄要等下次刷新成績才會換） */
  async function rename(name) {
    const u = await user();
    if (!u) return;
    const { F, db } = await fs();
    const ref = F.doc(db, 'players', u.uid);
    const snap = await F.getDoc(ref);
    if (snap.exists()) await F.updateDoc(ref, { name: name, updatedAt: F.serverTimestamp() });
  }

  /* ---------- 看走法 ---------- */
  function replayDialog(levelId, rec) {
    const level = builtin(levelId);
    const states = level && replay(level, rec.moves);
    if (!states) return Promise.resolve();
    const view = new HRD.BoardView({ kind: 'preview', maxHeight: 320 });
    view.el.classList.add('board-replay');
    let k = 0, timer = null;
    const counter = h('span', { class: 'replay-count', 'aria-live': 'polite' });
    const playBtn = h('button', { type: 'button', class: 'btn btn-primary btn-sm' });
    const prev = h('button', { type: 'button', class: 'icon-btn', 'aria-label': '上一步', onclick: () => { stop(); go(k - 1); } }, icon('back', 20));
    const next = h('button', { type: 'button', class: 'icon-btn', 'aria-label': '下一步', onclick: () => { stop(); go(k + 1); } }, icon('next', 20));
    const first = h('button', { type: 'button', class: 'icon-btn', 'aria-label': '回到開頭', onclick: () => { stop(); go(0); } }, icon('restart', 20));
    function go(n) {
      k = Math.max(0, Math.min(states.length - 1, n));
      view.render(states[k]);
      counter.textContent = k === 0 ? '開始' : '第 ' + k + ' / ' + (states.length - 1) + ' 步';
      prev.disabled = k === 0;
      first.disabled = k === 0;
      next.disabled = k === states.length - 1;
    }
    function drawPlay() {
      playBtn.textContent = '';
      playBtn.append(icon(timer ? 'pause' : 'play', 16), timer ? '暫停' : (k === states.length - 1 ? '重播' : '播放'));
    }
    function stop() { clearInterval(timer); timer = null; drawPlay(); }
    function play() {
      if (k === states.length - 1) go(0);
      timer = setInterval(() => { if (k >= states.length - 1) stop(); else go(k + 1); }, 650);
      drawPlay();
    }
    playBtn.addEventListener('click', () => (timer ? stop() : play()));
    go(0);
    drawPlay();
    return dialog({
      title: rec.name + ' 的走法',
      body: h('div', { class: 'replay' },
        h('p', { class: 'dialog-text' }, level.name + ' · ' + rec.steps + ' 步 · ' + formatTime(rec.timeMs)),
        h('div', { class: 'replay-board' }, view.el, HRD.exitLabel(states[0])),
        h('div', { class: 'replay-controls' }, first, prev, playBtn, next, counter)),
      actions: [{ label: '關閉', value: true }],
    }).then(() => stop());
  }

  HRD.ranking = {
    TOP, LEVEL_TOP, MS_PER_STEP, available, submit, levelRank, levelBoard, players, me, rename,
    encodeMoves, decodeMoves, replay, verify, replayDialog,
  };
})(typeof window !== 'undefined' ? window : globalThis);
