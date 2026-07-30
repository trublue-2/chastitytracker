import { prisma } from "@/lib/prisma";
import { gatherDeviceReferences } from "@/lib/deviceReferenceService";
import { checkDeviceInPhoto, type DeviceCheckResult } from "@/lib/detectDevice";
import { structuredLog } from "@/lib/serverLog";

/**
 * Der Kontroll-Geräte-Check als EIN Vorgang: Startwert, Ausführung und Endzustand.
 *
 * Der Check läuft erst NACH dem Commit des Eintrags (fire-and-forget, damit der Foto-Upload nicht auf
 * das Vision-Backend wartet — lokal ~6 s pro Bild). Damit ein Leser „läuft noch" von „kein Befund"
 * unterscheiden kann, steht in der Zeile bis dahin `deviceCheck: "pending"`.
 *
 * Daraus folgt eine Invariante, die nur als Paar funktioniert: **wer `pending` setzt, MUSS es durch
 * einen Endzustand ersetzen** — auch wenn nichts zu prüfen war und auch im Fehlerfall. Eine Zeile,
 * die für immer auf „läuft noch" steht, ist schlimmer als das mehrdeutige `null`, das dieses Feld
 * überhaupt ersetzt.
 *
 * Genau deshalb liegt beides hier und nicht in `entries/route.ts`: dort standen Startwert und
 * Endzustand ~180 Zeilen auseinander, verbunden nur dadurch, dass zwei getrennt hingeschriebene
 * Bedingungen zufällig übereinstimmten. {@link deviceCheckApplies} ist jetzt die eine Bedingung, die
 * beide Seiten lesen, und {@link runDeviceCheck} hat genau einen Rückschreib-Pfad, den jeder Ausgang
 * durchläuft. Was dieser Service NICHT garantieren kann, ist das Gelingen dieses Schreibens: bricht
 * es weg, bleibt die Zeile auf `pending` — dann steht es als eigene Logzeile da
 * (`kontrolle_check_write_failed`), statt still zu passieren.
 */

/**
 * Läuft für diesen Eintrag ein Geräte-Check? Entscheidet BEIDES: den `pending`-Startwert beim Anlegen
 * und ob {@link runDeviceCheck} danach überhaupt gestartet wird.
 *
 * Nur PRUEFUNG mit Foto. Bewusst UNABHÄNGIG vom Kontroll-Code (anders als die Code-Verifikation):
 * geprüft wird das Foto gegen das verschlossene Gerät, dafür braucht es keinen Code — auch eine
 * freiwillige Selbstkontrolle wird also geprüft.
 */
export function deviceCheckApplies(type: string, imageUrl: string | null | undefined): boolean {
  return type === "PRUEFUNG" && !!imageUrl;
}

/** Der zuletzt geladene KG-Eintrag, soweit der Geräte-Check ihn braucht. Wird als schon laufendes
 *  Promise übergeben, weil der Aufrufer denselben Eintrag noch für die Code-Verifikation braucht —
 *  einmal laden, zweimal nutzen. */
export type LockEntryForCheck = { type: string; deviceId: string | null } | null;

/**
 * Führt den Geräte-Check aus und schreibt sein ERGEBNIS — auf einem Pfad, den jeder Ausgang nimmt.
 *
 * `null` als Ergebnis heisst „nicht geprüft" und ist ein legitimer Endzustand: entweder ist der Sub
 * gar nicht verschlossen / hat kein Gerät hinterlegt (nichts zu prüfen), oder es ist kein
 * Vision-Provider konfiguriert (Feature aus). Ein Fehler unterwegs wird zu `status: "error"`
 * („wollte prüfen, ging nicht") — dieselbe Lesart wie in `checkDeviceInPhoto`.
 *
 * Wirft nie: der Aufrufer ist ein fire-and-forget-Kontext ohne jemanden, der einen Fehler behandeln
 * könnte. Beide Stufen (Prüfen, Schreiben) loggen ihr Scheitern getrennt — schlägt das Schreiben
 * fehl, bleibt die Zeile auf `pending`, und dann muss die Logzeile das sagen.
 */
export async function runDeviceCheck(opts: {
  entryId: string;
  userId: string;
  /** Das Kontroll-Foto. Bewusst OHNE Rotation: `checkDeviceInPhoto` kennt keine — die Formerkennung
   *  ist drehungsunempfindlich, anders als das Lesen von Ziffern (dort dreht `verifyKontrolleCode`). */
  photoUrl: string;
  lockEntry: Promise<LockEntryForCheck>;
}): Promise<void> {
  const { entryId, userId, photoUrl, lockEntry } = opts;
  let result: DeviceCheckResult | null = null;
  try {
    const lock = await lockEntry;
    // Nicht verschlossen / kein Gerät ⇒ es gibt nichts zu prüfen: `result` bleibt null, unten wird
    // "pending" auf `null` („nicht geprüft") zurückgesetzt.
    if (lock?.type === "VERSCHLUSS" && lock.deviceId) {
      const references = await gatherDeviceReferences(userId);
      result = await checkDeviceInPhoto(photoUrl, references, lock.deviceId);
    }
  } catch (e) {
    structuredLog("detect-device", "kontrolle_check_failed", { entryId, error: (e as Error).message });
    // Geprüft werden WOLLTE, ging aber nicht. Das erwartete Gerät ist hier nicht bekannt — der
    // Lookup ist ja gerade gescheitert.
    result = { status: "error", detected: null, expected: null };
  }
  try {
    await prisma.entry.update({
      where: { id: entryId },
      data: {
        deviceCheck: result?.status ?? null,
        deviceCheckNote: result?.detected ?? null,
        deviceCheckExpected: result?.expected ?? null,
      },
    });
  } catch (e) {
    structuredLog("detect-device", "kontrolle_check_write_failed", { entryId, error: (e as Error).message });
  }
}
