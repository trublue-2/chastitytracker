import { prisma } from "@/lib/prisma";
import { mapServiceError, serviceErrors, serviceFail, type ServiceResult } from "@/lib/serviceResult";
import { isValidImageUrl } from "@/lib/constants";
import { deleteUploadedFiles } from "@/lib/imageUtils";
import { APP_TZ } from "@/lib/utils";
import { inWeighingWindow } from "@/lib/weightWindows";
import {
  effectiveTarget, targetEventToAnnounce, weightDayKey, weightForDisplay, weightProblem,
  type UnitSystem, type WeightTarget,
} from "@/lib/weight";
import { notifyControllers } from "@/lib/notify";
import { getControllersOfUser } from "@/lib/keyholder";
import { applyWeightRelease } from "@/lib/weightReleaseService";

/**
 * Das Erfassen einer Messung — der eine Schreibweg, den Formular, Keyholder-Aktion und (später) der
 * MCP teilen.
 *
 * Warum ein Dienst und nicht Logik in der Route: der Tagesschlüssel, das Fenster-Urteil und die
 * Foto-Pflicht sind Regeln des Features, nicht der HTTP-Schicht. Stünden sie in der Sub-Route, hätte
 * die Keyholder-Route sie ein zweites Mal — und die erste Abweichung wäre eine Messung, die beim
 * einen Weg im Fenster liegt und beim anderen nicht.
 */

/**
 * Die Spalten, die eine Gewichts-Sicht braucht — eine Konstante für JEDEN Leser (Statistik,
 * Formular, Grenz-Meldung, MCP), damit Abfrage und Zeilentyp nicht getrennt voneinander veralten.
 *
 * Bewusst etwas mehr, als der einzelne Aufrufer braucht: es sind ein paar kleine Spalten auf einer
 * Primärschlüssel-Abfrage. Fünf leicht verschiedene Selects nebeneinander kosten mehr — sie laufen
 * beim ersten neuen Feld auseinander, und dann fehlt es genau an einer Stelle.
 */
export const WEIGHT_USER_SELECT = {
  weightTrackingEnabled: true,
  timezone: true,
  heightCm: true,
  unitSystem: true,
  username: true,
  weighingWindows: true,
  targetWeightKg: true,
  targetWeightSetAt: true,
  targetWeightKeyholderKg: true,
  targetWeightKeyholderSetAt: true,
} as const;

/**
 * Wer die Zeile anlegt. Bestimmt die Foto-Pflicht: nur der Träger steht vor der Waage.
 *
 * `health` ist die Waage selbst, über einen Kurzbefehl aus Apple Health (docs/gewicht-health.md).
 * Ohne Foto — der Wert kommt von dem Gerät, das das Foto belegen sollte. Dafür steht die Quelle in
 * jeder Anzeige: die Keyholderin sieht, welche Werte einen Beleg tragen und welche nicht, statt es
 * verboten oder verschwiegen zu bekommen.
 */
export type WeightSource = "user" | "keyholder" | "agent" | "health";

export interface RecordWeightParams {
  /** Immer metrisch — die Umrechnung passiert in der Oberfläche (`weight.ts`). */
  weightKg: number;
  measuredAt: Date;
  imageUrl?: string | null;
  imageExifTime?: Date | null;
  /** Was die Waagen-Erkennung gelesen hat. Etappe 7; bis dahin immer `null`. */
  detectedKg?: number | null;
  note?: string | null;
  source: WeightSource;
  /** Username des Erfassenden (bzw. `ai`), wenn es nicht der Träger selbst war. */
  createdById?: string | null;
  now?: Date;
}

export interface RecordWeightResult {
  id: string;
  dayKey: string;
  inWindow: boolean;
  /** Wahr, wenn für diesen Tag schon ein Wert stand und überschrieben wurde. */
  replaced: boolean;
  /** Wahr, wenn diese Messung die Freigabe-Vorgabe erfüllt und ein Orgasmus-Fenster geöffnet hat. */
  released: boolean;
}

