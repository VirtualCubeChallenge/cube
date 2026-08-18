/* ============================================================
   cube-sfx.js — 効果音の読み込みと再生（サンプル再生方式）

   合成ではなく「録った音」を鳴らすための小さな置き場。
   キューブの音は、なるべく実物を録ったファイルを鳴らすのがいちばん
   近道だと判断してこちらに切り替えた。

   使い方は3つだけ:
     CubeSFX.play('snap', { when, rate, gain, pan })  … 鳴らす
     CubeSFX.ready('snap')                           … 鳴らせる状態か
     CubeSFX.context()                               … 共有 AudioContext

   ★ 設計の要点
     ① iOS/Android のブラウザは「ユーザーが触るまで音を出せない」。
        最初のタッチで AudioContext を作り、無音を1発鳴らして経路を
        こじ開ける（下の unlock）。以後は自由に鳴らせる。
     ② 音源(AudioBuffer)は1回だけデコードして使い回す。new Audio() を
        毎回作る方式はメモリも遅延も増えるので使わない。
        鳴らすたびに作るのは AudioBufferSourceNode だけ。これは
        「使い捨て前提の、参照だけ持つ軽い部品」で、鳴り終われば
        自動で回収される（Web Audio の正しい使い方）。
     ③ ファイルが無い/読めないときは play() が false を返すので、
        呼び出し側（cube-feel.js）が合成音に切り替えられる。
        音が完全に消えることはない。
   ============================================================ */
