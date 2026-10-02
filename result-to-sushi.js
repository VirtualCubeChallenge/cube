/* ============================================================
   result-to-sushi.js — PLL検定のリザルトにある「ためた貫」を押すと、
   そのまま寿司屋（回転シャード寿司）へ飛べるようにする。

   cube-feel.js / ui-polish.js / scheme-peek.js と同じ方針で、
   機能ごとに1ファイル。index.html への追記は <script> の読み込み
   1行だけ（style.css と i18n.js は無改変。CSSは下で自前で注入する）。
   読み込みをやめれば、「ためた貫」は今までどおり押せない表示に戻る。

   ------------------------------------------------------------
   やること
   ------------------------------------------------------------
   ① リザルトの木札（#pllt-res-tk）をボタンとして押せるようにする。
      押すと Gacha.open() を呼ぶだけ。寿司屋のほうが #gacha-overlay
      （z-index 10150）で PLL検定（#pllt-overlay, 42）の上に重なるので、
      閉じればそのままリザルト画面に戻ってくる。
   ② 押せると分かる見た目にする。木札のままだと「ただの表示」に
      見えるので、右に › を足し、押している間は少し沈める。
      見た目は木札のまま、当たり判定だけ周りに広げる。
   ③ 寿司屋で貫を使って枚数が変わったら、金色（上限）の灯りを合わせる。

   ------------------------------------------------------------
   作りの方針
   ------------------------------------------------------------
   - クリックは document の capture で拾う（イベント委譲）。読み込み
     順にも、リザルトの描き直しにも左右されない。
   - Gacha / GachaTicket は押された時に読む。無ければ何もしない。
   - 寿司屋の解放条件（2側面判断を1回以上）を満たしていないときは
     何もしない。リザルト画面は1回遊び終えた直後にしか出ないので、
     実際には必ず解放済みになっている。
   - 動かすのは transform と filter だけ。「動きを減らす」設定の
     端末では押下の沈みも止める。
   ============================================================ */
(function (global) {
  'use strict';

  const BADGE_ID = 'pllt-res-tk';
  const STYLE_ID = 'result-to-sushi-style';

  const CSS = [
    '#' + BADGE_ID + '{position:relative;cursor:pointer;',
    '  -webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;',
    '  transition:transform .1s ease-out,filter .1s ease-out}',
    /* 見た目は木札のまま、指の当たり判定だけ上下左右へ広げる
       （scheme-peek.js の ? と同じ考え方）。 */
    '#' + BADGE_ID + '::before{content:"";position:absolute;inset:-8px -6px}',
    /* 押せることを示す › 。木札の文字色に合わせて控えめに。 */
    '#' + BADGE_ID + '::after{content:"\\203A";font-size:17px;font-weight:900;',
    '  line-height:1;color:#ffd9a0;opacity:.85;margin-left:-2px}',
    '#' + BADGE_ID + ':active{transform:translateY(2px);filter:brightness(1.12);',
    '  box-shadow:none}',
    '#' + BADGE_ID + ':focus-visible{outline:2px solid #ffd9a0;outline-offset:3px}',
    '@media (prefers-reduced-motion: reduce){',
    '  #' + BADGE_ID + '{transition:none}',
    '  #' + BADGE_ID + ':active{transform:none}',
    '}'
  ].join('');

  function injectCSS() {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function tr(key) {
    try {
      if (typeof t === 'function') {
        const s = t(key);
        if (s) return s;
      }
    } catch (err) { /* 辞書がまだなら空のまま */ }
    return '';
  }

  /* 寿司屋を開く。開けない状態のときは黙って何もしない。 */
  function goSushi() {
    const G = global.Gacha;
    if (!G || typeof G.open !== 'function') return;
    if (typeof G.isUnlocked === 'function' && !G.isUnlocked()) return;
    G.open();
  }

  /* 押せるボタンとして読み上げられるようにする。 */
  function decorate() {
    const b = document.getElementById(BADGE_ID);
    if (!b) return;
    b.setAttribute('role', 'button');
    b.setAttribute('tabindex', '0');
    const label = tr('sushiTitle');
    if (label) b.setAttribute('aria-label', label);
  }

  function start() {
    injectCSS();
    decorate();

    // 押された時。リザルトが描き直されても、木札そのものは作り直されない
    // が、念のため委譲にしてある。
    document.addEventListener('click', function (e) {
      const hit = e.target && e.target.closest ? e.target.closest('#' + BADGE_ID) : null;
      if (!hit) return;
      e.preventDefault();
      goSushi();
    }, true);

    // キーボード（Enter / Space）。木札にフォーカスがあるときだけ拾う。
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const hit = e.target && e.target.closest ? e.target.closest('#' + BADGE_ID) : null;
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      goSushi();
    }, true);

    // 寿司屋で貫を使って枚数が変わったら、金色（上限）の灯りを合わせる。
    // 戻ってきたときに「まだ上限の色のまま」になるのを防ぐ。
    try {
      if (global.GachaTicket && typeof GachaTicket.onChange === 'function') {
        GachaTicket.onChange(function () {
          const b = document.getElementById(BADGE_ID);
          if (b) b.classList.toggle("is-full", global.GachaTicket.isFull());
        });
      }
    } catch (err) { /* 取れなければ灯りはそのまま */ }

    // 言語が変わったら読み上げ用のラベルも更新する。
    if (typeof onI18n === 'function') onI18n(decorate);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(window);
