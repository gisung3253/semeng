// app/api/naver-rss/route.js
import { NextResponse } from "next/server";

// 간단 XML 파싱: 외부 라이브러리 없이 최소 파서 (썸네일/본문 요약은 부분 파싱)
function extract(tag, xml) {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1].trim() : "";
}
function extractAllItems(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const raw = m[1];
    const title = extract("title", raw)
      .replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1")
      .trim();
    const link = extract("link", raw).trim();
    const pubDate = new Date(extract("pubDate", raw).trim() || Date.now());
    const desc = extract("description", raw)
      .replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1")
      .trim();

    // description 안 첫 번째 이미지 추출
    const imgMatch = desc.match(/<img[^>]+src=["']([^"']+)["']/i);
    const thumbnail = imgMatch ? imgMatch[1] : null;

    // 텍스트 요약
    const text = desc
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .slice(0, 120);

    items.push({ title, link, pubDate, thumbnail, summary: text });
  }
  return items;
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const blogId = searchParams.get("blogId"); // 네이버 블로그 ID
  const limit = Number(searchParams.get("limit") || 6);

  if (!blogId) {
    return NextResponse.json({ error: "Missing blogId" }, { status: 400 });
  }

  try {
    const rssUrl = `https://blog.rss.naver.com/${blogId}.xml`;
    const res = await fetch(rssUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`RSS fetch failed: ${res.status}`);
    const xml = await res.text();
    const items = extractAllItems(xml)
      .sort((a, b) => b.pubDate - a.pubDate)
      .slice(0, limit);

    // CORS 허용 (카페24 등 외부 도메인에서 호출 가능)
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "max-age=60, s-maxage=300", // 적당 캐시
    };
    return new NextResponse(JSON.stringify({ items }), { status: 200, headers });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
