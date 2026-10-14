/* ============================================================
   notice-cards.js — お知らせ一覧をカード型にする
   ------------------------------------------------------------
   ・いちばん上（最新）は大きめの「ハイライトカード」
       [ NEW ] バッジ・アイコン・見出し・2〜3行の本文・詳細ボタン
   ・2件目からは小さめの「サイバーカード」を縦に並べる
   ・見出しは本文の1行目（改行が無いものは最初の「！」「。」まで）。
     先頭の【アプデ情報】/[Update] などの札と、見出し末尾の絵文字は
     画面では省く（絵文字はアイコン欄に出す）。
   ・アイコンは update-notice.json の各項目の "icon"。無ければ見出し
     末尾の絵文字、それも無ければ ✨。

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
    '.nc-ico{flex:none;display:grid;place-items:center;border-radius:10px;line-height:1;',
    '  background:rgba(0,243,255,.06);border:1px solid rgba(0,243,255,.22)}',
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
    '.nc-hero .nc-ico{width:46px;height:46px;font-size:25px;border-radius:12px;',
    '  background:rgba(0,243,255,.08);border-color:rgba(0,243,255,.45);',
    '  box-shadow:0 0 12px rgba(0,243,255,.3),inset 0 0 10px rgba(0,243,255,.15)}',
    '.nc-hero .nc-h{font-size:17px;text-shadow:0 0 12px rgba(0,243,255,.25)}',
    '.nc-hero .nc-body{font-size:14px;line-height:1.7;color:#d3d9ea}',

    /* ---- 過去：コンパクトなサイバーカード ---- */
    '.nc-past{display:flex;gap:12px;align-items:flex-start}',
    '.nc-past .nc-ico{width:34px;height:34px;font-size:18px;margin-top:1px}',
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
    '  .nc-hero .nc-ico{width:40px;height:40px;font-size:22px}',
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
    return { head: head.trim(), body: body.trim(), emoji: emoji };
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
      const icon = esc(item.icon || p.emoji || '✨');
      const date = esc(item.date || '');
      if (first) {
        first = false;
        html +=
          '<article class="nc-card nc-hero">' +
            '<div class="nc-top"><span class="nc-new">[ NEW ]</span><span class="nc-date">' + date + '</span></div>' +
            '<div class="nc-head"><span class="nc-ico" aria-hidden="true">' + icon + '</span>' +
              '<h3 class="nc-h">' + esc(p.head) + '</h3></div>' +
            (p.body ? '<p class="nc-body">' + esc(p.body) + '</p>' : '') +
            detailBtn(item, detailLabel) +
          '</article>';
      } else {
        html +=
          '<article class="nc-card nc-past">' +
            '<span class="nc-ico" aria-hidden="true">' + icon + '</span>' +
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
  global.NoticeCards = { render: render, split: split };
})(window);
