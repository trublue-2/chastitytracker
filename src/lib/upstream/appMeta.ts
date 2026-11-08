import { prisma } from "@/lib/prisma";

/** Fire-and-forget: aktueller Zeitstempel für einen AppMeta-Key. */
export function touchAppMeta(key: string): void {
  const value = new Date().toISOString();
  prisma.appMeta
    .upsert({ where: { key }, create: { key, value }, update: { value } })
    .catch(() => {});
}

/** Fire-and-forget: Zeitstempel einer echten Business-Aktion, gelesen vom Portal-sync-activity-Cron via AppMeta. */
export function markLastAction(): void {
  touchAppMeta("lastActionAt");
}

/**
 * Ein DEPLOY-STICHTAG: ab wann gilt eine Regel bzw. ein Verhalten auf DIESER Instanz?
 *
 * Warum es diese Sorte Datum überhaupt gibt: Ableitungen im Strafbuch rechnen bei jedem Aufruf über
 * die ganze Historie. Eine neue Regel würde damit rückwirkend Handlungen erfassen, die es zur Zeit
 * der Tat nicht betraf. Der Stichtag ist ein Merkmal des DEPLOYS, nicht des Codes — dasselbe Image
 * läuft auf vielen Instanzen, die es zu verschiedenen Zeitpunkten bekommen. Ein einkompiliertes
 * Datum stand zwangsläufig auf dem Tag EINER Instanz. Deshalb steht der Wert in `AppMeta`,
 * geschrieben von einer Migration beim ersten Boot dieser Instanz.
 *
 * Hier und nicht bei den Aufrufern, weil es inzwischen ZWEI davon gibt (Reinigungsfenster-Regel,
 * Vergehens-Meldungen) und beide dieselben vier Schritte gingen: ENV lesen, unlesbares Datum laut
 * melden statt zu verschlucken, DB-Zeile lesen, sonst `now`. Der dritte Stichtag wäre die dritte
 * Kopie gewesen. `logPrefix` bleibt ein Parameter: die Präfixe sind das Unterscheidungsmerkmal beim
 * Durchsuchen der Instanz-Logs und dürfen nicht zu einem gemeinsamen verschmelzen.
 *
 * Der Fallback ist immer der SICHERE Weg: `now`. Lieber ein Vergehen zu wenig als eines, das es
 * damals nicht gab.
 */
export async function deployCutoff(
  now: Date,
  o: { key: string; envVar: string; logPrefix: string; fallbackNote: string },
): Promise<Date> {
  const raw = process.env[o.envVar];
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    // Ein unlesbares Datum darf NICHT stillschweigend zu „gar kein Stichtag" werden — das erfasste
    // rückwirkend die ganze Historie. Laut melden und die DB-Zeile nehmen.
    console.error(`${o.logPrefix} ${o.envVar} ist kein gültiges Datum: "${raw}" — nutze den Stichtag aus der DB`);
  }

  const row = await prisma.appMeta.findUnique({ where: { key: o.key } });
  const stored = row ? new Date(row.value) : null;
  if (stored && !Number.isNaN(stored.getTime())) return stored;

  console.error(`${o.logPrefix} Kein Stichtag in AppMeta ("${o.key}") — ${o.fallbackNote}`);
  return now;
}


/**
 * Der Hostname dieser Instanz, wie ihn die Kopfzeile zeigt — `null`, wenn er nicht bestimmbar ist.
 *
 * Steht hier und nicht zweimal in den beiden Kopfzeilen: seit auch der Keyholder-Bereich ihn
 * zeigt, brauchten ihn zwei Dateien, und eine `new URL(...)`-Zeile mit eigenem `try` ist genau die
 * Sorte Code, die beim zweiten Mal leicht anders aussieht.
 *
 * `NEXTAUTH_URL` ist die Quelle, weil sie auf jeder Instanz gesetzt ist und die Adresse benennt,
 * unter der die App tatsächlich erreichbar ist — nicht die, unter der ein einzelner Aufruf kam.
 */
export function instanceHostname(): string | null {
  const raw = process.env.NEXTAUTH_URL;
  if (!raw) return null;
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
}
