import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { heimdallEnabled } from "@/lib/constants";
import { boxIsLive } from "@/lib/boxStatus";
import { clampBoltTime, PENDING_LOCK_FILTER } from "@/lib/lockPending";
import { getLatestKgEntry } from "@/lib/queries";
import { applyEntryFulfilment, applyEntryAftermath } from "@/lib/entryFulfilment";
import { structuredLog } from "@/lib/serverLog";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * **Der Riegel entscheidet, nicht der Eintrag** (docs/riegel-konzept.md).
 *
 * Bei einem Träger mit `User.lockRequiresBolt` ist ein VERSCHLUSS-Eintrag erst der AUFRUF, die Box
 * zu schliessen. Er steht sofort in der Tabelle, gilt aber nicht (`boltConfirmedAt: null`, siehe
 * `lockPending.ts`); erst die Meldung „Riegel zu" VOLLZIEHT ihn — und zwar hier, an einer Stelle
 * für alle fünf Auslöser (Box-Ereignis, Box-Status, Sofort-Fälle beim Anlegen, das Abschalten des
 * Schalters durch die Keyholderin).
 *
 * Der Vollzug ist genau das, was auf dem gewöhnlichen Pfad beim Anlegen passiert — nur später:
 * Startzeit setzen, Anforderungen abhaken, Reinigungs-Kontrolle planen, Keyholder melden.
 */

/**
 * Wartet ein neuer Verschluss dieses Trägers auf den Riegel?
 *
 * Vier Gründe, aus denen er es NICHT tut — und jeder ist einer, in dem nie eine Meldung käme:
 *
 * 1. **Kein Heimdall / keine Box** — es gibt nichts, was den Riegel melden könnte. Der Eintrag
 *    hinge für immer.
 * 2. **Der Schalter ist aus** (Vorgabe) — Bestandsverhalten.
 * 3. **`keyInBox: false`** (Reise) — der Träger behält den Schlüssel, die Box bekommt bewusst gar
 *    kein Kommando (`boxCommandForEntry`). Auf einen Riegel zu warten, der nie zufährt, hiesse den
 *    Verschluss zu verweigern.
 * 4. **Die Box meldet den Riegel JETZT SCHON zu** — und meldet sich frisch. Dann ist der Übergang
 *    bereits vollzogen; ohne diesen Ausstieg käme nie ein neues Ereignis und der Aufruf bliebe
 *    hängen, obwohl alles stimmt.
 *
 * Der `tx`-Client wird durchgereicht, weil die Entscheidung in derselben Transaktion fällt wie das
 * Anlegen des Eintrags (TOCTOU — dieselbe Regel wie bei den Entry-Guards).
 */
export async function lockAwaitsBolt(
  tx: Db,
  userId: string,
  keyInBox: boolean | null,
  now: Date,
): Promise<boolean> {
  if (!heimdallEnabled()) return false;
  if (keyInBox === false) return false;
  const user = await tx.user.findUnique({ where: { id: userId }, select: { lockRequiresBolt: true } });
  if (!user?.lockRequiresBolt) return false;
  const boxes = await tx.boxStatus.findMany({ where: { userId }, select: { reportedLocked: true, lastSyncAt: true } });
  if (boxes.length === 0) return false;
  // Frische zählt: eine Box, die seit Stunden schweigt, meldet ihren Riegel „zu" aus einer Zeit vor
  // dem Öffnen — das wäre keine Bestätigung, sondern ein alter Stand.
  //
  // **Und bewusst NICHT über `boxIsPhysicallyLocked`**, obwohl das sonst überall die eine Fassung
  // der Riegel-Frage ist: es fällt bei einer Zeile ohne IST-Meldung auf das SOLL zurück, und das
  // SOLL ist die ABSICHT — genau das, was diese Regel gerade nicht mehr glauben will. Der Spiegel
  // hinkt ausserdem hinter dem Öffnen her (siehe `boxSollLocked`), eine Box könnte also unmittelbar
  // nach einer Reinigungsöffnung noch „soll zu" tragen; der Aufruf gälte dann sofort als vollzogen,
  // ohne dass je ein Riegel zufiel. Hier zählt allein eine ausdrückliche IST-Meldung.
  if (boxes.some((b) => b.reportedLocked === true && boxIsLive(b.lastSyncAt, now.getTime()))) return false;
  return true;
}

/**
 * Der Schalter der Keyholderin — und der Grund, warum er durch einen Dienst geht statt durch ein
 * rohes `update`: **das Abschalten vollzieht einen wartenden Aufruf sofort.**
 *
 * Ohne das bliebe der Verschluss für immer schwebend, denn den Riegel erwartet danach niemand mehr.
 * Und genau darin liegt der zweite Zweck des Schalters: er ist der NOTAUSGANG bei defekter Box —
 * der einzige bedienbare Weg, einen Aufruf zu vollziehen, wenn die Meldung nie kommt.
 */
export async function setLockRequiresBolt(userId: string, enabled: boolean): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { lockRequiresBolt: enabled } });
  if (!enabled) await commitPendingLock(userId, new Date());
}

/** Der wartende Aufruf in der Transaktion — für Guards, die ihn im selben Lesefenster brauchen.
 *  Die Sichten fragen stattdessen `pendingLockCallAt` (queries.ts). */
