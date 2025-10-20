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
    const agreePrivacy = formData.get("개인정보동의") ? "동의함" : "미동의";
    const agreeEvent = formData.get("이벤트동의") ? "동의함" : "미동의";

    const file = formData.get("bizfile");
    const attachments = [];
    if (file && typeof file === "object" && file.name) {
      const buffer = Buffer.from(await file.arrayBuffer());
      if (buffer.length > 5 * 1024 * 1024) {
        return new Response("File too large", { status: 413 });
      }
      attachments.push({ filename: file.name, content: buffer });
    }

    // ✅ 포트 587 사용 시 secure는 false
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.naver.com",
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false, // ✅ 587 포트는 false (TLS 사용)
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

    return new Response(null, {
      status: 303,
      headers: { Location: "https://www.semeng.co.kr/under_banner/banner?ok=1" },
    });
  } catch (e) {
    console.error("Mail send error:", e);
    return new Response(null, {
      status: 303,
      headers: { Location: "https://www.semeng.co.kr/under_banner/banner?ok=0" },
    });
  }
}