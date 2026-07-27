import { prisma } from "@/lib/prisma";
import { heimdallEnabled, BOLT_OPEN_EVENT_TYPES } from "@/lib/constants";

/**
 * Schlüssel-Nachweis aus der Box-Telemetrie (Spur 2) statt aus dem Box-Foto (Spur 1).
 *
 * Grundgedanke: Hat sich der Riegel seit dem letzten Nachweis-Punkt nicht bewegt, liegt der Schlüssel
 * noch dort, wo er beim letzten Nachweis lag — der Nachweis gilt fort, auch ohne neues Foto. Die
 * genauen Bedingungen stehen EINMAL, bei `deriveTelemetryKeyProof`.
 *
 * Das Foto bleibt trotzdem optional erfassbar, und die Rückfrage im Formular bleibt unangetastet.
 */

/** Woher der Schlüssel-Nachweis einer Zeile stammt — für den Keyholder sichtbar, weil ein Foto mehr
 *  zeigt (den Schlüssel selbst) als die Telemetrie (nur: der Riegel lag still). */
export type KeyProofSource = "photo" | "telemetry";

/** Ein Zeitpunkt, an dem sich am Riegel oder am Nachweis etwas entscheidet. Bewusst eine
 *  unterschiedene Union: welche Zusatz-Angabe zählt, hängt an der Art des Ankers. */
export type BoltAnchor =
  /** (Wieder-)Verschluss: STARTET eine Beweiskette, wenn der Sub den Schlüssel in der Box deklariert
   *  (`Entry.keyInBox`). Nur `true` zählt — liegt der Schlüssel laut Sub gar nicht in der Box (Reise)
   *  oder ist die Deklaration unbekannt (Alt-Eintrag, Admin-Pfad), sagt ein stillliegender Riegel
   *  nichts über den Schlüssel aus (dieselbe Schwelle, die `keySecured` im MCP an `keyInBox` legt).
   *  Ein Verschluss trägt nie selbst einen Telemetrie-Nachweis: dort bewegt sich der Riegel gerade. */
  | { kind: "lock"; id: string; at: Date; keyInBox: boolean | null }
  /** Kontrolle: der EINZIGE Anker, der einen Telemetrie-Nachweis tragen kann. Ihr Foto-Urteil
   *  (`Entry.keyDetected`) wirkt zugleich auf die Kette — `true` belegt sie neu, `false` reisst sie ab. */
  | { kind: "inspection"; id: string; at: Date; recordedAt: Date; keyDetected: boolean | null }
  /** Öffnung (Reinigungspause oder Session-Ende): der Schlüssel war greifbar. Die Kette ist ab hier
   *  tot, bis ein Verschluss oder ein Foto sie neu begründet. */
  | { kind: "open"; id: string; at: Date };

export type TelemetryKeyProofInput = {
  /** Alle Anker aller betrachteten Sessions (Reihenfolge egal — wird hier sortiert). */
  anchors: BoltAnchor[];
  /** `BoxEvent.at` aller Riegel-Öffnungen des Users ab dem frühesten Anker. */
  boltOpenedAt: Date[];
  /** Jüngster Box-Sync. Bei mehreren Boxen der ÄLTESTE — siehe `loadTelemetryKeyProof`.
   *  null = die Box hat noch nie gemeldet → keine Aussage möglich. */
  lastSyncAt: Date | null;
  /** Meldet die Box zuletzt einen physisch geschlossenen Riegel? (`reportedLocked ?? locked`, bei
   *  mehreren Boxen: ALLE.) Steht sie offen, fehlt zu dieser Öffnung womöglich das Ereignis — genau
   *  der Fall, den der Offline-Failsafe der Box erzeugt: nach `offlineOpenHours` ohne Sync öffnet sie
   *  sich selbst, ohne dass jemand die Meldung entgegennimmt. Dann ist der Ereignis-Strom als Beweis
   *  wertlos, und der Keyholder sähe sonst eine grüne Pille, während der MCP ihm für denselben
   *  Moment `keySecured: false` / "reported-open" meldet. */
  physicallyLocked: boolean;
};

