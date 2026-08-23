/* ============================================================
   help-glow.js — 💡ヘルプの「見守りディレイ」と「呼吸ハイライト」
   ------------------------------------------------------------
   cube-feel.js / ui-polish.js / theme-natural.css と同じ方針で、
   ふるまいの本体はこのファイル1枚に閉じ込めてある。index.html 側は
   「読み込む」「今どの面を回してほしいか教える」「案内をやめたと
   伝える」の3か所だけ（実質4行）。この <script> を外せば、ヘルプは
   これまでどおり "お手本パネルだけ" の挙動に完全に戻る。

   何をするか
     ① 見守りディレイ
        次の1手が出てから、すぐには光らせない。残り手数が少なくなる
        ほど待つ時間を長くして（3秒 → 最大10秒）、考える余白を残す。
        機械仕掛けに見えないよう、毎回 ±20% のゆらぎを足す。ゆらぎは
        白色乱数ではなく 1/f（ピンクノイズ）で、続けて短い／続けて長い
        という"むら"がゆっくり移り変わるようにしてある。
     ② 呼吸ハイライト
        待っても手が動かないときだけ、対象の面をゆっくり明滅させる。
        点滅ではなく、3秒でひと呼吸する余弦波。最初のひと呼吸は
        立ち上がりを抑えて、いつの間にか光っていた、という出方にする。
     ③ 即時キャンセル
        キューブに触れた瞬間に光を引く（0.26秒でふわっと消す）。
        ディレイのタイマーもそこから測り直す。

   描画の負荷について
     ・待っている間は setTimeout だけ。requestAnimationFrame は1回も
       回さない（＝ヘルプを開いているだけでは何も動かない）。
     ・光っている間だけ rAF を回し、消え終わったら自分で止まる。
       1フレームでやるのは「9枚のマテリアルの emissive を書き換える」
       ことだけで、ジオメトリの作り直しもレイアウトの再計算もない。
     ・キューブ本体の描画ループ(animate)は元からフレームごとに回って
       いるので、こちらから描き直しを要求する必要はない。
     ・タブが裏に回ったら光を消し、戻ってきたら測り直す。

   なぜ emissive だけで済ませないか（ハローの話）
     このアプリの照明は 環境光0.7 + 平行光0.6/0.3。白(#FFFFFF)や
     黄(#FFD500)のマスは、上や手前を向いた時点ですでに明るさが振り
     切れている。そこへ emissive を足しても画面上はもう変化しない
     ＝「白い面のときだけ光って見えない」ことになる。
     そこで、面のふちから外へすうっと滲む薄い光（ハロー）を1枚だけ
     重ねる。滲んだ先は暗い背景なので、どのマス色でも必ず伝わる。
     面の色をそのまま淡くした色で光らせるので、赤い面は赤く、青い面は
     青く滲む（どの面かの手がかりも兼ねる）。
   ============================================================ */
