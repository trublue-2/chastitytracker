import { prisma } from "@/lib/shared/prisma";
import {
  codeCheckPath, compareCodeReads, codeChangeNeedsReview,
  type CodeChangeState, type CodeChangeVerdict,
} from "@/lib/box/lockboxCodeCheck";
import { getControllerAudience, getKeyholdersOfUser } from "@/lib/auth/keyholder";
import { notifyControllers } from "@/lib/messages/notify";
import { isCodePhotoRevealed } from "@/lib/entries/queries";
import { structuredLog } from "@/lib/shared/serverLog";
import { detectLockboxCode } from "@/lib/kontrollen/verifyCode";
import { visionConfigured } from "@/lib/vision";

/**
 * Bildersafe, Issue #115: der Codewechsel-Vergleich beim Versiegeln — Laden, Lesen, Melden. Das
 * Urteil selbst steht datenbankfrei in `lockboxCodeCheck.ts`.
 *
 * Zwei Aufrufer, ein Vorgang:
 * - VOR dem Speichern fragt das Formular (`/api/bildersafe/code-check`), um bei demselben Code zum
 *   Verstellen aufzufordern. Das Ergebnis ist nur ein Hinweis — der Verschluss wird nie blockiert.
 * - NACH dem Speichern prüft der Server selbst (`runCodeChangeCheck`), schreibt das Urteil an den
 *   Verschluss und meldet `same`/`uncertain` der Keyholderin. Er verlässt sich nicht auf den Browser.
 *
 * Die zweite Hälfte folgt dem Muster des Geräte-Checks (`deviceCheckService.ts`): wer beim Speichern
 * `pending` setzt ({@link codeChangeCheckApplies} entscheidet das), dessen Lauf ersetzt es in JEDEM
 * Ausgang durch einen Endzustand — ein Urteil oder `error`.
 *
 * **Ohne Vision-Provider gibt es keine Prüfung** (Entscheidung zu #115): der lokale Tesseract-Rückfall
 * liest Zahlenschlösser praktisch nie sicher, und jede Versiegelung wäre „unsicher" — ein Posteingang
 * voller Fehlalarme. Mit Provider geht das Code-Foto an ihn, wie jedes andere geprüfte Foto; das ⓘ der
 * Foto-Prüfung steht deshalb auch am Code-Foto.
 */

/** Wie oft jedes Foto gelesen wird. „Sicher" heisst: alle Lesungen gleich (`stableRead`). */
const READS_PER_PHOTO = 2;

/**
 * Die Lesungen je Foto, kurz zwischengespeichert. Die Vorabprüfung im Formular und die Prüfung nach
 * dem Speichern lesen dieselben Bilder — ohne den Speicher kostete jede Versiegelung doppelt so viele
 * Vision-Aufrufe, und ein lokales Modell braucht für jeden rund sechs Sekunden. Geteilt wird auch der
 * noch LAUFENDE Aufruf (wie in `verifyCache.ts`): die beiden Prüfungen überlappen oft.
 *
 * Im Prozess-Speicher und nur für Minuten: er hält Lesungen (Ziffern) und soll weder einen Neustart
 * überleben noch wachsen. Ein Upload-Pfad ist eindeutig und unveränderlich, also ein sicherer Schlüssel.
 * Eine Lesung mit `null` bleibt NICHT liegen — `detectLockboxCode` meldet so auch einen Fehlschlag, und
 * der soll beim nächsten Mal echt wiederholt werden.
 */
const READ_CACHE_TTL_MS = 30 * 60_000;
const READ_CACHE_MAX = 200;
type ReadEntry = { reads: Promise<(string | null)[]>; expiresAt: number };
// globalThis-Singleton (wie prisma) — überlebt Next.js-HMR im Dev, in Prod schlicht Modul-Scope.
const store = globalThis as unknown as { __lockboxReads?: Map<string, ReadEntry> };
const readCache = (store.__lockboxReads ??= new Map<string, ReadEntry>());

function pruneReads(now: number): void {
  for (const [k, e] of readCache) if (e.expiresAt <= now) readCache.delete(k);
  while (readCache.size > READ_CACHE_MAX) {
    const oldest = readCache.keys().next().value;
    if (oldest === undefined) break;
    readCache.delete(oldest);
  }
}

function readTwice(imageUrl: string): Promise<(string | null)[]> {
  const now = Date.now();
  pruneReads(now);
  const hit = readCache.get(imageUrl);
  if (hit) return hit.reads;
  const reads = Promise.all(Array.from({ length: READS_PER_PHOTO }, () => detectLockboxCode(imageUrl)));
  readCache.set(imageUrl, { reads, expiresAt: now + READ_CACHE_TTL_MS });
  void reads.then(
    (r) => { if (r.includes(null)) readCache.delete(imageUrl); },
    () => { readCache.delete(imageUrl); },
  );
  return reads;
}

/** Nur für Tests: den Lese-Speicher leeren. */
export function clearCodeReadCache(): void {
  readCache.clear();
}

/** Wogegen verglichen wird: `excludeEntryId` ist der Verschluss, der gerade geprüft wird, `before`
 *  seine Zeit — ein nachgetragener älterer Verschluss vergleicht mit SEINEM Vorgänger. */
type PreviousScope = { excludeEntryId?: string; before?: Date };

/** Das zuletzt versiegelte Code-Foto des Subs. Nach `startTime`, nicht nach Anlegezeit: ein
 *  nachgetragener alter Verschluss ist nicht „der letzte". */
