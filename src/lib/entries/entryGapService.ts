import { prisma } from "@/lib/prisma";
import type { Entry, User } from "@prisma/client";
import { validateEntryCreate } from "@/lib/entries/entryCreateService";
import { getKgNeighbors, type PrismaTx } from "@/lib/entries/queries";
import { entryGuardError, entryGuardCode } from "@/lib/entries/entryErrors";
import type { EntryCreateError } from "@/lib/entries/entryCreateService";
import { boltFieldsFor } from "@/lib/entries/lockPending";

/**
 * Eine vergessene Öffnung samt Wiederverschluss NACHTRAGEN — als EIN Vorgang.
 *
 * Der Anlass: wer sein Logbuch rückwirkend erfasst, vergisst Pausen. Fehlt eine, lässt sie sich
 * über die Einzel-Einträge nicht mehr einfügen — das Öffnen mitten in einer Tragephase hätte einen
 * zweiten OEFFNEN als Nachbarn (`INVALID_ORDER`), der Wiederverschluss einen VERSCHLUSS davor
 * (`ALREADY_LOCKED`), und jeder der beiden Schritte ist ohne den anderen ein Zustand, den die
 * Paarung nicht abbilden kann. Die Ketten-Prüfung ist richtig und bleibt; also geht das Paar in
 * einer Transaktion hinein, und geprüft wird das ENDERGEBNIS der Kette.
 *
 * Zwei Arten, dieselbe Idee in Spiegelform (`kind`):
 *   · `break`   — eine vergessene PAUSE: Öffnen + Wiederverschluss INNERHALB einer Tragephase;
 *   · `session` — eine vergessene TRAGEZEIT: Verschluss + Öffnen INNERHALB einer offenen Phase
 *                 (oder vor dem ersten Eintrag). Ein einzelner Verschluss dort hätte einen
 *                 Verschluss als Nachfolger (`INVALID_ORDER`), eine einzelne Öffnung danach einen
 *                 Öffnen-Eintrag davor — wieder ist jeder Schritt ohne den anderen eine gebrochene Kette.
 *
 * Bewusst NICHT hier (der Zustand von JETZT bleibt, wie er war — verschlossen vor wie nach dem
 * Nachtrag):
 *   · keine Sperrzeit-Freigabe (`releaseLockPeriodsOnOpen`): eine rückdatierte Pause ist kein
 *     Bruch einer Sperrzeit, die heute gilt;
 *   · keine Erfüllung von Anforderungen und keine Kontrolle nach dem Einschliessen — beide rechnen
 *     ab jetzt und liessen sich von einem Nachtrag aus der Vergangenheit nicht sinnvoll anstossen;
 *   · keine Meldung an die übrigen Kontrolleure: es ist eine Korrektur der Aufzeichnung, kein
 *     Ereignis, auf das jemand reagieren müsste.
 */
/** Ist der Nachtrag (Pause und Tragezeit) auf DIESER Instanz freigeschaltet? Standard aus: er
 *  schreibt Einträge in die Vergangenheit und gehört in die Hand des Betreibers, nicht jeder Instanz. */
export function entryGapEnabled(): boolean {
  return process.env.ALLOW_ENTRY_GAP === "true";
}

/** `break`: Öffnen, dann Wiederverschluss (in einer Tragephase). `session`: Verschluss, dann
 *  Öffnen (in einer offenen Phase). */
export const ENTRY_GAP_KINDS = ["break", "session"] as const;
export type EntryGapKind = (typeof ENTRY_GAP_KINDS)[number];

export interface EntryGapInput {
  kind: EntryGapKind;
  /** Wann der Gürtel geöffnet wurde. Bei `break` VOR `lockAt`, bei `session` danach. */
  openAt: Date;
  /** Wann er verschlossen wurde. */
  lockAt: Date;
  oeffnenGrund: string;
  /** Pflicht wie beim Einzel-Öffnen (`NOTE_REQUIRED`). Gilt für das Öffnen. */
  note: string;
}

export type EntryGapResult =
  | { ok: true; opened: Entry; locked: Entry }
  | { ok: false; error: EntryCreateError };

/** Was dem Nachtrag im Weg steht, ohne die Kette zu lesen — oder `null`. SCHREIBFREI; geteilt vom
 *  Dienst (erste Schranke) und der dryRun-Vorschau des MCP, wie `validateEntryCreate`. */
