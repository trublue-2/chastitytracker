import { prisma } from "@/lib/prisma";
import { sendMailSafe, escHtml, appBaseUrl, noticeBoxHtml, dashboardEmailHtml } from "@/lib/mail";
import { formatDateTime } from "@/lib/utils";
import { firePush } from "@/lib/push";
import { markLastAction } from "@/lib/appMeta";
import { notifyUser, type NotifyContent } from "@/lib/notify";
import { recordMessageAndBadge } from "@/lib/messageService";
import { emailT, emailGreeting, type EmailTranslator } from "@/lib/emailI18n";
import { toLocale, inspectionHelpUrl, EMAIL_BUTTON_COLORS } from "@/lib/constants";
import { computeDelayedTrigger, isHiddenFromSub } from "@/lib/delayedTrigger";
import { serviceErrors, mapServiceError, serviceFail, type ServiceResult } from "@/lib/serviceResult";
import { getLatestKgEntry, type PrismaTx } from "@/lib/queries";
import { inspectionHref } from "@/lib/entryFormRoute";

export type KontrolleAction = "withdraw" | "manuallyVerify" | "reject";

/** Der resultierende Entry.verifikationStatus einer Verify/Reject-Aktion — EINE Stelle, geteilt vom
 *  echten Commit (unten) und vom MCP resolve_inspection dryRun-Preview (B-05), damit beide nie
 *  auseinanderlaufen können. */
export function verifikationStatusFor(action: "manuallyVerify" | "reject"): "manual" | "rejected" {
  return action === "manuallyVerify" ? "manual" : "rejected";
}

/**
 * Resolves an inspection by id: withdraw it, or manually verify / reject its submitted photo.
 * Shared by PATCH /api/admin/kontrollen/[id] and the MCP resolve_inspection tool.
 */
