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

/** Wo ein Vergehen im Urteils-Lebenszyklus steht. */
export type OffenseState =
  /** Erkannt, noch nicht beurteilt. */
  | "open"
  /** Die Keyholderin hat es fallengelassen. */
  | "dismissed"
  /** Bestraft, Strafe noch offen. */
  | "punished"
  /** Bestraft und erledigt. */
  | "done";

/**
 * Der Zustand eines Vergehens aus seinem Urteil — `undefined` heisst „kein Urteil".
 *
 * Hier und nicht im Service, weil dieselbe Ableitung an mehreren Stellen gebraucht wird und die
 * meisten davon kein Prisma importieren dürfen: die Träger-Sicht, das MCP-Ledger und die
 * Admin-Strafbuch-Seite (Client-Komponente). Jede liest sie von Hand aus `status` und `erledigtAt`
 * — und „offen" bedeutet dabei bereits dreierlei: unbeurteilt (Träger), unbeurteilt ODER
 * bestraft-nicht-erledigt (MCP), nicht-verworfen-und-nicht-erledigt (Admin). Ein fünfter Zustand
 * wäre an drei Orten zu finden, und die übersehene Stelle meldet sich nicht.
 *
 * STAND: umgestellt sind die TRÄGER-Sicht (`subOffenses.ts`) und das MCP-Ledger (`mcp/ledger.ts`:
 * `judge()` und die `pendingPenalty`-Zählung). Offen bleibt nur `StrafbuchClient.tsx`
 * (`punishedIds`/`dismissedIds`/`closedIds`): dessen Zeilenform trägt `done: boolean` statt
 * `erledigtAt` und müsste dafür erst angeglichen werden.
 *
 * Das Ledger zieht `punished` und `done` danach wieder auseinander — sein Vertrag nach aussen hat
 * beide als getrennte Felder (`judgment` + `done`). Das ist kein Widerspruch zur Zusammenfassung
 * hier: die ABLEITUNG ist dieselbe, nur die Darstellung ist feiner.
 */
export function offenseState(record: { status: string; erledigtAt: Date | null } | undefined): OffenseState {
  if (!record) return "open";
  if (record.status !== "PUNISHED") return "dismissed";
  return record.erledigtAt ? "done" : "punished";
}

/**
 * Passt die Nachricht „Strafe verhängt" noch zu ihrem Urteil?
 *
 * Sie trägt keine Kopie des Straftexts, sondern die Referenz — gelesen wird beim Anzeigen frisch aus
 * dem `StrafeRecord`. Wird ein Urteil von PUNISHED auf DISMISSED korrigiert, behält die Zeile ihre
 * id (`writeJudgment` upsertet auf `refId`), und die alte Nachricht zeigte plötzlich die
 * VERWERFUNGS-Begründung unter der Überschrift „Strafe verhängt". Dann ist sie nicht mehr wahr und
 * wird ausgeblendet — Zähler wie Liste, sonst stünde ein Badge über einem leeren Posteingang.
 *
 * ACHTUNG, das ist NICHT die Sichtbarkeitsregel des Trägers: sein Strafbuch (`subOffenses.ts`)
 * zeigt seit v5.1 jedes Vergehen samt Zustand, auch die fallengelassenen. Was hier ausgeblendet
 * wird, ist allein die nicht mehr zutreffende NACHRICHT.
 */
export function judgmentMessageStillApplies(record: { status: string }): boolean {
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
