// 多語系工具：收集程式裡要翻譯的字串，產生简体中文對照表，檢查英文有沒有漏翻。
//   node tools/i18n.js           檢查（測試也會跑）
//   node tools/i18n.js --hans    重新產生 js/i18n/zh-Hans.js（需要 npm install，用 OpenCC 轉換）
//   node tools/i18n.js --list    印出所有原文（JSON），給翻譯用
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const JS_DIRS = ['js', 'js/views'];

/* 程式裡 t('…')、tr('…')、N('…') 的第一個參數，以及 index.html 標了 data-i18n 的文字 */
function sources() {
  const found = new Map();
  const add = (s, where) => { if (!found.has(s)) found.set(s, where); };
  const unquote = (body) => body.replace(/\\(['\\n])/g, (m, c) => (c === 'n' ? '\n' : c));
  for (const dir of JS_DIRS) {
    for (const f of fs.readdirSync(path.join(ROOT, dir))) {
      if (!f.endsWith('.js') || f === 'i18n.js') continue;
      const rel = dir + '/' + f;
      const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      const re = /\b(?:t|tr|N)\('((?:[^'\\\n]|\\.)*)'/g;
      let m;
      while ((m = re.exec(text))) add(unquote(m[1]), rel);
    }
  }
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const m of html.matchAll(/<\w+(?:\s[^>]*)?\sdata-i18n(?=[\s>])[^>]*>([^<]*)</g)) add(m[1], 'index.html');
  for (const m of html.matchAll(/(aria-label|content)="([^"]*)"[^>]*data-i18n-\1/g)) add(m[2], 'index.html');
  for (const m of html.matchAll(/data-i18n-(aria-label|content)[^>]*?\s\1="([^"]*)"/g)) add(m[2], 'index.html');
  // 內建關卡的名稱、說明，以及預設的棋子名稱（存在關卡資料裡，顯示時才翻譯）
  global.window = undefined;
  const { LEVELS } = require('../js/levels.js');
  LEVELS.forEach((l) => { add(l.name, 'levels:' + l.id); add(l.description, 'levels:' + l.id); l.pieces.forEach((p) => add(p.label, 'levels:labels')); });
  ['曹操', '將', '兵', '關羽', '張飛', '趙雲', '馬超', '黃忠', '魏延', '姜維'].forEach((n) => add(n, 'labels'));
  found.delete('');
  return found;
}

function load(locale) {
  const file = path.join(ROOT, 'js/i18n', locale + '.js');
  if (!fs.existsSync(file)) return {};
  const box = {};
  const sandbox = { HRD: { i18n: { add: (l, d) => Object.assign(box, d) } } };
  new Function('window', 'globalThis', fs.readFileSync(file, 'utf8'))(sandbox, sandbox);
  return box;
}

const placeholders = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(',');

function check() {
  const src = sources();
  const problems = [];
  for (const locale of ['zh-Hans', 'en']) {
    const d = load(locale);
    for (const [s, where] of src) {
      if (!(s in d)) { problems.push(locale + ' 缺少：' + JSON.stringify(s) + '（' + where + '）'); continue; }
      const v = d[s];
      const forms = v && typeof v === 'object' ? [v.one, v.other] : [v];
      forms.forEach((f) => {
        if (typeof f !== 'string') problems.push(locale + ' 格式不對：' + JSON.stringify(s));
        else if (placeholders(f) !== placeholders(s) && !(v.one === f && placeholders(v.other) === placeholders(s))) problems.push(locale + ' 參數對不上：' + JSON.stringify(s) + ' → ' + JSON.stringify(f));
      });
    }
    for (const k of Object.keys(d)) if (!src.has(k)) problems.push(locale + ' 多出來（沒用到）：' + JSON.stringify(k));
  }
  return { count: src.size, problems };
}

function writeDict(locale, dict, note) {
  const keys = Object.keys(dict);
  const body = keys.map((k) => '  ' + JSON.stringify(k) + ': ' + JSON.stringify(dict[k]) + ',').join('\n');
  const text = '/* ' + note + ' */\n(function (root) {\n  root.HRD.i18n.add(' + JSON.stringify(locale) + ', {\n' + body.replace(/^/gm, '  ') + '\n  });\n})(typeof window !== \'undefined\' ? window : globalThis);\n';
  fs.writeFileSync(path.join(ROOT, 'js/i18n', locale + '.js'), text);
}

function makeHans() {
  const OpenCC = require('opencc-js');
  // twp：連詞彙一起轉成大陸用語（設定→设置、登入→登录）；再修正幾個不自然的
  const conv = OpenCC.Converter({ from: 'twp', to: 'cn' });
  const FIX = [[/缺省/g, '默认'], [/帐号/g, '账号'], [/帐户/g, '账户']];
  const out = {};
  for (const s of sources().keys()) out[s] = FIX.reduce((v, [re, to]) => v.replace(re, to), conv(s));
  writeDict('zh-Hans', out, '简体中文：由 tools/i18n.js --hans 用 OpenCC 從繁體原文自動產生，不要手改');
  return Object.keys(out).length;
}

if (require.main === module) {
  if (process.argv.includes('--list')) {
    console.log(JSON.stringify(Object.fromEntries(sources()), null, 1));
  } else if (process.argv.includes('--hans')) {
    console.log('已產生 js/i18n/zh-Hans.js（' + makeHans() + ' 條）');
  } else {
    const r = check();
    r.problems.slice(0, 40).forEach((p) => console.log(p));
    console.log(r.count + ' 條原文，' + r.problems.length + ' 個問題');
    process.exit(r.problems.length ? 1 : 0);
  }
}

module.exports = { sources, check, load, writeDict };
