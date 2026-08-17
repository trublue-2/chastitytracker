import { prisma } from "@/lib/prisma";
import { generateKontrollCode } from "@/lib/utils";
import { sendMailSafe, escHtml, appBaseUrl, noticeBoxHtml, dashboardEmailHtml } from "@/lib/mail";
import { formatDateTime, formatDate, formatTime } from "@/lib/utils";
import { firePush, hasPushTarget } from "@/lib/push";
import { markLastAction } from "@/lib/appMeta";
import { notifyUser, type NotifyContent } from "@/lib/notify";
import { actorColumn, recordMessageAndBadge, type MessageActor, type MessageRef } from "@/lib/messageService";
import { emailT, emailGreeting, type EmailTranslator } from "@/lib/emailI18n";
import { toLocale, inspectionHelpUrl, EMAIL_BUTTON_COLORS, INSPECTION_DEADLINE_DEFAULT_H, isValidInspectionCode } from "@/lib/constants";
import { computeDelayedTrigger, isHiddenFromSub } from "@/lib/delayedTrigger";
import { serviceErrors, mapServiceError, serviceFail, type ServiceResult } from "@/lib/serviceResult";
import { type PrismaTx, getOpenKontrollen } from "@/lib/queries";
import { resolveInspectionTarget, inspectionPreconditionProblem, inspectionTargetLabel } from "@/lib/inspectionTarget";
import { inspectionHref } from "@/lib/entryFormRoute";

export type KontrolleAction = "withdraw" | "manuallyVerify" | "reject";

/** Der resultierende Entry.verifikationStatus einer Verify/Reject-Aktion — EINE Stelle, geteilt vom
 *  echten Commit (unten) und vom MCP resolve_inspection dryRun-Preview (B-05), damit beide nie
 *  auseinanderlaufen können. */
export function verifikationStatusFor(action: "manuallyVerify" | "reject"): "manual" | "rejected" {
  return action === "manuallyVerify" ? "manual" : "rejected";
}

/**
 * Das Urteil über ein eingereichtes Kontroll-Foto: Status am EINTRAG + Meldung an den Sub.
 *
 * Die eine Stelle für beide Adressierungen — über die Anforderung (`resolveKontrolle`) und über den
 * Eintrag (`resolveInspectionEntry`). Der `ref` ist optional, weil eine freiwillige Selbstkontrolle
 * kein Bezugsobjekt hat: es gibt keine Anforderung, auf die die Nachricht zeigen könnte.
 */
async function applyInspectionVerdict(
  entryId: string,
  userId: string,
  action: "manuallyVerify" | "reject",
  actor: MessageActor,
  ref?: MessageRef,
): Promise<void> {
  await prisma.entry.update({ where: { id: entryId }, data: { verifikationStatus: verifikationStatusFor(action) } });
  markLastAction();
  const notif: NotifyContent =
    action === "manuallyVerify"
      ? { subjectKey: "inspectionConfirmedSubject", messageKey: "inspectionConfirmedMessage" }
      : { subjectKey: "inspectionRejectedSubject", messageKey: "inspectionRejectedMessage" };
  await notifyUser(userId, { ...notif, inbox: { ref, actor } });
}

/**
 * Resolves an inspection by id: withdraw it, or manually verify / reject its submitted photo.
 * Shared by PATCH /api/admin/kontrollen/[id] and the MCP resolve_inspection tool.
 *
 * `actor` ist WER handelt (Sitzung bzw. {@link AI_AUTHOR}) — jede Meldung dieser Funktion ist die
 * Folge eines Knopfdrucks und nennt deshalb genau diese Person, statt sie beim Anzeigen zu raten.
 */