export const findPendingLockTx = (tx: Db, userId: string) =>
  tx.entry.findFirst({ where: { userId, ...PENDING_LOCK_FILTER }, select: { id: true } });

/**
 * Vollzieht den offenen Verschluss-Aufruf eines Trägers. `false` = es gab keinen.
 *
 * `at` ist der gemeldete Riegel-Zeitpunkt, wird aber auf `[createdAt, jetzt]` GEKLEMMT: eine
 * falsch gestellte Box-Uhr darf weder in die Zukunft datieren noch hinter den Aufruf zurück —
 * sonst rettete sie eine verpasste Frist oder erzeugte eine, die es nicht gab.
 *
 * Die Vorab-Prüfung läuft AUSSERHALB der Transaktion, und das ist keine Mikro-Optimierung: der
 * häufigste Aufrufer ist der Box-Status-Sync, und „Riegel zu" ist dessen DAUERZUSTAND — ohne diesen
 * Ausstieg öffnete jede Box bei jedem Sync eine Schreib-Transaktion, um nichts zu finden, und
 * serialisierte dabei (`connection_limit=1`) alles andere. Die Abfrage in der Transaktion bleibt
 * als die massgebliche stehen; der Vorablauf ist nur die Absage.
 *
 * Die Nacharbeiten laufen NACH dem Commit und fire-and-forget, genau wie auf dem Anlege-Pfad: eine
 * gescheiterte Meldung darf den vollzogenen Verschluss nicht mitreissen.
 */
export async function commitPendingLock(userId: string, at: Date): Promise<boolean> {
  const now = new Date();
  if (!(await prisma.entry.findFirst({ where: { userId, ...PENDING_LOCK_FILTER }, select: { id: true } }))) return false;

  const result = await prisma.$transaction(async (tx) => {
    const pending = await tx.entry.findFirst({
      where: { userId, ...PENDING_LOCK_FILTER },
      orderBy: { createdAt: "desc" },
    });
    if (!pending) return null;

    const effectiveAt = clampBoltTime(at, pending.createdAt, now);

    // VOR dem Update lesen: danach wäre dieser Eintrag selbst der jüngste KG-Eintrag. Dieselbe
    // Frage wie beim Anlegen — schliesst der Verschluss eine Reinigungspause ab?
    const previous = await getLatestKgEntry(userId, tx);
    const endsCleaningPause = previous?.type === "OEFFNEN" && previous.oeffnenGrund === "REINIGUNG";

    const entry = await tx.entry.update({
      where: { id: pending.id },
      data: { startTime: effectiveAt, boltConfirmedAt: effectiveAt },
    });

    // Was dieser Verschluss abhakt — Verschluss-Anforderung, Sperrzeit, Orgasmus-Fenster. Erst
    // JETZT, das ist der Kern der Regel: eine Anforderung ist mit dem Riegel erfüllt, nicht mit dem
    // Aufruf. `at = effectiveAt` ist Stichtag der Auswahl UND Erfüllungs-Zeitstempel, wie auf dem
    // Sub-Pfad (siehe `entryFulfilment.ts`).
    const requiredDeviceIds = await applyEntryFulfilment(
      tx, entry, { verification: null, targetWhere: null }, effectiveAt,
    );

    return { entry, requiredDeviceIds, endsCleaningPause, effectiveAt };
  });

  if (!result) return false;
  const { entry, requiredDeviceIds, endsCleaningPause, effectiveAt } = result;

  // Die Meldung an die Keyholder geht ERST JETZT raus — beim Aufruf wäre sie eine Behauptung
  // gewesen, die der Träger noch gar nicht eingelöst hat.
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
  await applyEntryAftermath(entry, {
    requiredDeviceIds,
    endsCleaningPause,
    notify: {
      actorUserId: userId,
      userId,
      username: user?.username ?? "User",
      type: "VERSCHLUSS",
      startTime: effectiveAt,
      note: entry.note,
      imageUrl: entry.imageUrl,
      keyInBoxDeclared: entry.keyInBox,
      deviceId: entry.deviceId,
      // VERSCHLUSS liest keine Auswahlliste (die gibt es für Öffnungsgründe und Orgasmus-Arten).
      reasonConfig: null,
    },
  });

  structuredLog("lockCommit", "bolt confirmed", { entryId: entry.id, at: effectiveAt.toISOString() });
  return true;
}

/**
 * {@link commitPendingLock} für die beiden BOX-Eingänge: der Vollzug ist dort eine Nacharbeit, und
 * die Box muss ihre Antwort in JEDEM Fall bekommen — scheitert der Sync, zieht sie ihr Kommando nie
 * ab. Der Fehler wird deshalb geschluckt und protokolliert.
 *
 * Als eigene Funktion, weil sonst beide Ingest-Routen denselben try/catch samt Begründung tragen —
 * und die dritte ihn abschriebe.
 */
export async function commitPendingLockSafe(userId: string, at: Date, source: string): Promise<void> {
  try {
    await commitPendingLock(userId, at);
  } catch (e) {
    console.error(`[${source}] commitPendingLock failed`, (e as Error).message);
  }
}
