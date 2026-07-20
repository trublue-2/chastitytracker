import nodemailer from "nodemailer";
import { EMAIL_BUTTON_COLORS } from "@/lib/constants";
import { structuredLog } from "@/lib/serverLog";

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
  // Ohne konfiguriertes SMTP still übersprungen statt geworfen — eine fehlende Mail-Config darf
  // keinen Business-Flow (Reset, Kontrolle, Benachrichtigung) mit einem 500 abbrechen.
  if (!process.env.SMTP_HOST) {
    structuredLog("mail", "skipped_no_smtp", { subject });
    return;
  }
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    html,
  });
}

/** Fehler-toleranter Versand: fängt jeden Wurf (ungültige/Fake-Adresse, SMTP-Ausfall, Auth-Fehler)
 *  ab und loggt ihn. Für awaited Aufrufer, bei denen die Mail nur eine Benachrichtigung ist und
 *  niemals den eigentlichen Vorgang zum 500 machen darf. */
export async function sendMailSafe(to: string, subject: string, html: string): Promise<void> {
  try {
    await sendMail(to, subject, html);
  } catch (e) {
    structuredLog("mail", "send_failed", { subject, error: (e as Error).message });
  }
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
