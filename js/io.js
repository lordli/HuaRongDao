/* 匯出、匯入關卡，以及在背景驗證自訂關卡能不能解。 */
(function (root) {
  'use strict';
  const t = (s, p) => root.HRD.i18n.t(s, p);
  const HRD = root.HRD;
  const E = HRD.engine;
  const { h, icon, toast, dialog, copyText, saveFile } = HRD.ui;

  function exportable(level) {
    return {
      name: level.name,
      description: level.description || '',
      difficulty: level.difficulty || null,
      board: level.board,
      exit: level.exit || E.levelToState(level).exit,
      goal: level.goal || E.levelToState(level).goal,
      pieces: level.pieces.map((p) => ({ type: p.type, x: p.x, y: p.y, label: p.label })),
      minMoves: level.minMoves == null ? null : level.minMoves,
    };
  }

  function toJSON(levels) {
    return JSON.stringify({ app: 'huarongdao', version: 1, exportedAt: new Date().toISOString(), levels: levels.map(exportable) }, null, 2);
  }

  function today() {
    const d = new Date();
    return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  }

  function safeName(s) {
    return String(s).replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40) || 'level';
  }

  function exportDialog(levels, title) {
    return jsonDialog({
      title: title || t('匯出關卡'),
      summary: t('共 {n} 個關卡。下載成 JSON 檔，或複製內容貼到別的地方保存。', { n: levels.length }),
      json: toJSON(levels),
      filename: levels.length === 1 ? t('華容道-{safeName}.json', { safeName: safeName(levels[0].name) }) : 'huarongdao-levels-' + today() + '.json',
    });
  }

  /* 備份全部資料：自訂關卡、過關紀錄、進行中的盤面、設定 */
  function backupDialog() {
    const data = HRD.store.snapshot();
    const json = JSON.stringify({ app: 'huarongdao', kind: 'backup', version: 1, exportedAt: new Date().toISOString(), data: data }, null, 2);
    const records = Object.keys(data.progress).length;
    return jsonDialog({
      title: t('備份全部資料'),
      summary: t('包含 {n} 個自訂關卡、{records} 筆過關紀錄和你的設定。換電腦或清除瀏覽資料前，先下載這個檔案。', { n: data.custom.length, records }),
      json: json,
      filename: 'huarongdao-backup-' + today() + '.json',
    });
  }

  function restoreDialog() {
    let parsed = null, okBtn = null;
    const msg = h('div', { class: 'import-preview', 'aria-live': 'polite' });
    const file = h('input', { type: 'file', id: 'restore-file', accept: '.json,application/json' });
    const area = h('textarea', { id: 'restore-text', class: 'code-area', rows: 5, spellcheck: 'false', placeholder: '{ "app": "huarongdao", "kind": "backup", … }' });
    function show(text) {
      msg.textContent = '';
      parsed = null;
      if (okBtn) okBtn.disabled = true;
      if (!text.trim()) return;
      let obj;
      try { obj = JSON.parse(text); } catch (e) { msg.appendChild(h('p', { class: 'msg msg-bad' }, icon('bad', 18), t('不是有效的 JSON，請確認內容完整。'))); return; }
      if (!obj || obj.app !== 'huarongdao' || obj.kind !== 'backup' || !obj.data) {
        const levelsFile = obj && (Array.isArray(obj) || Array.isArray(obj.levels) || Array.isArray(obj.pieces));
        msg.appendChild(h('p', { class: 'msg msg-bad' }, icon('bad', 18), levelsFile ? t('這是關卡檔，請到「我的關卡 → 匯入關卡」加入。') : t('這不是華容道的備份檔。')));
        return;
      }
      parsed = obj.data;
      const n = Array.isArray(parsed.custom) ? parsed.custom.length : 0;
      const r = parsed.progress && typeof parsed.progress === 'object' ? Object.keys(parsed.progress).length : 0;
      msg.appendChild(h('p', { class: 'msg msg-ok' }, icon('ok', 18), t('備份檔時間 {text}：{n} 個自訂關卡、{r} 筆過關紀錄。', { text: obj.exportedAt ? new Date(obj.exportedAt).toLocaleString(HRD.i18n.dateLocale()) : t('不明'), n, r })));
      if (okBtn) okBtn.disabled = false;
    }
    file.addEventListener('change', () => {
      const f = file.files && file.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => { area.value = String(reader.result || ''); show(area.value); };
      reader.readAsText(f);
    });
    let timer;
    area.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => show(area.value), 250); });
    return dialog({
      title: t('還原備份'),
      wide: true,
      body: h('div', { class: 'stack' },
        h('label', { class: 'field-label', for: 'restore-file' }, t('選擇備份檔')),
        file,
        h('label', { class: 'field-label', for: 'restore-text' }, t('或貼上備份內容')),
        area,
        msg,
        h('p', { class: 'hint-text' }, t('還原會和現有資料合併：關卡取較新的版本，紀錄取較好的成績，不會刪掉你現在的資料。'))),
      onReady: (d) => { okBtn = d.querySelector('[data-action="restore"]'); okBtn.disabled = true; },
      actions: [
        { label: t('取消'), value: null },
        { id: 'restore', label: t('還原'), primary: true, value: 'restore' },
      ],
    }).then((v) => {
      if (v !== 'restore' || !parsed) return null;
      const r = HRD.store.restore(parsed);
      HRD.settings.apply();
      toast(t('已還原：新增 {levels} 個關卡、{records} 筆紀錄', { levels: r.levels, records: r.records }));
      verifyPending();
      return r;
    });
  }

  function jsonDialog(o) {
    const json = o.json, filename = o.filename;
    const area = h('textarea', { id: 'export-json', class: 'code-area', rows: 9, readonly: true, spellcheck: 'false' });
    area.value = json;
    return dialog({
      title: o.title,
      wide: true,
      body: h('div', { class: 'stack' },
        h('p', { class: 'dialog-text' }, o.summary),
        h('label', { class: 'field-label', for: 'export-json' }, t('JSON 內容')),
        area),
      actions: [
        { label: t('複製 JSON'), onClick: () => { copyText(json, area); return false; } },
        { label: t('下載檔案'), primary: true, onClick: () => {
          saveFile(filename, json).then((r) => {
            if (r === 'saved') toast(t('已下載 {filename}', { filename }));
            else if (r === 'declined') toast(t('已取消下載'));
            else toast(t('這裡沒辦法直接下載，請改用「複製 JSON」'));
          });
          return false;
        } },
        { label: t('完成'), value: true },
      ],
    });
  }

  /* 解析匯入的文字（分享碼、分享連結或 JSON），回傳每一筆的結果。 */
  function parseImport(text) {
    const codes = HRD.share.find(text);
    if (codes.length) {
      if (codes.length > 200) return { error: t('一次最多匯入 200 個關卡。') };
      return {
        items: codes.map((code, n) => {
          try { return { ok: true, level: HRD.share.decode(code) }; }
          catch (e) { return { ok: false, name: t('第 {n} 個分享碼', { n: n + 1 }), error: e.message }; }
        }),
      };
    }
    const trimmed = String(text).trim();
    if (trimmed.indexOf(HRD.share.PREFIX) >= 0 || !/^[\[{]/.test(trimmed)) {
      try { HRD.share.decode(trimmed); } catch (e) { return { error: e.message }; }
    }
    let data;
    try { data = JSON.parse(text); } catch (e) { return { error: t('不是有效的 JSON，請確認內容完整。') }; }
    const list = Array.isArray(data) ? data : data && Array.isArray(data.levels) ? data.levels : [data];
    if (!list.length) return { error: t('檔案裡沒有關卡。') };
    if (list.length > 200) return { error: t('一次最多匯入 200 個關卡。') };
    return {
      items: list.map((raw, n) => {
        try { return { ok: true, level: E.normalizeLevel(raw) }; }
        catch (e) { return { ok: false, name: raw && raw.name ? String(raw.name).slice(0, 30) : t('第 {n} 筆', { n: n + 1 }), error: e.message }; }
      }),
    };
  }

  function importDialog(initialText) {
    let parsed = null;
    let addBtn = null;
    const preview = h('div', { class: 'import-preview', 'aria-live': 'polite' });
    const file = h('input', { type: 'file', id: 'import-file', accept: '.json,application/json' });
    const area = h('textarea', { id: 'import-text', class: 'code-area', rows: 5, spellcheck: 'false', placeholder: t('HRD1-… 或 { "app": "huarongdao", "levels": [ … ] }') });

    function show(text) {
      preview.textContent = '';
      parsed = text.trim() ? parseImport(text) : null;
      const okItems = parsed && parsed.items ? parsed.items.filter((i) => i.ok) : [];
      if (addBtn) {
        addBtn.disabled = okItems.length === 0;
        addBtn.textContent = okItems.length ? t('加入 {n} 個關卡', { n: okItems.length }) : t('加入我的關卡');
      }
      if (!parsed) return;
      if (parsed.error) { preview.appendChild(h('p', { class: 'msg msg-bad' }, icon('bad', 18), parsed.error)); return; }
      const ul = h('ul', { class: 'import-list' });
      parsed.items.forEach((it) => {
        ul.appendChild(it.ok
          ? h('li', { class: 'msg msg-ok' }, icon('ok', 18), h('span', {}, it.level.name, h('span', { class: 'muted' }, t(' · {n} 顆棋子', { n: it.level.pieces.length }))))
          : h('li', { class: 'msg msg-bad' }, icon('bad', 18), h('span', {}, t('{name}：{error}', { name: it.name, error: it.error }))));
      });
      preview.append(h('p', { class: 'dialog-text' }, t('找到 {n} 筆，可以加入 {n2} 筆：', { n: parsed.items.length, n2: okItems.length })), ul);
    }

    file.addEventListener('change', () => {
      const f = file.files && file.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => { area.value = String(reader.result || ''); show(area.value); };
      reader.onerror = () => toast(t('讀不到這個檔案'));
      reader.readAsText(f);
    });
    let timer;
    area.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => show(area.value), 250); });

    return dialog({
      title: t('匯入關卡'),
      wide: true,
      body: h('div', { class: 'stack' },
        h('label', { class: 'field-label', for: 'import-text' }, t('貼上分享碼、分享連結或 JSON')),
        area,
        h('label', { class: 'field-label', for: 'import-file' }, t('或選擇 JSON 檔案')),
        file,
        preview,
        h('p', { class: 'hint-text' }, t('同名的關卡會自動改名，不會覆蓋你原本的關卡。'))),
      onReady: (d) => {
        addBtn = d.querySelector('[data-action="add"]');
        addBtn.disabled = true;
        if (initialText) { area.value = initialText; show(initialText); }
        setTimeout(() => area.focus(), 0);
      },
      actions: [
        { label: t('取消'), value: null },
        { id: 'add', label: t('加入我的關卡'), primary: true, onClick: () => {
          if (!parsed || !parsed.items) return false;
          return undefined;
        }, value: 'add' },
      ],
    }).then((v) => {
      if (v !== 'add' || !parsed || !parsed.items) return [];
      const levels = parsed.items.filter((i) => i.ok).map((i) => Object.assign({}, i.level, {
        shape: E.shapeKey(E.levelToState(i.level)), solvable: null, minMoves: null, solveStatus: null,
      }));
      const added = HRD.store.importLevels(levels);
      toast(t('已加入 {n} 個關卡', { n: added.length }));
      verifyPending();
      return added;
    });
  }

  /* ---------- 分享 ---------- */
  function copyRow(id, label, value) {
    const input = h('input', { id: id, type: 'text', class: 'input input-code', readonly: true, value: value, spellcheck: 'false' });
    input.addEventListener('focus', () => input.select());
    return h('div', { class: 'field' },
      h('label', { class: 'field-label', for: id }, label),
      h('div', { class: 'copy-row' }, input,
        h('button', { type: 'button', class: 'btn btn-indigo btn-sm', onclick: () => copyText(value, input) }, icon('copy', 16), t('複製'))));
  }

  /* level 需有 pieces 與 name；minMoves 有的話會顯示 */
  function shareDialog(level) {
    let code;
    try { code = HRD.share.encode(level); }
    catch (e) { toast(e.message); return Promise.resolve(null); }
    const plain = HRD.share.linkFor(code);
    // 發佈到關卡廣場的關卡，連結直接開廣場上的那一頁
    const link = plain && level.publicId ? plain.replace(/#\/s\/.*$/, '#/g/' + level.publicId) : plain;
    const st = E.levelToState(level);
    const facts = [t('{n} 顆棋子', { n: st.pieces.length })];
    if (level.minMoves != null) facts.push(t('最少 {minMoves} 步', { minMoves: level.minMoves }));
    const message = t('來挑戰我的華容道關卡「{name}」！{text}', { name: level.name, text: link ? '\n' + link : t('\n分享碼：{code}', { code }) });
    const actions = [];
    if (link && navigator.share && !root.claude) {
      actions.push({ label: t('傳送給朋友…'), onClick: () => {
        navigator.share({ title: t('華容道：{name}', { name: level.name }), text: t('來挑戰我的華容道關卡「{name}」！', { name: level.name }), url: link }).catch(() => {});
        return false;
      } });
    }
    actions.push({ label: t('完成'), primary: true, value: true });
    return dialog({
      title: t('分享關卡'),
      wide: true,
      body: h('div', { class: 'stack' },
        h('div', { class: 'share-head' },
          h('div', { class: 'share-thumb' }, HRD.thumb(level, st)),
          h('div', {},
            h('p', { class: 'share-name' }, level.name),
            h('p', { class: 'muted' }, facts.join(' · ')))),
        link ? copyRow('share-link', t('分享連結'), link) : null,
        copyRow('share-code', t('分享碼'), code),
        link ? h('p', { class: 'hint-text' }, t('朋友打開連結就能直接挑戰。也可以只傳分享碼，對方在「我的關卡 → 匯入關卡」貼上即可。'))
          : h('p', { class: 'hint-text' }, t('對方在「我的關卡 → 匯入關卡」貼上分享碼就能玩。網站部署到網路上之後，這裡還會出現可以直接點開的分享連結。')),
        h('div', { class: 'field' },
          h('span', { class: 'field-label', id: 'share-msg-label' }, t('或直接複製這段訊息')),
          h('div', { class: 'copy-row' },
            h('p', { class: 'share-msg', 'aria-labelledby': 'share-msg-label' }, message),
            h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => copyText(message) }, icon('copy', 16), t('複製訊息'))))),
      actions: actions,
    });
  }

  /*
   * 分享成績。r: { level, steps, timeMs, stars, hints, subtitle }
   * level.minMoves 有值時會一起顯示。
   */
  function scoreDialog(r) {
    let code = null;
    try { code = HRD.share.encode(r.level); } catch (e) { /* 盤面不完整時只分享文字 */ }
    const link = code ? HRD.share.challengeLink(code, r) : null;
    const minMoves = r.level.minMoves != null ? r.level.minMoves : null;
    const text = HRD.share.scoreText({
      name: r.level.name, steps: r.steps, timeMs: r.timeMs, minMoves: minMoves,
      stars: minMoves != null ? r.stars : 0, hints: r.hints || 0, code: code, link: link,
    });
    const alt = t('成績圖卡：{name}，{steps} 步，用時 {time}{text}', { name: r.level.name, steps: r.steps, time: HRD.ui.formatTime(r.timeMs), text: minMoves != null ? t('，{stars} 顆星', { stars: r.stars }) : '' });
    const img = h('img', { class: 'score-img', alt: alt, width: HRD.scoreCard.WIDTH, height: HRD.scoreCard.HEIGHT, hidden: true });
    const wait = h('p', { class: 'score-wait' }, t('正在產生成績圖卡…'));
    let blob = null, url = null;
    const filename = t('華容道-{replace}-{steps}步.png', { replace: String(r.level.name).replace(/[\\/:*?"<>|\s]+/g, '-'), steps: r.steps });

    HRD.scoreCard.render({
      level: r.level, steps: r.steps, timeMs: r.timeMs, minMoves: minMoves,
      stars: minMoves != null ? r.stars : 0, subtitle: r.subtitle, code: code,
    }).then((b) => {
      blob = b;
      url = URL.createObjectURL(b);
      img.src = url;
      img.hidden = false;
      wait.remove();
    }).catch(() => { wait.textContent = t('這個瀏覽器沒辦法產生圖卡，請改用下面的文字訊息。'); });

    const actions = [];
    if (navigator.share && !root.claude) {
      actions.push({ label: t('傳送給朋友…'), onClick: () => {
        const file = blob && typeof File === 'function' ? new File([blob], filename, { type: 'image/png' }) : null;
        const data = file && navigator.canShare && navigator.canShare({ files: [file] }) ? { files: [file], text: text } : { text: text };
        navigator.share(data).catch(() => {});
        return false;
      } });
    }
    actions.push({ label: t('下載圖卡'), onClick: () => {
      if (!blob) { toast(t('圖卡還在產生中，請稍等一下')); return false; }
      saveFile(filename, blob).then((res) => {
        if (res === 'saved') toast(t('已下載成績圖卡'));
        else if (res === 'declined') toast(t('已取消下載'));
        else toast(t('這裡沒辦法直接下載圖卡，可以在圖片上按右鍵或長按另存'));
      });
      return false;
    } });
    actions.push({ label: t('完成'), primary: true, value: true });

    return dialog({
      title: t('分享成績'),
      wide: true,
      body: h('div', { class: 'score-share' },
        h('figure', { class: 'score-preview' }, wait, img),
        h('div', { class: 'stack' },
          h('div', { class: 'field' },
            h('span', { class: 'field-label', id: 'score-msg-label' }, t('成績訊息')),
            h('p', { class: 'share-msg', 'aria-labelledby': 'score-msg-label' }, text),
            h('button', { type: 'button', class: 'btn btn-indigo btn-sm', onclick: () => copyText(text) }, icon('copy', 16), t('複製訊息'))),
          link ? copyRow('score-link', t('挑戰連結'), link) : null,
          h('p', { class: 'hint-text' }, link
            ? t('朋友打開挑戰連結，會看到你的成績，過關後可以比比看誰的步數少。')
            : t('網站部署到網路上之後，這裡會有可以直接點開的挑戰連結。')))),
      actions: actions,
    }).then((v) => { if (url) URL.revokeObjectURL(url); return v; });
  }

  /* ---------- 背景驗證 ---------- */
  async function verify(level) {
    const st = E.levelToState(level);
    if (!E.validate(st).ok) return { solvable: false, minMoves: null, status: 'invalid' };
    const r = await E.solveAsync(st, { maxStates: 600000 });
    if (r.status === 'solved') return { solvable: true, minMoves: r.minMoves, status: 'solved' };
    if (r.status === 'unsolvable') return { solvable: false, minMoves: null, status: 'unsolvable' };
    return { solvable: null, minMoves: null, status: r.status };
  }

  let running = null;
  function verifyPending() {
    if (running) return running;
    running = (async () => {
      for (;;) {
        const next = HRD.store.customLevels().find((l) => l.solvable == null && !l.solveStatus);
        if (!next) break;
        const shape = next.shape || E.shapeKey(E.levelToState(next));
        const res = await verify(next);
        HRD.store.setSolveResult(next.id, shape, res);
      }
    })().finally(() => { running = null; });
    return running;
  }

  HRD.io = { toJSON, exportDialog, backupDialog, restoreDialog, importDialog, parseImport, shareDialog, scoreDialog, verify, verifyPending };
})(window);