const { table: ERRORS, fail } = serviceErrors({
  USER_NOT_FOUND: { status: 404, error: "USER_NOT_FOUND" },
  WEIGHT_TRACKING_DISABLED: { status: 403, error: "WEIGHT_TRACKING_DISABLED" },
  WEIGHT_OUT_OF_RANGE: { status: 400, error: "WEIGHT_OUT_OF_RANGE" },
  WEIGHT_PROOF_REQUIRED: { status: 400, error: "WEIGHT_PROOF_REQUIRED" },
  WEIGHT_IN_FUTURE: { status: 400, error: "WEIGHT_IN_FUTURE" },
  INVALID_IMAGE_URL: { status: 400, error: "INVALID_IMAGE_URL" },
});

/** Ab wann eine Messzeit „in der Zukunft" liegt. Ein paar Minuten Luft, weil die Uhr des Handys
 *  gegenüber der des Servers vorgehen darf — eine Stunde wäre keine Luft mehr, sondern eine Lücke. */
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Schreibt die Messung des Tages. **Ein Wert je Kalendertag des Trägers** — eine zweite Messung
 * desselben Tages ersetzt die erste, statt eine zweite Zeile anzulegen.
 *
 * Der Tag ist der SEINE: `weightDayKey` mit seiner Zeitzone. Wer um 23:50 Uhr auf der Waage steht, hat
 * an diesem Tag gewogen — nicht an dem, den UTC gerade zählt.
 */
export async function recordWeight(
  userId: string,
  params: RecordWeightParams,
): Promise<ServiceResult<RecordWeightResult>> {
  const problem = weightProblem(params.weightKg);
  if (problem) return serviceFail(400, problem);
  if (!isValidImageUrl(params.imageUrl)) return serviceFail(400, "INVALID_IMAGE_URL");

  const now = params.now ?? new Date();
  if (params.measuredAt.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
    return serviceFail(400, "WEIGHT_IN_FUTURE");
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { weightTrackingEnabled: true, timezone: true, weighingWindows: true },
      });
      if (!user) throw fail("USER_NOT_FOUND");
      // Der Schalter der Keyholderin gilt für JEDEN Schreibweg, nicht nur für die Oberfläche —
      // sonst schriebe der MCP weiter, während der Träger nichts mehr sieht. Der Instanz-Schalter
      // sitzt eine Ebene höher (`weightTrackingGate` in den Routen), weil er ein 404 verlangt.
      if (!user.weightTrackingEnabled) throw fail("WEIGHT_TRACKING_DISABLED");

      const note = params.note?.trim() || null;
      // Foto-Pflicht — aber mit Ventil: wer unterwegs ist oder eine Waage ohne beleuchtete Anzeige
      // hat, meldet MIT NOTIZ und die Zeile bleibt beleglos (`imageUrl` null). Ein harter Riegel
      // ohne Ausweg erzeugt genau die Lücke, die er verhindern soll — nämlich gar keine Meldung.
      // Für die Keyholderin und die KI gilt sie nicht: die stehen nicht vor seiner Waage.
      // Die Beleg-Pflicht trifft den TRÄGER, der von Hand einträgt. Nicht die Keyholderin (sie
      // sitzt nicht vor seiner Waage), nicht die KI — und nicht die Waage selbst: ein Foto von dem
      // Gerät zu verlangen, das den Wert gerade gemeldet hat, wäre ein Beleg für den Beleg.
      if (params.source === "user" && !params.imageUrl && !note) throw fail("WEIGHT_PROOF_REQUIRED");

      const tz = user.timezone || APP_TZ;
      const dayKey = weightDayKey(params.measuredAt, tz);
      // Zum Erfassungs-Zeitpunkt festgeschrieben: die Fenster sind nicht historisiert, weil genau
      // dieses Feld die Frage später beantwortet, statt sie neu zu stellen.
      const inWindow = inWeighingWindow(user.weighingWindows, params.measuredAt, tz);

      // Bewusst Nachschlagen statt `upsert`: der Aufrufer soll dem Nutzer sagen können, dass er
      // einen bestehenden Wert ERSETZT hat. Ein `upsert` erledigt dasselbe in einer Abfrage,
      // verschweigt aber genau diese Unterscheidung — und „gespeichert" für ein stilles
      // Überschreiben ist die Meldung, die den Nutzer glauben lässt, er habe jetzt zwei Werte.
      const existing = await tx.weightEntry.findUnique({
        where: { userId_dayKey: { userId, dayKey } },
        select: { id: true },
      });

      const data = {
        dayKey,
        measuredAt: params.measuredAt,
        weightKg: params.weightKg,
        inWindow,
        imageUrl: params.imageUrl ?? null,
        imageExifTime: params.imageExifTime ?? null,
        detectedKg: params.detectedKg ?? null,
        note,
        source: params.source,
        createdById: params.createdById ?? null,
      };

      const row = existing
        ? await tx.weightEntry.update({
            where: { id: existing.id },
            // `version` treibt die OCC der MCP-Schreibwege — eine Korrektur ist eine neue Fassung.
            data: { ...data, version: { increment: 1 } },
            select: { id: true },
          })
        : await tx.weightEntry.create({ data: { userId, ...data }, select: { id: true } });

      return { id: row.id, dayKey, inWindow, replaced: !!existing };
    });
    // Fire-and-forget: die Zeile steht, der Rest ist Meldung. Siehe `announceTargetEvent`.
    void announceTargetEvent(userId, params.weightKg, params.measuredAt)
      .catch((e) => console.error("[weight:target]", (e as Error).message));

    // Die Freigabe-Vorgabe: NUR bei der ersten Messung des Tages. Wer nachwiegt, könnte sonst so
    // lange wiegen, bis das Mittel passt — die „wichtigste Regel" der Vorlage
    // (docs/gewicht-freigabe-konzept.md, Abschnitt 6). Eine Korrektur wirkt erst ab dem Folgetag mit.
    //
    // Nicht fire-and-forget, anders als die Meldung darüber: hier entsteht eine DIREKTIVE, und der
    // Träger soll die Antwort „du bist frei" mit derselben Anfrage bekommen, mit der er die Zahl
    // eingetragen hat. Ein Fehler darf die Messung trotzdem nicht kippen — sie steht bereits.
    let released = false;
    if (!result.replaced) {
      try {
        released = (await applyWeightRelease(userId)) !== null;
      } catch (e) {
        console.error("[weight:release]", (e as Error).message);
      }
    }
    return { ok: true, data: { ...result, released } };
  } catch (e) {
    const mapped = mapServiceError(e, ERRORS);
    if (mapped) return mapped;
    throw e;
  }
}

