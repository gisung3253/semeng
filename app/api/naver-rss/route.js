// app/api/naver-rss/route.js
import { NextResponse } from "next/server";

/** ====== 유틸 ====== */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

const stripCdata = (s = "") => s.replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1").trim();

const extract = (tag, xml) => {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1].trim() : "";
};

const normalizeLink = (rawLink = "") => {
  // CDATA 제거 + 쓸모없는 tracking query 제거
  const link = stripCdata(rawLink);
  try {
    const u = new URL(link);
    // 네이버 RSS가 붙이는 fromRss, trackingCode 등은 제거
    u.search = "";
    return u.toString();
  } catch {
    return link;
  }
};

const pickFirstImgFromHtml = (html = "") => {
  const m = html.match(/<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|gif|webp))["']/i);
  return m ? m[1] : null;
};

const htmlToPlain = (html = "") =>
  html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** fetch 타임아웃 래퍼 (ms) */
async function fetchWithTimeout(url, opts = {}, timeout = 3500) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

/** 글 본문 페이지에서 og:image 긁어오기 (썸네일 보강) */
async function fetchOgImage(pageUrl) {
  try {
    const res = await fetchWithTimeout(pageUrl, { headers: { "User-Agent": UA } }, 4000);
    if (!res.ok) return null;
    const html = await res.text();
    const m =
      html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
      html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** 간단한 동시성 제한 (semaphore) */
async function pLimitAll(tasks, limit = 3) {
  const ret = [];
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const cur = i++;
      ret[cur] = await tasks[cur]();
    }
  }
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return ret;
}

/** ====== 메인 핸들러 ====== */
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const blogId = searchParams.get("blogId");
  const limit = Number(searchParams.get("limit") || 8);
  const fallbackImg = searchParams.get("fallback"); // 선택: 기본 이미지 URL

  if (!blogId) {
    return NextResponse.json({ error: "Missing blogId" }, { status: 400 });
  }

  try {
    // ✅ 올바른 RSS 엔드포인트
    const rssUrl = `https://rss.blog.naver.com/${blogId}.xml`;
    const res = await fetchWithTimeout(rssUrl, { headers: { "User-Agent": UA }, cache: "no-store" }, 5000);
    if (!res.ok) throw new Error(`RSS fetch failed: ${res.status}`);
    const xml = await res.text();

    // RSS <item> 파싱
    const items = [];
    const re = /<item>([\s\S]*?)<\/item>/gi;
    let m;
    while ((m = re.exec(xml)) !== null) {
      const raw = m[1];

      const title = stripCdata(extract("title", raw));
      const link = normalizeLink(extract("link", raw));
      const pubDateStr = extract("pubDate", raw).trim();
      const pubDate = pubDateStr ? new Date(pubDateStr) : new Date();
      const descHtml = stripCdata(extract("description", raw));

      let thumbnail = pickFirstImgFromHtml(descHtml);
      const summary = htmlToPlain(descHtml).slice(0, 120);

      items.push({ title, link, pubDate, thumbnail, summary });
    }

    // 최신순 정렬 + limit 적용
    const sorted = items.sort((a, b) => (b.pubDate - a.pubDate)).slice(0, limit);

    // 썸네일 없는 항목에 대해 추가로 og:image 보강 (동시 3개)
    const tasks = sorted.map((it) => async () => {
      if (!it.thumbnail) {
        const og = await fetchOgImage(it.link);
        it.thumbnail = og || fallbackImg || null;
      }
      // 날짜는 ISO 문자열로 직렬화
      return {
        title: it.title,
        link: it.link,
        pubDate: isNaN(it.pubDate) ? null : it.pubDate.toISOString(),
        thumbnail: it.thumbnail,
        summary: it.summary,
      };
    });

    const finalItems = await pLimitAll(tasks, 3);

    return new NextResponse(JSON.stringify({ items: finalItems }), {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json; charset=utf-8",
        // 서버 캐시(엣지/프록시) 5분, 브라우저 1분
        "Cache-Control": "max-age=60, s-maxage=300",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
