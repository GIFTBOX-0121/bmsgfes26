const CACHE_NAME = "bmsgfes26-v14";

/*
  =========================================================
  APP SHELL
  サイト本体をオフライン起動できるように保存
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


        /*
          index.html / Map.JPG / manifest
          をオフライン用に保存
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
              1ファイル失敗しても
              SW全体は止めない
            */

          }

        }


        /*
          会場周辺のOpenStreetMapタイルを
          オフライン用に保存
        */

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
              一部の地図タイル取得失敗は無視
            */

          }

        }

      })()

    );


    /*
      新しいSWをすぐ待機解除
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
          古いSWキャッシュを削除

          localStorageは削除しないので

          MY
          持ち物
          取引
          キーワード接続情報

          などには影響しない
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
          新しいSWの管理下にする
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
      GET以外は処理しない
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

       Leaflet本体はSWでは処理しない。

       index.html側の

       unpkg
       ↓
       jsDelivr

       フォールバックをそのまま使用する。
    ===================================================== */

    if (
      url.hostname === "unpkg.com" ||
      url.hostname === "cdn.jsdelivr.net"
    ) {

      return;

    }


    /* =====================================================
       PRIVATE API / WEATHER

       個人データAPIと天気APIは
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
       PAGE NAVIGATION

       ONLINE
       → Cloudflare Pagesの最新版

       OFFLINE
       → 保存済みindex.html
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
                最新index.htmlを保存
              */

              await cache.put(
                "./index.html",
                fresh.clone()
              );


              /*
                ルートURL用にも保存
              */

              try {

                await cache.put(
                  "./",
                  fresh.clone()
                );

              }

              catch (e) {

                /*
                  index.htmlが保存できていればOK
                */

              }


              return fresh;

            }

          }

          catch (e) {

            /*
              ネットワーク失敗
              ↓
              オフライン処理へ
            */

          }


          /*
            OFFLINE

            まずindex.htmlを探す
          */

          let cached =
            await cache.match(
              "./index.html"
            );


          if (cached) {

            return cached;

          }


          /*
            次にルートURLを探す
          */

          cached =
            await cache.match(
              "./"
            );


          if (cached) {

            return cached;

          }


          /*
            現在のリクエストURLも確認
          */

          cached =
            await cache.match(
              req
            );


          if (cached) {

            return cached;

          }


          /*
            どこにも保存版がない場合
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

  color: #ffffff;

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

  color: #aaaaaa;

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
       OPENSTREETMAP

       保存済みタイルを最優先。

       保存されていない場合のみ
       ネットから取得する。
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
            保存済みタイルを確認
          */

          const hit =
            await cache.match(
              req
            );


          if (hit) {

            return hit;

          }


          /*
            なければオンライン取得
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
                  地図表示は続ける
                */

              }

            }


            return res;

          }

          catch (e) {

            /*
              タイルなし＋オフライン
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
       CLOUDFLARE PAGES内のファイル

       ONLINE
       → 最新版取得＋保存

       OFFLINE
       → 保存済みを使用
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
              オフライン処理へ
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
       その他の外部ファイル

       ONLINE
       → 最新版を取得

       OFFLINE
       → 保存済みがあれば使用
    ===================================================== */

    event.respondWith(

      (async () => {

        const cache =
          await caches.open(
            CACHE_NAME
          );


        /*
          保存済み確認
        */

        const cached =
          await cache.match(
            req
          );


        try {

          /*
            ONLINEでは最新版を取得
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
                CORS等で保存できなくても
                表示自体は続ける
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