export async function resolveKontrolle(id: string, action: KontrolleAction, actor: MessageActor): Promise<ServiceResult<{ userId: string; notified: boolean }>> {
  const ka = await prisma.kontrollAnforderung.findUnique({ where: { id } });
  if (!ka) return serviceFail(404, "INSPECTION_NOT_FOUND");

  if (action === "manuallyVerify" || action === "reject") {
    if (!ka.entryId) return serviceFail(400, "INSPECTION_NO_SUBMISSION");
    // Immer gemeldet: ein Urteil setzt ein eingereichtes Foto voraus, die Kontrolle hat also
    // laengst ausgeloest und ist dem Sub bekannt.
    await applyInspectionVerdict(ka.entryId, ka.userId, action, actor, { type: "control", id: ka.id });
    return { ok: true, data: { userId: ka.userId, notified: true } };
  }
  if (action !== "withdraw") return serviceFail(400, "UNKNOWN_ACTION");

  if (ka.withdrawnAt) return serviceFail(400, "INSPECTION_ALREADY_WITHDRAWN");
  await prisma.kontrollAnforderung.update({ where: { id }, data: { withdrawnAt: new Date() } });
  markLastAction();

  // Eine noch nicht ausgeloeste Kontrolle ist fuer den Sub unsichtbar (`wirksamAb` in der Zukunft) —
  // ihren Rueckzug zu melden verriete sie. Bei Auto-Kontrollen waere es der Zufallsplan, dessen
  // Ueberraschung der Sinn ist. Nur der Rueckzug kann das treffen, siehe oben.
  const notified = !isHiddenFromSub(ka);
  if (notified) {
    await notifyUser(ka.userId, {
      subjectKey: "inspectionResolvedWithdrawnSubject",
      messageKey: "inspectionResolvedWithdrawnMessage",
      inbox: { ref: { type: "control", id: ka.id }, actor },
    });
  }

  return { ok: true, data: { userId: ka.userId, notified } };
}

/**
 * Dasselbe Urteil, adressiert über den EINTRAG statt über eine Anforderung.
 *
 * Der Weg für die freiwillige Selbstkontrolle: zu ihr existiert keine `KontrollAnforderung`, sie ist
 * über `resolveKontrolle` also gar nicht erreichbar (Vorfall 07.08.2026 — die Aktion lief dort ins
 * Leere). Gibt es zum Eintrag doch eine Anforderung, bekommt die Meldung deren Bezug: die
 * Adressierung darf am Ergebnis nichts ändern.
 */
export async function resolveInspectionEntry(
  entryId: string,
  action: KontrolleAction,
  actor: MessageActor,
): Promise<ServiceResult<{ userId: string; notified: boolean }>> {
  // `withdraw` gehört an die Anforderung — an einem Eintrag gibt es nichts zurückzuziehen.
  if (action !== "manuallyVerify" && action !== "reject") return serviceFail(400, "UNKNOWN_ACTION");

  const entry = await prisma.entry.findUnique({ where: { id: entryId }, select: { userId: true, type: true } });
  // Ein Urteil gibt es nur über eine Kontrolle — ein Verschluss-/Öffnen-Eintrag ist keine.
  if (!entry || entry.type !== "PRUEFUNG") return serviceFail(404, "INSPECTION_NOT_FOUND");

  const ka = await prisma.kontrollAnforderung.findFirst({ where: { entryId }, select: { id: true } });
  await applyInspectionVerdict(entryId, entry.userId, action, actor, ka ? { type: "control", id: ka.id } : undefined);
  // Gleiche Rückgabeform wie `resolveKontrolle` — dieselbe Operation, nur anders adressiert.
  // `notified` ist beim Urteil immer wahr (das Foto liegt vor, die Kontrolle ist dem Sub bekannt).
  return { ok: true, data: { userId: entry.userId, notified: true } };
}

/** Gültige Siegel-Nummer aus dem letzten Eintrag (nur bei aktivem VERSCHLUSS), sonst null.
 *  Single source für „ist dieser Code eine Siegel-Nummer" — genutzt beim Anlegen und im Poller.
 *  Die FORM ist dieselbe wie beim Kontroll-Code (dieselbe Spalte, dieselbe Länge), deshalb dieselbe
 *  Prüfung statt einer zweiten Abschrift derselben Ziffernspanne. */
