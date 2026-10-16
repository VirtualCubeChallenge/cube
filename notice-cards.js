/* ============================================================
   notice-cards.js — お知らせ一覧をカード型にする
   ------------------------------------------------------------
   ・いちばん上（最新）は大きめの「ハイライトカード」
       [ NEW ] バッジ・アイコン・見出し・2〜3行の本文・詳細ボタン
   ・2件目からは小さめの「サイバーカード」を縦に並べる
   ・見出しは本文の1行目（改行が無いものは最初の「！」「。」まで）。
     先頭の【アプデ情報】/[Update] などの札は画面では省く。
   ・絵文字は一切出さない（2026-10-14〜）。見出し・本文の絵文字は外し、
     アイコンはこのファイルのネオン線画SVG（ICONS）を使う。
     ☰ © ® ™ は記号として残す。
   ・アイコンは update-notice.json の各項目の "icon" に名前で書く:
       globe（地球儀トロフィー・シアン） bolt（稲妻・パープル）
       cube（ワイヤーキューブ・ブルー）  camera（カメラ・ピンク）
       pause（一時停止ストップウォッチ・アンバー） plane（飛行機・グリーン）
       undo（戻る矢印・オレンジ）  trophy（トロフィー・金）  spark（きらめき・シアン。未指定や不明な名前のとき）

   index.html の openNotice() が window.NoticeCards があるときだけ
   ここを使う。この1ファイルの読み込みをやめれば、元の一覧に戻る。
   「詳細」ボタンは今までどおり .notice-detail-btn[data-guide] なので、
   index.html 側のクリック処理（イベント委任）がそのまま効く。
   ============================================================ */
