/**
 * Die Taxonomie der Vergehen — kanonischer Name ↔ gespeicherter `StrafeRecord.offenseType`.
 *
 * Bewusst ein EIGENES, importfreies Modul (per Test abgesichert, gleiche Regel wie `codedError.ts`
 * und `entryFormRoute.ts`): die Tabelle stand vorher in `strafurteilService.ts`, und der zieht
 * Prisma. Damit war sie aus Client-Komponenten unerreichbar — und die Strafbuch-Seite führte
 * folgerichtig eine eigene, engere Union mit vier der neun gespeicherten Werte.
 *
 * Das ist dieselbe Fehlerklasse wie der KERN-BUG vom 11.07. (eine handgeführte Kopie der Taxonomie
 * verlor `auto_removed_control`). Das Ledger löste sie damals, indem es seine Liste aus dieser
 * Tabelle ABLEITET statt sie abzuschreiben; hier gilt jetzt dasselbe.
 *
 * REICHWEITE DER ZUSAGE — bewusst genau benannt, damit sich niemand auf mehr verlässt, als sie
 * trägt: Diese Tabelle bleibt vollständig, und wer aus ihr ABLEITET (`OFFENSE_TYPES` im Ledger,
 * `StoredOffenseType` hier) erbt die Vollständigkeit.
 *
 * Die Strafbuch-Seite deckt seit v5.0.3 alle Arten ab und hält das mit
 * {@link AssertCoversAllOffenses} fest — eine zwölfte Art hier bricht dort den Build, statt still
 * unsichtbar zu bleiben. Vorher waren es sechs von elf: `wrong_device`, `missed_orgasm`,
 * `late_lock`, `cleaning_not_relocked` und `admin_password_change` wurden abgeleitet und waren über
 * den MCP beurteilbar, erschienen aber in keiner Oberfläche. Genau diese Lücke ist der Grund für
 * die Zusicherung — sie fiel nur auf, weil jemand die Liste von Hand nachzählte.
 */

/** Canonical offense type → stored StrafeRecord.offenseType. */
export const STORED_TYPE = {
  unauthorized_opening: "OEFFNEN_ENTRY",
  late_control: "KONTROLLANFORDERUNG",
  rejected_control: "KONTROLLANFORDERUNG",
  // Eigener Typ statt "KONTROLLANFORDERUNG" — eine vermutete Entfernung (Kontrolle nicht
  // beantwortet, System hat automatisch geöffnet) ist etwas anderes als eine verspätete Einreichung.
  auto_removed_control: "AUTO_ENTFERNT",
  cleaning_limit: "REINIGUNG_LIMIT",
  wrong_device: "FALSCHES_GERAET",
  missed_orgasm: "ORGASMUS_ANWEISUNG",
  late_lock: "VERSCHLUSS_ANFORDERUNG",
  cleaning_not_relocked: "REINIGUNG_NICHT_VERSCHLOSSEN",
  unfulfilled_task: "AUFGABE",
  admin_password_change: "ADMIN_PASSWORT",
  // Orgasmus ohne deckende Direktive. Ob und wann das zählt, entscheidet die Regel
  // (`offenseRules.ts`) — dreistufig: aus / nur während einer Sperrzeit / immer.
  unauthorized_orgasm: "UNAUTHORIZED_ORGASM",
  // Von Hand notiert (`ManualOffense`), nicht abgeleitet. Die einzige Art ohne Regel-Schalter:
  // ein ausdrücklich notiertes Vergehen abzuschalten hiesse, die Notiz zu ignorieren.
  manual_offense: "MANUAL_OFFENSE",
} as const;

/**
 * MCP-kanonischer Vergehenstyp — die SCHLÜSSEL der Tabelle, nicht eine zweite Liste daneben.
 *
 * Vorher stand hier eine handgeschriebene Union plus `satisfies Record<…>` zur Gegenprüfung: zwei
 * Strukturen für dieselbe Information, ausgerechnet in dem Modul, dessen Zweck es ist, genau das
 * abzuschaffen. Abgeleitet kann eine neue Art gar nicht erst „vergessen" werden — Schlüssel und Wert
 * entstehen in derselben Zeile. `ledger.ts` leitet seine Liste seit dem KERN-BUG vom 11.07. schon so
 * ab; jetzt tut es die Union auch.
 */
export type OffenseCanonicalType = keyof typeof STORED_TYPE;

/**
 * Die gespeicherten Werte als Typ — ABGELEITET, nicht abgeschrieben.
 *
 * Das ist der Punkt des Moduls: die Strafbuch-Seite tippt ihren `offenseType` hierauf, statt eine
 * eigene Union zu pflegen. Kommt eine Art dazu, ist sie dort sofort erlaubt; verschwindet eine,
 * bricht der Aufrufer.
 */
export type StoredOffenseType = (typeof STORED_TYPE)[OffenseCanonicalType];

/**
 * Darf der SUB dieses Urteil sehen? Genau dann, wenn es eine verhängte Strafe ist.
 *
 * Ein `DISMISSED` ist die Entscheidung der Keyholderin, eine Anschuldigung fallenzulassen — sie soll
 * das können, ohne dass der Sub die Anschuldigung je gesehen hat. Das ist die teuerste Zusage der
 * Träger-Sicht, und deshalb steht sie hier als PRÄDIKAT und nicht als Kommentar in einem Konsumenten:
 * sie gilt für die Strafen-Liste (`openPenalties.ts`) UND für den Posteingang (`messageService.ts`),
 * dessen Referenz-Auflösung den Straftext bis v5.0.12 ohne jede Status-Prüfung ausgab. Ein Urteil,
 * das von PUNISHED auf DISMISSED korrigiert wird, behält seine Zeile (`writeJudgment` upsertet auf
 * `refId`) — die alte Nachricht zeigte danach die Verwerfungs-Begründung.
 *
 * Hier und nicht in `strafurteilService.ts`, weil `messageService` von dort nicht importieren kann
 * (der Service holt sich seinerseits `senderKindOf` von dort — es gäbe einen Zyklus). Dieses Modul
 * ist bewusst importfrei.
 */
export function isSubVisibleJudgment(record: { status: string }): boolean {
  return record.status === "PUNISHED";
}

/**
 * Die Vollständigkeits-Zusage einer Anzeige als Typ: `true`, solange `Covered` jede kanonische Art
 * enthält — sonst ein Objekttyp, der die fehlende Art im Feldnamen trägt. Eine Anzeige hängt sich
 * mit `const _: AssertCoversAllOffenses<…> = true;` daran; fehlt eine Art, nennt der Compiler sie
 * beim Namen, statt dass die Zeile stumm aus der Oberfläche fällt.
 *
 * Hier statt beim Aufrufer, weil die Zusage der TABELLE gehört: sie ist die Stelle, an der eine
 * zwölfte Art entsteht, und die Stelle, die der nächste Autor liest.
 */
export type AssertCoversAllOffenses<Covered extends OffenseCanonicalType> =
  [Exclude<OffenseCanonicalType, Covered>] extends [never]
    ? true
    : { fehlendeVergehensart: Exclude<OffenseCanonicalType, Covered> };
