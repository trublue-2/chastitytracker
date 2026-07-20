import type { Rotation } from "@/lib/constants";
import { verifyKontrolleCodeDetailed, type VerifyDetailedResult } from "@/lib/verifyCode";
import { structuredLog } from "@/lib/serverLog";

/**
 * Dedup-Layer über verifyKontrolleCodeDetailed. Der Live-Check im Formular (`/api/verify-kontrolle`)
 * und die serverseitige Re-Verifikation beim Speichern (`/api/entries`, PRUEFUNG) prüfen dasselbe
 * Foto mit identischen, server-abgeleiteten Parametern — zwei redundante Vision-Calls (Issue #17).
 *
 * Der Wrapper teilt den IN-FLIGHT Call (die beiden Aufrufe überlappen laut Log, ein reiner
 * Ergebnis-Cache würde sie nicht einsparen) und cacht das aufgelöste Verdikt kurz. „never trust
 * client" bleibt intakt: gecacht wird ausschliesslich ein ECHTES, server-berechnetes Vision-Verdikt,
 * und der Key bindet es an exakt (User, Bild, Code, Rotation, Siegel) — ändert sich einer dieser
 * server-vertrauenswürdigen Werte, ist es ein Cache-Miss und es wird real neu geprüft.
 */
const TTL_MS = 120_000;
/** Harte Obergrenze gegen unbegrenztes Wachstum. Keys sind pro Foto → im Normalbetrieb weit darunter. */
const MAX_ENTRIES = 200;

type CacheEntry = { promise: Promise<VerifyDetailedResult | null>; expiresAt: number };

// globalThis-Singleton (wie prisma) — überlebt Next.js-HMR im Dev, in Prod schlicht Modul-Scope.
const store = globalThis as unknown as { __verifyDedup?: Map<string, CacheEntry> };
const cache = (store.__verifyDedup ??= new Map<string, CacheEntry>());

/** Abgelaufene Keys entfernen; danach ältesten-zuerst kappen (Map bewahrt Insertion-Order). */
function prune(now: number): void {
  for (const [k, e] of cache) if (e.expiresAt <= now) cache.delete(k);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/**
 * Wie verifyKontrolleCodeDetailed, aber dedupliziert gleiche Prüfungen. `userId` scopt den Cache pro
 * Nutzer (Upload-Dateinamen sind ohnehin eindeutig — zusätzliche Isolation). `sealCode`/`rotation`
 * MÜSSEN server-abgeleitet sein (nie vom Client), sonst bräche das Dedup die Dual-Prüfung.
 */
export async function verifyKontrolleCodeDeduped(
  userId: string,
  imageUrl: string,
  expectedCode: string,
  rotation: Rotation,
  sealCode: string | null,
): Promise<VerifyDetailedResult | null> {
  const now = Date.now();
  prune(now);

  const key = `${userId}|${imageUrl}|${expectedCode}|${rotation}|${sealCode ?? ""}`;
  const existing = cache.get(key);
  if (existing) {
    structuredLog("verify", "cache_hit", {
      codeLen: expectedCode.length,
      rotation,
      sealChecked: sealCode != null && sealCode !== expectedCode,
    });
    return existing.promise;
  }

  const promise = verifyKontrolleCodeDetailed(imageUrl, expectedCode, rotation, sealCode);
  cache.set(key, { promise, expiresAt: now + TTL_MS });
  // null = Fehler/nicht konfiguriert/Load-Fehler → NICHT cachen, damit der Save-Pfad einen echten
  // Retry bekommt (verifyKontrolleCodeDetailed wirft nicht, der reject-Zweig ist nur Absicherung).
  void promise.then(
    (result) => { if (result === null) cache.delete(key); },
    () => { cache.delete(key); },
  );
  return promise;
}
