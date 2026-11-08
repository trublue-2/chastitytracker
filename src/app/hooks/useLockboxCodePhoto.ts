"use client";

import { useEffect, useState } from "react";
import { fetchWithTimeout, UPLOAD_TIMEOUT_MS } from "@/lib/client/apiClient";
import { isCodeChangeVerdict, type CodeChangeVerdict } from "@/lib/box/lockboxCodeCheck";

/**
 * Was ein frisch aufgenommenes Bildersafe-Code-Foto braucht, bevor es versiegelt wird — geteilt vom
 * Verschluss-Formular und vom Formular „Code versiegeln":
 *
 * - **Lesbarkeit**: lokale Schärfeprüfung (`/api/detect-seal`, `readableOnly`). `false` blockiert
 *   das Versiegeln — ein unscharfes Foto belegt nichts.
 * - **Codewechsel** (Issue #115): Vergleich mit dem zuletzt versiegelten Foto
 *   (`/api/bildersafe/code-check`). Bei `same` blockiert es, bis der Sub neu fotografiert oder
 *   ausdrücklich „trotzdem" sagt — dann geht es durch, und die Keyholderin erfährt es über die
 *   Prüfung nach dem Speichern. Alles andere (`first`, `different`, `uncertain`, `null` ohne
 *   Vision-Provider) hält nichts auf.
 *
 * Beide Antworten tragen nur Urteile, nie Ziffern.
 */
export function useLockboxCodePhoto(codeUrl: string | null, enabled = true) {
  const [readable, setReadable] = useState<boolean | null>(null);
  const [codeChange, setCodeChange] = useState<CodeChangeVerdict | null>(null);
  const [checking, setChecking] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    setReadable(null);
    setCodeChange(null);
    setAcknowledged(false);
    setChecking(false);
    if (!enabled || !codeUrl) return;
    let cancelled = false;
    setChecking(true);
    // Beide Prüfungen sind Hinweise: ein Fehlschlag (auch das Zeitlimit) heisst „nicht geprüft".
    // Das lange Zeitlimit, weil der Codewechsel bis zu vier Vision-Aufrufe macht.
    const post = (url: string, body: object): Promise<Record<string, unknown>> =>
      fetchWithTimeout(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, UPLOAD_TIMEOUT_MS)
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => ({}));

    // true = lesbar · false = unlesbar · null = nicht geprüft → Versiegeln erlaubt
    const readability = post("/api/detect-seal", { imageUrl: codeUrl, readableOnly: true, lockbox: true })
      .then(({ readable }) => { if (!cancelled) setReadable(typeof readable === "boolean" ? readable : null); });
    const change = post("/api/bildersafe/code-check", { imageUrl: codeUrl })
      .then(({ result }) => { if (!cancelled) setCodeChange(isCodeChangeVerdict(result) ? result : null); });
    void Promise.all([readability, change]).finally(() => { if (!cancelled) setChecking(false); });

    return () => { cancelled = true; };
  }, [codeUrl, enabled]);

  const same = codeChange === "same";
  const sameUnconfirmed = same && !acknowledged;
  return {
    readable,
    checking,
    sameUnconfirmed,
    /** Derselbe Code, und der Sub hat „trotzdem versiegeln" gewählt. */
    sameAcknowledged: same && acknowledged,
    acknowledgeSame: () => setAcknowledged(true),
    /** Darf noch nicht versiegelt werden: unscharf, oder derselbe Code ohne „trotzdem". */
    blocksSubmit: readable === false || sameUnconfirmed,
  };
}
