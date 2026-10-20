/*
 * 棋盤畫面元件：遊戲、編輯器、縮圖共用。
 * 位置全部用百分比，棋盤會跟著容器寬度縮放。
 */
(function (root) {
  'use strict';
  const HRD = root.HRD;
  const { h, icon } = HRD.ui;
  const E = HRD.engine;

  const GAP = 0.07; // 格子間距 / 格子寬

  function geometry(cols, rows) {
    const bw = cols + (cols - 1) * GAP, bh = rows + (rows - 1) * GAP;
    const span = (n) => n + (n - 1) * GAP;
    return {
      bw: bw, bh: bh,
      rect(x, y, w, hh) {
        return { left: (x * (1 + GAP)) / bw * 100, top: (y * (1 + GAP)) / bh * 100, width: span(w) / bw * 100, height: span(hh) / bh * 100 };
      },
      /* 第 x 欄（可為小數）中心點的百分比位置 */
      cx(x) { return (x * (1 + GAP) + 0.5) / bw * 100; },
      cy(y) { return (y * (1 + GAP) + 0.5) / bh * 100; },
      midX(x, w) { return (x * (1 + GAP) + span(w) / 2) / bw * 100; },
      midY(y, hh) { return (y * (1 + GAP) + span(hh) / 2) / bh * 100; },
    };
  }

  function place(el, r) {
    el.style.left = r.left + '%';
    el.style.top = r.top + '%';
    el.style.width = r.width + '%';
    el.style.height = r.height + '%';
  }

  function describe(p) {
    const type = E.TYPES[p.type].name;
    return (p.label === type ? p.label : p.label + '（' + type + '）') + '，第 ' + (p.x + 1) + ' 欄第 ' + (p.y + 1) + ' 列';
  }

  /* 棋盤區（不含外框）最多多高，用來限制直長盤面的寬度 */
  const MAX_BED_HEIGHT = { play: 480, edit: 460, thumb: 150, preview: 170 };

  class BoardView {
    constructor(opts) {
      this.kind = (opts && opts.kind) || 'play';
      this.maxBed = (opts && opts.maxHeight) || MAX_BED_HEIGHT[this.kind] || 480;
      this.el = h('div', { class: 'board board-' + this.kind });
      this.bed = h('div', { class: 'board-bed' });
      this.cells = h('div', { class: 'board-cells', 'aria-hidden': 'true' });
      const quiet = this.kind === 'thumb' || this.kind === 'preview';
      this.layer = h('div', { class: 'board-pieces', role: quiet ? null : 'group', 'aria-label': quiet ? null : '棋盤' });
      this.overlay = h('div', { class: 'board-overlay' });
      this.exit = h('div', { class: 'board-exit', 'aria-hidden': 'true' });
      this.bed.append(this.cells, this.layer, this.overlay, this.exit);
      this.el.appendChild(this.bed);
      if (this.kind === 'thumb' || this.kind === 'preview') this.el.setAttribute('aria-hidden', 'true');
      this.pieceEls = [];
      this.size = null;
    }

    setup(st) {
      const sig = st.cols + 'x' + st.rows + st.exit.side + st.exit.at;
      if (this.sig === sig) return;
      this.sig = sig;
      this.size = { cols: st.cols, rows: st.rows };
      this.geo = geometry(st.cols, st.rows);
      this.bed.style.aspectRatio = this.geo.bw + ' / ' + this.geo.bh;
      // 字級、圓角以「一格」為單位，盤面多寬都一樣好看
      this.el.style.setProperty('--u', (100 / this.geo.bw) + 'cqw');
      // 直長的盤面依高度限制寬度（外框寬度另計）
      this.el.style.maxWidth = 'min(100%, calc(' + Math.round(this.maxBed * this.geo.bw / this.geo.bh) + 'px + 2 * var(--pad)))';
      this.cells.textContent = '';
      for (let y = 0; y < st.rows; y++) for (let x = 0; x < st.cols; x++) {
        const c = h('div', { class: 'cell' });
        place(c, this.geo.rect(x, y, 1, 1));
        this.cells.appendChild(c);
      }
      // 出口缺口：畫在外框上，對準出口的兩格
      const e = st.exit;
      this.exit.className = 'board-exit exit-' + e.side;
      this.exit.removeAttribute('style');
      if (e.side === 'bottom' || e.side === 'top') {
        const r = this.geo.rect(e.at, 0, 2, 1);
        this.exit.style.left = r.left + '%';
        this.exit.style.width = r.width + '%';
      } else {
        const r = this.geo.rect(0, e.at, 1, 2);
        this.exit.style.top = r.top + '%';
        this.exit.style.height = r.height + '%';
      }
    }

    makePiece(p, i) {
      const tag = this.kind === 'thumb' || this.kind === 'preview' ? 'div' : 'button';
      const el = h(tag, { class: 'piece piece-' + p.type, 'data-i': i, 'data-type': p.type });
      if (tag === 'button') el.type = 'button';
      if (this.kind !== 'thumb') el.appendChild(h('span', { class: 'piece-label' }));
      return el;
    }

    /* view: { selected, hint, arrows: [{dx, dy, hot, label}], ghost: {type, x, y, ok, label}, dim: [i] } */
    render(st, view) {
      const v = view || {};
      this.setup(st);
      while (this.pieceEls.length > st.pieces.length) this.pieceEls.pop().remove();
      st.pieces.forEach((p, i) => {
        let el = this.pieceEls[i];
        if (!el || el.dataset.type !== p.type) {
          const fresh = this.makePiece(p, i);
          if (el) el.replaceWith(fresh); else this.layer.appendChild(fresh);
          el = this.pieceEls[i] = fresh;
        }
        place(el, this.geo.rect(p.x, p.y, p.w, p.h));
        if (this.kind === 'thumb') return;
        const label = el.firstChild;
        const text = this.kind === 'edit' ? p.label : HRD.settings.pieceText(p.label);
        if (label.textContent !== text) label.textContent = text;
        if (this.kind === 'preview') return;
        el.classList.toggle('is-selected', v.selected === i);
        el.classList.toggle('is-hint', v.hint === i);
        el.classList.toggle('is-dim', !!(v.dim && v.dim.includes(i)));
        el.setAttribute('aria-label', describe(p) + (v.selected === i ? '，已選取' : ''));
        el.setAttribute('aria-pressed', v.selected === i ? 'true' : 'false');
      });

      this.overlay.textContent = '';
      if (v.ghost) {
        const t = E.TYPES[v.ghost.type];
        const g = h('div', { class: 'ghost ghost-' + v.ghost.type + (v.ghost.ok ? ' ghost-ok' : ' ghost-bad'), 'aria-hidden': 'true' },
          v.ghost.label ? h('span', { class: 'piece-label', text: v.ghost.label }) : null);
        place(g, this.geo.rect(v.ghost.x, v.ghost.y, t.w, t.h));
        this.overlay.appendChild(g);
      }
      if (v.arrows && v.selected != null) {
        const p = st.pieces[v.selected];
        v.arrows.forEach((a) => {
          const left = a.dx > 0 ? this.geo.cx(p.x + p.w) : a.dx < 0 ? this.geo.cx(p.x - 1) : this.geo.midX(p.x, p.w);
          const top = a.dy > 0 ? this.geo.cy(p.y + p.h) : a.dy < 0 ? this.geo.cy(p.y - 1) : this.geo.midY(p.y, p.h);
          const rot = a.dy < 0 ? 0 : a.dx > 0 ? 90 : a.dy > 0 ? 180 : 270;
          const b = h('button', {
            type: 'button', class: 'move-arrow' + (a.hot ? ' is-hot' : ''),
            'data-dx': a.dx, 'data-dy': a.dy, 'aria-label': a.label,
            style: { left: left + '%', top: top + '%' },
          }, icon('arrow', 22));
          b.firstChild.style.transform = 'rotate(' + rot + 'deg)';
          this.overlay.appendChild(b);
        });
      }
    }

    pieceButton(i) { return this.pieceEls[i] || null; }

    /* 相鄰兩格左上角的距離（像素） */
    unitPx() {
      const r = this.bed.getBoundingClientRect();
      return r.width / this.geo.bw * (1 + GAP);
    }

    /* 指標位置對應到哪一格（超出時夾在邊界內） */
    cellAt(clientX, clientY) {
      const r = this.bed.getBoundingClientRect();
      const fx = (clientX - r.left) / r.width * this.geo.bw / (1 + GAP);
      const fy = (clientY - r.top) / r.height * this.geo.bh / (1 + GAP);
      return {
        x: Math.max(0, Math.min(this.size.cols - 1, Math.floor(fx))),
        y: Math.max(0, Math.min(this.size.rows - 1, Math.floor(fy))),
        inside: fx >= 0 && fy >= 0 && fx < this.size.cols && fy < this.size.rows,
      };
    }
  }

  /* 關卡縮圖 */
  function thumb(level, st, maxHeight) {
    const view = new BoardView({ kind: 'thumb', maxHeight: maxHeight });
    view.render(st || E.levelToState(level));
    return view.el;
  }

  /* 棋盤下方的「出口」標示：箭頭指向出口那一邊 */
  function exitLabel(st) {
    const rot = { bottom: 0, top: 180, left: 90, right: -90 }[st.exit.side];
    const svg = icon('down', 18);
    svg.style.transform = 'rotate(' + rot + 'deg)';
    const text = E.isStandard(st) ? '出口' : '出口在' + E.exitText(st);
    return h('div', { class: 'exit-label', 'aria-hidden': 'true' }, svg, text);
  }

  HRD.BoardView = BoardView;
  HRD.exitLabel = exitLabel;
  HRD.thumb = thumb;
})(window);
