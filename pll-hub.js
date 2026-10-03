/* =========================================================================
   === PLL トレーニング：モード選択ハブ (pll-hub.js) ========================
   ドロワーの「トレーニング」を押すと開く、3つのモードの入口。
     A 上中央 … PLL検定      （PllTrainer.open）
     B 左下   … PLLフラッシュ （PllFlash.open）
     C 右下   … PLLビジョン   （PllFlash.openVision）

   方針
   - 丸枠の中に文字は入れない。アイコンだけで見分ける。
     名前は aria-label / title にだけ持たせる（読み上げとPCのツールチップ用）。
   - 動きは CSS アニメーション（transform / opacity）だけで作る。
     描き直しが要る background-position や filter のアニメは使わない。
   - モードを開いても、このハブは下に残しておく（z-index 41 < 検定 42 <
     フラッシュ 44）。モードを閉じるとハブに戻り、✕ でゲームに戻る。
     モードが上に乗っているあいだはハブを visibility:hidden にして、
     見えない所でアニメが回り続けないようにする。
   - 文言は既存のキー（plltTitle / plfTitle / plvTitle / menuTraining /
     close）を使うので、新しい翻訳は無い。
   ========================================================================= */
(function (global) {
  'use strict';

  const ROOT_ID = 'pllh-overlay';
  const reduceMotion = !!(global.matchMedia &&
    global.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // 三角形の頂点（ステージ = 正方形の % 座標）。BとCの間隔 .58、
  // 高さ .58×√3/2 ≒ .502。重心がステージの中心(50,50)に来るように置く。
  const NODES = [
    { id: 'pllt', x: 50, y: 16.5, hue: 'a', label: 'plltTitle', icon: 'cube' },
    { id: 'plf',  x: 21, y: 66.7, hue: 'b', label: 'plfTitle',  icon: 'bolt' },
    { id: 'plv',  x: 79, y: 66.7, hue: 'c', label: 'plvTitle',  icon: 'eye'  }
  ];

  function tx(key, fallback) {
    try {
      if (typeof global.t === 'function') {
        const s = global.t(key);
        if (s && s !== key) return s;
      }
    } catch (e) {}
    return fallback || key;
  }

  /* ---------------------------------------------------------------- 絵 -- */
  const ICONS = {
    // 3×3 キューブ（等角図）。上面だけ少し明るく塗って立体に見せる。
    cube:
      '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">' +
        '<path class="f1" d="M32 8 53 20 32 32 11 20Z"/>' +
        '<path class="f2" d="M11 20 32 32 32 56 11 44Z"/>' +
        '<path class="f3" d="M53 20 32 32 32 56 53 44Z"/>' +
        '<g class="ln">' +
          '<path d="M32 8 53 20 53 44 32 56 11 44 11 20Z"/>' +
          '<path d="M11 20 32 32 53 20M32 32V56"/>' +
          // 上面のマス目
          '<path d="M18 16 39 28M25 12 46 24M39 12 18 24M46 16 25 28"/>' +
          // 左面
          '<path d="M18 24V48M25 28V52M11 28 32 40M11 36 32 48"/>' +
          // 右面
          '<path d="M39 28V52M46 24V48M32 40 53 28M32 48 53 36"/>' +
        '</g>' +
      '</svg>',
    // 稲妻と矢印を合わせた形。稲妻の下の切っ先がそのまま矢じりになり、
    // 左に流れる速度線で「一瞬で過ぎる」を出す。
    bolt:
      '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">' +
        '<g class="spd">' +
          '<path d="M4 25H15M2 33H12M6 41H14"/>' +
        '</g>' +
        '<path class="core" d="M40 4 18 35H31L25 60 49 26H36L46 4Z"/>' +
        '<path class="hd" d="M45 47 56 49 54 38"/>' +
        '<path class="hd" d="M55 48 44 37"/>' +
      '</svg>',
    // 目 ＋ 3×3 グリッド。瞳の中に9マス、外側にスキャン枠の角。
    eye:
      '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">' +
        '<g class="brk">' +
          '<path d="M4 14V6H12M52 6H60V14M60 50V58H52M12 58H4V50"/>' +
        '</g>' +
        '<path class="lid" d="M5 32Q32 6 59 32Q32 58 5 32Z"/>' +
        '<circle class="iris" cx="32" cy="32" r="13"/>' +
        '<g class="pix">' +
          '<rect x="23.5" y="23.5" width="5" height="5" rx="1"/>' +
          '<rect x="29.5" y="23.5" width="5" height="5" rx="1"/>' +
          '<rect x="35.5" y="23.5" width="5" height="5" rx="1"/>' +
          '<rect x="23.5" y="29.5" width="5" height="5" rx="1"/>' +
          '<rect x="29.5" y="29.5" width="5" height="5" rx="1" class="mid"/>' +
          '<rect x="35.5" y="29.5" width="5" height="5" rx="1"/>' +
          '<rect x="23.5" y="35.5" width="5" height="5" rx="1"/>' +
          '<rect x="29.5" y="35.5" width="5" height="5" rx="1"/>' +
          '<rect x="35.5" y="35.5" width="5" height="5" rx="1"/>' +
        '</g>' +
      '</svg>'
  };

  /* --------------------------------------------------------------- CSS -- */
  const CSS = [
    '#pllh-overlay{display:none;position:fixed;inset:0;z-index:41;overflow:hidden;',
    '  background:#04040b;color:#e9ecff;opacity:0;transition:opacity .22s ease;',
    '  -webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;',
    '  touch-action:manipulation;',
    '  --a:46,230,255; --b:192,90,255; --c:92,128,255}',
    '#pllh-overlay.show{display:block}',
    '#pllh-overlay.in{opacity:1}',
    // モードが上に乗っているあいだは見えないので描かない
    '#pllh-overlay.covered{visibility:hidden}',
    '#pllh-overlay.covered *{animation-play-state:paused!important}',

    /* ---- 背景：星雲・星・流れるグリッドの床 ---- */
    '.pllh-bg{position:absolute;inset:0;pointer-events:none;',
    '  background:',
    '    radial-gradient(60% 42% at 50% 34%,rgba(70,60,200,.30),transparent 70%),',
    '    radial-gradient(48% 36% at 12% 82%,rgba(150,50,230,.22),transparent 70%),',
    '    radial-gradient(44% 34% at 90% 74%,rgba(30,140,255,.18),transparent 70%),',
    '    linear-gradient(#04040b,#070716 55%,#0a0820)}',
    '.pllh-stars{position:absolute;left:0;right:0;top:-50%;height:200%;pointer-events:none;opacity:.75;',
    '  background-image:',
    '    radial-gradient(1px 1px at 12% 18%,#fff 98%,transparent),',
    '    radial-gradient(1px 1px at 72% 8%,#bfe9ff 98%,transparent),',
    '    radial-gradient(1.4px 1.4px at 38% 42%,#fff 98%,transparent),',
    '    radial-gradient(1px 1px at 88% 36%,#d8c6ff 98%,transparent),',
    '    radial-gradient(1px 1px at 22% 66%,#fff 98%,transparent),',
    '    radial-gradient(1.2px 1.2px at 58% 78%,#bfe9ff 98%,transparent),',
    '    radial-gradient(1px 1px at 94% 88%,#fff 98%,transparent),',
    '    radial-gradient(1px 1px at 4% 94%,#d8c6ff 98%,transparent);',
    '  background-size:260px 260px;animation:pllh-drift 60s linear infinite}',
    '@keyframes pllh-drift{from{transform:translate3d(0,0,0)}to{transform:translate3d(0,260px,0)}}',

    '.pllh-floor{position:absolute;left:-30%;right:-30%;bottom:0;height:46%;pointer-events:none;',
    '  perspective:340px;perspective-origin:50% 0;overflow:hidden;',
    '  -webkit-mask-image:linear-gradient(transparent,#000 40%);mask-image:linear-gradient(transparent,#000 40%)}',
    '.pllh-plane{position:absolute;left:0;right:0;top:0;height:220%;transform-origin:50% 0;transform:rotateX(66deg)}',
    '.pllh-lines{position:absolute;left:0;right:0;top:-48px;bottom:0;',
    '  background-image:',
    '    linear-gradient(rgba(110,120,255,.42) 1.5px,transparent 1.5px),',
    '    linear-gradient(90deg,rgba(110,120,255,.42) 1.5px,transparent 1.5px);',
    '  background-size:48px 48px;animation:pllh-flow 2.6s linear infinite}',
    '@keyframes pllh-flow{from{transform:translate3d(0,0,0)}to{transform:translate3d(0,48px,0)}}',
    // 地平線のにじみ
    '.pllh-horizon{position:absolute;left:0;right:0;bottom:44%;height:2px;pointer-events:none;',
    '  background:linear-gradient(90deg,transparent,rgba(var(--b),.55),rgba(var(--a),.7),rgba(var(--b),.55),transparent);',
    '  box-shadow:0 0 18px 4px rgba(120,100,255,.35);opacity:.7}',

    /* ---- 閉じるボタン（左上、アイコンのみ） ---- */
    '.pllh-close{position:absolute;z-index:3;top:calc(env(safe-area-inset-top,0px) + 14px);',
    '  left:calc(env(safe-area-inset-left,0px) + 14px);width:44px;height:44px;border-radius:50%;',
    '  display:grid;place-items:center;padding:0;cursor:pointer;color:#cfe9ff;',
    '  background:rgba(14,16,40,.55);border:1.5px solid rgba(var(--a),.45);',
    '  box-shadow:0 0 12px rgba(var(--a),.25),inset 0 0 10px rgba(var(--a),.15);',
    '  transition:transform .15s ease,box-shadow .15s ease}',
    '.pllh-close svg{width:18px;height:18px;stroke:currentColor;stroke-width:2.6;stroke-linecap:round;fill:none}',
    '.pllh-close:active{transform:scale(.92);box-shadow:0 0 20px rgba(var(--a),.6),inset 0 0 12px rgba(var(--a),.3)}',

    /* ---- ステージ：正方形。3つの丸はこの中の % 座標に置く ---- */
    '.pllh-stage{position:absolute;left:50%;top:50%;',
    '  --S:min(92vw,calc(100vh - 120px),640px);',
    '  --S:min(92vw,calc(100dvh - 120px),640px);',
    '  width:var(--S);height:var(--S);transform:translate(-50%,-46%)}',
    // 3点を結ぶホログラムの細い線
    '.pllh-net{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}',
    '.pllh-net line{stroke:rgba(150,160,255,.32);stroke-width:1.2px;stroke-dasharray:1.2 1.6;',
    '  animation:pllh-dash 3.2s linear infinite}',
    '@keyframes pllh-dash{to{stroke-dashoffset:-11.2}}',
    '.pllh-core{position:absolute;left:50%;top:50%;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;',
    '  background:#fff;box-shadow:0 0 10px 3px rgba(var(--a),.8),0 0 30px 10px rgba(var(--b),.35);',
    '  animation:pllh-core 2.4s ease-in-out infinite}',
    '@keyframes pllh-core{0%,100%{transform:scale(.7);opacity:.55}50%{transform:scale(1.1);opacity:1}}',

    /* ---- 丸（3層：配置と登場 > 浮遊 > ボタン） ---- */
    '.pllh-node{position:absolute;width:calc(var(--S)*.4);height:calc(var(--S)*.4);',
    '  left:calc(var(--x)*1%);top:calc(var(--y)*1%);margin:calc(var(--S)*-.2) 0 0 calc(var(--S)*-.2);',
    // 中心からの距離（登場と吸い込みで使う）
    '  --dx:calc((50 - var(--x)) * var(--S) / 100);--dy:calc((50 - var(--y)) * var(--S) / 100)}',
    '#pllh-overlay.enter .pllh-node{animation:pllh-burst .78s cubic-bezier(.2,1.25,.35,1) both}',
    '#pllh-overlay.enter .pllh-node[data-i="1"]{animation-delay:.08s}',
    '#pllh-overlay.enter .pllh-node[data-i="2"]{animation-delay:.16s}',
    '@keyframes pllh-burst{',
    '  0%{transform:translate3d(var(--dx),var(--dy),0) scale(.15);opacity:0}',
    '  35%{opacity:1}',
    '  100%{transform:translate3d(0,0,0) scale(1);opacity:1}}',
    '#pllh-overlay.enter .pllh-net{animation:pllh-fade .5s .45s ease both}',
    '@keyframes pllh-fade{from{opacity:0}to{opacity:1}}',

    '.pllh-float{width:100%;height:100%;animation:pllh-float var(--fd,4.6s) ease-in-out var(--fdl,0s) infinite}',
    '@keyframes pllh-float{0%,100%{transform:translate3d(0,-6px,0)}50%{transform:translate3d(0,7px,0)}}',

    '.pllh-btn{--h:var(--a);position:relative;display:block;width:100%;height:100%;padding:0;margin:0;',
    '  border:none;border-radius:50%;cursor:pointer;color:rgb(var(--h));background:none;outline:none;',
    '  transition:transform .18s cubic-bezier(.3,1.6,.5,1)}',
    '.pllh-node[data-hue="b"] .pllh-btn{--h:var(--b)}',
    '.pllh-node[data-hue="c"] .pllh-btn{--h:var(--c)}',
    // ネオン管の外枠（太い管＋内側の暗いガラス）
    '.pllh-ring{position:absolute;inset:0;border-radius:50%;',
    '  border:clamp(3px,calc(var(--S)*.009),5px) solid rgb(var(--h));',
    '  background:radial-gradient(circle at 50% 42%,rgba(var(--h),.20),rgba(10,10,30,.78) 62%,rgba(6,6,18,.9));',
    '  box-shadow:0 0 0 2px rgba(255,255,255,.07),0 0 14px 2px rgba(var(--h),.55),0 0 38px 6px rgba(var(--h),.22),',
    '    inset 0 0 18px 2px rgba(var(--h),.45),inset 0 0 2px 1px rgba(255,255,255,.35)}',
    // 走査線（ホログラムの質感）
    '.pllh-scan{position:absolute;inset:6%;border-radius:50%;overflow:hidden;opacity:.5;pointer-events:none}',
    '.pllh-scan::before{content:"";position:absolute;left:0;right:0;top:-100%;height:200%;',
    '  background:repeating-linear-gradient(rgba(var(--h),.0) 0 3px,rgba(var(--h),.16) 3px 4px);',
    '  animation:pllh-scan 3.6s linear infinite}',
    '@keyframes pllh-scan{from{transform:translate3d(0,0,0)}to{transform:translate3d(0,50%,0)}}',
    // ゆっくり回る外側の破線リング
    '.pllh-orbit{position:absolute;inset:-8%;border-radius:50%;pointer-events:none;',
    '  border:1.5px dashed rgba(var(--h),.45);animation:pllh-spin 18s linear infinite}',
    '.pllh-orbit::after{content:"";position:absolute;top:-4px;left:50%;width:7px;height:7px;margin-left:-3.5px;',
    '  border-radius:50%;background:#fff;box-shadow:0 0 8px 3px rgba(var(--h),.9)}',
    '.pllh-node[data-i="1"] .pllh-orbit{animation-duration:22s;animation-direction:reverse}',
    '.pllh-node[data-i="2"] .pllh-orbit{animation-duration:26s}',
    '@keyframes pllh-spin{to{transform:rotate(360deg)}}',
    // 押した瞬間に広がる光の輪
    '.pllh-pulse{position:absolute;inset:0;border-radius:50%;pointer-events:none;opacity:0;',
    '  border:3px solid rgb(var(--h));box-shadow:0 0 22px rgba(var(--h),.9)}',

    // アイコン
    '.pllh-ico{position:absolute;inset:22%;display:grid;place-items:center;pointer-events:none;',
    '  filter:drop-shadow(0 0 4px rgba(var(--h),.95)) drop-shadow(0 0 12px rgba(var(--h),.55));',
    '  transition:transform .18s cubic-bezier(.3,1.6,.5,1)}',
    '.pllh-ico svg{width:100%;height:100%;overflow:visible}',
    '.pllh-node[data-hue="c"] .pllh-ico{inset:19%}',
    '.pllh-ico svg *{vector-effect:non-scaling-stroke}',
    // キューブ
    '.pllh-ico .f1{fill:rgba(var(--h),.42)}.pllh-ico .f2{fill:rgba(var(--h),.20)}.pllh-ico .f3{fill:rgba(var(--h),.10)}',
    '.pllh-ico .ln{fill:none;stroke:#eaffff;stroke-width:2.2;stroke-linejoin:round;stroke-linecap:round}',
    // 稲妻
    '.pllh-ico .core{fill:rgba(var(--h),.35);stroke:#fbefff;stroke-width:2.6;stroke-linejoin:round}',
    '.pllh-ico .hd{fill:none;stroke:#fbefff;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}',
    '.pllh-ico .spd{fill:none;stroke:rgb(var(--h));stroke-width:2.6;stroke-linecap:round;opacity:.95}',
    // 目
    '.pllh-ico .lid{fill:rgba(var(--h),.14);stroke:#eef2ff;stroke-width:2.4;stroke-linejoin:round}',
    '.pllh-ico .iris{fill:rgba(6,8,28,.85);stroke:rgb(var(--h));stroke-width:2.2}',
    '.pllh-ico .pix rect{fill:rgba(var(--h),.75)}',
    '.pllh-ico .pix .mid{fill:#fff}',
    '.pllh-ico .brk{fill:none;stroke:rgb(var(--h));stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;opacity:.9}',

    // 触れた瞬間：強く光って少し大きく
    '.pllh-btn:active,.pllh-btn.press{transform:scale(1.08)}',
    '.pllh-btn:active .pllh-ring,.pllh-btn.press .pllh-ring,.pllh-btn:focus-visible .pllh-ring{',
    '  box-shadow:0 0 0 2px rgba(255,255,255,.18),0 0 22px 6px rgba(var(--h),.9),0 0 64px 16px rgba(var(--h),.45),',
    '    inset 0 0 30px 6px rgba(var(--h),.7),inset 0 0 3px 1px rgba(255,255,255,.6)}',
    '.pllh-btn:active .pllh-ico,.pllh-btn.press .pllh-ico{transform:scale(1.06)}',
    '@media (hover:hover){.pllh-btn:hover{transform:scale(1.05)}',
    '  .pllh-btn:hover .pllh-ring{box-shadow:0 0 0 2px rgba(255,255,255,.14),0 0 20px 5px rgba(var(--h),.8),',
    '    0 0 52px 12px rgba(var(--h),.38),inset 0 0 26px 4px rgba(var(--h),.6),inset 0 0 3px 1px rgba(255,255,255,.5)}}',

    /* ---- 選んだ丸：ためて → 中央へ → 閃光 → モードへ ----------------
       0.00s  触れた丸が少し縮み、光の輪が3回、外から内へ集まってくる（ため）
       0.30s  ほかの2つと線が静かに消え、背景が暗くなる
       0.31s  丸が白熱しながら中央へ滑り、大きくなる
       0.92s  中央に着いたところで衝撃波が2重に広がる
       1.00s  中心から光が満ちて画面を包む
       1.30s  モードを開く（光の中からふわっと現れる） */
    '#pllh-overlay.going .pllh-btn{pointer-events:none}',
    '#pllh-overlay.going .pllh-close{opacity:0;pointer-events:none;transition:opacity .4s}',
    '#pllh-overlay.going .pllh-node:not(.chosen){transition:transform .7s cubic-bezier(.4,0,.2,1) .12s,opacity .55s ease .12s;transform:scale(.6);opacity:0}',
    '#pllh-overlay.going .pllh-net,#pllh-overlay.going .pllh-core{transition:opacity .45s .1s;opacity:0}',
    '.pllh-dim{position:absolute;inset:0;pointer-events:none;background:#020208;opacity:0;transition:opacity .25s}',
    '#pllh-overlay.going .pllh-dim{opacity:.62;transition:opacity .8s ease .15s}',

    '.pllh-node.chosen{z-index:2;animation:pllh-suck 1.12s forwards!important}',
    '.pllh-node.chosen .pllh-float{animation:none}',
    '@keyframes pllh-suck{',
    '  0%{transform:translate3d(0,0,0) scale(1);animation-timing-function:cubic-bezier(.3,0,.3,1)}',
    '  27%{transform:translate3d(0,0,0) scale(.86);animation-timing-function:cubic-bezier(.6,0,.15,1)}',
    '  82%{transform:translate3d(var(--dx),var(--dy),0) scale(1.42);animation-timing-function:ease-in-out}',
    '  100%{transform:translate3d(var(--dx),var(--dy),0) scale(1.34)}}',
    // ネオン管が白熱していく
    '.pllh-node.chosen .pllh-ring{animation:pllh-charge 1.12s ease-in forwards}',
    '@keyframes pllh-charge{',
    '  0%{border-color:rgb(var(--h));box-shadow:0 0 0 2px rgba(255,255,255,.18),0 0 22px 6px rgba(var(--h),.9),0 0 64px 16px rgba(var(--h),.45),',
    '    inset 0 0 30px 6px rgba(var(--h),.7),inset 0 0 3px 1px rgba(255,255,255,.6)}',
    '  100%{border-color:#f4fbff;box-shadow:0 0 0 3px rgba(255,255,255,.55),0 0 34px 12px rgba(var(--h),1),0 0 110px 40px rgba(var(--h),.6),',
    '    inset 0 0 46px 14px rgba(var(--h),.95),inset 0 0 8px 3px #fff}}',
    '.pllh-node.chosen .pllh-ico{animation:pllh-icohot 1.12s forwards}',
    '@keyframes pllh-icohot{0%{transform:scale(1)}27%{transform:scale(.9)}82%{transform:scale(1.12)}100%{transform:scale(1.08)}}',
    '.pllh-node.chosen .pllh-orbit{opacity:0;transition:opacity .35s}',
    // 外から内へ集まる光の輪（3回）
    '.pllh-node.chosen .pllh-pulse{animation:pllh-gather .3s ease-in 3 both}',
    '@keyframes pllh-gather{from{transform:scale(1.85);opacity:0}60%{opacity:.85}to{transform:scale(1);opacity:0}}',
    // 中央に着いた瞬間の衝撃波（2重）
    '.pllh-wave{position:absolute;left:50%;top:50%;width:calc(var(--S)*.4);height:calc(var(--S)*.4);',
    '  margin:calc(var(--S)*-.2) 0 0 calc(var(--S)*-.2);border-radius:50%;pointer-events:none;opacity:0;',
    '  border:2px solid rgba(255,255,255,.9);box-shadow:0 0 24px 4px rgba(var(--fh,var(--a)),.9),inset 0 0 24px 4px rgba(var(--fh,var(--a)),.6)}',
    '.pllh-wave.w2{border-width:1px}',
    '#pllh-overlay.going .pllh-wave{animation:pllh-wave .8s .9s cubic-bezier(.15,.6,.3,1) both}',
    '#pllh-overlay.going .pllh-wave.w2{animation-delay:1.02s}',
    '@keyframes pllh-wave{0%{transform:scale(.8);opacity:0}15%{opacity:1}100%{transform:scale(4.2);opacity:0}}',
    // 中心から光が満ちる
    '.pllh-flash{position:absolute;left:50%;top:50%;width:20px;height:20px;margin:-10px;border-radius:50%;',
    '  pointer-events:none;opacity:0;',
    '  background:radial-gradient(circle,#fff 0,#fff 7%,rgba(var(--fh,var(--a)),.95) 24%,rgba(var(--fh,var(--a)),.8) 50%,rgba(var(--fh,var(--a)),0) 70%)}',
    '#pllh-overlay.going .pllh-flash{animation:pllh-bang .4s .92s cubic-bezier(.45,0,.55,1) both}',
    '@keyframes pllh-bang{0%{transform:scale(1);opacity:0}20%{opacity:1}100%{transform:scale(150);opacity:.92}}',
    // 開いたモードは光の中からふわっと現れる（pll-hub.js が一瞬だけ付けるクラス）
    '#pllt-overlay.pllh-arrive,#plf-overlay.pllh-arrive{animation:pllh-arrive .65s cubic-bezier(.2,.7,.2,1) both}',
    '@keyframes pllh-arrive{from{opacity:0;transform:scale(1.05)}to{opacity:1;transform:none}}',

    /* ---- 横長の画面（タブレット横・PC）：少し小さめに ---- */
    '@media (min-aspect-ratio:1/1){.pllh-stage{--S:min(86vh,calc(100vh - 90px),600px);transform:translate(-50%,-50%)}}',

    /* ---- 動きを減らす設定 ---- */
    '@media (prefers-reduced-motion:reduce){',
    '  .pllh-stars,.pllh-lines,.pllh-float,.pllh-orbit,.pllh-scan::before,.pllh-core,.pllh-net line{animation:none!important}',
    '  #pllh-overlay.enter .pllh-node{animation:pllh-fade .2s both}',
    '  .pllh-node.chosen{animation:pllh-fade .2s reverse forwards!important}',
    '  .pllh-node.chosen *{animation:none!important}',
    '  #pllh-overlay.going .pllh-flash,#pllh-overlay.going .pllh-wave{animation:none}',
    '  #pllt-overlay.pllh-arrive,#plf-overlay.pllh-arrive{animation:pllh-fade .2s both}}'
  ].join('\n');

  function injectCSS() {
    if (document.getElementById('pll-hub-style')) return;
    const st = document.createElement('style');
    st.id = 'pll-hub-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* -------------------------------------------------------------- 組立 -- */
  let root = null;
  let busy = false;      // 吸い込み演出中は二度押しさせない
  let goTimer = 0;
  const LAUNCH_MS = 1300;   // 押してからモードを開くまで（ための演出の長さ）

  function build() {
    if (root && root.dataset.built) return true;
    if (!document.body) return false;
    injectCSS();
    // index.html に空の <div id="pllh-overlay"> を置いてある（ゲーム側の
    // 「全画面オーバーレイの一覧」が起動時にこの要素を見つけられるように）。
    root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = ROOT_ID;
      document.body.appendChild(root);
    }
    root.hidden = false;      // 空のあいだ付けてある hidden を外す（表示は CSS の .show で切り替え）
    root.dataset.built = '1';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');

    let nodes = '';
    let lines = '';
    NODES.forEach(function (n, i) {
      nodes +=
        '<div class="pllh-node" data-i="' + i + '" data-hue="' + n.hue + '" ' +
          'style="--x:' + n.x + ';--y:' + n.y + ';--fd:' + (4.2 + i * 0.7) + 's;--fdl:' + (-i * 1.3) + 's">' +
          '<div class="pllh-float">' +
            '<button type="button" class="pllh-btn" data-mode="' + n.id + '">' +
              '<span class="pllh-orbit" aria-hidden="true"></span>' +
              '<span class="pllh-ring" aria-hidden="true"></span>' +
              '<span class="pllh-scan" aria-hidden="true"></span>' +
              '<span class="pllh-ico">' + ICONS[n.icon] + '</span>' +
              '<span class="pllh-pulse" aria-hidden="true"></span>' +
            '</button>' +
          '</div>' +
        '</div>';
      const m = NODES[(i + 1) % NODES.length];
      lines += '<line x1="' + n.x + '" y1="' + n.y + '" x2="' + m.x + '" y2="' + m.y + '"/>';
    });

    root.innerHTML =
      '<div class="pllh-bg" aria-hidden="true"></div>' +
      '<div class="pllh-stars" aria-hidden="true"></div>' +
      '<div class="pllh-horizon" aria-hidden="true"></div>' +
      '<div class="pllh-floor" aria-hidden="true"><div class="pllh-plane"><div class="pllh-lines"></div></div></div>' +
      '<div class="pllh-dim" aria-hidden="true"></div>' +
      '<button type="button" class="pllh-close" id="pllh-close">' +
        '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5 15 15M15 5 5 15"/></svg>' +
      '</button>' +
      '<div class="pllh-stage">' +
        '<svg class="pllh-net" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' + lines + '</svg>' +
        '<span class="pllh-core" aria-hidden="true"></span>' +
        nodes +
        '<span class="pllh-wave" aria-hidden="true"></span>' +
        '<span class="pllh-wave w2" aria-hidden="true"></span>' +
        '<span class="pllh-flash" aria-hidden="true"></span>' +
      '</div>';

    document.getElementById('pllh-close').addEventListener('click', close);
    root.querySelectorAll('.pllh-btn').forEach(function (b) {
      // iOS の :active は離すまで出ないことがあるので、指が触れた瞬間に自前で光らせる
      b.addEventListener('pointerdown', function () { b.classList.add('press'); });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
        b.addEventListener(ev, function () { b.classList.remove('press'); });
      });
      b.addEventListener('click', function () { choose(b); });
    });
    paintLabels();
    if (typeof global.onI18n === 'function') global.onI18n(paintLabels);
    watchModes();
    return true;
  }

  function paintLabels() {
    if (!root) return;
    root.setAttribute('aria-label', tx('menuTraining', 'Training'));
    const c = document.getElementById('pllh-close');
    if (c) c.setAttribute('aria-label', tx('close', '✕'));
    NODES.forEach(function (n) {
      const b = root.querySelector('.pllh-btn[data-mode="' + n.id + '"]');
      if (!b) return;
      const s = tx(n.label, n.id);
      b.setAttribute('aria-label', s);
      b.title = s;
    });
  }

  /* ------------------------------------------------- モードとの行き来 -- */
  function modeEls() {
    return [document.getElementById('pllt-overlay'), document.getElementById('plf-overlay')];
  }
  function modeOpen() {
    return modeEls().some(function (el) { return el && el.classList.contains('show'); });
  }
  function replayEnter() {
    if (!root) return;
    root.classList.remove('enter');
    void root.offsetWidth;          // 付け直しでアニメを最初から
    root.classList.add('enter');
  }
  // モードが開いた/閉じたら、ハブを隠す/戻す
  function syncCovered() {
    if (!root || !root.classList.contains('show')) return;
    // 演出の途中（モードが光の中から現れている最中）は choose() に任せる。
    // ここで先に隠すと、フェードしてくるモードの後ろにゲーム画面が透けてしまう。
    if (busy) return;
    const covered = modeOpen();
    if (covered === root.classList.contains('covered')) return;
    root.classList.toggle('covered', covered);
    if (!covered) {
      // モードから戻ってきた：もう一度広がって登場
      resetGoing();
      replayEnter();
    }
  }
  let watching = false;
  function watchModes() {
    if (watching || !global.MutationObserver) return;
    watching = true;
    const mo = new MutationObserver(function () { setTimeout(syncCovered, 0); });
    modeEls().forEach(function (el) {
      if (el) mo.observe(el, { attributes: true, attributeFilter: ['class'] });
    });
    // フラッシュのオーバーレイは後から作られることがあるので、無ければ待つ
    if (!document.getElementById('plf-overlay')) {
      const bodyMo = new MutationObserver(function () {
        const f = document.getElementById('plf-overlay');
        if (f) { bodyMo.disconnect(); mo.observe(f, { attributes: true, attributeFilter: ['class'] }); }
      });
      bodyMo.observe(document.body, { childList: true });
    }
  }

  function resetGoing() {
    if (!root) return;
    clearTimeout(goTimer); goTimer = 0;
    busy = false;
    root.classList.remove('going');
    root.querySelectorAll('.pllh-node.chosen').forEach(function (n) { n.classList.remove('chosen'); });
    modeEls().forEach(function (el) { if (el) el.classList.remove('pllh-arrive'); });
  }

  function launch(mode) {
    try {
      if (mode === 'pllt' && global.PllTrainer) global.PllTrainer.open();
      else if (mode === 'plf' && global.PllFlash) global.PllFlash.open();
      else if (mode === 'plv' && global.PllFlash) global.PllFlash.openVision();
    } catch (e) {}
  }

  function choose(btn) {
    if (busy || !root) return;
    const mode = btn.dataset.mode;
    const node = btn.closest('.pllh-node');
    busy = true;
    root.classList.remove('enter');
    const hue = { a: '--a', b: '--b', c: '--c' }[node.dataset.hue] || '--a';
    root.style.setProperty('--fh', 'var(' + hue + ')');
    node.classList.add('chosen');
    root.classList.add('going');
    buzz(8);
    goTimer = setTimeout(function () {
      goTimer = 0;
      launch(mode);
      const el = openedEl();
      if (el) {
        buzz(18);
        el.classList.remove('pllh-arrive');
        void el.offsetWidth;
        el.classList.add('pllh-arrive');
        // モードが現れきってから、下のハブを隠して元の並びに戻す
        goTimer = setTimeout(function () {
          goTimer = 0;
          el.classList.remove('pllh-arrive');
          resetGoing();
          syncCovered();
        }, reduceMotion ? 220 : 700);
      } else {
        // 開けなかった（3D の準備前など）：その場で元に戻す
        resetGoing();
        replayEnter();
      }
    }, reduceMotion ? 150 : LAUNCH_MS);
  }
  function openedEl() {
    const els = modeEls();
    for (let i = 0; i < els.length; i++) if (els[i] && els[i].classList.contains('show')) return els[i];
    return null;
  }
  // 対応している端末（Android など）でだけ、ごく短く震える。iPhone では何も起きない。
  function buzz(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
  }

  /* ---------------------------------------------------- 開く / 閉じる -- */
  function open() {
    if (!build()) return false;
    resetGoing();
    root.classList.remove('covered');
    root.classList.add('show');
    void root.offsetWidth;
    root.classList.add('in');
    replayEnter();
    return true;
  }
  function close() {
    if (!root) return;
    resetGoing();
    root.classList.remove('in', 'enter');
    setTimeout(function () {
      if (!root.classList.contains('in')) root.classList.remove('show', 'covered');
    }, reduceMotion ? 0 : 220);
  }

  // Esc：モードが開いていればモード側に任せる（モード側が先に閉じても
  // ハブまで一緒に閉じないよう、捕捉フェーズで先に判定しておく）。
  global.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !root || !root.classList.contains('show')) return;
    if (modeOpen()) return;
    if (document.querySelector('#confirm-overlay.show')) return;
    close();
  }, true);

  global.PllHub = {
    open: open,
    close: close,
    isOpen: function () { return !!(root && root.classList.contains('show')); }
  };
})(window);