export async function resolveKontrolle(id: string, action: KontrolleAction): Promise<ServiceResult<{ userId: string; notified: boolean }>> {
  const ka = await prisma.kontrollAnforderung.findUnique({ where: { id } });
  if (!ka) return serviceFail(404, "INSPECTION_NOT_FOUND");

  if (action === "withdraw") {
    if (ka.withdrawnAt) return serviceFail(400, "INSPECTION_ALREADY_WITHDRAWN");
    await prisma.kontrollAnforderung.update({ where: { id }, data: { withdrawnAt: new Date() } });
    markLastAction();
  } else if (action === "manuallyVerify" || action === "reject") {
    if (!ka.entryId) return serviceFail(400, "INSPECTION_NO_SUBMISSION");
    await prisma.entry.update({ where: { id: ka.entryId }, data: { verifikationStatus: verifikationStatusFor(action) } });
    markLastAction();
  } else {
    return serviceFail(400, "UNKNOWN_ACTION");
  }

  // Eine noch nicht ausgeloeste Kontrolle ist fuer den Sub unsichtbar (`wirksamAb` in der Zukunft) —
  // ihren Rueckzug zu melden verriete sie. Bei Auto-Kontrollen waere es der Zufallsplan, dessen
  // Ueberraschung der Sinn ist. Nur `withdraw` kann das treffen: `manuallyVerify`/`reject` setzen ein
  // eingereichtes Foto voraus, die Kontrolle hat also laengst ausgeloest.
  const notified = action !== "withdraw" || !isHiddenFromSub(ka);
  if (notified) {
    const inbox = { ref: { type: "control", id: ka.id }, senderKind: "keyholder" } as const;
    const notif: NotifyContent =
      action === "manuallyVerify" ? { subjectKey: "inspectionConfirmedSubject", messageKey: "inspectionConfirmedMessage", inbox }
      : action === "reject" ? { subjectKey: "inspectionRejectedSubject", messageKey: "inspectionRejectedMessage", inbox }
      : { subjectKey: "inspectionResolvedWithdrawnSubject", messageKey: "inspectionResolvedWithdrawnMessage", inbox };
    await notifyUser(ka.userId, notif);
  }

  return { ok: true, data: { userId: ka.userId, notified } };
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
 *  „Siegel ≠ Code"-Regel für alle Aufrufer (Mail-Text, Formular-Hinweis).
 *
 *  `code: null` (Gerät ohne Code-Pflicht) → das Siegel ist das EINZIGE, was im Foto lesbar sein muss.
 *  Die Bedingung `sealCode !== code` trifft das von selbst: ohne Code kann nichts mit ihm
 *  zusammenfallen. Das Siegel bleibt also unabhängig vom Toggle bestehen — es beweist etwas anderes
 *  als der Code, nämlich dass die Schlüsselbox unberührt ist. */
export function requiredSealCode(code: string | null, sealCode: string | null): string | null {
  return sealCode && sealCode !== code ? sealCode : null;
}

/** Muss die Siegel-Nummer im Foto lesbar sein? Bündelt die Kette (Lock-Entry → deriveSealCode →
 *  requiredSealCode) für den Formular-Hinweis (Neuanlage + Edit) — eine Regel, eine Stelle. `latest`
 *  wird übergeben (kein interner Query), damit Aufrufer ihr bestehendes Fetch/Batch behalten.
 *
 *  Der Fall `code: null` verzweigt an `codeRequired`, und die Unterscheidung ist nötig:
 *  - Gerät OHNE Code-Pflicht: das Siegel ist das Einzige, was gelesen werden muss → true, sobald eines
 *    aktiv ist. (Früher gab ein `!!code`-Guard hier blind `false` zurück und widersprach damit dem
 *    Vertrag von `requiredSealCode`, das genau diesen Fall abdeckt.)
 *  - Gerät MIT Code-Pflicht, aber kein Code eingereicht (freiwillige Selbstkontrolle): es wird gar
 *    nichts geprüft, also auch kein Siegel verlangt → false. */
export function sealRequiredForCode(
  code: string | null | undefined,
  latest: { type: string; kontrollCode: string | null } | null,
  codeRequired = true,
): boolean {
  if (codeRequired && !code) return false;
  return requiredSealCode(code ?? null, deriveSealCode(latest)) !== null;
}

/** Frische 5-stellige Kontroll-Code-Nummer (10000–99999). */
export function generateKontrollCode(): string {
  return String(Math.floor(10000 + Math.random() * 90000));
}

/**
 * Verlangt eine Kontrolle mit DIESEM Gerät den handschriftlichen Code im Foto?
 *
 * Gefragt wird das Gerät am aktiven VERSCHLUSS-Eintrag — also das, das der Sub gerade trägt. Die
 * Antwort entscheidet zwei Dinge zugleich: ob die Anforderung überhaupt einen Code bekommt, und
 * (in der entries-Route) ob die Erfüllung über den Code-Vergleich oder über „die eine offene
 * Anforderung" läuft. Deshalb EINE Funktion und nicht zwei Abfragen.
 *
 * `true` als Vorgabe in allen Zweifelsfällen — kein Gerät am Verschluss (Alt-Eintrag, Admin-Pfad),
 * Gerät nicht mehr auffindbar: das ist das Bestandsverhalten, und eine fehlende Information ist kein
 * Grund, eine Kontrolle zu entschärfen.
 */
export async function inspectionCodeRequired(
  deviceId: string | null,
  client: PrismaTx | typeof prisma = prisma,
): Promise<boolean> {
  if (!deviceId) return true;
  const device = await client.device.findUnique({
    where: { id: deviceId },
    select: { requireInspectionCode: true },
  });
  return device?.requireInspectionCode ?? true;
}

/**
 * Was an einem eingereichten Kontroll-Foto überhaupt zu prüfen ist.
 *
 * Drei Fälle, und die Unterscheidung trägt drei Entscheidungen der entries-Route: den Startwert von
 * `verifikationStatus`, welche Prüfung nach dem Commit läuft, und ob die Anforderung über den
 * Code-Vergleich oder über „die eine offene" erfüllt wird. Als EIN Wert, damit die drei nicht
 * auseinanderlaufen können.
 *
 * - `code`: der Normalfall. Der Code muss im Foto lesbar sein, ein aktives Siegel zusätzlich.
 * - `seal`: das Gerät verlangt keinen Code, aber die Schlüsselbox ist versiegelt. Dann ist die
 *   Siegel-Nummer das Einzige, was gelesen werden muss — sie beweist etwas anderes als der Code
 *   (Box unberührt) und fällt mit ihm nicht weg.
 * - `none`: nichts zu lesen. `codeRequired` unterscheidet dabei zwei sehr verschiedene Gründe:
 *   eine freiwillige Selbstkontrolle ohne Code an einem Gerät, das einen verlangt (→ Status bleibt
 *   „unverifiziert", es hätte einer sein sollen), gegen ein Gerät ohne Code-Pflicht (→ `not_required`,
 *   es war nie einer vorgesehen).
 */
export type InspectionVerification =
  | { kind: "code"; code: string; sealCode: string | null }
  | { kind: "seal"; sealCode: string }
  | { kind: "none"; codeRequired: boolean };

/** Leitet aus Einreichung + Geräte-Regel + Siegel ab, was zu prüfen ist. Pure — der Aufrufer hat
 *  Lock-Eintrag und Geräte-Regel schon geladen. */
export function plannedVerification(opts: {
  /** Der vom Sub eingetippte Code (leer/null = keiner eingereicht). */
  submittedCode: string | null | undefined;
  /** Verlangt das getragene Gerät einen Code? Siehe {@link inspectionCodeRequired}. */
  codeRequired: boolean;
  /** Aktive Siegel-Nummer der Schlüsselbox, siehe {@link deriveSealCode}. */
  sealCode: string | null;
}): InspectionVerification {
  const { submittedCode, codeRequired, sealCode } = opts;
  if (codeRequired && submittedCode) {
    return { kind: "code", code: submittedCode, sealCode };
  }
  // Ohne Code-Pflicht zählt ein trotzdem mitgeschickter Code NICHT: die Anforderung hat keinen, es
  // gäbe nichts zu vergleichen. Bleibt das Siegel, falls eines aktiv ist.
  if (!codeRequired && sealCode) return { kind: "seal", sealCode };
  return { kind: "none", codeRequired };
}

/** Der `verifikationStatus`, mit dem der Eintrag ANGELEGT wird — `pending` nur, wenn danach wirklich
 *  eine Prüfung läuft, die ihn ersetzt. Gegenstück zur Auswertung nach dem Commit. */
export function initialVerificationStatus(v: InspectionVerification): "pending" | "not_required" | null {
  if (v.kind !== "none") return "pending";
  return v.codeRequired ? null : "not_required";
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
 * photo is current) and sets a deadline. An already running inspection is NOT replaced — the request
 * is rejected with INSPECTION_ALREADY_ACTIVE instead. If a seal is active, its number
 * is additionally required on the photo (verified at submission via deriveSealCode — the code
 * itself is always random). Sends e-mail + push immediately — or, with delayMinutes, schedules it
 * (wirksamAb): the request stays invisible to the user and the deadline starts at trigger; the
 * poller (kontrollePoller) sends the notification when due.
 * Shared by POST /api/admin/kontrolle and the MCP write tool. User must be currently locked.
 */
export async function requestKontrolle(
  params: RequestKontrolleParams,
): Promise<ServiceResult<{ code: string | null; deadline: string; scheduledFor: string | null }>> {
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

  let code: string | null;
  let sealCode: string | null;
  let controlId: string;
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

      // Frischer Zufallscode (Frische-Beweis) — die Siegel-Nummer wird bei der Verifikation
      // ZUSÄTZLICH geprüft, nicht mehr als Kontroll-Code wiederverwendet.
      //
      // Ausser das verschlossene Gerät verlangt keinen (`requireInspectionCode: false`): dann
      // entsteht die Anforderung OHNE Code. Das Gerät steht am Lock-Entry, ist hier also schon
      // geladen — der User muss für eine Kontrolle verschlossen sein (Guard oben), es gibt zum
      // Anforderungs-Zeitpunkt somit immer genau ein zuständiges Gerät. Ohne Gerät (Alt-Verschluss)
      // bleibt es beim Code: das ist das Bestandsverhalten, und ein fehlendes Gerät ist kein Grund,
      // eine Kontrolle zu entschärfen.
      const seal = deriveSealCode(latest);
      const c = (await inspectionCodeRequired(latest.deviceId, tx)) ? generateKontrollCode() : null;

      const ka = await tx.kontrollAnforderung.create({
        data: {
          userId,
          code: c,
          deadline,
          kommentar: kommentarTrimmed || null,
          wirksamAb,
          benachrichtigtAt, // sofort = jetzt benachrichtigt; geplant = Poller
        },
      });

      return { code: c, sealCode: seal, id: ka.id };
    });
    code = result.code;
    sealCode = result.sealCode;
    controlId = result.id;
  } catch (e: unknown) {
    const mapped = mapServiceError(e, ERRORS);
    if (mapped) return mapped;
    throw e;
  }

  // Sofort benachrichtigen; bei geplanter Auslösung übernimmt der Poller bei Fälligkeit.
  if (!wirksamAb) {
    await sendKontrolleNotification({ user, code, sealCode, kommentar: kommentarTrimmed, deadline, controlId });
  }

  return { ok: true, data: { code, deadline: deadline.toISOString(), scheduledFor: wirksamAb?.toISOString() ?? null } };
}

