import { prisma } from "@/lib/prisma";
import type { Entry, User } from "@prisma/client";
import { validateEntryPayload, DEVICE_BEARING_TYPES } from "@/lib/constants";
import { orgasmusValueAllowed, validOeffnenCodes } from "@/lib/reasonsService";
import { validateDeviceOwnership, releaseLockPeriodsOnOpen, prepareWearEntry, getKgNeighbors } from "@/lib/queries";
import { entryGuardError, entryGuardCode } from "@/lib/entryErrors";
import { applyEntryFulfilment } from "@/lib/entryFulfilment";
import { triggerPostLockInspection } from "@/lib/autoKontrolleService";
import { boltFieldsFor } from "@/lib/lockPending";
import { findPendingLockTx } from "@/lib/lockCommit";
import { notifyControllersAboutEntry } from "@/lib/entryNotify";
import type { EntryGuardCode, EntryValidationCode } from "@/lib/entryErrors";

/**
 * Ein Ereignis für den TRÄGER nachtragen — der Weg der Keyholderin, nicht der des Subs.
 *
 * Der Unterschied zu `POST /api/entries` steckt in drei Freiheiten und einer Zurückhaltung:
 * hier darf RÜCKDATIERT werden, der Verschluss wartet nie auf den Riegel, und die Reinigungs-
 * Kontrolle wird nicht geplant (der Planer rechnet ab jetzt, nicht ab der Eintrags-Zeit) — dafür
 * ahndet dieser Pfad ein falsches Gerät bewusst NICHT selbst. Die Begründungen stehen je an ihrer
 * Stelle im Code.
 *
 * Als Dienst und nicht mehr in der Route, weil es einen zweiten Aufrufer gibt: die KI-Keyholderin
 * über den MCP (`add_entry`). Die Regeln hier sind zu viele und zu folgenreich, um sie ein zweites
 * Mal hinzuschreiben — Nachbar-Prüfung, Sperrzeit-Freigabe, Erfüllungs-Logik, Riegel-Felder und die
 * Meldung an die übrigen Kontrolleure hängen alle daran.
 */

/**
 * Der Ausgang eines Nachtrags.
 *
 * BEWUSST kein `ServiceResult`: dessen `ServiceErrorCode` schliesst `ALREADY_LOCKED`/`NOT_LOCKED`
 * ausdrücklich aus, weil die beiden Sätze an den TRÄGER adressiert sind („Öffnen nur möglich, wenn
 * aktuell verschlossen") und die Dienst-Schicht sonst einem Keyholder einen Satz zeigte, der für
 * den Sub geschrieben wurde. Dieser Dienst spricht aber die Sprache der Entry-Routen, samt dieser
 * beiden Codes — also trägt er sie in seinem eigenen Typ, statt die Regel dort aufzuweichen. Wer
 * ihn für eine Keyholder-Oberfläche aufruft, übersetzt sie (siehe `mcpAddEntry`).
 */
export type EntryCreateError = EntryGuardCode | EntryValidationCode;

export type EntryCreateResult =
  | { ok: true; entry: Entry }
  | { ok: false; error: EntryCreateError };

/** Was ein Nachtrag mitbringt. Dieselben Felder, die das Keyholder-Formular schickt. */
export interface EntryCreateInput {
  type: string;
  startTime: string | Date;
  note?: string | null;
  oeffnenGrund?: string | null;
  orgasmusArt?: string | null;
  imageUrl?: string | null;
  imageExifTime?: string | Date | null;
  kontrollCode?: string | null;
  deviceId?: string | null;
  /**
   * NUR für die Validierung, NICHT zum Schreiben — und das ist Bestand, kein Versehen.
   *
   * Das geteilte Verschluss-Formular schickt beide mit, sobald die Box-Bestätigung greift; dieser
   * Pfad hat sie noch nie gespeichert (die Schlüssel-Erklärung gehört zum Selbst-Erfassen des
   * Trägers, nicht zum Nachtrag). Sie hier trotzdem entgegenzunehmen hält die Prüfung am Leben, die
   * `validateEntryPayload` an ihnen führt — ein `"false"` als String fiele sonst still durch, statt
   * abgewiesen zu werden.
   */
  keyInBox?: unknown;
  boxImageUrl?: string | null;
}

