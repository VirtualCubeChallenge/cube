/* =====================================================================
   ranked-replay.js — 世界ランキング上位5人の「解き方」を1手ずつ見る
   ---------------------------------------------------------------------
   ランキングの 1〜5位の行にある立体キューブのボタンから開く。
   サーバーの GET /api/replay?rank=N（出題のスクランブルと、記録した手順）を
   受け取り、小さな3Dキューブで
     ・◀ ▶ で1手ずつ（回るアニメーションつき）
     ・▶ で実際のタイムどおりに再生（0.5x / 1x / 2x）
     ・つまみ・手順の一覧から好きな手へ飛ぶ
     ・ドラッグでキューブの向きを変える
   手順はキューブ自身の向きのまま記録しているので、記号（R・U' など）も
   「最初の向き（白が上・緑が前）から見たとき」の記号になる。
   キューブの模型はサーバーの src/cube.js と同じ（右手系で90°ずつ回す）。
   使い方: RankedReplay.open({ rank, api, tx, fmt })
   ===================================================================== */
(function (global) {
  'use strict';

  /* ------------------------------------------------ キューブの模型 -- */
  const FACE_NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  // 色の並びは R(+x) L(-x) U(+y) D(-y) F(+z) B(-z) 内側。記録に色が無い（2026-10-09 より前の）
  // ときはアプリの最初の配色で出す
  const DEFAULT_COLORS = ['#b71234', '#ff5800', '#ffffff', '#ffd500', '#009e60', '#0051ba', '#18181c'];
  function pickColors(list) {
    const ok = Array.isArray(list) && list.length === 7 && list.every(function (c) { return /^#[0-9a-f]{6}$/i.test(c); });
    return (ok ? list : DEFAULT_COLORS).map(function (c) { return parseInt(c.slice(1), 16); });
  }
  const MASK_LAYERS = { 1: [-1], 2: [0], 4: [1], 3: [-1, 0], 6: [0, 1], 7: [-1, 0, 1] };
  const FACE_TURN = { R: [0, 4, -1], L: [0, 1, 1], U: [1, 4, -1], D: [1, 1, 1], F: [2, 4, -1], B: [2, 1, 1] };
  // [軸][層] → [記号, 記号どおりの向き]
  const NAMES = {
    0: { 4: ['R', -1], 1: ['L', 1], 2: ['M', 1], 6: ['Rw', -1], 3: ['Lw', 1], 7: ['x', -1] },
    1: { 4: ['U', -1], 1: ['D', 1], 2: ['E', 1], 6: ['Uw', -1], 3: ['Dw', 1], 7: ['y', -1] },
    2: { 4: ['F', -1], 1: ['B', 1], 2: ['S', -1], 6: ['Fw', -1], 3: ['Bw', 1], 7: ['z', -1] }
  };

  function solvedStickers() {
    const s = [];
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      const p = [x, y, z];
      for (let f = 0; f < 6; f++) {
        const n = FACE_NORMALS[f];
        const a = n[0] !== 0 ? 0 : (n[1] !== 0 ? 1 : 2);
        if (p[a] === n[a]) s.push({ p: [x, y, z], n: n.slice(), c: f });
      }
    }
    return s;
  }
  function rot(v, axis, dir) {
    const x = v[0], y = v[1], z = v[2];
    if (axis === 0) return [x, -dir * z, dir * y];
    if (axis === 1) return [dir * z, y, -dir * x];
    return [-dir * y, dir * x, z];
  }
  function applyTurn(st, axis, mask, dir) {
    const layers = MASK_LAYERS[mask];
    for (let i = 0; i < st.length; i++) {
      if (layers.indexOf(st[i].p[axis]) < 0) continue;
      st[i].p = rot(st[i].p, axis, dir);
      st[i].n = rot(st[i].n, axis, dir);
    }
  }
  function notationToTurns(list) {
    const out = [];
    list.forEach(function (mv) {
      const base = FACE_TURN[mv[0]];
      if (!base) return;
      const suf = mv.slice(1);
      if (suf === "'") out.push([base[0], base[1], -base[2]]);
      else if (suf === '2') { out.push(base.slice()); out.push(base.slice()); }
      else out.push(base.slice());
    });
    return out;
  }
  function moveName(m) {
    const e = NAMES[m[0]] && NAMES[m[0]][m[1]];
    if (!e) return '?';
    return e[0] + (m[2] === e[1] ? '' : "'");
  }

  /* ------------------------------------------------------- 見た目 -- */
  const CSS = [
    '#rk-rp{position:fixed;inset:0;z-index:47;overflow-y:auto;-webkit-overflow-scrolling:touch;background:#0f0f13;color:#e8e8ee;',
    '  padding:calc(env(safe-area-inset-top,0px) + 16px) calc(env(safe-area-inset-right,0px) + 14px) calc(env(safe-area-inset-bottom,0px) + 20px) calc(env(safe-area-inset-left,0px) + 14px)}',
    '#rk-rp .rp-wrap{max-width:460px;margin:0 auto;position:relative}',
    '#rk-rp .rp-close{position:absolute;top:0;right:0;width:40px;height:40px;border-radius:50%;border:1px solid #3a3a48;',
    '  background:#1c1c22;color:#c8c8d4;font-size:17px;cursor:pointer;font-family:inherit}',
    '#rk-rp .rp-head{display:flex;align-items:center;gap:10px;margin:2px 50px 12px 0;min-height:40px}',
    '#rk-rp .rp-head .rk-pos{flex:none;min-width:30px}',
    '#rk-rp .rp-name{font-size:19px;font-weight:900;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '#rk-rp .rp-stats{font-size:12.5px;color:#9a9aac;margin-top:2px;font-variant-numeric:tabular-nums}',
    '#rk-rp .rp-stats b{color:#f0f0f6;font-size:14px}',
    '#rk-rp .rp-stage{position:relative;width:100%;aspect-ratio:1/1;max-height:52vh;margin:0 auto;border-radius:18px;overflow:hidden;',
    '  background:radial-gradient(circle at 50% 42%,#262633 0%,#15151c 70%);border:1px solid #2a2a35;touch-action:none;cursor:grab}',
    '#rk-rp .rp-stage canvas{display:block;width:100%!important;height:100%!important}',
    '#rk-rp .rp-home{position:absolute;right:10px;top:10px;width:38px;height:38px;border-radius:50%;border:1px solid #3a3a48;',
    '  background:rgba(20,20,26,.8);color:#c8c8d4;font-size:19px;line-height:1;cursor:pointer;z-index:2;font-family:inherit}',
    '#rk-rp .rp-hint{position:absolute;left:0;right:0;bottom:8px;text-align:center;font-size:11px;color:#7c7c8e;pointer-events:none;transition:opacity .4s}',
    '#rk-rp .rp-now{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin:12px 2px 4px}',
    '#rk-rp .rp-move{font-size:34px;font-weight:900;color:var(--tc,#2ef2c0);min-width:2.4em;letter-spacing:.02em}',
    '#rk-rp .rp-move.start{font-size:15px;color:#9a9aac;font-weight:800}',
    '#rk-rp .rp-count{font-size:13px;color:#9a9aac;font-variant-numeric:tabular-nums;text-align:right}',
    '#rk-rp .rp-count b{font-size:16px;color:#f0f0f6}',
    '#rk-rp .rp-range{width:100%;margin:4px 0 8px;accent-color:var(--tc,#2ef2c0)}',
    '#rk-rp .rp-ctl{display:flex;align-items:center;justify-content:center;gap:10px}',
    '#rk-rp .rp-btn{width:48px;height:48px;border-radius:50%;border:1px solid #3a3a48;background:#1c1c24;color:#e8e8ee;',
    '  font-size:17px;cursor:pointer;display:grid;place-items:center;font-family:inherit;transition:transform .1s}',
    '#rk-rp .rp-btn:active{transform:scale(.92)}',
    '#rk-rp .rp-btn.play{width:60px;height:60px;font-size:22px;background:var(--tc,#2ef2c0);color:#101014;border:none}',
    '#rk-rp .rp-btn svg{width:20px;height:20px;fill:currentColor}',
    '#rk-rp .rp-btn.play svg{width:26px;height:26px}',
    '#rk-rp .rp-speed{min-width:48px;height:34px;border-radius:999px;border:1px solid #3a3a48;background:#15151b;color:#c8c8d4;',
    '  font:inherit;font-size:12.5px;font-weight:800;cursor:pointer;margin-left:2px}',
    '#rk-rp .rp-card{background:#1c1c22;border:1px solid #2c2c38;border-radius:14px;padding:10px 12px;margin-top:12px}',
    '#rk-rp .rp-sec{font-size:11.5px;font-weight:800;letter-spacing:.06em;color:#8f8fa6;margin:0 0 6px}',
    '#rk-rp .rp-scr{font-size:13px;line-height:1.6;color:#c8c8d4;word-spacing:.18em;margin:0}',
    '#rk-rp .rp-list{display:flex;flex-wrap:wrap;gap:4px;max-height:30vh;overflow-y:auto;margin:0;padding:0;list-style:none}',
    '#rk-rp .rp-chip{min-width:34px;padding:5px 6px;border-radius:8px;border:1px solid #2c2c38;background:#15151b;color:#c8c8d4;',
    '  font:inherit;font-size:13px;font-weight:800;cursor:pointer;text-align:center;line-height:1.1}',
    '#rk-rp .rp-chip i{display:block;font-style:normal;font-size:9.5px;font-weight:600;color:#6f6f80;margin-top:1px;font-variant-numeric:tabular-nums}',
    '#rk-rp .rp-chip.done{color:#8a8a9c}',
    '#rk-rp .rp-chip.cur{background:var(--tc,#2ef2c0);color:#101014;border-color:transparent}',
    '#rk-rp .rp-chip.cur i{color:#103a30}',
    '#rk-rp .rp-msg{text-align:center;color:#9a9aac;font-size:13px;padding:40px 0}',
    /* ランキングの行のボタン（立体キューブのマーク） */
    '.rk-rp-btn{width:30px;height:30px;border-radius:9px;border:1px solid rgba(var(--tc-rgb,46,242,192),.45);',
    '  background:rgba(var(--tc-rgb,46,242,192),.10);color:var(--tc,#2ef2c0);display:grid;place-items:center;cursor:pointer;padding:0}',
    '.rk-rp-btn svg{width:18px;height:18px}',
    '.rk-rp-btn:active{transform:scale(.9)}'
  ].join('\n');

  // 立体キューブのマーク
  const CUBE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 2.8 20.5 7.4v9.2L12 21.2 3.5 16.6V7.4Z"/><path d="M3.5 7.4 12 12l8.5-4.6M12 12v9.2"/>' +
    '<path d="M7.75 5.1 16.25 9.7M16.25 5.1 7.75 9.7M7.75 9.7v9.2M16.25 9.7v9.2M3.5 12l8.5 4.6 8.5-4.6" stroke-width="1" opacity=".55"/></svg>';
  const ICON = {
    first: '<svg viewBox="0 0 24 24"><path d="M6 5h2v14H6zM20 5v14L9 12z"/></svg>',
    prev: '<svg viewBox="0 0 24 24"><path d="M17 5v14L6 12z"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15L19.5 12z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M6.5 5h4v14h-4zM13.5 5h4v14h-4z"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M7 5v14l11-7z"/></svg>',
    last: '<svg viewBox="0 0 24 24"><path d="M16 5h2v14h-2zM4 5v14l11-7z"/></svg>'
  };

  function injectCSS() {
    if (document.getElementById('rk-rp-style')) return;
    const st = document.createElement('style');
    st.id = 'rk-rp-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  /* ------------------------------------------------ 3Dキューブ -- */
  function makeView(container, colorList) {
    const COL = pickColors(colorList);
    const THREE = global.THREE;
    if (!THREE) return null;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 0, 12);
    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    const sun = new THREE.DirectionalLight(0xffffff, 0.55);
    sun.position.set(3, 6, 8);
    scene.add(sun);
    const root = new THREE.Group();
    root.rotation.order = 'XYZ';
    root.rotation.x = 0.52;
    root.rotation.y = -0.68;
    scene.add(root);

    const coreGeo = new THREE.BoxGeometry(0.98, 0.98, 0.98);
    const coreMat = new THREE.MeshLambertMaterial({ color: COL[6] });
    const cores = [];
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      const m = new THREE.Mesh(coreGeo, coreMat);
      m.position.set(x, y, z);
      m.userData.p = [x, y, z];
      root.add(m);
      cores.push(m);
    }
    const stGeo = new THREE.PlaneGeometry(0.93, 0.93);   // 黒い縁が細く見える大きさ
    const mats = COL.slice(0, 6).map(function (c) { return new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide }); });
    let model = solvedStickers();
    const stickers = model.map(function (s) { const m = new THREE.Mesh(stGeo, mats[s.c]); root.add(m); return m; });
    const Z = new THREE.Vector3(0, 0, 1), tmp = new THREE.Vector3();
    function place() {
      for (let i = 0; i < model.length; i++) {
        const s = model[i], m = stickers[i];
        m.position.set(s.p[0] + s.n[0] * 0.495, s.p[1] + s.n[1] * 0.495, s.p[2] + s.n[2] * 0.495);
        m.quaternion.setFromUnitVectors(Z, tmp.set(s.n[0], s.n[1], s.n[2]));
      }
      cores.forEach(function (c) { c.position.set(c.userData.p[0], c.userData.p[1], c.userData.p[2]); c.rotation.set(0, 0, 0); });
      dirty = true;
    }

    let dirty = true, anim = null, raf = 0, alive = true;
    function setModel(m) { finishAnim(); model.forEach(function (s, i) { s.p = m[i].p.slice(); s.n = m[i].n.slice(); }); place(); }
    function finishAnim() {
      if (!anim) return;
      const a = anim; anim = null;
      a.members.forEach(function (o) { root.attach(o); });
      root.remove(a.pivot);
      applyTurn(model, a.axis, a.mask, a.dir);
      place();
      if (a.done) a.done();
    }
    function turn(axis, mask, dir, ms, done) {
      finishAnim();
      const layers = MASK_LAYERS[mask];
      if (!layers) { if (done) done(); return; }
      const pivot = new THREE.Group();
      root.add(pivot);
      const members = [];
      model.forEach(function (s, i) { if (layers.indexOf(s.p[axis]) >= 0) members.push(stickers[i]); });
      cores.forEach(function (c) { if (layers.indexOf(c.userData.p[axis]) >= 0) members.push(c); });
      members.forEach(function (o) { pivot.attach(o); });
      anim = { pivot: pivot, members: members, axis: axis, mask: mask, dir: dir, t0: performance.now(), ms: Math.max(40, ms), done: done };
    }
    function resize() {
      const w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      dirty = true;
    }
    function loop() {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      if (anim) {
        const k = Math.min(1, (performance.now() - anim.t0) / anim.ms);
        const e = 1 - Math.pow(1 - k, 3);
        anim.pivot.rotation.set(0, 0, 0);
        anim.pivot.rotation[['x', 'y', 'z'][anim.axis]] = anim.dir * Math.PI / 2 * e;
        dirty = true;
        if (k >= 1) finishAnim();
      }
      spinTick();
      if (dirty) { renderer.render(scene, camera); dirty = false; }
    }

    // ドラッグで向きを変える
    let drag = null;
    const el = renderer.domElement;
    // なぞると、キューブ全体が縦・横に90°ずつ回る（持ち替え x / y と同じ）。何度でも回せるので360°どこからでも見られる。
    // 見る角度（斜め上から）は固定のまま、その中でキューブの向き ori だけを90°単位で変える
    const VIEW = root.quaternion.clone();
    const ori = new THREE.Quaternion(), oriFrom = new THREE.Quaternion(), oriTo = new THREE.Quaternion();
    const qStep = new THREE.Quaternion(), AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0);
    let spin = null;   // { t0, ms }
    function applyOri() { root.quaternion.copy(VIEW).multiply(ori); dirty = true; }
    function spinBy(axis, sign) {
      if (spin) { ori.copy(oriTo); spin = null; }
      oriFrom.copy(ori);
      qStep.setFromAxisAngle(axis, sign * Math.PI / 2);
      oriTo.copy(qStep).multiply(ori);
      spin = { t0: performance.now(), ms: 230 };
    }
    function spinTick() {
      if (!spin) return;
      const k = Math.min(1, (performance.now() - spin.t0) / spin.ms);
      const e = 1 - Math.pow(1 - k, 3);
      ori.copy(oriFrom).slerp(oriTo, e);
      applyOri();
      if (k >= 1) { ori.copy(oriTo); spin = null; applyOri(); }
    }
    el.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY, used: false }; try { el.setPointerCapture(e.pointerId); } catch (er) {} if (view.onDrag) view.onDrag(); });
    el.addEventListener('pointermove', function (e) {
      if (!drag || drag.used) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 26) return;
      drag.used = true;                                   // 1回なぞるごとに90°だけ
      if (Math.abs(dx) >= Math.abs(dy)) spinBy(AY, dx > 0 ? 1 : -1);   // 右へ → 前の面が右へ
      else spinBy(AX, dy > 0 ? 1 : -1);                                 // 下へ → 上の面が手前へ
    });
    const up = function () { drag = null; };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);

    resize();
    place();
    loop();
    const view = {
      resetView: function () { spin = null; ori.identity(); applyOri(); },
      setModel: setModel, turn: turn, finishAnim: finishAnim, resize: resize, busy: function () { return !!anim; },
      dispose: function () {
        alive = false;
        cancelAnimationFrame(raf);
        coreGeo.dispose(); stGeo.dispose(); coreMat.dispose(); mats.forEach(function (m) { m.dispose(); });
        renderer.dispose();
        try { renderer.forceContextLoss(); } catch (e) {}
      }
    };
    return view;
  }

  /* ------------------------------------------------------- 画面 -- */
  let cur = null;   // 開いている再生画面

  function close() {
    if (!cur) return;
    const c = cur; cur = null;
    clearTimeout(c.timer);
    if (c.view) c.view.dispose();
    global.removeEventListener('resize', c.onResize);
    document.removeEventListener('visibilitychange', c.onHide);
    document.removeEventListener('keydown', c.onKey, true);
    if (c.el.parentNode) c.el.parentNode.removeChild(c.el);
  }

  function open(opts) {
    injectCSS();
    close();
    const tx = opts.tx || function (k) { return k; };
    const fmt = opts.fmt || function (ms) { return (ms / 1000).toFixed(2); };
    const el = document.createElement('div');
    el.id = 'rk-rp';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML = '<div class="rp-wrap"><button type="button" class="rp-close" aria-label="✕">✕</button>' +
      '<div class="rp-msg">…</div></div>';
    document.body.appendChild(el);
    const c = { el: el, view: null, timer: 0, playing: false, speed: 1, i: 0 };
    cur = c;
    c.onResize = function () { if (c.view) c.view.resize(); };
    c.onHide = function () { if (document.hidden) stop(); };
    c.onKey = function (e) {
      if (cur !== c) return;
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); stop(); step(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); stop(); step(-1); }
      else if (e.key === ' ') { e.preventDefault(); toggle(); }
    };
    global.addEventListener('resize', c.onResize);
    document.addEventListener('visibilitychange', c.onHide);
    document.addEventListener('keydown', c.onKey, true);
    el.querySelector('.rp-close').addEventListener('click', close);

    opts.api('/api/replay?rank=' + encodeURIComponent(opts.rank)).then(function (r) {
      if (cur !== c) return;
      if (!r || !r.ok || !Array.isArray(r.moves)) {
        el.querySelector('.rp-msg').textContent = tx('rkErrOffline');
        return;
      }
      build(r);
    });

    function build(r) {
      c.data = r;
      const moves = r.moves.filter(function (m) { return Array.isArray(m) && MASK_LAYERS[m[1]] && (m[2] === 1 || m[2] === -1); });
      c.moves = moves;
      const n = moves.length;
      // 状態を前もって全部作っておく（どこへ飛んでもすぐ出せる）
      const base = solvedStickers();
      notationToTurns(String(r.scramble || '').split(' ').filter(Boolean)).forEach(function (t) { applyTurn(base, t[0], t[1], t[2]); });
      c.base = base;
      const t0 = n ? moves[0][3] : 0;
      const tps = r.timeMs > 0 ? (n / (r.timeMs / 1000)).toFixed(2) : '–';
      const medal = r.rank <= 3 ? ' m' + r.rank : '';
      const wrap = el.querySelector('.rp-wrap');
      wrap.innerHTML = '<button type="button" class="rp-close" aria-label="✕">✕</button>' +
        '<div class="rp-head"><span class="rk-pos' + medal + '">' + r.rank + '</span><div style="min-width:0">' +
          '<div class="rp-name">' + esc(r.nickname) + '</div>' +
          '<div class="rp-stats"><b>' + esc(fmt(r.timeMs)) + '</b> · ' + esc(tx('rkMoves', { n: n })) + ' · ' + tps + ' TPS</div></div></div>' +
        '<div class="rp-stage"><div class="rp-hint">' + esc(tx('rkReplayDrag')) + '</div>' +
          '<button type="button" class="rp-home" aria-label="⟲">⟲</button></div>' +
        '<div class="rp-now"><span class="rp-move"></span><span class="rp-count"></span></div>' +
        '<input class="rp-range" type="range" min="0" max="' + n + '" step="1" value="0" aria-label="' + esc(tx('rkReplayTitle')) + '">' +
        '<div class="rp-ctl">' +
          '<button type="button" class="rp-btn" data-a="first" aria-label="⏮">' + ICON.first + '</button>' +
          '<button type="button" class="rp-btn" data-a="prev" aria-label="◀">' + ICON.prev + '</button>' +
          '<button type="button" class="rp-btn play" data-a="play" aria-label="▶">' + ICON.play + '</button>' +
          '<button type="button" class="rp-btn" data-a="next" aria-label="▶">' + ICON.next + '</button>' +
          '<button type="button" class="rp-btn" data-a="last" aria-label="⏭">' + ICON.last + '</button>' +
          '<button type="button" class="rp-speed" data-a="speed">1x</button>' +
        '</div>' +
        '<div class="rp-card"><p class="rp-sec">' + esc(tx('rkReplayScramble')) + '</p><p class="rp-scr">' + esc(r.scramble || '') + '</p></div>' +
        '<div class="rp-card"><p class="rp-sec">' + esc(tx('rkReplayTitle')) + '</p><ol class="rp-list">' +
          moves.map(function (m, k) {
            return '<li><button type="button" class="rp-chip" data-k="' + (k + 1) + '">' + esc(moveName(m)) +
              '<i>' + ((m[3] - t0) / 1000).toFixed(2) + '</i></button></li>';
          }).join('') + '</ol></div>';
      wrap.querySelector('.rp-close').addEventListener('click', close);
      c.view = makeView(wrap.querySelector('.rp-stage'), r.colors);
      if (!c.view) { wrap.querySelector('.rp-stage').innerHTML = '<div class="rp-msg">3D ×</div>'; }
      else c.view.onDrag = function () { const h = wrap.querySelector('.rp-hint'); if (h) h.style.opacity = '0'; };
      const home = wrap.querySelector('.rp-home');
      if (home) home.addEventListener('click', function () { if (c.view) c.view.resetView(); });
      c.range = wrap.querySelector('.rp-range');
      c.chips = Array.prototype.slice.call(wrap.querySelectorAll('.rp-chip'));
      c.playBtn = wrap.querySelector('[data-a="play"]');
      c.speedBtn = wrap.querySelector('[data-a="speed"]');
      wrap.querySelector('.rp-ctl').addEventListener('click', function (e) {
        const b = e.target.closest('button');
        if (!b) return;
        const a = b.getAttribute('data-a');
        if (a === 'play') toggle();
        else if (a === 'speed') { c.speed = c.speed === 1 ? 2 : c.speed === 2 ? 0.5 : 1; c.speedBtn.textContent = c.speed + 'x'; }
        else { stop(); if (a === 'prev') step(-1); else if (a === 'next') step(1); else if (a === 'first') jump(0); else if (a === 'last') jump(n); }
      });
      c.range.addEventListener('input', function () { stop(); jump(parseInt(c.range.value, 10) || 0); });
      wrap.querySelector('.rp-list').addEventListener('click', function (e) {
        const b = e.target.closest('.rp-chip');
        if (!b) return;
        stop();
        jump(parseInt(b.getAttribute('data-k'), 10));
      });
      jump(0);
    }

    // k 手目まで進めた形を作る
    function stateAt(k) {
      const s = c.base.map(function (x) { return { p: x.p.slice(), n: x.n.slice(), c: x.c }; });
      for (let j = 0; j < k; j++) applyTurn(s, c.moves[j][0], c.moves[j][1], c.moves[j][2]);
      return s;
    }
    function show() {
      const n = c.moves.length, i = c.i;
      const mv = c.el.querySelector('.rp-move'), cnt = c.el.querySelector('.rp-count');
      if (i === 0) { mv.textContent = tx('rkReplayStartPos'); mv.classList.add('start'); }
      else { mv.textContent = moveName(c.moves[i - 1]); mv.classList.remove('start'); }
      const t = i === 0 ? 0 : (c.moves[i - 1][3] - c.moves[0][3]) / 1000;
      cnt.innerHTML = '<b>' + i + '</b> / ' + n + '<br>' + t.toFixed(2) + 's';
      c.range.value = String(i);
      c.chips.forEach(function (ch, k) {
        ch.classList.toggle('cur', k === i - 1);
        ch.classList.toggle('done', k < i - 1);
      });
      const curChip = c.chips[i - 1];
      if (curChip && curChip.scrollIntoView) {
        const list = curChip.closest('.rp-list');
        const top = curChip.offsetTop - list.offsetTop;
        if (top < list.scrollTop || top > list.scrollTop + list.clientHeight - 30) list.scrollTop = top - 40;
      }
    }
    function jump(k) {
      c.i = Math.max(0, Math.min(c.moves.length, k));
      if (c.view) c.view.setModel(stateAt(c.i));
      show();
    }
    function step(d, ms) {
      const n = c.moves.length;
      if (d > 0 && c.i < n) {
        const m = c.moves[c.i];
        c.i++;
        show();
        if (c.view) c.view.turn(m[0], m[1], m[2], ms || 170);
      } else if (d < 0 && c.i > 0) {
        c.i--;
        const m = c.moves[c.i];
        show();
        if (c.view) c.view.turn(m[0], m[1], -m[2], ms || 170);
      }
    }
    // 実際のタイムどおりに再生
    function play() {
      const n = c.moves.length;
      if (!n) return;
      if (c.i >= n) jump(0);
      c.playing = true;
      c.playBtn.innerHTML = ICON.pause;
      const tick = function () {
        if (!c.playing || cur !== c) return;
        if (c.i >= c.moves.length) { stop(); return; }
        const gap = c.i === 0 ? 400 : (c.moves[c.i][3] - c.moves[c.i - 1][3]) / c.speed;
        c.timer = setTimeout(function () {
          if (!c.playing || cur !== c) return;
          const g2 = c.i + 1 < c.moves.length ? (c.moves[c.i + 1][3] - c.moves[c.i][3]) / c.speed : 200;
          step(1, Math.max(50, Math.min(170, g2 * 0.9)));
          tick();
        }, Math.max(0, gap));
      };
      tick();
    }
    function stop() {
      if (!c.playing) return;
      c.playing = false;
      clearTimeout(c.timer);
      if (c.playBtn) c.playBtn.innerHTML = ICON.play;
    }
    function toggle() { if (c.playing) stop(); else play(); }
  }

  global.RankedReplay = { open: open, close: close, icon: CUBE_ICON, injectCSS: injectCSS, moveName: moveName };
})(window);
