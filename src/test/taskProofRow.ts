/**
 * TEST-ONLY (liegt wie `taskRow.ts` und `prismaMock.ts` ausserhalb von `src/lib/`).
 *
 * Die Zeile, die `resolveTaskProof` aus `prisma.task.findFirst` liest — die Aufgabe als Hülle, die
 * Nachweise als geordnete Liste darin. Basis für jeden Test, der ein Werkzeug über „Aufgabe +
 * Position" adressiert (`review_task_proof`, `get_image` mit `source: "task_proof"`).
 *
 * Als EINE Quelle aus demselben Grund wie `taskRow.ts`: die HÜLLE gehört `taskProofRef.ts` und
 * wächst mit dessen `select` mit — sie stand hier bereits fünfmal in zwei Dateien, und ein
 * nachgetragenes Feld meldet sich nicht als klarer Testfehler, sondern als Zugriff auf `undefined`.
 *
 * Die NACHWEISE bleiben beim Aufrufer, weil `proofSelect` beim Aufrufer bleibt: die Sichtung liest
 * `submittedAt`/`reviewedAt`, der Bildabruf `imageUrl`/`imageExifTime` — und keiner darf sehen, was
 * der andere lädt. Eine gemeinsame Nachweis-Form täuschte eine Zeile vor, die es so nie gibt.
 */
export function taskProofRow(proofs: Record<string, unknown>[], over: Record<string, unknown> = {}) {
  // `requiresPhoto`/`requiresText` sind seit Issue #108 feste Spalten jeder Nachweis-Zeile; die
  // echte Abfrage liefert sie immer mit. Als Default je Proof (überschreibbar), damit ein Test für
  // einen reinen Text-Nachweis `requiresPhoto: false` setzen kann, ohne dass die übrigen Zeilen ihn
  // von Hand nachtragen müssen.
  const withKinds = proofs.map((p) => ({ requiresPhoto: true, requiresText: false, ...p }));
  return { id: "t1", title: "Wohnung staubsaugen", withdrawnAt: null, proofs: withKinds, ...over };
}
