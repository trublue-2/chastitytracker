import { prisma } from "@/lib/prisma";
import { sendMail, escHtml, appBaseUrl, noticeBoxHtml, dashboardEmailHtml } from "@/lib/mail";
import { formatDateTime } from "@/lib/utils";
import { firePush } from "@/lib/push";
import { trackEvent } from "@/lib/telemetry";
import { notifyUser, type NotifyContent } from "@/lib/notify";
import { emailT, emailGreeting } from "@/lib/emailI18n";
import { toLocale, inspectionHelpUrl, EMAIL_BUTTON_COLORS } from "@/lib/constants";
import { computeDelayedTrigger } from "@/lib/delayedTrigger";
import { serviceErrors, mapServiceError, serviceFail, type ServiceResult } from "@/lib/serviceResult";
import { getLatestKgEntry, type PrismaTx } from "@/lib/queries";

export type KontrolleAction = "withdraw" | "manuallyVerify" | "reject";

/**
 * Resolves an inspection by id: withdraw it, or manually verify / reject its submitted photo.
 * Shared by PATCH /api/admin/kontrollen/[id] and the MCP resolve_inspection tool.
 */
export async function resolveKontrolle(id: string, action: KontrolleAction): Promise<ServiceResult<{ userId: string }>> {
  const ka = await prisma.kontrollAnforderung.findUnique({ where: { id } });
  if (!ka) return serviceFail(404, "INSPECTION_NOT_FOUND");

  if (action === "withdraw") {
    if (ka.withdrawnAt) return serviceFail(400, "INSPECTION_ALREADY_WITHDRAWN");
    await prisma.kontrollAnforderung.update({ where: { id }, data: { withdrawnAt: new Date() } });
    trackEvent("kontrolle.withdrawn");
  } else if (action === "manuallyVerify" || action === "reject") {
    if (!ka.entryId) return serviceFail(400, "INSPECTION_NO_SUBMISSION");
    const verifikationStatus = action === "manuallyVerify" ? "manual" : "rejected";
    await prisma.entry.update({ where: { id: ka.entryId }, data: { verifikationStatus } });
    trackEvent(action === "manuallyVerify" ? "kontrolle.verified" : "kontrolle.rejected");
  } else {
    return serviceFail(400, "UNKNOWN_ACTION");
  }

  const notif: NotifyContent =
    action === "manuallyVerify" ? { subjectKey: "inspectionConfirmedSubject", messageKey: "inspectionConfirmedMessage" }
    : action === "reject" ? { subjectKey: "inspectionRejectedSubject", messageKey: "inspectionRejectedMessage" }
    : { subjectKey: "inspectionResolvedWithdrawnSubject", messageKey: "inspectionResolvedWithdrawnMessage" };
  await notifyUser(ka.userId, notif);

  return { ok: true, data: { userId: ka.userId } };
}

/** Gültige Siegel-Nummer aus dem letzten Eintrag (5–8-stellig, nur bei aktivem VERSCHLUSS), sonst null.
 *  Single source für „ist dieser Code eine Siegel-Nummer" — genutzt beim Anlegen und im Poller. */
export function deriveSealCode(latest: { type: string; kontrollCode: string | null } | null): string | null {
  return latest?.type === "VERSCHLUSS" && latest.kontrollCode && /^\d{5,8}$/.test(latest.kontrollCode)
    ? latest.kontrollCode
    : null;
}

/** Die Siegel-Nummer, die bei der Kontrolle ZUSÄTZLICH zum Kontroll-Code auf dem Foto lesbar sein
 *  muss — oder null. Legacy-Zeilen (Siegel == Code, aus der Zeit vor der Zufallscode-Umstellung)
 *  liefern null: der Code IST dort die Siegel-Nummer, keine Dual-Prüfung. Single source der
 *  „Siegel ≠ Code"-Regel für alle Aufrufer (Mail-Text, Formular-Hinweis). */
export function requiredSealCode(code: string, sealCode: string | null): string | null {
  return sealCode && sealCode !== code ? sealCode : null;
}

