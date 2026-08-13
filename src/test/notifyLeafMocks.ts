import { vi } from "vitest";

/**
 * TEST-ONLY (wie `prismaMock.ts` und `messageTableMock.ts`, aus demselben Grund).
 *
 * Die BLÄTTER von `notifyUser` als Doppelgänger: Mail, Push, die beiden Übersetzungs-Zugänge. Jeder
 * Test, der prüft, WAS eine Meldung auslöst (Posteingang ja, Wecken nein), muss sie ersetzen — sonst
 * liefe er in echte SMTP- und VAPID-Aufrufe.
 *
 * WARUM GETEILT. Die Mail-Fabrik ist eine WHITELIST: sie muss jeden Export von `@/lib/mail`
 * aufzählen, den der Produktivpfad anfasst. Als Kopie in jeder Testdatei bricht ein neuer Export
 * jede Kopie einzeln — mit einem Fehler („X is not a function"), der nach einem Fehler im
 * Produktivcode aussieht. Hier steht sie einmal.
 *
 * BENUTZUNG — eine Zeile je Modul, weil `vi.mock` syntaktisch erkannt und hochgezogen wird und
 * deshalb im Testfile selbst stehen muss. Der dynamische Import in der Fabrik ist der dafür
 * vorgesehene Weg (die Fabrik läuft lazy, nicht beim Hochziehen):
 *
 *     vi.mock("@/lib/mail", async () => (await import("@/test/notifyLeafMocks")).mailLeaf());
 *     vi.mock("@/lib/push", async () => (await import("@/test/notifyLeafMocks")).pushLeaf());
 *     vi.mock("@/lib/emailI18n", async () => (await import("@/test/notifyLeafMocks")).emailI18nLeaf());
 *     vi.mock("next-intl/server", async () => (await import("@/test/notifyLeafMocks")).intlServerLeaf());
 */

/** `@/lib/mail`: `sendMailSafe` als Spion, der Rest als harmlose Hüllen — die Bausteine des
 *  HTML-Rumpfs interessieren keinen dieser Tests, fehlen dürfen sie aber nicht. */
export const mailLeaf = () => ({
  sendMailSafe: vi.fn(),
  escHtml: (s: string) => s,
  appBaseUrl: () => "https://x",
  noticeBoxHtml: () => "",
  dashboardEmailHtml: () => "",
});

/** `@/lib/push`: der Versand als Spion. */
export const pushLeaf = () => ({ firePush: vi.fn() });

/** `@/lib/emailI18n`: Übersetzen heisst hier „gib den Schlüssel zurück" — geprüft werden Schlüssel,
 *  nicht Sätze. */
export const emailI18nLeaf = () => ({
  emailT: vi.fn(async () => (k: string) => k),
  emailGreeting: () => "",
});

/** `next-intl/server`: dasselbe für die Server-Übersetzungen. */
export const intlServerLeaf = () => ({ getTranslations: vi.fn(async () => (k: string) => k) });
