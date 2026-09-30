const CACHE_NAME = "bmsgfes26-v4";

const APP_SHELL = [
  "./",
  "./index.html",
  "./Map.JPG",
  "./manifest.webmanifest",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
];


/* =========================================================
   FESTIVAL AREA

   フェス会場周辺だけを事前保存します。
   広範囲を保存しないことで容量を抑えます。
========================================================= */

const VENUE_BOUNDS = {
  south: 35.6209,
  west: 139.7712,
  north: 35.6257,
  east: 139.7786
};


/*
  保存するズームレベル

  16 = 会場全体
  17 = 通常表示
  18 = 詳細表示
*/

const VENUE_ZOOMS = [
  16,
  17,
  18
];


/* =========================================================
   TILE CALCULATION
========================================================= */

function lon2tile(lon, z) {

  return Math.floor(
    (lon + 180) /
    360 *
    Math.pow(2, z)
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

    / 2 *

    Math.pow(2, z)

  );

}


/* =========================================================
   VENUE TILE LIST
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
          SITE FILES
          -----------------------------------------
        */

        for (
          const url of APP_SHELL
        ) {

          try {

            await cache.add(url);

          }

          catch (error) {

            /*
              1ファイル取得失敗で
              Service Worker全体を止めない
            */

          }

        }


        /*
          -----------------------------------------
          VENUE MAP

          会場周辺の地図を
          オンライン時に先回り保存
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


            if (!cached) {

              const response =
                await fetch(
                  request
                );


              await cache.put(
                request,
                response
              );

            }

          }

          catch (error) {

            /*
              一部タイル取得失敗でも
              他のタイル保存を続行
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

      caches
        .keys()

        .then(keys =>

          Promise.all(

            keys

              .filter(
                key =>
                  key !== CACHE_NAME
              )

              .map(
                key =>
                  caches.delete(key)
              )

          )

        )

    );


    self.clients.claim();

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


    /*
      GET以外はキャッシュしない
    */

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
       PRIVATE DATA / WEATHER

       この2つはキャッシュしない。

       PRIVATE DATA
       ↓
       通信可能時のみCloudflare同期

       WEATHER
       ↓
       最新情報はオンライン時取得
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
       OPEN STREET MAP
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
            まず端末保存済み地図を確認
          */

          const cached =
            await cache.match(
              request
            );


          if (cached) {

            return cached;

          }


          /*
            保存されていなければ
            ネットから取得
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

            /*
              完全オフラインかつ
              キャッシュなし
            */

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
       SITE FILES
    ===================================================== */

    event.respondWith(

      (async () => {

        const cache =
          await caches.open(
            CACHE_NAME
          );


        /*
          端末保存済みファイル確認
        */

        const cached =
          await cache.match(
            request
          );


        /*
          キャッシュがあれば
          即表示
        */

        if (cached) {


          /*
            裏側で最新版確認

            ※表示は待たせない
          */

          fetch(request)

            .then(response => {

              if (

                response &&

                (
                  response.ok ||
                  response.type ===
                    "opaque"
                )

              ) {

                cache.put(
                  request,
                  response.clone()
                );

              }

            })

            .catch(
              () => {}
            );


          return cached;

        }


        /*
          キャッシュなし
          ↓
          ネットから取得
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

            cache.put(
              request,
              response.clone()
            );

          }


          return response;

        }


        /*
          ネットも使えない
        */

        catch (error) {


          /*
            ページ遷移なら
            保存済みindex.html
          */

          if (
            request.mode ===
              "navigate"
          ) {

            const fallback =
              await cache.match(
                "./index.html"
              );


            if (fallback) {

              return fallback;

            }


            return new Response(
              "Offline",
              {
                status: 503
              }
            );

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