export interface EntryCreateOptions {
  /**
   * Wer trägt ein. Entscheidet zweierlei: er fällt aus der Empfängerliste der Meldung (er hat den
   * Eintrag ja gerade erfasst), und trägt jemand für SICH SELBST ein (ein Nutzer mit Admin-Rolle,
   * der auch getrackt wird), zählt für die Erfüllung die Server-Uhr statt der frei gewählten Zeit —
   * sonst löschte er eine eigene Verfehlung durch einen passend datierten Nachtrag aus.
   *
   * `null` auf dem MCP-Weg, und zwar richtig so: die KI ist kein Empfänger von Meldungen, und die
   * menschliche Keyholderin SOLL erfahren, was ihre KI erfasst hat. Ohne Wert wird niemand
   * gestrichen ({@link notifyControllersAboutEntry}).
   *
   * PFLICHT-SCHLÜSSEL mit erlaubtem `null` statt eines optionalen Feldes: der Vergleich unten ist
   * die Tür, die verhindert, dass jemand eine EIGENE Verfehlung durch einen passend datierten
   * Nachtrag auslöscht. Als `?`-Feld wäre sein Weglassen eine Nachlässigkeit ohne Compilerfehler —
   * so muss jeder neue Aufrufer sich bewusst dafür entscheiden.
   *
   * Was `null` in der Folge bedeutet, wo die KI für einen Träger schreibt, der zugleich Admin IST
   * (eine Ein-Personen-Instanz): dort greift die Tür nicht, und ein über die KI nachgetragener
   * Eintrag darf die Erfüllung rückdatieren. Wer beides in einer Person ist, hält ohnehin alle
   * Schlüssel — die Tür schützt vor Unachtsamkeit, nicht vor dem Betreiber.
   */
  actorUserId: string | null;
  /** Nur die lokale Entwicklung: erlaubt einen Zeitpunkt in der Zukunft. */
  allowFuture?: boolean;
}

/**
 * Was einer Erfassung im Weg steht — oder `null`, wenn sie zulässig ist. SCHREIBFREI.
 *
 * Eigenständig, weil zwei Seiten sie brauchen: der Dienst als erste Schranke und die dryRun-Vorschau
 * des MCP (`mcpAddEntry`). Ohne sie versprach die Vorschau Erfolg für jeden Aufruf und die KI fing
 * sich die Absage erst beim Commit — bei fehlender Notiz, unbekanntem Öffnungsgrund oder einem
 * Zeitpunkt in der Zukunft. Prüfungen, die die KETTE lesen, stehen bewusst NICHT hier: die gehören
 * in die Transaktion.
 *
 * Die Reason-Listen sind die DES TRÄGERS — wer sie aus dem Handelnden zöge, prüfte gegen die
 * falsche Konfiguration.
 */
export function validateEntryCreate(
  user: Pick<User, "orgasmusArtenConfig" | "oeffnenGruendeConfig">,
  input: EntryCreateInput,
  opts: { allowFuture?: boolean } = {},
): EntryValidationCode | null {
  return validateEntryPayload(
    // Auf `undefined` normalisiert, weil `validateEntryPayload` optionale Strings erwartet und ein
    // `null` dort als gesetzter Wert gälte. `keyInBox`/`boxImageUrl` gehen ungefiltert mit — sie
    // werden geprüft, nicht geschrieben (siehe {@link EntryCreateInput}).
    { ...input, startTime: isoOf(input.startTime), imageUrl: input.imageUrl ?? undefined,
      note: input.note ?? undefined, oeffnenGrund: input.oeffnenGrund ?? undefined,
      orgasmusArt: input.orgasmusArt ?? undefined, boxImageUrl: input.boxImageUrl ?? undefined },
    { requirePhotoForPruefung: false, allowFuture: opts.allowFuture },
    {
      orgasmAllowed: (v) => orgasmusValueAllowed(v, user.orgasmusArtenConfig),
      openingCodes: validOeffnenCodes(user.oeffnenGruendeConfig),
    },
  );
}

/**
 * Legt den Eintrag an und stösst an, was daran hängt.
 *
 * `user` wird ÜBERGEBEN und nicht hier geladen: die Route hat die Zeile für ihre Rechte-Prüfung
 * ohnehin in der Hand, und die Reason-Listen, gegen die validiert wird, sind die DES TRÄGERS — wer
 * sie aus dem Handelnden zöge, prüfte gegen die falsche Konfiguration.
 */
