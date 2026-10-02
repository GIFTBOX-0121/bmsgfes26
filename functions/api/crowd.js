const ALLOWED_STATUS = new Set(["empty", "normal", "busy"]);

// 待ち時間として投稿できる値（分）
const ALLOWED_WAIT_MINUTES = new Set([
  5,
  10,
  15,
  20,
  30,
  45,
  60,
  90,
  120,
  180
]);

// 混雑情報として受け付ける場所
const ALLOWED_SPOTS = new Set([
  "wc1",
  "wc2",
  "wc3",
  "wc4",
  "wc5",
  "wcPremium",
  "photoCentral"
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store"
    }
  });
}


// ========================================
// GET /api/crowd
//
// ・現在の混雑状況
// ・現在の待ち時間
//
// どちらも直近15分の投稿のみ使用
// ========================================

export async function onRequestGet(context) {
  try {
    const { env } = context;

    if (!env.DB) {
      return json({
        ok: false,
        error: "DB binding not found"
      }, 500);
    }


    // ------------------------------------
    // 混雑状況
    // ------------------------------------

    const crowdResult = await env.DB.prepare(`
      SELECT
        spot_id,
        COUNT(*) AS report_count,

        AVG(
          CASE status
            WHEN 'empty' THEN 1
            WHEN 'normal' THEN 2
            WHEN 'busy' THEN 3
          END
        ) AS average_status,

        MAX(created_at) AS latest_report

      FROM crowd_reports

      WHERE created_at >= datetime('now', '-15 minutes')

      GROUP BY spot_id
    `).all();


    const spots = {};

    for (const row of crowdResult.results || []) {
      let status = "normal";

      const average = Number(row.average_status);

      if (average < 1.5) {
        status = "empty";
      } else if (average >= 2.5) {
        status = "busy";
      }

      spots[row.spot_id] = {
        status,
        report_count: Number(row.report_count),
        latest_report: row.latest_report
      };
    }


    // ------------------------------------
    // 待ち時間
    // ------------------------------------

    const waitResult = await env.DB.prepare(`
      SELECT
        spot_id,
        COUNT(*) AS report_count,
        ROUND(AVG(wait_minutes)) AS average_wait_minutes,
        MAX(wait_minutes) AS max_wait_minutes,
        MIN(wait_minutes) AS min_wait_minutes,
        MAX(created_at) AS latest_report

      FROM crowd_wait_reports

      WHERE created_at >= datetime('now', '-15 minutes')

      GROUP BY spot_id
    `).all();


    const waits = {};

    for (const row of waitResult.results || []) {
      waits[row.spot_id] = {
        average_minutes: Number(row.average_wait_minutes),
        min_minutes: Number(row.min_wait_minutes),
        max_minutes: Number(row.max_wait_minutes),
        report_count: Number(row.report_count),
        latest_report: row.latest_report
      };
    }


    // ------------------------------------
    // 返却
    // ------------------------------------

    return json({
      ok: true,

      window_minutes: 15,

      spots,

      waits
    });

  } catch (error) {
    console.error(error);

    return json({
      ok: false,
      error: "Failed to load crowd data"
    }, 500);
  }
}


// ========================================
// POST /api/crowd
//
// 2種類の投稿を受け付ける
//
// ① 混雑状況
// {
//   spot_id: "wc1",
//   status: "busy"
// }
//
// ② 待ち時間
// {
//   spot_id: "wc1",
//   wait_minutes: 15
// }
// ========================================

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    if (!env.DB) {
      return json({
        ok: false,
        error: "DB binding not found"
      }, 500);
    }


    let body;

    try {
      body = await request.json();
    } catch {
      return json({
        ok: false,
        error: "Invalid JSON"
      }, 400);
    }


    const spotId = String(body?.spot_id || "");


    // ------------------------------------
    // 場所チェック
    // ------------------------------------

    if (!ALLOWED_SPOTS.has(spotId)) {
      return json({
        ok: false,
        error: "Invalid spot_id"
      }, 400);
    }


    // ====================================
    // ① 待ち時間の投稿
    // ====================================

    if (body?.wait_minutes !== undefined) {

      const waitMinutes = Number(body.wait_minutes);

      if (!ALLOWED_WAIT_MINUTES.has(waitMinutes)) {
        return json({
          ok: false,
          error: "Invalid wait_minutes"
        }, 400);
      }


      await env.DB.prepare(`
        INSERT INTO crowd_wait_reports (
          spot_id,
          wait_minutes,
          created_at
        )
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `)
        .bind(
          spotId,
          waitMinutes
        )
        .run();


      return json({
        ok: true,

        type: "wait",

        spot_id: spotId,

        wait_minutes: waitMinutes
      });
    }


    // ====================================
    // ② 混雑状況の投稿
    // ====================================

    const status = String(body?.status || "");


    if (!ALLOWED_STATUS.has(status)) {
      return json({
        ok: false,
        error: "Invalid status"
      }, 400);
    }


    await env.DB.prepare(`
      INSERT INTO crowd_reports (
        spot_id,
        status,
        created_at
      )
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `)
      .bind(
        spotId,
        status
      )
      .run();


    return json({
      ok: true,

      type: "crowd",

      spot_id: spotId,

      status
    });


  } catch (error) {
    console.error(error);

    return json({
      ok: false,
      error: "Failed to save crowd report"
    }, 500);
  }
}