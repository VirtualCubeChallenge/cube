/* ============================================================
   ranked-texts.js — 世界ランキング（ランク戦）の文言・9言語
   ------------------------------------------------------------
   アプリ側のランク戦の画面（これから作る ranked.js）が使う。
   作りは sushi-arm.js / pll-share.js と同じで、I18N に無いキーだけ足す
   （既存のキーは上書きしない）。ja だけは必ずある。

   参加時の説明（rkJoinBody）で伝えていること:
     ・「サーバーなし」と告知しているが、ランキングだけは例外
     ・送るのはニックネームと記録（タイム・手数・回した手順）だけ
     ・送らないもの（名前・メール・写真・ほかの記録や持ち物）
     ・本物か確かめる仕組み（出題はサーバー、手順をサーバーで再生）
     ・いつでもやめられ、やめると記録はすべて消える
   ============================================================ */
(function (global) {
  'use strict';

  const RANKED_I18N = {
    ja: {
      rkTitle: '世界ランキング',
      rkJoinTitle: '世界ランキングに参加する',
      rkJoinBody:
        'このアプリはサーバーを使わず、データはすべてこの端末の中だけに保存しています。ただし世界ランキングだけは例外で、参加するとランキング用のサーバー（Cloudflare）に次のものを送ります。\n' +
        '・ニックネーム\n' +
        '・ランク戦の記録（タイム・手数・回した手順）\n' +
        '名前・メールアドレス・写真や、ほかの記録・持ち物は送りません。\n' +
        '記録が本物か確かめるため、出題はサーバーが出し、回した手順をサーバーで再生して確かめます。\n' +
        '参加はいつでもやめられます。やめると、送った記録はすべて消えます。',
      rkRules: 'ランク戦のルール：観察は15秒まで／💡ヘルプ・OLL・PLL・ZBLLは使えません／一時停止はできません',
      rkNickLabel: 'ニックネーム（12文字まで・ランキングに表示されます）',
      rkNickBad: 'このニックネームは使えません（1〜12文字、URLは不可）',
      rkJoin: '参加する',
      rkNotNow: 'やめておく',
      rkStart: 'ランク戦をはじめる',
      rkInspection: '観察',
      rkSending: '記録を送っています…',
      rkResultOk: '記録しました',
      rkRank: '{n}位',
      rkNewBest: '自己ベスト更新！',
      rkErrNotSolved: '揃っていない状態で届いたため、記録できませんでした',
      rkErrInspection: '観察が15秒を超えたため、記録できませんでした',
      rkErrTime: 'タイムを確かめられなかったため、記録できませんでした',
      rkErrExpired: '時間が経ちすぎたため、この出題は終わりました',
      rkErrOffline: 'サーバーにつながりません。電波のある場所でもう一度お試しください',
      rkErrTooSoon: '少し待ってから、もう一度お試しください',
      rkReview: '不自然に速い記録などは、確認のうえ削除することがあります',
      rkLeave: 'ランキングへの参加をやめる',
      rkLeaveConfirm: '参加をやめると、送った記録はすべて消えます。よろしいですか？',
      rkRename: 'ニックネームを変える',
      rkEmpty: 'まだ記録がありません',
      rkFirstMoveHint: '1手目でスタート',
      rkAssistUsed: 'ガイドを使ったため、今回は記録されません（練習として続けられます）',
      rkPaused: '一時停止したため、今回は記録されません（練習として続けられます）',
      rkCancelled: 'ランク戦を中止しました',
      rkViewRanking: 'ランキングを見る',
      rkSave: '保存する',
      rkCancelBtn: 'キャンセル',
      rkMyBest: '自己ベスト',
      rkNoRecordYet: 'まだ記録がありません',
      rkPlayers: '{n}人',
      rkMoves: '{n}手',
      rkLeaveOk: 'やめる'
    },
    en: {
      rkTitle: 'World Ranking',
      rkJoinTitle: 'Join the World Ranking',
      rkJoinBody:
        "This app doesn't use a server — all your data stays on this device. The World Ranking is the one exception: if you join, the following is sent to the ranking server (Cloudflare):\n" +
        '• Your nickname\n' +
        '• Your ranked-solve records (time, move count and the moves you made)\n' +
        'Your name, email address, photos and any other records or items are never sent.\n' +
        'To make sure records are real, the server picks the scramble and replays your moves to check the solve.\n' +
        'You can leave at any time. Leaving deletes everything you sent.',
      rkRules: 'Ranked rules: 15 s inspection / no 💡 Help, OLL, PLL or ZBLL / no pausing',
      rkNickLabel: 'Nickname (up to 12 characters, shown on the ranking)',
      rkNickBad: "This nickname can't be used (1–12 characters, no URLs)",
      rkJoin: 'Join',
      rkNotNow: 'Not now',
      rkStart: 'Start a ranked solve',
      rkInspection: 'Inspection',
      rkSending: 'Sending your record…',
      rkResultOk: 'Recorded',
      rkRank: '#{n}',
      rkNewBest: 'New personal best!',
      rkErrNotSolved: "The cube wasn't solved when it arrived, so this wasn't recorded",
      rkErrInspection: 'Inspection went over 15 seconds, so this wasn’t recorded',
      rkErrTime: "The time couldn't be verified, so this wasn't recorded",
      rkErrExpired: 'Too much time has passed — this scramble has ended',
      rkErrOffline: "Can't reach the server. Please try again where you have a signal",
      rkErrTooSoon: 'Please wait a moment and try again',
      rkReview: 'Records that look unnatural (e.g. impossibly fast) may be reviewed and removed',
      rkLeave: 'Leave the ranking',
      rkLeaveConfirm: 'Leaving deletes every record you sent. Are you sure?',
      rkRename: 'Change nickname',
      rkEmpty: 'No records yet',
      rkFirstMoveHint: 'Timer starts on your first move',
      rkAssistUsed: "A guide was used, so this won't be recorded (you can keep practicing)",
      rkPaused: "The timer was paused, so this won't be recorded (you can keep practicing)",
      rkCancelled: 'Ranked solve cancelled',
      rkViewRanking: 'View ranking',
      rkSave: 'Save',
      rkCancelBtn: 'Cancel',
      rkMyBest: 'Personal best',
      rkNoRecordYet: 'No record yet',
      rkPlayers: 'Players: {n}',
      rkMoves: '{n} mv',
      rkLeaveOk: 'Leave'
    },
    'zh-CN': {
      rkTitle: '世界排行榜',
      rkJoinTitle: '加入世界排行榜',
      rkJoinBody:
        '本应用不使用服务器，所有数据都只保存在这台设备上。唯一的例外是世界排行榜：加入后，会把以下内容发送到排行榜服务器（Cloudflare）：\n' +
        '・昵称\n' +
        '・排位赛记录（时间、步数和转动步骤）\n' +
        '不会发送姓名、邮箱、照片或其他记录和物品。\n' +
        '为了确认记录真实，题目由服务器出题，并在服务器上重放你的转动步骤进行核对。\n' +
        '可以随时退出。退出后，已发送的记录会全部删除。',
      rkRules: '排位赛规则：观察最多15秒／不能使用💡提示、OLL、PLL、ZBLL／不能暂停',
      rkNickLabel: '昵称（最多12个字，会显示在排行榜上）',
      rkNickBad: '无法使用此昵称（1〜12个字，不能包含网址）',
      rkJoin: '加入',
      rkNotNow: '暂不加入',
      rkStart: '开始排位赛',
      rkInspection: '观察',
      rkSending: '正在发送记录…',
      rkResultOk: '已记录',
      rkRank: '第{n}名',
      rkNewBest: '刷新个人最佳！',
      rkErrNotSolved: '提交时魔方未复原，无法记录',
      rkErrInspection: '观察超过15秒，无法记录',
      rkErrTime: '无法核实时间，无法记录',
      rkErrExpired: '时间过长，本题已结束',
      rkErrOffline: '无法连接服务器，请在有信号的地方再试一次',
      rkErrTooSoon: '请稍等片刻再试',
      rkReview: '明显不自然（如过快）的记录，经确认后可能会被删除',
      rkLeave: '退出排行榜',
      rkLeaveConfirm: '退出后，已发送的记录会全部删除。确定吗？',
      rkRename: '修改昵称',
      rkEmpty: '还没有记录',
      rkFirstMoveHint: '转动第一步开始计时',
      rkAssistUsed: '使用了提示，本次不计入记录（可以继续练习）',
      rkPaused: '暂停过计时，本次不计入记录（可以继续练习）',
      rkCancelled: '已取消排位赛',
      rkViewRanking: '查看排行榜',
      rkSave: '保存',
      rkCancelBtn: '取消',
      rkMyBest: '个人最佳',
      rkNoRecordYet: '还没有记录',
      rkPlayers: '{n}人',
      rkMoves: '{n}步',
      rkLeaveOk: '退出'
    },
    'zh-TW': {
      rkTitle: '世界排行榜',
      rkJoinTitle: '加入世界排行榜',
      rkJoinBody:
        '本應用程式不使用伺服器，所有資料都只儲存在這台裝置上。唯一的例外是世界排行榜：加入後，會把以下內容傳送到排行榜伺服器（Cloudflare）：\n' +
        '・暱稱\n' +
        '・排位賽紀錄（時間、步數和轉動步驟）\n' +
        '不會傳送姓名、電子郵件、照片或其他紀錄和物品。\n' +
        '為了確認紀錄真實，題目由伺服器出題，並在伺服器上重播你的轉動步驟進行核對。\n' +
        '可以隨時退出。退出後，已傳送的紀錄會全部刪除。',
      rkRules: '排位賽規則：觀察最多15秒／不能使用💡提示、OLL、PLL、ZBLL／不能暫停',
      rkNickLabel: '暱稱（最多12個字，會顯示在排行榜上）',
      rkNickBad: '無法使用此暱稱（1〜12個字，不能包含網址）',
      rkJoin: '加入',
      rkNotNow: '暫不加入',
      rkStart: '開始排位賽',
      rkInspection: '觀察',
      rkSending: '正在傳送紀錄…',
      rkResultOk: '已記錄',
      rkRank: '第{n}名',
      rkNewBest: '刷新個人最佳！',
      rkErrNotSolved: '提交時方塊未復原，無法記錄',
      rkErrInspection: '觀察超過15秒，無法記錄',
      rkErrTime: '無法核實時間，無法記錄',
      rkErrExpired: '時間過長，本題已結束',
      rkErrOffline: '無法連線到伺服器，請在有訊號的地方再試一次',
      rkErrTooSoon: '請稍等片刻再試',
      rkReview: '明顯不自然（如過快）的紀錄，經確認後可能會被刪除',
      rkLeave: '退出排行榜',
      rkLeaveConfirm: '退出後，已傳送的紀錄會全部刪除。確定嗎？',
      rkRename: '修改暱稱',
      rkEmpty: '還沒有紀錄',
      rkFirstMoveHint: '轉動第一步開始計時',
      rkAssistUsed: '使用了提示，本次不計入紀錄（可以繼續練習）',
      rkPaused: '暫停過計時，本次不計入紀錄（可以繼續練習）',
      rkCancelled: '已取消排位賽',
      rkViewRanking: '查看排行榜',
      rkSave: '儲存',
      rkCancelBtn: '取消',
      rkMyBest: '個人最佳',
      rkNoRecordYet: '還沒有紀錄',
      rkPlayers: '{n}人',
      rkMoves: '{n}步',
      rkLeaveOk: '退出'
    },
    ko: {
      rkTitle: '세계 랭킹',
      rkJoinTitle: '세계 랭킹에 참가하기',
      rkJoinBody:
        '이 앱은 서버를 쓰지 않으며, 모든 데이터는 이 기기 안에만 저장됩니다. 단, 세계 랭킹만은 예외로, 참가하면 랭킹 서버(Cloudflare)에 다음 내용을 보냅니다.\n' +
        '・닉네임\n' +
        '・랭크전 기록(시간, 수 횟수, 돌린 순서)\n' +
        '이름, 이메일 주소, 사진, 그 밖의 기록이나 소지품은 보내지 않습니다.\n' +
        '기록이 진짜인지 확인하기 위해 문제는 서버가 내고, 돌린 순서를 서버에서 재생해 확인합니다.\n' +
        '참가는 언제든지 그만둘 수 있습니다. 그만두면 보낸 기록은 모두 삭제됩니다.',
      rkRules: '랭크전 규칙: 관찰은 15초까지 / 💡도움말·OLL·PLL·ZBLL 사용 불가 / 일시정지 불가',
      rkNickLabel: '닉네임(최대 12자, 랭킹에 표시됩니다)',
      rkNickBad: '이 닉네임은 쓸 수 없습니다(1~12자, URL 불가)',
      rkJoin: '참가하기',
      rkNotNow: '다음에',
      rkStart: '랭크전 시작',
      rkInspection: '관찰',
      rkSending: '기록을 보내는 중…',
      rkResultOk: '기록했습니다',
      rkRank: '{n}위',
      rkNewBest: '개인 최고 기록 갱신!',
      rkErrNotSolved: '맞춰지지 않은 상태로 도착해 기록하지 못했습니다',
      rkErrInspection: '관찰이 15초를 넘어 기록하지 못했습니다',
      rkErrTime: '시간을 확인할 수 없어 기록하지 못했습니다',
      rkErrExpired: '시간이 너무 지나 이 문제는 종료되었습니다',
      rkErrOffline: '서버에 연결할 수 없습니다. 신호가 잡히는 곳에서 다시 시도해 주세요',
      rkErrTooSoon: '잠시 후 다시 시도해 주세요',
      rkReview: '지나치게 빠른 등 부자연스러운 기록은 확인 후 삭제될 수 있습니다',
      rkLeave: '랭킹 참가 그만두기',
      rkLeaveConfirm: '그만두면 보낸 기록이 모두 삭제됩니다. 괜찮으신가요?',
      rkRename: '닉네임 변경',
      rkEmpty: '아직 기록이 없습니다',
      rkFirstMoveHint: '첫 수를 돌리면 시작',
      rkAssistUsed: '가이드를 사용해 이번 기록은 남지 않습니다(연습으로 계속할 수 있어요)',
      rkPaused: '일시정지해서 이번 기록은 남지 않습니다(연습으로 계속할 수 있어요)',
      rkCancelled: '랭크전을 중단했습니다',
      rkViewRanking: '랭킹 보기',
      rkSave: '저장',
      rkCancelBtn: '취소',
      rkMyBest: '개인 최고',
      rkNoRecordYet: '아직 기록이 없습니다',
      rkPlayers: '{n}명',
      rkMoves: '{n}수',
      rkLeaveOk: '그만두기'
    },
    es: {
      rkTitle: 'Ranking mundial',
      rkJoinTitle: 'Unirse al ranking mundial',
      rkJoinBody:
        'Esta app no usa servidores: todos tus datos se guardan solo en este dispositivo. La única excepción es el ranking mundial: si te unes, se envía lo siguiente al servidor del ranking (Cloudflare):\n' +
        '• Tu apodo\n' +
        '• Tus récords de partidas clasificatorias (tiempo, número de giros y los giros que hiciste)\n' +
        'Nunca se envían tu nombre, correo, fotos ni otros récords u objetos.\n' +
        'Para comprobar que los récords son reales, el servidor elige la mezcla y reproduce tus giros para verificar la resolución.\n' +
        'Puedes salir cuando quieras. Al salir, se borra todo lo que enviaste.',
      rkRules: 'Reglas: inspección de 15 s / sin 💡 Ayuda, OLL, PLL ni ZBLL / sin pausas',
      rkNickLabel: 'Apodo (hasta 12 caracteres; se muestra en el ranking)',
      rkNickBad: 'No se puede usar este apodo (1–12 caracteres, sin URL)',
      rkJoin: 'Unirme',
      rkNotNow: 'Ahora no',
      rkStart: 'Empezar partida clasificatoria',
      rkInspection: 'Inspección',
      rkSending: 'Enviando tu récord…',
      rkResultOk: 'Registrado',
      rkRank: 'Puesto {n}',
      rkNewBest: '¡Nuevo récord personal!',
      rkErrNotSolved: 'El cubo no estaba resuelto al llegar, así que no se registró',
      rkErrInspection: 'La inspección superó los 15 segundos, así que no se registró',
      rkErrTime: 'No se pudo verificar el tiempo, así que no se registró',
      rkErrExpired: 'Ha pasado demasiado tiempo: esta mezcla ha terminado',
      rkErrOffline: 'No se puede conectar con el servidor. Inténtalo de nuevo donde tengas señal',
      rkErrTooSoon: 'Espera un momento y vuelve a intentarlo',
      rkReview: 'Los récords que parezcan poco naturales (p. ej., demasiado rápidos) pueden revisarse y eliminarse',
      rkLeave: 'Salir del ranking',
      rkLeaveConfirm: 'Al salir se borrarán todos los récords que enviaste. ¿Seguro?',
      rkRename: 'Cambiar apodo',
      rkEmpty: 'Todavía no hay récords',
      rkFirstMoveHint: 'El tiempo empieza con tu primer giro',
      rkAssistUsed: 'Usaste una guía, así que no se registrará (puedes seguir practicando)',
      rkPaused: 'Pausaste el cronómetro, así que no se registrará (puedes seguir practicando)',
      rkCancelled: 'Partida clasificatoria cancelada',
      rkViewRanking: 'Ver ranking',
      rkSave: 'Guardar',
      rkCancelBtn: 'Cancelar',
      rkMyBest: 'Mejor marca',
      rkNoRecordYet: 'Aún sin récord',
      rkPlayers: 'Jugadores: {n}',
      rkMoves: '{n} giros',
      rkLeaveOk: 'Salir'
    },
    id: {
      rkTitle: 'Peringkat Dunia',
      rkJoinTitle: 'Ikut Peringkat Dunia',
      rkJoinBody:
        'Aplikasi ini tidak memakai server — semua datamu hanya tersimpan di perangkat ini. Satu-satunya pengecualian adalah Peringkat Dunia: jika kamu ikut, data berikut dikirim ke server peringkat (Cloudflare):\n' +
        '• Nama panggilan\n' +
        '• Catatan solve peringkat (waktu, jumlah langkah, dan langkah yang kamu putar)\n' +
        'Nama asli, alamat email, foto, serta catatan atau barang lain tidak pernah dikirim.\n' +
        'Agar catatan terjamin asli, server yang memberikan acakan dan memutar ulang langkahmu untuk memeriksanya.\n' +
        'Kamu bisa berhenti kapan saja. Jika berhenti, semua catatan yang dikirim akan dihapus.',
      rkRules: 'Aturan: inspeksi 15 detik / tanpa 💡 Bantuan, OLL, PLL, ZBLL / tidak bisa dijeda',
      rkNickLabel: 'Nama panggilan (maks. 12 karakter, tampil di peringkat)',
      rkNickBad: 'Nama panggilan ini tidak bisa dipakai (1–12 karakter, tanpa URL)',
      rkJoin: 'Ikut',
      rkNotNow: 'Nanti saja',
      rkStart: 'Mulai solve peringkat',
      rkInspection: 'Inspeksi',
      rkSending: 'Mengirim catatan…',
      rkResultOk: 'Tercatat',
      rkRank: 'Peringkat {n}',
      rkNewBest: 'Rekor pribadi baru!',
      rkErrNotSolved: 'Kubus belum selesai saat dikirim, jadi tidak tercatat',
      rkErrInspection: 'Inspeksi lebih dari 15 detik, jadi tidak tercatat',
      rkErrTime: 'Waktu tidak bisa diverifikasi, jadi tidak tercatat',
      rkErrExpired: 'Sudah terlalu lama — acakan ini telah berakhir',
      rkErrOffline: 'Tidak bisa terhubung ke server. Coba lagi di tempat yang ada sinyal',
      rkErrTooSoon: 'Tunggu sebentar lalu coba lagi',
      rkReview: 'Catatan yang tampak tidak wajar (misalnya terlalu cepat) dapat ditinjau dan dihapus',
      rkLeave: 'Berhenti ikut peringkat',
      rkLeaveConfirm: 'Jika berhenti, semua catatan yang dikirim akan dihapus. Yakin?',
      rkRename: 'Ganti nama panggilan',
      rkEmpty: 'Belum ada catatan',
      rkFirstMoveHint: 'Waktu mulai saat langkah pertama',
      rkAssistUsed: 'Bantuan dipakai, jadi tidak tercatat (kamu bisa lanjut berlatih)',
      rkPaused: 'Timer dijeda, jadi tidak tercatat (kamu bisa lanjut berlatih)',
      rkCancelled: 'Solve peringkat dibatalkan',
      rkViewRanking: 'Lihat peringkat',
      rkSave: 'Simpan',
      rkCancelBtn: 'Batal',
      rkMyBest: 'Rekor pribadi',
      rkNoRecordYet: 'Belum ada catatan',
      rkPlayers: 'Pemain: {n}',
      rkMoves: '{n} langkah',
      rkLeaveOk: 'Berhenti'
    },
    ru: {
      rkTitle: 'Мировой рейтинг',
      rkJoinTitle: 'Участвовать в мировом рейтинге',
      rkJoinBody:
        'Это приложение не использует сервер — все данные хранятся только на этом устройстве. Единственное исключение — мировой рейтинг: если вы участвуете, на сервер рейтинга (Cloudflare) отправляется следующее:\n' +
        '• Никнейм\n' +
        '• Записи рейтинговых сборок (время, число ходов и сами ходы)\n' +
        'Имя, адрес почты, фото и другие записи или предметы никогда не отправляются.\n' +
        'Чтобы убедиться в честности записей, скрамбл выдаёт сервер, и он же воспроизводит ваши ходы для проверки.\n' +
        'Выйти можно в любой момент. При выходе всё, что вы отправили, удаляется.',
      rkRules: 'Правила: осмотр до 15 с / без 💡 Подсказки, OLL, PLL и ZBLL / без пауз',
      rkNickLabel: 'Никнейм (до 12 символов, виден в рейтинге)',
      rkNickBad: 'Этот никнейм нельзя использовать (1–12 символов, без ссылок)',
      rkJoin: 'Участвовать',
      rkNotNow: 'Не сейчас',
      rkStart: 'Начать рейтинговую сборку',
      rkInspection: 'Осмотр',
      rkSending: 'Отправка записи…',
      rkResultOk: 'Записано',
      rkRank: '{n}-е место',
      rkNewBest: 'Новый личный рекорд!',
      rkErrNotSolved: 'Кубик оказался не собран, поэтому запись не сохранена',
      rkErrInspection: 'Осмотр длился дольше 15 секунд, поэтому запись не сохранена',
      rkErrTime: 'Не удалось проверить время, поэтому запись не сохранена',
      rkErrExpired: 'Прошло слишком много времени — этот скрамбл завершён',
      rkErrOffline: 'Нет связи с сервером. Попробуйте ещё раз там, где есть сеть',
      rkErrTooSoon: 'Подождите немного и попробуйте снова',
      rkReview: 'Неестественные записи (например, слишком быстрые) могут быть проверены и удалены',
      rkLeave: 'Выйти из рейтинга',
      rkLeaveConfirm: 'При выходе все отправленные записи удалятся. Продолжить?',
      rkRename: 'Сменить никнейм',
      rkEmpty: 'Записей пока нет',
      rkFirstMoveHint: 'Отсчёт начнётся с первого хода',
      rkAssistUsed: 'Была использована подсказка, поэтому запись не сохранится (можно продолжать тренировку)',
      rkPaused: 'Таймер ставили на паузу, поэтому запись не сохранится (можно продолжать тренировку)',
      rkCancelled: 'Рейтинговая сборка отменена',
      rkViewRanking: 'Открыть рейтинг',
      rkSave: 'Сохранить',
      rkCancelBtn: 'Отмена',
      rkMyBest: 'Личный рекорд',
      rkNoRecordYet: 'Записей пока нет',
      rkPlayers: 'Участников: {n}',
      rkMoves: '{n} ход.',
      rkLeaveOk: 'Выйти'
    },
    'pt-BR': {
      rkTitle: 'Ranking Mundial',
      rkJoinTitle: 'Participar do Ranking Mundial',
      rkJoinBody:
        'Este app não usa servidor — todos os seus dados ficam só neste aparelho. A única exceção é o Ranking Mundial: se você participar, o seguinte é enviado ao servidor do ranking (Cloudflare):\n' +
        '• Seu apelido\n' +
        '• Seus registros de partidas ranqueadas (tempo, número de movimentos e os movimentos feitos)\n' +
        'Seu nome, e-mail, fotos e outros registros ou itens nunca são enviados.\n' +
        'Para garantir que os registros são reais, o servidor escolhe o embaralhamento e reproduz seus movimentos para conferir.\n' +
        'Você pode sair quando quiser. Ao sair, tudo o que você enviou é apagado.',
      rkRules: 'Regras: inspeção de 15 s / sem 💡 Ajuda, OLL, PLL ou ZBLL / sem pausa',
      rkNickLabel: 'Apelido (até 12 caracteres, aparece no ranking)',
      rkNickBad: 'Este apelido não pode ser usado (1–12 caracteres, sem URL)',
      rkJoin: 'Participar',
      rkNotNow: 'Agora não',
      rkStart: 'Começar partida ranqueada',
      rkInspection: 'Inspeção',
      rkSending: 'Enviando seu registro…',
      rkResultOk: 'Registrado',
      rkRank: '{n}º lugar',
      rkNewBest: 'Novo recorde pessoal!',
      rkErrNotSolved: 'O cubo não estava resolvido ao chegar, então não foi registrado',
      rkErrInspection: 'A inspeção passou de 15 segundos, então não foi registrado',
      rkErrTime: 'Não foi possível verificar o tempo, então não foi registrado',
      rkErrExpired: 'Passou tempo demais — este embaralhamento terminou',
      rkErrOffline: 'Não foi possível conectar ao servidor. Tente de novo onde houver sinal',
      rkErrTooSoon: 'Aguarde um pouco e tente de novo',
      rkReview: 'Registros que pareçam pouco naturais (por exemplo, rápidos demais) podem ser revisados e removidos',
      rkLeave: 'Sair do ranking',
      rkLeaveConfirm: 'Ao sair, todos os registros enviados serão apagados. Tem certeza?',
      rkRename: 'Mudar apelido',
      rkEmpty: 'Ainda não há registros',
      rkFirstMoveHint: 'O tempo começa no primeiro movimento',
      rkAssistUsed: 'Você usou um guia, então não será registrado (pode continuar praticando)',
      rkPaused: 'O cronômetro foi pausado, então não será registrado (pode continuar praticando)',
      rkCancelled: 'Partida ranqueada cancelada',
      rkViewRanking: 'Ver ranking',
      rkSave: 'Salvar',
      rkCancelBtn: 'Cancelar',
      rkMyBest: 'Recorde pessoal',
      rkNoRecordYet: 'Ainda sem registro',
      rkPlayers: 'Jogadores: {n}',
      rkMoves: '{n} mov.',
      rkLeaveOk: 'Sair'
    }
  };

  if (typeof I18N !== 'undefined' && I18N) {
    Object.keys(RANKED_I18N).forEach(function (lang) {
      if (!I18N[lang]) I18N[lang] = {};
      Object.keys(RANKED_I18N[lang]).forEach(function (k) {
        if (I18N[lang][k] === undefined) I18N[lang][k] = RANKED_I18N[lang][k];
      });
    });
  }
  global.RANKED_I18N = RANKED_I18N;
})(window);
