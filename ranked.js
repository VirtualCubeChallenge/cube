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
    '  padding:calc(env(safe-area-inset-top,0px) + 16px) 16px calc(env(safe-area-inset-bottom,0px) + 24px)}',
    '#rk-overlay.show{display:block}',
    '.rk-wrap{max-width:460px;margin:0 auto;position:relative}',
    '.rk-close{position:absolute;top:0;right:0;width:40px;height:40px;border-radius:50%;border:1px solid #3a3a48;',
    '  background:#1c1c22;color:#c8c8d4;font-size:17px;cursor:pointer;font-family:inherit}',
    '.rk-close::after{content:"";position:absolute;inset:-6px}',
    '.rk-h{margin:4px 48px 14px 0;font-size:22px;font-weight:900;letter-spacing:.02em;display:flex;align-items:center;gap:8px}',
    '.rk-card{background:#1c1c22;border:1px solid #2c2c38;border-radius:16px;padding:16px;margin-bottom:12px}',
    '.rk-body{white-space:pre-line;font-size:13.5px;line-height:1.75;color:#d4d4de;margin:0}',
    '.rk-rules{font-size:12px;line-height:1.6;color:#9a9aac;margin:10px 0 0}',
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
    '.rk-row{display:grid;grid-template-columns:42px 1fr auto auto;align-items:center;gap:8px;padding:10px 4px;',
    '  border-bottom:1px solid #26262f;font-size:14px}',
    '.rk-row:last-child{border-bottom:none}',
    '.rk-row.mine{background:rgba(var(--tc-rgb,46,242,192),.10);border-radius:10px}',
    '.rk-row.flag{opacity:.55}',
    '.rk-pos{font-weight:900;text-align:center;color:#9a9aac;font-variant-numeric:tabular-nums}',
    '.rk-row:nth-child(1) .rk-pos{color:#ffd36a}.rk-row:nth-child(2) .rk-pos{color:#d6dbe4}.rk-row:nth-child(3) .rk-pos{color:#e0a46a}',
    '.rk-nick{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}',
    '.rk-time{font-weight:900;font-variant-numeric:tabular-nums}',
    '.rk-mv{font-size:11.5px;color:#7c7c8e;min-width:34px;text-align:right}',
    '.rk-empty{color:#7c7c8e;font-size:13px;text-align:center;padding:18px 0}',
    '.rk-links{display:flex;justify-content:center;gap:18px;margin-top:6px;flex-wrap:wrap}',
    '.rk-link{background:none;border:none;color:#8f8fa6;font-size:12.5px;text-decoration:underline;cursor:pointer;',
    '  font-family:inherit;padding:8px 2px}',
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

  function injectCSS() {
    if ($('rk-style')) return;
    const st = document.createElement('style');
    st.id = 'rk-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

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
    attempt = null;
    toast(esc(tx('rkSending')), 15000);
    api('/api/finish', payload).then(function (r) {
      state = 'idle';
      moves = [];
      if (!r.ok) { toast(esc(errText(r.error)), 6000); return; }
      const lines = '<span class="rk-t-big">🌍 ' + esc(tx('rkRank', { n: r.rank })) + '</span>' +
        esc(fmtTime(r.timeMs)) + (r.isNewBest ? ' · ' + esc(tx('rkNewBest')) : '') +
        '<br><button type="button" class="rk-t-btn">' + esc(tx('rkViewRanking')) + '</button>';
      toast(lines, 9000, openOverlay);
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
    const el = $('rk-overlay');
    if (!el) return;
    el.classList.remove('show');
    el.hidden = true;
  }

  function loadBoard() {
    loading = true;
    render();
    api('/api/ranking?limit=50' + (me ? '&player=' + encodeURIComponent(me.playerId) : '')).then(function (r) {
      loading = false;
      board = r.ok ? r : { error: r.error };
      render();
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
          '<p class="rk-rules">' + esc(tx('rkRules')) + '</p>' +
          '<p class="rk-note">' + esc(tx('rkReview')) + '</p></div>';
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
      html += '<div class="rk-card"><div class="rk-me"><div class="rk-me-name">' + esc(me ? me.nickname : '') + '</div>' +
        '<div class="rk-me-best">' + (mine
          ? '<b>' + esc(fmtTime(mine.timeMs)) + '</b><span>' + esc(tx('rkMyBest')) + ' · ' + esc(tx('rkRank', { n: mine.rank })) + '</span>'
          : '<span>' + esc(tx('rkNoRecordYet')) + '</span>') + '</div></div>' +
        '<button type="button" class="rk-btn go" id="rk-start"' + (state !== 'idle' ? ' disabled' : '') + '>' + esc(tx('rkStart')) + '</button>' +
        '<p class="rk-rules">' + esc(tx('rkRules')) + '</p></div>';

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
          const isMine = mine && e.rank === mine.rank && me && e.nickname === me.nickname;
          return '<li class="rk-row' + (isMine ? ' mine' : '') + (e.flagged ? ' flag' : '') + '">' +
            '<span class="rk-pos">' + e.rank + '</span>' +
            '<span class="rk-nick">' + esc(e.nickname) + '</span>' +
            '<span class="rk-time">' + esc(fmtTime(e.timeMs)) + '</span>' +
            '<span class="rk-mv">' + esc(tx('rkMoves', { n: e.moveCount })) + '</span></li>';
        }).join('') + '</ol>';
      }
      html += '<p class="rk-note">' + esc(tx('rkReview')) + '</p></div>';
      html += '<div class="rk-links"><button type="button" class="rk-link" id="rk-rename">' + esc(tx('rkRename')) + '</button>' +
        '<button type="button" class="rk-link" id="rk-leave">' + esc(tx('rkLeave')) + '</button></div>';
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
  }

  function nickOk(s) {
    const v = String(s || '').replace(/\s+/g, ' ').trim();
    const n = Array.from(v).length;
    if (n < 1 || n > 12) return null;
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

  global.Ranked = { open: openOverlay, close: closeOverlay, start: startRanked, state: function () { return state; } };
})(window);
