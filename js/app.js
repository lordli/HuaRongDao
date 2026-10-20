/* 路由與啟動 */
(function (root) {
  'use strict';
  const t = (s, p) => root.HRD.i18n.t(s, p);
  const HRD = root.HRD;
  const { h, icon, dialog } = HRD.ui;

  const main = document.getElementById('main');
  let currentHash = null;
  let current = null;
  let ignoreHash = null;

  HRD.VERSION = '0.7.3';

  const app = {
    state: {},
    draft: null,

    /* 'b:id' 內建、'c:id' 自訂、'draft' 試玩 */
    resolve(key) {
      if (key === 'draft') {
        return app.draft ? { key: null, kind: 'draft', level: app.draft.level, editId: app.draft.editId } : null;
      }
      const [kind, id] = key.split(':');
      if (kind === 'b') {
        const list = HRD.levels.LEVELS;
        const i = list.findIndex((l) => l.id === id);
        if (i < 0) return null;
        const next = list[i + 1];
        return { key: key, kind: 'builtin', level: list[i], nextKey: next ? 'b:' + next.id : null, nextName: next ? next.name : null };
      }
      if (kind === 'c') {
        const level = HRD.store.customLevel(id);
        return level ? { key: key, kind: 'custom', level: level } : null;
      }
      if (kind === 'p') {
        const level = HRD.gallery.cached(id);
        return level ? { key: key, kind: 'public', level: level, publicId: id } : null;
      }
      if (kind === 's') {
        try {
          const level = HRD.share.decode(id);
          return { key: 's:' + level.shareCode, kind: 'shared', level: level, code: level.shareCode };
        } catch (e) { return null; }
      }
      return null;
    },

    go(hash) { navigate(hash); },

    /* 換網址但不重新載入畫面（例如新關卡第一次儲存後） */
    replace(hash) {
      currentHash = hash;
      try { history.replaceState(null, '', hash); } catch (e) { /* 沙盒裡不允許時就只更新內部狀態 */ }
      highlightNav(hash);
    },

    dots(n) {
      const box = h('span', { class: 'dots', role: 'img', 'aria-label': n ? t('難度 {n}（滿分 5）', { n }) : t('難度未定') });
      for (let i = 1; i <= 5; i++) box.appendChild(h('span', { class: 'dot' + (n && i <= n ? ' on' : '') }));
      return box;
    },
  };
  HRD.app = app;

  function parse(hash) {
    const parts = (hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
    if (parts[0] === 'play' && parts[1] === 'draft') return { view: 'play', key: 'draft' };
    if (parts[0] === 'play' && ['b', 'c', 's', 'p'].includes(parts[1]) && parts[2]) {
      return { view: 'play', key: parts[1] + ':' + decodeURIComponent(parts[2]), challenge: HRD.share.parseScore(parts[3]) };
    }
    if (parts[0] === 's') return { view: 'shared', code: decodeURIComponent(parts[1] || ''), challenge: HRD.share.parseScore(parts[2]) };
    if (parts[0] === 'edit') return { view: 'editor', id: parts[1] || 'new' };
    if (parts[0] === 'mine') return { view: 'mine' };
    if (parts[0] === 'settings') return { view: 'settings' };
    if (parts[0] === 'gallery') return { view: 'gallery' };
    if (parts[0] === 'ranking') return { view: 'ranking', levelId: parts[1] ? decodeURIComponent(parts[1]) : null };
    if (parts[0] === 'g' && parts[1]) return { view: 'galleryLevel', id: decodeURIComponent(parts[1]) };
    return { view: 'home' };
  }

  function highlightNav(hash) {
    const r = parse(hash);
    const section = r.view === 'editor' ? 'edit' : r.view === 'settings' ? 'settings'
      : r.view === 'gallery' || r.view === 'galleryLevel' || (r.view === 'play' && r.key.startsWith('p:')) ? 'gallery'
      : r.view === 'ranking' ? 'ranking'
      : r.view === 'mine' || (r.view === 'play' && r.key.startsWith('c:')) ? 'mine' : 'home';
    document.querySelectorAll('[data-nav]').forEach((a) => {
      if (a.dataset.nav === section) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  function notFound(message) {
    main.appendChild(h('div', { class: 'page' },
      h('div', { class: 'empty' }, h('h1', {}, message), h('div', { class: 'btn-row' }, h('a', { class: 'btn btn-primary', href: '#/' }, t('回到首頁'))))));
  }

  function mount(hash, soft) {
    if (current && current.unmount) { try { current.unmount(); } catch (e) { console.error(e); } }
    current = null;
    main.textContent = '';
    const r = parse(hash);
    let result = null;
    let title = t('華容道');
    if (r.view === 'home') result = HRD.views.home(main, { app: app });
    else if (r.view === 'mine') { result = HRD.views.mine(main, { app: app }); title = t('我的關卡 · 華容道'); }
    else if (r.view === 'settings') { result = HRD.views.settings(main, { app: app }); title = t('設定 · 華容道'); }
    else if (r.view === 'gallery') { result = HRD.views.gallery(main, { app: app }); title = t('關卡廣場 · 華容道'); }
    else if (r.view === 'ranking') { result = HRD.views.ranking(main, { app: app, levelId: r.levelId }); title = t('排行榜 · 華容道'); }
    else if (r.view === 'galleryLevel') { result = HRD.views.galleryLevel(main, { app: app, id: r.id }); title = t('關卡廣場 · 華容道'); }
    else if (r.view === 'shared') { result = HRD.views.shared(main, { app: app, code: r.code, challenge: r.challenge }); title = t('朋友分享的關卡 · 華容道'); }
    else if (r.view === 'editor') { result = HRD.views.editor(main, { app: app, id: r.id }); title = t('關卡編輯器 · 華容道'); }
    else if (r.view === 'play') {
      const info = app.resolve(r.key);
      if (!info && r.key.startsWith('p:')) result = loadPublic(hash, r.key.slice(2));
      else if (!info) notFound(r.key === 'draft' ? t('沒有正在試玩的關卡') : t('找不到這個關卡'));
      else {
        result = HRD.views.play(main, Object.assign({ app: app, challenge: r.challenge }, info));
        title = t('{name} · 華容道', { name: info.level.name });
      }
    }
    current = typeof result === 'function' ? { unmount: result } : result || {};
    document.title = title;
    highlightNav(hash);
    if (soft) return;
    root.scrollTo(0, 0);
    main.focus({ preventScroll: true });
  }

  /* 關卡廣場的關卡第一次在這台裝置打開：先從雲端抓下來再進遊戲 */
  function loadPublic(hash, id) {
    let alive = true;
    const box = h('div', { class: 'page' }, h('p', { class: 'empty-line', role: 'status' }, t('載入關卡中…')));
    main.appendChild(box);
    HRD.cloud.ready()
      .then(() => (HRD.gallery.available() ? HRD.gallery.get(id) : null))
      .then((x) => {
        if (!alive) return;
        if (x) { mount(hash, true); return; }
        box.remove();
        notFound(t('找不到這個關卡'));
      }, (e) => {
        if (!alive) return;
        box.remove();
        notFound(t('關卡載入失敗：{errorText}', { errorText: HRD.gallery.errorText(e) }));
      });
    return () => { alive = false; };
  }

  async function navigate(hash, fromHashChange) {
    if (hash === currentHash) { if (!fromHashChange) mount(hash); return; }
    const g = current && current.guard ? current.guard(hash) : null;
    if (g) {
      const actions = [{ label: t('留在這裡'), value: 'stay' }, { label: t('不儲存就離開'), value: 'leave', danger: true }];
      if (g.save) actions.push({ label: t('儲存後離開'), value: 'save', primary: true });
      const choice = await dialog({ title: t('要離開這一頁嗎？'), message: g.message, actions: actions });
      if (choice === 'save' && !g.save()) { restoreHash(); return; }
      if (choice !== 'save' && choice !== 'leave') { restoreHash(); return; }
    }
    currentHash = hash;
    if (location.hash !== hash) {
      ignoreHash = hash;
      try { location.hash = hash; } catch (e) { ignoreHash = null; }
    }
    mount(hash);
  }

  function restoreHash() {
    if (location.hash !== currentHash) {
      ignoreHash = currentHash;
      try { history.replaceState(null, '', currentHash); ignoreHash = null; } catch (e) { location.hash = currentHash; }
    }
  }

  root.addEventListener('hashchange', () => {
    const hash = location.hash || '#/';
    if (ignoreHash === hash) { ignoreHash = null; return; }
    navigate(hash, true);
  });

  /* 站內連結自己處理，沙盒裡改不了網址時也能換頁 */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#/"]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(a.getAttribute('href'));
  });

  function updateFooter() {
    const el = document.getElementById('storage-note');
    if (!el) return;
    const acc = HRD.store.account();
    const mode = HRD.store.mode();
    el.textContent = acc ? t('已登入「{name}」，關卡與進度會同步到你的帳號。', { name: acc.name })
      : mode === 'cloud' ? t('關卡與進度已存到你的帳號，只有你看得到。')
      : mode === 'local' ? t('關卡與進度存在這個瀏覽器。')
      : t('這個分頁無法使用瀏覽器儲存空間，關閉後進度不會保留；請記得匯出關卡。');
  }

  /* 右上角：登入後設定鈕換成頭像；可以登入但還沒登入時，旁邊多一個「登入」 */
  let headerSig = null;
  function updateHeader() {
    const link = document.querySelector('.header-settings');
    const signIn = document.getElementById('header-signin');
    if (!link) return;
    const acc = HRD.store.account();
    if (signIn) signIn.hidden = !(HRD.cloud.canSignIn() && !acc);
    const galleryLink = document.getElementById('nav-gallery');
    if (galleryLink) galleryLink.hidden = !HRD.gallery.available();
    const rankingLink = document.getElementById('nav-ranking');
    if (rankingLink) rankingLink.hidden = !HRD.ranking.available();
    const sig = acc ? acc.uid + '|' + acc.name + '|' + acc.photo : '';
    if (sig === headerSig) return;
    headerSig = sig;
    link.textContent = '';
    link.classList.toggle('has-avatar', !!acc);
    link.appendChild(acc ? HRD.cloud.avatar(acc, 36) : icon('sliders', 20));
    const label = acc ? t('設定與帳號（{name}）', { name: acc.name }) : t('設定');
    link.setAttribute('aria-label', label);
    link.title = label;
  }

  /* 頁尾的語言切換（看不懂目前的語言時也找得到） */
  function updateLangLinks() {
    const box = document.getElementById('lang-links');
    if (!box) return;
    box.textContent = '';
    const now = HRD.i18n.locale();
    HRD.i18n.LOCALES.forEach((l, i) => {
      if (i) box.appendChild(document.createTextNode(' · '));
      box.appendChild(h('button', {
        type: 'button', class: 'text-btn lang-link', lang: l.html, 'aria-pressed': l.id === now ? 'true' : 'false',
        onclick: () => HRD.settings.set('lang', l.id),
      }, l.name));
    });
  }

  /* 換語言：頁面骨架、頁首頁尾和目前的畫面都重畫 */
  function applyLanguage() {
    if (!HRD.i18n.use(HRD.settings.get('lang'))) return false;
    HRD.i18n.applyStatic();
    headerSig = null;
    updateHeader();
    updateFooter();
    updateLangLinks();
    if (currentHash) mount(currentHash, true);
    return true;
  }

  function softRefresh() {
    if (currentHash && parse(currentHash).view === 'home' && !document.querySelector('dialog[open]')) mount(currentHash, true);
  }

  function start(data) {
    HRD.store.init();
    HRD.i18n.use(HRD.settings.get('lang'));
    HRD.i18n.applyStatic();
    updateLangLinks();
    HRD.settings.apply();
    HRD.store.onChange(() => {
      if (applyLanguage()) return;
      updateFooter();
      updateHeader();
      HRD.settings.apply();
      softRefresh();
    });
    let provider = null;
    HRD.cloud.onChange(() => {
      updateFooter();
      updateHeader();
      if (HRD.cloud.provider() !== provider) { provider = HRD.cloud.provider(); softRefresh(); }
    });
    const signIn = document.getElementById('header-signin');
    if (signIn) signIn.addEventListener('click', () => HRD.cloud.signInDialog());
    updateFooter();
    updateHeader();
    const initial = (data && data.route) || (location.hash && location.hash.indexOf('#/') === 0 ? location.hash : '#/');
    navigate(initial);
    HRD.cloud.init();
  }

  /* claude.ai 檢視器在頁面更新時可保留目前所在的頁面 */
  const hot = root.claude && root.claude.hot;
  if (hot && typeof hot.snapshot === 'function') hot.snapshot(() => ({ route: currentHash }));
  if (hot && typeof hot.ready === 'function') hot.ready(start);
  else start((hot && hot.data) || {});
})(window);