/**
 * Die Einträge (IDs), deren Schlüssel-Nachweis sich aus der Telemetrie ergibt.
 *
 * Kern ist ein mitlaufender Cursor auf den letzten ECHTEN Nachweis (`provenSince`): der Verschluss mit
 * Schlüssel-Deklaration, oder eine Kontrolle, deren FOTO den Schlüssel gezeigt hat. Jede Kontrolle wird
 * gegen diesen Cursor geprüft, nicht gegen ihren blossen Vorgänger — sonst flickte eine Kette aus
 * Einzelfenstern über eine gemeldete Öffnung hinweg wieder zusammen: die Kontrolle direkt nach der
 * Öffnung fiele durch, die übernächste wäre wieder „belegt", obwohl seither niemand mehr nachgesehen
 * hat. Genau dieses stille Ja darf die Ableitung nie produzieren.
 *
 * Belegt werden ausschliesslich KONTROLLEN, und nur wenn ALLES zutrifft:
 *  1. Die Kette lebt: seit dem letzten Nachweis kam keine Öffnung (Reinigung, Session-Ende) und kein
 *     Verschluss ohne Schlüssel-Deklaration dazwischen.
 *  2. Die Box meldet zuletzt einen physisch geschlossenen Riegel (`physicallyLocked`).
 *  3. Die Box hat NACH dem beurteilten Zeitpunkt gemeldet (`lastSyncAt`). Über die Strecke ab dem
 *     letzten Sync ist die Box stumm — dort ist „unbewegt" keine Beobachtung, sondern eine Annahme.
 *     Massgeblich ist der SPÄTERE von eingetippter Zeit und `recordedAt`: die eingetippte Zeit gehört
 *     dem Sub, und ein rückdatierter Eintrag soll sich seine Frische nicht selbst ausstellen können.
 *  4. Im Fenster (letzter Nachweis, Kontrolle] liegt keine gemeldete Riegel-Öffnung.
 *
 * Ein Verschluss belegt sich nie selbst: dort wird der Schlüssel gerade hineingelegt, der Riegel
 * bewegt sich, und genau dafür gibt es das Foto. Ein Foto-Urteil „kein Schlüssel" reisst die Kette ab
 * — sonst erbte die nächste fotolose Kontrolle ein Ja aus einem beobachteten Nein.
 *
 * Die Ableitung ist bewusst LIVE (kein neues DB-Feld): Ereignisse, die die Box verspätet nachreicht,
 * korrigieren das Urteil beim nächsten Seitenaufbau von selbst. Ein einmal gespeichertes „OK" täte das
 * nicht. Und sie sagt nur JA oder „weiss nicht" — nie NEIN: aus fehlender Telemetrie ein „kein
 * Schlüssel" zu machen wäre eine Behauptung über den Sub, für die es keine Beobachtung gibt.
 *
 * BEKANNTE GRENZE: Eine Lücke MITTEN im Fenster (Box zwischendurch offline) ist aus den Daten allein
 * nicht erkennbar — `BoxStatus` führt nur den JÜNGSTEN Sync, keine Sync-Historie. Punkt 3 schliesst nur
 * die Lücke am Ende, Punkt 2 fängt den realistischen Fall (Offline-Failsafe → Box steht offen da, und
 * meldet das beim nächsten Sync). Reicht die Box eine offline erlebte Öffnung später nach (gepuffert,
 * mit eigenem `at`), heilt die Live-Ableitung sich selbst; verwirft sie das Ereignis und ist rechtzeitig
 * wieder zu, bleibt es unsichtbar. Siehe `docs/heimdall-box.md`.
 */