/**
 * Hat dieser Wert das Zielgewicht erreicht — oder einen erreichten Stand wieder verloren? Dann eine
 * Meldung an die Keyholder.
 *
 * Nach dem Commit und bewusst ohne `await` beim Aufrufer: die Messung ist gespeichert, und ein
 * fehlgeschlagener Versand darf sie nicht rückgängig machen — dasselbe Verhältnis wie beim
 * Geräte-Check der Kontrolle. Ein Fehler bleibt als Logzeile sichtbar.
 *
 * **Nur an die Keyholder.** Dem Träger diese Zeile in den Posteingang zu legen hiesse, ihm die Zahl
 * zu melden, die er zwei Sekunden vorher selbst eingetragen hat.
 *
 * Auch dann, wenn die Keyholderin den Wert selbst nachgetragen hat — sie weiss es dann zwar schon,
 * aber ein Träger kann mehrere Keyholder haben, und getippt hat nur eine davon. Die Zeile ist
 * ausserdem der bleibende Beleg im Posteingang, nicht bloss ein Hinweis.
 *
 * Automatisch passiert damit NICHTS ausser dieser Meldung: ob etwas folgt — Aufgabe als Belohnung,
 * Aufgabe als Strafe oder gar nichts —, entscheidet die Keyholderin. Das Gewicht selbst ist kein
 * Fehlverhalten, und ein Automatismus, der Kilos in Strafen umrechnet, wäre in dieser App die
 * falsche Mechanik.
 */
