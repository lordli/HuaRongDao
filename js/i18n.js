/*
 * 多語系：繁體中文（原文）、简体中文、English。
 * 程式裡的文字一律寫繁體中文原文並包在 t() 裡，例如 t('最少 {n} 步', { n: 81 })；
 * 其他語言的對照表在 js/i18n/*.js（簡體由 tools/i18n.js 用 OpenCC 自動產生，英文是翻譯的）。
 * 英文需要分單複數時，對照表的值寫成 { one: '…', other: '…' }，依第一個數字參數決定。
 */
(function (root) {
  'use strict';
  const HRD = root.HRD || (root.HRD = {});

  const LOCALES = [
    { id: 'zh-Hant', name: '繁體中文', html: 'zh-Hant-TW', date: 'zh-TW' },
    { id: 'zh-Hans', name: '简体中文', html: 'zh-Hans-CN', date: 'zh-CN' },
    { id: 'en', name: 'English', html: 'en', date: 'en-US' },
  ];
  const SOURCE = 'zh-Hant';
  const dicts = {};
  let current = SOURCE;
  const listeners = new Set();

  function fill(text, params) {
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(params, k) && params[k] != null ? String(params[k]) : m));
  }

  function t(src, params) {
    const d = dicts[current];
    let out = d && Object.prototype.hasOwnProperty.call(d, src) ? d[src] : src;
    if (out && typeof out === 'object') {
      const nums = params ? Object.values(params).filter((v) => typeof v === 'number') : [];
      out = nums.length && nums[0] === 1 ? out.one : out.other;
    }
    return fill(out, params);
  }

  /* 依瀏覽器語言挑：簡體地區用简体，其他中文用繁體，其他語言用英文 */
  function detect() {
    const langs = (root.navigator && (root.navigator.languages || [root.navigator.language])) || [];
    for (const raw of langs) {
      const l = String(raw || '').toLowerCase();
      if (/^zh-(hans|cn|sg|my)/.test(l)) return 'zh-Hans';
      if (/^zh/.test(l)) return 'zh-Hant';
      if (/^en/.test(l)) return 'en';
    }
    return langs.length ? 'en' : SOURCE;
  }

  /* pref：'auto' 或語言代碼 */
  function use(pref) {
    const next = LOCALES.some((l) => l.id === pref) ? pref : detect();
    if (next === current) return false;
    current = next;
    listeners.forEach((fn) => { try { fn(next); } catch (e) { console.error(e); } });
    return true;
  }

  /* 頁面骨架（index.html）裡標了 data-i18n 的文字 */
  function applyStatic(doc) {
    const d = doc || root.document;
    if (!d) return;
    const info = LOCALES.find((l) => l.id === current);
    d.documentElement.setAttribute('lang', info.html);
    d.querySelectorAll('[data-i18n]').forEach((el) => {
      if (!el.dataset.i18nSrc) el.dataset.i18nSrc = el.textContent;
      el.textContent = t(el.dataset.i18nSrc);
    });
    ['aria-label', 'title', 'content'].forEach((attr) => {
      d.querySelectorAll('[data-i18n-' + attr + ']').forEach((el) => {
        const key = 'i18nSrc' + attr.replace(/-(\w)/g, (m, c) => c.toUpperCase()).replace(/^\w/, (c) => c.toUpperCase());
        if (!el.dataset[key]) el.dataset[key] = el.getAttribute(attr) || '';
        el.setAttribute(attr, t(el.dataset[key]));
      });
    });
  }

  HRD.i18n = {
    LOCALES, SOURCE, t, fill, detect, use, applyStatic,
    locale: () => current,
    dateLocale: () => LOCALES.find((l) => l.id === current).date,
    add(locale, dict) { dicts[locale] = Object.assign(dicts[locale] || {}, dict); },
    has(locale, src) { return !!(dicts[locale] && Object.prototype.hasOwnProperty.call(dicts[locale], src)); },
    dict: (locale) => dicts[locale] || {},
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = HRD.i18n;
})(typeof window !== 'undefined' ? window : globalThis);