/** Verlangt eine Kontrolle mit diesem Code ZUSÄTZLICH die Siegel-Nummer im Foto? True, wenn ein
 *  aktives Siegel existiert, das vom Code abweicht. Bündelt die Kette (Lock-Entry → deriveSealCode →
 *  requiredSealCode) für Formular-Hinweis (Neuanlage + Edit) — eine Regel, eine Stelle. `latest` wird
 *  übergeben (kein interner Query), damit Aufrufer ihr bestehendes Fetch/Batch behalten. */
export function sealRequiredForCode(
  code: string | null | undefined,
  latest: { type: string; kontrollCode: string | null } | null,
): boolean {
  return !!code && requiredSealCode(code, deriveSealCode(latest)) !== null;
}

/** Frische 5-stellige Kontroll-Code-Nummer (10000–99999). */
export function generateKontrollCode(): string {
  return String(Math.floor(10000 + Math.random() * 90000));
}

/** True, wenn der User eine LAUFENDE Kontrolle hat — angelegt, nicht erfüllt, nicht zurückgezogen,
 *  bereits sichtbar (sofort oder wirksamAb erreicht) UND noch innerhalb der Frist (deadline >= now).
 *  Das entspricht genau Status "open" aus mapAnforderungStatus. Bewusst NICHT blockierend sind:
 *  - geplante (wirksamAb in Zukunft) — noch unsichtbar, es gibt nichts zu überschneiden;
 *  - überfällige (deadline < now) — das Fenster ist abgelaufen; eine solche Zeile würde sonst,
 *    wenn der Sub sie nie beantwortet und die Auto-Markierung aus ist, JEDE künftige (auch Auto-)
 *    Kontrolle dauerhaft blockieren. Überfällige werden weiter normal eskaliert/bestraft — sie
 *    zählen hier nur nicht mehr als "aktiv". Gemeinsamer Guard für requestKontrolle (Anlegen) UND
 *    den Poller (Ausliefern), damit sich echte laufende Kontrollen nie überschneiden.
 *  `excludeId` lässt den Poller "irgendeine ANDERE laufende" prüfen, wenn die zu prüfende Zeile
 *  selbst bereits auf die Kriterien passt. Kompatibel mit der Eskalations-Auto-Markierung: die
 *  setzt withdrawnAt, fällt also korrekt aus diesem Guard heraus, ohne Sonderfall-Code. */
export async function hasActiveKontrolle(
  userId: string,
  now: Date,
  opts?: { excludeId?: string; tx?: PrismaTx },
): Promise<boolean> {
  const client = opts?.tx ?? prisma;
  const existing = await client.kontrollAnforderung.findFirst({
    where: {
      userId, entryId: null, withdrawnAt: null,
      OR: [{ wirksamAb: null }, { wirksamAb: { lte: now } }], // sichtbar
      deadline: { gte: now },                                 // noch innerhalb der Frist (nicht überfällig)
      ...(opts?.excludeId ? { id: { not: opts.excludeId } } : {}),
    },
    select: { id: true },
  });
  return existing !== null;
}

export interface RequestKontrolleParams {
  userId: string;
  kommentar?: string | null;
  /** Deadline in hours (default 4). */
  deadlineH?: number | null;
  /** Verzögerte Auslösung in Minuten (>0). Fehlt/0 = sofort. Die 5–65-/Random-Policy
   *  liegt beim Aufrufer (MCP) — der Service verzögert nur mechanisch. */
  delayMinutes?: number | null;
}

/**
 * Requests an inspection (KontrollAnforderung): generates a fresh random 5-digit code (proof the
 * photo is current), sets a deadline, withdraws any open request. If a seal is active, its number
 * is additionally required on the photo (verified at submission via deriveSealCode — the code
 * itself is always random). Sends e-mail + push immediately — or, with delayMinutes, schedules it
 * (wirksamAb): the request stays invisible to the user and the deadline starts at trigger; the
 * poller (kontrollePoller) sends the notification when due.
 * Shared by POST /api/admin/kontrolle and the MCP write tool. User must be currently locked.
 */