(function (global) {
  'use strict';

  const CSS = [
    /* ---- パネル：黒地にうっすらネオンのにじみ（ガラスの奥に見える光） ---- */
    '#notice-overlay{background:#05070d}',
    '#notice-overlay #notice-panel{position:relative;overflow:hidden;width:min(92vw,400px);',
    '  max-height:86vh;max-height:86dvh;padding:18px 16px 14px;border-radius:20px;text-align:left;',
    '  background:',
    '    radial-gradient(70% 40% at 0% 0%,rgba(0,243,255,.16),transparent 70%),',
    '    radial-gradient(60% 40% at 100% 30%,rgba(168,85,247,.16),transparent 70%),',
    '    radial-gradient(60% 40% at 30% 100%,rgba(59,130,246,.12),transparent 70%),',
    '    #0b0f19;',
    '  border:1px solid rgba(120,140,255,.22);',
    '  box-shadow:0 0 0 1px rgba(0,0,0,.4),0 18px 60px rgba(0,0,0,.6),0 0 40px rgba(0,243,255,.08)}',
    '#notice-overlay #notice-panel h2{margin:2px 4px 14px;font-size:15px;font-weight:800;letter-spacing:.14em;',
    '  color:#e8fbff;text-align:left;display:flex;align-items:center;gap:10px}',
    '#notice-overlay #notice-panel h2::before{content:"";width:8px;height:8px;border-radius:50%;flex:none;',
    '  background:#00f3ff;box-shadow:0 0 8px #00f3ff,0 0 16px rgba(0,243,255,.6)}',
    '#notice-overlay #notice-panel h2::after{content:"";flex:1;height:1px;',
    '  background:linear-gradient(90deg,rgba(0,243,255,.45),rgba(168,85,247,.25),transparent)}',
    // スクロール枠がカードの光を四角く切らないよう、内側に余白を取って外へ広げる
    '#notice-overlay #notice-list{display:flex;flex-direction:column;gap:10px;padding:6px 12px 20px;margin:0 -12px 6px;',
    '  -webkit-mask-image:linear-gradient(#000 calc(100% - 18px),transparent);mask-image:linear-gradient(#000 calc(100% - 18px),transparent);',
    '  overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;scrollbar-width:thin;',
    '  scrollbar-color:rgba(120,140,255,.35) transparent}',
    '#notice-overlay .settings-actions{margin-top:0}',
    // 閉じる：ガラスのカプセル
    '#notice-overlay #notice-close{min-width:140px;border-radius:999px;font-weight:800;letter-spacing:.08em;color:#dff9ff;',
    '  background:rgba(255,255,255,.05);border:1px solid rgba(0,243,255,.35);',
    '  box-shadow:0 0 12px rgba(0,243,255,.12),inset 0 0 10px rgba(0,243,255,.08)}',

    /* ---- カード共通（ガラス） ---- */
    '.nc-card{position:relative;border-radius:14px;padding:12px 14px;',
    '  background:rgba(255,255,255,.035);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);',
    '  border:1px solid rgba(120,140,255,.18);box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}',
    // アイコン箱：色はカードごとの --ac（発光の色）と --al（線の色）
    '.nc-card{--ac:0,243,255;--al:#00f3ff}',
    '.nc-ico{flex:none;display:grid;place-items:center;border-radius:11px;line-height:0;color:var(--al);',
    '  background:radial-gradient(circle at 50% 40%,rgba(var(--ac),.16),rgba(var(--ac),.04) 70%);',
    '  border:1px solid rgba(var(--ac),.42);',
    '  box-shadow:0 0 10px rgba(var(--ac),.22),inset 0 0 10px rgba(var(--ac),.12)}',
    '.nc-ico svg{width:74%;height:74%;overflow:visible;fill:none;stroke:currentColor;stroke-width:1.6;',
    '  stroke-linecap:round;stroke-linejoin:round;',
    '  filter:drop-shadow(0 0 2px rgba(var(--ac),.9)) drop-shadow(0 0 6px rgba(var(--ac),.55))}',
    '.nc-ico svg .fl{fill:rgba(var(--ac),.2)}',
    '.nc-ico svg .fl2{fill:rgba(var(--ac),.1)}',
    '.nc-ico svg .thin{stroke-width:.9;opacity:.75}',
    '.nc-ico svg .edge{stroke-width:1.3}',
    '.nc-ico svg .grid{stroke-width:.7;opacity:.8}',
    '.nc-ico svg .dot{fill:currentColor;stroke:none}',
    '.nc-date{font-size:11px;font-weight:800;letter-spacing:.08em;color:#00f3ff;',
    '  font-variant-numeric:tabular-nums;text-shadow:0 0 8px rgba(0,243,255,.45)}',
    '.nc-h{margin:0;font-weight:800;color:#f2f5ff;line-height:1.4;word-break:break-word}',
    '.nc-body{margin:0;color:#b9c0d4;white-space:pre-line;word-break:break-word}',
    // 詳細ボタン（近未来風のカプセル）
    '#notice-list .nc-card .notice-detail-btn{display:inline-flex;align-items:center;gap:6px;margin-top:10px;',
    '  min-height:34px;padding:0 16px;border-radius:999px;font-size:12.5px;font-weight:800;letter-spacing:.06em;',
    '  color:#00f3ff;background:rgba(0,243,255,.08);border:1px solid rgba(0,243,255,.55);',
    '  box-shadow:0 0 10px rgba(0,243,255,.2),inset 0 0 8px rgba(0,243,255,.12);cursor:pointer;',
    '  transition:background .15s,box-shadow .15s,transform .1s}',
    '#notice-list .nc-card .notice-detail-btn:active{transform:scale(.96);background:rgba(0,243,255,.18);',
    '  box-shadow:0 0 16px rgba(0,243,255,.5),inset 0 0 10px rgba(0,243,255,.25)}',
    '@media (hover:hover){#notice-list .nc-card .notice-detail-btn:hover{background:rgba(0,243,255,.14);',
    '  box-shadow:0 0 16px rgba(0,243,255,.4),inset 0 0 10px rgba(0,243,255,.2)}}',

    /* ---- 最新：ハイライトカード ---- */
    // ネオンの枠はシアン→パープルのグラデーション（mask で枠だけ残す）
    '.nc-hero{padding:16px 16px 15px;border:none;border-radius:16px;',
    '  background:linear-gradient(160deg,rgba(0,243,255,.10),rgba(168,85,247,.08) 55%,rgba(255,255,255,.04));',
    '  box-shadow:0 0 12px rgba(0,243,255,.22),0 0 22px rgba(168,85,247,.12)}',
    '.nc-hero::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1.5px;pointer-events:none;',
    '  background:linear-gradient(135deg,#00f3ff,#7c5cff 50%,#d400ff);',
    '  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);',
    '  -webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}',
    // 枠の上をゆっくり流れる光
    '.nc-hero::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;',
    '  background:linear-gradient(105deg,transparent 35%,rgba(255,255,255,.07) 48%,transparent 60%);',
    '  background-size:250% 100%;animation:nc-sheen 6s ease-in-out infinite}',
    '@keyframes nc-sheen{0%,60%{background-position:130% 0}100%{background-position:-30% 0}}',
    '.nc-top{display:flex;align-items:center;gap:10px;margin-bottom:10px}',
    '.nc-new{font-size:11px;font-weight:900;letter-spacing:.16em;color:#0b0f19;padding:3px 9px 3px 10px;border-radius:6px;',
    '  background:linear-gradient(90deg,#00f3ff,#a78bfa);box-shadow:0 0 10px rgba(0,243,255,.55);',
    '  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
    '.nc-hero .nc-head{display:flex;align-items:center;gap:12px;margin-bottom:8px}',
    '.nc-hero .nc-ico{width:48px;height:48px;border-radius:13px;',
    '  box-shadow:0 0 14px rgba(var(--ac),.32),inset 0 0 12px rgba(var(--ac),.16)}',
    '.nc-hero .nc-h{font-size:17px;text-shadow:0 0 12px rgba(0,243,255,.25)}',
    '.nc-hero .nc-body{font-size:14px;line-height:1.7;color:#d3d9ea}',

    /* ---- 過去：コンパクトなサイバーカード ---- */
    '.nc-past{display:flex;gap:12px;align-items:flex-start}',
    '.nc-past .nc-ico{width:36px;height:36px;margin-top:1px}',
    '.nc-past .nc-ico svg{width:72%;height:72%}',
    '.nc-past .nc-main{flex:1;min-width:0}',
    '.nc-past .nc-date{font-size:10.5px;margin-bottom:3px}',
    '.nc-past .nc-h{font-size:14px;margin-bottom:4px}',
    '.nc-past .nc-body{font-size:12.5px;line-height:1.7}',
    '.nc-past .nc-body:empty{display:none}',
    '#notice-list .nc-past .notice-detail-btn{min-height:30px;padding:0 13px;font-size:12px;margin-top:8px}',

    /* ---- 開いたとき：上から順にふわっと ---- */
    '#notice-overlay.show .nc-card{animation:nc-in .42s cubic-bezier(.2,.8,.2,1) both}',
    '#notice-overlay.show .nc-card:nth-child(2){animation-delay:.05s}',
    '#notice-overlay.show .nc-card:nth-child(3){animation-delay:.1s}',
    '#notice-overlay.show .nc-card:nth-child(4){animation-delay:.15s}',
    '#notice-overlay.show .nc-card:nth-child(n+5){animation-delay:.2s}',
    '@keyframes nc-in{from{opacity:0;transform:translate3d(0,10px,0)}to{opacity:1;transform:none}}',

    /* ---- 小さい画面 ---- */
    '@media (max-width:360px){',
    '  #notice-overlay #notice-panel{padding:16px 12px 12px}',
    '  .nc-hero{padding:14px 13px 13px}',
    '  .nc-hero .nc-ico{width:42px;height:42px}',
    '  .nc-hero .nc-h{font-size:16px}',
    '  .nc-hero .nc-body{font-size:13.5px}}',

    '@media (prefers-reduced-motion:reduce){.nc-hero::after{animation:none;display:none}',
    '  #notice-overlay.show .nc-card{animation:none}}'
  ].join('\n');

  function injectCSS() {
    if (document.getElementById('notice-cards-style')) return;
    const st = document.createElement('style');
    st.id = 'notice-cards-style';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  /* ---------------------------------------------------- アイコン（24×24 の線画） -- */
  // ac = 発光の色(rgb)、al = 線の色
  const ICONS = {
    // 地球儀をカップにしたトロフィー（世界ランキング）
    globe: { ac: '0,243,255', al: '#00f3ff', svg:
      '<circle class="fl2" cx="12" cy="9" r="6"/>' +
      '<ellipse cx="12" cy="9" rx="2.6" ry="6"/>' +
      '<path class="thin" d="M6.3 7.2h11.4M6.3 10.8h11.4"/>' +
      '<path d="M6.3 5.2H4.1v1.1a3.7 3.7 0 0 0 3.1 3.6M17.7 5.2h2.2v1.1a3.7 3.7 0 0 1-3.1 3.6"/>' +
      '<path d="M12 15v2.6M9.2 17.6h5.6l.9 3.4H8.3z"/>' +
      '<path class="thin" d="M20.6 1.2v3M19.1 2.7h3"/>' },
    // 稲妻と速度線（PLLフラッシュ・ビジョン）
    bolt: { ac: '212,0,255', al: '#e879f9', svg:
      '<path class="fl" d="M13.6 2.2 5.4 13.4h5.4l-1.6 8.4 8.4-11.4h-5.4z"/>' +
      '<path d="M18.2 4.2h3.4M19.4 7.4h2.4M2.4 16.6h2.8M2.4 19.8h4"/>' },
    // 3×3 のワイヤーフレームキューブ（キューブカラー）
    cube: { ac: '96,165,250', al: '#60a5fa', svg:
      '<path class="fl" d="M12 2.5 20.5 7.3 12 12.1 3.5 7.3z"/>' +
      '<path class="fl2" d="M3.5 7.3 12 12.1v9.4l-8.5-4.8z"/>' +
      '<path class="thin grid" d="M9.17 4.1l8.5 4.8M6.33 5.7l8.5 4.8M14.83 4.1l-8.5 4.8M17.67 5.7l-8.5 4.8' +
        'M6.33 8.9v9.4M9.17 10.5v9.4M3.5 10.43l8.5 4.8M3.5 13.57l8.5 4.8' +
        'M14.83 10.5v9.4M17.67 8.9v9.4M12 15.23l8.5-4.8M12 18.37l8.5-4.8"/>' +
      '<path class="edge" d="M12 2.5 20.5 7.3v9.4L12 21.5 3.5 16.7V7.3z"/><path class="edge" d="M3.5 7.3 12 12.1l8.5-4.8M12 12.1v9.4"/>' },
    // カメラ（写真スキン）
    camera: { ac: '244,114,182', al: '#f472b6', svg:
      '<rect class="fl2" x="2.8" y="7" width="18.4" height="13" rx="2.6"/>' +
      '<path d="M8 7l1.6-2.6h4.8L16 7"/>' +
      '<circle cx="12" cy="13.4" r="3.7"/><circle class="thin" cx="12" cy="13.4" r="1.6"/>' +
      '<circle class="dot" cx="17.6" cy="10" r=".8"/>' },
    // ストップウォッチ＋一時停止（計測の一時停止）
    pause: { ac: '251,191,36', al: '#fbbf24', svg:
      '<circle class="fl2" cx="12" cy="13.6" r="7.6"/>' +
      '<path d="M10 2.6h4M12 2.6V6M18.2 6.4l1.6-1.6M10 10.6v6M14 10.6v6"/>' },
    // 飛行機（オフライン・機内モード）
    plane: { ac: '52,211,153', al: '#34d399', svg:
      '<path class="fl" d="M12 2.4c.9 0 1.5.8 1.5 1.9V9l7 4.2v2.1l-7-2.2v4.5l2.2 1.7V21L12 20l-3.7 1v-1.7l2.2-1.7v-4.5l-7 2.2v-2.1l7-4.2V4.3c0-1.1.6-1.9 1.5-1.9z"/>' },
    // 戻る矢印（一手戻る）
    undo: { ac: '251,146,60', al: '#fb923c', svg:
      '<path d="M8.6 4.6 4 9.2l4.6 4.6"/><path d="M4 9.2h10.4a5.6 5.6 0 0 1 0 11.2H9.6"/>' },
    // トロフィー＋上がる線（自己ベスト・記録）
    trophy: { ac: '255,215,0', al: '#ffd75a', svg:
      '<path class="fl" d="M7 3.5h10v5.2a5 5 0 0 1-10 0z"/>' +
      '<path d="M7 5H4.2v1.2A3.4 3.4 0 0 0 7.4 9.6M17 5h2.8v1.2a3.4 3.4 0 0 1-3.2 3.4"/>' +
      '<path d="M12 13.7v3.1M8.6 20.5h6.8l-.7-3.7H9.3z"/>' +
      '<path class="thin" d="M9.4 9.4l1.8-1.8 1.4 1.2 2.2-2.4"/>' },
    // きらめき（アイコン未指定のとき）
    spark: { ac: '0,243,255', al: '#00f3ff', svg:
      '<path class="fl" d="M12 2.8l2 6.4 6.4 2-6.4 2-2 6.4-2-6.4-6.4-2 6.4-2z"/>' +
      '<path d="M19.2 3.4v3M17.7 4.9h3"/>' }
  };
  function iconOf(name) { return ICONS[name] || ICONS.spark; }
  function iconHtml(ic) {
    return '<span class="nc-ico" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">' + ic.svg + '</svg></span>';
  }

  // 絵文字を外す（☰ © ® ™ は記号として残す）。絵文字の直後の空白1つも一緒に外す
  const KEEP = { '☰': 1, '©': 1, '®': 1, '™': 1 };
  let EMOJI_ALL = null;
  try {
    EMOJI_ALL = new RegExp('(?:\\p{Extended_Pictographic}|\\p{Regional_Indicator})' +
      '(?:\\uFE0F|\\p{Emoji_Modifier})?(?:\\u200D\\p{Extended_Pictographic}\\uFE0F?)*\\uFE0F?[ \\u3000]?', 'gu');
  } catch (e) { EMOJI_ALL = null; }
  function stripEmoji(s) {
    if (!EMOJI_ALL) return s;
    return String(s).replace(EMOJI_ALL, function (m) {
      const c = m.replace(/[️ 　]/g, '');
      return KEEP[c] ? m : '';
    }).replace(/[ \t]+\n/g, '\n').replace(/[ \t]+$/g, '');
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 絵文字1つ分（異体字セレクタ・肌色・ZWJ のつながりも含める）
  let EMOJI_TAIL = null;
  try {
    EMOJI_TAIL = new RegExp(
      '(?:\\s*(?:\\p{Extended_Pictographic}|\\p{Regional_Indicator})' +
      '(?:\\uFE0F|\\p{Emoji_Modifier})?(?:\\u200D\\p{Extended_Pictographic}\\uFE0F?)*)+\\s*$', 'u');
  } catch (e) { EMOJI_TAIL = null; }
  const EMOJI_HEAD = (function () {
    try {
      return new RegExp('^\\s*((?:\\p{Extended_Pictographic}|\\p{Regional_Indicator})' +
        '(?:\\uFE0F|\\p{Emoji_Modifier})?(?:\\u200D\\p{Extended_Pictographic}\\uFE0F?)*)', 'u');
    } catch (e) { return null; }
  })();

  // 本文を「見出し」と「本文」に分ける
  function split(text) {
    let s = String(text || '').trim();
    // 先頭の札（【アプデ情報】・[Update]・[Novedades] など）を外す
    s = s.replace(/^\s*(?:【[^】\n]{1,16}】|\[[^\]\n]{1,24}\])\s*/, '');
    let head = s, body = '';
    const nl = s.indexOf('\n');
    if (nl >= 0) {
      head = s.slice(0, nl);
      body = s.slice(nl + 1);
    } else {
      // 改行が無い古いお知らせは、最初の文の終わりで分ける
      const m = s.match(/^([\s\S]+?[！!？?。])(\s*)([\s\S]+)$/);
      if (m && m[1].length <= 60) { head = m[1]; body = m[3]; }
    }
    let emoji = '';
    if (EMOJI_TAIL) {
      const t = head.match(EMOJI_TAIL);
      if (t && t.index > 0) {
        const h = EMOJI_HEAD && t[0].match(EMOJI_HEAD);
        emoji = h ? h[1] : '';
        head = head.slice(0, t.index);
      }
    }
    return { head: stripEmoji(head).trim(), body: stripEmoji(body).trim(), emoji: emoji };
  }

  function detailBtn(item, label) {
    if (!item.guide) return '';
    return '<button type="button" class="notice-detail-btn" data-guide="' + esc(item.guide) + '">' +
      esc(label) + ' <span aria-hidden="true">→</span></button>';
  }

  // items: update-notice.json の items（新しい順）
  // textOf(item): その言語の本文を返す関数（index.html の noticeText）
  // detailLabel: 「詳細」の文言
  function render(items, textOf, detailLabel) {
    injectCSS();
    let first = true;
    let html = '';
    (items || []).forEach(function (item) {
      const text = textOf(item);
      if (!text) return;
      const p = split(text);
      const ic = iconOf(item.icon);
      const accent = ' style="--ac:' + ic.ac + ';--al:' + ic.al + '"';
      const date = esc(item.date || '');
      if (first) {
        first = false;
        html +=
          '<article class="nc-card nc-hero"' + accent + '>' +
            '<div class="nc-top"><span class="nc-new">[ NEW ]</span><span class="nc-date">' + date + '</span></div>' +
            '<div class="nc-head">' + iconHtml(ic) +
              '<h3 class="nc-h">' + esc(p.head) + '</h3></div>' +
            (p.body ? '<p class="nc-body">' + esc(p.body) + '</p>' : '') +
            detailBtn(item, detailLabel) +
          '</article>';
      } else {
        html +=
          '<article class="nc-card nc-past"' + accent + '>' +
            iconHtml(ic) +
            '<div class="nc-main">' +
              '<div class="nc-date">' + date + '</div>' +
              '<h3 class="nc-h">' + esc(p.head) + '</h3>' +
              '<p class="nc-body">' + esc(p.body) + '</p>' +
              detailBtn(item, detailLabel) +
            '</div>' +
          '</article>';
      }
    });
    return html;
  }

  injectCSS();
  global.NoticeCards = { render: render, split: split, icons: Object.keys(ICONS) };
})(window);
