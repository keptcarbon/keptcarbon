import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

const RECIPIENTS: Record<string, { label: string; email: string }> = {
  keptcarbon: {
    label: "โครงการวิจัย KeptCarbon",
    email: "keptcarbon@gmail.com",
  },
  engrids: {
    label: "ผู้พัฒนาระบบ EnGRIDs",
    email: "engrids2025@gmail.com",
  },
};

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, ""),
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
});

export async function POST(req: NextRequest) {
  try {
    const { name, email, subject, message, recipient } = await req.json();

    if (!name || !email || !subject || !message || !recipient) {
      return NextResponse.json(
        { error: "กรุณากรอกข้อมูลให้ครบถ้วน" },
        { status: 400 }
      );
    }

    const target = RECIPIENTS[recipient];
    if (!target) {
      return NextResponse.json(
        { error: "ผู้รับไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    await transporter.sendMail({
      from: `"KeptCarbon Contact" <${process.env.GMAIL_USER}>`,
      to: target.email,
      replyTo: email,
      subject: `[${target.label}] ${subject}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px;">
          <h2 style="color: #1a3d2b; margin-bottom: 4px;">ข้อความจากแบบฟอร์มติดต่อ</h2>
          <p style="color: #6b7280; font-size: 13px; margin-top: 0;">ส่งถึง: ${target.label}</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
          <table style="width: 100%; font-size: 14px; color: #374151;">
            <tr><td style="padding: 6px 0; font-weight: 600; width: 120px;">ชื่อ-นามสกุล</td><td>${name}</td></tr>
            <tr><td style="padding: 6px 0; font-weight: 600;">อีเมลผู้ส่ง</td><td><a href="mailto:${email}">${email}</a></td></tr>
            <tr><td style="padding: 6px 0; font-weight: 600;">หัวข้อ</td><td>${subject}</td></tr>
          </table>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
          <div style="background: #f9fafb; padding: 16px; border-radius: 8px; font-size: 14px; color: #374151; white-space: pre-wrap;">${message}</div>
          <p style="font-size: 12px; color: #9ca3af; margin-top: 24px;">ส่งจาก KeptCarbon Platform — ตอบกลับไปที่ ${email}</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    console.error("Contact API error:", err.code, err.message);
    const isTimeout = err.code === "ETIMEDOUT" || err.code === "ECONNECTION";
    return NextResponse.json(
      {
        error: isTimeout
          ? "ไม่สามารถเชื่อมต่อ mail server ได้ กรุณาติดต่อ admin"
          : "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง",
      },
      { status: 500 }
    );
  }
}
