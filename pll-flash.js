/* ============================================================
   pll-flash.js — PLLフラッシュ（連続表示）／PLLビジョン（一括表示）
   ------------------------------------------------------------
   2つのモードを1ファイルで持つ。違うのは「どう見せるか」だけで、
   回答画面（ボタン・赤い番号・1つ戻る・全リセット）とリザルトは共通。
     flash  … 1問ずつ一瞬だけ表示（下の説明）
     vision … 3×3のマスに9問を同時に表示し、時間が来たら一斉に消す。
              上面は回さない（AUFなし・正位置）。回答のスロットも3×3。
   ------------------------------------------------------------
   流れ
     設定（難易度）→ 3・2・1・START → PLLの画像を1問ずつ一瞬だけ表示
     → 全問見終わったら回答画面 → 出た順にボタンをタップして確定
     → リザルト（正解数・回答タイム・1問ずつのふりかえり）

   回答画面のボタンは PLL検定（2側面判断）と同じもの:
     「角のみ／辺のみ／隣接交換／対角交換」の4グループ、同じ並び・同じ色・
     同じ表記。PllTrainer の GROUPS は外から読めないので、ここに同じ表を
     写してある（向こうを変えたらこちらも合わせること）。
     見た目は style.css の .pllt-group / .pllt-ans をそのまま使う。

   状態（State）
     targetPLLs  … 出題の配列。{ name, auf, ring, up, angle }
     userAnswers … ユーザーの解答。問題数と同じ長さで、未入力は null
     cursor      … 次にボタンを押したとき書き込むスロット（-1 = 全部埋まった）
     history     … 「1つ戻る」用の操作履歴（全リセットも1手として戻せる）

   ------------------------------------------------------------
   作りの方針（cube-feel.js / ui-polish.js / sushi-arm.js と同じ）
   ------------------------------------------------------------
   - 機能ごとに1ファイル。CSSと9言語の文言はこのファイルが自前で持つ。
   - index.html への追記は <script> の読み込み1行だけ（＋引き継ぎキー1つ）。
     入口は PLL検定の設定画面に「PLLフラッシュ」のボタンを差し込む。
     この1行を消せば、ボタンごと消えて今までどおりに戻る。
   - PLL の模様は window.PLL_DATA（PLL一覧と2側面判断が使っている表）を
     そのまま読む。表を二重に持たない。
   - 貫（ガチャチケット）は増やさない。経済の設計（PLL検定1時間≒960貫）を
     崩さないため。増やすなら finishAnswer() で GachaTicket.grant() を呼ぶ。
   - 動かすのは transform と opacity だけ。「動きを減らす」設定では
     ポップの演出を止める（表示そのものが本題なので画像は出す）。
   - アプリを離れたら: 表示中なら中断して設定へ。回答中はタイマーを止めない
     （ホーム画面に逃げて考える時間を稼げないように）。
   ============================================================ */
