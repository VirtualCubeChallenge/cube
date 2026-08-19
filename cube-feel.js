/* ============================================================
   cube-feel.js — 競技用スピードキューブの「回し心地」を再現する
   アニメーション・ドライバ（磁力アシスト + マグレブ微振動）

   このファイルは index.html の状態管理・描画・UI には一切触らない。
   やることは4つだけ:
     1. 角度を時間で動かす関数（CubeFeel.play）を提供する
     2. 強さの設定値を保存/復元する（localStorage）
     3. 設定パネルに黒電話ふうのダイヤルを2つ差し込む（DOM挿入のみ）
     4. そのダイヤル用の CSS を <style> で足す（style.css は無改変のまま）

   index.html 側は「requestAnimationFrame のループを CubeFeel.play に
   置き換える」だけでよい。呼ばれなければ何も起きないので、読み込んだ
   だけでは既存の挙動は変わらない。

   ★ 設定値は OFF / 1〜5 の6段階（内部では level/5 = 0〜1 に正規化）

   ★ 3フェーズの時間割（1手ぶん）
     ┌ drive ────────┬ snap ──┬ bounce ─┐
     0°            76°      90°   91→89→90°
     指で回している   磁石が    マグレブの
     ぶん(減速)      吸い込む  反発で揺り返す

   ★ 計算コスト
     1フレームあたり Math.sin 1回 + 乗算数回だけ。オブジェクト生成も
     配列走査もしないので、スマホでも描画ループの負担にならない。
   ============================================================ */
