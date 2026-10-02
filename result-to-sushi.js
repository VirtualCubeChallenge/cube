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
   ④ 押してから店が開くまでのあいだに、約2秒の入店演出を挟む。
      暖簾を分け、格子戸が開くと、その奥にもう寿司屋が開いている。
      「動きを減らす」設定の端末では演出を飛ばして、すぐ店を開ける。

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

  /* ============================================================
     入店演出（暖簾をくぐって、格子戸がすっと開く）
     ------------------------------------------------------------
     夜の店先。黒檀の枠に細い縦格子、奥の灯りが和紙ににじむ引き戸。
     暖簾は店（.gc-noren）と同じ臙脂に生成りの明朝で「回・転・鮨」。
     派手な効果音の文字や紙吹雪は使わず、灯りと金粉だけで格を出す。

     戸の奥は本物の寿司屋の画面（#gacha-overlay）。戸が閉じている
     うちに Gacha.open() を呼んでおき、戸が開くとそのまま店が現れる。
     いらっしゃいの声と拍子木は、店側の演出がそのまま鳴る。

     動かすのは transform と opacity だけ。
     ============================================================ */
  const GATE_ID = 'rts-gate';
  const MINCHO = "'Yu Mincho','YuMincho','Hiragino Mincho ProN','Songti SC','Nanum Myeongjo',serif";

  const GATE_CSS = [
    '#' + GATE_ID + '{position:fixed;inset:0;z-index:10200;display:none;opacity:0;overflow:hidden;',
    '  pointer-events:none;font-family:' + MINCHO + '}',
    /* 演出中は下の画面に触れさせない（二度押し・誤タップよけ） */
    '#' + GATE_ID + '.on{display:block;pointer-events:auto}',
    '#' + GATE_ID + '.in{opacity:1;transition:opacity .22s ease-out}',
    '#' + GATE_ID + '.out{opacity:0;transition:opacity .3s ease-in}',

    /* ---- 引き戸：黒檀の枠＋金の細線、縦格子越しに灯りのにじむ和紙、下は腰板 ---- */
    '.rts-door{position:absolute;top:0;bottom:0;width:50.5%;z-index:2;background:#1c130d;will-change:transform;',
    '  box-shadow:inset 0 0 0 1px rgba(201,164,92,.55),inset 0 0 0 7px #1c130d,inset 0 0 0 8px rgba(201,164,92,.22)}',
    '.rts-door.l{left:0}.rts-door.r{right:0}',
    '.rts-shoji{position:absolute;left:14px;right:14px;top:16px;bottom:26%;',
    '  background:',
    '    repeating-linear-gradient(90deg,#24180f 0 3px,transparent 3px 15px),',
    '    repeating-linear-gradient(180deg,transparent 0 calc(33.33% - 3px),#24180f calc(33.33% - 3px) 33.33%),',
    '    radial-gradient(ellipse 120% 70% at var(--gx) 46%,#fff4d8 0,#f2dca8 40%,#c99a55 100%);',
    '  box-shadow:inset 0 0 0 2px #24180f,inset 0 0 30px rgba(60,30,10,.35)}',
    '.rts-door.l .rts-shoji{--gx:100%}.rts-door.r .rts-shoji{--gx:0%}',
    '.rts-koshi{position:absolute;left:14px;right:14px;bottom:14px;height:calc(26% - 26px);',
    '  background:repeating-linear-gradient(90deg,rgba(255,235,200,.035) 0 1px,transparent 1px 9px),',
    '    linear-gradient(#3a271a,#21160e);border-top:1px solid rgba(201,164,92,.5)}',
    /* 真鍮の引手 */
    '.rts-pull{position:absolute;top:58%;width:8px;height:48px;border-radius:4px;',
    '  background:linear-gradient(90deg,#7d5f27,#ead08a 50%,#7d5f27);box-shadow:0 0 0 1px rgba(0,0,0,.45)}',
    '.rts-door.l .rts-pull{right:24px}.rts-door.r .rts-pull{left:24px}',

    /* ---- 戸のすき間からあふれる店の灯り ---- */
    '.rts-light{position:absolute;top:0;bottom:0;left:50%;width:60vw;margin-left:-30vw;z-index:1;opacity:0;',
    '  background:radial-gradient(ellipse 50% 60% at 50% 50%,rgba(255,240,205,.95) 0,rgba(255,214,140,.45) 45%,rgba(255,214,140,0) 75%);',
    '  transform:scaleX(.04)}',

    /* ---- 暖簾：店と同じ臙脂×生成り。裾に金の細線 ---- */
    '.rts-noren{position:absolute;left:50%;top:0;z-index:3;width:min(80vw,420px);display:flex;gap:3px;',
    '  padding-top:12px;transform:translateX(-50%);will-change:transform}',
    '.rts-noren::before{content:"";position:absolute;left:-6%;right:-6%;top:5px;height:9px;border-radius:5px;',
    '  background:linear-gradient(#6a4520,#2e1d0c);box-shadow:0 2px 5px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,220,150,.3)}',
    '.rts-cloth{position:relative;flex:1;height:min(44vh,360px);transform-origin:50% 0;display:flex;justify-content:center;',
    '  padding-top:16%;border-radius:0 0 3px 3px;will-change:transform;',
    '  background:linear-gradient(90deg,rgba(0,0,0,.2),transparent 20% 80%,rgba(0,0,0,.2)),linear-gradient(#8c2f28,#5e1b17);',
    '  box-shadow:inset 0 -3px 0 rgba(201,164,92,.6),0 8px 16px rgba(0,0,0,.45)}',
    '.rts-cloth span{color:#fdf3dd;font-size:clamp(28px,8.5vw,46px);font-weight:700;writing-mode:vertical-rl;',
    '  letter-spacing:.1em;text-shadow:0 1px 0 rgba(0,0,0,.3)}',

    /* ---- 金粉（灯りに舞うほこり程度に。数も大きさも控えめ） ---- */
    '.rts-dust{position:absolute;z-index:4;left:var(--x);top:var(--y);width:var(--s);height:var(--s);border-radius:50%;opacity:0;',
    '  background:radial-gradient(circle,#fff7dc 0,#e8c879 45%,rgba(232,200,121,0) 72%)}',

    /* ---- タイムライン ---- */
    /* ① 手で分けるように、暖簾の左右が外へ、中央がふわりと持ち上がる */
    '#' + GATE_ID + '.part .rts-cloth:nth-child(1){animation:rtsPartL .7s cubic-bezier(.3,.6,.2,1) both}',
    '#' + GATE_ID + '.part .rts-cloth:nth-child(2){animation:rtsPartC .7s cubic-bezier(.3,.6,.2,1) both}',
    '#' + GATE_ID + '.part .rts-cloth:nth-child(3){animation:rtsPartR .7s cubic-bezier(.3,.6,.2,1) both}',
    '@keyframes rtsPartL{to{transform:translateX(-16%) rotate(9deg)}}',
    '@keyframes rtsPartC{to{transform:translateY(-5%) scaleY(.95)}}',
    '@keyframes rtsPartR{to{transform:translateX(16%) rotate(-9deg)}}',
    /* ② 暖簾は上へ抜け、戸は「ガラッ」と一度かかってから、すっと滑る */
    '#' + GATE_ID + '.open .rts-noren{transform:translateX(-50%) translateY(-108%);',
    '  transition:transform .65s cubic-bezier(.6,0,.3,1)}',
    '#' + GATE_ID + '.open .rts-door.l{animation:rtsDoorL 1.05s both}',
    '#' + GATE_ID + '.open .rts-door.r{animation:rtsDoorR 1.05s both}',
    '@keyframes rtsDoorL{0%{transform:translateX(0);animation-timing-function:cubic-bezier(.2,.8,.3,1)}',
    '  14%{transform:translateX(-2.5%)}24%{transform:translateX(-2.5%);animation-timing-function:cubic-bezier(.55,0,.2,1)}',
    '  100%{transform:translateX(-102%)}}',
    '@keyframes rtsDoorR{0%{transform:translateX(0);animation-timing-function:cubic-bezier(.2,.8,.3,1)}',
    '  14%{transform:translateX(2.5%)}24%{transform:translateX(2.5%);animation-timing-function:cubic-bezier(.55,0,.2,1)}',
    '  100%{transform:translateX(102%)}}',
    '#' + GATE_ID + '.open .rts-light{animation:rtsLight 1.25s .04s ease-out both}',
    '@keyframes rtsLight{0%{opacity:0;transform:scaleX(.04)}35%{opacity:1;transform:scaleX(.7)}100%{opacity:0;transform:scaleX(3)}}',
    '#' + GATE_ID + '.open .rts-dust{animation:rtsDust 1.6s var(--d) ease-out both}',
    '@keyframes rtsDust{0%{opacity:0;transform:translate(0,0) scale(.6)}30%{opacity:1;transform:translate(0,-14px) scale(1)}',
    '  100%{opacity:0;transform:translate(var(--dx),-70px) scale(.5)}}'
  ].join('');

  function injectCSS() {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = CSS + GATE_CSS;
    document.head.appendChild(st);
  }

  /* 戸・暖簾・灯り・金粉をひと組だけ作り、以後は使い回す。 */
  let gateEl = null;
  function buildGate() {
    if (gateEl) return gateEl;
    const g = document.createElement('div');
    g.id = GATE_ID;
    g.setAttribute('aria-hidden', 'true');
    let dust = '';
    for (let i = 0; i < 12; i++) {
      dust += '<i class="rts-dust" style="--x:' + (36 + Math.random() * 28).toFixed(1) + '%;--y:' +
        (22 + Math.random() * 56).toFixed(1) + '%;--s:' + (3 + Math.random() * 4).toFixed(1) + 'px;--dx:' +
        ((Math.random() - 0.5) * 50).toFixed(0) + 'px;--d:' + (0.1 + Math.random() * 0.5).toFixed(2) + 's"></i>';
    }
    g.innerHTML =
      '<div class="rts-light"></div>' +
      '<div class="rts-door l"><div class="rts-shoji"></div><div class="rts-koshi"></div><span class="rts-pull"></span></div>' +
      '<div class="rts-door r"><div class="rts-shoji"></div><div class="rts-koshi"></div><span class="rts-pull"></span></div>' +
      '<div class="rts-noren"><div class="rts-cloth"><span>回</span></div>' +
      '<div class="rts-cloth"><span>転</span></div><div class="rts-cloth"><span>鮨</span></div></div>' +
      dust;
    document.body.appendChild(g);
    gateEl = g;
    return g;
  }

  /* 「動きを減らす」設定なら演出を飛ばして、すぐ店を開ける。 */
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

  let entering = false;
  function enterShop(G) {
    if (entering) return;
    if (reduceMotion) { G.open(); return; }
    entering = true;
    const g = buildGate();
    g.className = 'on';
    void g.offsetWidth;                      // display を切り替えた直後にフェードを効かせる
    g.classList.add('in');
    try { if (typeof triggerHaptics === 'function') triggerHaptics(10); } catch (err) { /* 非対応 */ }

    setTimeout(function () { g.classList.add('part'); }, 260);       // 暖簾を分ける
    setTimeout(function () {                                         // 戸の奥で店を開けておく
      try { G.open(); } catch (err) { /* 開けなくても戸は開けて戻す */ }
    }, 760);
    setTimeout(function () { g.classList.add('open'); }, 800);       // 戸が開く
    setTimeout(function () { g.classList.add('out'); }, 1780);       // 余韻を残して消える
    setTimeout(function () { g.className = ''; entering = false; }, 2120);
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
    enterShop(G);
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
