const CACHE_NAME = "bmsgfes26-v11";

const APP_SHELL = [
  "./Map.JPG",
  "./manifest.webmanifest",

  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
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
    (lon + 180)
    / 360
    * Math.pow(2, z)
  );

}


function lat2tile(lat, z) {

  const rad =
    lat * Math.PI / 180;

  return Math.floor(
    (
      1 -
      Math.asinh(
        Math.tan(rad)
      ) / Math.PI
    )
    / 2
    * Math.pow(2, z)
  );

}


/* =========================================================
   VENUE TILE URLS
========================================================= */

function venueTileUrls() {

  const urls = [];

  for (const z of VENUE_ZOOMS) {

    const x1 =
      lon2tile(
        VENUE_BOUNDS.west,
        z
      );

    const x2 =
      lon2tile(
        VENUE_BOUNDS.east,
        z
      );

    const y1 =
      lat2tile(
        VENUE_BOUNDS.north,
        z
      );

    const y2 =
      lat2tile(
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
        -----------------------------------------
        APP FILES
        -----------------------------------------

        index.html はここでは保存しない。

        理由：
        SW更新時に古いindex.htmlを
        先にキャッシュしてしまう事故を防ぐため。

        index.htmlは実際にページを開いた時に
        最新版を取得して保存する。
        */

        for (
          const url of APP_SHELL
        ) {

          try {

            const response =
              await fetch(
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

          }

          catch (error) {

            /*
            1ファイル失敗しても
            Service Worker全体は止めない
            */

          }

        }


        /*
        -----------------------------------------
        VENUE MAP TILES

        会場周辺の地図を
        オフライン用に保存
        -----------------------------------------
        */

        const tiles =
          venueTileUrls();


        for (
          const url of tiles
        ) {

          try {

            const request =
              new Request(
                url,
                {
                  mode: "no-cors"
                }
              );


            const response =
              await fetch(
                request
              );


            await cache.put(
              request,
              response
            );

          }

          catch (error) {

            /*
            一部タイル取得失敗は無視
            */

          }

        }

      })()

    );


    /*
    新しいSWをすぐ有効化
    */

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

        /*
        v10以前など
        古いBMSG FESキャッシュを削除
        */

        const keys =
          await caches.keys();


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


        /*
        現在開いているページも
        v11管理下へ
        */

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

    const request =
      event.request;


    if (
      request.method !== "GET"
    ) {

      return;

    }


    const url =
      new URL(
        request.url
      );


    /* =====================================================
       PRIVATE DATA API / WEATHER

       Service Workerではキャッシュしない。

       天気はindex.html側で
       最新取得＋圏外用保存を管理。
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

       ★重要★

       オンライン
       ↓
       必ずサーバー上の最新index.html

       オフライン
       ↓
       最後に正常表示できたindex.html
    ===================================================== */

    if (
      request.mode === "navigate"
    ) {

      event.respondWith(

        (async () => {

          const cache =
            await caches.open(
              CACHE_NAME
            );


          /*
          -----------------------------------------
          ONLINE
          -----------------------------------------
          */

          try {

            const fresh =
              await fetch(
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
              最新版を
              圏外用として保存
              */

              await cache.put(
                "./index.html",
                fresh.clone()
              );


              return fresh;

            }

          }

          catch (error) {

            /*
            ネットワーク失敗
            ↓
            オフライン版へ
            */

          }


          /*
          -----------------------------------------
          OFFLINE
          -----------------------------------------
          */

          const cached =
            await cache.match(
              "./index.html"
            );


          if (cached) {

            return cached;

          }


          /*
          初回アクセス前など
          index.htmlの保存もない場合
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

              <meta
                name="theme-color"
                content="#080808"
              >

              <title>
                BMSG FES 2026
              </title>

              <style>

                body{

                  margin:0;

                  min-height:100vh;

                  display:flex;

                  align-items:center;

                  justify-content:center;

                  padding:30px;

                  box-sizing:border-box;

                  background:#050505;

                  color:#fff;

                  font-family:
                    -apple-system,
                    BlinkMacSystemFont,
                    sans-serif;

                  text-align:center;

                }


                .box{

                  max-width:420px;

                }


                h1{

                  font-size:22px;

                }


                p{

                  color:#aaa;

                  font-size:13px;

                  line-height:1.7;

                }

              </style>

            </head>


            <body>

              <div class="box">

                <h1>
                  BMSG FES 2026
                </h1>

                <p>

                  オフラインデータの準備が
                  完了していません。

                  <br><br>

                  一度オンライン状態で
                  サイトを開いてください。

                </p>

              </div>

            </body>

            </html>
            `,

            {

              status: 200,

              headers: {

                "Content-Type":
                  "text/html; charset=UTF-8"

              }

            }

          );

        })()

      );


      return;

    }


    /* =====================================================
       OPENSTREETMAP

       会場周辺は
       キャッシュ済み地図を優先。

       → 圏外でも会場マップを表示
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


          /*
          保存済み地図
          */

          const cached =
            await cache.match(
              request
            );


          if (cached) {

            return cached;

          }


          /*
          未保存なら
          オンライン取得
          */

          try {

            const response =
              await fetch(
                request
              );


            if (response) {

              await cache.put(
                request,
                response.clone()
              );

            }


            return response;

          }

          catch (error) {

            return new Response(
              "",
              {
                status: 504,
                statusText: "Offline"
              }
            );

          }

        })()

      );


      return;

    }


    /* =====================================================
       OTHER FILES

       Map.JPG
       manifest.webmanifest
       Leaflet CSS / JS
       その他静的ファイル

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


        /*
        -----------------------------------------
        ONLINE
        -----------------------------------------
        */

        try {

          const fresh =
            await fetch(
              request,
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
              request,
              fresh.clone()
            );

          }


          return fresh;

        }

        catch (error) {

          /*
          -----------------------------------------
          OFFLINE
          -----------------------------------------
          */

          const cached =
            await cache.match(
              request
            );


          if (cached) {

            return cached;

          }


          return new Response(
            "",
            {
              status: 504,
              statusText: "Offline"
            }
          );

        }

      })()

    );

  }
);
