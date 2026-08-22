/* ============================================================
   sw.js — オフライン対応（機内モード）用 Service Worker
   ------------------------------------------------------------
   方針:
   ① index.html はネットワーク優先。オンラインなら常に最新を取得し、
      オフラインの時だけ最後にキャッシュした版を返す。
   ② style.css / i18n.js / vendor/three.min.js / fonts/*.woff2 など、
      ファイル名の末尾に ?v=... が付いているものはキャッシュ優先。
      中身が変われば index.html 側の ?v= も変わり、URLごと変わるので
      「新しいコードなのに古いキャッシュが返ってくる」ことは起きない。
   ③ 同じパス（?v= だけ違う）の古いキャッシュは、新しい版を取得した
      タイミングで自動的に消す。キャッシュ一覧を手作業で管理しなくて
      済むようにするための仕組み。
   ④ この SW 自体の更新は、index.html 側から SKIP_WAITING が送られる
      まで有効化しない。遊んでいる最中に勝手に切り替わって画面が
      おかしくなることを避けるため（index.html 側に「更新する」の
      案内バナーがある）。
   ============================================================ */

const CACHE_NAME = 'vcc-cube-runtime-v1';

/* 機能を追加してファイルを差し替えるたびに、この値を書き換える。
   ブラウザは sw.js の中身がバイト単位で変わったときだけ「新しい版が
   ある」と判断する仕組みなので、ここを変えない限り index.html 側の
   更新通知バナーは一切出ない（index.html や style.css の ?v= を
   上げるのと同じ感覚で、これも毎回上げること）。
   このコード自体は何もしない、ただの目印。 */
const SW_BUILD_MARKER = '2026-08-22a';

self.addEventListener('install', () => {
  // ここでは何もしない。skipWaiting() は呼ばない —
  // index.html からの SKIP_WAITING メッセージ（更新ボタンのタップ）を
  // 待ってから有効化する。
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // CACHE_NAME を変えた時だけ、それ以外の古いキャッシュ一式を
    // まるごと片付ける（通常運用では CACHE_NAME は変えない — 静的
    // ファイルは ③ の仕組みで個別に入れ替わっていく）。
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 外部ドメインには一切関与しない

  // ページ本体（index.html）: network-first
  if (req.mode === 'navigate' || url.pathname.endsWith('/index.html')) {
    event.respondWith(networkFirst(req));
    return;
  }

  // バージョン付きの静的ファイル: cache-first
  if (/\.(css|js|woff2)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(req));
    return;
  }
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch (err) {
    // オフライン: クエリの有無を無視して、最後に保存した index.html を返す
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  if (cached) return cached;

  const fresh = await fetch(req);
  if (fresh && fresh.ok) {
    // 同じパスの古い ?v= を残さない。ファイル名は同じでも中身が変わる
    // たびに ?v= が変わる運用なので、放っておくと際限なく溜まってしまう。
    const reqUrl = new URL(req.url);
    const keys = await cache.keys();
    await Promise.all(
      keys
        .filter((k) => new URL(k.url).pathname === reqUrl.pathname)
        .map((k) => cache.delete(k))
    );
    cache.put(req, fresh.clone());
  }
  return fresh;
}
