/* =========================================================================
   ranked.js — 世界ランキング（ランク戦）
   -------------------------------------------------------------------------
   ドロワー(≡)に「🌍 世界ランキング」を足し、そこから
     参加（説明＋ニックネーム）→ ランク戦 → 記録の提出 → ランキング表示
   までを受け持つ。文言は ranked-texts.js（9言語）。

   サーバー: ranking-server（Cloudflare Workers + D1）
     出題はサーバーが出し、回した手順をサーバーで再生して確かめる。
     時間はサーバーの時計で上限を押さえる（インスペクション15秒＋通信の余裕3秒）。

   index.html 側の入口（読み込みをやめれば全部なくなる＝元どおり）
     ・window.__rankedBridge.scramble(cfgs) … サーバーの出題を流し込む
     ・RankedHook.onTurn(cfg, t)      … executeTurn() で1手ごと（計測中だけ）
     ・RankedHook.onSolved(ms, assist)… stopTimer() で揃った瞬間
     ・RankedHook.onPause()           … pauseTimer()（ドロワー・アプリ離脱も含む）
     ・RankedHook.onAbort()           … resetTimer()（シャッフル・リセット・言語切替）

   ランク戦のルール
     ・インスペクションは15秒。15秒以内に1手目を回さなければ、その回は練習あつかい
     ・💡ヘルプ・OLL・PLL・ZBLL は使えない（ボタンを隠す。使えば練習あつかい）
     ・一時停止（タイムのタップ・ドロワー・アプリを離れる）をしたら練習あつかい
     ・練習あつかいになっても、ふだんのソルブとしては最後まで遊べる
       （端末内の記録・シャードは今までどおり）

   端末に保存するもの: 'rubiks-cube-ranked' = { playerId, secret, nickname }
     （BackupTransfer の KEYS の末尾に追加済み。引き継げば同じ参加者のまま）
   ========================================================================= */
