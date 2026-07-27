/** Stufen des Kontroll-Geräte-Checks, wie sie in `Entry.deviceCheck` stehen (geschrieben von
 *  `checkDeviceInPhoto`, gelesen von Admin-Sicht und MCP). Bewusst hier und nicht in
 *  `detectDevice.ts`: die Lese-Seite braucht das Vokabular ohne die Vision-/Bild-Abhängigkeiten. */
export type DeviceCheckStatus = "ok" | "wrong" | "missing" | "error";

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
  // Enum durchzurutschen — dieselbe Härtung, die get_session bisher lokal machte (N-11).
  return effective === "ok" || effective === "wrong" || effective === "missing" || effective === "error"
    ? effective
    : null;
}
