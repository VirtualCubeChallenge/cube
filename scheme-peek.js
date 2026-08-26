/* ============================================================
   scheme-peek.js — ショップ「キューブカラー」の ? プレビュー
   ------------------------------------------------------------
   何をするか:
     各カードの右上に ? を足し、押すとその配色のキューブが
     ゆっくり回る画面が開く。買う前に「どんな色か」を確かめられる。
     そのまま「これにする／引き換える」まで進める。

   なぜカードとは別に必要か:
     カードの色見本は6色を斜めに並べた帯なので、面ごとの色は
     分かっても「実際にキューブとして並んだときの見え方」と
     「背景の明るさ」が分からない。とくにパステル(黒地)と
     モノクローム(明るい地)は、帯だけでは印象がまるで違う。

   作りの方針:
     - 品揃えは Shop.SCHEMES をその場で読む。配色を足しても
       このファイルは触らなくていい。
     - ? を押したときはカード本体のタップ処理を走らせない
       （capture 段階で止める。photo-skin.js の ✎ と同じ手口）。
     - 「これにする／引き換える」は、元のカードを click() するだけ。
       購入・所持・確認ダイアログの流れは Shop 側をそのまま使う。

   導入: index.html に <script src="scheme-peek.js?v=..."> を1行。
         読み込み順はどこでもよい（Shop は押された時に読む）。
   ============================================================ */
