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
    ja:      { shareX: 'Xでシェア', shareScore: '正解', shareAvg: '平均判別', shareTime: '回答タイム', shareBest: '自己ベスト更新！' },
    en:      { shareX: 'Share on X', shareScore: 'Correct', shareAvg: 'Avg recognition', shareTime: 'Answer time', shareBest: 'New personal best!' },
    'zh-CN': { shareX: '分享到 X', shareScore: '正确', shareAvg: '平均判断', shareTime: '作答用时', shareBest: '刷新个人最佳！' },
    'zh-TW': { shareX: '分享到 X', shareScore: '正確', shareAvg: '平均判斷', shareTime: '作答用時', shareBest: '刷新個人最佳！' },
    ko:      { shareX: 'X에 공유', shareScore: '정답', shareAvg: '평균 판별', shareTime: '답변 시간', shareBest: '개인 최고 기록 갱신!' },
    es:      { shareX: 'Compartir en X', shareScore: 'Aciertos', shareAvg: 'Reconocimiento medio', shareTime: 'Tiempo de respuesta', shareBest: '¡Nuevo récord personal!' },
    id:      { shareX: 'Bagikan ke X', shareScore: 'Benar', shareAvg: 'Rata-rata pengenalan', shareTime: 'Waktu menjawab', shareBest: 'Rekor pribadi baru!' },
    ru:      { shareX: 'Поделиться в X', shareScore: 'Верно', shareAvg: 'Среднее распознавание', shareTime: 'Время ответа', shareBest: 'Новый личный рекорд!' },
    'pt-BR': { shareX: 'Compartilhar no X', shareScore: 'Acertos', shareAvg: 'Reconhecimento médio', shareTime: 'Tempo de resposta', shareBest: 'Novo recorde pessoal!' }
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
    '.pls-share{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:8px;',
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
        lines.push('', grid(oks, vision ? 3 : 5));
      }
    } catch (e) {}
    lines.push('', HASHTAG);
    return lines.join('\n');
  }

  /* ------------------------------------------------------------ 送る -- */
  function openX(text) {
    const url = 'https://x.com/intent/post?text=' + encodeURIComponent(text) +
      '&url=' + encodeURIComponent(SITE_URL);
    // ホーム画面に置いたアプリから開いても、アプリ自体は離れないように新しいタブで開く
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /* ---------------------------------------------------------- 取り付け -- */
  function addTo(section, id, onClick) {
    if (!section || $(id)) return;
    const actions = section.querySelector('.pllt-result-actions');
    if (!actions) return;
    injectCSS();
    actions.insertAdjacentElement('afterend', makeButton(id, onClick));
    paintButtons();
  }
  function attachPllt() {
    addTo(document.querySelector('#pllt-overlay .pllt-result'), 'pls-share-pllt', function () { openX(textPllt()); });
  }
  function attachPlf() {
    addTo(document.querySelector('#plf-overlay .plf-result'), 'pls-share-plf', function () { openX(textPlf()); });
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

  global.PllShare = { textPllt: textPllt, textPlf: textPlf };
})(window);
