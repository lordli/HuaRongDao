/*
 * 帳號與雲端同步。
 * - 在 claude.ai 的 Artifact 檢視器裡：沿用 Claude 帳號，資料存到這位使用者自己的空間。
 * - 部署在 Firebase Hosting：可以用 Google 帳號或電子郵件登入，資料存到 Firestore 的 users/{uid}。
 * - 其他情況：只存在這個瀏覽器。
 * 同步方式：本機一律先存；上傳時在交易裡把「本機 ∪ 雲端」合併後寫回（合併規則見 store.js），
 * 另一台裝置改了資料，會即時併進來。
 */
(function (root) {
  'use strict';
  const t = (s, p) => root.HRD.i18n.t(s, p);
  const HRD = root.HRD;
  const store = HRD.store;
  const { h, toast, dialog, confirmDialog } = HRD.ui;

  const SDK = 'https://www.gstatic.com/firebasejs/12.19.0/';
  const CONFIG_CACHE = 'huarongdao.cloud';
  const PUSH_DELAY = 1500;
  const GAME_DELAY = 20000; // 進行中的局面每走一步都會存，晚一點再一起上傳
  const GONE_WAIT = 4000;
  const MAX_JSON = 700000; // Firestore 一份文件上限 1 MiB，留點空間

  let provider = null; // 'claude' | 'firebase' | null
  let cfg = null;
  let fb = null; // { auth, db, A, F }
  let fbLoading = null;
  let quiet = false; // 自己登出、刪帳號時，不要再跳「已登出」
  let signOutNote = '';
  let status = { state: 'off', at: 0, message: '' }; // off | syncing | synced | offline | error
  const listeners = new Set();

  function emit() { listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }); }
  function setStatus(state, message) {
    status = { state: state, at: state === 'synced' ? Date.now() : status.at, message: message || '' };
    emit();
  }

  /* ---------- 錯誤訊息 ---------- */
  // 錯誤訊息表：用 N() 標記原文，取用時才翻譯（見 errorText）
  const N = (s) => s;
  const ERRORS = {
    'auth/invalid-email': N('電子郵件格式不對。'),
    'auth/missing-email': N('請輸入電子郵件。'),
    'auth/missing-password': N('請輸入密碼。'),
    'auth/weak-password': N('密碼太短，至少要 6 個字元。'),
    'auth/email-already-in-use': N('這個電子郵件已經註冊過了，請直接登入。'),
    'auth/invalid-credential': N('電子郵件或密碼不對。'),
    'auth/invalid-login-credentials': N('電子郵件或密碼不對。'),
    'auth/wrong-password': N('密碼不對。'),
    'auth/user-not-found': N('找不到這個帳號。'),
    'auth/user-disabled': N('這個帳號已經停用。'),
    'auth/too-many-requests': N('嘗試太多次了，請過幾分鐘再試。'),
    'auth/network-request-failed': N('連不上網路，請確認連線後再試一次。'),
    'auth/internal-error': N('登入時發生問題。請確認網路連線，或暫時關掉擋廣告的擴充功能後再試一次。'),
    'auth/popup-blocked': N('瀏覽器擋住了登入視窗，請允許這個網站開啟彈出式視窗後再試一次。'),
    'auth/operation-not-allowed': N('這個登入方式還沒開啟，網站管理者需要到 Firebase 主控台啟用。'),
    'auth/unauthorized-domain': N('這個網址還不能登入，網站管理者需要把網域加進 Firebase 的授權網域。'),
    'auth/account-exists-with-different-credential': N('這個電子郵件已經用其他方式註冊，請改用原本的方式登入。'),
    'auth/requires-recent-login': N('為了安全，請重新登入後再試一次。'),
    'auth/user-mismatch': N('請用目前這個帳號重新登入。'),
    'permission-denied': N('沒有權限讀寫雲端資料，網站管理者需要部署 Firestore 規則。'),
    'failed-precondition': N('雲端資料庫還沒建立好，網站管理者需要建立 Firestore 資料庫。'),
    'resource-exhausted': N('今天的雲端用量已達上限，明天會自動恢復。'),
    'too-big': N('資料太多，雲端存不下；可以刪掉一些自訂關卡後再試。'),
  };
  const SILENT = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled', 'cancelled']);
  function errorText(e) {
    const code = (e && e.code) || '';
    const known = ERRORS[code] || ERRORS[code.replace(/^firestore\//, '')];
    return known ? t(known) : t('發生錯誤，請稍後再試。{text}', { text: code ? t('（{code}）', { code }) : '' });
  }
  const isOffline = (e) => (root.navigator && root.navigator.onLine === false) ||
    /unavailable|network|offline|deadline-exceeded/i.test(((e && e.code) || '') + ' ' + ((e && e.message) || ''));

  /* ---------- 同步引擎（跟用哪一種雲端無關） ---------- */
  // remote: { owner, get(), update(fn), watch?(onData, onError), remove?() }
  let remote = null;
  let unwatch = null;
  let timer = null;
  let dueAt = 0;
  let running = false;
  let again = false;

  const current = (r) => remote === r && store.owner() === r.owner;

  async function attach(r) {
    detach();
    remote = r;
    setStatus('syncing');
    let first;
    try {
      first = await r.get();
      if (!current(r)) return first;
      if (store.absorb(first).ahead) await push(); else setStatus('synced');
    } catch (e) {
      if (current(r)) fail(e);
    }
    if (current(r) && r.watch) {
      unwatch = r.watch((cur) => {
        if (!current(r)) return;
        if (store.absorb(cur).ahead) schedule();
        else if (!running && !timer && status.state !== 'synced') setStatus('synced');
      }, (e) => { if (current(r)) fail(e); });
    }
    return first;
  }

  function detach() {
    if (unwatch) { try { unwatch(); } catch (e) { /* 已經斷了 */ } }
    unwatch = null;
    clearTimeout(timer);
    timer = null;
    remote = null;
    again = false;
    if (status.state !== 'off') setStatus('off');
  }

  /* 排定上傳；已經排了更早的就不延後（連續變更時大約每隔一段時間傳一次） */
  function schedule(delay) {
    if (!remote) return;
    const due = Date.now() + (delay == null ? PUSH_DELAY : delay);
    if (timer && dueAt <= due) return;
    clearTimeout(timer);
    dueAt = due;
    timer = setTimeout(() => { timer = null; push(); }, due - Date.now());
  }

  async function push() {
    const r = remote;
    if (!r || !current(r)) return;
    if (running) { again = true; return; }
    if (r.paused) { schedule(GONE_WAIT); return; }
    clearTimeout(timer);
    timer = null;
    running = true;
    setStatus('syncing');
    const local = store.raw();
    try {
      const merged = await r.update((cur) => store.merge(local, cur));
      if (current(r)) { store.absorb(merged); setStatus('synced'); }
    } catch (e) {
      if (current(r)) fail(e);
    } finally {
      running = false;
      if (again && current(r)) { again = false; push(); }
    }
  }

  function fail(e) {
    if (isOffline(e)) { setStatus('offline'); return; }
    console.warn('雲端同步失敗', e);
    setStatus('error', errorText(e));
  }

  store.onCommit((kind) => { if (remote && current(remote)) schedule(kind === 'game' ? GAME_DELAY : PUSH_DELAY); });

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (timer) push(); return; }
      // 沒有即時通知的雲端（Artifact），回到這個分頁時再抓一次
      const r = remote;
      if (r && !r.watch) r.get().then((cur) => { if (current(r) && store.absorb(cur).ahead) schedule(0); }, () => {});
    });
    root.addEventListener('offline', emit);
    root.addEventListener('online', () => {
      emit();
      if (provider === 'firebase' && !fb && store.account()) loadFirebase().catch(() => {});
      else if (remote && (status.state === 'offline' || status.state === 'error')) push();
    });
  }

  /* ---------- Artifact：Claude 帳號 ---------- */
  async function startClaude() {
    const c = root.claude;
    try {
      const [db, user] = await Promise.all([c.use('db'), c.use('user')]);
      if (!db || !user) return;
      const uid = await user.id();
      if (!uid) return;
      const ref = db.doc('data/users/' + uid + '/huarongdao');
      const read = async () => { const s = await ref.get(); return s.exists ? s.data() : null; };
      provider = 'claude';
      store.link(true);
      await attach({
        owner: store.owner(),
        get: read,
        async update(fn) {
          const cur = await read();
          const next = fn(cur);
          if (!cur || !store.same(next, cur)) await ref.set(JSON.parse(JSON.stringify(next)));
          return next;
        },
      });
    } catch (e) {
      console.warn('雲端同步無法使用，改存在這個瀏覽器', e);
    }
  }

  /* ---------- Firebase ---------- */
  /*
   * 設定從哪裡來：
   * 1. window.HRD_CLOUD_CONFIG 是物件：直接用（例如不是放在 Firebase Hosting 時）。
   * 2. 'auto'（預設）：放在 Firebase Hosting 上時，讀 /__/firebase/init.json。
   * 3. null：不開帳號功能。
   */
  async function findConfig() {
    const c = root.HRD_CLOUD_CONFIG;
    if (c && typeof c === 'object') return c;
    if (c !== 'auto' || !/^https?:$/.test(location.protocol)) return null;
    const host = location.hostname;
    if (host === 'localhost' || /^127\./.test(host) || /(^|\.)storage\.googleapis\.com$/.test(host)) return null;
    let cached = null;
    try { cached = JSON.parse(root.localStorage.getItem(CONFIG_CACHE) || 'null'); } catch (e) { /* 沒有就算了 */ }
    try {
      const res = await fetch('/__/firebase/init.json', { cache: 'no-cache' });
      const j = res.ok ? await res.json() : null;
      const found = j && j.apiKey && j.projectId ? j : null;
      try {
        if (found) root.localStorage.setItem(CONFIG_CACHE, JSON.stringify(found));
        else root.localStorage.removeItem(CONFIG_CACHE);
      } catch (e) { /* 同上 */ }
      return found;
    } catch (e) {
      return cached; // 離線時用上次的設定
    }
  }

  function loadFirebase() {
    if (fbLoading) return fbLoading;
    fbLoading = (async () => {
      const [appMod, A, F] = await Promise.all(['app', 'auth', 'firestore'].map((n) => import(SDK + 'firebase-' + n + '.js')));
      const options = Object.assign({}, cfg);
      const emu = options.emulators;
      delete options.emulators;
      const app = appMod.initializeApp(options);
      const auth = A.getAuth(app);
      auth.languageCode = { 'zh-Hant': 'zh-TW', 'zh-Hans': 'zh-CN', en: 'en' }[HRD.i18n.locale()] || 'zh-TW';
      const db = F.getFirestore(app);
      if (emu && emu.auth) A.connectAuthEmulator(auth, emu.auth, { disableWarnings: true });
      if (emu && emu.firestore) F.connectFirestoreEmulator(db, emu.firestore[0], emu.firestore[1]);
      fb = { auth: auth, db: db, A: A, F: F };
      await auth.authStateReady();
      A.onAuthStateChanged(auth, (u) => { onUser(u).catch((e) => console.error(e)); });
      emit();
      return fb;
    })();
    fbLoading.catch((e) => {
      fbLoading = null;
      console.warn('載入登入元件失敗', e);
      if (store.account()) setStatus('offline');
    });
    return fbLoading;
  }

  function firestoreRemote(uid) {
    const { F, A, db, auth } = fb;
    const ref = F.doc(db, 'users', uid);
    const read = (s) => {
      if (!s.exists()) return null;
      try { return JSON.parse(s.data().json); } catch (e) { return null; }
    };
    let seen = false;
    const self = {
      owner: uid,
      paused: false,
      async get() { const d = read(await F.getDoc(ref)); if (d) seen = true; return d; },
      update(fn) {
        return F.runTransaction(db, async (tx) => {
          const cur = read(await tx.get(ref));
          const next = fn(cur);
          if (!cur || !store.same(next, cur)) {
            const json = JSON.stringify(next);
            if (json.length > MAX_JSON) throw Object.assign(new Error('too big'), { code: 'too-big' });
            tx.set(ref, { v: 1, json: json, updatedAt: F.serverTimestamp() });
          }
          seen = true;
          return next;
        });
      },
      watch(onData, onError) {
        return F.onSnapshot(ref, (s) => {
          if (s.metadata.hasPendingWrites) return;
          const d = read(s);
          if (d || !seen) { if (d) seen = true; onData(d); return; }
          // 雲端資料不見了：可能是在別的裝置刪了帳號（先刪資料、接著刪帳號），
          // 先暫停上傳，等一下再確認帳號還在不在，免得把資料又傳回去
          const u = auth.currentUser;
          if (!u) return;
          self.paused = true;
          setTimeout(() => {
            // 帳號失效時，Firebase 自己就會先登出，所以訊息要先準備好
            signOutNote = t('這個帳號已經刪除或停用，已自動登出');
            A.reload(u).then(() => { signOutNote = ''; self.paused = false; onData(null); }, (e) => {
              if (/user-not-found|user-token-expired|user-disabled/.test(e.code || '')) { if (auth.currentUser) A.signOut(auth); return; }
              signOutNote = '';
              self.paused = false;
              onData(null);
            });
          }, GONE_WAIT);
        }, onError);
      },
      remove() { return F.deleteDoc(ref); },
    };
    return self;
  }

  function accountOf(u) {
    const method = u.providerData.some((p) => p.providerId === 'google.com') ? 'google' : 'password';
    return { uid: u.uid, name: u.displayName || (u.email || '').split('@')[0] || t('玩家'), email: u.email || '', photo: u.photoURL || '', method: method };
  }

  async function onUser(u) {
    const prev = store.account();
    if (!u) {
      if (!prev) return;
      detach();
      store.useAccount(null);
      store.forgetAccount(prev.uid);
      if (!quiet) toast(signOutNote || t('已登出帳號，現在資料只存在這個瀏覽器'));
      signOutNote = '';
      return;
    }
    const acc = accountOf(u);
    const fresh = !prev || prev.uid !== acc.uid;
    // 從「未登入」換成登入時，才問要不要把這台裝置的資料加進帳號
    const guest = !prev ? store.guestSummary() : null;
    store.useAccount(acc);
    if (!fresh && remote && remote.owner === acc.uid) return;
    const first = await attach(firestoreRemote(acc.uid));
    if (!fresh) return;
    if (guest && (guest.levels || guest.records)) await offerGuest(guest, first);
    else toast(t('已登入：{name}', { name: acc.name }));
  }

  async function offerGuest(g, remoteData) {
    const what = [g.levels ? t('{levels} 個自訂關卡', { levels: g.levels }) : '', g.records ? t('{records} 筆過關紀錄', { records: g.records }) : ''].filter(Boolean).join(t('、'));
    const hasData = remoteData && ((remoteData.custom || []).length || Object.keys(remoteData.progress || {}).length);
    if (!hasData) {
      store.adoptGuest();
      toast(t('已登入，並把這台裝置的 {what} 存進帳號', { what }));
      return;
    }
    const ok = await dialog({
      title: t('要把這台裝置的資料加進帳號嗎？'),
      message: t('登入前，你在這台裝置留下了 {what}。加進帳號後，在其他裝置登入也看得到；同一關的紀錄會保留比較好的成績。', { what }),
      actions: [{ label: t('先不要'), value: false }, { label: t('加進帳號'), value: true, primary: true }],
    });
    if (ok && store.account()) { store.adoptGuest(); toast(t('已把 {what} 加進帳號', { what })); }
    else toast(t('已登入。這台裝置原本的資料會留著，登出後就會看到'));
  }

  /* ---------- 登入、登出、刪除帳號 ---------- */
  function googleLogo() {
    const NS = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 48 48');
    s.setAttribute('width', '20');
    s.setAttribute('height', '20');
    s.setAttribute('aria-hidden', 'true');
    [['#EA4335', 'M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z'],
      ['#4285F4', 'M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z'],
      ['#FBBC05', 'M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z'],
      ['#34A853', 'M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z']]
      .forEach(([fill, d]) => { const p = document.createElementNS(NS, 'path'); p.setAttribute('fill', fill); p.setAttribute('d', d); s.appendChild(p); });
    return s;
  }

  function signInDialog() {
    if (provider !== 'firebase') return Promise.resolve(false);
    const ready = loadFirebase();
    const msg = h('p', { class: 'auth-msg', role: 'status', 'aria-live': 'polite' });
    const say = (text, bad) => { msg.textContent = text || ''; msg.classList.toggle('is-error', !!bad); };
    const googleBtn = h('button', { type: 'button', class: 'btn btn-secondary btn-google', disabled: true }, googleLogo(), h('span', {}, t('用 Google 帳號登入')));
    const email = h('input', { type: 'email', id: 'auth-email', class: 'input', autocomplete: 'username', inputmode: 'email', spellcheck: 'false' });
    const pw = h('input', { type: 'password', id: 'auth-password', class: 'input', autocomplete: 'current-password', 'aria-describedby': 'auth-password-note' });
    const signInBtn = h('button', { type: 'submit', class: 'btn btn-primary', disabled: true }, t('登入'));
    const signUpBtn = h('button', { type: 'button', class: 'btn btn-secondary', disabled: true }, t('建立新帳號'));
    const forgotBtn = h('button', { type: 'button', class: 'text-btn', disabled: true }, t('忘記密碼？'));
    const buttons = [googleBtn, signInBtn, signUpBtn, forgotBtn];
    let busy = true;
    const setBusy = (b) => { busy = b; buttons.forEach((x) => { x.disabled = b; }); };
    let closeDialog = null;

    async function run(task, okMessage) {
      if (busy) return;
      setBusy(true);
      say('');
      try {
        await ready;
        await task();
        if (okMessage) { say(okMessage); setBusy(false); } else closeDialog(true);
      } catch (e) {
        setBusy(false);
        if (!SILENT.has(e && e.code)) say(errorText(e), true);
      }
    }
    const creds = () => {
      const e = email.value.trim(), p = pw.value;
      if (!e) throw { code: 'auth/missing-email' };
      if (!p) throw { code: 'auth/missing-password' };
      return [e, p];
    };

    googleBtn.addEventListener('click', () => {
      if (busy || !fb) return;
      // 一點下去就要開視窗，不然會被瀏覽器當成廣告擋掉
      const provider = new fb.A.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const p = fb.A.signInWithPopup(fb.auth, provider);
      run(() => p);
    });
    const form = h('form', { class: 'auth-form', novalidate: true },
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'auth-email' }, t('電子郵件')), email),
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'auth-password' }, t('密碼')), pw,
        h('p', { class: 'field-note', id: 'auth-password-note' }, t('建立新帳號時，密碼至少要 6 個字元。'))),
      h('div', { class: 'btn-row' }, signInBtn, signUpBtn, forgotBtn));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      run(() => { const [a, b] = creds(); return fb.A.signInWithEmailAndPassword(fb.auth, a, b); });
    });
    signUpBtn.addEventListener('click', () => {
      run(async () => {
        const [a, b] = creds();
        if (b.length < 6) throw { code: 'auth/weak-password' };
        await fb.A.createUserWithEmailAndPassword(fb.auth, a, b);
      });
    });
    forgotBtn.addEventListener('click', () => {
      run(() => {
        const a = email.value.trim();
        if (!a) throw { code: 'auth/missing-email' };
        return fb.A.sendPasswordResetEmail(fb.auth, a);
      }, t('如果這個電子郵件有註冊過，重設密碼的信已經寄出，請到信箱收信。'));
    });

    ready.then(() => { setBusy(false); say(''); }, () => say(t('登入元件載入失敗，請確認網路連線後再開一次。'), true));
    say(t('載入中…'));

    return dialog({
      title: t('登入華容道'),
      body: (close) => {
        closeDialog = close;
        return h('div', { class: 'auth-box' },
          h('p', { class: 'dialog-text' }, t('登入後，自訂關卡、過關紀錄和設定會存進你的帳號，換手機或電腦登入同一個帳號就能接著玩。')),
          googleBtn,
          h('div', { class: 'auth-or', role: 'presentation' }, h('span', {}, t('或用電子郵件'))),
          form, msg);
      },
      actions: [],
    }).then((v) => v === true);
  }

  /* 等上傳完成（最多等幾秒），回傳是否已同步 */
  async function settle(ms) {
    if (!remote) return status.state === 'synced';
    if (timer || status.state !== 'synced') push();
    const end = Date.now() + ms;
    while (Date.now() < end && (running || timer)) await new Promise((r) => setTimeout(r, 120));
    return status.state === 'synced';
  }

  async function signOut() {
    const acc = store.account();
    if (!acc) return;
    if (!fb) {
      try { await loadFirebase(); } catch (e) { toast(t('目前連不上網路，連線後再登出')); return; }
    }
    const synced = await settle(5000);
    const ok = await confirmDialog(t('要登出嗎？'), synced
      ? t('登出後，這台裝置會回到未登入的狀態。帳號裡的關卡和紀錄都會保留，下次登入就會回來。')
      : t('還有變更沒有存進雲端（{statusText}）。現在登出，這些變更會遺失。', { statusText: statusText() }), t('登出'), !synced);
    if (!ok) return;
    quiet = true;
    try {
      await fb.A.signOut(fb.auth);
      await onUser(null);
      toast(t('已登出'));
    } finally {
      quiet = false;
    }
  }

  function askPassword(title) {
    const input = h('input', { type: 'password', id: 'reauth-password', class: 'input', autocomplete: 'current-password', autofocus: true });
    return dialog({
      title: title,
      body: h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'reauth-password' }, t('密碼')), input),
      actions: [{ label: t('取消'), value: null }, { label: t('確認'), primary: true, onClick: (close) => { close(input.value); return false; } }],
    });
  }

  /* 刪帳號這種動作需要最近登入過；太久沒登入就先確認身分 */
  async function confirmIdentity(u) {
    const last = Date.parse(u.metadata.lastSignInTime || '') || 0;
    if (Date.now() - last < 4 * 60 * 1000) return;
    const { A } = fb;
    if (u.providerData.some((p) => p.providerId === 'google.com')) {
      await A.reauthenticateWithPopup(u, new A.GoogleAuthProvider());
      return;
    }
    const pw = await askPassword(t('請輸入密碼確認是你本人'));
    if (!pw) throw { code: 'cancelled' };
    await A.reauthenticateWithCredential(u, A.EmailAuthProvider.credential(u.email, pw));
  }

  async function deleteAccount() {
    const acc = store.account();
    if (!acc || !fb || !fb.auth.currentUser) return;
    const ok = await dialog({
      title: t('永久刪除帳號？'),
      message: t('帳號，以及存在雲端的自訂關卡、過關紀錄和設定都會永久刪除，沒辦法復原。想留一份的話，請先用下方的「備份全部資料」。'),
      actions: [{ label: t('取消'), value: false }, { label: t('永久刪除帳號'), value: true, danger: true }],
    });
    if (!ok) return;
    const u = fb.auth.currentUser;
    try {
      await confirmIdentity(u);
      const r = firestoreRemote(u.uid);
      quiet = true;
      detach();
      await r.remove();
      await fb.A.deleteUser(u);
      await onUser(null);
      toast(t('帳號已刪除'));
    } catch (e) {
      if (!SILENT.has(e && e.code)) toast(t('刪除沒有完成：{errorText}', { errorText: errorText(e) }));
      if (fb.auth.currentUser && store.account() && !remote) attach(firestoreRemote(fb.auth.currentUser.uid));
    } finally {
      quiet = false;
    }
  }

  /* ---------- 給畫面用 ---------- */
  function ago(ts) {
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 45) return t('剛剛');
    if (s < 3600) return t('{n} 分鐘前', { n: Math.round(s / 60) });
    return HRD.ui.formatDate(ts);
  }

  /* 斷線時，正在等的上傳會一直重試；畫面上直接說「離線」比較清楚 */
  function currentStatus() {
    const off = root.navigator && root.navigator.onLine === false;
    if (off && remote && (status.state === 'syncing' || timer)) return Object.assign({}, status, { state: 'offline' });
    return status;
  }

  function statusText() {
    const s = currentStatus();
    if (s.state === 'syncing') return t('同步中…');
    if (s.state === 'synced') return t('已同步{text}', { text: s.at ? ' · ' + ago(s.at) : '' });
    if (s.state === 'offline') return t('目前離線，連上網路後會自動同步');
    if (s.state === 'error') return t('同步失敗：{message}', { message: s.message });
    return store.account() ? t('準備同步…') : '';
  }

  /* 頭像：有照片用照片，沒有就用名字的第一個字 */
  function avatar(acc, size) {
    const box = h('span', { class: 'avatar', style: { width: size + 'px', height: size + 'px' }, 'aria-hidden': 'true' });
    const letter = () => { box.textContent = Array.from(acc.name || acc.email || '?')[0].toUpperCase(); };
    if (acc.photo) {
      const img = h('img', { src: acc.photo, alt: '', referrerpolicy: 'no-referrer', width: size, height: size });
      img.addEventListener('error', () => { img.remove(); letter(); });
      box.appendChild(img);
    } else letter();
    return box;
  }

  let markReady;
  const known = new Promise((r) => { markReady = r; });

  async function init() {
    try {
      if (root.claude && typeof root.claude.use === 'function') { await startClaude(); emit(); return; }
      cfg = await findConfig();
      provider = cfg ? 'firebase' : null;
      emit();
      if (cfg && store.account()) loadFirebase().catch(() => {});
    } finally {
      markReady();
    }
  }

  /* 需要登入才能做的事：還沒登入就先開登入視窗；回傳目前的 Firebase 使用者（取消就是 null） */
  async function requireUser(reason) {
    if (provider !== 'firebase') return null;
    if (store.account()) {
      const f = await loadFirebase();
      if (f.auth.currentUser) return f.auth.currentUser;
    }
    if (reason) toast(reason);
    const ok = await signInDialog();
    if (!ok || !fb) return null;
    await fb.auth.authStateReady();
    return fb.auth.currentUser;
  }

  HRD.cloud = {
    init,
    /* 知道這個網站有沒有帳號功能之後才會 resolve */
    ready: () => known,
    /* 關卡廣場等功能共用的 Firebase（沒登入也能讀） */
    firebase: () => (provider === 'firebase' ? loadFirebase() : Promise.reject(Object.assign(new Error('no cloud'), { code: 'no-cloud' }))),
    currentUser: () => (fb && fb.auth.currentUser) || null,
    requireUser,
    errorText,
    provider: () => provider,
    canSignIn: () => provider === 'firebase',
    status: currentStatus,
    statusText,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    signInDialog,
    signOut,
    deleteAccount,
    syncNow() { if (remote) push(); else if (provider === 'firebase' && store.account()) loadFirebase().catch(() => toast(t('目前連不上網路'))); },
    avatar,
  };
})(window);
