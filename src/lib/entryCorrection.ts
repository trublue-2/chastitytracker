import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { KG_PAIR, WEAR_PAIR, type PairTypes } from "@/lib/utils";
import { entryGuardError } from "@/lib/entryErrors";
import { getEntryNeighbors } from "@/lib/queries";
import { mapServiceError, serviceFail, type ServiceResult } from "@/lib/serviceResult";
import type { ServiceErrorCode } from "@/lib/serviceErrorCodes";

/**
 * Die KORREKTUR eines bereits erfassten Eintrags — die Regeln einmal, für beide Schnittstellen.
 *
 * Die Keyholderin darf einen Eintrag ihres Trägers längst richtigstellen (`PATCH /api/entries/[id]`,
 * `entryManageAccess`); der häufigste Anlass ist das falsch gewählte GERÄT beim Verschluss. Über den
 * MCP ging das nicht — die KI-Keyholderin konnte Einträge nur lesen. Diese Datei schliesst die Lücke,
 * ohne die Regeln ein zweites Mal hinzuschreiben: die Route benutzt {@link assertEntryTimeOk}
 * unverändert weiter, der MCP ruft {@link correctEntry} darüber.
 *
 * WAS HIER NICHT STEHT: die Anti-Cheat-Regeln des Trägers (Zeitrichtung, Nachweis-Erhalt) und die
 * Felder, die nur ein Keyholder setzen darf. Sie gelten am Rand der Route, wo der HANDELNDE bekannt
 * ist — der MCP ist per Bauart immer die Keyholderin, und {@link correctEntry} nimmt ohnehin nur die
 * drei Felder einer Korrektur entgegen.
 *
 * NICHTS ZU STEMPELN: Sessions, Statistik, Gerätestunden und Strafbuch sind aus den Einträgen
 * ABGELEITET. Ein korrigiertes Gerät zieht überall von selbst nach — das ist der Grund, warum eine
 * Korrektur überhaupt eine einzelne Zeile sein darf.
 */

/** Die beiden Ketten, in denen ein Eintrag stehen kann. Als LISTE, damit eine dritte Familie ein
 *  Eintrag wäre und keine weitere `if`-Zeile in jeder Funktion, die sie unterscheidet. */
const PAIR_FAMILIES = [KG_PAIR, WEAR_PAIR] as const;

/** Die Paar-Familie dieser Eintragsart, oder `null` für die ungepaarten (Prüfung, Orgasmus).
 *  Über die Paar-Konstanten aus `utils.ts` und nicht über Literale — und in DEREN Form (`PairTypes`),
 *  weil `buildPairs` sie ohnehin so entgegennimmt. */
export function entryPairTypes(type: string): PairTypes | null {
  return PAIR_FAMILIES.find((pair) => pair.close === type || pair.open === type) ?? null;
}

/** Trägt diese Eintragsart überhaupt ein Gerät? Nur an ihr darf `deviceId` geschrieben werden —
 *  ein OEFFNEN hat keins (das Gerät steht am zugehörigen Verschluss). */
export function entryPersistsDevice(type: string): boolean {
  return type === KG_PAIR.close || type === WEAR_PAIR.close || type === WEAR_PAIR.open;
}

/**
 * Darf dieser Eintrag auf `newTime` verschoben werden, ohne die Kette zu brechen?
 *
 * Wirft `TIME_IN_FUTURE` bzw. `INVALID_ORDER` ({@link entryGuardError}) — die Aufrufer fangen den
 * Code ab, wie sie es schon vorher taten. Geprüft wird gegen die NACHBARN am neuen Zeitpunkt: zwei
 * Verschlüsse hintereinander sind kein Zustand, den die Paarung abbilden kann.
 *
 * Bei den Trage-Paaren zählt nur die Kette DERSELBEN Kategorie — zwei Geräte verschiedener
 * Kategorien dürfen gleichzeitig getragen werden. Die Kategorie kommt dabei vom BESTEHENDEN Gerät
 * der Zeile, auch wenn derselbe Aufruf das Gerät wechselt: die Prüfung fragt, ob der Eintrag an
 * seinem neuen Platz in seine Kette passt, und das ist die, in der er heute steht. (So verhielt es
 * sich vor der Extraktion, und ein Wechsel der Kategorie MIT gleichzeitigem Zeitsprung ist kein
 * Fall, den es zu bedienen gilt.)
 *
 * IN der Transaktion aufzurufen: Prüfung und Schreiben müssen dieselbe Sicht haben.
 */
