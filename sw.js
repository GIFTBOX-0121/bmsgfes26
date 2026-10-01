const CACHE_NAME = "bmsgfes26-v17-offline";

/*
  =========================================================
  BMSG FES 2026 SERVICE WORKER

  方針
  ---------------------------------------------------------
  ・Service Worker の install を重くしない
  ・地図タイルの大量取得を install 中に行わない
  ・サイト本体はオフライン起動可能
  ・一度表示した地図タイルは自動保存
  ・PRIVATE API / 天気APIはSWキャッシュしない
  ・localStorageには一切触れない
  =========================================================
*/


/* =========================================================
   APP SHELL
========================================================= */

const APP_SHELL = [
  "./",
  "./index.html",
  "./Map.JPG",
  "./manifest.webmanifest",
  "./leaflet.css",
  "./leaflet.js"
];


/* =========================================================
   INSTALL
========================================================= */

self.addEventListener("install", event => {

  /*
    ここでは地図タイルを大量取得しない。

    APP SHELLだけを保存する。

    1ファイルの取得失敗によって
    Service Worker全体のinstallが失敗しないよう、
    個別に取得する。
  */

  event.waitUntil(
    (async () => {

      const cache = await caches.open(CACHE_NAME);

      for (const url of APP_SHELL) {

        try {

          const response = await fetch(
            url,
            {
              cache: "reload"
            }
          );

          if (
            response &&
            (
              response.ok ||
              response.type === "opaque"
            )
          ) {

            await cache.put(
              url,
              response.clone()
            );

          }

        } catch (error) {

          /*
            1ファイル取得できなくても
            SW install自体は続行する。
          */

          console.warn(
            "[SW] APP SHELL cache failed:",
            url,
            error
          );

        }

      }

    })()
  );

  /*
    古いSWのwaitingを待たず、
    install完了後すぐ新SWへ移行。
  */

  self.skipWaiting();

});


/* =========================================================
   ACTIVATE
========================================================= */

self.addEventListener("activate", event => {

  event.waitUntil(
    (async () => {

      const keys = await caches.keys();

      /*
        このサイトの古いSWキャッシュだけ削除。

        localStorage
        IndexedDB
        PRIVATE DATA
        持ち物
        取引
        MY SPOTS

        には一切触れない。
      */

      await Promise.all(
        keys
          .filter(
            key =>
              key.startsWith("bmsgfes26-") &&
              key !== CACHE_NAME
          )
          .map(
            key => caches.delete(key)
          )
      );

      /*
        開いているページを
        新しいSWの管理下にする。
      */

      await self.clients.claim();

    })()
  );

});


/* =========================================================
   FETCH
========================================================= */

