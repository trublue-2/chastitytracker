import nodemailer from "nodemailer";
import { EMAIL_BUTTON_COLORS } from "@/lib/constants";

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

/** Öffentliche Basis-URL der Instanz. Einzige Quelle für den NEXTAUTH_URL-Fallback in Mails/Links.
 *  (Nicht in `portal-login` verwenden — die Route fällt bewusst auf `req.nextUrl.origin` zurück.) */
export function appBaseUrl(): string {
  return process.env.NEXTAUTH_URL ?? "http://localhost:3000";
}

/** Hervorgehobene Notiz-Box (gelb) für Freitext des Keyholders in Mails. `text` wird escaped. */
export function noticeBoxHtml(label: string, text: string): string {
  return `<div style="background:#fef9c3;border:1px solid #fde047;border-radius:10px;padding:14px 18px;margin:16px 0"><p style="margin:0 0 4px 0;font-size:13px;font-weight:bold;color:#713f12">${label}</p><p style="margin:0;font-size:15px;color:#422006">${escHtml(text)}</p></div>`;
}

export interface EmailFrameOptions {
  /** Button-Hintergrund (Default: `EMAIL_BUTTON_COLORS.default`). Werte aus `EMAIL_BUTTON_COLORS`. */
  buttonColor?: string;
  /** Button-Ziel (Default: das Dashboard). */
  buttonHref?: string;
  /** Roh-HTML NACH dem Button (z.B. Link-Fallback, Hilfe-Footer). */
  afterHtml?: string;
}

/** Standard-E-Mail-Layout mit Aktions-Button. Geteilt von allen Benachrichtigungen.
 *  `heading` wird ROH eingesetzt — Aufrufer escapen selbst, wo nötig.
 *  `buttonLabel` wird in der Sprache des Empfängers übergeben (siehe emailI18n.ts). */
export function dashboardEmailHtml(
  heading: string,
  innerHtml: string,
  buttonLabel: string,
  opts: EmailFrameOptions = {},
): string {
  const { buttonColor = EMAIL_BUTTON_COLORS.default, buttonHref = `${appBaseUrl()}/dashboard`, afterHtml = "" } = opts;
  return `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#1e293b">${heading}</h2>
        ${innerHtml}
        <p>
          <a href="${buttonHref}" style="display:inline-block;background:${buttonColor};color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold">
            ${buttonLabel}
          </a>
        </p>
        ${afterHtml}
      </div>
      `;
}
