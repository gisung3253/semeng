// app/api/naver-rss/route.js
import { NextResponse } from "next/server";

// 특정 태그 추출
function extract(tag, xml) {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1].trim() : "";
}

function cleanCdata(str = "") {
  return str.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}

function normalizeLink(raw = "") {
  const link = cleanCdata(raw);
  try {
    const u = new URL(link);
    // 네이버 RSS가 붙이는 추적 쿼리 제거
    u.searchParams.delete("fromRss");
    u.searchParams.delete("trackingCode");
    return u.toString();
  } catch {
    return link;
  }
}

// 전체 item 파싱
function extractAllItems(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const raw = m[1];

    const title = cleanCdata(extract("title", raw));
    const link = normalizeLink(extract("link", raw));
    const pubDate = new Date(extract("pubDate", raw).trim() || Date.now());
    const desc = cleanCdata(extract("description", raw));

    // 이미지 추출 (확장자 + 쿼리 파라미터 포함)
    const imgMatch = desc.match(
      /<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|gif|webp)[^"']*)["']/i
    );

    const thumbnail = imgMatch
      ? imgMatch[1]
      : "https://www.brandb.net/_next/image?url=https%3A%2F%2Fapi.brandb.net%2Fapi%2Fv2%2Fcommon%2Fimage%3FfileId%3D26953&w=640&q=75";

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
  const limit = Number(searchParams.get("limit") || 8);
  if (!blogId) return NextResponse.json({ error: "Missing blogId" }, { status: 400 });

  try {
    const rssUrl = `https://rss.blog.naver.com/${blogId}.xml`;
    const res = await fetch(rssUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`RSS fetch failed: ${res.status}`);
    const xml = await res.text();

    const items = extractAllItems(xml)
      .sort((a, b) => b.pubDate - a.pubDate)
      .slice(0, limit);

    return new NextResponse(JSON.stringify({ items }), {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "max-age=60, s-maxage=300",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