(function (global) {
  'use strict';

  const GRID_ID    = 'shop-scheme-grid';
  // ? を出さない配色。標準は「元の色」そのものなので、
  // わざわざ見え方を確かめる相手ではない。
  const NO_PEEK    = ['default'];
  const OVERLAY_ID = 'scheme-peek-overlay';
  const FACES      = ['U', 'D', 'F', 'B', 'R', 'L'];
  const SWATCH_ORDER = ['U', 'D', 'L', 'R', 'F', 'B'];
  const CUBE_PX    = 96;   // 見本の立方体の一辺(px)

  /* --- 「動きを減らす」設定なら回転を止める（ui-polish.js と同じ考え方） --- */
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
     文言（i18n.js から引く。訳が無ければ日本語に落ちる）
     ============================================================ */
  function T(key) {
    let lang = 'ja';
    try { lang = localStorage.getItem('rubiks-cube-lang') || 'ja'; } catch (e) { /* 既定のまま */ }
    if (typeof I18N === 'undefined' || !I18N) return '';
    const dict = I18N[lang] || {};
    if (dict[key] !== undefined) return dict[key];
    const ja = I18N.ja || {};
    return ja[key] !== undefined ? ja[key] : '';
  }

  function schemeLabel(scheme) {
    const key = 'shopScheme' + scheme.id.charAt(0).toUpperCase() + scheme.id.slice(1);
    return T(key) || scheme.id;
  }

  function hex(n) { return '#' + (n >>> 0).toString(16).padStart(6, '0'); }
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  /* ============================================================
     CSS
     動かすのは transform と opacity だけ。オーバーレイの出入りは
     ui-polish.js の一覧に入っていない id なので、ここで面倒を見る。
     ============================================================ */
  const CSS = [
    /* ---- カードの右上に置く ? ----
       黒い半透明の丸だと、下に来る色見本しだいで沈んで見えるうえ
       「押せるもの」に見えなかった。アクセントカラーで塗って、
       プレビューの「引き換える」ボタンと同じ色の言葉に揃える。 */
    '.shop-scheme-peek{position:absolute;top:5px;right:5px;width:32px;height:32px;',
    '  display:flex;align-items:center;justify-content:center;border-radius:50%;',
    '  background:var(--tc,#00ffcc);color:#101014;font-size:18px;font-weight:800;',
    '  line-height:1;border:none;padding:0;font-family:inherit;cursor:pointer;z-index:2;',
    '  box-shadow:0 1px 5px rgba(0,0,0,.5);',
    '  transition:transform .1s ease-out,filter .1s ease-out}',
    /* 指の当たり判定だけ 48px に広げる（見た目は 32px のまま）。
       カードの角は他に何も置いていないので、少しはみ出しても困らない。 */
    '.shop-scheme-peek::after{content:"";position:absolute;inset:-8px;border-radius:50%}',
    '.shop-scheme-peek:active{transform:scale(.88);filter:brightness(1.12)}',

    /* ---- オーバーレイ ---- */
    '#' + OVERLAY_ID + '{position:fixed;inset:0;z-index:2400;display:none;',
    '  align-items:center;justify-content:center;padding:20px;',
    '  background:rgba(0,0,0,.62);opacity:0;transition:opacity .2s ease}',
    '#' + OVERLAY_ID + '.show{display:flex;opacity:1}',

    '.spk-panel{width:min(92vw,340px);max-height:88vh;overflow-y:auto;',
    '  background:#1c1c22;border:1.4px solid #3a3a48;border-radius:16px;',
    '  padding:18px 16px 16px;color:#e8e8ee;text-align:center;',
    '  animation:spkRise .26s cubic-bezier(.2,.9,.3,1) both}',
    '@keyframes spkRise{from{opacity:0;transform:translateY(10px) scale(.99)}',
    '  to{opacity:1;transform:none}}',

    '.spk-name{font-size:17px;font-weight:700;margin:0 0 3px}',
    '.spk-lead{font-size:12px;color:#9a9aa8;line-height:1.6;margin:0 0 14px}',

    /* ---- キューブの見本。背景はその配色の scene.background と同じ色 ---- */
    '.spk-stage{border-radius:12px;padding:10px 0;margin-bottom:14px;',
    '  display:grid;place-items:center;overflow:hidden}',
    /* 回すと角がいちばん外へ張り出す。箱(200px)は、立方体の対角
       (96px × √3 ≒ 166px)に遠近の拡大ぶんを足しても収まる大きさ。
       ここが足りないと、実機で見たとおり上下が切れる。 */
    '.spk-scene{width:200px;height:200px;perspective:780px;position:relative}',
    '.spk-cube{width:' + CUBE_PX + 'px;height:' + CUBE_PX + 'px;position:absolute;',
    '  left:50%;top:50%;margin:-' + (CUBE_PX / 2) + 'px 0 0 -' + (CUBE_PX / 2) + 'px;',
    '  transform-style:preserve-3d;',
    '  transform:rotateX(-24deg);animation:spkSpin 16s linear infinite}',
    '@keyframes spkSpin{from{transform:rotateX(-24deg) rotateY(0deg)}',
    '  to{transform:rotateX(-24deg) rotateY(360deg)}}',
    /* 角丸と余白は付けない。実機の3Dはマスが面のふちまで届いていて、
       外周に黒い枠は出ない — 見本もそれに合わせる（マスとマスの
       あいだの線だけが残る）。 */
    '.spk-face{position:absolute;inset:0;display:grid;',
    '  grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr)}',
    '.spk-face i{display:block}',

    /* ---- 6面の色見本（回転していて見えない面も確かめられるように） ---- */
    '.spk-swatches{display:flex;justify-content:center;gap:6px;margin-bottom:16px}',
    '.spk-swatches b{width:34px;height:34px;border-radius:10px;display:grid;',
    '  place-items:center;font-size:13px;font-weight:800}',

    /* ---- ボタン ---- */
    '.spk-actions{display:flex;flex-direction:column;gap:8px}',
    '.spk-btn{width:100%;padding:12px;border-radius:12px;border:none;',
    '  font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;',
    '  transition:transform .1s ease-out,filter .1s ease-out}',
    '.spk-btn:active{transform:scale(.97);filter:brightness(1.1)}',
    '.spk-btn.go{background:var(--tc,#00ffcc);color:#101014}',
    '.spk-btn.close{background:#2b2b34;color:#c8c8d2}',

    '@media (prefers-reduced-motion: reduce){',
    '  .spk-cube{animation:none;transform:rotateX(-24deg) rotateY(-32deg)}',
    '  .spk-panel{animation:none}',
    '  #' + OVERLAY_ID + '{transition-duration:.01ms}',
    '}'
  ].join('');

  function injectCSS() {
    if (document.getElementById('scheme-peek-style')) return;
    const st = document.createElement('style');
    st.id = 'scheme-peek-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ============================================================
     画面をつくる（初回に1回だけ）
     ============================================================ */
  let el = null;
  let sourceCard = null;   // ? を押したときのカード。「これにする」で click() する

  function buildOverlay() {
    if (el) return el;

    const ov = document.createElement('div');
    ov.id = OVERLAY_ID;
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');

    ov.innerHTML =
      '<div class="spk-panel">' +
        '<p class="spk-name"></p>' +
        '<p class="spk-lead"></p>' +
        '<div class="spk-stage"><div class="spk-scene"><div class="spk-cube"></div></div></div>' +
        '<div class="spk-swatches"></div>' +
        '<div class="spk-actions">' +
          '<button type="button" class="spk-btn go"></button>' +
          '<button type="button" class="spk-btn close"></button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(ov);

    el = {
      overlay:  ov,
      panel:    ov.querySelector('.spk-panel'),
      name:     ov.querySelector('.spk-name'),
      lead:     ov.querySelector('.spk-lead'),
      stage:    ov.querySelector('.spk-stage'),
      cube:     ov.querySelector('.spk-cube'),
      swatches: ov.querySelector('.spk-swatches'),
      go:       ov.querySelector('.spk-btn.go'),
      close:    ov.querySelector('.spk-btn.close'),
      cells:    {}
    };

    // 6面ぶんの箱は1回だけ組み、以後は色を差し替えるだけにする。
    const z = CUBE_PX / 2;
    const TF = {
      U: 'rotateX(90deg) translateZ('  + z + 'px)', D: 'rotateX(-90deg) translateZ(' + z + 'px)',
      F: 'translateZ('                 + z + 'px)', B: 'rotateY(180deg) translateZ(' + z + 'px)',
      R: 'rotateY(90deg) translateZ('  + z + 'px)', L: 'rotateY(-90deg) translateZ(' + z + 'px)'
    };
    FACES.forEach((f) => {
      const face = document.createElement('div');
      face.className = 'spk-face';
      face.style.transform = TF[f];
      const cells = [];
      for (let i = 0; i < 9; i++) {
        const c = document.createElement('i');
        face.appendChild(c);
        cells.push(c);
      }
      el.cube.appendChild(face);
      el.cells[f] = cells;
    });

    // 背景を押しても閉じる（パネルの中は閉じない）
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    el.close.addEventListener('click', close);
    el.go.addEventListener('click', () => {
      const card = sourceCard;
      close();
      // カードのタップ処理（所持なら付け替え、未所持なら確認 → 引き換え）へ。
      if (card && document.body.contains(card)) card.click();
    });

    return el;
  }

  /* ============================================================
     開く / 閉じる
     ============================================================ */
  function open(scheme, card) {
    injectCSS();
    buildOverlay();
    sourceCard = card || null;

    const colors  = scheme.colors || {};
    const inner   = colors.I !== undefined ? colors.I : 0x18181c;
    // gapSize は「マスの一辺」、マスの間隔は 1.0。すき間はマスに対して
    // (1 - gapSize) / gapSize の比になるので、その比のまま px に直す。
    // 外周には余白を置かない（実機の3Dにも黒い縁は無い）。
    const g       = scheme.gapSize || 0.94;
    const gap     = Math.max((1 - g) / g * (CUBE_PX / 3), 0.4);

    el.name.textContent = schemeLabel(scheme);
    el.lead.textContent = T('shopSchemePeekLead');

    el.stage.style.background = hex(scheme.bg !== undefined ? scheme.bg : 0x121214);
    FACES.forEach((f) => {
      const face = el.cells[f][0].parentNode;
      face.style.background = hex(inner);
      face.style.gap = gap + 'px';
      const c = hex(colors[f]);
      el.cells[f].forEach((cell) => { cell.style.background = c; });
    });

    // 面の色見本。文字色は faceColors（回転記号ボタンと同じ配色）に合わせる。
    el.swatches.innerHTML = SWATCH_ORDER.map((f) => {
      const fc = (scheme.faceColors && scheme.faceColors[f]) || null;
      const bg = fc ? fc.bg : hex(colors[f]);
      const tx = fc ? fc.text : '#141416';
      return '<b style="background:' + bg + ';color:' + tx + '">' + f + '</b>';
    }).join('');

    // ボタンの文言は、いま持っているかどうかで変える。
    let owned = [], equipped = null;
    try {
      if (global.Shop) {
        if (typeof Shop.getOwnedSchemes === 'function')   owned = Shop.getOwnedSchemes();
        if (typeof Shop.getEquippedScheme === 'function') equipped = Shop.getEquippedScheme();
      }
    } catch (err) { /* 取れなければ「引き換える」の側に倒す */ }

    const has = owned.indexOf(scheme.id) !== -1;
    const on  = scheme.id === equipped;

    if (on) {
      // すでに使っている配色。押す先がないのでボタンは隠す。
      el.go.style.display = 'none';
    } else {
      el.go.style.display = '';
      el.go.textContent = has
        ? T('shopSchemeEquip')
        : T('shopRedeem') + '（' + fmt(scheme.cost) + '）';
    }
    el.close.textContent = T('shopSchemePeekClose');

    el.overlay.classList.add('show');
  }

  function close() {
    if (!el) return;
    el.overlay.classList.remove('show');
    sourceCard = null;
  }

  /* ============================================================
     カードに ? を足す
     render() のたびにカードは作り直されるので、grid の中身が
     入れ替わったら足し直す。
     ============================================================ */
  function decorate(grid) {
    const cards = grid.querySelectorAll('.shop-card');
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      if (NO_PEEK.indexOf(card.dataset.id) !== -1) continue;
      if (card.querySelector('.shop-scheme-peek')) continue;
      const b = document.createElement('span');
      b.className = 'shop-scheme-peek';
      b.setAttribute('role', 'button');
      b.setAttribute('aria-label', T('shopSchemePeek'));
      b.textContent = '?';
      card.appendChild(b);
    }
  }

  function schemeById(id) {
    try {
      const list = (global.Shop && Shop.SCHEMES) || [];
      for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    } catch (err) { /* 取れなければ何もしない */ }
    return null;
  }

  function start() {
    injectCSS();

    const grid = document.getElementById(GRID_ID);
    if (!grid) return;

    decorate(grid);

    // 買った直後・言語切替・タブ移動でカードが作り直されたら足し直す。
    try {
      const mo = new MutationObserver(() => decorate(grid));
      mo.observe(grid, { childList: true });
    } catch (err) {
      // MutationObserver が無い環境では、店を開いたときに追いつかせる。
      document.addEventListener('click', () => setTimeout(() => decorate(grid), 0), true);
    }

    // ? を押したときは、カード本体のタップ処理を走らせない。
    // capture 段階なので、grid 側の click より先に止められる。
    grid.addEventListener('click', (e) => {
      const hit = e.target.closest ? e.target.closest('.shop-scheme-peek') : null;
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      const card = hit.closest('.shop-card');
      if (!card) return;
      const scheme = schemeById(card.dataset.id);
      if (scheme) open(scheme, card);
    }, true);

    // 言語切替のときも Shop.render() でカードが作り直されるので、
    // ? のラベルは上の MutationObserver がそのまま追いつく。
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  global.SchemePeek = { open: open, close: close };
})(window);
