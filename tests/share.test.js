// 執行：npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');
const S = require('../js/share.js');
const { LEVELS } = require('../js/levels.js');

const sameBoard = (a, b) => E.shapeKey(E.levelToState(a)) === E.shapeKey(E.levelToState(b));
const labelsByPos = (lv) => lv.pieces.map((p) => p.x + ',' + p.y + '=' + p.label).sort().join(' ');

test('每個內建關卡編碼後可以還原（盤面、名稱、棋子文字）', () => {
  for (const lv of LEVELS) {
    const code = S.encode(lv);
    assert.match(code, /^(HRD1-[A-Za-z.]{20}|HRD2-\d\d[BTLR]\d-[A-Za-z.]{12,42})-[A-Za-z0-9_-]*-[0-9a-z]{4}$/);
    const back = S.decode(code);
    assert.equal(back.name, lv.name);
    assert.ok(sameBoard(back, lv), lv.name + ' 盤面要相同');
    assert.equal(labelsByPos(back), labelsByPos(lv), lv.name + ' 棋子文字要相同');
  }
});

test('同一個盤面不論棋子順序都得到同一個分享碼', () => {
  const lv = LEVELS.find((l) => l.id === 'hengdao');
  const shuffled = Object.assign({}, lv, { pieces: lv.pieces.slice().reverse() });
  assert.equal(S.encode(shuffled), S.encode(lv));
});

test('預設名稱不寫進分享碼，自訂名稱和中文都能保留', () => {
  const st = E.fromGrid(['ACCB', 'ACCB', 'DEEF', 'DGHF', 'I..J']);
  const plain = { name: 'x', pieces: E.stateToPieces(st) };
  const short = S.encode(plain);
  const custom = JSON.parse(JSON.stringify(plain));
  custom.name = '我的關卡 ★';
  custom.pieces[0].label = '國王';
  const code = S.encode(custom);
  assert.ok(code.length > short.length);
  const back = S.decode(code);
  assert.equal(back.name, '我的關卡 ★');
  assert.ok(back.pieces.some((p) => p.label === '國王'));
});

test('說明不放進分享碼，分享碼保持簡短', () => {
  for (const lv of LEVELS) assert.ok(S.encode(lv).length <= 90, lv.name);
  assert.equal(S.decode(S.encode(LEVELS[0])).description, '');
});

test('抄錯一個字會被發現', () => {
  const code = S.encode(LEVELS[0]);
  const i = code.indexOf('.', 5);
  const broken = code.slice(0, i) + 'Z' + code.slice(i + 1);
  assert.throws(() => S.decode(broken), /抄錯/);
  assert.throws(() => S.decode(code.slice(0, -6)), /分享碼/);
  assert.throws(() => S.decode('隨便一段文字'), /找不到分享碼/);
});

test('可以從分享連結或訊息中找出分享碼，斷行也沒關係', () => {
  const a = S.encode(LEVELS[0]);
  const b = S.encode(LEVELS[3]);
  const msg = '來挑戰這關 https://example.web.app/#/s/' + a + ' 還有這關：' + b + '！';
  assert.deepEqual(S.find(msg), [a, b]);
  const wrapped = a.slice(0, 30) + '\n' + a.slice(30);
  assert.deepEqual(S.find(wrapped), [a]);
  assert.equal(S.decode('https://example.web.app/#/s/' + a).name, LEVELS[0].name);
});

test('不合規則的盤面不能產生分享碼', () => {
  const noKing = { name: 'x', pieces: [{ type: 'soldier', x: 0, y: 0 }] };
  assert.throws(() => S.encode(noKing), /曹操/);
});

test('同一段文字裡，完整的和被斷行的分享碼都找得到', () => {
  const a = S.encode(LEVELS[0]);
  const b = S.encode(LEVELS[4]);
  assert.deepEqual(S.find('第一關 ' + a + ' 第二關 ' + b.slice(0, 30) + '\n' + b.slice(30)), [a, b]);
});

test('挑戰連結的成績可以還原', () => {
  assert.equal(S.scoreToken({ steps: 85, timeMs: 222400 }), 'r85t222');
  assert.deepEqual(S.parseScore('r85t222'), { steps: 85, timeMs: 222000 });
  assert.equal(S.parseScore('r85'), null);
  assert.equal(S.parseScore('x1t2'), null);
});

test('成績訊息包含步數、星等、用時、提示與挑戰方式', () => {
  const code = S.encode(LEVELS[12]);
  const withLink = S.scoreText({ name: '橫刀立馬', steps: 85, timeMs: 222000, minMoves: 81, stars: 2, hints: 1, code: code, link: 'https://x.web.app/#/s/' + code + '/r85t222' });
  assert.match(withLink, /「橫刀立馬」過關/);
  assert.match(withLink, /85 步（最少 81 步） · ★★☆ · 用時 03:42 · 用了 1 次提示/);
  assert.match(withLink, /換你挑戰：https:\/\/x\.web\.app\/#\/s\/HRD1-.*\/r85t222$/);
  const noLink = S.scoreText({ name: '橫刀立馬', steps: 81, timeMs: 61000, minMoves: 81, stars: 3, hints: 0, code: code, link: null });
  assert.match(noLink, /★★★ · 用時 01:01\n/);
  assert.ok(noLink.endsWith('貼上分享碼 ' + code));
  assert.deepEqual(S.find(noLink), [code]);
});

test('非標準盤面使用 HRD2 分享碼，可以完整還原大小與出口', () => {
  for (const lv of LEVELS.filter((l) => l.category === 'variant')) {
    const code = S.encode(lv);
    assert.match(code, /^HRD2-\d\d[BTLR]\d-/);
    const back = S.decode('看看這關 ' + code + ' 很難');
    assert.deepEqual(back.board, lv.board, lv.name);
    assert.deepEqual(back.exit, lv.exit, lv.name);
    assert.ok(sameBoard(back, lv), lv.name);
  }
  assert.match(S.encode(LEVELS[0]), /^HRD1-/);
  const code = S.encode(LEVELS.find((l) => l.id === 'dongmen'));
  assert.throws(() => S.decode(code.replace('55R1', '55L1')), /抄錯/);
});
