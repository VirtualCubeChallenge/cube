/* =====================================================================
   blackout.js — 世界ランキング 12月の特別モード「真冬の停電モード」（mode id: 'blackout'）
   ---------------------------------------------------------------------
   ルール
     ・キューブを回している間だけ明るい。手を止めると、冬の夜の停電のように
       じわじわ暗くなり、最後は真っ暗（キューブの色が見えない）になる。
     ・1手でも回せば、その瞬間にパッと明かりが戻る（真っ暗からでも半分以上戻る）。
     ・真っ暗でも操作はそのままできる（暗幕は指を素通りする）。手探りで回して取り戻す。
     ・インスペクション中は明るいまま。1手目を回した瞬間から「止まると暗くなる」が始まる。

   暗くなるにつれて出るもの
     ・画面の端に霜が降りる（最初に1回だけ canvas に描いた霜の結晶を、濃さだけ変える）
     ・吹雪（雪の粒。暗いほど濃く見える）と、風の音
     ・懐中電灯の電池が切れそうなチカチカ（1秒に2回まで。動きを減らす設定では出さない）
     ・心臓の音（暗いほど速く）と、画面の縁がうっすら赤く脈打つ
     ・左上に懐中電灯の電池の目盛り（明るさ＝残り）。少ないと赤く点滅
     ・真っ暗になったら「手探りで回せ…！」
     ・始まるときに、12月らしいユーモアのある警告（4つから1つ）

   入口（ranked.js が呼ぶ）
     Blackout.start({ practice })  … 始める（明るいまま待つ。最初の turn() から本番）
     Blackout.turn()               … 1手回したとき（RankedHook.onTurn から）
     Blackout.stop({ restored })   … 終わり。restored なら「電気が戻った」演出つき
     Blackout.isOn()
     Blackout.joke()               … 記録画面に出す一言（文言キー）

   作りの方針（ほかのファイルと同じ）
     ・機能ごとに1ファイル。CSS と9言語の文言はこのファイルが自前で持つ（I18N に無いキーだけ足す）。
     ・動かすのは opacity と transform だけ。暗さは全画面の黒い板の opacity で表す。
     ・指は全部素通り（pointer-events:none）。ランク戦の表示（#rk-hud, z-index 30）は暗幕より上。
     ・音は WebAudio の合成。AudioContext はアプリ共通の1つ（window.__audioCtx）。
   ===================================================================== */
