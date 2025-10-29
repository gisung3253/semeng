import { NextResponse } from "next/server";

// XML에서 특정 태그 내용 추출
function extract(tag, xml) {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1].trim() : "";
}

// 모든 item 파싱
function extractAllItems(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const raw = m[1];

    // CDATA 제거
    const clean = (str) => str.replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1").trim();

    const title = clean(extract("title", raw));
    const link = clean(extract("link", raw));
    const pubDate = new Date(extract("pubDate", raw).trim() || Date.now());
    const desc = clean(extract("description", raw));

    // ✅ 썸네일 추출 (없으면 기본 이미지로 대체)
    const imgMatch =
      desc.match(/<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|gif|webp))["']/i);
    const thumbnail = imgMatch
      ? imgMatch[1]
      : "https://www.brandb.net/_next/image?url=https%3A%2F%2Fapi.brandb.net%2Fapi%2Fv2%2Fcommon%2Fimage%3FfileId%3D26953&w=640&q=75";

    // 본문 요약 텍스트 (태그 제거)
    const summary = desc
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .slice(0, 120);

    items.push({ title, link, pubDate, thumbnail, summary });
  }
  return items;
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const blogId = searchParams.get("blogId");
  const limit = Number(searchParams.get("limit") || 8); // ✅ 기본 8개로 변경

  if (!blogId) {
    return NextResponse.json({ error: "Missing blogId" }, { status: 400 });
  }

  try {
    // ✅ RSS 주소는 rss.blog.naver.com !!
    const rssUrl = `https://rss.blog.naver.com/${blogId}.xml`;
    const res = await fetch(rssUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`RSS fetch failed: ${res.status}`);
    const xml = await res.text();

    const items = extractAllItems(xml)
      .sort((a, b) => b.pubDate - a.pubDate)
      .slice(0, limit);

    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "max-age=60, s-maxage=300",
    };
    return new NextResponse(JSON.stringify({ items }), { status: 200, headers });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