export async function previousSealedCode(
  userId: string,
  scope: PreviousScope = {},
): Promise<{ id: string; codeImageUrl: string; startTime: Date } | null> {
  const row = await prisma.entry.findFirst({
    where: {
      userId,
      type: "VERSCHLUSS",
      codeImageUrl: { not: null },
      ...(scope.excludeEntryId && { id: { not: scope.excludeEntryId } }),
      ...(scope.before && { startTime: { lt: scope.before } }),
    },
    orderBy: { startTime: "desc" },
    select: { id: true, codeImageUrl: true, startTime: true },
  });
  return row?.codeImageUrl ? { ...row, codeImageUrl: row.codeImageUrl } : null;
}

/** Der Vergleich selbst, ohne Schranken — die stellt der jeweilige Aufrufer, ebenso das Foto, gegen
 *  das verglichen wird. */
async function judgeCodeChange(
  userId: string,
  codeImageUrl: string,
  previous: { codeImageUrl: string } | null,
): Promise<CodeChangeVerdict> {
  if (!previous) return "first";
  if (previous.codeImageUrl === codeImageUrl) return "same";
  const [current, before] = await Promise.all([readTwice(codeImageUrl), readTwice(previous.codeImageUrl)]);
  return compareCodeReads(current, before);
}

/**
 * Die Vorabprüfung des Formulars. `null` = keine Prüfung — nicht dasselbe wie `uncertain`: dort wurde
 * geprüft und kein sicheres Ergebnis gefunden.
 *
 * **Nur gegen ein Foto, das der Sub schon sehen darf** (#111: nach einer erfassten Öffnung). Im
 * gewollten Ablauf ist das immer so — vor einem neuen Verschluss oder vor dem Versiegeln des
 * laufenden liegt die letzte Öffnung NACH dem letzten Siegel. Ohne diese Schranke wäre die Route
 * ein Orakel auf den GESPERRTEN Code: der Sub schriebe Ziffern auf einen Zettel, fotografierte ihn
 * und erführe aus „derselbe Code", ob er richtig geraten hat.
 */
export async function checkCodeChange(userId: string, codeImageUrl: string): Promise<CodeChangeVerdict | null> {
  if (!(await visionConfigured())) return null;
  const previous = await previousSealedCode(userId);
  if (previous && !(await isCodePhotoRevealed({ userId, startTime: previous.startTime }))) return null;
  return judgeCodeChange(userId, codeImageUrl, previous);
}

/**
 * Wird für dieses Code-Foto nach dem Speichern geprüft? Entscheidet BEIDES: den `pending`-Startwert
 * am Verschluss und ob {@link runCodeChangeCheck} danach überhaupt startet — eine Bedingung, nicht zwei.
 */
export async function codeChangeCheckApplies(codeImageUrl: string | null | undefined): Promise<boolean> {
  return !!codeImageUrl && (await visionConfigured());
}

/**
 * Die Prüfung NACH dem Speichern eines versiegelten Code-Fotos: ersetzt `pending` durch das Urteil
 * (oder `error`) und meldet `same`/`uncertain` der zugeordneten Keyholderin. Fire-and-forget wie
 * `runDeviceCheck` — wirft nie, beide Stufen (Prüfen, Schreiben) loggen ihr Scheitern getrennt.
 *
 * Gemeldet wird NUR echten Keyholderinnen, nicht der Admin-Rolle: die Vergleichsansicht, auf die die
 * Meldung zeigt, gibt es nur für sie (Entscheidung zu #115) — ein Admin ohne Zuordnung landete auf 404.
 * Die Meldung trägt KEINE Ziffern, weder im Posteingang noch in Push oder Mail — nur den Namen des
 * Subs und den Weg zur Vergleichsansicht mit beiden Fotos.
 */
export async function runCodeChangeCheck(p: { entryId: string; userId: string; codeImageUrl: string; startTime: Date }): Promise<void> {
  let result: CodeChangeState;
  try {
    const previous = await previousSealedCode(p.userId, { excludeEntryId: p.entryId, before: p.startTime });
    result = await judgeCodeChange(p.userId, p.codeImageUrl, previous);
  } catch (e) {
    structuredLog("lockbox-code", "check_failed", { entryId: p.entryId, error: (e as Error).message });
    result = "error";
  }
  try {
    await prisma.entry.update({ where: { id: p.entryId }, data: { codeChangeCheck: result } });
  } catch (e) {
    structuredLog("lockbox-code", "check_write_failed", { entryId: p.entryId, error: (e as Error).message });
    return;
  }
  if (!codeChangeNeedsReview(result)) return;

  try {
    const [{ controllers, username }, keyholders] = await Promise.all([
      getControllerAudience(p.userId),
      getKeyholdersOfUser(p.userId),
    ]);
    const assigned = new Set(keyholders.map((k) => k.id));
    const same = result === "same";
    await notifyControllers(p.userId, controllers.filter((c) => assigned.has(c.id) && c.id !== p.userId), {
      subjectKey: same ? "lockboxCodeSameSubjectKeyholder" : "lockboxCodeUncertainSubjectKeyholder",
      messageKey: same ? "lockboxCodeSameMessageKeyholder" : "lockboxCodeUncertainMessageKeyholder",
      params: { username },
      url: codeCheckPath(p.userId, p.entryId),
      inbox: { ref: { type: "lockboxCode", id: p.entryId }, once: true },
    });
  } catch (e) {
    structuredLog("lockbox-code", "notify_failed", { entryId: p.entryId, error: (e as Error).message });
  }
}
