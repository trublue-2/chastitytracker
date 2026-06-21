import nodemailer from "nodemailer";

export function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendMail(to: string, subject: string, html: string) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    html,
  });
}

/** Standard-E-Mail-Layout mit „Zum Dashboard"-Button. Geteilt von allen Benachrichtigungen. */
export function dashboardEmailHtml(heading: string, innerHtml: string): string {
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#1e293b">${heading}</h2>
        ${innerHtml}
        <p>
          <a href="${baseUrl}/dashboard" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold">
            Zum Dashboard →
          </a>
        </p>
      </div>
      `;
}
