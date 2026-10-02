const ALLOWED_STATUS = new Set(["empty", "normal", "busy"]);

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

// GET /api/crowd
// 現在の混雑状況を取得
export async function onRequestGet(context) {
  try {
    const { env } = context;

    if (!env.DB) {
      return json({
        ok: false,
        error: "DB binding not found"
      }, 500);
    }

    /*
      直近15分の投稿だけを使用。

      判定：
      empty  = 1
      normal = 2
      busy   = 3

      平均値から現在の状態を決定する。
    */
    const result = await env.DB.prepare(`
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

    for (const row of result.results || []) {
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

    return json({
      ok: true,
      window_minutes: 15,
      spots
    });

  } catch (error) {
    console.error(error);

    return json({
      ok: false,
      error: "Failed to load crowd data"
    }, 500);
  }
}


// POST /api/crowd
// 新しい混雑情報を投稿
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
    const status = String(body?.status || "");

    if (!ALLOWED_SPOTS.has(spotId)) {
      return json({
        ok: false,
        error: "Invalid spot_id"
      }, 400);
    }

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
      .bind(spotId, status)
      .run();

    return json({
      ok: true,
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