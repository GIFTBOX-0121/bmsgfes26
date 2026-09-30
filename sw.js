const CACHE_NAME = "bmsgfes26-v13";

const APP_SHELL = [
  "./Map.JPG",
  "./manifest.webmanifest",
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

const VENUE_ZOOMS = [
  16,
  17,
  18
];


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

    const x1 = lon2tile(
      VENUE_BOUNDS.west,
      z
    );

    const x2 = lon2tile(
      VENUE_BOUNDS.east,
      z
    );

    const y1 = lat2tile(
      VENUE_BOUNDS.north,
      z
    );

    const y2 = lat2tile(
      VENUE_BOUNDS.south,
      z
    );


    for (
      let x = x1;
      x <= x2;
      x++
    ) {

      for (
        let y = y1;
        y <= y2;
        y++
      ) {

        urls.push(
          `https://tile.openstreetmap.org/${z}/${x}/${y}.png`
        );

      }

    }

  }

  return urls;

}


/* =========================================================
   INSTALL
========================================================= */

self.addEventListener(
  "install",
  event => {

    event.waitUntil(

      (async () => {

        const cache =
          await caches.open(
            CACHE_NAME
          );


        /*
          Map.JPG / manifest を保存
        */

        for (
          const url of APP_SHELL
        ) {

          try {

            const res =
              await fetch(
                url,
                {
                  cache: "reload"
                }
              );


            if (
              res &&
              (
                res.ok ||
                res.type === "opaque"
              )
            ) {

              await cache.put(
                url,
                res.clone()
              );

            }

          }

          catch (e) {

            /*
              失敗しても
              SW全体は止めない
            */

          }

        }


        /*
          会場周辺の地図タイルを
          圏外用に保存
        */

        for (
          const url of venueTileUrls()
        ) {

          try {

            const req =
              new Request(
                url,
                {
                  mode: "no-cors"
                }
              );


            const res =
              await fetch(req);


            await cache.put(
              req,
              res
            );

          }

          catch (e) {

            /*
              一部取得失敗は無視
            */

          }

        }

      })()

    );


    self.skipWaiting();

  }
);


/* =========================================================
   ACTIVATE
========================================================= */

self.addEventListener(
  "activate",
  event => {

    event.waitUntil(

      (async () => {

        const keys =
          await caches.keys();


        /*
          v12以前の古いキャッシュを削除

          localStorageは触らないので
          MY / 持ち物 / 取引 /
          キーワード接続情報は消えない
        */

        await Promise.all(

          keys

            .filter(
              key =>
                key !== CACHE_NAME
            )

            .map(
              key =>
                caches.delete(key)
            )

        );


        await self.clients.claim();

      })()

    );

  }
);


/* =========================================================
   FETCH
========================================================= */

self.addEventListener(
  "fetch",
  event => {

    const req =
      event.request;


    if (
      req.method !== "GET"
    ) {

      return;

    }


    const url =
      new URL(
        req.url
      );


    /* =====================================================
       LEAFLET

       ★重要★

       Leaflet本体はSWで触らない。

       index.html側で

       unpkg
       ↓失敗
       jsDelivr

       のフォールバックを行う。

       ここをSWでキャッシュすると
       マップ全体が死ぬ原因になるため除外。
    ===================================================== */

    if (
      url.hostname === "unpkg.com" ||
      url.hostname === "cdn.jsdelivr.net"
    ) {

      return;

    }


    /* =====================================================
       PRIVATE API / WEATHER

       SWではキャッシュしない
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
       INDEX.HTML

       オンライン
       → サーバーの最新版

       オフライン
       → 最後に正常表示したindex.html
    ===================================================== */

    if (
      req.mode === "navigate"
    ) {

      event.respondWith(

        (async () => {

          const cache =
            await caches.open(
              CACHE_NAME
            );


          /*
            ONLINE
          */

          try {

            const fresh =
              await fetch(
                req,
                {
                  cache: "no-store"
                }
              );


            if (
              fresh &&
              fresh.ok
            ) {

              /*
                最新indexを
                オフライン用に保存
              */

              await cache.put(
                "./index.html",
                fresh.clone()
              );


              return fresh;

            }

          }

          catch (e) {

            /*
              ネットワーク失敗
              ↓
              保存版へ
            */

          }


          /*
            OFFLINE
          */

          const cached =
            await cache.match(
              "./index.html"
            );


          if (cached) {

            return cached;

          }


          return new Response(
            "Offline",
            {
              status: 503
            }
          );

        })()

      );


      return;

    }


    /* =====================================================
       OPENSTREETMAP

       保存済みタイルを優先。

       圏外でも会場周辺の地図を
       表示できるようにする。
    ===================================================== */

    if (
      url.hostname.endsWith(
        ".tile.openstreetmap.org"
      )
    ) {

      event.respondWith(

        (async () => {

          const cache =
            await caches.open(
              CACHE_NAME
            );


          const hit =
            await cache.match(
              req
            );


          if (hit) {

            return hit;

          }


          try {

            const res =
              await fetch(req);


            if (res) {

              await cache.put(
                req,
                res.clone()
              );

            }


            return res;

          }

          catch (e) {

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
       OTHER FILES

       オンライン
       → 最新版を取得して保存

       オフライン
       → 保存済みを使用
    ===================================================== */

    event.respondWith(

      (async () => {

        const cache =
          await caches.open(
            CACHE_NAME
          );


        try {

          const fresh =
            await fetch(
              req,
              {
                cache: "no-store"
              }
            );


          if (
            fresh &&
            (
              fresh.ok ||
              fresh.type === "opaque"
            )
          ) {

            await cache.put(
              req,
              fresh.clone()
            );

          }


          return fresh;

        }

        catch (e) {

          const cached =
            await cache.match(
              req
            );


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

  }
);
