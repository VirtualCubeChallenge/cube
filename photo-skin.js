/* ============================================================
   photo-skin.js — 「マイフォト」キューブスキン
   ------------------------------------------------------------
   自分の写真を6面に貼れるようにする枠。写真を9分割して面に貼る
   仕組み(showSolvedMark)はすでにあるので、このファイルが受け持つのは
     ① 写真をしまう場所（localStorage・3枠ぶん）
     ② 指で位置と大きさを決める切り抜き画面
   の2つだけ。貼るところは今までどおり index.html 側が読む。

   cube-feel.js / ui-polish.js / help-glow.js と同じで、CSS も文言も
   自分で持つ。index.html 側の書き足しは「読み込む1行」「MARKSに3行」
   「カードとタップの分岐」だけで、style.css と i18n.js は無改変。

   【写真はこの端末の中だけ】
   どこへも送らない。localStorage に data URL としてしまうだけ。
   引き継ぎコードにも入れていない（あのコードは全データをgzipして
   文字にする方式なので、写真を混ぜると数十万文字になって貼り付け
   られなくなる）。機種変更のときは、移った先でもう一度選び直す。

   【保存する大きさ】
   もとの写真がどれだけ大きくても、512x512 の JPEG に焼き直してから
   しまう。1枚あたり60KB前後・3枚で200KB程度に収まるので、他の
   セーブデータ（記録やシャード）を圧迫しない。面に貼ると1マスあたり
   170px相当になり、画面上の見え方には十分足りる。
   ============================================================ */
