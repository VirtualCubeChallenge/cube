/* ============================================================
   sushi-arm.js — 寿司屋ガチャの「握って出す」演出（ゴリゴリの腕）
   ------------------------------------------------------------
   以前は大将の真下から寿司が落ちてきたため、「大将の口から吐き出して
   いる」ように見えていた。そこで寿司を運ぶ役を、画面の外から飛び込んで
   くる極太の腕に任せる。大将のイラストそのものは一切変えない。

   流れ（一貫）
     0.00s  腕が右下の画面外から、寿司を握ったまま皿の上へ飛び込む
     0.30s  一瞬ためて振りかぶり
     0.49s  ドスン！ 皿に置く（皿が沈む・米粒が跳ねる・「へい！お待ち！！」）
     0.55s  腕はサッと画面外へ引っ込み、皿の上に寿司が残る
   十貫（2〜10）… 腕が皿の上でポコポコポコと連打し、1つずつ並べる
   爆速連握り（11以上）… 山盛りを一撃でどっさり置く

   結果（水色の数字・大トロの演出・お会計）は、これまでどおり
   index.html の serveCyan / serveRainbow / showSummary が出す。
   大トロのぶんの寿司は、置いた時点では普通の寿司に見せておき、
   大当たりの後光（#gc-rays）が出た瞬間に大トロへ化ける（ネタバレ防止）。

   ------------------------------------------------------------
   作りの方針（cube-feel.js / ui-polish.js と同じ）
   ------------------------------------------------------------
   - 機能ごとに1ファイル。CSSと9言語の文言はこのファイルが自前で持つ。
   - index.html 側は serve() の先頭で SushiArm.serve(...) に渡すだけ。
     このファイルを読み込まなければ、従来の「その場で握って皿を回す」
     演出のまま動く。
   - タイマーは寿司屋の later() を借りる。店を閉じれば一緒に止まる。
   - 動かすのは transform と opacity だけ。
   - 「動きを減らす」設定では腕もカットインも出さず、寿司を並べるだけ。
   ============================================================ */
