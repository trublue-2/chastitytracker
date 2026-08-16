/**
 * TEST-ONLY (liegt wie `prismaMock.ts` ausserhalb von `src/lib/`: Produktivcode braucht das nicht).
 *
 * Eine Aufgaben-Zeile in der Form, die `prisma.task.findUnique` mit `TASK_EDIT_INCLUDE` liefert —
 * die Basis für jeden Test, der `mcpEditTask` fährt.
 *
 * Als EINE Quelle, weil die Zeile mitwächst: `_count` kam mit `checkTaskUpdate` dazu und musste in
 * zwei Dateien nachgetragen werden, sonst wäre die Prüfung auf `undefined.requirements` gelaufen.
 * Jede weitere Spalte, die die Vorschau künftig liest, hat dasselbe Problem — und ein fehlendes Feld
 * meldet sich nicht als klarer Testfehler, sondern als Zugriff auf `undefined`.
 *
 * `now` ist der Nullpunkt, gegen den die Zeitpunkte gesetzt werden: die Aufgabe ist eben gestellt und
 * endet acht Stunden später. Als Argument und nicht als Konstante, weil jede Testdatei ihre eigene
 * Systemzeit stellt — eine hier eingebackene Zeit passte immer nur zu einer davon.
 *
 * Lose getypt: die Werte einer Zeile sind im Literal auf `null` verengt, und die Aufrufer setzen
 * gerade dort Daten ein (`wirksamAb`, `completedAt`, `withdrawnAt`).
 */
export function taskRow(now: Date, over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "t1", userId: "u1", title: "Wohnung staubsaugen", description: null,
    holdUntil: new Date(now.getTime() + 8 * 3600_000), holdDurationMin: null,
    isPunishment: false, penaltyReason: null,
    createdAt: now, startGraceMin: 30, wirksamAb: null, benachrichtigtAt: now,
    withdrawnAt: null, completedAt: null,
    // Mit Bedingungen zählt die Startfrist als Untergrenze der neuen Endzeit (siehe
    // `checkTaskUpdate`). Ein Test, der die andere Seite braucht, setzt hier 0.
    _count: { requirements: 1 },
    ...over,
  };
}