(function (global) {
  'use strict';

  const KEY_PREFIX = 'rubiks-cube-photo-skin-';   // + 1 / 2 / 3
  const SLOT_IDS   = ['photo1', 'photo2', 'photo3'];
  const OUT_SIZE   = 512;      // 保存する一辺(px)
  const JPEG_Q     = 0.86;
  const MIN_SCALE  = 1;        // 1 = 枠いっぱい（これ以上は引けない＝余白を作らせない）
  const MAX_SCALE  = 4;

  /* ============================================================
     多言語（既存 I18N は無改変。無いキーだけ足すマージ方式）
     ============================================================ */
  const PS_I18N = {
    ja: {
      shopMarkPhoto1: 'マイフォト 1', shopMarkPhoto2: 'マイフォト 2', shopMarkPhoto3: 'マイフォト 3',
      psTitle: '写真を切り抜く',
      psHint: 'ドラッグで位置、2本指でつまむと大きさが変わります',
      psGridNote: '線は、そろえたときにマスで分かれる位置です',
      psPick: '写真を選ぶ',
      psChange: '別の写真にする',
      psApply: 'これにする',
      psCancel: 'やめる',
      psDelete: '写真を消す',
      psDeleteTitle: 'この写真を消しますか？',
      psDeleteBody: '枠は残るので、あとからまた選び直せます。',
      psDeleteOk: '消す',
      psSaved: '写真を貼りました',
      psReadFail: 'この写真は読み込めませんでした',
      psSaveFail: '保存できませんでした。端末の空き容量を確かめてください',
      psPrivacy: "🔒 選んだ写真は、この端末の中だけに保存されます。どこかへ送られることはありません。",
      psPrivacyNote: "ブラウザのデータを消すと、写真も一緒に消えます。",
      psPrivacyShort: "選んだ写真はこの端末の中だけに保存され、どこかへ送られることはありません。",
      psZoom: '大きさ'
    },
    en: {
      shopMarkPhoto1: 'My Photo 1', shopMarkPhoto2: 'My Photo 2', shopMarkPhoto3: 'My Photo 3',
      psTitle: 'Crop your photo',
      psHint: 'Drag to move, pinch with two fingers to resize',
      psGridNote: 'The lines show where the stickers will split it',
      psPick: 'Choose a photo',
      psChange: 'Choose another',
      psApply: 'Use this',
      psCancel: 'Cancel',
      psDelete: 'Remove photo',
      psDeleteTitle: 'Remove this photo?',
      psDeleteBody: 'The slot stays, so you can pick another one later.',
      psDeleteOk: 'Remove',
      psSaved: 'Photo applied',
      psReadFail: "That photo couldn't be loaded",
      psSaveFail: "Couldn't save. Check the free space on your device",
      psPrivacy: "🔒 Your photo is stored on this device only. It is never sent anywhere.",
      psPrivacyNote: "Clearing your browser data deletes the photo too.",
      psPrivacyShort: "Your photo is stored on this device only and is never sent anywhere.",
      psZoom: 'Size'
    },
    'zh-CN': {
      shopMarkPhoto1: '我的照片 1', shopMarkPhoto2: '我的照片 2', shopMarkPhoto3: '我的照片 3',
      psTitle: '裁剪照片',
      psHint: '拖动可移动位置，双指捏合可缩放',
      psGridNote: '这些线是复原后贴纸分隔的位置',
      psPick: '选择照片',
      psChange: '换一张',
      psApply: '就用这张',
      psCancel: '取消',
      psDelete: '删除照片',
      psDeleteTitle: '要删除这张照片吗？',
      psDeleteBody: '格子会保留，之后还能再选一张。',
      psDeleteOk: '删除',
      psSaved: '已贴上照片',
      psReadFail: '无法读取这张照片',
      psSaveFail: '保存失败，请确认设备的可用空间',
      psPrivacy: "🔒 所选照片只保存在这台设备上，不会被发送到任何地方。",
      psPrivacyNote: "清除浏览器数据时，照片也会一并删除。",
      psPrivacyShort: "所选照片只保存在这台设备上，不会被发送到任何地方。",
      psZoom: '大小'
    },
    'zh-TW': {
      shopMarkPhoto1: '我的照片 1', shopMarkPhoto2: '我的照片 2', shopMarkPhoto3: '我的照片 3',
      psTitle: '裁切照片',
      psHint: '拖曳可移動位置，雙指捏合可縮放',
      psGridNote: '這些線是復原後貼紙分隔的位置',
      psPick: '選擇照片',
      psChange: '換一張',
      psApply: '就用這張',
      psCancel: '取消',
      psDelete: '刪除照片',
      psDeleteTitle: '要刪除這張照片嗎？',
      psDeleteBody: '格子會保留，之後還能再選一張。',
      psDeleteOk: '刪除',
      psSaved: '已貼上照片',
      psReadFail: '無法讀取這張照片',
      psSaveFail: '儲存失敗，請確認裝置的可用空間',
      psPrivacy: "🔒 所選照片只儲存在這台裝置上，不會被傳送到任何地方。",
      psPrivacyNote: "清除瀏覽器資料時，照片也會一併刪除。",
      psPrivacyShort: "所選照片只儲存在這台裝置上，不會被傳送到任何地方。",
      psZoom: '大小'
    },
    ko: {
      shopMarkPhoto1: '내 사진 1', shopMarkPhoto2: '내 사진 2', shopMarkPhoto3: '내 사진 3',
      psTitle: '사진 자르기',
      psHint: '드래그로 위치를, 두 손가락으로 크기를 조절할 수 있습니다',
      psGridNote: '선은 맞췄을 때 스티커로 나뉘는 위치입니다',
      psPick: '사진 고르기',
      psChange: '다른 사진으로',
      psApply: '이걸로 하기',
      psCancel: '취소',
      psDelete: '사진 지우기',
      psDeleteTitle: '이 사진을 지울까요?',
      psDeleteBody: '칸은 남으니 나중에 다시 고를 수 있습니다.',
      psDeleteOk: '지우기',
      psSaved: '사진을 붙였습니다',
      psReadFail: '이 사진은 불러올 수 없었습니다',
      psSaveFail: '저장하지 못했습니다. 기기의 남은 용량을 확인해 주세요',
      psPrivacy: "🔒 고른 사진은 이 기기 안에만 저장됩니다. 어디로도 전송되지 않습니다.",
      psPrivacyNote: "브라우저 데이터를 지우면 사진도 함께 사라집니다.",
      psPrivacyShort: "고른 사진은 이 기기 안에만 저장되며 어디로도 전송되지 않습니다.",
      psZoom: '크기'
    },
    es: {
      shopMarkPhoto1: 'Mi foto 1', shopMarkPhoto2: 'Mi foto 2', shopMarkPhoto3: 'Mi foto 3',
      psTitle: 'Recortar la foto',
      psHint: 'Arrastra para mover y pellizca con dos dedos para ampliar',
      psGridNote: 'Las líneas marcan dónde la dividirán las pegatinas',
      psPick: 'Elegir una foto',
      psChange: 'Elegir otra',
      psApply: 'Usar esta',
      psCancel: 'Cancelar',
      psDelete: 'Quitar la foto',
      psDeleteTitle: '¿Quitar esta foto?',
      psDeleteBody: 'La casilla se queda, así que luego puedes elegir otra.',
      psDeleteOk: 'Quitar',
      psSaved: 'Foto aplicada',
      psReadFail: 'No se pudo cargar esa foto',
      psSaveFail: 'No se pudo guardar. Comprueba el espacio libre del dispositivo',
      psPrivacy: "🔒 Tu foto se guarda solo en este dispositivo. No se envía a ningún sitio.",
      psPrivacyNote: "Si borras los datos del navegador, la foto también se borra.",
      psPrivacyShort: "Tu foto se guarda solo en este dispositivo y no se envía a ningún sitio.",
      psZoom: 'Tamaño'
    },
    id: {
      shopMarkPhoto1: 'Foto Saya 1', shopMarkPhoto2: 'Foto Saya 2', shopMarkPhoto3: 'Foto Saya 3',
      psTitle: 'Potong foto',
      psHint: 'Seret untuk menggeser, cubit dengan dua jari untuk memperbesar',
      psGridNote: 'Garisnya menandai tempat stiker akan membaginya',
      psPick: 'Pilih foto',
      psChange: 'Pilih yang lain',
      psApply: 'Pakai ini',
      psCancel: 'Batal',
      psDelete: 'Hapus foto',
      psDeleteTitle: 'Hapus foto ini?',
      psDeleteBody: 'Slotnya tetap ada, jadi nanti bisa pilih lagi.',
      psDeleteOk: 'Hapus',
      psSaved: 'Foto dipasang',
      psReadFail: 'Foto itu tidak bisa dibaca',
      psSaveFail: 'Gagal menyimpan. Periksa ruang kosong di perangkat',
      psPrivacy: "🔒 Foto yang dipilih hanya disimpan di perangkat ini. Tidak dikirim ke mana pun.",
      psPrivacyNote: "Menghapus data peramban juga menghapus fotonya.",
      psPrivacyShort: "Foto yang dipilih hanya disimpan di perangkat ini dan tidak dikirim ke mana pun.",
      psZoom: 'Ukuran'
    },
    ru: {
      shopMarkPhoto1: 'Моё фото 1', shopMarkPhoto2: 'Моё фото 2', shopMarkPhoto3: 'Моё фото 3',
      psTitle: 'Обрезать фото',
      psHint: 'Перетаскивайте, чтобы сдвинуть, сводите двумя пальцами, чтобы изменить размер',
      psGridNote: 'Линии показывают, где фото разделят наклейки',
      psPick: 'Выбрать фото',
      psChange: 'Выбрать другое',
      psApply: 'Использовать',
      psCancel: 'Отмена',
      psDelete: 'Удалить фото',
      psDeleteTitle: 'Удалить это фото?',
      psDeleteBody: 'Ячейка останется, позже можно выбрать другое.',
      psDeleteOk: 'Удалить',
      psSaved: 'Фото применено',
      psReadFail: 'Это фото не удалось загрузить',
      psSaveFail: 'Не удалось сохранить. Проверьте свободное место на устройстве',
      psPrivacy: "🔒 Выбранное фото хранится только на этом устройстве. Оно никуда не отправляется.",
      psPrivacyNote: "Если очистить данные браузера, фото тоже удалится.",
      psPrivacyShort: "Выбранное фото хранится только на этом устройстве и никуда не отправляется.",
      psZoom: 'Размер'
    },
    'pt-BR': {
      shopMarkPhoto1: 'Minha foto 1', shopMarkPhoto2: 'Minha foto 2', shopMarkPhoto3: 'Minha foto 3',
      psTitle: 'Recortar a foto',
      psHint: 'Arraste para mover e faça pinça com dois dedos para ampliar',
      psGridNote: 'As linhas mostram onde os adesivos vão dividir a foto',
      psPick: 'Escolher uma foto',
      psChange: 'Escolher outra',
      psApply: 'Usar esta',
      psCancel: 'Cancelar',
      psDelete: 'Remover a foto',
      psDeleteTitle: 'Remover esta foto?',
      psDeleteBody: 'O espaço continua ali, dá para escolher outra depois.',
      psDeleteOk: 'Remover',
      psSaved: 'Foto aplicada',
      psReadFail: 'Não foi possível carregar essa foto',
      psSaveFail: 'Não foi possível salvar. Verifique o espaço livre do aparelho',
      psPrivacy: "🔒 Sua foto fica guardada só neste aparelho. Ela não é enviada para lugar nenhum.",
      psPrivacyNote: "Se você limpar os dados do navegador, a foto também some.",
      psPrivacyShort: "Sua foto fica guardada só neste aparelho e não é enviada para lugar nenhum.",
      psZoom: 'Tamanho'
    }
  };

  if (typeof I18N !== 'undefined' && I18N) {
    Object.keys(PS_I18N).forEach(function (lang) {
      if (!I18N[lang]) I18N[lang] = {};
      Object.keys(PS_I18N[lang]).forEach(function (k) {
        if (I18N[lang][k] === undefined) I18N[lang][k] = PS_I18N[lang][k];
      });
    });
  }

  // 文言の引き当て。index.html 側の t() は別のスコープにいるので、
  // ここでは I18N を自分で引く（訳が無ければ日本語に落とす）。
  function T(key) {
    let lang = 'ja';
    try { lang = localStorage.getItem('rubiks-cube-lang') || 'ja'; } catch (e) { /* 既定のまま */ }
    if (typeof I18N === 'undefined' || !I18N) return key;
    const dict = I18N[lang] || {};
    if (dict[key] !== undefined) return dict[key];
    const ja = I18N.ja || {};
    return ja[key] !== undefined ? ja[key] : key;
  }

  /* ============================================================
     しまう / 取り出す
     ============================================================ */
  function keyOf(id) {
    const i = SLOT_IDS.indexOf(id);
    return i < 0 ? null : (KEY_PREFIX + (i + 1));
  }

  function get(id) {
    const k = keyOf(id);
    if (!k) return null;
    try {
      const v = localStorage.getItem(k);
      return (v && v.slice(0, 11) === 'data:image/') ? v : null;
    } catch (e) { return null; }
  }

  function put(id, dataUrl) {
    const k = keyOf(id);
    if (!k) return false;
    try { localStorage.setItem(k, dataUrl); return true; }
    catch (e) { return false; }   // 容量いっぱい など
  }

  function drop(id) {
    const k = keyOf(id);
    if (!k) return;
    try { localStorage.removeItem(k); } catch (e) { /* 消せなくても致命的ではない */ }
  }

  /* ============================================================
     CSS（style.css には触らず、ここで注入する）
     ============================================================ */
  const CSS = [
    /* ショップ(30)より前、確認ダイアログ(10300)や獲得演出(10250)より後ろ。
       消すときの確認は、この画面より前に出てもらわないといけない。 */
    '#photo-skin-overlay{position:fixed;inset:0;z-index:70;display:none;',
    '  align-items:center;justify-content:center;padding:16px;',
    '  background:rgba(8,8,11,.88);opacity:0;transition:opacity .2s ease}',
    '#photo-skin-overlay.show{display:flex}',
    '#photo-skin-overlay.show-visible{opacity:1}',

    '.ps-panel{width:min(420px,100%);max-height:92vh;overflow:auto;',
    '  background:#1c1c22;border:1px solid rgba(255,255,255,.08);border-radius:16px;',
    '  padding:18px 16px 16px;position:relative;',
    '  box-shadow:0 18px 48px rgba(0,0,0,.55);',
    '  animation:psRise .26s cubic-bezier(.2,.9,.3,1) both}',
    '@keyframes psRise{from{opacity:0;transform:translateY(10px) scale(.99)}to{opacity:1;transform:none}}',

    '.ps-title{margin:0 0 4px;font-size:17px;font-weight:700;color:#f2f2f5;text-align:center}',
    /* 写真の行き先は、選ぶより前に読める場所に置く。控えめだが埋もれない
       よう、枠で囲って本文と同じ大きさで出す。 */
    '.ps-privacy{margin:0 0 12px;padding:9px 11px;border-radius:10px;',
    '  background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.07);',
    '  font-size:12px;line-height:1.65;color:#c2c2ce}',
    '.ps-privacy-sub{display:block;margin-top:3px;font-size:11px;color:#8b8b97}',
    '.ps-hint{margin:12px 0 0;font-size:12px;line-height:1.5;color:#9a9aa6;text-align:center}',
    '.ps-note{margin:4px 0 0;font-size:11px;color:#7c7c88;text-align:center}',

    /* --- 切り抜きの枠。正方形で、はみ出しは隠す --- */
    '.ps-stage{position:relative;width:100%;aspect-ratio:1/1;border-radius:12px;',
    '  overflow:hidden;background:#0e0e11;touch-action:none;cursor:grab;',
    '  border:1px solid rgba(255,255,255,.10)}',
    '.ps-stage:active{cursor:grabbing}',
    '.ps-img{position:absolute;left:50%;top:50%;transform-origin:center;',
    '  will-change:transform;pointer-events:none;user-select:none;-webkit-user-drag:none}',
    /* 3x3 の線。そろえたときにマスで分かれる位置をそのまま見せる。 */
    '.ps-grid{position:absolute;inset:0;pointer-events:none;',
    '  background-image:',
    '    linear-gradient(rgba(255,255,255,.55) 1px,transparent 1px),',
    '    linear-gradient(90deg,rgba(255,255,255,.55) 1px,transparent 1px);',
    '  background-size:33.333% 33.333%;background-position:0 33.333%,33.333% 0;',
    '  filter:drop-shadow(0 0 1px rgba(0,0,0,.65))}',
    '.ps-stage.is-empty .ps-grid{display:none}',
    '.ps-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;',
    '  color:#6d6d79;font-size:13px;text-align:center;padding:24px;pointer-events:none}',
    '.ps-stage:not(.is-empty) .ps-empty{display:none}',

    /* --- 大きさのスライダー（つまめない環境のための逃げ道） --- */
    '.ps-zoom{display:flex;align-items:center;gap:10px;margin:12px 2px 0}',
    '.ps-zoom label{font-size:11px;color:#9a9aa6;flex:0 0 auto}',
    '.ps-zoom input{flex:1 1 auto;accent-color:var(--tc,#7cf0ff);min-width:0}',

    /* --- ボタン --- */
    '.ps-actions{display:flex;flex-direction:column;gap:8px;margin-top:14px}',
    '.ps-row{display:flex;gap:8px}',
    '.ps-row .action-btn{flex:1 1 0;min-width:0}',
    '.ps-btn-danger{color:#ff9aa5;border-color:rgba(255,120,136,.35)}',
    '.ps-file{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}',

    /* --- ショップのカードに付ける ✎ --- */
    '.shop-card.is-photo{position:relative}',
    '.shop-photo-edit{position:absolute;top:6px;right:6px;width:24px;height:24px;',
    '  display:flex;align-items:center;justify-content:center;border-radius:50%;',
    '  background:rgba(0,0,0,.55);color:#e8e8ee;font-size:12px;line-height:1;',
    '  border:1px solid rgba(255,255,255,.16)}',

    '@media (prefers-reduced-motion: reduce){',
    '  .ps-panel{animation:none}',
    '  #photo-skin-overlay{transition-duration:.01ms}',
    '}'
  ].join('');

  function injectCSS() {
    if (document.getElementById('photo-skin-style')) return;
    const st = document.createElement('style');
    st.id = 'photo-skin-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ============================================================
     画面をつくる（初回に1回だけ）
     ============================================================ */
  let el = null;   // まとめて持つ

  function build() {
    if (el) return el;
    injectCSS();

    const ov = document.createElement('div');
    ov.id = 'photo-skin-overlay';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.innerHTML =
      '<div class="ps-panel">' +
        '<button class="alg-panel-close-x" data-ps="close" aria-label="✕">✕</button>' +
        '<h2 class="ps-title" data-ps="title"></h2>' +
        '<p class="ps-privacy"><span data-ps="privacy"></span>' +
          '<span class="ps-privacy-sub" data-ps="privacyNote"></span></p>' +
        '<div class="ps-stage is-empty" data-ps="stage">' +
          '<img class="ps-img" data-ps="img" alt="">' +
          '<div class="ps-grid"></div>' +
          '<div class="ps-empty" data-ps="empty"></div>' +
        '</div>' +
        '<p class="ps-hint" data-ps="hint"></p>' +
        '<p class="ps-note" data-ps="note"></p>' +
        '<div class="ps-zoom">' +
          '<label data-ps="zoomLabel" for="ps-zoom-input"></label>' +
          '<input id="ps-zoom-input" type="range" min="100" max="400" value="100" data-ps="zoom">' +
        '</div>' +
        '<div class="ps-actions">' +
          '<button class="action-btn" data-ps="pick"></button>' +
          '<div class="ps-row">' +
            '<button class="action-btn" data-ps="cancel"></button>' +
            '<button class="action-btn" data-ps="apply"></button>' +
          '</div>' +
          '<button class="action-btn ps-btn-danger" data-ps="delete"></button>' +
        '</div>' +
        '<input type="file" accept="image/*" class="ps-file" data-ps="file">' +
      '</div>';
    document.body.appendChild(ov);

    const q = (n) => ov.querySelector('[data-ps="' + n + '"]');
    el = {
      overlay: ov, panel: ov.querySelector('.ps-panel'),
      title: q('title'), hint: q('hint'), note: q('note'), empty: q('empty'),
      privacy: q('privacy'), privacyNote: q('privacyNote'),
      stage: q('stage'), img: q('img'), zoom: q('zoom'), zoomLabel: q('zoomLabel'),
      pick: q('pick'), apply: q('apply'), cancel: q('cancel'),
      del: q('delete'), close: q('close'), file: q('file')
    };

    wire();
    return el;
  }

  /* ============================================================
     切り抜きの状態
     ------------------------------------------------------------
     base は「枠いっぱいに広げたときの表示サイズ」。scale=1 でちょうど
     枠を覆う。位置(tx,ty)は枠の中心からのずれ(CSSピクセル)。
     動かすのは transform だけなので、指で追いかけてもレイアウトの
     計算は一度も起きない。
     ============================================================ */
  let slot = null;
  let hooks = {};
  let img = new Image();
  let ready = false;
  let baseW = 0, baseH = 0, stageL = 0;
  let scale = 1, tx = 0, ty = 0;
  const pointers = new Map();
  let pinchStart = null;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function layout() {
    if (!ready) return;
    stageL = el.stage.clientWidth || 1;
    const ar = img.naturalWidth / img.naturalHeight;
    if (ar >= 1) { baseH = stageL; baseW = stageL * ar; }
    else         { baseW = stageL; baseH = stageL / ar; }
    el.img.style.width = baseW + 'px';
    el.img.style.height = baseH + 'px';
    apply();
  }

  function apply() {
    // 枠の外に余白ができないところまでで止める。
    const maxX = Math.max(0, (baseW * scale - stageL) / 2);
    const maxY = Math.max(0, (baseH * scale - stageL) / 2);
    tx = clamp(tx, -maxX, maxX);
    ty = clamp(ty, -maxY, maxY);
    el.img.style.transform =
      'translate(-50%,-50%) translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
    el.zoom.value = Math.round(scale * 100);
  }

  function setScale(next, cx, cy) {
    const before = scale;
    scale = clamp(next, MIN_SCALE, MAX_SCALE);
    if (cx !== undefined) {
      // つまんだ点を動かさずに拡大縮小する（指の下の絵が逃げない）。
      const k = scale / before;
      tx = cx - (cx - tx) * k;
      ty = cy - (cy - ty) * k;
    }
    apply();
  }

  /* ---------- 指の扱い ---------- */
  function stagePoint(e) {
    const r = el.stage.getBoundingClientRect();
    return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
  }

  function onDown(e) {
    if (!ready) return;
    el.stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, stagePoint(e));
    if (pointers.size === 2) {
      const p = Array.from(pointers.values());
      pinchStart = {
        dist: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1,
        scale: scale,
        cx: (p[0].x + p[1].x) / 2, cy: (p[0].y + p[1].y) / 2,
        tx: tx, ty: ty
      };
    }
  }

  function onMove(e) {
    if (!ready || !pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    const now = stagePoint(e);
    pointers.set(e.pointerId, now);

    if (pointers.size >= 2 && pinchStart) {
      const p = Array.from(pointers.values());
      const dist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1;
      const cx = (p[0].x + p[1].x) / 2, cy = (p[0].y + p[1].y) / 2;
      scale = clamp(pinchStart.scale * (dist / pinchStart.dist), MIN_SCALE, MAX_SCALE);
      // 2本指の中心も動くので、そのぶん一緒にずらす。
      const k = scale / pinchStart.scale;
      tx = cx - (pinchStart.cx - pinchStart.tx) * k;
      ty = cy - (pinchStart.cy - pinchStart.ty) * k;
      apply();
      return;
    }
    tx += now.x - prev.x;
    ty += now.y - prev.y;
    apply();
  }

  function onUp(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = null;
    try { el.stage.releasePointerCapture(e.pointerId); } catch (err) { /* すでに外れている */ }
  }

  /* ============================================================
     写真を読む
     ============================================================ */
  function loadInto(src, keepView) {
    ready = false;
    el.stage.classList.add('is-empty');
    const next = new Image();
    next.onload = function () {
      img = next;
      ready = true;
      el.img.src = src;
      el.stage.classList.remove('is-empty');
      if (!keepView) { scale = 1; tx = 0; ty = 0; }
      // 幅の実測は、画像が張り付いた次のフレームのほうが確実。
      requestAnimationFrame(layout);
      refreshButtons();
    };
    next.onerror = function () {
      ready = false;
      notify(T('psReadFail'), 'warn');
      refreshButtons();
    };
    next.src = src;
  }

  function onFile(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';                    // 同じ写真をもう一度選べるように
    if (!f) return;
    const fr = new FileReader();
    fr.onload = function () { loadInto(String(fr.result), false); };
    fr.onerror = function () { notify(T('psReadFail'), 'warn'); };
    fr.readAsDataURL(f);
  }

  /* ============================================================
     決定 — 枠の中身だけを 512x512 に焼く
     ============================================================ */
  function bake() {
    // 表示上の1pxが、もとの写真の何pxにあたるか
    const perPx = img.naturalWidth / (baseW * scale);
    // 枠の左上が、写真のどこに当たるか
    const sx = img.naturalWidth / 2 + (-stageL / 2 - tx) * perPx;
    const sy = img.naturalHeight / 2 + (-stageL / 2 - ty) * perPx;
    const size = stageL * perPx;

    const cv = document.createElement('canvas');
    cv.width = cv.height = OUT_SIZE;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    // 端がわずかに写真の外へ出ることがある(小数の誤差)。正方形のまま
    // 内側へ寄せる — 幅と高さを別々に詰めると、その分だけ絵が歪む。
    const cx0 = clamp(sx, 0, Math.max(0, img.naturalWidth - size));
    const cy0 = clamp(sy, 0, Math.max(0, img.naturalHeight - size));
    ctx.drawImage(img, cx0, cy0, size, size, 0, 0, OUT_SIZE, OUT_SIZE);
    return cv.toDataURL('image/jpeg', JPEG_Q);
  }

  function doApply() {
    if (!ready || !slot) return;
    let url = null;
    try { url = bake(); } catch (err) { url = null; }
    if (!url) { notify(T('psReadFail'), 'warn'); return; }
    if (!put(slot, url)) { notify(T('psSaveFail'), 'warn'); return; }
    const cb = hooks.onSave;
    close();
    if (typeof cb === 'function') cb(url);
  }

  function doDelete() {
    if (!slot) return;
    const id = slot;
    const run = function () {
      drop(id);
      const cb = hooks.onDelete;
      close();
      if (typeof cb === 'function') cb();
    };
    if (typeof global.askConfirm === 'function') {
      global.askConfirm({
        title: T('psDeleteTitle'), body: T('psDeleteBody'),
        ok: T('psDeleteOk'), cancel: T('psCancel'), onOk: run
      });
    } else { run(); }
  }

  function notify(msg, kind) {
    if (global.Shop && typeof global.Shop.notify === 'function') global.Shop.notify(msg, kind);
    else if (typeof global.alert === 'function') global.alert(msg);
  }

  /* ============================================================
     開く / 閉じる
     ============================================================ */
  function refreshButtons() {
    el.apply.disabled = !ready;
    el.apply.setAttribute('aria-disabled', ready ? 'false' : 'true');
    el.apply.style.opacity = ready ? '' : '.45';
    el.pick.textContent = ready ? T('psChange') : T('psPick');
    const saved = !!get(slot);
    el.del.hidden = !saved;
  }

  function paintText() {
    el.title.textContent = T('psTitle');
    el.hint.textContent = T('psHint');
    el.privacy.textContent = T('psPrivacy');
    el.privacyNote.textContent = T('psPrivacyNote');
    el.note.textContent = T('psGridNote');
    el.empty.textContent = T('psPick');
    el.apply.textContent = T('psApply');
    el.cancel.textContent = T('psCancel');
    el.del.textContent = T('psDelete');
    el.zoomLabel.textContent = T('psZoom');
    refreshButtons();
  }

  function open(id, opts) {
    if (SLOT_IDS.indexOf(id) < 0) return;
    build();
    slot = id;
    hooks = opts || {};
    paintText();

    const saved = get(id);
    if (saved) loadInto(saved, false);
    else {
      ready = false;
      el.img.removeAttribute('src');
      el.stage.classList.add('is-empty');
      refreshButtons();
    }

    el.overlay.classList.add('show');
    requestAnimationFrame(() => el.overlay.classList.add('show-visible'));
    // ここで自動的に写真選択を開くことはしない。iOS は「指で押した、その
    // 場で」しかファイル選択を開かせてくれず、待ってから開こうとすると
    // 黙って無視される。枠そのものを押せるようにしてあるので、開いた画面を
    // そのまま1回押せば選択に進める。
  }

  function close() {
    if (!el) return;
    el.overlay.classList.remove('show-visible');
    setTimeout(function () {
      if (!el) return;
      el.overlay.classList.remove('show');
      el.img.removeAttribute('src');
      el.stage.classList.add('is-empty');
    }, 200);
    slot = null;
    hooks = {};
    ready = false;
    pointers.clear();
    pinchStart = null;
  }

  function wire() {
    // 写真がまだ無いあいだは、枠そのものが「写真を選ぶ」ボタンになる。
    el.stage.addEventListener('click', function () { if (!ready) el.file.click(); });
    el.stage.addEventListener('pointerdown', onDown);
    el.stage.addEventListener('pointermove', onMove);
    el.stage.addEventListener('pointerup', onUp);
    el.stage.addEventListener('pointercancel', onUp);
    // マウスのホイールでも大きさを変えられる（PC向け）。
    el.stage.addEventListener('wheel', function (e) {
      if (!ready) return;
      e.preventDefault();
      const p = stagePoint(e);
      setScale(scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12), p.x, p.y);
    }, { passive: false });

    el.zoom.addEventListener('input', function () {
      if (!ready) return;
      setScale(Number(el.zoom.value) / 100, 0, 0);
    });

    el.pick.addEventListener('click', () => el.file.click());
    el.file.addEventListener('change', onFile);
    el.apply.addEventListener('click', doApply);
    el.del.addEventListener('click', doDelete);
    el.cancel.addEventListener('click', close);
    el.close.addEventListener('click', close);
    el.overlay.addEventListener('click', (e) => { if (e.target === el.overlay) close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && el && el.overlay.classList.contains('show')) close();
    });
    // 画面の回転や折りたたみで枠の大きさが変わったら、測り直す。
    global.addEventListener('resize', function () {
      if (el && el.overlay.classList.contains('show')) layout();
    });
  }

  /* ============================================================
     外向きの入口
     ============================================================ */
  // 画面は開かれる前に組み立てておく。index.html 側は起動時に一度だけ
  // 「キューブを隠す全画面オーバーレイ」の要素を集めるので、そのとき
  // #photo-skin-overlay がまだ無いと、切り抜き中もキューブが裏で
  // 描かれ続けてしまう（見えないのに電池を使う）。
  if (document.body) build();
  else document.addEventListener('DOMContentLoaded', build);

  global.PhotoSkin = {
    SLOT_IDS: SLOT_IDS.slice(),
    get: get,
    has: function (id) { return !!get(id); },
    open: open,
    close: close,
    remove: drop
  };
})(window);
