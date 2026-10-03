const CACHE_NAME = "bmsgfes26-v18-offline";

/*
  =========================================================
  BMSG FES 2026 SERVICE WORKER / v18

  ・サイト本体をオフライン起動可能にする
  ・Navigationはキャッシュを先に確認
  ・Leaflet / Map.JPG 等もオフライン対応
  ・表示したOpenStreetMapタイルを保存
  ・PRIVATE API / 天気APIはキャッシュしない
  ・localStorage / IndexedDBには一切触れない
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

  event.waitUntil(
    (async () => {

      const cache = await caches.open(CACHE_NAME);

      /*
        APP SHELLだけ保存。
        1ファイル失敗してもSW全体を失敗させない。
      */

      for (const url of APP_SHELL) {

        try {

          const response = await fetch(url, {
            cache: "reload"
          });

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

          console.warn(
            "[SW] APP SHELL cache failed:",
            url,
            error
          );

        }

      }

    })()
  );

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
        BMSG FESの古いSWキャッシュだけ削除。
        localStorage / IndexedDB等には触れない。
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

      await self.clients.claim();

    })()
  );

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

  /* =====================================================
     PRIVATE API / WEATHER

     SWではキャッシュしない。
  ===================================================== */

  if (
    (
      url.origin === self.location.origin &&
      url.pathname.startsWith("/api/")
    ) ||
    url.hostname === "api.open-meteo.com"
  ) {

    return;

  }

  /* =====================================================
     PAGE NAVIGATION

     重要：
     オフライン時にネットワーク失敗を長時間待たせない。

     1. 保存済みindex.htmlを確認
     2. オンラインならネットワーク更新も試す
     3. オフラインなら保存版を即返す
  ===================================================== */

  if (request.mode === "navigate") {

    event.respondWith(
      (async () => {

        const cache = await caches.open(CACHE_NAME);

        /*
          保存済みのアプリ本体を先に取得しておく。
        */

        let cached =
          await cache.match("./index.html");

        if (!cached) {
          cached = await cache.match("./");
        }

        if (!cached) {
          cached = await cache.match(request);
        }

        /*
          明確にオフラインなら、
          ネットワークを試さず保存版を返す。
        */

        if (
          typeof self.navigator !== "undefined" &&
          self.navigator.onLine === false &&
          cached
        ) {

          return cached;

        }

        /*
          オンライン時は最新版を取得。
        */

        try {

          const fresh = await fetch(request, {
            cache: "no-store"
          });

          if (
            fresh &&
            fresh.ok
          ) {

            /*
              index.htmlとして保存
            */

            try {

              await cache.put(
                "./index.html",
                fresh.clone()
              );

            } catch (error) {}

            /*
              ルートとしても保存
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
            ネットワーク取得失敗。
            下の保存版へフォールバック。
          */

        }

        /*
          OFFLINE FALLBACK
        */

        if (cached) {
          return cached;
        }

        /*
          最終確認：
          絶対URLでも検索する。
        */

        const absoluteIndex =
          new URL("./index.html", self.location.origin).href;

        const absoluteRoot =
          new URL("./", self.location.origin).href;

        cached =
          await cache.match(absoluteIndex);

        if (cached) {
          return cached;
        }

        cached =
          await cache.match(absoluteRoot);

        if (cached) {
          return cached;
        }

        /*
          本当にAPP SHELLが存在しない場合だけ表示。
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

     一度取得したタイルは保存する。
  ===================================================== */

  if (
    url.hostname === "tile.openstreetmap.org" ||
    url.hostname.endsWith(".tile.openstreetmap.org")
  ) {

    event.respondWith(
      (async () => {

        const cache = await caches.open(CACHE_NAME);

        const cached =
          await cache.match(request);

        if (cached) {
          return cached;
        }

        try {

          const fresh =
            await fetch(request);

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

          /*
            未保存タイル＋オフライン。
            空レスポンスを返して、
            アプリ本体は止めない。
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

     Leaflet / Map.JPG / manifest等。

     CACHE FIRST寄りにすることで、
     オフライン起動時にネットワーク待ちを起こさない。
  ===================================================== */

  if (
    url.origin === self.location.origin
  ) {

    event.respondWith(
      (async () => {

        const cache =
          await caches.open(CACHE_NAME);

        /*
          まず完全一致。
        */

        let cached =
          await cache.match(request);

        /*
          クエリ付きURL等の表記差にも対応。
        */

        if (!cached) {

          const cleanUrl =
            new URL(request.url);

          cleanUrl.search = "";

          cached =
            await cache.match(cleanUrl.href);

        }

        /*
          明確にオフラインで保存版があるなら
          即返す。
        */

        if (
          typeof self.navigator !== "undefined" &&
          self.navigator.onLine === false &&
          cached
        ) {

          return cached;

        }

        /*
          オンライン時は最新版を取得。
        */

        try {

          const fresh =
            await fetch(request, {
              cache: "no-store"
            });

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

        } catch (error) {}

        /*
          ネットワーク失敗時は保存版。
        */

        if (cached) {
          return cached;
        }

        /*
          pathnameでも確認。
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
  ===================================================== */

  event.respondWith(
    (async () => {

      const cache =
        await caches.open(CACHE_NAME);

      const cached =
        await cache.match(request);

      /*
        明確にオフラインなら
        保存済み外部ファイルを使用。
      */

      if (
        typeof self.navigator !== "undefined" &&
        self.navigator.onLine === false &&
        cached
      ) {

        return cached;

      }

      try {

        const fresh =
          await fetch(request);

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