export async function requestKontrolle(
  params: RequestKontrolleParams,
): Promise<ServiceResult<{ code: string; deadline: string; scheduledFor: string | null }>> {
  const { userId, kommentar, deadlineH, delayMinutes } = params;
  if (!userId) return serviceFail(400, "USER_ID_REQUIRED");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return serviceFail(404, "USER_NOT_FOUND");
  if (!user.email) return serviceFail(400, "USER_NO_EMAIL");

  const kommentarTrimmed = typeof kommentar === "string" ? kommentar.trim() : null;
  const hours = typeof deadlineH === "number" && deadlineH > 0 ? deadlineH : 4;
  const now = new Date();
  const { wirksamAb, benachrichtigtAt } = computeDelayedTrigger(now, { delayMinutes });
  // Frist läuft ab Auslösung (bei sofort = jetzt, bei geplant = wirksamAb).
  const deadline = new Date((wirksamAb ?? now).getTime() + hours * 60 * 60 * 1000);

  let code: string;
  let sealCode: string | null;
  // Wurf- und Fang-Seite hängen an derselben Tabelle: `fail()` akzeptiert nur Codes, die unten
  // auch gemappt werden — ein Tippfehler ist ein Compile-Fehler, kein stiller 500.
  const { table: ERRORS, fail } = serviceErrors({
    NOT_LOCKED: { status: 400, error: "USER_NOT_LOCKED" },
    ALREADY_ACTIVE: { status: 409, error: "INSPECTION_ALREADY_ACTIVE" },
  });
  try {
    const result = await prisma.$transaction(async (tx) => {
      const latest = await getLatestKgEntry(userId, tx);
      if (!latest || latest.type !== "VERSCHLUSS") {
        throw fail("NOT_LOCKED");
      }

      // Überschneidungs-Schutz: ablehnen statt eine bereits laufende Kontrolle stillschweigend zu
      // ersetzen — egal ob die laufende von Keyholder, KI oder Auto-Kontrolle stammt. Der Check
      // läuft in derselben Transaktion wie das Anlegen; das deckt den Alltag ab. Es ist ein
      // Best-Effort-Read-then-Write, KEIN harter Ausschluss: bei exakt gleichzeitigen Anfragen
      // können unter SQLite-Snapshot-Isolation beide "keine laufende" lesen und je eine Zeile
      // anlegen. Bei zwei Schreibern (Keyholder + KI) ist das vernachlässigbar, und die Folge wäre
      // nur zwei transiente Zeilen, von denen eine ohnehin abläuft — ein DB-Constraint kann
      // "aktiv innerhalb der Frist" (now-abhängig) nicht ausdrücken, daher bewusst kein Index.
      if (await hasActiveKontrolle(userId, now, { tx })) {
        throw fail("ALREADY_ACTIVE");
      }

      // Immer frischer Zufallscode (Frische-Beweis) — die Siegel-Nummer wird bei der
      // Verifikation ZUSÄTZLICH geprüft, nicht mehr als Kontroll-Code wiederverwendet.
      const seal = deriveSealCode(latest);
      const c = generateKontrollCode();

      await tx.kontrollAnforderung.create({
        data: {
          userId,
          code: c,
          deadline,
          kommentar: kommentarTrimmed || null,
          wirksamAb,
          benachrichtigtAt, // sofort = jetzt benachrichtigt; geplant = Poller
        },
      });

      return { code: c, sealCode: seal };
    });
    code = result.code;
    sealCode = result.sealCode;
  } catch (e: unknown) {
    const mapped = mapServiceError(e, ERRORS);
    if (mapped) return mapped;
    throw e;
  }

  // Sofort benachrichtigen; bei geplanter Auslösung übernimmt der Poller bei Fälligkeit.
  if (!wirksamAb) {
    await sendKontrolleNotification({ user, code, sealCode, kommentar: kommentarTrimmed, deadline });
  }

  return { ok: true, data: { code, deadline: deadline.toISOString(), scheduledFor: wirksamAb?.toISOString() ?? null } };
}