export async function createEntryForUser(
  user: User,
  input: EntryCreateInput,
  opts: EntryCreateOptions,
): Promise<EntryCreateResult> {
  const userId = user.id;
  const { type, startTime, note, oeffnenGrund, orgasmusArt, imageUrl, imageExifTime, kontrollCode, deviceId } = input;

  const validationError = validateEntryCreate(user, input, { allowFuture: opts.allowFuture });
  if (validationError) return { ok: false, error: validationError };

  // In der Transaktion ermittelt, nach dem Commit für die Meldung wiederverwendet.
  let brokeLockPeriod = false;
  let entry: Entry;
  try {
    entry = await prisma.$transaction(async (tx) => {
      // Geräte-Besitz IN der Transaktion prüfen (TOCTOU).
      if (deviceId && DEVICE_BEARING_TYPES.includes(type)) {
        const device = await validateDeviceOwnership(deviceId, userId, tx);
        if (!device) throw entryGuardError("INVALID_DEVICE");
      }

      // WEAR_BEGIN / WEAR_END: die geteilte Prüfung liegt in `queries.ts` (eine Quelle).
      if (type === "WEAR_BEGIN" || type === "WEAR_END") {
        const wearResult = await prepareWearEntry(tx, userId, type, deviceId ?? undefined, startTime, imageUrl);
        if (!wearResult.ok) throw entryGuardError(wearResult.code);
      }

      // `tx` durchreichen: der Read-then-Write-Guard muss in DERSELBEN Transaktion lesen (TOCTOU).
      // Die REINIGUNGS-Kontrolle löst ein VERSCHLUSS hier weiterhin nicht aus (sie steht am
      // Selbst-Erfassungs-Pfad des Subs, siehe `scheduleCleaningRelockInspection`): ein um 23:00
      // nachgetragener Verschluss von 14:00 plante sonst eine Kontrolle „in 15–45 Minuten" — der
      // Planer rechnet ab jetzt, nicht ab `startTime`.
      // Die VERSCHLUSS-Kontrolle (`postLockInspectionEnabled`) gilt hier dagegen ausdrücklich, weil
      // die Keyholderin ihren Träger meist einschliesst und den Eintrag dabei tippt. Gegen denselben
      // Nachtrags-Fall schützt dort ein anderer Wächter: sie feuert nur, wenn der Träger JETZT
      // verschlossen ist (siehe `schedulePostLockInspection`).
      // Hinweis: dieser Pfad hat bewusst KEINEN TIME_BEFORE-Guard (Rückdatieren ist erlaubt) — der
      // neue Eintrag darf also zeitlich VOR den bisher jüngsten KG-Eintrag rutschen. `prev` ist
      // dabei NICHT dasselbe wie `getLatestKgEntry`: nur ohne Rückdatierung (dem Normalfall) fallen
      // beide zusammen, weshalb ein einziger Nachbar-Query beide Fälle abdeckt.
      //
      // `next` fängt die Anomalie, die der reine ALREADY_LOCKED/NOT_LOCKED-Check (gegen `prev`)
      // nicht sieht: der neue Eintrag landet zwischen einem bestehenden Paar und erzeugt zwei
      // gleichartige KG-Einträge hintereinander.
      if (type === "VERSCHLUSS" || type === "OEFFNEN") {
        const { prev, next } = await getKgNeighbors(userId, new Date(startTime), tx);
        if (next && next.type === type) throw entryGuardError("INVALID_ORDER");

        if (type === "VERSCHLUSS" && prev?.type === "VERSCHLUSS") throw entryGuardError("ALREADY_LOCKED");
        // Ein wartender Verschluss-AUFRUF des Trägers zählt für die Nachbar-Suche bewusst nicht als
        // Verschluss — er darf hier trotzdem nicht überschrieben werden: die Keyholderin trüge einen
        // zweiten ein, die Box meldete danach den Riegel, und der Vollzug setzte einen ZWEITEN
        // Verschluss unmittelbar hinter ihren — also genau die verwaiste Anomalie, die
        // `INVALID_ORDER` verhindern soll.
        if (type === "VERSCHLUSS" && await findPendingLockTx(tx, userId)) {
          throw entryGuardError("LOCK_ALREADY_PENDING");
        }

        if (type === "OEFFNEN") {
          if (!prev || prev.type !== "VERSCHLUSS") throw entryGuardError("NOT_LOCKED");
          // Ein nachgetragenes Öffnen muss die Sperrzeit mit freigeben, sonst gilt der Träger
          // weiterhin als verschlossen.
          brokeLockPeriod = await releaseLockPeriodsOnOpen(userId, oeffnenGrund ?? undefined, tx, "user", user);
        }
      }

      const entryTime = new Date(startTime);
      const created = await tx.entry.create({
        data: {
          userId,
          type,
          startTime: entryTime,
          note: note?.trim() || null,
          oeffnenGrund: oeffnenGrund || null,
          orgasmusArt: orgasmusArt || null,
          imageUrl: imageUrl || null,
          imageExifTime: imageExifTime ? new Date(imageExifTime) : null,
          kontrollCode: kontrollCode || null,
          // PRUEFUNG trägt seit v5.0.1 das kontrollierte Gerät (Trage-Kontrollen) — hier nur als
          // Datum am Eintrag: eine nachgetragene Prüfung erfüllt bewusst keine Anforderung (das tut
          // nur die Einreichung des Subs, siehe /api/entries).
          deviceId: DEVICE_BEARING_TYPES.includes(type) ? (deviceId || null) : null,
          // Dieser Pfad wartet NIE auf den Riegel (docs/riegel-konzept.md): hier wird nachgetragen,
          // oft rückdatiert, und einen Riegel, der zu diesem Zeitpunkt zufiele, gibt es nicht. Ohne
          // diese Zeile bliebe JEDER so erfasste Verschluss dauerhaft schwebend — auf jeder Instanz,
          // auch ganz ohne Box.
          ...boltFieldsFor(type, entryTime),
        },
      });

      // Was dieser Eintrag abhakt — dieselbe Logik wie auf dem Sub-Pfad (`entryFulfilment.ts`), mit
      // zwei bewussten Unterschieden:
      //
      // 1. `at = entryTime` statt der Server-Uhr: hier darf rückdatiert werden, und dann ist der
      //    Moment des Erfassens der falsche Bezug — ein nachgetragener pünktlicher Verschluss gälte
      //    sonst als „zu spät". Ausnahme: erfasst jemand für SICH SELBST, zählt die Server-Uhr.
      // 2. KEINE Kontroll-Anforderung (`verification: null`): eine nachgetragene Prüfung erfüllt
      //    bewusst keine — das tut nur die Einreichung des Subs. Bleibt sie offen und läuft ab, ist
      //    der Rückzug der Anforderung das vorgesehene Mittel, nicht ein Eintrag ohne Nachweis.
      const fulfilAt = userId === opts.actorUserId ? new Date() : entryTime;
      await applyEntryFulfilment(tx, created, { verification: null, targetWhere: null }, fulfilAt);

      return created;
    });
  } catch (e: unknown) {
    // `entryGuardCode` wirft alles weiter, was kein Guard-Code ist — ein echter Defekt darf nicht
    // als gewöhnliche Ablehnung durchgehen.
    return { ok: false, error: entryGuardCode(e) };
  }

  // KEINE automatische Falsch-Gerät-Ahndung auf diesem Pfad — bewusst, anders als beim Sub. Das
  // Keyholder-Formular zeigt nicht an, welches Gerät die Anforderung verlangt, und wählt es nicht
  // vor. Ein leer gelassenes Feld trüge dem SUB eine bereits abgeurteilte Strafe ein, die im
  // Urteilsloop nie auftaucht — er würde für einen Tippfehler seiner Keyholderin bestraft.

  // Kontrolle nach dem Einschliessen — auch auf diesem Pfad, siehe die Begründung oben.
  if (type === "VERSCHLUSS") triggerPostLockInspection(userId);

  // Meldung an die übrigen Kontrolleure des Subs. Der Handelnde ist NICHT Empfänger — er hat den
  // Eintrag gerade erfasst. (Bis v5 fehlte die Meldung auf diesem Pfad ganz, Vorfall 03.08.2026.)
  void notifyControllersAboutEntry({
    userId,
    actorUserId: opts.actorUserId ?? undefined,
    username: user.username,
    type,
    startTime: entry.startTime,
    withdrawnLockPeriod: brokeLockPeriod,
    oeffnenGrund: entry.oeffnenGrund,
    orgasmusArt: entry.orgasmusArt,
    kontrollCode: entry.kontrollCode,
    note: entry.note,
    imageUrl: entry.imageUrl,
    deviceId: entry.deviceId,
    reasonConfig: user,
  });

  return { ok: true, entry };
}

/**
 * `validateEntryPayload` liest `startTime` als String — beide Aufrufer dürfen aber auch ein `Date`
 * reichen (der MCP hat es bereits geparst).
 *
 * TOLERANT gegenüber dem Fehlen, obwohl der Typ es verbietet: der Rumpf einer Route ist ungeprüftes
 * JSON, und ein abgebrochener Client schickt schon mal `{userId}` ohne alles. Vor der Extraktion
 * antwortete die Route darauf mit `START_TIME_REQUIRED` (400) — ein `undefined.toISOString()` hier
 * machte daraus eine unbehandelte 500, und der Code wäre auf diesem Pfad gar nicht mehr erreichbar.
 */
function isoOf(t: string | Date | null | undefined): string | undefined {
  if (t === null || t === undefined) return undefined;
  return typeof t === "string" ? t : t.toISOString();
}