export function deriveSealCode(latest: { type: string; kontrollCode: string | null } | null): string | null {
  return latest?.type === "VERSCHLUSS" && latest.kontrollCode && isValidInspectionCode(latest.kontrollCode)
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

/** True, wenn für DIESES ZIEL eine LAUFENDE Kontrolle existiert — angelegt, nicht erfüllt, nicht
 *  zurückgezogen, bereits sichtbar (sofort oder wirksamAb erreicht) UND noch innerhalb der Frist
 *  (deadline >= now).
 *
 *  Seit v5.0.1 zählt das ZIEL mit (`categoryId`, null = KG): eine KG-Kontrolle und eine
 *  Plug-Kontrolle dürfen nebeneinander laufen — sie verlangen verschiedene Nachweise und
 *  behindern sich nicht. Zwei auf dasselbe Ziel bleiben ausgeschlossen: dort wäre nicht
 *  entscheidbar, welche ein Foto beantwortet (siehe die Zuordnung in der entries-Route).
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
  opts: { categoryId: string | null; excludeId?: string; tx?: PrismaTx },
): Promise<boolean> {
  const client = opts.tx ?? prisma;
  const existing = await client.kontrollAnforderung.findFirst({
    where: {
      userId, entryId: null, withdrawnAt: null,
      categoryId: opts.categoryId, // null = KG; das Ziel gehört zum Guard, nicht nur der User
      OR: [{ wirksamAb: null }, { wirksamAb: { lte: now } }], // sichtbar
      deadline: { gte: now },                                 // noch innerhalb der Frist (nicht überfällig)
      ...(opts.excludeId ? { id: { not: opts.excludeId } } : {}),
    },
    select: { id: true },
  });
  return existing !== null;
}

export interface RequestKontrolleParams {
  userId: string;
  kommentar?: string | null;
  /** Deadline in hours (default 1). Bruchteile sind erlaubt — das Formular schickt eine in
   *  Minuten gewählte Frist als Stunden-Bruch (5 min = 1/12). */
  deadlineH?: number | null;
  /** Verzögerte Auslösung in Minuten (>0). Fehlt/0 = sofort. Die 5–65-/Random-Policy
   *  liegt beim Aufrufer (MCP) — der Service verzögert nur mechanisch. */
  delayMinutes?: number | null;
  /** ZIEL der Kontrolle (v5.0.1). Beides weggelassen = KG, das Bestandsverhalten.
   *  Siehe {@link resolveInspectionTarget}. */
  categoryId?: string | null;
  deviceId?: string | null;
}

/**
 * Requests an inspection (KontrollAnforderung): generates a fresh random 5-digit code (proof the
 * photo is current) and sets a deadline. An already running inspection is NOT replaced — the request
 * is rejected with INSPECTION_ALREADY_ACTIVE instead. If a seal is active, its number
 * is additionally required on the photo (verified at submission via deriveSealCode — the code
 * itself is always random). Sends e-mail + push immediately — or, with delayMinutes, schedules it
 * (wirksamAb): the request stays invisible to the user and the deadline starts at trigger; the
 * poller (kontrollePoller) sends the notification when due.
 * Shared by POST /api/admin/kontrolle and the MCP write tool.
 *
 * Das ZIEL bestimmt, was aktiv sein muss: beim KG (Vorgabe) ein laufender VERSCHLUSS, bei einer
 * Trage-Kategorie eine laufende WEAR-Session. Eine Kontrolle auf etwas, das der Sub gerade gar
 * nicht trägt, wäre nicht erfüllbar — sie wird abgelehnt statt angelegt.
 *
 * `actor` ist WER stellt (Sitzung bzw. {@link AI_AUTHOR}). Ein eigenes ARGUMENT und bewusst kein
 * Feld in `params`: die Route reicht den rohen Request-Body als `params` durch, und in einem Bag,
 * den der Aufrufer füllt, könnte er den Absender der Nachricht setzen, die sein Sub bekommt.
 * Daneben stehend ist das strukturell unmöglich — dieselbe Form wie bei allen übrigen Diensten.
 * Der Wert wandert in `KontrollAnforderung.createdBy` und von dort an die Meldung, auch wenn der
 * Poller sie erst Stunden später zustellt (siehe Schema).
 */