async function announceTargetEvent(userId: string, currentKg: number, measuredAt: Date): Promise<void> {
  const [user, previousKg] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: WEIGHT_USER_SELECT }),
    lastWeightBefore(userId, measuredAt),
  ]);
  if (!user) return;

  const target = effectiveTarget(user);
  if (!target) return;

  const startKg = await targetStartWeight(userId, target);
  const event = targetEventToAnnounce({ currentKg, previousKg, target, startKg, heightCm: user.heightCm });
  if (!event) return;

  const controllers = await getControllersOfUser(userId);
  // Die Einheit des TRÄGERS, nicht die der Keyholderin: eine Meldung geht an mehrere Empfänger, die
  // verschiedene Einheiten führen könnten — und der Text steht in der Zeile, nicht in ihrer Ansicht.
  const unit = (user.unitSystem as UnitSystem) ?? "metric";
  const suffix = unit === "imperial" ? "lbs" : "kg";
  await notifyControllers(userId, controllers, {
    subjectKey: event === "reached" ? "weightTargetReachedSubjectKeyholder" : "weightTargetLostSubjectKeyholder",
    messageKey: event === "reached" ? "weightTargetReachedMessageKeyholder" : "weightTargetLostMessageKeyholder",
    params: {
      username: user.username,
      weight: `${weightForDisplay(currentKg, unit)} ${suffix}`,
      target: `${weightForDisplay(target.kg, unit)} ${suffix}`,
    },
  });
}

/**
 * Korrigiert eine Messung: den Wert, die Notiz.
 *
 * **Warum nicht über `recordWeight`**, das den Tageswert ohnehin ersetzt: dieser Weg schreibt die
 * ganze Zeile neu und setzt dabei `imageUrl`, `imageExifTime` und `detectedKg` auf `null` — beim
 * Nachtragen ist das richtig (die Keyholderin sitzt nicht vor seiner Waage), bei einer KORREKTUR
 * wäre es Datenvernichtung: der Beleg verschwände, weil jemand einen Zahlendreher richtigstellt.
 * Hier ändert sich nur, was angegeben wurde.
 *
 * **Zeitpunkt und Foto bleiben, wie sie sind.** Beides ist Teil der BEOBACHTUNG, nicht der Eingabe:
 * an `measuredAt` hängen Tagesschlüssel, `inWindow`, der Trend und die Freigabe-Rechnung. Wer den
 * falschen Tag erwischt hat, löscht die Zeile und trägt neu ein — das ist ehrlicher, als eine
 * Messung auf einen anderen Tag zu schieben, an dem sie nie stattgefunden hat.
 *
 * `version` steigt wie beim Ersetzen: eine Korrektur ist eine neue Fassung, und daran hängt die
 * OCC der MCP-Schreibwege.
 *
 * **Die Freigabe-Vorgabe wird NICHT neu geprüft** — dieselbe Regel wie beim Nachwiegen: eine
 * Korrektur wirkt erst ab dem Folgetag im Mittel mit. Sonst liesse sich eine Freigabe durch
 * nachträgliches Korrigieren erzeugen.
 */
export async function updateWeightEntry(
  id: string,
  params: { weightKg?: number; note?: string | null },
): Promise<ServiceResult<null>> {
  const data: { weightKg?: number; note?: string | null } = {};

  if (params.weightKg !== undefined) {
    const problem = weightProblem(params.weightKg);
    if (problem) return serviceFail(400, problem);
    data.weightKg = params.weightKg;
  }
  if (params.note !== undefined) data.note = params.note?.trim() || null;
  // Ein leerer Patch ist kein Fehler, sondern nichts zu tun — dieselbe Haltung wie beim Rückzug
  // ohne offene Vorgabe. Ein eigener Fehler-Code dafür wäre eine Meldung an niemanden.
  if (Object.keys(data).length === 0) return { ok: true, data: null };

  // `updateMany` statt `update`: eine inzwischen gelöschte Zeile ist dann `count: 0` statt eines
  // geworfenen Prisma-Fehlers, den der Aufrufer als 500 sähe.
  const { count } = await prisma.weightEntry.updateMany({
    where: { id },
    data: { ...data, version: { increment: 1 } },
  });
  if (count === 0) return serviceFail(404, "NOT_FOUND");
  return { ok: true, data: null };
}

