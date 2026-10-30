/* =====================================================================
   halloween.js — ハロウィン限定の品揃えと、かぼちゃスキンの完成演出
   ---------------------------------------------------------------------
   このファイル1枚で、ショップに次の5品を足す（読み込みをやめれば全部消える）。
     ・メインカラー「ハロウィン」 … オレンジと赤のあいだを、ジャック・オ・ランタンの
                                  炎のようにゆっくり行き来する（index.html の blend）
     ・キューブカラー「ハロウィン」… 骨の白／キャンディコーンの黄／血の赤／かぼちゃの橙／
                                  スライムの緑／魔女の紫。赤と橙は色相を32°離してある
     ・キューブスキン「ハロウィン」（300。札の絵はオレンジの「？」）
       スイカと同じ「そろえた瞬間の演出」型（写真は貼らない）。そろえるたびに、次の3つの
       どれかが出る（3回で3つとも1回ずつ出る順番を、毎回シャッフルして決める）。
         ポップ   … キューブが割れて、小さな可愛いかぼちゃたちがふわふわ浮かぶ
         キリッと … カーテンが一瞬閉じて、開くとキリッとした顔のかぼちゃが立っている
         おどかし … 暗転。キューブが本物のようなかぼちゃの頭になり、首と、あばらの浮いた
                    やせた体と、長い腕が、コマ送りのようなぎこちない動きで生えてきて、
                    叫び声とともに画面いっぱいに飛びかかってくる（絵は SVG のフィルタで
                    質感と光を付け、最初に1回だけ canvas に焼いて使い回す）
       ジャックポット（虹シャード100万）が当たった回は、3つともかぼちゃが虹色に化ける。

   ---------------------------------------------------------------------
   読み込み順（index.html の head）
     i18n.js → cube-schemes.js → このファイル → … → 本体（Shop）
     ・Shop の THEMES / MARKS / SCHEMES より先に、window.SHOP_THEMES_EXTRA /
       SHOP_MARKS_EXTRA / CUBE_SCHEMES_EXTRA を用意しておく必要がある
       （loadState() が「品揃えに無い id」を持ち物から落とすため）。
     ・文言は I18N に無いキーだけ足す（既存のキーは上書きしない）。

   index.html 側の受け口（どれも window.HalloweenFX があるときだけ動く）
     init3D()        … HalloweenFX.init({ scene, camera, cubeGroup, container, cubies })
     checkSolved()   … 着けていれば HalloweenFX.play() を決めスピンの代わりに流す
     hideSolvedMark()… HalloweenFX.stop()（1手でも動かしたら片づけてキューブを戻す）

   ジャックポットの知らせ方
     抽選は完成の約0.6秒後に handleClearReward() の中で行われる（演出より先に
     結果を確定させる作り）。ここではその関数を外から包んで、結果が jackpot の
     ときだけ HalloweenFX.jackpot() を呼ぶ。抽選そのものには一切触らない。

   作りの方針（他のファイルと同じ）
     ・3Dで動かすのは「割れる」キューブ本体だけ（キュービーの位置・向き・大きさを
       覚えておき、片づけるときにそっくり戻す）。かぼちゃは SVG を重ねた DOM。
     ・CSS で動かすのは transform と opacity だけ。点滅は1秒に3回以下。
     ・「動きを減らす」設定では、割れる・飛びかかる・揺れる・光るをやめて、
       最後の姿（かぼちゃ）だけを静かに出す。
     ・音は WebAudio の合成（音声ファイルなし）。AudioContext はアプリ共通の1つ。
   ===================================================================== */
