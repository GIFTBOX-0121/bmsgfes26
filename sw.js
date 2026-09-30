const CACHE_NAME = "bmsgfes26-v5";

/*
=========================================================
APP SHELL
=========================================================
*/

const APP_SHELL = [
  "./index.html",
  "./Map.JPG",
  "./manifest.webmanifest",

  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
];


/*
=========================================================
VENUE AREA

フェス会場周辺のみ保存。
端末容量を必要以上に使用しない。
=========================================================
*/

const VENUE_BOUNDS = {

  south: 35.6209,
  west: 139.7712,

  north: 35.6257,
  east: 139.7786

};


/*
ズームレベル

16 = 会場全体
17 = 通常
18 = 詳細
*/

const VENUE_ZOOMS = [
  16,
  17,
  18
];


/*
=========================================================
MAP TILE CALCULATION
=========================================================
*/

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


/*
=========================================================
VENUE TILE URLS
=========================================================
*/

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


/*
=========================================================
INSTALL
=========================================================
*/

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
        INDEX.HTML

        最重要。

        iPhoneホーム画面版を
        オフライン起動するため
        必ず保存を試みる。
        -----------------------------------------
        */

        try {

          const indexResponse =
            await fetch(
              "./index.html",
              {
                cache: "reload"
              }
            );


          if (indexResponse.ok) {

            await cache.put(
              "./index.html",
              indexResponse.clone()
            );

          }

        }

        catch (error) {

          /*
          既存キャッシュがある場合は
          activate後に利用可能
          */

        }


        /*
        -----------------------------------------
        OTHER SITE FILES
        -----------------------------------------
        */

        for (
          const url of APP_SHELL
        ) {


          try {


            const alreadyCached =
              await cache.match(url);


            if (alreadyCached) {

              continue;

            }


            const response =
              await fetch(url);


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
        VENUE MAP PRE-CACHE
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


            const cached =
              await cache.match(
                request
              );


            if (cached) {

              continue;

            }


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
            一部の地図取得失敗は無視
            */

          }


        }


      })()

    );


    /*
    新しいService Workerを
    すぐ待機状態から進める
    */

    self.skipWaiting();

  }
);


/*
=========================================================
ACTIVATE
=========================================================
*/

self.addEventListener(
  "activate",
  event => {


    event.waitUntil(

      (async () => {


        /*
        古いキャッシュ削除
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
        開いているページを
        即座に新Service Worker管理下へ
        */

        await self.clients.claim();


      })()

    );

  }
);


/*
=========================================================
FETCH
=========================================================
*/

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


    /*
    =====================================================
    PRIVATE DATA API / WEATHER

    キャッシュ対象外
    =====================================================
    */


    if (

      url.hostname ===
        "bmsgfes26.starsx0601.workers.dev"

      ||

      url.hostname ===
        "api.open-meteo.com"

    ) {


      return;

    }


    /*
    =====================================================
    PAGE NAVIGATION

    ★ iPhoneホーム画面起動で重要 ★

    URLが何であっても、
    同一サイト内のページ起動なら
    保存済みindex.htmlを最優先。
    =====================================================
    */


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
          まず保存済みindex.html
          */

          const cachedIndex =
            await cache.match(
              "./index.html"
            );


          /*
          キャッシュがある場合
          即座に表示
          */

          if (cachedIndex) {


            /*
            オンラインなら
            裏側で最新版を取得
            */

            event.waitUntil(

              fetch(
                "./index.html",
                {
                  cache: "no-store"
                }
              )

                .then(
                  async response => {


                    if (
                      response &&
                      response.ok
                    ) {


                      await cache.put(
                        "./index.html",
                        response.clone()
                      );


                    }


                  }
                )

                .catch(
                  () => {}
                )

            );


            return cachedIndex;

          }


          /*
          index.htmlがまだ保存されていない場合

          オンライン取得を試す
          */


          try {


            const response =
              await fetch(
                "./index.html",
                {
                  cache: "no-store"
                }
              );


            if (
              response &&
              response.ok
            ) {


              await cache.put(
                "./index.html",
                response.clone()
              );


              return response;


            }


          }

          catch (error) {}


          /*
          完全オフライン
          ＋
          index.html未保存
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

            <title>BMSG FES 2026</title>

            <style>

            body{

              margin:0;

              background:#050505;

              color:#fff;

              font-family:
                -apple-system,
                BlinkMacSystemFont,
                sans-serif;

              display:flex;

              align-items:center;

              justify-content:center;

              min-height:100vh;

              text-align:center;

              padding:30px;

              box-sizing:border-box;

            }

            .box{

              max-width:420px;

            }

            h1{

              font-size:22px;

            }

            p{

              color:#aaa;

              line-height:1.7;

              font-size:13px;

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
                  完了していません。<br><br>

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


    /*
    =====================================================
    OPEN STREET MAP
    =====================================================
    */


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
          キャッシュ優先
          */


          const cached =
            await cache.match(
              request
            );


          if (cached) {

            return cached;

          }


          /*
          キャッシュがなければ
          ネット取得
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


    /*
    =====================================================
    OTHER FILES
    =====================================================
    */


    event.respondWith(

      (async () => {


        const cache =
          await caches.open(
            CACHE_NAME
          );


        /*
        キャッシュ優先
        */


        const cached =
          await cache.match(
            request
          );


        if (cached) {


          /*
          オンライン時は
          裏で最新版へ更新
          */


          fetch(request)

            .then(
              async response => {


                if (

                  response &&

                  (
                    response.ok ||
                    response.type ===
                      "opaque"
                  )

                ) {


                  await cache.put(
                    request,
                    response.clone()
                  );


                }


              }
            )

            .catch(
              () => {}
            );


          return cached;

        }


        /*
        キャッシュなし
        ↓
        ネット取得
        */


        try {


          const response =
            await fetch(
              request
            );


          if (

            response &&

            (
              response.ok ||
              response.type ===
                "opaque"
            )

          ) {


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

  }
);
