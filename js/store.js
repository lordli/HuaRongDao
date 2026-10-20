/*
 * 儲存：自訂關卡、過關紀錄、進行中的盤面、設定。
 * 一律先存在瀏覽器的 localStorage：沒登入時存在「訪客」那一份，
 * 登入後改用那個帳號自己的一份。跟雲端同步的部分在 cloud.js。
 */
(function (root) {
  'use strict';

  const GUEST_KEY = 'huarongdao.v1';
  const ACCOUNT_KEY = 'huarongdao.account';
  const userKey = (uid) => GUEST_KEY + '.u.' + uid;
  const MAX_SAVED = 12;
  const MAX_GONE = 30;
  const MAX_TOMBSTONES = 300;

  /*
   * lastAt、settingsAt、resetAt 和各筆資料的 updatedAt 是給多台裝置合併用的時間戳記：
   * 誰比較新就以誰為準；resetAt 是最後一次「清除過關紀錄」的時間。
   */
  function blank() {
    return { v: 1, custom: [], deleted: {}, progress: {}, saved: {}, last: null, lastAt: 0, settings: {}, settingsAt: {}, resetAt: 0 };
  }

  let data = blank();
  let account = null; // 已登入的帳號 { uid, name, email, photo, method }
  let mode = 'memory';
  let linked = false; // 在 Artifact 檢視器裡連上了 Claude 帳號的雲端資料
  const listeners = new Set();
  const commitListeners = new Set();

  function obj(x) { return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; }
  const num = (x) => (typeof x === 'number' && isFinite(x) ? x : 0);

  /* 固定欄位順序的 JSON，用來比較兩份資料是否相同 */
  function canon(x) {
    if (Array.isArray(x)) return '[' + x.map(canon).join(',') + ']';
    if (x && typeof x === 'object') {
      return '{' + Object.keys(x).filter((k) => x[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + canon(x[k])).join(',') + '}';
    }
    return JSON.stringify(x === undefined ? null : x);
  }

  function sanitize(raw) {
    const d = blank();
    const r = obj(raw);
    if (Array.isArray(r.custom)) d.custom = r.custom.filter((l) => l && typeof l.id === 'string' && Array.isArray(l.pieces));
    d.deleted = obj(r.deleted);
    d.progress = obj(r.progress);
    d.saved = obj(r.saved);
    d.last = typeof r.last === 'string' ? r.last : null;
    d.lastAt = num(r.lastAt);
    d.settings = obj(r.settings);
    d.settingsAt = obj(r.settingsAt);
    d.resetAt = num(r.resetAt);
    return d;
  }

  function readKey(key) {
    try {
      const s = root.localStorage.getItem(key);
      mode = 'local';
      return s ? sanitize(JSON.parse(s)) : null;
    } catch (e) {
      return null;
    }
  }

  function writeKey(key, d) {
    try {
      root.localStorage.setItem(key, JSON.stringify(d));
      if (mode === 'memory') mode = 'local';
    } catch (e) { /* 私密視窗等情況：只留在記憶體 */ }
  }

  function removeKey(key) {
    try { root.localStorage.removeItem(key); } catch (e) { /* 同上 */ }
  }

  const activeKey = () => (account ? userKey(account.uid) : GUEST_KEY);
  function writeLocal() { writeKey(activeKey(), data); }

  function readAccount() {
    try {
      const a = JSON.parse(root.localStorage.getItem(ACCOUNT_KEY) || 'null');
      return a && typeof a.uid === 'string' ? a : null;
    } catch (e) {
      return null;
    }
  }

  /* 兩個版本挑一個：時間較新的優先；同時間時用內容決定，兩台裝置才會挑到同一個 */
  function newer(x, y, at) {
    if (!x) return y;
    if (!y) return x;
    const tx = num(at(x)), ty = num(at(y));
    if (tx !== ty) return tx > ty ? x : y;
    return canon(x) >= canon(y) ? x : y;
  }

  /*
   * 兩份資料合併。結果跟合併的順序無關，重複合併也不會變，
   * 所以各台裝置不管先後，最後都會得到同一份。
   * 關卡取較新的、紀錄取較好的；刪除和「清除過關紀錄」以時間為準。
   */
  function merge(a, b) {
    const out = blank();
    out.resetAt = Math.max(a.resetAt, b.resetAt);
    out.deleted = Object.assign({}, a.deleted);
    for (const id in b.deleted) out.deleted[id] = Math.max(num(out.deleted[id]), num(b.deleted[id]));

    // 只有解題結果不同時（修改時間一樣），保留有解題結果的那份
    const levelAt = (l) => num(l.updatedAt) * 2 + (l.solveStatus ? 1 : 0);
    const byId = new Map();
    for (const l of a.custom.concat(b.custom)) byId.set(l.id, newer(byId.get(l.id), l, levelAt));
    out.custom = Array.from(byId.values())
      .filter((l) => !(num(out.deleted[l.id]) >= num(l.updatedAt) && out.deleted[l.id] != null))
      .sort((p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
    const alive = new Set(out.custom.map((l) => l.id));
    // 已刪除的自訂關卡，紀錄和進行中的局也不留
    const dropped = (k) => k.startsWith('c:') && !alive.has(k.slice(2)) && out.deleted[k.slice(2)] != null;
    // 清除過關紀錄之前的資料不算
    const keep = (e) => (e && typeof e === 'object' && (out.resetAt === 0 || num(e.updatedAt) > out.resetAt) ? e : null);

    const keys = new Set(Object.keys(a.progress).concat(Object.keys(b.progress)));
    keys.forEach((k) => {
      if (dropped(k)) return;
      const x = keep(a.progress[k]), y = keep(b.progress[k]);
      if (!x && !y) return;
      const u = x || {}, v = y || {};
      const best = (p, q) => (p == null ? q : q == null ? p : Math.min(p, q));
      const bestSteps = best(u.bestSteps, v.bestSteps);
      const hintsAt = (z) => (z.bestSteps === bestSteps ? num(z.bestHints) : Infinity);
      const bestHints = Math.min(hintsAt(u), hintsAt(v));
      out.progress[k] = {
        solved: !!(u.solved || v.solved),
        bestSteps: bestSteps == null ? null : bestSteps,
        bestHints: bestHints === Infinity ? 0 : bestHints,
        bestTime: best(u.bestTime, v.bestTime) == null ? null : best(u.bestTime, v.bestTime),
        stars: Math.max(num(u.stars), num(v.stars)),
        updatedAt: Math.max(num(u.updatedAt), num(v.updatedAt)),
      };
    });

    const sk = new Set(Object.keys(a.saved).concat(Object.keys(b.saved)));
    sk.forEach((k) => {
      if (dropped(k)) return;
      const w = newer(keep(a.saved[k]), keep(b.saved[k]), (s) => s.updatedAt);
      if (w) out.saved[k] = w;
    });

    const la = num(a.lastAt), lb = num(b.lastAt);
    const lastOf = (d) => d.last || '';
    const pick = la !== lb ? (la > lb ? a : b) : (lastOf(a) >= lastOf(b) ? a : b);
    out.last = pick.last;
    out.lastAt = Math.max(la, lb);

    const names = new Set(Object.keys(a.settings).concat(Object.keys(b.settings)));
    names.forEach((k) => {
      const ha = Object.prototype.hasOwnProperty.call(a.settings, k), hb = Object.prototype.hasOwnProperty.call(b.settings, k);
      const ta = num(a.settingsAt[k]), tb = num(b.settingsAt[k]);
      const useA = !hb || (ha && (ta !== tb ? ta > tb : canon(a.settings[k]) >= canon(b.settings[k])));
      out.settings[k] = useA ? a.settings[k] : b.settings[k];
      if (Math.max(ta, tb) > 0) out.settingsAt[k] = Math.max(ta, tb);
    });
    return trim(out);
  }

  function trim(d) {
    const byTime = (p, q) => num(q[1].updatedAt) - num(p[1].updatedAt) || (p[0] < q[0] ? -1 : 1);
    const saved = Object.entries(d.saved).sort(byTime);
    d.saved = Object.fromEntries(saved.filter((e) => !e[1].gone).slice(0, MAX_SAVED)
      .concat(saved.filter((e) => e[1].gone).slice(0, MAX_GONE)));
    const dead = Object.entries(d.deleted).sort((p, q) => num(q[1]) - num(p[1]) || (p[0] < q[0] ? -1 : 1));
    d.deleted = Object.fromEntries(dead.slice(0, MAX_TOMBSTONES));
    return d;
  }

  function emit() { listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }); }

  /* kind 'game' 是進行中的局面（每走一步就存），同步時可以晚一點再上傳 */
  function commit(kind) {
    trim(data);
    writeLocal();
    emit();
    commitListeners.forEach((fn) => { try { fn(kind || 'data'); } catch (e) { console.error(e); } });
  }

  function newId() {
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function uniqueName(name, exceptId) {
    const names = new Set(data.custom.filter((l) => l.id !== exceptId).map((l) => l.name));
    if (!names.has(name)) return name;
    for (let n = 2; ; n++) { const cand = name + ' (' + n + ')'; if (!names.has(cand)) return cand; }
  }

  /* 進行中的局結束（過關、重來）時留一筆「已結束」，其他裝置同步時才不會把它帶回來 */
  function endGame(key) {
    const now = Date.now();
    if (data.saved[key]) data.saved[key] = { gone: true, updatedAt: now };
    if (data.last === key) { data.last = null; data.lastAt = now; }
  }

  const live = (s) => (s && !s.gone ? s : null);

  const store = {
    init() {
      account = readAccount();
      data = readKey(activeKey()) || blank();
    },
    mode() { return account || linked ? 'cloud' : mode; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /* 只有本機改了資料才會通知（同步進來的不算），cloud.js 用來排定上傳 */
    onCommit(fn) { commitListeners.add(fn); return () => commitListeners.delete(fn); },

    /* ---------- 帳號 ---------- */
    account() { return account; },
    owner() { return account ? account.uid : null; },
    link(on) { linked = !!on; emit(); },
    /* 換成某個帳號（null 是未登入）：改用那個帳號存在這台裝置的資料 */
    useAccount(acc) {
      const next = acc ? { uid: acc.uid, name: acc.name || '', email: acc.email || '', photo: acc.photo || '', method: acc.method || '' } : null;
      const same = (account && account.uid) === (next && next.uid);
      if (!same) writeLocal();
      account = next;
      try {
        if (account) root.localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
        else root.localStorage.removeItem(ACCOUNT_KEY);
      } catch (e) { /* 同上 */ }
      if (!same) data = readKey(activeKey()) || blank();
      emit();
    },
    /* 登出或刪除帳號後，清掉那個帳號留在這台裝置的資料 */
    forgetAccount(uid) { if (!account || account.uid !== uid) removeKey(userKey(uid)); },
    /* 未登入時在這台裝置留下的關卡和紀錄 */
    guestSummary() {
      const g = readKey(GUEST_KEY) || blank();
      return { levels: g.custom.length, records: Object.values(g.progress).filter((p) => p && p.solved).length };
    },
    /* 把未登入時的資料併進目前的帳號；訪客那份只留下設定 */
    adoptGuest() {
      const g = readKey(GUEST_KEY);
      if (!g || !account) return;
      data = merge(data, g);
      writeKey(GUEST_KEY, Object.assign(blank(), { settings: g.settings, settingsAt: g.settingsAt }));
      commit();
    },

    /* ---------- 給 cloud.js 同步用 ---------- */
    raw() { return JSON.parse(JSON.stringify(data)); },
    merge(a, b) { return merge(sanitize(a), sanitize(b)); },
    same(a, b) { return canon(sanitize(a)) === canon(sanitize(b)); },
    /* 把雲端那份併進來；ahead 表示本機有雲端還沒有的東西 */
    absorb(remote) {
      const incoming = sanitize(remote);
      const merged = merge(data, incoming);
      const changed = canon(merged) !== canon(data);
      data = merged;
      if (changed) { writeLocal(); emit(); }
      return { changed: changed, ahead: canon(merged) !== canon(incoming) };
    },

    /* ---------- 自訂關卡 ---------- */
    customLevels() {
      return data.custom.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    },
    customLevel(id) { return data.custom.find((l) => l.id === id) || null; },

    /* 新增或更新自訂關卡；回傳存好的關卡。 */
    saveLevel(level) {
      const now = Date.now();
      const existing = level.id ? data.custom.find((l) => l.id === level.id) : null;
      const saved = Object.assign({}, level, {
        id: existing ? existing.id : newId(),
        source: 'custom',
        createdAt: existing ? existing.createdAt : now,
        updatedAt: now,
      });
      // 編輯器存檔時不會帶「已發佈到關卡廣場」的標記，沿用原本的
      if (!('publicId' in level) && existing && existing.publicId) saved.publicId = existing.publicId;
      data.custom = data.custom.filter((l) => l.id !== saved.id).concat([saved]);
      commit();
      return saved;
    },
    /* 只更新解題結果，不改「修改時間」。 */
    setSolveResult(id, shape, result) {
      const l = data.custom.find((x) => x.id === id);
      if (!l || (l.shape && l.shape !== shape)) return;
      l.shape = shape;
      l.solvable = result.solvable;
      l.minMoves = result.minMoves;
      l.solveStatus = result.status;
      commit();
    },
    /* 記下這一關發佈到關卡廣場的 id（null 是取消發佈） */
    markPublished(id, publicId) {
      const l = data.custom.find((x) => x.id === id);
      if (!l) return;
      if (publicId) l.publicId = publicId; else delete l.publicId;
      l.updatedAt = Date.now();
      commit();
    },
    deleteLevel(id) {
      const l = data.custom.find((x) => x.id === id);
      if (!l) return null;
      data.custom = data.custom.filter((x) => x.id !== id);
      data.deleted[id] = Math.max(Date.now(), num(l.updatedAt));
      delete data.saved['c:' + id];
      delete data.progress['c:' + id];
      commit();
      return l;
    },
    restoreLevel(level) {
      delete data.deleted[level.id];
      data.custom = data.custom.filter((l) => l.id !== level.id).concat([Object.assign({}, level, { updatedAt: Date.now() })]);
      commit();
    },
    duplicateLevel(id) {
      const l = data.custom.find((x) => x.id === id);
      if (!l) return null;
      const copy = Object.assign({}, JSON.parse(JSON.stringify(l)), { id: null, name: uniqueName(l.name + '（複本）') });
      delete copy.publicId;
      return store.saveLevel(copy);
    },
    /* 匯入多個已檢查過的關卡；同名的自動改名。 */
    importLevels(levels) {
      return levels.map((l) => store.saveLevel(Object.assign({}, l, { id: null, publicId: undefined, name: uniqueName(l.name) })));
    },
    uniqueName,

    /* ---------- 過關紀錄與進行中的局 ---------- */
    progress(key) { return data.progress[key] || null; },
    allProgress() { return data.progress; },
    /* r: { steps, timeMs, stars, hints }。最佳步數相同時，保留用提示較少的那一次 */
    recordWin(key, r) {
      const p = data.progress[key] || { solved: false, bestSteps: null, bestTime: null, stars: 0, bestHints: 0 };
      const hints = r.hints || 0;
      const better = p.bestSteps == null || r.steps < p.bestSteps;
      const replacesBest = better || (r.steps === p.bestSteps && hints < (p.bestHints || 0));
      data.progress[key] = {
        solved: true,
        bestSteps: replacesBest ? r.steps : p.bestSteps,
        bestHints: replacesBest ? hints : (p.bestHints || 0),
        bestTime: p.bestTime == null ? r.timeMs : Math.min(p.bestTime, r.timeMs),
        stars: Math.max(p.stars || 0, r.stars || 0),
        updatedAt: Date.now(),
      };
      endGame(key);
      commit();
      return { newBest: better };
    },

    savedGame(key) { return live(data.saved[key]); },
    saveGame(key, game) {
      const now = Date.now();
      data.saved[key] = Object.assign(JSON.parse(JSON.stringify(game)), { updatedAt: now });
      data.last = key;
      data.lastAt = now;
      commit('game');
    },
    clearGame(key) {
      endGame(key);
      commit('game');
    },
    lastGame() {
      const g = data.last ? live(data.saved[data.last]) : null;
      return g ? { key: data.last, game: g } : null;
    },

    /* ---------- 備份、還原、清除 ---------- */
    snapshot() {
      return JSON.parse(JSON.stringify({ custom: data.custom, deleted: data.deleted, progress: data.progress, saved: data.saved, last: data.last, settings: data.settings }));
    },
    /* 把備份合併進來（不會刪掉現有資料），回傳新增的關卡數與紀錄數 */
    restore(backup) {
      const incoming = sanitize(backup);
      const now = Date.now();
      const beforeIds = new Set(data.custom.map((l) => l.id));
      const beforeKeys = new Set(Object.keys(data.progress));
      incoming.resetAt = 0;
      // 備份裡的關卡就算之後刪過，還原時也要找回來（其他裝置同步時也一樣）
      incoming.custom = incoming.custom.map((l) => {
        const dead = data.deleted[l.id] != null || incoming.deleted[l.id] != null;
        delete data.deleted[l.id];
        delete incoming.deleted[l.id];
        return dead ? Object.assign({}, l, { updatedAt: now }) : l;
      });
      // 清除過的紀錄也要能從備份找回來
      const revive = (e) => (e && typeof e === 'object' && num(e.updatedAt) <= data.resetAt ? Object.assign({}, e, { updatedAt: now }) : e);
      for (const k in incoming.progress) incoming.progress[k] = revive(incoming.progress[k]);
      for (const k in incoming.saved) incoming.saved[k] = revive(incoming.saved[k]);
      // 備份裡的設定蓋過目前的
      for (const k in incoming.settings) incoming.settingsAt[k] = now;
      data = merge(incoming, data);
      commit();
      return {
        levels: data.custom.filter((l) => !beforeIds.has(l.id)).length,
        records: Object.keys(data.progress).filter((k) => !beforeKeys.has(k)).length,
      };
    },
    clearProgress() {
      const now = Date.now();
      data.progress = {};
      data.saved = {};
      data.last = null;
      data.lastAt = now;
      data.resetAt = now;
      commit();
    },

    /* 設定值；預設值與套用方式見 settings.js */
    setting(name) { return data.settings[name]; },
    setSetting(name, value) {
      data.settings[name] = value;
      data.settingsAt[name] = Date.now();
      commit();
    },
  };

  const HRD = root.HRD || (root.HRD = {});
  HRD.store = store;
  if (typeof module !== 'undefined' && module.exports) module.exports = { merge: store.merge, same: store.same, blank: blank, canon: canon };
})(typeof window !== 'undefined' ? window : globalThis);
