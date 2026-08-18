/* ============================================================
   cube-sfx.js — キューブの操作音（実物の録音を埋め込み）

   実際にキューブを1手回して録った音を、そのままこのファイルの中に
   持っている。音声ファイルを別に置く必要はなく、サーバーに増える
   ファイルもゼロ。オフラインでも鳴る。

   ★ どうやって 3.6KB に収めているか
     録音（86ms / 32kHz / モノラル）を 8bit の μ-law に圧縮して
     base64 で埋め込んでいる。μ-law は電話で使われている方式で、
     小さい音ほど細かく刻む＝耳の感度に合わせた圧縮。誤差は -37dB で、
     録音自体のS/N比とほぼ同じ＝聞いて分かる劣化は無い。
       WAVをそのまま置く      5.4KB ＋ HTTPリクエスト1回
       このファイルに埋め込む  3.6KB ＋ リクエスト0回
     mp3/AACを使わないのは、あれらが先頭に20〜30msの無音を必ず入れる
     ため。回転が止まる瞬間に合わせて鳴らす用途では、そのズレが致命的。

   ★ 鳴らすタイミング
     録音の中で「いちばん強い当たり」は先頭から13.3msの位置にある。
     その手前には、収まる直前の細かい擦れが入っている。そこで再生は
     13.3ms だけ前倒しして予約し、最大の当たりが画面の停止と正確に
     重なるようにしている（PEAK_OFFSET）。回っている最後のわずかな
     時間に擦れが鳴り、止まった瞬間にカシャッと来る。

   使い方:
     CubeSFX.play('snap', { when, rate, gain, pan })
     CubeSFX.ready('snap') / CubeSFX.context()
   ============================================================ */