/**
 * Der Einleitungssatz der Kontroll-Mail — „innert der nächsten X".
 *
 * Rein und exportiert, damit die Einheiten-Wahl prüfbar ist. Vorher stand hier
 * `Math.max(1, Math.round(ms / 3600000))`: jede Frist unter einer halben Stunde wurde zu „1 Stunde",
 * und 90 Minuten zu „2 Stunden" (Issue #42). Seit Auto-Kontrollen ihre Frist zufällig aus
 * `AUTO_INSPECTION_DEADLINE_*_RANGE` (5–240 Minuten) ziehen, ist das der Normalfall und nicht der Randfall.
 *
 * Deshalb wird die Restzeit ZERLEGT statt auf eine Einheit gerundet: unter einer Stunde Minuten,
 * bei vollen Stunden nur Stunden, sonst beides. Aufrunden wäre die gefährliche Richtung — der Satz
 * verspräche mehr Zeit, als die Frist-Zeile darunter einräumt.
 *
 * `Number.isFinite` fängt eine kaputte Frist ab: ohne den Guard stünde „innert der nächsten NaN
 * Stunden" in der Mail.
 */
export function inspectionIntro(t: EmailTranslator, msLeft: number): string {
  const safeMs = Number.isFinite(msLeft) ? Math.max(0, msLeft) : 0;
  // Mindestens 1 Minute: „innert der nächsten 0 Minuten" wäre keine Aussage. Die Wahrheit steht
  // ohnehin in der Frist-Zeile darunter, die den absoluten Zeitpunkt nennt.
  const totalMinutes = Math.max(1, Math.round(safeMs / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return t("inspectionRequestedIntroMinutes", { minutes });
  if (minutes === 0) return t("inspectionRequestedIntro", { hours });
  return t("inspectionRequestedIntroHoursMinutes", { hours, minutes });
}

/** Der Mail-Körper der Kontroll-Anforderung. Eigene Funktion, weil sie der einzige Teil ist, der
 *  eine Adresse braucht — so bleibt der Versand-Ablauf daneben auf einer Ebene lesbar (Posteingang →
 *  Mail, falls Adresse → Push) statt vierzig eingerückte Zeilen dazwischen zu haben. */
async function sendInspectionMail(o: {
  to: string;
  t: EmailTranslator;
  locale: string;
  username: string;
  code: string | null;
  sealCode: string | null;
  sealRequired: boolean;
  kommentar: string | null;
  deadline: Date;
  deadlineStr: string;
  formPath: string;
}): Promise<void> {
  const { to, t, locale, username, code, sealCode, sealRequired, kommentar, deadline, deadlineStr, formPath } = o;
  const intro = inspectionIntro(t, deadline.getTime() - Date.now());
  const kommentarHtml = kommentar ? noticeBoxHtml(t("inspectionAdminLabel"), kommentar) : "";

  const link = `${appBaseUrl()}${formPath}`;
  const helpUrl = inspectionHelpUrl(locale);
  const codeLabel = sealCode && !sealRequired
    ? t("inspectionCodeLabelSeal")
    : t("inspectionCodeLabelControl");
  // Ohne Code die grosse Ziffern-Kachel weglassen und stattdessen sagen, dass keiner nötig ist —
  // sonst stünde in der Mail eine Überschrift ohne Inhalt.
  const codeBlockHtml = code
    ? `<p><strong>${codeLabel}</strong></p>
      <div style="font-size:48px;font-weight:bold;letter-spacing:12px;color:#f97316;text-align:center;padding:24px;background:#fff7ed;border-radius:12px;margin:16px 0">${code}</div>`
    : `<p>${escHtml(t("inspectionNoCodeHint"))}</p>`;
  const sealHintHtml = sealRequired
    ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px 18px;margin:16px 0"><p style="margin:0;font-size:14px;color:#1e3a8a"><strong>${t("inspectionSealHintLabel")}</strong> ${t("inspectionSealHintText")}</p></div>`
    : "";

  await sendMailSafe(
    to,
    `KG-Tracker – ${t("inspectionRequestedSubject")}`,
    dashboardEmailHtml(
      t("inspectionRequestedSubject"),
      `${emailGreeting(t, username)}
      <p>${escHtml(intro)}</p>
      ${kommentarHtml}
      ${codeBlockHtml}
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
}

/**
 * Sends the inspection e-mail (code + deadline + link) and a push to the user.
 * Reused by the immediate path in requestKontrolle and by the delayed-trigger poller.
 * `sealCode` = aktive Siegel-Nummer (oder null): weicht sie vom Code ab, verlangt die Mail
 * zusätzlich das Siegel auf dem Foto; ist sie gleich dem Code (Legacy-Zeilen von vor der
 * Zufallscode-Umstellung), bleibt das alte „Siegel-Nummer"-Label.
 * `code: null` → Mail und Push nennen keinen Code; verlangt bleibt das Foto (und, falls ein Siegel
 * aktiv ist, dessen Nummer).
 * Ohne hinterlegte Adresse entfällt nur die Mail — Posteingang und Push laufen unabhängig davon.
 * Push is fire-and-forget.
 */
export async function sendKontrolleNotification(opts: {
  user: { id: string; email: string | null; username: string; locale: string };
  /** null = diese Kontrolle verlangt keinen Code (Gerät mit `requireInspectionCode: false`). Mail und
   *  Push nennen dann keinen, und der Link führt ohne vorbelegtes Feld aufs Formular. */
  code: string | null;
  sealCode: string | null;
  kommentar: string | null;
  deadline: Date;
  controlId: string;
}): Promise<void> {
  const { user, code, sealCode, kommentar, deadline, controlId } = opts;

  // VOR dem E-Mail-Guard: der Posteingang ist der einzige Kanal, der auch ohne hinterlegte Adresse
  // trägt. Der Kommentar des Keyholders wird NICHT mitkopiert — die Nachricht zeigt auf die
  // Kontrolle und liest ihn beim Anzeigen frisch von dort.
  // Mail und Push gehen hier IMMER raus — anders als bei `notifyUser` greift der Schalter
  // "Mail und Push bei neuen Nachrichten" nicht: eine Anforderung mit Frist ist keine Nachricht,
  // die man still im Posteingang sammeln lassen darf.
  const badge = await recordMessageAndBadge({
    subjectUserId: user.id,
    bodyKey: "inspectionRequestedMessage",
    senderKind: "keyholder",
    ref: { type: "control", id: controlId },
    once: true,
  });

  const sealRequired = requiredSealCode(code, sealCode) !== null;

  const locale = toLocale(user.locale);
  const t = await emailT(locale);

  const formPath = inspectionHref(code, { kommentar });
  const deadlineStr = formatDateTime(deadline);

  // Nur die MAIL hängt an der Adresse — Posteingang (oben) und Push (unten) laufen unabhängig
  // davon, wie bei den Geschwister-Diensten (`verschlussAnforderungService`,
  // `orgasmusAnforderungService`). Vorher stieg die Funktion hier ganz aus: ein Sub ohne Adresse
  // erfuhr von der Kontrolle über gar keinen Kanal, versäumte sie — und die Eskalation (Mahnung,
  // Auto-Buchung als Öffnen) lief auf einer Anforderung, die ihn nie erreicht hatte. Über den
  // manuellen Pfad kann das nicht entstehen (`requestKontrolle` weist ohne Adresse ab), wohl aber
  // über die automatischen Kontrollen: die plant `autoKontrolleService` ohne solche Prüfung.
  if (user.email) {
    await sendInspectionMail({ to: user.email, t, locale, username: user.username, code, sealCode, sealRequired, kommentar, deadline, deadlineStr, formPath });
  }

  const pushParts = [
    ...(code ? [t("inspectionPushCode", { code })] : []),
    t("inspectionPushDeadline", { deadline: deadlineStr }),
  ];
  if (sealRequired) pushParts.push(t("inspectionPushSeal"));
  if (kommentar) pushParts.push(kommentar);
  firePush(
    user.id,
    t("inspectionPushTitle"),
    pushParts.join(" · "),
    formPath,
    badge,
  );
}
