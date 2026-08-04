import path from "path";
import nodemailer from "nodemailer";

/**
 * Shared Gmail SMTP transport. Reuses the exact credentials/config already
 * proven in production by the contact form (app/api/contact/route.ts):
 * GMAIL_USER + GMAIL_APP_PASSWORD (app password, spaces stripped).
 *
 * Singleton across hot-reloads in dev to avoid leaking connections.
 */
const globalForMail = globalThis as unknown as {
  mailTransporter: nodemailer.Transporter | undefined;
};

export const transporter =
  globalForMail.mailTransporter ??
  nodemailer.createTransport({
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

if (process.env.NODE_ENV !== "production") {
  globalForMail.mailTransporter = transporter;
}

// Brand logo shipped in /public — embedded inline (CID) so it renders in the
// email client without needing to fetch a public URL (works from localhost too).
const LOGO_PATH = path.join(process.cwd(), "public/assets/img/keptcarbon-logo-email.png");
const LOGO_CID = "kc-logo";

/**
 * Build the reset-email HTML. Exported so it can be previewed/tested in
 * isolation. `logoSrc` defaults to the CID reference used when sending; a
 * preview can pass a data-URI instead so it renders in a browser.
 */
export function buildResetEmailHtml(resetUrl: string, logoSrc = `cid:${LOGO_CID}`): string {
  const preheader = "ลิงก์ตั้งรหัสผ่านใหม่ของคุณ (หมดอายุใน 15 นาที)";
  return `<!doctype html>
<html lang="th">
  <body style="margin:0;padding:0;background-color:#eef4f0;">
    <!-- preheader (hidden preview text) -->
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#eef4f0;font-size:1px;line-height:1px;">${preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef4f0;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:460px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(26,61,43,0.08);">

            <!-- body -->
            <tr>
              <td style="padding:32px 32px 28px;font-family:'Helvetica Neue',Arial,sans-serif;">
                <h1 style="margin:0 0 16px;font-size:24px;line-height:1.4;color:#1a3d2b;font-weight:700;">รีเซ็ตรหัสผ่าน</h1>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.7;color:#5b6b62;">
                  เราได้รับคำขอรีเซ็ตรหัสผ่านสำหรับบัญชี KeptCarbon ของคุณ กดปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่
                </p>
                <!-- CTA button (bulletproof) -->
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 32px 0;">
                  <tr>
                    <td align="center" style="border-radius:8px;background:#1e7a47;">
                      <a href="${resetUrl}" target="_blank"
                         style="display:inline-block;padding:12px 24px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">
                        ตั้งรหัสผ่านใหม่
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 4px;font-size:13px;line-height:1.6;color:#8f989e;font-weight:600;">
                  ลิงก์นี้จะหมดอายุใน 15 นาที
                </p>
                <p style="margin:0;font-size:13px;line-height:1.6;color:#8f989e;font-weight:600;">
                  หากคุณไม่ได้เป็นผู้ขอรีเซ็ตรหัสผ่าน กรุณาเพิกเฉยต่ออีเมลฉบับนี้ - บัญชีของคุณยังคงปลอดภัย
                </p>
                <hr style="border:none;border-top:1px solid #eaeaea;margin:24px 0 24px;" />
                <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#8f989e;font-weight:600;">
                  หากปุ่มไม่ทำงาน คัดลอกลิงก์นี้ไปวางในเบราว์เซอร์:
                </p>
                <a href="${resetUrl}" style="color:#2d9e5f;font-size:13px;word-break:break-all;text-decoration:underline;">
                  ${resetUrl}
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Send the password-reset email.
 *
 * @param to        Recipient email address (the account's stored email).
 * @param resetUrl  Fully-qualified reset link containing the one-time token.
 *
 * Throws on transport failure — the caller decides how to handle it (the
 * forgot-password route sends this after responding, so failures never leak).
 */
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const html = buildResetEmailHtml(resetUrl);

  const text = [
    "รีเซ็ตรหัสผ่าน KeptCarbon",
    "",
    "เราได้รับคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ",
    "เปิดลิงก์นี้เพื่อตั้งรหัสผ่านใหม่ (หมดอายุใน 15 นาที, ใช้ได้ครั้งเดียว):",
    resetUrl,
    "",
    "หากคุณไม่ได้เป็นผู้ขอ กรุณาเพิกเฉยต่ออีเมลฉบับนี้",
  ].join("\n");

  await transporter.sendMail({
    from: `"KeptCarbon" <${process.env.GMAIL_USER}>`,
    to,
    subject: "รีเซ็ตรหัสผ่าน KeptCarbon",
    html,
    text,
  });
}