(function (global) {
  'use strict';

  const DEG = Math.PI / 180;
  const TAU = Math.PI * 2;

  const KEY_MAGNET = 'rubiks-cube-feel-magnet';
  const KEY_MAGLEV = 'rubiks-cube-feel-maglev';

  const MAX_LEVEL = 5;

  /* --- チューニング定数 -------------------------------------------------
     ここだけ触れば「回し心地」の効き幅を丸ごと変えられる。
     下の数値は「レベル5（＝最大）のときの値」。レベル1〜4はこの間を
     等分した強さになる。 */

  // 磁力が働きはじめる「残り角度」。レベル1で残り約7.6°、レベル5で残り22°。
  // 90°の手回しなら 82° → 68° の間で吸い込み開始が動く（既定レベル3で約76°）。
  const ZONE_MIN_DEG = 4;
  const ZONE_MAX_DEG = 22;

  // 吸い込みに使う時間の割合。磁力が強いほど短く＝速く決まる。
  const SNAP_SHARE_WEAK = 0.34;
  const SNAP_SHARE_STRONG = 0.16;

  // マグレブの行き過ぎ量（レベル5のとき）。実効の最初の山はこの約72%なので、
  // 4.2° → 90°に対して +3.0°（＝92度台）まで行き過ぎる。
  const AMP_MAX_DEG = 4.2;

  // 揺り返しの長さ（ミリ秒）と往復回数。短く、数十msで収める。
  const BOUNCE_MS_MIN = 45;
  const BOUNCE_MS_MAX = 150;
  const CYCLES_MIN = 1.5;
  const CYCLES_MAX = 1.95;

  /* ============================================================
     回転音（WebAudio で合成。音声ファイルは使わない）

     本物のキューブが出している音は、大きく2つ。
       ① 回している間の「シャッ」…… プラスチックどうしが擦れる摩擦音。
          広い帯域のノイズで、回転が速いところで最も大きい。
       ② 収まる瞬間の「カチッ」…… かみ合う衝撃。低い胴鳴りと、角が
          当たる高い成分が同時に鳴り、20〜40msで消える。
     どちらも音程を持たないので、オシレータ（純音）ではなくノイズを
     フィルタで削り出す方式にしている。純音で作ると電子音になってしまう。

     ★ 同じ音を繰り返さない工夫
       実物は1手ごとに微妙に音が違う。ここでも鳴らすたびに周波数を±8%、
       音量を±15%ゆらし、ノイズの読み出し位置も毎回ずらしている。
       これが無いと、連続で回したとき機関銃のように不自然に揃う。

     ★ 鳴らす時刻は「予約」する
       到着時刻は play() の時点で計算ずみなので、rAF のコールバックを
       待たずに ctx.currentTime 基準で先に予約する。画面が90°に届く
       瞬間と音がフレーム単位でぴったり合う。
     ============================================================ */

  /* 回転音を鳴らすかどうか。
     いまは音なしで運用する。合成の実装（playRoll ほか）と、iOS の
     アンロック処理は下にそのまま残してあるので、ここを true に戻せば
     最後に調整した「45°から鳴って90°で消える音」がそのまま復活する。 */
  const SOUND_ENABLED = false;

  /* ダイヤルの節度感（1〜5を送るときのカチッ、ON/OFFの手応え）。
     回転音とは完全に別扱いで、こちらは鳴らす。読み込み直後の
     アンロック判定でも参照するので、実装より先にここで宣言しておく。 */
  const DIAL_SOUND = true;

  let actx = null;
  let noiseBuf = null;
  let audioBroken = false;

  function ac() {
    if (audioBroken) return null;
    try {
      if (!actx) {
        // index.html の head にある共有ヘルパーを優先して使う。
        // iOS は AudioContext を4つまでしか作れず、モジュールごとに
        // 新規で作ると上限に当たって音が出なくなることがある。
        if (global.__audioCtx) {
          actx = global.__audioCtx();
        } else {
          const C = global.AudioContext || global.webkitAudioContext;
          if (!C) { audioBroken = true; return null; }
          actx = new C();
        }
        if (!actx) { audioBroken = true; return null; }
      }
      if (actx.state === 'suspended') actx.resume();
      // 鳴り終わったら眠らせる（画面録画時のハム音対策。index.html の
      // head にある共通ヘルパー。無い環境でもそのまま動く）。
      if (global.__audioIdleSuspend) global.__audioIdleSuspend(actx, 1500);
      return actx;
    } catch (err) { audioBroken = true; return null; }
  }

  /* --- 最初のタッチで音を出せるようにする ------------------------------
     iOS/Android のブラウザは、ユーザーが触るまで音を鳴らせない。
     しかも iOS は resume() だけでは足りず、実際に音を1つ鳴らすまで
     出力経路を開かない。そこで最初の1タッチで、長さ1サンプルの無音を
     鳴らして確実にこじ開けておく。これをやっておかないと、
     いちばん最初の1手だけ無音になることがある。 */
  let unlocked = false;
  const UNLOCK_EVENTS = ['pointerdown', 'touchstart', 'mousedown', 'keydown'];
  function unlockAudio() {
    if (unlocked) return;
    const c = ac();
    UNLOCK_EVENTS.forEach(function (ev) {
      document.removeEventListener(ev, unlockAudio, { capture: true });
    });
    if (!c) return;
    unlocked = true;
    try {
      const b = c.createBuffer(1, 1, c.sampleRate);
      const s = c.createBufferSource();
      s.buffer = b;
      s.connect(c.destination);
      s.start(0);
    } catch (err) { /* 続行 */ }
  }
  if (SOUND_ENABLED || DIAL_SOUND) {
    UNLOCK_EVENTS.forEach(function (ev) {
      document.addEventListener(ev, unlockAudio, { capture: true, passive: true });
    });
  }
  // タブに戻ってきたときに眠ったままだと、最初の1手が無音になる。
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && unlocked && actx) {
      try { if (actx.state === 'suspended') actx.resume(); } catch (err) { /* 無視 */ }
    }
  });

  // ノイズ源は一度だけ作って使い回す。純粋なホワイトノイズは「サー」と
  // 人工的なので、軽い積分を混ぜてピンクノイズ寄りに寄せてある。
  function noiseSource(ctx) {
    if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
      const len = Math.floor(ctx.sampleRate * 0.4);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      let low = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        low = (low * 0.94) + w * 0.06;
        d[i] = w * 0.6 + low * 2.6;
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    return src;
  }

  const rnd = (spread) => 1 + (Math.random() * 2 - 1) * spread;

  /* ============================================================
     ダイヤルの節度感（カチッ）

     安っぽく聞こえる音は、たいてい「ノイズを鳴らしっぱなし」か
     「減衰が長すぎる」かのどちらか。ここでは 1.2ms だけノイズを叩き込み、
     あとは Q の高いフィルタの共鳴だけで鳴らして数msで消している
     （打楽器の物理モデルと同じ考え方）。立ち上がりにランプを使わない＝
     波形がほぼ垂直に立つので、硬い部品が噛み合った感じになる。

     3本の共鳴を重ねているのは、単一の高さだと電子的なピーになるため。
       2350Hz  … 節度の芯
       4900Hz  … 金属質な縁
        880Hz  … わずかな重み。これが無いと軽い作り物になる
     ============================================================ */

  // ONのときだけ足す短い残響。320ms で落ちきる小さな部屋ぶんだけ。
  let dialIrBuf = null;
  function dialIR(ctx) {
    if (dialIrBuf && dialIrBuf.sampleRate === ctx.sampleRate) return dialIrBuf;
    const len = Math.floor(ctx.sampleRate * 0.32);
    dialIrBuf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = dialIrBuf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2);
      }
    }
    return dialIrBuf;
  }

  /* 出口（ダイヤル用）。回転音より狭く、低くまとめる。
     wet > 0 なら残響を並列に足す。原音より 12ms だけ遅らせてから
     残響に送るのが要点で、これが無いと出音が濁って芯が消える。 */
  function dialChain(ctx, wet) {
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 400;
    hp.Q.value = 0.7;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 8000;
    hp.connect(lp);
    lp.connect(ctx.destination);
    if (wet > 0) {
      try {
        const pre = ctx.createDelay(0.1);
        pre.delayTime.value = 0.012;
        const cv = ctx.createConvolver();
        cv.buffer = dialIR(ctx);
        cv.normalize = true;
        const wg = ctx.createGain();
        wg.gain.value = wet;
        lp.connect(pre); pre.connect(cv); cv.connect(wg); wg.connect(ctx.destination);
      } catch (err) { /* 残響が作れなければ原音だけで鳴らす */ }
    }
    return hp;
  }

  /* 一瞬だけ叩いて共鳴させる。exc（叩く長さ）を伸ばすと途端に
     「シャッ」という擦れ音になるので、ここは短く保つこと。 */
  function ping(ctx, at, o) {
    const src = noiseSource(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = o.freq;
    bp.Q.value = o.q;
    const g = ctx.createGain();
    // 立ち上がりにランプを使わない＝一瞬で最大。ここが硬さの決め手。
    g.gain.setValueAtTime(o.vol, at);
    // 減衰は「元の音量の 0.0006 倍まで」と比率で決める。こうしておくと
    // 音量を変えても減衰の速さ（＝音の長さ）が変わらない。
    g.gain.exponentialRampToValueAtTime(o.vol * 0.0006, at + o.dur);
    src.connect(bp); bp.connect(g); g.connect(o.out);
    src.start(at, Math.random() * 0.3);
    src.stop(at + 0.0012);
  }

  let lastTickAt = 0;

  /* 実際に音を組み立てて予約する。
     【必ず少し先の時刻に予約する】
     ctx.currentTime ちょうどに予約すると、組み立てているあいだに時計が
     進んでしまい、音量エンベロープの頭を通り越して無音になることがある。
     8ms だけ先に置けば、人の耳には同時と変わらないまま取りこぼさない。 */
  const TICK_LEAD = 0.008;

  function fireDialTick(ctx, strength, wet) {
    const at = ctx.currentTime + TICK_LEAD;
    // 勢いよく回したときに音が団子にならないよう、最短間隔を設ける
    if (at - lastTickAt < 0.022) return;
    lastTickAt = at;

    const out = dialChain(ctx, wet || 0);
    const v = (strength == null ? 1 : strength);
    // 高級感は「毎回ほぼ同じ音」から出るので、ゆらぎはごく控えめに。
    const tune = rnd(0.03);
    ping(ctx, at,          { freq: 2350 * tune, q: 28, dur: 0.014, vol: 5.45 * v * rnd(0.06), out: out });
    ping(ctx, at + 0.0004, { freq: 4900 * tune, q: 16, dur: 0.007, vol: 2.29 * v * rnd(0.08), out: out });
    ping(ctx, at + 0.0002, { freq:  880 * tune, q:  9, dur: 0.011, vol: 0.65 * v * rnd(0.06), out: out });

    if (global.__audioIdleSuspend) global.__audioIdleSuspend(ctx, 1500);
  }

  /* strength: 1 = 目盛りを1つ送った / 0.75 = ON・OFF の切り替え
     wet:      0 = 残響なし / 0.75 = ONのときだけ足す小さな余韻

     【眠っているときは起こしてから鳴らす】
     省電力のため、鳴り終わって1.5秒たつと AudioContext を眠らせている。
     眠っているあいだは ctx.currentTime が止まっているので、その時刻を
     基準に予約すると、起きた瞬間には予約時刻がすでに過去になっていて、
     音量の立ち上がりを飛ばして無音のまま終わる。ON/OFF を押したとき
     「鳴るときと鳴らないときがある」のはこれが原因。
     resume() の完了を待ってから組み立てれば、必ず鳴る。 */
  function playDialTick(strength, wet) {
    if (!DIAL_SOUND || reduceMotion) return;
    const ctx = ac();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      try {
        const p = ctx.resume();
        if (p && typeof p.then === 'function') {
          p.then(function () { fireDialTick(ctx, strength, wet); }, function () { /* 起きなければ諦める */ });
          return;
        }
      } catch (err) { /* 下でそのまま試す */ }
    }
    fireDialTick(ctx, strength, wet);
  }

  /* 出口。低い唸りと、耳に刺さる超高域の両方を落として、
     人が「プラスチックが噛み合った」と感じる帯域だけを通す。
     800Hz以下＝ぼてつきのもと、11kHz以上＝シャリつきのもと。 */
  function outlet(ctx, pan) {
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 800;
    hp.Q.value = 0.7;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 11000;
    hp.connect(lp);
    let tail = lp;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-0.5, Math.min(0.5, pan));
      lp.connect(p);
      tail = p;
    }
    tail.connect(ctx.destination);
    return hp;
  }


  /* 回転そのものの音。

     ここが今回の考え直し。これまでは「90°に収まった瞬間に一発」だった
     が、実物を回したときに耳に届いているのは、そこではない。パーツが
     いちばん強く擦れ合うのは回っている途中で、90°に近づくころには
     もう音は消えかけている。収まる瞬間に音を置くから「ペタペタ」と
     貼りつくように聞こえていた。

     そこで、45°を通過した瞬間から鳴りはじめ、90°に向かって減衰して
     消える形にした。鳴っている長さは 65〜80ms 前後（磁力が強いほど
     短い＝速く決まるので、実物と同じ関係になる）。

     中身は2枚重ね:
       ① 擦れの本体 … 帯域を絞ったノイズ。周波数は 4.2k→2.4kHz へ
          下がる。回転が遅くなるにつれて擦れの音が低くなる、あの動き。
       ② ざらつきの粒 … 薄く重ねる細かい当たり。これが無いと
          「シャー」という一様な音になり、樹脂の質感が出ない。 */
  function playRoll(ctx, at, durSec, out, level) {
    // ① 擦れの本体
    const src = noiseSource(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(4200 * rnd(0.10), at);
    bp.frequency.exponentialRampToValueAtTime(2400 * rnd(0.10), at + durSec);
    const g = ctx.createGain();
    const peak = 0.50 * level * rnd(0.15);
    const rise = Math.min(0.006, durSec * 0.10);
    g.gain.setValueAtTime(0.00008, at);
    // 立ち上がりだけ直線、あとは指数で落とす。指数のほうが
    // 「自然に消えていく」ように聞こえる。
    g.gain.linearRampToValueAtTime(peak, at + rise);
    g.gain.exponentialRampToValueAtTime(0.00008, at + durSec);
    src.connect(bp); bp.connect(g); g.connect(out);
    src.start(at, Math.random() * 0.3);
    src.stop(at + durSec + 0.01);

    // ② ざらつきの粒。音量カーブに山を刻むだけなので、粒が何個でも
    //    ノードは3個のまま＝スマホでも軽い。
    const gsrc = noiseSource(ctx);
    const gbp = ctx.createBiquadFilter();
    gbp.type = 'bandpass';
    gbp.frequency.value = 3600 * rnd(0.12);
    gbp.Q.value = 1.8;
    const gg = ctx.createGain();
    gg.gain.setValueAtTime(0.00008, at);
    const n = 3 + Math.round(Math.random() * 2);
    let last = at;
    for (let i = 0; i < n; i++) {
      // 粒も、後ろへ行くほど弱くする（本体と一緒に消えていく）
      const t = at + (durSec * 0.72 * (i + Math.random() * 0.8)) / n;
      const dur = 0.003 + Math.random() * 0.004;
      const v = 0.50 * level * (1 - (i / n) * 0.75) * (0.5 + Math.random() * 0.8);
      if (t <= last) continue;
      gg.gain.setValueAtTime(v, t);
      gg.gain.exponentialRampToValueAtTime(0.00008, t + dur);
      last = t + dur;
    }
    gsrc.connect(gbp); gbp.connect(gg); gg.connect(out);
    gsrc.start(at, Math.random() * 0.3);
    gsrc.stop(last + 0.02);
  }

  /* --- 設定値（0 = OFF, 1〜5 = 強さ） ----------------------------------- */

  let magnet = 3;
  let maglev = 2;

  function clampLevel(n) {
    n = Math.round(Number(n));
    if (!Number.isFinite(n)) return 0;
    return n < 0 ? 0 : (n > MAX_LEVEL ? MAX_LEVEL : n);
  }
  // 以前の0〜100%表記で保存された値も拾えるようにしておく。
  function readLevel(raw, fallback) {
    if (raw === null || raw === undefined || raw === '') return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return clampLevel(n > MAX_LEVEL ? n / 20 : n);
  }
  try {
    magnet = readLevel(localStorage.getItem(KEY_MAGNET), magnet);
    maglev = readLevel(localStorage.getItem(KEY_MAGLEV), maglev);
  } catch (err) { /* ストレージが使えないときは既定値のまま */ }

  function save() {
    try {
      localStorage.setItem(KEY_MAGNET, String(magnet));
      localStorage.setItem(KEY_MAGLEV, String(maglev));
    } catch (err) { /* 使えないなら今回のセッションだけ効かせる */ }
  }

  // 「動きを減らす」設定の端末では揺り返しを出さない（酔い/めまい対策）。
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

  /* --- イージング（すべて四則演算のみ。pow/exp を使わない） ------------- */

  const easeOutCubic = (p) => { const q = 1 - p; return 1 - q * q * q; };
  const easeOutQuad = (p) => p * (2 - p);
  const easeInOutQuad = (p) => {
    if (p < 0.5) return 2 * p * p;
    const q = -2 * p + 2;
    return 1 - (q * q) / 2;
  };

  /* --- 本体: 角度をひとつ動かすドライバ ---------------------------------

     CubeFeel.play({
       from,        // 開始角(rad)。省略時 0
       to,          // 終了角(rad)
       duration,    // drive+snap の合計ミリ秒（既存の turnDuration() をそのまま渡す）
       bounce,      // false なら揺り返しなし（連続再生の途中の手など）
       bounceScale, // 揺り返しの倍率。既定1。キューブ全体の持ち替えは0.5程度が上品
       sound,       // true なら回転音（摩擦音＋カチッ）を鳴らす。面を回すときだけ
       pan,         // -0.5〜0.5。音の左右位置。回した列の位置を渡すと立体感が出る
       onUpdate(angle),  // drive/snap 中。絶対角(rad)が来る
       onArrive(),       // ぴったり to に着いた瞬間。false を返すと揺り返しを中止
       onBounce(offset), // 揺り返し中。to からの「ずれ」(rad, 符号つき)が来る
       onEnd()           // 完全に静止したあと。後片付けはここで
     })

     戻り値は { settle() } のハンドル。途中で次の操作が来たら settle() を
     呼べば、残りのフェーズを即座に飛ばして onArrive/onBounce(0)/onEnd を
     同期的に走らせ、状態を確定させられる。
     -------------------------------------------------------------------- */
  function play(opts) {
    const from = opts.from || 0;
    const to = opts.to;
    const span = to - from;
    const dist = Math.abs(span);
    const dir = span >= 0 ? 1 : -1;
    const D = Math.max(16, opts.duration || 100);

    // レベル(0〜5)を 0〜1 に正規化してから式に入れる。
    const m = magnet / MAX_LEVEL;
    const b = maglev / MAX_LEVEL;

    // --- 磁力 ---
    // OFF のときは、従来どおり ease-out-cubic 一本（＝挙動が変わらない）。
    const useMagnet = magnet > 0 && dist > 1e-4;
    // 吸い込み区間は「残り角度」で決める。180°回しでも「最後の十数度」で
    // 吸い込むことになり、90°回しと同じ手触りになる。
    const zone = Math.min((ZONE_MIN_DEG + (ZONE_MAX_DEG - ZONE_MIN_DEG) * m) * DEG, dist * 0.45);
    const captureFrac = useMagnet ? (dist - zone) / dist : 1;
    const snapShare = SNAP_SHARE_WEAK - (SNAP_SHARE_WEAK - SNAP_SHARE_STRONG) * m;
    const driveDur = useMagnet ? D * (1 - snapShare) : D;
    const snapDur = useMagnet ? D * snapShare : 0;

    // --- マグレブ ---
    const scale = (opts.bounceScale == null) ? 1 : opts.bounceScale;
    const useBounce = (opts.bounce !== false) && maglev > 0 && !reduceMotion && !!opts.onBounce;
    const amp = AMP_MAX_DEG * DEG * b * scale;
    const bounceDur = BOUNCE_MS_MIN + (BOUNCE_MS_MAX - BOUNCE_MS_MIN) * b;
    const cycles = CYCLES_MIN + (CYCLES_MAX - CYCLES_MIN) * b;

    let raf = 0;
    let arrived = false;
    let done = false;
    let tBounce = 0;
    const t0 = (global.performance && performance.now) ? performance.now() : Date.now();

    /* --- 音の予約 -------------------------------------------------------
       opts.sound が真のときだけ鳴らす（面を回したときだけ＝持ち替えや
       設定ダイヤルでは鳴らさない）。到着時刻はこの時点で確定している
       ので、rAF を待たずに ctx.currentTime 基準で先に予約しておく。 */
    if (SOUND_ENABLED && opts.sound && !reduceMotion) {
      const ctx = ac();
      if (ctx) {
        const now = ctx.currentTime;
        const seatAt = now + (driveDur + snapDur) / 1000;
        const pan = opts.pan || 0;
        // 速い回しほど短く強い音になる（実物と同じ関係）
        const level = Math.min(1.35, 0.8 + (100 / D) * 0.35);
        // 出口（左右振り＋帯域を整えるフィルタ）は1手につき1本だけ作る。
        const out = outlet(ctx, pan);

        /* 45°を通過する時刻を、角度カーブから逆算する。
           drive中の角度は captureFrac * (p(2-p)) （p は drive の進み具合）
           なので、これが 0.5 になる p を解くと p = 1 - √(1-k)。
           磁力OFF のときは ease-out-cubic なので p = 1 - ∛0.5。
           ＝ どの設定でも「ちょうど半分回ったところ」で鳴りはじめる。 */
        let t45;
        if (useMagnet) {
          const k = Math.min(0.999, 0.5 / captureFrac);
          t45 = driveDur * (1 - Math.sqrt(1 - k));
        } else {
          t45 = D * 0.2063;
        }
        const rollDur = (driveDur + snapDur - t45) / 1000;
        if (rollDur > 0.012) {
          playRoll(ctx, now + t45 / 1000, rollDur, out, level);
        }
      }
    }

    function end() {
      if (done) return;
      done = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (opts.onEnd) opts.onEnd();
    }

    // to に到達した瞬間の確定処理。戻り値 false で揺り返しを打ち切る。
    function arrive() {
      arrived = true;
      if (opts.onUpdate) opts.onUpdate(to);
      return opts.onArrive ? (opts.onArrive() !== false) : true;
    }

    function frame(now) {
      if (done) return;
      const el = now - t0;

      if (!arrived) {
        // ① drive: 指で回しているぶん。減速しながら吸い込み口まで運ぶ
        if (el < driveDur) {
          const p = el / driveDur;
          const f = useMagnet ? captureFrac * easeOutQuad(p) : easeOutCubic(p);
          if (opts.onUpdate) opts.onUpdate(from + span * f);
          raf = requestAnimationFrame(frame);
          return;
        }
        // ② snap: 磁石が残りを持っていく。ease-in-out で「スッ、カチッ」
        if (useMagnet && el < driveDur + snapDur) {
          const p = (el - driveDur) / snapDur;
          const f = captureFrac + (1 - captureFrac) * easeInOutQuad(p);
          if (opts.onUpdate) opts.onUpdate(from + span * f);
          raf = requestAnimationFrame(frame);
          return;
        }
        if (!arrive() || !useBounce) { end(); return; }
        tBounce = now;
        raf = requestAnimationFrame(frame);
        return;
      }

      // ③ bounce: 減衰サイン波。sin 1回 + 乗算だけの軽い式。
      //    (1-τ)² で包むので、終端はぴったり 0 に戻る＝ズレが残らない。
      const tau = (now - tBounce) / bounceDur;
      if (tau >= 1) {
        opts.onBounce(0);
        end();
        return;
      }
      const decay = 1 - tau;
      opts.onBounce(dir * amp * Math.sin(tau * cycles * TAU) * decay * decay);
      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);

    return {
      // 途中で割り込まれたとき用。残りを飛ばして「静止状態」を確定させる。
      settle: function () {
        if (done) return;
        if (!arrived) arrive();
        if (opts.onBounce) opts.onBounce(0);
        end();
      },
      isDone: function () { return done; }
    };
  }

  /* --- 外向きAPI -------------------------------------------------------- */

  const CubeFeel = {
    play: play,
    MAX_LEVEL: MAX_LEVEL,
    get magnet() { return magnet; },
    get maglev() { return maglev; },
    set: function (nextMagnet, nextMaglev) {
      if (nextMagnet != null) magnet = clampLevel(nextMagnet);
      if (nextMaglev != null) maglev = clampLevel(nextMaglev);
      save();
    }
  };
  global.CubeFeel = CubeFeel;

  /* ============================================================
     多言語辞書の追記（既存 I18N は無改変。無いキーだけ足すマージ方式）
     ============================================================ */
  const FEEL_I18N = {
    ja: {
      feelMagnetLabel: '磁力の強さ',
      feelMaglevLabel: 'コアマグの反発力',
      feelDialHint: '中心を押してON／OFF。まわりのダイヤルを回すと1〜5で強さを選べます'
    },
    en: {
      feelMagnetLabel: 'Magnet strength',
      feelMaglevLabel: 'Magnet bounce',
      feelDialHint: 'Tap the centre for ON/OFF. Spin the dial around it to pick 1-5'
    },
    'zh-CN': {
      feelMagnetLabel: '磁力强度',
      feelMaglevLabel: '中轴磁铁回弹力',
      feelDialHint: '点中间开关，转动周围的拨盘可在1〜5之间选择强度'
    },
    'zh-TW': {
      feelMagnetLabel: '磁力強度',
      feelMaglevLabel: '中軸磁鐵回彈力',
      feelDialHint: '點中間開關，轉動周圍的轉盤可在1〜5之間選擇強度'
    },
    ko: {
      feelMagnetLabel: '자력 세기',
      feelMaglevLabel: '마그넷 반발력',
      feelDialHint: '가운데를 눌러 ON/OFF. 둘레의 다이얼을 돌려 1~5로 세기를 고릅니다'
    },
    es: {
      feelMagnetLabel: 'Fuerza del imán',
      feelMaglevLabel: 'Rebote del imán',
      feelDialHint: 'Toca el centro para activar. Gira el dial alrededor para elegir de 1 a 5'
    },
    id: {
      feelMagnetLabel: 'Kekuatan magnet',
      feelMaglevLabel: 'Pantulan magnet',
      feelDialHint: 'Ketuk bagian tengah untuk ON/OFF. Putar dial di sekelilingnya untuk memilih 1-5'
    },
    ru: {
      feelMagnetLabel: 'Сила магнита',
      feelMaglevLabel: 'Отдача магнита',
      feelDialHint: 'Нажмите на центр, чтобы включить или выключить. Поверните кольцо вокруг него, чтобы выбрать от 1 до 5'
    },
    'pt-BR': {
      feelMagnetLabel: 'Força do ímã',
      feelMaglevLabel: 'Repique do ímã',
      feelDialHint: 'Toque no centro para ligar/desligar. Gire o disco ao redor para escolher de 1 a 5'
    }
  };
  if (typeof I18N !== 'undefined' && I18N) {
    Object.keys(FEEL_I18N).forEach(function (lang) {
      if (!I18N[lang]) I18N[lang] = {};
      Object.keys(FEEL_I18N[lang]).forEach(function (k) {
        if (I18N[lang][k] === undefined) I18N[lang][k] = FEEL_I18N[lang][k];
      });
    });
  }

  /* ============================================================
     黒電話ふうダイヤルの見た目
     style.css を無改変のままにしたいので、このファイルから <style> を
     1枚だけ足す。あとで style.css へ引っ越しても動作は同じ。
     アクセントは既存のテーマ変数 --tc をそのまま使う。
     ============================================================ */
  const CSS = [
    '#feel-settings{margin:16px 0 4px}',
    '.feel-dials{display:flex;gap:10px;justify-content:center;align-items:flex-start;flex-wrap:wrap}',
    '.feel-dial-cell{flex:1 1 128px;max-width:170px;display:flex;flex-direction:column;',
    '  align-items:center;gap:8px}',
    '.feel-dial-cap{font-size:13px;font-weight:800;color:#e8e8f0;text-align:center;line-height:1.3}',
    /* ダイヤル本体。touch-action:none で、回している最中に設定パネルが
       一緒にスクロールしてしまうのを防ぐ。 */
    '.feel-dial{position:relative;width:128px;height:128px;flex:none;touch-action:none;',
    '  -webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}',
    /* 12時の位置の「読み取り窓」の目印 */
    '.feel-dial::before{content:"";position:absolute;left:50%;top:-3px;transform:translateX(-50%);',
    '  border-left:6px solid transparent;border-right:6px solid transparent;',
    '  border-top:9px solid var(--tc);opacity:.85;z-index:3}',
    '.feel-dial-ring{position:absolute;inset:0;border-radius:50%;border:2px solid #3a3a48;',
    '  touch-action:none;',
    '  background:radial-gradient(circle at 50% 32%,#2b2b36,#16161c 72%);',
    '  transform:rotate(var(--ring,0deg));will-change:transform;',
    '  transition:border-color .18s ease,opacity .18s ease,box-shadow .18s ease}',
    '.feel-dial.is-on .feel-dial-ring{border-color:var(--tc);box-shadow:0 6px 16px rgba(0,0,0,.4)}',
    '.feel-dial.is-off .feel-dial-ring{opacity:.4}',
    '.feel-dial-ring:focus-visible{outline:2px solid var(--tc);outline-offset:3px}',
    /* 数字。--pos は各数字の定位置、--ring はダイヤルの回転量。
       逆回転を掛けることで、ダイヤルが回っても数字は常に上向きのまま。 */
    '.feel-dial-num{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;',
    '  display:flex;align-items:center;justify-content:center;border-radius:50%;',
    '  font:800 13px/1 ui-monospace,monospace;color:#8f8fa6;background:#20202a;',
    '  transform:rotate(var(--pos)) translateY(-45px) rotate(calc(-1 * (var(--pos) + var(--ring,0deg))));',
    '  transition:color .15s ease,background .15s ease,box-shadow .15s ease}',
    '.feel-dial.is-on .feel-dial-num.is-sel{color:#12121a;background:var(--tc);',
    '  box-shadow:0 0 12px var(--tc)}',
    /* 中心のON/OFFボタン */
    '.feel-dial-btn{position:absolute;left:50%;top:50%;width:62px;height:62px;margin:-31px 0 0 -31px;',
    '  border-radius:50%;border:2px solid #4a4a5c;background:#1b1b22;color:#9a9ab0;',
    '  font:800 13px/1 system-ui,sans-serif;letter-spacing:1.5px;cursor:pointer;z-index:2;',
    '  display:flex;align-items:center;justify-content:center;padding:0;',
    '  transition:color .18s ease,border-color .18s ease,box-shadow .18s ease,transform .1s ease}',
    '.feel-dial.is-on .feel-dial-btn{color:var(--tc);border-color:var(--tc);',
    '  box-shadow:0 0 14px rgba(0,0,0,.45)}',
    '.feel-dial-btn:active{transform:scale(.94)}',
    '.feel-dial-hint{margin-top:10px;position:relative}',

    /* --- ON/OFF の切り替え演出 ---------------------------------------
       ONは「磁力が外へ広がる」、OFFは「灯りがゆっくり落ちる」。
       どちらも transform と opacity しか動かさないので、スマホでも
       カクつかない。 */

    /* 常時のほのかな光。ONで点き、OFFでは 0.9 秒かけて静かに消える。
       消えるときだけ時間を長くしているのが、この演出の肝。 */
    '.feel-dial-glow{position:absolute;inset:-3px;border-radius:50%;pointer-events:none;',
    '  box-shadow:0 0 22px 1px var(--tc),inset 0 0 14px -4px var(--tc);',
    '  opacity:0;transition:opacity .9s cubic-bezier(.3,0,.6,1)}',
    '.feel-dial.is-on .feel-dial-glow{opacity:.42;transition:opacity .22s ease-out}',

    /* ONの瞬間だけ、中心から外へ抜けていく波。3枚を0.1秒ずつずらして
       出し、ダイヤルの4.2倍まで膨らませる。円の内側で消えると
       ただの点滅に見えるので、はっきり円の外へ抜けさせるのが要点。
       輪郭線だけでなく内側にもテーマ色の薄い塗りを入れてあるので、
       水面の波紋ではなく「磁場が押し出された」感じになる。 */
    '.feel-dial-wave{position:absolute;left:50%;top:50%;width:62px;height:62px;',
    '  margin:-31px 0 0 -31px;border-radius:50%;border:2px solid var(--tc);',
    '  background:radial-gradient(circle,rgba(var(--tc-rgb),.20) 0%,',
    '    rgba(var(--tc-rgb),.07) 52%,rgba(var(--tc-rgb),0) 72%);',
    '  pointer-events:none;opacity:0;transform:scale(.42);z-index:1;',
    '  will-change:transform,opacity}',
    '.feel-dial-wave.go{animation:feelWave .86s cubic-bezier(.16,.72,.28,1) forwards}',
    '.feel-dial-wave.w2.go{animation-delay:.1s}',
    '.feel-dial-wave.w3.go{animation-delay:.2s}',
    '@keyframes feelWave{',
    '  0%{opacity:.9;transform:scale(.42)}',
    '  55%{opacity:.34}',
    '  100%{opacity:0;transform:scale(4.2)}}',

    /* 波が下の説明文まで届くと、そこで色が走る。
       押したダイヤルの真下から湧き出させたいので、色の中心は
       --wx（説明文の左端から見た割合）で受け取る。

       【元の文字には一切さわらない】
       前は説明文そのものを文字型に切り抜いていたが、切り抜き中と
       通常描画とでは字の縁の出方が変わるため、終わった瞬間に
       「ぷちっ」と白く戻って見えていた。
       そこで、同じ文章の写しを1枚だけ上に重ね、そちらにだけ色の輪を
       通す方式にした。下の白い文字は最初から最後まで描画が変わらない
       ので、戻るときの段差が原理的に起きない。写しは輪が通り過ぎた
       あと透明になって消えるだけ。 */
    '.feel-hint-wave{position:absolute;left:0;top:0;width:100%;',
    '  pointer-events:none;',
    '  background-image:radial-gradient(circle,',
    '    rgba(var(--tc-rgb),0) 26%,rgba(var(--tc-rgb),1) 40%,',
    '    rgba(var(--tc-rgb),1) 52%,rgba(var(--tc-rgb),0) 66%);',
    '  background-repeat:no-repeat;background-position:var(--wx,50%) 50%;',
    '  background-size:0 0;',
    '  -webkit-background-clip:text;background-clip:text;',
    '  -webkit-text-fill-color:transparent;color:transparent;',
    '  animation:feelHintWave 1.15s cubic-bezier(.22,.7,.35,1) both}',
    '@keyframes feelHintWave{',
    '  0%{background-size:0 0;opacity:1}',
    '  78%{opacity:1}',
    '  100%{background-size:1200px 1200px;opacity:0}}',

    /* OFFにした直後だけ、光っていた数字を急に消さず、同じ0.9秒で
       いっしょに落とす。ここを一瞬で消すと「ブツッと切れた」感じになる。 */
    '.feel-dial.is-fading .feel-dial-ring{transition:border-color .9s ease,opacity .9s ease}',
    '.feel-dial.is-fading .feel-dial-num{transition:color .9s ease,background .9s ease,',
    '  box-shadow .9s ease}',

    '@media (prefers-reduced-motion: reduce){',
    '  .feel-dial-wave{display:none}',
    '  .feel-hint-wave{display:none}',
    '  .feel-dial-glow{transition-duration:.15s}',
    '  .feel-dial.is-fading .feel-dial-ring,.feel-dial.is-fading .feel-dial-num{',
    '    transition-duration:.15s}',
    '}'
  ].join('');

  function injectCSS() {
    if (document.getElementById('feel-style')) return;
    const st = document.createElement('style');
    st.id = 'feel-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ============================================================
     黒電話ふうダイヤルの組み立て
     ============================================================ */
  function tr(key, fallback) {
    try {
      if (typeof t === 'function') {
        const s = t(key);
        if (s) return s;
      }
    } catch (err) { /* 辞書がまだなら既定文言 */ }
    return fallback;
  }

  function buzz(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (err) { /* 非対応 */ }
  }

  const STEP = 360 / MAX_LEVEL;   // 数字1つぶんの角度（5等分なので72°）

  /* ダイヤル1つ分を組み立てて返す。
       labelKey/labelFallback … 見出しの辞書キーと既定文言
       getLevel / setLevel    … 磁力かマグレブか、値の出し入れだけ差し替える */
  /* 波が説明文に届いたことにして、色を走らせる。
     説明文は2つのダイヤルで1枚を共有しているので、この関数と後始末の
     タイマーはダイヤルの外に1つだけ置く。
     色が湧き出す横位置は、押されたダイヤルの中心を説明文の幅に対する
     割合へ直して --wx で渡す。左の「磁力」なら左寄り、右の「コアマグ」
     なら右寄りから広がるので、どちらを押したのかが目で分かる。 */
  let hintWaveTimer = null;

  // 重ねてある写しを取り除く。文面を読むときも書き換えるときも、
  // まずこれを通して素の1行に戻してから触る。
  function clearHintWave(hint) {
    const old = hint.querySelector('.feel-hint-wave');
    if (old && old.parentNode) old.parentNode.removeChild(old);
  }

  function sendWaveToHint(dial) {
    const hint = document.getElementById('feel-dial-hint');
    if (!hint) return;
    clearTimeout(hintWaveTimer);
    clearHintWave(hint);

    const fx = document.createElement('span');
    fx.className = 'feel-hint-wave';
    fx.setAttribute('aria-hidden', 'true');
    fx.textContent = hint.textContent;   // 写す前に外してあるので素の1行

    try {
      const d = dial.getBoundingClientRect();
      const h = hint.getBoundingClientRect();
      if (h.width) {
        const pct = ((d.left + d.width / 2) - h.left) / h.width * 100;
        fx.style.setProperty('--wx', Math.max(0, Math.min(100, pct)) + '%');
      }
    } catch (err) { /* 位置が測れなければ真ん中から */ }

    // ダイヤルから説明文まで波が下りてくるぶんだけ待たせる。
    fx.style.animationDelay = '270ms';
    hint.appendChild(fx);

    const kill = function () { clearHintWave(hint); };
    fx.addEventListener('animationend', kill);
    hintWaveTimer = setTimeout(kill, 1800);   // 取りこぼしたときの保険
  }

  function makeDial(labelKey, labelFallback, getLevel, setLevel) {
    const cell = document.createElement('div');
    cell.className = 'feel-dial-cell';

    const cap = document.createElement('div');
    cap.className = 'feel-dial-cap';
    cap.setAttribute('data-i18n', labelKey);
    cap.textContent = tr(labelKey, labelFallback);
    cell.appendChild(cap);

    const dial = document.createElement('div');
    dial.className = 'feel-dial';

    const ring = document.createElement('div');
    ring.className = 'feel-dial-ring';
    ring.setAttribute('role', 'slider');
    ring.setAttribute('tabindex', '0');
    ring.setAttribute('aria-valuemin', '0');
    ring.setAttribute('aria-valuemax', String(MAX_LEVEL));
    ring.setAttribute('data-i18n-aria', labelKey);
    ring.setAttribute('aria-label', tr(labelKey, labelFallback));

    const nums = [];
    for (let i = 0; i < MAX_LEVEL; i++) {
      const el = document.createElement('span');
      el.className = 'feel-dial-num';
      el.textContent = String(i + 1);
      el.style.setProperty('--pos', (i * STEP) + 'deg');
      el.dataset.level = String(i + 1);
      ring.appendChild(el);
      nums.push(el);
    }
    dial.appendChild(ring);

    // ほのかな光と、ONの瞬間に広がる波3枚。どちらも触れない飾りなので
    // ring の外（回転しない側）に置き、読み上げからも隠す。
    const glow = document.createElement('span');
    glow.className = 'feel-dial-glow';
    glow.setAttribute('aria-hidden', 'true');
    dial.appendChild(glow);

    let waveResetTimer = null;
    // 直前に選ばれていた数字。null のあいだは音を鳴らさない。
    let lastShown = null;

    const waves = [];
    for (let k = 0; k < 3; k++) {
      const wv = document.createElement('span');
      wv.className = 'feel-dial-wave' + (k ? ' w' + (k + 1) : '');
      wv.setAttribute('aria-hidden', 'true');
      dial.appendChild(wv);
      waves.push(wv);
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'feel-dial-btn';
    btn.setAttribute('role', 'switch');
    dial.appendChild(btn);
    cell.appendChild(dial);

    /* --- 状態 ---
       ringDeg は「ダイヤルを何度回してあるか」。数字 L を12時に持ってくる
       には -(L-1)*STEP。OFF のあいだも角度は保持しておき、ONに戻したとき
       同じ位置から再開できるようにする。 */
    let ringDeg = -(Math.max(getLevel(), 1) - 1) * STEP;
    let lastOn = getLevel() || 3;   // OFF から復帰したときに戻る強さ
    let anim = null;                // 回転アニメのハンドル
    let dragging = false;
    // OFF にした直後の「光が落ちきるまで」の 0.9 秒。この間は選んでいた
    // 数字の色をまだ落とさず、光といっしょにゆっくり暗くする。
    let fading = false;
    let fadeTimer = null;

    function levelFromDeg(deg) {
      const idx = ((Math.round(-deg / STEP) % MAX_LEVEL) + MAX_LEVEL) % MAX_LEVEL;
      return idx + 1;
    }
    function paintRing(deg) {
      ringDeg = deg;
      ring.style.setProperty('--ring', deg + 'deg');
      const shown = levelFromDeg(deg);
      const on = getLevel() > 0 || fading;
      for (let i = 0; i < nums.length; i++) {
        nums[i].classList.toggle('is-sel', on && (i + 1) === shown);
      }
      /* 数字が1つ送られた瞬間にカチッと鳴らす。ここ1か所に置けば、
         指でつまんで回す／数字を直接タップ／キーボード／自動で回る
         アニメーションの全部を、同じ判定でまかなえる。
         lastShown が null のあいだ（画面を組み立てている最中）と
         OFF のあいだは鳴らさない。 */
      if (lastShown !== null && shown !== lastShown && getLevel() > 0) {
        playDialTick(1, 0);
      }
      lastShown = shown;
    }
    function paintState() {
      const lv = getLevel();
      const on = lv > 0;
      dial.classList.toggle('is-on', on);
      dial.classList.toggle('is-off', !on);
      btn.textContent = on ? 'ON' : 'OFF';
      btn.setAttribute('aria-checked', String(on));
      ring.setAttribute('aria-valuenow', String(lv));
      ring.setAttribute('aria-valuetext', on ? String(lv) : 'OFF');
      paintRing(ringDeg);
    }

    /* 目的の数字まで回す。ここでも CubeFeel.play を使っているので、いま
       選んでいる磁力/マグレブの手触りが、そのままダイヤルの止まり方に出る
       （＝設定パネルの中だけで効き具合を確かめられる）。 */
    function spinTo(level, animate) {
      if (anim) { anim.settle(); anim = null; }
      const target = -(level - 1) * STEP;
      // 現在角から見て近いほうへ回す（5→1のまたぎも最短で）
      let d = target - ringDeg;
      d = ((d + 180) % 360 + 360) % 360 - 180;
      const to = ringDeg + d;
      if (!animate || Math.abs(d) < 0.01) { paintRing(to); return; }
      anim = play({
        from: ringDeg * DEG,
        to: to * DEG,
        duration: 170,
        onUpdate: function (a) { paintRing(a / DEG); },
        onArrive: function () { paintRing(to); return true; },
        onBounce: function (off) { paintRing(to + off / DEG); },
        onEnd: function () { paintRing(to); anim = null; }
      });
    }

    function commit(level, animate) {
      const lv = clampLevel(level);
      if (lv > 0) lastOn = lv;
      setLevel(lv);
      save();
      // OFF にするときはダイヤルを動かさない。暗くなるだけで位置は
      // そのまま残り、ONに戻したときに続きから回りはじめる。
      if (lv > 0) spinTo(lv, animate);
      paintState();
    }

    /* ONの瞬間に、中心から外へ波を1度だけ走らせる。
       同じ要素を使い回すので、アニメを付け直す前にクラスを外して
       レイアウトを一度読み、再生をリセットしてから付ける。
       （外して付けるだけだと、ブラウザが「変化なし」とみなして
         2回目以降が再生されない） */
    function playOnPulse() {
      if (reduceMotion) return;
      waves.forEach(function (wv) {
        wv.classList.remove('go');
        void wv.offsetWidth;
        wv.classList.add('go');
        // 【走り終えたら go を必ず外す】
        // 付けっぱなしにすると、設定画面を閉じる＝display:none で
        // アニメーションが巻き戻り、次に開いた瞬間にもう一度再生される。
        // 「設定を開くたびに光る」のはこれが原因。
        wv.addEventListener('animationend', function () {
          wv.classList.remove('go');
        }, { once: true });
      });
      clearTimeout(waveResetTimer);   // 取りこぼしたときの保険
      waveResetTimer = setTimeout(function () {
        waves.forEach(function (wv) { wv.classList.remove('go'); });
      }, 1300);
      sendWaveToHint(dial);
    }

    // --- 中心ボタン: ON / OFF ---
    btn.addEventListener('click', () => {
      const on = getLevel() > 0;
      buzz(on ? 10 : [8, 30, 8]);
      // ONにするときだけ、短い余韻を足して「立ち上がった」感じを出す。
      playDialTick(0.75, on ? 0 : 0.75);
      clearTimeout(fadeTimer);
      if (on) {
        // OFFへ：光が落ちきるまでのあいだ .is-fading を付けておく
        fading = true;
        dial.classList.add('is-fading');
        fadeTimer = setTimeout(function () {
          fading = false;
          dial.classList.remove('is-fading');
          paintRing(ringDeg);   // ここでようやく数字の選択表示を落とす
        }, 900);
      } else {
        // ONへ：フェード中だったら中断して、すぐ光らせる
        fading = false;
        dial.classList.remove('is-fading');
        playOnPulse();
      }
      commit(on ? 0 : lastOn, true);
    });

    // --- ダイヤルを回す ---
    let startAngle = 0, startDeg = 0, moved = 0, downTarget = null;

    function angleAt(ev) {
      const r = dial.getBoundingClientRect();
      const dx = ev.clientX - (r.left + r.width / 2);
      const dy = ev.clientY - (r.top + r.height / 2);
      return Math.atan2(dy, dx) / DEG;
    }

    ring.addEventListener('pointerdown', (e) => {
      if (getLevel() === 0) return;       // OFF のあいだは回らない
      if (anim) { anim.settle(); anim = null; }
      dragging = true;
      moved = 0;
      downTarget = e.target.closest ? e.target.closest('.feel-dial-num') : null;
      startAngle = angleAt(e);
      startDeg = ringDeg;
      try { ring.setPointerCapture(e.pointerId); } catch (err) { /* 非対応 */ }
      e.preventDefault();
    });

    ring.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      let d = angleAt(e) - startAngle;
      // -180〜180 に畳んでおく（12時をまたいだ瞬間に1回転飛ぶのを防ぐ）
      d = ((d + 180) % 360 + 360) % 360 - 180;
      moved = Math.max(moved, Math.abs(d));
      const before = levelFromDeg(ringDeg);
      paintRing(startDeg + d);
      // 数字が1つ送られるたびに、黒電話の爪送りのような短い振動を入れる
      if (levelFromDeg(ringDeg) !== before) buzz(8);
      e.preventDefault();
    });

    function releaseDial(e) {
      if (!dragging) return;
      dragging = false;
      try { ring.releasePointerCapture(e.pointerId); } catch (err) { /* 済み */ }
      // ほとんど動かしていなければ「数字を直接タップした」とみなす
      if (moved < 5 && downTarget) {
        buzz(10);
        commit(Number(downTarget.dataset.level), true);
        return;
      }
      buzz(12);
      commit(levelFromDeg(ringDeg), true);
    }
    ring.addEventListener('pointerup', releaseDial);
    ring.addEventListener('pointercancel', releaseDial);

    // --- キーボード操作 ---
    ring.addEventListener('keydown', (e) => {
      const lv = getLevel();
      let next = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(MAX_LEVEL, lv + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(0, lv - 1);
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = MAX_LEVEL;
      if (next === null) return;
      e.preventDefault();
      commit(next, true);
    });

    paintState();
    return {
      cell: cell,
      capEl: cap,
      ringEl: ring,
      labelKey: labelKey,
      fallback: labelFallback
    };
  }

  function buildUI() {
    const anchor = document.getElementById('size-hint');
    if (!anchor || document.getElementById('feel-settings')) return;
    injectCSS();

    const wrap = document.createElement('div');
    wrap.id = 'feel-settings';

    const row = document.createElement('div');
    row.className = 'feel-dials';

    const magDial = makeDial('feelMagnetLabel', '磁力の強さ',
      function () { return magnet; },
      function (v) { magnet = v; });
    const levDial = makeDial('feelMaglevLabel', 'コアマグの反発力',
      function () { return maglev; },
      function (v) { maglev = v; });
    row.appendChild(magDial.cell);
    row.appendChild(levDial.cell);
    wrap.appendChild(row);

    const hint = document.createElement('p');
    hint.className = 'settings-hint feel-dial-hint';
    hint.id = 'feel-dial-hint';
    hint.setAttribute('data-i18n', 'feelDialHint');
    hint.textContent = tr('feelDialHint', '中心を押してON／OFF。まわりのダイヤルを回すと1〜5で強さを選べます');
    wrap.appendChild(hint);

    anchor.insertAdjacentElement('afterend', wrap);

    // 言語が切り替わったら文言を描き直す（applyI18n から呼ばれる）。
    if (typeof onI18n === 'function') {
      onI18n(function () {
        [magDial, levDial].forEach(function (d) {
          const s = tr(d.labelKey, d.fallback);
          d.capEl.textContent = s;
          d.ringEl.setAttribute('aria-label', s);
        });
        clearHintWave(hint);
        hint.textContent = tr('feelDialHint', hint.textContent);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }
})(window);
