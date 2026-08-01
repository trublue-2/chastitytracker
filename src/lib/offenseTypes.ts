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
 * `StoredOffenseType` hier) erbt die Vollständigkeit. Wer den Typ nur als Prop-Typ verwendet,
 * bekommt dagegen KEINEN Compile-Fehler: die Strafbuch-Seite listet feste JSX-Blöcke je Art, ohne
 * exhaustive Prüfung.
 *
 * Stand heute deckt sie sechs der elf kanonischen Arten ab — `unauthorized_opening`,
 * `late_control`, `rejected_control`, `auto_removed_control`, `unfulfilled_task` (je mit Urteil)
 * und `cleaning_limit` (nur Anzeige, mit „Rückgängig" statt Urteil). Es fehlen `wrong_device`,
 * `missed_orgasm`, `late_lock`, `cleaning_not_relocked` und `admin_password_change`, obwohl
 * `buildStrafbuch` sie ableitet und der MCP sie beurteilen kann. Wer eine zwölfte Art ergänzt, muss
 * die Anzeige von Hand nachziehen.
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