export function deriveTelemetryKeyProof({ anchors, boltOpenedAt, lastSyncAt, physicallyLocked }: TelemetryKeyProofInput): ReadonlySet<string> {
  const proven = new Set<string>();
  if (lastSyncAt === null || !physicallyLocked) return proven;
  const sorted = [...anchors].sort((a, b) => a.at.getTime() - b.at.getTime());
  const opens = boltOpenedAt.map((d) => d.getTime());
  const syncedUpTo = lastSyncAt.getTime();
  // Zeitpunkt des letzten ECHTEN Nachweises; null = Kette gerissen, bis einer sie neu begründet.
  let provenSince: number | null = null;
  for (const anchor of sorted) {
    if (anchor.kind === "open") { provenSince = null; continue; }
    if (anchor.kind === "lock") { provenSince = anchor.keyInBox === true ? anchor.at.getTime() : null; continue; }
    // Ein Foto entscheidet für sich selbst UND über die Kette — es hat hingesehen, die Telemetrie nicht.
    if (anchor.keyDetected !== null) { provenSince = anchor.keyDetected ? anchor.at.getTime() : null; continue; }
    const from = provenSince;
    if (from === null) continue;
    // Bewusst NICHT auf den eigenen Zeitpunkt vorgerückt: ein geerbter Nachweis begründet keinen
    // neuen. Das Fenster wächst ab dem letzten echten Nachweis weiter — eine Öffnung darin bleibt
    // damit für JEDE spätere Kontrolle sichtbar, statt nur die unmittelbar nächste zu treffen.
    const to = Math.max(anchor.at.getTime(), anchor.recordedAt.getTime());
    if (to > syncedUpTo) continue;
    if (opens.some((t) => t > from && t <= to)) continue;
    proven.add(anchor.id);
  }
  return proven;
}

/** Eine Einschluss-Session (`buildPairs`), aus der sich die Anker ergeben — strukturell, damit
 *  Sub-Dashboard und Keyholder-Detailseite dieselben Paare durchreichen können. */
export type LockSession = {
  verschluss: { id: string; startTime: Date; keyInBox?: boolean | null };
  /** Das Öffnen am Session-ENDE (`null` = läuft noch). Ein Anker, obwohl es keinen Nachweis trägt:
   *  ohne ihn liefe die Beweiskette über das Session-Ende hinweg in die nächste Session weiter. */
  oeffnen?: { id: string; startTime: Date } | null;
  kontrollen: { entryId: string | null; time: Date; recordedAt: Date; keyDetected?: boolean | null }[];
  interruptions?: {
    oeffnen: { id: string; startTime: Date };
    verschluss: { id: string; startTime: Date; keyInBox?: boolean | null };
  }[];
};

/** Die Riegel-Anker einer Session: Einschluss, erfasste Kontrollen, je Reinigungspause die Öffnung
 *  plus den Wiederverschluss, und das Öffnen am Ende. Nicht erfasste Kontroll-ANFORDERUNGEN
 *  (`entryId: null`) sind keine Anker — sie belegen keinen Riegel-Zustand. */
export function sessionBoltAnchors(session: LockSession): BoltAnchor[] {
  return [
    { kind: "lock", id: session.verschluss.id, at: session.verschluss.startTime, keyInBox: session.verschluss.keyInBox ?? null },
    ...session.kontrollen
      .filter((k) => k.entryId !== null)
      .map((k): BoltAnchor => ({ kind: "inspection", id: k.entryId!, at: k.time, recordedAt: k.recordedAt, keyDetected: k.keyDetected ?? null })),
    ...(session.interruptions ?? []).flatMap((i): BoltAnchor[] => [
      { kind: "open", id: i.oeffnen.id, at: i.oeffnen.startTime },
      { kind: "lock", id: i.verschluss.id, at: i.verschluss.startTime, keyInBox: i.verschluss.keyInBox ?? null },
    ]),
    ...(session.oeffnen ? [{ kind: "open" as const, id: session.oeffnen.id, at: session.oeffnen.startTime }] : []),
  ];
}

/** Kein Nachweis aus der Telemetrie — geteilte leere Menge für „keine Box / keine Session". */
export const NO_TELEMETRY_KEY_PROOF: ReadonlySet<string> = new Set<string>();

