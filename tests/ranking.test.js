// 排行榜：走法編碼、重播驗證、規則裡的最少步數有沒有跟關卡同步
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');
const { LEVELS } = require('../js/levels.js');
const R = require('../js/ranking.js');
const rules = require('../tools/sync-rules.js');

function solved(id) {
  const lv = LEVELS.find((l) => l.id === id);
  const r = E.solve(E.levelToState(lv));
  return { lv, hist: r.steps.map((s) => ({ i: s.piece, tx: s.x, ty: s.y })) };
}

test('走法可以編碼再解回來，重播後過關', () => {
  const { lv, hist } = solved('hengdao');
  const moves = R.encodeMoves(hist);
  assert.equal(moves.length, 81 * 3);
  assert.deepEqual(R.decodeMoves(moves).map((m) => [m.i, m.x, m.y]), hist.map((s) => [s.i, s.tx, s.ty]));
  assert.equal(R.replay(lv, moves).length, 82);
  assert.equal(R.verify(lv, { steps: 81, timeMs: 81 * 1000, moves }), true);
});

test('假的成績會被擋下：走不到、沒過關、太快、步數對不上', () => {
  const { lv, hist } = solved('chuchu');
  const moves = R.encodeMoves(hist);
  assert.equal(R.verify(lv, { steps: hist.length, timeMs: 10, moves }), false, '太快');
  assert.equal(R.verify(lv, { steps: hist.length + 1, timeMs: 9000, moves }), false, '步數對不上');
  assert.equal(R.verify(lv, { steps: hist.length, timeMs: 9000, moves: moves.slice(3) + moves.slice(0, 3) }), false, '順序亂掉');
  assert.equal(R.verify(lv, { steps: 2, timeMs: 9000, moves: moves.slice(0, 6) }), false, '少於最少步數');
  assert.equal(R.replay(lv, moves.slice(0, -3)), null, '最後一步沒走，沒過關');
  assert.equal(R.decodeMoves('ab'), null);
});

test('排行榜的星等跟遊戲一致（沒用提示）', () => {
  assert.equal(R.starsOf(81, 81), 3);
  assert.equal(R.starsOf(122, 81), 2);
  assert.equal(R.starsOf(123, 81), 1);
  // firestore.rules 用 2 × 步數 ≤ 3 × 最少 + 1 判斷兩星，要跟 Math.ceil(最少 × 1.5) 一樣
  for (let min = 1; min <= 150; min++) {
    for (let steps = min; steps <= min * 2 + 2; steps++) {
      const rule = steps <= min ? 3 : (2 * steps <= 3 * min + 1 ? 2 : 1);
      assert.equal(rule, R.starsOf(steps, min), 'min ' + min + ' steps ' + steps);
    }
  }
});

test('firestore.rules 裡的內建關卡最少步數跟 js/levels.js 同步', () => {
  assert.ok(rules.inSync(), '請執行 node tools/sync-rules.js');
});