/**
 * Sends the inspection e-mail (code + deadline + link) and a push to the user.
 * Reused by the immediate path in requestKontrolle and by the delayed-trigger poller.
 * `sealCode` = aktive Siegel-Nummer (oder null): weicht sie vom Code ab, verlangt die Mail
 * zusätzlich das Siegel auf dem Foto; ist sie gleich dem Code (Legacy-Zeilen von vor der
 * Zufallscode-Umstellung), bleibt das alte „Siegel-Nummer"-Label.
 * No-op if the user has no e-mail. Push is fire-and-forget.
 */
export async function sendKontrolleNotification(opts: {
  user: { id: string; email: string | null; username: string; locale: string };
  code: string;
  sealCode: string | null;
  kommentar: string | null;
  deadline: Date;
}): Promise<void> {
  const { user, code, sealCode, kommentar, deadline } = opts;
  if (!user.email) return;
  const sealRequired = requiredSealCode(code, sealCode) !== null;

  const locale = toLocale(user.locale);
  const t = await emailT(locale);

  const hoursLeft = Math.max(1, Math.round((deadline.getTime() - Date.now()) / (60 * 60 * 1000)));
  const kommentarHtml = kommentar ? noticeBoxHtml(t("inspectionAdminLabel"), kommentar) : "";

  const kommentarParam = kommentar ? `&kommentar=${encodeURIComponent(kommentar)}` : "";
  const link = `${appBaseUrl()}/dashboard/new/pruefung?code=${code}${kommentarParam}`;
  const helpUrl = inspectionHelpUrl(locale);
  const deadlineStr = formatDateTime(deadline);
  const codeLabel = sealCode && !sealRequired
    ? t("inspectionCodeLabelSeal")
    : t("inspectionCodeLabelControl");
  const sealHintHtml = sealRequired
    ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px 18px;margin:16px 0"><p style="margin:0;font-size:14px;color:#1e3a8a"><strong>${t("inspectionSealHintLabel")}</strong> ${t("inspectionSealHintText")}</p></div>`
    : "";

  await sendMail(
    user.email,
    `KG-Tracker – ${t("inspectionRequestedSubject")}`,
    dashboardEmailHtml(
      t("inspectionRequestedSubject"),
      `${emailGreeting(t, user.username)}
      <p>${escHtml(t("inspectionRequestedIntro", { hours: hoursLeft }))}</p>
      ${kommentarHtml}
      <p><strong>${codeLabel}</strong></p>
      <div style="font-size:48px;font-weight:bold;letter-spacing:12px;color:#f97316;text-align:center;padding:24px;background:#fff7ed;border-radius:12px;margin:16px 0">${code}</div>
      ${sealHintHtml}
      <p><strong>${t("inspectionDeadlineLabel")}</strong> ${deadlineStr}</p>`,
      t("inspectionButton"),
      {
        buttonColor: EMAIL_BUTTON_COLORS.inspection,
        buttonHref: link,
        // Link-Fallback + Hilfe-Footer stehen NACH dem Button — dafür gibt es den afterHtml-Slot.
        afterHtml:
          `<p style="color:#94a3b8;font-size:12px">${escHtml(t("inspectionLinkFallback", { link }))}</p>` +
          `<p style="color:#64748b;font-size:13px;margin-top:20px;border-top:1px solid #f1f5f9;padding-top:16px">${escHtml(t("inspectionHelpText"))} <a href="${helpUrl}" style="color:${EMAIL_BUTTON_COLORS.default}">${escHtml(t("inspectionHelpLink"))}</a></p>`,
      },
    ),
  );

  const pushParts = [t("inspectionPushCode", { code }), t("inspectionPushDeadline", { deadline: deadlineStr })];
  if (sealRequired) pushParts.push(t("inspectionPushSeal"));
  if (kommentar) pushParts.push(kommentar);
  firePush(
    user.id,
    t("inspectionPushTitle"),
    pushParts.join(" · "),
    `/dashboard/new/pruefung?code=${code}`,
  );
}
