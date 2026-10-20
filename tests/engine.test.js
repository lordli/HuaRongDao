// 執行：node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');
const { LEVELS } = require('../js/levels.js');

const HDLM = ['ACCB', 'ACCB', 'DEEF', 'DGHF', 'I..J'];

test('格子字串轉成棋子', () => {
  const st = E.fromGrid(HDLM);
  assert.equal(st.pieces.length, 10);
  const king = st.pieces[E.kingIndex(st)];
  assert.deepEqual([king.x, king.y, king.w, king.h], [1, 0, 2, 2]);
  assert.equal(st.pieces.filter((p) => p.type === 'tall').length, 4);
  assert.equal(st.pieces.filter((p) => p.type === 'wide').length, 1);
  assert.equal(st.pieces.filter((p) => p.type === 'soldier').length, 4);
  assert.deepEqual(E.toGrid(st).map((r) => r.replace(/[A-Za-z]/g, '#')), HDLM.map((r) => r.replace(/[A-Z]/g, '#')));
});

test('形狀不合法的格子字串會報錯', () => {
  assert.throws(() => E.fromGrid(['AA..', 'A...', '....', '....', '....']));
});

test('移動規則：只能滑進空格、不能出界', () => {
  const st = E.fromGrid(HDLM);
  const occ = E.occupancy(st);
  const iSoldierLeft = st.pieces.findIndex((p) => p.type === 'soldier' && p.x === 0 && p.y === 4);
  assert.equal(E.canStep(st, occ, iSoldierLeft, 1, 0), true);
  assert.equal(E.canStep(st, occ, iSoldierLeft, -1, 0), false);
  assert.equal(E.canStep(st, occ, iSoldierLeft, 0, 1), false);
  assert.equal(E.canStep(st, occ, E.kingIndex(st), 0, 1), false);
});

test('檢查：曹操數量、重疊、空格', () => {
  assert.equal(E.validate(E.fromGrid(HDLM)).ok, true);
  const noKing = E.fromGrid(['AB..', 'AB..', '....', '....', '....']);
  assert.deepEqual(E.validate(noKing).errors, ['還沒有放曹操']);
  const overlap = E.fromGrid(HDLM);
  overlap.pieces[0] = Object.assign({}, overlap.pieces[0], { x: 1 });
  assert.ok(E.validate(overlap).errors.includes('有棋子重疊'));
  const full = E.fromGrid(['AKKB', 'AKKB', 'CDEF', 'GHIJ', 'LMNO']);
  assert.ok(E.validate(full).errors.includes('至少要留一個空格'));
});

test('橫刀立馬最少 81 步', () => {
  const r = E.solve(E.fromGrid(HDLM));
  assert.equal(r.status, 'solved');
  assert.equal(r.minMoves, 81);
});

test('解答可以照著走完並過關', () => {
  let st = E.fromGrid(HDLM);
  const r = E.solve(st);
  for (const s of r.steps) {
    const path = E.pathTo(st, s.piece, s.x, s.y);
    assert.ok(path && path.length > 0, '每一步都要走得到');
    for (const [dx, dy] of path) {
      assert.ok(E.canStep(st, E.occupancy(st), s.piece, dx, dy));
      const p = st.pieces[s.piece];
      st = E.withPiece(st, s.piece, p.x + dx, p.y + dy);
    }
  }
  assert.equal(E.isWon(st), true);
});

test('只有一個空格時曹操動不了，判定無解', () => {
  const r = E.solve(E.fromGrid(['AKKB', 'AKKB', 'CDEF', 'GHIJ', 'LMN.']));
  assert.equal(r.status, 'unsolvable');
});

test('匯入資料會被檢查', () => {
  const ok = E.normalizeLevel({ name: '測試', pieces: E.stateToPieces(E.fromGrid(HDLM)) });
  assert.equal(ok.pieces.length, 10);
  assert.throws(() => E.normalizeLevel({ pieces: [{ type: 'dragon', x: 0, y: 0 }] }));
  assert.throws(() => E.normalizeLevel({ pieces: [{ type: 'soldier', x: 0, y: 0 }] }), /曹操/);
});

