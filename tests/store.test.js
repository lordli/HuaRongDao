// 多台裝置同步時的資料合併規則
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/store.js');

const lvl = (id, at, extra) => Object.assign({ id: id, name: id, pieces: [{ type: 'king', x: 0, y: 0 }], updatedAt: at }, extra);
const win = (steps, at, extra) => Object.assign({ solved: true, bestSteps: steps, bestHints: 0, bestTime: 1000, stars: 2, updatedAt: at }, extra);
const dev = (d) => Object.assign(S.blank(), d);

test('合併跟順序無關，重複合併結果不變', () => {
  const a = dev({
    custom: [lvl('c1', 10), lvl('c2', 20)],
    progress: { 'b:x': win(30, 5), 'b:y': win(12, 8, { bestHints: 2 }) },
    saved: { 'b:z': { pos: [[0, 0]], updatedAt: 40 } },
    last: 'b:z', lastAt: 40,
    settings: { theme: 'dark', sound: false }, settingsAt: { theme: 50 },
  });
  const b = dev({
    custom: [lvl('c2', 25, { name: '改過' }), lvl('c3', 30)],
    deleted: { c1: 15 },
    progress: { 'b:x': win(28, 9, { bestTime: 3000 }), 'b:y': win(12, 3, { bestHints: 0, stars: 3 }) },
    settings: { theme: 'light', volume: 0.5 }, settingsAt: { theme: 60, volume: 1 },
  });
  const c = dev({ custom: [lvl('c4', 1)], saved: { 'b:z': { pos: [[1, 1]], updatedAt: 45 } }, lastAt: 45, last: 'b:z' });
  const ab = S.merge(a, b);
  assert.ok(S.same(ab, S.merge(b, a)), '交換順序');
  assert.ok(S.same(S.merge(ab, c), S.merge(a, S.merge(b, c))), '結合律');
  assert.ok(S.same(S.merge(ab, ab), ab), '冪等');
  assert.ok(S.same(S.merge(ab, a), ab), '已經併過的再併一次不變');

  assert.deepEqual(ab.custom.map((l) => l.id), ['c2', 'c3'], 'c1 被刪除、c2 取較新的');
  assert.equal(ab.custom[0].name, '改過');
  assert.equal(ab.progress['b:x'].bestSteps, 28);
  assert.equal(ab.progress['b:x'].bestTime, 1000);
  assert.equal(ab.progress['b:y'].bestHints, 0);
  assert.equal(ab.progress['b:y'].stars, 3);
  assert.equal(ab.settings.theme, 'light', '設定取較晚改的');
  assert.equal(ab.settings.sound, false);
  assert.equal(ab.settings.volume, 0.5);
});

test('修改時間相同時，保留有解題結果的版本', () => {
  const plain = dev({ custom: [lvl('c1', 10)] });
  const solved = dev({ custom: [lvl('c1', 10, { solveStatus: 'solved', minMoves: 9 })] });
  assert.equal(S.merge(plain, solved).custom[0].minMoves, 9);
  assert.equal(S.merge(solved, plain).custom[0].minMoves, 9);
});

test('清除過關紀錄後，其他裝置的舊紀錄不會回來，之後的新紀錄會保留', () => {
  const cleared = dev({ resetAt: 100, lastAt: 100 });
  const other = dev({
    progress: { 'b:old': win(30, 50), 'b:new': win(20, 150), 'b:legacy': { solved: true, bestSteps: 9 } },
    saved: { 'b:a': { pos: [], updatedAt: 90 }, 'b:b': { pos: [], updatedAt: 120 } },
    last: 'b:a', lastAt: 90,
  });
  const m = S.merge(cleared, other);
  assert.deepEqual(Object.keys(m.progress), ['b:new']);
  assert.deepEqual(Object.keys(m.saved), ['b:b']);
  assert.equal(m.last, null);
});

test('過關後留下「已結束」紀錄，舊的進行中局面不會被同步回來', () => {
  const phone = dev({ saved: { 'b:x': { gone: true, updatedAt: 200 } } });
  const pc = dev({ saved: { 'b:x': { pos: [[0, 0]], hist: [1, 2], updatedAt: 150 } } });
  assert.equal(S.merge(pc, phone).saved['b:x'].gone, true);
});

test('刪掉自訂關卡時，它的紀錄也一起移除；復原刪除後關卡回來', () => {
  const a = dev({ deleted: { c1: 100 } });
  const b = dev({ custom: [lvl('c1', 50)], progress: { 'c:c1': win(9, 60) }, saved: { 'c:c1': { pos: [], updatedAt: 70 } } });
  const m = S.merge(a, b);
  assert.equal(m.custom.length, 0);
  assert.deepEqual(m.progress, {});
  assert.deepEqual(m.saved, {});
  const undone = dev({ custom: [lvl('c1', 120)], progress: {} });
  assert.equal(S.merge(m, undone).custom.length, 1);
});

test('舊版資料（沒有時間戳記）也能合併', () => {
  const old = { custom: [lvl('c1', 10)], progress: { 'b:x': { solved: true, bestSteps: 81, bestTime: 5000, stars: 3 } }, saved: {}, last: 'b:y', settings: { theme: 'dark' } };
  const m = S.merge(old, S.blank());
  assert.equal(m.progress['b:x'].bestSteps, 81);
  assert.equal(m.last, 'b:y');
  assert.equal(m.settings.theme, 'dark');
  assert.ok(S.same(S.merge(m, old), m));
});