/**
 * Die Telemetrie EINES Subs laden und `deriveTelemetryKeyProof` darauf anwenden. Nimmt die Sessions
 * selbst entgegen (statt fertiger Anker), damit Sub- und Keyholder-Sicht denselben Aufruf teilen und
 * nicht auseinanderlaufen können.
 *
 * Bewusst über ALLE Sessions, nicht nur die laufende: das Urteil hängt an den Zeitpunkten, nicht an
 * „jetzt". Rechnete man nur die laufende Session, verschwände die Pille aus der Zeitleiste, sobald der
 * Sub aufschliesst — die Historie des Keyholders wäre nicht mehr reproduzierbar.
 *
 * Mehrere Boxen: `BoxEvent` trägt keine Box-Zuordnung, die Ereignisse aller Boxen liegen also in EINEM
 * Strom. Als Frische-Schranke gilt darum der ÄLTESTE `lastSyncAt` — nur wenn JEDE Box seit dem
 * beurteilten Zeitpunkt gemeldet hat, ist der Strom für dieses Fenster vollständig. Bei der einen Box
 * des Normalfalls ist das derselbe Wert.
 */
export async function loadTelemetryKeyProof(userId: string, sessions: LockSession[]): Promise<ReadonlySet<string>> {
  if (!heimdallEnabled()) return NO_TELEMETRY_KEY_PROOF;
  const anchors = sessions.flatMap(sessionBoltAnchors);
  // Vor dem ersten Verschluss MIT Schlüssel-Deklaration kann nichts belegt werden. Gibt es keinen,
  // gar nicht erst abfragen — sonst ist sein Zeitpunkt zugleich die untere Schranke der Ereignis-
  // Abfrage: ältere Öffnungen liegen in keinem Fenster, das je beurteilt wird.
  const declaredAt = anchors.filter((a) => a.kind === "lock" && a.keyInBox === true).map((a) => a.at.getTime());
  if (declaredAt.length === 0) return NO_TELEMETRY_KEY_PROOF;
  const firstAt = new Date(Math.min(...declaredAt));
  const [boxes, events] = await Promise.all([
    prisma.boxStatus.findMany({ where: { userId }, select: { lastSyncAt: true, reportedLocked: true, locked: true } }),
    prisma.boxEvent.findMany({
      where: { userId, type: { in: BOLT_OPEN_EVENT_TYPES }, at: { gte: firstAt } },
      select: { at: true },
    }),
  ]);
  const syncs = boxes.map((b) => b.lastSyncAt);
  const lastSyncAt = syncs.length > 0 && syncs.every((d) => d !== null)
    ? new Date(Math.min(...syncs.map((d) => d.getTime())))
    : null;
  return deriveTelemetryKeyProof({
    anchors,
    boltOpenedAt: events.map((e) => e.at),
    lastSyncAt,
    // `reportedLocked ?? locked` ist die etablierte IST-Lesart (siehe `boxIsPhysicallyLocked`);
    // Alt-Zeilen ohne IST-Meldung fallen wie überall auf das SOLL zurück.
    physicallyLocked: boxes.length > 0 && boxes.every((b) => (b.reportedLocked ?? b.locked) === true),
  });
}

/**
 * Das Schlüssel-Urteil EINER Zeitleisten-Zeile samt Quelle.
 *
 * Das Foto gewinnt, auch wenn es „kein Schlüssel erkannt" sagt: es zeigt den Schlüssel selbst, die
 * Telemetrie nur den stillliegenden Riegel. Ein Foto-Nein durch ein Telemetrie-Ja zu überschreiben
 * würde genau den Widerspruch verstecken, den der Keyholder sehen muss.
 *
 * Die Telemetrie tritt nur an die Stelle eines FEHLENDEN Fotos, nie an die eines unlesbaren: liegt ein
 * Box-Foto vor, dessen Urteil (noch) `null` ist — Erkennung läuft, oder sie war sich nicht sicher —,
 * bleibt die Zeile stumm wie bisher. Sonst zeigte ausgerechnet der Eintrag MIT Nachweisfoto sekundenlang
 * „Telemetrie", bis die Erkennung nachträgt.
 */
export function keyProofFor(
  entryId: string | null | undefined,
  photoDetected: boolean | null | undefined,
  boxImageUrl: string | null | undefined,
  telemetryProven: ReadonlySet<string>,
): { keyDetected: boolean | null; keyProofSource: KeyProofSource | null } {
  if (photoDetected != null) return { keyDetected: photoDetected, keyProofSource: "photo" };
  if (!boxImageUrl && entryId && telemetryProven.has(entryId)) return { keyDetected: true, keyProofSource: "telemetry" };
  return { keyDetected: null, keyProofSource: null };
}
