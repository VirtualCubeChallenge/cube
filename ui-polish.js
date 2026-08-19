/* ============================================================
   ui-polish.js — 触り心地のマイクロインタラクション
     ① ボタンの押下感（:active で少し縮む＋波紋リップル）
     ② オーバーレイの出入りを 0.2〜0.26 秒かけて滑らかに

   cube-feel.js と同じ方針で、既存の HTML / style.css / 状態管理には
   手を入れず、このファイル1枚（CSSの注入込み）で完結させている。
   読み込みをやめれば、見た目も挙動も元どおりに戻る。

   【動かす値は transform と opacity だけ】
   width/height/top/left は一切アニメーションさせていない。リップルの
   left/top は「生成時に1回置くだけ」で、動くのは transform(scale) と
   opacity のみ。レイアウトの再計算が起きないので、スマホでもカクつかない。
   ============================================================ */
(function (global) {
  'use strict';

  /* --- 「動きを減らす」設定の端末では、演出をまるごと止める ------------- */
  let reduceMotion = false;
  try {
    const mq = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq) {
      reduceMotion = mq.matches;
      const onMQ = (e) => { reduceMotion = e.matches; };
      if (mq.addEventListener) mq.addEventListener('change', onMQ);
      else if (mq.addListener) mq.addListener(onMQ);
    }
  } catch (err) { /* 判定できなければ通常どおり */ }

  /* ============================================================
     どのボタンに効かせるか
     すでに transform を自前で使っている要素（.lang-cell / .shop-card /
     .shop-tab / .toggle-knob など）は、取り合いになるので入れていない。
     それらは元から押下アニメを持っているので、二重にする必要もない。
     ============================================================ */

  // 押すと少し縮むもの
  const PRESS_SEL = [
    '.action-btn',
    '.settings-footer-link',
    '.alg-panel-close-x',
    '.toggle-switch',
    '.slot-btn',
    '.oll-case',
    '#menu-toggle',
    '#settings-btn',
    '#records-btn',
    '#help-btn',
    '.ui-pressable'          // 後から足したい要素にはこのクラスを付ける
  ].join(',');

  // 波紋（リップル）を出すもの。面のカード(.face-card)は独自の
  // スライド演出とぶつかるので外してある。
  const RIPPLE_SEL = [
    '.action-btn',
    '.slot-btn',
    '.oll-case',
    '.lang-cell',
    '.settings-footer-link',
    '.alg-panel-close-x',
    '#menu-toggle',
    '#settings-btn',
    '#records-btn',
    '#help-btn',
    '.ui-pressable'
  ].join(',');

  // ふわっと出入りさせるオーバーレイ。
  // 横画面の案内(#orientation-overlay)、ガチャ演出(#gacha-overlay)、
  // PLLタイムアタック(#pllt-overlay)は、それぞれ即時性や独自演出が
  // あるのでわざと入れていない。
  const OVERLAYS = [
    '#settings-overlay', '#records-overlay', '#stats-overlay',
    '#layout-overlay', '#transfer-overlay', '#oll-overlay',
    '#zbll-overlay', '#pll-overlay', '#lang-overlay',
    '#welcome-overlay', '#confirm-overlay', '#shop-overlay'
  ];
  // 中で持ち上がるパネル（オーバーレイ → その中身）
  const PANELS = [
    '#settings-overlay.show #settings-panel',
    '#records-overlay.show #records-panel',
    '#stats-overlay.show #stats-panel',
    '#lang-overlay.show #lang-panel',
    '#welcome-overlay.show #welcome-panel',
    '#confirm-overlay.show #confirm-panel',
    '#shop-overlay.show #shop-panel',
    '#layout-overlay.show .alg-panel',
    '#transfer-overlay.show .alg-panel',
    '#oll-overlay.show .alg-panel',
    '#zbll-overlay.show .alg-panel',
    '#pll-overlay.show .alg-panel'
  ].join(',');

  const overlaysBase = OVERLAYS.join(',');
  const overlaysShown = OVERLAYS.map((s) => s + '.show').join(',');

  /* ============================================================
     CSS
     ============================================================ */
  const CSS = [
    /* ---------- ① 押下感 ---------- */
    PRESS_SEL + '{transition:transform .1s ease-out,filter .1s ease-out}',
    PRESS_SEL.split(',').map((s) => s.trim() + ':active').join(',') +
      '{transform:scale(.95)}',
    /* 大きい要素は控えめに、小さい丸ボタンは深めに沈める */
    '.action-btn:active,.oll-case:active,.slot-btn:active{transform:scale(.97)}',
    '#menu-toggle:active,.alg-panel-close-x:active{transform:scale(.9)}',
    /* 自前の :active 配色を持たないものだけ、ほんのり明るくして
       「触れている」ことを伝える（配色そのものは変えない）。 */
    '#menu-toggle:active,#settings-btn:active,#records-btn:active,',
    '#help-btn:active,.slot-btn:active,.toggle-switch:active{filter:brightness(1.14)}',
    /* 面のカードは掴んでスライドさせるので、縮みは最小限に */
    '.face-card:active{transform:scale(.985);filter:brightness(1.06)}',
    '.face-card{transition:transform .1s ease-out,filter .1s ease-out}',

    /* ---------- 波紋（リップル） ----------
       host に overflow:hidden を足すと、はみ出して置いてある装飾（‹ › の
       ヒントなど）まで切れてしまう。そこで「切り抜き役の層」を1枚だけ中に
       入れ、波紋はその中で広がるようにしている。host 側の見た目は無変更。 */
    '.ui-rel{position:relative}',
    '.ui-ripple-layer{position:absolute;inset:0;overflow:hidden;border-radius:inherit;',
    '  pointer-events:none;z-index:0}',
    '.ui-ripple{position:absolute;border-radius:50%;pointer-events:none;',
    '  background:radial-gradient(circle,rgba(255,255,255,.30),rgba(255,255,255,.10) 62%,rgba(255,255,255,0) 72%);',
    '  transform:scale(0);opacity:.6;will-change:transform,opacity;',
    '  animation:uiRipple .5s cubic-bezier(.22,.8,.3,1) forwards}',
    '@keyframes uiRipple{to{transform:scale(1);opacity:0}}',

    /* ---------- ② オーバーレイの出入り ----------
       display は transition できない性質の値だが、allow-discrete を添える
       と「消すのを終わってから」にできる。対応していないブラウザでは
       この一行が無視されるだけで、閉じ方が今までどおり即時に戻る。 */
    overlaysBase + '{opacity:0;transition:opacity .2s ease,display .2s ease;',
    '  transition-behavior:allow-discrete}',
    overlaysShown + '{opacity:1}',
    /* #settings-overlay だけは今まで style.display を直に書き換えていたので、
       他と同じ .show 方式に揃える（index.html 側も合わせて修正済み）。 */
    '#settings-overlay.show{display:flex}',

    /* 中身のパネルは、下から10pxだけ持ち上がりながら現れる。
       display:none から現れる要素にも確実に効くよう、transition ではなく
       animation を使っている（transition だと初回に化けることがある）。 */
    PANELS + '{animation:uiPanelRise .26s cubic-bezier(.2,.9,.3,1) both}',
    '@keyframes uiPanelRise{from{opacity:0;transform:translateY(10px) scale(.99)}',
    '  to{opacity:1;transform:none}}',

    /* ---------- 動きを減らす設定のとき ---------- */
    '@media (prefers-reduced-motion: reduce){',
    '  ' + PANELS + '{animation:none}',
    '  ' + overlaysBase + '{transition-duration:.01ms}',
    '  .ui-ripple{display:none}',
    '}'
  ].join('');

  function injectCSS() {
    if (document.getElementById('ui-polish-style')) return;
    const st = document.createElement('style');
    st.id = 'ui-polish-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ============================================================
     波紋を1粒たてる
     ============================================================ */
  function spawnRipple(host, x, y) {
    if (reduceMotion) return;

    // 切り抜き役の層は1つだけ作って使い回す。i18n の描き直しなどで
    // 消えることがあるので、そのつど存在を確かめる。
    let layer = null;
    for (let i = host.children.length - 1; i >= 0; i--) {
      if (host.children[i].classList.contains('ui-ripple-layer')) { layer = host.children[i]; break; }
    }
    if (!layer) {
      // 位置の基準がない要素にだけ position:relative を足す
      // （もともと absolute/fixed/relative のものは触らない）。
      try {
        if (getComputedStyle(host).position === 'static') host.classList.add('ui-rel');
      } catch (err) { host.classList.add('ui-rel'); }
      layer = document.createElement('span');
      layer.className = 'ui-ripple-layer';
      layer.setAttribute('aria-hidden', 'true');
      host.appendChild(layer);
    }

    const r = host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    // 押した点から、いちばん遠い角まで届く大きさ
    const far = Math.max(
      Math.hypot(x - r.left, y - r.top),
      Math.hypot(r.right - x, y - r.top),
      Math.hypot(x - r.left, r.bottom - y),
      Math.hypot(r.right - x, r.bottom - y)
    );
    const size = Math.max(far * 2, 24);

    const dot = document.createElement('span');
    dot.className = 'ui-ripple';
    // ここで置く位置は「生成時の1回だけ」。以後は transform と opacity
    // しか動かないので、レイアウト計算は発生しない。
    dot.style.width = size + 'px';
    dot.style.height = size + 'px';
    dot.style.left = (x - r.left - size / 2) + 'px';
    dot.style.top = (y - r.top - size / 2) + 'px';
    layer.appendChild(dot);

    const kill = () => { if (dot.parentNode) dot.parentNode.removeChild(dot); };
    dot.addEventListener('animationend', kill);
    setTimeout(kill, 700);   // animationend を取りこぼしたときの保険
  }

  function onDown(e) {
    // 主ボタン以外（右クリック等）は無視
    if (e.button != null && e.button > 0) return;
    const target = e.target;
    if (!target || !target.closest) return;
    const host = target.closest(RIPPLE_SEL);
    if (!host || host.disabled) return;
    // 無効化されている見た目のものには出さない
    if (host.getAttribute('aria-disabled') === 'true') return;
    spawnRipple(host, e.clientX, e.clientY);
  }

  function start() {
    injectCSS();
    // capture 段階で拾うので、途中で stopPropagation する既存の
    // ハンドラがあっても波紋だけは確実に出る。passive なので
    // スクロールやドラッグの邪魔もしない。
    document.addEventListener('pointerdown', onDown, { capture: true, passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(window);
