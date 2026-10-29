/* =====================================================================
   halloween.js — ハロウィン限定の品揃えと、かぼちゃスキンの完成演出
   ---------------------------------------------------------------------
   このファイル1枚で、ショップに次の5品を足す（読み込みをやめれば全部消える）。
     ・メインカラー「ハロウィン」 … オレンジと赤のあいだを、ジャック・オ・ランタンの
                                  炎のようにゆっくり行き来する（index.html の blend）
     ・キューブカラー「ハロウィン」… 骨の白／キャンディコーンの黄／血の赤／かぼちゃの橙／
                                  スライムの緑／魔女の紫。赤と橙は色相を32°離してある
     ・キューブスキン3種（スイカと同じ「そろえた瞬間の演出」型。写真は貼らない）
         かぼちゃポップ … キューブが割れて、小さな可愛いかぼちゃたちがふわふわ浮かぶ
         キリッとかぼちゃ … カーテンが一瞬閉じて、開くとキリッとした顔のかぼちゃが立っている
         おどかしかぼちゃ … キューブがかぼちゃの顔になり、体が生えて画面に飛びかかってくる
       ジャックポット（虹シャード100万）が当たった回は、3種ともかぼちゃが虹色に化ける。

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
      shopMarkPumpkinPop: 'かぼちゃポップ', shopMarkPumpkinCool: 'キリッとかぼちゃ', shopMarkPumpkinBoo: 'おどかしかぼちゃ'
    },
    en: {
      shopColorHalloween: 'Halloween', shopSchemeHalloween: 'Halloween',
      shopMarkPumpkinPop: 'Pumpkin Pop', shopMarkPumpkinCool: 'Cool Pumpkin', shopMarkPumpkinBoo: 'Boo Pumpkin'
    },
    'zh-CN': {
      shopColorHalloween: '万圣节', shopSchemeHalloween: '万圣节',
      shopMarkPumpkinPop: '南瓜蹦蹦', shopMarkPumpkinCool: '酷酷南瓜', shopMarkPumpkinBoo: '吓人南瓜'
    },
    'zh-TW': {
      shopColorHalloween: '萬聖節', shopSchemeHalloween: '萬聖節',
      shopMarkPumpkinPop: '南瓜蹦蹦', shopMarkPumpkinCool: '酷酷南瓜', shopMarkPumpkinBoo: '嚇人南瓜'
    },
    ko: {
      shopColorHalloween: '할로윈', shopSchemeHalloween: '할로윈',
      shopMarkPumpkinPop: '호박 팝', shopMarkPumpkinCool: '시크한 호박', shopMarkPumpkinBoo: '깜짝 호박'
    },
    es: {
      shopColorHalloween: 'Halloween', shopSchemeHalloween: 'Halloween',
      shopMarkPumpkinPop: 'Calabaza pop', shopMarkPumpkinCool: 'Calabaza cool', shopMarkPumpkinBoo: 'Calabaza ¡bu!'
    },
    id: {
      shopColorHalloween: 'Halloween', shopSchemeHalloween: 'Halloween',
      shopMarkPumpkinPop: 'Labu Pop', shopMarkPumpkinCool: 'Labu Keren', shopMarkPumpkinBoo: 'Labu Kejutan'
    },
    ru: {
      shopColorHalloween: 'Хэллоуин', shopSchemeHalloween: 'Хэллоуин',
      shopMarkPumpkinPop: 'Тыквы-прыгуны', shopMarkPumpkinCool: 'Крутая тыква', shopMarkPumpkinBoo: 'Тыква-пугалка'
    },
    'pt-BR': {
      shopColorHalloween: 'Halloween', shopSchemeHalloween: 'Halloween',
      shopMarkPumpkinPop: 'Abóbora pop', shopMarkPumpkinCool: 'Abóbora estilosa', shopMarkPumpkinBoo: 'Abóbora buu'
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
    },
    /* ---- おどかし系：最初は灯りの消えた彫り顔。目に1つずつ火がともる ---- */
    boo: function () {
      const eL = 'M60 92l36 16-26 12z', eR = 'M140 92l-36 16 26 12z';
      const mouth = 'M54 128l15 9 9-9 10 10 12-10 12 10 10-10 9 9 15-9q-7 36-45 39-38-3-47-39z';
      return '<g fill="#240801"><path d="' + eL + '"/><path d="' + eR + '"/><path d="' + mouth + '"/></g>' +
        '<g class="hw-eL"><path class="hw-lit" d="' + eL + '" fill="url(#hw-g-gr)"/></g>' +
        '<g class="hw-eR"><path class="hw-lit" d="' + eR + '" fill="url(#hw-g-gr)"/></g>' +
        '<path class="hw-lit hw-mlit" d="' + mouth + '" fill="url(#hw-g-gr)"/>' +
        '<g fill="none" stroke="#4a0e02" stroke-width="2.6" stroke-linejoin="round"><path d="' + eL + '"/><path d="' + eR + '"/><path d="' + mouth + '"/></g>';
    },
    /* 飛びかかる瞬間の顔：目は細く吊り上がり、口は耳まで裂けて牙が並ぶ */
    scream: function () {
      const eL = 'M56 84l42 20-30 16z', eR = 'M144 84l-42 20 30 16z';
      const mouth = 'M50 120l12 13 9-12 9 14 10-14 10 14 10-14 10 14 9-14 9 12 12-13q2 58-50 64-52-6-50-64z';
      return '<g fill="url(#hw-g-gr)"><path d="' + eL + '"/><path d="' + eR + '"/></g>' +
        '<path d="' + mouth + '" fill="url(#hw-g-mo)"/>' +
        '<path d="M70 178l8-14 8 15 8-16 6 16 6-16 8 16 8-15 8 14q-25 10-60 0z" fill="#ffe9c0" stroke="#4a0e02" stroke-width="2"/>' +
        '<g fill="none" stroke="#3a0901" stroke-width="2.8" stroke-linejoin="round"><path d="' + eL + '"/><path d="' + eR + '"/><path d="' + mouth + '"/></g>' +
        '<circle cx="78" cy="106" r="3" fill="#fff6d0"/><circle cx="122" cy="106" r="3" fill="#fff6d0"/>';
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
      '<radialGradient id="hw-g-gr" cx=".5" cy=".55" r=".7"><stop offset="0" stop-color="#fff0b8"/><stop offset=".38" stop-color="#ff6a1a"/><stop offset="1" stop-color="#b3000f"/></radialGradient>' +
      '<radialGradient id="hw-g-mo" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#2a0004"/><stop offset=".55" stop-color="#8a0012"/><stop offset="1" stop-color="#ff5a1a"/></radialGradient>' +
      '<linearGradient id="hw-g-ck" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2d1d40"/><stop offset="1" stop-color="#0a0510"/></linearGradient>' +
      '<linearGradient id="hw-g-sk" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b9c9a0"/><stop offset="1" stop-color="#7d8f69"/></linearGradient>' +
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

  /* ---- おばけ（おどかしかぼちゃ）：viewBox 300×360。頭は上の 200×200（x 50〜250）。
     首の後ろに立った襟、ぼろぼろのマント、骨ばった腕と長い爪。 */
  const ARM_L =
    '<g class="hw-marm hw-armL">' +
      '<path d="M122 196c-34 2-62 18-84 44l14 13c20-22 42-34 74-36z" fill="url(#hw-g-ck)" stroke="#05020a" stroke-width="3.5" stroke-linejoin="round"/>' +
      '<g fill="none" stroke="url(#hw-g-sk)" stroke-width="6" stroke-linecap="round">' +
        '<path d="M42 240q-20-8-32-26"/><path d="M40 246q-24 0-38-10"/><path d="M42 252q-22 10-34 14"/><path d="M48 256q-10 16-12 28"/></g>' +
      '<g fill="#1c0c06"><circle cx="10" cy="214" r="3.4"/><circle cx="2" cy="236" r="3.4"/><circle cx="8" cy="266" r="3.4"/><circle cx="36" cy="284" r="3.4"/></g>' +
    '</g>';
  const ARM_R = '<g transform="translate(300 0) scale(-1 1)">' + ARM_L.replace('hw-armL', 'hw-armR') + '</g>';
  function monsterSvg(face) {
    return '<svg viewBox="0 0 300 360" aria-hidden="true" focusable="false">' +
      '<g class="hw-mbody">' +
        '<path d="M150 172 96 132l18 54zM150 172l54-40-18 54z" fill="#4b1a5e" stroke="#05020a" stroke-width="3.5" stroke-linejoin="round"/>' +
        '<path d="M108 178q42-14 84 0l30 82q18 56 40 90l-32-8-16 10-18-12-18 12-18-12-18 12-18-12-18 12-16-10-32 8q22-34 40-90z" fill="url(#hw-g-ck)" stroke="#05020a" stroke-width="3.5" stroke-linejoin="round"/>' +
        '<path d="M150 186v120M128 196q-6 60-20 118M172 196q6 60 20 118" fill="none" stroke="#3d2a55" stroke-width="2.4" opacity=".7"/>' +
        ARM_L + ARM_R +
      '</g>' +
      '<g transform="translate(50 0)">' + STEM + BODY + FACES[face]() + '</g>' +
    '</svg>';
  }

  const BAT = '<svg viewBox="0 0 100 50" aria-hidden="true" focusable="false"><path class="hw-wing" d="M50 28c-6-8-14-8-20-4-4-8-14-10-24-4 8 2 12 8 12 14 6-4 14-2 18 4 4-4 10-4 14 2 4-6 10-6 14-2 4-6 12-8 18-4 0-6 4-12 12-14-10-6-20-4-24 4-6-4-14-4-20 4z" fill="#140a1c"/><path d="M45 24l2-7 3 5 3-5 2 7z" fill="#140a1c"/><circle cx="47.5" cy="27" r="1.2" fill="#ffcf4a"/><circle cx="52.5" cy="27" r="1.2" fill="#ffcf4a"/></svg>';

  /* ---- ショップの札に出す絵（単独で開ける SVG を data URI に） ---- */
  function thumb(inner, bg) {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">' + defsHtml(false) +
      '<radialGradient id="hw-bg" cx=".5" cy=".55" r=".7"><stop offset="0" stop-color="' + bg[0] + '"/><stop offset="1" stop-color="' + bg[1] + '"/></radialGradient>' +
      '<rect width="200" height="200" fill="url(#hw-bg)"/>' + inner + '</svg>';
    return 'data:image/svg+xml;base64,' + global.btoa(svg);
  }
  const THUMB_POP = thumb(
    '<g transform="translate(42 -2) scale(.58)">' + pumpkinInner('smile', { hat: true }) + '</g>' +
    '<g transform="translate(0 92) scale(.46)">' + pumpkinInner('wink', { leaf: true }) + '</g>' +
    '<g transform="translate(108 92) scale(.46)">' + pumpkinInner('oh') + '</g>' +
    '<path d="m40 30 3 7 7 3-7 3-3 7-3-7-7-3 7-3zM168 150l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#fff3b0"/>',
    ['#4a2a6a', '#1a0e28']);
  const THUMB_COOL = thumb(
    '<path d="M100 0 40 200h120z" fill="#ffd27a" opacity=".12"/>' +
    '<g transform="translate(14 18) scale(.86)">' + pumpkinInner('cool') + '</g>' +
    '<path d="m150 92 3 9 9 3-9 3-3 9-3-9-9-3 9-3z" fill="#fff"/>',
    ['#5a1240', '#1c0618']);
  const THUMB_BOO = thumb(
    '<g transform="translate(6 6) scale(.94)">' + pumpkinInner('scream') + '</g>',
    ['#5a0c0c', '#120206']);

  /* ===================================================== ショップの品揃え == */
  // メインカラー：2色のあいだを行き来する（blend）。hex は起動直後の先出し用の中間色。
  global.SHOP_THEMES_EXTRA = (global.SHOP_THEMES_EXTRA || []).concat([
    { id: 'halloween', hex: '#ff621f', cost: 2000, cur: 'cyan', blend: ['#ff8c1a', '#ff3b2f'] }
  ]);
  // キューブスキン：img は持たない（写真を貼る仕組みは素通り）。札の絵は thumb。
  global.SHOP_MARKS_EXTRA = (global.SHOP_MARKS_EXTRA || []).concat([
    { id: 'pumpkinPop',  cost: 100, cur: 'cyan', img: null, thumb: THUMB_POP,  hwKind: 'pop' },
    { id: 'pumpkinCool', cost: 100, cur: 'cyan', img: null, thumb: THUMB_COOL, hwKind: 'cool' },
    { id: 'pumpkinBoo',  cost: 100, cur: 'cyan', img: null, thumb: THUMB_BOO,  hwKind: 'boo' }
  ]);
  const KIND_OF = { pumpkinPop: 'pop', pumpkinCool: 'cool', pumpkinBoo: 'boo' };

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
    '.hw-mon{position:absolute}',
    '.hw-mon.hid{visibility:hidden}',
    '.hw-mv,.hw-rise,.hw-sway{width:100%;height:100%}',
    '.hw-mon .hw-lit{opacity:0;transition:opacity .22s ease-out}',
    '.hw-mon.eyeL .hw-eL .hw-lit,.hw-mon.eyeR .hw-eR .hw-lit,.hw-mon.mouth .hw-mlit{opacity:1}',
    '.hw-mon.in .hw-mv{animation:hwMorph .42s cubic-bezier(.2,1.5,.4,1) both}',
    '@keyframes hwMorph{0%{transform:scale(.55,.4)}45%{transform:scale(1.12,.9)}75%{transform:scale(.96,1.05)}100%{transform:none}}',
    '.hw-mon.tense .hw-sway{animation:hwTremble .12s linear infinite}',
    '@keyframes hwTremble{0%,100%{transform:none}25%{transform:translate(-1%,.5%)}50%{transform:translate(.9%,-.7%)}75%{transform:translate(-.5%,-.4%)}}',
    '.hw-mbody{transform-box:fill-box;transform-origin:50% 0;transform:scaleY(0)}',
    '.hw-marm{transform-box:fill-box;transform:scale(0)}',
    '.hw-armL{transform-origin:100% 0}.hw-armR{transform-origin:100% 0}',
    '.hw-mon.grow .hw-mbody{animation:hwGrow .36s cubic-bezier(.2,1.4,.4,1) both}',
    '.hw-mon.grow .hw-marm{animation:hwArm .36s .12s cubic-bezier(.2,1.6,.4,1) both}',
    '.hw-mon.grow .hw-rise{transform:translateY(-8%);transition:transform .36s cubic-bezier(.2,1.4,.4,1)}',
    '.hw-mon.full .hw-mbody,.hw-mon.full .hw-marm{transform:none;animation:none}',
    '.hw-mon.full .hw-rise{transform:translateY(-8%)}',
    '@keyframes hwGrow{from{transform:scaleY(0)}to{transform:none}}',
    '@keyframes hwArm{from{transform:scale(0) rotate(-25deg)}to{transform:none}}',
    '.hw-mon.idle .hw-sway{transform-origin:50% 100%;animation:hwSway 3.2s ease-in-out infinite}',
    '@keyframes hwSway{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(3deg)}}',
    '.hw-mon.idle .hw-marm{animation:hwWave 1.6s ease-in-out infinite alternate}',
    '@keyframes hwWave{from{transform:rotate(-6deg)}to{transform:rotate(8deg)}}',
    '.hw-face-scream{display:none}',
    '.hw-mon.scream .hw-face-boo{display:none}.hw-mon.scream .hw-face-scream{display:block}',
    // 画面いっぱいに飛びかかる層（一瞬だけ。指は素通り）
    '.hw-scare{position:fixed;inset:0;z-index:10060;pointer-events:none;overflow:hidden}',
    '.hw-shake{position:absolute;inset:0}',
    '.hw-shake.go{animation:hwShake .5s linear}',
    '@keyframes hwShake{0%,100%{transform:none}10%{transform:translate(-3%,2%) rotate(-1.5deg)}20%{transform:translate(3%,-2.5%) rotate(1.3deg)}',
    '  30%{transform:translate(-2.4%,-1.5%)}40%{transform:translate(2%,2%) rotate(-.8deg)}55%{transform:translate(-1.3%,1%)}70%{transform:translate(1%,-.8%)}85%{transform:translate(-.5%,.4%)}}',
    '.hw-big{position:absolute;transform-origin:50% 27.8%;will-change:transform}',
    '.hw-big.lunge{animation:hwLunge .16s cubic-bezier(.55,0,1,.6) both}',
    '.hw-big.back{animation:hwBack .48s cubic-bezier(.3,0,.25,1) both}',
    '@keyframes hwLunge{from{transform:none}to{transform:translate(var(--dx),var(--dy)) scale(var(--S))}}',
    '@keyframes hwBack{from{transform:translate(var(--dx),var(--dy)) scale(var(--S))}to{transform:none}}',
    '.hw-red{position:absolute;inset:0;opacity:0;background:radial-gradient(circle,rgba(255,40,20,.2),rgba(150,0,10,.75))}',
    '.hw-red.go{animation:hwRed .55s ease-out both}',
    '@keyframes hwRed{0%{opacity:0}14%{opacity:1}100%{opacity:0}}',
    '.hw-bat{position:absolute;opacity:0}',
    '.hw-bat.go{animation:hwBat var(--t,1s) cubic-bezier(.2,.7,.4,1) var(--dl,0s) both}',
    '@keyframes hwBat{0%{opacity:0;transform:translate(0,0) scale(.3)}15%{opacity:1}100%{opacity:0;transform:translate(var(--bx),var(--by)) scale(1.5)}}',
    '.hw-bat .hw-wing{transform-box:fill-box;transform-origin:50% 50%;animation:hwFlap .14s ease-in-out infinite alternate}',
    '@keyframes hwFlap{from{transform:scaleY(1)}to{transform:scaleY(.35)}}',

    '@media (prefers-reduced-motion: reduce){',
    '  .hw-blink,.hw-hat,.hw-bob,.hw-breath,.hw-glowfx,.hw-aura,.hw-spk,.hw-mon.idle .hw-sway,.hw-mon.idle .hw-marm{animation:none!important}',
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
    boo: function (x) {
      // 低いうなり → ドクン、ドクン → ボッ（目に火）→ ギギギ（体が生える）
      // → ギャアアア！（飛びかかる）→ ケケケッ（戻って笑う）
      x.tone('sawtooth', 55, 52, 0, 0.35, 0.16, 0.9, { f0: 260, f1: 420, q: 1.2 });
      x.tone('sawtooth', 58.3, 55, 0, 0.35, 0.14, 0.9, { f0: 240, f1: 400, q: 1.2 });
      x.tone('sine', 120, 44, 0.24, 0.005, 0.4, 0.2);
      [0.48, 0.66].forEach(function (s) {
        x.tone('sine', 70, 38, s, 0.005, 0.75, 0.16);
        x.tone('sine', 70, 38, s + 0.17, 0.005, 0.5, 0.14);
      });
      x.noise(0.42, 0.01, 0.35, 0.18, 'lowpass', 1400, 300, 0.8);
      x.noise(0.58, 0.01, 0.35, 0.18, 'lowpass', 1400, 300, 0.8);
      x.tone('sawtooth', 180, 90, 0.85, 0.05, 0.16, 0.26, { type: 'bandpass', f0: 900, f1: 500, q: 4 });
      x.tone('sawtooth', 260, 120, 0.93, 0.03, 0.12, 0.2, { type: 'bandpass', f0: 1200, f1: 600, q: 4 });
      // 叫び：耳ざわりな不協和音のスタブ＋悲鳴のような高い滑り＋ノイズ＋地鳴り
      const S = 1.15;
      [92.5, 98, 138.6, 196, 277.2].forEach(function (f) {
        x.tone('sawtooth', f * 1.02, f * 0.92, S, 0.008, 0.2, 0.75, { f0: 5200, f1: 500, q: 0.9 });
      });
      [880, 932, 1245].forEach(function (f) {
        const o = x.tone('sawtooth', f, f * 0.62, S, 0.015, 0.09, 0.6, { type: 'bandpass', f0: 2600, f1: 1100, q: 2.5 });
        try {
          const lfo = x.c.createOscillator(), lg = x.c.createGain();
          lfo.frequency.value = 26; lg.gain.value = f * 0.05;
          lfo.connect(lg); lg.connect(o.frequency);
          lfo.start(x.c.currentTime); lfo.stop(x.c.currentTime + S + 1);
        } catch (e) { /* 揺らせなくても鳴らす */ }
      });
      x.noise(S, 0.006, 0.8, 0.5, 'bandpass', 3800, 900, 0.8);
      x.tone('sine', 90, 28, S, 0.004, 0.95, 0.6);
      // ケケケッ
      [0, 0.11, 0.22, 0.36].forEach(function (s, i) {
        const f = [620, 700, 660, 520][i];
        x.tone('square', f, f * 0.85, 1.72 + s, 0.004, 0.07, 0.07, { f0: 2400, q: 0.8 });
      });
      x.keepAwake(3800);
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
  }

  function equippedId() {
    return (global.Shop && typeof global.Shop.getEquippedMark === 'function') ? global.Shop.getEquippedMark() : null;
  }
  function isEquipped() { return !!KIND_OF[equippedId()]; }
  function kind() { return KIND_OF[equippedId()] || null; }
  // おどかしかぼちゃは暗がりから始まるので、完成の白フラッシュ・紙吹雪・
  // 報酬の結晶は、驚かせ終わってから出したい（index.html がこれを見る）。
  function quiet() { return isEquipped() && kind() === 'boo' && !reduced(); }
  const QUIET_MS = 2200;   // 報酬を出すまでの待ち（index.html が読む）

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

  /* ------------------------------------------------ ③ おどかしかぼちゃ -- */
  function monsterEl() {
    // 頭の中心（viewBox の y=100）がキューブの中心に来るように置く
    const W = 2.9, H = W * 1.2;
    const d = document.createElement('div');
    d.className = 'hw-mon';
    d.style.left = 'calc(var(--R) * ' + (-W / 2).toFixed(3) + ')';
    d.style.top = 'calc(var(--R) * ' + (-H * 100 / 360).toFixed(3) + ')';
    d.style.width = 'calc(var(--R) * ' + W + ')';
    d.style.height = 'calc(var(--R) * ' + H.toFixed(3) + ')';
    d.innerHTML = '<div class="hw-sway"><div class="hw-rise"><div class="hw-mv"><div class="hw-art">' +
      '<div class="hw-face-boo" style="width:100%;height:100%">' + monsterSvg('boo') + '</div>' +
      '<div class="hw-face-scream" style="width:100%;height:100%">' + monsterSvg('scream') + '</div>' +
      '</div></div></div></div>';
    return d;
  }

  function playBoo(st, g) {
    const R = reduced();
    snapshotCube(st);
    const aura = el('hw-aura', 0, 0.2, 3.4);
    anchor.appendChild(aura);
    const mon = monsterEl();

    if (R) {
      hideCube(st);
      mon.classList.add('eyeL', 'eyeR', 'mouth', 'full');
      anchor.appendChild(mon);
      return;
    }

    st.busy = true;
    const dark = document.createElement('div');
    dark.className = 'hw-dark';
    layer.insertBefore(dark, anchor);
    void dark.offsetWidth;
    dark.classList.add('on');
    mon.classList.add('hid');
    anchor.appendChild(mon);

    later(st, function () {           // キューブがかぼちゃの顔に変わる
      hideCube(st);
      mon.classList.remove('hid');
      mon.classList.add('in');
    }, 230);
    later(st, function () { mon.classList.add('tense'); }, 420);
    later(st, function () { mon.classList.add('eyeL'); vib(20); }, 440);
    later(st, function () { mon.classList.add('eyeR'); vib(20); }, 600);
    later(st, function () { mon.classList.add('mouth', 'grow'); vib([0, 15, 20, 15]); }, 840);
    later(st, function () { lunge(st, mon); }, 1150);
  }

  // 画面いっぱいに飛びかかってくる。キューブの場所にいるおばけと同じ大きさ・同じ位置の
  // 写しを、全画面の層に置いてから、こちらへ向かって一気に大きくする。
  function lunge(st, mon) {
    const r = mon.getBoundingClientRect();
    const vw = global.innerWidth, vh = global.innerHeight;
    if (!r.width) { finishBoo(st, mon); return; }
    scareEl = document.createElement('div');
    scareEl.className = 'hw-scare' + (layer.classList.contains('hw-rb') ? ' hw-rb' : '');
    scareEl.setAttribute('aria-hidden', 'true');
    const shake = document.createElement('div');
    shake.className = 'hw-shake';
    const big = mon.cloneNode(true);
    big.className = 'hw-mon hw-big eyeL eyeR mouth full scream';
    big.style.left = r.left + 'px'; big.style.top = r.top + 'px';
    big.style.width = r.width + 'px'; big.style.height = r.height + 'px';
    // 頭の中心（transform-origin）を画面の真ん中やや上へ。顔の幅が画面幅の1.3倍になるまで寄る
    const hx = r.left + r.width / 2, hy = r.top + r.height * 0.278;
    const S = Math.max(2.2, (vw * 1.3) / (r.width * 200 / 300), (vh * 0.95) / (r.width * 200 / 300));
    big.style.setProperty('--dx', (vw / 2 - hx).toFixed(0) + 'px');
    big.style.setProperty('--dy', (vh * 0.44 - hy).toFixed(0) + 'px');
    big.style.setProperty('--S', S.toFixed(2));
    const red = document.createElement('div');
    red.className = 'hw-red';
    shake.appendChild(big);
    scareEl.appendChild(red);
    scareEl.appendChild(shake);
    // コウモリが四方へ散る
    for (let i = 0; i < 8; i++) {
      const b = document.createElement('div');
      b.className = 'hw-bat';
      const w = rnd(46, 84);
      b.style.left = (hx - w / 2) + 'px'; b.style.top = (hy - w / 4) + 'px';
      b.style.width = w + 'px'; b.style.height = (w / 2) + 'px';
      const a = (i / 8) * Math.PI * 2 + rnd(-0.3, 0.3), d = Math.max(vw, vh) * rnd(0.55, 0.8);
      b.style.setProperty('--bx', (Math.cos(a) * d).toFixed(0) + 'px');
      b.style.setProperty('--by', (Math.sin(a) * d - 40).toFixed(0) + 'px');
      b.style.setProperty('--t', rnd(0.8, 1.2).toFixed(2) + 's');
      b.style.setProperty('--dl', rnd(0, 0.12).toFixed(2) + 's');
      b.innerHTML = BAT;
      scareEl.appendChild(b);
    }
    document.body.appendChild(scareEl);
    mon.classList.add('hid');
    void big.offsetWidth;
    big.classList.add('lunge');
    kick(red, 'go');
    kick(shake, 'go');
    scareEl.querySelectorAll('.hw-bat').forEach(function (b) { b.classList.add('go'); });
    vib([0, 220, 60, 320]);

    later(st, function () { big.classList.remove('lunge'); big.classList.add('back'); }, 620);
    later(st, function () { finishBoo(st, mon); }, 1100);
  }

  function finishBoo(st, mon) {
    if (scareEl && scareEl.parentNode) scareEl.parentNode.removeChild(scareEl);
    scareEl = null;
    mon.classList.remove('hid', 'tense', 'grow', 'in');
    mon.classList.add('full', 'idle', 'eyeL', 'eyeR', 'mouth');
    const dark = layer && layer.querySelector('.hw-dark');
    if (dark) { dark.classList.add('off'); dark.classList.remove('on'); }
    st.busy = false;
    if (typeof st.onCelebrate === 'function') { try { st.onCelebrate(); } catch (e) { /* 紙吹雪が出なくても続ける */ } }
    if (st.rbPending) { st.rbPending = false; goRainbow(true); }
  }

  /* ---------------------------------------------------------------- 入口 -- */
  function play(opts) {
    opts = opts || {};
    if (!ready) return false;
    const k = opts.kind || kind();
    if (!k) return false;
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
    if (!reduced()) {
      st.sfx = makeSfx();
      if (st.sfx && SND[k]) { try { SND[k](st.sfx); } catch (e) { /* 音なしで続ける */ } }
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
    if (layer) { layer.innerHTML = ''; layer.classList.remove('hw-rb'); }
    anchor = null;
  }

  global.HalloweenFX = {
    init: init, play: play, stop: stop, jackpot: jackpot,
    isEquipped: isEquipped, kind: kind, quiet: quiet, QUIET_MS: QUIET_MS,
    isActive: function () { return !!active; },
    // 確認用（ブラウザの開発ツールから HalloweenFX._test('boo', true) などで流せる）
    _test: function (k, rb) { const ok = play({ kind: k }); if (ok && rb) setTimeout(jackpot, 600); return ok; }
  };
})(window);
