/* ============================================================
   records-dash.js — 自己ベスト画面を「ダッシュボード」に作り直す
   ------------------------------------------------------------
   ドロワーの「🏆 記録」で開く #records-panel の中身を、この画面に差し替える。
   （元の一覧・ランクカードは隠すだけで消さない。このファイルの読み込みを
     やめれば、元の自己ベスト画面に戻る）

   ┌ タブ: ALL PB（全記録） / SIZE（サイズ別） / MOVES（最小手数）
   │       タップでも、一覧を左右になぞっても切り替わる。下にページの点
   ├ ヒーロー: 左にランクのバッジ＋次のランクまでの進み具合の輪
   │          右に CURRENT PB（ガイドなしの自己ベスト）と、直近20回のタイムの推移
   ├ 一覧: 1〜3位は金・銀・銅のメダル。右端に「Top ○%」
   │       （その記録が、これまでの自分のソルブ全体の上位何%か）
   ├ ガイドあり（ALL PB タブの下）: 使ったガイド（💡/OLL/ZBLL/PLL）をピルで
   └ 下: 閉じる（中央）・ゴミ箱（右下。押すたびに隅へ逃げる今までの確認のまま）

   データは index.html が window.__recordsBridge で渡す（records / sizeRecords /
   moveRecords と、タイムの書式・ヘルプのマーク）。描き直しは index.html の
   renderRecordsList() が呼ぶ（開いたとき・言語を変えたとき・全消去のあと）。
   ============================================================ */