export async function requestKontrolle(
  params: RequestKontrolleParams,
  actor: MessageActor,
): Promise<ServiceResult<{ code: string | null; deadline: string; scheduledFor: string | null }>> {
  const { userId, kommentar, deadlineH, delayMinutes } = params;
  if (!userId) return serviceFail(400, "USER_ID_REQUIRED");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return serviceFail(404, "USER_NOT_FOUND");
  if (!user.email) return serviceFail(400, "USER_NO_EMAIL");

  const kommentarTrimmed = typeof kommentar === "string" ? kommentar.trim() : null;
  const hours = typeof deadlineH === "number" && deadlineH > 0 ? deadlineH : INSPECTION_DEADLINE_DEFAULT_H;
  const now = new Date();
  const { wirksamAb, benachrichtigtAt } = computeDelayedTrigger(now, { delayMinutes });
  // Frist läuft ab Auslösung (bei sofort = jetzt, bei geplant = wirksamAb).
  const deadline = new Date((wirksamAb ?? now).getTime() + hours * 60 * 60 * 1000);

  let code: string | null;
  let sealCode: string | null;
  let controlId: string;
  let targetInfo: { categoryId: string | null; label: string | null };
  // Wurf- und Fang-Seite hängen an derselben Tabelle: `fail()` akzeptiert nur Codes, die unten
  // auch gemappt werden — ein Tippfehler ist ein Compile-Fehler, kein stiller 500.
  // Die Schlüssel SIND die Fehlercodes, die `inspectionPreconditionProblem` liefert — so wandert
  // sein Ergebnis ohne Übersetzungstabelle in `fail()`, und ein neuer Code dort ist hier ein
  // Compile-Fehler statt eines stillen 500.
  const { table: ERRORS, fail } = serviceErrors({
    USER_NOT_LOCKED: { status: 400, error: "USER_NOT_LOCKED" },
    USER_NOT_WEARING: { status: 400, error: "USER_NOT_WEARING" },
    INSPECTION_DEVICE_NOT_ACTIVE: { status: 400, error: "INSPECTION_DEVICE_NOT_ACTIVE" },
    INSPECTION_TARGET_INVALID: { status: 400, error: "INSPECTION_TARGET_INVALID" },
    INSPECTION_ALREADY_ACTIVE: { status: 409, error: "INSPECTION_ALREADY_ACTIVE" },
  });
  try {
    const result = await prisma.$transaction(async (tx) => {
      const resolved = await resolveInspectionTarget(userId, params, tx);
      if (!resolved.ok) throw fail("INSPECTION_TARGET_INVALID");
      const target = resolved.target;

      // Alle weiteren Vorbedingungen als EINE Entscheidung — dieselbe, die die MCP-dryRun-Vorschau
      // zeigt. Der Überschneidungs-Schutz darin lehnt ab, statt eine bereits laufende Kontrolle
      // stillschweigend zu ersetzen (egal ob von Keyholder, KI oder Automatik), und gilt PRO ZIEL.
      // Er läuft in derselben Transaktion wie das Anlegen; das deckt den Alltag ab. Es ist ein
      // Best-Effort-Read-then-Write, KEIN harter Ausschluss: bei exakt gleichzeitigen Anfragen
      // können unter SQLite-Snapshot-Isolation beide "keine laufende" lesen und je eine Zeile
      // anlegen. Bei zwei Schreibern (Keyholder + KI) ist das vernachlässigbar, und die Folge wäre
      // nur zwei transiente Zeilen, von denen eine ohnehin abläuft — ein DB-Constraint kann
      // "aktiv innerhalb der Frist" (now-abhängig) nicht ausdrücken, daher bewusst kein Index.
      //
      // Die Guard-Abfrage läuft nur, wenn das Ziel überhaupt läuft: bei totem Ziel steht das
      // Ergebnis schon fest.
      const problem = inspectionPreconditionProblem(
        target,
        target.active && await hasActiveKontrolle(userId, now, { categoryId: target.categoryId, tx }),
      );
      if (problem) throw fail(problem);

      // Frischer Zufallscode (Frische-Beweis) — die Siegel-Nummer wird bei der Verifikation
      // ZUSÄTZLICH geprüft, nicht mehr als Kontroll-Code wiederverwendet.
      //
      // Ausser das getragene Gerät verlangt keinen (`requireInspectionCode: false`): dann entsteht
      // die Anforderung OHNE Code. Welches Gerät zuständig ist, hat die Ziel-Auflösung schon
      // beantwortet — das Ziel läuft (Guard oben), es gibt also genau eines. Ohne Gerät
      // (Alt-Verschluss) bleibt es beim Code: das ist das Bestandsverhalten, und eine fehlende
      // Information ist kein Grund, eine Kontrolle zu entschärfen.
      //
      // Die Siegel-Nummer gibt es nur beim KG — sie beweist, dass die Schlüsselbox unberührt ist,
      // und zu einer Trage-Kontrolle gehört keine Box (`lockEntry` ist dort null).
      const seal = deriveSealCode(target.lockEntry);
      const c = (await inspectionCodeRequired(target.activeDeviceId, tx)) ? generateKontrollCode() : null;

      const ka = await tx.kontrollAnforderung.create({
        data: {
          userId,
          code: c,
          categoryId: target.categoryId,
          deviceId: target.deviceId,
          deadline,
          kommentar: kommentarTrimmed || null,
          createdBy: actorColumn(actor),
          wirksamAb,
          benachrichtigtAt, // sofort = jetzt benachrichtigt; geplant = Poller
        },
      });

      return {
        code: c, sealCode: seal, id: ka.id,
        target: { categoryId: target.categoryId, label: inspectionTargetLabel(target) },
      };
    });
    code = result.code;
    sealCode = result.sealCode;
    controlId = result.id;
    targetInfo = result.target;
  } catch (e: unknown) {
    const mapped = mapServiceError(e, ERRORS);
    if (mapped) return mapped;
    throw e;
  }

  // Sofort benachrichtigen; bei geplanter Auslösung übernimmt der Poller bei Fälligkeit.
  if (!wirksamAb) {
    await sendKontrolleNotification({ user, code, sealCode, kommentar: kommentarTrimmed, deadline, controlId, target: targetInfo, actor });
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
  targetLabel: string | null;
}): Promise<void> {
  const { to, t, locale, username, code, sealCode, sealRequired, kommentar, deadline, deadlineStr, formPath, targetLabel } = o;
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
      ${targetLabel ? `<p><strong>${t("inspectionTargetLabel")}</strong> ${escHtml(targetLabel)}</p>` : ""}
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
 * Titel + Text der Kontroll-Push. Ausgelagert und exportiert, weil hier zwei Zusicherungen hängen,
 * die beim nächsten Umformulieren still brechen — die Push wird nämlich ABFOTOGRAFIERT (Code auf
 * der Smartwatch statt auf einem Zettel), und die Erkennung muss die Ziffern im Bild finden:
 *
 * 1. Der CODE steht im TITEL, nicht im Text. Titel ist die grösste Schrift, die der Kanal hergibt —
 *    Web-Push wie nativ kennen nur `title` + `body` und keinerlei Formatierung (`sw.js`,
 *    `push.ts`). Im `body` stand er in der kleinsten Schrift (Rückmeldung 08/2026: „versteckt").
 * 2. Im Text steht so WENIG wie möglich, was nach einem Code aussieht: die Frist am selben Tag nur
 *    als Uhrzeit. Jede weitere Zahl im Bild ist eine, die die Erkennung für den Code halten kann.
 *    Die MAIL behält die volle Frist-Angabe — sie wird nicht fotografiert.
 */
export function buildInspectionPush(opts: {
  t: EmailTranslator;
  code: string | null;
  targetLabel: string | null;
  deadline: Date;
  /** Volle Frist-Angabe (wie in der Mail) — greift, wenn die Frist nicht mehr heute liegt. */
  deadlineStr: string;
  sealRequired: boolean;
  kommentar: string | null;
  /** Nur für Tests: der Stichtag des „liegt die Frist heute?"-Vergleichs. */
  now?: Date;
}): { title: string; body: string } {
  const { t, code, targetLabel, deadline, deadlineStr, sealRequired, kommentar, now = new Date() } = opts;
  const deadlineShort = formatDate(deadline) === formatDate(now) ? formatTime(deadline) : deadlineStr;
  const parts = [
    ...(targetLabel ? [targetLabel] : []),
    t("inspectionPushDeadline", { deadline: deadlineShort }),
  ];
  if (sealRequired) parts.push(t("inspectionPushSeal"));
  if (kommentar) parts.push(kommentar);
  return {
    // Ohne Code (Gerät ohne Code-Pflicht) bleibt der bisherige Titel — „Kontrolle · " mit nichts
    // dahinter wäre eine Lücke, wo der Nutzer eine Zahl erwartet.
    title: code ? t("inspectionPushTitleCode", { code }) : t("inspectionPushTitle"),
    body: parts.join(" · "),
  };
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
  /** Das ZIEL der Kontrolle: `label` benennt es in Mail/Push (null beim KG — dort ist „die
   *  Kontrolle" ohne Zusatz gemeint, ein Label wäre in jeder Mail Rauschen), `categoryId` führt den
   *  Link aufs richtige Formular. */
  target?: { categoryId: string | null; label: string | null };
  /** WER die Kontrolle gestellt hat. Auf dem Sofort-Pfad die Sitzung des Handelnden, beim Poller
   *  `KontrollAnforderung.createdBy` — dieselbe Person, nur später zugestellt. Pflichtfeld: leer
   *  bei einer Auto-Kontrolle (die stellt niemand) ist eine ENTSCHEIDUNG, kein Versehen, und die
   *  soll ein neuer Aufrufer treffen müssen statt still in die System-Zeile zu rutschen. */
  actor: MessageActor;
}): Promise<void> {
  const { user, code, sealCode, kommentar, deadline, controlId, target, actor } = opts;
  const targetLabel = target?.label ?? null;

  // VOR dem E-Mail-Guard: der Posteingang ist der einzige Kanal, der auch ohne hinterlegte Adresse
  // trägt. Der Kommentar des Keyholders wird NICHT mitkopiert — die Nachricht zeigt auf die
  // Kontrolle und liest ihn beim Anzeigen frisch von dort.
  // Mail und Push gehen hier IMMER raus — anders als bei `notifyUser` greift der Schalter
  // "Mail und Push bei neuen Nachrichten" nicht: eine Anforderung mit Frist ist keine Nachricht,
  // die man still im Posteingang sammeln lassen darf.
  const badge = await recordMessageAndBadge({
    subjectUserId: user.id,
    bodyKey: "inspectionRequestedMessage",
    actor,
    ref: { type: "control", id: controlId },
    once: true,
  });

  const sealRequired = requiredSealCode(code, sealCode) !== null;

  const locale = toLocale(user.locale);
  const t = await emailT(locale);

  const formPath = inspectionHref(code, { kommentar, categoryId: target?.categoryId ?? null });
  const deadlineStr = formatDateTime(deadline);

  // Nur die MAIL hängt an der Adresse — Posteingang (oben) und Push (unten) laufen unabhängig
  // davon, wie bei den Geschwister-Diensten (`verschlussAnforderungService`,
  // `orgasmusAnforderungService`). Vorher stieg die Funktion hier ganz aus: ein Sub ohne Adresse
  // erfuhr von der Kontrolle über gar keinen Kanal, versäumte sie — und die Eskalation (Mahnung,
  // Auto-Buchung als Öffnen) lief auf einer Anforderung, die ihn nie erreicht hatte. Über den
  // manuellen Pfad kann das nicht entstehen (`requestKontrolle` weist ohne Adresse ab), wohl aber
  // über die automatischen Kontrollen: die plant `autoKontrolleService` ohne solche Prüfung.
  if (user.email) {
    await sendInspectionMail({ to: user.email, t, locale, username: user.username, code, sealCode, sealRequired, kommentar, deadline, deadlineStr, formPath, targetLabel });
  }

  const push = buildInspectionPush({ t, code, targetLabel, deadline, deadlineStr, sealRequired, kommentar });
  firePush(user.id, push.title, push.body, formPath, badge);
}

/**
 * Titel + Text der WIEDERHOLUNG auf Knopfdruck — die nackte Fassung von {@link buildInspectionPush}:
 * im Titel der Code, im Text die Uhrzeit des Versands.
 *
 * Das ist kein verkürzter Text, das ist der ganze Zweck. Die Meldung wird ABFOTOGRAFIERT (Code auf
 * der Smartwatch, weil das Handy die Kamera ist und seinen eigenen Bildschirm nicht ablichten kann),
 * und was im Bild landet, geht durch die Code-Erkennung. Die ANKÜNDIGUNG braucht ihren Kontext
 * (Frist, Siegel-Hinweis, Kommentar) und behält ihn; die Wiederholung braucht ihn nicht: sie kommt
 * auf Knopfdruck, der Sub weiss in der Sekunde, worum es geht.
 *
 * Die UHRZEIT ist die eine Ausnahme, und sie steht hier, weil sie im Bild ARBEITET: das Foto belegt
 * mit ihr, dass es jetzt entstanden ist und nicht ein älteres ist, das denselben Code zeigt. Ein
 * leerer Text tat das Gegenteil — die Uhr füllte den leeren Bereich mit dem Titel, und im Foto stand
 * der Code zweimal statt Code und Zeit.
 *
 * Dass sie der Code-Erkennung nicht in die Quere kommt, hängt an ihrer FORM: „14:32" sind vier
 * Ziffern in zwei Gruppen, der Prompt verlangt genau {@link isValidInspectionCode}-viele
 * ZUSAMMENHÄNGENDE Ziffern und nennt den gesuchten Code beim Namen. Eine Zeit ohne Trenner oder mit
 * Sekunden wäre eine echte Verwechslung.
 */
export function buildInspectionCodePush(opts: {
  code: string;
  /** Nur setzen, wenn mehr als eine Kontrolle offen ist (das entscheidet der Aufrufer, er kennt die
   *  anderen) — dann wären zwei blosse Ziffernfolgen nicht auseinanderzuhalten. Es steht im TEXT,
   *  nie im Titel: der bleibt rein der Code. */
  targetLabel: string | null;
  /** Zeitzone des SUBS: eine Uhrzeit, die neben seiner Armbanduhr im Foto steht, muss dieselbe sein,
   *  die seine Armbanduhr zeigt. Ohne Default — ein `= APP_TZ` träfe für jede Sub ausserhalb
   *  Europe/Zurich still daneben, und zwar genau dort, wo das Bild etwas belegen soll. */
  tz: string;
  /** Nur für Tests: der Zeitpunkt, den der Text nennt. */
  now?: Date;
}): { title: string; body: string } {
  const { code, targetLabel, tz, now = new Date() } = opts;
  // Die Locale ist hier GARANTIE, nicht Nachlässigkeit: sie erzwingt die 24-Stunden-Form. Die des
  // Subs gilt bewusst NICHT — mit „en" stünde „02:32 PM" im Bild. Und der Test dazu kennt keine
  // Locale, bliebe also grün: wer das hier locale-abhängig macht, hebelt den Absatz oben still aus.
  const time = formatTime(now, "de-CH", tz);
  return { title: code, body: targetLabel ? `${targetLabel} · ${time}` : time };
}

/**
 * Schickt den Code einer laufenden Kontroll-Anforderung NOCH EINMAL als Push — angestossen vom Sub
 * selbst, aus dem Erfassungs-Formular.
 *
 * Warum es das gibt: die Smartwatch ist der zweite Bildschirm, auf dem der Code beim Fotografieren
 * steht — und sie löscht eine Meldung, sobald sie gesichtet wurde, spätestens aber wenn die nächste
 * Push sie verdrängt (Sperrzeit, Nachricht, Aufgabe). Danach war der Code für den Sub weg, obwohl
 * die Kontrolle noch offen ist. Das Verdrängen selbst kann der Server nicht verhindern — die
 * Wiederholung auf Knopfdruck ist die Antwort darauf.
 *
 * BEWUSST kein neues Ereignis: keine Mail, keine Posteingangs-Zeile, kein Badge, kein Zeitstempel an
 * der Anforderung. Es wird nichts angefordert und nichts erfüllt — derselbe Code erscheint nur noch
 * einmal auf dem Bildschirm. Eine Zeile je Knopfdruck wäre ein Protokoll des Ablesens, kein Ereignis.
 * Aus demselben Grund geht `firePush` ohne `badge`: ein Wert dort erfände einen Zähler, eine feste 0
 * löschte den bestehenden (siehe `sendPushToUser`).
 */
export async function resendInspectionCode(
  userId: string,
  controlId: string,
  /** Zeitzone des Subs, siehe {@link buildInspectionCodePush}. */
  tz: string,
): Promise<ServiceResult<null>> {
  // EINE Abfrage für beide Fragen: welche Kontrolle ist gemeint, und läuft noch eine zweite. Die
  // Auswahl ist dieselbe, die auch das Dashboard-Banner zeigt (offen, nicht zurückgezogen, bereits
  // wirksam) — eine zeitversetzt geplante ist für den Sub noch unsichtbar, und ihr Code darf ihn
  // auch über diesen Weg nicht früher erreichen. Die Menge ist klein (je Ziel höchstens eine), das
  // Suchen darin also billiger als ein zweiter Weg zur Datenbank.
  const open = await getOpenKontrollen(userId);
  const ka = open.find((k) => k.id === controlId);
  if (!ka) return serviceFail(404, "INSPECTION_NOT_FOUND");
  if (!ka.code) return serviceFail(400, "INSPECTION_NO_CODE");

  // Ohne angemeldetes Gerät ginge die Push ins Leere und der Knopf meldete trotzdem Erfolg. Der
  // Sub soll erfahren, dass er Push erst einschalten muss, statt auf eine Uhr zu warten, die nichts
  // bekommt — `firePush` ist fire-and-forget und könnte das nie beantworten.
  if (!await hasPushTarget(userId)) return serviceFail(400, "PUSH_NOT_ENABLED");

  // Läuft noch eine zweite Kontrolle (KG und Trage-Ziel parallel, seit v5.0.1), bekommt die
  // Wiederholung das Ziel als Untertitel — sonst stünden zwei blosse Ziffernfolgen nebeneinander.
  const push = buildInspectionCodePush({
    code: ka.code,
    targetLabel: open.length > 1 ? inspectionTargetLabel(ka) : null,
    tz,
  });
  // Ziel des Antippens ist dasselbe Formular wie bei der Ankündigung — der Sub steht zwar meist
  // schon darauf, aber eine Meldung, die nirgendwohin führt, ist auf der Uhr eine Sackgasse.
  firePush(userId, push.title, push.body, inspectionHref(ka.code, { kommentar: ka.kommentar, categoryId: ka.categoryId }));
  return { ok: true, data: null };
}

/**
 * Dasselbe für den Code einer SELBSTKONTROLLE — die andere Hälfte desselben Bedürfnisses.
 *
 * Warum es einen zweiten Weg braucht: eine freiwillige Kontrolle hat keine Anforderung. Ihr Code
 * wird beim Öffnen des Formulars gewürfelt (`generateKontrollCode` in der Seite) und steht in KEINER
 * Zeile — es gibt nichts, was der Server nachschlagen könnte. Der Code kommt deshalb vom Aufrufer.
 *
 * Was das unbedenklich macht, ist die Richtung: die Meldung geht ausschliesslich an den Absender
 * selbst, sie enthält nur Ziffern, und sie hinterlässt nichts (kein Ereignis, keine Zeile, kein
 * Badge) — dieselbe Zusage wie {@link resendInspectionCode}. Ein Fremdziel gibt es gar nicht: der
 * Empfänger IST die Sitzung.
 *
 * Was hier trotzdem geprüft wird, ist die FORM: Ziffern in der erlaubten Länge
 * ({@link isValidInspectionCode}). Nicht wegen der Push — sondern damit dieser Weg nicht zur
 * allgemeinen „schick mir einen Text aufs Handy"-Route wird, deren Titel jemand mit Freitext füllt.
 *
 * Kein Abgleich gegen eine laufende Anforderung, und das ist Absicht: hätte der Sub eine, ginge der
 * Knopf über die id-Route, wo der Server für den Code bürgt. Hier gibt es keinen richtigen Code —
 * nur den, den der Sub gleich ins Bild schreibt.
 */
export async function resendOwnInspectionCode(
  userId: string,
  code: string,
  /** Zeitzone des Subs, siehe {@link buildInspectionCodePush}. Steht VOR `categoryId`, damit dessen
   *  Default erhalten bleibt: ein Pflichtfeld hinter einem optionalen zwingt jeden Aufrufer, das
   *  optionale von Hand auszuschreiben. */
  tz: string,
  /** Das ZIEL der Kontrolle (Trage-Kategorie), `null` = KG. Muss mitkommen: bei einer Anforderung
   *  steht es in der Zeile, hier gibt es keine. Ohne das Ziel führt die Meldung beim Antippen aufs
   *  KG-Formular, und der Sub reicht ein Foto ein, das seine Kontrolle gar nicht beantwortet
   *  (dieselbe Falle, die `inspectionHref` beschreibt). */
  categoryId: string | null = null,
): Promise<ServiceResult<null>> {
  if (!isValidInspectionCode(code)) return serviceFail(400, "INSPECTION_CODE_INVALID");

  // Wie oben: ohne angemeldetes Gerät ginge die Push ins Leere und der Knopf meldete Erfolg.
  if (!await hasPushTarget(userId)) return serviceFail(400, "PUSH_NOT_ENABLED");

  // Ohne Ziel-Untertitel: eine Selbstkontrolle steht für sich, und der Text trägt bereits die
  // Uhrzeit. Das Ziel gehört trotzdem in den LINK: es steuert, wohin das Antippen führt, nicht was
  // im Bild landet.
  const push = buildInspectionCodePush({ code, targetLabel: null, tz });
  firePush(userId, push.title, push.body, inspectionHref(code, { categoryId }));
  return { ok: true, data: null };
}
