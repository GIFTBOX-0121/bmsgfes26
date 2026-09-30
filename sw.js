const CACHE_NAME = "bmsgfes26-v14";

/*
  =========================================================
  APP SHELL

  ★ index.html を最初から保存する

  これにより、
  Cloudflare Pages版を一度オンラインで読み込んで
  Service Workerのインストールが完了すれば、

  機内モードでもサイト本体を起動できる。
  =========================================================
*/

const APP_SHELL = [
  "./",
  "./index.html",
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


        /* =================================================
           APP SHELL

           index.html
           Map.JPG
           manifest

           をオフライン用に保存
        ================================================= */

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
              1ファイル取得失敗しても
              Service Worker全体は止めない
            */

            console.warn(
              "APP SHELL CACHE FAILED:",
              url
            );

          }

        }


        /* =================================================
           VENUE MAP TILES

           会場周辺のOpenStreetMapタイルを
           圏外用に保存
        ================================================= */

        const tileUrls =
          venueTileUrls();


        for (
          const url of tileUrls
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


            if (res) {

              await cache.put(
                req,
                res
              );

            }

          }

          catch (e) {

            /*
              一部タイル取得失敗は無視
            */

          }

        }

      })()

    );


    /*
      新しいSWを待機状態にせず
      すぐ使用可能にする
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

        const keys =
          await caches.keys();


        /*
          v13以前など
          古いService Workerキャッシュを削除

          ★ localStorageは削除しない

          そのため

          MY
          持ち物
          取引
          キーワード接続情報

          などのブラウザ保存データには
          触れない。
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


        /*
          開いているページを
          新しいSWの管理下へ
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

    const req =
      event.request;


    /*
      GET以外は触らない
    */

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
       LEAFLET CDN

       ★重要★

       Leaflet本体はSWで触らない。

       index.html側で

       unpkg
       ↓失敗
       jsDelivr

       のフォールバックを行う。

       ここをSWでキャッシュすると
       マップ全体が死ぬ原因になる可能性があるため除外。
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

       ・個人保存データAPI
       ・天気API

       オフライン時に古いレスポンスを
       APIの最新値として返さない。
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
       
       index.html / 各ページ表示

       ONLINE
       ↓
       Cloudflare Pagesから最新版取得
       ↓
       成功したらキャッシュ更新

       OFFLINE
       ↓
       最後に正常取得したindex.htmlを表示
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


          /* ===============================================
             ONLINE
          =============================================== */

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
                最新ページを保存
              */

              await cache.put(
                "./index.html",
                fresh.clone()
              );


              /*
                "/" と index.html の両方で
                オフライン起動できるようにする
              */

              try {

                await cache.put(
                  "./",
                  fresh.clone()
                );

              }

              catch (e) {

                /*
                  保存できなくても
                  index.htmlがあれば問題なし
                */

              }


              return fresh;

            }

          }

          catch (e) {

            /*
              ネットワークエラー
              ↓
              OFFLINE処理へ
            */

          }


          /* ===============================================
             OFFLINE

             まず index.html
          =============================================== */

          let cached =
            await cache.match(
              "./index.html"
            );


          if (cached) {

            return cached;

          }


          /* ===============================================
             次に "/"
          =============================================== */

          cached =
            await cache.match(
              "./"
            );


          if (cached) {

            return cached;

          }


          /* ===============================================
             念のため現在URLも確認
          =============================================== */

          cached =
            await cache.match(
              req
            );


          if (cached) {

            return cached;

          }


          /*
            どこにも保存版が無い場合
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
                body {
                  margin: 0;
                  background: #080808;
                  color: #fff;
                  font-family:
                    -apple-system,
                    BlinkMacSystemFont,
                    "Helvetica Neue",
                    Arial,
                    sans-serif;
                  min-height: 100vh;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  text-align: center;
                }

                .offline {
                  padding: 30px;
                }

                h1 {
                  font-size: 22px;
                  letter-spacing: .08em;
                }

                p {
                  color: #aaa;
                  line-height: 1.8;
                  font-size: 14px;
                }
              </style>
            </head>

            <body>

              <div class="offline">

                <h1>
                  BMSG FES 2026
                </h1>

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
       OPENSTREETMAP

       CACHE FIRST

       保存済みタイル
       ↓
       あれば即表示

       なければ
       ↓
       ネット取得
       ↓
       成功したら保存

       これにより
       会場周辺は圏外でも表示可能。
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
            保存済み確認
          */

          const hit =
            await cache.match(
              req
            );


          if (hit) {

            return hit;

          }


          /*
            保存されていなければ
            ネット取得
          */

          try {

            const res =
              await fetch(req);


            if (res) {

              try {

                await cache.put(
                  req,
                  res.clone()
                );

              }

              catch (e) {

                /*
                  キャッシュ失敗しても
                  地図表示自体は続行
                */

              }

            }


            return res;

          }

          catch (e) {

            /*
              タイルが無い＋圏外
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
       SAME ORIGIN STATIC FILES

       Cloudflare Pages上の

       ・画像
       ・CSS
       ・JS
       ・manifest
       など

       ONLINE
       ↓
       最新版取得＋保存

       OFFLINE
       ↓
       保存版
    ===================================================== */

    if (
      url.origin ===
      self.location.origin
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

              try {

                await cache.put(
                  req,
                  fresh.clone()
                );

              }

              catch (e) {

                /*
                  保存失敗は無視
                */

              }


              return fresh;

            }

          }

          catch (e) {

            /*
              OFFLINEへ
            */

          }


          /*
            OFFLINE
          */

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

        })()

      );


      return;

    }


    /* =====================================================
       OTHER EXTERNAL FILES

       その他の外部リソース。

       ONLINE
       ↓
       そのまま取得

       OFFLINE
       ↓
       過去に保存されていれば使用
    ===================================================== */

    event.respondWith(

      (async () => {

        const cache =
          await caches.open(
            CACHE_NAME
          );


        /*
          保存済みがあるか確認
        */

        const cached =
          await cache.match(
            req
          );


        try {

          /*
            ONLINEでは最新版優先
          */

          const fresh =
            await fetch(
              req
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
                req,
                fresh.clone()
              );

            }

            catch (e) {

              /*
                CORS等で保存不可でも
                表示自体は続行
              */

            }

          }


          return fresh;

        }

        catch (e) {

          /*
            OFFLINE
          */

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