/**
 * Löscht eine Messung — samt ihrem Foto.
 *
 * **Nur die Keyholderin, nicht der Träger.** Dieselbe Trennung wie bei den Einträgen: er korrigiert
 * eigene Zeilen nicht selbst. Der Guard sitzt in der Route, hier steht die Wirkung.
 *
 * Die Datei wird MIT gelöscht, und zwar nach dem Commit: eine verwaiste Datei im Upload-Ordner wäre
 * bei einem Gesundheitsdatum genau die Sorte Rest, wegen der man löscht. Bricht das Entfernen der
 * Datei ab, bleibt die Zeile trotzdem weg — die Meldung darüber ist eine Logzeile, kein Fehler für
 * den Aufrufer (Muster: `pruneWeightPhotos`).
 *
 * **Was NICHT mitgelöscht wird: eine Freigabe-Vorgabe, die auf diese Messung hin ausgelöst hat.**
 * Das Orgasmus-Fenster ist danach seine eigene Zeile mit eigenem Rückzugsweg, und eine Freigabe
 * rückwirkend einzukassieren, weil jemand die Messung entfernt, wäre die härtere Überraschung.
 *
 * **Wovon der Löschende wissen sollte: das Strafbuch rechnet mit.** Die versäumte Gewichts-Meldung
 * ist eine LIVE-Ableitung aus den Lücken zwischen den erfassten Tagen — eine entfernte Messung
 * reisst dort rückwirkend eine Lücke auf und kann, wenn die Regel bei diesem Träger scharf steht,
 * ein Vergehen erscheinen lassen, das es vorher nicht gab. Das ist kein Fehler, sondern dieselbe
 * Mechanik wie überall (`strafbuch.ts`); es steht hier, weil man beim Aufräumen von Testdaten nicht
 * damit rechnet.
 */
export async function deleteWeightEntry(id: string): Promise<ServiceResult<null>> {
  const row = await prisma.weightEntry.findUnique({ where: { id }, select: { imageUrl: true } });
  if (!row) return serviceFail(404, "NOT_FOUND");

  await prisma.weightEntry.delete({ where: { id } });
  // Nach dem Löschen der Zeile und ohne `await`: eine Datei, die nicht wegging, ist eine Logzeile
  // wert — sie darf aber nicht dazu führen, dass die Messung stehen bleibt (Muster:
  // `pruneWeightPhotos`).
  void deleteUploadedFiles([row.imageUrl])
    .catch((e) => console.error("[weight:delete-photo]", (e as Error).message));
  return { ok: true, data: null };
}

/**
 * Das Gewicht, ab dem auf dieses Ziel hingearbeitet wird — die Messung, die beim Setzen galt.
 *
 * **Nur für Aufrufer ohne vollständige Reihe.** Wer die Messungen ohnehin geladen hat, nimmt
 * `startWeightIn` aus `weight.ts` — dieselbe Regel ohne zweite Abfrage.
 *
 * Der Fortschritt („von 100 auf 90, 38 % geschafft") braucht einen Startpunkt, und die älteste
 * Messung überhaupt wäre der falsche: ein heute gesetztes Ziel begänne sonst bei einem Wert von vor
 * einem Jahr und zeigte einen Fortschritt, den es für dieses Ziel nie gab.
 *
 * **Gab es beim Setzen noch keine Messung**, gilt die erste danach: wer sein Ziel notiert, bevor er
 * das erste Mal auf der Waage steht, startet eben bei diesem ersten Wert. Ohne den Fallback bliebe
 * der Fortschritt für immer ohne Richtung — und ein Wert unter dem Ziel wäre nicht als Erfolg,
 * sondern nur als „nicht getroffen" lesbar.
 */
export async function targetStartWeight(userId: string, target: WeightTarget): Promise<number | null> {
  if (target.setAt === null) return weightNearest(userId, null, "after");
  return (await weightNearest(userId, target.setAt, "before", true))
    ?? (await weightNearest(userId, target.setAt, "after"));
}

