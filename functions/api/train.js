// functions/api/train.js

const SOURCES = {
  rinkai: {
    name: "りんかい線",
    station: "東京テレポート駅",
    url: "https://service.twr.co.jp/rinkai/public/information?lang=ja",
    type: "rinkai"
  },

  yurikamome: {
    name: "ゆりかもめ",
    station: "台場駅",
    url: "https://www.yurikamome.co.jp/ride-guidance/operation.html",
    type: "yurikamome"
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store"
    }
  });
}

function cleanText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}


// ========================================
// りんかい線
// ========================================

function extractRinkai(text) {

  /*
    「運行情報をご覧いただく際の注意事項」より
    前だけを見る。

    これで注意事項に書かれている
    「遅れ」「運転中止」等を誤検知しない。
  */

  let current = text;

  const endMarkers = [
    "運行情報をご覧いただく際の注意事項",
    "運行情報を公式Xでも配信"
  ];

  for (const marker of endMarkers) {
    const pos = current.indexOf(marker);

    if (pos !== -1) {
      current = current.slice(0, pos);
    }
  }

  return current;
}


// ========================================
// ゆりかもめ
// ========================================

function extractYurikamome(text) {

  /*
    「現在の運行状況」から
    「振替輸送について」までだけを見る。

    FAQ等に書かれている
    「運転見合わせ」を拾わない。
  */

  const startMarker = "現在の運行状況";
  const endMarker = "振替輸送について";

  const start = text.indexOf(startMarker);

  if (start === -1) {
    return "";
  }

  let current = text.slice(start + startMarker.length);

  const end = current.indexOf(endMarker);

  if (end !== -1) {
    current = current.slice(0, end);
  }

  return current;
}


// ========================================
// 状態判定
// ========================================

function judgeStatus(text, type) {

  if (!text) {
    return {
      status: "unknown",
      label: "公式情報を確認してください"
    };
  }


  // ---------- 平常運転を先に確認 ----------

  const normalWords = [
    "平常通り運転しています",
    "平常通り運転",
    "平常運転"
  ];

  if (normalWords.some(word => text.includes(word))) {
    return {
      status: "normal",
      label: "平常運転"
    };
  }


  // ---------- 運転見合わせ ----------

  const stoppedWords = [
    "運転を見合わせています",
    "運転を見合わせております",
    "運転見合わせ",
    "全線運休",
    "運転を中止しています"
  ];

  if (stoppedWords.some(word => text.includes(word))) {
    return {
      status: "stopped",
      label: "運転見合わせ・運休情報あり"
    };
  }


  // ---------- 遅延・運行変更 ----------

  const delayWords = [
    "遅れが発生",
    "遅延が発生",
    "ダイヤが乱れ",
    "直通運転を中止",
    "折り返し運転",
    "一部列車に遅れ"
  ];

  if (delayWords.some(word => text.includes(word))) {
    return {
      status: "delay",
      label: "遅延・運行変更情報あり"
    };
  }


  /*
    ゆりかもめ公式ページでは、
    平常時に現在状況部分が「-」等になる場合がある。

    公式ページには
    「午前4時の平常運転表示なら現在も平常」
    という仕様説明があるため、
    情報部分に異常情報が無い場合は平常扱い。
  */

  if (type === "yurikamome") {
    return {
      status: "normal",
      label: "平常運転"
    };
  }


  return {
    status: "unknown",
    label: "公式情報を確認してください"
  };
}


// ========================================
// 公式ページ取得
// ========================================

async function fetchOfficial(source) {

  try {

    const response = await fetch(source.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; BMSGFES26-Transit/1.0)"
      },

      cf: {
        cacheTtl: 60,
        cacheEverything: true
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();

    const fullText = cleanText(html);

    let currentText = "";

    if (source.type === "rinkai") {
      currentText = extractRinkai(fullText);
    }

    if (source.type === "yurikamome") {
      currentText = extractYurikamome(fullText);
    }

    const result = judgeStatus(
      currentText,
      source.type
    );

    return {
      ok: true,

      name: source.name,

      station: source.station,

      status: result.status,

      label: result.label,

      source_url: source.url
    };

  } catch (error) {

    console.error(source.name, error);

    return {
      ok: false,

      name: source.name,

      station: source.station,

      status: "unknown",

      label: "取得できませんでした",

      source_url: source.url
    };
  }
}


// ========================================
// API
// ========================================

export async function onRequestGet() {

  try {

    const [
      rinkai,
      yurikamome
    ] = await Promise.all([

      fetchOfficial(
        SOURCES.rinkai
      ),

      fetchOfficial(
        SOURCES.yurikamome
      )

    ]);


    return json({

      ok: true,

      updated_at:
        new Date().toISOString(),

      lines: {

        rinkai,

        yurikamome

      }

    });

  } catch (error) {

    console.error(error);

    return json(
      {
        ok: false,
        error:
          "Failed to load train information"
      },
      500
    );
  }
}