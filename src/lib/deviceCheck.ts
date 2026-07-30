/** Stufen des Kontroll-Geräte-Checks, wie sie in `Entry.deviceCheck` stehen (geschrieben von
 *  `checkDeviceInPhoto`, gelesen von Admin-Sicht und MCP). Bewusst hier und nicht in
 *  `detectDevice.ts`: die Lese-Seite braucht das Vokabular ohne die Vision-/Bild-Abhängigkeiten.
 *
 *  `pending` = die Erkennung LÄUFT NOCH. Sie ist fire-and-forget und braucht je nach Backend
 *  Sekunden bis Minuten; wer direkt nach dem Einreichen liest, sah bisher `null` — denselben Wert
 *  wie „gar nicht geprüft". Ein Abruf eine Minute nach Einreichung meldete damit „kein Befund", ein
 *  Abruf eine Viertelstunde später „ok", ohne dass sich am Foto etwas geändert hätte. Dieselbe
 *  Trennung, die `verifikationStatus` seit jeher hat. Der Schreibpfad garantiert, dass `pending`
 *  IMMER durch einen Endzustand ersetzt wird — auch wenn nichts zu prüfen war (→ `null`). */
export const DEVICE_CHECK_STATUSES = ["pending", "ok", "wrong", "missing", "error"] as const;
export type DeviceCheckStatus = (typeof DEVICE_CHECK_STATUSES)[number];

/**
 * Normalisiert einen gespeicherten Geräte-Check für die Anzeige/Auswertung.
 *
 * „wrong" heisst: ein ANDERES Gerät war im Foto zu sehen — das setzt voraus, dass überhaupt eins
 * benannt werden konnte. Ohne erkanntes Gerät ist nichts festgestellt, und ein Nicht-Befund darf
 * nicht als Negativbefund gelesen werden; er gehört auf „error" (nicht prüfbar). Der Schreibpfad
 * erzeugt die Kombination `wrong` + `detected: null` nicht mehr — diese Funktion deckt die
 * Alt-Einträge in den bestehenden Datenbanken ab, ohne sie umzuschreiben (Issue #44).
 */
export function effectiveDeviceCheckStatus(status: string | null, detected: string | null): DeviceCheckStatus | null {
  const effective = status === "wrong" && !detected ? "error" : status;
  // Unbekannte Rohwerte (Alt-/Fremddaten) fallen auf null = „nicht geprüft", statt per Cast in den
  // Enum durchzurutschen — dieselbe Härtung, die get_session bisher lokal machte (N-11). Gegen die
  // Liste geprüft, nicht gegen eine zweite Aufzählung von Hand: eine neue Stufe wird an EINER Stelle
  // ergänzt, statt an zwei (wo das Vergessen der zweiten sie still auf `null` fallen liesse).
  return (DEVICE_CHECK_STATUSES as readonly string[]).includes(effective ?? "")
    ? (effective as DeviceCheckStatus)
    : null;
}