test('用了提示會限制星等', () => {
  assert.equal(E.starsFor(81, 81, 0), 3);
  assert.equal(E.starsFor(81, 81, 1), 2);
  assert.equal(E.starsFor(81, 81, 2), 2);
  assert.equal(E.starsFor(81, 81, 3), 1);
  assert.equal(E.starsFor(200, 81, 1), 1);
  assert.equal(E.starsFor(10, null, 1), 2);
  assert.deepEqual([0, 1, 2, 3, 9].map(E.hintCap), [3, 2, 2, 1, 1]);
});

test('星等', () => {
  assert.equal(E.starsFor(81, 81), 3);
  assert.equal(E.starsFor(100, 81), 2);
  assert.equal(E.starsFor(200, 81), 1);
});

test('每個內建關卡都可解，且最少步數正確', () => {
  assert.ok(LEVELS.length >= 10);
  const ids = new Set();
  for (const lv of LEVELS) {
    assert.ok(!ids.has(lv.id), '關卡 id 不可重複：' + lv.id);
    ids.add(lv.id);
    const r = E.solve(E.levelToState(lv));
    assert.equal(r.status, 'solved', lv.name);
    assert.equal(r.minMoves, lv.minMoves, lv.name + ' 的最少步數');
  }
});

test('出口與目標位置可以互相換算', () => {
  for (const [c, r] of [[3, 4], [4, 5], [5, 5], [6, 7]]) {
    for (const side of E.SIDES) {
      const len = side === 'bottom' || side === 'top' ? c : r;
      for (let at = 0; at <= len - 2; at++) {
        const exit = { side: side, at: at };
        assert.ok(E.validExit(c, r, exit));
        const g = E.exitToGoal(c, r, exit);
        assert.ok(g.x >= 0 && g.y >= 0 && g.x <= c - 2 && g.y <= r - 2);
      }
      assert.equal(E.validExit(c, r, { side: side, at: len - 1 }), false);
    }
  }
  assert.deepEqual(E.goalToExit(4, 5, { x: 1, y: 3 }), { side: 'bottom', at: 1 });
  assert.deepEqual(E.goalToExit(5, 5, { x: 3, y: 1 }), { side: 'right', at: 1 });
});

test('舊資料只有 goal 時，出口推回下方中央', () => {
  const lv = { pieces: E.stateToPieces(E.fromGrid(HDLM)), goal: { x: 1, y: 3 } };
  const st = E.levelToState(lv);
  assert.deepEqual(st.exit, { side: 'bottom', at: 1 });
  assert.equal(E.isStandard(st), true);
  assert.equal(E.exitText(st), '下方中央');
});

test('自訂大小與出口：檢查、匯入與解題', () => {
  const st = E.fromGrid(['KKA..', 'KKAB.', 'CCDEF', 'GGHEF', 'IIHJJ'], null, { side: 'right', at: 1 });
  assert.deepEqual(st.goal, { x: 3, y: 1 });
  assert.equal(E.exitText(st), '右側第 2–3 列');
  const r = E.solve(st);
  assert.equal(r.status, 'solved');
  let s2 = st;
  for (const step of r.steps) s2 = E.withPiece(s2, step.piece, step.x, step.y);
  assert.equal(E.isWon(s2), true);
  const lv = E.normalizeLevel({ name: 't', board: { cols: 5, rows: 5 }, exit: { side: 'right', at: 1 }, pieces: E.stateToPieces(st) });
  assert.deepEqual(lv.exit, { side: 'right', at: 1 });
  assert.throws(() => E.normalizeLevel({ board: { cols: 7, rows: 5 }, pieces: lv.pieces }), /盤面大小/);
  assert.throws(() => E.normalizeLevel({ board: { cols: 5, rows: 5 }, exit: { side: 'right', at: 4 }, pieces: lv.pieces }), /出口/);
  assert.notEqual(E.shapeKey(st), E.shapeKey(E.makeState(5, 5, { side: 'left', at: 1 }, st.pieces)));
});
