/* =========================================================================
   === PLL系リザルトの「Xでシェア」 (pll-share.js) ===========================
   PLL検定・PLLフラッシュ・PLLビジョンのリザルト画面に、結果を X へ
   投稿するボタンを足す。

   - 押すと X の投稿画面（x.com/intent/post）を新しいタブで開く。
     文面は下書きとして入るだけで、投稿するかどうかは本人が決める。
     アプリからどこかへ記録を送ることはない（サーバーなしの方針のまま）。
   - 文面は画面に出ている結果（モード名・難易度・正解数・タイム）から作る。
     フラッシュとビジョンは、1問ごとの正誤を 🟩🟥 のマスで添える
     （ビジョンは出題と同じ3×3）。答えのPLL名は書かない＝ネタバレしない。
   - ボタンはリザルトの「戻る／もう一度挑戦」の下に置く。
     検定の画面は index.html に最初からあるので起動時に、フラッシュの
     画面は初めて開いたときに作られるので、作られたのを見てから足す。
   - 文言は 9 言語。I18N に無いキーだけを足す（既存は上書きしない）。
   ========================================================================= */
(function (global) {
  'use strict';

  const SITE_URL = 'https://virtualcubechallenge.github.io/cube/';
  const HASHTAG = '#VirtualCubeChallenge';

  const SHARE_I18N = {
    ja:      { shareX: 'Xでシェア', shareScore: '正解', shareAvg: '平均判別', shareTime: '回答タイム', shareBest: '自己ベスト更新！', shareSaved: '結果の画像を保存しました。Xの投稿に添付してください', shareOpenX: 'Xを開いて投稿', shareSaveImg: '画像を保存・共有', shareCopied: '結果の画像をコピーしました', shareCopyFail: '画像をコピーできませんでした', sharePasteHint: 'Xの投稿画面で本文の欄を長押し →「ペースト」で、この画像を添付できます', shareSaveHint: '「画像を保存・共有」で写真に保存してから、Xの投稿に添付してください' },
    en:      { shareX: 'Share on X', shareScore: 'Correct', shareAvg: 'Avg recognition', shareTime: 'Answer time', shareBest: 'New personal best!', shareSaved: 'Saved the result image. Attach it to your X post.', shareOpenX: 'Open X to post', shareSaveImg: 'Save / share image', shareCopied: 'Result image copied', shareCopyFail: "Couldn't copy the image", sharePasteHint: 'In the X post screen, long-press the text box and tap Paste to attach this image.', shareSaveHint: 'Use “Save / share image” to save it, then attach it to your X post.' },
    'zh-CN': { shareX: '分享到 X', shareScore: '正确', shareAvg: '平均判断', shareTime: '作答用时', shareBest: '刷新个人最佳！', shareSaved: '已保存结果图片，请在 X 帖子中附上。', shareOpenX: '打开 X 发帖', shareSaveImg: '保存/分享图片', shareCopied: '已复制结果图片', shareCopyFail: '无法复制图片', sharePasteHint: '在 X 发帖界面长按输入框 →「粘贴」即可附上这张图片。', shareSaveHint: '请用「保存/分享图片」保存后，再附到 X 帖子中。' },
    'zh-TW': { shareX: '分享到 X', shareScore: '正確', shareAvg: '平均判斷', shareTime: '作答用時', shareBest: '刷新個人最佳！', shareSaved: '已儲存結果圖片，請在 X 貼文中附上。', shareOpenX: '打開 X 發文', shareSaveImg: '儲存/分享圖片', shareCopied: '已複製結果圖片', shareCopyFail: '無法複製圖片', sharePasteHint: '在 X 發文畫面長按輸入框 →「貼上」即可附上這張圖片。', shareSaveHint: '請用「儲存/分享圖片」儲存後，再附到 X 貼文中。' },
    ko:      { shareX: 'X에 공유', shareScore: '정답', shareAvg: '평균 판별', shareTime: '답변 시간', shareBest: '개인 최고 기록 갱신!', shareSaved: '결과 이미지를 저장했어요. X 게시물에 첨부해 주세요.', shareOpenX: 'X 열어서 게시', shareSaveImg: '이미지 저장·공유', shareCopied: '결과 이미지를 복사했어요', shareCopyFail: '이미지를 복사하지 못했어요', sharePasteHint: 'X 작성 화면에서 입력란을 길게 눌러 ‘붙여넣기’하면 이 이미지가 첨부돼요.', shareSaveHint: '‘이미지 저장·공유’로 저장한 뒤 X 게시물에 첨부해 주세요.' },
    es:      { shareX: 'Compartir en X', shareScore: 'Aciertos', shareAvg: 'Reconocimiento medio', shareTime: 'Tiempo de respuesta', shareBest: '¡Nuevo récord personal!', shareSaved: 'Imagen del resultado guardada. Adjúntala a tu publicación en X.', shareOpenX: 'Abrir X para publicar', shareSaveImg: 'Guardar / compartir imagen', shareCopied: 'Imagen del resultado copiada', shareCopyFail: 'No se pudo copiar la imagen', sharePasteHint: 'En X, mantén pulsado el cuadro de texto y toca Pegar para adjuntar esta imagen.', shareSaveHint: 'Usa «Guardar / compartir imagen» y luego adjúntala a tu publicación en X.' },
    id:      { shareX: 'Bagikan ke X', shareScore: 'Benar', shareAvg: 'Rata-rata pengenalan', shareTime: 'Waktu menjawab', shareBest: 'Rekor pribadi baru!', shareSaved: 'Gambar hasil disimpan. Lampirkan di postingan X kamu.', shareOpenX: 'Buka X untuk posting', shareSaveImg: 'Simpan / bagikan gambar', shareCopied: 'Gambar hasil disalin', shareCopyFail: 'Gambar tidak bisa disalin', sharePasteHint: 'Di layar posting X, tekan lama kolom teks lalu ketuk Tempel untuk melampirkan gambar ini.', shareSaveHint: 'Gunakan “Simpan / bagikan gambar”, lalu lampirkan di postingan X.' },
    ru:      { shareX: 'Поделиться в X', shareScore: 'Верно', shareAvg: 'Среднее распознавание', shareTime: 'Время ответа', shareBest: 'Новый личный рекорд!', shareSaved: 'Изображение результата сохранено. Прикрепите его к посту в X.', shareOpenX: 'Открыть X и опубликовать', shareSaveImg: 'Сохранить / поделиться', shareCopied: 'Изображение результата скопировано', shareCopyFail: 'Не удалось скопировать изображение', sharePasteHint: 'В окне поста X нажмите и удерживайте поле текста и выберите «Вставить», чтобы прикрепить изображение.', shareSaveHint: 'Сохраните его через «Сохранить / поделиться» и прикрепите к посту в X.' },
    'pt-BR': { shareX: 'Compartilhar no X', shareScore: 'Acertos', shareAvg: 'Reconhecimento médio', shareTime: 'Tempo de resposta', shareBest: 'Novo recorde pessoal!', shareSaved: 'Imagem do resultado salva. Anexe-a ao seu post no X.', shareOpenX: 'Abrir o X para postar', shareSaveImg: 'Salvar / compartilhar imagem', shareCopied: 'Imagem do resultado copiada', shareCopyFail: 'Não foi possível copiar a imagem', sharePasteHint: 'Na tela de post do X, toque e segure a caixa de texto e escolha Colar para anexar esta imagem.', shareSaveHint: 'Use “Salvar / compartilhar imagem” e depois anexe ao seu post no X.' }
  };
  if (typeof I18N !== 'undefined' && I18N) {
    Object.keys(SHARE_I18N).forEach(function (lang) {
      if (!I18N[lang]) I18N[lang] = {};
      Object.keys(SHARE_I18N[lang]).forEach(function (k) {
        if (I18N[lang][k] === undefined) I18N[lang][k] = SHARE_I18N[lang][k];
      });
    });
  }
  function tx(key) {
    try {
      if (typeof global.t === 'function') {
        const s = global.t(key);
        if (s && s !== key) return s;
      }
    } catch (e) {}
    return SHARE_I18N.ja[key] !== undefined ? SHARE_I18N.ja[key] : key;
  }
  function $(id) { return document.getElementById(id); }
  function txt(id) { const e = $(id); return e ? e.textContent.trim() : ''; }

  /* ------------------------------------------------------------ 見た目 -- */
  const CSS = [
    // 2列（左=戻るの上、右=もう一度挑戦の上）。下の .pllt-result-actions と同じ列幅・すき間
    '.pls-top{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:16px;align-items:stretch}',
    '.pls-top+.pllt-result-actions{margin-top:8px}',
    '.pls-top .pllt-ticket-row{margin:0;min-width:0;flex-wrap:nowrap}',
    // 半分の幅に収まるよう、ここでだけ木札を少し詰める（寿司屋へ飛ぶ「›」が付いても収まるように）
    '.pls-top .pllt-ticket-row .pllt-kan-fuda{max-width:100%;min-width:0;white-space:nowrap;gap:5px;padding:6px 9px 7px}',
    // 幅の狭い端末では「ためた貫」の文字を省き、「貫 +10」だけにする
    '@media (max-width:400px){.pls-top .pllt-ticket-row .pllt-kan-label{display:none}}',
    '.pls-share{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin:0;min-width:0;',
    '  padding:12px 14px;border-radius:10px;background:#000;color:#fff;border:1px solid #3a3a46;',
    '  font-family:inherit;font-size:13px;font-weight:800;cursor:pointer;touch-action:manipulation;',
    '  -webkit-tap-highlight-color:transparent;transition:transform .12s ease,border-color .12s ease}',
    '.pls-share:active{transform:scale(.97);border-color:#6a6a7a}',
    '.pls-share svg{width:15px;height:15px;fill:currentColor;flex:none}'
  ].join('\n');
  function injectCSS() {
    if ($('pll-share-style')) return;
    const st = document.createElement('style');
    st.id = 'pll-share-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  // X のロゴ（文字の代わりに置く小さなマーク）
  const X_LOGO = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.67l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23Zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64Z"/></svg>';

  function makeButton(id, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.id = id;
    b.className = 'pls-share';
    b.innerHTML = X_LOGO + '<span></span>';
    b.addEventListener('click', onClick);
    return b;
  }
  function paintButtons() {
    ['pls-share-pllt', 'pls-share-plf'].forEach(function (id) {
      const b = $(id);
      if (b) b.querySelector('span').textContent = tx('shareX');
    });
  }

  /* ------------------------------------------------------------ 文面 -- */
  // 正誤のマス：○=🟩 ✕=🟥。cols ごとに改行
  function grid(oks, cols) {
    let s = '';
    oks.forEach(function (ok, i) {
      s += ok ? '🟩' : '🟥';
      if ((i + 1) % cols === 0 && i < oks.length - 1) s += '\n';
    });
    return s;
  }
  function textPllt() {
    return [
      '🧊 ' + tx('plltTitle'),
      '✅ ' + tx('shareScore') + ' ' + txt('pllt-res-score') + ' ' + txt('pllt-res-acc'),
      '⏱ ' + tx('shareAvg') + ' ' + txt('pllt-res-avg') + 's',
      '',
      HASHTAG
    ].join('\n');
  }
  function textPlf() {
    const root = $('plf-overlay');
    const vision = !!(root && root.dataset.mode === 'vision');
    const lines = [
      (vision ? '👁 ' + tx('plvTitle') : '⚡ ' + tx('plfTitle')) + ' | ' + txt('plf-res-lv'),
      '✅ ' + tx('shareScore') + ' ' + txt('plf-res-score') + ' ' + txt('plf-res-acc'),
      '⏱ ' + tx('shareTime') + ' ' + txt('plf-res-time') + 's'
    ];
    const nb = $('plf-newbest');
    if (nb && !nb.hidden) lines.push('🏆 ' + tx('shareBest'));
    try {
      const st = global.PllFlash && global.PllFlash.getState();
      if (st && st.targetPLLs && st.targetPLLs.length) {
        const oks = st.targetPLLs.map(function (name, i) { return st.userAnswers[i] === name; });
        void oks;   // 正誤のマスは画像に描くので、文面には入れない
      }
    } catch (e) {}
    lines.push('', HASHTAG);
    return lines.join('\n');
  }

  /* ------------------------------------------------------ 結果の画像 --
     文字だけだと書き換えて投稿できてしまうので、リザルト画面と同じ内容を
     1枚の画像（1080×1350）に描いて添付する。画面の DOM をそのまま写すのでは
     なく、同じ数字・同じキューブを canvas に描き直す（3D の CSS は画像に
     写せないため）。日時も焼き込む。 */
  const IW = 1080, IH = 1350;
  function css(name, fb) {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fb;
    } catch (e) { return fb; }
  }
  function fontStack() {
    try { return getComputedStyle(document.body).fontFamily || 'sans-serif'; } catch (e) { return 'sans-serif'; }
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function shade(hex, k) {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = Math.round(((n >> 16) & 255) * k), g = Math.round(((n >> 8) & 255) * k), b = Math.round((n & 255) * k);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  // 画面と同じ見え方（上面＋手前の2面）のキューブを、等角図で描く
  function drawCube(ctx, cx, cy, a, cube) {
    const c30 = Math.cos(Math.PI / 6);
    const T = [cx, cy - a], Rt = [cx + a * c30, cy - a / 2], C = [cx, cy], Lt = [cx - a * c30, cy - a / 2];
    const left = cube.angle === 'FL' ? cube.L : cube.F;
    const right = cube.angle === 'FL' ? cube.F : cube.R;
    function quad(p0, ex, ey, u0, v0, u1, v1, col) {
      const P = function (u, v) { return [p0[0] + ex[0] * u + ey[0] * v, p0[1] + ex[1] * u + ey[1] * v]; };
      const g = 0.06;  // ステッカーのすき間
      const q = [P(u0 + g / 3, v0 + g / 3), P(u1 - g / 3, v0 + g / 3), P(u1 - g / 3, v1 - g / 3), P(u0 + g / 3, v1 - g / 3)];
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(q[0][0], q[0][1]); ctx.lineTo(q[1][0], q[1][1]); ctx.lineTo(q[2][0], q[2][1]); ctx.lineTo(q[3][0], q[3][1]);
      ctx.closePath(); ctx.fill();
    }
    // 黒い本体
    ctx.fillStyle = '#0b0b0f';
    ctx.beginPath();
    ctx.moveTo(T[0], T[1]); ctx.lineTo(Rt[0], Rt[1]); ctx.lineTo(Rt[0], Rt[1] + a); ctx.lineTo(C[0], C[1] + a);
    ctx.lineTo(Lt[0], Lt[1] + a); ctx.lineTo(Lt[0], Lt[1]); ctx.closePath(); ctx.fill();
    const third = 1 / 3;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      // 上面
      quad(Lt, [T[0] - Lt[0], T[1] - Lt[1]], [C[0] - Lt[0], C[1] - Lt[1]], c * third, r * third, (c + 1) * third, (r + 1) * third, cube.U);
      // 手前の左の面・右の面（上段3マスがPLLの見える部分）。右は少し暗くして立体に見せる
      quad(Lt, [C[0] - Lt[0], C[1] - Lt[1]], [0, a], c * third, r * third, (c + 1) * third, (r + 1) * third, shade(left[r * 3 + c], 0.9));
      quad(C, [Rt[0] - C[0], Rt[1] - C[1]], [0, a], c * third, r * third, (c + 1) * third, (r + 1) * third, shade(right[r * 3 + c], 0.75));
    }
  }
  function fitText(ctx, s, maxW) {
    if (ctx.measureText(s).width <= maxW) return s;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  }
  function stamp() {
    const d = new Date(), z = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes());
  }

  // 共通の枠：背景・パネル・見出し・数字3つ・足もと。中身（ふりかえり）は draw() に任せる
  function renderCard(o) {
    const cv = document.createElement('canvas');
    cv.width = IW; cv.height = IH;
    const ctx = cv.getContext('2d');
    const F = fontStack();
    const tc = css('--tc', '#2ef2c0');
    const tcRgb = css('--tc-rgb', '46,242,192');

    ctx.fillStyle = '#06060a'; ctx.fillRect(0, 0, IW, IH);
    let g = ctx.createRadialGradient(IW * 0.5, 0, 0, IW * 0.5, 0, IW * 0.9);
    g.addColorStop(0, 'rgba(' + tcRgb + ',.20)'); g.addColorStop(1, 'rgba(' + tcRgb + ',0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, IW, IH);
    g = ctx.createRadialGradient(IW, IH, 0, IW, IH, IW * 0.9);
    g.addColorStop(0, 'rgba(150,80,255,.16)'); g.addColorStop(1, 'rgba(150,80,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, IW, IH);

    const PX = 48, PY = 48, PW = IW - 96, PH = IH - 96;
    rr(ctx, PX, PY, PW, PH, 36);
    ctx.fillStyle = '#121218'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#2c2c38'; ctx.stroke();

    const L = PX + 44, R = PX + PW - 44, CW = R - L;
    ctx.textBaseline = 'alphabetic';
    // アプリ名
    ctx.font = '800 26px ' + F; ctx.fillStyle = tc; ctx.textAlign = 'left';
    ctx.fillText('VIRTUAL CUBE CHALLENGE', L, PY + 72);
    // モード名と難易度
    ctx.font = '900 56px ' + F; ctx.fillStyle = '#f2f2f8';
    ctx.fillText(fitText(ctx, o.title, CW - (o.level ? 200 : 0)), L, PY + 148);
    if (o.level) {
      ctx.font = '900 34px ' + F;
      const w = Math.max(120, ctx.measureText(o.level).width + 52);
      rr(ctx, R - w, PY + 98, w, 64, 32);
      ctx.fillStyle = 'rgba(' + tcRgb + ',.14)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(' + tcRgb + ',.6)'; ctx.stroke();
      ctx.fillStyle = tc; ctx.textAlign = 'center';
      ctx.fillText(o.level, R - w / 2, PY + 142);
    }
    let y = PY + 178;
    if (o.best) {
      ctx.font = '900 28px ' + F; ctx.textAlign = 'left';
      const s = '🏆 ' + tx('shareBest');
      const w = ctx.measureText(s).width + 44;
      rr(ctx, L, y, w, 52, 26);
      ctx.fillStyle = 'rgba(255,200,80,.14)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,200,80,.7)'; ctx.stroke();
      ctx.fillStyle = '#ffd36a'; ctx.fillText(s, L + 22, y + 36);
      y += 70;
    } else {
      y += 18;
    }
    // 数字3つ（画面の .pllt-summary と同じ並び）
    const gap = 20, bw = (CW - gap * 2) / 3, bh = 150;
    o.stats.forEach(function (st, i) {
      const x = L + i * (bw + gap);
      rr(ctx, x, y, bw, bh, 22);
      ctx.fillStyle = '#17171e'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#2a2a36'; ctx.stroke();
      ctx.textAlign = 'center';
      ctx.font = '700 26px ' + F; ctx.fillStyle = '#8b8b9c';
      ctx.fillText(fitText(ctx, st.label, bw - 20), x + bw / 2, y + 46);
      ctx.font = '900 ' + (st.small ? 48 : 60) + 'px ' + F; ctx.fillStyle = tc;
      const main = st.value, sub = st.sub || '';
      ctx.font = '900 60px ' + F;
      let mw = ctx.measureText(main).width;
      ctx.font = '800 28px ' + F;
      const sw = sub ? ctx.measureText(sub).width + 6 : 0;
      let size = 60;
      while (mw + sw > bw - 24 && size > 34) { size -= 2; ctx.font = '900 ' + size + 'px ' + F; mw = ctx.measureText(main).width; }
      const sx = x + bw / 2 - (mw + sw) / 2;
      ctx.textAlign = 'left';
      ctx.font = '900 ' + size + 'px ' + F; ctx.fillStyle = tc;
      ctx.fillText(main, sx, y + 118);
      if (sub) { ctx.font = '800 28px ' + F; ctx.fillStyle = 'rgba(' + tcRgb + ',.75)'; ctx.fillText(sub, sx + mw + 6, y + 118); }
    });
    y += bh + 46;
    // ふりかえりの見出し
    ctx.textAlign = 'left'; ctx.font = '800 30px ' + F; ctx.fillStyle = '#9a9aac';
    ctx.fillText(o.reviewTitle, L, y);
    y += 22;
    const footY = PY + PH - 40;
    o.draw(ctx, { L: L, R: R, CW: CW, top: y, bottom: footY - 48, F: F, tc: tc, tcRgb: tcRgb });
    // 足もと：日時と URL・ハッシュタグ
    ctx.strokeStyle = '#26262f'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(L, footY - 34); ctx.lineTo(R, footY - 34); ctx.stroke();
    // 左に日時、右にサイトの URL（ハッシュタグは投稿の文面のほうに入れる）
    ctx.font = '700 24px ' + F; ctx.fillStyle = '#6e6e80'; ctx.textAlign = 'left';
    ctx.fillText(stamp(), L, footY);
    ctx.textAlign = 'right';
    ctx.fillText(SITE_URL.replace(/^https:\/\//, ''), R, footY);
    return cv;
  }

  // フラッシュ・ビジョン：1問ずつのマス（番号・○✕・キューブ・PLL名・あなたの答え）
  function drawCells(cubes, names, answers, cols) {
    return function (ctx, b) {
      const n = names.length, rows = Math.ceil(n / cols);
      const gap = 18;
      const cw = (b.CW - gap * (cols - 1)) / cols;
      const ch = Math.min(cols === 3 ? 236 : 300, (b.bottom - b.top - gap * (rows - 1)) / rows);
      const totalH = rows * ch + (rows - 1) * gap;
      const y0 = b.top + Math.max(0, (b.bottom - b.top - totalH) / 2);
      for (let i = 0; i < n; i++) {
        const r = (i / cols) | 0, c = i % cols;
        // 最後の段が埋まりきらないときは中央に寄せる
        const inRow = r === rows - 1 ? n - r * cols : cols;
        const offX = (cols - inRow) * (cw + gap) / 2;
        const x = b.L + offX + c * (cw + gap), y = y0 + r * (ch + gap);
        const ok = answers[i] === names[i];
        rr(ctx, x, y, cw, ch, 20);
        ctx.fillStyle = ok ? '#14181a' : '#22151a'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = ok ? 'rgba(79,224,168,.45)' : 'rgba(255,106,122,.6)'; ctx.stroke();
        ctx.font = '900 30px ' + b.F; ctx.textAlign = 'left'; ctx.fillStyle = '#ff4d6a';
        ctx.fillText(String.fromCharCode(0x2460 + i), x + 14, y + 40);
        ctx.textAlign = 'right'; ctx.fillStyle = ok ? '#4fe0a8' : '#ff6a7a';
        ctx.fillText(ok ? '○' : '✕', x + cw - 16, y + 40);
        const name = names[i], you = answers[i];
        const nameY = y + ch - (ok ? 26 : 56);
        const a = Math.min(cw * 0.3, (nameY - 40 - (y + 30)) / 1.9);
        drawCube(ctx, x + cw / 2, y + 30 + (nameY - 40 - (y + 30)) / 2 + a * 0.05, a, cubes[i]);
        ctx.textAlign = 'center'; ctx.font = '900 38px ' + b.F; ctx.fillStyle = '#eeeef4';
        ctx.fillText(name, x + cw / 2, nameY);
        if (!ok) {
          ctx.font = '700 24px ' + b.F; ctx.fillStyle = '#9a9aac';
          ctx.fillText(fitText(ctx, tx('plfYours') + ' ' + (you || '—'), cw - 16), x + cw / 2, y + ch - 20);
        }
      }
    };
  }

  function cardPlf() {
    const root = $('plf-overlay');
    const vision = !!(root && root.dataset.mode === 'vision');
    const st = global.PllFlash.getState();
    const cubes = global.PllFlash.getCubes ? global.PllFlash.getCubes() : [];
    const nb = $('plf-newbest');
    const acc = txt('plf-res-acc');
    return renderCard({
      title: (vision ? '👁 ' + tx('plvTitle') : '⚡ ' + tx('plfTitle')),
      level: txt('plf-res-lv'),
      best: !!(nb && !nb.hidden),
      stats: [
        { label: tx('plfScore'), value: txt('plf-res-score'), sub: acc },
        { label: tx('plfTime'), value: txt('plf-res-time'), sub: 's' },
        { label: tx('plfHudLevel'), value: txt('plf-res-lv') }
      ],
      reviewTitle: txt('plf-rev-title') || tx('plfReview'),
      draw: drawCells(cubes, st.targetPLLs, st.userAnswers, vision ? 3 : 5)
    });
  }

  // PLL検定：画面と同じ「PLL別の成績」の表
  function cardPllt() {
    const rows = Array.prototype.map.call(document.querySelectorAll('#pllt-res-rows .pllt-res-row'), function (row) {
      const cells = row.querySelectorAll('.pllt-res-cell');
      const nameCell = cells[0];
      return {
        name: nameCell && nameCell.firstChild ? nameCell.firstChild.textContent.trim() : '',
        weak: row.classList.contains('weak'),
        n: cells[1] ? cells[1].textContent : '', acc: cells[2] ? cells[2].textContent : '', t: cells[3] ? cells[3].textContent : ''
      };
    });
    return renderCard({
      title: '🧊 ' + tx('plltTitle'),
      level: '',
      best: false,
      stats: [
        { label: tx('plltAvgTime'), value: txt('pllt-res-avg'), sub: 's' },
        { label: tx('plltTotalTime'), value: txt('pllt-res-total'), sub: 's' },
        { label: tx('plltFinalScore'), value: txt('pllt-res-score'), sub: txt('pllt-res-acc') }
      ],
      reviewTitle: tx('plltDetail'),
      draw: function (ctx, b) {
        const colX = [b.L + 24, b.L + b.CW * 0.56, b.L + b.CW * 0.77, b.R - 24];
        let y = b.top + 30;
        ctx.font = '800 26px ' + b.F; ctx.fillStyle = '#8b8b9c';
        [tx('plltColCase'), tx('plltColAttempts'), tx('plltColAcc'), tx('plltColTime')].forEach(function (h, i) {
          ctx.textAlign = i === 0 ? 'left' : (i === 3 ? 'right' : 'center');
          ctx.fillText(h, colX[i], y);
        });
        y += 18;
        // 行が少なければ1行を高くして、表を枠いっぱいに見やすく広げる
        const rowH = Math.max(46, Math.min(64, Math.floor((b.bottom - y) / Math.max(1, rows.length))));
        const maxRows = Math.floor((b.bottom - y) / rowH);
        const show = rows.length > maxRows ? rows.slice(0, maxRows - 1) : rows;
        show.forEach(function (r) {
          if (r.weak) { ctx.fillStyle = 'rgba(255,90,110,.10)'; ctx.fillRect(b.L, y, b.CW, rowH); }
          ctx.strokeStyle = '#24242e'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(b.L, y + rowH); ctx.lineTo(b.R, y + rowH); ctx.stroke();
          const ty = y + rowH / 2 + 11;
          ctx.font = '900 30px ' + b.F; ctx.fillStyle = '#eeeef4'; ctx.textAlign = 'left';
          ctx.fillText(r.name, colX[0], ty);
          if (r.weak) {
            const nw = ctx.measureText(r.name).width;
            ctx.font = '800 20px ' + b.F;
            const tag = tx('plltPractice'), tw = ctx.measureText(tag).width + 18;
            rr(ctx, colX[0] + nw + 14, y + 12, tw, 28, 7);
            ctx.fillStyle = 'rgba(255,90,110,.18)'; ctx.fill();
            ctx.strokeStyle = 'rgba(255,120,135,.6)'; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.fillStyle = '#ff9aa6'; ctx.fillText(tag, colX[0] + nw + 23, y + 33);
          }
          ctx.font = '700 28px ' + b.F; ctx.fillStyle = '#d4d4de';
          ctx.textAlign = 'center'; ctx.fillText(r.n, colX[1], ty); ctx.fillText(r.acc, colX[2], ty);
          ctx.textAlign = 'right'; ctx.fillText(r.t, colX[3], ty);
          y += rowH;
        });
        if (show.length < rows.length) {
          ctx.font = '700 24px ' + b.F; ctx.fillStyle = '#6e6e80'; ctx.textAlign = 'center';
          ctx.fillText('+' + (rows.length - show.length) + ' PLL', (b.L + b.R) / 2, y + 34);
        }
      }
    });
  }

  /* ------------------------------------------------------------ 送る -- */
  function dataUrlToFile(url, name) {
    const bin = atob(url.split(',')[1]);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new File([arr], name, { type: 'image/png' });
  }
  function openX(text) {
    const url = 'https://x.com/intent/post?text=' + encodeURIComponent(text) +
      '&url=' + encodeURIComponent(SITE_URL);
    // ホーム画面に置いたアプリから開いても、アプリ自体は離れないように新しいタブで開く
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    document.body.appendChild(a); a.click(); a.remove();
  }
  function toast(msg) {
    let el = $('pls-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pls-toast';
      el.style.cssText = 'position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);' +
        'z-index:10400;max-width:88vw;padding:12px 16px;border-radius:12px;background:#1c1c24;border:1px solid #3a3a48;' +
        'color:#e6e6ee;font-size:13px;font-weight:700;line-height:1.5;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,.5);' +
        'transition:opacity .25s;opacity:0;pointer-events:none';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.style.opacity = '0'; }, 4200);
  }
  /* Web ページから「画像付きの X の投稿画面」を直接開く方法は無い
     （X の投稿用リンクは文字しか渡せず、共有シートは X 以外の候補も並ぶ）。
     そこで、押した瞬間に結果画像をクリップボードへコピーしておき、
     確認の小窓（画像のプレビュー付き）から X を開く。X の投稿欄で
     長押し →「ペースト」で、その画像がそのまま添付される。
     コピーできない環境向けに、小窓には「画像を保存」も置く。 */
  let dlg = null, cur = null;   // cur = { file, url, caption }
  const DLG_CSS = [
    '#pls-dlg{position:fixed;inset:0;z-index:10350;display:none;align-items:center;justify-content:center;',
    '  padding:calc(16px + env(safe-area-inset-top,0px)) 16px calc(16px + env(safe-area-inset-bottom,0px));',
    '  background:rgba(4,4,8,.78);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}',
    '#pls-dlg.show{display:flex}',
    '.pls-box{position:relative;width:100%;max-width:420px;max-height:100%;overflow-y:auto;display:flex;flex-direction:column;',
    '  gap:10px;padding:16px;border-radius:18px;background:#14141a;border:1px solid #2c2c38;color:#e6e6ee;',
    '  box-shadow:0 18px 50px rgba(0,0,0,.6)}',
    '.pls-close{position:absolute;top:8px;right:8px;width:36px;height:36px;border-radius:50%;border:1px solid #3a3a48;',
    '  background:#1c1c24;color:#c8c8d4;font-size:16px;cursor:pointer}',
    '.pls-img{display:block;width:auto;max-width:100%;max-height:min(46vh,420px);margin:34px auto 0;border-radius:12px;',
    '  border:1px solid #2c2c38;-webkit-touch-callout:default}',
    '.pls-status{font-size:13px;font-weight:800;text-align:center;color:#4fe0a8}',
    '.pls-status.ng{color:#ffb86a}',
    '.pls-hint{margin:0;font-size:12px;line-height:1.55;text-align:center;color:#9a9aac}',
    '.pls-go{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:14px;border-radius:12px;',
    '  background:#000;color:#fff;border:1px solid #4a4a58;font-family:inherit;font-size:15px;font-weight:900;cursor:pointer}',
    '.pls-go svg{width:16px;height:16px;fill:currentColor}',
    '.pls-sub{width:100%;padding:11px;border-radius:12px;background:#1c1c24;color:#c8c8d4;border:1px solid #3a3a48;',
    '  font-family:inherit;font-size:13px;font-weight:800;cursor:pointer}'
  ].join('\n');
  function buildDlg() {
    if (dlg) return dlg;
    const st = document.createElement('style');
    st.id = 'pll-share-dlg-style'; st.textContent = DLG_CSS;
    document.head.appendChild(st);
    dlg = document.createElement('div');
    dlg.id = 'pls-dlg';
    dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true');
    dlg.innerHTML =
      '<div class="pls-box">' +
        '<button type="button" class="pls-close" aria-label="✕">✕</button>' +
        '<img class="pls-img" alt="">' +
        '<div class="pls-status"></div>' +
        '<button type="button" class="pls-go">' + X_LOGO + '<span></span></button>' +
        '<p class="pls-hint"></p>' +
        '<button type="button" class="pls-sub"></button>' +
      '</div>';
    document.body.appendChild(dlg);
    const close = function () { dlg.classList.remove('show'); };
    dlg.querySelector('.pls-close').addEventListener('click', close);
    dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });
    dlg.querySelector('.pls-go').addEventListener('click', function () { if (cur) openX(cur.caption); });
    dlg.querySelector('.pls-sub').addEventListener('click', function () { if (cur) saveImage(cur.file); });
    return dlg;
  }
  function paintDlg(copied) {
    dlg.querySelector('.pls-go span').textContent = tx('shareOpenX');
    dlg.querySelector('.pls-sub').textContent = tx('shareSaveImg');
    const stt = dlg.querySelector('.pls-status');
    stt.classList.toggle('ng', !copied);
    stt.textContent = copied ? '✓ ' + tx('shareCopied') : tx('shareCopyFail');
    dlg.querySelector('.pls-hint').textContent = copied ? tx('sharePasteHint') : tx('shareSaveHint');
  }
  // 画像だけを共有シートへ（写真に保存・X アプリへ直接 など）。無理なら保存
  function saveImage(file) {
    if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file] }).catch(function () {});
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = 'vcc-result.png';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    toast(tx('shareSaved'));
  }
  // 押した瞬間（＝操作の直後）にクリップボードへ書く。iPhone の Safari は、
  // 画像の中身を Promise で渡せば「操作の直後」とみなしてくれる。
  function copyImage(blobPromise) {
    try {
      if (!navigator.clipboard || !navigator.clipboard.write || typeof ClipboardItem === 'undefined') {
        return Promise.reject(new Error('no clipboard'));
      }
      return navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]);
    } catch (e) { return Promise.reject(e); }
  }
  function shareResult(kind) {
    let cv;
    try { cv = kind === 'pllt' ? cardPllt() : cardPlf(); } catch (e) { cv = null; }
    const caption = (kind === 'pllt' ? textPllt() : textPlf());
    if (!cv) { openX(caption); return; }
    const url = cv.toDataURL('image/png');
    const file = dataUrlToFile(url, 'vcc-result.png');
    cur = { file: file, url: url, caption: caption };
    const copying = copyImage(Promise.resolve(file));
    buildDlg();
    dlg.querySelector('.pls-img').src = url;
    paintDlg(true);
    dlg.querySelector('.pls-status').textContent = '…';
    dlg.classList.add('show');
    copying.then(function () { paintDlg(true); }, function () { paintDlg(false); });
  }

  /* ---------------------------------------------------------- 取り付け -- */
  // 「戻る／もう一度挑戦」の真上に1段足して、左=Xでシェア（戻るの上）、
  // 右=ためた貫の木札（もう一度挑戦の上）に並べる。木札が無い画面
  // （フラッシュ・ビジョン）では、Xでシェアを左の列（戻るの上）にだけ置く。
  function addTo(section, id, onClick) {
    if (!section || $(id)) return;
    const actions = section.querySelector('.pllt-result-actions');
    if (!actions) return;
    injectCSS();
    const top = document.createElement('div');
    top.className = 'pls-top';
    top.appendChild(makeButton(id, onClick));
    // 木札は、見た目の決まり（.pllt-ticket-row の下で効く CSS）を崩さないよう
    // 外側の .pllt-ticket-row ごと移す
    const tk = section.querySelector('.pllt-ticket-row');
    if (tk) top.appendChild(tk);
    actions.insertAdjacentElement('beforebegin', top);
    paintButtons();
  }
  function attachPllt() {
    addTo(document.querySelector('#pllt-overlay .pllt-result'), 'pls-share-pllt', function () { shareResult('pllt'); });
  }
  function attachPlf() {
    addTo(document.querySelector('#plf-overlay .plf-result'), 'pls-share-plf', function () { shareResult('plf'); });
  }

  function boot() {
    attachPllt();
    attachPlf();
    // フラッシュの画面は初めて開いたときに中身が作られるので、それを待って足す
    const plf = $('plf-overlay');
    if (plf && !$('pls-share-plf') && global.MutationObserver) {
      const mo = new MutationObserver(function () {
        attachPlf();
        if ($('pls-share-plf')) mo.disconnect();
      });
      mo.observe(plf, { childList: true });
    }
    if (typeof global.onI18n === 'function') global.onI18n(paintButtons);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  global.PllShare = {
    textPllt: textPllt, textPlf: textPlf, share: shareResult,
    // 確認用：シェア画像を data URL で返す（'pllt' | 'plf'）
    image: function (kind) { return (kind === 'pllt' ? cardPllt() : cardPlf()).toDataURL('image/png'); }
  };
})(window);
