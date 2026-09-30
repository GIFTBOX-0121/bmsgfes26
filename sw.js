const CACHE_NAME = "bmsgfes26-v3";

const APP_SHELL = [
  "./",
  "./index.html",
  "./Map.JPG",
  "./manifest.webmanifest",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
];


/* =========================================================
   INSTALL
========================================================= */

self.addEventListener("install", event => {

  event.waitUntil(

    caches.open(CACHE_NAME).then(async cache => {

      for (const url of APP_SHELL) {

        try {

          await cache.add(url);

        } catch (error) {

          /*
            1ファイルの取得に失敗しても
            Service Worker全体のインストールを止めない
          */

        }

      }

    })

  );

  self.skipWaiting();

});


/* =========================================================
   ACTIVATE
========================================================= */

self.addEventListener("activate", event => {

  event.waitUntil(

    caches.keys().then(keys =>

      Promise.all(

        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))

      )

    )

  );

  self.clients.claim();

});


/* =========================================================
   FETCH
========================================================= */

self.addEventListener("fetch", event => {

  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);


  /*
    =====================================================
    PRIVATE DATA API / WEATHER

    この2つはリアルタイム通信を優先。
    Service Workerではキャッシュしない。
    =====================================================
  */

  if (
    url.hostname === "bmsgfes26.starsx0601.workers.dev" ||
    url.hostname === "api.open-meteo.com"
  ) {

    return;

  }


  /*
    =====================================================
    OPEN STREET MAP

    一度表示した地図タイルを端末に保存。

    → 会場周辺を事前に表示しておけば
      電波が悪い環境でも表示しやすくなる。
    =====================================================
  */

  if (
    url.hostname.endsWith(".tile.openstreetmap.org")
  ) {

    event.respondWith(

      caches.open(CACHE_NAME).then(async cache => {

        const cached =
          await cache.match(request);

        if (cached) {
          return cached;
        }


        try {

          const response =
            await fetch(request);

          if (
            response &&
            response.ok
          ) {

            cache.put(
              request,
              response.clone()
            );

          }

          return response;

        } catch (error) {

          return new Response(
            "",
            {
              status: 504,
              statusText: "Offline"
            }
          );

        }

      })

    );

    return;

  }


  /*
    =====================================================
    SITE FILES

    基本はキャッシュを使用。

    ネットに繋がっていれば
    裏側で最新版へ更新。
    =====================================================
  */

  event.respondWith(

    caches.open(CACHE_NAME).then(async cache => {

      const cached =
        await cache.match(request);


      const networkPromise =

        fetch(request)

          .then(response => {

            if (
              response &&
              (
                response.ok ||
                response.type === "opaque"
              )
            ) {

              cache.put(
                request,
                response.clone()
              );

            }

            return response;

          })

          .catch(() => null);


      /*
        キャッシュがあれば
        即座に表示
      */

      if (cached) {

        event.waitUntil(
          networkPromise
        );

        return cached;

      }


      /*
        キャッシュがなければ
        ネットから取得
      */

      const network =
        await networkPromise;

      if (network) {
        return network;
      }


      /*
        ページ自体が取得できない場合は
        保存済みindex.htmlを表示
      */

      if (
        request.mode === "navigate"
      ) {

        return cache.match(
          "./index.html"
        );

      }


      return new Response(
        "",
        {
          status: 504,
          statusText: "Offline"
        }
      );

    })

  );

});