export async function assertEntryTimeOk(
  tx: Prisma.TransactionClient,
  existing: { id: string; userId: string; type: string; deviceId: string | null },
  newTime: Date,
): Promise<void> {
  const pair = entryPairTypes(existing.type);
  if (!pair) return;
  if (newTime > new Date()) throw entryGuardError("TIME_IN_FUTURE");

  const wearCategoryId = pair === WEAR_PAIR && existing.deviceId
    ? (await tx.device.findUnique({ where: { id: existing.deviceId }, select: { categoryId: true } }))?.categoryId
    : null;
  const { prev, next } = await getEntryNeighbors(existing.userId, newTime, [pair.close, pair.open], tx, {
    categoryId: wearCategoryId ?? undefined,
    excludeId: existing.id,
  });
  if ((prev && prev.type === existing.type) || (next && next.type === existing.type)) {
    throw entryGuardError("INVALID_ORDER");
  }
}

/** Die zwei Ausgänge von {@link assertEntryTimeOk}, als Tabelle für {@link mapServiceError}. Beide
 *  sind zugleich `ServiceErrorCode`s (siehe `serviceErrorCodes.ts`) — der Compiler hält das zusammen. */
const TIME_ERRORS = {
  TIME_IN_FUTURE: { status: 400, error: "TIME_IN_FUTURE" },
  INVALID_ORDER: { status: 400, error: "INVALID_ORDER" },
} as const;

/** Was eine Korrektur ändern darf. Bewusst DREI Felder: Fotos, Kontrollcode und Verifikations-Status
 *  gehören zur Beweisführung — sie bleiben der Oberfläche vorbehalten, wo ein Mensch sie ansieht. */
export interface EntryCorrection {
  startTime?: Date;
  /** `null` löscht die Notiz. */
  note?: string | null;
  /** `null` nimmt das Gerät weg. Nur an Arten, die eins tragen ({@link entryPersistsDevice}). */
  deviceId?: string | null;
}

/** Der korrigierte Eintrag, wie ihn beide Aufrufer nach aussen geben. */
export interface CorrectedEntry {
  id: string;
  type: string;
  startTime: Date;
  note: string | null;
  deviceId: string | null;
  deviceName: string | null;
}

const CORRECTED_SELECT = {
  id: true, type: true, startTime: true, note: true, deviceId: true,
  device: { select: { name: true } },
} as const;

/**
 * Was einer Korrektur im Weg steht — oder `null`, wenn sie zulässig ist. Alles, was OHNE Blick auf
 * die Nachbar-Einträge feststeht.
 *
 * Geteilt vom Dienst (er hat das letzte Wort) und von der dryRun-Vorschau des MCP: zwei unabhängig
 * formulierte Bedingungsketten wären genau die Stelle, an der eine künftige vierte Regel nur in
 * einer der beiden landet — und die Vorschau verspräche Erfolg für einen Commit, der mit einer
 * Absage endet. Dieselbe Bauart wie `proofSubmitBlockedReason` (`taskProofService.ts`).
 *
 * NICHT hier: die Ketten-Prüfung ({@link assertEntryTimeOk}). Sie liest die Nachbarn und gehört in
 * die Transaktion — eine Vorschau davor wäre eine zweite Uhr auf denselben Zustand.
 */
export async function correctionProblem(
  type: string,
  fields: EntryCorrection,
  userId: string,
): Promise<ServiceErrorCode | null> {
  if (!entryPairTypes(type)) return "ENTRY_NOT_CORRECTABLE";
  // Die Zukunfts-Prüfung braucht keine Datenbank und gehört deshalb in die Vorschau — anders als die
  // Reihenfolge. Sie steht zusätzlich in `assertEntryTimeOk`, weil die Route nur dort vorbeikommt.
  if (fields.startTime && fields.startTime > new Date()) return "TIME_IN_FUTURE";
  if (fields.deviceId === undefined) return null;
  if (!entryPersistsDevice(type)) return "ENTRY_CARRIES_NO_DEVICE";
  return deviceProblem(type, fields.deviceId, userId);
}