(function (global) {
  'use strict';

  /* 鳴らす音の一覧。キー名で呼び出す。
     ここのファイル名を差し替えるだけで音を入れ替えられる。 */
  const FILES = {
    snap:   'cube-snap.mp3',    // 90°に収まった瞬間の「カシャッ」
    reseat: 'cube-reseat.mp3'   // マグレブで座り直す小さな音（無ければ snap を流用）
  };

  // 同時に鳴らせる数の上限。高速で回し続けても、これ以上は重ねない。
  const MAX_VOICES = 12;
  // 再生速度のゆらぎ。1.0固定だと連打したとき機械的に聞こえる。
  const RATE_MIN = 0.9;
  const RATE_MAX = 1.1;
  // 全体の音量。ここだけで音量バランスを取れるようにしてある。
  const MASTER_GAIN = 0.85;

  let ctx = null;
  let master = null;
  let unlocked = false;
  let voices = 0;

  const raw = {};      // name -> ArrayBuffer（取得済み・未デコード）
  const buffers = {};  // name -> AudioBuffer（デコード済み。これを使い回す）
  const failed = {};   // name -> true（読めなかった。以後あきらめる）

  /* --- AudioContext ---------------------------------------------------- */

  function context() {
    if (ctx) return ctx;
    try {
      const C = global.AudioContext || global.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
      master = ctx.createGain();
      master.gain.value = MASTER_GAIN;
      master.connect(ctx.destination);
    } catch (err) {
      ctx = null;
    }
    return ctx;
  }

  /* --- ファイルの取得（ページを開いた時点で先に済ませておく） -----------
     取得だけなら AudioContext は要らないので、ユーザーが触るのを待たずに
     ダウンロードを始めておく。デコードだけをアンロック後に回す。 */
  function prefetch() {
    Object.keys(FILES).forEach(function (name) {
      const url = FILES[name];
      if (!url || raw[name] || buffers[name] || failed[name]) return;
      if (!global.fetch) { failed[name] = true; return; }
      fetch(url)
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.arrayBuffer();
        })
        .then(function (ab) {
          raw[name] = ab;
          if (unlocked) decodeAll();
        })
        .catch(function () {
          // ファイルがまだ置かれていない等。合成音のほうで鳴らす。
          failed[name] = true;
        });
    });
  }

  function decodeOne(name) {
    const c = context();
    if (!c || !raw[name] || buffers[name]) return;
    const ab = raw[name];
    raw[name] = null;   // 二重デコードを防ぐ（ArrayBuffer は消費される）
    const ok = function (decoded) {
      buffers[name] = decoded;
    };
    const ng = function () {
      failed[name] = true;
    };
    try {
      // 新しい書き方(Promise)と、古い Safari 用のコールバック版の両対応。
      const p = c.decodeAudioData(ab, ok, ng);
      if (p && typeof p.then === 'function') p.then(ok).catch(ng);
    } catch (err) { ng(); }
  }

  function decodeAll() {
    Object.keys(FILES).forEach(decodeOne);
  }

  /* --- アンロック（最初のタッチで1回だけ） -----------------------------
     iOS Safari は「ユーザー操作から始まった処理」の中で resume() し、
     さらに実際に音を1つ鳴らすまで出力経路を開かない。長さ1サンプルの
     無音を鳴らして、確実に開ける。 */
  function unlock() {
    if (unlocked) return;
    const c = context();
    if (!c) { detach(); return; }
    unlocked = true;
    try { if (c.state === 'suspended') c.resume(); } catch (err) { /* 続行 */ }
    try {
      const b = c.createBuffer(1, 1, c.sampleRate);
      const s = c.createBufferSource();
      s.buffer = b;
      s.connect(c.destination);
      s.start(0);
    } catch (err) { /* 続行 */ }
    decodeAll();
    detach();
  }

  const UNLOCK_EVENTS = ['pointerdown', 'touchstart', 'mousedown', 'keydown'];
  function attach() {
    UNLOCK_EVENTS.forEach(function (ev) {
      document.addEventListener(ev, unlock, { capture: true, passive: true });
    });
  }
  function detach() {
    UNLOCK_EVENTS.forEach(function (ev) {
      document.removeEventListener(ev, unlock, { capture: true });
    });
  }

  // タブに戻ってきたときに眠ったままだと、最初の1手が無音になる。
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && unlocked && ctx) {
      try { if (ctx.state === 'suspended') ctx.resume(); } catch (err) { /* 無視 */ }
    }
  });

  /* --- 再生 -------------------------------------------------------------

     opts.when … AudioContext の時刻で「いつ鳴らすか」を予約できる。
                 呼ばれた瞬間ではなく、90°に収まる瞬間ぴったりに合わせる
                 ために使う（rAF のゆらぎを受けない）。
     opts.rate … 再生速度。省略時は 0.9〜1.1 で毎回ランダム。
     opts.gain … 音量倍率。opts.pan … 左右位置(-1〜1)。

     戻り値 true = このモジュールが鳴らした / false = 鳴らせなかった
     （呼び出し側が合成音などに切り替えるための合図） */
  function play(name, opts) {
    opts = opts || {};
    let buf = buffers[name];
    // reseat が用意されていなければ snap で代用する
    if (!buf && name === 'reseat') buf = buffers.snap;
    if (!buf) return false;

    const c = context();
    if (!c) return false;
    // 一度眠らせてある場合に備えて起こす（__audioIdleSuspend との組み合わせ）
    try { if (c.state === 'suspended') c.resume(); } catch (err) { /* 続行 */ }

    // 鳴らしすぎの保険。上限に達したら黙って捨てる（false は返さない。
    // 合成音で二重に鳴らしても意味がないため）。
    if (voices >= MAX_VOICES) return true;

    try {
      const src = c.createBufferSource();
      src.buffer = buf;
      // 毎回ピッチを揺らす。これが無いと連続で回したとき、
      // まったく同じ波形が並んで一気に機械的に聞こえる。
      src.playbackRate.value = (opts.rate != null)
        ? opts.rate
        : (RATE_MIN + Math.random() * (RATE_MAX - RATE_MIN));

      let tail = src;
      if (opts.gain != null && opts.gain !== 1) {
        const g = c.createGain();
        g.gain.value = Math.max(0, opts.gain);
        tail.connect(g);
        tail = g;
      }
      if (opts.pan && c.createStereoPanner) {
        const p = c.createStereoPanner();
        p.pan.value = Math.max(-1, Math.min(1, opts.pan));
        tail.connect(p);
        tail = p;
      }
      tail.connect(master);

      voices++;
      src.onended = function () {
        voices--;
        // 鳴り終わった部品は切り離す。参照が消えて回収される。
        try { src.disconnect(); } catch (err) { /* 済み */ }
        try { if (tail !== src) tail.disconnect(); } catch (err) { /* 済み */ }
      };

      // 過去の時刻を渡されても事故らないように現在時刻で丸める
      const when = Math.max(opts.when || 0, c.currentTime);
      src.start(when);

      // 鳴り終わったら眠らせる（画面録画時のハム音対策。index.html の
      // head にある共通ヘルパー。無い環境でもそのまま動く）。
      if (global.__audioIdleSuspend) global.__audioIdleSuspend(c, 1500);
      return true;
    } catch (err) {
      return false;
    }
  }

  /* --- 外向きAPI -------------------------------------------------------- */

  global.CubeSFX = {
    play: play,
    context: context,
    unlock: unlock,
    ready: function (name) {
      return !!(buffers[name] || (name === 'reseat' && buffers.snap));
    },
    // あとから差し替えたいとき用（例: 別の音セットを読み込む）
    define: function (map) {
      Object.keys(map || {}).forEach(function (k) {
        FILES[k] = map[k];
        delete buffers[k];
        delete failed[k];
        raw[k] = null;
      });
      prefetch();
      if (unlocked) decodeAll();
    }
  };

  attach();
  prefetch();
})(window);
