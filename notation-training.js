/* ============================================================
   notation-training.js — 「回転記号トレーニング」
   ------------------------------------------------------------
   初心者が手元のリアルなキューブを使いながら、R / R' のような
   回転記号を覚えるための、ドロワーから開く独立モーダル。

   cube-feel.js / help-glow.js / photo-skin.js と同じで、CSS も文言も
   自分で持つ。index.html 側の書き足しは「読み込む1行」だけで、
   ドロワーのボタン自体もこのファイルが自分で差し込む。
   style.css と i18n.js は無改変。

   【教える内容の芯】
   記号にプライム(')が付かなければ「その面を正面から見て時計回りに
   90°」、付けば反時計回り。これは Singmaster notation そのものの
   定義なので、どの面についても例外なく成り立つ。M(中央のスライス)
   だけは「面」を持たないので、Lと同じ向き、という決め方になっている
   （前面が下へ流れる＝M、上へ流れる＝M'）。

   図解は「面の展開図(ネット)」を使う。どの面も必ず正面から描かれる
   ため、視点の取り違えによる回転方向の誤りが原理的に起きない
   （3Dで斜めに描いた図に矢印を重ねる方式だと、見る角度によっては
   時計回り/反時計回りの見え方が逆転してしまう危険がある）。

   【保存する内容】
   端末のlocalStorageに、記号ごとの正誤数とコースごとの学習/テスト
   進捗だけを持つ。どこにも送信しない。
   ============================================================ */
