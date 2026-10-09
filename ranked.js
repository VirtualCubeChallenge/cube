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
    '.rk-you{flex:none;margin-left:6px;padding:1px 6px;border-radius:999px;font-size:10px;font-weight:800;',
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
    '.rk-nick{min-width:0;display:flex;align-items:center;font-weight:700}',
    '.rk-nick-t{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.rk-tm{display:flex;align-items:baseline;gap:5px;white-space:nowrap;justify-self:end}',
    '.rk-time{font-weight:900;font-size:15.5px;font-variant-numeric:tabular-nums;color:#f0f0f6}',
    '.rk-mv{font-size:11.5px;color:#8a8a9c;font-variant-numeric:tabular-nums}',
    /* 狭い画面では手数をタイムの下へ回し、名前の幅を空ける */
    '@media (max-width:380px){.rk-tm{flex-direction:column;align-items:flex-end;gap:0}.rk-mv{font-size:10.5px}.rk-row{gap:8px;padding:8px 6px}}',
    '.rk-empty{color:#7c7c8e;font-size:13px;text-align:center;padding:18px 0}',
    '.rk-links{display:flex;justify-content:center;gap:18px;margin-top:6px;flex-wrap:wrap}',
    '.rk-link{background:none;border:none;color:#8f8fa6;font-size:12.5px;text-decoration:underline;cursor:pointer;',
    '  font-family:inherit;padding:8px 2px}',
    '#confirm-ok.rk-danger{background:#ff4d63!important;border-color:#ff4d63!important;color:#fff!important}',
    '.rk-link.danger{color:#ff5a6e;text-decoration-color:rgba(255,90,110,.6);font-weight:700}',
    '.rk-sec{font-size:13px;font-weight:800;color:#9a9aac;margin:0 0 6px;display:flex;justify-content:space-between}',

    /* インスペクションのカウントダウンと、計測中の小さな印（キューブの操作は邪魔しない） */
    '#rk-hud{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 76px);z-index:30;pointer-events:none;',
    '  transform:translateX(-50%);display:none;align-items:center;gap:8px;padding:7px 14px;border-radius:999px;',
    '  background:rgba(18,18,24,.82);border:1px solid #3a3a48;color:#f0f0f6;font-size:13px;font-weight:800;',
    '  -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);white-space:nowrap}',
    '#rk-hud.on{display:flex}',
    '#rk-hud b{font-size:20px;font-variant-numeric:tabular-nums;min-width:1.4em;text-align:center;color:var(--tc,#2ef2c0)}',
    '#rk-hud.warn b{color:#ff6a7a}',
    /* 「1手目でスタート」は2行目へ。札の幅を細くして、右のシャッフルのつまみに掛からないようにする */
    '#rk-hud{flex-wrap:wrap;justify-content:center;row-gap:0;max-width:calc(100vw - 150px);text-align:center}',
    '#rk-hud small{font-size:11px;font-weight:600;color:#9a9aac;flex-basis:100%}',
    '#rk-hud.solo small{flex-basis:auto}',
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
    '@media (prefers-reduced-motion: reduce){#rk-toast{transition:none}.rk-btn{transition:none}}'
  ].join('\n');

  const REPLAY_MAX_RANK = 5;   // サーバーの REPLAY_MAX_RANK と同じ
  function injectCSS() {
    if (global.RankedReplay) global.RankedReplay.injectCSS();
    if ($('rk-style')) return;
    const st = document.createElement('style');
    st.id = 'rk-style';
    st.textContent = CSS;
    document.head.appendChild(st);
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

  /* ------------------------------------------------- ランク戦の進行 -- */
  // state: 'idle' | 'starting' | 'inspecting' | 'solving' | 'submitting'
  let state = 'idle';
  let attempt = null;       // { id }
  let moves = [];
  let lastT = 0;
  let applying = false;     // 自分で出題を流し込んでいる最中（自分の起こした中断を無視する）
  let inspectTimer = null;
  let inspectEnd = 0;

  function hud(on, warn, html) {
    let el = $('rk-hud');
    if (!el) {
      el = document.createElement('div');
      el.id = 'rk-hud';
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.classList.toggle('on', !!on);
    el.classList.toggle('warn', !!warn);
    if (!on) el.classList.remove('solo');
    if (html !== undefined) el.innerHTML = html;
  }

  function endRanked() {
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
    hud(true, sec <= 3, '🌍 ' + esc(tx('rkInspection')) + ' <b>' + sec + '</b><small>' + esc(tx('rkFirstMoveHint')) + '</small>');
    if (left <= 0) invalidate('rkErrInspection');
  }

  function startRanked() {
    if (state !== 'idle' || !me) return;
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

      attempt = { id: r.attemptId };
      moves = [];
      lastT = 0;
      state = 'inspecting';
      document.body.classList.add('rk-on');
      inspectEnd = Date.now() + (r.inspectionMs || INSPECTION_MS);
      tickInspection();
      clearInterval(inspectTimer);
      inspectTimer = setInterval(tickInspection, 200);
    });
  }

  function submit(ms) {
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
      const lines = '<span class="rk-t-big">🌍 ' + esc(tx('rkRank', { n: r.rank })) + '</span>' +
        esc(fmtTime(r.timeMs)) + (r.isNewBest ? ' · ' + esc(tx('rkNewBest')) : '') +
        '<br><button type="button" class="rk-t-btn">' + esc(tx('rkViewRanking')) + '</button>';
      toast(lines, 9000, openOverlay);
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
        hud(true, false, '🌍 <small>RANKED</small>');
        const h = $('rk-hud'); if (h) h.classList.add('solo');
      }
      const axis = AXES.indexOf(cfg.axis);
      let mask = 0;
      (cfg.layers || []).forEach(function (L) { mask |= (L === -1 ? 1 : L === 0 ? 2 : L === 1 ? 4 : 0); });
      if (axis < 0 || !MASK_LAYERS[mask] || (cfg.dir !== 1 && cfg.dir !== -1)) { invalidate('rkErrTime'); return; }
      let ms = Math.max(0, Math.round(t || 0));
      if (ms < lastT) ms = lastT;
      lastT = ms;
      moves.push([axis, mask, cfg.dir, ms]);
      if (moves.length > 2000) invalidate('rkErrTime');
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
  function isMineEntry(e) {
    const mine = board && board.me;
    return !!(mine && me && e.rank === mine.rank && e.nickname === me.nickname);
  }
  function mineInList() { return board.entries.some(isMineEntry); }

  function loadBoard() {
    loading = true;
    render();
    api('/api/ranking?limit=50' + (me ? '&player=' + encodeURIComponent(me.playerId) : '')).then(function (r) {
      loading = false;
      board = r.ok ? r : { error: r.error };
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
        html += '<div class="rk-card"><p class="rk-body">' + esc(tx('rkJoinBody')) + '</p>' +
          rulesHtml() + '</div>';
      }
      html += '<div class="rk-card"><label class="rk-label" for="rk-nick">' + esc(tx('rkNickLabel')) + '</label>' +
        '<input class="rk-input" id="rk-nick" maxlength="24" autocomplete="off" autocapitalize="off" spellcheck="false" value="' +
        esc(renaming && me ? me.nickname : '') + '">' +
        '<p class="rk-err" id="rk-err"></p>' +
        '<button type="button" class="rk-btn go" id="rk-join">' + esc(tx(renaming ? 'rkSave' : 'rkJoin')) + '</button>' +
        '<button type="button" class="rk-btn sub" id="rk-back">' + esc(tx(renaming ? 'rkCancelBtn' : 'rkNotNow')) + '</button></div>';
    } else {
      html += '<h2 class="rk-h">🌍 ' + esc(tx('rkTitle')) + '</h2>';
      const mine = board && board.me;
      html += '<div class="rk-card' + (hot && !(board && board.entries && mineInList()) ? ' hot' : '') + '"><div class="rk-me"><div class="rk-me-name">' + esc(me ? me.nickname : '') + '</div>' +
        '<div class="rk-me-best">' + (mine
          ? '<b>' + esc(fmtTime(mine.timeMs)) + '</b><span>' + esc(tx('rkMyBest')) + ' · ' + esc(tx('rkRank', { n: mine.rank })) + '</span>'
          : '<span>' + esc(tx('rkNoRecordYet')) + '</span>') + '</div></div>' +
        '<button type="button" class="rk-btn go" id="rk-start"' + (state !== 'idle' ? ' disabled' : '') + '>' + esc(tx('rkStart')) + '</button>' +
        rulesHtml() + '</div>';

      html += '<div class="rk-card"><p class="rk-sec"><span>TOP 50</span><span>' +
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
            '<span class="rk-mv">/ ' + esc(tx('rkMoves', { n: e.moveCount })) + '</span></span>' +
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
    const list = document.querySelector('#rk-overlay .rk-list');
    if (list) list.addEventListener('click', function (e) {
      const b = e.target.closest('.rk-rp-btn');
      if (!b || !global.RankedReplay) return;
      global.RankedReplay.open({ rank: parseInt(b.getAttribute('data-rank'), 10), api: api, tx: tx, fmt: listTime });
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

  global.Ranked = { open: openOverlay, close: closeOverlay, start: startRanked, state: function () { return state; }, celebrate: celebrate };
})(window);