/** Die Messung neben einem Zeitpunkt. `at === null` heisst „ohne Schranke" — dann liefert `after`
 *  die älteste und `before` die jüngste Messung überhaupt. */
async function weightNearest(
  userId: string, at: Date | null, side: "before" | "after", inclusive = false,
): Promise<number | null> {
  const bound = at === null
    ? {}
    : { measuredAt: side === "before" ? (inclusive ? { lte: at } : { lt: at }) : (inclusive ? { gte: at } : { gt: at }) };
  const row = await prisma.weightEntry.findFirst({
    where: { userId, ...bound },
    orderBy: { measuredAt: side === "before" ? "desc" : "asc" },
    select: { weightKg: true },
  });
  return row?.weightKg ?? null;
}

/** Die letzte Messung vor `before` — Grundlage der Sprung-Nachfrage im Formular.
 *
 *  Ohne eigenen Schalter-Check: die Freischaltung prüfen die Aufrufer, bevor sie überhaupt hierher
 *  kommen. Eine Lese-Funktion, die bei abgeschaltetem Feature still `null` liefert, wäre von „noch
 *  nie gewogen" nicht zu unterscheiden — und genau daran hinge dann die Sprung-Nachfrage. */
export async function lastWeightBefore(userId: string, before: Date): Promise<number | null> {
  return weightNearest(userId, before, "before");
}

// ── Aufbewahrung der Waagen-Fotos ──────────────────────────────────────────────────────────────

const WEIGHT_PHOTO_RETENTION_DAYS_DEFAULT = 60;
/** Wie viele Zeilen ein Lauf höchstens anfasst. Wie beim Posteingang: der Rückstand holt über die
 *  Tage auf, statt einen einzelnen Tick minutenlang mit Dateisystem-Arbeit zu belegen. */
const WEIGHT_PHOTO_PRUNE_BATCH = 200;

/** Die konfigurierte Aufbewahrung in Tagen; `0` schaltet das Beschneiden ab. Unbrauchbare Werte
 *  fallen auf die Vorgabe zurück, statt still `NaN` und damit einen Stichtag `Invalid Date` zu
 *  ergeben (dieselbe Falle wie bei `messageRetentionDays`). */
export function weightPhotoRetentionDays(): number {
  const raw = Number(process.env.WEIGHT_PHOTO_RETENTION_DAYS);
  return Number.isFinite(raw) && raw >= 0 ? raw : WEIGHT_PHOTO_RETENTION_DAYS_DEFAULT;
}

/**
 * Löscht abgelaufene Waagen-Fotos — **die Datei, nicht die Messung.**
 *
 * Der Beleg ist genau so lange nützlich, wie ihn jemand anzweifeln könnte; die Zahl bleibt für
 * immer. Genau deshalb steht `imagePrunedAt` in der Zeile: ohne ihn wäre „hatte nie ein Foto" von
 * „hatte eines, ist abgelaufen" nicht zu unterscheiden, und die Keyholderin läse in einen alten
 * Eintrag eine Beleglosigkeit hinein, die es nie gab.
 *
 * Erst die Spalte leeren, dann die Dateien löschen: bricht es dazwischen ab, bleibt eine verwaiste
 * Datei liegen (Speicherplatz, harmlos). Andersherum zeigte die Oberfläche auf ein Bild, das es
 * nicht mehr gibt.
 */
export async function pruneWeightPhotos(now: Date = new Date()): Promise<number> {
  const days = weightPhotoRetentionDays();
  if (days === 0) return 0;
  const cutoff = new Date(now.getTime() - days * 86_400_000);

  const stale = await prisma.weightEntry.findMany({
    where: { imageUrl: { not: null }, imagePrunedAt: null, measuredAt: { lt: cutoff } },
    select: { id: true, imageUrl: true },
    take: WEIGHT_PHOTO_PRUNE_BATCH,
  });
  if (stale.length === 0) return 0;

  await prisma.weightEntry.updateMany({
    where: { id: { in: stale.map((w) => w.id) } },
    data: { imageUrl: null, imagePrunedAt: now },
  });
  await deleteUploadedFiles(stale.map((w) => w.imageUrl));
  return stale.length;
}