(function (global) {
  'use strict';

  /* ============================================================
     調整用の数値 — ここだけ見れば手触りを変えられる
     ============================================================ */
  const CFG = {
    /* --- ① 見守りディレイ --- */
    DELAY_MIN_MS: 3000,   // 序盤（残り手数が多い）の待ち時間
    DELAY_MAX_MS: 10000,  // 終盤（残りわずか）の待ち時間
    RAMP_FROM: 30,        // 残りこの手数までは DELAY_MIN のまま
    RAMP_TO: 2,           // 残りこの手数で DELAY_MAX に到達
    JITTER: 0.20,         // ±20% のゆらぎ

    /* --- ② 呼吸 --- */
    BREATH_MS: 3000,      // ひと呼吸の長さ
    GLOW_MAX: 0.28,       // 息を吸いきったときの発光量（0.25〜0.3が上限の目安）
    GLOW_MIN: 0.05,       // 吐ききってもここまでしか落とさない（完全に消すと点滅に見える）
    FADE_IN_MS: 900,      // 光り始めの立ち上がり
    FADE_OUT_MS: 260,     // 触れられたときに引くまでの時間
    STILL_LEVEL: 0.14,    // 「動きを減らす」設定の端末では、呼吸させず一定でともす

    /* --- ハロー（面のふちから滲む光） --- */
    HALO: true,
    HALO_GAIN: 1.15,      // 発光量に対するハローの濃さ
    FACE_RATIO: 0.78,     // 板の大きさに対する「面」の割合（残りが滲みしろ）

    /* --- その他 --- */
    RETRY_MS: 260         // 回転アニメ中に光り始めようとしたときの再挑戦間隔
  };

  /* ============================================================
     状態
     ============================================================ */
  let bridge = null;          // { cubies, cubeGroup, isBusy }
  let armed = null;           // 今の指示 { cfg, left, total }
  let waitTimer = null;
  let phase = 'idle';         // 'idle' | 'wait' | 'breathe' | 'fade'
  let raf = 0;
  let breatheAt = 0;
  let fadeAt = 0, fadeFrom = 0, lastK = 0;
  let targets = [];           // [{ mat, emissive }] 光らせているマテリアル
  let halo = null;            // { mesh, mat }
  let haloTex = null;
  let enabled = true;

  /* 「動きを減らす」設定 */
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

  const hasTHREE = () => typeof global.THREE !== 'undefined';

  /* ============================================================
     1/f ゆらぎ（ピンクノイズ）
     ------------------------------------------------------------
     Voss-McCartney 法。乱数の行を5本持ち、1回呼ばれるごとに
     「2回に1回」「4回に1回」…と更新の間隔が倍々に伸びる行を混ぜる。
     こうすると、隣り合う手どうしは似た長さになりやすく、しかし
     何手か経つとゆっくり傾きが変わる、という自然なむらになる。
     毎回まっさらな乱数を引く（白色雑音）と、長い・短いが無関係に
     飛び跳ねて、かえって不自然に感じられる。
     呼ばれるのは1手につき1回だけなので、負荷はないに等しい。
     ============================================================ */
  const pink = (function () {
    const ROWS = 5;
    const rows = new Array(ROWS);
    let sum = 0;
    for (let i = 0; i < ROWS; i++) { rows[i] = Math.random() * 2 - 1; sum += rows[i]; }
    let count = 0;
    return function () {
      count = (count + 1) & 0xffff;
      for (let i = 0; i < ROWS; i++) {
        if (count % (1 << i) !== 0) continue;
        sum -= rows[i];
        rows[i] = Math.random() * 2 - 1;
        sum += rows[i];
      }
      // 5本の平均は中央に寄る（標準偏差およそ0.26）ので、
      // ざっと ±1 に収まるよう広げてから頭打ちにする。
      const v = (sum / ROWS) * 2.2;
      return v < -1 ? -1 : (v > 1 ? 1 : v);
    };
  })();

  /* ============================================================
     待ち時間を決める
     残り手数が RAMP_FROM から RAMP_TO へ減るあいだに、
     DELAY_MIN → DELAY_MAX へなめらかに伸びていく。
     ============================================================ */
  function computeDelay(left) {
    const span = CFG.RAMP_FROM - CFG.RAMP_TO;
    let p = span > 0 ? (CFG.RAMP_FROM - left) / span : 1;
    p = p < 0 ? 0 : (p > 1 ? 1 : p);
    p = p * p * (3 - 2 * p);                       // 端をなだらかに
    const base = CFG.DELAY_MIN_MS + (CFG.DELAY_MAX_MS - CFG.DELAY_MIN_MS) * p;
    return Math.max(600, base * (1 + CFG.JITTER * pink()));
  }

  /* ============================================================
     光らせる面を探す
     ------------------------------------------------------------
     cfg = { axis:'x'|'y'|'z', layers:[±1], dir } はキューブ自身の
     座標系。その面に乗っている9個のマスを拾い、マスごとに「外を向いて
     いる1枚」がマテリアルの何番目かを、そのマスの姿勢から割り出す。
     （マスは回されるたびに向きが変わるので、添字は固定できない）
     ============================================================ */
  const LOCAL_NORMALS = [];
  function localNormals() {
    if (LOCAL_NORMALS.length) return LOCAL_NORMALS;
    const T = global.THREE;
    LOCAL_NORMALS.push(
      new T.Vector3(1, 0, 0), new T.Vector3(-1, 0, 0),
      new T.Vector3(0, 1, 0), new T.Vector3(0, -1, 0),
      new T.Vector3(0, 0, 1), new T.Vector3(0, 0, -1)
    );
    return LOCAL_NORMALS;
  }

  function collectTargets(cfg) {
    const T = global.THREE;
    const axis = cfg.axis;
    const sign = cfg.layers && cfg.layers.length ? cfg.layers[0] : 0;
    const out = [];
    let centerColor = null;
    let surface = 1.47;
    if (!axis || Math.abs(Math.abs(sign) - 1) > 0.2) return null;   // 中段(M/E/S)には面がない

    const want = new T.Vector3();
    want[axis] = sign > 0 ? 1 : -1;
    const nrm = new T.Vector3();
    const N = localNormals();
    const others = ['x', 'y', 'z'].filter((a) => a !== axis);

    for (const c of bridge.cubies) {
      if (!c || !c.material || !c.material.length) continue;
      if (Math.abs(c.position[axis] - sign) > 0.25) continue;

      let best = -1, bestDot = 0.85;
      for (let i = 0; i < 6; i++) {
        nrm.copy(N[i]).applyQuaternion(c.quaternion);
        const d = nrm.dot(want);
        if (d > bestDot) { bestDot = d; best = i; }
      }
      if (best < 0) continue;
      const mat = c.material[best];
      if (!mat || !mat.emissive) continue;
      out.push({ mat: mat, emissive: mat.emissive.getHex() });

      // 面の中心のマス＝この面の色。ハローの色に使う。
      if (Math.abs(c.position[others[0]]) < 0.25 && Math.abs(c.position[others[1]]) < 0.25) {
        centerColor = mat.color;
        // マスは配色によって拡大されていることがある（すき間を詰めた
        // キューブカラー）。板を浮かせる高さは実寸から出す。
        const sc = (c.scale && c.scale.x) || 1;
        surface = 1 + (0.94 * sc) / 2;
      }
    }
    if (!out.length) return null;
    return { mats: out, color: centerColor, surface: surface, axis: axis, sign: sign > 0 ? 1 : -1 };
  }

  /* ============================================================
     ハローの板
     ------------------------------------------------------------
     面と同じ向きの正方形を1枚だけ、面のほんの少し外側に浮かせる。
     cubeGroup の子にするので、視点を回しても面に貼りついたまま。
     テクスチャは128pxのキャンバスを1回だけ焼いて、以後は使い回す。
     ============================================================ */
  function buildHaloTexture() {
    if (haloTex) return haloTex;
    const T = global.THREE;
    const N = 128;
    const cv = document.createElement('canvas');
    cv.width = cv.height = N;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(N, N);
    const data = img.data;

    const b = CFG.FACE_RATIO;      // 面のふちの位置（正規化座標 -1..1 のうち）
    const R = 0.16;                // 角丸
    const inW = 0.20;              // ふちから内側へ、明るさが立ち上がる幅
    const outW = 1 - b;            // ふちから外側へ、滲んで消えるまでの幅
    const inside = 0.07;           // 面の内側のうっすらとした底上げ

    const smooth = (e0, e1, x) => {
      let t = (x - e0) / (e1 - e0);
      t = t < 0 ? 0 : (t > 1 ? 1 : t);
      return t * t * (3 - 2 * t);
    };

    for (let y = 0; y < N; y++) {
      const ny = ((y + 0.5) / N) * 2 - 1;
      for (let x = 0; x < N; x++) {
        const nx = ((x + 0.5) / N) * 2 - 1;
        // 角の丸い四角までの符号つき距離（内側が負、ふちが0、外側が正）
        const qx = Math.abs(nx) - (b - R);
        const qy = Math.abs(ny) - (b - R);
        const mx = qx > 0 ? qx : 0;
        const my = qy > 0 ? qy : 0;
        const inner = Math.min(Math.max(qx, qy), 0);
        const d = Math.sqrt(mx * mx + my * my) + inner - R;

        let a;
        if (d <= 0) {
          a = inside + (1 - inside) * smooth(-inW, 0, d);
        } else {
          const f = 1 - smooth(0, outW, d);
          a = f * f;                                  // 外側はより急に消す
        }
        const i = (y * N + x) * 4;
        data[i] = 255; data[i + 1] = 255; data[i + 2] = 255;
        data[i + 3] = Math.round(255 * a);
      }
    }
    ctx.putImageData(img, 0, 0);
    haloTex = new T.CanvasTexture(cv);
    haloTex.needsUpdate = true;
    return haloTex;
  }

  function showHalo(info) {
    if (!CFG.HALO || !bridge || !bridge.cubeGroup) return;
    const T = global.THREE;
    try {
      if (!halo) {
        const mat = new T.MeshBasicMaterial({
          map: buildHaloTexture(),
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: T.AdditiveBlending,
          side: T.DoubleSide
        });
        const mesh = new T.Mesh(new T.PlaneGeometry(1, 1), mat);
        mesh.renderOrder = 6;      // マスより後に描く
        halo = { mesh: mesh, mat: mat };
      }
      // 面の色を白へ寄せた淡い色でともす（赤い面は赤く滲む）。
      if (info.color) {
        halo.mat.color.setRGB(
          info.color.r + (1 - info.color.r) * 0.45,
          info.color.g + (1 - info.color.g) * 0.45,
          info.color.b + (1 - info.color.b) * 0.45
        );
      } else {
        halo.mat.color.setRGB(1, 1, 1);
      }
      // 板の大きさ: 面の実寸 ÷ FACE_RATIO（余った縁が滲みしろになる）
      const size = (info.surface * 2) / CFG.FACE_RATIO;
      halo.mesh.scale.set(size, size, 1);
      const dir = new T.Vector3();
      dir[info.axis] = info.sign;
      halo.mesh.position.copy(dir).multiplyScalar(info.surface + 0.015);
      halo.mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), dir);
      halo.mat.opacity = 0;
      if (halo.mesh.parent !== bridge.cubeGroup) bridge.cubeGroup.add(halo.mesh);
    } catch (err) { halo = null; }
  }

  function hideHalo() {
    if (!halo) return;
    try {
      halo.mat.opacity = 0;
      if (halo.mesh.parent) halo.mesh.parent.remove(halo.mesh);
    } catch (err) { /* 破棄済みなら何もしなくてよい */ }
  }

  /* ============================================================
     光量の反映
     k = 0 〜 GLOW_MAX
     ============================================================ */
  function applyLevel(k) {
    for (let i = 0; i < targets.length; i++) {
      const m = targets[i].mat;
      if (!m.emissive) continue;
      // 面の色そのものを光源色にすると、赤は赤く、青は青く「内側から
      // ともった」ように見える。配色を差し替えても自動で追従する。
      m.emissive.setRGB(m.color.r * k, m.color.g * k, m.color.b * k);
    }
    if (halo && halo.mesh.parent) halo.mat.opacity = Math.min(1, k * CFG.HALO_GAIN);
  }

  function restore() {
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      try { if (t.mat.emissive) t.mat.emissive.setHex(t.emissive); } catch (err) { /* 破棄済み */ }
    }
    targets = [];
    hideHalo();
    lastK = 0;
  }

  /* ============================================================
     光っている間だけ回るループ
     ============================================================ */
  function tick(now) {
    raf = 0;
    if (!targets.length) { phase = 'idle'; return; }

    let k;
    if (phase === 'breathe') {
      const t = now - breatheAt;
      const env = CFG.FADE_IN_MS > 0 ? Math.min(1, t / CFG.FADE_IN_MS) : 1;
      if (reduceMotion) {
        k = CFG.STILL_LEVEL * env;
      } else {
        // 0 から始まって 1.5秒で吸いきり、3秒で吐ききる余弦の山。
        const wave = (1 - Math.cos((2 * Math.PI * t) / CFG.BREATH_MS)) / 2;
        k = (CFG.GLOW_MIN + (CFG.GLOW_MAX - CFG.GLOW_MIN) * wave) * env;
      }
      lastK = k;
    } else if (phase === 'fade') {
      const p = Math.min(1, (now - fadeAt) / CFG.FADE_OUT_MS);
      const ease = 1 - Math.pow(1 - p, 3);
      k = fadeFrom * (1 - ease);
      if (p >= 1) { applyLevel(0); restore(); phase = 'idle'; return; }
    } else {
      applyLevel(0); restore(); return;
    }

    applyLevel(k);
    raf = requestAnimationFrame(tick);
  }

  function ensureLoop() {
    if (!raf) raf = requestAnimationFrame(tick);
  }

  /* ============================================================
     光り始める
     ============================================================ */
  function beginGlow() {
    waitTimer = null;
    if (!enabled || !armed || !bridge || !hasTHREE()) return;
    // 回している最中はマスが仮の親にぶら下がっていて位置が定まらない。
    // 少し待ってから測り直す（そのあいだ光らせない＝考える時間のまま）。
    if (bridge.isBusy && bridge.isBusy()) {
      waitTimer = setTimeout(beginGlow, CFG.RETRY_MS);
      return;
    }
    let info = null;
    try { info = collectTargets(armed.cfg); } catch (err) { info = null; }
    if (!info) return;

    restore();                     // 念のため前回の残りを戻してから
    targets = info.mats;
    showHalo(info);
    breatheAt = performance.now();
    phase = 'breathe';
    ensureLoop();
  }

  /* ============================================================
     消す
     soft = ふわっと引く（触れられたとき）
     hard = 即座に戻す（盤面の作り直しなど、マテリアルごと消えるとき）
     ============================================================ */
  function stopWait() {
    if (waitTimer) { clearTimeout(waitTimer); waitTimer = null; }
  }

  function softStop() {
    stopWait();
    if (phase === 'breathe') {
      fadeFrom = lastK;
      fadeAt = performance.now();
      phase = 'fade';
      ensureLoop();
    }
  }

  function hardStop() {
    stopWait();
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    applyLevel(0);
    restore();
    phase = 'idle';
  }

  /* ============================================================
     公開する入口
     ============================================================ */
  const API = {
    /* init3D() から1回だけ。cubeHelpBridge をそのまま渡してよい。 */
    attach: function (b) {
      if (!b || !b.cubies || !b.cubeGroup) return;
      bridge = b;
    },

    /* 次の1手を提示したときに呼ぶ。cfg は {axis, layers, dir}。
       left = 残り手数（見守りディレイの長さを決める）。 */
    arm: function (cfg, left, total) {
      softStop();
      if (!enabled || !cfg || !bridge) { armed = null; return; }
      armed = { cfg: cfg, left: (typeof left === 'number' ? left : 99), total: total };
      waitTimer = setTimeout(beginGlow, computeDelay(armed.left));
    },

    /* 案内をやめたとき（次の手へ進む・持ち替え案内・完成・ヘルプを閉じる）。 */
    cancel: function () {
      armed = null;
      softStop();
    },

    /* 盤面が作り直された・タブが裏に回った、など。 */
    reset: function () {
      armed = null;
      hardStop();
    },

    /* 触られた: 光は引くが、指示は保ったままディレイを測り直す。 */
    nudge: function () {
      if (!armed) { softStop(); return; }
      softStop();
      stopWait();
      waitTimer = setTimeout(beginGlow, computeDelay(armed.left));
    },

    setEnabled: function (v) {
      enabled = !!v;
      if (!enabled) { armed = null; hardStop(); }
    },

    config: CFG
  };

  global.HelpGlow = API;

  /* ============================================================
     キューブに触れたら即キャンセル
     ------------------------------------------------------------
     capture 段階・passive で拾うので、既存の操作（面をつかむ／背景を
     なぞって視点を回す）の邪魔は一切しない。パネルやボタンを触った
     ときは反応しないよう、キューブの表示領域の中だけを見る。
     ============================================================ */
  function onDown(e) {
    if (phase === 'idle' && !waitTimer) return;
    const t = e.target;
    if (!t || !t.closest) return;
    if (!t.closest('#canvas-container')) return;
    API.nudge();
  }
  document.addEventListener('pointerdown', onDown, { capture: true, passive: true });

  // 盤面が作り直されるとマテリアルごと入れ替わるので、必ず手を離す。
  global.addEventListener('cube-reset', () => API.reset());
  global.addEventListener('cube-help-abort', () => API.reset());

  // 裏に回っているあいだは光らせない（rAF も止まる）。戻ってきたら
  // その時点から測り直す＝いきなり光っている、という出方にならない。
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      const keep = armed;
      hardStop();
      armed = keep;
    } else if (armed) {
      API.nudge();
    }
  });
})(window);