export function validateEntryGap(
  user: Pick<User, "orgasmusArtenConfig" | "oeffnenGruendeConfig">,
  input: EntryGapInput,
  opts: { allowFuture?: boolean } = {},
): EntryCreateError | null {
  const [first, second] = input.kind === "session" ? [input.lockAt, input.openAt] : [input.openAt, input.lockAt];
  if (!(first < second)) return "INVALID_ORDER";
  // Die Prüfungen am Öffnen (Grund, Notiz, Zukunft) sind die des Einzel-Eintrags — dieselbe Quelle.
  const open = validateEntryCreate(user, {
    type: "OEFFNEN", startTime: input.openAt, oeffnenGrund: input.oeffnenGrund, note: input.note,
  }, opts);
  if (open) return open;
  return validateEntryCreate(user, { type: "VERSCHLUSS", startTime: input.lockAt }, opts);
}

/** Die beiden Einträge des Paars, in zeitlicher Reihenfolge angelegt. `deviceId` gehört dem
 *  Verschluss; die Prüfung der Nachbarn steht bei den Aufrufern. */
async function writePair(tx: PrismaTx, userId: string, input: EntryGapInput, deviceId: string | null) {
  const open = () => tx.entry.create({
    data: {
      userId,
      type: "OEFFNEN",
      startTime: input.openAt,
      oeffnenGrund: input.oeffnenGrund,
      note: input.note.trim(),
    },
  });
  const lock = () => tx.entry.create({
    data: {
      userId,
      type: "VERSCHLUSS",
      startTime: input.lockAt,
      deviceId,
      ...boltFieldsFor("VERSCHLUSS", input.lockAt),
    },
  });
  // Nacheinander und in der Reihenfolge der Zeit: gleiche Transaktion, gleiche `createdAt`-Folge
  // wie ein von Hand erfasstes Paar.
  if (input.kind === "session") {
    const locked = await lock();
    return { ok: true as const, opened: await open(), locked };
  }
  const opened = await open();
  return { ok: true as const, opened, locked: await lock() };
}

/** `break`: der Nachbar VOR dem Öffnen muss ein Verschluss sein — die Pause liegt IN einer
 *  Tragephase. `prev` zählt einen exakten Gleichstand mit (`lte`); der Nachtrag verlangt dagegen
 *  Abstand, sonst wären Verschluss und Öffnen zeitlich nicht zu unterscheiden. Das Gerät erbt der
 *  Wiederverschluss vom umgebenden Verschluss: wer die Phase unterbrach, hat denselben Gürtel
 *  wieder angelegt; ein anderes korrigiert `edit_entry`. */
async function insertBreak(tx: PrismaTx, userId: string, input: EntryGapInput) {
  const { prev, next } = await getKgNeighbors(userId, input.openAt, tx);
  if (!prev || prev.type !== "VERSCHLUSS") throw entryGuardError("GAP_NOT_LOCKED");
  if (prev.startTime >= input.openAt) throw entryGuardError("INVALID_ORDER");
  // Der Nachbar DANACH (falls es einen gibt) ist das Öffnen, das die Tragephase beendet. Der
  // Wiederverschluss muss davor liegen, sonst überspränge das Paar einen bestehenden Eintrag.
  if (next && next.startTime <= input.lockAt) throw entryGuardError("INVALID_ORDER");

  const lockDevice = (await tx.entry.findUnique({ where: { id: prev.id }, select: { deviceId: true } }))?.deviceId ?? null;
  return writePair(tx, userId, input, lockDevice);
}

/** `session`: der Nachbar VOR dem Verschluss darf KEIN Verschluss sein — die Tragezeit liegt in
 *  einer offenen Phase oder vor dem ersten Eintrag. Der Nachbar DANACH ist, falls vorhanden, der
 *  nächste Verschluss; die Öffnung des Paars muss davor liegen. Das Gerät bleibt leer: es gibt keine
 *  umgebende Tragephase, von der es sich ableiten liesse. */
async function insertSession(tx: PrismaTx, userId: string, input: EntryGapInput) {
  const { prev, next } = await getKgNeighbors(userId, input.lockAt, tx);
  if (prev?.type === "VERSCHLUSS") throw entryGuardError("GAP_NOT_OPEN");
  if (prev && prev.startTime >= input.lockAt) throw entryGuardError("INVALID_ORDER");
  if (next && (next.type !== "VERSCHLUSS" || next.startTime <= input.openAt)) throw entryGuardError("INVALID_ORDER");
  return writePair(tx, userId, input, null);
}

export async function createEntryGapForUser(
  user: Pick<User, "id" | "orgasmusArtenConfig" | "oeffnenGruendeConfig">,
  input: EntryGapInput,
  opts: { allowFuture?: boolean } = {},
): Promise<EntryGapResult> {
  const invalid = validateEntryGap(user, input, opts);
  if (invalid) return { ok: false, error: invalid };

  try {
    return await prisma.$transaction(async (tx) => {
      if (input.kind === "session") return await insertSession(tx, user.id, input);
      return await insertBreak(tx, user.id, input);
    });
  } catch (e: unknown) {
    return { ok: false, error: entryGuardCode(e) };
  }
}
