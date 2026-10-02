// functions/api/train.js

const SOURCES = {
  rinkai: {
    name: "りんかい線",
    station: "東京テレポート駅",
    url: "https://service.twr.co.jp/rinkai/public/information?lang=ja"
  },
  yurikamome: {
    name: "ゆりかもめ",
    station: "台場駅",
    url: "https://www.yurikamome.co.jp/index.html"
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
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function judgeStatus(text) {
  if (
    text.includes("運転見合わせ") ||
    text.includes("運転を見合わせ") ||
    text.includes("運休") ||
    text.includes("運転中止")
  ) {
    return {
      status: "stopped",
      label: "運転見合わせ・運休情報あり"
    };
  }

  if (
    text.includes("遅延") ||
    text.includes("遅れ") ||
    text.includes("直通運転を中止") ||
    text.includes("ダイヤ乱れ")
  ) {
    return {
      status: "delay",
      label: "遅延・運行変更情報あり"
    };
  }

  if (
    text.includes("平常通り運転しています") ||
    text.includes("平常通り運転") ||
    text.includes("平常運転")
  ) {
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
    const text = cleanText(html);

    const result = judgeStatus(text);

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

export async function onRequestGet() {
  try {
    const [rinkai, yurikamome] = await Promise.all([
      fetchOfficial(SOURCES.rinkai),
      fetchOfficial(SOURCES.yurikamome)
    ]);

    return json({
      ok: true,
      updated_at: new Date().toISOString(),
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
        error: "Failed to load train information"
      },
      500
    );
  }
}