(function (global) {
  'use strict';

  if (global.Blackout) return;

  /* ================================================================ 文言 == */
  const TEXTS = {
    ja: {
      rkModeBlackout: '真冬の停電モード',
      rkModeBlackoutDesc: '回している間だけ明かりがつきます。手を止めると、じわじわ真っ暗に。1手回せばパッと復活',
      boWarn1: '⚠️ 12月の夜は電気代が高い。回し続けないと、明かりが消えます。',
      boWarn2: '⚠️ 寒波で停電中。手を止めたら真っ暗。サンタは助けに来ません。',
      boWarn3: '⚠️ この懐中電灯は、キューブを回して充電する方式です（そういう仕様です）。',
      boWarn4: '⚠️ 吹雪の夜です。止まると凍ります。こたつから出ずに揃えてください。',
      boJoke1: '停電にも負けずに揃えた。電力会社から感謝状が届くかもしれない（届かない）。',
      boJoke2: 'その指の速さ、もはや人力発電所。',
      boJoke3: '真っ暗でも揃えた。今年いちばん働いたのは、サンタではなくあなた。',
      boJoke4: '明かりは戻った。指先のしもやけにはご注意を。',
      boDark: '手探りで回せ…！',
      boTry: '🕯️ 12月の停電モードを試す（テスト用・記録なし）',
      boPracticeDone: 'テスト用の練習でした（記録はされません）'
    },
    en: {
      rkModeBlackout: 'Winter Blackout Mode',
      rkModeBlackoutDesc: 'The lights stay on only while you turn. Stop, and it slowly goes pitch black. One turn brings the light back',
      boWarn1: '⚠️ Electricity is pricey on December nights. Keep turning or the lights go out.',
      boWarn2: '⚠️ Cold-wave power cut. Stop and it goes pitch black. Santa is not coming to help.',
      boWarn3: '⚠️ This flashlight is charged by turning the cube. (That is just how it works.)',
      boWarn4: '⚠️ It is a blizzard tonight. Stop and you freeze. Solve it without leaving the blanket.',
      boJoke1: 'You beat the blackout. The power company may send you a thank-you letter. (It will not.)',
      boJoke2: 'Fingers that fast are basically a human power plant.',
      boJoke3: 'Solved in the dark. The hardest worker this year was you, not Santa.',
      boJoke4: 'The lights are back. Mind the frostbite on your fingertips.',
      boDark: 'Turn blindly…!',
      boTry: '🕯️ Try December Blackout Mode (test only, not recorded)',
      boPracticeDone: 'That was a test run (not recorded)'
    },
    'zh-CN': {
      rkModeBlackout: '严冬停电模式',
      rkModeBlackoutDesc: '只有转动时才有灯光。一停手，就会慢慢变得漆黑。转一步，灯光立刻恢复',
      boWarn1: '⚠️ 12月的夜晚电费很贵。不一直转，灯就会熄灭。',
      boWarn2: '⚠️ 寒潮导致停电中。一停手就漆黑一片。圣诞老人不会来救你。',
      boWarn3: '⚠️ 这支手电筒靠转魔方充电。（就是这么设定的。）',
      boWarn4: '⚠️ 今夜暴风雪。停下就会冻住。请别离开被炉，把它还原吧。',
      boJoke1: '你战胜了停电。电力公司也许会寄来感谢信（并不会）。',
      boJoke2: '这手速，简直就是人力发电站。',
      boJoke3: '在黑暗中完成还原。今年最勤劳的不是圣诞老人，而是你。',
      boJoke4: '灯光恢复了。小心指尖冻疮。',
      boDark: '摸黑转吧…！',
      boTry: '🕯️ 试玩12月停电模式（测试用・不记录）',
      boPracticeDone: '这是测试练习（不会记录）'
    },
    'zh-TW': {
      rkModeBlackout: '嚴冬停電模式',
      rkModeBlackoutDesc: '只有轉動時才有燈光。一停手，就會慢慢變得漆黑。轉一步，燈光立刻恢復',
      boWarn1: '⚠️ 12月的夜晚電費很貴。不一直轉，燈就會熄滅。',
      boWarn2: '⚠️ 寒流導致停電中。一停手就漆黑一片。聖誕老人不會來救你。',
      boWarn3: '⚠️ 這支手電筒靠轉方塊充電。（就是這麼設定的。）',
      boWarn4: '⚠️ 今夜暴風雪。停下就會凍住。請別離開暖桌，把它還原吧。',
      boJoke1: '你戰勝了停電。電力公司也許會寄來感謝函（並不會）。',
      boJoke2: '這手速，簡直就是人力發電廠。',
      boJoke3: '在黑暗中完成還原。今年最勤勞的不是聖誕老人，而是你。',
      boJoke4: '燈光恢復了。小心指尖凍瘡。',
      boDark: '摸黑轉吧…！',
      boTry: '🕯️ 試玩12月停電模式（測試用・不記錄）',
      boPracticeDone: '這是測試練習（不會記錄）'
    },
    ko: {
      rkModeBlackout: '한겨울 정전 모드',
      rkModeBlackoutDesc: '돌리는 동안만 불이 켜져요. 손을 멈추면 서서히 캄캄해져요. 한 번 돌리면 바로 다시 밝아져요',
      boWarn1: '⚠️ 12월 밤은 전기세가 비싸요. 계속 돌리지 않으면 불이 꺼져요.',
      boWarn2: '⚠️ 한파로 정전 중. 손을 멈추면 캄캄해요. 산타는 도와주러 오지 않아요.',
      boWarn3: '⚠️ 이 손전등은 큐브를 돌려서 충전하는 방식이에요. (원래 그런 거예요.)',
      boWarn4: '⚠️ 눈보라 치는 밤이에요. 멈추면 얼어요. 이불 밖으로 나오지 말고 맞추세요.',
      boJoke1: '정전에도 지지 않고 맞췄어요. 전력 회사에서 감사장이 올지도 몰라요(안 와요).',
      boJoke2: '그 손놀림, 이제는 인력 발전소.',
      boJoke3: '캄캄한 데서도 맞췄어요. 올해 가장 열심히 일한 건 산타가 아니라 당신.',
      boJoke4: '불이 돌아왔어요. 손끝 동상 조심하세요.',
      boDark: '손으로 더듬어 돌려…!',
      boTry: '🕯️ 12월 정전 모드 체험하기 (테스트용·기록 안 됨)',
      boPracticeDone: '테스트용 연습이었어요(기록되지 않아요)'
    },
    es: {
      rkModeBlackout: 'Modo apagón invernal',
      rkModeBlackoutDesc: 'Solo hay luz mientras giras. Si paras, todo se va oscureciendo hasta quedar negro. Un giro y vuelve la luz',
      boWarn1: '⚠️ La luz sale cara en las noches de diciembre. Sigue girando o se apagan las luces.',
      boWarn2: '⚠️ Apagón por la ola de frío. Si paras, oscuridad total. Papá Noel no vendrá a ayudarte.',
      boWarn3: '⚠️ Esta linterna se carga girando el cubo. (Funciona así, sin más.)',
      boWarn4: '⚠️ Noche de ventisca. Si paras, te congelas. Resuélvelo sin salir de la manta.',
      boJoke1: 'Venciste al apagón. Quizá la compañía eléctrica te mande una carta de agradecimiento (no lo hará).',
      boJoke2: 'Con esos dedos eres prácticamente una central eléctrica humana.',
      boJoke3: 'Lo resolviste a oscuras. Este año quien más trabajó fuiste tú, no Papá Noel.',
      boJoke4: 'Volvió la luz. Cuidado con los sabañones en los dedos.',
      boDark: '¡Gira a tientas…!',
      boTry: '🕯️ Probar el modo apagón de diciembre (prueba, sin récord)',
      boPracticeDone: 'Fue una prueba (no se guarda)'
    },
    id: {
      rkModeBlackout: 'Mode Mati Lampu Musim Dingin',
      rkModeBlackoutDesc: 'Lampu hanya menyala selama kamu memutar. Berhenti, layar pelan-pelan gelap gulita. Satu putaran, lampu langsung kembali',
      boWarn1: '⚠️ Listrik mahal di malam Desember. Terus putar, atau lampunya padam.',
      boWarn2: '⚠️ Mati lampu karena gelombang dingin. Berhenti, langsung gelap gulita. Sinterklas tidak akan datang menolong.',
      boWarn3: '⚠️ Senter ini diisi ulang dengan memutar kubus. (Memang begitu aturannya.)',
      boWarn4: '⚠️ Malam badai salju. Berhenti, kamu membeku. Selesaikan tanpa keluar dari selimut.',
      boJoke1: 'Kamu menang melawan mati lampu. Mungkin PLN akan kirim surat terima kasih (tidak akan).',
      boJoke2: 'Jari secepat itu sudah seperti pembangkit listrik tenaga manusia.',
      boJoke3: 'Selesai dalam gelap. Yang paling kerja keras tahun ini kamu, bukan Sinterklas.',
      boJoke4: 'Lampu sudah kembali. Hati-hati jari kedinginan.',
      boDark: 'Putar sambil meraba…!',
      boTry: '🕯️ Coba mode mati lampu Desember (uji coba, tidak tercatat)',
      boPracticeDone: 'Itu uji coba (tidak tercatat)'
    },
    ru: {
      rkModeBlackout: 'Режим зимнего блэкаута',
      rkModeBlackoutDesc: 'Свет горит, только пока вы крутите. Остановитесь — и всё медленно погрузится во тьму. Один ход — и свет вернётся',
      boWarn1: '⚠️ Декабрьскими ночами электричество дорогое. Крутите без остановки, иначе свет погаснет.',
      boWarn2: '⚠️ Из-за морозов отключили свет. Остановитесь — и станет темно. Дед Мороз на помощь не придёт.',
      boWarn3: '⚠️ Этот фонарик заряжается вращением кубика. (Так уж он устроен.)',
      boWarn4: '⚠️ Ночью метель. Остановитесь — замёрзнете. Собирайте, не вылезая из-под пледа.',
      boJoke1: 'Вы победили блэкаут. Возможно, энергокомпания пришлёт благодарность (не пришлёт).',
      boJoke2: 'С такими пальцами вы — живая электростанция.',
      boJoke3: 'Собрано в темноте. В этом году больше всех трудились вы, а не Дед Мороз.',
      boJoke4: 'Свет вернулся. Берегите пальцы от обморожения.',
      boDark: 'Крутите на ощупь…!',
      boTry: '🕯️ Попробовать декабрьский блэкаут (тест, без записи)',
      boPracticeDone: 'Это была тренировка (не записывается)'
    },
    'pt-BR': {
      rkModeBlackout: 'Modo apagão de inverno',
      rkModeBlackoutDesc: 'A luz só fica acesa enquanto você gira. Parou, tudo vai escurecendo até ficar breu. Um giro e a luz volta',
      boWarn1: '⚠️ A conta de luz é cara nas noites de dezembro. Continue girando ou as luzes apagam.',
      boWarn2: '⚠️ Apagão por causa da onda de frio. Parou, escuridão total. O Papai Noel não vem ajudar.',
      boWarn3: '⚠️ Esta lanterna é carregada girando o cubo. (É assim que funciona.)',
      boWarn4: '⚠️ Noite de nevasca. Se parar, congela. Resolva sem sair do cobertor.',
      boJoke1: 'Você venceu o apagão. Talvez a companhia elétrica mande uma carta de agradecimento (não vai).',
      boJoke2: 'Com esses dedos, você é praticamente uma usina humana.',
      boJoke3: 'Resolvido no escuro. Quem mais trabalhou este ano foi você, não o Papai Noel.',
      boJoke4: 'A luz voltou. Cuidado com as frieiras nas pontas dos dedos.',
      boDark: 'Gire no tato…!',
      boTry: '🕯️ Testar o modo apagão de dezembro (teste, sem recorde)',
      boPracticeDone: 'Foi um teste (não é registrado)'
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
  function tx(key) {
    try { if (typeof global.t === 'function') { const s = global.t(key); if (s && s !== key) return s; } } catch (e) { /* 下へ */ }
    return TEXTS.ja[key] || key;
  }

  /* ============================================================ 決めごと == */
  const CFG = {
    GRACE_MS: 400,      // 手を止めてから暗くなり始めるまで
    EASE_MS: 600,       // 暗くなる速さが最大になるまで（じわっと始まる）
    FADE_MS: 2600,      // 明るい → 真っ暗 にかかる時間（最大の速さで）
    TURN_GAIN: 0.6,     // 1手で戻る明るさ（真っ暗からでも 60%）
    HEART_FROM: 0.45,   // この暗さから心臓の音
    FLICKER_FROM: 0.28, FLICKER_TO: 0.88   // この暗さのあいだだけチカチカ
  };

  function reduced() {
    return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  const clamp01 = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  const smooth = function (a, b, x) { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const rnd = function (a, b) { return a + Math.random() * (b - a); };

  /* ================================================================ CSS == */
  const CSS = [
    // 暗幕より上に出すもの（電池・警告・手探り）は z-index 31。ランク戦の表示 #rk-hud は 30、暗幕は 29
    '.bo-root{position:fixed;inset:0;z-index:29;pointer-events:none;overflow:hidden;contain:strict}',
    '.bo-root *{pointer-events:none}',
    '.bo-vig{position:absolute;inset:-10%;opacity:0;will-change:opacity;',
    '  background:radial-gradient(circle at var(--bx,50%) var(--by,45%),rgba(4,6,14,0) 0,rgba(4,6,14,.25) 22%,rgba(3,4,10,.92) 62%,#000 90%)}',
    '.bo-dark{position:absolute;inset:0;background:#000;opacity:0;will-change:opacity}',
    '.bo-pulse{position:absolute;inset:0;opacity:0;',
    '  background:radial-gradient(circle at 50% 45%,rgba(120,0,10,0) 45%,rgba(150,10,20,.55) 100%)}',
    '.bo-pulse.go{animation:boPulse .42s ease-out}',
    '@keyframes boPulse{0%{opacity:0}25%{opacity:var(--pa,.5)}100%{opacity:0}}',
    '.bo-frost{position:absolute;inset:0;width:100%;height:100%;opacity:0;will-change:opacity,transform;transform-origin:50% 50%}',
    '.bo-snow{position:absolute;inset:0;opacity:.15;will-change:opacity}',
    '.bo-flake{position:absolute;top:-4vh;border-radius:50%;background:#eef6ff;',
    '  box-shadow:0 0 6px rgba(220,236,255,.9);animation:boFall var(--d,5s) linear var(--dl,0s) infinite}',
    '@keyframes boFall{from{transform:translate3d(0,0,0)}to{transform:translate3d(var(--dx,-30vw),110vh,0)}}',
    '.bo-flash{position:absolute;left:var(--bx,50%);top:var(--by,45%);width:150vmax;height:150vmax;margin:-75vmax 0 0 -75vmax;',
    '  border-radius:50%;opacity:0;background:radial-gradient(circle,rgba(255,236,190,.5) 0,rgba(255,214,150,.18) 25%,rgba(255,214,150,0) 55%)}',
    '.bo-flash.go{animation:boFlash .34s ease-out}',
    '@keyframes boFlash{0%{opacity:1}100%{opacity:0}}',
    // 電気が戻った（揃えた）ときの、あたたかい光
    '.bo-root.restore .bo-dark,.bo-root.restore .bo-vig,.bo-root.restore .bo-frost,.bo-root.restore .bo-snow{transition:opacity .9s ease}',
    '.bo-top{position:fixed;z-index:31;pointer-events:none}',
    // 懐中電灯の電池（明るさ＝残り）
    '.bo-batt{left:12px;top:calc(env(safe-area-inset-top,0px) + 128px);display:flex;align-items:center;gap:6px;padding:5px 9px 5px 7px;',
    '  border-radius:999px;background:rgba(10,14,24,.72);border:1px solid rgba(160,200,255,.25);',
    '  box-shadow:0 4px 14px rgba(0,0,0,.45);font-size:14px;line-height:1;opacity:0;transition:opacity .4s}',
    '.bo-batt.on{opacity:1}',
    '.bo-batt .cell{display:flex;gap:2px;padding:2px;border:1.5px solid #cfe2ff;border-radius:4px;position:relative}',
    '.bo-batt .cell::after{content:"";position:absolute;right:-5px;top:4px;width:3px;height:6px;border-radius:0 2px 2px 0;background:#cfe2ff}',
    '.bo-batt i{width:5px;height:10px;border-radius:1.5px;background:#2a3346;transition:background .15s}',
    '.bo-batt i.f{background:var(--bc,#7dffa8);box-shadow:0 0 6px var(--bc,#7dffa8)}',
    '.bo-batt.low{animation:boLow 1s steps(1,end) infinite}',
    '@keyframes boLow{0%{opacity:1}50%{opacity:.35}}',
    // 始まるときの警告
    '.bo-warn{left:50%;top:calc(env(safe-area-inset-top,0px) + 150px);width:min(88vw,380px);transform:translateX(-50%);',
    '  padding:12px 14px 12px 14px;border-radius:16px;text-align:left;color:#eaf4ff;font-size:13.5px;font-weight:700;line-height:1.6;',
    '  background:linear-gradient(160deg,rgba(26,40,72,.94),rgba(10,14,30,.94));border:1px solid rgba(160,210,255,.4);',
    '  box-shadow:0 10px 30px rgba(0,0,0,.55),0 0 22px rgba(120,190,255,.18);opacity:0}',
    '.bo-warn b{display:block;font-size:11px;letter-spacing:.14em;color:#9fd2ff;margin-bottom:4px}',
    '.bo-warn.on{animation:boWarn 4.6s ease both}',
    '@keyframes boWarn{0%{opacity:0;transform:translate(-50%,-10px)}8%{opacity:1;transform:translate(-50%,0)}86%{opacity:1;transform:translate(-50%,0)}100%{opacity:0;transform:translate(-50%,-6px)}}',
    // 真っ暗になったときの一言
    '.bo-hint{left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 30%);transform:translateX(-50%);white-space:nowrap;',
    '  font-size:18px;font-weight:900;letter-spacing:.08em;color:#bcd8ff;text-shadow:0 0 12px rgba(120,180,255,.8);opacity:0;transition:opacity .6s}',
    '.bo-hint.on{opacity:.85;animation:boBreath 2.2s ease-in-out infinite}',
    '@keyframes boBreath{0%,100%{transform:translateX(-50%) scale(1)}50%{transform:translateX(-50%) scale(1.04)}}',
    '@media (prefers-reduced-motion: reduce){',
    '  .bo-flake{animation:none}.bo-hint.on,.bo-batt.low{animation:none}.bo-pulse.go{animation:none}',
    '}'
  ].join('\n');

  let styleEl = null;
  function injectCSS() {
    if (styleEl) return;
    styleEl = document.createElement('style');
    styleEl.id = 'blackout-style';
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);
  }

  /* ---- 霜（画面の端から内側へ伸びる氷の結晶）。始めるたびに1回だけ描く ---- */
  function drawFrost(cv) {
    const vw = global.innerWidth || 390, vh = global.innerHeight || 844;
    const k = Math.min(1.5, global.devicePixelRatio || 1);
    const W = Math.round(vw * k), H = Math.round(vh * k);
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.clearRect(0, 0, W, H);
    // 端の白いくもり
    const edge = Math.min(W, H) * 0.2;
    [[0, 0, 0, edge], [0, H, 0, H - edge], [0, 0, edge, 0], [W, 0, W - edge, 0]].forEach(function (e) {
      const gr = g.createLinearGradient(e[0], e[1], e[2], e[3]);
      gr.addColorStop(0, 'rgba(200,226,255,.42)');
      gr.addColorStop(0.45, 'rgba(200,225,255,.16)');
      gr.addColorStop(1, 'rgba(200,225,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
    });
    // 四隅は濃く
    [[0, 0], [W, 0], [0, H], [W, H]].forEach(function (c) {
      const r = Math.min(W, H) * 0.42;
      const gr = g.createRadialGradient(c[0], c[1], 0, c[0], c[1], r);
      gr.addColorStop(0, 'rgba(210,232,255,.55)');
      gr.addColorStop(0.5, 'rgba(210,232,255,.2)');
      gr.addColorStop(1, 'rgba(210,232,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
    });
    // 結晶：端の点から内側へ、枝分かれしながら伸びる線
    g.lineCap = 'round';
    g.shadowColor = 'rgba(200,230,255,.9)';
    g.shadowBlur = 4 * k;
    function branch(x, y, ang, len, w, depth) {
      const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
      g.strokeStyle = 'rgba(214,236,255,' + (0.3 + depth * 0.12).toFixed(2) + ')';
      g.lineWidth = w;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
      if (depth <= 0) return;
      const n = 2 + Math.floor(Math.random() * 2);
      for (let i = 1; i <= n; i++) {
        const t = i / (n + 1);
        const bx = x + (x2 - x) * t, by = y + (y2 - y) * t;
        const side = Math.random() < 0.5 ? -1 : 1;
        branch(bx, by, ang + side * rnd(0.8, 1.15), len * rnd(0.3, 0.45), w * 0.6, depth - 1);
      }
      branch(x2, y2, ang + rnd(-0.35, 0.35), len * rnd(0.45, 0.6), w * 0.75, depth - 1);
    }
    const seeds = 46;
    for (let i = 0; i < seeds; i++) {
      const side = i % 4, p = Math.random();
      let x, y, ang;
      if (side === 0) { x = p * W; y = 0; ang = Math.PI / 2; }
      else if (side === 1) { x = p * W; y = H; ang = -Math.PI / 2; }
      else if (side === 2) { x = 0; y = p * H; ang = 0; }
      else { x = W; y = p * H; ang = Math.PI; }
      // 隅に近いほど長く伸ばす
      const nearCorner = 1 - Math.min(p, 1 - p) * 2;
      const len = Math.min(W, H) * rnd(0.06, 0.12) * (0.7 + nearCorner * 0.9);
      branch(x, y, ang + rnd(-0.6, 0.6), len, rnd(1.2, 2.2) * k, 3);
    }
  }

  /* ================================================================= 音 == */
  let actx = null, noiseBuf = null;
  function audio() {
    try {
      const c = global.__audioCtx ? global.__audioCtx() : null;
      if (!c) return null;
      if (c !== actx) { actx = c; noiseBuf = null; }
      if (c.state !== 'running' && c.resume) c.resume();
      return c;
    } catch (e) { return null; }
  }
  function getNoise(c) {
    if (noiseBuf) return noiseBuf;
    const len = Math.floor(c.sampleRate * 2);
    noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let low = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; low = low * 0.97 + w * 0.03; d[i] = w * 0.4 + low * 3; }
    return noiseBuf;
  }
  function keepAwake(ms) { try { if (global.__audioIdleSuspend && actx) global.__audioIdleSuspend(actx, ms); } catch (e) { /* 無視 */ } }
  function blip(type, f0, f1, at, a, peak, d, filt) {
    const c = audio(); if (!c) return;
    const t = c.currentTime + 0.01 + (at || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + a + d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    let node = o;
    if (filt) { const f = c.createBiquadFilter(); f.type = filt.type || 'lowpass'; f.frequency.value = filt.f; f.Q.value = filt.q || 0.8; o.connect(f); node = f; }
    node.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + a + d + 0.05);
  }
  function hiss(at, a, peak, d, type, f0, f1, q) {
    const c = audio(); if (!c) return;
    const t = c.currentTime + 0.01 + (at || 0);
    const s = c.createBufferSource(); s.buffer = getNoise(c);
    const f = c.createBiquadFilter(); f.type = type || 'bandpass';
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + a + d);
    f.Q.value = q || 1;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    s.connect(f); f.connect(g); g.connect(c.destination);
    s.start(t, Math.random()); s.stop(t + a + d + 0.05);
  }
  // 吹雪の風（鳴らしっぱなしにして、暗さで音量を変える）
  let wind = null;
  function windStart() {
    const c = audio(); if (!c || wind) return;
    try {
      const s = c.createBufferSource(); s.buffer = getNoise(c); s.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = 0.7;
      const lfo = c.createOscillator(), lg = c.createGain();
      lfo.frequency.value = 0.23; lg.gain.value = 260;
      lfo.connect(lg); lg.connect(f.frequency);
      const g = c.createGain(); g.gain.value = 0.0001;
      s.connect(f); f.connect(g); g.connect(c.destination);
      s.start(); lfo.start();
      wind = { s: s, lfo: lfo, g: g, f: f };
    } catch (e) { wind = null; }
  }
  function windLevel(v) {
    if (!wind || !actx) return;
    try { wind.g.gain.setTargetAtTime(Math.max(0.0001, v), actx.currentTime, 0.25); } catch (e) { /* 無視 */ }
  }
  function windStop() {
    if (!wind) return;
    const w = wind; wind = null;
    try {
      w.g.gain.setTargetAtTime(0.0001, actx.currentTime, 0.15);
      setTimeout(function () { try { w.s.stop(); w.lfo.stop(); w.g.disconnect(); } catch (e) { /* 済み */ } }, 700);
    } catch (e) { /* 無視 */ }
  }
  const SND = {
    // カチッ（明かりがつく）
    on: function () { hiss(0, 0.002, 0.25, 0.03, 'highpass', 2500); blip('sine', 900, 1300, 0.01, 0.004, 0.06, 0.08); },
    // ドクン、ドクン
    heart: function (v) {
      blip('sine', 62, 40, 0, 0.006, 0.55 * v, 0.13);
      blip('sine', 56, 38, 0.17, 0.006, 0.42 * v, 0.12);
      keepAwake(1500);
    },
    // チリッ（電池が切れかける）
    flick: function () { hiss(0, 0.001, 0.12, 0.02, 'highpass', 4000); },
    // 電気が戻った（揃えた）
    restore: function () {
      blip('sine', 220, 440, 0, 0.02, 0.12, 0.25);
      [1046.5, 1318.5, 1568, 2093].forEach(function (f, i) { blip('sine', f, f, 0.08 + i * 0.07, 0.004, 0.13, 0.5); });
      keepAwake(2000);
    }
  };

  /* ============================================================== 本体 == */
  let root = null, els = null, on = false, practice = false;
  let phase = 'off';          // 'wait'（インスペクション中：明るいまま）/ 'run'
  let L = 1, lastTurn = 0, lastFrame = 0, raf = 0;
  let nextBeat = 0, nextFlick = 0, flickUntil = 0, darkSince = 0;
  let shown = { dark: -1, vig: -1, frost: -1, snow: -1, cells: -1, low: null, hint: null };

  function cubeCenter() {
    const c = document.getElementById('canvas-container');
    const r = c && c.getBoundingClientRect();
    if (!r || !r.width) return { x: '50%', y: '45%' };
    return { x: (r.left + r.width / 2).toFixed(0) + 'px', y: (r.top + r.height / 2).toFixed(0) + 'px' };
  }

  function build() {
    injectCSS();
    if (root && root.parentNode) root.parentNode.removeChild(root);
    root = document.createElement('div');
    root.className = 'bo-root';
    root.setAttribute('aria-hidden', 'true');
    const cc = cubeCenter();
    root.style.setProperty('--bx', cc.x);
    root.style.setProperty('--by', cc.y);
    const vig = document.createElement('div'); vig.className = 'bo-vig';
    const dark = document.createElement('div'); dark.className = 'bo-dark';
    const pulse = document.createElement('div'); pulse.className = 'bo-pulse';
    const frost = document.createElement('canvas'); frost.className = 'bo-frost';
    try { drawFrost(frost); } catch (e) { /* 霜なしで続ける */ }
    const snow = document.createElement('div'); snow.className = 'bo-snow';
    const R = reduced();
    for (let i = 0; i < (R ? 18 : 42); i++) {
      const f = document.createElement('i');
      f.className = 'bo-flake';
      const s = rnd(1.6, 4.6);
      f.style.cssText = 'left:' + rnd(-5, 125).toFixed(1) + 'vw;width:' + s.toFixed(1) + 'px;height:' + s.toFixed(1) + 'px;opacity:' + rnd(0.45, 0.95).toFixed(2) +
        (R ? ';top:' + rnd(0, 100).toFixed(1) + 'vh' : '');
      f.style.setProperty('--d', rnd(2.8, 6.5).toFixed(2) + 's');
      f.style.setProperty('--dl', (-rnd(0, 6)).toFixed(2) + 's');
      f.style.setProperty('--dx', (-rnd(12, 40)).toFixed(0) + 'vw');
      snow.appendChild(f);
    }
    const flash = document.createElement('div'); flash.className = 'bo-flash';
    root.appendChild(vig); root.appendChild(dark); root.appendChild(pulse);
    root.appendChild(frost); root.appendChild(snow); root.appendChild(flash);
    document.body.appendChild(root);

    const batt = document.createElement('div');
    batt.className = 'bo-top bo-batt';
    batt.setAttribute('aria-hidden', 'true');
    batt.innerHTML = '<span>🔦</span><span class="cell"><i></i><i></i><i></i><i></i><i></i></span>';
    document.body.appendChild(batt);
    const hint = document.createElement('div');
    hint.className = 'bo-top bo-hint';
    hint.setAttribute('aria-hidden', 'true');
    hint.textContent = tx('boDark');
    document.body.appendChild(hint);
    els = { vig: vig, dark: dark, pulse: pulse, frost: frost, snow: snow, flash: flash, batt: batt, cells: batt.querySelectorAll('i'), hint: hint };
    shown = { dark: -1, vig: -1, frost: -1, snow: -1, cells: -1, low: null, hint: null };
  }

  function showWarning() {
    const w = document.createElement('div');
    w.className = 'bo-top bo-warn';
    w.setAttribute('role', 'status');
    w.innerHTML = '<b>' + tx('rkModeBlackout') + '</b>';
    const p = document.createElement('span');
    p.textContent = tx('boWarn' + (1 + Math.floor(Math.random() * 4)));
    w.appendChild(p);
    document.body.appendChild(w);
    void w.offsetWidth;
    w.classList.add('on');
    setTimeout(function () { if (w.parentNode) w.parentNode.removeChild(w); }, 4800);
  }

  function set(el, key, v) {
    if (Math.abs(shown[key] - v) < 0.004) return;
    shown[key] = v;
    el.style.opacity = v.toFixed(3);
  }

  function paint(now) {
    const D = 1 - L;                         // 暗さ 0〜1
    let dark = Math.pow(smooth(0.18, 1, D), 1.25);
    // チカチカ：ほんの一瞬、明かりが落ちる
    if (now < flickUntil) dark = Math.min(1, dark + 0.42);
    set(els.dark, 'dark', D >= 0.995 ? 1 : dark);
    set(els.vig, 'vig', smooth(0, 0.55, D));
    set(els.frost, 'frost', smooth(0.3, 1, D) * 0.78);
    set(els.snow, 'snow', 0.12 + smooth(0.1, 0.9, D) * 0.78);
    // 霜は暗くなるほど、外から少しずつ迫ってくる
    els.frost.style.transform = 'scale(' + (1.08 - smooth(0.3, 1, D) * 0.08).toFixed(3) + ')';
    const cells = Math.ceil(L * 5 - 0.001);
    if (cells !== shown.cells) {
      shown.cells = cells;
      const col = L > 0.6 ? '#7dffa8' : L > 0.3 ? '#ffd45a' : '#ff5a5a';
      els.batt.style.setProperty('--bc', col);
      els.cells.forEach(function (c, i) { c.classList.toggle('f', i < cells); });
    }
    const low = phase === 'run' && L < 0.3;
    if (low !== shown.low) { shown.low = low; els.batt.classList.toggle('low', low && !reduced()); }
    const hint = phase === 'run' && D >= 0.98 && darkSince && now - darkSince > 700;
    if (hint !== shown.hint) { shown.hint = hint; els.hint.classList.toggle('on', hint); }
    windLevel(0.02 + D * 0.11);
  }

  function frame(now) {
    if (!on) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(100, now - (lastFrame || now));
    lastFrame = now;
    if (phase === 'run') {
      const idle = now - lastTurn;
      if (idle > CFG.GRACE_MS) {
        const k = Math.min(1, (idle - CFG.GRACE_MS) / CFG.EASE_MS);
        L = clamp01(L - dt / CFG.FADE_MS * k);
      }
      const D = 1 - L;
      if (D >= 0.98) { if (!darkSince) darkSince = now; } else darkSince = 0;
      // 心臓の音（暗いほど速く・強く）。画面の縁が赤く脈打つ
      if (D >= CFG.HEART_FROM && now >= nextBeat) {
        const v = smooth(CFG.HEART_FROM, 1, D);
        nextBeat = now + (950 - 470 * v);
        SND.heart(0.5 + v * 0.5);
        if (!reduced()) {
          els.pulse.style.setProperty('--pa', (0.22 + v * 0.4).toFixed(2));
          els.pulse.classList.remove('go'); void els.pulse.offsetWidth; els.pulse.classList.add('go');
        }
        try { if (navigator.vibrate && v > 0.5) navigator.vibrate(12); } catch (e) { /* 非対応 */ }
      }
      // 電池が切れそうなチカチカ（1秒に2回まで）
      if (!reduced() && D > CFG.FLICKER_FROM && D < CFG.FLICKER_TO && now >= nextFlick) {
        nextFlick = now + rnd(520, 1500);
        flickUntil = now + rnd(55, 95);
        SND.flick();
      }
    }
    paint(now);
  }

  function start(opts) {
    opts = opts || {};
    stop();
    practice = !!opts.practice;
    on = true;
    phase = 'wait';
    L = 1; lastTurn = 0; lastFrame = 0; darkSince = 0;
    nextBeat = 0; nextFlick = 0; flickUntil = 0;
    build();
    els.batt.classList.add('on');
    showWarning();
    windStart();
    raf = requestAnimationFrame(frame);
  }

  function turn() {
    if (!on) return;
    const now = performance.now();
    const before = L;
    if (phase === 'wait') phase = 'run';
    L = Math.min(1, L + CFG.TURN_GAIN);
    lastTurn = now;
    nextBeat = Math.max(nextBeat, now + 300);
    // 暗いところから戻したときだけ、パッと光って「カチッ」
    if (before < 0.65) {
      if (!reduced()) { els.flash.classList.remove('go'); void els.flash.offsetWidth; els.flash.classList.add('go'); }
      SND.on();
    }
  }

  function stop(opts) {
    opts = opts || {};
    const wasOn = on;
    on = false;
    phase = 'off';
    practice = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    windStop();
    const r = root, e = els;
    root = null; els = null;
    if (!r) return;
    if (e) {
      if (e.batt && e.batt.parentNode) e.batt.parentNode.removeChild(e.batt);
      if (e.hint && e.hint.parentNode) e.hint.parentNode.removeChild(e.hint);
    }
    if (wasOn && opts.restored && e && !reduced()) {
      // 電気が戻った：暗さと霜がすっと引いて、あたたかい光が広がる
      r.classList.add('restore');
      e.dark.style.opacity = '0'; e.vig.style.opacity = '0'; e.frost.style.opacity = '0'; e.snow.style.opacity = '0';
      e.flash.classList.remove('go'); void e.flash.offsetWidth; e.flash.classList.add('go');
      SND.restore();
      setTimeout(function () { if (r.parentNode) r.parentNode.removeChild(r); }, 1000);
    } else if (r.parentNode) {
      r.parentNode.removeChild(r);
    }
  }

  global.Blackout = {
    start: start,
    turn: turn,
    stop: stop,
    isOn: function () { return on; },
    isPractice: function () { return on && practice; },
    joke: function () { return tx('boJoke' + (1 + Math.floor(Math.random() * 4))); },
    text: tx,
    CFG: CFG,
    // 確認用：開発ツールから Blackout._light() で今の明るさ
    _light: function () { return L; }
  };
})(window);
