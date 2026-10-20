// 關卡廣場：盤面 id（同一個盤面只能發佈一次）
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');
const { LEVELS } = require('../js/levels.js');
const G = require('../js/gallery.js');

const lv = (grid, exit) => { const st = E.fromGrid(grid, null, exit); return { board: { cols: st.cols, rows: st.rows }, exit: st.exit, pieces: E.stateToPieces(st) }; };
const flip = (grid) => grid.map((r) => r.split('').reverse().join(''));

test('左右翻轉的盤面算同一個，棋子名稱不影響', () => {
  const g = ['ABBC', 'ADDC', 'KK..', 'KKEF', 'GHIF'];
  const id = G.layoutId(lv(g));
  assert.match(id, /^[0-9a-z]{13}$/);
  assert.equal(G.layoutId(lv(flip(g))), id);
  const renamed = lv(g);
  renamed.pieces = renamed.pieces.map((p) => Object.assign({}, p, { label: '兵' }));
  assert.equal(G.layoutId(renamed), id);
  assert.notEqual(G.layoutId(lv(['ABBC', 'ADDC', '.KK.', 'EKKF', 'GHIF'])), id);
});

test('翻轉時出口也跟著翻', () => {
  const g = ['KKA..', 'KKAB.', 'CCDEF', 'GGHEF', 'IIHJJ'];
  assert.equal(G.layoutId(lv(g, { side: 'right', at: 1 })), G.layoutId(lv(flip(g), { side: 'left', at: 1 })));
  assert.notEqual(G.layoutId(lv(g, { side: 'right', at: 1 })), G.layoutId(lv(flip(g), { side: 'right', at: 1 })));
  const narrow = ['AAB', '.KK', 'CKK', 'DEF', 'GEF', 'G.H'];
  assert.equal(G.layoutId(lv(narrow, { side: 'bottom', at: 0 })), G.layoutId(lv(flip(narrow), { side: 'bottom', at: 1 })));
});

test('內建關卡（含翻轉）不能發佈', () => {
  const hd = LEVELS.find((l) => l.id === 'hengdao');
  assert.equal(G.builtinMatch(hd).id, 'hengdao');
  assert.equal(G.builtinMatch(lv(flip(['ACCB', 'ACCB', 'DEEF', 'DGHF', 'I..J']))).id, 'hengdao');
  assert.equal(G.builtinMatch(lv(['ABBC', 'ADDC', 'KK..', 'KKEF', 'GHIF'])), null);
  const ids = new Set(LEVELS.map((l) => G.layoutId(l)));
  assert.equal(ids.size, LEVELS.length, '內建關卡彼此不能是同一個盤面');
});