(function (global) {
  'use strict';

  /* ---- 難易度 ----------------------------------------------------------
     showMs … 1問を見せる時間 / gapMs … 次の問題までの暗転
     暗転を挟まないと、同じPLLが2回続いたときに「1回長く出た」ように
     見えて区別できない。短い難易度ほど暗転も短くしてテンポを保つ。
     AUF（上面の向き）は難易度で分けず、PLL検定と同じく毎問ランダム。 */
  const LEVELS = [
    { id: 'easy',   key: 'plfLvEasy',   showMs: 1500, gapMs: 300, count: 3 },
    { id: 'normal', key: 'plfLvNormal', showMs: 1000, gapMs: 260, count: 5 },
    { id: 'hard',   key: 'plfLvHard',   showMs: 500,  gapMs: 200, count: 5 },
    { id: 'pro',    key: 'plfLvPro',    showMs: 250,  gapMs: 140, count: 10 }
  ];
  /* PLLビジョンの難易度。9問は固定で、変わるのは表示時間だけ。 */
  const VLEVELS = [
    { id: 'easy',   key: 'plfLvEasy',   showMs: 20000, count: 9 },
    { id: 'normal', key: 'plfLvNormal', showMs: 18000, count: 9 },
    { id: 'hard',   key: 'plfLvHard',   showMs: 15000, count: 9 },
    { id: 'pro',    key: 'plfLvPro',    showMs: 8000, count: 9 }
  ];
  const STORAGE_KEY = 'rubiks-cube-pll-flash';   // 両モード共用（ビジョンの記録は v: 付きのキー）
  const PLLT_KEY = 'rubiks-cube-pll-trainer';   // 上面の色の選択だけ借りる
  const COUNT_FROM = 3;
  const COUNT_STEP = 700;     // PLL検定と同じテンポ
  const GO_MS = 520;          // 「START」を見せる時間
  const TAIL_MS = 260;        // 最後の1問のあと、回答画面に移るまでの間

  /* ---- PLL検定と同じ回答ボタンの並び（index.html の PllTrainer と同一） ---- */
  const GROUPS = [
    { key: 'plltGrpCorner', cls: 'g1', cols: 3, names: ['Aa', 'Ab', 'E'] },
    { key: 'plltGrpEdge',   cls: 'g2', cols: 4, names: ['Ua', 'Ub', 'H', 'Z'] },
    { key: 'plltGrpAdj',    cls: 'g3', cols: 5, names: ['T', 'Ja', 'Jb', 'Ra', 'Rb', 'F', 'Ga', 'Gb', 'Gc', 'Gd'] },
    { key: 'plltGrpDiag',   cls: 'g4', cols: 4, names: ['V', 'Y', 'Na', 'Nb'] }
  ];
  const NAMES = [].concat.apply([], GROUPS.map(function (g) { return g.names; }));

  /* ---- 配色（PLL検定と同じ） ---- */
  const COLOR_HEX = { w: '#FFFFFF', y: '#FFD500', o: '#FF5800', r: '#B71234', g: '#009E60', b: '#0051BA' };
  const SCHEMES = {
    y: { U: 'y', F: 'g', B: 'b', R: 'o', L: 'r' },
    w: { U: 'w', F: 'g', B: 'b', R: 'r', L: 'o' },
    r: { U: 'r', F: 'g', B: 'b', R: 'y', L: 'w' },
    o: { U: 'o', F: 'g', B: 'b', R: 'w', L: 'y' },
    g: { U: 'g', F: 'y', B: 'w', R: 'r', L: 'o' },
    b: { U: 'b', F: 'w', B: 'y', R: 'r', L: 'o' }
  };

  /* ============================================================
     文言（既存 I18N は無改変。無いキーだけ足す）
     グループ名・スタート・戻る・もう一度・リザルトは PLL検定のキーを使う。
     ============================================================ */
  const PLF_I18N = {
    ja: {
      plfEntry: 'PLLフラッシュ', plfEntrySub: '一瞬ずつ出るPLLを覚えて、まとめて答える',
      plfTitle: 'PLLフラッシュ', plfLead: '次々に一瞬だけ出るPLLを覚えて、最後にまとめて答える',
      plfRule: '全問見終わったら、出た順にボタンをタップ',
      plfLevel: '難易度', plfLvEasy: '初級', plfLvNormal: '中級', plfLvHard: '上級', plfLvPro: '鬼',
      plfLvSpec: '{sec}秒 × {n}問',
      plfBest: '自己ベスト {c}/{n}（{t}秒）', plfNoBest: '自己ベスト —',
      plfNoKan: 'このモードでは貫はたまりません',
      plfHudQ: '問題', plfHudLevel: '難易度', plfHudTime: '回答タイム', plfHudInput: '入力',
      plfGo: 'START', plfAnsLead: '出た順に答えてください。番号をタップすると、その問題だけ選び直せます',
      plfUndo: '1つ戻る', plfReset: '全リセット', plfSubmit: '確定する', plfRemain: 'あと {n} 問',
      plfScore: '正解', plfTime: '回答タイム', plfReview: 'ふりかえり', plfAsked: '出題', plfYours: 'あなた',
      plfNewBest: '自己ベスト更新！', plfQuitTitle: 'PLLフラッシュをやめますか？',
      plfQuitBody: '入力した回答は消えます。', plfQuitOk: 'やめる', plfSlot: '{i}問目',
      plvEntry: 'PLLビジョン', plvEntrySub: '9個のPLLを一度に見て、まとめて答える',
      plvTitle: 'PLLビジョン', plvLead: '3×3に並んだ9個のPLLを一度に見て覚え、まとめて答える',
      plvRule: '表示が消えたら、マスの位置ごとにボタンをタップ', plvHudLeft: '残り',
      plvAnsLead: '出ていた位置ごとに答えてください。マスをタップすると、そこだけ選び直せます', plvQuitTitle: 'PLLビジョンをやめますか？'
    },
    en: {
      plfEntry: 'PLL Flash', plfEntrySub: 'Memorize PLLs that flash by, then answer them all',
      plfTitle: 'PLL Flash', plfLead: 'PLLs flash by one at a time — remember them and answer at the end',
      plfRule: 'When they’re done, tap the answers in the order they appeared',
      plfLevel: 'Difficulty', plfLvEasy: 'Easy', plfLvNormal: 'Normal', plfLvHard: 'Hard', plfLvPro: 'Pro',
      plfLvSpec: '{sec}s × {n}',
      plfBest: 'Best {c}/{n} ({t}s)', plfNoBest: 'Best —',
      plfNoKan: 'This mode doesn’t earn pieces',
      plfHudQ: 'Case', plfHudLevel: 'Level', plfHudTime: 'Answer time', plfHudInput: 'Entered',
      plfGo: 'START', plfAnsLead: 'Answer in the order shown. Tap a number to redo just that one',
      plfUndo: 'Undo', plfReset: 'Reset all', plfSubmit: 'Submit', plfRemain: '{n} left',
      plfScore: 'Correct', plfTime: 'Answer time', plfReview: 'Review', plfAsked: 'Shown', plfYours: 'You',
      plfNewBest: 'New personal best!', plfQuitTitle: 'Quit PLL Flash?',
      plfQuitBody: 'Your answers will be lost.', plfQuitOk: 'Quit', plfSlot: 'Case {i}',
      plvEntry: 'PLL Vision', plvEntrySub: 'See 9 PLLs at once, then answer them all',
      plvTitle: 'PLL Vision', plvLead: 'Nine PLLs appear at once in a 3×3 grid — take them in at a glance and answer at the end',
      plvRule: 'When they disappear, tap the answer for each square', plvHudLeft: 'Left',
      plvAnsLead: 'Answer for each square. Tap a square to redo just that one', plvQuitTitle: 'Quit PLL Vision?'
    },
    'zh-CN': {
      plfEntry: 'PLL闪现', plfEntrySub: '记住一闪而过的PLL，最后一起作答',
      plfTitle: 'PLL闪现', plfLead: 'PLL会一个接一个快速闪过，记住它们，最后一起作答',
      plfRule: '全部看完后，按出现的顺序点击答案',
      plfLevel: '难度', plfLvEasy: '初级', plfLvNormal: '中级', plfLvHard: '高级', plfLvPro: '魔鬼',
      plfLvSpec: '{sec}秒 × {n}题',
      plfBest: '最佳 {c}/{n}（{t}秒）', plfNoBest: '最佳 —',
      plfNoKan: '此模式不会攒贯',
      plfHudQ: '题目', plfHudLevel: '难度', plfHudTime: '作答时间', plfHudInput: '已输入',
      plfGo: 'START', plfAnsLead: '请按出现顺序作答。点击编号可以只重选那一题',
      plfUndo: '撤销一步', plfReset: '全部重置', plfSubmit: '确定', plfRemain: '还剩 {n} 题',
      plfScore: '正确', plfTime: '作答时间', plfReview: '回顾', plfAsked: '出题', plfYours: '你的答案',
      plfNewBest: '刷新个人最佳！', plfQuitTitle: '要退出PLL闪现吗？',
      plfQuitBody: '已输入的答案将被清除。', plfQuitOk: '退出', plfSlot: '第{i}题',
      plvEntry: 'PLL视野', plvEntrySub: '一次看9个PLL，最后一起作答',
      plvTitle: 'PLL视野', plvLead: '3×3排列的9个PLL同时出现——一眼记住，最后一起作答',
      plvRule: '画面消失后，按格子位置逐一点击答案', plvHudLeft: '剩余',
      plvAnsLead: '请按格子位置作答。点击格子可以只重选那一格', plvQuitTitle: '要退出PLL视野吗？'
    },
    'zh-TW': {
      plfEntry: 'PLL閃現', plfEntrySub: '記住一閃而過的PLL，最後一起作答',
      plfTitle: 'PLL閃現', plfLead: 'PLL會一個接一個快速閃過，記住它們，最後一起作答',
      plfRule: '全部看完後，按出現的順序點選答案',
      plfLevel: '難度', plfLvEasy: '初級', plfLvNormal: '中級', plfLvHard: '高級', plfLvPro: '魔鬼',
      plfLvSpec: '{sec}秒 × {n}題',
      plfBest: '最佳 {c}/{n}（{t}秒）', plfNoBest: '最佳 —',
      plfNoKan: '此模式不會攢貫',
      plfHudQ: '題目', plfHudLevel: '難度', plfHudTime: '作答時間', plfHudInput: '已輸入',
      plfGo: 'START', plfAnsLead: '請按出現順序作答。點選編號可以只重選那一題',
      plfUndo: '還原一步', plfReset: '全部重設', plfSubmit: '確定', plfRemain: '還剩 {n} 題',
      plfScore: '正確', plfTime: '作答時間', plfReview: '回顧', plfAsked: '出題', plfYours: '你的答案',
      plfNewBest: '刷新個人最佳！', plfQuitTitle: '要結束PLL閃現嗎？',
      plfQuitBody: '已輸入的答案將被清除。', plfQuitOk: '結束', plfSlot: '第{i}題',
      plvEntry: 'PLL視野', plvEntrySub: '一次看9個PLL，最後一起作答',
      plvTitle: 'PLL視野', plvLead: '3×3排列的9個PLL同時出現——一眼記住，最後一起作答',
      plvRule: '畫面消失後，按格子位置逐一點選答案', plvHudLeft: '剩餘',
      plvAnsLead: '請按格子位置作答。點選格子可以只重選那一格', plvQuitTitle: '要結束PLL視野嗎？'
    },
    ko: {
      plfEntry: 'PLL 플래시', plfEntrySub: '순식간에 지나가는 PLL을 외워서 한꺼번에 답하기',
      plfTitle: 'PLL 플래시', plfLead: 'PLL이 하나씩 순식간에 지나갑니다. 기억해 두었다가 마지막에 한꺼번에 답하세요',
      plfRule: '모두 본 뒤 나온 순서대로 버튼을 탭하세요',
      plfLevel: '난이도', plfLvEasy: '초급', plfLvNormal: '중급', plfLvHard: '상급', plfLvPro: '귀신',
      plfLvSpec: '{sec}초 × {n}문제',
      plfBest: '최고 기록 {c}/{n} ({t}초)', plfNoBest: '최고 기록 —',
      plfNoKan: '이 모드에서는 점이 모이지 않습니다',
      plfHudQ: '문제', plfHudLevel: '난이도', plfHudTime: '답변 시간', plfHudInput: '입력',
      plfGo: 'START', plfAnsLead: '나온 순서대로 답하세요. 번호를 탭하면 그 문제만 다시 고를 수 있어요',
      plfUndo: '하나 취소', plfReset: '전부 리셋', plfSubmit: '확정', plfRemain: '{n}문제 남음',
      plfScore: '정답', plfTime: '답변 시간', plfReview: '돌아보기', plfAsked: '출제', plfYours: '내 답',
      plfNewBest: '최고 기록 갱신!', plfQuitTitle: 'PLL 플래시를 그만둘까요?',
      plfQuitBody: '입력한 답이 지워집니다.', plfQuitOk: '그만두기', plfSlot: '{i}번 문제',
      plvEntry: 'PLL 비전', plvEntrySub: 'PLL 9개를 한 번에 보고 한꺼번에 답하기',
      plvTitle: 'PLL 비전', plvLead: '3×3으로 놓인 PLL 9개가 한꺼번에 나옵니다. 한눈에 기억해 두었다가 마지막에 답하세요',
      plvRule: '사라지면 칸 위치별로 버튼을 탭하세요', plvHudLeft: '남은 시간',
      plvAnsLead: '칸 위치별로 답하세요. 칸을 탭하면 그 칸만 다시 고를 수 있어요', plvQuitTitle: 'PLL 비전을 그만둘까요?'
    },
    es: {
      plfEntry: 'PLL Flash', plfEntrySub: 'Memoriza los PLL que pasan en un instante y responde al final',
      plfTitle: 'PLL Flash', plfLead: 'Los PLL aparecen uno tras otro por un instante: recuérdalos y responde al final',
      plfRule: 'Cuando terminen, toca las respuestas en el orden en que salieron',
      plfLevel: 'Dificultad', plfLvEasy: 'Fácil', plfLvNormal: 'Normal', plfLvHard: 'Difícil', plfLvPro: 'Pro',
      plfLvSpec: '{sec} s × {n}',
      plfBest: 'Récord {c}/{n} ({t} s)', plfNoBest: 'Récord —',
      plfNoKan: 'Este modo no da piezas',
      plfHudQ: 'Caso', plfHudLevel: 'Nivel', plfHudTime: 'Tiempo de respuesta', plfHudInput: 'Respondidas',
      plfGo: 'START', plfAnsLead: 'Responde en el orden en que salieron. Toca un número para cambiar solo ese',
      plfUndo: 'Deshacer', plfReset: 'Borrar todo', plfSubmit: 'Enviar', plfRemain: 'Faltan {n}',
      plfScore: 'Aciertos', plfTime: 'Tiempo de respuesta', plfReview: 'Repaso', plfAsked: 'Salió', plfYours: 'Tú',
      plfNewBest: '¡Nuevo récord personal!', plfQuitTitle: '¿Salir de PLL Flash?',
      plfQuitBody: 'Se borrarán tus respuestas.', plfQuitOk: 'Salir', plfSlot: 'Caso {i}',
      plvEntry: 'PLL Visión', plvEntrySub: 'Mira 9 PLL a la vez y responde al final',
      plvTitle: 'PLL Visión', plvLead: 'Nueve PLL aparecen a la vez en una cuadrícula de 3×3: captúralos de un vistazo y responde al final',
      plvRule: 'Cuando desaparezcan, toca la respuesta de cada casilla', plvHudLeft: 'Quedan',
      plvAnsLead: 'Responde por casilla. Toca una casilla para cambiar solo esa', plvQuitTitle: '¿Salir de PLL Visión?'
    },
    id: {
      plfEntry: 'PLL Flash', plfEntrySub: 'Hafalkan PLL yang lewat sekejap, lalu jawab semuanya',
      plfTitle: 'PLL Flash', plfLead: 'PLL muncul satu per satu hanya sekejap — ingat, lalu jawab di akhir',
      plfRule: 'Setelah semuanya lewat, ketuk jawaban sesuai urutan kemunculan',
      plfLevel: 'Tingkat', plfLvEasy: 'Mudah', plfLvNormal: 'Normal', plfLvHard: 'Sulit', plfLvPro: 'Pro',
      plfLvSpec: '{sec} dtk × {n}',
      plfBest: 'Terbaik {c}/{n} ({t} dtk)', plfNoBest: 'Terbaik —',
      plfNoKan: 'Mode ini tidak menambah potong',
      plfHudQ: 'Soal', plfHudLevel: 'Tingkat', plfHudTime: 'Waktu jawab', plfHudInput: 'Terisi',
      plfGo: 'START', plfAnsLead: 'Jawab sesuai urutan. Ketuk nomor untuk mengganti soal itu saja',
      plfUndo: 'Batalkan', plfReset: 'Reset semua', plfSubmit: 'Kirim', plfRemain: '{n} lagi',
      plfScore: 'Benar', plfTime: 'Waktu jawab', plfReview: 'Ulasan', plfAsked: 'Soal', plfYours: 'Kamu',
      plfNewBest: 'Rekor pribadi baru!', plfQuitTitle: 'Keluar dari PLL Flash?',
      plfQuitBody: 'Jawaban yang sudah diisi akan hilang.', plfQuitOk: 'Keluar', plfSlot: 'Soal {i}',
      plvEntry: 'PLL Vision', plvEntrySub: 'Lihat 9 PLL sekaligus, lalu jawab semuanya',
      plvTitle: 'PLL Vision', plvLead: 'Sembilan PLL muncul bersamaan dalam kotak 3×3 — tangkap sekilas, lalu jawab di akhir',
      plvRule: 'Setelah hilang, ketuk jawaban untuk tiap kotak', plvHudLeft: 'Sisa',
      plvAnsLead: 'Jawab untuk tiap kotak. Ketuk kotak untuk mengganti kotak itu saja', plvQuitTitle: 'Keluar dari PLL Vision?'
    },
    ru: {
      plfEntry: 'PLL-вспышка', plfEntrySub: 'Запомните мелькающие PLL и ответьте на все сразу',
      plfTitle: 'PLL-вспышка', plfLead: 'PLL появляются по одному на мгновение — запомните их и ответьте в конце',
      plfRule: 'Когда показ закончится, нажмите ответы в том порядке, в каком они шли',
      plfLevel: 'Сложность', plfLvEasy: 'Лёгкий', plfLvNormal: 'Средний', plfLvHard: 'Сложный', plfLvPro: 'Демон',
      plfLvSpec: '{sec} с × {n}',
      plfBest: 'Рекорд {c}/{n} ({t} с)', plfNoBest: 'Рекорд —',
      plfNoKan: 'В этом режиме кусочки не копятся',
      plfHudQ: 'Случай', plfHudLevel: 'Уровень', plfHudTime: 'Время ответа', plfHudInput: 'Введено',
      plfGo: 'START', plfAnsLead: 'Отвечайте по порядку показа. Нажмите номер, чтобы изменить только его',
      plfUndo: 'Отменить', plfReset: 'Сбросить всё', plfSubmit: 'Готово', plfRemain: 'Осталось {n}',
      plfScore: 'Верно', plfTime: 'Время ответа', plfReview: 'Разбор', plfAsked: 'Было', plfYours: 'Вы',
      plfNewBest: 'Новый личный рекорд!', plfQuitTitle: 'Выйти из PLL-вспышки?',
      plfQuitBody: 'Введённые ответы будут удалены.', plfQuitOk: 'Выйти', plfSlot: 'Случай {i}',
      plvEntry: 'PLL-обзор', plvEntrySub: 'Девять PLL сразу — запомните и ответьте на все',
      plvTitle: 'PLL-обзор', plvLead: 'Девять PLL появляются одновременно в сетке 3×3 — охватите их одним взглядом и ответьте в конце',
      plvRule: 'Когда они исчезнут, нажмите ответ для каждой клетки', plvHudLeft: 'Осталось',
      plvAnsLead: 'Отвечайте по клеткам. Нажмите клетку, чтобы изменить только её', plvQuitTitle: 'Выйти из PLL-обзора?'
    },
    'pt-BR': {
      plfEntry: 'PLL Flash', plfEntrySub: 'Memorize os PLLs que passam num instante e responda no fim',
      plfTitle: 'PLL Flash', plfLead: 'Os PLLs aparecem um a um por um instante — lembre-se deles e responda no fim',
      plfRule: 'Quando acabar, toque as respostas na ordem em que apareceram',
      plfLevel: 'Dificuldade', plfLvEasy: 'Fácil', plfLvNormal: 'Normal', plfLvHard: 'Difícil', plfLvPro: 'Pro',
      plfLvSpec: '{sec} s × {n}',
      plfBest: 'Recorde {c}/{n} ({t} s)', plfNoBest: 'Recorde —',
      plfNoKan: 'Este modo não rende peças',
      plfHudQ: 'Caso', plfHudLevel: 'Nível', plfHudTime: 'Tempo de resposta', plfHudInput: 'Respondidas',
      plfGo: 'START', plfAnsLead: 'Responda na ordem em que apareceram. Toque um número para trocar só aquele',
      plfUndo: 'Desfazer', plfReset: 'Limpar tudo', plfSubmit: 'Enviar', plfRemain: 'Faltam {n}',
      plfScore: 'Acertos', plfTime: 'Tempo de resposta', plfReview: 'Revisão', plfAsked: 'Saiu', plfYours: 'Você',
      plfNewBest: 'Novo recorde pessoal!', plfQuitTitle: 'Sair do PLL Flash?',
      plfQuitBody: 'As respostas digitadas serão apagadas.', plfQuitOk: 'Sair', plfSlot: 'Caso {i}',
      plvEntry: 'PLL Visão', plvEntrySub: 'Veja 9 PLLs de uma vez e responda no fim',
      plvTitle: 'PLL Visão', plvLead: 'Nove PLLs aparecem juntos numa grade 3×3 — capte num relance e responda no fim',
      plvRule: 'Quando sumirem, toque a resposta de cada casa', plvHudLeft: 'Restam',
      plvAnsLead: 'Responda por casa. Toque uma casa para trocar só ela', plvQuitTitle: 'Sair do PLL Visão?'
    }
  };
  if (typeof I18N !== 'undefined' && I18N) {
    Object.keys(PLF_I18N).forEach(function (lang) {
      if (!I18N[lang]) I18N[lang] = {};
      Object.keys(PLF_I18N[lang]).forEach(function (k) {
        if (I18N[lang][k] === undefined) I18N[lang][k] = PLF_I18N[lang][k];
      });
    });
  }
  function tx(key, vars) {
    try { if (typeof t === 'function') { const s = t(key, vars); if (s) return s; } } catch (e) { /* 既定へ */ }
    let s = (PLF_I18N.ja[key] !== undefined) ? PLF_I18N.ja[key] : key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  }
  function circled(i) {   // 0 → ①, 9 → ⑩（鬼の10問まで）
    return i < 20 ? String.fromCharCode(0x2460 + i) : '(' + (i + 1) + ')';
  }

  /* --- 「動きを減らす」設定 --- */
  let reduceMotion = false;
  try {
    const mq = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq) {
      reduceMotion = mq.matches;
      const onMQ = function (e) { reduceMotion = e.matches; };
      if (mq.addEventListener) mq.addEventListener('change', onMQ);
      else if (mq.addListener) mq.addListener(onMQ);
    }
  } catch (err) { /* 判定できなければ通常どおり */ }

  /* ============================================================
     CSS
     回答ボタン・パネル・HUD・リザルトの箱は style.css の .pllt-* を
     そのまま使う。ここに書くのは PLLフラッシュにしか無いものだけ。
     ============================================================ */
  const CSS = [
    /* ---- 画面の土台。PLL検定(#pllt-overlay, 42)の上、確認ダイアログの下 ---- */
    '#plf-overlay{display:none;position:fixed;inset:0;z-index:44;background:#08080b;color:#e6e6ee;',
    '  -webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;touch-action:manipulation;',
    '  opacity:0;transition:opacity .2s ease}',
    '#plf-overlay.show{display:block}',
    '#plf-overlay.in{opacity:1}',
    '.plf-view{display:none}',
    '#plf-overlay[data-view="setup"] .plf-setup,#plf-overlay[data-view="result"] .plf-result{display:flex}',
    '#plf-overlay[data-view="flash"] .plf-flash,#plf-overlay[data-view="answer"] .plf-answer{display:flex}',
    '.plf-setup,.plf-result{position:absolute;inset:0;align-items:center;justify-content:center;padding:12px}',
    '.plf-flash,.plf-answer{position:absolute;inset:0;flex-direction:column;gap:8px;',
    '  padding:calc(8px + env(safe-area-inset-top,0px)) 8px calc(8px + env(safe-area-inset-bottom,0px))}',
    /* それでも画面に収まらない端末（小さい画面・ブラウザのバーが重なる等）では、
       回答画面ごと縦にスクロールできるようにして、確定ボタンまで必ず届くようにする */
    '.plf-answer{overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;',
    '  padding-bottom:calc(14px + env(safe-area-inset-bottom,0px))}',
    '.plf-answer>*{flex-shrink:0}',
    '.plf-answer>.plf-spacer{flex:1 1 auto}',
    '@media (min-width:640px){.plf-flash>*,.plf-answer>*{width:100%;max-width:660px;margin-left:auto;margin-right:auto}}',

    /* ---- 設定：難易度カード（2×2） ---- */
    '.plf-levels{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
    '.plf-level{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:3px;text-align:left;',
    '  padding:10px 11px;border-radius:11px;background:#23232c;border:1px solid #3a3a48;color:#b8b8c4;',
    '  font-family:inherit;cursor:pointer;touch-action:manipulation;transition:color .12s,border-color .12s,background .12s}',
    '.plf-level b{font-size:15px;font-weight:900;color:#e6e6ee;letter-spacing:.02em}',
    '.plf-level span{font-size:11px;font-weight:700;font-variant-numeric:tabular-nums}',
    '.plf-level.on{border-color:var(--tc);background:rgba(var(--tc-rgb),.12);color:var(--tc)}',
    '.plf-level.on b{color:var(--tc)}',
    '.plf-level[data-level="pro"] b::after{content:"\\1F479";margin-left:4px;font-size:13px}',
    '.plf-best{font-size:11px;color:#9a9aac;margin:10px 0 14px;font-variant-numeric:tabular-nums}',
    '.plf-note{font-size:10px;color:#6d6d80;margin:10px 0 0}',

    /* ---- PLL検定の設定画面に差し込む入口 ---- */
    '.plf-entry{width:100%;margin-top:10px;display:flex;align-items:center;gap:10px;text-align:left;',
    '  padding:11px 12px;border-radius:11px;border:1px dashed rgba(var(--tc-rgb),.5);',
    '  background:rgba(var(--tc-rgb),.05);color:#e6e6ee;font-family:inherit;cursor:pointer;touch-action:manipulation}',
    '.plf-entry-ico{flex:none;width:30px;height:30px;border-radius:8px;display:grid;place-items:center;',
    '  background:rgba(var(--tc-rgb),.16);color:var(--tc);font-size:16px}',
    '.plf-entry-txt{display:flex;flex-direction:column;gap:2px;min-width:0}',
    '.plf-entry-txt b{font-size:13px;font-weight:900;color:var(--tc)}',
    '.plf-entry-txt span{font-size:10px;color:#8b8b9c;line-height:1.4}',
    '.plf-entry::after{content:"\\203A";margin-left:auto;font-size:20px;font-weight:900;color:rgba(var(--tc-rgb),.8)}',

    /* ---- フラッシュ画面 ---- */
    '.plf-stage{flex:1 1 auto;min-height:0;position:relative;display:flex;align-items:center;justify-content:center}',
    '.plf-card{position:absolute;opacity:0;pointer-events:none}',
    '.plf-card.on{opacity:1}',
    '.plf-cover{position:absolute;inset:0;display:none;align-items:center;justify-content:center;pointer-events:none}',
    '#plf-overlay.counting .plf-cover{display:flex}',
    '.plf-cover .pllt-cover-mark.go{font-size:clamp(36px,12vw,64px);letter-spacing:.08em}',
    '.plf-dots{flex:none;display:flex;justify-content:center;gap:6px;padding:4px 0 10px}',
    '.plf-dots i{width:8px;height:8px;border-radius:50%;background:#2c2c38;transition:background .1s}',
    '.plf-dots i.done{background:rgba(var(--tc-rgb),.45)}',
    '.plf-dots i.now{background:var(--tc);box-shadow:0 0 8px rgba(var(--tc-rgb),.7)}',

    /* ---- 3Dキューブ。中身は style.css の .pllt-stage / .pllt-cube / .pllt-face を
           そのまま使い、PLL検定と同じ見え方（仰角30°・方位±19°）にする。
           見える2面の出し分けだけは PLL検定が #pllt-overlay[data-angle] で
           やっているので、こちらは1台ずつの data-angle で同じことをする。 ---- */
    '.plf-cube3d[data-angle="FR"] .pllt-face-l,.plf-cube3d[data-angle="FL"] .pllt-face-r{visibility:hidden}',
    '.plf-card .pllt-stage{--pllt-s:clamp(120px,min(52vw,30vh),240px)}',
    '.plf-card.on .pllt-stage{animation:plfPop .16s cubic-bezier(.2,.9,.3,1)}',
    '.plf-rev-row .pllt-stage{--pllt-s:36px;perspective:400px;transition:none}',
    '@keyframes plfPop{from{transform:scale(.96)}to{transform:none}}',

    /* ---- 回答画面 ---- */
    '.plf-ans-top{flex:none;display:flex;flex-direction:column;gap:8px}',
    '.plf-lead{font-size:10.5px;color:#8b8b9c;line-height:1.45;margin:0 2px;text-align:center}',
    /* 上部の解答スロット */
    /* 5問ずつの段に並べる（10問なら 5×2 段。幅は等分なので端末幅に追従） */
    '.plf-slots{display:grid;grid-template-columns:repeat(var(--plf-cols,5),minmax(0,1fr));gap:6px;',
    '  width:100%;max-width:calc(var(--plf-cols,5) * 84px);margin:0 auto}',
    '.plf-slot{position:relative;min-width:0;height:42px;padding:0 4px;display:flex;align-items:center;',
    '  justify-content:center;gap:6px;border-radius:10px;background:#15151b;border:1px solid #2c2c38;color:#e6e6ee;',
    '  font-family:inherit;cursor:pointer;touch-action:manipulation;font-variant-numeric:tabular-nums;',
    '  transition:border-color .12s,background .12s,box-shadow .12s}',
    '.plf-slot i{font-style:normal;font-size:11px;font-weight:900;color:#ff4d6a}',
    '.plf-slot b{font-size:16px;font-weight:900;min-width:1.6em;text-align:center}',
    '.plf-slot b.empty{color:#4a4a5c;letter-spacing:.05em}',
    '.plf-slot.filled{border-color:#3a3a48;background:#1c1c24}',
    '.plf-slot.cur{border-color:var(--tc);background:rgba(var(--tc-rgb),.12);',
    '  box-shadow:0 0 0 1px rgba(var(--tc-rgb),.35),0 0 12px rgba(var(--tc-rgb),.35)}',
    '.plf-slot.cur b.empty{color:var(--tc)}',
    '.plf-slot.cur::after{content:"";position:absolute;left:28%;right:28%;bottom:5px;height:2px;border-radius:2px;',
    '  background:var(--tc);animation:plfCaret 1s steps(1) infinite}',
    '@keyframes plfCaret{50%{opacity:0}}',
    /* 1つ戻る／全リセット */
    '.plf-tools{display:flex;justify-content:flex-end;gap:6px}',
    '.plf-tool{display:flex;align-items:center;gap:5px;padding:7px 11px;border-radius:9px;background:#1c1c22;',
    '  border:1px solid #3a3a48;color:#c8c8d4;font-family:inherit;font-size:12px;font-weight:800;cursor:pointer;',
    '  touch-action:manipulation}',
    '.plf-tool:disabled{opacity:.35;cursor:default}',
    '.plf-tool .k{font-size:14px;line-height:1}',
    '.plf-tools .plf-count{margin-right:auto;align-self:center;font-size:11px;font-weight:800;color:#8b8b9c;',
    '  font-variant-numeric:tabular-nums}',
    '.plf-spacer{flex:1 1 auto;min-height:4px}',
    /* ボタンは PLL検定(.pllt-ans)そのまま。カーソルの無い問題ではキューブが無いぶん少し大きく取る。 */
    '.plf-answer .pllt-group-row{grid-auto-rows:minmax(48px,auto)}',
    '.plf-ans{position:relative;overflow:visible}',
    '.plf-ans-name{position:relative;display:inline-block;transition:transform .12s ease}',
    /* 赤い番号バッジ：文字の左側に重ねる。番号が増えたら文字を少し右へ逃がす */
    '.plf-badge{position:absolute;right:calc(100% + 3px);top:50%;transform:translateY(-50%);white-space:nowrap;',
    '  padding:1px 4px;border-radius:999px;background:#ff2d55;color:#fff;font-size:10px;font-weight:900;line-height:1.35;',
    '  letter-spacing:0;box-shadow:0 0 0 1px rgba(0,0,0,.35),0 0 8px rgba(255,45,85,.55);pointer-events:none}',
    '.plf-badge:empty{display:none}',
    '.plf-ans[data-n="1"] .plf-ans-name{transform:translateX(.5em)}',
    '.plf-ans[data-n="2"] .plf-ans-name{transform:translateX(.95em)}',
    '.plf-ans[data-n="2"] .plf-badge{font-size:9px;padding:1px 3px}',
    '.plf-ans[data-n="3"] .plf-ans-name,.plf-ans[data-n="4"] .plf-ans-name{transform:translateX(1.3em)}',
    '.plf-ans[data-n="3"] .plf-badge,.plf-ans[data-n="4"] .plf-badge{font-size:9px;padding:1px 3px}',
    '.plf-ans.picked{border-color:rgba(255,45,85,.55)}',
    '.plf-answers.full .pllt-ans{opacity:.55}',
    /* 確定ボタン */
    '.plf-submit{flex:none;width:100%;padding:14px;border-radius:11px;border:1px solid var(--tc);font-family:inherit;',
    '  background:linear-gradient(180deg,rgba(var(--tc-rgb),.22),rgba(var(--tc-rgb),.08));color:var(--tc);',
    '  font-size:15px;font-weight:900;letter-spacing:.06em;cursor:pointer;touch-action:manipulation}',
    '.plf-submit.wait{border-color:#3a3a48;background:#1c1c22;color:#8b8b9c}',
    '.plf-submit.ready{box-shadow:0 0 14px rgba(var(--tc-rgb),.35)}',
    '.plf-submit.nudge{animation:plfNudge .32s ease}',
    '@keyframes plfNudge{20%{transform:translateX(-6px)}40%{transform:translateX(5px)}60%{transform:translateX(-3px)}80%{transform:translateX(2px)}}',

    /* ---- リザルト ---- */
    '.plf-newbest{display:inline-block;margin:2px 0 4px;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:900;',
    '  color:#ffd54a;border:1px solid rgba(255,213,74,.55);background:rgba(255,213,74,.1)}',
    '.plf-newbest[hidden]{display:none}',
    '.plf-rev{display:flex;flex-direction:column;gap:6px;text-align:left}',
    '.plf-rev-row{display:grid;grid-template-columns:22px 56px 1fr 26px;align-items:center;gap:10px;padding:7px 9px;',
    '  border-radius:10px;background:#15151b;border:1px solid #2c2c38}',
    '.plf-rev-row.ok{border-color:rgba(79,224,168,.35)}',
    '.plf-rev-row.ng{border-color:rgba(255,106,122,.45);background:rgba(255,106,122,.06)}',
    '.plf-rev-no{font-size:13px;font-weight:900;color:#ff4d6a;text-align:center}',
    '.plf-rev-row .pllt-sticker{box-shadow:inset 0 0 0 .6px rgba(255,255,255,.62)}',
    '.plf-rev-txt{display:flex;flex-direction:column;gap:2px;font-size:12px;font-variant-numeric:tabular-nums;min-width:0}',
    '.plf-rev-txt span{color:#8b8b9c}',
    '.plf-rev-txt b{color:#e6e6ee;font-weight:900;margin-left:4px}',
    '.plf-rev-row.ng .plf-rev-txt .you b{color:#ff9aa6}',
    '.plf-rev-mark{font-size:17px;font-weight:900;text-align:center}',
    '.plf-rev-row.ok .plf-rev-mark{color:#4fe0a8}',
    '.plf-rev-row.ng .plf-rev-mark{color:#ff6a7a}',

    /* 縦に余裕がある端末では、空いたぶんボタンを大きくして押しやすくする */
    /* タブレットなど広い画面では、ボタンを下に貼りつけず中央にまとめる */
    '@media (min-width:640px){.plf-answer{justify-content:center}.plf-spacer{flex:0 0 18px}}',
    '@media (min-height:760px){.plf-answer .pllt-group-row{grid-auto-rows:minmax(54px,auto)}}',
    '@media (max-height:640px){',
    '  .plf-slot{height:36px}.plf-slot b{font-size:14px}',
    '  .plf-answer .pllt-group-row{grid-auto-rows:minmax(40px,auto)}',
    '  .plf-submit{padding:11px}.plf-lead{display:none}',
    '}',
    /* ---- PLLビジョン：3×3に9台を同時に並べる ---- */
    '#plf-overlay[data-mode="vision"] .plf-dots{display:none}',
    '.plv-board{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px}',
    '.plv-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;width:min(96vw,58vh,540px);opacity:0}',
    '.plv-board.on .plv-grid{opacity:1}',
    '.plv-cell{position:relative;aspect-ratio:1;display:flex;align-items:center;justify-content:center;',
    '  border-radius:12px;background:#121218;border:1px solid #2c2c38;overflow:hidden}',
    /* マスの幅の約半分を一辺に。傾けた立方体（一辺×1.45の箱）がマスからはみ出さない大きさ */
    '.plv-cell .pllt-stage{--pllt-s:calc(min(96vw,58vh,540px) / 3 * .5);transition:none}',
    '.plv-no{position:absolute;left:6px;top:4px;font-size:11px;font-weight:900;color:#ff4d6a;line-height:1;z-index:1}',
    /* 残り時間の帯（transform だけで縮める） */
    '.plv-bar{width:min(96vw,58vh,540px);height:4px;border-radius:2px;background:#2c2c38;overflow:hidden;opacity:0}',
    '.plv-bar i{display:block;height:100%;background:var(--tc);transform-origin:0 50%;',
    '  box-shadow:0 0 8px rgba(var(--tc-rgb),.7)}',
    '.plv-board.on .plv-bar{opacity:1}',
    '.plv-board.on .plv-bar i{animation:plvBar var(--plv-ms,3000ms) linear both}',
    '@keyframes plvBar{from{transform:scaleX(1)}to{transform:scaleX(0)}}',
    /* 回答スロットを3×3に。出題のマスと同じ並び */
    /* 縦に収まるよう、ビジョンでは「3×3のスロット」の右横に「入力数・1つ戻る・全リセット」を
       縦に並べて、上の部分を低くする（スロットは3段あるぶん、横に並べると画面からあふれる） */
    '#plf-overlay[data-mode="vision"] .plf-ans-top{display:grid;grid-template-columns:minmax(0,1fr) auto;',
    '  grid-template-areas:"lead lead" "slots tools";column-gap:8px;row-gap:6px;align-items:center}',
    '#plf-overlay[data-mode="vision"] .plf-lead{grid-area:lead}',
    '#plf-overlay[data-mode="vision"] .plf-slots{grid-area:slots;gap:5px;max-width:300px;margin:0 0 0 auto}',
    '#plf-overlay[data-mode="vision"] .plf-tools{grid-area:tools;flex-direction:column;align-items:stretch;gap:6px}',
    '#plf-overlay[data-mode="vision"] .plf-tools .plf-count{margin:0;text-align:center}',
    '#plf-overlay[data-mode="vision"] .plf-tool{justify-content:center;padding:8px 10px}',
    '#plf-overlay[data-mode="vision"] .plf-slot{height:34px}',
    '#plf-overlay[data-mode="vision"] .plf-slot b{font-size:15px}',
    '#plf-overlay[data-mode="vision"] .plf-answer .pllt-group-row{grid-auto-rows:minmax(44px,auto)}',
    /* 説明文は縦に余裕のある端末でだけ出す */
    '@media (max-height:820px){#plf-overlay[data-mode="vision"] .plf-lead{display:none}}',
    /* iPhone の Safari では下のツールバーが画面の上に重なることがあるので、確定ボタンを少し持ち上げる */
    '#plf-overlay[data-mode="vision"] .plf-answer{padding-bottom:calc(40px + env(safe-area-inset-bottom,0px))}',
    /* リザルトのふりかえりも3×3 */
    '.plf-rev.plv-rev{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}',
    '.plv-rev-cell{position:relative;display:flex;flex-direction:column;align-items:center;gap:5px;padding:16px 4px 7px;',
    '  border-radius:10px;background:#15151b;border:1px solid #2c2c38;text-align:center;min-width:0}',
    '.plv-rev-cell.ok{border-color:rgba(79,224,168,.35)}',
    '.plv-rev-cell.ng{border-color:rgba(255,106,122,.45);background:rgba(255,106,122,.06)}',
    '.plv-rev-cell .plf-rev-no{position:absolute;left:5px;top:3px;font-size:12px}',
    '.plv-rev-cell .plf-rev-mark{position:absolute;right:6px;top:2px;font-size:13px}',
    '.plv-rev-cell.ok .plf-rev-mark{color:#4fe0a8}.plv-rev-cell.ng .plf-rev-mark{color:#ff6a7a}',
    '.plv-rev-cell .pllt-stage{--pllt-s:40px;perspective:400px;transition:none}',
    '.plv-rev-cell .pllt-sticker{box-shadow:inset 0 0 0 .6px rgba(255,255,255,.62)}',
    '.plv-rev-name{font-size:15px;font-weight:900;color:#e6e6ee;line-height:1.15}',
    '.plv-rev-you{font-size:10px;color:#8b8b9c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}',
    '.plv-rev-you b{color:#ff9aa6;margin-left:3px}',
    '@media (prefers-reduced-motion: reduce){',
    '  .plv-board.on .plv-bar i{animation:none}',
    '}',
    '@media (prefers-reduced-motion: reduce){',
    '  #plf-overlay{transition-duration:.01ms}',
    '  .plf-card.on .pllt-stage,.plf-submit.nudge,.plf-slot.cur::after{animation:none}',
    '  .plf-ans-name{transition:none}',
    '}'
  ].join('');

  function injectCSS() {
    if (document.getElementById('pll-flash-style')) return;
    const st = document.createElement('style');
    st.id = 'pll-flash-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ============================================================
     保存データ
     best[levelId] = { c: 正解数, n: 問題数, ms: 回答タイム }
     「正解数が多いほう、同じなら速いほう」を自己ベストとする。
     ============================================================ */
  let store = { v: 1, level: 'normal', vlevel: 'normal', plays: 0, vplays: 0, best: {} };
  function loadStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const p = JSON.parse(raw);
      if (!p || typeof p !== 'object') return;
      if (findLevel(LEVELS, p.level)) store.level = p.level;
      if (findLevel(VLEVELS, p.vlevel)) store.vlevel = p.vlevel;
      if (typeof p.vplays === 'number') store.vplays = p.vplays;
      if (typeof p.plays === 'number') store.plays = p.plays;
      if (p.best && typeof p.best === 'object') store.best = p.best;
    } catch (e) { /* 使えない環境ならその場かぎり */ }
  }
  function saveStore() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch (e) { /* 保存不可 */ }
  }
  function findLevel(list, id) {
    for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function isVision() { return state.mode === 'vision'; }
  function levels() { return isVision() ? VLEVELS : LEVELS; }
  function levelById(id) { return findLevel(levels(), id); }
  function curLevelId() { return isVision() ? store.vlevel : store.level; }
  function setLevelId(id) { if (isVision()) store.vlevel = id; else store.level = id; }
  // 自己ベストのキー。フラッシュは従来どおり難易度名だけ、ビジョンは v: を付ける。
  function bestKey(id) { return isVision() ? 'v:' + id : id; }
  // 文言のキー。モードで違うものだけ切り替える。
  function K(name) {
    const V = { title: 'plvTitle', lead: 'plvLead', rule: 'plvRule', ansLead: 'plvAnsLead', quit: 'plvQuitTitle' };
    const F = { title: 'plfTitle', lead: 'plfLead', rule: 'plfRule', ansLead: 'plfAnsLead', quit: 'plfQuitTitle' };
    return (isVision() ? V : F)[name];
  }
  function better(a, b) {   // a が b より良いか
    if (!b) return true;
    if (a.c !== b.c) return a.c > b.c;
    return a.ms < b.ms;
  }
  // 上面の色は PLL検定で選んでいるものを借りる（無ければ黄色）。
  function upColors() {
    try {
      const p = JSON.parse(localStorage.getItem(PLLT_KEY) || 'null');
      const ups = p && p.cfg && Array.isArray(p.cfg.ups) ? p.cfg.ups.filter(function (c) { return SCHEMES[c]; }) : [];
      if (ups.length) return ups;
    } catch (e) { /* 既定へ */ }
    return ['y'];
  }

  /* ============================================================
     出題を作る
     PLL_DATA の模様（後3・左3・右3・前3）を、上から見て時計回りの
     12マスのリングに並べ替えると、AUF はリングを3マスずらすだけになる。
     （PLL検定の toRing / turnU と同じ考え方）
     ============================================================ */
  function toRing(p) {
    return [p[0], p[1], p[2], p[6], p[7], p[8], p[11], p[10], p[9], p[5], p[4], p[3]];
  }
  function turnRing(ring, k) {
    const out = new Array(12);
    for (let i = 0; i < 12; i++) out[(i + 3 * k) % 12] = ring[i];
    return out;
  }
  function makeTargets(level) {
    const src = global.PLL_DATA;
    if (!src) return [];
    const ups = upColors();
    const list = [];
    for (let i = 0; i < level.count; i++) {
      // 同じPLLが複数回出ることもある（回答画面の ①,③ 表示はそのため）。
      const name = NAMES[(Math.random() * NAMES.length) | 0];
      const entry = src[name];
      if (!entry) { i--; continue; }
      // 上面の向き: フラッシュは PLL検定と同じく4通りからランダム（画面には出さない）。
      // ビジョンは回さない（正位置のみ）。
      const auf = isVision() ? 0 : (Math.random() * 4) | 0;
      list.push({
        name: name,
        auf: auf,
        ring: turnRing(toRing(entry[1]), auf),
        up: ups[(Math.random() * ups.length) | 0],
        // 見える2面は FR / FL を1問ごとにランダム（PLL検定と同じ2アングル）
        angle: Math.random() < 0.5 ? 'FR' : 'FL'
      });
    }
    return list;
  }

  /* 3Dキューブを1台つくる（PLL検定の buildCube + showQuestion と同じ塗り方）。
     各面の上段3マスがリングのどこか: その面を正面から見て左→右の順。 */
  const FACE_RING = { R: [5, 4, 3], F: [8, 7, 6], L: [11, 10, 9] };
  const ANGLES = { FR: -19, FL: 19 };       // PLL検定の ANGLES[*].spin と同じ
  function makeCube(item) {
    const sc = SCHEMES[item.up] || SCHEMES.y;
    const stage = document.createElement('div');
    stage.className = 'pllt-stage plf-cube3d';
    stage.dataset.angle = item.angle;
    stage.setAttribute('aria-hidden', 'true');
    const cube = document.createElement('div');
    cube.className = 'pllt-cube';
    cube.style.setProperty('--pllt-spin', ANGLES[item.angle] + 'deg');
    ['u', 'f', 'r', 'l'].forEach(function (face) {
      const f = document.createElement('div');
      f.className = 'pllt-face pllt-face-' + face;
      const key = face.toUpperCase();
      for (let i = 0; i < 9; i++) {
        const c = document.createElement('i');
        c.className = 'pllt-sticker';
        let col;
        if (face === 'u') col = sc.U;
        else if (i < 3) col = sc[item.ring[FACE_RING[key][i]]];
        else col = sc[key];
        c.style.background = COLOR_HEX[col] || '#33333f';
        f.appendChild(c);
      }
      cube.appendChild(f);
    });
    stage.appendChild(cube);
    return stage;
  }

  /* ============================================================
     状態
     ============================================================ */
  const state = {
    mode: 'flash',    // 'flash' | 'vision'
    view: 'setup',
    level: LEVELS[1],
    targetPLLs: [],
    userAnswers: [],
    cursor: 0,
    history: [],
    ansStart: 0,      // 回答画面に入った（または再開した）時刻
    ansAccum: 0,      // 一時停止までにたまった時間
    ansMs: 0,         // 確定した回答タイム
    paused: false
  };
  let timers = [];
  let rafId = 0;
  function later(fn, ms) { const id = setTimeout(fn, ms); timers.push(id); return id; }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  /* ============================================================
     DOM
     ============================================================ */
  let root = null;
  const el = {};
  function $(id) { return document.getElementById(id); }

  const HTML =
    /* ---- 設定 ---- */
    '<section class="plf-view plf-setup">' +
      '<div class="pllt-panel">' +
        '<button class="alg-panel-close-x" id="plf-close-setup" aria-label="">✕</button>' +
        '<div class="pllt-panel-scroll">' +
          '<h2 id="plf-title"></h2>' +
          '<p class="pllt-lead" id="plf-lead"></p>' +
          '<p class="pllt-rule" id="plf-rule"></p>' +
          '<div class="pllt-field">' +
            '<span class="pllt-field-label" id="plf-level-label"></span>' +
            '<div class="plf-levels" id="plf-levels" role="group"></div>' +
          '</div>' +
          '<p class="plf-best" id="plf-best"></p>' +
          '<button class="pllt-start" id="plf-start"></button>' +
          '<p class="plf-note" id="plf-note"></p>' +
        '</div>' +
      '</div>' +
    '</section>' +

    /* ---- フラッシュ ---- */
    '<section class="plf-view plf-flash">' +
      '<header class="pllt-hud">' +
        '<button class="pllt-quit" id="plf-quit-flash" aria-label="">✕</button>' +
        '<div class="pllt-hud-item"><span class="pllt-hud-label" id="plf-hud-q-label"></span><b id="plf-hud-q">0 / 0</b></div>' +
        '<div class="pllt-hud-item pllt-hud-time"><span class="pllt-hud-label" id="plf-hud-lv-label"></span><b id="plf-hud-lv">—</b></div>' +
      '</header>' +
      '<div class="plf-stage" id="plf-stage">' +
        '<div class="plf-cover" aria-hidden="true"><span class="pllt-cover-mark" id="plf-cover-mark">3</span></div>' +
        '<div class="plv-board" id="plv-board" aria-hidden="true">' +
          '<div class="plv-grid" id="plv-grid"></div>' +
          '<div class="plv-bar"><i></i></div>' +
        '</div>' +
      '</div>' +
      '<div class="plf-dots" id="plf-dots" aria-hidden="true"></div>' +
    '</section>' +

    /* ---- 回答 ---- */
    '<section class="plf-view plf-answer">' +
      '<header class="pllt-hud">' +
        '<button class="pllt-quit" id="plf-quit-answer" aria-label="">✕</button>' +
        '<div class="pllt-hud-item"><span class="pllt-hud-label" id="plf-hud-lv2-label"></span><b id="plf-hud-lv2">—</b></div>' +
        '<div class="pllt-hud-item pllt-hud-time"><span class="pllt-hud-label" id="plf-hud-t-label"></span><b id="plf-hud-t">0.00</b></div>' +
      '</header>' +
      '<div class="plf-ans-top">' +
        '<p class="plf-lead" id="plf-ans-lead"></p>' +
        '<div class="plf-slots" id="plf-slots" role="group"></div>' +
        '<div class="plf-tools">' +
          '<span class="plf-count" id="plf-count"></span>' +
          '<button type="button" class="plf-tool ui-pressable" id="plf-undo"><span class="k" aria-hidden="true">⌫</span><span id="plf-undo-txt"></span></button>' +
          '<button type="button" class="plf-tool ui-pressable" id="plf-reset"><span class="k" aria-hidden="true">↺</span><span id="plf-reset-txt"></span></button>' +
        '</div>' +
      '</div>' +
      '<div class="plf-spacer"></div>' +
      '<div class="pllt-answers plf-answers" id="plf-answers"></div>' +
      '<button type="button" class="plf-submit" id="plf-submit"></button>' +
    '</section>' +

    /* ---- リザルト ---- */
    '<section class="plf-view plf-result">' +
      '<div class="pllt-panel">' +
        '<button class="alg-panel-close-x" id="plf-close-result" aria-label="">✕</button>' +
        '<div class="pllt-panel-scroll">' +
          '<h2 id="plf-res-title"></h2>' +
          '<span class="plf-newbest" id="plf-newbest" hidden></span>' +
          '<div class="pllt-summary">' +
            '<div class="pllt-sum-cell"><span class="pllt-sum-label" id="plf-res-score-label"></span>' +
              '<b><span id="plf-res-score">0/0</span><i id="plf-res-acc"></i></b></div>' +
            '<div class="pllt-sum-cell"><span class="pllt-sum-label" id="plf-res-time-label"></span>' +
              '<b><span id="plf-res-time">0.00</span><i>s</i></b></div>' +
            '<div class="pllt-sum-cell"><span class="pllt-sum-label" id="plf-res-lv-label"></span>' +
              '<b><span id="plf-res-lv">—</span></b></div>' +
          '</div>' +
          '<h3 class="pllt-res-title" id="plf-rev-title"></h3>' +
          '<div class="plf-rev" id="plf-rev"></div>' +
          '<div class="pllt-result-actions">' +
            '<button class="action-btn" id="plf-back"></button>' +
            '<button class="action-btn" id="plf-retry"></button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</section>';

  let built = false;
  function build() {
    if (built) return true;
    if (!document.body) return false;
    injectCSS();
    // index.html に空の入れ物を置いてある（ゲーム側のオーバーレイ一覧が
    // 起動時に見つけられるように）。無ければ作る。
    root = document.getElementById('plf-overlay') || document.createElement('div');
    root.id = 'plf-overlay';
    root.hidden = false;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'plf-title');
    root.dataset.view = 'setup';
    root.innerHTML = HTML;
    if (!root.parentNode) document.body.appendChild(root);
    built = true;

    buildLevels();
    buildAnswerGrid();

    const on = function (id, fn) { const e = $(id); if (e) e.addEventListener('click', fn); };
    on('plf-close-setup', close);
    on('plf-close-result', close);
    on('plf-start', start);
    on('plf-retry', start);
    on('plf-back', function () { paintSetup(); setView('setup'); });
    on('plf-quit-flash', function () { abortFlash(); paintSetup(); setView('setup'); });
    on('plf-quit-answer', quitAnswer);
    on('plf-undo', undo);
    on('plf-reset', resetAll);
    on('plf-submit', submit);

    $('plf-slots').addEventListener('click', function (e) {
      const s = e.target.closest ? e.target.closest('.plf-slot') : null;
      if (!s) return;
      state.cursor = parseInt(s.dataset.i, 10);
      haptic(6);
      paintAnswer();
    });

    // Esc / Backspace。PLL検定の Esc（document で受けている）より先に
    // window の capture で拾って止める。止めないと下の検定まで閉じてしまう。
    global.addEventListener('keydown', function (e) {
      if (!root || !root.classList.contains('show')) return;
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopImmediatePropagation();
        if (state.view === 'answer') quitAnswer();
        else if (state.view === 'flash') { abortFlash(); paintSetup(); setView('setup'); }
        else close();
      } else if (e.key === 'Backspace' && state.view === 'answer') {
        e.preventDefault(); e.stopImmediatePropagation();
        undo();
      }
    }, true);

    // アプリを離れたとき:
    //  - 表示中は中断して設定へ（離れているあいだに表示が流れてしまうため）
    //  - 回答中は止めない。止めるとホーム画面に逃げて考える時間を稼げて
    //    しまうので、離れていた時間もそのまま回答タイムに入れる。
    document.addEventListener('visibilitychange', function () {
      if (!root || !root.classList.contains('show')) return;
      if (document.visibilityState === 'hidden' && state.view === 'flash') {
        abortFlash(); paintSetup(); setView('setup');
      }
    });

    if (typeof onI18n === 'function') onI18n(function () {
      if (!root || !root.classList.contains('show')) return;
      paintTexts();
      if (state.view === 'setup') paintSetup();
      if (state.view === 'answer') paintAnswer();
      if (state.view === 'result') renderResult(false);
    });
    return true;
  }

  function buildLevels() {
    const box = $('plf-levels');
    LEVELS.forEach(function (lv) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'plf-level';
      b.dataset.level = lv.id;
      b.innerHTML = '<b></b><span></span>';
      box.appendChild(b);
    });
    box.addEventListener('click', function (e) {
      const b = e.target.closest ? e.target.closest('.plf-level') : null;
      if (!b) return;
      setLevelId(b.dataset.level);
      saveStore();
      haptic(6);
      paintSetup();
    });
  }

  /* PLL検定の buildAnswerGrid() と同じ組み方。違いは、ボタンの中に
     名前の箱と赤い番号バッジを入れていることだけ。 */
  function buildAnswerGrid() {
    const grid = $('plf-answers');
    GROUPS.forEach(function (g) {
      const block = document.createElement('div');
      block.className = 'pllt-group ' + g.cls;
      const label = document.createElement('span');
      label.className = 'pllt-group-label';
      label.dataset.key = g.key;
      block.appendChild(label);
      const row = document.createElement('div');
      row.className = 'pllt-group-row';
      row.style.gridTemplateColumns = 'repeat(' + g.cols + ', 1fr)';
      g.names.forEach(function (name) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pllt-ans plf-ans';
        btn.dataset.name = name;
        btn.setAttribute('aria-label', 'PLL ' + name);
        btn.innerHTML = '<span class="plf-ans-name">' + name + '<span class="plf-badge"></span></span>';
        row.appendChild(btn);
      });
      block.appendChild(row);
      grid.appendChild(block);
    });
    grid.addEventListener('click', function (e) {
      const btn = e.target.closest ? e.target.closest('.plf-ans') : null;
      if (btn) input(btn.dataset.name);
    });
  }

  /* ============================================================
     文言の流し込み
     ============================================================ */
  function setText(id, s) { const e = $(id); if (e) e.textContent = s; }
  function paintTexts() {
    const closeLabel = tx('close');
    ['plf-close-setup', 'plf-close-result', 'plf-quit-flash', 'plf-quit-answer'].forEach(function (id) {
      const e = $(id); if (e) e.setAttribute('aria-label', closeLabel);
    });
    setText('plf-title', tx(K('title')));
    setText('plf-lead', tx(K('lead')));
    setText('plf-rule', tx(K('rule')));
    setText('plf-level-label', tx('plfLevel'));
    setText('plf-start', tx('plltStart'));
    setText('plf-note', tx('plfNoKan'));
    setText('plf-hud-q-label', tx(isVision() ? 'plvHudLeft' : 'plfHudQ'));
    setText('plf-hud-lv-label', tx('plfHudLevel'));
    setText('plf-hud-lv2-label', tx('plfHudLevel'));
    setText('plf-hud-t-label', tx('plfHudTime'));
    setText('plf-ans-lead', tx(K('ansLead')));
    setText('plf-undo-txt', tx('plfUndo'));
    setText('plf-reset-txt', tx('plfReset'));
    setText('plf-res-title', tx('plltResultTitle'));
    setText('plf-newbest', tx('plfNewBest'));
    setText('plf-res-score-label', tx('plfScore'));
    setText('plf-res-time-label', tx('plfTime'));
    setText('plf-res-lv-label', tx('plfHudLevel'));
    setText('plf-rev-title', tx('plfReview'));
    setText('plf-back', tx('plltBack'));
    setText('plf-retry', tx('plltRetry'));
    document.querySelectorAll('#plf-answers .pllt-group-label').forEach(function (e) {
      if (e.dataset.key) e.textContent = tx(e.dataset.key);
    });
  }

  function fmtSec(ms) { return (ms / 1000).toFixed(2); }

  function paintSetup() {
    const cur = levelById(curLevelId()) || levels()[1];
    state.level = cur;
    document.querySelectorAll('#plf-levels .plf-level').forEach(function (b) {
      const lv = levelById(b.dataset.level);
      const on = lv === cur;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
      b.querySelector('b').textContent = tx(lv.key);
      const sec = String(lv.showMs / 1000);
      b.querySelector('span').textContent = tx('plfLvSpec', { sec: sec, n: lv.count });
    });
    const best = store.best[bestKey(cur.id)];
    setText('plf-best', best
      ? tx('plfBest', { c: best.c, n: best.n, t: fmtSec(best.ms) })
      : tx('plfNoBest'));
  }

  function setView(name) {
    state.view = name;
    if (root) root.dataset.view = name;
  }

  /* ============================================================
     開く／閉じる
     ============================================================ */
  function open(mode) {
    if (!build()) return;
    if (!global.PLL_DATA) return;   // 3D初期化前（PLLの表がまだ無い）
    state.mode = mode === 'vision' ? 'vision' : 'flash';
    root.dataset.mode = state.mode;
    paintTexts();
    paintSetup();
    setView('setup');
    root.classList.add('show');
    void root.offsetWidth;
    root.classList.add('in');
  }
  function close() {
    abortFlash();
    stopClock();
    if (!root) return;
    root.classList.remove('in');
    // フェードアウトしてから消す（動きを減らす設定なら即時）
    later(function () { if (!root.classList.contains('in')) root.classList.remove('show'); }, reduceMotion ? 0 : 200);
  }

  /* ============================================================
     ① カウントダウン → ② フラッシュ
     ============================================================ */
  function start() {
    const level = levelById(curLevelId()) || levels()[1];
    state.level = level;
    state.targetPLLs = makeTargets(level);
    if (!state.targetPLLs.length) return;
    state.userAnswers = state.targetPLLs.map(function () { return null; });
    state.cursor = 0;
    state.history = [];
    state.ansAccum = 0;
    state.ansMs = 0;
    if (isVision()) store.vplays++; else store.plays++;
    saveStore();

    // 図は先に全部作っておく。0.25秒の鬼でも、表示は class を1つ
    // 付け外しするだけになり、描画の遅れで見える時間が削れない。
    const stage = $('plf-stage');
    stage.querySelectorAll('.plf-card').forEach(function (c) { c.remove(); });
    const vgrid = $('plv-grid');
    vgrid.innerHTML = '';
    $('plv-board').classList.remove('on');
    if (isVision()) {
      // 9台を3×3に組んでおき、合図とともに一斉に出す。
      state.targetPLLs.forEach(function (item, i) {
        const cell = document.createElement('div');
        cell.className = 'plv-cell';
        cell.innerHTML = '<span class="plv-no">' + (i + 1) + '</span>';
        cell.appendChild(makeCube(item));
        vgrid.appendChild(cell);
      });
      $('plv-board').style.setProperty('--plv-ms', level.showMs + 'ms');
      setText('plf-hud-q', (level.showMs / 1000).toFixed(1));
      setText('plf-hud-lv', tx(level.key));
      setView('flash');
      requestAnimationFrame(function () { countdown(showVision); });
      return;
    }
    state.targetPLLs.forEach(function (item, i) {
      const card = document.createElement('div');
      card.className = 'plf-card';
      card.dataset.i = String(i);
      card.appendChild(makeCube(item));
      stage.appendChild(card);
    });
    const dots = $('plf-dots');
    dots.innerHTML = state.targetPLLs.map(function () { return '<i></i>'; }).join('');

    setText('plf-hud-q', '0 / ' + state.targetPLLs.length);
    setText('plf-hud-lv', tx(level.key));
    setView('flash');
    requestAnimationFrame(function () { countdown(function () { flashAt(0); }); });
  }

  function countdown(done) {
    const mark = $('plf-cover-mark');
    let n = COUNT_FROM;
    root.classList.add('counting');
    const tick = function (text, go) {
      mark.textContent = text;
      mark.classList.toggle('go', !!go);
      mark.classList.remove('tick');
      void mark.offsetWidth;
      if (!reduceMotion) mark.classList.add('tick');
    };
    const step = function () {
      if (n > 0) {
        tick(String(n));
        beep(440, 0.11);
        n--;
        later(step, COUNT_STEP);
      } else {
        tick(tx('plfGo'), true);
        beep(660, 0.16);
        haptic(12);
        later(function () {
          root.classList.remove('counting');
          mark.classList.remove('tick', 'go');
          done();
        }, GO_MS);
      }
    };
    step();
  }

  function flashAt(i) {
    const list = state.targetPLLs;
    const cards = $('plf-stage').querySelectorAll('.plf-card');
    const dots = $('plf-dots').children;
    cards.forEach(function (c) { c.classList.remove('on'); });
    if (i >= list.length) {
      later(goAnswer, TAIL_MS);
      return;
    }
    for (let k = 0; k < dots.length; k++) {
      dots[k].className = k < i ? 'done' : (k === i ? 'now' : '');
    }
    setText('plf-hud-q', (i + 1) + ' / ' + list.length);
    cards[i].classList.add('on');
    // 実際に画面に出たフレームから数える（描画待ちのぶん短くならないように）。
    requestAnimationFrame(function () {
      later(function () {
        cards[i].classList.remove('on');
        if (i + 1 >= list.length) { flashAt(i + 1); return; }
        later(function () { flashAt(i + 1); }, state.level.gapMs);
      }, state.level.showMs);
    });
  }

  /* PLLビジョン：9台を一斉に出し、時間が来たら一斉に消す */
  function showVision() {
    const board = $('plv-board');
    const ms = state.level.showMs;
    board.classList.add('on');
    const left = $('plf-hud-q');
    requestAnimationFrame(function () {
      const t0 = performance.now();
      const loop = function () {
        if (state.view !== 'flash' || !board.classList.contains('on')) return;
        const rest = Math.max(0, ms - (performance.now() - t0));
        left.textContent = (rest / 1000).toFixed(1);
        rafId = requestAnimationFrame(loop);
      };
      stopRaf();
      rafId = requestAnimationFrame(loop);
      later(function () {
        board.classList.remove('on');
        stopRaf();
        left.textContent = '0.0';
        later(goAnswer, TAIL_MS);
      }, ms);
    });
  }

  function abortFlash() {
    clearTimers();
    stopRaf();
    const board = $('plv-board');
    if (board) board.classList.remove('on');
    if (root) root.classList.remove('counting');
    const stage = $('plf-stage');
    if (stage) stage.querySelectorAll('.plf-card.on').forEach(function (c) { c.classList.remove('on'); });
  }

  /* ============================================================
     ③ 回答
     ============================================================ */
  function goAnswer() {
    const dots = $('plf-dots').children;
    for (let k = 0; k < dots.length; k++) dots[k].className = 'done';
    buildSlots();
    setText('plf-hud-lv2', tx(state.level.key));
    setText('plf-hud-t', '0.00');
    setView('answer');
    paintAnswer();
    state.ansAccum = 0;
    resumeClock();
  }

  function buildSlots() {
    const box = $('plf-slots');
    box.innerHTML = '';
    // ビジョンは出題のマスと同じ3×3、フラッシュは5個ずつの段。
    box.style.setProperty('--plf-cols', String(isVision() ? 3 : Math.min(5, state.targetPLLs.length)));
    state.targetPLLs.forEach(function (_, i) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'plf-slot';
      b.dataset.i = String(i);
      b.innerHTML = '<i>' + (i + 1) + '</i><b></b>';
      box.appendChild(b);
    });
  }

  function nextEmpty(from) {
    const n = state.userAnswers.length;
    for (let k = 1; k <= n; k++) {
      const j = (from + k) % n;
      if (state.userAnswers[j] === null) return j;
    }
    return -1;
  }

  /* パームボタンを押した：カーソルのスロットに書き込み、次の空きへ進む */
  function input(name) {
    if (state.view !== 'answer') return;
    if (state.cursor < 0) {           // 全部埋まっている → 確定を促す
      nudgeSubmit();
      return;
    }
    const i = state.cursor;
    state.history.push({ type: 'set', i: i, prev: state.userAnswers[i] });
    state.userAnswers[i] = name;
    state.cursor = nextEmpty(i);
    haptic(8);
    paintAnswer();
  }

  /* 1つ戻る：直前の操作を1つだけ取り消す（全リセットも1手として戻せる） */
  function undo() {
    if (state.view !== 'answer') return;
    const h = state.history.pop();
    if (!h) return;
    if (h.type === 'set') {
      state.userAnswers[h.i] = h.prev;
      state.cursor = h.i;
    } else if (h.type === 'reset') {
      state.userAnswers = h.snapshot;
      state.cursor = h.cursor;
    }
    haptic(6);
    paintAnswer();
  }

  function resetAll() {
    if (state.view !== 'answer') return;
    if (!state.userAnswers.some(function (a) { return a !== null; })) return;
    state.history.push({ type: 'reset', snapshot: state.userAnswers.slice(), cursor: state.cursor });
    state.userAnswers = state.userAnswers.map(function () { return null; });
    state.cursor = 0;
    haptic([8, 30, 8]);
    paintAnswer();
  }

  function remaining() {
    let n = 0;
    state.userAnswers.forEach(function (a) { if (a === null) n++; });
    return n;
  }

  function paintAnswer() {
    const ans = state.userAnswers;
    // 上部スロット
    const slots = $('plf-slots').children;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i], v = ans[i];
      const b = s.querySelector('b');
      b.textContent = v || '__';
      b.classList.toggle('empty', !v);
      s.classList.toggle('filled', !!v);
      s.classList.toggle('cur', i === state.cursor);
      s.setAttribute('aria-label', tx('plfSlot', { i: i + 1 }) + (v ? ' : ' + v : ''));
      s.setAttribute('aria-pressed', String(i === state.cursor));
    }
    // ボタンの赤い番号（①, ③ …）
    const picks = {};
    ans.forEach(function (v, i) { if (v) (picks[v] = picks[v] || []).push(i); });
    document.querySelectorAll('#plf-answers .plf-ans').forEach(function (btn) {
      const list = picks[btn.dataset.name] || [];
      btn.dataset.n = String(list.length);
      btn.classList.toggle('picked', list.length > 0);
      btn.querySelector('.plf-badge').textContent = list.map(circled).join(',');
    });
    const left = remaining();
    $('plf-answers').classList.toggle('full', state.cursor < 0);
    setText('plf-count', tx('plfHudInput') + ' ' + (ans.length - left) + ' / ' + ans.length);
    $('plf-undo').disabled = state.history.length === 0;
    $('plf-reset').disabled = left === ans.length;
    const sub = $('plf-submit');
    sub.textContent = left ? tx('plfRemain', { n: left }) : tx('plfSubmit');
    sub.classList.toggle('wait', left > 0);
    sub.classList.toggle('ready', left === 0);
  }

  function nudgeSubmit() {
    const sub = $('plf-submit');
    sub.classList.remove('nudge');
    void sub.offsetWidth;
    sub.classList.add('nudge');
    haptic([10, 30, 10]);
  }

  /* --- 回答タイム（一時停止できる） --- */
  function resumeClock() {
    if (state.view !== 'answer') return;
    state.paused = false;
    // 端末によってはバックグラウンド中に performance.now() が進まないので、
    // 回答タイムは実時間（Date.now）で測る。離れていた時間も必ず入る。
    state.ansStart = Date.now();
    const elT = $('plf-hud-t');
    const loop = function () {
      if (state.view !== 'answer' || state.paused) return;
      elT.textContent = fmtSec(state.ansAccum + Date.now() - state.ansStart);
      rafId = requestAnimationFrame(loop);
    };
    stopRaf();
    rafId = requestAnimationFrame(loop);
  }
  function pauseClock() {
    if (state.paused) return;
    state.ansAccum += Date.now() - state.ansStart;
    state.paused = true;
    stopRaf();
  }
  function stopClock() { if (!state.paused && state.view === 'answer') pauseClock(); stopRaf(); }
  function stopRaf() { if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } }

  function quitAnswer() {
    const doQuit = function () { stopClock(); paintSetup(); setView('setup'); };
    const touched = state.userAnswers.some(function (a) { return a !== null; });
    if (touched && typeof askConfirm === 'function') {
      askConfirm({
        title: tx(K('quit')), body: tx('plfQuitBody'),
        ok: tx('plfQuitOk'), cancel: tx('plltBack'), onOk: doQuit
      });
      return;
    }
    doQuit();
  }

  function submit() {
    if (state.view !== 'answer') return;
    if (remaining() > 0) {
      // 空きがあるときは、最初の空きにカーソルを合わせて知らせる
      state.cursor = state.userAnswers.indexOf(null);
      paintAnswer();
      nudgeSubmit();
      return;
    }
    pauseClock();
    state.ansMs = state.ansAccum;
    stopRaf();
    renderResult(true);
    setView('result');
  }

  /* ============================================================
     ④ リザルト
     ============================================================ */
  function renderResult(fresh) {
    const list = state.targetPLLs, ans = state.userAnswers;
    let c = 0;
    list.forEach(function (it, i) { if (ans[i] === it.name) c++; });
    const n = list.length;

    let isBest = false;
    if (fresh) {
      const rec = { c: c, n: n, ms: Math.round(state.ansMs) };
      if (better(rec, store.best[bestKey(state.level.id)])) {
        store.best[bestKey(state.level.id)] = rec;
        isBest = true;
      }
      saveStore();
      beep(c === n ? 880 : 520, 0.18);
      haptic(c === n ? [10, 40, 10, 40, 20] : 14);
      state.lastBest = isBest;
    } else {
      isBest = !!state.lastBest;
    }

    setText('plf-res-score', c + '/' + n);
    setText('plf-res-acc', '(' + Math.round(c / n * 100) + '%)');
    setText('plf-res-time', fmtSec(state.ansMs));
    setText('plf-res-lv', tx(state.level.key));
    const nb = $('plf-newbest');
    nb.hidden = !isBest;

    const rev = $('plf-rev');
    rev.innerHTML = '';
    rev.classList.toggle('plv-rev', isVision());
    if (isVision()) {
      // 出題と同じ3×3で、どのマスを当て、どのマスを外したかを見せる。
      list.forEach(function (it, i) {
        const ok = ans[i] === it.name;
        const cell = document.createElement('div');
        cell.className = 'plv-rev-cell ' + (ok ? 'ok' : 'ng');
        cell.innerHTML = '<span class="plf-rev-no">' + circled(i) + '</span>' +
          '<span class="plf-rev-mark">' + (ok ? '○' : '✕') + '</span>';
        cell.appendChild(makeCube(it));
        const nm = document.createElement('span');
        nm.className = 'plv-rev-name';
        nm.textContent = it.name;
        cell.appendChild(nm);
        if (!ok) {
          const you = document.createElement('span');
          you.className = 'plv-rev-you';
          you.innerHTML = tx('plfYours') + '<b></b>';
          you.querySelector('b').textContent = ans[i] || '—';
          cell.appendChild(you);
        }
        rev.appendChild(cell);
      });
      const sc = root.querySelector('.plf-result .pllt-panel-scroll');
      if (fresh && sc) sc.scrollTop = 0;
      return;
    }
    list.forEach(function (it, i) {
      const ok = ans[i] === it.name;
      const row = document.createElement('div');
      row.className = 'plf-rev-row ' + (ok ? 'ok' : 'ng');
      const no = document.createElement('span');
      no.className = 'plf-rev-no';
      no.textContent = circled(i);
      const txt = document.createElement('div');
      txt.className = 'plf-rev-txt';
      const asked = document.createElement('span');
      asked.innerHTML = tx('plfAsked') + '<b></b>';
      asked.querySelector('b').textContent = it.name;
      const you = document.createElement('span');
      you.className = 'you';
      you.innerHTML = tx('plfYours') + '<b></b>';
      you.querySelector('b').textContent = ans[i] || '—';
      txt.appendChild(asked);
      txt.appendChild(you);
      const mark = document.createElement('span');
      mark.className = 'plf-rev-mark';
      mark.textContent = ok ? '○' : '✕';
      row.appendChild(no);
      row.appendChild(makeCube(it));
      row.appendChild(txt);
      row.appendChild(mark);
      rev.appendChild(row);
    });
    const scroll = root.querySelector('.plf-result .pllt-panel-scroll');
    if (fresh && scroll) scroll.scrollTop = 0;
  }

  /* ============================================================
     手ざわり（音・振動）— PLL検定と同じ控えめなサイン波
     ============================================================ */
  let actx = null;
  function beep(freq, dur) {
    try {
      if (!actx) actx = global.__audioCtx ? global.__audioCtx()
        : new (global.AudioContext || global.webkitAudioContext)();
      if (!actx) return;
      if (actx.state !== 'running') actx.resume();
      const now = actx.currentTime;
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq, now);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.05, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(now); o.stop(now + dur + 0.03);
      if (global.__audioIdleSuspend) global.__audioIdleSuspend(actx);
    } catch (e) { /* 音が出せない環境では黙る */ }
  }
  function haptic(p) {
    try {
      if (typeof triggerHaptics === 'function') triggerHaptics(p);
      else if (navigator.vibrate) navigator.vibrate(p);
    } catch (e) { /* 非対応 */ }
  }

  /* ============================================================
     入口：PLL検定の設定画面、スタートボタンの下に差し込む
     ============================================================ */
  const ENTRIES = [
    { id: 'plf-entry', mode: 'flash',  ico: '⚡', title: 'plfEntry', sub: 'plfEntrySub' },
    { id: 'plv-entry', mode: 'vision', ico: '👁', title: 'plvEntry', sub: 'plvEntrySub' }
  ];
  function paintEntry() {
    ENTRIES.forEach(function (en) {
      const b = $(en.id);
      if (!b) return;
      b.querySelector('b').textContent = tx(en.title);
      b.querySelector('.plf-entry-txt span').textContent = tx(en.sub);
    });
  }
  function addEntry() {
    if ($('plf-entry')) return;
    let anchor = $('pllt-start');
    if (!anchor) return;
    injectCSS();
    ENTRIES.forEach(function (en) {
      const b = document.createElement('button');
      b.type = 'button';
      b.id = en.id;
      b.className = 'plf-entry ui-pressable';
      b.innerHTML = '<span class="plf-entry-ico" aria-hidden="true">' + en.ico + '</span>' +
        '<span class="plf-entry-txt"><b></b><span></span></span>';
      anchor.insertAdjacentElement('afterend', b);
      anchor = b;
      b.addEventListener('click', function () { open(en.mode); });
    });
    paintEntry();
    if (typeof onI18n === 'function') onI18n(paintEntry);
  }

  function boot() {
    loadStore();
    // 入口はトレーニングのハブ画面（pll-hub.js）に移した。
    // 検定の設定画面に⚡/👁の行を足すのは、ハブが無いときだけ。
    if (!global.PllHub) addEntry();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // 拡張・確認用（外から開く・状態を覗く）
  global.PllFlash = {
    open: function () { open('flash'); },
    openVision: function () { open('vision'); },
    close: close,
    LEVELS: LEVELS,
    getState: function () {
      return {
        mode: state.mode, view: state.view, level: state.level.id,
        targetPLLs: state.targetPLLs.map(function (x) { return x.name; }),
        userAnswers: state.userAnswers.slice(), cursor: state.cursor
      };
    },
    // シェア画像（pll-share.js）用：各問題のキューブの色。画面の3Dキューブと同じ塗り方。
    // { angle:'FR'|'FL', U:'#hex', F:[9], R:[9], L:[9] } の配列
    getCubes: function () {
      return state.targetPLLs.map(function (item) {
        const sc = SCHEMES[item.up] || SCHEMES.y;
        const out = { angle: item.angle, U: COLOR_HEX[sc.U] };
        ['F', 'R', 'L'].forEach(function (key) {
          const arr = [];
          for (let i = 0; i < 9; i++) {
            const col = i < 3 ? sc[item.ring[FACE_RING[key][i]]] : sc[key];
            arr.push(COLOR_HEX[col] || '#33333f');
          }
          out[key] = arr;
        });
        return out;
      });
    }
  };
})(window);
