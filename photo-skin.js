/* ============================================================
   photo-skin.js — 「オリジナル」キューブスキン
   ------------------------------------------------------------
   自分の写真を6面に貼れるようにする枠。写真を9分割して面に貼る
   仕組み(showSolvedMark)はすでにあるので、このファイルが受け持つのは
     ① 写真をしまう場所（localStorage）
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

  /* 枠は2種類。
       original  … 1枚の写真を6面ぜんぶに貼る
       original6 … 6枚の写真を1面ずつに貼り分ける
     どちらも「引き換えるのは枠」で、写真の入れ替えは何度でもただ。 */
  const SLOTS = {
    original:  { faces: 1, keys: ['rubiks-cube-photo-skin'] },
    original6: {
      faces: 6,
      keys: ['rubiks-cube-photo-skin-f0', 'rubiks-cube-photo-skin-f1',
             'rubiks-cube-photo-skin-f2', 'rubiks-cube-photo-skin-f3',
             'rubiks-cube-photo-skin-f4', 'rubiks-cube-photo-skin-f5']
    }
  };
  const SLOT_IDS = Object.keys(SLOTS);
  const OUT_SIZE   = 512;      // 保存する一辺(px)
  const JPEG_Q     = 0.86;
  const MIN_SCALE  = 1;        // 1 = 枠いっぱい（これ以上は引けない＝余白を作らせない）
  const MAX_SCALE  = 4;

  /* ============================================================
     多言語（既存 I18N は無改変。無いキーだけ足すマージ方式）
     ============================================================ */
  const PS_I18N = {
    ja: {
      shopMarkOriginal: 'オリジナル',
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
      psPrivacy: "🔒 写真はこの端末の中のみ保存されます。",
      psPrivacyShort: "写真はこの端末の中のみ保存されます。",
      shopMarkOriginal6: "オリジナル×6",
      psFacesTitle: "6面ぶんの写真",
      psFacesHint: "まとめて選ぶと1面目から順に入ります。面を押せば切り抜きを直せます",
      psPickMany: "写真をまとめて選ぶ",
      psBatchNote: "写真を入れました。面を押すと切り抜きを直せます",
      psApplyFace: "この面にする",
      psDeleteFace: "この面の写真を消す",
      psDone: "閉じる",
      psZoom: '大きさ'
    },
    en: {
      shopMarkOriginal: 'Original',
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
      psPrivacy: "🔒 Photos are stored on this device only.",
      psPrivacyShort: "Photos are stored on this device only.",
      shopMarkOriginal6: "Original ×6",
      psFacesTitle: "One photo per face",
      psFacesHint: "Pick several at once and they fill from face 1. Tap a face to adjust its crop",
      psPickMany: "Choose photos",
      psBatchNote: "Photos added. Tap a face to adjust its crop",
      psApplyFace: "Use for this face",
      psDeleteFace: "Remove this face",
      psDone: "Done",
      psZoom: 'Size'
    },
    'zh-CN': {
      shopMarkOriginal: '原创',
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
      psPrivacy: "🔒 照片仅保存在这台设备上。",
      psPrivacyShort: "照片仅保存在这台设备上。",
      shopMarkOriginal6: "原创×6",
      psFacesTitle: "每面各一张照片",
      psFacesHint: "一次选多张会从第1面依次填入。点某一面即可调整裁剪",
      psPickMany: "批量选择照片",
      psBatchNote: "已添加照片。点某一面可调整裁剪",
      psApplyFace: "用于这一面",
      psDeleteFace: "删除这一面",
      psDone: "完成",
      psZoom: '大小'
    },
    'zh-TW': {
      shopMarkOriginal: '原創',
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
      psPrivacy: "🔒 照片僅儲存在這台裝置上。",
      psPrivacyShort: "照片僅儲存在這台裝置上。",
      shopMarkOriginal6: "原創×6",
      psFacesTitle: "每面各一張照片",
      psFacesHint: "一次選多張會從第1面依序填入。點某一面即可調整裁切",
      psPickMany: "批次選擇照片",
      psBatchNote: "已加入照片。點某一面可調整裁切",
      psApplyFace: "用於這一面",
      psDeleteFace: "刪除這一面",
      psDone: "完成",
      psZoom: '大小'
    },
    ko: {
      shopMarkOriginal: '오리지널',
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
      psPrivacy: "🔒 사진은 이 기기 안에만 저장됩니다.",
      psPrivacyShort: "사진은 이 기기 안에만 저장됩니다.",
      shopMarkOriginal6: "오리지널×6",
      psFacesTitle: "면마다 사진 한 장",
      psFacesHint: "여러 장을 한 번에 고르면 1번 면부터 채워집니다. 면을 누르면 자르기를 고칠 수 있습니다",
      psPickMany: "사진 여러 장 고르기",
      psBatchNote: "사진을 넣었습니다. 면을 누르면 자르기를 고칠 수 있습니다",
      psApplyFace: "이 면에 쓰기",
      psDeleteFace: "이 면 사진 지우기",
      psDone: "닫기",
      psZoom: '크기'
    },
    es: {
      shopMarkOriginal: 'Original',
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
      psPrivacy: "🔒 Las fotos se guardan solo en este dispositivo.",
      psPrivacyShort: "Las fotos se guardan solo en este dispositivo.",
      shopMarkOriginal6: "Original ×6",
      psFacesTitle: "Una foto por cara",
      psFacesHint: "Si eliges varias a la vez, se colocan desde la cara 1. Toca una cara para ajustar el recorte",
      psPickMany: "Elegir varias fotos",
      psBatchNote: "Fotos añadidas. Toca una cara para ajustar el recorte",
      psApplyFace: "Usar en esta cara",
      psDeleteFace: "Quitar esta cara",
      psDone: "Listo",
      psZoom: 'Tamaño'
    },
    id: {
      shopMarkOriginal: 'Original',
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
      psPrivacy: "🔒 Foto hanya disimpan di perangkat ini.",
      psPrivacyShort: "Foto hanya disimpan di perangkat ini.",
      shopMarkOriginal6: "Original ×6",
      psFacesTitle: "Satu foto tiap sisi",
      psFacesHint: "Pilih beberapa sekaligus dan terisi dari sisi 1. Ketuk sebuah sisi untuk mengatur potongannya",
      psPickMany: "Pilih beberapa foto",
      psBatchNote: "Foto ditambahkan. Ketuk sebuah sisi untuk mengatur potongannya",
      psApplyFace: "Pakai untuk sisi ini",
      psDeleteFace: "Hapus sisi ini",
      psDone: "Selesai",
      psZoom: 'Ukuran'
    },
    ru: {
      shopMarkOriginal: 'Своя',
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
      psPrivacy: "🔒 Фото хранятся только на этом устройстве.",
      psPrivacyShort: "Фото хранятся только на этом устройстве.",
      shopMarkOriginal6: "Своя ×6",
      psFacesTitle: "По фото на каждую грань",
      psFacesHint: "Выберите сразу несколько — они заполнят грани с первой. Нажмите на грань, чтобы поправить обрезку",
      psPickMany: "Выбрать несколько фото",
      psBatchNote: "Фото добавлены. Нажмите на грань, чтобы поправить обрезку",
      psApplyFace: "Взять для этой грани",
      psDeleteFace: "Убрать с этой грани",
      psDone: "Готово",
      psZoom: 'Размер'
    },
    'pt-BR': {
      shopMarkOriginal: 'Original',
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
      psPrivacy: "🔒 As fotos ficam guardadas só neste aparelho.",
      psPrivacyShort: "As fotos ficam guardadas só neste aparelho.",
      shopMarkOriginal6: "Original ×6",
      psFacesTitle: "Uma foto por face",
      psFacesHint: "Escolha várias de uma vez e elas entram a partir da face 1. Toque numa face para ajustar o recorte",
      psPickMany: "Escolher várias fotos",
      psBatchNote: "Fotos adicionadas. Toque numa face para ajustar o recorte",
      psApplyFace: "Usar nesta face",
      psDeleteFace: "Remover esta face",
      psDone: "Pronto",
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
  function facesOf(id) {
    const sl = SLOTS[id];
    return sl ? sl.faces : 0;
  }
  function keyOf(id, face) {
    const sl = SLOTS[id];
    if (!sl) return null;
    return sl.keys[face || 0] || null;
  }

  function readKey(k) {
    try {
      const v = localStorage.getItem(k);
      return (v && v.slice(0, 11) === 'data:image/') ? v : null;
    } catch (e) { return null; }
  }

  // その枠の写真を面の数だけ並べて返す（未設定の面は null）。
  function getAll(id) {
    const sl = SLOTS[id];
    if (!sl) return [];
    return sl.keys.map(readKey);
  }
  // 代表の1枚（ショップの見本や、1枚の枠のふつうの取り出しに使う）。
  function get(id) {
    const all = getAll(id);
    for (let i = 0; i < all.length; i++) if (all[i]) return all[i];
    return null;
  }
  function count(id) {
    return getAll(id).filter(Boolean).length;
  }

  function put(id, face, dataUrl) {
    const k = keyOf(id, face);
    if (!k) return false;
    try { localStorage.setItem(k, dataUrl); return true; }
    catch (e) { return false; }   // 容量いっぱい など
  }

  // face を渡せばその面だけ、省けば枠ごと全部を消す。
  function drop(id, face) {
    const sl = SLOTS[id];
    if (!sl) return;
    const keys = (face === undefined) ? sl.keys : [sl.keys[face]];
    keys.forEach(function (k) {
      if (!k) return;
      try { localStorage.removeItem(k); } catch (e) { /* 消せなくても致命的ではない */ }
    });
  }

  /* ============================================================
     CSS（style.css には触らず、ここで注入する）
     ============================================================ */
  const CSS = [
    /* 確認ダイアログ(10300)と獲得演出(10250)より後ろ、それ以外の
       全画面パーツより前。70 だったころ、画面のふちに出る操作ハンドルが
       パネルの上に重なって見えていた。 */
    '#photo-skin-overlay{position:fixed;inset:0;z-index:10200;display:none;',
    '  align-items:center;justify-content:center;padding:12px;',
    '  background:rgba(8,8,11,.9);opacity:0;transition:opacity .2s ease}',
    '#photo-skin-overlay.show{display:flex}',
    '#photo-skin-overlay.show-visible{opacity:1}',

    '.ps-panel{width:min(400px,100%);max-height:96svh;overflow:auto;',
    '  background:#1c1c22;border:1px solid rgba(255,255,255,.08);border-radius:18px;',
    '  padding:14px 14px 16px;position:relative;',
    '  box-shadow:0 18px 48px rgba(0,0,0,.55);',
    '  animation:psRise .26s cubic-bezier(.2,.9,.3,1) both}',
    '@keyframes psRise{from{opacity:0;transform:translateY(10px) scale(.99)}to{opacity:1;transform:none}}',

    /* 見出しと ✕ を1行に並べる。✕ が本文に食い込まないよう、
       見出しは ✕ のぶんだけ内側に寄せてある。 */
    '.ps-head{display:flex;align-items:center;justify-content:space-between;',
    '  gap:8px;margin:0 0 10px}',
    '.ps-title{margin:0;font-size:16px;font-weight:700;color:#f2f2f5;',
    '  flex:1 1 auto;min-width:0}',
    '.ps-x{flex:0 0 auto;width:34px;height:34px;border-radius:50%;',
    '  border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);',
    '  color:#d8d8e2;font-size:16px;line-height:1;padding:0;',
    '  display:flex;align-items:center;justify-content:center}',

    '.ps-privacy{margin:0 0 10px;padding:8px 10px;border-radius:10px;',
    '  background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.07);',
    '  font-size:11.5px;line-height:1.5;color:#b6b6c4}',
    '.ps-hint{margin:8px 0 0;font-size:11.5px;line-height:1.5;',
    '  color:#8e8e9c;text-align:center}',

    /* --- 切り抜きの枠。正方形で、はみ出しは隠す ---
       画面の高さの半分までに抑える。ここを width:100% のままにすると、
       縦長の端末では枠だけで画面を使い切ってしまい、下のボタンが
       画面外へ押し出される（見出しが切れて出るのはこれが原因だった）。 */
    '.ps-stage{position:relative;width:100%;max-width:min(100%,50svh);',
    '  margin:0 auto;aspect-ratio:1/1;border-radius:14px;',
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
    /* 写真がまだ無いときは、枠ぜんぶが「写真を選ぶ」ボタンに見えるように */
    '.ps-empty{position:absolute;inset:0;display:flex;flex-direction:column;',
    '  align-items:center;justify-content:center;gap:8px;',
    '  color:#9a9aa8;font-size:14px;font-weight:600;text-align:center;padding:20px;',
    '  pointer-events:none}',
    '.ps-empty::before{content:"＋";display:flex;align-items:center;',
    '  justify-content:center;width:46px;height:46px;border-radius:50%;',
    '  border:1.5px dashed rgba(255,255,255,.22);font-size:22px;font-weight:400;',
    '  color:#8a8a98}',
    '.ps-stage:not(.is-empty) .ps-empty{display:none}',

    /* --- 6面ぶんの見本帯（オリジナル×6 のときだけ出す） --- */
    '.ps-faces{display:none;gap:6px;margin:0 0 10px}',
    '.ps-panel.is-multi .ps-faces{display:flex}',
    '.ps-face{flex:1 1 0;min-width:0;aspect-ratio:1/1;border-radius:10px;',
    '  background:#0e0e11 center/cover no-repeat;border:1px solid rgba(255,255,255,.10);',
    '  padding:0;position:relative;color:#5f5f6b;font-size:11px;',
    '  display:flex;align-items:center;justify-content:center}',
    '.ps-face.is-on{border-color:var(--tc,#7cf0ff);',
    '  box-shadow:0 0 0 2px var(--tc,#7cf0ff) inset}',
    '.ps-face.is-set{color:transparent}',
    '.ps-faces-head{display:none;align-items:baseline;justify-content:space-between;',
    '  margin:0 2px 6px}',
    '.ps-panel.is-multi .ps-faces-head{display:flex}',
    '.ps-faces-title{font-size:12px;color:#c2c2ce}',
    '.ps-faces-count{font-size:11px;color:#8b8b97;font-variant-numeric:tabular-nums}',

    /* --- 大きさのスライダー（つまめない環境のための逃げ道） --- */
    '.ps-zoom{display:flex;align-items:center;gap:10px;margin:10px 2px 0}',
    '.ps-zoom label{font-size:11px;color:#9a9aa6;flex:0 0 auto}',
    '.ps-zoom input{flex:1 1 auto;accent-color:var(--tc,#7cf0ff);min-width:0;height:26px}',

    /* --- ボタン ---
       4つとも同じ見た目だと、どれが「決定」かを毎回読んで探すことになる。
       決定＝塗り、選び直し＝枠線、やめる/消すは文字だけ、と重さを3段に
       分けて、指で押す所も 52px 確保する。 */
    '.ps-actions{display:flex;flex-direction:column;gap:9px;margin-top:12px}',
    '.ps-btn{width:100%;min-height:52px;border-radius:14px;padding:0 14px;',
    '  font-size:15px;font-weight:700;line-height:1.3;',
    '  display:flex;align-items:center;justify-content:center;text-align:center;',
    '  border:1px solid transparent;background:transparent;color:#e8e8ee;',
    '  transition:background .18s ease,border-color .18s ease,opacity .18s ease}',
    /* 決定 — アクセント色で塗る。文字は下地に合わせて濃色。 */
    '.ps-btn-primary{background:var(--tc,#7cf0ff);color:#10131a;',
    '  box-shadow:0 6px 18px rgba(var(--tc-rgb,124,240,255),.18)}',
    '.ps-btn-primary[disabled]{opacity:.4;box-shadow:none}',
    /* 選び直し — 枠線だけ */
    '.ps-btn-ghost{border-color:rgba(255,255,255,.16);background:rgba(255,255,255,.04)}',
    /* やめる / 消す — 文字だけ。押し間違えても痛くない大きさに落とす。 */
    '.ps-mini{display:flex;align-items:center;justify-content:center;gap:16px;',
    '  margin-top:4px}',
    '.ps-mini button{min-height:40px;padding:0 10px;background:none;border:0;',
    '  font-size:13px;font-weight:600;color:#8e8e9c}',
    '.ps-mini .ps-del{color:#e08792}',
    '.ps-mini-sep{color:#4a4a56;font-size:12px}',

    '.ps-file{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}',

    /* --- ショップのカードに付ける ✎ --- */
    '.shop-card.is-photo{position:relative}',
    '.shop-photo-edit{position:absolute;top:6px;right:6px;width:26px;height:26px;',
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
        '<div class="ps-head">' +
          '<h2 class="ps-title" data-ps="title"></h2>' +
          '<button class="ps-x ui-pressable" data-ps="close" aria-label="✕">✕</button>' +
        '</div>' +
        '<p class="ps-privacy" data-ps="privacy"></p>' +
        '<div class="ps-faces-head">' +
          '<span class="ps-faces-title" data-ps="facesTitle"></span>' +
          '<span class="ps-faces-count" data-ps="facesCount"></span>' +
        '</div>' +
        '<div class="ps-faces" data-ps="faces"></div>' +
        '<div class="ps-stage is-empty" data-ps="stage">' +
          '<img class="ps-img" data-ps="img" alt="">' +
          '<div class="ps-grid"></div>' +
          '<div class="ps-empty" data-ps="empty"></div>' +
        '</div>' +
        '<p class="ps-hint" data-ps="hint"></p>' +
        '<div class="ps-zoom">' +
          '<label data-ps="zoomLabel" for="ps-zoom-input"></label>' +
          '<input id="ps-zoom-input" type="range" min="100" max="400" value="100" data-ps="zoom">' +
        '</div>' +
        '<div class="ps-actions">' +
          '<button class="ps-btn ps-btn-ghost ui-pressable" data-ps="pick"></button>' +
          '<button class="ps-btn ps-btn-primary ui-pressable" data-ps="apply"></button>' +
          '<div class="ps-mini">' +
            '<button class="ui-pressable" data-ps="cancel"></button>' +
            '<span class="ps-mini-sep" data-ps="sep">・</span>' +
            '<button class="ps-del ui-pressable" data-ps="delete"></button>' +
          '</div>' +
        '</div>' +
        '<input type="file" accept="image/*" class="ps-file" data-ps="file">' +
      '</div>';
    document.body.appendChild(ov);

    const q = (n) => ov.querySelector('[data-ps="' + n + '"]');
    el = {
      overlay: ov, panel: ov.querySelector('.ps-panel'),
      title: q('title'), hint: q('hint'), empty: q('empty'), sep: q('sep'),
      privacy: q('privacy'),
      faces: q('faces'), facesTitle: q('facesTitle'), facesCount: q('facesCount'),
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
  let face = 0;          // オリジナル×6 のとき、いま決めている面
  let savedAny = false;  // この画面を開いてから1枚でも保存したか
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

  function readFile(f) {
    return new Promise(function (res, rej) {
      const fr = new FileReader();
      fr.onload = function () { res(String(fr.result)); };
      fr.onerror = rej;
      fr.readAsDataURL(f);
    });
  }
  function loadImage(src) {
    return new Promise(function (res, rej) {
      const im = new Image();
      im.onload = function () { res(im); };
      im.onerror = rej;
      im.src = src;
    });
  }

  /* まとめて選んだぶんは、1枚ずつ指で切り抜いてもらうわけにいかないので、
     まん中を正方形に取る。あとから面を押せば、その面だけ切り抜き直せる。 */
  function centerBake(im) {
    const size = Math.min(im.naturalWidth, im.naturalHeight);
    const cv = document.createElement('canvas');
    cv.width = cv.height = OUT_SIZE;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(im, (im.naturalWidth - size) / 2, (im.naturalHeight - size) / 2,
                  size, size, 0, 0, OUT_SIZE, OUT_SIZE);
    return cv.toDataURL('image/jpeg', JPEG_Q);
  }

  /* 何枚まとめて選ばれても、面の数だけ受け取る。
     2枚以上なら1面目から順に、1枚だけならいま選んでいる面に入れる
     （「6枚選んだのに3面目から入る」といった当てられ方をしないように）。 */
  async function takeMany(files) {
    const n = facesOf(slot);
    const list = Array.prototype.slice.call(files, 0, n);
    const start = list.length > 1 ? 0 : face;
    const id = slot;
    let bad = 0;

    el.pick.disabled = true;
    for (let k = 0; k < list.length; k++) {
      if (slot !== id) return;              // 途中で閉じられた
      const at = (start + k) % n;
      try {
        const im = await loadImage(await readFile(list[k]));
        if (!put(id, at, centerBake(im))) { notify(T('psSaveFail'), 'warn'); break; }
        savedAny = true;
      } catch (err) { bad++; }
      paintFaces();
    }
    el.pick.disabled = false;
    if (slot !== id) return;

    if (bad) notify(T('psReadFail'), 'warn');
    if (savedAny) {
      if (typeof hooks.onSave === 'function') hooks.onSave(get(id));
      notify(T('psBatchNote'), 'good');
    }
    selectFace(start);
  }

  function onFile(e) {
    const files = e.target.files;
    const many = files && files.length > 1 && facesOf(slot) > 1;
    // 同じ写真をもう一度選べるように、読む前に入力欄を空にする
    // （files への参照はこのあとも生きている）。
    const list = files ? Array.prototype.slice.call(files) : [];
    e.target.value = '';
    if (!list.length) return;
    if (many) { takeMany(list); return; }
    // 1枚だけなら、これまでどおり指で切り抜いてもらう。
    readFile(list[0])
      .then(function (url) { loadInto(url, false); })
      .catch(function () { notify(T('psReadFail'), 'warn'); });
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
    if (!put(slot, face, url)) { notify(T('psSaveFail'), 'warn'); return; }
    savedAny = true;

    // 1枚だけの枠は、決めた時点でおしまい。
    if (facesOf(slot) < 2) {
      const cb = hooks.onSave;
      close();
      if (typeof cb === 'function') cb(url);
      return;
    }

    // 6面ぶんの枠は、決めたらそのまま「まだ空いている次の面」へ進む。
    // 6面ぜんぶ入っていれば、いま決めた面に留まる（見比べられるように）。
    if (typeof hooks.onSave === 'function') hooks.onSave(get(slot));
    const all = getAll(slot);
    let next = -1;
    for (let k = 1; k <= all.length; k++) {
      const i = (face + k) % all.length;
      if (!all[i]) { next = i; break; }
    }
    if (next >= 0) selectFace(next);
    else { paintFaces(); refreshButtons(); }
  }

  function doDelete() {
    if (!slot) return;
    const id = slot;
    const multi = facesOf(id) > 1;
    const at = face;
    const run = function () {
      drop(id, multi ? at : undefined);
      const cb = hooks.onDelete;
      // 6面ぶんの枠は、1面消しても残りが生きているので画面は開けたまま。
      if (multi && count(id) > 0) {
        if (typeof cb === 'function') cb();
        selectFace(at);
        return;
      }
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
  // 6面ぶんの見本帯。マスを押すとその面に切り替わる。
  function paintFaces() {
    const n = facesOf(slot);
    el.panel.classList.toggle('is-multi', n > 1);
    if (n < 2) { el.faces.innerHTML = ''; return; }
    const all = getAll(slot);
    if (el.faces.children.length !== n) {
      el.faces.innerHTML = '';
      for (let i = 0; i < n; i++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ps-face';
        b.dataset.face = String(i);
        el.faces.appendChild(b);
      }
    }
    for (let i = 0; i < n; i++) {
      const b = el.faces.children[i];
      b.textContent = String(i + 1);
      b.classList.toggle('is-on', i === face);
      b.classList.toggle('is-set', !!all[i]);
      b.style.backgroundImage = all[i] ? 'url(' + all[i] + ')' : '';
    }
    el.facesCount.textContent = all.filter(Boolean).length + ' / ' + n;
  }

  function selectFace(i) {
    face = i;
    const saved = getAll(slot)[i];
    if (saved) loadInto(saved, false);
    else {
      ready = false;
      el.img.removeAttribute('src');
      el.stage.classList.add('is-empty');
    }
    paintFaces();
    refreshButtons();
  }

  function refreshButtons() {
    const multi = facesOf(slot) > 1;
    el.apply.disabled = !ready;
    el.apply.setAttribute('aria-disabled', ready ? 'false' : 'true');
    el.pick.textContent = multi ? T('psPickMany') : (ready ? T('psChange') : T('psPick'));
    el.apply.textContent = T(multi ? 'psApplyFace' : 'psApply');
    el.del.textContent  = T(multi ? 'psDeleteFace' : 'psDelete');
    el.cancel.textContent = T(multi ? 'psDone' : 'psCancel');
    const saved = multi ? !!getAll(slot)[face] : !!get(slot);
    el.del.hidden = !saved;
    el.sep.hidden = !saved;
  }

  function paintText() {
    el.title.textContent = T('psTitle');
    el.privacy.textContent = T('psPrivacy');
    el.empty.textContent = T('psPick');
    el.facesTitle.textContent = T('psFacesTitle');
    el.hint.textContent = facesOf(slot) > 1 ? T('psFacesHint') : T('psHint');
    el.zoomLabel.textContent = T('psZoom');
    // これにする / 消す / 閉じる の文言は、枠が1枚ぶんか6面ぶんかで
    // 変わるので refreshButtons() 側でまとめて入れる。
    refreshButtons();
  }

  function open(id, opts) {
    if (SLOT_IDS.indexOf(id) < 0) return;
    build();
    slot = id;
    hooks = opts || {};
    savedAny = false;
    // 開いた時点でいちばん自然な面 = まだ写真の無い最初の面。
    // ぜんぶ埋まっていれば1面目から見せる。
    const all = getAll(id);
    face = 0;
    for (let i = 0; i < all.length; i++) { if (!all[i]) { face = i; break; } }
    // 6面ぶんの枠のときだけ、写真をまとめて選べるようにする。
    if (facesOf(id) > 1) el.file.setAttribute('multiple', '');
    else el.file.removeAttribute('multiple');
    paintText();
    paintFaces();
    selectFace(face);

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
    face = 0;
    savedAny = false;
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

    el.faces.addEventListener('click', function (e) {
      const b = e.target.closest ? e.target.closest('.ps-face') : null;
      if (!b || !slot) return;
      selectFace(Number(b.dataset.face) || 0);
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
    faces: facesOf,
    get: get,                 // 代表の1枚（見本用）
    getAll: getAll,           // 面の数だけ並べた配列（未設定は null）
    count: count,
    has: function (id) { return !!get(id); },
    open: open,
    close: close,
    remove: drop
  };
})(window);
