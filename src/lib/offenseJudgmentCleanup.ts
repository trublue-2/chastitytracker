import type { Prisma } from "@prisma/client";
import { DISMISSAL_BODY_KEY, OFFENSE_REF_TYPE } from "@/lib/messageService";

/**
 * Ein Urteil FALLEN LASSEN — die Zeile weg und die Meldung, die sie behauptet hat, gleich mit.
 *
 * Zwei Wege führen hierher, und sie sind dieselbe Sache von beiden Enden gefasst:
 *
 * - `judge_offense action="reopen"` — die Keyholderin nimmt ihr Urteil zurück; die Strafaufgabe
 *   geht mit (`withdrawLinkedTask`).
 * - der Rückzug einer STRAFAUFGABE — dann geht das Urteil mit. Eine Strafe, die aus nichts als
 *   dieser Aufgabe bestand, ist ohne sie keine mehr; als Urteil stehen zu lassen hiesse, eine
 *   Strafe einzufordern, die niemand mehr vollziehen kann.
 *
 * WARUM die Meldung MITGELÖSCHT wird: `notifyOffenseDismissed` schreibt mit `once`, und eine
 * stehengebliebene Zeile unterdrückte damit die NÄCHSTE. Wer nach einem Fallenlassen erneut verwirft,
 * bliebe im Posteingang des Trägers unter dem Namen des ERSTEN Urteilenden stehen — mit dessen
 * Zeitpunkt und dessen Gelesen-Stand, also ohne jedes Zeichen für die zweite Entscheidung.
 *
 * Der Verlust ist keiner: die FESTSTELLUNG („ein Vergehen wurde festgestellt") bleibt stehen, sie ist
 * der Beleg. Verworfen wird nur die Auflösung, die es nicht mehr gibt.
 *
 * Eigenes Modul und nicht in `strafurteilService.ts`, wo der erste Aufrufer sitzt: der zweite ist
 * `taskService.ts`, und der Urteils-Dienst importiert von DORT (`checkTask`/`writeTask`). Andersherum
 * wäre es ein Zyklus.
 *
 * MEHRERE refs auf einmal, nicht eine je Aufruf: der Aufgaben-Weg hat eine Liste, und die Schleife
 * darüber wären zwei Rundreisen je Zeile in einer offenen Transaktion — auf einem Connector mit
 * `connection_limit=1` ist das die teuerste Form, die es gibt. So sind es immer zwei.
 *
 * @returns wie viele Urteile entfernt wurden — 0 heisst „da war keines".
 */
export async function dropJudgments(
  tx: Prisma.TransactionClient,
  userId: string,
  refIds: string[],
): Promise<number> {
  if (refIds.length === 0) return 0;
  // Erst LESEN, dann löschen: die „Strafe verhängt"-Meldung zeigt auf die id des URTEILS, nicht auf
  // die des Vergehens (zwei Namensräume, siehe `MessageRefType`), und nach dem Löschen gibt es sie
  // nicht mehr nachzuschlagen.
  const records = await tx.strafeRecord.findMany({
    where: { userId, refId: { in: refIds } },
    select: { id: true },
  });
  if (records.length === 0) return 0;
  await tx.strafeRecord.deleteMany({ where: { userId, refId: { in: refIds } } });

  // ZWEI Meldungen hängen an einem Urteil, und sie zeigen auf verschiedene Dinge.
  //
  // Die Verwerfung zeigt auf das VERGEHEN …
  await tx.message.deleteMany({
    where: {
      subjectUserId: userId,
      audience: "sub",
      bodyKey: DISMISSAL_BODY_KEY,
      refEntityType: OFFENSE_REF_TYPE,
      refEntityId: { in: refIds },
    },
  });
  // … die verhängte Strafe auf das URTEIL, und sie holt ihren Text LIVE von dort. Ohne diese
  // Löschung bliebe sie sichtbar im Posteingang stehen — mit leerem Straftext, weil die Zeile, aus
  // der er kam, weg ist, und weiter im Ungelesen-Zähler.
  await tx.message.deleteMany({
    where: {
      subjectUserId: userId,
      audience: "sub",
      refEntityType: "offense",
      refEntityId: { in: records.map((r) => r.id) },
    },
  });
  return records.length;
}

/**
 * Die Gegenrichtung: die Strafaufgabe eines Urteils zurückziehen.
 *
 * Steht neben {@link dropJudgments}, weil beide dieselbe Kopplung von je einem Ende fassen — wer die
 * eine Richtung ändert, sieht die andere.
 *
 * ROHES `updateMany` und bewusst NICHT `withdrawTask()`: das nimmt seinerseits ein offenes Urteil
 * mit. Wer hier „vereinfacht" und den Dienst aufruft, löscht bei einer REVISION das Urteil, das
 * `writeJudgment` gerade ersetzen will — und beim Wieder-Eröffnen zweimal dasselbe. Die beiden
 * Richtungen dürfen sich nicht gegenseitig aufrufen.
 *
 * AUCH EINE BEREITS ERFÜLLTE: gefiltert wird nur auf `withdrawnAt: null`, nicht auf den Fortschritt,
 * und `withdrawnAt` schlägt in der Anzeige jeden anderen Zustand — eine sichtbar erledigte Aufgabe
 * wird also still zu einer zurückgezogenen. Das ist gewollt und die einzig widerspruchsfreie Wahl:
 * „Rückgängig" LÖSCHT das Urteil, und die Aufgabe war nichts anderes als dessen Vollzugsform. Ohne
 * den Rückzug bliebe beim Sub eine Strafaufgabe ohne Strafe stehen; als „erfüllt" stehen zu lassen
 * behauptete, er habe eine Strafe abgeleistet, die niemand mehr verhängt hat. Was er GETAN hat, ist
 * damit nicht bestritten — der Nachweis bleibt an der Aufgabe. Bestritten ist nur, dass es eine
 * Strafe war.
 */
export async function withdrawLinkedTask(
  tx: Prisma.TransactionClient,
  refId: string,
  userId: string,
  now: Date,
): Promise<void> {
  await tx.task.updateMany({
    where: { userId, withdrawnAt: null, strafeRecords: { some: { refId } } },
    data: { withdrawnAt: now },
  });
}
