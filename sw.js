const CACHE_NAME = "bmsgfes26-v17-offline";

/*
  =========================================================
  APP SHELL

  GitHub上の実際の構成：
  /index.html
  /Map.JPG
  /manifest.webmanifest
  /leaflet.css
  /leaflet.js
  /sw.js
  =========================================================
*/

const APP_SHELL = [
  "./",
  "./index.html",
  "./Map.JPG",
  "./manifest.webmanifest",
  "./leaflet.css",
  "./leaflet.js"
];


/* =========================================================
   OFFLINE MAP AREA
========================================================= */

const VENUE_BOUNDS = {
  south: 35.6209,
  west: 139.7712,
  north: 35.6257,
  east: 139.7786
};

const VENUE_ZOOMS = [16, 17, 18];


/* =========================================================
   MAP TILE CALCULATION
========================================================= */

function lon2tile(lon, z) {
  return Math.floor(
    (lon + 180) / 360 * Math.pow(2, z)
  );
}

function lat2tile(lat, z) {
  const rad = lat * Math.PI / 180;

  return Math.floor(
    (
      1 -
      Math.asinh(Math.tan(rad)) / Math.PI
    )
    / 2
    * Math.pow(2, z)
  );
}

function venueTileUrls() {
  const urls = [];

  for (const z of VENUE_ZOOMS) {
    const x1 = lon2tile(VENUE_BOUNDS.west, z);
    const x2 = lon2tile(VENUE_BOUNDS.east, z);
    const y1 = lat2tile(VENUE_BOUNDS.north, z);
    const y2 = lat2tile(VENUE_BOUNDS.south, z);

    for (let x = x1; x <= x2; x++) {
      for (let y = y1; y <= y2; y++) {
        urls.push(
          `https://tile.openstreetmap.org/${z}/${x}/${y}.png`
        );
      }
    }
  }

  return urls;
}


/* =========================================================
   SAFE CACHE HELPERS
========================================================= */

async function cacheLocalFile(cache, url) {
  try {
    const response = await fetch(url, {
      cache: "reload"
    });

    /*
      Cloudflare Pagesが存在しないファイルに
      HTMLを返した場合を誤キャッシュしない。
    */
    if (!response || !response.ok) {
      return false;
    }

    const contentType =
      response.headers.get("content-type") || "";

    if (
      (url.endsWith(".js") &&
        !contentType.includes("javascript")) ||
      (url.endsWith(".css") &&
        !contentType.includes("text/css"))
    ) {
      console.warn(
        "Skipped invalid offline asset:",
        url,
        contentType
      );

      return false;
    }

    await cache.put(url, response.clone());

    return true;

  } catch (error) {
    console.warn(
      "Offline asset cache failed:",
      url,
      error
    );

    return false;
  }
}


async function cacheMapTile(cache, url) {
  try {
    const request = new Request(url, {
      mode: "no-cors"
    });

    const response = await fetch(request);

    if (response) {
      await cache.put(
        request,
        response.clone()
      );
    }

  } catch (error) {
    /*
      1枚失敗してもSW全体を失敗させない。
    */
  }
}


/* =========================================================
   INSTALL
========================================================= */

self.addEventListener("install", event => {

  event.waitUntil(
    (async () => {

      const cache =
        await caches.open(CACHE_NAME);

      /*
        まずサイト本体を保存。

        ここが終われば、
        オフラインでHTML＋Leafletを起動できる。
      */

      for (const url of APP_SHELL) {
        await cacheLocalFile(cache, url);
      }


      /*
        会場周辺の地図タイル。

        以前は1枚ずつ順番に取得していたため
        installが長時間終わらない可能性があった。

        今回は小さいグループに分けて並列取得する。
      */

      const tileUrls = venueTileUrls();

      const BATCH_SIZE = 8;

      for (
        let i = 0;
        i < tileUrls.length;
        i += BATCH_SIZE
      ) {

        const batch =
          tileUrls.slice(
            i,
            i + BATCH_SIZE
          );

        await Promise.allSettled(
          batch.map(
            url => cacheMapTile(cache, url)
          )
        );
      }

    })()
  );

  /*
    旧SWのwaiting状態を避ける。
  */
  self.skipWaiting();

});


/* =========================================================
   ACTIVATE
========================================================= */

self.addEventListener("activate", event => {

  event.waitUntil(
    (async () => {

      const keys =
        await caches.keys();

      /*
        BMSG FES用の古いSWキャッシュだけ削除。

        他サイト・localStorage・IndexedDB等には触れない。
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

     キャッシュ対象外。
  ===================================================== */

  if (
    url.hostname ===
      "bmsgfes26.starsx0601.workers.dev"
    ||
    url.hostname ===
      "api.open-meteo.com"
  ) {
    return;
  }


  /* =====================================================
     PAGE NAVIGATION

     ONLINE
       最新ページ

     OFFLINE
       保存済みindex.html
  ===================================================== */

  if (request.mode === "navigate") {

    event.respondWith(
      (async () => {

        const cache =
          await caches.open(CACHE_NAME);

        /*
          オンラインなら最新版を取得。
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

            /*
              index.htmlとして保存。
            */

            try {
              await cache.put(
                "./index.html",
                fresh.clone()
              );
            } catch (error) {}

            /*
              ルートとしても保存。
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
            オフラインへ。
          */
        }


        /*
          OFFLINE FALLBACK
        */

        const index =
          await cache.match("./index.html");

        if (index) {
          return index;
        }


        const root =
          await cache.match("./");

        if (root) {
          return root;
        }


        const exact =
          await cache.match(request);

        if (exact) {
          return exact;
        }


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
オフラインデータを準備できませんでした。<br>
一度オンラインでサイトを開いてから<br>
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

     オフライン時は保存済みタイルを使用。
  ===================================================== */

  if (
    url.hostname ===
      "tile.openstreetmap.org"
    ||
    url.hostname.endsWith(
      ".tile.openstreetmap.org"
    )
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

        if (cached) {
          return cached;
        }


        /*
          install時はno-cors Requestで保存しているので
          URLでも確認する。
        */

        cached =
          await cache.match(request.url);

        if (cached) {
          return cached;
        }


        /*
          未保存ならオンライン取得。
        */

        try {

          const response =
            await fetch(request);

          if (response) {

            try {
              await cache.put(
                request,
                response.clone()
              );
            } catch (error) {}

          }

          return response;

        } catch (error) {

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
     SAME ORIGIN

     index以外の
     Map.JPG / leaflet.css / leaflet.js / manifest等。

     CACHE FIRSTにする。

     → オフラインで確実に使用
     → オンラインでもSW更新時に最新版を取得済み
  ===================================================== */

  if (
    url.origin ===
    self.location.origin
  ) {

    event.respondWith(
      (async () => {

        const cache =
          await caches.open(CACHE_NAME);

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
            fresh.ok
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
     OTHER EXTERNAL FILES

     既存動作を壊さないため
     NETWORK FIRST + CACHE FALLBACK
  ===================================================== */

  event.respondWith(
    (async () => {

      const cache =
        await caches.open(CACHE_NAME);

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

        const cached =
          await cache.match(request);

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
