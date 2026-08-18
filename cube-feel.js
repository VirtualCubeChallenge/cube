/* ============================================================
   cube-feel.js — 競技用スピードキューブの「回し心地」を再現する
   アニメーション・ドライバ（磁力アシスト + マグレブ微振動）

   このファイルは index.html の状態管理・描画・UI には一切触らない。
   やることは3つだけ:
     1. 角度を時間で動かす関数（CubeFeel.play）を提供する
     2. 強さの設定値を保存/復元する（localStorage）
     3. 設定パネルにスライダー2本を差し込む（DOM挿入のみ）

   index.html 側は「requestAnimationFrame のループを CubeFeel.play に
   置き換える」だけでよい。呼ばれなければ何も起きないので、読み込んだ
   だけでは既存の挙動は変わらない。

   ★ 3フェーズの時間割（1手ぶん）
     ┌ drive ────────┬ snap ──┬ bounce ─┐
     0°            75°      90°   92→89→90°
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

  /* --- チューニング定数 -------------------------------------------------
     ここだけ触れば「回し心地」の効き幅を丸ごと変えられる。 */

  // 磁力が働きはじめる「残り角度」。0%で残り4°、100%で残り22°から吸い込む。
  // 90°の手回しなら 86° → 68° の間で吸い込み開始が動く（既定55%で約75°）。
  const ZONE_MIN_DEG = 4;
  const ZONE_MAX_DEG = 22;

  // 吸い込みに使う時間の割合。磁力が強いほど短く＝速く決まる。
  const SNAP_SHARE_WEAK = 0.34;
  const SNAP_SHARE_STRONG = 0.16;

  // マグレブの行き過ぎ量（最大）。実効の最初の山はこの約72%なので、
  // 4.2° → 90°に対して +3.0°（＝92度台）まで行き過ぎる。
  const AMP_MAX_DEG = 4.2;

  // 揺り返しの長さ（ミリ秒）と往復回数。短く、数十msで収める。
  const BOUNCE_MS_MIN = 45;
  const BOUNCE_MS_MAX = 150;
  const CYCLES_MIN = 1.5;
  const CYCLES_MAX = 1.95;

  /* --- 設定値 ---------------------------------------------------------- */

  let magnet = 55;   // 0-100 磁力の強さ
  let maglev = 35;   // 0-100 マグレブの反発力

  function clamp100(n) {
    n = Math.round(Number(n));
    if (!Number.isFinite(n)) return 0;
    return n < 0 ? 0 : (n > 100 ? 100 : n);
  }
  try {
    const m = localStorage.getItem(KEY_MAGNET);
    const b = localStorage.getItem(KEY_MAGLEV);
    if (m !== null) magnet = clamp100(m);
    if (b !== null) maglev = clamp100(b);
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

    const m = magnet / 100;
    const b = maglev / 100;

    // --- 磁力 ---
    // 磁力0のときは、従来どおり ease-out-cubic 一本（＝挙動が変わらない）。
    const useMagnet = m > 0.001 && dist > 1e-4;
    // 吸い込み区間は「残り角度」で決める。180°回しでも「最後の十数度」で
    // 吸い込むことになり、90°回しと同じ手触りになる。
    const zone = Math.min((ZONE_MIN_DEG + (ZONE_MAX_DEG - ZONE_MIN_DEG) * m) * DEG, dist * 0.45);
    const captureFrac = useMagnet ? (dist - zone) / dist : 1;
    const snapShare = SNAP_SHARE_WEAK - (SNAP_SHARE_WEAK - SNAP_SHARE_STRONG) * m;
    const driveDur = useMagnet ? D * (1 - snapShare) : D;
    const snapDur = useMagnet ? D * snapShare : 0;

    // --- マグレブ ---
    const scale = (opts.bounceScale == null) ? 1 : opts.bounceScale;
    const useBounce = (opts.bounce !== false) && b > 0.001 && !reduceMotion && !!opts.onBounce;
    const amp = AMP_MAX_DEG * DEG * b * scale;
    const bounceDur = BOUNCE_MS_MIN + (BOUNCE_MS_MAX - BOUNCE_MS_MIN) * b;
    const cycles = CYCLES_MIN + (CYCLES_MAX - CYCLES_MIN) * b;

    let raf = 0;
    let arrived = false;
    let done = false;
    let tBounce = 0;
    const t0 = (global.performance && performance.now) ? performance.now() : Date.now();

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
    get magnet() { return magnet; },
    get maglev() { return maglev; },
    set: function (nextMagnet, nextMaglev) {
      if (nextMagnet != null) magnet = clamp100(nextMagnet);
      if (nextMaglev != null) maglev = clamp100(nextMaglev);
      save();
    }
  };
  global.CubeFeel = CubeFeel;

  /* ============================================================
     多言語辞書の追記（既存 I18N は無改変。無いキーだけ足すマージ方式）
     ============================================================ */
  const FEEL_I18N = {
    ja: {
      feelSectionTitle: '回し心地（マグネット）',
      feelMagnetLabel: '磁力の強さ',
      feelMagnetHint: '90°の手前から磁石に吸い込まれるように残りを決めます（0でOFF）',
      feelMaglevLabel: 'マグレブの反発力',
      feelMaglevHint: '止まった瞬間に「ブルッ」とわずかに揺り返します（0でOFF）'
    },
    en: {
      feelSectionTitle: 'Turn feel (magnets)',
      feelMagnetLabel: 'Magnet strength',
      feelMagnetHint: 'Near 90°, the last few degrees snap home as if pulled in (0 = off)',
      feelMaglevLabel: 'MagLev bounce',
      feelMaglevHint: 'A tiny wobble the instant the turn lands (0 = off)'
    },
    'zh-CN': {
      feelSectionTitle: '手感（磁力）',
      feelMagnetLabel: '磁力强度',
      feelMagnetHint: '接近90°时像被磁铁吸住一样自动补完剩余角度（0为关闭）',
      feelMaglevLabel: '磁悬浮回弹',
      feelMaglevHint: '停下的瞬间轻微抖动一下（0为关闭）'
    },
    'zh-TW': {
      feelSectionTitle: '手感（磁力）',
      feelMagnetLabel: '磁力強度',
      feelMagnetHint: '接近90°時像被磁鐵吸住一樣自動補完剩下的角度（0為關閉）',
      feelMaglevLabel: '磁浮回彈',
      feelMaglevHint: '停下的瞬間會輕輕震一下（0為關閉）'
    },
    ko: {
      feelSectionTitle: '돌리는 느낌(자석)',
      feelMagnetLabel: '자력 세기',
      feelMagnetHint: '90°에 가까워지면 자석에 빨려들듯 남은 각도를 단숨에 채웁니다 (0이면 끔)',
      feelMaglevLabel: '마그레브 반발력',
      feelMaglevHint: '멈추는 순간 아주 살짝 떨림이 생깁니다 (0이면 끔)'
    },
    es: {
      feelSectionTitle: 'Sensación de giro (imanes)',
      feelMagnetLabel: 'Fuerza del imán',
      feelMagnetHint: 'Cerca de los 90°, los últimos grados se cierran como atraídos por un imán (0 = desactivado)',
      feelMaglevLabel: 'Rebote MagLev',
      feelMaglevHint: 'Un temblor mínimo justo al terminar el giro (0 = desactivado)'
    },
    id: {
      feelSectionTitle: 'Rasa putaran (magnet)',
      feelMagnetLabel: 'Kekuatan magnet',
      feelMagnetHint: 'Mendekati 90°, sisa sudutnya tertarik menutup seperti oleh magnet (0 = mati)',
      feelMaglevLabel: 'Pantulan MagLev',
      feelMaglevHint: 'Getaran kecil tepat saat putaran berhenti (0 = mati)'
    },
    ru: {
      feelSectionTitle: 'Ощущение вращения (магниты)',
      feelMagnetLabel: 'Сила магнита',
      feelMagnetHint: 'У 90° последние градусы дотягиваются, словно магнитом (0 — выкл.)',
      feelMaglevLabel: 'Отдача MagLev',
      feelMaglevHint: 'Едва заметная дрожь в момент остановки (0 — выкл.)'
    },
    'pt-BR': {
      feelSectionTitle: 'Sensação do giro (ímãs)',
      feelMagnetLabel: 'Força do ímã',
      feelMagnetHint: 'Perto dos 90°, os últimos graus fecham como se puxados por um ímã (0 = desligado)',
      feelMaglevLabel: 'Rebote MagLev',
      feelMaglevHint: 'Um tremor mínimo no instante em que o giro termina (0 = desligado)'
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
     設定パネルへのスライダー2本の差し込み
     既存の .size-row / .size-value / .size-slider / .settings-hint を
     そのまま使うので、style.css には手を入れなくてよい。
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

  function buildUI() {
    const anchor = document.getElementById('size-hint');
    if (!anchor || document.getElementById('feel-magnet-slider')) return;

    const wrap = document.createElement('div');
    wrap.id = 'feel-settings';
    wrap.innerHTML = [
      '<div class="size-row">',
      '  <span class="settings-toggle-label" data-i18n="feelMagnetLabel">磁力の強さ</span>',
      '  <span class="size-value" id="feel-magnet-value">55%</span>',
      '</div>',
      '<input type="range" id="feel-magnet-slider" class="size-slider" min="0" max="100" step="1"',
      '       data-i18n-aria="feelMagnetLabel" aria-label="磁力の強さ">',
      '<p class="settings-hint" id="feel-magnet-hint" data-i18n="feelMagnetHint"></p>',
      '<div class="size-row">',
      '  <span class="settings-toggle-label" data-i18n="feelMaglevLabel">マグレブの反発力</span>',
      '  <span class="size-value" id="feel-maglev-value">35%</span>',
      '</div>',
      '<input type="range" id="feel-maglev-slider" class="size-slider" min="0" max="100" step="1"',
      '       data-i18n-aria="feelMaglevLabel" aria-label="マグレブの反発力">',
      '<p class="settings-hint" id="feel-maglev-hint" data-i18n="feelMaglevHint"></p>'
    ].join('\n');
    anchor.insertAdjacentElement('afterend', wrap);

    const magSlider = wrap.querySelector('#feel-magnet-slider');
    const magValue = wrap.querySelector('#feel-magnet-value');
    const levSlider = wrap.querySelector('#feel-maglev-slider');
    const levValue = wrap.querySelector('#feel-maglev-value');

    const label = (n) => (n === 0 ? 'OFF' : n + '%');
    function paint() {
      magSlider.value = String(magnet);
      levSlider.value = String(maglev);
      magValue.textContent = label(magnet);
      levValue.textContent = label(maglev);
      wrap.querySelector('#feel-magnet-hint').textContent =
        tr('feelMagnetHint', '90°の手前から磁石に吸い込まれるように残りを決めます（0でOFF）');
      wrap.querySelector('#feel-maglev-hint').textContent =
        tr('feelMaglevHint', '止まった瞬間に「ブルッ」とわずかに揺り返します（0でOFF）');
      const magLabel = wrap.querySelector('[data-i18n="feelMagnetLabel"]');
      const levLabel = wrap.querySelector('[data-i18n="feelMaglevLabel"]');
      magLabel.textContent = tr('feelMagnetLabel', '磁力の強さ');
      levLabel.textContent = tr('feelMaglevLabel', 'マグレブの反発力');
    }
    paint();

    magSlider.addEventListener('input', () => {
      magnet = clamp100(magSlider.value);
      magValue.textContent = label(magnet);
      save();
    });
    levSlider.addEventListener('input', () => {
      maglev = clamp100(levSlider.value);
      levValue.textContent = label(maglev);
      save();
    });

    // 言語が切り替わったら文言を描き直す（applyI18n から呼ばれる）。
    if (typeof onI18n === 'function') onI18n(paint);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }
})(window);
