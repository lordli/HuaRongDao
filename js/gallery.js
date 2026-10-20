/*
 * 關卡廣場：玩家發佈的關卡（Firestore 的 levels 集合）。
 * - 文件 id 由盤面算出來（左右翻轉視為同一個盤面），同一個盤面只能發佈一次。
 * - 讚、過關人數、檢舉次數由 firestore.rules 檢查，只能跟著對應的文件一起變動。
 * - 打開過的關卡會暫存在這台裝置，重新整理或離線時也能繼續玩。
 */
(function (root) {
  'use strict';
  const t = (s, p) => root.HRD.i18n.t(s, p);
  const HRD = root.HRD || (root.HRD = {});
  const E = HRD.engine || require('./engine.js');

  const CACHE_KEY = 'huarongdao.gallery';
  const MAX_CACHE = 60;
  const PAGE = 24;
  const HIDE_REPORTS = 3; // 被檢舉這麼多次就先從列表藏起來

  /* ---------- 盤面 id ---------- */
  function mirror(st) {
    const exit = st.exit.side === 'left' ? { side: 'right', at: st.exit.at }
      : st.exit.side === 'right' ? { side: 'left', at: st.exit.at }
      : { side: st.exit.side, at: st.cols - 2 - st.exit.at };
    return E.makeState(st.cols, st.rows, exit, st.pieces.map((p) => Object.assign({}, p, { x: st.cols - p.x - p.w })));
  }

  /* 左右翻轉後一樣的盤面算同一個 */
  function layoutKey(level) {
    const st = E.levelToState(level);
    const a = E.shapeKey(st), b = E.shapeKey(mirror(st));
    return a < b ? a : b;
  }

  /* FNV-1a 64 位元雜湊，轉成 13 個字的 base36 */
  function layoutId(level) {
    const key = layoutKey(level);
    const P = BigInt('0x100000001b3'), M = (BigInt(1) << BigInt(64)) - BigInt(1);
    let h = BigInt('0xcbf29ce484222325');
    for (let i = 0; i < key.length; i++) { h ^= BigInt(key.charCodeAt(i)); h = (h * P) & M; }
    return h.toString(36).padStart(13, '0');
  }

  /* 跟哪一個內建關卡同一個盤面（沒有就是 null） */
  function builtinMatch(level) {
    const key = layoutKey(level);
    return (HRD.levels ? HRD.levels.LEVELS : require('./levels.js').LEVELS).find((l) => layoutKey(l) === key) || null;
  }

  if (typeof module !== 'undefined' && module.exports && typeof window === 'undefined') {
    module.exports = { layoutId, layoutKey, builtinMatch };
    return;
  }

  const { h, icon, toast, dialog, confirmDialog } = HRD.ui;
  const C = () => HRD.cloud;

  /* ---------- 暫存 ---------- */
  function readCache() {
    try { return JSON.parse(root.localStorage.getItem(CACHE_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  let cache = readCache();
  function remember(id, d) {
    cache[id] = { code: d.code, description: d.description || '', authorName: d.authorName || '', authorUid: d.authorUid || '', minMoves: d.minMoves, difficulty: d.difficulty, seen: Date.now() };
    const ids = Object.keys(cache).sort((a, b) => cache[b].seen - cache[a].seen);
    ids.slice(MAX_CACHE).forEach((k) => { delete cache[k]; });
    try { root.localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) { /* 存不了就算了 */ }
  }
  function forget(id) {
    delete cache[id];
    try { root.localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) { /* 同上 */ }
  }

  /* 廣場文件 → 可以玩的關卡 */
  function toLevel(id, d) {
    const lv = HRD.share.decode(d.code);
    return Object.assign(lv, {
      description: d.description || '',
      minMoves: d.minMoves,
      difficulty: d.difficulty || E.difficultyFor(d.minMoves),
      author: d.authorName || '',
      authorUid: d.authorUid || '',
      publicId: id,
      source: 'public',
      category: 'public',
    });
  }

  function cached(id) {
    const d = cache[id];
    if (!d) return null;
    try { return toLevel(id, d); } catch (e) { return null; }
  }

  /* ---------- Firestore ---------- */
  async function fs() {
    const fb = await C().firebase();
    return { F: fb.F, db: fb.db };
  }
  const levelRef = (F, db, id) => F.doc(db, 'levels', id);

  function item(snap) {
    const d = snap.data();
    let level = null;
    try { level = toLevel(snap.id, d); } catch (e) { return null; }
    return { id: snap.id, data: d, level: level };
  }

  /* sort：new 最新、likes 最多讚、clears 最多人過關；search：名稱開頭 */
  async function list(opts) {
    const o = opts || {};
    const { F, db } = await fs();
    const col = F.collection(db, 'levels');
    const parts = [];
    if (o.search) parts.push(F.orderBy('name'), F.startAt(o.search), F.endAt(o.search + ''));
    else parts.push(F.orderBy(o.sort === 'likes' ? 'likes' : o.sort === 'clears' ? 'clears' : 'createdAt', 'desc'));
    if (o.after) parts.push(F.startAfter(o.after));
    parts.push(F.limit(PAGE));
    const snap = await F.getDocs(F.query(col, ...parts));
    const me = C().currentUser();
    const items = snap.docs.map(item).filter((x) => x && (x.data.reports < HIDE_REPORTS || (me && x.data.authorUid === me.uid)));
    return { items: items, next: snap.docs.length === PAGE ? snap.docs[snap.docs.length - 1] : null };
  }

  async function mine() {
    const { F, db } = await fs();
    const u = C().currentUser();
    if (!u) return [];
    const snap = await F.getDocs(F.query(F.collection(db, 'levels'), F.where('authorUid', '==', u.uid)));
    return snap.docs.map(item).filter(Boolean).sort((a, b) => millis(b.data.createdAt) - millis(a.data.createdAt));
  }

  async function get(id) {
    const { F, db } = await fs();
    const snap = await F.getDoc(levelRef(F, db, id));
    if (!snap.exists()) { forget(id); return null; }
    const x = item(snap);
    if (x) remember(id, x.data);
    return x;
  }

  function millis(ts) { return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0; }

  /* 公開名稱：發佈關卡、過關紀錄上顯示的名字 */
  function publicName() {
    const n = HRD.store.setting('publicName');
    const acc = HRD.store.account();
    return String(n || (acc && acc.name) || t('玩家')).slice(0, 20);
  }

  async function publish(level, info) {
    const u = C().currentUser();
    if (!u) throw Object.assign(new Error('not signed in'), { code: 'auth/requires-recent-login' });
    const { F, db } = await fs();
    const id = layoutId(level);
    const named = Object.assign({}, level, { name: info.name, difficultySet: true, difficulty: level.difficulty || E.difficultyFor(level.minMoves) });
    const st = E.levelToState(named);
    const data = {
      code: HRD.share.encode(named),
      name: info.name,
      description: info.description || '',
      authorUid: u.uid,
      authorName: info.authorName,
      cols: st.cols,
      rows: st.rows,
      minMoves: level.minMoves,
      difficulty: named.difficulty,
      likes: 0, clears: 0, reports: 0,
      createdAt: F.serverTimestamp(),
      updatedAt: F.serverTimestamp(),
    };
    const ref = levelRef(F, db, id);
    await F.runTransaction(db, async (tx) => {
      const cur = await tx.get(ref);
      if (cur.exists()) throw Object.assign(new Error('exists'), { code: 'exists', id: id, name: cur.data().name, mine: cur.data().authorUid === u.uid });
      tx.set(ref, data);
    });
    remember(id, Object.assign({}, data, { createdAt: null, updatedAt: null }));
    return id;
  }

  async function update(id, level, info) {
    const { F, db } = await fs();
    const named = Object.assign({}, level, { name: info.name, difficultySet: true });
    const patch = { code: HRD.share.encode(named), name: info.name, description: info.description || '', authorName: info.authorName, updatedAt: F.serverTimestamp() };
    await F.updateDoc(levelRef(F, db, id), patch);
    if (cache[id]) remember(id, Object.assign({}, cache[id], patch));
  }

  /* 取消發佈：連同按讚和過關紀錄一起刪掉 */
  async function unpublish(id) {
    const { F, db } = await fs();
    const ref = levelRef(F, db, id);
    const [likes, records] = await Promise.all([F.getDocs(F.collection(ref, 'likes')), F.getDocs(F.collection(ref, 'records'))]);
    const refs = likes.docs.concat(records.docs).map((d) => d.ref);
    for (let i = 0; i < refs.length; i += 400) {
      const b = F.writeBatch(db);
      refs.slice(i, i + 400).forEach((r) => b.delete(r));
      await b.commit();
    }
    await F.deleteDoc(ref);
    forget(id);
    HRD.store.customLevels().filter((l) => l.publicId === id).forEach((l) => HRD.store.markPublished(l.id, null));
  }

  async function liked(id) {
    if (!HRD.store.account()) return false;
    const { F, db } = await fs();
    const u = C().currentUser();
    if (!u) return false;
    return (await F.getDoc(F.doc(db, 'levels', id, 'likes', u.uid))).exists();
  }

  async function setLike(id, on) {
    const u = C().currentUser();
    const { F, db } = await fs();
    const b = F.writeBatch(db);
    const likeRef = F.doc(db, 'levels', id, 'likes', u.uid);
    if (on) b.set(likeRef, { at: F.serverTimestamp() }); else b.delete(likeRef);
    b.update(levelRef(F, db, id), { likes: F.increment(on ? 1 : -1) });
    await b.commit();
  }

  /* 過關後送出成績；回傳 { status: 'first' | 'better' | 'kept' | 'signed-out', clears } */
  async function submitRecord(id, r) {
    if (!HRD.store.account()) return { status: 'signed-out' };
    const { F, db } = await fs();
    const u = C().currentUser();
    if (!u) return { status: 'signed-out' };
    const ref = levelRef(F, db, id);
    const recRef = F.doc(db, 'levels', id, 'records', u.uid);
    return F.runTransaction(db, async (tx) => {
      const [lv, cur] = [await tx.get(ref), await tx.get(recRef)];
      if (!lv.exists()) throw Object.assign(new Error('gone'), { code: 'not-found' });
      const rec = { name: publicName(), steps: r.steps, timeMs: Math.round(r.timeMs), hints: r.hints || 0, at: F.serverTimestamp() };
      const clears = lv.data().clears;
      if (!cur.exists()) {
        tx.set(recRef, rec);
        tx.update(ref, { clears: F.increment(1) });
        return { status: 'first', clears: clears + 1 };
      }
      const old = cur.data();
      if (r.steps < old.steps || (r.steps === old.steps && r.timeMs < old.timeMs)) {
        tx.set(recRef, rec);
        return { status: 'better', clears: clears };
      }
      return { status: 'kept', clears: clears };
    });
  }

  async function topRecords(id, n) {
    const { F, db } = await fs();
    const snap = await F.getDocs(F.query(F.collection(db, 'levels', id, 'records'), F.orderBy('steps'), F.limit(n * 2)));
    return snap.docs.map((d) => Object.assign({ uid: d.id }, d.data()))
      .sort((a, b) => a.steps - b.steps || a.timeMs - b.timeMs).slice(0, n);
  }

  async function report(id, reason) {
    const u = C().currentUser();
    const { F, db } = await fs();
    const b = F.writeBatch(db);
    b.set(F.doc(db, 'reports', id + '_' + u.uid), { level: id, reason: reason || '', at: F.serverTimestamp() });
    b.update(levelRef(F, db, id), { reports: F.increment(1) });
    await b.commit();
  }

  /* ---------- 對話框 ---------- */
  function errorText(e) {
    if (e && e.code === 'exists') return e.mine ? t('你已經發佈過這個盤面了。') : t('這個盤面已經有人發佈過了（「{name}」）。', { name: e.name });
    if (e && e.code === 'not-found') return t('這一關已經下架了。');
    if (e && e.code === 'already-exists') return t('你已經檢舉過這一關了。');
    return C().errorText(e);
  }

  function field(label, input, note) {
    return h('div', { class: 'field' }, h('label', { class: 'field-label', for: input.id }, label), input,
      note ? h('p', { class: 'field-note' }, note) : null);
  }

  /* 確認關卡可以解、知道最少步數 */
  async function ensureSolved(level) {
    if (level.solvable === true && level.minMoves != null) return level;
    const r = await E.solveAsync(E.levelToState(level), { maxStates: 600000 });
    if (r.status !== 'solved') return null;
    return Object.assign({}, level, { solvable: true, minMoves: r.minMoves });
  }

  async function publishDialog(local) {
    if (!C().canSignIn()) { toast(t('這個網站沒有開啟關卡廣場')); return; }
    const twin = builtinMatch(local);
    if (twin) {
      await dialog({ title: t('不能發佈這一關'), message: t('這個盤面跟內建關卡「{name}」一樣（左右翻轉也算），換一個盤面再發佈吧。', { name: twin.name }) });
      return;
    }
    const u = await C().requireUser(t('發佈關卡要先登入'));
    if (!u) return;
    const level = await ensureSolved(local);
    if (!level) {
      await dialog({ title: t('不能發佈這一關'), message: t('這一關沒有解（或變化太多，算不出最少步數），只能發佈確定可以過關的關卡。') });
      return;
    }
    const name = h('input', { id: 'pub-name', class: 'input', maxlength: '30', value: level.name, autocomplete: 'off' });
    const desc = h('textarea', { id: 'pub-desc', class: 'input', rows: 3, maxlength: '200', placeholder: t('給挑戰者的一句話（可不填）') });
    desc.value = level.description || '';
    const author = h('input', { id: 'pub-author', class: 'input', maxlength: '20', value: publicName(), autocomplete: 'nickname' });
    const msg = h('p', { class: 'auth-msg', role: 'status', 'aria-live': 'polite' });
    let busy = false;
    const id = await dialog({
      title: t('發佈到關卡廣場'),
      body: h('div', { class: 'auth-form' },
        h('p', { class: 'dialog-text' }, t('發佈後，所有人都能在關卡廣場看到並挑戰這一關（最少 {minMoves} 步），也會看到你的公開名稱。之後可以隨時取消發佈。', { minMoves: level.minMoves })),
        field(t('關卡名稱'), name), field(t('說明'), desc), field(t('公開名稱'), author, t('顯示在關卡和過關紀錄上，不會顯示電子郵件。')), msg),
      actions: [
        { label: t('取消'), value: null },
        {
          label: t('發佈'), primary: true, onClick: (close) => {
            if (busy) return false;
            const info = { name: name.value.trim(), description: desc.value.trim(), authorName: author.value.trim() };
            if (!info.name) { msg.textContent = t('請輸入關卡名稱。'); msg.classList.add('is-error'); name.focus(); return false; }
            if (!info.authorName) { msg.textContent = t('請輸入公開名稱。'); msg.classList.add('is-error'); author.focus(); return false; }
            busy = true;
            msg.classList.remove('is-error');
            msg.textContent = t('發佈中…');
            publish(level, info).then((newId) => {
              HRD.store.setSetting('publicName', info.authorName);
              if (local.id) HRD.store.markPublished(local.id, newId);
              close(newId);
            }, (e) => {
              busy = false;
              msg.classList.add('is-error');
              msg.textContent = errorText(e);
              if (e && e.code === 'exists') msg.appendChild(h('a', { href: '#/g/' + e.id, class: 'msg-link', onclick: () => close(null) }, t('去看看')));
            });
            return false;
          },
        },
      ],
    });
    if (id) toast(t('已發佈「{trim}」', { trim: name.value.trim() }), { label: t('查看'), run: () => HRD.app.go('#/g/' + id) });
    return id;
  }

  async function editDialog(id, level) {
    const name = h('input', { id: 'pub-name', class: 'input', maxlength: '30', value: level.name, autocomplete: 'off' });
    const desc = h('textarea', { id: 'pub-desc', class: 'input', rows: 3, maxlength: '200' });
    desc.value = level.description || '';
    const author = h('input', { id: 'pub-author', class: 'input', maxlength: '20', value: level.author || publicName() });
    const msg = h('p', { class: 'auth-msg', role: 'status', 'aria-live': 'polite' });
    return dialog({
      title: t('編輯關卡資訊'),
      body: h('div', { class: 'auth-form' }, field(t('關卡名稱'), name), field(t('說明'), desc), field(t('公開名稱'), author), msg),
      actions: [
        { label: t('取消'), value: false },
        {
          label: t('儲存'), primary: true, onClick: (close) => {
            const info = { name: name.value.trim(), description: desc.value.trim(), authorName: author.value.trim() };
            if (!info.name || !info.authorName) { msg.textContent = t('名稱不能空白。'); msg.classList.add('is-error'); return false; }
            msg.textContent = t('儲存中…');
            update(id, level, info).then(() => close(true), (e) => { msg.classList.add('is-error'); msg.textContent = errorText(e); });
            return false;
          },
        },
      ],
    });
  }

  /* 從我的關卡挑一個來發佈 */
  async function pickDialog() {
    const all = HRD.store.customLevels();
    if (!all.length) {
      const go = await dialog({ title: t('還沒有自訂關卡'), message: t('先用關卡編輯器排一個盤面，存起來之後就能發佈到關卡廣場。'), actions: [{ label: t('取消'), value: false }, { label: t('開啟關卡編輯器'), value: true, primary: true }] });
      if (go) HRD.app.go('#/edit/new');
      return;
    }
    const picked = await dialog({
      title: t('選一個關卡發佈'),
      wide: true,
      body: (close) => h('ul', { class: 'pick-list' }, all.map((l) => {
        const ok = l.solvable === true;
        return h('li', { class: 'pick-row' },
          h('div', { class: 'pick-thumb' }, HRD.thumb(l, null, 72)),
          h('div', { class: 'pick-text' }, h('strong', {}, l.name),
            h('span', { class: 'muted' }, l.publicId ? t('已發佈') : ok ? t('最少 {minMoves} 步', { minMoves: l.minMoves }) : l.solvable === false ? t('沒有解，不能發佈') : t('還在計算最少步數'))),
          l.publicId
            ? h('a', { class: 'btn btn-secondary btn-sm', href: '#/g/' + l.publicId, onclick: () => close(null) }, t('查看'))
            : h('button', { type: 'button', class: 'btn btn-primary btn-sm', disabled: !ok, onclick: () => close(l) }, t('發佈')));
      })),
      actions: [],
    });
    if (picked) return publishDialog(picked);
  }

  async function reportDialog(id) {
    const u = await C().requireUser(t('檢舉要先登入'));
    if (!u) return;
    const reasons = [t('名稱或說明不恰當'), t('跟其他關卡重複'), t('其他')];
    const group = h('div', { class: 'report-reasons', role: 'radiogroup', 'aria-label': t('原因') }, reasons.map((r, i) =>
      h('label', { class: 'radio-row' }, h('input', { type: 'radio', name: 'report-reason', value: r, checked: i === 0 }), h('span', {}, r))));
    const ok = await dialog({
      title: t('檢舉這個關卡'),
      body: h('div', { class: 'auth-form' }, h('p', { class: 'dialog-text' }, t('被多位玩家檢舉的關卡會先從列表隱藏，等管理者確認。')), group),
      actions: [{ label: t('取消'), value: false }, { label: t('送出檢舉'), value: true, danger: true }],
    });
    if (!ok) return;
    const reason = (group.querySelector('input:checked') || {}).value || '';
    try { await report(id, reason); toast(t('已送出檢舉，謝謝你')); }
    catch (e) { toast(e && e.code === 'permission-denied' ? t('你已經檢舉過這一關了') : errorText(e)); }
  }

  HRD.gallery = {
    PAGE, layoutId, layoutKey, builtinMatch,
    available: () => !!(HRD.cloud && HRD.cloud.canSignIn()),
    cached, get, list, mine, publish, update, unpublish, liked, setLike, submitRecord, topRecords, report,
    publicName, publishDialog, editDialog, pickDialog, reportDialog, errorText, millis,
  };
})(typeof window !== 'undefined' ? window : globalThis);