(function (global) {
  'use strict';

  /* -------------------------------------------------------------- 文言 -- */
  // タブの英字（ALL PB / SIZE / MOVES）と CURRENT PB、Top ○% は全言語共通のデザインの文字。
  // ranked-texts.js と同じく、I18N に無いキーだけ足す。
  const TEXTS = {
    ja: {
      rdTabAllSub: '全記録', rdTabSizeSub: 'サイズ別', rdTabMovesSub: '最小手数',
      rdRecentN: '直近{n}回', rdTrendTitle: '直近{n}回の平均と、その前の{n}回の平均の差',
      rdTrendEmpty: 'ソルブを重ねると、ここにタイムの推移が出ます',
      rdAssist: 'ガイドあり', rdMore: 'さらに{n}件を表示'
    },
    en: {
      rdTabAllSub: 'All records', rdTabSizeSub: 'By size', rdTabMovesSub: 'Fewest moves',
      rdRecentN: 'Last {n} solves', rdTrendTitle: 'Average of the last {n} solves vs the {n} before',
      rdTrendEmpty: 'Keep solving to see your time trend here',
      rdAssist: 'With guides', rdMore: 'Show {n} more'
    },
    'zh-CN': {
      rdTabAllSub: '全部记录', rdTabSizeSub: '按尺寸', rdTabMovesSub: '最少步数',
      rdRecentN: '最近{n}次', rdTrendTitle: '最近{n}次的平均与之前{n}次平均的差',
      rdTrendEmpty: '多还原几次，这里就会显示成绩走势',
      rdAssist: '使用辅助', rdMore: '再显示{n}条'
    },
    'zh-TW': {
      rdTabAllSub: '全部紀錄', rdTabSizeSub: '依尺寸', rdTabMovesSub: '最少步數',
      rdRecentN: '最近{n}次', rdTrendTitle: '最近{n}次的平均與之前{n}次平均的差',
      rdTrendEmpty: '多還原幾次，這裡就會顯示成績走勢',
      rdAssist: '使用輔助', rdMore: '再顯示{n}筆'
    },
    ko: {
      rdTabAllSub: '전체 기록', rdTabSizeSub: '크기별', rdTabMovesSub: '최소 수',
      rdRecentN: '최근 {n}회', rdTrendTitle: '최근 {n}회 평균과 그 전 {n}회 평균의 차이',
      rdTrendEmpty: '솔브를 거듭하면 여기에 기록 추이가 나타납니다',
      rdAssist: '가이드 사용', rdMore: '{n}개 더 보기'
    },
    es: {
      rdTabAllSub: 'Todos', rdTabSizeSub: 'Por tamaño', rdTabMovesSub: 'Menos mov.',
      rdRecentN: 'Últimas {n}', rdTrendTitle: 'Promedio de las últimas {n} frente a las {n} anteriores',
      rdTrendEmpty: 'Sigue resolviendo para ver aquí la evolución de tus tiempos',
      rdAssist: 'Con guías', rdMore: 'Ver {n} más'
    },
    id: {
      rdTabAllSub: 'Semua', rdTabSizeSub: 'Per ukuran', rdTabMovesSub: 'Langkah min.',
      rdRecentN: '{n} terakhir', rdTrendTitle: 'Rata-rata {n} terakhir dibanding {n} sebelumnya',
      rdTrendEmpty: 'Terus selesaikan untuk melihat tren waktumu di sini',
      rdAssist: 'Dengan panduan', rdMore: 'Tampilkan {n} lagi'
    },
    ru: {
      rdTabAllSub: 'Все', rdTabSizeSub: 'По размеру', rdTabMovesSub: 'Мин. ходов',
      rdRecentN: 'Последние {n}', rdTrendTitle: 'Среднее за последние {n} сборок против {n} предыдущих',
      rdTrendEmpty: 'Собирайте дальше — здесь появится динамика ваших времён',
      rdAssist: 'С подсказками', rdMore: 'Ещё {n}'
    },
    'pt-BR': {
      rdTabAllSub: 'Todos', rdTabSizeSub: 'Por tamanho', rdTabMovesSub: 'Menos mov.',
      rdRecentN: 'Últimas {n}', rdTrendTitle: 'Média das últimas {n} comparada às {n} anteriores',
      rdTrendEmpty: 'Continue resolvendo para ver aqui a evolução dos seus tempos',
      rdAssist: 'Com ajuda', rdMore: 'Ver mais {n}'
    }
  };
  if (typeof I18N !== 'undefined' && I18N) {
    Object.keys(TEXTS).forEach(function (lang) {
      if (!I18N[lang]) I18N[lang] = {};
      Object.keys(TEXTS[lang]).forEach(function (k) {
        if (I18N[lang][k] === undefined) I18N[lang][k] = TEXTS[lang][k];
      });
    });
  }
  function tx(key, vars) {
    try {
      if (typeof global.t === 'function') {
        const s = global.t(key, vars);
        if (s) return s;
      }
    } catch (e) { /* 下の日本語に落とす */ }
    let s = (TEXTS.ja[key] !== undefined) ? TEXTS.ja[key] : key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* -------------------------------------------------------------- 見た目 -- */
  const CSS = [
    /* ---- 器：深いダークグレーのガラス。元の中身は隠す（消さない） ---- */
    '#records-overlay{background:#07080c}',
    '#records-panel.rd-on{width:min(94vw,420px);max-height:90vh;max-height:90dvh;padding:12px 12px 10px;',
    '  border-radius:24px;text-align:left;color:#e8ebf3;overflow:hidden;',
    '  background:radial-gradient(120% 60% at 0% 0%,rgba(0,229,255,.10),transparent 60%),',
    '    radial-gradient(90% 50% at 100% 100%,rgba(124,92,255,.10),transparent 60%),',
    '    linear-gradient(180deg,#1a1c23,#121318);',
    '  border:1px solid rgba(0,229,255,.18);',
    '  box-shadow:0 24px 60px rgba(0,0,0,.6),0 0 30px rgba(0,229,255,.08),inset 0 1px 0 rgba(255,255,255,.05);',
    '  -webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}',
    '#records-panel.rd-on > .records-panel-header,#records-panel.rd-on > .rank-card,#records-panel.rd-on > #records-best,',
    '#records-panel.rd-on > .settings-hint,#records-panel.rd-on > #records-list,#records-panel.rd-on > .records-subheading,',
    '#records-panel.rd-on > #records-best-assist,#records-panel.rd-on > #records-list-assist{display:none!important}',
    '.rd-root{flex:1;min-height:0;display:flex;flex-direction:column}',

    /* ---- タブ：選んでいるタブはネオンブルーの文字と下線（下線は1本を滑らせる） ---- */
    // 左右の隅はゴミ箱が逃げてくる場所なので空けておく
    '.rd-tabs{position:relative;display:grid;grid-template-columns:repeat(3,1fr);margin:2px 34px 0;',
    '  border-bottom:1px solid rgba(255,255,255,.07)}',
    '.rd-tab{background:none;border:none;padding:8px 2px 9px;cursor:pointer;color:#7d8396;font-family:inherit;',
    '  display:flex;flex-direction:column;align-items:center;gap:2px;-webkit-tap-highlight-color:transparent;',
    '  transition:color .2s ease}',
    '.rd-tab b{font-family:Orbitron,ui-monospace,monospace;font-size:13px;font-weight:800;letter-spacing:.08em;white-space:nowrap}',
    '.rd-tab small{font-size:10px;font-weight:700;letter-spacing:.02em;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}',
    '.rd-tab[aria-selected="true"]{color:#00e5ff}',
    '.rd-tab[aria-selected="true"] b{text-shadow:0 0 10px rgba(0,229,255,.65)}',
    '.rd-tab:focus{outline:none}.rd-tab:focus-visible{outline:2px solid #00e5ff;outline-offset:-2px;border-radius:8px}',
    '.rd-ink{position:absolute;left:0;bottom:-1px;width:33.333%;height:2px;pointer-events:none;',
    '  transition:transform .32s cubic-bezier(.3,.8,.3,1)}',
    '.rd-ink::before{content:"";position:absolute;left:22%;right:22%;top:0;bottom:0;border-radius:2px;',
    '  background:#00e5ff;box-shadow:0 0 8px #00e5ff,0 0 16px rgba(0,229,255,.6)}',
    // ページの点
    '.rd-dots{display:flex;justify-content:center;gap:6px;padding:8px 0 2px}',
    '.rd-dots i{width:6px;height:6px;border-radius:3px;background:rgba(255,255,255,.18);transition:transform .25s ease,background .25s ease}',
    '.rd-dots i.on{background:#00e5ff;transform:scaleX(2.2);box-shadow:0 0 6px rgba(0,229,255,.8)}',

    /* ---- スクロールする部分（ヒーロー＋一覧） ---- */
    '.rd-scroll{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;',
    '  padding:8px 2px 12px;scrollbar-width:thin;scrollbar-color:rgba(0,229,255,.25) transparent;touch-action:pan-y}',

    /* ---- ヒーロー ---- */
    '.rd-hero{display:grid;grid-template-columns:104px minmax(0,1fr);gap:12px;align-items:start;padding:14px 12px 12px;',
    '  border-radius:18px;background:linear-gradient(160deg,rgba(0,229,255,.07),rgba(255,255,255,.025) 60%);',
    '  border:1px solid rgba(0,229,255,.16);box-shadow:inset 0 1px 0 rgba(255,255,255,.05)}',
    '.rd-rank{display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0}',
    '.rd-ring{position:relative;width:92px;height:92px}',
    '.rd-ring svg{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg);overflow:visible}',
    '.rd-ring .trk{fill:none;stroke:rgba(255,255,255,.08);stroke-width:6}',
    '.rd-ring .prg{fill:none;stroke-width:6;stroke-linecap:round;filter:drop-shadow(0 0 4px rgba(0,229,255,.7));',
    '  transition:stroke-dashoffset .9s cubic-bezier(.3,.8,.3,1)}',
    '.rd-badge{position:absolute;inset:14px;border-radius:50%;display:flex;flex-direction:column;align-items:center;',
    '  justify-content:center;background:radial-gradient(circle at 50% 35%,var(--rk-main,#e8f6ff),var(--rk-deep,#5a7a90));',
    '  box-shadow:0 0 14px var(--rk-glow,rgba(0,229,255,.45)),inset 0 1px 2px rgba(255,255,255,.6),inset 0 -6px 12px rgba(0,0,0,.25)}',
    '.rd-badge small{font-family:Orbitron,ui-monospace,monospace;font-size:7.5px;font-weight:800;letter-spacing:.18em;opacity:.75}',
    '.rd-badge b{font-family:Orbitron,ui-monospace,monospace;font-size:24px;font-weight:900;line-height:1}',
    '.rd-badge.ink-dark{color:#14161d}.rd-badge.ink-light{color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.4)}',
    '.rd-badge.rainbow{background:conic-gradient(from 210deg,#ff5f6d,#ffc371,#8fff8f,#5fe3ff,#a98bff,#ff5fd2,#ff5f6d);color:#14161d}',
    '.rd-next{font-size:10.5px;font-weight:700;color:#9aa1b4;text-align:center;line-height:1.35}',
    '.rd-next b{color:#e8ebf3;font-variant-numeric:tabular-nums}',
    '.rd-pbbox{min-width:0;display:flex;flex-direction:column}',
    '.rd-pbl{font-family:Orbitron,ui-monospace,monospace;font-size:10px;font-weight:800;letter-spacing:.16em;color:#5fd9ee}',
    // CURRENT PB はいちばん目立たせる（数字がくっきり読める Outfit の太字＋強めの光）
    '.rd-pb{margin:0 0 4px;font-family:Outfit,system-ui,-apple-system,\"Segoe UI\",sans-serif;font-weight:800;line-height:1;letter-spacing:.01em;',
    '  font-size:clamp(32px,10.6vw,44px);color:#eaffff;white-space:nowrap;font-variant-numeric:tabular-nums;',
    '  text-shadow:0 0 6px #00e5ff,0 0 16px rgba(0,229,255,.85),0 0 34px rgba(0,229,255,.45)}',
    '.rd-pb.none{color:#4d5466;text-shadow:none}',
    // 推移のグラフ（1本の線。速いほど上）
    '.rd-chart{position:relative;height:46px;margin-top:2px;cursor:crosshair;touch-action:pan-y;outline:none}',
    '.rd-chart svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}',
    '.rd-chart .ln{fill:none;stroke:#00e5ff;stroke-width:2;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke;',
    '  filter:drop-shadow(0 0 3px rgba(0,229,255,.7))}',
    '.rd-chart .ar{fill:url(#rd-area)}',
    '.rd-dot{position:absolute;width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;pointer-events:none;',
    '  background:#00e5ff;box-shadow:0 0 0 2px #14161d,0 0 8px rgba(0,229,255,.9)}',
    '.rd-dot.pb{background:#ffd700;box-shadow:0 0 0 2px #14161d,0 0 8px rgba(255,215,0,.9)}',
    '.rd-cross{position:absolute;top:-2px;bottom:-2px;width:1px;margin-left:-.5px;background:rgba(255,255,255,.35);',
    '  pointer-events:none;opacity:0;transition:opacity .15s}',
    // 読み取りの札はグラフの下（上に出すと大きな PB の数字を隠すため）
    '.rd-tip{position:absolute;top:calc(100% + 4px);transform:translateX(-50%);padding:5px 8px;border-radius:8px;',
    '  background:rgba(12,14,20,.96);border:1px solid rgba(0,229,255,.35);white-space:nowrap;pointer-events:none;',
    '  opacity:0;transition:opacity .15s;z-index:2;text-align:center}',
    '.rd-tip b{display:block;font-family:Outfit,system-ui,-apple-system,\"Segoe UI\",sans-serif;font-size:13px;font-weight:800;color:#f2f5ff}',
    '.rd-tip span{display:block;font-size:10px;color:#9aa1b4}',
    '.rd-hov{opacity:0;background:#fff;box-shadow:0 0 0 2px #14161d,0 0 8px rgba(255,255,255,.8);transition:opacity .15s}',
    '.rd-chart.peek .rd-cross,.rd-chart.peek .rd-tip,.rd-chart.peek .rd-hov{opacity:1}',
    '.rd-cap{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-top:6px;font-size:11px;font-weight:700;color:#aeb4c5}',
    '.rd-delta{font-family:Outfit,system-ui,-apple-system,\"Segoe UI\",sans-serif;font-size:12px;font-weight:800;white-space:nowrap}',
    '.rd-delta.up{color:#4dffb0}.rd-delta.down{color:#ffbf80}.rd-delta.flat{color:#aeb4c5}',
    '.rd-empty-chart{display:flex;align-items:center;min-height:46px;font-size:11px;line-height:1.5;color:#7d8396}',

    /* ---- 一覧 ---- */
    '.rd-page{margin-top:12px}',
    '.rd-page.in-next{animation:rd-in-next .26s cubic-bezier(.2,.8,.3,1) both}',
    '.rd-page.in-prev{animation:rd-in-prev .26s cubic-bezier(.2,.8,.3,1) both}',
    '@keyframes rd-in-next{from{opacity:0;transform:translate3d(22px,0,0)}to{opacity:1;transform:none}}',
    '@keyframes rd-in-prev{from{opacity:0;transform:translate3d(-22px,0,0)}to{opacity:1;transform:none}}',
    '.rd-list{display:flex;flex-direction:column;gap:6px}',
    // 左：順位・タイム・（日付＋ガイド）／右：Top ○%。上下の余白は詰めて揃える
    '.rd-row{display:grid;grid-template-columns:36px minmax(0,1fr) auto;align-items:center;column-gap:10px;',
    '  padding:7px 12px 7px 8px;min-height:52px;box-sizing:border-box;border-radius:14px;background:rgba(255,255,255,.035);',
    '  border:1px solid rgba(255,255,255,.07);box-shadow:inset 0 1px 0 rgba(255,255,255,.035)}',
    '.rd-row.m1{border-color:rgba(255,215,0,.45);background:linear-gradient(90deg,rgba(255,215,0,.10),rgba(255,255,255,.03) 70%);',
    '  box-shadow:0 0 14px rgba(255,215,0,.12),inset 0 1px 0 rgba(255,255,255,.06)}',
    '.rd-row.m2{border-color:rgba(205,216,232,.38);background:linear-gradient(90deg,rgba(205,216,232,.08),rgba(255,255,255,.03) 70%)}',
    '.rd-row.m3{border-color:rgba(227,150,90,.40);background:linear-gradient(90deg,rgba(227,150,90,.09),rgba(255,255,255,.03) 70%)}',
    '.rd-rk{display:flex;justify-content:center;align-items:center}',
    '.rd-no{display:flex;justify-content:center;font-family:Outfit,system-ui,-apple-system,\"Segoe UI\",sans-serif;font-size:15px;font-weight:800;color:#8a90a3}',
    '.rd-medal{width:28px;height:28px;display:block}',
    '.rd-main{min-width:0}',
    '.rd-val{display:block;font-family:Outfit,system-ui,-apple-system,\"Segoe UI\",sans-serif;font-size:20px;font-weight:800;line-height:1.15;letter-spacing:.01em;',
    '  font-variant-numeric:tabular-nums;color:#eef1f8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.rd-val i{font-style:normal;font-family:system-ui,-apple-system,"Segoe UI","Hiragino Sans",sans-serif;font-size:11px;font-weight:800;margin-left:2px;opacity:.85}',
    '.rd-row.m1 .rd-val:not([class*="tr-"]){color:#ffd700;text-shadow:0 0 10px rgba(255,215,0,.45)}',
    '.rd-row.m2 .rd-val:not([class*="tr-"]){color:#dde5f0;text-shadow:0 0 8px rgba(221,229,240,.35)}',
    '.rd-row.m3 .rd-val:not([class*="tr-"]){color:#f0a868;text-shadow:0 0 8px rgba(240,168,104,.35)}',
    // SIZE / MOVES の色は前のランキング画面と同じ（数字もタイムも同じ色・同じ動き）
    //   サイズ: 1〜3% 虹 / 4〜15% 金 / 16〜20% 水色 / 150〜160% リラ / ほか 灰
    //   手数  : 〜25手 虹 / 〜45手 金 / 〜70手 水色 / 71手〜 灰
    '.rd-v1{display:flex;align-items:center;gap:8px;min-width:0}',
    // 手数の単位は虹色の文字に混ぜると見えにくいので、数字の外に落ち着いた色で
    '.rd-unit{flex:none;margin-left:-5px;font-size:11px;font-weight:800;color:#aeb4c5}',
    '.rd-bar{flex:none;width:58px;height:5px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden}',
    '.rd-bar i{display:block;height:100%;border-radius:3px}',
    '.rd-val.tr-rainbow{font-size:19px}',
    '.tr-rainbow{background:linear-gradient(90deg,#ff2d2d,#ff9d2d,#f6ff2d,#2dff5c,#2de0ff,#4a5bff,#d92dff,#ff2d2d);',
    '  background-size:300% 100%;-webkit-background-clip:text;background-clip:text;color:transparent!important;font-weight:700;',
    '  animation:size-rainbow-shift 1.4s linear infinite,size-rainbow-pulse .9s ease-in-out infinite}',
    '.tr-gold{color:#ffd700!important;font-weight:700;animation:size-gold-shine 1.2s ease-in-out infinite}',
    '.tr-cyan{color:#8fd9ff!important;font-weight:700;text-shadow:0 0 8px rgba(143,217,255,.55)}',
    '.tr-lilac{color:#c8a2ff!important;font-weight:700;text-shadow:0 0 8px rgba(200,162,255,.55)}',
    '.rd-val.tr-gray{color:#666!important}',
    '.tm.tr-gray{color:#aaa!important}',
    '.rd-meta{display:flex;align-items:center;flex-wrap:wrap;gap:3px 6px;margin-top:2px;font-size:11.5px;font-weight:600;color:#9aa0b2;',
    '  font-variant-numeric:tabular-nums}',
    '.rd-meta .tm{font-family:Outfit,system-ui,-apple-system,\"Segoe UI\",sans-serif;font-size:12.5px;font-weight:700;color:#c9cedb}',
    '.rd-pct{min-width:58px;text-align:right;font-family:Outfit,system-ui,-apple-system,\"Segoe UI\",sans-serif;font-size:13px;font-weight:800;white-space:nowrap;color:#38c8ff;',
    '  text-shadow:0 0 8px rgba(56,200,255,.35)}',
    '.rd-pct.gold{color:#ffd700;text-shadow:0 0 8px rgba(255,215,0,.45)}',
    // ガイドのピル：色は1色にしぼる。見出しの一覧（説明）は落ち着いた灰、その記録で使ったものだけネオンで光る
    '.rd-tag{display:inline-flex;align-items:center;justify-content:center;gap:3px;height:16px;padding:0 6px;border-radius:999px;',
    '  font-size:9px;font-weight:800;letter-spacing:.06em;line-height:1;color:#8a90a3;',
    '  border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.03)}',
    '.rd-tag svg{display:block}',
    '.rd-tag.on{color:#d8c9ff;border-color:rgba(176,140,255,.75);background:rgba(150,110,255,.14);',
    '  box-shadow:0 0 6px rgba(160,120,255,.45),inset 0 0 4px rgba(160,120,255,.25)}',
    '.rd-empty{padding:22px 10px;border-radius:14px;text-align:center;font-size:12.5px;color:#7d8396;',
    '  background:rgba(255,255,255,.025);border:1px dashed rgba(255,255,255,.1)}',
    '.rd-more{display:block;width:100%;margin-top:8px;min-height:40px;border-radius:12px;border:1px solid rgba(0,229,255,.3);',
    '  background:rgba(0,229,255,.06);color:#7fefff;font-family:inherit;font-size:12.5px;font-weight:800;cursor:pointer}',
    '.rd-more:active{transform:scale(.98)}',

    /* ---- ガイドあり ---- */
    '.rd-assist{margin-top:18px;padding:12px 10px 10px;border-radius:18px;background:rgba(124,92,255,.05);',
    '  border:1px solid rgba(160,130,255,.18)}',
    '.rd-assist-h{display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding:0 2px 10px}',
    '.rd-assist-h strong{font-size:13px;font-weight:800;color:#e3dcff;margin-right:2px}',
    '.rd-assist-pb{margin-left:auto;font-family:Outfit,system-ui,-apple-system,\"Segoe UI\",sans-serif;font-size:14px;font-weight:800;color:#c9b8ff;white-space:nowrap}',
    '.rd-assist .rd-row.m1 .rd-val{color:#ffd700}',

    /* ---- 下：閉じる（中央）とゴミ箱（右下） ---- */
    '#records-panel.rd-on .settings-actions{margin:8px 0 2px;padding:0;display:flex;justify-content:center}',
    '#records-panel.rd-on #records-close{min-width:150px;min-height:46px;border-radius:999px;font-weight:800;letter-spacing:.06em;',
    '  color:#e8ebf3;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.16);',
    '  box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 6px 18px rgba(0,0,0,.3);',
    '  -webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}',
    // ゴミ箱は控えめな赤。押すたびに右下 → 右上 → 左上 → 左下（確定）へ逃げる
    '#records-panel.rd-on #records-clear{width:34px;height:34px;left:auto;right:12px;top:auto;bottom:16px;',
    '  background:rgba(255,80,96,.08);border-color:rgba(255,80,96,.35);color:#ff6b7c}',
    '#records-panel.rd-on #records-clear:not(.stage-3){font-size:0}',
    '#records-panel.rd-on #records-clear:not(.stage-3)::before{content:"";width:16px;height:16px;background:currentColor;',
    '  -webkit-mask:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%23000%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpath d=%27M4 7h16M9 7V4.5h6V7M6.5 7l1 12.5h9l1-12.5M10 11v5.5M14 11v5.5%27/%3E%3C/svg%3E") center/contain no-repeat;',
    '  mask:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%23000%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpath d=%27M4 7h16M9 7V4.5h6V7M6.5 7l1 12.5h9l1-12.5M10 11v5.5M14 11v5.5%27/%3E%3C/svg%3E") center/contain no-repeat}',
    '#records-panel.rd-on #records-clear.stage-1{left:auto;right:12px;top:12px;bottom:auto;background:rgba(255,80,96,.18)}',
    '#records-panel.rd-on #records-clear.stage-2{left:12px;right:auto;top:12px;bottom:auto;background:rgba(255,80,96,.28)}',
    '#records-panel.rd-on #records-clear.stage-3{left:12px;right:auto;top:auto;bottom:16px;width:auto;padding:0 10px;',
    '  border-radius:17px;background:rgba(255,40,60,.45);border-color:#ff2b45;color:#fff;font-size:12px;font-weight:800}',

    /* ---- 狭い画面 ---- */
    '@media (max-width:360px){.rd-hero{grid-template-columns:86px minmax(0,1fr);gap:10px;padding:12px 10px 10px}',
    '  .rd-ring{width:78px;height:78px}.rd-badge{inset:12px}.rd-badge b{font-size:20px}',
    '  .rd-tabs{margin:2px 30px 0}.rd-tab b{font-size:11.5px}.rd-tab small{font-size:9px}',
    '  .rd-row{grid-template-columns:34px minmax(0,1fr) auto;padding:8px 10px 8px 6px}.rd-medal{width:26px;height:26px}}',
    '@media (prefers-reduced-motion:reduce){.rd-page.in-next,.rd-page.in-prev{animation:none}',
    '  .rd-ink,.rd-ring .prg,.rd-dots i{transition:none}.tr-rainbow,.tr-gold{animation:none}}'
  ].join('\n');

  function injectCSS() {
    if (document.getElementById('records-dash-style')) return;
    const st = document.createElement('style');
    st.id = 'records-dash-style';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  /* ---------------------------------------------------------- 部品の絵 -- */
  const MEDAL = {
    1: ['#fff6b8', '#ffd700', '#a87b00', '#3a2a00'],
    2: ['#ffffff', '#cfd8e6', '#7d8aa0', '#1e2430'],
    3: ['#ffd9b8', '#e3965a', '#8a4a1c', '#2e1606']
  };
  function medalSvg(n) {
    const c = MEDAL[n];
    const id = 'rdm' + n;
    return '<svg class="rd-medal" viewBox="0 0 32 32" aria-hidden="true">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="' + c[0] + '"/><stop offset=".55" stop-color="' + c[1] + '"/><stop offset="1" stop-color="' + c[2] + '"/>' +
      '</linearGradient></defs>' +
      // リボン
      '<path d="M10 2h5l-2.5 9H8z" fill="' + (n === 1 ? '#2f7bff' : n === 2 ? '#7b5cff' : '#ff5a7a') + '" opacity=".9"/>' +
      '<path d="M17 2h5l-.5 9h-4.5z" fill="' + (n === 1 ? '#ff4d6d' : n === 2 ? '#36c6ff' : '#ffb340') + '" opacity=".9"/>' +
      '<circle cx="16" cy="19.5" r="10.5" fill="url(#' + id + ')"/>' +
      '<circle cx="16" cy="19.5" r="7.6" fill="none" stroke="' + c[2] + '" stroke-opacity=".55" stroke-width="1"/>' +
      '<path d="M9.5 15.5a8 8 0 0 1 6-4" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.3" stroke-linecap="round"/>' +
      '<text x="16" y="23.4" text-anchor="middle" font-family="Orbitron,ui-monospace,monospace" font-size="11" font-weight="900" fill="' + c[3] + '">' + n + '</text>' +
      '</svg>';
  }
  function rankCell(i) {
    return i < 3 ? medalSvg(i + 1) : '<span class="rd-no">' + (i + 1) + '</span>';
  }
  function tagsHtml(r, helpSvg) {
    return (r.help ? '<span class="rd-tag on" title="💡">' + helpSvg(10) + '</span>' : '') +
      (r.oll ? '<span class="rd-tag on">OLL</span>' : '') +
      (r.zbll ? '<span class="rd-tag on">ZBLL</span>' : '') +
      (r.pll ? '<span class="rd-tag on">PLL</span>' : '');
  }
  function dateLabel(at) {
    const d = new Date(at);
    if (isNaN(d)) return '';
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function usedGuide(r) { return !!(r.oll || r.pll || r.zbll || r.help); }
  // サイズの色の区切りは今までのランキングと同じ（1〜3%虹 / 〜15%金 / 〜20%水色 / 150%〜リラ / ほか灰）
  function sizeTier(n) {
    if (n <= 3) return 'tr-rainbow';
    if (n <= 15) return 'tr-gold';
    if (n <= 20) return 'tr-cyan';
    if (n >= 150) return 'tr-lilac';
    return 'tr-gray';
  }
  // 手数の色の区切りも前の最小手数ランキングと同じ（〜25手虹 / 〜45手金 / 〜70手水色 / 71手〜灰）
  function moveTier(n) {
    if (n <= 25) return 'tr-rainbow';
    if (n <= 45) return 'tr-gold';
    if (n <= 70) return 'tr-cyan';
    return 'tr-gray';
  }
  const BAR_COLOR = {
    'tr-rainbow': 'linear-gradient(90deg,#ff2d2d,#ff9d2d,#f6ff2d,#2dff5c,#2de0ff,#4a5bff,#d92dff)',
    'tr-gold': '#ffd700', 'tr-cyan': '#8fd9ff', 'tr-lilac': '#c8a2ff', 'tr-gray': '#666'
  };
  // 前のランキングと同じ横棒（サイズは160%、手数は100手で満タン）
  function barHtml(tier, frac) {
    const w = Math.min(100, Math.max(3, frac * 100));
    return '<span class="rd-bar"><i style="width:' + w.toFixed(1) + '%;background:' + BAR_COLOR[tier] + '"></i></span>';
  }

  /* ------------------------------------------------------------ 数の準備 -- */
  // 「上位 ○%」の母数にする、これまでのソルブ全部。
  // records（速い順50件）・sizeRecords（サイズ順）・moveRecords（手数順）は同じソルブを
  // 重ねて持っているので、日時とタイムで1つにまとめる。
  function allSolves(d) {
    const seen = Object.create(null);
    const out = [];
    [d.records, d.size, d.moves].forEach(function (list) {
      (list || []).forEach(function (r) {
        if (!r || typeof r.ms !== 'number') return;
        const k = (r.at || '') + '|' + r.ms;
        if (seen[k]) return;
        seen[k] = 1;
        out.push(r);
      });
    });
    return out;
  }
  // 速い順に並んだタイムの配列の中で、ms より速いものが何件あるか
  function countFaster(sorted, ms) {
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < ms) lo = mid + 1; else hi = mid; }
    return lo;
  }
  const PCT_MIN_POOL = 10;   // ソルブがこれより少ないうちは「Top ○%」を出さない（数が粗すぎるため）
  function pctHtml(pos, total) {
    if (total < PCT_MIN_POOL) return '<span></span>';
    const p = Math.min(100, Math.max(1, Math.ceil((pos + 1) / total * 100)));
    return '<span class="rd-pct' + (p <= 5 ? ' gold' : '') + '">Top ' + p + '%</span>';
  }

  /* ---------------------------------------------------------------- 状態 -- */
  const TABS = ['all', 'size', 'moves'];
  const CHUNK = 100;           // SIZE / MOVES は記録が多いので、100件ずつ出す
  let tab = 0;
  let shown = { size: CHUNK, moves: CHUNK };
  let root = null, scrollEl = null, pageEl = null, heroEl = null;
  let built = false;

  function bridge() { return global.__recordsBridge || null; }

  function build() {
    const panel = document.getElementById('records-panel');
    if (!panel || !bridge()) return false;
    injectCSS();
    if (built && root && root.parentNode === panel) return true;
    panel.classList.add('rd-on');
    root = document.createElement('div');
    root.className = 'rd-root';
    root.innerHTML =
      '<div class="rd-tabs" role="tablist">' +
        TABS.map(function (k, i) {
          return '<button type="button" class="rd-tab" role="tab" data-i="' + i + '" id="rd-tab-' + k + '" aria-controls="rd-page">' +
            '<b>' + (k === 'all' ? 'ALL PB' : k === 'size' ? 'SIZE' : 'MOVES') + '</b><small></small></button>';
        }).join('') +
        '<span class="rd-ink" aria-hidden="true"></span>' +
      '</div>' +
      '<div class="rd-dots" aria-hidden="true"><i></i><i></i><i></i></div>' +
      '<div class="rd-scroll">' +
        '<section class="rd-hero"></section>' +
        '<div class="rd-page" id="rd-page" role="tabpanel"></div>' +
      '</div>';
    const actions = panel.querySelector('.settings-actions');
    panel.insertBefore(root, actions || null);
    scrollEl = root.querySelector('.rd-scroll');
    pageEl = root.querySelector('.rd-page');
    heroEl = root.querySelector('.rd-hero');

    root.querySelector('.rd-tabs').addEventListener('click', function (e) {
      const b = e.target.closest('.rd-tab');
      if (b) go(parseInt(b.dataset.i, 10));
    });
    pageEl.addEventListener('click', function (e) {
      const m = e.target.closest('.rd-more');
      if (!m) return;
      const k = m.dataset.k;
      shown[k] += CHUNK;
      renderPage(0);
    });
    bindSwipe();
    document.addEventListener('keydown', function (e) {
      const ov = document.getElementById('records-overlay');
      if (!ov || !ov.classList.contains('show')) return;
      if (e.key === 'ArrowRight') { go(tab + 1); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { go(tab - 1); e.preventDefault(); }
    });
    built = true;
    return true;
  }

  // 一覧を左右になぞってもタブが変わる（縦のスクロールとは、最初に動いた向きで見分ける）
  function bindSwipe() {
    let sx = 0, sy = 0, tracking = false, horiz = false;
    scrollEl.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1 || e.target.closest('.rd-chart')) { tracking = false; return; }
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; tracking = true; horiz = false;
    }, { passive: true });
    scrollEl.addEventListener('touchmove', function (e) {
      if (!tracking || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
      if (!horiz && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.2) horiz = true;
      if (horiz && e.cancelable) e.preventDefault();
    }, { passive: false });
    scrollEl.addEventListener('touchend', function (e) {
      if (!tracking) return;
      tracking = false;
      if (!horiz) return;
      const dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) < 44) return;
      go(tab + (dx < 0 ? 1 : -1));
    });
    scrollEl.addEventListener('touchcancel', function () { tracking = false; horiz = false; });
  }

  function go(i) {
    const next = Math.max(0, Math.min(TABS.length - 1, i));
    if (next === tab) return;
    const dir = next > tab ? 1 : -1;
    tab = next;
    paintTabs();
    // 一覧がヒーローより下までスクロールしていたら、一覧の頭に合わせる
    if (scrollEl && heroEl && scrollEl.scrollTop > heroEl.offsetTop + heroEl.offsetHeight) {
      scrollEl.scrollTop = heroEl.offsetTop + heroEl.offsetHeight;
    }
    renderPage(dir);
  }

  function paintTabs() {
    if (!root) return;
    root.querySelectorAll('.rd-tab').forEach(function (b, i) {
      const on = i === tab;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      b.querySelector('small').textContent = tx(i === 0 ? 'rdTabAllSub' : i === 1 ? 'rdTabSizeSub' : 'rdTabMovesSub');
    });
    root.querySelector('.rd-ink').style.transform = 'translateX(' + (tab * 100) + '%)';
    root.querySelectorAll('.rd-dots i').forEach(function (d, i) { d.classList.toggle('on', i === tab); });
    pageEl.setAttribute('aria-labelledby', 'rd-tab-' + TABS[tab]);
  }

  /* ---------------------------------------------------------- ヒーロー -- */
  function renderHero(d, pool) {
    const B = bridge();
    // ランク（RankSystem が無いときは出さない）
    let rankHtml = '';
    const RS = global.RankSystem;
    if (RS && typeof RS.get === 'function') {
      const s = RS.get();
      const maxed = s.rank >= RS.CFG.MAX_RANK;
      const frac = maxed ? 1 : Math.max(0, Math.min(1, s.exp / s.need));
      const c = RS.rankColor(s.rank);
      const C = 2 * Math.PI * 40;
      const next = maxed ? esc(tx('rankMax'))
        : esc(tx('rankNext', { n: '\u0000' })).replace('\u0000', '<b>' + Number(s.need - s.exp).toLocaleString('en-US') + '</b>');
      rankHtml =
        '<div class="rd-rank">' +
          '<div class="rd-ring" role="img" aria-label="' + esc(tx('rankTitle')) + ' ' + s.rank + '">' +
            '<svg viewBox="0 0 92 92" aria-hidden="true"><defs>' +
              '<linearGradient id="rd-ring-g" x1="0" y1="0" x2="1" y2="1">' +
                (c.rainbow
                  ? '<stop offset="0" stop-color="#ff5f6d"/><stop offset=".35" stop-color="#ffc371"/><stop offset=".65" stop-color="#5fe3ff"/><stop offset="1" stop-color="#a98bff"/>'
                  : '<stop offset="0" stop-color="#00e5ff"/><stop offset="1" stop-color="' + c.main + '"/>') +
              '</linearGradient></defs>' +
              '<circle class="trk" cx="46" cy="46" r="40"/>' +
              '<circle class="prg" cx="46" cy="46" r="40" stroke="url(#rd-ring-g)" stroke-dasharray="' + C.toFixed(2) + '" ' +
                'stroke-dashoffset="' + (C * (1 - frac)).toFixed(2) + '"/>' +
            '</svg>' +
            '<div class="rd-badge ' + (c.rainbow ? 'rainbow' : c.lightInk ? 'ink-light' : 'ink-dark') + '" ' +
              'style="--rk-main:' + c.main + ';--rk-deep:' + c.deep + ';--rk-glow:' + c.glow + '">' +
              '<small>RANK</small><b>' + s.rank + '</b></div>' +
          '</div>' +
          '<div class="rd-next">' + next + '</div>' +
        '</div>';
    }

    // CURRENT PB（ガイドなしの自己ベスト）と、直近のタイムの推移
    const pure = d.records.filter(function (r) { return !usedGuide(r); });
    const pb = pure.length ? B.formatTime(pure[0].ms) : '--:--.--';
    const recent = pool.filter(function (r) { return !usedGuide(r); })
      .slice().sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); })
      .slice(-20);

    heroEl.innerHTML = rankHtml +
      '<div class="rd-pbbox">' +
        '<span class="rd-pbl">CURRENT PB:</span>' +
        '<span class="rd-pb' + (pure.length ? '' : ' none') + '">' + esc(pb) + '</span>' +
        chartHtml(recent) +
      '</div>';
    heroEl.style.gridTemplateColumns = rankHtml ? '' : '1fr';
    bindChart(recent);
  }

  // 1本の線。速いほど上。最新の点はネオンブルー、この中でいちばん速い点は金
  let chartYs = [];
  function chartHtml(list) {
    if (list.length < 2) return '<div class="rd-empty-chart">' + esc(tx('rdTrendEmpty')) + '</div>';
    const ms = list.map(function (r) { return r.ms; });
    const lo = Math.min.apply(null, ms), hi = Math.max.apply(null, ms);
    const span = hi - lo || 1;
    const pts = ms.map(function (v, i) {
      const x = list.length === 1 ? 50 : (i / (list.length - 1)) * 100;
      const y = hi === lo ? 50 : 8 + (v - lo) / span * 84;   // 上下に少し余白
      return [x, y];
    });
    const line = 'M' + pts.map(function (p) { return p[0].toFixed(2) + ' ' + p[1].toFixed(2); }).join('L');
    const area = line + 'L100 100L0 100Z';
    const best = ms.indexOf(lo), last = pts.length - 1;
    // 直近と、その前の平均の差（速くなっていれば ▲）
    const n = Math.min(5, Math.floor(list.length / 2));
    let delta = '';
    if (n >= 2) {
      const avg = function (a) { return a.reduce(function (s, v) { return s + v; }, 0) / a.length; };
      const diff = avg(ms.slice(-2 * n, -n)) - avg(ms.slice(-n));
      const abs = Math.abs(diff) / 1000;
      const txt = (abs >= 60 ? Math.floor(abs / 60) + ':' + String((abs % 60).toFixed(2)).padStart(5, '0') : abs.toFixed(2)) + 's';
      const cls = diff > 5 ? 'up' : diff < -5 ? 'down' : 'flat';
      delta = '<span class="rd-delta ' + cls + '" title="' + esc(tx('rdTrendTitle', { n: n })) + '">' +
        (cls === 'up' ? '▲ ' : cls === 'down' ? '▼ ' : '± ') + txt + '</span>';
    }
    chartYs = pts.map(function (p) { return p[1]; });
    return '<div class="rd-chart" tabindex="0" role="img" aria-label="' + esc(tx('rdRecentN', { n: list.length })) + '">' +
        '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs>' +
          '<linearGradient id="rd-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#00e5ff" stop-opacity=".22"/>' +
          '<stop offset="1" stop-color="#00e5ff" stop-opacity="0"/></linearGradient></defs>' +
          '<path class="ar" d="' + area + '"/><path class="ln" d="' + line + '"/></svg>' +
        (best !== last ? '<span class="rd-dot pb" style="left:' + pts[best][0] + '%;top:' + pts[best][1] + '%"></span>' : '') +
        '<span class="rd-dot' + (best === last ? ' pb' : '') + '" style="left:' + pts[last][0] + '%;top:' + pts[last][1] + '%"></span>' +
        '<span class="rd-cross"></span><span class="rd-dot rd-hov"></span><span class="rd-tip"><b></b><span></span></span>' +
      '</div>' +
      '<div class="rd-cap"><span>' + esc(tx('rdRecentN', { n: list.length })) + '</span>' + delta + '</div>';
  }

  // 指で触れた（マウスを乗せた）ところのいちばん近い回のタイムを出す
  function bindChart(list) {
    const el = heroEl.querySelector('.rd-chart');
    if (!el || list.length < 2) return;
    const B = bridge();
    const cross = el.querySelector('.rd-cross'), tip = el.querySelector('.rd-tip'), hov = el.querySelector('.rd-hov');
    let hideT = 0;
    function show(i) {
      const x = (i / (list.length - 1)) * 100;
      cross.style.left = x + '%';
      hov.style.left = x + '%';
      hov.style.top = (chartYs[i] || 50) + '%';
      tip.style.left = Math.min(82, Math.max(18, x)) + '%';
      tip.querySelector('b').textContent = B.formatTime(list[i].ms);
      tip.querySelector('span').textContent = dateLabel(list[i].at);
      el.classList.add('peek');
      clearTimeout(hideT);
    }
    function at(clientX) {
      const r = el.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      return Math.round(f * (list.length - 1));
    }
    function hideSoon() { clearTimeout(hideT); hideT = setTimeout(function () { el.classList.remove('peek'); }, 1400); }
    el.addEventListener('pointerdown', function (e) { show(at(e.clientX)); });
    el.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'mouse' || e.buttons) show(at(e.clientX));
    });
    el.addEventListener('pointerup', hideSoon);
    el.addEventListener('pointerleave', hideSoon);
    el.addEventListener('pointercancel', hideSoon);
    el.addEventListener('focus', function () { show(list.length - 1); });
    el.addEventListener('blur', hideSoon);
  }

  /* -------------------------------------------------------------- 一覧 -- */
  function rowHtml(i, mainHtml, metaHtml, pct, extraCls) {
    return '<div class="rd-row' + (i < 3 ? ' m' + (i + 1) : '') + (extraCls || '') + '">' +
      '<span class="rd-rk">' + rankCell(i) + '</span>' +
      '<span class="rd-main">' + mainHtml + (metaHtml ? '<span class="rd-meta">' + metaHtml + '</span>' : '') + '</span>' +
      pct + '</div>';
  }

  function renderPage(dir) {
    const B = bridge();
    if (!B || !pageEl) return;
    const d = B.data();
    const pool = allSolves(d);
    let html = '';
    if (tab === 0) {
      // ALL PB: ガイドなしの記録（速い順）。Top ○% は、ガイドなしのソルブ全部の中での位置
      const purePool = pool.filter(function (r) { return !usedGuide(r); }).map(function (r) { return r.ms; }).sort(function (a, b) { return a - b; });
      const pure = d.records.filter(function (r) { return !usedGuide(r); });
      html += pure.length
        ? '<div class="rd-list">' + pure.map(function (r, i) {
            return rowHtml(i, '<span class="rd-val">' + esc(B.formatTime(r.ms)) + '</span>',
              '<span>' + esc(dateLabel(r.at)) + '</span>', pctHtml(countFaster(purePool, r.ms), purePool.length));
          }).join('') + '</div>'
        : '<div class="rd-empty">' + esc(tx('noRecords')) + '</div>';
      // ガイドあり
      const asPool = pool.filter(usedGuide).map(function (r) { return r.ms; }).sort(function (a, b) { return a - b; });
      const assist = d.records.filter(usedGuide);
      html += '<section class="rd-assist">' +
        '<div class="rd-assist-h"><strong>' + esc(tx('rdAssist')) + '</strong>' +
          '<span class="rd-tag">' + B.helpMarkSvg(10) + '</span><span class="rd-tag">OLL</span>' +
          '<span class="rd-tag">ZBLL</span><span class="rd-tag">PLL</span>' +
          '<span class="rd-assist-pb">PB: ' + esc(assist.length ? B.formatTime(assist[0].ms) : '--:--.--') + '</span>' +
        '</div>' +
        (assist.length
          ? '<div class="rd-list">' + assist.map(function (r, i) {
              return rowHtml(i, '<span class="rd-val">' + esc(B.formatTime(r.ms)) + '</span>',
                '<span>' + esc(dateLabel(r.at)) + '</span>' + tagsHtml(r, B.helpMarkSvg), pctHtml(countFaster(asPool, r.ms), asPool.length));
            }).join('') + '</div>'
          : '<div class="rd-empty">' + esc(tx('noAssistRecords')) + '</div>') +
        '</section>';
    } else {
      const k = tab === 1 ? 'size' : 'moves';
      const list = (k === 'size' ? d.size : d.moves) || [];
      if (!list.length) {
        html = '<div class="rd-empty">' + esc(tx('noRecords')) + '</div>';
      } else {
        // 同じサイズ（手数）は同じ順位の％にする（並びは小さい順＝上位）
        const firstIdx = Object.create(null);
        list.forEach(function (r, i) { const v = k === 'size' ? r.size : r.moves; if (firstIdx[v] === undefined) firstIdx[v] = i; });
        const n = Math.min(shown[k], list.length);
        const unit = tx('statsMovesUnit') || '';
        html = '<div class="rd-list">' + list.slice(0, n).map(function (r, i) {
          const v = k === 'size' ? r.size : r.moves;
          const tier = k === 'size' ? sizeTier(v) : moveTier(v);
          const main = '<span class="rd-v1">' + (k === 'size'
            ? '<span class="rd-val ' + tier + '">' + v + '%</span>' + barHtml(tier, v / 160)
            : '<span class="rd-val ' + tier + '">' + (v > 99 ? '99+' : v) + '</span><span class="rd-unit">' + esc(unit) + '</span>' + barHtml(tier, v / 100)) +
            '</span>';
          const meta = '<span class="tm ' + tier + '">' + esc(B.formatTime(r.ms)) + '</span><span>' + esc(dateLabel(r.at)) + '</span>' + tagsHtml(r, B.helpMarkSvg);
          return rowHtml(i, main, meta, pctHtml(firstIdx[v], list.length));
        }).join('') + '</div>';
        if (list.length > n) {
          html += '<button type="button" class="rd-more" data-k="' + k + '">' + esc(tx('rdMore', { n: Math.min(CHUNK, list.length - n) })) + '</button>';
        }
      }
    }
    pageEl.innerHTML = html;
    if (dir) {
      pageEl.classList.remove('in-next', 'in-prev');
      void pageEl.offsetWidth;
      pageEl.classList.add(dir > 0 ? 'in-next' : 'in-prev');
    }
  }

  /* ------------------------------------------------------------ 入口 -- */
  // index.html の renderRecordsList() から呼ばれる（開いたとき・言語の変更・全消去のあと）
  function render() {
    if (!build()) return;
    const d = bridge().data();
    renderHero(d, allSolves(d));
    paintTabs();
    renderPage(0);
    if (toTop && scrollEl) { scrollEl.scrollTop = 0; toTop = false; }
  }
  // 開く直前に index.html が呼ぶ：多めに出していた一覧は100件に戻し、次の描画でスクロールを頭へ
  let toTop = false;
  function willOpen() {
    shown = { size: CHUNK, moves: CHUNK };
    toTop = true;
  }

  global.RecordsDash = { render: render, willOpen: willOpen, go: function (i) { if (build()) go(i); } };
})(window);
