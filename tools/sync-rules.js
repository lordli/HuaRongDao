// 把內建關卡的最少步數寫進 firestore.rules（排行榜用來檢查成績）。
// 改過 js/levels.js 之後執行：node tools/sync-rules.js
// 只檢查有沒有同步（測試用）：node tools/sync-rules.js --check
const fs = require('fs');
const path = require('path');
const { LEVELS } = require('../js/levels.js');

const FILE = path.join(__dirname, '..', 'firestore.rules');
const START = '    // ---- 內建關卡的最少步數：由 tools/sync-rules.js 依 js/levels.js 產生，不要手改 ----';
const END = '    // ---- 以上由 tools/sync-rules.js 產生 ----';

function block() {
  const pairs = LEVELS.map((l) => "'" + l.id + "': " + l.minMoves);
  const lines = [];
  for (let i = 0; i < pairs.length; i += 6) lines.push('        ' + pairs.slice(i, i + 6).join(', ') + (i + 6 < pairs.length ? ',' : ''));
  return [START, '    function builtinMin() {', '      return {', ...lines, '      };', '    }', END].join('\n');
}

function current() {
  const text = fs.readFileSync(FILE, 'utf8');
  const a = text.indexOf(START), b = text.indexOf(END);
  if (a < 0 || b < 0) throw new Error('firestore.rules 裡找不到內建關卡步數的區塊');
  return { text: text, a: a, b: b + END.length };
}

function inSync() {
  const c = current();
  return c.text.slice(c.a, c.b) === block();
}

if (require.main === module) {
  if (process.argv.includes('--check')) {
    if (!inSync()) { console.error('firestore.rules 的內建關卡步數跟 js/levels.js 不一致，請執行 node tools/sync-rules.js'); process.exit(1); }
    console.log('firestore.rules 已同步');
  } else {
    const c = current();
    fs.writeFileSync(FILE, c.text.slice(0, c.a) + block() + c.text.slice(c.b));
    console.log('已更新 firestore.rules（' + LEVELS.length + ' 關）');
  }
}

module.exports = { block, inSync };