/**
 * Taugt dieses Gerät an DIESER Eintragsart — oder `null`, wenn nichts dagegen spricht.
 *
 * Der Besitz allein reicht nicht, und das ist der Punkt: die Oberfläche bietet beim Verschluss nur
 * KG-Geräte an und beim Tragen nur die der übrigen Kategorien (`getUserDeviceOptions` bzw. die
 * Kategorie-Auswahl), der Anlege-Pfad erzwingt dieselbe Trennung ({@link prepareWearEntry},
 * `WEAR_DEVICE_KG`/`WEAR_DEVICE_NO_CATEGORY`). Eine Korrektur, die sie NICHT prüfte, könnte in einem
 * einzigen Aufruf herstellen, was das Anlegen ausschliesst — ein Trage-Eintrag mit dem Käfig darin
 * fiele aus jeder Kategorie-Kette (die Trage-Abfragen filtern über `device.categoryId`) und wäre für
 * Sessions und Statistik unsichtbar, ohne dass irgendwo ein Fehler stünde.
 *
 * WEG-nehmen darf man das Gerät nur am Verschluss: ein Trage-Eintrag OHNE Gerät ist ein Zustand, den
 * das Anlegen gar nicht kennt (`WEAR_DEVICE_REQUIRED`) — er nähme den Träger aus seiner Kette, ohne
 * sie zu schliessen.
 */
async function deviceProblem(
  type: string,
  deviceId: string | null,
  userId: string,
): Promise<"INVALID_DEVICE" | "WEAR_DEVICE_REQUIRED" | "WEAR_DEVICE_KG" | "WEAR_DEVICE_NO_CATEGORY" | null> {
  const isWear = entryPairTypes(type) === WEAR_PAIR;
  if (deviceId === null) return isWear ? "WEAR_DEVICE_REQUIRED" : null;

  const device = await prisma.device.findFirst({
    where: { id: deviceId, userId },
    select: { categoryId: true, category: { select: { isBuiltIn: true } } },
  });
  if (!device) return "INVALID_DEVICE";
  if (!isWear) return device.category?.isBuiltIn ? null : "INVALID_DEVICE";
  if (!device.categoryId) return "WEAR_DEVICE_NO_CATEGORY";
  return device.category?.isBuiltIn ? "WEAR_DEVICE_KG" : null;
}

/**
 * Korrigiert EINEN Eintrag des Trägers — die Fassung für Aufrufer ohne eigene Rechte-Prüfung.
 *
 * `userId` steckt in der ABFRAGE und nicht in einer Prüfung danach: ein vergessener Besitz-Check
 * wäre ein IDOR, den kein Typfehler auffängt. Dieselbe Bauart wie `ownProofWhere`
 * (`taskProofService.ts`).
 *
 * Nur gepaarte Arten (Verschluss/Öffnen und Trage-Beginn/-Ende): an ihnen entsteht der Griff daneben,
 * den diese Funktion heilen soll. Eine Prüfung oder ein Orgasmus wird über die Oberfläche
 * korrigiert — dort hängen Foto und Urteil dran, und beides fasst diese Funktion nicht an.
 */
export async function correctEntry(
  entryId: string,
  userId: string,
  fields: EntryCorrection,
): Promise<ServiceResult<CorrectedEntry>> {
  const existing = await prisma.entry.findFirst({
    where: { id: entryId, userId },
    select: { id: true, userId: true, type: true, deviceId: true },
  });
  if (!existing) return serviceFail(404, "NOT_FOUND");
  const problem = await correctionProblem(existing.type, fields, userId);
  if (problem) return serviceFail(400, problem);

  try {
    const entry = await prisma.$transaction(async (tx) => {
      if (fields.startTime) await assertEntryTimeOk(tx, existing, fields.startTime);
      return tx.entry.update({
        where: { id: entryId },
        data: {
          ...(fields.startTime && { startTime: fields.startTime }),
          ...(fields.note !== undefined && { note: fields.note }),
          ...(fields.deviceId !== undefined && { deviceId: fields.deviceId }),
        },
        select: CORRECTED_SELECT,
      });
    });
    return { ok: true, data: { ...entry, deviceName: entry.device?.name ?? null } };
  } catch (e: unknown) {
    // Über die Tabelle wie überall sonst (`mapServiceError`): sie bindet Code und Status an EINER
    // Stelle, und `null` heisst „kein erwarteter Fall" — ein echter Defekt fliegt weiter, statt als
    // gewöhnliche Ablehnung mit 400 durchzugehen.
    // Die Zeile ist zwischen Lesen und Schreiben verschwunden (der Träger hat sie gelöscht) — eine
    // gewöhnliche Absage, kein Defekt. Ohne diesen Zweig verliesse eine rohe Prisma-Ausnahme eine
    // Funktion, deren Vertrag `ServiceResult` heisst.
    if ((e as { code?: unknown })?.code === "P2025") return serviceFail(404, "NOT_FOUND");
    const mapped = mapServiceError(e, TIME_ERRORS);
    if (!mapped) throw e;
    return mapped;
  }
}