(function (global) {
  'use strict';

  /* ---- 文言（既存 I18N は無改変。無いキーだけ足す） ---- */
  const SA_I18N = {
    ja: { sushiOmachi: 'へい！お待ち！！' },
    en: { sushiOmachi: 'Here you go!!' },
    'zh-CN': { sushiOmachi: '久等啦！！' },
    'zh-TW': { sushiOmachi: '久等啦！！' },
    ko: { sushiOmachi: '자, 나왔습니다!!' },
    es: { sushiOmachi: '¡Marchando!!' },
    id: { sushiOmachi: 'Silakan!!' },
    ru: { sushiOmachi: 'Готово!!' },
    'pt-BR': { sushiOmachi: 'Saindo!!' }
  };
  if (typeof I18N !== 'undefined' && I18N) {
    Object.keys(SA_I18N).forEach(function (lang) {
      if (!I18N[lang]) I18N[lang] = {};
      Object.keys(SA_I18N[lang]).forEach(function (k) {
        if (I18N[lang][k] === undefined) I18N[lang][k] = SA_I18N[lang][k];
      });
    });
  }
  function tr(key, fallback) {
    try { if (typeof t === 'function') { const s = t(key); if (s && s !== key) return s; } } catch (e) { /* 既定 */ }
    return fallback;
  }

  /* ---- 腕の絵（右から伸びて、左端の拳で寿司をつかんでいる） ----
     viewBox 300×200。拳の下の寿司（シャリの中心 ≒ 67,144）が皿に着く点。 */
  const ARM_SVG =
    '<svg viewBox="0 0 300 200" aria-hidden="true" focusable="false">' +
      '<g stroke="#2b2b2b" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">' +
        /* つかんでいる寿司（1貫）。ネタは拳に隠れて見えない＝結果のネタバレをしない */
        '<g class="sa-held"><rect x="26" y="130" width="82" height="26" rx="13" fill="#fffdf5"/>' +
          '<rect x="30" y="124" width="74" height="12" rx="6" fill="#ffd9c2"/></g>' +
        /* 山盛り（爆速連握り）。桶ごと持ってくる */
        '<g class="sa-held-big"><path d="M8 150h120l-10 30H18Z" fill="#c98a4b"/>' +
          '<path d="M8 150h120" stroke-width="5"/><path d="M30 156v20M52 156v22M74 156v22M96 156v22M116 156v20" stroke="#8a5a20" stroke-width="3"/>' +
          '<rect x="16" y="128" width="40" height="22" rx="10" fill="#fffdf5"/><rect x="50" y="122" width="40" height="26" rx="10" fill="#fffdf5"/>' +
          '<rect x="84" y="128" width="38" height="22" rx="10" fill="#fffdf5"/><rect x="34" y="112" width="40" height="20" rx="10" fill="#fffdf5"/>' +
          '<rect x="68" y="112" width="40" height="20" rx="10" fill="#fffdf5"/></g>' +
        /* 前腕。上側がこんもり盛り上がった筋肉 */
        '<path d="M300 66C250 34 188 46 148 74c-22 14-38 16-50 16v50c22 2 62 10 102 18 40 8 78 2 100-8Z" fill="#e9a774"/>' +
        '<path d="M160 74c30-18 72-22 104-8" stroke="#fff" stroke-opacity=".5" stroke-width="9" fill="none"/>' +
        '<path d="M150 122c34 8 70 12 110 6" stroke="#c97f4f" stroke-width="5" fill="none"/>' +
        '<path d="M118 100c14 8 30 4 44 12m8 0c10 6 22 4 30 10" stroke="#b86d40" stroke-width="3.5" fill="none"/>' +
        /* 白衣の袖（たすき掛けで捲り上げた） */
        '<path d="M260 48l40-8v128l-42-6c14-34 14-76 2-114Z" fill="#fffdf5"/>' +
        '<path d="M272 64c6 26 6 58 0 86" stroke-width="3.5" fill="none" opacity=".6"/>' +
        /* 手首の鉢巻き色のリストバンド */
        '<rect x="98" y="84" width="18" height="58" rx="3" fill="#e0523d"/>' +
        /* 拳と親指 */
        '<path d="M100 84C70 78 42 82 32 98c-8 12-6 30 6 38 16 10 44 8 62 4Z" fill="#e9a774"/>' +
        '<path d="M42 98q8-7 16 0M58 94q8-7 16 0M74 92q8-7 16 0" fill="none" stroke-width="4"/>' +
        '<path d="M50 108l6 24M66 104l5 30M82 102l4 32" fill="none" stroke-width="3" opacity=".55"/>' +
        '<path d="M96 132c-12 16-34 18-46 10" fill="#e9a774" stroke-width="5"/>' +
      '</g>' +
    '</svg>';

  const CSS = [
    /* 舞台（.gc-stage）の中に置く層。皿(4) < 皿の上の寿司(5) < 腕(7) < カットイン(10) */
    '#gc-stage{--sa-pw:clamp(150px,46vw,230px);--sa-aw:clamp(220px,68vw,330px)}',
    /* 腕の演出中は、従来の「上から落ちてくる寿司」は使わない */
    '#gacha-overlay.sa-on .gc-sushi{visibility:hidden}',

    /* ---- 皿の上に並ぶ寿司 ---- */
    '.sa-pile{position:absolute;left:50%;bottom:4%;width:var(--sa-pw);aspect-ratio:1;z-index:5;',
    '  transform:translateX(-50%);pointer-events:none}',
    '.sa-piece{position:absolute;left:var(--x);top:var(--y);width:var(--w);aspect-ratio:1.6;opacity:0;',
    '  transform:translate(-50%,-50%) rotate(var(--r))}',
    '.sa-piece i{position:absolute;z-index:1;left:4%;right:4%;top:4%;height:54%;',
    '  border-radius:46% 46% 22% 22%/70% 70% 30% 30%;border:2.5px solid #2b2b2b;',
    '  background:linear-gradient(160deg,#9fe9ff,#35b6e8);box-shadow:0 0 10px rgba(60,200,255,.85)}',
    '.sa-piece b{position:absolute;left:8%;right:8%;bottom:4%;height:52%;border-radius:40%/50%;',
    '  border:2.5px solid #2b2b2b;background:linear-gradient(#fff,#ece4d2)}',
    '.sa-piece.big i,.sa-piece.big b{border-width:3px}',
    '.sa-piece.toro i{background:repeating-linear-gradient(102deg,rgba(255,255,255,.85) 0 2px,transparent 2px 7px),',
    '  linear-gradient(160deg,#ff8f8f,#e0523d);box-shadow:0 0 16px rgba(255,190,80,.95)}',
    '.sa-piece.in{animation:saLand .34s cubic-bezier(.2,1.6,.4,1) var(--d,0s) both}',
    '@keyframes saLand{0%{opacity:1;transform:translate(-50%,-50%) rotate(var(--r)) scale(1.35,.6)}',
    '  50%{opacity:1;transform:translate(-50%,-50%) rotate(var(--r)) scale(.9,1.12)}',
    '  100%{opacity:1;transform:translate(-50%,-50%) rotate(var(--r)) scale(1)}}',
    '.sa-piece.toro-now{animation:saToro .5s cubic-bezier(.2,1.6,.4,1) both}',
    '@keyframes saToro{0%{opacity:1;transform:translate(-50%,-50%) rotate(var(--r)) scale(1)}',
    '  40%{opacity:1;transform:translate(-50%,-50%) rotate(var(--r)) scale(1.4)}',
    '  100%{opacity:1;transform:translate(-50%,-50%) rotate(var(--r)) scale(1.08)}}',
    '.sa-piece.fade{animation:saFade .2s ease-out both}',
    '@keyframes saFade{from{opacity:0}to{opacity:1}}',

    /* ドスンの衝撃（輪＋集中線）。皿に合わせて縦につぶした楕円 */
    '.sa-boom{position:absolute;left:var(--x);top:var(--y);width:var(--s);aspect-ratio:1;border-radius:50%;opacity:0;',
    '  border:4px solid #fdf3dd;transform:translate(-50%,-50%) scaleY(.62) scale(.2)}',
    '.sa-boom::before{content:"";position:absolute;inset:-40%;border-radius:50%;',
    '  background:repeating-conic-gradient(#fdf3dd 0 3deg,transparent 3deg 24deg);',
    '  -webkit-mask:radial-gradient(circle,transparent 42%,#000 44%,#000 62%,transparent 64%);',
    '  mask:radial-gradient(circle,transparent 42%,#000 44%,#000 62%,transparent 64%)}',
    '.sa-boom.go{animation:saBoom .38s ease-out both}',
    '@keyframes saBoom{0%{opacity:.95;transform:translate(-50%,-50%) scaleY(.62) scale(.2)}',
    '  100%{opacity:0;transform:translate(-50%,-50%) scaleY(.62) scale(1.45)}}',

    /* 皿が沈む。皿の箱（.gc-plate-wrap）は translateX(-50%) が基本形 */
    '.gc-plate-wrap.sa-thud,.sa-pile.sa-thud{animation:saThud .28s ease-out}',
    '@keyframes saThud{0%{transform:translateX(-50%)}25%{transform:translateX(-50%) translateY(7px) scale(1.04,.94)}',
    '  55%{transform:translateX(-50%) translateY(-3px)}100%{transform:translateX(-50%)}}',
    /* 山盛りのときは店ごと揺れる */
    '#gc-stage.sa-quake{animation:saQuake .36s linear}',
    '@keyframes saQuake{0%,100%{transform:translate(0,0)}15%{transform:translate(-5px,4px)}30%{transform:translate(5px,-3px)}',
    '  45%{transform:translate(-4px,2px)}60%{transform:translate(3px,-2px)}80%{transform:translate(-2px,1px)}}',

    /* ---- 腕 ----
       .sa-arm  … 置き場所。拳の下の寿司が、皿の中心にちょうど来る位置
       .sa-move … 十貫のとき、どの寿司の上へ動くか（--tx/--ty）
       .sa-motion … 飛び込み・振りかぶり・ドスン・引っ込みの動き */
    '.sa-arm{position:absolute;z-index:7;width:var(--sa-aw);pointer-events:none;visibility:hidden;',
    '  left:calc(50% - var(--sa-aw) * .223);',
    '  bottom:calc(4% + var(--sa-pw) * .5 - var(--sa-aw) * .187 + 4px)}',
    '.sa-arm.on{visibility:visible}',
    '.sa-move{transform:translate(var(--tx,0px),var(--ty,0px));transition:transform 50ms ease-out}',
    '.sa-motion{position:relative;transform-origin:85% 60%;will-change:transform}',
    '.sa-motion svg{display:block;width:100%;height:auto;overflow:visible}',
    '.sa-ghost{position:absolute;inset:0;opacity:0;transform:translate(22px,16px)}',
    '.sa-arm .sa-held-big{display:none}',
    '.sa-arm.big .sa-held{display:none}.sa-arm.big .sa-held-big{display:inline}',
    '.sa-arm.empty .sa-held,.sa-arm.empty .sa-held-big{display:none}',

    /* 一貫・山盛り：飛び込み → 振りかぶり → ドスン(70%) → 間 → 引っ込み */
    '@keyframes saOne{',
    '  0%{transform:translate(78vw,46vh) rotate(-26deg);animation-timing-function:cubic-bezier(.15,.85,.3,1.08)}',
    '  43%{transform:translate(0,-34px) rotate(3deg);animation-timing-function:ease-out}',
    '  57%{transform:translate(8px,-58px) rotate(-7deg);animation-timing-function:cubic-bezier(.7,0,.95,.5)}',
    '  70%{transform:translate(0,0) rotate(1deg)}',
    '  78%{transform:translate(0,0) rotate(1deg);animation-timing-function:cubic-bezier(.5,0,.9,.6)}',
    '  100%{transform:translate(80vw,38vh) rotate(-22deg)}}',
    '@keyframes saGhostOne{0%{opacity:.3}40%{opacity:.3}45%{opacity:0}80%{opacity:0}86%{opacity:.25}100%{opacity:.25}}',
    /* 十貫：飛び込み → ポコポコ（1回ずつ）→ 引っ込み */
    '@keyframes saEnter{0%{transform:translate(78vw,46vh) rotate(-26deg)}',
    '  85%{transform:translate(-4px,-40px) rotate(2deg)}100%{transform:translate(0,-34px) rotate(0)}}',
    '@keyframes saJab{0%{transform:translate(0,-34px)}45%{transform:translate(0,2px) scale(1.02,.97)}',
    '  60%{transform:translate(0,0)}100%{transform:translate(0,-34px)}}',
    '@keyframes saExit{0%{transform:translate(0,-34px)}100%{transform:translate(80vw,38vh) rotate(-22deg)}}',
    '@keyframes saGhostOn{from{opacity:.3}to{opacity:.3}}',

    /* ---- カットイン「へい！お待ち！！」 ---- */
    '.sa-cutin{position:absolute;left:50%;top:38%;z-index:10;pointer-events:none;opacity:0;white-space:nowrap;',
    '  transform:translate(-50%,-50%) rotate(-6deg);',
    "  font-family:'Yu Mincho','YuMincho','Hiragino Mincho ProN','Kaiti SC','Songti SC','Nanum Myeongjo',serif;",
    '  font-weight:900;font-size:clamp(28px,9.2vw,58px);line-height:1;letter-spacing:.02em;color:#fdf3dd;',
    '  -webkit-text-stroke:.13em #2b2b2b;paint-order:stroke fill;text-shadow:.07em .07em 0 #e0523d}',
    /* 後ろを横切る朱の帯 */
    '.sa-cutin::before{content:"";position:absolute;left:-12%;right:-12%;top:18%;bottom:12%;z-index:-1;',
    '  background:linear-gradient(90deg,transparent,#e0523d 12% 88%,transparent);transform:scaleX(0);transform-origin:0 50%}',
    '.sa-cutin.big{font-size:clamp(32px,10.6vw,68px)}',
    '.sa-cutin.go{animation:saCut .5s both}.sa-cutin.go::before{animation:saBand .5s both}',
    '.sa-cutin.big.go,.sa-cutin.big.go::before{animation-duration:.68s}',
    '@keyframes saCut{',
    '  0%{opacity:0;transform:translate(-50%,-50%) rotate(-14deg) scale(2.2);animation-timing-function:cubic-bezier(.3,0,.6,1)}',
    '  18%{opacity:1;transform:translate(-50%,-50%) rotate(-5deg) scale(.9)}',
    '  28%{transform:translate(-50%,-50%) rotate(-7deg) scale(1.07)}',
    '  36%{transform:translate(-50%,-50%) rotate(-6deg) scale(1)}',
    '  74%{opacity:1;transform:translate(-50%,-50%) rotate(-6deg) scale(1);animation-timing-function:ease-in}',
    '  100%{opacity:0;transform:translate(-50%,-50%) rotate(-6deg) scale(1.4)}}',
    '@keyframes saBand{0%{transform:scaleX(0)}20%{transform:scaleX(1)}74%{transform:scaleX(1);opacity:1}100%{transform:scaleX(1);opacity:0}}',

    '@media (prefers-reduced-motion: reduce){',
    '  .sa-arm,.sa-cutin,.sa-boom{display:none}',
    '  .gc-plate-wrap.sa-thud,.sa-pile.sa-thud,#gc-stage.sa-quake{animation:none}',
    '}'
  ].join('');

  function injectCSS() {
    if (document.getElementById('sushi-arm-style')) return;
    const st = document.createElement('style');
    st.id = 'sushi-arm-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ---- 皿の上の並べ方（皿の箱に対する % ） [x, y, 幅, 傾き] ----
     皿は奥に倒してあるので、見えている楕円はおおよそ縦 19〜81%。 */
  const ONE = [[50, 47, 46, -6]];
  const ROW10 = [[30, 44], [44, 41], [58, 41], [72, 44], [24, 55],
                 [38, 54], [52, 54], [66, 55], [78, 57], [50, 66]];
  /* 山盛り：下の段から順に積む（後から置いたものが手前に重なる） */
  const MOUND = [[26, 58], [38, 59], [50, 60], [62, 59], [74, 58],
                 [32, 48], [44, 47], [56, 47], [68, 48],
                 [38, 38], [50, 37], [62, 38], [50, 28]];

  let overlay = null, stage = null, plateWrap = null, pile = null;
  let arm = null, move = null, motion = null, ghost = null, cutin = null;
  let toroQueue = [];

  function build() {
    if (arm) return true;
    overlay = document.getElementById('gacha-overlay');
    stage = document.getElementById('gc-stage');
    plateWrap = document.getElementById('gc-plate-wrap');
    if (!overlay || !stage || !plateWrap) return false;
    injectCSS();

    pile = document.createElement('div');
    pile.className = 'sa-pile';
    pile.setAttribute('aria-hidden', 'true');

    arm = document.createElement('div');
    arm.className = 'sa-arm';
    arm.setAttribute('aria-hidden', 'true');
    arm.innerHTML = '<div class="sa-move"><div class="sa-motion"><div class="sa-ghost">' + ARM_SVG + '</div>' +
      ARM_SVG + '</div></div>';
    move = arm.querySelector('.sa-move');
    motion = arm.querySelector('.sa-motion');
    ghost = arm.querySelector('.sa-ghost');

    cutin = document.createElement('div');
    cutin.className = 'sa-cutin';
    cutin.setAttribute('aria-hidden', 'true');

    stage.appendChild(pile);
    stage.appendChild(arm);
    stage.appendChild(cutin);
    overlay.classList.add('sa-on');

    /* 大当たりの後光が出た瞬間に、仕込んでおいた寿司を大トロに化けさせる */
    const rays = document.getElementById('gc-rays');
    if (rays && global.MutationObserver) {
      new MutationObserver(function () {
        if (rays.classList.contains('is-on')) revealToro();
      }).observe(rays, { attributes: true, attributeFilter: ['class'] });
    }

    /* 店を開け直したら、前回の皿は片付けておく */
    if (global.Gacha && typeof global.Gacha.open === 'function' && !global.Gacha.__saWrapped) {
      const orig = global.Gacha.open;
      global.Gacha.open = function () { clearAll(); return orig.apply(this, arguments); };
      global.Gacha.__saWrapped = true;
    }
    return true;
  }

  /* ---- 小道具 ---- */
  function restart(node, value) {            // CSS アニメを頭から流し直す
    node.style.animation = 'none';
    void node.offsetWidth;
    node.style.animation = value;
  }
  function kick(node, cls, ms, later) {
    if (!node) return;
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
    later(function () { node.classList.remove(cls); }, ms);
  }
  function setTarget(p, animate) {
    move.style.transition = animate ? '' : 'none';
    move.style.setProperty('--tx', p[0].toFixed(1) + 'px');
    move.style.setProperty('--ty', p[1].toFixed(1) + 'px');
    if (!animate) void move.offsetWidth;
  }
  function resetArm() {
    if (!arm) return;
    arm.className = 'sa-arm';
    motion.style.animation = 'none';
    ghost.style.animation = 'none';
    setTarget([0, 0], false);
  }
  function clearAll() {
    if (!arm) return;
    pile.textContent = '';
    toroQueue = [];
    resetArm();
    cutin.className = 'sa-cutin';
  }
  function revealToro() {
    toroQueue.forEach(function (d) {
      d.classList.add('toro');
      d.classList.remove('in', 'fade', 'toro-now');
      void d.offsetWidth;
      d.classList.add('toro-now');
    });
    toroQueue = [];
  }

  /* 大トロにする駒を選ぶ（当たりがあれば最低1つ） */
  function pickToro(n, hits) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(false);
    let k = Math.min(n, hits);
    while (k > 0) {
      const i = Math.floor(Math.random() * n);
      if (!out[i]) { out[i] = true; k--; }
    }
    return out;
  }

  function addPiece(p, opts) {
    const d = document.createElement('div');
    d.className = 'sa-piece' + (opts.big ? ' big' : '');
    d.style.setProperty('--x', p[0] + '%');
    d.style.setProperty('--y', p[1] + '%');
    d.style.setProperty('--w', (p[2] || opts.w || 19) + '%');
    d.style.setProperty('--r', (p[3] != null ? p[3] : Math.round(Math.random() * 24 - 12)) + 'deg');
    d.innerHTML = '<i></i><b></b>';
    if (opts.toro) toroQueue.push(d);
    pile.appendChild(d);
    void d.offsetWidth;
    d.classList.add(opts.fade ? 'fade' : 'in');
  }
  function boom(x, y, size, later) {
    const b = document.createElement('div');
    b.className = 'sa-boom';
    b.style.setProperty('--x', x + '%');
    b.style.setProperty('--y', y + '%');
    b.style.setProperty('--s', size + '%');
    pile.appendChild(b);
    void b.offsetWidth;
    b.classList.add('go');
    later(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 420);
  }
  function cutIn(big, later) {
    cutin.textContent = tr('sushiOmachi', 'へい！お待ち！！');
    cutin.className = 'sa-cutin' + (big ? ' big' : '');
    void cutin.offsetWidth;
    cutin.classList.add('go');
    later(function () { cutin.classList.remove('go'); }, big ? 700 : 520);
  }

  /* ---- 本体：index.html の serve() から呼ばれる ----
     ctx = { times, hits, el, later, pulse, vib, spawn, plateXY, touch,
             reduced, tone, noise, se:{ fue, clap } }
     戻り値の Promise が解決したら、結果（数字・大トロ・お会計）へ進む。 */
  function serve(ctx) {
    return new Promise(function (resolve) {
      if (!build()) { resolve(); return; }
      const L = ctx.later || function (fn, ms) { return setTimeout(fn, ms); };
      const el = ctx.el || {};
      const se = ctx.se || {};
      const tone = ctx.tone || function () {};
      const noise = ctx.noise || function () {};
      const vib = ctx.vib || function () {};
      const spawnKo = function (n, power) {
        if (ctx.spawn && ctx.plateXY) ctx.spawn('ko', n, ctx.plateXY(), power);
      };

      clearAll();
      if (el.plate) { el.plate.classList.remove('is-served'); el.plate.classList.add('is-idle'); }

      const times = Math.max(1, ctx.times | 0);
      const hits = Math.max(0, ctx.hits | 0);
      const mode = times === 1 ? 'one' : (times <= 10 ? 'jab' : 'big');
      const layout = mode === 'one' ? ONE : (mode === 'jab' ? ROW10.slice(0, times) : MOUND);
      /* 山盛りは13個しか置かないので、大トロの数は引いた回数に対する割合で
         決める（当たりがあれば最低1個）。全部が大トロに化けると嘘になる。 */
      const toroN = mode === 'big'
        ? (hits > 0 ? Math.max(1, Math.round(layout.length * hits / times)) : 0)
        : hits;
      const toro = pickToro(layout.length, toroN);

      /* 動きを減らす設定：腕もカットインも出さず、並べて終わり */
      if (ctx.reduced) {
        layout.forEach(function (p, i) { addPiece(p, { fade: true, toro: toro[i], big: mode === 'one' }); });
        L(resolve, 160);
        return;
      }

      /* 効果音（寿司屋の合成音をそのまま借りる。音を切っていれば鳴らない） */
      const swoosh = function () { noise(0.2, 1800, 420, 0.12); };
      const thud = function (big) {
        tone({ type: 'sine', from: big ? 150 : 170, to: 46, dur: big ? 0.34 : 0.24, vol: big ? 0.6 : 0.45 });
        noise(0.07, 900, 180, 0.3);
        if (se.clap) L(se.clap, 60);
      };
      const tap = function () {
        tone({ type: 'sine', from: 240, to: 110, dur: 0.08, vol: 0.2 });
        noise(0.03, 2400, 900, 0.08);
      };
      const shoutFace = function () {
        if (ctx.pulse && el.taisho) ctx.pulse(el.taisho, 'is-shout', 560);
        if (ctx.pulse && el.mouth) ctx.pulse(el.mouth, 'is-open', 560);
      };
      /* ドスン：皿が沈み、衝撃の輪、米粒が跳ね、大将が叫ぶ */
      const slam = function (big) {
        kick(plateWrap, 'sa-thud', 300, L);
        kick(pile, 'sa-thud', 300, L);
        if (big) kick(stage, 'sa-quake', 380, L);
        boom(50, 50, big ? 125 : 85, L);
        cutIn(big, L);
        thud(big);
        shoutFace();
        spawnKo(big ? (ctx.touch ? 40 : 70) : (ctx.touch ? 16 : 26), big ? 1.6 : 1.2);
        vib(big ? [0, 40, 30, 60] : 30);
      };

      if (se.fue) se.fue();
      swoosh();
      arm.classList.add('on');

      if (mode !== 'jab') {
        /* ---- 一貫 / 山盛り：一撃でドスン ---- */
        const big = mode === 'big';
        if (big) arm.classList.add('big');
        restart(motion, 'saOne .7s both');
        restart(ghost, 'saGhostOne .7s both');
        const IMPACT = 490;                       // saOne の 70%
        L(function () {
          arm.classList.add('empty');
          layout.forEach(function (p, i) {
            const opts = { toro: toro[i], big: !big, w: big ? 19 : 0 };
            if (big) L(function () { addPiece(p, opts); }, i * 18);
            else addPiece(p, opts);
          });
          slam(big);
        }, IMPACT);
        L(swoosh, 560);
        L(function () { resetArm(); }, 720);
        L(resolve, IMPACT + (big ? 320 : 250));
        return;
      }

      /* ---- 十貫：ポコポコポコ！と1つずつ並べ、最後の1つでドスン ---- */
      const W = plateWrap.getBoundingClientRect().width || 200;
      const pos = layout.map(function (p) { return [(p[0] - 50) / 100 * W, (p[1] - 50) / 100 * W]; });
      const n = layout.length;
      const J = n <= 5 ? 110 : 72;               // 1回の突きの長さ
      const T0 = 260;                             // 飛び込みにかける時間
      setTarget(pos[0], false);
      restart(motion, 'saEnter .26s cubic-bezier(.15,.85,.3,1.05) both');
      restart(ghost, 'saGhostOn .26s both');

      layout.forEach(function (p, i) {
        L(function () {
          setTarget(pos[i], true);
          ghost.style.animation = 'none';
          restart(motion, 'saJab ' + J + 'ms linear both');
          L(function () {
            addPiece(p, { toro: toro[i], w: 20 });
            if (i < n - 1) {
              tap();
              vib(8);
              spawnKo(ctx.touch ? 3 : 5, 0.8);
            } else {
              arm.classList.add('empty');
              slam(false);
            }
          }, Math.round(J * 0.45));
        }, T0 + i * J);
      });
      const lastImpact = T0 + (n - 1) * J + Math.round(J * 0.45);
      L(function () {
        swoosh();
        restart(motion, 'saExit .2s cubic-bezier(.5,0,.9,.6) both');
        restart(ghost, 'saGhostOn .2s both');
      }, T0 + n * J);
      L(function () { resetArm(); }, T0 + n * J + 220);
      L(resolve, lastImpact + 250);
    });
  }

  global.SushiArm = { serve: serve, clear: clearAll };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})(window);
