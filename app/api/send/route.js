// app/api/send/route.js
export const runtime = "nodejs";

import nodemailer from "nodemailer";

export async function POST(req) {
  try {
    const formData = await req.formData();

    const name = formData.get("담당자") || "";
    const company = formData.get("회사명") || "";
    const phone = formData.get("연락처") || "";
    const email = formData.get("이메일") || "";
    const region = formData.get("지역") || "";
    const workers = formData.get("직원수") || "";
    const message = formData.get("문의내용") || "";
    const equip = formData.getAll("필요장비[]").join(", ");

    // ▼ 신규 필드
    const subsidy = formData.get("국고보조지원") || "";   // "유" | "무" | ""
    const agency  = formData.get("시행처") || "";         // 시행처 입력값

    const file = formData.get("bizfile");
    const attachments = [];
    if (file && typeof file === "object" && file.name) {
      const buffer = Buffer.from(await file.arrayBuffer());
      if (buffer.length > 5 * 1024 * 1024) {
        // 실패로 처리: 루트로 리디렉션 + ok=0
        return new Response(null, {
          status: 303,
          headers: { Location: "https://www.semeng.co.kr/?ok=0" },
        });
      }
      attachments.push({ filename: file.name, content: buffer });
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.naver.com",
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    const mailOptions = {
      from: `"정부지원 문의" <${process.env.MAIL_USER}>`,
      to: "semwerpoo@naver.com",
      subject: `정부지원 문의 - ${company} (${name})`,
      text: [
        "▶ 정부지원 문의 접수 내역",
        "",
        `필요장비: ${equip || "선택 없음"}`,
        `지역: ${region}`,
        `직원수: ${workers}`,
        `과거 국고보조지원 여부: ${subsidy || "미선택"}`,
        `시행처: ${subsidy === "유" ? (agency || "미입력") : "-"}`,
        "",
        `회사명: ${company}`,
        `담당자: ${name}`,
        `연락처: ${phone}`,
        `이메일: ${email}`,
        "",
        "문의내용:",
        message,
        "",
      ].join("\n"),
      attachments,
    };

    await transporter.sendMail(mailOptions);

    // 성공 → 루트 + ok=1
    return new Response(null, {
      status: 303,
      headers: { Location: "https://www.semeng.co.kr/default/?ok=1" },
    });
  } catch (e) {
    console.error("Mail send error:", e);
    // 실패 → 루트 + ok=0
    return new Response(null, {
      status: 303,
      headers: { Location: "https://www.semeng.co.kr/default/?ok=0" },
    });
  }
}