(function (global) {
  'use strict';

  if (global.HalloweenFX) return;   // 二重読み込みよけ

  /* ================================================================ 文言 == */
  const TEXTS = {
    ja: {
      shopColorHalloween: 'ハロウィン', shopSchemeHalloween: 'ハロウィン',
      shopMarkHalloween: 'ハロウィン'
    },
    en: {
      shopColorHalloween: 'Halloween', shopSchemeHalloween: 'Halloween',
      shopMarkHalloween: 'Halloween'
    },
    'zh-CN': {
      shopColorHalloween: '万圣节', shopSchemeHalloween: '万圣节',
      shopMarkHalloween: '万圣节'
    },
    'zh-TW': {
      shopColorHalloween: '萬聖節', shopSchemeHalloween: '萬聖節',
      shopMarkHalloween: '萬聖節'
    },
    ko: {
      shopColorHalloween: '할로윈', shopSchemeHalloween: '할로윈',
      shopMarkHalloween: '할로윈'
    },
    es: {
      shopColorHalloween: 'Halloween', shopSchemeHalloween: 'Halloween',
      shopMarkHalloween: 'Halloween'
    },
    id: {
      shopColorHalloween: 'Halloween', shopSchemeHalloween: 'Halloween',
      shopMarkHalloween: 'Halloween'
    },
    ru: {
      shopColorHalloween: 'Хэллоуин', shopSchemeHalloween: 'Хэллоуин',
      shopMarkHalloween: 'Хэллоуин'
    },
    'pt-BR': {
      shopColorHalloween: 'Halloween', shopSchemeHalloween: 'Halloween',
      shopMarkHalloween: 'Halloween'
    }
  };
  if (typeof I18N !== 'undefined' && I18N) {
    Object.keys(TEXTS).forEach(function (lang) {
      if (!I18N[lang]) I18N[lang] = {};
      Object.keys(TEXTS[lang]).forEach(function (k) {
        if (I18N[lang][k] === undefined) I18N[lang][k] = TEXTS[lang][k];
      });
    });
  }

  /* ======================================================== かぼちゃの絵 == */
  /* viewBox 200×200。5つの房（外側2・中2・真ん中1）を重ね、外周だけ濃い線で縁取る。
     房ごとに「地の色 → 細い境目の線 → 立体の影」の順に塗るので、後ろの房の影や線は
     手前の房に隠れて、境目だけがきれいに残る。地の色は class="hw-lb" で、
     ジャックポットのときは CSS でこれを虹のグラデーションに差し替える。 */
  const LOBES = [
    ['o2', 50, 120, 42, 56], ['o2', 150, 120, 42, 56],
    ['o1', 74, 115, 40, 64], ['o1', 126, 115, 40, 64],
    ['o1', 100, 113, 36, 68]
  ];
  function ell(l, attrs) {
    return '<ellipse cx="' + l[1] + '" cy="' + l[2] + '" rx="' + l[3] + '" ry="' + l[4] + '"' + (attrs || '') + '/>';
  }
  const STEM =
    '<path d="M93 58C91 41 97 27 111 20l9 8c-12 6-14 16-12 30z" fill="url(#hw-g-st)" stroke="#2c3d0e" stroke-width="4" stroke-linejoin="round"/>' +
    '<path d="M111 30c15-8 26 0 20 10-4 6-12 2-8-4" fill="none" stroke="#5f8a24" stroke-width="3.6" stroke-linecap="round"/>';
  const LEAF = '<path d="M113 33c11-14 31-13 36-3-10 11-26 11-36 3z" fill="#7cc443" stroke="#2c3d0e" stroke-width="3" stroke-linejoin="round"/>' +
    '<path d="M118 33c8-3 16-4 25-3" fill="none" stroke="#3f7a1e" stroke-width="2" stroke-linecap="round"/>';
  const BODY = (function () {
    let s = '<g fill="#3d1102" stroke="#3d1102" stroke-width="9" stroke-linejoin="round">';
    LOBES.forEach(function (l) { s += ell(l); });
    s += '</g>';
    LOBES.forEach(function (l) {
      s += ell(l, ' class="hw-lb" fill="url(#hw-g-' + l[0] + ')"');
      s += ell(l, ' fill="none" stroke="#8a2c05" stroke-opacity=".5" stroke-width="2.4"');
      s += ell(l, ' fill="url(#hw-g-sh)"');
    });
    s += '<path d="M79 70c6-12 21-16 29-12-8 4-17 12-23 24-4-2-7-7-6-12z" fill="#fff" opacity=".4"/>';
    s += '<ellipse cx="142" cy="96" rx="5" ry="10" fill="#fff" opacity=".18" transform="rotate(18 142 96)"/>';
    return s;
  })();

  // 魔女の帽子（ポップの子のうち何匹かがかぶる）
  const HAT =
    '<g class="hw-hat">' +
      '<path d="M73 66 99 10c5-9 14-6 12 3l13 53z" fill="url(#hw-g-ht)" stroke="#170833" stroke-width="3.6" stroke-linejoin="round"/>' +
      '<path d="M76 56h48l2 9H74z" fill="#ff9a2e" stroke="#170833" stroke-width="2.4"/>' +
      '<path d="M56 66c14-5 74-5 88 0 9 3 5 11-8 11H64c-13 0-17-8-8-11z" fill="#3b1f7a" stroke="#170833" stroke-width="3.6"/>' +
      '<path d="m100 30 2 5 5 1-4 3 1 5-4-3-4 3 1-5-4-3 5-1z" fill="#ffe27a"/>' +
    '</g>';

  /* ---- 顔（可愛い系） ---- */
  const INK = '#2b1206';
  function cuteEyes() {
    return '<g class="hw-blink">' +
      '<ellipse cx="80" cy="105" rx="10" ry="13" fill="' + INK + '"/><ellipse cx="120" cy="105" rx="10" ry="13" fill="' + INK + '"/>' +
      '<circle cx="84" cy="100" r="4.2" fill="#fff"/><circle cx="124" cy="100" r="4.2" fill="#fff"/>' +
      '<circle cx="77" cy="111" r="1.9" fill="#fff"/><circle cx="117" cy="111" r="1.9" fill="#fff"/></g>';
  }
  const BLUSH = '<ellipse cx="63" cy="125" rx="9" ry="5.5" fill="#ff4f7b" opacity=".5"/><ellipse cx="137" cy="125" rx="9" ry="5.5" fill="#ff4f7b" opacity=".5"/>';
  const FACES = {
    smile: function () {
      return cuteEyes() + BLUSH +
        '<path d="M89 127q5.5 8 11 1 5.5 7 11-1" fill="none" stroke="' + INK + '" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>';
    },
    wink: function () {
      return '<path d="M69 108q11-13 22 0" fill="none" stroke="' + INK + '" stroke-width="5" stroke-linecap="round"/>' +
        '<g class="hw-blink"><ellipse cx="120" cy="105" rx="10" ry="13" fill="' + INK + '"/><circle cx="124" cy="100" r="4.2" fill="#fff"/><circle cx="117" cy="111" r="1.9" fill="#fff"/></g>' +
        BLUSH +
        '<path d="M87 124q13 22 26 0z" fill="' + INK + '" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/>' +
        '<path d="M93 132q7 8 14 0-7 4-14 0z" fill="#ff6f86"/>';
    },
    oh: function () {
      return cuteEyes() + BLUSH +
        '<ellipse cx="100" cy="130" rx="6" ry="7.5" fill="' + INK + '"/><ellipse cx="100" cy="133" rx="3.4" ry="3" fill="#ff6f86"/>';
    },
    sleepy: function () {
      return '<path d="M69 104q11 11 22 0M109 104q11 11 22 0" fill="none" stroke="' + INK + '" stroke-width="4.6" stroke-linecap="round"/>' +
        BLUSH +
        '<path d="M90 126q10 9 20 0" fill="none" stroke="' + INK + '" stroke-width="4.2" stroke-linecap="round"/>';
    },
    /* ---- キリッと系：彫り抜きの目と口から、中のろうそくの灯りがもれる ---- */
    cool: function () {
      const eyes = 'M57 95 97 109l-9 11-23-7zM143 95l-40 14 9 11 23-7z';
      const mouth = 'M66 130l11 6 6-6 8 8 8-7 8 7 8-8 7 5 12-10q-6 26-34 29-27 1-34-24z';
      return '<path d="M56 85l40 12M144 85l-40 12" stroke="#4a1503" stroke-width="5" stroke-linecap="round"/>' +
        '<g fill="#2a0a02"><path d="' + eyes + '"/><path d="' + mouth + '"/></g>' +
        '<g class="hw-glowfx"><path d="' + eyes + '" fill="url(#hw-g-gl)"/><path d="' + mouth + '" fill="url(#hw-g-gl)"/></g>' +
        '<g fill="none" stroke="#5a1a04" stroke-width="2.6" stroke-linejoin="round"><path d="' + eyes + '"/><path d="' + mouth + '"/></g>' +
        '<path d="M74 116l8-3" stroke="#fff8d0" stroke-width="2.4" stroke-linecap="round" opacity=".9"/>';
    }
  };

  /* 共通の塗り（グラデーション）。ページに1回だけ差し込み、全部のかぼちゃで共有する。
     虹のグラデーションだけは SMIL でゆっくり回す（「動きを減らす」設定なら回さない）。 */
  function defsHtml(animate) {
    return '<defs>' +
      '<radialGradient id="hw-g-o1" cx=".38" cy=".3" r=".78"><stop offset="0" stop-color="#ffd27a"/><stop offset=".35" stop-color="#ff9a2e"/><stop offset=".72" stop-color="#f26a12"/><stop offset="1" stop-color="#b8420a"/></radialGradient>' +
      '<radialGradient id="hw-g-o2" cx=".45" cy=".32" r=".8"><stop offset="0" stop-color="#ffb257"/><stop offset=".5" stop-color="#ee7419"/><stop offset="1" stop-color="#a5380a"/></radialGradient>' +
      '<radialGradient id="hw-g-sh" cx=".42" cy=".36" r=".66"><stop offset=".55" stop-color="#3a0a00" stop-opacity="0"/><stop offset="1" stop-color="#3a0a00" stop-opacity=".42"/></radialGradient>' +
      '<linearGradient id="hw-g-rb" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#ff5e7a"/><stop offset=".17" stop-color="#ffb347"/><stop offset=".34" stop-color="#fff35c"/>' +
        '<stop offset=".5" stop-color="#6dff8e"/><stop offset=".67" stop-color="#52d4ff"/><stop offset=".84" stop-color="#9a7bff"/><stop offset="1" stop-color="#ff6bd6"/>' +
        (animate ? '<animateTransform attributeName="gradientTransform" type="rotate" from="0 .5 .5" to="360 .5 .5" dur="3.2s" repeatCount="indefinite"/>' : '') +
      '</linearGradient>' +
      '<linearGradient id="hw-g-st" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9cc246"/><stop offset="1" stop-color="#4e6e1c"/></linearGradient>' +
      '<linearGradient id="hw-g-ht" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8a5ae0"/><stop offset="1" stop-color="#341a70"/></linearGradient>' +
      '<radialGradient id="hw-g-gl" cx=".5" cy=".6" r=".7"><stop offset="0" stop-color="#fffbd2"/><stop offset=".45" stop-color="#ffd23a"/><stop offset="1" stop-color="#ff7a00"/></radialGradient>' +
    '</defs>';
  }

  // かぼちゃ1つぶんの SVG（中身だけ）。
  function pumpkinInner(face, opts) {
    opts = opts || {};
    return STEM + (opts.leaf ? LEAF : '') + BODY + FACES[face]() + (opts.hat ? HAT : '');
  }
  function pumpkinSvg(face, opts) {
    return '<svg viewBox="0 0 200 200" aria-hidden="true" focusable="false">' + pumpkinInner(face, opts) + '</svg>';
  }

  const BAT = '<svg viewBox="0 0 100 50" aria-hidden="true" focusable="false"><path class="hw-wing" d="M50 28c-6-8-14-8-20-4-4-8-14-10-24-4 8 2 12 8 12 14 6-4 14-2 18 4 4-4 10-4 14 2 4-6 10-6 14-2 4-6 12-8 18-4 0-6 4-12 12-14-10-6-20-4-24 4-6-4-14-4-20 4z" fill="#140a1c"/><path d="M45 24l2-7 3 5 3-5 2 7z" fill="#140a1c"/><circle cx="47.5" cy="27" r="1.2" fill="#ffcf4a"/><circle cx="52.5" cy="27" r="1.2" fill="#ffcf4a"/></svg>';

  /* ---- ショップの札に出す絵（単独で開ける SVG を data URI に） ---- */
  function thumb(inner, bg) {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">' + defsHtml(false) +
      '<radialGradient id="hw-bg" cx=".5" cy=".55" r=".7"><stop offset="0" stop-color="' + bg[0] + '"/><stop offset="1" stop-color="' + bg[1] + '"/></radialGradient>' +
      '<rect width="200" height="200" fill="url(#hw-bg)"/>' + inner + '</svg>';
    return 'data:image/svg+xml;base64,' + global.btoa(svg);
  }
  // 何が出るかはそろえてからのお楽しみ、なので札は「？」だけ。オレンジの太い字に、炎のにじみ
  const THUMB_Q = (function () {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs>' +
      '<radialGradient id="b" cx=".5" cy=".5" r=".72"><stop offset="0" stop-color="#3a1630"/><stop offset="1" stop-color="#0e0610"/></radialGradient>' +
      '<linearGradient id="q" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc35a"/><stop offset=".5" stop-color="#ff8a1a"/><stop offset="1" stop-color="#e84a10"/></linearGradient>' +
      '<filter id="g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter></defs>' +
      '<rect width="200" height="200" fill="url(#b)"/>' +
      '<text x="100" y="158" text-anchor="middle" font-family="Arial Black,Arial,Helvetica,sans-serif" font-weight="900" font-size="164" fill="#ff7a14" opacity=".75" filter="url(#g)">?</text>' +
      '<text x="100" y="158" text-anchor="middle" font-family="Arial Black,Arial,Helvetica,sans-serif" font-weight="900" font-size="164" fill="url(#q)" stroke="#5a1a02" stroke-width="3">?</text>' +
      '</svg>';
    return 'data:image/svg+xml;base64,' + global.btoa(svg);
  })();

  /* ===================================================== ショップの品揃え == */
  // メインカラー：2色のあいだを行き来する（blend）。hex は起動直後の先出し用の中間色。
  global.SHOP_THEMES_EXTRA = (global.SHOP_THEMES_EXTRA || []).concat([
    { id: 'halloween', hex: '#ff621f', cost: 2000, cur: 'cyan', blend: ['#ff8c1a', '#ff3b2f'] }
  ]);
  // キューブスキン：img は持たない（写真を貼る仕組みは素通り）。札の絵は thumb。
  global.SHOP_MARKS_EXTRA = (global.SHOP_MARKS_EXTRA || []).concat([
    { id: 'halloween', cost: 300, cur: 'cyan', img: null, thumb: THUMB_Q }
  ]);
  const MARK_ID = 'halloween';

  /* キューブカラー「ハロウィン」。
       U 骨の白 / D キャンディコーンの黄 / R 血の赤 / L かぼちゃの橙 / F スライムの緑 / B 魔女の紫
     ・赤 #C8102E(350°) と 橙 #FF6A13(22°) は色相を32°離してある（標準色は33°）。
     ・橙と黄 #FFDD33(50°) も28°離し、さらに明るさでも分けてある。
     ・青の代わりに紫を置くので、赤・紫・緑・黄・橙・白の6つが色相でも明るさでも分かれる。
     ・背景は夜の紫がかった黒。すき間は暗いので、マスは少し詰める。 */
  const SCHEME = {
    id: 'halloween', cost: 500, cur: 'cyan',
    colors: { R: 0xC8102E, L: 0xFF6A13, U: 0xF5F0E4, D: 0xFFDD33, F: 0x46C43A, B: 0x8448D8, I: 0x1c1322 },
    bg: 0x120a18,
    gapSize: 0.97,
    faceColors: {
      R: { bg: '#C8102E', text: '#ffffff' },
      L: { bg: '#FF6A13', text: '#141416' },
      U: { bg: '#F5F0E4', text: '#141416' },
      D: { bg: '#FFDD33', text: '#141416' },
      F: { bg: '#46C43A', text: '#141416' },
      B: { bg: '#8448D8', text: '#ffffff' }
    }
  };
  if (Array.isArray(global.CUBE_SCHEMES_EXTRA)) global.CUBE_SCHEMES_EXTRA.push(SCHEME);
  else global.CUBE_SCHEMES_EXTRA = [SCHEME];

  /* ============================================ おどかし：リアルな絵（SVG） == */
  /* 皮・肌・果肉・ヘタの質感は、ノイズ（feTurbulence）で凹凸を作って光（feDiffuse /
     feSpecularLighting）を当てたもの。重いフィルタなので、毎フレーム描かずに、
     最初に1回だけ canvas に焼いて、あとはその絵を transform で動かすだけにする。 */
  /* ---- 質感のフィルタ（ノイズで凹凸を作り、光を当てる） ---- */
  function rFilters() {
    return '' +
      // かぼちゃの皮：縦の筋＋細かい毛穴の凹凸に、左上から光。黒ずんだ斑点も少し
      '<filter id="rpk" x="-3%" y="-3%" width="106%" height="106%" color-interpolation-filters="sRGB">' +
        '<feTurbulence type="fractalNoise" baseFrequency="0.035 0.003" numOctaves="2" seed="7" result="streak"/>' +
        '<feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="2" result="pore"/>' +
        '<feComposite in="streak" in2="pore" operator="arithmetic" k2="0.9" k3="0.1" k4="0" result="h"/>' +
        '<feColorMatrix in="h" type="luminanceToAlpha" result="hA"/>' +
        '<feDiffuseLighting in="hA" surfaceScale="1.1" diffuseConstant="1.25" result="dif"><feDistantLight azimuth="235" elevation="55"/></feDiffuseLighting>' +
        '<feSpecularLighting in="hA" surfaceScale="1.6" specularConstant="1.1" specularExponent="34" lighting-color="#fff0d0" result="spc"><feDistantLight azimuth="235" elevation="50"/></feSpecularLighting>' +
        '<feComposite in="SourceGraphic" in2="dif" operator="arithmetic" k1="1.22" result="lit"/>' +
        '<feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" seed="31" result="bl"/>' +
        '<feColorMatrix in="bl" type="matrix" values="0 0 0 0 .2  0 0 0 0 .08  0 0 0 0 .02  0 0 0 -10 3.7" result="blot"/>' +
        '<feGaussianBlur in="blot" stdDeviation="2.5" result="blot2"/>' +
        '<feComposite in="blot2" in2="lit" operator="atop" result="lit2"/>' +
        '<feComposite in="spc" in2="SourceAlpha" operator="in" result="spc2"/>' +
        '<feComposite in="lit2" in2="spc2" operator="arithmetic" k2="1" k3=".45" result="o"/>' +
        '<feComposite in="o" in2="SourceAlpha" operator="in"/>' +
      '</filter>' +
      // 肌：しわと細かい凹凸。光は上（頭の灯り）から
      '<filter id="rfl" x="-3%" y="-3%" width="106%" height="106%" color-interpolation-filters="sRGB">' +
        '<feTurbulence type="fractalNoise" baseFrequency="0.09 0.025" numOctaves="4" seed="13" result="w"/>' +
        '<feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="5" result="p"/>' +
        '<feComposite in="w" in2="p" operator="arithmetic" k2="0.7" k3="0.35" result="h"/>' +
        '<feColorMatrix in="h" type="luminanceToAlpha" result="hA"/>' +
        '<feDiffuseLighting in="hA" surfaceScale="2.4" diffuseConstant="1.25" result="dif"><feDistantLight azimuth="260" elevation="52"/></feDiffuseLighting>' +
        '<feSpecularLighting in="hA" surfaceScale="2.4" specularConstant=".45" specularExponent="14" lighting-color="#ffe2c0" result="spc"><feDistantLight azimuth="260" elevation="52"/></feSpecularLighting>' +
        '<feComposite in="SourceGraphic" in2="dif" operator="arithmetic" k1="1.15" result="lit0"/>' +
        '<feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="3" seed="44" result="bl"/>' +
        '<feColorMatrix in="bl" type="matrix" values="0 0 0 0 .16  0 0 0 0 .12  0 0 0 0 .12  0 0 0 -5 2.2" result="blot"/>' +
        '<feGaussianBlur in="blot" stdDeviation="7" result="blot2"/>' +
        '<feComposite in="blot2" in2="lit0" operator="atop" result="lit"/>' +
        '<feComposite in="spc" in2="SourceAlpha" operator="in" result="spc2"/>' +
        '<feComposite in="lit" in2="spc2" operator="arithmetic" k2="1" k3=".4" result="o"/>' +
        '<feComposite in="o" in2="SourceAlpha" operator="in"/>' +
      '</filter>' +
      // 果肉の断面（彫った壁）：繊維の筋
      '<filter id="rfb" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">' +
        '<feTurbulence type="fractalNoise" baseFrequency="0.012 0.22" numOctaves="3" seed="9" result="f"/>' +
        '<feColorMatrix in="f" type="luminanceToAlpha" result="fA"/>' +
        '<feDiffuseLighting in="fA" surfaceScale="2" diffuseConstant="1.2" result="d"><feDistantLight azimuth="90" elevation="60"/></feDiffuseLighting>' +
        '<feComposite in="SourceGraphic" in2="d" operator="arithmetic" k1="1.1"/>' +
        '<feComposite in2="SourceAlpha" operator="in"/>' +
      '</filter>' +
      // ヘタ：乾いた木の繊維
      '<filter id="rwd" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">' +
        '<feTurbulence type="fractalNoise" baseFrequency="0.3 0.015" numOctaves="3" seed="4" result="f"/>' +
        '<feColorMatrix in="f" type="luminanceToAlpha" result="fA"/>' +
        '<feDiffuseLighting in="fA" surfaceScale="3" diffuseConstant="1.3" result="d"><feDistantLight azimuth="200" elevation="40"/></feDiffuseLighting>' +
        '<feComposite in="SourceGraphic" in2="d" operator="arithmetic" k1="1.2"/>' +
        '<feComposite in2="SourceAlpha" operator="in"/>' +
      '</filter>' +
      '<filter id="rb2" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2"/></filter>' +
      '<filter id="rb4" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4"/></filter>' +
      '<filter id="rb10" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="10"/></filter>' +
      '<filter id="rb18" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18"/></filter>';
  }

  /* ---- かぼちゃの頭（viewBox 0 0 400 400） ---- */
  const R_LOBES = [
    [62, 230, 58, 110], [338, 230, 58, 110],
    [104, 224, 64, 126], [296, 224, 64, 126],
    [150, 220, 62, 136], [250, 220, 62, 136],
    [200, 218, 58, 142]
  ];
  // 房ごとの色 [明るい, 中, 暗い]。虹のときは房ごとに色相を変える
  const R_ORANGE = [
    ['#e8781f', '#b8470a', '#4a1602'], ['#e8781f', '#b8470a', '#4a1602'],
    ['#f2862a', '#c8520c', '#561a02'], ['#f2862a', '#c8520c', '#561a02'],
    ['#fb9532', '#d75e0f', '#621f03'], ['#fb9532', '#d75e0f', '#621f03'],
    ['#ffa23c', '#e2680f', '#6e2504']
  ];
  const R_RAINBOW = [
    ['#ff6a7e', '#c8183a', '#4a0614'], ['#e07aff', '#8a22c8', '#2e0848'],
    ['#ffb04a', '#d8640a', '#561c02'], ['#7aa8ff', '#2252d0', '#0a1a4e'],
    ['#fff06a', '#c8b012', '#4a3e02'], ['#6ae8ff', '#10a0c8', '#043a4e'],
    ['#8aff8a', '#24b83a', '#08440e']
  ];
  const R_ORDER = [0, 1, 2, 3, 4, 5, 6];

  function rLobes(pal, id) {
    let defs = '', body = '';
    pal.forEach(function (c, i) {
      defs += '<radialGradient id="' + id + i + '" cx=".4" cy=".34" r=".78">' +
        '<stop offset="0" stop-color="' + c[0] + '"/><stop offset=".55" stop-color="' + c[1] + '"/><stop offset="1" stop-color="' + c[2] + '"/></radialGradient>';
    });
    R_ORDER.forEach(function (i) {
      const l = R_LOBES[i];
      const e = 'cx="' + l[0] + '" cy="' + l[1] + '" rx="' + l[2] + '" ry="' + l[3] + '"';
      body += '<ellipse ' + e + ' fill="url(#' + id + i + ')"/>';
      body += '<ellipse ' + e + ' fill="none" stroke="#1e0700" stroke-width="7" opacity=".7" filter="url(#rb4)"/>';
    });
    return { defs: defs, body: body };
  }

  const R_STEM =
    '<ellipse cx="201" cy="88" rx="34" ry="11" fill="#1a0600" opacity=".75" filter="url(#rb4)"/>' +
    '<g filter="url(#rwd)">' +
      '<path d="M172 96c6-6 10-14 10-26 0-22 6-42 16-58l26-4c-4 18-4 38 0 58 2 14 8 22 16 30-20 8-48 8-68 0z" fill="url(#rstem)"/>' +
      '<ellipse cx="211" cy="10" rx="14" ry="5" fill="#b49a62"/>' +
    '</g>' +
    '<path d="M196 20c-4 20-6 44-2 70M214 16c2 22 2 46 8 72" fill="none" stroke="#1c1a08" stroke-width="2.5" opacity=".55"/>';

  const R_SIL = (function () {
    return R_LOBES.map(function (l) { return '<ellipse cx="' + l[0] + '" cy="' + l[1] + '" rx="' + l[2] + '" ry="' + l[3] + '"/>'; }).join('');
  })();

  // 彫った穴（目・口）
  const R_FACE = {
    normal: {
      holes: 'M104 166 150 176 186 196 174 216 160 234 136 228 120 214 112 194z' +
             'M296 166 250 176 214 196 226 216 240 234 264 228 280 214 288 194z' +
             'M90 262l20 9 12-9 13 22 16-16 14 18 16-16 19 18 18-18 16 16 14-18 16 16 13-22 12 9 20-9c-4 28-18 50-46 62l-12-18-10 22-26 6-8-20-10 21-28-5-8-22-12 16c-32-10-50-34-54-62z'
    },
    scream: {
      holes: 'M92 146 156 168 192 196 178 224 150 240 122 230 100 206z' +
             'M308 146 244 168 208 196 222 224 250 240 278 230 300 206z' +
             'M66 238l24 14 12-12 14 26 16-20 16 26 16-22 18 28 18-26 18 26 16-22 16 26 16-20 14 26 12-12 24-14c4 62-28 110-72 120l-10-26-14 28-24 4-10-28-10 30-28-4-10-26-12 22c-46-12-80-58-76-120z'
    }
  };

  function rCuts(kind, lit) {
    const h = R_FACE[kind].holes;
    const wall = lit ? '#ffcf72' : '#5e3510';
    const inner = lit ? 'url(#rin' + (kind === 'scream' ? 'S' : 'L') + ')' : 'url(#rinD)';
    let s = '';
    if (lit) {
      s += '<path d="' + h + '" fill="#ff9a2a" opacity=".55" filter="url(#rb18)"/>';
      s += '<path d="' + h + '" fill="#ffc45a" opacity=".5" filter="url(#rb4)"/>';
    }
    s += '<path d="' + h + '" fill="' + wall + '" filter="url(#rfb)"/>';
    s += '<g clip-path="url(#rch' + kind + ')"><path transform="translate(0 9)" d="' + h + '" fill="' + inner + '"/>';
    if (kind === 'scream') s += R_GUTS;
    s += '</g>';
    s += '<path d="' + h + '" fill="none" stroke="#1a0500" stroke-width="1.6" opacity=".55"/>';
    s += '<g clip-path="url(#rch' + kind + ')"><path d="' + h + '" fill="none" stroke="#000" stroke-width="7" opacity=".35" filter="url(#rb2)"/></g>';
    return s;
  }
  // 叫ぶ口の中：わた（筋）と種
  const R_GUTS =
    '<g fill="none" stroke="#ffb24a" stroke-linecap="round" opacity=".8">' +
      '<path d="M118 270c4 30-6 50 2 80" stroke-width="4"/><path d="M160 276c-8 26 6 44-2 72" stroke-width="3"/>' +
      '<path d="M236 282c6 24-6 40 4 66" stroke-width="3.5"/><path d="M282 268c-6 30 8 48-4 78" stroke-width="4"/>' +
      '<path d="M196 288c4 18-2 34 2 58" stroke-width="2.4"/>' +
    '</g>' +
    '<g fill="#f6e7c4" stroke="#8a6a3a" stroke-width="1">' +
      '<ellipse cx="121" cy="302" rx="5" ry="9" transform="rotate(12 121 302)"/><ellipse cx="158" cy="320" rx="5" ry="9" transform="rotate(-20 158 320)"/>' +
      '<ellipse cx="240" cy="310" rx="5" ry="9" transform="rotate(18 240 310)"/><ellipse cx="279" cy="330" rx="5" ry="9" transform="rotate(-10 279 330)"/>' +
      '<ellipse cx="198" cy="336" rx="4" ry="8"/>' +
    '</g>';

  const R_CRACKS =
    '<g fill="none" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M66 238l-14-12-6-22-16-10M334 238l14-12 6-22 16-10M150 240l-8 22M120 150l-10-22-18-8M280 150l10-22 18-8" stroke="#140400" stroke-width="3.4"/>' +
      '<path d="M67 241l-14-12-6-22-16-10M335 241l14-12 6-22 16-10" stroke="#ffb070" stroke-width="1.2" opacity=".5"/>' +
      '<path d="M112 152q40 0 76 34M288 152q-40 0-76 34" stroke="#2a0a00" stroke-width="6" opacity=".6" filter="url(#rb2)"/>' +
    '</g>';

  // kind: 'normal' | 'scream'、lit: 目に火が入っているか、rb: 虹
  function rHead(kind, lit, rb, px) {
    const L = rLobes(rb ? R_RAINBOW : R_ORANGE, 'rl');
    const W = px || 400;
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + W + '" viewBox="0 0 400 400"><defs>' +
      rFilters() + L.defs +
      '<linearGradient id="rstem" x1="0" x2="1"><stop offset="0" stop-color="#2e3a12"/><stop offset=".45" stop-color="#6e6a2c"/><stop offset="1" stop-color="#3a2c10"/></linearGradient>' +
      '<radialGradient id="rinL" cx=".5" cy=".62" r=".7"><stop offset="0" stop-color="#fff8c8"/><stop offset=".28" stop-color="#ffd25a"/><stop offset=".62" stop-color="#ff8410"/><stop offset="1" stop-color="#8a2200"/></radialGradient>' +
      '<radialGradient id="rinS" cx=".5" cy=".5" r=".7"><stop offset="0" stop-color="#ffe08a"/><stop offset=".22" stop-color="#ff5a12"/><stop offset=".58" stop-color="#8a000e"/><stop offset="1" stop-color="#1a0004"/></radialGradient>' +
      '<radialGradient id="rinD" cx=".5" cy=".5" r=".7"><stop offset="0" stop-color="#2a0802"/><stop offset="1" stop-color="#0a0200"/></radialGradient>' +
      '<clipPath id="rch' + kind + '"><path d="' + R_FACE[kind].holes + '"/></clipPath>' +
      '<clipPath id="rsil">' + R_SIL + '</clipPath>' +
      '<radialGradient id="rao" cx=".5" cy=".42" r=".6"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>' +
      '</defs>' +
      '<g filter="url(#rpk)">' + L.body + '</g>' +
      '<g clip-path="url(#rsil)"><rect x="0" y="60" width="400" height="320" fill="url(#rao)"/>' +
        (lit ? '<ellipse cx="200" cy="250" rx="150" ry="110" fill="#ff8a1a" opacity=".22" filter="url(#rb18)"/>' : '') +
        (kind === 'scream' ? R_CRACKS : '') +
        rCuts(kind, lit) +
      '</g>' +
      R_STEM +
    '</svg>';
  }

  /* ---- 体（viewBox 0 0 500 640）：首・浮き出た鎖骨とあばら・こけた腹。下は闇に溶ける ---- */
  function rBody() {
    const sil = 'M228 0C230 50 228 90 224 114 200 124 154 150 112 186 84 210 72 244 90 270 102 300 106 340 114 380 126 440 150 520 166 640H334C350 520 374 440 386 380 394 340 398 300 410 270 428 244 416 210 388 186 346 150 300 124 276 114 272 90 270 50 272 0Z';
    let ribs = '';
    for (let i = 0; i < 7; i++) {
      const y = 222 + i * 29, ox = 112 + i * 6, w = 8.5 - i * 0.7;
      const L = 'M244 ' + y + 'C204 ' + (y - 8) + ' 158 ' + (y + 2) + ' ' + ox + ' ' + (y + 34);
      const R = 'M256 ' + y + 'C296 ' + (y - 8) + ' 342 ' + (y + 2) + ' ' + (500 - ox) + ' ' + (y + 34);
      ribs += '<g transform="translate(0 12)" stroke="#120c08" stroke-width="13" opacity=".7" filter="url(#rb4)"><path d="' + L + '"/><path d="' + R + '"/></g>';
      ribs += '<g stroke="#d4c3a8" stroke-width="' + w.toFixed(1) + '" opacity=".55" filter="url(#rb2)"><path d="' + L + '"/><path d="' + R + '"/></g>';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="640" viewBox="0 0 500 640"><defs>' + rFilters() +
      '<radialGradient id="rsk" cx=".5" cy=".4" r=".6"><stop offset="0" stop-color="#8f8a78"/><stop offset=".4" stop-color="#5f5b4d"/><stop offset=".78" stop-color="#25221c"/><stop offset="1" stop-color="#0c0a08"/></radialGradient>' +
      '<linearGradient id="rside" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".75"/><stop offset=".3" stop-color="#000" stop-opacity="0"/><stop offset=".7" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".8"/></linearGradient>' +
      '<radialGradient id="rrim" cx=".5" cy="-.08" r=".55"><stop offset="0" stop-color="#ff8a2a" stop-opacity=".45"/><stop offset="1" stop-color="#ff8a2a" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="rfade" x1="0" y1="0" x2="0" y2="1"><stop offset=".36" stop-color="#fff"/><stop offset=".86" stop-color="#000"/></linearGradient>' +
      '<mask id="rmk"><rect width="500" height="640" fill="url(#rfade)"/></mask>' +
      '<clipPath id="rbc"><path d="' + sil + '"/></clipPath>' +
      '</defs>' +
      '<g mask="url(#rmk)">' +
        '<path d="' + sil + '" fill="url(#rsk)" filter="url(#rfl)"/>' +
        '<g clip-path="url(#rbc)" fill="none" stroke-linecap="round">' +
          // 首の筋
          '<path d="M234 6c2 40 8 80 14 120M266 6c-2 40-8 80-14 120" stroke="#120c08" stroke-width="10" opacity=".6" filter="url(#rb4)" transform="translate(5 0)"/>' +
          '<path d="M234 6c2 40 8 80 14 120M266 6c-2 40-8 80-14 120" stroke="#cfc6ad" stroke-width="5" opacity=".5" filter="url(#rb2)"/>' +
          // 鎖骨
          '<path d="M100 172c40-22 96-30 140-24M400 172c-40-22-96-30-140-24" stroke="#0e0906" stroke-width="16" opacity=".7" filter="url(#rb4)" transform="translate(0 10)"/>' +
          '<path d="M100 172c40-22 96-30 140-24M400 172c-40-22-96-30-140-24" stroke="#ddd3b8" stroke-width="9" opacity=".65" filter="url(#rb2)"/>' +
          // 胸骨・あばら
          '<path d="M250 160v250" stroke="#0e0906" stroke-width="12" opacity=".55" filter="url(#rb4)"/>' +
          ribs +
          // こけた腹
          '<ellipse cx="250" cy="470" rx="90" ry="60" fill="#0a0604" opacity=".5" filter="url(#rb18)"/>' +
          // 静脈
          '<path d="M150 250c12 30-2 56 14 88s-4 52 10 80M352 260c-14 26 4 54-12 84s6 48-8 76M206 420c10 20 30 24 40 46M240 30c-6 30 4 60-4 90" stroke="#2e2234" stroke-width="2.6" opacity=".55"/>' +
          '<rect width="500" height="640" fill="url(#rside)"/>' +
          '<path d="M230 0v120M270 0v120" stroke="#0c0806" stroke-width="14" opacity=".7" filter="url(#rb4)"/>' +
          '<path d="' + sil + '" fill="none" stroke="#000" stroke-width="10" opacity=".55" filter="url(#rb4)"/>' +
          '<ellipse cx="250" cy="40" rx="120" ry="70" fill="#000" opacity=".55" filter="url(#rb18)"/>' +
          // 頭の灯りが肩に落ちる
          '<rect width="500" height="640" fill="url(#rrim)"/>' +
        '</g>' +
      '</g>' +
    '</svg>';
  }

  /* ---- 腕（viewBox 0 -24 300 500）：右下の肩から、肘を外へ張って、長い指を開いて振り上げる ---- */
  function rArm() {
    // 指：付け根から先へ細くなる3つの節。節ごとに少しふくらませる
    const fingers = [
      [[84, 112], [66, 92], [56, 74], [48, 58], 9.5],
      [[94, 86], [87, 58], [83, 32], [80, 8], 9],
      [[102, 82], [102, 52], [104, 24], [106, 0], 9.5],
      [[110, 84], [119, 56], [127, 30], [133, 10], 9],
      [[118, 94], [132, 74], [143, 56], [152, 42], 7.5]
    ];
    let f = '', n = '';
    fingers.forEach(function (x) {
      const w = x[4];
      for (let k = 0; k < 3; k++) {
        const a = x[k], b = x[k + 1], ww = w * (1 - k * 0.2);
        const d = 'M' + a[0] + ' ' + a[1] + 'L' + b[0] + ' ' + b[1];
        f += '<path d="' + d + '" stroke="#0a0806" stroke-width="' + (ww + 4).toFixed(1) + '" opacity=".55" filter="url(#rb2)" transform="translate(2 3)"/>';
        f += '<path d="' + d + '" stroke="#6f6a59" stroke-width="' + ww.toFixed(1) + '"/>';
        f += '<path d="' + d + '" stroke="#bdb59c" stroke-width="' + (ww * 0.32).toFixed(1) + '" opacity=".55" transform="translate(-1.6 -1)"/>';
        if (k < 3) f += '<circle cx="' + b[0] + '" cy="' + b[1] + '" r="' + (ww * 0.62).toFixed(1) + '" fill="#7a7462"/>';
      }
      const a = x[2], b = x[3];
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
      n += '<path transform="translate(' + b[0] + ' ' + b[1] + ') rotate(' + ang.toFixed(0) + ')" d="M-4 -3.5C3 -4 11 -2 19 1 11 3 3 4 -4 3.5z" fill="#120c08" stroke="#2e241a" stroke-width="1"/>';
    });
    return '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="500" viewBox="0 -24 300 500"><defs>' + rFilters() +
      '<linearGradient id="rag" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#99947f"/><stop offset=".45" stop-color="#5e5a4b"/><stop offset="1" stop-color="#181612"/></linearGradient>' +
      // 肩のほう（右下）ほど闇に沈める
      '<linearGradient id="rad" x1=".2" y1=".1" x2=".9" y2="1"><stop offset=".35" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".8"/></linearGradient>' +
      '<clipPath id="rac"><path d="M246 482 306 424C222 364 142 322 84 298c-26-8-46 12-36 40 62 24 140 76 198 144z"/><path d="M50 332c12-70 24-152 30-212l42-2c-4 62-18 142-34 218z"/><path d="M80 132c-6-26 0-48 18-56 18 2 30 20 28 52-14 8-32 10-46 4z"/></clipPath>' +
      '</defs>' +
      '<g filter="url(#rfl)">' +
        '<path d="M246 482 306 424C222 364 142 322 84 298c-26-8-46 12-36 40 62 24 140 76 198 144z" fill="url(#rag)"/>' +
        '<path d="M50 332c12-70 24-152 30-212l42-2c-4 62-18 142-34 218z" fill="url(#rag)"/>' +
        '<path d="M80 132c-6-26 0-48 18-56 18 2 30 20 28 52-14 8-32 10-46 4z" fill="#827c69"/>' +
      '</g>' +
      '<g clip-path="url(#rac)" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M276 440C210 392 140 350 88 326" stroke="#0a0806" stroke-width="10" opacity=".55" filter="url(#rb4)"/>' +
        '<path d="M104 302c6-60 12-122 14-172M92 310c4-50 10-110 12-170" stroke="#d2c9ae" stroke-width="2.6" opacity=".45" filter="url(#rb2)"/>' +
        '<path d="M60 322c8-62 14-132 18-192" stroke="#0a0806" stroke-width="8" opacity=".5" filter="url(#rb4)"/>' +
        '<path d="M44 330c10 6 26 8 40 2" stroke="#d2c9ae" stroke-width="3" opacity=".4" filter="url(#rb2)"/>' +
        '<rect x="0" y="-24" width="300" height="500" fill="url(#rad)"/>' +
      '</g>' +
      '<g fill="none" stroke-linecap="round" stroke-linejoin="round">' + f + '</g>' + n +
    '</svg>';
  }

  /* ================================================================ CSS == */
  const STAR = 'polygon(50% 0,58% 40%,100% 50%,58% 60%,50% 100%,42% 60%,0 50%,42% 40%)';
  const CSS = [
    '.hw-layer{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:6}',
    '.hw-anchor{position:absolute;left:0;top:0;width:0;height:0}',
    '.hw-anchor svg{display:block;width:100%;height:100%;overflow:visible}',
    '.hw-blink{transform-box:fill-box;transform-origin:50% 50%;animation:hwBlink 4.6s var(--bkd,0s) infinite}',
    '@keyframes hwBlink{0%,93%,100%{transform:scaleY(1)}96%{transform:scaleY(.1)}}',
    '.hw-hat{transform-box:fill-box;transform-origin:50% 100%;animation:hwHat 2.4s ease-in-out infinite alternate}',
    '@keyframes hwHat{from{transform:rotate(-5deg)}to{transform:rotate(6deg)}}',
    /* 虹（ジャックポット）：房の地の色を虹に。目や口はそのまま */
    '.hw-rb .hw-lb{fill:url(#hw-g-rb)}',
    '.hw-aura{position:absolute;border-radius:50%;opacity:0;transition:opacity .4s ease;',
    '  background:conic-gradient(from 0deg,rgba(255,94,122,.55),rgba(255,243,92,.55),rgba(109,255,142,.55),rgba(82,212,255,.55),rgba(154,123,255,.55),rgba(255,107,214,.55),rgba(255,94,122,.55));',
    '  -webkit-mask:radial-gradient(circle,#000 30%,transparent 70%);mask:radial-gradient(circle,#000 30%,transparent 70%);',
    '  animation:hwSpin 5s linear infinite}',
    '.hw-rb .hw-aura{opacity:1}',
    '@keyframes hwSpin{to{transform:rotate(360deg)}}',
    '.hw-rbpop{animation:hwRbPop .6s cubic-bezier(.2,1.6,.4,1) both}',
    '@keyframes hwRbPop{0%{transform:scale(1)}35%{transform:scale(1.28)}100%{transform:scale(1)}}',
    '.hw-ring{position:absolute;border-radius:50%;border:4px solid #fff3b0;opacity:0;',
    '  box-shadow:0 0 18px #ffd27a,inset 0 0 12px #ffd27a}',
    '.hw-ring.go{animation:hwRing .7s cubic-bezier(.15,.8,.3,1) both}',
    '@keyframes hwRing{0%{opacity:1;transform:scale(.25)}100%{opacity:0;transform:scale(1.6)}}',
    '.hw-rb .hw-ring{border-color:#fff;box-shadow:0 0 18px #ff6bd6,inset 0 0 12px #52d4ff}',
    /* きらめき（ゆっくり明滅。1秒に1回より遅い） */
    '.hw-spk{position:absolute;background:#fff3b0;clip-path:' + STAR + ';opacity:0;',
    '  animation:hwTwinkle var(--tt,2.4s) ease-in-out var(--td,0s) infinite}',
    '@keyframes hwTwinkle{0%,100%{opacity:0;transform:scale(.3) rotate(0)}50%{opacity:1;transform:scale(1) rotate(45deg)}}',
    '.hw-rb .hw-spk{background:#fff}',

    /* ---- ① かぼちゃポップ ---- */
    '.hw-crack{position:absolute;opacity:0}',
    '.hw-crack path{fill:none;stroke:#fff6c8;stroke-width:3.2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:100;stroke-dashoffset:100}',
    '.hw-crack.go{animation:hwCrackFade .62s ease-out both}',
    '.hw-crack.go path{animation:hwDraw .2s ease-out both}',
    '@keyframes hwCrackFade{0%{opacity:0}12%{opacity:1}55%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.3)}}',
    '@keyframes hwDraw{to{stroke-dashoffset:0}}',
    '.hw-flash{position:absolute;border-radius:50%;opacity:0;',
    '  background:radial-gradient(circle,#fff8e0 0,#ffc163 28%,rgba(255,122,26,.5) 48%,rgba(255,122,26,0) 70%)}',
    '.hw-flash.go{animation:hwFlash .5s ease-out both}',
    '@keyframes hwFlash{0%{opacity:0;transform:scale(.3)}22%{opacity:1}100%{opacity:0;transform:scale(1.7)}}',
    '.hw-mini{position:absolute;opacity:0}',
    '.hw-mini.pop{animation:hwPopOut .66s cubic-bezier(.2,1.45,.35,1) var(--d,0s) both}',
    '@keyframes hwPopOut{0%{opacity:0;transform:translate(var(--fx),var(--fy)) scale(.1) rotate(-30deg)}',
    '  35%{opacity:1}100%{opacity:1;transform:none}}',
    '.hw-mini.still{opacity:1}',
    '.hw-bob{width:100%;height:100%;animation:hwBob var(--bt,2.8s) ease-in-out var(--bd,0s) infinite alternate}',
    '@keyframes hwBob{from{transform:translateY(-7%) rotate(-6deg)}to{transform:translateY(7%) rotate(6deg)}}',
    '.hw-art{width:100%;height:100%}',

    /* ---- ② キリッとかぼちゃ（カーテン） ---- */
    '.hw-curtain{position:absolute;inset:0;z-index:3}',
    '.hw-cur{position:absolute;top:0;bottom:0;width:51%;will-change:transform;',
    '  background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(0,0,0,.38)),',
    '    repeating-linear-gradient(90deg,#26062b 0,#561049 4.5%,#87205e 7.5%,#561049 10.5%,#26062b 15%)}',
    '.hw-cur::after{content:"";position:absolute;left:0;right:0;bottom:0;height:14px;',
    '  background:repeating-linear-gradient(90deg,#f6cf62 0 3px,#a8781f 3px 6px);',
    '  box-shadow:0 -3px 0 #d9a63a}',
    '.hw-cur.l{left:0;transform:translateX(-103%);box-shadow:inset -14px 0 22px rgba(0,0,0,.55)}',
    '.hw-cur.r{right:0;transform:translateX(103%);box-shadow:inset 14px 0 22px rgba(0,0,0,.55)}',
    '.hw-val{position:absolute;left:-2%;right:-2%;top:0;height:11%;z-index:1;transform:translateY(-110%);',
    '  background:linear-gradient(180deg,#3a0a3c,#6e1858 70%,#3a0a3c);border-bottom:4px solid #e2b04a;',
    '  box-shadow:0 6px 16px rgba(0,0,0,.5)}',
    '.hw-curtain.close .hw-cur.l{animation:hwCloseL .3s cubic-bezier(.3,.9,.35,1.04) both}',
    '.hw-curtain.close .hw-cur.r{animation:hwCloseR .3s cubic-bezier(.3,.9,.35,1.04) both}',
    '.hw-curtain.close .hw-val{transform:none;transition:transform .22s ease-out}',
    '@keyframes hwCloseL{from{transform:translateX(-103%)}to{transform:none}}',
    '@keyframes hwCloseR{from{transform:translateX(103%)}to{transform:none}}',
    '.hw-curtain.open .hw-cur.l{animation:hwOpenL .55s cubic-bezier(.6,0,.35,1) both}',
    '.hw-curtain.open .hw-cur.r{animation:hwOpenR .55s cubic-bezier(.6,0,.35,1) both}',
    '.hw-curtain.open .hw-val{transform:translateY(-110%);transition:transform .45s .2s ease-in}',
    '@keyframes hwOpenL{from{transform:none}to{transform:translateX(-103%)}}',
    '@keyframes hwOpenR{from{transform:none}to{transform:translateX(103%)}}',
    // 閉じているあいだ、合わせ目からもれる灯り
    '.hw-seam{position:absolute;left:50%;top:0;bottom:0;width:6px;margin-left:-3px;z-index:2;opacity:0;',
    '  background:linear-gradient(180deg,rgba(255,200,90,0),#ffc163 40%,#ffc163 60%,rgba(255,200,90,0));',
    '  box-shadow:0 0 18px 6px rgba(255,150,40,.55)}',
    '.hw-curtain.close .hw-seam{animation:hwSeam .5s .25s ease-in-out both}',
    '@keyframes hwSeam{0%{opacity:0}50%{opacity:1}100%{opacity:.8}}',
    '.hw-curtain.open .hw-seam{opacity:0;transition:opacity .15s}',
    '.hw-spot{position:absolute;opacity:0;transform-origin:50% 0;',
    '  background:linear-gradient(180deg,rgba(255,236,170,0),rgba(255,214,130,.26) 70%,rgba(255,200,110,.32));',
    '  clip-path:polygon(43% 0,57% 0,100% 100%,0 100%)}',
    '.hw-spot.show{animation:hwSpot .9s ease-out both}',
    '@keyframes hwSpot{0%{opacity:0;transform:scaleX(.4)}100%{opacity:.85;transform:none}}',
    '.hw-floor{position:absolute;border-radius:50%;opacity:0;',
    '  background:radial-gradient(ellipse,rgba(255,170,60,.55),rgba(255,120,30,0) 70%)}',
    '.hw-floor.show{opacity:1;transition:opacity .6s .2s}',
    '.hw-cool{position:absolute;opacity:0}',
    '.hw-cool.show{animation:hwReveal .75s cubic-bezier(.2,1.35,.4,1) both}',
    '@keyframes hwReveal{0%{opacity:0;transform:scale(.7) translateY(8%)}35%{opacity:1}100%{opacity:1;transform:none}}',
    '.hw-cool.still{opacity:1}',
    '.hw-breath{width:100%;height:100%;animation:hwBreath 3.4s ease-in-out .8s infinite}',
    '@keyframes hwBreath{0%,100%{transform:none}50%{transform:translateY(-1.6%) scale(1.02)}}',
    '.hw-glowfx{animation:hwFlicker 2.6s ease-in-out infinite}',
    '@keyframes hwFlicker{0%,100%{opacity:.86}40%{opacity:1}52%{opacity:.72}70%{opacity:.95}}',
    '.hw-gleam{position:absolute;background:#fff;clip-path:' + STAR + ';opacity:0}',
    '.hw-gleam.go{animation:hwGleam .55s ease-out both,hwGleamIdle 6s 2.4s ease-in-out infinite}',
    '@keyframes hwGleam{0%{opacity:0;transform:scale(0) rotate(0)}40%{opacity:1;transform:scale(1.25) rotate(60deg)}100%{opacity:0;transform:scale(.2) rotate(110deg)}}',
    '@keyframes hwGleamIdle{0%,88%,100%{opacity:0;transform:scale(0)}93%{opacity:1;transform:scale(1) rotate(45deg)}}',

    /* ---- ③ おどかしかぼちゃ ---- */
    '.hw-dark{position:absolute;inset:0;opacity:0;transition:opacity .35s ease;',
    '  background:radial-gradient(circle at var(--cxp,50%) var(--cyp,50%),rgba(6,0,10,.25) 0,rgba(6,0,10,.9) 55%,rgba(0,0,0,.96))}',
    '.hw-dark.on{opacity:1}',
    '.hw-dark.off{opacity:0;transition:opacity .7s ease}',
    /* フィルムのざらつき（暗がりの映像っぽさ）。コマ送りで位置だけ跳ばす */
    '.hw-grain{position:absolute;inset:-50%;opacity:0;background-size:160px 160px;transition:opacity .5s ease;pointer-events:none}',
    '.hw-grain.on{opacity:.17;animation:hwGrain .42s steps(1,end) infinite}',
    '@keyframes hwGrain{0%{transform:translate(0,0)}20%{transform:translate(-7%,4%)}40%{transform:translate(5%,-6%)}60%{transform:translate(-3%,-8%)}80%{transform:translate(8%,3%)}}',
    /* おばけ本体。R（キューブの見かけの大きさ）を単位に、頭・体・腕を重ねる。
       動きはわざと steps(1) のコマ送りにして、生き物らしくない「ぎこちなさ」を出す */
    '.hw-cr{position:absolute;left:0;top:0;width:0;height:0}',
    '.hw-cr.hid{visibility:hidden}',
    '.hw-cr canvas{display:block;width:100%;height:100%}',
    '.hw-cr-body,.hw-cr-arm,.hw-cr-head{position:absolute}',
    '.hw-cr-body{transform-origin:50% 0;opacity:0}',
    '.hw-cr-armin{width:100%;height:100%;transform-origin:87.3% 94%;opacity:0}',
    '.hw-cr-arm.r{transform:scaleX(-1)}',
    '.hw-cr-head{transform-origin:50% 86%;transform:translateY(calc(var(--R) * .45))}',
    '.hw-cr-tw{width:100%;height:100%;position:relative;transform-origin:50% 86%}',
    '.hw-cr-tw canvas{position:absolute;inset:0}',
    '.hw-cr-lit,.hw-cr-rb{opacity:0}',
    '.hw-cr-lit.l{clip-path:inset(0 50% 0 0)}.hw-cr-lit.r{clip-path:inset(0 0 0 50%)}',
    '.hw-cr.in .hw-cr-tw{animation:hwCrIn .34s cubic-bezier(.3,1.3,.5,1) both}',
    '@keyframes hwCrIn{0%{transform:scale(.86) rotate(-4deg)}60%{transform:scale(1.03) rotate(1deg)}100%{transform:none}}',
    '.hw-cr.eyeL .hw-cr-lit.l,.hw-cr.eyeR .hw-cr-lit.r{opacity:1;animation:hwCandle 1.9s linear infinite}',
    '@keyframes hwCandle{0%{opacity:.92}9%{opacity:.76}18%{opacity:1}31%{opacity:.84}44%{opacity:.97}57%{opacity:.72}70%{opacity:1}84%{opacity:.86}100%{opacity:.92}}',
    // 生えてくる：体は首から下へ、ガクッ、ガクッと伸びる。頭は持ち上がりながら首をかしげる
    '.hw-cr.grow .hw-cr-body{animation:hwCrBody .52s steps(1,end) both}',
    '@keyframes hwCrBody{0%{opacity:1;transform:translateY(calc(var(--R) * -.25)) scaleY(.1)}',
    '  16%{opacity:1;transform:translateY(calc(var(--R) * -.16)) scaleY(.32)}32%{opacity:1;transform:translateY(calc(var(--R) * -.18)) scaleY(.27)}',
    '  50%{opacity:1;transform:translateY(calc(var(--R) * -.08)) scaleY(.6)}68%{opacity:1;transform:translateY(calc(var(--R) * -.02)) scaleY(.84)}',
    '  84%{opacity:1;transform:scaleY(1.05)}100%{opacity:1;transform:none}}',
    '.hw-cr.grow .hw-cr-head{animation:hwCrHead .52s steps(1,end) both}',
    '@keyframes hwCrHead{0%{transform:translateY(calc(var(--R) * .45))}16%{transform:translateY(calc(var(--R) * .33)) rotate(-9deg)}',
    '  32%{transform:translateY(calc(var(--R) * .36)) rotate(5deg)}50%{transform:translateY(calc(var(--R) * .2)) rotate(-17deg)}',
    '  68%{transform:translateY(calc(var(--R) * .06)) rotate(23deg)}84%{transform:translateY(calc(var(--R) * -.03)) rotate(8deg)}100%{transform:rotate(14deg)}}',
    '.hw-cr.grow .hw-cr-armin{animation:hwCrArm .44s .16s steps(1,end) both}',
    '.hw-cr.grow .hw-cr-arm.r .hw-cr-armin{animation-delay:.25s}',
    '@keyframes hwCrArm{0%{opacity:1;transform:rotate(-150deg) scale(.35)}22%{opacity:1;transform:rotate(-96deg) scale(.6)}',
    '  40%{opacity:1;transform:rotate(-112deg) scale(.57)}60%{opacity:1;transform:rotate(-34deg) scale(.88)}80%{opacity:1;transform:rotate(9deg) scale(1.05)}100%{opacity:1;transform:none}}',
    // 生え終わった姿（.full）。アニメの最後と同じ形にしてあるので、付け替えても動かない
    '.hw-cr.full .hw-cr-body,.hw-cr.full .hw-cr-armin{opacity:1;transform:none;animation:none}',
    '.hw-cr.full .hw-cr-head{transform:rotate(14deg);animation:none}',
    // 飛びかかる直前の震え
    '.hw-cr.tense .hw-cr-tw{animation:hwTremble .1s steps(1,end) infinite}',
    '@keyframes hwTremble{0%{transform:translate(-1.2%,.6%)}33%{transform:translate(1%,-.8%)}66%{transform:translate(-.4%,-1%)}}',
    // 戻ってからの待機：ゆっくり息をして、ときどき首だけガクッと動く
    '.hw-cr.idle .hw-cr-body{animation:hwBreathe 3.8s ease-in-out infinite}',
    '@keyframes hwBreathe{0%,100%{transform:none}50%{transform:scale(1.012,1.022)}}',
    '.hw-cr.idle .hw-cr-tw{animation:hwTwitch 5.4s steps(1,end) infinite}',
    '@keyframes hwTwitch{0%{transform:none}86%{transform:rotate(-13deg)}87.5%{transform:rotate(10deg)}89%{transform:rotate(-5deg)}91%{transform:none}}',
    '.hw-cr.idle .hw-cr-armin{animation:hwClaw 2.9s ease-in-out infinite alternate}',
    '@keyframes hwClaw{from{transform:rotate(-4deg)}to{transform:rotate(3deg)}}',
    // 虹（ジャックポット）：頭を虹のかぼちゃに差し替えて、色をゆっくり回す
    '.hw-cr-rb{transition:opacity .5s ease}',
    '.hw-rb .hw-cr-rb{opacity:1;animation:hwHue 4s linear infinite}',
    '@keyframes hwHue{to{filter:hue-rotate(360deg)}}',
    // 画面いっぱいに飛びかかる層（一瞬だけ。指は素通り）
    '.hw-scare{position:fixed;inset:0;z-index:10060;pointer-events:none;overflow:hidden}',
    '.hw-shake{position:absolute;inset:0}',
    '.hw-shake.go{animation:hwShake .5s linear}',
    '@keyframes hwShake{0%,100%{transform:none}10%{transform:translate(-3%,2%) rotate(-1.5deg)}20%{transform:translate(3%,-2.5%) rotate(1.3deg)}',
    '  30%{transform:translate(-2.4%,-1.5%)}40%{transform:translate(2%,2%) rotate(-.8deg)}55%{transform:translate(-1.3%,1%)}70%{transform:translate(1%,-.8%)}85%{transform:translate(-.5%,.4%)}}',
    '.hw-big{position:absolute;width:0;height:0;will-change:transform}',
    '.hw-big.lunge{animation:hwLunge .14s cubic-bezier(.6,0,1,.55) both}',
    '.hw-big.back{animation:hwBack .5s cubic-bezier(.3,0,.25,1) both}',
    '@keyframes hwLunge{from{transform:none}to{transform:translate(var(--dx),var(--dy)) scale(var(--S))}}',
    '@keyframes hwBack{from{transform:translate(var(--dx),var(--dy)) scale(var(--S))}to{transform:none}}',
    // 色のずれ（赤と青緑の写しを左右にずらして重ねる）。一瞬だけ
    '.hw-ab{position:absolute;inset:0;mix-blend-mode:screen;opacity:0}',
    '.hw-ab.go{animation:hwAb .5s steps(1,end) both}',
    '@keyframes hwAb{0%{opacity:.75;transform:translateX(calc(var(--ax) * 1))}20%{opacity:.6;transform:translateX(calc(var(--ax) * -.6))}',
    '  40%{opacity:.7;transform:translate(calc(var(--ax) * .8),1%)}60%{opacity:.4;transform:translateX(calc(var(--ax) * .3))}80%{opacity:.2;transform:none}100%{opacity:0}}',
    '.hw-scare .hw-grain{opacity:.24;animation:hwGrain .3s steps(1,end) infinite}',
    /* 食べる：首がのびて、画面のボタンなどにかじりつく層（指は素通り） */
    '.hw-cr.headout .hw-cr-head{visibility:hidden}',
    '.hw-eat{position:fixed;inset:0;z-index:10055;pointer-events:none;overflow:hidden}',
    '.hw-neck{position:absolute;left:0;top:0;height:100px;transform-origin:50% 0;will-change:transform;border-radius:40%/6%;',
    '  background:linear-gradient(90deg,#0c0a08,#4d493c 22%,#8c8775 46%,#a29d88 52%,#5a5647 76%,#0c0a08)}',
    '.hw-neck::after{content:"";position:absolute;inset:0 30%;background:repeating-linear-gradient(180deg,rgba(0,0,0,0) 0 7px,rgba(0,0,0,.18) 7px 9px)}',
    '.hw-bulge{position:absolute;left:-30%;right:-30%;height:9%;border-radius:50%;opacity:0;',
    '  background:radial-gradient(ellipse,#8c8775 0,#5a5647 55%,rgba(0,0,0,0) 72%)}',
    '.hw-eat-head{position:absolute;left:0;top:0;will-change:transform}',
    '.hw-eat-in{position:relative;width:100%;height:100%;transform-origin:50% 70%}',
    '.hw-eat-in canvas{position:absolute;inset:0;width:100%;height:100%}',
    '.hw-eat-head .closed{opacity:0}',
    '.hw-eat-head.bit .closed{opacity:1}.hw-eat-head.bit .open{opacity:0}',
    '.hw-eat-head.chew .hw-eat-in{animation:hwChew .17s ease-in-out 3}',
    '@keyframes hwChew{0%,100%{transform:none}50%{transform:scale(1.07,.88)}}',
    '.hw-eat-head .hw-cr-lit{opacity:1;animation:hwCandle 1.9s linear infinite}',
    /* しゅ〜ん：食べられたものが戻ってくるときの光 */
    '.hw-back{position:fixed;left:0;top:0;width:0;height:0;z-index:10050;pointer-events:none}',
    '.hw-back-ring{position:absolute;border-radius:50%;border:3px solid #ffd27a;opacity:0;',
    '  box-shadow:0 0 16px rgba(255,160,50,.8),inset 0 0 12px rgba(255,160,50,.6);animation:hwBackRing .75s cubic-bezier(.2,.8,.3,1) both}',
    '@keyframes hwBackRing{0%{opacity:0;transform:scale(1.8)}30%{opacity:1}100%{opacity:0;transform:scale(.6)}}',
    '.hw-back-spk{position:absolute;width:10px;height:10px;margin:-5px 0 0 -5px;background:#fff3c0;clip-path:' + STAR + ';opacity:0;',
    '  animation:hwBackSpk .62s cubic-bezier(.4,0,.2,1) var(--d,0s) both}',
    '@keyframes hwBackSpk{0%{opacity:0;transform:translate(var(--sx),var(--sy)) scale(.4) rotate(0)}25%{opacity:1}',
    '  100%{opacity:0;transform:translate(0,0) scale(1.3) rotate(180deg)}}',
    '.hw-red{position:absolute;inset:0;opacity:0;background:radial-gradient(circle,rgba(255,40,20,.2),rgba(150,0,10,.75))}',
    '.hw-red.go{animation:hwRed .55s ease-out both}',
    '@keyframes hwRed{0%{opacity:0}14%{opacity:1}100%{opacity:0}}',
    '.hw-bat{position:absolute;opacity:0}',
    '.hw-bat.go{animation:hwBat var(--t,1s) cubic-bezier(.2,.7,.4,1) var(--dl,0s) both}',
    '@keyframes hwBat{0%{opacity:0;transform:translate(0,0) scale(.3)}15%{opacity:1}100%{opacity:0;transform:translate(var(--bx),var(--by)) scale(1.5)}}',
    '.hw-bat .hw-wing{transform-box:fill-box;transform-origin:50% 50%;animation:hwFlap .14s ease-in-out infinite alternate}',
    '@keyframes hwFlap{from{transform:scaleY(1)}to{transform:scaleY(.35)}}',

    '@media (prefers-reduced-motion: reduce){',
    '  .hw-blink,.hw-hat,.hw-bob,.hw-breath,.hw-glowfx,.hw-aura,.hw-spk,.hw-cr *,.hw-grain{animation:none!important}',
    '}'
  ].join('\n');

  let styleEl = null, defsEl = null;
  function injectAssets() {
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'halloween-style';
      styleEl.textContent = CSS;
      document.head.appendChild(styleEl);
    }
    if (!defsEl) {
      defsEl = document.createElement('div');
      defsEl.setAttribute('aria-hidden', 'true');
      defsEl.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
      defsEl.innerHTML = '<svg width="0" height="0" focusable="false">' + defsHtml(!reduced()) + '</svg>';
      document.body.appendChild(defsEl);
    }
  }

  function reduced() {
    return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function vib(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* 非対応 */ } }
  const rnd = function (a, b) { return a + Math.random() * (b - a); };

  /* ================================================================= 音 == */
  /* 1回の演出ごとに「バス」を1本作り、途中で片づけるときはバスごと絞って止める
     （予約済みの音が、キューブを崩したあとまで鳴り続けないように）。 */
  let actx = null, master = null, noiseBuf = null;
  function audio() {
    try {
      const c = global.__audioCtx ? global.__audioCtx() : null;
      if (!c) return null;
      if (c !== actx) {
        actx = c;
        const comp = c.createDynamicsCompressor();
        comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 6;
        comp.attack.value = 0.003; comp.release.value = 0.2;
        master = c.createGain();
        master.gain.value = 0.9;
        master.connect(comp); comp.connect(c.destination);
        noiseBuf = null;
      }
      if (c.state !== 'running' && c.resume) c.resume();
      return c;
    } catch (e) { return null; }
  }
  function getNoise(c) {
    if (noiseBuf) return noiseBuf;
    const len = Math.floor(c.sampleRate * 1.2);
    noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }
  function makeSfx() {
    const c = audio();
    if (!c) return null;
    const bus = c.createGain();
    bus.gain.value = 1;
    bus.connect(master);
    const T0 = c.currentTime + 0.03;
    const at = function (s) { return T0 + s; };
    function envGain(t, a, peak, d) {
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
      g.connect(bus);
      return g;
    }
    function tone(type, f0, f1, s, a, peak, d, filt) {
      const t = at(s);
      const o = c.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + a + d);
      let node = o;
      if (filt) {
        const f = c.createBiquadFilter();
        f.type = filt.type || 'lowpass';
        f.frequency.setValueAtTime(filt.f0, t);
        if (filt.f1) f.frequency.exponentialRampToValueAtTime(filt.f1, t + a + d);
        f.Q.value = filt.q || 0.8;
        o.connect(f); node = f;
      }
      node.connect(envGain(t, a, peak, d));
      o.start(t); o.stop(t + a + d + 0.05);
      return o;
    }
    function noise(s, a, peak, d, type, f0, f1, q) {
      const t = at(s);
      const src = c.createBufferSource();
      src.buffer = getNoise(c);
      const f = c.createBiquadFilter();
      f.type = type || 'bandpass';
      f.frequency.setValueAtTime(f0, t);
      if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + a + d);
      f.Q.value = q || 1;
      src.connect(f); f.connect(envGain(t, a, peak, d));
      src.start(t, Math.random() * 0.5); src.stop(t + a + d + 0.05);
    }
    return {
      c: c, bus: bus, tone: tone, noise: noise,
      keepAwake: function (ms) { if (global.__audioIdleSuspend) global.__audioIdleSuspend(c, ms); },
      kill: function () {
        try {
          const n = c.currentTime;
          bus.gain.cancelScheduledValues(n);
          bus.gain.setValueAtTime(bus.gain.value, n);
          bus.gain.linearRampToValueAtTime(0, n + 0.08);
          setTimeout(function () { try { bus.disconnect(); } catch (e) { /* 済み */ } }, 200);
        } catch (e) { /* 鳴らせない環境 */ }
      }
    };
  }
  const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66];
  const SND = {
    pop: function (x) {
      // ピシッ・ピシッ（ひび）→ パカーン（割れる）→ ぽんぽんぽん（かぼちゃが飛び出す）
      [0, 0.06, 0.11, 0.15].forEach(function (s, i) { x.noise(s, 0.002, 0.35 + i * 0.08, 0.04, 'highpass', 3200, 0, 0.7); });
      x.noise(0.2, 0.004, 0.9, 0.22, 'bandpass', 2600, 380, 1.1);
      x.tone('sine', 260, 60, 0.2, 0.004, 0.6, 0.26);
      for (let i = 0; i < 7; i++) {
        const f = PENTA[Math.floor(Math.random() * PENTA.length)];
        x.tone('sine', f, f * 1.9, 0.28 + i * 0.05, 0.005, 0.22, 0.11);
        x.tone('triangle', f * 2, f * 3, 0.28 + i * 0.05, 0.003, 0.05, 0.06);
      }
      x.keepAwake(2500);
    },
    cool: function (x) {
      // シャッ（閉まる）→ ドン（合わさる）→ シャーッ（開く）→ ジャーン＋キラーン
      x.noise(0, 0.08, 0.5, 0.22, 'bandpass', 700, 2600, 0.9);
      x.tone('sine', 110, 46, 0.3, 0.004, 0.55, 0.3);
      x.noise(0.3, 0.003, 0.3, 0.12, 'lowpass', 900, 200, 0.7);
      x.noise(0.76, 0.06, 0.45, 0.4, 'bandpass', 2600, 600, 0.8);
      [110, 164.81, 220, 261.63, 329.63].forEach(function (f, i) {
        x.tone('sawtooth', f, f, 0.92, 0.02, 0.13 - i * 0.012, 1.4, { f0: 3400, f1: 700, q: 0.7 });
        x.tone('sawtooth', f * 1.006, f * 1.006, 0.92, 0.02, 0.08, 1.3, { f0: 3000, f1: 600, q: 0.7 });
      });
      x.tone('sine', 55, 41, 0.92, 0.01, 0.5, 0.9);
      [2349.3, 3136, 4186].forEach(function (f, i) { x.tone('sine', f, f * 1.02, 1.18 + i * 0.03, 0.003, 0.16, 0.5); });
      x.keepAwake(3200);
    },
    boo: function (x, eat) {
      // 低いうなり（飛びかかる直前でぷつっと切れる＝一瞬の無音）→ 頭が落ちる鈍い音
      // → ボッ、ボッ（目に火）→ かすれた吸気 → ゴキッ、メキッ（骨が鳴る）＋湿った音
      // → ギャアアア（人の声に近い叫び＋耳ざわりな和音＋地鳴り）→ 低いうなり声
      const L = BOO_T.LUNGE / 1000;
      x.tone('sawtooth', 48, 62, 0, 0.4, 0.17, L - 0.42, { f0: 180, f1: 520, q: 1.4 });
      x.tone('sawtooth', 50.5, 65, 0, 0.4, 0.15, L - 0.42, { f0: 160, f1: 480, q: 1.4 });
      x.tone('sine', 110, 40, 0.22, 0.004, 0.55, 0.22);
      x.noise(0.22, 0.004, 0.3, 0.12, 'lowpass', 700, 160, 0.8);
      [0.44, 0.56].forEach(function (t) {
        x.noise(t, 0.02, 0.45, 0.22, 'lowpass', 300, 2400, 0.9);
        for (let i = 0; i < 4; i++) x.noise(t + 0.05 + Math.random() * 0.25, 0.001, 0.12, 0.02, 'highpass', 2500, 0, 0.7);
      });
      x.noise(0.6, 0.35, 0.14, 0.32, 'bandpass', 1300, 1700, 0.9);
      // 骨：体がガクッと伸びるたびに（0.66 秒から 0.52 秒間に6回）
      [0, 0.083, 0.166, 0.26, 0.354, 0.437].forEach(function (d, n) {
        const t = 0.66 + d;
        for (let i = 0; i < 5; i++) x.noise(t + Math.random() * 0.03, 0.001, 0.35 + Math.random() * 0.3, 0.012 + Math.random() * 0.02, 'highpass', 1600 + Math.random() * 1500, 0, 0.8);
        x.tone('sine', 140 - n * 8, 60, t, 0.002, 0.35, 0.05);
      });
      x.noise(0.7, 0.03, 0.3, 0.3, 'bandpass', 420, 1100, 3);
      x.noise(0.95, 0.03, 0.25, 0.25, 'bandpass', 500, 900, 3);
      // 食べる：首がのびる音 → ガブッ → ボリッ、ボリッ、ボリッ → ゴクン → 首が戻る音
      if (eat) {
        const E = BOO_T.EAT / 1000;
        x.noise(E, 0.08, 0.35, 0.22, 'bandpass', 400, 2200, 1.2);
        x.tone('sawtooth', 160, 90, E, 0.05, 0.08, 0.25, { type: 'bandpass', f0: 700, f1: 400, q: 4 });
        const B = E + 0.3;
        x.noise(B, 0.002, 0.95, 0.09, 'bandpass', 1500, 600, 0.8);
        x.tone('sine', 170, 55, B, 0.002, 0.7, 0.14);
        for (let i = 0; i < 6; i++) x.noise(B + Math.random() * 0.05, 0.001, 0.4, 0.015, 'highpass', 2600, 0, 0.7);
        [0.17, 0.34, 0.51].forEach(function (d) {
          for (let i = 0; i < 5; i++) x.noise(B + d + Math.random() * 0.06, 0.001, 0.3 + Math.random() * 0.25, 0.02, 'highpass', 1800 + Math.random() * 1600, 0, 0.8);
          x.noise(B + d, 0.004, 0.3, 0.07, 'bandpass', 900, 500, 1.4);
        });
        x.tone('sine', 280, 80, B + 0.62, 0.01, 0.4, 0.2);
        x.noise(B + 0.62, 0.01, 0.2, 0.18, 'lowpass', 600, 150, 1);
        x.noise(B + 0.55, 0.06, 0.25, 0.28, 'bandpass', 2000, 450, 1.2);
      }
      // 叫び
      const c = x.c, T = c.currentTime + 0.03 + L;
      try {
        const shaper = c.createWaveShaper();
        const curve = new Float32Array(1024);
        for (let i = 0; i < 1024; i++) { const v = i / 511.5 - 1; curve[i] = Math.tanh(v * 4); }
        shaper.curve = curve;
        const sg = c.createGain();
        sg.gain.setValueAtTime(0.0001, T);
        sg.gain.exponentialRampToValueAtTime(0.5, T + 0.03);
        sg.gain.setValueAtTime(0.5, T + 0.38);
        sg.gain.exponentialRampToValueAtTime(0.0001, T + 0.95);
        shaper.connect(sg); sg.connect(x.bus);
        [[760, 6], [1220, 7], [2650, 9]].forEach(function (fq) {
          const bp = c.createBiquadFilter();
          bp.type = 'bandpass'; bp.frequency.value = fq[0]; bp.Q.value = fq[1];
          bp.connect(shaper);
          [1, 1.007, 0.993].forEach(function (det) {
            const o = c.createOscillator();
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(300 * det, T);
            o.frequency.exponentialRampToValueAtTime(560 * det, T + 0.18);
            o.frequency.exponentialRampToValueAtTime(330 * det, T + 0.95);
            const lfo = c.createOscillator(), lg = c.createGain();
            lfo.frequency.value = 7 + Math.random() * 3; lg.gain.value = 22;
            lfo.connect(lg); lg.connect(o.frequency);
            o.connect(bp);
            o.start(T); o.stop(T + 1); lfo.start(T); lfo.stop(T + 1);
          });
        });
      } catch (e) { /* 叫びが作れなくても下の音は鳴らす */ }
      [92.5, 98, 138.6, 196, 277.2].forEach(function (f) {
        x.tone('sawtooth', f * 1.02, f * 0.9, L, 0.006, 0.16, 0.7, { f0: 5200, f1: 400, q: 0.9 });
      });
      x.noise(L, 0.004, 0.75, 0.5, 'bandpass', 3800, 800, 0.8);
      x.tone('sine', 85, 26, L, 0.003, 1, 0.7);
      // 戻ってからの低いうなり声
      x.tone('sawtooth', 68, 58, L + 0.62, 0.12, 0.13, 0.5, { f0: 380, f1: 220, q: 2 });
      x.noise(L + 0.62, 0.12, 0.1, 0.45, 'bandpass', 600, 380, 2);
      x.keepAwake(5600);
    },
    // しゅ〜ん：食べられたものが、光を集めながら戻ってくる
    restore: function (x) {
      x.noise(0, 0.32, 0.22, 0.32, 'bandpass', 500, 3400, 2);
      x.tone('sine', 320, 1250, 0, 0.3, 0.12, 0.3);
      [1568, 2093, 2637].forEach(function (f, i) { x.tone('sine', f, f, 0.5 + i * 0.05, 0.004, 0.1, 0.4); });
      x.keepAwake(1600);
    },
    rainbow: function (x) {
      [1046.5, 1318.5, 1568, 2093, 2637].forEach(function (f, i) {
        x.tone('sine', f, f, i * 0.06, 0.004, 0.2, 0.55);
        x.tone('triangle', f * 2, f * 2, i * 0.06, 0.003, 0.04, 0.3);
      });
      x.keepAwake(2000);
    }
  };

  /* ============================================================== 演出 == */
  let scene = null, camera = null, cubeGroup = null, container = null, cubies = null;
  let THREE = null, ready = false;
  let layer = null, anchor = null, scareEl = null;
  let active = null;          // いま出している演出 { kind, timers, raf, sfx, ... }
  let jackpotOn = false;
  const _v = { a: null, b: null, r: null, ws: null };

  function init(o) {
    THREE = global.THREE;
    if (!THREE || !o || !o.scene || !o.camera || !o.cubeGroup || !o.container) return;
    scene = o.scene; camera = o.camera; cubeGroup = o.cubeGroup; container = o.container;
    cubies = o.cubies || null;
    _v.a = new THREE.Vector3(); _v.b = new THREE.Vector3(); _v.r = new THREE.Vector3(); _v.ws = new THREE.Vector3();
    ready = true;
    global.addEventListener('resize', function () { if (active) place(); });
    // 着けていれば、起動が落ち着いたころに、おどかしの絵を焼いておく
    if (isEquipped()) setTimeout(prepareReal, 1500);
  }

  function equippedId() {
    return (global.Shop && typeof global.Shop.getEquippedMark === 'function') ? global.Shop.getEquippedMark() : null;
  }
  function isEquipped() { return equippedId() === MARK_ID; }

  /* どの演出を出すか。3つを1回ずつ入れた袋をシャッフルして順に出す（3回で必ず3つとも見られる）。
     おどかしの絵がまだ焼けていないときは、その回だけ別のものを出して、おどかしは次へ回す。
     checkSolved() は quiet() → play() の順に呼ぶので、選んだものは play() まで取っておく。 */
  let bag = [], picked = null;
  function pickKind() {
    if (picked) return picked;
    if (!bag.length) {
      bag = ['pop', 'cool', 'boo'];
      for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = bag[i]; bag[i] = bag[j]; bag[j] = t; }
    }
    let k = bag.shift();
    if (k === 'boo' && REAL.state !== 'ready') {
      prepareReal();
      bag.unshift('boo');
      k = Math.random() < 0.5 ? 'pop' : 'cool';
      const i = bag.indexOf(k);
      if (i >= 0) bag.splice(i, 1);
    }
    picked = k;
    return k;
  }
  function kind() { return isEquipped() ? pickKind() : null; }
  // おどかしは暗がりから始まるので、完成の白フラッシュ・紙吹雪・報酬の結晶は、
  // 驚かせ終わってから出したい（index.html がこれを見る）。
  function quiet() { return isEquipped() && !reduced() && pickKind() === 'boo'; }
  const QUIET_MS = 3800;   // 報酬を出すまでの待ち（index.html が読む。おどかしが戻り終わるころ）

  /* キューブの中心が画面のどこにあり、どれくらいの大きさに見えているか。
     R は「キューブの中心から、面の端まで（1.5マス）」が画面で何pxか。 */
  function measure() {
    const r = container.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    cubeGroup.updateMatrixWorld(true);
    _v.a.set(0, 0, 0); cubeGroup.localToWorld(_v.a);
    cubeGroup.getWorldScale(_v.ws);
    _v.r.set(1, 0, 0).applyQuaternion(camera.quaternion);
    _v.b.copy(_v.a).addScaledVector(_v.r, 1.5 * (_v.ws.x || 1));
    _v.a.project(camera); _v.b.project(camera);
    const cx = (_v.a.x * 0.5 + 0.5) * r.width, cy = (-_v.a.y * 0.5 + 0.5) * r.height;
    const ex = (_v.b.x * 0.5 + 0.5) * r.width, ey = (-_v.b.y * 0.5 + 0.5) * r.height;
    const R = Math.max(24, Math.hypot(ex - cx, ey - cy));
    return { cx: cx, cy: cy, R: R, rect: r };
  }
  let lastGeo = '';
  function place() {
    if (!anchor) return null;
    const g = measure();
    if (!g) return null;
    const key = Math.round(g.cx) + ',' + Math.round(g.cy) + ',' + Math.round(g.R);
    if (key !== lastGeo) {
      lastGeo = key;
      anchor.style.transform = 'translate(' + g.cx.toFixed(1) + 'px,' + g.cy.toFixed(1) + 'px)';
      anchor.style.setProperty('--R', g.R.toFixed(1) + 'px');
      anchor.style.setProperty('--cy', g.cy.toFixed(1) + 'px');
      layer.style.setProperty('--cxp', g.cx.toFixed(0) + 'px');
      layer.style.setProperty('--cyp', g.cy.toFixed(0) + 'px');
    }
    return g;
  }

  function ensureLayer() {
    injectAssets();
    if (!layer || !layer.parentNode) {
      layer = document.createElement('div');
      layer.className = 'hw-layer';
      layer.setAttribute('aria-hidden', 'true');
      container.appendChild(layer);
    }
    layer.innerHTML = '';
    layer.classList.toggle('hw-rb', false);
    anchor = document.createElement('div');
    anchor.className = 'hw-anchor';
    layer.appendChild(anchor);
    lastGeo = '';
  }

  // 要素を1つ作って、R（キューブの見かけの大きさ）を単位に置く。
  function el(cls, x, y, w, h, html) {
    const d = document.createElement('div');
    d.className = cls;
    const H = (h == null ? w : h);
    d.style.left = 'calc(var(--R) * ' + (x - w / 2).toFixed(3) + ')';
    d.style.top = 'calc(var(--R) * ' + (y - H / 2).toFixed(3) + ')';
    d.style.width = 'calc(var(--R) * ' + w.toFixed(3) + ')';
    d.style.height = 'calc(var(--R) * ' + H.toFixed(3) + ')';
    if (html) d.innerHTML = html;
    return d;
  }

  /* ---- キューブ本体（キュービー）を覚える・隠す・戻す ---- */
  function snapshotCube(st) {
    st.snap = [];
    const list = (cubies && cubies.length) ? cubies.slice() : [];
    const set = new Set(list);
    cubeGroup.children.forEach(function (ch) {
      st.snap.push({ o: ch, p: ch.position.clone(), q: ch.quaternion.clone(), s: ch.scale.clone(), v: ch.visible, cubie: set.has(ch) });
    });
  }
  function hideCube(st, onlyOthers) {
    (st.snap || []).forEach(function (e) {
      if (onlyOthers && e.cubie) return;
      e.o.visible = false;
    });
  }
  function restoreCube(st) {
    (st.snap || []).forEach(function (e) {
      if (e.o.parent !== cubeGroup) return;   // 作り直されたキュービーには触らない
      e.o.position.copy(e.p); e.o.quaternion.copy(e.q); e.o.scale.copy(e.s); e.o.visible = e.v;
    });
    st.snap = null;
  }

  function later(st, fn, ms) {
    st.timers.push(setTimeout(function () {
      if (active !== st) return;
      try { fn(); } catch (err) { if (global.console) console.warn('HalloweenFX:', err); }
    }, ms));
  }
  function kick(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
  }

  /* ---- ジャックポット：かぼちゃを虹色に化けさせる ---- */
  function goRainbow(withFx) {
    if (!active || !layer) return;
    if (layer.classList.contains('hw-rb')) return;
    layer.classList.add('hw-rb');
    if (scareEl) scareEl.classList.add('hw-rb');
    if (!withFx || reduced()) return;
    layer.querySelectorAll('.hw-art').forEach(function (a) { kick(a, 'hw-rbpop'); });
    const ring = el('hw-ring', 0, 0, 2.6);
    anchor.appendChild(ring);
    kick(ring, 'go');
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, d = rnd(0.9, 1.8);
      const s = el('hw-spk', Math.cos(a) * d, Math.sin(a) * d, rnd(0.12, 0.22));
      s.style.setProperty('--tt', rnd(1.6, 2.6).toFixed(2) + 's');
      s.style.setProperty('--td', (i * 0.07).toFixed(2) + 's');
      anchor.appendChild(s);
    }
    const x = makeSfx();
    if (x) SND.rainbow(x);
    vib([30, 40, 30, 40, 80]);
  }
  function jackpot() {
    if (!active) return;
    jackpotOn = true;
    // おどかしかぼちゃは、飛びかかってくる最中なら戻ってきてから化ける
    if (active.kind === 'boo' && active.busy) { active.rbPending = true; return; }
    goRainbow(true);
  }

  // 抽選の結果を受け取る。handleClearReward() を外から包むだけで、中身には触らない。
  function hookReward() {
    const f = global.handleClearReward;
    if (typeof f !== 'function' || f.__hw) return;
    const wrapped = function () {
      const r = f.apply(this, arguments);
      try { if (r && r.jackpot) jackpot(); } catch (e) { /* 演出だけの話なので、報酬は止めない */ }
      return r;
    };
    wrapped.__hw = true;
    global.handleClearReward = wrapped;
  }

  /* ------------------------------------------------ ① かぼちゃポップ -- */
  // 位置と大きさは R（キューブの見かけの半分の幅）が単位。全体を MINI_K 倍して置く
  const MINI_K = 1.3;
  const MINIS = [
    { x: 0,     y: 0.06,  s: 1.05, f: 'smile',  hat: true },
    { x: -1.05, y: -0.55, s: 0.7,  f: 'wink' },
    { x: 1.06,  y: -0.6,  s: 0.66, f: 'oh',     hat: true },
    { x: -1.2,  y: 0.52,  s: 0.64, f: 'sleepy' },
    { x: 1.18,  y: 0.5,   s: 0.72, f: 'smile',  leaf: true },
    { x: -0.32, y: -1.14, s: 0.56, f: 'oh',     leaf: true },
    { x: 0.42,  y: 1.12,  s: 0.6,  f: 'wink' }
  ].map(function (m) { return Object.assign({}, m, { x: m.x * MINI_K, y: m.y * MINI_K, s: m.s * MINI_K }); });
  const CRACK = '<svg viewBox="-100 -100 200 200"><path pathLength="100" d="M-4-6 L-20-24 L-16-40 L-34-62 M-20-24 L-44-20 L-62-34"/>' +
    '<path pathLength="100" d="M2 4 L22 18 L18 36 L40 58 M22 18 L46 12 L64 24"/>' +
    '<path pathLength="100" d="M4-4 L26-18 L48-14 M26-18 L30-44"/><path pathLength="100" d="M-4 6 L-22 22 L-46 26 M-22 22 L-26 50"/></svg>';

  function playPop(st, g) {
    const R = reduced();
    snapshotCube(st);
    const aura = el('hw-aura', 0, 0.06, 2.4);
    anchor.appendChild(aura);

    const minis = MINIS.map(function (m, i) {
      const d = el('hw-mini', m.x, m.y, m.s);
      d.style.setProperty('--fx', 'calc(var(--R) * ' + (-m.x).toFixed(2) + ')');
      d.style.setProperty('--fy', 'calc(var(--R) * ' + (-m.y).toFixed(2) + ')');
      d.style.setProperty('--d', (i * 0.045).toFixed(3) + 's');
      d.style.setProperty('--bt', rnd(2.2, 3.4).toFixed(2) + 's');
      d.style.setProperty('--bd', (-rnd(0, 3)).toFixed(2) + 's');
      d.style.setProperty('--bkd', (-rnd(0, 4.6)).toFixed(2) + 's');
      d.innerHTML = '<div class="hw-bob"><div class="hw-art">' + pumpkinSvg(m.f, { hat: m.hat, leaf: m.leaf }) + '</div></div>';
      return d;
    });
    const sparks = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rnd(-0.3, 0.3), dist = rnd(0.9, 2.2);
      const s = el('hw-spk', Math.cos(a) * dist, Math.sin(a) * dist * 0.9, rnd(0.1, 0.2));
      s.style.setProperty('--tt', rnd(1.8, 3).toFixed(2) + 's');
      s.style.setProperty('--td', (-rnd(0, 3)).toFixed(2) + 's');
      sparks.push(s);
    }

    if (R) {
      hideCube(st);
      minis.forEach(function (d) { d.classList.add('still'); anchor.appendChild(d); });
      return;
    }

    const crack = el('hw-crack', 0, 0, 2.6, 2.6, CRACK);
    const flash = el('hw-flash', 0, 0, 3.2);
    anchor.appendChild(crack);
    anchor.appendChild(flash);
    kick(crack, 'go');

    // キュービーが中心から外へ弾けて、回りながら小さくなって消える
    const parts = (st.snap || []).filter(function (e) { return e.cubie; }).map(function (e) {
      const dir = e.p.clone();
      if (dir.lengthSq() < 0.01) dir.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1));
      dir.normalize().add(new THREE.Vector3(rnd(-0.35, 0.35), rnd(-0.2, 0.5), rnd(-0.35, 0.35))).normalize();
      return {
        e: e, dir: dir, dist: rnd(4.5, 8),
        axis: new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize(),
        ang: rnd(2, 6) * (Math.random() < 0.5 ? -1 : 1),
        jit: new THREE.Vector3()
      };
    });
    const qTmp = new THREE.Quaternion();
    const T_CRACK = 200, T_BURST = 520;
    const t0 = performance.now();
    function step(now) {
      if (active !== st) return;
      const t = now - t0;
      if (t < T_CRACK) {
        const k = t / T_CRACK;
        parts.forEach(function (p) {
          p.jit.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(0.035 * k);
          p.e.o.position.copy(p.e.p).add(p.jit);
        });
      } else {
        const k = Math.min(1, (t - T_CRACK) / T_BURST);
        const e = 1 - Math.pow(1 - k, 3);
        parts.forEach(function (p) {
          p.e.o.position.copy(p.e.p).addScaledVector(p.dir, p.dist * e);
          qTmp.setFromAxisAngle(p.axis, p.ang * e);
          p.e.o.quaternion.copy(qTmp).multiply(p.e.q);
          const sc = Math.max(0.001, 1 - Math.pow(k, 1.4));
          p.e.o.scale.copy(p.e.s).multiplyScalar(sc);
        });
        if (k >= 1) { hideCube(st); st.raf = null; return; }
      }
      st.raf = requestAnimationFrame(step);
    }
    st.raf = requestAnimationFrame(step);

    later(st, function () {
      hideCube(st, true);   // ラベルの板などは、割れた瞬間に消す
      kick(flash, 'go');
      vib([0, 30, 20, 50]);
      minis.forEach(function (d) { anchor.appendChild(d); d.classList.add('pop'); });
    }, T_CRACK);
    later(st, function () { sparks.forEach(function (s) { anchor.appendChild(s); }); }, T_CRACK + 380);
  }

  /* ------------------------------------------------ ② キリッとかぼちゃ -- */
  function playCool(st, g) {
    const R = reduced();
    snapshotCube(st);
    const spot = document.createElement('div');
    spot.className = 'hw-spot';
    spot.style.left = 'calc(var(--R) * -2.1)';
    spot.style.width = 'calc(var(--R) * 4.2)';
    spot.style.top = 'calc(var(--cy) * -1)';
    spot.style.height = 'calc(var(--cy) + var(--R) * 1.45)';
    const floor = el('hw-floor', 0, 1.25, 3, 0.7);
    const aura = el('hw-aura', 0, 0, 3);
    const cool = el('hw-cool', 0, -0.02, 2.55);
    cool.innerHTML = '<div class="hw-breath"><div class="hw-art">' + pumpkinSvg('cool') + '</div></div>';
    const gleam = el('hw-gleam', 0.62, -0.34, 0.5);
    anchor.appendChild(spot); anchor.appendChild(floor); anchor.appendChild(aura); anchor.appendChild(cool); anchor.appendChild(gleam);

    if (R) {
      hideCube(st);
      cool.classList.add('still');
      spot.style.opacity = '.6';
      floor.classList.add('show');
      return;
    }

    const cur = document.createElement('div');
    cur.className = 'hw-curtain';
    cur.innerHTML = '<div class="hw-val"></div><div class="hw-cur l"></div><div class="hw-cur r"></div><div class="hw-seam"></div>';
    layer.appendChild(cur);
    void cur.offsetWidth;
    cur.classList.add('close');
    later(st, function () { vib(25); hideCube(st); }, 300);
    // 抽選（約0.56秒）が終わってから開ける。当たっていれば、開いた時点でもう虹色
    later(st, function () { cur.classList.remove('close'); cur.classList.add('open'); }, 780);
    later(st, function () {
      cool.classList.add('show'); spot.classList.add('show'); floor.classList.add('show');
      vib([0, 40, 30, 70]);
    }, 900);
    later(st, function () { gleam.classList.add('go'); }, 1180);
    later(st, function () { if (cur.parentNode) cur.parentNode.removeChild(cur); }, 1500);
  }

  /* ------------------------------------------------ ③ おどかし（リアル） -- */
  /* 絵を canvas に焼く。SVG を画像として読み込み、1回だけ描く。
     重いフィルタの計算はここでしか走らないので、動かすときは軽い。 */
  const REAL = { state: 'none', c: {}, grain: null };
  function bake(svg, w, h) {
    return new Promise(function (ok, ng) {
      const img = new Image();
      img.onload = function () {
        try {
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          ok(c);
        } catch (e) { ng(e); }
      };
      img.onerror = ng;
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }
  // 叫ぶ顔の、赤だけ・青緑だけの写し（色ずれ用）。小さめで十分
  function tint(src, color) {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0, 512, 512);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = color; g.fillRect(0, 0, 512, 512);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(src, 0, 0, 512, 512);
    return c;
  }
  function makeGrain() {
    const c = document.createElement('canvas');
    c.width = c.height = 160;
    const g = c.getContext('2d');
    const d = g.createImageData(160, 160);
    for (let i = 0; i < d.data.length; i += 4) {
      const v = Math.random() * 255;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
      d.data[i + 3] = 90 + Math.random() * 120;
    }
    g.putImageData(d, 0, 0);
    try { return c.toDataURL('image/png'); } catch (e) { return null; }
  }
  function prepareReal() {
    if (REAL.state !== 'none') return;
    REAL.state = 'loading';
    const jobs = [
      ['headD', function () { return bake(rHead('normal', false, false, 512), 512, 512); }],
      ['headL', function () { return bake(rHead('normal', true, false, 512), 512, 512); }],
      ['body', function () { return bake(rBody(), 500, 640); }],
      ['arm', function () { return bake(rArm(), 300, 500); }],
      ['scream', function () { return bake(rHead('scream', true, false, 1024), 1024, 1024); }],
      ['headRb', function () { return bake(rHead('normal', true, true, 512), 512, 512); }]
    ];
    let k = 0;
    (function next() {
      if (k >= jobs.length) {
        try { REAL.c.abR = tint(REAL.c.scream, '#ff2a2a'); REAL.c.abC = tint(REAL.c.scream, '#20e8ff'); } catch (e) { /* 色ずれなしで続ける */ }
        REAL.grain = makeGrain();
        REAL.state = 'ready';
        return;
      }
      const job = jobs[k++];
      // 1枚ずつ、間をあけて焼く（ゲームの操作を引っかからせない）
      job[1]().then(function (c) { REAL.c[job[0]] = c; setTimeout(next, 60); },
                    function () { REAL.state = 'failed'; });
    })();
  }
  function copyOf(name, cls) {
    const m = REAL.c[name];
    const c = document.createElement('canvas');
    if (cls) c.className = cls;
    if (!m) return c;
    c.width = m.width; c.height = m.height;
    c.getContext('2d').drawImage(m, 0, 0);
    return c;
  }
  function grainEl() {
    const d = document.createElement('div');
    d.className = 'hw-grain';
    if (REAL.grain) d.style.backgroundImage = 'url(' + REAL.grain + ')';
    return d;
  }

  /* おばけの組み立て（単位は R、原点はキューブの中心）。
       頭：一辺 2.1。最後は中心が (0, -0.45) に来て、首を 14° かしげる
       体：幅 3.0 × 高さ 3.84。首の付け根が y=0.3
       腕：幅 1.5 × 高さ 2.5。肩（絵の右下）が体の肩 (±0.9, 1.62) に来る。右腕は左右反転 */
  const CR = { HEAD: 2.1, HY: -0.45, BW: 3.0, BH: 3.84, BY: 0.3, AW: 1.5, AH: 2.5, AX: 1.46, AY: 0.52 };
  function creature(scream) {
    const root = document.createElement('div');
    root.className = 'hw-cr';
    const body = el('hw-cr-body', 0, CR.BY + CR.BH / 2, CR.BW, CR.BH);
    body.appendChild(copyOf('body'));
    root.appendChild(body);
    ['l', 'r'].forEach(function (side) {
      const a = el('hw-cr-arm ' + side, side === 'l' ? -CR.AX : CR.AX, CR.AY, CR.AW, CR.AH);
      const inner = document.createElement('div');
      inner.className = 'hw-cr-armin';
      inner.appendChild(copyOf('arm'));
      a.appendChild(inner);
      root.appendChild(a);
    });
    const head = el('hw-cr-head', 0, CR.HY, CR.HEAD, CR.HEAD);
    const tw = document.createElement('div');
    tw.className = 'hw-cr-tw';
    if (scream) {
      tw.appendChild(copyOf('scream'));
      if (REAL.c.abR) {
        const r = copyOf('abR', 'hw-ab'); r.style.setProperty('--ax', '4%');
        const c = copyOf('abC', 'hw-ab'); c.style.setProperty('--ax', '-4%');
        tw.appendChild(r); tw.appendChild(c);
      }
    } else {
      tw.appendChild(copyOf('headD'));
      tw.appendChild(copyOf('headL', 'hw-cr-lit l'));
      tw.appendChild(copyOf('headL', 'hw-cr-lit r'));
      tw.appendChild(copyOf('headRb', 'hw-cr-rb'));
    }
    head.appendChild(tw);
    root.appendChild(head);
    return root;
  }

  /* おどかしの時間割（ms）。EAT で首がのびて画面の何かを食べに行き、LUNGE で飛びかかる */
  const BOO_T = { EAT: 1400, TENSE: 2600, LUNGE: 2750 };

  /* ---- 画面の何かを食べる ----
     ねらうのは、いま画面に見えていて指で触れるもの全部（ボタン・タイマー・ベストタイム・
     シャードの残高・シャッフルのつまみ・回転記号のボタン など）。キューブの場所と、
     開いていない画面の中身は除く。前回と同じものは続けて選ばない。
     食べ方は Web Animations で要素そのものを縮めて消すだけ（クラスもスタイルも書き換えない）。
     戻すときはそのアニメを取り消す＝元どおり。 */
  const EAT_SEL = 'button, [role="button"], a[href], #timer, #best-time, .wallet-pill, #shuffle-slider, .slot-btn';
  let lastEaten = null, eaten = null, eatEl = null;
  function eatCandidates() {
    const vw = global.innerWidth, vh = global.innerHeight;
    const list = Array.prototype.filter.call(document.querySelectorAll(EAT_SEL), function (e) {
      if (!e.getBoundingClientRect || (container && container.contains(e))) return false;
      const r = e.getBoundingClientRect();
      if (r.width < 18 || r.height < 14 || r.bottom < 4 || r.right < 4 || r.top > vh - 4 || r.left > vw - 4) return false;
      if (r.width > vw * 0.95 && r.height > vh * 0.4) return false;
      const x = Math.min(vw - 1, Math.max(0, r.left + r.width / 2));
      const y = Math.min(vh - 1, Math.max(0, r.top + r.height / 2));
      const hit = document.elementFromPoint(x, y);
      return !!hit && (hit === e || e.contains(hit));
    });
    // 入れ子になっているときは外側だけ残す（ボタンの中の文字だけ食べる、を避ける）
    return list.filter(function (e) { return !list.some(function (o) { return o !== e && o.contains(e); }); });
  }
  function pickTarget() {
    const c = eatCandidates();
    if (!c.length) return null;
    let pool = c.filter(function (e) { return e !== lastEaten; });
    if (!pool.length) pool = c;
    const t = pool[Math.floor(Math.random() * pool.length)];
    lastEaten = t;
    return t;
  }
  function swallow(el, mx, my) {
    if (!el || typeof el.animate !== 'function') return;
    const r = el.getBoundingClientRect();
    const dx = (mx - (r.left + r.width / 2)) * 0.3, dy = (my - (r.top + r.height / 2)) * 0.3;
    try {
      const a = el.animate([
        { transform: 'none', opacity: 1, filter: 'none' },
        { transform: 'translate(' + dx.toFixed(0) + 'px,' + dy.toFixed(0) + 'px) scale(.06) rotate(20deg)', opacity: 0, filter: 'brightness(.35)' }
      ], { duration: 190, easing: 'cubic-bezier(.6,0,1,.6)', fill: 'forwards' });
      eaten = { el: el, anim: a };
    } catch (e) { eaten = null; }
  }
  // しゅ〜ん：光の粒が集まって、食べられたものが小さな点から元の大きさへ戻る
  function restoreEaten(withFx) {
    if (!eaten) return;
    const e = eaten;
    eaten = null;
    try { e.anim.cancel(); } catch (err) { /* もう消えていれば何もしない */ }
    if (!withFx || reduced() || !document.body.contains(e.el)) return;
    try {
      e.el.animate([
        { transform: 'scale(.04) rotate(-35deg)', opacity: 0, filter: 'blur(6px) brightness(2.4)' },
        { transform: 'scale(1.12) rotate(5deg)', opacity: 1, filter: 'blur(0) brightness(1.5)', offset: 0.62 },
        { transform: 'scale(.97) rotate(-1deg)', opacity: 1, filter: 'brightness(1.12)', offset: 0.82 },
        { transform: 'none', opacity: 1, filter: 'none' }
      ], { duration: 780, easing: 'cubic-bezier(.2,.8,.3,1)' });
    } catch (err) { /* 戻すだけで済ませる */ }
    const r = e.el.getBoundingClientRect();
    const fx = document.createElement('div');
    fx.className = 'hw-back';
    fx.setAttribute('aria-hidden', 'true');
    fx.style.transform = 'translate(' + (r.left + r.width / 2).toFixed(0) + 'px,' + (r.top + r.height / 2).toFixed(0) + 'px)';
    const D = Math.max(r.width, r.height) * 1.25 + 20;
    const ring = document.createElement('div');
    ring.className = 'hw-back-ring';
    ring.style.cssText = 'width:' + D + 'px;height:' + D + 'px;left:' + (-D / 2) + 'px;top:' + (-D / 2) + 'px';
    fx.appendChild(ring);
    for (let i = 0; i < 10; i++) {
      const sp = document.createElement('div');
      sp.className = 'hw-back-spk';
      const a = i / 10 * Math.PI * 2, d = D * rnd(0.6, 0.95);
      sp.style.setProperty('--sx', (Math.cos(a) * d).toFixed(0) + 'px');
      sp.style.setProperty('--sy', (Math.sin(a) * d).toFixed(0) + 'px');
      sp.style.setProperty('--d', (i * 0.025).toFixed(3) + 's');
      fx.appendChild(sp);
    }
    document.body.appendChild(fx);
    setTimeout(function () { if (fx.parentNode) fx.parentNode.removeChild(fx); }, 1000);
    const x = makeSfx();
    if (x) SND.restore(x);
  }
  function removeEatLayer() {
    if (eatEl && eatEl.parentNode) eatEl.parentNode.removeChild(eatEl);
    eatEl = null;
  }

  // 首がのびて、頭がねらったものへかじりつき、噛んで飲みこんで戻ってくる（約1.1秒）
  function eatPhase(st, cr, target) {
    const g = place() || st.geo;
    const rect = container.getBoundingClientRect();
    if (!g || !rect.width || !document.body.contains(target)) return;
    const vw = global.innerWidth;
    const cx = rect.left + g.cx, cy = rect.top + g.cy, R = g.R;
    const H0 = CR.HEAD * R;
    const home = { x: cx, y: cy + CR.HY * R, s: H0, r: 14 };
    const base = { x: cx, y: cy + (CR.BY + 0.08) * R };
    const tr = target.getBoundingClientRect();
    const tx = tr.left + tr.width / 2, ty = tr.top + tr.height / 2;
    // 口の幅は頭の約6割。ねらったものを口でおおえる大きさまで頭を変える
    const hs = Math.max(1.25 * R, Math.min(2.8 * R, Math.max(tr.width / 0.55, tr.height / 0.4)));
    const dest = { x: tx, y: ty - 0.22 * hs, s: hs, r: Math.max(-28, Math.min(28, (tx - cx) / vw * 50)) };

    removeEatLayer();
    eatEl = document.createElement('div');
    eatEl.className = 'hw-eat' + (layer.classList.contains('hw-rb') ? ' hw-rb' : '');
    eatEl.setAttribute('aria-hidden', 'true');
    const neck = document.createElement('div');
    neck.className = 'hw-neck';
    const NW = 0.3 * R;
    neck.style.width = NW.toFixed(1) + 'px';
    neck.style.marginLeft = (-NW / 2).toFixed(1) + 'px';
    const bulge = document.createElement('div');
    bulge.className = 'hw-bulge';
    neck.appendChild(bulge);
    const head = document.createElement('div');
    head.className = 'hw-eat-head';
    const inner = document.createElement('div');
    inner.className = 'hw-eat-in';
    inner.appendChild(copyOf('scream', 'open'));
    inner.appendChild(copyOf('headD', 'closed'));
    inner.appendChild(copyOf('headL', 'closed hw-cr-lit'));
    head.appendChild(inner);
    eatEl.appendChild(neck);
    eatEl.appendChild(head);
    document.body.appendChild(eatEl);
    cr.classList.add('headout');

    const ease = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
    const lerp = function (a, b, t) { return a + (b - a) * t; };
    function draw(p) {
      const x = lerp(home.x, dest.x, p), y = lerp(home.y, dest.y, p), sz = lerp(home.s, dest.s, p), rot = lerp(home.r, dest.r, p);
      head.style.width = head.style.height = sz.toFixed(1) + 'px';
      head.style.transform = 'translate(' + (x - sz / 2).toFixed(1) + 'px,' + (y - sz / 2).toFixed(1) + 'px) rotate(' + rot.toFixed(1) + 'deg)';
      // 首は付け根から、頭の「付け根に向いた側」のふちまで（頭が下へ行っても頭を突き抜けない）
      const vx = base.x - x, vy = base.y - y, vl = Math.max(1, Math.hypot(vx, vy));
      const jx = x + vx / vl * sz * 0.34, jy = y + vy / vl * sz * 0.34;
      const dx = jx - base.x, dy = jy - base.y;
      const len = Math.max(1, Math.hypot(dx, dy));
      const ang = Math.atan2(dy, dx) * 180 / Math.PI - 90;
      neck.style.transform = 'translate(' + base.x.toFixed(1) + 'px,' + base.y.toFixed(1) + 'px) rotate(' + ang.toFixed(1) + 'deg) scaleY(' + (len / 100).toFixed(3) + ')';
    }
    const OUT = 300, HOLD = 520, BACK = 320;
    const t0 = performance.now();
    let bitten = false, gulped = false;
    function step(now) {
      if (active !== st || !eatEl) return;
      const t = now - t0;
      if (t < OUT) {
        draw(ease(t / OUT));
      } else if (t < OUT + HOLD) {
        draw(1);
        if (!bitten) {
          bitten = true;
          head.classList.add('bit', 'chew');
          swallow(target, dest.x, dest.y + dest.s * 0.24);
          vib([0, 45, 40, 30, 40, 30]);
        }
      } else if (t < OUT + HOLD + BACK) {
        const p = (t - OUT - HOLD) / BACK;
        draw(1 - ease(p));
        if (!gulped) {
          gulped = true;
          // ごくん：首のふくらみが、頭から体へ下りていく
          bulge.animate([{ top: '0%', opacity: 1 }, { top: '92%', opacity: 1 }, { top: '96%', opacity: 0 }], { duration: BACK + 80, easing: 'ease-in' });
        }
      } else {
        removeEatLayer();
        cr.classList.remove('headout');
        st.raf = null;
        return;
      }
      st.raf = requestAnimationFrame(step);
    }
    draw(0);
    st.raf = requestAnimationFrame(step);
  }

  function playBoo(st, g) {
    if (REAL.state !== 'ready') { st.kind = 'cool'; playCool(st, g); return; }
    const R = reduced();
    snapshotCube(st);
    st.geo = g;
    anchor.appendChild(el('hw-aura', 0, CR.HY, 3.2));
    const cr = creature(false);

    if (R) {
      hideCube(st);
      cr.classList.add('full', 'eyeL', 'eyeR');
      anchor.appendChild(cr);
      return;
    }

    st.busy = true;
    const dark = document.createElement('div');
    dark.className = 'hw-dark';
    const grain = grainEl();
    layer.insertBefore(dark, anchor);
    layer.appendChild(grain);
    void dark.offsetWidth;
    dark.classList.add('on');
    grain.classList.add('on');
    cr.classList.add('hid');
    anchor.appendChild(cr);
    st.cr = cr; st.dark = dark; st.grain = grain;

    later(st, function () {           // キューブが、本物のようなかぼちゃの頭に変わる
      hideCube(st);
      cr.classList.remove('hid');
      cr.classList.add('in');
    }, 220);
    later(st, function () { cr.classList.add('eyeL'); vib(18); }, 440);
    later(st, function () { cr.classList.add('eyeR'); vib(18); }, 560);
    later(st, function () {           // 首と体と腕が、コマ送りで生えてくる
      cr.classList.remove('in');
      cr.classList.add('grow');
      vib([0, 12, 70, 12, 70, 12, 70, 12, 70, 20]);
    }, 660);
    if (st.target) later(st, function () { cr.classList.remove('grow'); cr.classList.add('full'); eatPhase(st, cr, st.target); }, BOO_T.EAT);
    later(st, function () { cr.classList.add('tense'); }, BOO_T.TENSE);
    later(st, function () { lunge(st, cr); }, BOO_T.LUNGE);
  }

  // 画面いっぱいに飛びかかってくる。キューブの場所にいるおばけと同じ大きさ・同じ位置に、
  // 叫ぶ顔の写しを全画面の層に置いてから、こちらへ向かって一気に大きくする。
  function lunge(st, cr) {
    const g = place() || st.geo;
    const rect = container.getBoundingClientRect();
    const vw = global.innerWidth, vh = global.innerHeight;
    if (!g || !rect.width) { finishBoo(st); return; }
    const cx = rect.left + g.cx, cy = rect.top + g.cy, R = g.R;
    scareEl = document.createElement('div');
    scareEl.className = 'hw-scare' + (layer.classList.contains('hw-rb') ? ' hw-rb' : '');
    scareEl.setAttribute('aria-hidden', 'true');
    const red = document.createElement('div');
    red.className = 'hw-red';
    const shake = document.createElement('div');
    shake.className = 'hw-shake';
    const big = document.createElement('div');
    big.className = 'hw-big';
    big.style.left = cx + 'px'; big.style.top = cy + 'px';
    big.style.setProperty('--R', R.toFixed(1) + 'px');
    const hy = CR.HY * R;                         // 頭の中心（キューブの中心から）
    big.style.transformOrigin = '0 ' + hy.toFixed(1) + 'px';
    const S = Math.max(2.4, (vw * 1.3) / (CR.HEAD * R), (vh * 0.8) / (CR.HEAD * R));
    big.style.setProperty('--dx', (vw / 2 - cx).toFixed(0) + 'px');
    big.style.setProperty('--dy', (vh * 0.42 - (cy + hy)).toFixed(0) + 'px');
    big.style.setProperty('--S', S.toFixed(2));
    const scr = creature(true);
    scr.classList.add('full');
    big.appendChild(scr);
    shake.appendChild(big);
    scareEl.appendChild(shake);
    scareEl.appendChild(red);
    scareEl.appendChild(grainEl());
    for (let i = 0; i < 6; i++) {             // コウモリが四方へ散る
      const b = document.createElement('div');
      b.className = 'hw-bat';
      const w = rnd(46, 80);
      b.style.left = (cx - w / 2) + 'px'; b.style.top = (cy + hy - w / 4) + 'px';
      b.style.width = w + 'px'; b.style.height = (w / 2) + 'px';
      const a = (i / 6) * Math.PI * 2 + rnd(-0.3, 0.3), d = Math.max(vw, vh) * rnd(0.55, 0.8);
      b.style.setProperty('--bx', (Math.cos(a) * d).toFixed(0) + 'px');
      b.style.setProperty('--by', (Math.sin(a) * d - 40).toFixed(0) + 'px');
      b.style.setProperty('--t', rnd(0.7, 1.1).toFixed(2) + 's');
      b.style.setProperty('--dl', rnd(0, 0.1).toFixed(2) + 's');
      b.innerHTML = BAT;
      scareEl.appendChild(b);
    }
    document.body.appendChild(scareEl);
    cr.classList.add('hid');
    void big.offsetWidth;
    big.classList.add('lunge');
    kick(red, 'go');
    kick(shake, 'go');
    scareEl.querySelectorAll('.hw-ab').forEach(function (a) { a.classList.add('go'); });
    scareEl.querySelectorAll('.hw-bat').forEach(function (b) { b.classList.add('go'); });
    vib([0, 260, 60, 360]);

    later(st, function () { big.classList.remove('lunge'); big.classList.add('back'); }, 560);
    later(st, function () { finishBoo(st); }, 1000);
  }

  function finishBoo(st) {
    if (scareEl && scareEl.parentNode) scareEl.parentNode.removeChild(scareEl);
    scareEl = null;
    const cr = st.cr;
    if (cr) {
      cr.classList.remove('hid', 'tense', 'grow', 'in');
      cr.classList.add('full', 'idle', 'eyeL', 'eyeR');
    }
    if (st.dark) { st.dark.classList.add('off'); st.dark.classList.remove('on'); }
    if (st.grain) {
      st.grain.classList.remove('on');
      const gr = st.grain;
      later(st, function () { if (gr.parentNode) gr.parentNode.removeChild(gr); }, 700);
    }
    st.busy = false;
    later(st, function () { restoreEaten(true); }, 120);
    if (typeof st.onCelebrate === 'function') { try { st.onCelebrate(); } catch (e) { /* 紙吹雪が出なくても続ける */ } }
    if (st.rbPending) { st.rbPending = false; goRainbow(true); }
  }

  /* ---------------------------------------------------------------- 入口 -- */
  function play(opts) {
    opts = opts || {};
    if (!ready) return false;
    if (!opts.kind && !isEquipped()) return false;
    const k = opts.kind || pickKind();
    picked = null;
    stop();
    hookReward();
    ensureLayer();
    jackpotOn = false;
    const st = { kind: k, timers: [], raf: null, sfx: null, snap: null, busy: false, rbPending: false, onCelebrate: opts.onCelebrate || null };
    active = st;
    const g = place();
    if (!g) { active = null; return false; }
    // 画面の向きを変えたときなどに置き直す（位置が変わったときだけ書き換える）
    st.timers.push(setInterval(function () { if (active === st) place(); }, 400));
    if (k === 'boo' && !reduced() && REAL.state === 'ready') st.target = pickTarget();
    if (!reduced()) {
      st.sfx = makeSfx();
      if (st.sfx && SND[k]) { try { SND[k](st.sfx, !!st.target); } catch (e) { /* 音なしで続ける */ } }
    }
    try {
      if (k === 'pop') playPop(st, g);
      else if (k === 'cool') playCool(st, g);
      else playBoo(st, g);
    } catch (err) {
      if (global.console) console.warn('HalloweenFX:', err);
      stop();
      return false;
    }
    // 「動きを減らす」設定なら、紙吹雪などの合図はすぐ返す
    if (k === 'boo' && reduced() && typeof st.onCelebrate === 'function') st.onCelebrate();
    return true;
  }

  function stop() {
    // 着けたばかり・1手動かしたところ、などで呼ばれる。おどかしの絵をまだ焼いていなければ焼き始める
    if (isEquipped()) prepareReal();
    const st = active;
    active = null;
    jackpotOn = false;
    if (st) {
      st.timers.forEach(function (id) { clearTimeout(id); clearInterval(id); });
      if (st.raf) cancelAnimationFrame(st.raf);
      if (st.sfx) st.sfx.kill();
      restoreCube(st);
    }
    if (scareEl && scareEl.parentNode) scareEl.parentNode.removeChild(scareEl);
    scareEl = null;
    removeEatLayer();
    restoreEaten(true);
    if (layer) { layer.innerHTML = ''; layer.classList.remove('hw-rb'); }
    anchor = null;
  }

  global.HalloweenFX = {
    init: init, play: play, stop: stop, jackpot: jackpot,
    isEquipped: isEquipped, kind: kind, quiet: quiet, QUIET_MS: QUIET_MS,
    isActive: function () { return !!active; },
    // 確認用（ブラウザの開発ツールから HalloweenFX._test('boo', true) などで流せる）
    _test: function (k, rb) { const ok = play({ kind: k }); if (ok && rb) setTimeout(jackpot, 600); return ok; },
    _prepare: prepareReal, _real: REAL,
    _force: function (k) { picked = k; }
  };
})(window);
