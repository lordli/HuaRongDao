/*
 * 分享碼：把一個關卡壓成一行文字，可以貼給朋友或放進網址。
 *
 * 標準盤面（4 × 5、出口在下方中央）：
 *   HRD1-<盤面 20 字元>-<其他資料>-<檢查碼 4 字元>
 * 其他大小或出口位置：
 *   HRD2-<欄><列><出口邊 B/T/L/R><出口位置>-<盤面 欄×列 字元>-<其他資料>-<檢查碼>
 *   例如 HRD2-55R1-… 是 5 × 5、出口在右側第 2–3 列。
 *
 *   盤面：由左上到右下，每格一個字元，同一顆棋子同一個字母，「.」是空格。
 *   其他資料：{n 名稱, d 難度, l 和預設不同的棋子文字} 的 JSON，UTF-8 後轉 Base64URL。
 *   （說明文字不放進來，分享碼才夠短；解碼時仍接受 s 欄位。）
 *   檢查碼：前面幾段的雜湊，抄錯或被截斷時可以發現。
 */
(function (root) {
  'use strict';
  // 測試在 Node 裡跑時，自己載入翻譯模組（預設繁體中文，也就是原文）
  const I18N = root.HRD && root.HRD.i18n ? root.HRD.i18n : require('./i18n.js');
  const t = (s, p) => I18N.t(s, p);
  const E = root.HRD && root.HRD.engine ? root.HRD.engine : require('./engine.js');

  const PREFIX = 'HRD';
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const SIDE_CODE = { bottom: 'B', top: 'T', left: 'L', right: 'R' };
  const CODE_SIDE = { B: 'bottom', T: 'top', L: 'left', R: 'right' };
  const RE1 = /HRD1-([A-Za-z.]{20})-([A-Za-z0-9_-]*)-([0-9a-z]{4})(?![A-Za-z0-9_-])/g;
  const RE2 = /HRD2-([3-6])([4-7])([BTLR])([0-5])-([A-Za-z.]{12,42})-([A-Za-z0-9_-]*)-([0-9a-z]{4})(?![A-Za-z0-9_-])/g;

  function toBase64Url(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromBase64Url(s) {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  }

  /* FNV-1a 32 位元，取 base36 的最後 4 碼 */
  function checksum(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(36).padStart(4, '0').slice(-4);
  }

  /* 關卡 → 分享碼。棋子依左上角位置排序，同一個盤面永遠得到同一個分享碼。 */
  function encode(level) {
    const st = E.levelToState(level);
    const v = E.validate(st);
    if (!v.ok) throw new Error(t('盤面還不完整：{errors}', { errors: t(v.errors[0]) }));
    const pieces = st.pieces.slice().sort((a, b) => a.y - b.y || a.x - b.x);
    const sorted = E.makeState(st.cols, st.rows, st.exit, pieces);
    const grid = new Array(st.cols * st.rows).fill('.');
    pieces.forEach((p, k) => {
      for (let dy = 0; dy < p.h; dy++) for (let dx = 0; dx < p.w; dx++) grid[(p.y + dy) * st.cols + p.x + dx] = LETTERS[k];
    });
    const defaults = E.defaultLabels(sorted);
    const meta = { n: (level.name || '').trim() || t('未命名關卡') };
    if (level.difficultySet && level.difficulty) meta.d = level.difficulty;
    const labels = {};
    pieces.forEach((p, k) => { if (p.label !== defaults[k]) labels[LETTERS[k]] = p.label; });
    if (Object.keys(labels).length) meta.l = labels;
    const tail = grid.join('') + '-' + toBase64Url(JSON.stringify(meta));
    if (E.isStandard(st)) return 'HRD1-' + tail + '-' + checksum(tail);
    const body = st.cols + '' + st.rows + SIDE_CODE[st.exit.side] + st.exit.at + '-' + tail;
    return 'HRD2-' + body + '-' + checksum(body);
  }

  /* 把正規表示式的結果整理成同一個樣子 */
  function parsed(m) {
    if (m[0].startsWith('HRD1')) {
      return { code: m[0], index: m.index, cols: 4, rows: 5, exit: { side: 'bottom', at: 1 }, grid: m[1], data: m[2], check: m[3], body: m[1] + '-' + m[2] };
    }
    return {
      code: m[0], index: m.index, cols: Number(m[1]), rows: Number(m[2]), exit: { side: CODE_SIDE[m[3]], at: Number(m[4]) },
      grid: m[5], data: m[6], check: m[7], body: m[1] + m[2] + m[3] + m[4] + '-' + m[5] + '-' + m[6],
    };
  }

  function scan(s) {
    const out = [];
    [RE1, RE2].forEach((re) => {
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(s))) out.push(parsed(m));
    });
    return out.sort((a, b) => a.index - b.index);
  }

  function valid(p) { return checksum(p.body) === p.check && p.grid.length === p.cols * p.rows; }

  /* 從一段文字（分享碼、分享連結或混在訊息裡）找出分享碼。
     照原文找一次，再把空白拿掉找一次（聊天軟體可能把長字串斷行），兩次結果合併。 */
  function matches(text) {
    const raw = String(text || '');
    const found = scan(raw);
    const seen = new Set(found.map((p) => p.code));
    scan(raw.replace(/\s+/g, '')).forEach((p) => {
      if (seen.has(p.code) || !valid(p)) return;
      seen.add(p.code);
      found.push(p);
    });
    return found;
  }

  function find(text) {
    const out = [];
    matches(text).forEach((p) => { if (!out.includes(p.code)) out.push(p.code); });
    return out;
  }

  /* 分享碼 → 檢查過的關卡；有問題時丟出可以直接顯示的錯誤訊息 */
  function decode(text) {
    const p = matches(text)[0];
    if (!p) {
      if (/HRD[12]/.test(String(text || ''))) throw new Error(t('分享碼不完整，請重新複製一次。'));
      throw new Error(t('找不到分享碼。分享碼是以「HRD1-」或「HRD2-」開頭的一串文字。'));
    }
    if (checksum(p.body) !== p.check) throw new Error(t('分享碼有地方抄錯或缺了一段，請重新複製一次。'));
    if (p.grid.length !== p.cols * p.rows) throw new Error(t('分享碼裡的盤面格數不對，請重新複製一次。'));
    if (!E.validExit(p.cols, p.rows, p.exit)) throw new Error(t('分享碼裡的出口位置不正確。'));

    let meta;
    try { meta = JSON.parse(fromBase64Url(p.data)); } catch (e) { throw new Error(t('分享碼裡的關卡資料讀不出來。')); }
    if (!meta || typeof meta !== 'object') meta = {};

    const rows = [];
    for (let y = 0; y < p.rows; y++) rows.push(p.grid.slice(y * p.cols, (y + 1) * p.cols));
    let st;
    try { st = E.fromGrid(rows, null, p.exit); }
    catch (e) { throw new Error(t('分享碼裡的盤面有問題：{message}', { message: e.message })); }
    const order = [];
    p.grid.split('').forEach((ch) => { if (ch !== '.' && !order.includes(ch)) order.push(ch); });
    const defaults = E.defaultLabels(st);
    const custom = meta.l && typeof meta.l === 'object' ? meta.l : {};
    const pieces = st.pieces.map((q, k) => ({
      type: q.type, x: q.x, y: q.y,
      label: typeof custom[order[k]] === 'string' && custom[order[k]] ? custom[order[k]] : defaults[k],
    }));

    const level = E.normalizeLevel({
      name: typeof meta.n === 'string' ? meta.n : '',
      description: typeof meta.s === 'string' ? meta.s : '',
      difficulty: meta.d,
      board: { cols: p.cols, rows: p.rows },
      exit: p.exit,
      pieces: pieces,
    });
    level.difficultySet = level.difficulty != null;
    level.shareCode = p.code;
    return level;
  }

  /* 分享連結；在 Artifact 預覽或直接開檔案時沒有可分享的網址，回傳 null */
  function linkFor(code) {
    if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return null;
    if (root.claude) return null;
    return location.origin + location.pathname + '#/s/' + code;
  }

  /* ---------- 分享成績 ---------- */

  /* 成績放在挑戰連結最後一段：r步數t秒數，例如 r85t222 */
  function scoreToken(score) {
    return 'r' + Math.max(0, Math.round(score.steps)) + 't' + Math.max(0, Math.round(score.timeMs / 1000));
  }

  function parseScore(token) {
    const m = /^r(\d{1,4})t(\d{1,6})$/.exec(String(token || ''));
    return m ? { steps: Number(m[1]), timeMs: Number(m[2]) * 1000 } : null;
  }

  function challengeLink(code, score) {
    const link = linkFor(code);
    return link ? link + '/' + scoreToken(score) : null;
  }

  function clock(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  function starText(n) { return '★★★'.slice(0, n) + '☆☆☆'.slice(0, 3 - n); }

  /* 貼到聊天軟體的成績訊息。r: {name, steps, timeMs, minMoves, stars, hints, code, link} */
  function scoreText(r) {
    const parts = [t('{steps} 步', { steps: r.steps })];
    if (r.minMoves != null) parts[0] += t('（最少 {minMoves} 步）', { minMoves: r.minMoves });
    if (r.stars) parts.push(starText(r.stars));
    parts.push(t('用時 {clock}', { clock: clock(r.timeMs) }));
    if (r.hints) parts.push(t('用了 {hints} 次提示', { hints: r.hints }));
    const lines = [t('我在華容道「{name}」過關了！', { name: r.name }), parts.join(' · ')];
    if (r.link) lines.push(t('換你挑戰：{link}', { link: r.link }));
    else if (r.code) lines.push(t('換你挑戰：到華容道的「我的關卡 → 匯入關卡」貼上分享碼 {code}', { code: r.code }));
    return lines.join('\n');
  }

  const api = { PREFIX, encode, decode, find, linkFor, checksum, scoreToken, parseScore, challengeLink, scoreText, starText };
  const HRD = root.HRD || (root.HRD = {});
  HRD.share = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
