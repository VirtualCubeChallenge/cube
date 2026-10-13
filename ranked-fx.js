/* =====================================================================
   ranked-fx.js — 世界ランキングの「確定演出」
   ---------------------------------------------------------------------
   ランク戦で自己ベストを出したときに、サーバーの返事（順位）を受けて流す。
     tier 1 … 1位        いちばん派手（雷・虹の枠・長め）
     tier 2 … 2〜3位     派手
     tier 3 … 自己ベスト  派手（1位よりは控えめ・短め）
   流れ: 暗転（周りがゆっくり灰色に沈む）→ 閃光 → 巨大な文字が叩きつけられる
         → 紙吹雪・桜・火花・キューブの破片 → 枠が光って点滅 → 画面が揺れる
   ・動かすのは transform と opacity だけ（CSS アニメーション）。要素は最大でも約230個
   ・点滅は1秒に3回以下（光の点滅で具合が悪くなる人がいるため）
   ・「動きを減らす」設定の端末では、揺れ・閃光・点滅をやめて粒も減らす
   ・タップでいつでも飛ばせる
   使い方: RankedFx.play({ tier, rank, timeMs, tx, fmt }, onDone)
   ===================================================================== */
(function (global) {
  'use strict';

  const CSS = [
    '#rk-fx{position:fixed;inset:0;z-index:20000;overflow:hidden;cursor:pointer;-webkit-tap-highlight-color:transparent;',
    '  font-family:inherit;color:#fff;contain:strict;touch-action:manipulation}',
    /* 暗転: 後ろのアプリが灰色にぼやけながら沈む（スローモーションの間） */
    '#rk-fx .fx-dim{position:absolute;inset:0;background:#000;opacity:0;',
    '  -webkit-backdrop-filter:grayscale(1) blur(3px);backdrop-filter:grayscale(1) blur(3px);',
    '  animation:fxDim var(--dim) cubic-bezier(.5,0,.7,1) forwards}',
    '@keyframes fxDim{0%{opacity:0}100%{opacity:.94}}',
    /* 溜め: 真ん中で鼓動する小さな光 */
    '#rk-fx .fx-heart{position:absolute;left:50%;top:44%;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;',
    '  background:var(--c1);box-shadow:0 0 18px 6px var(--c1);opacity:0;animation:fxHeart var(--dim) ease-in forwards}',
    '@keyframes fxHeart{0%{opacity:0;transform:scale(.4)}30%{opacity:.8;transform:scale(1)}45%{transform:scale(.6)}',
    '  65%{opacity:1;transform:scale(1.4)}80%{transform:scale(.7)}100%{opacity:1;transform:scale(2.4)}}',
    /* 揺れる舞台（文字と光はこの中） */
    '#rk-fx .fx-stage{position:absolute;inset:0;animation:fxShake var(--shake) linear var(--hit) both}',
    '@keyframes fxShake{0%{transform:translate(0,0) rotate(0)}8%{transform:translate(-14px,9px) rotate(-1.4deg)}',
    '  16%{transform:translate(12px,-11px) rotate(1.2deg)}24%{transform:translate(-10px,-6px) rotate(-.8deg)}',
    '  32%{transform:translate(9px,8px) rotate(.9deg)}40%{transform:translate(-7px,4px) rotate(-.5deg)}',
    '  52%{transform:translate(5px,-4px) rotate(.4deg)}64%{transform:translate(-3px,2px)}78%{transform:translate(2px,-1px)}',
    '  100%{transform:translate(0,0) rotate(0)}}',
    /* 放射する光（回る後光） */
    '#rk-fx .fx-rays{position:absolute;left:50%;top:44%;width:240vmax;height:240vmax;margin:-120vmax 0 0 -120vmax;',
    '  background:repeating-conic-gradient(from 0deg,var(--ray) 0deg 7deg,transparent 7deg 18deg);',
    '  -webkit-mask:radial-gradient(circle,#000 0,rgba(0,0,0,.85) 18%,transparent 58%);',
    '  mask:radial-gradient(circle,#000 0,rgba(0,0,0,.85) 18%,transparent 58%);',
    '  opacity:0;animation:fxRaysIn .5s ease-out var(--hit) forwards,fxSpin 7s linear var(--hit) infinite}',
    '@keyframes fxRaysIn{from{opacity:0;transform:scale(.2)}to{opacity:1;transform:scale(1)}}',
    '@keyframes fxSpin{to{rotate:360deg}}',
    '#rk-fx.t1 .fx-rays{background:repeating-conic-gradient(from 0deg,rgba(255,80,80,.55) 0deg 6deg,transparent 6deg 12deg,',
    '  rgba(255,210,60,.6) 12deg 18deg,transparent 18deg 24deg,rgba(80,255,160,.5) 24deg 30deg,transparent 30deg 36deg,',
    '  rgba(80,170,255,.55) 36deg 42deg,transparent 42deg 48deg,rgba(200,90,255,.55) 48deg 54deg,transparent 54deg 60deg)}',
    /* 閃光（1回だけ） */
    '#rk-fx .fx-flash{position:absolute;inset:0;opacity:0;',
    '  background:radial-gradient(circle at 50% 44%,#fff 0,var(--c1) 22%,rgba(255,255,255,0) 70%);',
    '  animation:fxFlash .55s ease-out var(--hit) forwards}',
    '@keyframes fxFlash{0%{opacity:0}12%{opacity:1}100%{opacity:0}}',
    /* 衝撃波の輪 */
    '#rk-fx .fx-ring{position:absolute;left:50%;top:44%;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;',
    '  border:6px solid var(--c1);box-shadow:0 0 24px var(--c1),inset 0 0 18px var(--c1);opacity:0;',
    '  animation:fxRing .9s cubic-bezier(.1,.7,.3,1) forwards}',
    '@keyframes fxRing{0%{opacity:1;transform:scale(.2)}100%{opacity:0;transform:scale(28)}}',
    /* 文字の後ろの暗い座布団（派手な光の上でも文字が読めるように） */
    '#rk-fx .fx-plate{position:absolute;left:50%;top:44%;width:150vmin;height:80vmin;margin:-40vmin 0 0 -75vmin;border-radius:50%;',
    '  background:radial-gradient(closest-side,rgba(0,0,0,.82),rgba(0,0,0,.55) 55%,transparent);opacity:0;',
    '  animation:fxRaysIn .4s ease-out var(--hit) forwards}',
    /* 文字 */
    '#rk-fx .fx-text{position:absolute;left:0;right:0;top:44%;transform:translateY(-50%);text-align:center;padding:0 12px;pointer-events:none}',
    '#rk-fx .fx-main{display:block;margin:0 0 4px;font-size:var(--main);font-weight:900;line-height:1.02;letter-spacing:.02em;',
    '  background:linear-gradient(100deg,#fff6c8 0%,#ffd36a 18%,#ff9d2e 32%,#fff 44%,#ffd36a 56%,#c98a12 72%,#fff6c8 100%);',
    '  background-size:220% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;',
    '  -webkit-text-stroke:1.2px rgba(255,255,255,.7);',
    '  filter:drop-shadow(0 0 2px #fff) drop-shadow(0 0 14px var(--c1)) drop-shadow(0 0 34px var(--c2));',
    '  opacity:0;animation:fxSlam .7s cubic-bezier(.15,1.4,.35,1) var(--hit) both,fxShine 1.6s linear calc(var(--hit) + .6s) infinite,',
    '  fxPulse 1.2s ease-in-out calc(var(--hit) + .8s) infinite}',
    '#rk-fx.t1 .fx-main{background:linear-gradient(100deg,#ff5a6e,#ffd36a 16%,#7dff9a 32%,#5ac8ff 48%,#c77dff 64%,#ff5a6e 80%,#ffd36a);',
    '  background-size:220% 100%;-webkit-background-clip:text;background-clip:text}',
    '#rk-fx.t3 .fx-main{background:linear-gradient(100deg,#f3e6ff 0%,#c77dff 25%,#5ae8ff 50%,#c77dff 75%,#f3e6ff 100%);',
    '  background-size:220% 100%;-webkit-background-clip:text;background-clip:text}',
    '@keyframes fxSlam{0%{opacity:0;transform:scale(5) rotate(8deg);filter:blur(10px)}',
    '  55%{opacity:1;transform:scale(.86) rotate(-2deg)}75%{transform:scale(1.08)}100%{opacity:1;transform:scale(1) rotate(0)}}',
    '@keyframes fxShine{from{background-position:0% 0}to{background-position:220% 0}}',
    '@keyframes fxPulse{0%,100%{scale:1}50%{scale:1.05}}',
    '#rk-fx .fx-sub{display:inline-block;margin-top:10px;padding:7px 16px;border-radius:999px;font-size:clamp(14px,4.2vw,19px);',
    '  font-weight:900;font-variant-numeric:tabular-nums;background:rgba(10,10,16,.72);border:1.5px solid var(--c1);',
    '  box-shadow:0 0 16px var(--c1),inset 0 0 10px rgba(255,255,255,.08);opacity:0;',
    '  animation:fxUp .5s ease-out calc(var(--hit) + .55s) both}',
    '@keyframes fxUp{from{opacity:0;transform:translateY(18px) scale(.9)}to{opacity:1;transform:none}}',
    /* 雷（1位だけ） */
    '#rk-fx .fx-bolt{position:absolute;top:-2%;width:22vw;max-width:150px;height:60vh;opacity:0;',
    '  filter:drop-shadow(0 0 6px #fff) drop-shadow(0 0 18px #8fd3ff);animation:fxBolt .5s linear both}',
    '@keyframes fxBolt{0%{opacity:0}4%{opacity:1}30%{opacity:.25}44%{opacity:1}70%{opacity:.6}100%{opacity:0}}',
    /* 粒 */
    '#rk-fx .fx-p{position:absolute;left:50%;top:44%;will-change:transform,opacity;pointer-events:none}',
    '#rk-fx .fx-p.b{animation:fxBurst var(--d) cubic-bezier(.08,.8,.3,1) var(--w) both}',
    '@keyframes fxBurst{0%{opacity:1;transform:translate(-50%,-50%) translate(0,0) rotate(0) scale(.2)}',
    '  75%{opacity:1}100%{opacity:0;transform:translate(-50%,-50%) translate(var(--x),var(--y)) rotate(var(--r)) scale(1)}}',
    '#rk-fx .fx-p.f{top:-6vh;left:var(--l);animation:fxFall var(--d) linear var(--w) both}',
    '@keyframes fxFall{0%{opacity:0;transform:translate3d(0,0,0) rotate3d(1,1,0,0deg)}5%{opacity:1}',
    '  100%{opacity:1;transform:translate3d(var(--x),112vh,0) rotate3d(1,1,0,var(--r))}}',
    '#rk-fx .fx-p.cf{width:9px;height:14px;border-radius:2px}',
    '#rk-fx .fx-p.sk{width:13px;height:11px;border-radius:13px 0 13px 0;background:#ffb7d5;box-shadow:inset -2px -2px 0 rgba(255,120,170,.5)}',
    '#rk-fx .fx-p.sp{width:5px;height:5px;border-radius:50%;background:#fff;box-shadow:0 0 8px 3px var(--c1)}',
    '#rk-fx .fx-p.cb{width:12px;height:12px;border-radius:2.5px;border:1.5px solid rgba(0,0,0,.55)}',
    '#rk-fx .fx-p.st{width:16px;height:16px;background:var(--c1);',
    '  clip-path:polygon(50% 0,61% 38%,100% 38%,68% 61%,79% 100%,50% 76%,21% 100%,32% 61%,0 38%,39% 38%)}',
    /* 画面の枠: 虹色に光って点滅（1秒に2.5回） */
    '#rk-fx .fx-frame{position:absolute;inset:0;pointer-events:none;opacity:0;border-radius:inherit;',
    '  box-shadow:inset 0 0 0 6px var(--c1),inset 0 0 40px 10px var(--c2);',
    '  animation:fxFrameIn .3s ease-out var(--hit) forwards,fxBlink .4s steps(2) var(--hit) var(--blinks),fxHue 1.2s linear var(--hit) infinite}',
    '@keyframes fxFrameIn{to{opacity:1}}',
    '@keyframes fxBlink{0%{opacity:1}50%{opacity:.25}}',
    '@keyframes fxHue{to{filter:hue-rotate(360deg)}}',
    '#rk-fx.t3 .fx-frame{animation:fxFrameIn .3s ease-out var(--hit) forwards,fxBlink .4s steps(2) var(--hit) var(--blinks)}',
    '#rk-fx .fx-tap{position:absolute;left:0;right:0;bottom:calc(env(safe-area-inset-bottom,0px) + 22px);text-align:center;',
    '  font-size:12px;font-weight:700;color:rgba(255,255,255,.6);opacity:0;animation:fxUp .4s ease-out calc(var(--hit) + 1.4s) both}',
    '#rk-fx.out{transition:opacity .45s ease;opacity:0}',
    '@media (prefers-reduced-motion: reduce){',
    '  #rk-fx .fx-stage,#rk-fx .fx-rays,#rk-fx .fx-flash,#rk-fx .fx-bolt,#rk-fx .fx-ring{animation:none!important;opacity:0!important}',
    '  #rk-fx .fx-frame{animation:fxFrameIn .3s ease-out var(--hit) forwards!important}',
    '  #rk-fx .fx-main{animation:fxUp .5s ease-out var(--hit) both!important}',
    '}'
  ].join('\n');

  const CUBE = ['#ffffff', '#ffd500', '#ff2a2a', '#ff8c00', '#0aa24a', '#1f6bff'];
  const CONF = ['#ffd36a', '#fff1b8', '#ff5a6e', '#5ac8ff', '#7dff9a', '#c77dff', '#ff9d2e'];
  const TIERS = {
    1: { c1: '#ffd36a', c2: '#ff5ad1', ray: 'rgba(255,214,90,.55)', dim: 0.95, hold: 4.6, burst: 90, fall: 80, spark: 40, bolts: 3, blinks: 9, main: 'clamp(54px,17vw,104px)', vib: [80, 50, 80, 50, 260] },
    2: { c1: '#ffd36a', c2: '#ff9d2e', ray: 'rgba(255,214,90,.45)', dim: 0.8, hold: 3.9, burst: 70, fall: 50, spark: 26, bolts: 0, blinks: 6, main: 'clamp(46px,14vw,88px)', vib: [70, 50, 160] },
    3: { c1: '#c77dff', c2: '#5ae8ff', ray: 'rgba(199,125,255,.4)', dim: 0.55, hold: 3.1, burst: 46, fall: 30, spark: 16, bolts: 0, blinks: 4, main: 'clamp(34px,10.5vw,64px)', vib: [60, 40, 100] }
  };

  function injectCSS() {
    if (document.getElementById('rk-fx-style')) return;
    const st = document.createElement('style');
    st.id = 'rk-fx-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  const rnd = function (a, b) { return a + Math.random() * (b - a); };
  const pick = function (a) { return a[Math.floor(Math.random() * a.length)]; };

  function particles(cfg, hit, reduced) {
    const out = [];
    const k = reduced ? 0.3 : 1;
    const minDim = Math.min(global.innerWidth || 400, global.innerHeight || 700);
    // 真ん中から弾ける（紙吹雪・火花・キューブの破片・星）
    for (let i = 0; i < Math.round(cfg.burst * k); i++) {
      const a = rnd(0, Math.PI * 2), dist = rnd(0.25, 0.75) * minDim * 1.25;
      const type = pick(['cf', 'cf', 'cb', 'st', 'sk']);
      const bg = type === 'cb' ? pick(CUBE) : type === 'st' || type === 'sk' ? '' : pick(CONF);
      out.push('<i class="fx-p b ' + type + '" style="--x:' + Math.round(Math.cos(a) * dist) + 'px;--y:' + Math.round(Math.sin(a) * dist + rnd(0, 120)) +
        'px;--r:' + Math.round(rnd(-720, 720)) + 'deg;--d:' + rnd(1.1, 2).toFixed(2) + 's;--w:' + (hit + rnd(0, 0.15)).toFixed(2) + 's' +
        (bg ? ';background:' + bg : '') + '"></i>');
    }
    // 火花（速く遠くへ）
    for (let i = 0; i < Math.round(cfg.spark * k); i++) {
      const a = rnd(0, Math.PI * 2), dist = rnd(0.5, 1) * minDim;
      out.push('<i class="fx-p b sp" style="--x:' + Math.round(Math.cos(a) * dist) + 'px;--y:' + Math.round(Math.sin(a) * dist) +
        'px;--r:0deg;--d:' + rnd(0.6, 1.1).toFixed(2) + 's;--w:' + (hit + rnd(0, 0.1)).toFixed(2) + 's"></i>');
    }
    // 上から降り注ぐ（紙吹雪・桜・キューブの破片）
    for (let i = 0; i < Math.round(cfg.fall * k); i++) {
      const type = pick(['cf', 'cf', 'sk', 'cb']);
      const bg = type === 'cb' ? pick(CUBE) : type === 'sk' ? '' : pick(CONF);
      out.push('<i class="fx-p f ' + type + '" style="--l:' + rnd(-2, 100).toFixed(1) + 'vw;--x:' + Math.round(rnd(-80, 80)) +
        'px;--r:' + Math.round(rnd(360, 1440)) + 'deg;--d:' + rnd(2.2, 3.8).toFixed(2) + 's;--w:' + (hit + 0.2 + rnd(0, 1.6)).toFixed(2) + 's' +
        (bg ? ';background:' + bg : '') + '"></i>');
    }
    return out.join('');
  }

  function bolts(cfg, hit) {
    let html = '';
    const xs = [8, 70, 38];
    for (let i = 0; i < cfg.bolts; i++) {
      // 1秒に3回を超えないよう、0.45秒ずつ間を空ける
      html += '<svg class="fx-bolt" viewBox="0 0 60 200" preserveAspectRatio="none" style="left:' + xs[i % 3] + 'vw;animation-delay:' +
        (hit + 0.1 + i * 0.45).toFixed(2) + 's' + (i % 2 ? ';transform:scaleX(-1)' : '') + '">' +
        '<path d="M34 0 L14 78 L30 80 L8 200 L48 96 L30 94 L52 0 Z" fill="#eaf6ff" stroke="#8fd3ff" stroke-width="2"/></svg>';
    }
    return html;
  }

  let current = null;
  function play(opts, done) {
    injectCSS();
    if (current) current.finish();
    const cfg = TIERS[opts.tier] || TIERS[3];
    const tx = opts.tx || function (k) { return k; };
    const fmt = opts.fmt || function (ms) { return (ms / 1000).toFixed(2); };
    const reduced = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const hit = reduced ? 0.25 : cfg.dim;          // 閃光の瞬間（秒）
    const main = opts.tier === 1 ? tx('rkFxFirst') : opts.tier === 2 ? tx('rkFxTop', { n: opts.rank }) : tx('rkFxPb');
    const sub = '🌍 ' + fmt(opts.timeMs) + (opts.tier === 3 ? '  ·  ' + tx('rkRank', { n: opts.rank }) : '');

    const el = document.createElement('div');
    el.id = 'rk-fx';
    el.className = 't' + opts.tier;
    el.setAttribute('role', 'alert');
    el.style.cssText = '--c1:' + cfg.c1 + ';--c2:' + cfg.c2 + ';--ray:' + cfg.ray + ';--dim:' + (reduced ? 0.25 : cfg.dim) + 's;--hit:' + hit +
      's;--shake:' + (opts.tier === 1 ? 0.9 : opts.tier === 2 ? 0.7 : 0.5) + 's;--blinks:' + cfg.blinks + ';--main:' + cfg.main;
    el.innerHTML =
      '<div class="fx-dim"></div><div class="fx-heart"></div>' +
      '<div class="fx-stage">' +
        '<div class="fx-rays"></div><div class="fx-flash"></div>' +
        '<div class="fx-ring" style="animation-delay:' + hit + 's"></div>' +
        '<div class="fx-ring" style="animation-delay:' + (hit + 0.18) + 's"></div>' +
        (opts.tier === 1 ? '<div class="fx-ring" style="animation-delay:' + (hit + 0.36) + 's"></div>' : '') +
        bolts(reduced ? { bolts: 0 } : cfg, hit) +
        particles(cfg, hit, reduced) +
        '<div class="fx-plate"></div>' +
        '<div class="fx-text">' +
          '<span class="fx-main">' + esc(main) + '</span>' +
          '<span class="fx-sub">' + esc(sub) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="fx-frame"></div>' +
      '<div class="fx-tap">' + esc(tx('rkFxTap')) + '</div>';
    document.body.appendChild(el);

    let ended = false;
    const timers = [];
    const finish = function () {
      if (ended) return;
      ended = true;
      timers.forEach(clearTimeout);
      el.classList.add('out');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 470);
      if (current && current.el === el) current = null;
      if (typeof done === 'function') done();
    };
    current = { el: el, finish: finish };
    // 溜めの間はタップを受けない（ソルブ最後の1手の指でそのまま飛ばさないように）
    timers.push(setTimeout(function () { el.addEventListener('click', finish); }, Math.round(hit * 1000) + 350));
    timers.push(setTimeout(function () {
      if (reduced) return;
      try {
        if (typeof global.triggerHaptics === 'function') global.triggerHaptics(cfg.vib);
        else if (navigator.vibrate) navigator.vibrate(cfg.vib);
      } catch (e) { /* 振動できない端末 */ }
    }, Math.round(hit * 1000)));
    timers.push(setTimeout(finish, Math.round((hit + cfg.hold) * 1000)));
  }

  global.RankedFx = { play: play, stop: function () { if (current) current.finish(); } };
})(window);
