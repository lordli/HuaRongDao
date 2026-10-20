// 多語系：每一句都有简体中文和英文、參數對得上、單複數與語言偵測
const test = require('node:test');
const assert = require('node:assert/strict');
const tool = require('../tools/i18n.js');
const I = require('../js/i18n.js');

test('每一句原文都有简体中文和英文，參數對得上', () => {
  const r = tool.check();
  assert.ok(r.count > 800, '原文太少，收集可能壞了：' + r.count);
  assert.deepEqual(r.problems.slice(0, 20), []);
});

test('t()：帶入參數、找不到就用原文、英文單複數', () => {
  I.add('en', { '最少 {n} 步': { one: 'Min {n} move', other: 'Min {n} moves' }, '你好，{name}': 'Hi, {name}' });
  I.use('zh-Hant');
  assert.equal(I.t('最少 {n} 步', { n: 1 }), '最少 1 步');
  I.use('en');
  assert.equal(I.t('最少 {n} 步', { n: 1 }), 'Min 1 move');
  assert.equal(I.t('最少 {n} 步', { n: 81 }), 'Min 81 moves');
  assert.equal(I.t('你好，{name}', { name: '阿明' }), 'Hi, 阿明');
  assert.equal(I.t('沒有翻譯的句子'), '沒有翻譯的句子');
  assert.equal(I.t('缺參數 {x}'), '缺參數 {x}');
  I.use('zh-Hant');
});

test('简体中文對照表是從原文自動產生的', () => {
  const hans = tool.load('zh-Hans');
  assert.equal(hans['設定 · 華容道'], '设置 · 华容道');
  assert.equal(hans['關卡'], '关卡');
  for (const [k, v] of Object.entries(hans)) assert.doesNotMatch(v, /[關體設華廣]/, '還有繁體字：' + k);
});