(function (global) {
  'use strict';

  const API = 'https://vcc-ranking.toro1230830.workers.dev';
  const STORE_KEY = 'rubiks-cube-ranked';
  const INSPECTION_MS = 15000;
  const AXES = ['x', 'y', 'z'];
  const MASK_LAYERS = { 1: [-1], 2: [0], 4: [1], 3: [-1, 0], 6: [0, 1], 7: [-1, 0, 1] };

  /* ------------------------------------------------------------ 文言 -- */
  function tx(key, vars) {
    let s = '';
    try { if (typeof global.t === 'function') s = global.t(key, vars); } catch (e) { s = ''; }
    if (!s || s === key) {
      const ja = (global.RANKED_I18N && global.RANKED_I18N.ja) || {};
      s = ja[key] || key;
      if (vars) Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    }
    return s;
  }
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtTime(ms) {
    const cs = Math.floor(ms / 10);
    const m = Math.floor(cs / 6000), s = Math.floor(cs / 100) % 60, c = cs % 100;
    const two = function (n) { return (n < 10 ? '0' : '') + n; };
    return m > 0 ? m + ':' + two(s) + '.' + two(c) : s + '.' + two(c);
  }

  /* ------------------------------------------------------- 端末の保存 -- */
  function loadMe() {
    try {
      const v = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (v && typeof v.playerId === 'string' && typeof v.secret === 'string') return v;
    } catch (e) { /* 読めなければ未参加 */ }
    return null;
  }
  function saveMe(v) {
    try {
      if (v) localStorage.setItem(STORE_KEY, JSON.stringify(v));
      else localStorage.removeItem(STORE_KEY);
    } catch (e) { /* 保存できない環境では、このセッションだけ */ }
  }
  let me = loadMe();

  /* ------------------------------------------------------- 通信 -- */
  function api(path, body) {
    const ctl = global.AbortController ? new AbortController() : null;
    const timer = ctl ? setTimeout(function () { ctl.abort(); }, 12000) : null;
    const init = body === undefined
      ? { method: 'GET' }
      : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
    if (ctl) init.signal = ctl.signal;
    return fetch(API + path, init).then(function (res) {
      return res.json().catch(function () { return { ok: false, error: 'bad_response' }; })
        .then(function (j) { j.__status = res.status; return j; });
    }).catch(function () {
      return { ok: false, error: 'offline' };
    }).then(function (j) {
      if (timer) clearTimeout(timer);
      return j;
    });
  }
  function errText(code) {
    switch (code) {
      case 'not_solved': return tx('rkErrNotSolved');
      case 'inspection_over': return tx('rkErrInspection');
      case 'time_mismatch': return tx('rkErrTime');
      case 'expired': return tx('rkErrExpired');
      case 'too_soon': return tx('rkErrTooSoon');
      case 'bad_nickname': return tx('rkNickBad');
      default: return tx('rkErrOffline');
    }
  }

  /* ------------------------------------------------------------ 見た目 -- */
  /* 結果カードが波のように広がって出てくるための形と動き。
     出てくる場所は 左下・右下・左上・右上・真上・真下 の6通りから毎回ランダム（続けて同じにはしない）。
     角からは「ふちがゆるく波打つ扇形（1/4の円）」、真上・真下からは「波打つ半円」をマスクにして
     大きくしていくと、波の前線がその場所から流れてカードが現れる。同じ線をネオンで描いて前線に重ねる。
     閉じるときは、来た場所へ波が引いていく。 */
  const RES_FROM = {
    // c: 波の中心（0〜100の座標）、a: 扇の角度（度。0=右、90=上）、pos: マスクを置く場所、size: 広げきる大きさ
    // dx/dy/rot: カードが流れてくる向きと傾き
    bl: { c: [0, 100],  a: [0, 90],    pos: '0 100%',    size: 560, dx: -26, dy: 28,  rot: -5 },
    br: { c: [100, 100], a: [90, 180],  pos: '100% 100%', size: 560, dx: 26,  dy: 28,  rot: 5 },
    tl: { c: [0, 0],    a: [270, 360], pos: '0 0',       size: 560, dx: -26, dy: -28, rot: 5 },
    tr: { c: [100, 0],  a: [180, 270], pos: '100% 0',    size: 560, dx: 26,  dy: -28, rot: -5 },
    t:  { c: [50, 0],   a: [180, 360], pos: '50% 0',     size: 780, dx: 0,   dy: -34, rot: 0, half: true },
    b:  { c: [50, 100], a: [0, 180],   pos: '50% 100%',  size: 780, dx: 0,   dy: 34,  rot: 0, half: true }
  };
  const RES_FROM_KEYS = Object.keys(RES_FROM);
  function waveShape(o, close, inset) {
    const k = o.half ? 0.5 : 1;                  // 半円は半径も半分（箱からはみ出さないように）
    const a0 = o.a[0] * Math.PI / 180, a1 = o.a[1] * Math.PI / 180;
    const N = o.half ? 80 : 48;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const a = a0 + (a1 - a0) * (i / N);
      const r = k * (90 + 5 * Math.sin((a - a0) * 9 + 0.6)) - (inset || 0) * k;   // ゆるくうねる
      pts.push((o.c[0] + r * Math.cos(a)).toFixed(2) + ' ' + (o.c[1] - r * Math.sin(a)).toFixed(2));
    }
    return 'M' + (close ? o.c[0] + ' ' + o.c[1] + 'L' : '') + pts.join('L') + (close ? 'Z' : '');
  }
  function svgUrl(svg) { return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")'; }
  const RES_FX_CSS = (function () {
    const out = [];
    const EASE_IN = 'cubic-bezier(.22,.8,.3,1)', EASE_W = 'cubic-bezier(.3,.6,.25,1)', EASE_OUT = 'cubic-bezier(.5,0,.75,.4)';
    RES_FROM_KEYS.forEach(function (key) {
      const o = RES_FROM[key];
      const mask = svgUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="' + waveShape(o, true) + '" fill="#000"/></svg>');
      const line = svgUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" stroke-linecap="round">' +
        '<path d="' + waveShape(o, false, 1.6) + '" stroke="#2ef2c0" stroke-opacity=".35" stroke-width="12" vector-effect="non-scaling-stroke"/>' +
        '<path d="' + waveShape(o, false, 1.6) + '" stroke="#d6fff5" stroke-width="3" vector-effect="non-scaling-stroke"/></svg>');
      const S = o.size + 'px ' + o.size + 'px';
      const m = function (size) {
        return '-webkit-mask-image:' + mask + ';mask-image:' + mask + ';-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;' +
          '-webkit-mask-position:' + o.pos + ';mask-position:' + o.pos + ';-webkit-mask-size:' + size + ';mask-size:' + size;
      };
      const tr = function (dx, dy, rot, sc) {
        return 'transform:translate(calc(-50% + ' + dx + 'px),' + dy + 'px) rotate(' + rot + 'deg) scale(' + sc + ')';
      };
      const sx = Math.sign(o.dx), sy = Math.sign(o.dy);
      const sel = '#rk-res.on[data-from="' + key + '"]';
      out.push(
        sel + '{transform-origin:' + o.pos + ';animation:rk-res-in-' + key + ' .72s ' + EASE_IN + ' both,rk-res-mask-' + key + ' .72s ' + EASE_W + ' both}',
        sel + '.out{animation:rk-res-away-' + key + ' .34s ' + EASE_OUT + ' forwards,rk-res-unmask-' + key + ' .34s ' + EASE_OUT + ' forwards}',
        '@keyframes rk-res-in-' + key + '{0%{' + tr(o.dx, o.dy, o.rot, .94) + '}' +
          '62%{' + tr(-o.dx * 0.08, -o.dy * 0.1, -o.rot * 0.1, 1.004) + '}100%{' + tr(0, 0, 0, 1) + '}}',
        '@keyframes rk-res-away-' + key + '{to{' + tr(o.dx * 0.85, o.dy * 0.85, o.rot * 0.8, .95) + '}}',
        '@keyframes rk-res-mask-' + key + '{from{' + m('1px 1px') + '}to{' + m(S) + '}}',
        '@keyframes rk-res-unmask-' + key + '{from{' + m(S) + '}to{' + m('1px 1px') + '}}',
        // 波の前線に光る線
        sel + '::after{background:' + line + ' no-repeat ' + o.pos + '/1px 1px;animation:rk-res-line-' + key + ' .72s ' + EASE_W + ' both}',
        '@keyframes rk-res-line-' + key + '{0%{background-size:1px 1px;opacity:1}55%{opacity:.9}100%{background-size:' + S + ';opacity:0}}',
        // 中身は波を追いかけて、同じ向きから順に
        sel + ' .rk-res-time,' + sel + ' .rk-res-sub,' + sel + ' .rk-res-btn{animation-name:rk-res-item-' + key + '}',
        '@keyframes rk-res-item-' + key + '{from{opacity:0;transform:translate(' + (sx * 14) + 'px,' + (sy * 12) + 'px)}to{opacity:1;transform:none}}'
      );
    });
    return out;
  })();
  const CSS = [
    /* 全画面の画面。z-index はハブ(41)やPLL検定(42)より上、確認ダイアログ(80)より下 */
    '#rk-overlay{display:none;position:fixed;inset:0;z-index:46;overflow-y:auto;-webkit-overflow-scrolling:touch;',
    '  background:#121214;color:#e8e8ee;',
    '  padding:calc(env(safe-area-inset-top,0px) + 22px) calc(env(safe-area-inset-right,0px) + 16px) calc(env(safe-area-inset-bottom,0px) + 24px) calc(env(safe-area-inset-left,0px) + 16px)}',
    '#rk-overlay.show{display:block}',
    '.rk-wrap{max-width:460px;margin:0 auto;position:relative}',
    '.rk-close{position:absolute;top:0;right:0;width:40px;height:40px;border-radius:50%;border:1px solid #3a3a48;',
    '  background:#1c1c22;color:#c8c8d4;font-size:17px;cursor:pointer;font-family:inherit}',
    '.rk-close::after{content:"";position:absolute;inset:-6px}',
    '.rk-h{margin:6px 52px 16px 0;min-height:40px;font-size:22px;font-weight:900;letter-spacing:.02em;display:flex;align-items:center;gap:8px}',
    '.rk-card{background:#1c1c22;border:1px solid #2c2c38;border-radius:16px;padding:16px;margin-bottom:12px}',
    '.rk-body{white-space:pre-line;font-size:13.5px;line-height:1.75;color:#d4d4de;margin:0}',
    '.rk-rules{margin:14px 0 0;padding:10px 12px;border-radius:12px;background:#15151b;border:1px solid #2a2a35}',
    '.rk-join-rules .rk-rules{margin:0 0 14px;padding:12px 14px}',
    '.rk-rules-t{margin:0 0 6px;font-size:11.5px;font-weight:800;letter-spacing:.06em;color:#8f8fa6}',
    '.rk-rule-list{list-style:none;margin:0;padding:0;display:grid;gap:5px}',
    '.rk-rule-list li{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12.5px;line-height:1.4;color:#c8c8d4}',
    '.rk-rule-list li span{min-width:0}',
    '.rk-rule-list li b{flex:none;font-size:11.5px;font-weight:800;padding:3px 9px;border-radius:999px;white-space:nowrap;',
    '  background:rgba(255,106,122,.12);color:#ff8a96;border:1px solid rgba(255,106,122,.35)}',
    '.rk-rule-list li b.ok{background:rgba(var(--tc-rgb,46,242,192),.12);color:var(--tc,#2ef2c0);border-color:rgba(var(--tc-rgb,46,242,192),.4)}',
    '.rk-note{font-size:11.5px;line-height:1.6;color:#7c7c8e;margin:8px 0 0}',
    '.rk-label{display:block;font-size:12.5px;font-weight:700;color:#b8b8c6;margin:2px 0 8px}',
    '.rk-input{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:12px;border:1.4px solid #3a3a48;',
    '  background:#121218;color:#f0f0f6;font-size:16px;font-family:inherit;outline:none}',
    '.rk-input:focus{border-color:var(--tc,#2ef2c0)}',
    '.rk-err{min-height:1.2em;font-size:12px;color:#ff8a96;margin:6px 0 0}',
    '.rk-btn{display:block;width:100%;padding:14px;border-radius:12px;border:none;font-family:inherit;',
    '  font-size:15px;font-weight:800;cursor:pointer;margin-top:10px;transition:transform .1s ease-out,filter .1s}',
    '.rk-btn:active{transform:scale(.97);filter:brightness(1.1)}',
    '.rk-btn[disabled]{opacity:.5;pointer-events:none}',
    '.rk-btn.go{background:var(--tc,#2ef2c0);color:#101014}',
    '.rk-btn.sub{background:#2b2b34;color:#c8c8d2}',
    '.rk-me{display:flex;align-items:center;justify-content:space-between;gap:10px}',
    '.rk-me-name{font-size:15px;font-weight:800;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.rk-me-best{text-align:right;flex:none}',
    '.rk-me-best b{display:block;font-size:22px;font-weight:900;color:var(--tc,#2ef2c0);font-variant-numeric:tabular-nums}',
    '.rk-me-best span{font-size:12px;color:#9a9aac}',
    '.rk-list{list-style:none;margin:0;padding:0}',
    '.rk-row{display:grid;grid-template-columns:40px minmax(0,1fr) auto 30px;align-items:center;gap:10px;padding:10px 8px;',
    '  border-bottom:1px solid #26262f;font-size:14px;position:relative}',
    '.rk-row:last-child{border-bottom:none}',
    /* 自分の行: ほんのりネオンパープル */
    '.rk-row.mine{background:linear-gradient(90deg,rgba(176,92,255,.22),rgba(176,92,255,.08));border-radius:12px;',
    '  border-bottom-color:transparent;box-shadow:0 0 0 1px rgba(196,132,255,.7),0 0 16px rgba(176,92,255,.35)}',
    '.rk-row.mine .rk-nick{color:#e6ccff}',
    '.rk-you{flex:none;padding:1px 6px;border-radius:999px;font-size:9.5px;font-weight:800;line-height:1.4;',
    '  background:#b05cff;color:#fff;white-space:nowrap}',
    /* 確定演出のあと: ゴールドの炎とネオンで包む */
    '.rk-row.mine.hot,.rk-card.hot{animation:rkHot 1.1s ease-in-out infinite;',
    '  background:linear-gradient(90deg,rgba(255,176,40,.28),rgba(176,92,255,.18))}',
    '.rk-row.mine.hot::before{content:"";position:absolute;left:6%;right:6%;bottom:60%;height:120%;pointer-events:none;z-index:-1;',
    '  background:radial-gradient(ellipse at 50% 100%,rgba(255,200,60,.55),rgba(255,90,20,.25) 45%,transparent 70%);',
    '  filter:blur(6px);animation:rkFlame .5s ease-in-out infinite alternate;transform-origin:50% 100%}',
    '@keyframes rkHot{0%,100%{box-shadow:0 0 0 1.5px #ffd36a,0 0 18px rgba(255,190,60,.55),0 0 36px rgba(176,92,255,.35)}',
    '  50%{box-shadow:0 0 0 1.5px #fff1b8,0 0 30px rgba(255,200,80,.9),0 0 60px rgba(176,92,255,.55)}}',
    '@keyframes rkFlame{from{transform:scaleY(.85) scaleX(1);opacity:.75}to{transform:scaleY(1.15) scaleX(.94);opacity:1}}',
    '.rk-list{isolation:isolate}',
    '.rk-row.flag{opacity:.55}',
    '.rk-pos{font-weight:900;text-align:center;color:#9a9aac;font-variant-numeric:tabular-nums;justify-self:center}',
    /* 1〜3位: 金・銀・銅のメダル */
    '.rk-pos.m1,.rk-pos.m2,.rk-pos.m3{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-size:14px;position:relative}',
    '.rk-pos.m1{background:radial-gradient(circle at 32% 28%,#fff8d2,#ffd36a 42%,#c98a12 100%);color:#3d2700;',
    '  box-shadow:0 0 0 2px rgba(255,211,106,.35),0 0 14px rgba(255,200,70,.65)}',
    '.rk-pos.m2{background:radial-gradient(circle at 32% 28%,#ffffff,#d6dbe4 45%,#8b93a3 100%);color:#262a33;',
    '  box-shadow:0 0 0 2px rgba(214,219,228,.3),0 0 12px rgba(214,219,228,.45)}',
    '.rk-pos.m3{background:radial-gradient(circle at 32% 28%,#ffe2c4,#e0a46a 45%,#9a5a24 100%);color:#2e1604;',
    '  box-shadow:0 0 0 2px rgba(224,164,106,.3),0 0 12px rgba(224,164,106,.45)}',
    '.rk-row.top1{background:linear-gradient(90deg,rgba(255,211,106,.10),transparent 70%)}',
    '.rk-row.top2{background:linear-gradient(90deg,rgba(214,219,228,.07),transparent 70%)}',
    '.rk-row.top3{background:linear-gradient(90deg,rgba(224,164,106,.08),transparent 70%)}',
    '.rk-row.top1 .rk-time{color:#ffd36a}',
    /* 名前と「あなた」は縦に積む（名前の幅をできるだけ空ける） */
    '.rk-nick{min-width:0;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:2px;font-weight:700}',
    '.rk-nick-t{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    /* タイムの下に手数（いつも縦に積む） */
    '.rk-tm{display:flex;flex-direction:column;align-items:flex-end;gap:0;white-space:nowrap;justify-self:end;line-height:1.2}',
    '.rk-time{font-weight:900;font-size:15.5px;font-variant-numeric:tabular-nums;color:#f0f0f6}',
    '.rk-mv{font-size:11.5px;color:#8a8a9c;font-variant-numeric:tabular-nums}',
    /* 狭い画面では手数をタイムの下へ回し、名前の幅を空ける */
    '@media (max-width:380px){.rk-mv{font-size:10.5px}.rk-row{gap:7px;padding:8px 4px;grid-template-columns:34px minmax(0,1fr) auto 30px}',
    '  .rk-nick-t{font-size:13px}.rk-time{font-size:14.5px}.rk-pos.m1,.rk-pos.m2,.rk-pos.m3{width:27px;height:27px;font-size:13px}}',
    '.rk-empty{color:#7c7c8e;font-size:13px;text-align:center;padding:18px 0}',
    '.rk-links{display:flex;justify-content:center;gap:18px;margin-top:6px;flex-wrap:wrap}',
    '.rk-link{background:none;border:none;color:#8f8fa6;font-size:12.5px;text-decoration:underline;cursor:pointer;',
    '  font-family:inherit;padding:8px 2px}',
    '#confirm-ok.rk-danger{background:#ff4d63!important;border-color:#ff4d63!important;color:#fff!important}',
    '.rk-seasons{display:flex;gap:6px;overflow-x:auto;margin:0 0 10px;padding-bottom:2px;scrollbar-width:none}',
    '.rk-seasons::-webkit-scrollbar{display:none}',
    '.rk-sz{flex:none;padding:7px 12px;border-radius:999px;border:1px solid #3a3a48;background:#15151b;color:#b8b8c6;',
    '  font:inherit;font-size:12.5px;font-weight:800;cursor:pointer;white-space:nowrap}',
    '.rk-sz.on{background:var(--tc,#2ef2c0);color:#101014;border-color:transparent}',
    '.rk-mode{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;margin-bottom:12px;border-radius:16px;',
    '  background:linear-gradient(135deg,rgba(176,92,255,.20),rgba(46,242,192,.10));border:1px solid rgba(196,132,255,.45)}',
    '.rk-mode-i{font-size:30px;line-height:1}',
    '.rk-mode-t{min-width:0}',
    '.rk-mode-k{margin:0;font-size:11.5px;font-weight:800;color:#c9a8ff;letter-spacing:.04em}',
    '.rk-mode-n{margin:2px 0 3px;font-size:17px;font-weight:900;color:#f4ecff}',
    '.rk-mode-d{margin:0;font-size:12.5px;line-height:1.55;color:#cfc6dc}',
    '.rk-ended{font-size:12.5px;color:#9a9aac;text-align:center;margin:10px 0 0}',
    '.rk-xshare{display:flex;align-items:center;justify-content:center;gap:5px;width:100%;margin-top:10px;padding:11px;',
    '  border-radius:12px;border:1px solid #3a3a48;background:#000;color:#fff;font:inherit;font-size:14px;font-weight:800;cursor:pointer}',
    '.rk-xshare svg{width:16px;height:16px;fill:#fff}',
    '.rk-xshare:active{transform:scale(.97)}',
    '.rk-link.danger{color:#ff5a6e;text-decoration-color:rgba(255,90,110,.6);font-weight:700}',
    '.rk-sec{font-size:13px;font-weight:800;color:#9a9aac;margin:0 0 6px;display:flex;justify-content:space-between}',

    /* インスペクションのカウントダウンと、計測中の小さな印（キューブの操作は邪魔しない）
       ・指でなぞるモード：画面の上（キューブは下寄りなので重ならない）
       ・回転記号モード：キューブと記号ボタンのあいだ（ランク戦中は空いている OLL/PLL の段）に置く
         → placeHud() が .dock を付けて位置を決める */
    '#rk-hud{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 76px);z-index:30;pointer-events:none;',
    '  transform:translateX(-50%);display:none;box-sizing:border-box;overflow:hidden;',
    '  width:max-content;max-width:calc(100vw - 150px);padding:8px 14px 10px;border-radius:14px;',
    '  background:rgba(14,16,24,.86);border:1px solid rgba(46,242,192,.28);color:#f0f0f6;',
    '  box-shadow:0 6px 20px rgba(0,0,0,.45),0 0 14px rgba(46,242,192,.10);',
    '  -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}',
    '#rk-hud.on{display:block}',
    '#rk-hud.dock{max-width:none}',
    // 上の札：1段目に「インスペクション」と秒数、2段目から下に説明（幅いっぱい）
    // 下の .dock：秒数を右に大きく、左に2段
    '.rk-h-row{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"t n" "s s";column-gap:12px;align-items:center}',
    '#rk-hud.dock .rk-h-row{grid-template-areas:"t n" "s n"}',
    '.rk-h-t{grid-area:t}.rk-h-s{grid-area:s}#rk-hud .rk-h-row b{grid-area:n}',
    '.rk-h-t{display:block;font-size:13px;font-weight:800;letter-spacing:.04em;color:#f0f0f6;white-space:nowrap}',
    '.rk-h-s{display:block;margin-top:1px;font-size:11px;font-weight:600;line-height:1.4;color:#9a9aac}',
    // 幅の狭い上の札ではモード名とヒントを2行に、広い .dock では「・」でつないで1行に
    '.rk-h-m,.rk-h-k{display:block}',
    '.rk-h-m{color:#c9a8ff}',
    '#rk-hud.dock .rk-h-m,#rk-hud.dock .rk-h-k{display:inline;white-space:normal}',
    '#rk-hud.dock .rk-h-m::after{content:" · ";color:#6b6b7e}',
    '#rk-hud b{font-size:26px;line-height:1;font-weight:900;font-variant-numeric:tabular-nums;',
    '  min-width:1.3em;text-align:right;color:var(--tc,#2ef2c0);text-shadow:0 0 10px rgba(46,242,192,.35)}',
    // 残り時間のバー（下の縁）
    '.rk-h-bar{position:absolute;left:0;right:0;bottom:0;height:3px;background:rgba(255,255,255,.06)}',
    '.rk-h-bar i{display:block;height:100%;transform-origin:left center;background:var(--tc,#2ef2c0);',
    '  box-shadow:0 0 8px var(--tc,#2ef2c0);transition:transform .2s linear}',
    '#rk-hud.warn{border-color:rgba(255,106,122,.55);box-shadow:0 6px 20px rgba(0,0,0,.45),0 0 16px rgba(255,106,122,.25)}',
    '#rk-hud.warn b{color:#ff6a7a;text-shadow:0 0 10px rgba(255,106,122,.5)}',
    '#rk-hud.warn .rk-h-bar i{background:#ff6a7a;box-shadow:0 0 8px #ff6a7a}',
    // 計測中は小さな札だけ
    '#rk-hud.solo{padding:5px 12px;border-radius:999px;font-size:12px;font-weight:800;color:#cfd3e0;white-space:nowrap}',
    '#rk-hud.solo small{font-size:10.5px;font-weight:800;letter-spacing:.12em;color:#9a9aac}',
    '@media (prefers-reduced-motion:reduce){.rk-h-bar i{transition:none}}',
    /* ランク戦の最中はガイド系のボタンを隠す（場所は空けたまま） */
    'body.rk-on #help-btn,body.rk-on #oll-btn,body.rk-on #pll-btn,body.rk-on #zbll-btn{visibility:hidden;pointer-events:none}',

    /* 結果などの知らせ */
    '#rk-toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));z-index:10400;',
    '  transform:translateX(-50%);max-width:min(92vw,420px);width:max-content;box-sizing:border-box;',
    '  padding:12px 16px;border-radius:14px;background:#1c1c24;border:1px solid #3a3a48;color:#e6e6ee;',
    '  font-size:13.5px;font-weight:700;line-height:1.5;text-align:center;box-shadow:0 10px 28px rgba(0,0,0,.55);',
    '  opacity:0;pointer-events:none;transition:opacity .25s}',
    '#rk-toast.on{opacity:1;pointer-events:auto}',
    '#rk-toast .rk-t-big{display:block;font-size:20px;font-weight:900;color:var(--tc,#2ef2c0);margin-bottom:2px}',
    '#rk-toast .rk-t-btn{display:inline-block;margin-top:8px;padding:7px 14px;border-radius:999px;border:1px solid #4a4a58;',
    '  background:#121218;color:#e6e6ee;font:inherit;font-size:12.5px;cursor:pointer}',
    '@media (prefers-reduced-motion: reduce){#rk-toast{transition:none}.rk-btn{transition:none}}',

    /* ---- ランク戦の結果カード（自己ベストでないとき）：タイム・自己ベストと順位・ボタン2つだけ ---- */
    '#rk-res{position:fixed;left:50%;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:10401;',
    '  width:min(calc(100vw - 32px),340px);box-sizing:border-box;padding:18px 16px 16px;border-radius:20px;',
    '  background:#15161d;border:1px solid #2c2e3a;color:#eef0f6;text-align:center;',
    '  box-shadow:0 16px 40px rgba(0,0,0,.6);transform:translate(-50%,0);',
    '  visibility:hidden;pointer-events:none}',
    '#rk-res.on{visibility:visible;pointer-events:auto}',
    '#rk-res.on.out{pointer-events:none}',
    '#rk-res::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:0}',
    '#rk-res.on.out::after{animation:none!important}',
    '#rk-res.on .rk-res-time,#rk-res.on .rk-res-sub,#rk-res.on .rk-res-btn{animation:rk-res-item-bl .5s cubic-bezier(.2,.8,.3,1) backwards}',
    '#rk-res.on .rk-res-time{animation-delay:.12s}',
    '#rk-res.on .rk-res-sub{animation-delay:.2s}',
    '#rk-res.on .rk-res-btn.view{animation-delay:.27s}',
    '#rk-res.on .rk-res-btn.retry{animation-delay:.34s}',
  ].concat(RES_FX_CSS, [
    // リトライに、波の名残りの光が一度だけ流れる
    '.rk-res-btn.retry{position:relative;overflow:hidden}',
    '.rk-res-btn.retry::after{content:"";position:absolute;top:-20%;bottom:-20%;left:-40%;width:35%;pointer-events:none;',
    '  background:linear-gradient(100deg,transparent,rgba(255,255,255,.55),transparent);transform:translateX(-120%) skewX(-18deg);opacity:0}',
    '#rk-res.on .rk-res-btn.retry::after{animation:rk-res-sheen .9s .62s cubic-bezier(.3,.6,.3,1) both}',
    '@keyframes rk-res-sheen{0%{opacity:1;transform:translateX(0) skewX(-18deg)}100%{opacity:1;transform:translateX(480%) skewX(-18deg)}}',
    '.rk-res-x{position:absolute;top:6px;right:6px;width:36px;height:36px;border-radius:50%;border:none;padding:0;',
    '  display:grid;place-items:center;background:none;color:#7c8094;cursor:pointer}',
    '.rk-res-x svg{width:13px;height:13px;stroke:currentColor;stroke-width:2.2;stroke-linecap:round}',
    '.rk-res-time{font-family:Orbitron,ui-monospace,monospace;font-size:40px;line-height:1.1;font-weight:800;',
    '  font-variant-numeric:tabular-nums;color:var(--tc,#2ef2c0)}',
    '.rk-res-sub{margin:6px 0 16px;font-size:13px;font-weight:700;color:#9ea3b8}',
    '.rk-res-sub b{color:#eef0f6;font-variant-numeric:tabular-nums}',
    '.rk-res-sub.pb{color:#ffc24a}',
    '.rk-res-btn{display:block;width:100%;box-sizing:border-box;min-height:48px;border-radius:14px;font-family:inherit;',
    '  font-size:15px;font-weight:800;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation;',
    '  transition:transform .1s ease}',
    '.rk-res-btn:active{transform:scale(.97)}',
    '.rk-res-btn:focus{outline:none}.rk-res-btn:focus-visible{outline:2px solid #fff;outline-offset:2px}',
    '.rk-res-btn.view{color:#e8eaf2;background:none;border:1px solid #3a3d4c}',
    '.rk-res-btn.retry{margin-top:8px;min-height:52px;font-size:16px;color:#04161a;border:none;background:var(--tc,#2ef2c0)}',
    '@media (prefers-reduced-motion: reduce){#rk-res.on[data-from]{animation:rk-res-fade .2s both}#rk-res.on.out[data-from]{animation:rk-res-fade .15s reverse forwards}',
    '  #rk-res.on[data-from]::after,#rk-res.on[data-from] .rk-res-time,#rk-res.on[data-from] .rk-res-sub,#rk-res.on[data-from] .rk-res-btn,#rk-res.on .rk-res-btn.retry::after{animation:none}}',
    '@keyframes rk-res-fade{from{opacity:0}to{opacity:1}}'
  ]).join('\n');

  const REPLAY_MAX_RANK = 5;   // サーバーの REPLAY_MAX_RANK と同じ
  const TOP_N = 10;            // ランキングに並べる人数
  const SITE_URL = 'https://virtualcubechallenge.github.io/cube/';
  const HASHTAG = '#VirtualCubeChallenge';
  // 文言の中の「X」を X のマークに置き換える（「X Xでシェア」と2つ並ばないように）
  function xLabel(text) {
    if (global.PllShare && typeof global.PllShare.xLabel === 'function') return global.PllShare.xLabel(text);
    return X_LOGO + '<span>' + esc(text) + '</span>';
  }
  const X_LOGO = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.67l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23Zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64Z"/></svg>';
  function injectCSS() {
    if (global.RankedReplay) global.RankedReplay.injectCSS();
    if ($('rk-style')) return;
    const st = document.createElement('style');
    st.id = 'rk-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ---------------------------------------------- 月ごとのモード -- */
  // サーバーの SEASON_MODES と同じ名前。表示の文言と、遊んでいる最中の仕掛けをここに持つ
  const MODES = {
    'random-size': { icon: '🎲', name: 'rkModeRandomSize', desc: 'rkModeRandomSizeDesc' },
    normal: { icon: '🧊', name: 'rkModeNormal', desc: 'rkModeNormalDesc' }
  };
  function modeInfo(id) { return MODES[id] || MODES.normal; }
  function monthLabel(season) {
    const m = /^(\d{4})-(\d{2})$/.exec(season || '');
    if (!m) return season || '';
    try {
      const lang = document.documentElement.lang || 'ja';
      return new Intl.DateTimeFormat(lang, { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(Date.UTC(+m[1], +m[2] - 1, 15));
    } catch (e) { return m[1] + '/' + m[2]; }
  }
  function modeHtml(modeId, season, ended) {
    const mi = modeInfo(modeId);
    // 期間は決めていないので、月や期間は出さない（終わったシーズンだけ「終了」と付ける）
    return '<div class="rk-mode"><span class="rk-mode-i">' + mi.icon + '</span><div class="rk-mode-t">' +
      (ended ? '<p class="rk-mode-k">' + esc(tx('rkSeasonEnded')) + '</p>' : '') +
      '<p class="rk-mode-n">' + esc(tx(mi.name)) + '</p>' +
      '<p class="rk-mode-d">' + esc(tx(mi.desc)) + '</p></div></div>';
  }
  // ランダムサイズ: 1〜5% の極小は「たまに出る」くらい（5%）、ふだんは 6〜160% から
  function randomSize() {
    if (Math.random() < 0.05) return 1 + Math.floor(Math.random() * 5);
    return 6 + Math.floor(Math.random() * 155);
  }
  // 遊んでいる最中の仕掛け（1手ごとに呼ばれる）
  let playMode = 'normal';
  function applyModeOnTurn() {
    if (playMode === 'random-size') {
      const b = global.__rankedBridge;
      if (b && typeof b.setZoom === 'function') b.setZoom(randomSize());
    }
  }
  function resetModeEffects() {
    const b = global.__rankedBridge;
    if (b && typeof b.setZoom === 'function') b.setZoom(null);
    playMode = 'normal';
  }

  function rulesHtml() {
    const row = function (l, v) { return '<li><span>' + esc(tx(l)) + '</span><b>' + esc(tx(v)) + '</b></li>'; };
    return '<div class="rk-rules"><p class="rk-rules-t">' + esc(tx('rkRulesTitle')) + '</p><ul class="rk-rule-list">' +
      '<li><span>' + esc(tx('rkRuleInspL')) + '</span><b class="ok">' + esc(tx('rkRuleInspV')) + '</b></li>' +
      row('rkRuleGuideL', 'rkRuleGuideV') + row('rkRulePauseL', 'rkRulePauseV') + '</ul></div>';
  }
  // 一覧のタイム（1分未満は「23.46s」）
  function listTime(ms) { const t = fmtTime(ms); return t.indexOf(':') < 0 ? t + 's' : t; }

  /* ------------------------------------------------------------ 知らせ -- */
  let toastTimer = null;
  function toast(html, ms, onTap) {
    let el = $('rk-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'rk-toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.innerHTML = html;
    el.onclick = onTap ? function () { hideToast(); onTap(); } : null;
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, ms || 4500);
  }
  function hideToast() {
    const el = $('rk-toast');
    if (el) el.classList.remove('on');
  }

  /* 結果カード：タイムを大きく、その下に「自己ベスト ○○ · ○位」、
     ボタンは「ランキングを見る」と、その下に「リトライ」（すぐ次のランク戦へ）だけ */
  let lastFrom = '';
  function showResult(r, fromKey) {
    hideToast();
    let el = $('rk-res');
    if (!el) {
      el = document.createElement('div');
      el.id = 'rk-res';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
      el.addEventListener('click', function (e) {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.act === 'view') { hideResult(); openOverlay(); }
        else if (b.dataset.act === 'retry') { hideResult(); startRanked(); }
        else if (b.dataset.act === 'close') hideResult();
      });
    }
    const rank = r.rank ? ' · ' + esc(tx('rkRank', { n: r.rank })) : '';
    const sub = r.isNewBest
      ? '<p class="rk-res-sub pb">' + esc(tx('rkNewBest')) + rank + '</p>'
      : '<p class="rk-res-sub">' + esc(tx('rkMyBest')) + ' <b>' + esc(fmtTime(r.bestMs != null ? r.bestMs : r.timeMs)) + '</b>' + rank + '</p>';
    el.setAttribute('aria-label', tx('rkTitle'));
    el.innerHTML =
      '<button type="button" class="rk-res-x" data-act="close" aria-label="' + esc(tx('close') || '✕') + '">' +
        '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M12 2 2 12"/></svg></button>' +
      '<div class="rk-res-time">' + esc(fmtTime(r.timeMs)) + '</div>' + sub +
      '<button type="button" class="rk-res-btn view" data-act="view">' + esc(tx('rkViewRanking')) + '</button>' +
      '<button type="button" class="rk-res-btn retry" data-act="retry">' + esc(tx('rkRetry')) + '</button>';
    // 出てくる場所は6通りから毎回ランダム（前回と同じにはしない）
    let from;
    if (RES_FROM[fromKey]) from = fromKey;   // 確認用に向きを指定できる
    else do { from = RES_FROM_KEYS[Math.floor(Math.random() * RES_FROM_KEYS.length)]; } while (from === lastFrom);
    lastFrom = from;
    el.classList.remove('on', 'out');
    el.dataset.from = from;
    void el.offsetWidth;   // 出し直しでも毎回、最初から流れてくるように
    el.classList.add('on');
  }
  // 閉じるときは、来た左下へ波が引いていく
  function hideResult() {
    const el = $('rk-res');
    if (!el || !el.classList.contains('on') || el.classList.contains('out')) return;
    el.classList.add('out');
    let done = false;
    const finish = function () {
      if (done) return;
      done = true;
      el.removeEventListener('animationend', onEnd);
      if (el.classList.contains('out')) el.classList.remove('on', 'out');
    };
    const onEnd = function (e) { if (e.target === el) finish(); };
    el.addEventListener('animationend', onEnd);
    setTimeout(finish, 450);   // animationend が来ない環境でも必ず消す
  }

  /* ------------------------------------------------- ランク戦の進行 -- */
  // state: 'idle' | 'starting' | 'inspecting' | 'solving' | 'submitting'
  let state = 'idle';
  let attempt = null;       // { id }
  let moves = [];
  let lastT = 0;
  let applying = false;     // 自分で出題を流し込んでいる最中（自分の起こした中断を無視する）
  let inspectTimer = null;
  let inspectEnd = 0;

  function hud(on, warn, html, solo) {
    let el = $('rk-hud');
    if (!el) {
      el = document.createElement('div');
      el.id = 'rk-hud';
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
      global.addEventListener('resize', function () { if (el.classList.contains('on')) placeHud(el); });
    }
    el.classList.toggle('on', !!on);
    el.classList.toggle('warn', !!warn);
    el.classList.toggle('solo', !!(on && solo));
    if (html !== undefined) el.innerHTML = html;
    if (on) placeHud(el);
  }

  // 回転記号モードでは、キューブの上に重ねず「キューブと記号ボタンのあいだ」に置く。
  // ランク戦中は OLL/PLL/ZBLL/ヘルプを隠して場所だけ空けているので、その段（.alg-row）を使う。
  // その段が無い配置なら、記号ボタンのすぐ上。指でなぞるモードは画面の上のまま（CSS の既定）。
  function placeHud(el) {
    let cx = 0, cy = 0, w = 0, bandH = 0;
    if (!document.body.classList.contains('tap-mode')) {
      const row = document.querySelector('#controls .alg-row');
      const r = row ? row.getBoundingClientRect() : null;
      if (r && r.height > 30 && r.width > 200 && r.top > 0 && r.bottom <= global.innerHeight) {
        cx = r.left + r.width / 2; cy = r.top + r.height / 2; w = r.width; bandH = r.height;
      } else {
        const fg = $('face-grid');
        const g = fg ? fg.getBoundingClientRect() : null;
        if (g && g.height > 0 && g.top > 120) { cx = g.left + g.width / 2; cy = g.top - 36; w = g.width; bandH = 56; }
      }
    }
    el.classList.toggle('dock', w > 0);
    el.style.left = w ? cx.toFixed(1) + 'px' : '';
    el.style.width = w && !el.classList.contains('solo') ? Math.min(w, 440).toFixed(1) + 'px' : '';
    if (!w) { el.style.top = ''; return; }
    // 段の真ん中に。文が長くて段より高くなるときは、下端をそろえて上（キューブの下の空き）へ伸ばす
    const h = el.offsetHeight;
    const bottom = cy + bandH / 2;
    el.style.top = (h > bandH ? bottom - h : cy - h / 2).toFixed(1) + 'px';
  }

  function endRanked() {
    resetModeEffects();
    clearInterval(inspectTimer);
    inspectTimer = null;
    state = 'idle';
    attempt = null;
    moves = [];
    hud(false);
    document.body.classList.remove('rk-on');
  }

  // 練習あつかいに落とす（遊びは続けられる）
  function invalidate(reasonKey) {
    if (state !== 'inspecting' && state !== 'solving') return;
    endRanked();
    toast(esc(tx(reasonKey)), 5200);
  }

  function tickInspection() {
    const left = Math.max(0, inspectEnd - Date.now());
    const sec = Math.ceil(left / 1000);
    const mi = modeInfo(playMode);
    const total = (attempt && attempt.inspectMs) || INSPECTION_MS;
    hud(true, sec <= 3,
      '<div class="rk-h-row">' +
        '<span class="rk-h-t">' + esc(tx('rkInspection')) + '</span><b>' + sec + '</b>' +
        '<span class="rk-h-s">' + (playMode !== 'normal' ? '<span class="rk-h-m">' + mi.icon + ' ' + esc(tx(mi.name)) + '</span>' : '') +
          '<span class="rk-h-k">' + esc(tx('rkFirstMoveHint')) + '</span></span>' +
      '</div>' +
      '<span class="rk-h-bar" aria-hidden="true"><i style="transform:scaleX(' + Math.min(1, left / total).toFixed(3) + ')"></i></span>');
    if (left <= 0) invalidate('rkErrInspection');
  }

  function startRanked() {
    if (state !== 'idle' || !me) return;
    hideResult();
    const bridge = global.__rankedBridge;
    if (!bridge || typeof bridge.scramble !== 'function') { toast(esc(tx('rkErrOffline'))); return; }
    state = 'starting';
    const btn = $('rk-start');
    if (btn) btn.disabled = true;
    api('/api/start', { playerId: me.playerId, secret: me.secret }).then(function (r) {
      if (btn) btn.disabled = false;
      if (!r.ok) {
        state = 'idle';
        if (r.__status === 401) { saveMe(null); me = null; render(); }
        toast(esc(errText(r.error)));
        return;
      }
      closeOverlay();
      // ヘルプが点いたままなら消してから始める（使った印が立たないように）
      const hb = $('help-btn');
      if (hb && hb.classList.contains('on')) { try { hb.click(); } catch (e) { /* そのまま */ } }

      const cfgs = (r.scrambleTurns || []).map(function (t) {
        return { axis: AXES[t[0]], layers: MASK_LAYERS[t[1]].slice(), dir: t[2] };
      });
      applying = true;
      try { bridge.scramble(cfgs); } finally { applying = false; }

      attempt = { id: r.attemptId, inspectMs: r.inspectionMs || INSPECTION_MS };
      moves = [];
      lastT = 0;
      playMode = MODES[r.mode] ? r.mode : 'normal';
      state = 'inspecting';
      document.body.classList.add('rk-on');
      inspectEnd = Date.now() + (r.inspectionMs || INSPECTION_MS);
      tickInspection();
      clearInterval(inspectTimer);
      inspectTimer = setInterval(tickInspection, 200);
    });
  }

  function submit(ms) {
    resetModeEffects();
    state = 'submitting';
    hud(false);
    document.body.classList.remove('rk-on');
    const payload = {
      playerId: me.playerId, secret: me.secret,
      attemptId: attempt.id, timeMs: Math.round(ms), moves: moves
    };
    // 解いたときのキューブの色（上位の解き方の再生で同じ色にする）
    try { if (typeof global.__getCubeColors === 'function') payload.colors = global.__getCubeColors(); } catch (e) { /* 無くても記録はできる */ }
    attempt = null;
    solvedAt = Date.now();
    toast(esc(tx('rkSending')), 15000);
    api('/api/finish', payload).then(function (r) {
      state = 'idle';
      moves = [];
      if (!r.ok) { toast(esc(errText(r.error)), 6000); return; }
      if (r.isNewBest && global.RankedFx) { celebrate(r); return; }
      showResult(r);
    });
  }

  // 確定演出: 1位 → tier 1、2〜3位 → tier 2、それ以外の自己ベスト → tier 3。終わったら自分の行を燃やしてランキングを開く
  // 大当たり（1%の虹色シャード）が当たった回は、その演出が終わるまで待つ。
  // 報酬の抽選は完成の約0.6秒後なので、それまでは結果が出るのを待つ（出なければ待たない）
  let solvedAt = 0;
  function afterJackpot(cb) {
    const t0 = solvedAt || Date.now();
    const tick = function () {
      const r = global.__clearReward, now = Date.now();
      if (r && r.at >= t0 - 50) {
        if (r.done) { setTimeout(cb, r.jackpot ? 450 : 0); return; }
      } else if (now - t0 > 2500 || typeof global.handleClearReward !== 'function') { cb(); return; }
      if (now - t0 > 90000) { cb(); return; }      // 念のため（演出が止まってしまったとき）
      setTimeout(tick, 150);
    };
    tick();
  }

  function celebrate(r) {
    hideToast();
    afterJackpot(function () { playCelebration(r); });
  }
  function playCelebration(r) {
    const tier = r.rank === 1 ? 1 : r.rank <= 3 ? 2 : 3;
    global.RankedFx.play({ tier: tier, rank: r.rank, timeMs: r.timeMs, tx: tx, fmt: fmtTime }, function () {
      hot = true;
      openOverlay();
    });
  }

  // index.html から呼ばれる受け口
  global.RankedHook = {
    onTurn: function (cfg, t) {
      if (state !== 'inspecting' && state !== 'solving') return;
      if (state === 'inspecting') {
        state = 'solving';
        clearInterval(inspectTimer);
        inspectTimer = null;
        hud(true, false, '🌍 ' + (playMode !== 'normal' ? modeInfo(playMode).icon + ' ' : '') + '<small>RANKED</small>', true);
      }
      const axis = AXES.indexOf(cfg.axis);
      let mask = 0;
      (cfg.layers || []).forEach(function (L) { mask |= (L === -1 ? 1 : L === 0 ? 2 : L === 1 ? 4 : 0); });
      if (axis < 0 || !MASK_LAYERS[mask] || (cfg.dir !== 1 && cfg.dir !== -1)) { invalidate('rkErrTime'); return; }
      let ms = Math.max(0, Math.round(t || 0));
      if (ms < lastT) ms = lastT;
      lastT = ms;
      moves.push([axis, mask, cfg.dir, ms]);
      if (moves.length > 2000) { invalidate('rkErrTime'); return; }
      applyModeOnTurn();
    },
    onSolved: function (ms, usedAssist) {
      if (state !== 'solving') return;
      if (usedAssist) { invalidate('rkAssistUsed'); return; }
      if (!moves.length) { invalidate('rkErrTime'); return; }
      submit(ms);
    },
    onPause: function () { invalidate('rkPaused'); },
    onAbort: function () { if (!applying) invalidate('rkCancelled'); }
  };
  // シャッフル・リセットは resetTimer() を通るが、念のためイベントでも拾う
  global.addEventListener('cube-reset', function () { if (!applying) invalidate('rkCancelled'); });

  /* ------------------------------------------------------------ 画面 -- */
  let view = 'home';
  let board = null;      // 最後に取ったランキング
  let loading = false;

  function overlayEl() {
    let el = $('rk-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'rk-overlay';
      document.body.appendChild(el);
    }
    return el;
  }

  function openOverlay() {
    injectCSS();
    // 揃えた直後はランクのリザルト(#rr, z-index 10100)が開いていることがある。
    // その上からは見えないので、先に閉じてからランキングを出す。
    try {
      const rr = $('rr');
      if (rr && rr.classList.contains('open') && global.RankResult) global.RankResult.close();
    } catch (e) { /* 閉じられなくてもランキングは開く */ }
    const el = overlayEl();
    view = me ? 'home' : 'join';
    el.hidden = false;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    render();
    el.classList.add('show');
    el.scrollTop = 0;
    viewSeason = null;
    board = null;
    loadSeasons();
    if (me) loadBoard();
  }
  function closeOverlay() {
    if (global.RankedReplay) global.RankedReplay.close();
    const el = $('rk-overlay');
    hot = false;
    if (!el) return;
    el.classList.remove('show');
    el.hidden = true;
  }

  let hot = false;        // 確定演出のすぐあと（自分の行を燃やす）
  let seasonList = null;  // [{id, mode, players}]（新しい順）
  let currentSeason = null, currentMode = 'normal';
  let viewSeason = null;  // 見ている月（null = 今月）
  function loadSeasons() {
    api('/api/seasons').then(function (r) {
      if (!r.ok) return;
      seasonList = r.seasons || [];
      currentSeason = r.current; currentMode = r.currentMode || 'normal';
      render();
    });
  }
  function modeOfList(id) {
    const f = (seasonList || []).filter(function (x) { return x.id === id; })[0];
    return f ? f.mode : 'normal';
  }
  function isMineEntry(e) {
    const mine = board && board.me;
    return !!(mine && me && e.rank === mine.rank && e.nickname === me.nickname);
  }
  function mineInList() { return board.entries.some(isMineEntry); }

  function loadBoard() {
    loading = true;
    render();
    const want = viewSeason;
    api('/api/ranking?limit=' + TOP_N + (me ? '&player=' + encodeURIComponent(me.playerId) : '') +
        (want ? '&season=' + encodeURIComponent(want) : '')).then(function (r) {
      if (want !== viewSeason) return;      // 途中で別の月に切り替えた
      loading = false;
      board = r.ok ? r : { error: r.error };
      if (r.ok) { currentSeason = r.current || currentSeason; currentMode = r.currentMode || currentMode; }
      render();
      if (hot) {
        const row = $('rk-mine-row');
        if (row && row.scrollIntoView) { try { row.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { row.scrollIntoView(); } }
      }
    });
  }

  function render() {
    const el = $('rk-overlay');
    if (!el || el.hidden) return;
    let html = '<div class="rk-wrap"><button type="button" class="rk-close" id="rk-close" aria-label="✕">✕</button>';
    if (view === 'join' || view === 'rename') {
      const renaming = view === 'rename';
      html += '<h2 class="rk-h">🌍 ' + esc(tx(renaming ? 'rkRename' : 'rkJoinTitle')) + '</h2>';
      if (!renaming) {
        if (currentSeason) html += modeHtml(currentMode, currentSeason, false);
        // 参加時の説明文（rkJoinBody）は 2026-10-14 にやめた（ルールだけ見せる）
        html += '<div class="rk-join-rules">' + rulesHtml() + '</div>';
      }
      html += '<div class="rk-card"><label class="rk-label" for="rk-nick">' + esc(tx('rkNickLabel')) + '</label>' +
        '<input class="rk-input" id="rk-nick" maxlength="24" autocomplete="off" autocapitalize="off" spellcheck="false" value="' +
        esc(renaming && me ? me.nickname : '') + '">' +
        '<p class="rk-err" id="rk-err"></p>' +
        '<button type="button" class="rk-btn go" id="rk-join">' + esc(tx(renaming ? 'rkSave' : 'rkJoin')) + '</button>' +
        '<button type="button" class="rk-btn sub" id="rk-back">' + esc(tx(renaming ? 'rkCancelBtn' : 'rkNotNow')) + '</button></div>';
    } else {
      html += '<h2 class="rk-h">🌍 ' + esc(tx('rkTitle')) + '</h2>';
      const shownSeason = viewSeason || (board && board.season) || currentSeason;
      const isPast = !!(viewSeason && currentSeason && viewSeason !== currentSeason);
      if (seasonList && seasonList.length > 1) {
        html += '<div class="rk-seasons" role="tablist">' + seasonList.map(function (x) {
          const on = x.id === shownSeason;
          return '<button type="button" class="rk-sz' + (on ? ' on' : '') + '" role="tab" aria-selected="' + on + '" data-season="' + esc(x.id) + '">' +
            modeInfo(x.mode).icon + ' ' + esc(tx(modeInfo(x.mode).name)) + '</button>';
        }).join('') + '</div>';
      }
      if (shownSeason) html += modeHtml(isPast ? (board && board.mode) || modeOfList(shownSeason) : currentMode, shownSeason, isPast);
      const mine = board && board.me;
      html += '<div class="rk-card' + (hot && !(board && board.entries && mineInList()) ? ' hot' : '') + '"><div class="rk-me"><div class="rk-me-name">' + esc(me ? me.nickname : '') + '</div>' +
        '<div class="rk-me-best">' + (mine
          ? '<b>' + esc(fmtTime(mine.timeMs)) + '</b><span>' + esc(tx('rkMyBest')) + ' · ' + esc(tx('rkRank', { n: mine.rank })) + '</span>'
          : '<span>' + esc(tx('rkNoRecordYet')) + '</span>') + '</div></div>' +
        (mine ? '<button type="button" class="rk-xshare" id="rk-xshare">' + xLabel(tx('rkShareX')) + '</button>' : '') +
        (isPast
          ? '<p class="rk-ended">' + esc(tx('rkSeasonEndedNote')) + '</p>'
          : '<button type="button" class="rk-btn go" id="rk-start"' + (state !== 'idle' ? ' disabled' : '') + '>' + esc(tx('rkStart')) + '</button>' +
            rulesHtml()) + '</div>';

      html += '<div class="rk-card"><p class="rk-sec"><span>TOP ' + TOP_N + '</span><span>' +
        (board && board.total ? esc(tx('rkPlayers', { n: board.total })) : '') + '</span></p>';
      if (loading && !board) {
        html += '<div class="rk-empty">…</div>';
      } else if (!board || board.error) {
        html += '<div class="rk-empty">' + esc(tx('rkErrOffline')) + '</div>';
      } else if (!board.entries.length) {
        html += '<div class="rk-empty">' + esc(tx('rkEmpty')) + '</div>';
      } else {
        html += '<ol class="rk-list">' + board.entries.map(function (e) {
          const isMine = isMineEntry(e);
          const medal = e.rank <= 3 ? ' m' + e.rank : '';
          return '<li class="rk-row' + (e.rank <= 3 ? ' top' + e.rank : '') + (isMine ? ' mine' + (hot ? ' hot' : '') : '') +
            (e.flagged ? ' flag' : '') + '"' + (isMine ? ' id="rk-mine-row"' : '') + '>' +
            '<span class="rk-pos' + medal + '">' + e.rank + '</span>' +
            '<span class="rk-nick"><span class="rk-nick-t">' + esc(e.nickname) + '</span>' + (isMine ? '<span class="rk-you">' + esc(tx('rkYou')) + '</span>' : '') + '</span>' +
            '<span class="rk-tm"><span class="rk-time">' + esc(listTime(e.timeMs)) + '</span>' +
            '<span class="rk-mv">' + esc(tx('rkMoves', { n: e.moveCount })) + '</span></span>' +
            // 1〜5位は立体キューブのマークから解き方を1手ずつ見られる
            (e.rank <= REPLAY_MAX_RANK && global.RankedReplay
              ? '<button type="button" class="rk-rp-btn" data-rank="' + e.rank + '" aria-label="' + esc(tx('rkReplayOpen', { n: e.rank })) +
                '" title="' + esc(tx('rkReplayOpen', { n: e.rank })) + '">' + global.RankedReplay.icon + '</button>'
              : '<span></span>') + '</li>';
        }).join('') + '</ol>';
      }
      html += '</div>';
      html += '<div class="rk-links"><button type="button" class="rk-link" id="rk-rename">' + esc(tx('rkRename')) + '</button>' +
        '<button type="button" class="rk-link danger" id="rk-leave">' + esc(tx('rkLeave')) + '</button></div>';
    }
    html += '</div>';
    el.innerHTML = html;
    bindView();
  }

  function bindView() {
    const on = function (id, fn) { const b = $(id); if (b) b.addEventListener('click', fn); };
    on('rk-close', closeOverlay);
    on('rk-back', function () {
      if (view === 'rename') { view = 'home'; render(); } else closeOverlay();
    });
    on('rk-join', submitNickname);
    const input = $('rk-nick');
    if (input) input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submitNickname(); } });
    on('rk-start', startRanked);
    on('rk-rename', function () { view = 'rename'; render(); });
    on('rk-leave', leave);
    on('rk-xshare', shareX);
    const sz = document.querySelector('#rk-overlay .rk-seasons');
    if (sz) sz.addEventListener('click', function (e) {
      const b = e.target.closest('.rk-sz');
      if (!b) return;
      const id = b.getAttribute('data-season');
      viewSeason = id === currentSeason ? null : id;
      board = null;
      hot = false;
      loadBoard();
    });
    const list = document.querySelector('#rk-overlay .rk-list');
    if (list) list.addEventListener('click', function (e) {
      const b = e.target.closest('.rk-rp-btn');
      if (!b || !global.RankedReplay) return;
      global.RankedReplay.open({ rank: parseInt(b.getAttribute('data-rank'), 10), season: (board && board.season) || viewSeason, api: api, tx: tx, fmt: listTime });
    });
  }

  function nickOk(s) {
    const v = String(s || '').replace(/\s+/g, ' ').trim();
    const n = Array.from(v).length;
    if (n < 1 || n > 7) return null;
    return v;
  }

  function submitNickname() {
    const input = $('rk-nick'), err = $('rk-err'), btn = $('rk-join');
    const v = nickOk(input && input.value);
    if (!v) { if (err) err.textContent = tx('rkNickLength'); return; }
    if (btn) btn.disabled = true;
    const renaming = view === 'rename' && me;
    const req = renaming
      ? api('/api/nickname', { playerId: me.playerId, secret: me.secret, nickname: v })
      : api('/api/register', { nickname: v });
    req.then(function (r) {
      if (btn) btn.disabled = false;
      if (!r.ok) { if (err) err.textContent = errText(r.error); return; }
      if (renaming) me.nickname = r.nickname;
      else me = { playerId: r.playerId, secret: r.secret, nickname: r.nickname };
      saveMe(me);
      view = 'home';
      board = null;
      loadBoard();
    });
  }

  // 自分の順位を X に投稿する。結果を1枚の画像（1080×1350）に描いて、PLL検定と同じ
  // 確認の小窓（pll-share.js の PllShare.shareCanvas）から渡す。投稿するかは本人が決める
  function shareCaption(mine, mi) {
    return tx('rkShareText', {
      rank: mine.rank, mode: mi.icon + ' ' + tx(mi.name), time: listTime(mine.timeMs), moves: mine.moveCount
    }) + '\n' + HASHTAG;
  }
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function fitFont(ctx, s, weight, size, minSize, maxW, F) {
    ctx.font = weight + ' ' + size + 'px ' + F;
    while (size > minSize && ctx.measureText(s).width > maxW) { size -= 2; ctx.font = weight + ' ' + size + 'px ' + F; }
    return size;
  }
  // ネオンの文字（外側に何層も光をにじませてから、白っぽい芯を重ねる）
  function neonText(ctx, text, x, y, color, glow, layers) {
    ctx.save();
    ctx.fillStyle = color;
    (layers || [80, 40, 18]).forEach(function (b) { ctx.shadowColor = glow; ctx.shadowBlur = b; ctx.fillText(text, x, y); });
    ctx.restore();
  }
  // 斜め上から見たキューブの線画（3面×3×3）。背景にうっすら置く
  function wireCube(ctx, cx, cy, a, lw) {
    const c30 = Math.cos(Math.PI / 6);
    const T = [cx, cy - a], Rt = [cx + a * c30, cy - a / 2], C = [cx, cy], Lt = [cx - a * c30, cy - a / 2];
    const Rb = [Rt[0], Rt[1] + a], Cb = [C[0], C[1] + a], Lb = [Lt[0], Lt[1] + a];
    const seg = function (p, q) { ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); };
    const lerp = function (p, q, t) { return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; };
    ctx.beginPath();
    // 外形
    seg(T, Rt); seg(Rt, Rb); seg(Rb, Cb); seg(Cb, Lb); seg(Lb, Lt); seg(Lt, T); seg(Lt, C); seg(C, Rt); seg(C, Cb);
    for (let i = 1; i < 3; i++) {
      const t = i / 3;
      // 上面
      seg(lerp(Lt, T, t), lerp(C, Rt, t)); seg(lerp(Lt, C, t), lerp(T, Rt, t));
      // 左の面
      seg(lerp(Lt, C, t), lerp(Lb, Cb, t)); seg(lerp(Lt, Lb, t), lerp(C, Cb, t));
      // 右の面
      seg(lerp(C, Rt, t), lerp(Cb, Rb, t)); seg(lerp(C, Cb, t), lerp(Rt, Rb, t));
    }
    ctx.lineWidth = lw; ctx.stroke();
  }
  function shareCard(mine, mi) {
    const W = 1080, H = 1350;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    let F = 'sans-serif';
    try { F = getComputedStyle(document.body).fontFamily || F; } catch (e) { /* そのまま */ }
    const CYAN = '#2ef2ff', PURPLE = '#b05cff', MINT = '#2ef2c0';
    const MEDAL = { 1: ['#fffbe0', '#ffd36a', '#c98a12', '#3d2700', 'rgba(255,200,60,'], 2: ['#ffffff', '#dfe4ec', '#8b93a3', '#262a33', 'rgba(220,230,255,'], 3: ['#ffe8d0', '#e8aa70', '#9a5a24', '#2e1604', 'rgba(255,160,90,'] };
    const medal = MEDAL[mine.rank];
    const CX = W / 2;

    // ---- 背景: 真っ暗 ＋ 左上シアン・右下パープルの光 ＋ 床のサイバーグリッド
    ctx.fillStyle = '#04040a'; ctx.fillRect(0, 0, W, H);
    let g = ctx.createRadialGradient(140, 120, 0, 140, 120, 900);
    g.addColorStop(0, 'rgba(46,242,255,.30)'); g.addColorStop(1, 'rgba(46,242,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    g = ctx.createRadialGradient(W - 100, H - 120, 0, W - 100, H - 120, 1000);
    g.addColorStop(0, 'rgba(176,92,255,.36)'); g.addColorStop(1, 'rgba(176,92,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.globalAlpha = 0.22; ctx.strokeStyle = PURPLE; ctx.lineWidth = 2;
    const hz = 960;   // 地平線
    for (let i = -12; i <= 12; i++) { ctx.beginPath(); ctx.moveTo(CX + i * 18, hz); ctx.lineTo(CX + i * 160, H); ctx.stroke(); }
    for (let k = 0; k < 9; k++) { const yy = hz + Math.pow(k / 8, 1.8) * (H - hz); ctx.globalAlpha = 0.06 + 0.2 * (k / 8); ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke(); }
    ctx.restore();

    // ---- 背景の大きなネオンキューブ（線画）
    ctx.save();
    const cg = ctx.createLinearGradient(CX - 420, 200, CX + 420, 1100);
    cg.addColorStop(0, CYAN); cg.addColorStop(1, PURPLE);
    ctx.strokeStyle = cg;
    ctx.globalAlpha = 0.30; ctx.shadowColor = CYAN; ctx.shadowBlur = 40;
    wireCube(ctx, CX, 640, 430, 5);
    ctx.globalAlpha = 0.42; ctx.shadowBlur = 0;
    wireCube(ctx, CX, 640, 430, 2);
    ctx.restore();

    // ---- 外枠: シアン→パープルの発光ライン
    const PX = 36, PY = 36, PW = W - 72, PH = H - 72;
    const fg = ctx.createLinearGradient(PX, PY, PX + PW, PY + PH);
    fg.addColorStop(0, CYAN); fg.addColorStop(0.5, '#6f8bff'); fg.addColorStop(1, PURPLE);
    ctx.save();
    rrect(ctx, PX, PY, PW, PH, 44);
    ctx.fillStyle = 'rgba(10,10,18,.55)'; ctx.fill();
    ctx.strokeStyle = fg;
    [[60, 6], [24, 5], [0, 4]].forEach(function (p) { ctx.shadowColor = p[0] ? (p[0] > 30 ? PURPLE : CYAN) : 'transparent'; ctx.shadowBlur = p[0]; ctx.lineWidth = p[1]; ctx.stroke(); });
    ctx.restore();

    const L = PX + 56, R = PX + PW - 56, CW = R - L;
    ctx.textBaseline = 'alphabetic';

    // ---- ヘッダー: アプリ名・右上に GLOBAL LEADERBOARD の札
    ctx.textAlign = 'left';
    ctx.font = '900 30px ' + F;
    neonText(ctx, 'VIRTUAL CUBE CHALLENGE', L, PY + 92, '#d8fbff', CYAN, [30, 10]);
    ctx.save();
    ctx.font = '900 24px ' + F;
    const badge = 'GLOBAL LEADERBOARD';
    const bw = ctx.measureText(badge).width + 40;
    ctx.translate(R - bw / 2, PY + 82); ctx.rotate(-0.05);
    rrect(ctx, -bw / 2, -28, bw, 52, 8);
    ctx.fillStyle = 'rgba(176,92,255,.20)'; ctx.fill();
    ctx.shadowColor = PURPLE; ctx.shadowBlur = 24; ctx.lineWidth = 3; ctx.strokeStyle = '#d6a8ff'; ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillStyle = '#f1e2ff'; ctx.textAlign = 'center'; ctx.fillText(badge, 0, 8);
    ctx.restore();

    // 見出しとモード
    ctx.textAlign = 'left'; ctx.fillStyle = '#ffffff';
    ctx.font = '900 64px ' + F;
    ctx.fillText('🌍 ' + tx('rkTitle'), L, PY + 182);
    const modeText = mi.icon + ' ' + tx(mi.name);
    ctx.font = '900 32px ' + F;
    const mw = Math.min(CW, ctx.measureText(modeText).width + 56);
    ctx.save();
    rrect(ctx, L, PY + 210, mw, 62, 31);
    ctx.fillStyle = 'rgba(46,242,255,.10)'; ctx.fill();
    ctx.shadowColor = CYAN; ctx.shadowBlur = 20; ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(120,240,255,.9)'; ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#e6fdff'; ctx.fillText(modeText, L + 28, PY + 252);

    // ---- 順位: メダル（1〜3位）は放射する光の中で輝く
    const rankText = tx('rkRank', { n: mine.rank });
    const cy = 560;
    if (medal) {
      ctx.save();
      ctx.translate(CX, cy);
      for (let i = 0; i < 24; i++) {
        ctx.rotate(Math.PI / 12);
        const rg = ctx.createLinearGradient(0, 0, 0, -330);
        rg.addColorStop(0, medal[4] + '.55)'); rg.addColorStop(1, medal[4] + '0)');
        ctx.fillStyle = rg;
        ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(16, 0); ctx.lineTo(0, -330); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      const glow = ctx.createRadialGradient(CX, cy, 100, CX, cy, 280);
      glow.addColorStop(0, medal[4] + '.55)'); glow.addColorStop(1, medal[4] + '0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(CX, cy, 280, 0, Math.PI * 2); ctx.fill();
      const mg = ctx.createRadialGradient(CX - 55, cy - 65, 10, CX, cy, 165);
      mg.addColorStop(0, medal[0]); mg.addColorStop(0.45, medal[1]); mg.addColorStop(1, medal[2]);
      ctx.save();
      [90, 50, 20].forEach(function (b) { ctx.shadowColor = medal[1]; ctx.shadowBlur = b; ctx.beginPath(); ctx.arc(CX, cy, 160, 0, Math.PI * 2); ctx.fillStyle = mg; ctx.fill(); });
      ctx.restore();
      ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(255,255,255,.55)';
      ctx.beginPath(); ctx.arc(CX, cy, 160, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.25)';
      ctx.beginPath(); ctx.arc(CX, cy, 132, 0, Math.PI * 2); ctx.stroke();
      ctx.textAlign = 'center'; ctx.fillStyle = medal[3];
      fitFont(ctx, rankText, '900', 128, 60, 250, F);
      ctx.fillText(rankText, CX, cy + 45);
    } else {
      ctx.textAlign = 'center';
      fitFont(ctx, rankText, '900', 200, 80, CW, F);
      neonText(ctx, rankText, CX, cy + 70, '#eafffb', MINT, [110, 60, 24]);
    }

    // ---- 名前
    ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff';
    const nick = me ? me.nickname : '';
    fitFont(ctx, nick, '900', 66, 36, CW, F);
    ctx.save(); ctx.shadowColor = 'rgba(255,255,255,.35)'; ctx.shadowBlur = 20; ctx.fillText(nick, CX, 820); ctx.restore();

    // ---- タイム: いちばん強く光らせる
    const t = listTime(mine.timeMs);
    fitFont(ctx, t, '900', 180, 90, CW, F);
    neonText(ctx, t, CX, 990, '#f0fffb', MINT, [140, 80, 36, 12]);

    // ---- CAN YOU BEAT THIS?（斜めのスタンプ）
    ctx.save();
    ctx.translate(CX, 1062); ctx.rotate(-0.035);
    ctx.font = 'italic 900 40px ' + F;
    const cta = 'CAN YOU BEAT THIS?';
    const cw2 = ctx.measureText(cta).width + 60;
    const sg = ctx.createLinearGradient(-cw2 / 2, 0, cw2 / 2, 0);
    sg.addColorStop(0, CYAN); sg.addColorStop(1, PURPLE);
    rrect(ctx, -cw2 / 2, -38, cw2, 64, 10);
    ctx.fillStyle = sg; ctx.shadowColor = PURPLE; ctx.shadowBlur = 40; ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = '#07070d'; ctx.textAlign = 'center';
    ctx.fillText(cta, 0, 8);
    ctx.restore();

    // ---- 数字3つ（ガラスの箱）
    const tps = mine.timeMs > 0 ? (mine.moveCount / (mine.timeMs / 1000)).toFixed(2) : '–';
    const stats = [[tx('rkCardMoves'), String(mine.moveCount)], ['TPS', tps], [tx('rkCardPlayers'), String((board && board.total) || 1)]];
    const gap = 22, bw3 = (CW - gap * 2) / 3, bh = 132, by = 1116;
    stats.forEach(function (st, i) {
      const x = L + i * (bw3 + gap);
      ctx.save();
      rrect(ctx, x, by, bw3, bh, 22);
      ctx.fillStyle = 'rgba(20,20,34,.82)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = i === 1 ? 'rgba(46,242,255,.6)' : 'rgba(176,92,255,.55)';
      ctx.shadowColor = i === 1 ? CYAN : PURPLE; ctx.shadowBlur = 16; ctx.stroke();
      ctx.restore();
      ctx.textAlign = 'center'; ctx.fillStyle = '#9fa3c4';
      fitFont(ctx, st[0], '800', 26, 18, bw3 - 24, F);
      ctx.fillText(st[0], x + bw3 / 2, by + 44);
      ctx.fillStyle = '#ffffff';
      fitFont(ctx, st[1], '900', 56, 30, bw3 - 24, F);
      ctx.fillText(st[1], x + bw3 / 2, by + 108);
    });

    // ---- 足もと: 日時とサイトの URL
    const footY = PY + PH - 26;
    const d = new Date(), z = function (n) { return (n < 10 ? '0' : '') + n; };
    ctx.font = '700 24px ' + F; ctx.fillStyle = '#7d80a0';
    ctx.textAlign = 'left';
    ctx.fillText(d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes()), L, footY);
    ctx.textAlign = 'right'; ctx.fillStyle = '#a9f6ff';
    ctx.fillText(SITE_URL.replace(/^https:\/\//, ''), R, footY);
    return cv;
  }
  function shareX() {
    const mine = board && board.me;
    if (!mine) return;
    const mi = modeInfo((board && board.mode) || currentMode);
    const caption = shareCaption(mine, mi);
    // 画像が作れない・小窓が無いときは、黙って文字だけの X を開かずに理由を出す（原因を突き止めるため）
    let cv = null;
    try { cv = shareCard(mine, mi); } catch (e) {
      toast(esc(tx('rkShareImgFail')) + '<br><small>' + esc(String((e && e.message) || e)) + '</small>', 9000);
      return;
    }
    if (!global.PllShare || typeof global.PllShare.shareCanvas !== 'function') {
      toast(esc(tx('rkShareImgFail')) + '<br><small>PllShare.shareCanvas が読み込まれていません（pll-share.js が古い）</small>', 9000);
      return;
    }
    try { global.PllShare.shareCanvas(cv, caption); } catch (e) {
      toast(esc(tx('rkShareImgFail')) + '<br><small>' + esc(String((e && e.message) || e)) + '</small>', 9000);
    }
  }

  function leave() {
    if (!me) return;
    const run = function () {
      api('/api/delete-me', { playerId: me.playerId, secret: me.secret }).then(function (r) {
        if (!r.ok && r.__status !== 401) { toast(esc(errText(r.error))); return; }
        saveMe(null);
        me = null;
        board = null;
        endRanked();
        closeOverlay();
      });
    };
    if (typeof global.askConfirm === 'function') {
      global.askConfirm({ title: tx('rkLeave'), body: tx('rkLeaveConfirm'), ok: tx('rkLeaveOk'), cancel: tx('rkCancelBtn'), onOk: run });
      // この確認だけ「削除する」を赤にする（ダイアログが閉じたら元に戻す）
      const okb = $('confirm-ok'), ov = $('confirm-overlay');
      if (okb && ov && global.MutationObserver) {
        okb.classList.add('rk-danger');
        const mo = new MutationObserver(function () {
          if (!ov.classList.contains('show')) { okb.classList.remove('rk-danger'); mo.disconnect(); }
        });
        mo.observe(ov, { attributes: true, attributeFilter: ['class'] });
      }
    } else if (global.confirm(tx('rkLeaveConfirm'))) {
      run();
    }
  }

  /* -------------------------------------------------- ドロワーの入口 -- */
  function addMenuEntry() {
    const menu = $('menu-actions');
    if (!menu || $('ranked-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'action-btn';
    btn.id = 'ranked-btn';
    btn.setAttribute('role', 'menuitem');
    btn.textContent = '🌍 ' + tx('rkTitle');
    const after = $('training-btn');
    if (after && after.parentNode === menu) after.insertAdjacentElement('afterend', btn);
    else menu.appendChild(btn);
    if (typeof global.menuAction === 'function') global.menuAction(btn, openOverlay);
    else btn.addEventListener('click', openOverlay);
  }

  function boot() {
    injectCSS();
    addMenuEntry();
    document.addEventListener('keydown', function (e) {
      const el = $('rk-overlay');
      if (e.key === 'Escape' && el && el.classList.contains('show')) closeOverlay();
    });
    if (typeof global.onI18n === 'function') {
      global.onI18n(function () {
        const b = $('ranked-btn');
        if (b) b.textContent = '🌍 ' + tx('rkTitle');
        render();
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  global.Ranked = { shareCard: function () { return board && board.me ? shareCard(board.me, modeInfo(board.mode || currentMode)) : null; }, open: openOverlay, close: closeOverlay, start: startRanked, state: function () { return state; }, celebrate: celebrate, showResult: showResult };
})(window);