(function (global) {
  'use strict';

  /* ============================================================
     面のデータ
     ============================================================ */
  var FACES = {
    U: { color: '#f2f2f2', nameKey: 'ntFaceU' },
    D: { color: '#ffd21f', nameKey: 'ntFaceD' },
    F: { color: '#28b463', nameKey: 'ntFaceF' },
    B: { color: '#2e6fe0', nameKey: 'ntFaceB' },
    R: { color: '#e0342f', nameKey: 'ntFaceR' },
    L: { color: '#ff8c1a', nameKey: 'ntFaceL' },
    M: { color: '#9aa0ad', nameKey: 'ntFaceM' }
  };

  var COURSES = [
    { id: 'rl', steps: [['R', "R'"], ['L', "L'"]], descKey: 'ntCourse1Desc' },
    { id: 'ud', steps: [['U', "U'"], ['D', "D'"]], descKey: 'ntCourse2Desc' },
    { id: 'fb', steps: [['F', "F'"], ['B', "B'"]], descKey: 'ntCourse3Desc' },
    { id: 'm',  steps: [['M', "M'"]],              descKey: 'ntCourse4Desc' }
  ];
  var REVIEW_ID = 'review';

  function baseFace(sym) { return sym.charAt(0); }
  function isPrime(sym) { return sym.length > 1; }

  /* ============================================================
     多言語（既存 I18N は無改変。無いキーだけ足すマージ方式）
     ============================================================ */
  var NT_I18N = {
    ja: {
      ntMenuLabel: '回転記号トレーニング',
      ntCourse1Desc: '左右の面',
      ntCourse2Desc: '上下の面',
      ntCourse3Desc: '前後の面',
      ntCourse4Desc: '中央のスライス面',
      ntCourseReviewTitle: '振り返り',
      ntCourseReviewDesc: '苦手な記号を復習',
      ntStatusNotStarted: '未着手',
      ntStatusProgress: '進捗 {pct}%',
      ntStatusCleared: 'クリア！',
      ntReviewCount: '苦手 {n}件',
      ntPrepBanner: '目の前に本物のキューブを準備してね！',
      ntCoreRuleText: "「'」が付かない記号は、その面を正面から見て時計回りに90°。「'」が付く記号は反時計回りに90°。",
      ntFaceU: '上面 (U)', ntFaceD: '下面 (D)', ntFaceF: '前面 (F)', ntFaceB: '背面 (B)',
      ntFaceR: '右面 (R)', ntFaceL: '左面 (L)', ntFaceM: '真ん中の列 (M)',
      ntDirCW: '時計回り', ntDirCCW: '反時計回り', ntDirDown: '下向き', ntDirUp: '上向き',
      ntExplainTpl: '{face}を、正面から見て{dir}に90°回そう',
      ntExplainMCW: 'Mは、真ん中の列を正面から下へ流す（Lと同じ向き）',
      ntExplainMCCW: "M'は、真ん中の列を正面から上へ流す（L'と同じ向き）",
      ntTipSeeL: 'キューブを持ち替えて、左面をまっすぐ自分に向けてみよう',
      ntTipSeeD: 'キューブを少し傾けて、下面をのぞいてみよう',
      ntTipSeeB: 'キューブをくるっと半回転させて、背面を正面に持ってこよう',
      ntStepLabel: 'ステップ {n} / {total}',
      ntUnderstood: '理解した！次のセットへ',
      ntQuizIntroTitle: '確認テスト',
      ntQuizIntroBody: '学んだ記号がどれだけ身についたか、試してみよう',
      ntQuizStart: 'テストをはじめる',
      ntQuizProgress: '問題 {n} / {total}',
      ntQuizQuestionDir: '「{sym}」を回す向きは？',
      ntQuizQuestionFace: '「{sym}」が回すのはどの面？',
      ntQuizCorrect: '正解！',
      ntQuizWrong: '残念、正解は「{ans}」',
      ntQuizNext: '次の問題へ',
      ntQuizFinish: '結果を見る',
      ntResultTitle: '振り返り',
      ntResultScore: '正答率 {pct}%（{correct}/{total}問）',
      ntResultWeakTitle: '苦手な記号',
      ntResultWeakNone: '苦手な記号はありません。素晴らしい！',
      ntResultRetry: 'もう一度練習する',
      ntResultToCourses: 'コース選択へ',
      ntReviewEmptyTitle: 'まだ苦手な記号はありません',
      ntReviewEmptyBody: '各コースを練習すると、間違えた記号がここに集まります',
      ntReviewStart: '復習をはじめる',
      ntClose: '閉じる', ntAriaOpen: '回転記号トレーニングを開く', ntAriaClose: '閉じる'
    },
    en: {
      ntMenuLabel: 'Notation Training',
      ntCourse1Desc: 'Left & right faces',
      ntCourse2Desc: 'Top & bottom faces',
      ntCourse3Desc: 'Front & back faces',
      ntCourse4Desc: 'Middle slice',
      ntCourseReviewTitle: 'Review',
      ntCourseReviewDesc: 'Practice the moves you find tricky',
      ntStatusNotStarted: 'Not started',
      ntStatusProgress: '{pct}% done',
      ntStatusCleared: 'Cleared!',
      ntReviewCount: '{n} tricky move(s)',
      ntPrepBanner: 'Grab your real cube before you start!',
      ntCoreRuleText: "A letter with no ' means turn that face clockwise (looking straight at it) by 90°. A letter with ' means counter-clockwise.",
      ntFaceU: 'Top (U)', ntFaceD: 'Bottom (D)', ntFaceF: 'Front (F)', ntFaceB: 'Back (B)',
      ntFaceR: 'Right (R)', ntFaceL: 'Left (L)', ntFaceM: 'Middle layer (M)',
      ntDirCW: 'Clockwise', ntDirCCW: 'Counter-clockwise', ntDirDown: 'Downward', ntDirUp: 'Upward',
      ntExplainTpl: 'Look at the {face} face head-on and turn it {dir} by 90°.',
      ntExplainMCW: 'M slides the middle column downward on the front face (same direction as L).',
      ntExplainMCCW: "M' slides the middle column upward on the front face (same direction as L').",
      ntTipSeeL: 'Turn the cube in your hands so the left face is facing you.',
      ntTipSeeD: 'Tilt the cube a bit so you can peek at the bottom.',
      ntTipSeeB: 'Spin the whole cube around so the back face faces you.',
      ntStepLabel: 'Step {n} of {total}',
      ntUnderstood: 'Got it! Next pair',
      ntQuizIntroTitle: 'Quick quiz',
      ntQuizIntroBody: "Let's see how well the moves stuck.",
      ntQuizStart: 'Start the quiz',
      ntQuizProgress: 'Question {n} of {total}',
      ntQuizQuestionDir: 'Which way does "{sym}" turn?',
      ntQuizQuestionFace: 'Which face does "{sym}" turn?',
      ntQuizCorrect: 'Correct!',
      ntQuizWrong: 'Not quite — the answer is "{ans}"',
      ntQuizNext: 'Next question',
      ntQuizFinish: 'See results',
      ntResultTitle: 'Review',
      ntResultScore: '{pct}% correct ({correct}/{total})',
      ntResultWeakTitle: 'Moves to work on',
      ntResultWeakNone: 'No weak spots — great job!',
      ntResultRetry: 'Practice again',
      ntResultToCourses: 'Back to courses',
      ntReviewEmptyTitle: 'No tricky moves yet',
      ntReviewEmptyBody: 'Practice the courses and anything you miss will show up here.',
      ntReviewStart: 'Start review',
      ntClose: 'Close', ntAriaOpen: 'Open notation training', ntAriaClose: 'Close'
    },
    'zh-CN': {
      ntMenuLabel: '转动符号训练',
      ntCourse1Desc: '左右面',
      ntCourse2Desc: '上下面',
      ntCourse3Desc: '前后面',
      ntCourse4Desc: '中间层',
      ntCourseReviewTitle: '复习',
      ntCourseReviewDesc: '复习不擅长的符号',
      ntStatusNotStarted: '未开始',
      ntStatusProgress: '进度 {pct}%',
      ntStatusCleared: '已完成！',
      ntReviewCount: '{n} 个不擅长',
      ntPrepBanner: '开始前请准备好你的魔方！',
      ntCoreRuleText: '不带"\'"的符号：正对这个面顺时针转90°。带"\'"的符号：逆时针转90°。',
      ntFaceU: '上面 (U)', ntFaceD: '下面 (D)', ntFaceF: '前面 (F)', ntFaceB: '后面 (B)',
      ntFaceR: '右面 (R)', ntFaceL: '左面 (L)', ntFaceM: '中间层 (M)',
      ntDirCW: '顺时针', ntDirCCW: '逆时针', ntDirDown: '向下', ntDirUp: '向上',
      ntExplainTpl: '正对着{face}看，然后{dir}转90°。',
      ntExplainMCW: 'M：正面看中间一列向下流动（和L方向相同）。',
      ntExplainMCCW: "M'：正面看中间一列向上流动（和L'方向相同）。",
      ntTipSeeL: '把魔方转一下，让左面正对着你。',
      ntTipSeeD: '把魔方稍微倾斜，看一眼底面。',
      ntTipSeeB: '把整个魔方转半圈，让后面对着你。',
      ntStepLabel: '第 {n} / {total} 步',
      ntUnderstood: '明白了！下一组',
      ntQuizIntroTitle: '小测验',
      ntQuizIntroBody: '来看看学到的符号记住了多少吧',
      ntQuizStart: '开始测验',
      ntQuizProgress: '第 {n} / {total} 题',
      ntQuizQuestionDir: '"{sym}" 是往哪个方向转？',
      ntQuizQuestionFace: '"{sym}" 转动的是哪个面？',
      ntQuizCorrect: '答对了！',
      ntQuizWrong: '答案是"{ans}"',
      ntQuizNext: '下一题',
      ntQuizFinish: '查看结果',
      ntResultTitle: '复习',
      ntResultScore: '正确率 {pct}%（{correct}/{total}题）',
      ntResultWeakTitle: '不擅长的符号',
      ntResultWeakNone: '没有不擅长的符号，太棒了！',
      ntResultRetry: '再练一次',
      ntResultToCourses: '返回课程选择',
      ntReviewEmptyTitle: '还没有不擅长的符号',
      ntReviewEmptyBody: '练习各个课程后，答错的符号会汇总到这里。',
      ntReviewStart: '开始复习',
      ntClose: '关闭', ntAriaOpen: '打开转动符号训练', ntAriaClose: '关闭'
    },
    'zh-TW': {
      ntMenuLabel: '轉動符號訓練',
      ntCourse1Desc: '左右面',
      ntCourse2Desc: '上下面',
      ntCourse3Desc: '前後面',
      ntCourse4Desc: '中間層',
      ntCourseReviewTitle: '複習',
      ntCourseReviewDesc: '複習不擅長的符號',
      ntStatusNotStarted: '未開始',
      ntStatusProgress: '進度 {pct}%',
      ntStatusCleared: '已完成！',
      ntReviewCount: '{n} 個不擅長',
      ntPrepBanner: '開始前請準備好你的魔方！',
      ntCoreRuleText: '不帶"\'"的符號：正對這個面順時針轉90°。帶"\'"的符號：逆時針轉90°。',
      ntFaceU: '上面 (U)', ntFaceD: '下面 (D)', ntFaceF: '前面 (F)', ntFaceB: '後面 (B)',
      ntFaceR: '右面 (R)', ntFaceL: '左面 (L)', ntFaceM: '中間層 (M)',
      ntDirCW: '順時針', ntDirCCW: '逆時針', ntDirDown: '向下', ntDirUp: '向上',
      ntExplainTpl: '正對著{face}看，然後{dir}轉90°。',
      ntExplainMCW: 'M：正面看中間一列向下流動（和L方向相同）。',
      ntExplainMCCW: "M'：正面看中間一列向上流動（和L'方向相同）。",
      ntTipSeeL: '把魔方轉一下，讓左面正對著你。',
      ntTipSeeD: '把魔方稍微傾斜，看一眼底面。',
      ntTipSeeB: '把整個魔方轉半圈，讓後面對著你。',
      ntStepLabel: '第 {n} / {total} 步',
      ntUnderstood: '明白了！下一組',
      ntQuizIntroTitle: '小測驗',
      ntQuizIntroBody: '來看看學到的符號記住了多少吧',
      ntQuizStart: '開始測驗',
      ntQuizProgress: '第 {n} / {total} 題',
      ntQuizQuestionDir: '"{sym}" 是往哪個方向轉？',
      ntQuizQuestionFace: '"{sym}" 轉動的是哪個面？',
      ntQuizCorrect: '答對了！',
      ntQuizWrong: '答案是"{ans}"',
      ntQuizNext: '下一題',
      ntQuizFinish: '查看結果',
      ntResultTitle: '複習',
      ntResultScore: '正確率 {pct}%（{correct}/{total}題）',
      ntResultWeakTitle: '不擅長的符號',
      ntResultWeakNone: '沒有不擅長的符號，太棒了！',
      ntResultRetry: '再練一次',
      ntResultToCourses: '返回課程選擇',
      ntReviewEmptyTitle: '還沒有不擅長的符號',
      ntReviewEmptyBody: '練習各個課程後，答錯的符號會匯總到這裡。',
      ntReviewStart: '開始複習',
      ntClose: '關閉', ntAriaOpen: '打開轉動符號訓練', ntAriaClose: '關閉'
    },
    ko: {
      ntMenuLabel: '회전 기호 트레이닝',
      ntCourse1Desc: '좌우 면',
      ntCourse2Desc: '상하 면',
      ntCourse3Desc: '앞뒤 면',
      ntCourse4Desc: '중간 층',
      ntCourseReviewTitle: '복습',
      ntCourseReviewDesc: '약한 기호 복습하기',
      ntStatusNotStarted: '시작 전',
      ntStatusProgress: '진행률 {pct}%',
      ntStatusCleared: '완료!',
      ntReviewCount: '약한 기호 {n}개',
      ntPrepBanner: '시작하기 전에 실제 큐브를 준비하세요!',
      ntCoreRuleText: "' 가 없는 기호는 그 면을 정면으로 보고 시계 방향으로 90도. ' 가 붙으면 반시계 방향으로 90도.",
      ntFaceU: '윗면 (U)', ntFaceD: '아랫면 (D)', ntFaceF: '앞면 (F)', ntFaceB: '뒷면 (B)',
      ntFaceR: '오른쪽 면 (R)', ntFaceL: '왼쪽 면 (L)', ntFaceM: '중간 층 (M)',
      ntDirCW: '시계 방향', ntDirCCW: '반시계 방향', ntDirDown: '아래로', ntDirUp: '위로',
      ntExplainTpl: '{face}을(를) 정면으로 보고 {dir}으로 90도 돌려보자.',
      ntExplainMCW: 'M은 앞면 기준 가운데 열이 아래로 흐릅니다 (L과 같은 방향).',
      ntExplainMCCW: "M'은 앞면 기준 가운데 열이 위로 흐릅니다 (L'과 같은 방향).",
      ntTipSeeL: '큐브를 돌려 왼쪽 면이 정면을 보게 해보세요.',
      ntTipSeeD: '큐브를 살짝 기울여 아랫면을 들여다보세요.',
      ntTipSeeB: '큐브를 반 바퀴 돌려 뒷면이 정면을 보게 해보세요.',
      ntStepLabel: '{n} / {total} 단계',
      ntUnderstood: '이해했어요! 다음 세트로',
      ntQuizIntroTitle: '확인 테스트',
      ntQuizIntroBody: '배운 기호가 얼마나 익숙해졌는지 확인해보세요',
      ntQuizStart: '테스트 시작',
      ntQuizProgress: '{n} / {total} 문제',
      ntQuizQuestionDir: '"{sym}"을(를) 돌리는 방향은?',
      ntQuizQuestionFace: '"{sym}"이(가) 돌리는 면은?',
      ntQuizCorrect: '정답!',
      ntQuizWrong: '아쉬워요, 정답은 "{ans}"',
      ntQuizNext: '다음 문제',
      ntQuizFinish: '결과 보기',
      ntResultTitle: '복습',
      ntResultScore: '정답률 {pct}% ({correct}/{total}문제)',
      ntResultWeakTitle: '약한 기호',
      ntResultWeakNone: '약한 기호가 없어요. 훌륭해요!',
      ntResultRetry: '다시 연습하기',
      ntResultToCourses: '코스 선택으로',
      ntReviewEmptyTitle: '아직 약한 기호가 없어요',
      ntReviewEmptyBody: '코스를 연습하면 틀린 기호가 여기에 모입니다.',
      ntReviewStart: '복습 시작',
      ntClose: '닫기', ntAriaOpen: '회전 기호 트레이닝 열기', ntAriaClose: '닫기'
    },
    es: {
      ntMenuLabel: 'Entrenamiento de notación',
      ntCourse1Desc: 'Caras izquierda y derecha',
      ntCourse2Desc: 'Caras superior e inferior',
      ntCourse3Desc: 'Caras frontal y trasera',
      ntCourse4Desc: 'Capa central',
      ntCourseReviewTitle: 'Repaso',
      ntCourseReviewDesc: 'Repasa los movimientos que se te resisten',
      ntStatusNotStarted: 'Sin empezar',
      ntStatusProgress: '{pct}% completado',
      ntStatusCleared: '¡Completado!',
      ntReviewCount: '{n} movimiento(s) débil(es)',
      ntPrepBanner: '¡Ten a mano tu cubo real antes de empezar!',
      ntCoreRuleText: "Una letra sin ' significa girar esa cara en sentido horario (mirándola de frente) 90°. Con ' es sentido antihorario.",
      ntFaceU: 'Arriba (U)', ntFaceD: 'Abajo (D)', ntFaceF: 'Frontal (F)', ntFaceB: 'Trasera (B)',
      ntFaceR: 'Derecha (R)', ntFaceL: 'Izquierda (L)', ntFaceM: 'Capa central (M)',
      ntDirCW: 'Horario', ntDirCCW: 'Antihorario', ntDirDown: 'Hacia abajo', ntDirUp: 'Hacia arriba',
      ntExplainTpl: 'Mira la cara {face} de frente y gírala en sentido {dir} 90°.',
      ntExplainMCW: 'M desliza la columna central hacia abajo en la cara frontal (igual que L).',
      ntExplainMCCW: "M' desliza la columna central hacia arriba en la cara frontal (igual que L').",
      ntTipSeeL: 'Gira el cubo en tus manos para que la cara izquierda quede de frente.',
      ntTipSeeD: 'Inclina un poco el cubo para ver la cara inferior.',
      ntTipSeeB: 'Gira todo el cubo media vuelta para que la cara trasera quede de frente.',
      ntStepLabel: 'Paso {n} de {total}',
      ntUnderstood: '¡Entendido! Siguiente par',
      ntQuizIntroTitle: 'Prueba rápida',
      ntQuizIntroBody: 'Veamos qué tan bien se te quedaron los movimientos.',
      ntQuizStart: 'Empezar la prueba',
      ntQuizProgress: 'Pregunta {n} de {total}',
      ntQuizQuestionDir: '¿Hacia dónde gira "{sym}"?',
      ntQuizQuestionFace: '¿Qué cara gira "{sym}"?',
      ntQuizCorrect: '¡Correcto!',
      ntQuizWrong: 'Casi — la respuesta es "{ans}"',
      ntQuizNext: 'Siguiente pregunta',
      ntQuizFinish: 'Ver resultados',
      ntResultTitle: 'Repaso',
      ntResultScore: '{pct}% correcto ({correct}/{total})',
      ntResultWeakTitle: 'Movimientos a mejorar',
      ntResultWeakNone: 'Sin puntos débiles — ¡muy bien!',
      ntResultRetry: 'Practicar de nuevo',
      ntResultToCourses: 'Volver a los cursos',
      ntReviewEmptyTitle: 'Aún no hay movimientos débiles',
      ntReviewEmptyBody: 'Practica los cursos y lo que falles aparecerá aquí.',
      ntReviewStart: 'Empezar el repaso',
      ntClose: 'Cerrar', ntAriaOpen: 'Abrir entrenamiento de notación', ntAriaClose: 'Cerrar'
    },
    id: {
      ntMenuLabel: 'Latihan Notasi Putaran',
      ntCourse1Desc: 'Sisi kiri & kanan',
      ntCourse2Desc: 'Sisi atas & bawah',
      ntCourse3Desc: 'Sisi depan & belakang',
      ntCourse4Desc: 'Lapisan tengah',
      ntCourseReviewTitle: 'Ulasan',
      ntCourseReviewDesc: 'Latih notasi yang masih sulit',
      ntStatusNotStarted: 'Belum mulai',
      ntStatusProgress: '{pct}% selesai',
      ntStatusCleared: 'Selesai!',
      ntReviewCount: '{n} notasi sulit',
      ntPrepBanner: 'Siapkan kubus aslimu sebelum mulai!',
      ntCoreRuleText: "Huruf tanpa ' berarti putar sisi itu searah jarum jam (dilihat langsung) 90°. Huruf dengan ' berarti berlawanan arah jarum jam.",
      ntFaceU: 'Atas (U)', ntFaceD: 'Bawah (D)', ntFaceF: 'Depan (F)', ntFaceB: 'Belakang (B)',
      ntFaceR: 'Kanan (R)', ntFaceL: 'Kiri (L)', ntFaceM: 'Lapisan tengah (M)',
      ntDirCW: 'Searah jarum jam', ntDirCCW: 'Berlawanan arah jarum jam', ntDirDown: 'Ke bawah', ntDirUp: 'Ke atas',
      ntExplainTpl: 'Lihat sisi {face} langsung dari depan, lalu putar {dir} 90°.',
      ntExplainMCW: 'M menggeser kolom tengah ke bawah di sisi depan (searah dengan L).',
      ntExplainMCCW: "M' menggeser kolom tengah ke atas di sisi depan (searah dengan L').",
      ntTipSeeL: 'Putar kubus di tanganmu supaya sisi kiri menghadapmu.',
      ntTipSeeD: 'Miringkan kubus sedikit untuk mengintip sisi bawah.',
      ntTipSeeB: 'Putar seluruh kubus setengah putaran supaya sisi belakang menghadapmu.',
      ntStepLabel: 'Langkah {n} dari {total}',
      ntUnderstood: 'Paham! Lanjut pasangan berikutnya',
      ntQuizIntroTitle: 'Kuis singkat',
      ntQuizIntroBody: 'Yuk lihat seberapa hafal notasinya.',
      ntQuizStart: 'Mulai kuis',
      ntQuizProgress: 'Soal {n} dari {total}',
      ntQuizQuestionDir: 'Ke arah mana "{sym}" diputar?',
      ntQuizQuestionFace: 'Sisi mana yang diputar oleh "{sym}"?',
      ntQuizCorrect: 'Benar!',
      ntQuizWrong: 'Belum tepat — jawabannya "{ans}"',
      ntQuizNext: 'Soal berikutnya',
      ntQuizFinish: 'Lihat hasil',
      ntResultTitle: 'Ulasan',
      ntResultScore: '{pct}% benar ({correct}/{total})',
      ntResultWeakTitle: 'Notasi yang perlu dilatih',
      ntResultWeakNone: 'Tidak ada yang sulit — mantap!',
      ntResultRetry: 'Latihan lagi',
      ntResultToCourses: 'Kembali ke daftar kursus',
      ntReviewEmptyTitle: 'Belum ada notasi yang sulit',
      ntReviewEmptyBody: 'Latih tiap kursus, notasi yang salah akan muncul di sini.',
      ntReviewStart: 'Mulai ulasan',
      ntClose: 'Tutup', ntAriaOpen: 'Buka latihan notasi putaran', ntAriaClose: 'Tutup'
    },
    ru: {
      ntMenuLabel: 'Тренировка обозначений',
      ntCourse1Desc: 'Левая и правая грани',
      ntCourse2Desc: 'Верхняя и нижняя грани',
      ntCourse3Desc: 'Передняя и задняя грани',
      ntCourse4Desc: 'Средний слой',
      ntCourseReviewTitle: 'Повторение',
      ntCourseReviewDesc: 'Повторить сложные ходы',
      ntStatusNotStarted: 'Не начато',
      ntStatusProgress: 'Прогресс {pct}%',
      ntStatusCleared: 'Пройдено!',
      ntReviewCount: 'Сложных: {n}',
      ntPrepBanner: 'Возьмите настоящий кубик перед началом!',
      ntCoreRuleText: "Буква без ' — поворот этой грани по часовой стрелке (если смотреть на неё прямо) на 90°. С ' — против часовой стрелки.",
      ntFaceU: 'Верх (U)', ntFaceD: 'Низ (D)', ntFaceF: 'Перед (F)', ntFaceB: 'Зад (B)',
      ntFaceR: 'Право (R)', ntFaceL: 'Лево (L)', ntFaceM: 'Средний слой (M)',
      ntDirCW: 'По часовой стрелке', ntDirCCW: 'Против часовой стрелки', ntDirDown: 'Вниз', ntDirUp: 'Вверх',
      ntExplainTpl: 'Посмотрите прямо на грань {face} и поверните её {dir} на 90°.',
      ntExplainMCW: 'M сдвигает средний столбец на передней грани вниз (как и L).',
      ntExplainMCCW: "M' сдвигает средний столбец на передней грани вверх (как и L').",
      ntTipSeeL: 'Поверните кубик в руках так, чтобы левая грань была перед вами.',
      ntTipSeeD: 'Слегка наклоните кубик, чтобы заглянуть на нижнюю грань.',
      ntTipSeeB: 'Поверните весь кубик на пол-оборота, чтобы задняя грань оказалась перед вами.',
      ntStepLabel: 'Шаг {n} из {total}',
      ntUnderstood: 'Понятно! Следующая пара',
      ntQuizIntroTitle: 'Проверочный тест',
      ntQuizIntroBody: 'Посмотрим, как хорошо запомнились ходы.',
      ntQuizStart: 'Начать тест',
      ntQuizProgress: 'Вопрос {n} из {total}',
      ntQuizQuestionDir: 'В какую сторону крутится «{sym}»?',
      ntQuizQuestionFace: 'Какую грань поворачивает «{sym}»?',
      ntQuizCorrect: 'Верно!',
      ntQuizWrong: 'Не совсем — правильный ответ «{ans}»',
      ntQuizNext: 'Следующий вопрос',
      ntQuizFinish: 'Смотреть результат',
      ntResultTitle: 'Повторение',
      ntResultScore: 'Правильных {pct}% ({correct}/{total})',
      ntResultWeakTitle: 'Ходы для отработки',
      ntResultWeakNone: 'Слабых мест нет — отлично!',
      ntResultRetry: 'Потренироваться ещё раз',
      ntResultToCourses: 'К выбору курса',
      ntReviewEmptyTitle: 'Пока нет сложных ходов',
      ntReviewEmptyBody: 'Пройдите курсы, и ошибки соберутся здесь.',
      ntReviewStart: 'Начать повторение',
      ntClose: 'Закрыть', ntAriaOpen: 'Открыть тренировку обозначений', ntAriaClose: 'Закрыть'
    },
    'pt-BR': {
      ntMenuLabel: 'Treino de notação',
      ntCourse1Desc: 'Faces esquerda e direita',
      ntCourse2Desc: 'Faces de cima e de baixo',
      ntCourse3Desc: 'Faces da frente e de trás',
      ntCourse4Desc: 'Camada do meio',
      ntCourseReviewTitle: 'Revisão',
      ntCourseReviewDesc: 'Revise os movimentos mais difíceis',
      ntStatusNotStarted: 'Não iniciado',
      ntStatusProgress: '{pct}% concluído',
      ntStatusCleared: 'Concluído!',
      ntReviewCount: '{n} movimento(s) difícil(is)',
      ntPrepBanner: 'Pegue seu cubo de verdade antes de começar!',
      ntCoreRuleText: "Uma letra sem ' significa girar essa face no sentido horário (olhando de frente para ela) em 90°. Com ' é sentido anti-horário.",
      ntFaceU: 'Cima (U)', ntFaceD: 'Baixo (D)', ntFaceF: 'Frente (F)', ntFaceB: 'Trás (B)',
      ntFaceR: 'Direita (R)', ntFaceL: 'Esquerda (L)', ntFaceM: 'Camada do meio (M)',
      ntDirCW: 'Sentido horário', ntDirCCW: 'Sentido anti-horário', ntDirDown: 'Para baixo', ntDirUp: 'Para cima',
      ntExplainTpl: 'Olhe direto para a face {face} e gire no sentido {dir} em 90°.',
      ntExplainMCW: 'M desliza a coluna do meio para baixo na face da frente (mesmo sentido de L).',
      ntExplainMCCW: "M' desliza a coluna do meio para cima na face da frente (mesmo sentido de L').",
      ntTipSeeL: 'Gire o cubo nas mãos até a face esquerda ficar de frente pra você.',
      ntTipSeeD: 'Incline um pouco o cubo para dar uma olhada na face de baixo.',
      ntTipSeeB: 'Gire o cubo inteiro meia volta até a face de trás ficar de frente pra você.',
      ntStepLabel: 'Passo {n} de {total}',
      ntUnderstood: 'Entendi! Próximo par',
      ntQuizIntroTitle: 'Teste rápido',
      ntQuizIntroBody: 'Vamos ver o quanto os movimentos ficaram.',
      ntQuizStart: 'Começar o teste',
      ntQuizProgress: 'Pergunta {n} de {total}',
      ntQuizQuestionDir: 'Para que lado "{sym}" gira?',
      ntQuizQuestionFace: 'Qual face "{sym}" gira?',
      ntQuizCorrect: 'Isso aí!',
      ntQuizWrong: 'Quase — a resposta é "{ans}"',
      ntQuizNext: 'Próxima pergunta',
      ntQuizFinish: 'Ver resultado',
      ntResultTitle: 'Revisão',
      ntResultScore: '{pct}% de acerto ({correct}/{total})',
      ntResultWeakTitle: 'Movimentos para treinar',
      ntResultWeakNone: 'Nenhum ponto fraco — mandou bem!',
      ntResultRetry: 'Praticar de novo',
      ntResultToCourses: 'Voltar aos cursos',
      ntReviewEmptyTitle: 'Ainda não há movimentos difíceis',
      ntReviewEmptyBody: 'Pratique os cursos e o que você errar aparece aqui.',
      ntReviewStart: 'Começar revisão',
      ntClose: 'Fechar', ntAriaOpen: 'Abrir treino de notação', ntAriaClose: 'Fechar'
    }
  };

  if (typeof I18N !== 'undefined' && I18N) {
    Object.keys(NT_I18N).forEach(function (lang) {
      if (!I18N[lang]) I18N[lang] = {};
      Object.keys(NT_I18N[lang]).forEach(function (k) {
        if (I18N[lang][k] === undefined) I18N[lang][k] = NT_I18N[lang][k];
      });
    });
  }

  // index.html 側の t() は別スコープなので、ここでは I18N を自分で引く。
  function T(key, vars) {
    var lang = 'ja';
    try { lang = localStorage.getItem('rubiks-cube-lang') || 'ja'; } catch (e) { /* 既定のまま */ }
    if (typeof I18N === 'undefined' || !I18N) return key;
    var dict = I18N[lang] || {};
    var s = (dict[key] !== undefined) ? dict[key] : (I18N.ja || {})[key];
    if (s === undefined) return key;
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        s = s.split('{' + k + '}').join(vars[k]);
      });
    }
    return s;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ============================================================
     進捗の保存（この端末の中だけ）
     ============================================================ */
  var STORAGE_KEY = 'rubiks-cube-notation-training';

  function loadProgress() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (p && typeof p === 'object') {
          return { symbols: p.symbols || {}, courses: p.courses || {} };
        }
      }
    } catch (e) { /* 壊れたデータは初期化して続行 */ }
    return { symbols: {}, courses: {} };
  }
  function saveProgress(p) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch (e) { /* 保存できなくても致命的ではない */ }
  }

  function weakSymbols(prog) {
    var entries = Object.keys(prog.symbols || {}).map(function (sym) {
      var s = prog.symbols[sym];
      return { sym: sym, seen: s.seen || 0, correct: s.correct || 0, acc: s.seen ? (s.correct || 0) / s.seen : 0 };
    }).filter(function (e) { return e.seen > 0 && e.acc < 0.7; });
    entries.sort(function (a, b) { return a.acc - b.acc; });
    return entries.slice(0, 10).map(function (e) { return e.sym; });
  }

  function courseStatus(course, prog) {
    var c = (prog.courses && prog.courses[course.id]) || { learnedSteps: 0, quizBest: 0 };
    var learnFrac = course.steps.length ? (c.learnedSteps || 0) / course.steps.length : 0;
    var quizFrac = (c.quizBest || 0) / 100;
    if (learnFrac <= 0 && quizFrac <= 0) return { label: T('ntStatusNotStarted'), cls: 'is-new' };
    if (learnFrac >= 1 && quizFrac >= 0.8) return { label: T('ntStatusCleared'), cls: 'is-cleared' };
    var pct = Math.round(learnFrac * 50 + quizFrac * 50);
    return { label: T('ntStatusProgress', { pct: pct }), cls: 'is-progress' };
  }

  /* ============================================================
     CSS（style.css には触らず、ここで注入する）
     ============================================================ */
  var CSS = [
    '#nt-overlay{position:fixed;inset:0;z-index:10180;display:none;',
    '  align-items:center;justify-content:center;padding:12px;',
    '  background:rgba(8,8,11,.9);opacity:0;transition:opacity .2s ease}',
    '#nt-overlay.show{display:flex}',
    '#nt-overlay.show-visible{opacity:1}',

    '.nt-panel{width:min(440px,100%);max-height:96svh;overflow:auto;',
    '  background:#1c1c22;border:1px solid rgba(255,255,255,.08);border-radius:18px;',
    '  padding:14px 14px 18px;position:relative;',
    '  box-shadow:0 18px 48px rgba(0,0,0,.55);',
    '  animation:ntRise .26s cubic-bezier(.2,.9,.3,1) both}',
    '@keyframes ntRise{from{opacity:0;transform:translateY(10px) scale(.99)}to{opacity:1;transform:none}}',

    '.nt-head{display:flex;align-items:center;gap:8px;margin:0 0 10px}',
    '.nt-back{flex:0 0 auto;width:32px;height:32px;border-radius:50%;',
    '  border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);',
    '  color:#d8d8e2;font-size:17px;line-height:1;padding:0;',
    '  display:flex;align-items:center;justify-content:center}',
    '.nt-back[hidden]{display:none}',
    '.nt-title{margin:0;font-size:16px;font-weight:700;color:#f2f2f5;',
    '  flex:1 1 auto;min-width:0}',
    '.nt-x{flex:0 0 auto;width:34px;height:34px;border-radius:50%;',
    '  border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);',
    '  color:#d8d8e2;font-size:16px;line-height:1;padding:0;',
    '  display:flex;align-items:center;justify-content:center}',

    '.nt-body{color:#e2e2ea}',

    '.nt-prep{margin:0 0 10px;padding:9px 11px;border-radius:10px;',
    '  background:rgba(255,209,31,.1);border:1px solid rgba(255,209,31,.28);',
    '  font-size:13px;font-weight:700;line-height:1.5;color:#ffe9a8;text-align:center}',
    '.nt-rule{margin:0 0 10px;font-size:12px;line-height:1.6;color:#9a9aa8}',
    '.nt-tip{margin:10px 0 0;padding:8px 10px;border-radius:10px;',
    '  background:rgba(124,240,255,.08);border:1px solid rgba(124,240,255,.22);',
    '  font-size:12.5px;line-height:1.5;color:#bdeef5}',

    /* --- コース選択カード --- */
    '.nt-course-grid{display:flex;flex-direction:column;gap:10px}',
    '.nt-course-card{display:flex;flex-direction:column;align-items:flex-start;gap:5px;',
    '  width:100%;padding:13px 14px;border-radius:14px;text-align:left;',
    '  background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.09);',
    '  color:#e8e8ee}',
    '.nt-course-sym{font-size:16px;font-weight:800;letter-spacing:.02em;color:#f4f4f8;',
    '  font-variant-numeric:tabular-nums}',
    '.nt-course-desc{font-size:12.5px;color:#9a9aa8}',
    '.nt-badge{margin-top:2px;font-size:11.5px;font-weight:700;padding:3px 9px;border-radius:999px}',
    '.nt-badge.is-new{background:rgba(255,255,255,.08);color:#a7a7b4}',
    '.nt-badge.is-progress{background:rgba(124,240,255,.14);color:#7cf0ff}',
    '.nt-badge.is-cleared{background:rgba(90,220,150,.16);color:#7be0ac}',

    /* --- 学習ステップ --- */
    '.nt-step-label{margin:0 0 8px;font-size:11.5px;color:#8b8b97;font-variant-numeric:tabular-nums}',
    '.nt-pair{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}',
    '.nt-symbol-card{flex:1 1 150px;min-width:150px;max-width:220px;padding:12px 10px 14px;',
    '  border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);',
    '  display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center}',
    '.nt-symbol-diagram{width:100%;display:flex;align-items:center;justify-content:center;min-height:132px}',
    '.nt-symbol-label{font-size:22px;font-weight:800;color:#f4f4f8;letter-spacing:.02em}',
    '.nt-symbol-explain{margin:0;font-size:12.5px;line-height:1.55;color:#c2c2ce}',

    /* --- 面の展開図（正面から見るので、回転方向を取り違えない） --- */
    '.nt-net{position:relative;display:grid;grid-template-columns:repeat(4,1fr);',
    '  grid-template-rows:repeat(3,1fr);gap:5px;width:196px;height:150px;margin:0 auto}',
    '.nt-net-cell{position:relative;border-radius:7px;background:var(--fc);opacity:.28;',
    '  border:1px solid rgba(255,255,255,.14)}',
    '.nt-net-cell.is-active{opacity:1;box-shadow:0 0 0 2px #fff inset,0 0 14px rgba(255,255,255,.35);',
    '  display:flex;align-items:center;justify-content:center}',
    '.nt-arrow{width:70%;height:70%;color:#0e0e11;filter:drop-shadow(0 0 2px rgba(255,255,255,.5))}',
    '.nt-arrow path,.nt-arrow polygon{animation:ntArrowPulse 1.6s ease-in-out infinite}',
    '@keyframes ntArrowPulse{0%,100%{opacity:1}50%{opacity:.45}}',

    /* --- Mの図（正面3x3。真ん中の列が流れる向きを矢印で示す） --- */
    '.nt-mgrid{position:relative;display:grid;grid-template-columns:repeat(3,1fr);',
    '  grid-template-rows:repeat(3,1fr);gap:4px;width:120px;height:120px;margin:0 auto}',
    '.nt-mcell{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);border-radius:6px}',
    '.nt-mcell.is-active{background:var(--tc,#7cf0ff);opacity:.4;border-color:var(--tc,#7cf0ff)}',
    '.nt-marrow{position:absolute;left:50%;top:50%;width:26px;height:64px;',
    '  transform:translate(-50%,-50%);color:var(--tc,#7cf0ff);',
    '  filter:drop-shadow(0 0 4px rgba(0,0,0,.6));animation:ntArrowPulse 1.6s ease-in-out infinite}',

    /* --- テスト --- */
    '.nt-quiz-progress{margin:0 0 8px;font-size:11.5px;color:#8b8b97;font-variant-numeric:tabular-nums}',
    '.nt-quiz-q{margin:0 0 14px;font-size:17px;font-weight:800;color:#f4f4f8;text-align:center}',
    '.nt-quiz-choices{display:grid;grid-template-columns:1fr 1fr;gap:9px}',
    '.nt-quiz-choices.is-two{grid-template-columns:1fr}',
    '.nt-choice{min-height:52px;border-radius:12px;padding:0 12px;font-size:14px;font-weight:700;',
    '  color:#e8e8ee;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.14)}',
    '.nt-choice.is-correct{background:rgba(90,220,150,.18);border-color:#7be0ac;color:#bdf3d4}',
    '.nt-choice.is-wrong{background:rgba(255,110,110,.16);border-color:#ff8a8a;color:#ffc9c9}',
    '.nt-choice[disabled]{opacity:.85}',
    '.nt-quiz-feedback{margin:12px 0 0;font-size:14px;font-weight:700;text-align:center}',
    '.nt-quiz-feedback.is-good{color:#7be0ac}',
    '.nt-quiz-feedback.is-bad{color:#ffb0b0}',

    /* --- 振り返り --- */
    '.nt-result-score{margin:4px 0 16px;font-size:20px;font-weight:800;color:#f4f4f8;text-align:center}',
    '.nt-result-weak{margin:0 0 16px}',
    '.nt-result-weak-title{margin:0 0 8px;font-size:13px;font-weight:700;color:#c2c2ce}',
    '.nt-result-weak-none{margin:0;font-size:13px;color:#7be0ac}',
    '.nt-weak-chips{display:flex;flex-wrap:wrap;gap:7px}',
    '.nt-chip{padding:5px 11px;border-radius:999px;font-size:13px;font-weight:700;',
    '  background:rgba(255,110,110,.14);border:1px solid rgba(255,110,110,.3);color:#ffc9c9}',
    '.nt-result-actions{display:flex;flex-direction:column;gap:9px}',

    /* --- 空の振り返り --- */
    '.nt-empty{padding:26px 6px;text-align:center}',
    '.nt-empty-title{margin:0 0 8px;font-size:15px;font-weight:700;color:#e2e2ea}',
    '.nt-empty-body{margin:0;font-size:13px;line-height:1.6;color:#9a9aa8}',

    /* --- 共通ボタン --- */
    '.nt-btn-primary{width:100%;min-height:52px;border-radius:14px;padding:0 14px;margin-top:14px;',
    '  font-size:15px;font-weight:700;line-height:1.3;',
    '  display:flex;align-items:center;justify-content:center;text-align:center;',
    '  border:1px solid transparent;background:var(--tc,#7cf0ff);color:#10131a;',
    '  box-shadow:0 6px 18px rgba(var(--tc-rgb,124,240,255),.18)}',
    '.nt-btn-ghost{width:100%;min-height:48px;border-radius:14px;padding:0 14px;',
    '  font-size:14px;font-weight:700;color:#e8e8ee;',
    '  border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.04)}',

    '@media (prefers-reduced-motion: reduce){',
    '  .nt-panel{animation:none}',
    '  #nt-overlay{transition-duration:.01ms}',
    '  .nt-arrow path,.nt-arrow polygon,.nt-marrow{animation:none}',
    '}'
  ].join('');

  function injectCSS() {
    if (document.getElementById('notation-training-style')) return;
    var st = document.createElement('style');
    st.id = 'notation-training-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ============================================================
     図解（面の展開図と、M専用の正面グリッド）
     ============================================================ */
  function arrowSVG(dir) {
    var mirror = dir === 'ccw' ? ' style="transform:scaleX(-1)"' : '';
    return '<svg class="nt-arrow" viewBox="0 0 44 44" aria-hidden="true"' + mirror + '>' +
      '<path d="M10 13a16 16 0 1 1 -3 11" fill="none" stroke="currentColor" stroke-width="4.4" stroke-linecap="round"/>' +
      '<polygon points="3,7 16,10 7,20" fill="currentColor"/>' +
      '</svg>';
  }

  var NET_ORDER = ['U', 'L', 'F', 'R', 'B', 'D'];
  var NET_POS = { U: [2, 1], L: [1, 2], F: [2, 2], R: [3, 2], B: [4, 2], D: [2, 3] };

  function faceNetHTML(activeFace, dir) {
    var html = '<div class="nt-net" aria-hidden="true">';
    NET_ORDER.forEach(function (fk) {
      var info = FACES[fk];
      var rc = NET_POS[fk];
      var active = fk === activeFace;
      html += '<div class="nt-net-cell' + (active ? ' is-active' : '') + '" style="grid-column:' + rc[0] + ';grid-row:' + rc[1] + ';--fc:' + info.color + '">';
      if (active) html += arrowSVG(dir);
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  function middleSliceHTML(dir) {
    var html = '<div class="nt-mgrid" aria-hidden="true">';
    for (var i = 0; i < 9; i++) {
      var mid = (i % 3) === 1;
      html += '<div class="nt-mcell' + (mid ? ' is-active' : '') + '"></div>';
    }
    html += '<svg class="nt-marrow" viewBox="0 0 24 60" aria-hidden="true">' +
      '<line x1="12" y1="5" x2="12" y2="49" stroke="currentColor" stroke-width="4.2" stroke-linecap="round"/>' +
      (dir === 'down'
        ? '<polygon points="12,58 3,42 21,42" fill="currentColor"/>'
        : '<polygon points="12,2 3,18 21,18" fill="currentColor"/>') +
      '</svg>';
    html += '</div>';
    return html;
  }

  function symbolDiagramHTML(sym) {
    var bf = baseFace(sym), prime = isPrime(sym);
    if (bf === 'M') return middleSliceHTML(prime ? 'up' : 'down');
    return faceNetHTML(bf, prime ? 'ccw' : 'cw');
  }

  function symbolExplainText(sym) {
    var bf = baseFace(sym), prime = isPrime(sym);
    if (bf === 'M') return T(prime ? 'ntExplainMCCW' : 'ntExplainMCW');
    return T('ntExplainTpl', { face: T(FACES[bf].nameKey), dir: T(prime ? 'ntDirCCW' : 'ntDirCW') });
  }

  /* ============================================================
     クイズの組み立て
     ============================================================ */
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function answerValue(q) {
    if (q.type === 'mdir') return isPrime(q.sym) ? 'up' : 'down';
    if (q.type === 'dir') return isPrime(q.sym) ? 'ccw' : 'cw';
    return baseFace(q.sym);
  }
  function choiceLabel(q, val) {
    if (q.type === 'mdir') return val === 'down' ? T('ntDirDown') : T('ntDirUp');
    if (q.type === 'dir') return val === 'cw' ? T('ntDirCW') : T('ntDirCCW');
    return T(FACES[val].nameKey);
  }
  function questionChoices(q) {
    if (q.type === 'mdir') return [{ val: 'down', label: T('ntDirDown') }, { val: 'up', label: T('ntDirUp') }];
    if (q.type === 'dir') return [{ val: 'cw', label: T('ntDirCW') }, { val: 'ccw', label: T('ntDirCCW') }];
    var correct = baseFace(q.sym);
    var pool = Object.keys(FACES).filter(function (k) { return k !== correct; });
    shuffle(pool);
    var vals = [correct].concat(pool.slice(0, 3));
    shuffle(vals);
    return vals.map(function (k) { return { val: k, label: T(FACES[k].nameKey) }; });
  }

  function buildQuiz(symbols) {
    var list = [];
    symbols.forEach(function (sym) {
      list.push({ type: (baseFace(sym) === 'M') ? 'mdir' : 'dir', sym: sym });
      list.push({ type: 'face', sym: sym });
    });
    shuffle(list);
    list.forEach(function (q) { q.choices = questionChoices(q); });
    return list;
  }

  /* ============================================================
     画面（course / learn / quizIntro / quiz / result / reviewEmpty）
     ============================================================ */
  var el = null;
  var state = { view: 'courses', courseId: null, isReview: false, stepIndex: 0,
    quiz: [], qIndex: 0, correct: 0, answered: false, selected: null, wasRight: false, resultPct: 0 };

  function findCourse(id) {
    for (var i = 0; i < COURSES.length; i++) if (COURSES[i].id === id) return COURSES[i];
    return null;
  }
  function courseSymbolLabel(course) {
    var flat = [];
    course.steps.forEach(function (pair) { pair.forEach(function (s) { flat.push(s); }); });
    return flat.join(' / ');
  }
  function courseFlatSymbols(course) {
    var flat = [];
    course.steps.forEach(function (pair) { pair.forEach(function (s) { flat.push(s); }); });
    return flat;
  }

  function courseCardHTML(id, symLabel, desc, status) {
    return '<button class="nt-course-card ui-pressable" type="button" data-nt="course" data-id="' + id + '">' +
      '<span class="nt-course-sym">' + esc(symLabel) + '</span>' +
      '<span class="nt-course-desc">' + esc(desc) + '</span>' +
      '<span class="nt-badge ' + status.cls + '">' + esc(status.label) + '</span>' +
      '</button>';
  }

  function renderCourses() {
    var prog = loadProgress();
    var html = '<p class="nt-prep">🧩 ' + esc(T('ntPrepBanner')) + '</p>';
    html += '<div class="nt-course-grid">';
    COURSES.forEach(function (c) {
      html += courseCardHTML(c.id, courseSymbolLabel(c), T(c.descKey), courseStatus(c, prog));
    });
    var weak = weakSymbols(prog);
    var reviewStatus = weak.length
      ? { label: T('ntReviewCount', { n: weak.length }), cls: 'is-progress' }
      : { label: T('ntStatusCleared'), cls: 'is-cleared' };
    html += courseCardHTML(REVIEW_ID, '★ ' + T('ntCourseReviewTitle'), T('ntCourseReviewDesc'), reviewStatus);
    html += '</div>';
    return html;
  }

  function renderLearn() {
    var course = findCourse(state.courseId);
    var pair = course.steps[state.stepIndex];
    var html = '<p class="nt-prep">🧩 ' + esc(T('ntPrepBanner')) + '</p>';
    html += '<p class="nt-rule">' + esc(T('ntCoreRuleText')) + '</p>';
    html += '<p class="nt-step-label">' + esc(T('ntStepLabel', { n: state.stepIndex + 1, total: course.steps.length })) + '</p>';
    html += '<div class="nt-pair">';
    pair.forEach(function (sym) {
      html += '<div class="nt-symbol-card">' +
        '<div class="nt-symbol-diagram">' + symbolDiagramHTML(sym) + '</div>' +
        '<div class="nt-symbol-label">' + esc(sym) + '</div>' +
        '<p class="nt-symbol-explain">' + esc(symbolExplainText(sym)) + '</p>' +
        '</div>';
    });
    html += '</div>';
    var bf = baseFace(pair[0]);
    var tipKey = bf === 'L' ? 'ntTipSeeL' : bf === 'D' ? 'ntTipSeeD' : bf === 'B' ? 'ntTipSeeB' : null;
    if (tipKey) html += '<p class="nt-tip">💡 ' + esc(T(tipKey)) + '</p>';
    html += '<button class="nt-btn-primary ui-pressable" type="button" data-act="understood">' + esc(T('ntUnderstood')) + '</button>';
    return html;
  }

  function renderQuizIntro() {
    var body = state.isReview ? T('ntCourseReviewDesc') : T('ntQuizIntroBody');
    var btn = state.isReview ? T('ntReviewStart') : T('ntQuizStart');
    return '<p class="nt-rule" style="text-align:center;font-size:14px;color:#c2c2ce">' + esc(body) + '</p>' +
      '<button class="nt-btn-primary ui-pressable" type="button" data-act="quizStart">' + esc(btn) + '</button>';
  }

  function renderReviewEmpty() {
    return '<div class="nt-empty">' +
      '<p class="nt-empty-title">' + esc(T('ntReviewEmptyTitle')) + '</p>' +
      '<p class="nt-empty-body">' + esc(T('ntReviewEmptyBody')) + '</p>' +
      '</div>';
  }

  function renderQuiz() {
    var q = state.quiz[state.qIndex];
    var correctVal = answerValue(q);
    var html = '<p class="nt-quiz-progress">' + esc(T('ntQuizProgress', { n: state.qIndex + 1, total: state.quiz.length })) + '</p>';
    html += '<p class="nt-quiz-q">' + esc(T(q.type === 'face' ? 'ntQuizQuestionFace' : 'ntQuizQuestionDir', { sym: q.sym })) + '</p>';
    html += '<div class="nt-quiz-choices' + (q.choices.length <= 2 ? ' is-two' : '') + '">';
    q.choices.forEach(function (ch) {
      var cls = 'nt-choice ui-pressable';
      if (state.answered) {
        if (ch.val === correctVal) cls += ' is-correct';
        else if (ch.val === state.selected) cls += ' is-wrong';
      }
      html += '<button class="' + cls + '" type="button" data-act="choice" data-val="' + esc(ch.val) + '"' +
        (state.answered ? ' disabled' : '') + '>' + esc(ch.label) + '</button>';
    });
    html += '</div>';
    if (state.answered) {
      html += '<p class="nt-quiz-feedback ' + (state.wasRight ? 'is-good' : 'is-bad') + '">' +
        (state.wasRight ? esc(T('ntQuizCorrect')) : esc(T('ntQuizWrong', { ans: choiceLabel(q, correctVal) }))) +
        '</p>';
      var isLast = state.qIndex + 1 >= state.quiz.length;
      html += '<button class="nt-btn-primary ui-pressable" type="button" data-act="quizNext">' +
        esc(T(isLast ? 'ntQuizFinish' : 'ntQuizNext')) + '</button>';
    }
    return html;
  }

  function renderResult() {
    var prog = loadProgress();
    var symbols = state.isReview
      ? state.quiz.map(function (q) { return q.sym; }).filter(function (v, i, a) { return a.indexOf(v) === i; })
      : courseFlatSymbols(findCourse(state.courseId));
    var html = '<p class="nt-result-score">' + esc(T('ntResultScore', {
      pct: state.resultPct, correct: state.correct, total: state.quiz.length
    })) + '</p>';
    var weakHere = symbols.filter(function (sym) {
      var s = prog.symbols[sym];
      return s && s.seen > 0 && (s.correct / s.seen) < 0.7;
    });
    html += '<div class="nt-result-weak">';
    html += '<p class="nt-result-weak-title">' + esc(T('ntResultWeakTitle')) + '</p>';
    if (weakHere.length) {
      html += '<div class="nt-weak-chips">' + weakHere.map(function (sym) {
        return '<span class="nt-chip">' + esc(sym) + '</span>';
      }).join('') + '</div>';
    } else {
      html += '<p class="nt-result-weak-none">' + esc(T('ntResultWeakNone')) + '</p>';
    }
    html += '</div>';
    html += '<div class="nt-result-actions">';
    html += '<button class="nt-btn-primary ui-pressable" type="button" data-act="retry" style="margin-top:0">' + esc(T('ntResultRetry')) + '</button>';
    html += '<button class="nt-btn-ghost ui-pressable" type="button" data-act="toCourses">' + esc(T('ntResultToCourses')) + '</button>';
    html += '</div>';
    return html;
  }

  function titleForView() {
    if (state.view === 'courses') return T('ntMenuLabel');
    if (state.view === 'result') return T('ntResultTitle');
    if (state.view === 'reviewEmpty') return T('ntCourseReviewTitle');
    if (state.view === 'quizIntro' || state.view === 'quiz') return T('ntQuizIntroTitle');
    if (state.view === 'learn') {
      var course = findCourse(state.courseId);
      return course ? courseSymbolLabel(course) : T('ntMenuLabel');
    }
    return T('ntMenuLabel');
  }

  function render() {
    if (!el) return;
    el.back.hidden = (state.view === 'courses');
    el.title.textContent = titleForView();
    var body = '';
    if (state.view === 'courses') body = renderCourses();
    else if (state.view === 'learn') body = renderLearn();
    else if (state.view === 'quizIntro') body = renderQuizIntro();
    else if (state.view === 'quiz') body = renderQuiz();
    else if (state.view === 'result') body = renderResult();
    else if (state.view === 'reviewEmpty') body = renderReviewEmpty();
    el.body.innerHTML = body;
    el.body.scrollTop = 0;
  }

  /* ============================================================
     状態遷移
     ============================================================ */
  function showCourses() {
    state.view = 'courses'; state.courseId = null; state.isReview = false;
    render();
  }

  function openCourse(id) {
    if (id === REVIEW_ID) {
      state.isReview = true; state.courseId = REVIEW_ID;
      var weak = weakSymbols(loadProgress());
      state.view = weak.length ? 'quizIntro' : 'reviewEmpty';
      render();
      return;
    }
    var course = findCourse(id);
    if (!course) return;
    state.isReview = false; state.courseId = id; state.stepIndex = 0;
    state.view = 'learn';
    render();
  }

  function advanceStep() {
    var course = findCourse(state.courseId);
    var prog = loadProgress();
    var c = prog.courses[state.courseId] || { learnedSteps: 0, quizBest: 0 };
    c.learnedSteps = Math.max(c.learnedSteps || 0, state.stepIndex + 1);
    prog.courses[state.courseId] = c;
    saveProgress(prog);
    if (state.stepIndex + 1 < course.steps.length) {
      state.stepIndex++;
    } else {
      state.view = 'quizIntro';
    }
    render();
  }

  function startQuiz() {
    var symbols = state.isReview
      ? weakSymbols(loadProgress())
      : courseFlatSymbols(findCourse(state.courseId));
    state.quiz = buildQuiz(symbols);
    state.qIndex = 0; state.correct = 0; state.answered = false; state.selected = null;
    state.view = 'quiz';
    render();
  }

  function submitAnswer(val) {
    if (state.answered) return;
    var q = state.quiz[state.qIndex];
    var correctVal = answerValue(q);
    var isRight = val === correctVal;
    state.answered = true; state.selected = val; state.wasRight = isRight;
    if (isRight) state.correct++;

    var prog = loadProgress();
    var s = prog.symbols[q.sym] || { seen: 0, correct: 0 };
    s.seen = (s.seen || 0) + 1;
    if (isRight) s.correct = (s.correct || 0) + 1;
    prog.symbols[q.sym] = s;
    saveProgress(prog);

    render();
  }

  function nextQuestion() {
    if (state.qIndex + 1 < state.quiz.length) {
      state.qIndex++; state.answered = false; state.selected = null;
      render();
    } else {
      finishQuiz();
    }
  }

  function finishQuiz() {
    var pct = state.quiz.length ? Math.round(100 * state.correct / state.quiz.length) : 100;
    if (!state.isReview) {
      var prog = loadProgress();
      var c = prog.courses[state.courseId] || { learnedSteps: 0, quizBest: 0 };
      c.quizBest = Math.max(c.quizBest || 0, pct);
      c.quizAttempts = (c.quizAttempts || 0) + 1;
      prog.courses[state.courseId] = c;
      saveProgress(prog);
    }
    state.resultPct = pct;
    state.view = 'result';
    render();
  }

  function retryCourse() {
    if (state.isReview) { startQuiz(); return; }
    state.stepIndex = 0;
    state.view = 'learn';
    render();
  }

  /* ============================================================
     組み立てと開閉
     ============================================================ */
  function onBodyClick(e) {
    var courseBtn = e.target.closest('[data-nt="course"]');
    if (courseBtn) { openCourse(courseBtn.getAttribute('data-id')); return; }
    var act = e.target.closest('[data-act]');
    if (!act) return;
    var a = act.getAttribute('data-act');
    if (a === 'understood') advanceStep();
    else if (a === 'quizStart') startQuiz();
    else if (a === 'choice') submitAnswer(act.getAttribute('data-val'));
    else if (a === 'quizNext') nextQuestion();
    else if (a === 'retry') retryCourse();
    else if (a === 'toCourses') showCourses();
  }

  function build() {
    if (el) return el;
    injectCSS();
    var ov = document.createElement('div');
    ov.id = 'nt-overlay';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.innerHTML =
      '<div class="nt-panel">' +
        '<div class="nt-head">' +
          '<button class="nt-back ui-pressable" data-nt="back" aria-label="‹" hidden>‹</button>' +
          '<h2 class="nt-title" data-nt="title"></h2>' +
          '<button class="nt-x ui-pressable" data-nt="close" aria-label="✕">✕</button>' +
        '</div>' +
        '<div class="nt-body" data-nt="body"></div>' +
      '</div>';
    document.body.appendChild(ov);

    var q = function (n) { return ov.querySelector('[data-nt="' + n + '"]'); };
    el = { overlay: ov, panel: ov.querySelector('.nt-panel'), back: q('back'), title: q('title'), close: q('close'), body: q('body') };

    el.close.addEventListener('click', closeOverlay);
    el.back.addEventListener('click', showCourses);
    ov.addEventListener('click', function (e) { if (e.target === ov) closeOverlay(); });
    el.body.addEventListener('click', onBodyClick);
    return el;
  }

  function openOverlay() {
    build();
    state.view = 'courses'; state.courseId = null; state.isReview = false;
    render();
    el.overlay.classList.add('show');
    requestAnimationFrame(function () { el.overlay.classList.add('show-visible'); });
  }

  function closeOverlay() {
    if (!el) return;
    el.overlay.classList.remove('show-visible');
    setTimeout(function () { if (el) el.overlay.classList.remove('show'); }, 220);
  }

  /* ============================================================
     ドロワーへのボタンの差し込み
     ============================================================ */
  function injectMenuButton() {
    var menu = document.getElementById('menu-actions');
    if (!menu || document.getElementById('notation-training-btn')) return;
    var btn = document.createElement('button');
    btn.className = 'action-btn';
    btn.id = 'notation-training-btn';
    btn.setAttribute('role', 'menuitem');
    btn.innerHTML = '<span aria-hidden="true">🧭</span> <span data-i18n="ntMenuLabel">' + esc(T('ntMenuLabel')) + '</span>';
    btn.addEventListener('click', function () {
      menu.classList.remove('open');
      var toggle = document.getElementById('menu-toggle');
      if (toggle) {
        toggle.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', T('menuOpen'));
      }
      openOverlay();
    });
    var trainingBtn = document.getElementById('training-btn');
    if (trainingBtn && trainingBtn.parentNode === menu) trainingBtn.insertAdjacentElement('afterend', btn);
    else menu.appendChild(btn);
  }

  injectMenuButton();
})(window);