self.addEventListener("fetch", event => {

  const request = event.request;

  /*
    GET以外はSWで処理しない。
  */

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);


  /* =====================================================
     PRIVATE API / WEATHER

     個人データAPIと天気APIは
     Service Workerではキャッシュしない。
  ===================================================== */

  if (
    url.hostname === "bmsgfes26.starsx0601.workers.dev" ||
    url.hostname === "api.open-meteo.com"
  ) {

    return;

  }


  /* =====================================================
     PAGE NAVIGATION

     ONLINE
       ↓
     最新index.htmlを取得して保存

     OFFLINE
       ↓
     保存済みindex.htmlを表示
  ===================================================== */

  if (request.mode === "navigate") {

    event.respondWith(
      (async () => {

        const cache = await caches.open(CACHE_NAME);

        /*
          ONLINE
        */

        try {

          const fresh = await fetch(
            request,
            {
              cache: "no-store"
            }
          );

          if (
            fresh &&
            fresh.ok
          ) {

            /*
              最新ページをindex.htmlとして保存
            */

            try {

              await cache.put(
                "./index.html",
                fresh.clone()
              );

            } catch (error) {}

            /*
              ルートURLとしても保存
            */

            try {

              await cache.put(
                "./",
                fresh.clone()
              );

            } catch (error) {}

            return fresh;

          }

        } catch (error) {

          /*
            ネットワーク失敗
            ↓
            OFFLINEへ
          */

        }


        /*
          OFFLINE

          まずindex.html
        */

        let cached = await cache.match(
          "./index.html"
        );

        if (cached) {
          return cached;
        }


        /*
          次にルート
        */

        cached = await cache.match(
          "./"
        );

        if (cached) {
          return cached;
        }


        /*
          最後に現在URL
        */

        cached = await cache.match(
          request
        );

        if (cached) {
          return cached;
        }


        /*
          初回オンライン起動前など、
          何も保存されていない場合。
        */

        return new Response(
          `
<!DOCTYPE html>
<html lang="ja">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
>

<title>BMSG FES 2026</title>

<style>

body{
  margin:0;
  min-height:100vh;
  display:flex;
  align-items:center;
  justify-content:center;
  background:#080808;
  color:#fff;
  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "Helvetica Neue",
    Arial,
    sans-serif;
  text-align:center;
}

.offline{
  padding:30px;
}

h1{
  font-size:22px;
  letter-spacing:.08em;
}

p{
  color:#aaa;
  font-size:14px;
  line-height:1.8;
}

</style>

</head>

<body>

<div class="offline">

<h1>BMSG FES 2026</h1>

<p>
オフラインデータを準備できませんでした。
<br>
一度オンラインでサイトを開いてから
<br>
もう一度お試しください。
</p>

</div>

</body>

</html>
          `,
          {
            status: 503,
            headers: {
              "Content-Type":
                "text/html; charset=utf-8"
            }
          }
        );

      })()
    );

    return;

  }


  /* =====================================================
     OPENSTREETMAP TILES

     CACHE FIRST

     保存済み
       ↓
     即表示

     未保存
       ↓
     ネット取得
       ↓
     自動保存

     つまり、
     一度表示した地図範囲は
     次回オフラインでも表示できる。
  ===================================================== */

  if (
    url.hostname === "tile.openstreetmap.org" ||
    url.hostname.endsWith(".tile.openstreetmap.org")
  ) {

    event.respondWith(
      (async () => {

        const cache = await caches.open(CACHE_NAME);

        /*
          まず保存済みタイル
        */

        const cached = await cache.match(
          request
        );

        if (cached) {
          return cached;
        }


        /*
          なければオンライン取得
        */

        try {

          const fresh = await fetch(
            request
          );

          if (
            fresh &&
            (
              fresh.ok ||
              fresh.type === "opaque"
            )
          ) {

            try {

              await cache.put(
                request,
                fresh.clone()
              );

            } catch (error) {

              /*
                保存できなくても
                オンライン表示は続ける。
              */

            }

          }

          return fresh;

        } catch (error) {

          /*
            未保存タイル＋OFFLINE
          */

          return new Response(
            "",
            {
              status: 504
            }
          );

        }

      })()
    );

    return;

  }


  /* =====================================================
     SAME ORIGIN FILES

     index以外の

     Map.JPG
     manifest
     leaflet.css
     leaflet.js
     その他Pages内ファイル

     ONLINE
       ↓
     最新版＋保存

     OFFLINE
       ↓
     保存版
  ===================================================== */

  if (
    url.origin === self.location.origin
  ) {

    event.respondWith(
      (async () => {

        const cache = await caches.open(CACHE_NAME);


        /*
          ONLINE
        */

        try {

          const fresh = await fetch(
            request,
            {
              cache: "no-store"
            }
          );

          if (
            fresh &&
            fresh.ok
          ) {

            try {

              await cache.put(
                request,
                fresh.clone()
              );

            } catch (error) {}

            return fresh;

          }

        } catch (error) {

          /*
            OFFLINEへ
          */

        }


        /*
          OFFLINE
        */

        const cached = await cache.match(
          request
        );

        if (cached) {
          return cached;
        }


        /*
          URL表記差対策
        */

        const pathnameCached =
          await cache.match(url.pathname);

        if (pathnameCached) {
          return pathnameCached;
        }


        return new Response(
          "",
          {
            status: 504
          }
        );

      })()
    );

    return;

  }


  /* =====================================================
     OTHER EXTERNAL FILES

     Leaflet CDNなど。

     保存済みがあれば利用。
     オンライン時は最新版を取得して保存。
  ===================================================== */

  event.respondWith(
    (async () => {

      const cache = await caches.open(CACHE_NAME);

      const cached = await cache.match(
        request
      );


      try {

        const fresh = await fetch(
          request
        );

        if (
          fresh &&
          (
            fresh.ok ||
            fresh.type === "opaque"
          )
        ) {

          try {

            await cache.put(
              request,
              fresh.clone()
            );

          } catch (error) {}

        }

        return fresh;

      } catch (error) {

        if (cached) {
          return cached;
        }

        return new Response(
          "",
          {
            status: 504
          }
        );

      }

    })()
  );

});
