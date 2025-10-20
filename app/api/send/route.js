// app/api/send/route.js
export const runtime = "nodejs"; // nodemailer는 edge에서 동작 X

import nodemailer from "nodemailer";

export async function POST(req) {
  try {
    // 폼데이터 파싱 (multipart/form-data 필수)
    const formData = await req.formData();

    // 입력값들 (name 속성 그대로!)
    const name = formData.get("담당자") || "";
    const company = formData.get("회사명") || "";
    const phone = formData.get("연락처") || "";
    const email = formData.get("이메일") || "";
    const region = formData.get("지역") || "";
    const workers = formData.get("직원수") || "";
    const message = formData.get("문의내용") || "";
    const equip = formData.getAll("필요장비[]").join(", ");

    const agreePrivacy = formData.get("개인정보동의") ? "동의함" : "미동의";
    const agreeEvent   = formData.get("이벤트동의")   ? "동의함" : "미동의";

    // 첨부 (Vercel Serverless는 바디 용량 제한이 있으니 5MB 이하 권장)
    const file = formData.get("bizfile");
    const attachments = [];
    if (file && typeof file === "object" && file.name) {
      const buffer = Buffer.from(await file.arrayBuffer());
      // 5MB 제한 예시
      if (buffer.length > 5 * 1024 * 1024) {
        return new Response("File too large", { status: 413 });
      }
      attachments.push({ filename: file.name, content: buffer });
    }

    // ─────────────────────────────────────────────
    // SMTP 설정 (기본: 네이버 예시). Gmail 쓰면 HOST/PORT만 바꾸면 됨.
    // ─────────────────────────────────────────────
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,        // NAVER: smtp.naver.com / GMAIL: smtp.gmail.com
      port: Number(process.env.SMTP_PORT),// 보통 465
      secure: true,                       // 465면 true
      auth: {
        user: process.env.MAIL_USER,      // 보내는 주소(id@naver.com)
        pass: process.env.MAIL_PASS,      // "앱 비밀번호"
      },
    });

    const mailOptions = {
      from: `"정부지원 문의" <${process.env.MAIL_USER}>`,
      to: "gisung3253@naver.com",
      subject: `정부지원 문의 - ${company} (${name})`,
      text: [
        "▶ 정부지원 문의 접수 내역",
        "",
        `필요장비: ${equip || "선택 없음"}`,
        `지역: ${region}`,
        `직원수: ${workers}`,
        "",
        `회사명: ${company}`,
        `담당자: ${name}`,
        `연락처: ${phone}`,
        `이메일: ${email}`,
        "",
        "문의내용:",
        message,
        "",
        `개인정보동의: ${agreePrivacy}`,
        `이벤트동의: ${agreeEvent}`,
      ].join("\n"),
      attachments,
    };

    await transporter.sendMail(mailOptions);

    // 성공 시: 원래 배너 페이지로 리다이렉트 (?ok=1)
    return new Response(null, {
      status: 303,
      headers: { Location: "https://www.semeng.co.kr/under_banner/banner?ok=1" },
    });
  } catch (e) {
    console.error("Mail send error:", e);
    // 실패 시: ?ok=0
    return new Response(null, {
      status: 303,
      headers: { Location: "https://www.semeng.co.kr/under_banner/banner?ok=0" },
    });
  }
}
