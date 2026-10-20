/* 成績圖卡：用 canvas 畫一張 1080 × 1350 的 PNG（適合手機與社群），一律用淺色配色。 */
(function (root) {
  'use strict';
  const t = (s, p) => root.HRD.i18n.t(s, p);
  const HRD = root.HRD;
  const E = HRD.engine;

  const W = 1080, H = 1350;
  const C = {
    bg: '#F2F3EF', surface: '#FFFFFF', ink: '#1A2220', muted: '#56615C', line: '#DDE1DA',
    accent: '#B23A2A', frame: '#2E3D38', well: '#24322D',
    king: '#B23A2A', kingInk: '#FFF6EE', gen: '#2D4466', genInk: '#F4F1EA', sol: '#E8E1CF', solInk: '#2A2420',
    gold: '#F2B544', off: '#D5D9D2',
  };
  const SERIF = '"Noto Serif TC", "Songti TC", "PMingLiU", serif';
  const SANS = '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';
  const MONO = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function star(ctx, cx, cy, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const rad = i % 2 ? r * 0.45 : r;
      ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
    }
    ctx.closePath();
  }

  /* 文字太寬時縮小字級 */
  function fitFont(ctx, text, weight, size, family, maxWidth, minSize) {
    let s = size;
    const min = minSize || 28;
    ctx.font = weight + ' ' + s + 'px ' + family;
    while (s > min && ctx.measureText(text).width > maxWidth) {
      s -= 2;
      ctx.font = weight + ' ' + s + 'px ' + family;
    }
    return s;
  }

  /* 等網頁字型載好（最多 1.5 秒），圖卡上的中文才會用到同一套字型 */
  async function fontsReady(text) {
    if (!document.fonts || !document.fonts.load) return;
    const loads = [
      document.fonts.load('900 80px "Noto Serif TC"', text),
      document.fonts.load('700 60px "Noto Sans TC"', text),
      document.fonts.load('400 30px "Noto Sans TC"', text),
    ];
    await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 1500))]).catch(() => {});
  }

  function drawBoard(ctx, st, x, y, cell, gap, pad) {
    const bw = st.cols * cell + (st.cols - 1) * gap, bh = st.rows * cell + (st.rows - 1) * gap;
    ctx.fillStyle = C.frame;
    rr(ctx, x, y, bw + pad * 2, bh + pad * 2, 28);
    ctx.fill();
    const ox = x + pad, oy = y + pad;
    ctx.fillStyle = C.well;
    for (let r = 0; r < st.rows; r++) for (let c = 0; c < st.cols; c++) {
      rr(ctx, ox + c * (cell + gap), oy + r * (cell + gap), cell, cell, 12);
      ctx.fill();
    }
    // 出口缺口（畫在外框上，對準出口的兩格）
    ctx.fillStyle = C.bg;
    const e = st.exit, span = 2 * cell + gap, step = cell + gap;
    if (e.side === 'bottom') ctx.fillRect(ox + e.at * step, oy + bh, span, pad + 1);
    else if (e.side === 'top') ctx.fillRect(ox + e.at * step, y - 1, span, pad + 1);
    else if (e.side === 'left') ctx.fillRect(x - 1, oy + e.at * step, pad + 1, span);
    else ctx.fillRect(ox + bw, oy + e.at * step, pad + 1, span);

    st.pieces.forEach((p) => {
      const px = ox + p.x * (cell + gap), py = oy + p.y * (cell + gap);
      const pw = p.w * cell + (p.w - 1) * gap, ph = p.h * cell + (p.h - 1) * gap;
      const fill = p.type === 'king' ? C.king : p.type === 'soldier' ? C.sol : C.gen;
      const ink = p.type === 'king' ? C.kingInk : p.type === 'soldier' ? C.solInk : C.genInk;
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      rr(ctx, px, py, pw, ph, 14);
      ctx.fill();
      ctx.fillStyle = fill;
      rr(ctx, px, py, pw, ph - 7, 14);
      ctx.fill();
      const size = Math.round(cell * (p.type === 'king' ? 0.54 : p.type === 'soldier' ? 0.32 : 0.36));
      ctx.font = '900 ' + size + 'px ' + SERIF;
      ctx.fillStyle = ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = t(p.label);
      const chars = Array.from(label);
      const cx = px + pw / 2, cy = py + (ph - 7) / 2;
      // 縮小字級直到放得下
      const fitTo = (max) => { let s = size; while (s > 10 && ctx.measureText(label).width > max) { s -= 2; ctx.font = '900 ' + s + 'px ' + SERIF; } };
      const cjk = /[\u3400-\u9fff]/.test(label);
      if (p.type === 'tall' && chars.length > 1 && cjk) {
        const lh = size * 1.12;
        chars.slice(0, 4).forEach((ch, i, arr) => ctx.fillText(ch, cx, cy + (i - (arr.length - 1) / 2) * lh));
      } else if (p.type === 'tall' && chars.length > 1) {
        // 英文名字轉 90 度直著寫
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(Math.PI / 2);
        fitTo(ph - 7 - 20);
        ctx.fillText(label, 0, 0);
        ctx.restore();
      } else {
        fitTo(pw - 16);
        ctx.fillText(label, cx, cy);
      }
    });
    return { w: bw + pad * 2, h: bh + pad * 2 };
  }

  /*
   * r: { level, steps, timeMs, minMoves, stars, hints, subtitle, code }
   * 回傳 Promise<Blob>（PNG）
   */
  async function render(r) {
    const st = E.levelToState(r.level);
    await fontsReady(r.level.name + st.pieces.map((p) => t(p.label)).join('') + t('華容道過關步數最少用時換你挑戰在貼上分享碼提示次') + (r.subtitle || '') + '0123456789:');

    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    // 標誌
    ctx.fillStyle = C.accent;
    rr(ctx, 72, 64, 84, 84, 20);
    ctx.fill();
    ctx.fillStyle = C.kingInk;
    ctx.font = '900 52px ' + SERIF;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t('華'), 114, 108);
    ctx.fillStyle = C.ink;
    ctx.textAlign = 'left';
    ctx.font = '900 46px ' + SERIF;
    ctx.fillText(t('華 容 道'), 180, 108);

    // 過關印章
    ctx.save();
    ctx.translate(W - 160, 132);
    ctx.rotate(-8 * Math.PI / 180);
    ctx.fillStyle = C.accent;
    ctx.beginPath(); ctx.arc(0, 0, 76, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,246,238,0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 64, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = C.kingInk;
    ctx.font = '900 46px ' + SERIF;
    ctx.textAlign = 'center';
    ctx.fillText(t('過關'), 0, 2);
    ctx.restore();

    // 關卡名稱與副標
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.ink;
    fitFont(ctx, r.level.name, '900', 92, SERIF, W - 144 - 190);
    ctx.fillText(r.level.name, 72, 292);
    if (r.subtitle) {
      ctx.fillStyle = C.muted;
      ctx.font = '400 32px ' + SANS;
      ctx.fillText(r.subtitle, 74, 346);
    }

    // 盤面（開局）：放進 640 × 568 的區域，置中
    const gap = 8, pad = 18;
    const cell = Math.min(110, Math.floor((640 - pad * 2 - (st.cols - 1) * gap) / st.cols), Math.floor((568 - pad * 2 - (st.rows - 1) * gap) / st.rows));
    const bw = st.cols * cell + (st.cols - 1) * gap + pad * 2;
    const bh = st.rows * cell + (st.rows - 1) * gap + pad * 2;
    drawBoard(ctx, st, (W - bw) / 2, 392 + Math.max(0, (568 - bh) / 2), cell, gap, pad);

    // 成績
    const cols = [
      [t('步數'), String(r.steps)],
      [t('最少'), r.minMoves != null ? String(r.minMoves) : '—'],
      [t('用時'), HRD.ui.formatTime(r.timeMs)],
    ];
    cols.forEach((c, i) => {
      const cx = W / 2 + (i - 1) * 300;
      ctx.textAlign = 'center';
      ctx.fillStyle = C.muted;
      ctx.font = '400 30px ' + SANS;
      ctx.fillText(c[0], cx, 1006);
      ctx.fillStyle = C.ink;
      ctx.font = '700 76px ' + SANS;
      ctx.fillText(c[1], cx, 1088);
    });
    if (r.stars) {
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i < r.stars ? C.gold : C.off;
        star(ctx, W / 2 + (i - 1) * 84, 1178, 32);
        ctx.fill();
      }
    }

    // 底部：挑戰方式
    ctx.fillStyle = C.surface;
    ctx.fillRect(0, 1232, W, H - 1232);
    ctx.fillStyle = C.line;
    ctx.fillRect(0, 1232, W, 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = C.ink;
    ctx.font = '700 32px ' + SANS;
    ctx.fillText(r.code ? t('換你挑戰！在華容道貼上分享碼：') : t('換你挑戰！'), W / 2, 1284);
    if (r.code) {
      ctx.fillStyle = C.muted;
      fitFont(ctx, r.code, '400', 26, MONO, W - 120, 12);
      ctx.fillText(r.code, W / 2, 1326);
    }

    return new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(t('圖卡產生失敗')))), 'image/png');
    });
  }

  HRD.scoreCard = { render, WIDTH: W, HEIGHT: H };
})(window);
