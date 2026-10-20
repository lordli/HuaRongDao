/* 共用的 DOM 小工具：建元素、圖示、對話框、提示訊息、檔案下載。 */
(function (root) {
  'use strict';

  function append(el, kids) {
    for (const k of kids) {
      if (k == null || k === false) continue;
      if (Array.isArray(k)) append(el, k);
      else el.appendChild(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(String(k)) : k);
    }
  }

  function h(tag, props) {
    const el = document.createElement(tag);
    const p = props || {};
    for (const k in p) {
      const v = p[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value' && (tag === 'input' || tag === 'textarea' || tag === 'select')) el.value = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    append(el, Array.prototype.slice.call(arguments, 2));
    return el;
  }

  const ICONS = {
    undo: ['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'],
    redo: ['m15 14 5-5-5-5', 'M20 9H9.5a5.5 5.5 0 0 0 0 11H13'],
    restart: ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5'],
    hint: ['M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5', 'M9 18h6', 'M10 22h4'],
    play: { fill: 'M6 3 20 12 6 21Z' },
    pause: { fill: 'M6 4h4v16H6zM14 4h4v16h-4z' },
    back: ['m15 18-6-6 6-6'],
    next: ['m9 18 6-6-6-6'],
    more: { dots: true },
    search: ['M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16', 'm21 21-4.3-4.3'],
    plus: ['M5 12h14', 'M12 5v14'],
    upload: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M17 8l-5-5-5 5', 'M12 3v12'],
    download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
    copy: ['M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2', 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2'],
    trash: ['M3 6h18', 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6', 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2'],
    edit: ['M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z'],
    check: ['M20 6 9 17l-5-5'],
    ok: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20', 'm9 12 2 2 4-4'],
    alert: ['m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3', 'M12 9v4', 'M12 17h.01'],
    bad: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20', 'm15 9-6 6', 'm9 9 6 6'],
    x: ['M18 6 6 18', 'm6 6 12 12'],
    flip: ['M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3', 'M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3', 'M12 20v2', 'M12 14v2', 'M12 8v2', 'M12 2v2'],
    eraser: ['m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21', 'M22 21H7', 'm5 11 9 9'],
    pointer: ['m4 4 7 17 2.5-7.5L21 11Z'],
    save: ['M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7', 'M7 3v4a1 1 0 0 0 1 1h7'],
    info: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20', 'M12 16v-4', 'M12 8h.01'],
    arrow: ['M12 19V5', 'm5 12 7-7 7 7'],
    down: ['M12 5v14', 'm19 12-7 7-7-7'],
    flag: ['M4 22V4', 'M4 4h13l-2 4 2 4H4'],
    star: { fill: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z' },
    clock: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20', 'M12 6v6l4 2'],
    share: ['M18 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6', 'M6 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6', 'M18 16a3 3 0 1 0 0 6 3 3 0 0 0 0-6', 'm8.59 13.51 6.83 3.98', 'm15.41 6.51-6.82 3.98'],
    volume: ['M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z', 'M16 9a5 5 0 0 1 0 6', 'M19.4 18.4a9 9 0 0 0 0-12.8'],
    mute: ['M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z', 'm22 9-6 6', 'm16 9 6 6'],
    vibrate: ['m2 8 2 2-2 2 2 2-2 2', 'm22 8-2 2 2 2-2 2 2 2', 'M9 5h6a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z'],
    vibrateOff: ['M9 5h6a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z', 'm3 3 18 18'],
    link: ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],
    sliders: ['M21 4h-7', 'M10 4H3', 'M21 12h-9', 'M8 12H3', 'M21 20h-5', 'M12 20H3', 'M14 2v4', 'M8 10v4', 'M16 18v4'],
    user: ['M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2', 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8'],
    cloud: ['M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z'],
    cloudOff: ['m2 2 20 20', 'M5.78 5.78A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.31-.2', 'M21.53 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7 7 0 0 0 10.3 5.07'],
    sync: ['M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5', 'M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16', 'M16 16h5v5'],
    logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'm16 17 5-5-5-5', 'M21 12H9'],
    heart: ['M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z'],
    heartFill: { fill: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z' },
    users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
    trophy: ['M6 9H4.5a2.5 2.5 0 0 1 0-5H6', 'M18 9h1.5a2.5 2.5 0 0 0 0-5H18', 'M4 22h16', 'M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22', 'M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22', 'M18 2H6v7a6 6 0 0 0 12 0V2Z'],
  };

  const NS = 'http://www.w3.org/2000/svg';
  function icon(name, size, extraClass) {
    const def = ICONS[name];
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('width', size || 20);
    s.setAttribute('height', size || 20);
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('class', 'icon' + (extraClass ? ' ' + extraClass : ''));
    s.setAttribute('focusable', 'false');
    if (Array.isArray(def)) {
      s.setAttribute('fill', 'none');
      s.setAttribute('stroke', 'currentColor');
      s.setAttribute('stroke-width', '2');
      s.setAttribute('stroke-linecap', 'round');
      s.setAttribute('stroke-linejoin', 'round');
      def.forEach((d) => { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); s.appendChild(p); });
    } else if (def && def.fill) {
      s.setAttribute('fill', 'currentColor');
      const p = document.createElementNS(NS, 'path'); p.setAttribute('d', def.fill); s.appendChild(p);
    } else if (def && def.dots) {
      s.setAttribute('fill', 'currentColor');
      [5, 12, 19].forEach((cx) => { const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', cx); c.setAttribute('cy', 12); c.setAttribute('r', 1.8); s.appendChild(c); });
    }
    return s;
  }

  /* ---------- 提示訊息 ---------- */
  let toastBox = null;
  function toast(message, action) {
    if (!toastBox) toastBox = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    // 開著對話框時放進對話框裡，才不會被蓋住
    const open = document.querySelectorAll('dialog[open]');
    const host = open.length ? open[open.length - 1] : document.body;
    if (toastBox.parentNode !== host) host.appendChild(toastBox);
    const item = h('div', { class: 'toast' }, h('span', { text: message }));
    let timer;
    const close = () => { clearTimeout(timer); item.remove(); };
    if (action) {
      item.appendChild(h('button', { type: 'button', class: 'toast-action', onclick: () => { close(); action.run(); } }, action.label));
    }
    toastBox.appendChild(item);
    timer = setTimeout(close, action ? 8000 : 3200);
    return close;
  }

  /* ---------- 對話框（不用 alert/confirm，Artifact 裡它們不會出現） ---------- */
  function dialog(opts) {
    return new Promise((resolve) => {
      const titleId = 'dlg-' + Math.random().toString(36).slice(2, 8);
      const d = h('dialog', { class: 'dialog' + (opts.wide ? ' dialog-wide' : ''), 'aria-labelledby': titleId });
      let result = null;
      const close = (v) => { result = v; d.close(); };
      const head = h('div', { class: 'dialog-head' },
        h('h2', { id: titleId, class: 'dialog-title', text: opts.title }),
        h('button', { type: 'button', class: 'icon-btn ghost', 'aria-label': '關閉', onclick: () => close(null) }, icon('x', 22)));
      const body = h('div', { class: 'dialog-body' });
      if (opts.message) body.appendChild(h('p', { class: 'dialog-text', text: opts.message }));
      if (opts.body) append(body, [typeof opts.body === 'function' ? opts.body(close) : opts.body]);
      const foot = h('div', { class: 'dialog-foot' });
      (opts.actions || [{ label: '好', value: true, primary: true }]).forEach((a) => {
        foot.appendChild(h('button', {
          type: 'button',
          'data-action': a.id || null,
          class: 'btn ' + (a.danger ? 'btn-danger' : a.primary ? 'btn-primary' : 'btn-secondary'),
          onclick: () => {
            if (a.onClick) { const r = a.onClick(close); if (r === false) return; }
            close(a.value);
          },
        }, a.label));
      });
      d.append(head, body, foot);
      d.addEventListener('close', () => { d.remove(); resolve(result); });
      d.addEventListener('click', (e) => { if (e.target === d) close(null); });
      document.body.appendChild(d);
      if (opts.onReady) opts.onReady(d);
      d.showModal();
      const focus = d.querySelector('[autofocus]') || foot.querySelector('.btn-primary, .btn-danger');
      if (focus) focus.focus();
    });
  }

  function confirmDialog(title, message, okLabel, danger) {
    return dialog({
      title: title,
      message: message,
      actions: [
        { label: '取消', value: false },
        { label: okLabel || '確定', value: true, primary: !danger, danger: !!danger },
      ],
    }).then((v) => v === true);
  }

  /* ---------- 複製與下載 ---------- */
  async function copyText(text, fallbackEl) {
    try {
      await navigator.clipboard.writeText(text);
      toast('已複製到剪貼簿');
      return true;
    } catch (e) {
      if (fallbackEl) { fallbackEl.focus(); fallbackEl.select(); }
      toast('沒辦法自動複製，已幫你選取文字，請按 Ctrl+C（或長按）複製');
      return false;
    }
  }

  /* 在 Artifact 檢視器裡用平台的下載功能；一般網站直接下載。 */
  /* data 可以是文字或 Blob（例如 PNG 圖卡） */
  async function saveFile(filename, data) {
    const text = data;
    const c = root.claude;
    if (c && typeof c.use === 'function') {
      try {
        const dl = await c.use('downloads');
        if (dl) {
          await dl.save({ filename: filename, data: text });
          return 'saved';
        }
      } catch (e) {
        if (e && e.code === 'declined') return 'declined';
        return 'failed';
      }
      return 'unavailable';
    }
    try {
      const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: filename, style: { display: 'none' } });
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
      return 'saved';
    } catch (e) {
      return 'failed';
    }
  }

  function formatTime(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(s / 60);
    return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  function formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts), now = new Date();
    const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    if (d.toDateString() === now.toDateString()) return '今天 ' + hm;
    return (d.getMonth() + 1) + '/' + d.getDate();
  }

  const HRD = root.HRD || (root.HRD = {});
  HRD.ui = { h, icon, toast, dialog, confirmDialog, copyText, saveFile, formatTime, formatDate };
})(typeof window !== 'undefined' ? window : globalThis);