(function (global) {
  'use strict';

  /* 実物のキューブを1手回した録音（8bit μ-law / 32kHz / モノラル / 86ms） */
  var SNAP_RATE = 32000;
  var SNAP_PEAK_OFFSET = 0.0133;   // 先頭から最大の当たりまでの秒数
  var SNAP_B64 = [
    'AKyoQp84mtxazVld7nLVXB2GL9VbydlLiemuq9sjS8rhY0QGqFpAkGBFmDlPwLacwsMjxtLSL5nYPZuxOjecNEJSMD1Rikov',
    'OLcUuMMLws3IuMKzkCfFuVFIxD0Ek1BGzC07v7M+IrktEafDNbcTLcKfu0LLvSAnQqQWv7BDTrkySJMhUUeeNp+xmi7NygrB',
    'vs7AvDggrScpqEtCNTczMS+Z0jxN1DBW5DJf5kRGql7pWqrRbd/mbcnIaPBqyfh6zuBKWPJFcewqdI3kYNdjVLbkXGr34V/h',
    '6W71wzYkXcmybjw1W0/fYVua0Yrh31Zk0M7L67ZUSsxL0iSfwlJLVj0tTJlas8UkMzq63cYoOr3SOMgJURDFyDwiTgrGBo4w',
    'uKZCsigxyEKnHCqVQr0BMNBEVdO41blMpT0ktT9OK0HdUlXZUkTbUjWjqMlh5WM24FMx2U7Px1W5Q7vpTzVRL8pd3Mljns9F',
    'O78cR87RPMrNqF0YwidJyahcUNUol75Dw7RBzhEjRS3aXMtLV89XyOBTI8ixr6sfnk7b2Vdr70Rb599pPeljZPXLfvPcfVPx',
    'QWa3r9lr2OY7TtTlVVjjx1fLS1ipKcBKRlTT3mOm4kyCzJ5Futc/StAmSdc+S5k7pjVApVNCs0RPKcSlvsgfoc/UpLnTRba0',
    'MTVIv01RskdMiK5BH6A6ycYmt7PBsMu+IbWYmyYoskYLikckSCeaSDYmR7OpsiK8wBLHu8AgusU5psJEJ7NCMz5DsIUxPzil',
    'uTEWHoKnwKo8u52cuzq7DCfJRQC9Px2+QC6jQbUrJ7U0MLU3t7g8vIg4vbY6siI3wTU+simdvSU+yDSdvEIOx0OwqBooK5RC',
    'sDyroCISuDS8GoW7RMKaJMVJjsdEF7xBtRWxEES5pi8jKBUKM5q2IxoaLiLXTCrEWOFDU9pJR9ZSLtFq71Mw8Xvo6XTtV1Tg',
    'Z+RJWdFgQCbSEE/ckdMySNctm9kqmD6sH1rELUnYVC65UL41OyqltZZCO8mXurS+rMIVuzyxxKsJRQouRJGOS0W9L0q8uIey',
    'rSy0v6i/Ny7CGTO4SCS8siMohCOKvEcYNkjCrlK+CokcwMFIwtNMoNdQHdZQUcQ3uhqLRx3CP89HrLdBuVE5rzenRzDJQqWp',
    'uc7GzpQvybQKMTayOz5LQUctwUEOQ4C/v8hBIsWHt58jQrfPoj9ANCa3EDGbSM0tT8KjzKORtzC7tspFgrhSoEKwpE5AMUc0',
    'wSCQK7Efqg+90Zejs5C7tiWrMx+5RBkuIC8WIx6UNbkbLrstQr6xIhaXwDGvCzEXDa41KjIEjz2zO6m5iacjrrktqy+tuCQO',
    'Ipe7HAqmPqGkJTgpsjaSN44yHcAhMhmgAYWxpaa3sR2kLsCing4iLCi+ITUxKqwcpTycuiE7upE0mp03JoylCEUqqynLqDSt',
    'NsUSuKZDwj8Zm5ift7lGHawcH0Q2N57KA6Yxlrc5t8FCsKlELrfHLTavQ0CmNzs5GI1BDr+7w8Kym8K6nDAONzCpQTwmtSg7',
    'mKO8B7shl7+ah7UfD7EyFKMVKS0xkpY+Mpw2IKgzHpiOuqGWrgWpoLS5JkCZwDq7Q0WdOLGtTMIZvUE/z88+xD8+yrIqRMag',
    'vaJFNjTAPES9RBQ1OaU0rLc2piSbrpa4LLIdOrkji60xHayfr4uhopqeBzSnlzwtljERDrgRG4K0s7OPmo8GhIifGjaFNTIe',
    'KB4sNpEJLbOwnJmemLaTrZkUs6QboiSWniOZKC+nLCoYGyqlIhAFl7ucHQCptAYzrCItrS6eIDatNaYmlY0IqAyXiB+0IRqj',
    'KqYurimfDhuZHgKwLBimLasgChgiixsQqaQlDKedqBWOlSMMrhgelRAwlYgXswcllhEXHgmeLpwEGKYBpJOjkBQChIuaFCuM',
    'sDCcIiytJ62NHwMOCaIdoSyjnC6YpwyJJS2vkQ0FK4StHBYkI7ocM7Ezo7I4o6usuzqfmTW0lzymoTMjEJ0eoyGkjh6rNJ2s',
    'RMkbKiAtxigPuD6fqDXERxeLB71LxLVDpzDGSbLGNza8rpGsHTg7oraaNycyF60QrqwtojOWrbSwMSY7RLG6sI2WOi2ptZWU',
    'hSi4JQ2wBUG6sjxBujMdtb08r5Y6rMKlIj0OMbGQH6A1w0ILPaXSRzDCRIemKi8ly60wq7gWvy8QD6c3gjsrM5s4CD61Liiy',
    'irK8sbYbM7A7rAKZAye7LSCkKSiTsDuurikXM5Q6pbUynKg0EqOemjW/rZuzJQYDDbAlqTimLT6aIyogH7eWJrM5tqmst4ee',
    'CLA1Hrkcjqk5KooqKiq1NzC1QCCthqy4tgaTqRCYvC4HE4ouFSwwMSgLiJ0ooIyRj7gigo+oJyekL66hGCeHMBeqJCyznTCf',
    'ox8SsiKmqAygnyaSDiQZAg8mlY4bHpOQqpgcl5wkpbAgFqCDOLWRMq0IH6QRBS2YpTKuiTKjph2aGo+fL5OgIRkYiaUVCawk',
    'DKQfhaslrBknIYCFISGkBTScqwUcq6MtjagZBI2bJrgxkKQlhx+BohYgrjKWCAKmEY2sKoq0KYaelC2cixyXIpowqa00Jasm',
    'nKkvsSycmy2hsDavLiyrnCualDaxnC2ZGxOOtCMssIwkKbQdNr8yEqs1vTIaoxyoK5OahSgPnYcdqi2glzGthRydh5+gM6yO',
    'Iq4yo7E1D7UeKbAXK5OgpyWPnwoQEhaTly2kBwcqsIgZLY+7PpG6LTe3sjQnvZBMxa5GxjU6xCU+PMPUVE7fSVbdRcZDQuFf',
    'WOVYG9YpTqKbR6I+2BtFy1XXUs7AUtJKxTxW1ilHy0eJxU/FQjTZRxy6RL2tk8IxqSEzIimStCspPy3KUMLFJDySt5w5Os0y',
    'OtBOwkvErTsQMp+8QCeyr7dLzUEJuzQ6iMlCqTSUgTvLDj2zMbS1L7qSIDaOFsdIwwhMxEyiMTq4PxS0mRbGuSSxvi+FmrIv',
    'vy9Hq0KmGD/APkS5LMcysss6wMEXJMStT8o2TMA/RDauQj/LN0c52FpB4VWS1k67x0u30Eysu0m/Ur7FVcy3VdKmUOdcRuBc',
    '4lKL4pRY0lTdOl3ladbOXrwvsGbOU9OpXIdT31oy32bl1VjmWrLHR7ha2VZPP8BfmeJSSOpBT+PZHEXf6HDuuHDqS0Dcbdqm',
    'bedFVs5CPqYtWOdiWetnNtdpv95m30lQ12PYTjngZetJXeAkz5bLIlXbSTfHT9RMRdcHxwy3z7TUucjDQ9LNV8etWE4yRU6q',
    'Tz9aqNpaLNxe1L5X3FnKz2SE1VjUqlrTXrUtT0bTVUrLTMqzntPBRt6nDtjE27PSJMajQrlRlj1PUj8wOzutPLw7PM+cw8cn',
    'xAqpqbGbPiw1TkidVCufVZolOq83xM1S285I3zqv20zNuFLOSDzFQEEyQg4MLie9RAi1N8Owg7wuBrIzk6k/CzsfKTSSNCOi',
    'KASkDgepE422FbOkCJqlnAqjKSKYKA2lFJGVDJ4BrKgVFZgRmyaACyYcIBqbFheBHh0In46TmhCPpZ2FjokNHoYbGoYeF5cZ',
    'DIyYmoaamJeXhAqWFhacGg8bCx0CkBCBEgiNkZePlI+Mm4cOlQWFDwoQFwcGDxCDCwYDgYkCiI0FioeChoWFggcEgAyBgAaB',
    'CQSDggIChIKCAgCBgYCAAA==',
  ].join('');

  // 同時に鳴らせる数の上限。高速で回し続けても、これ以上は重ねない。
  var MAX_VOICES = 12;
  // 再生速度のゆらぎ。固定だと連打したとき機械的に聞こえる。
  var RATE_MIN = 0.9, RATE_MAX = 1.1;
  var MASTER_GAIN = 0.85;

  var ctx = null, master = null, unlocked = false, voices = 0;
  var buffers = {};     // name -> AudioBuffer（1回だけ作って使い回す）
  var external = {};    // 差し替え用に外部ファイルを読んだ場合の置き場

  /* --- AudioContext ---------------------------------------------------- */
  function context() {
    if (ctx) return ctx;
    try {
      var C = global.AudioContext || global.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
      master = ctx.createGain();
      master.gain.value = MASTER_GAIN;
      master.connect(ctx.destination);
    } catch (err) { ctx = null; }
    return ctx;
  }

  /* --- μ-law の展開 -----------------------------------------------------
     256通りしかないので、逆変換の表を1回だけ作ってしまうのがいちばん速い。
     あとは1バイトずつ表を引くだけ＝2752サンプルでも一瞬で終わる。 */
  var MULAW = (function () {
    var t = new Float32Array(256);
    var MU = 255, L = Math.log(1 + MU);
    for (var b = 0; b < 256; b++) {
      var sign = (b >> 7) & 1 ? -1 : 1;
      var q = (b & 0x7F) / 127;
      t[b] = sign * (Math.exp(q * L) - 1) / MU;
    }
    return t;
  })();

  function decodeEmbedded(c) {
    if (buffers.snap) return;
    try {
      var bin = global.atob(SNAP_B64);
      var n = bin.length;
      var buf = c.createBuffer(1, n, SNAP_RATE);
      var out = buf.getChannelData(0);
      for (var i = 0; i < n; i++) out[i] = MULAW[bin.charCodeAt(i) & 255];
      buffers.snap = buf;
    } catch (err) { /* 展開できない環境では鳴らさない */ }
  }

  /* --- アンロック（最初のタッチで1回だけ） -----------------------------
     iOS Safari は「ユーザー操作から始まった処理」の中で resume() し、
     さらに実際に音を1つ鳴らすまで出力経路を開かない。長さ1サンプルの
     無音を鳴らして、確実に開ける。 */
  function unlock() {
    if (unlocked) return;
    var c = context();
    if (!c) { detach(); return; }
    unlocked = true;
    try { if (c.state === 'suspended') c.resume(); } catch (err) { /* 続行 */ }
    try {
      var b = c.createBuffer(1, 1, c.sampleRate);
      var s = c.createBufferSource();
      s.buffer = b; s.connect(c.destination); s.start(0);
    } catch (err) { /* 続行 */ }
    decodeEmbedded(c);
    detach();
  }

  var UNLOCK_EVENTS = ['pointerdown', 'touchstart', 'mousedown', 'keydown'];
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
                 呼ばれた瞬間ではなく、90°に収まる瞬間に合わせるために使う。
     opts.rate … 再生速度。省略時は 0.9〜1.1 で毎回ランダム。
     opts.gain … 音量倍率。opts.pan … 左右位置(-1〜1)。
     戻り値 true = 鳴らした / false = 鳴らせなかった（呼び出し側が
     合成音に切り替えるための合図） */
  function play(name, opts) {
    opts = opts || {};
    var c = context();
    if (!c) return false;
    if (!buffers.snap) decodeEmbedded(c);

    var buf = external[name] || buffers[name] || buffers.snap;
    if (!buf) return false;

    try { if (c.state === 'suspended') c.resume(); } catch (err) { /* 続行 */ }
    // 鳴らしすぎの保険。上限に達したら黙って捨てる（合成音で二重に
    // 鳴らしても意味がないので false は返さない）。
    if (voices >= MAX_VOICES) return true;

    try {
      var src = c.createBufferSource();
      src.buffer = buf;
      // 毎回ピッチを揺らす。これが無いと連続で回したとき、まったく
      // 同じ波形が並んで一気に機械的に聞こえる。
      var rate = (opts.rate != null) ? opts.rate
        : (RATE_MIN + Math.random() * (RATE_MAX - RATE_MIN));
      src.playbackRate.value = rate;

      var tail = src;
      if (opts.gain != null && opts.gain !== 1) {
        var g = c.createGain();
        g.gain.value = Math.max(0, opts.gain);
        tail.connect(g); tail = g;
      }
      if (opts.pan && c.createStereoPanner) {
        var p = c.createStereoPanner();
        p.pan.value = Math.max(-1, Math.min(1, opts.pan));
        tail.connect(p); tail = p;
      }
      tail.connect(master);

      voices++;
      var done = tail;
      src.onended = function () {
        voices--;
        try { src.disconnect(); } catch (err) { /* 済み */ }
        try { if (done !== src) done.disconnect(); } catch (err) { /* 済み */ }
      };

      // 最大の当たりが when に重なるよう、頭の擦れのぶんだけ前倒しする。
      // 再生速度を変えている場合はその分だけ前倒し量も縮む。
      var lead = (opts.offset != null ? opts.offset : SNAP_PEAK_OFFSET) / rate;
      var when = Math.max((opts.when || 0) - lead, c.currentTime);
      src.start(when);

      // 鳴り終わったら眠らせる（画面録画時のハム音対策。index.html の
      // head にある共通ヘルパー。無い環境でもそのまま動く）。
      if (global.__audioIdleSuspend) global.__audioIdleSuspend(c, 1500);
      return true;
    } catch (err) { return false; }
  }

  /* --- 外向きAPI -------------------------------------------------------- */
  global.CubeSFX = {
    play: play,
    context: context,
    unlock: unlock,
    ready: function () { return !!buffers.snap; },
    peakOffset: SNAP_PEAK_OFFSET,
    /* 別の音に差し替えたいとき用。ファイルを置いて
       CubeSFX.load('snap', 'cube-snap.wav') と呼べば、以後そちらが鳴る。
       埋め込みの音はそのまま保険として残る。 */
    load: function (name, url) {
      var c = context();
      if (!c || !global.fetch) return;
      fetch(url).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.arrayBuffer();
      }).then(function (ab) {
        var ok = function (b) { external[name] = b; };
        var p = c.decodeAudioData(ab, ok, function () {});
        if (p && typeof p.then === 'function') p.then(ok).catch(function () {});
      }).catch(function () { /* 読めなければ埋め込みのまま */ });
    }
  };

  attach();
})(window);
