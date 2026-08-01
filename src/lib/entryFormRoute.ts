/**
 * Die Erfassungs-/Bearbeitungs-Routen, auf denen die fixe Bottom-Nav der fixen Formular-Aktionsleiste
 * weicht. EINE Quelle für beide Seiten der Regel: `BottomNav` blendet sich hier aus, `BottomNavSpacer`
 * reserviert hier keinen Nav-Platz. Getrennt gepflegt würden die beiden zwangsläufig auseinanderlaufen.
 */
export function isEntryFormRoute(pathname: string): boolean {
  return pathname.startsWith("/dashboard/new") || pathname.startsWith("/dashboard/edit");
}

/**
 * Link auf das Prüfungs-Formular des Subs, wahlweise mit vorbelegtem Code und Keyholder-Kommentar.
 *
 * Die Query kommt IMMER aus `URLSearchParams`: ein Kommentar mit `&` oder `#` zerlegte den Link
 * sonst still. Leere Werte fallen weg statt als `?code=null` mitzureisen — eine Kontrolle ohne Code
 * (Gerät mit `requireInspectionCode: false`) führt aufs Formular ohne vorbelegtes Feld.
 *
 * Rückgabe ist ein RELATIVER Pfad. In-App-Links nutzen ihn so; die Mail stellt `appBaseUrl()` davor.
 * Der Push NICHT: `NativePushRouter` nimmt nur `url.startsWith("/")` an (Schutz vor Open-Redirect per
 * manipuliertem Payload) und verwirft eine absolute URL still. Wer hier „vereinheitlicht", killt das
 * Antippen der nativen Push-Meldung ohne Fehlermeldung.
 *
 * Das Keyholder-Formular (`/admin/users/:id/aktionen/pruefung`) ist bewusst NICHT hier: es nimmt
 * weder Code noch Kommentar entgegen, ein gemeinsamer Helfer würde die Vorbelegung still verschlucken.
 */
export function inspectionHref(
  code?: string | null,
  opts?: { kommentar?: string | null; categoryId?: string | null },
): string {
  const params = new URLSearchParams();
  if (code) params.set("code", code);
  if (opts?.kommentar) params.set("kommentar", opts.kommentar);
  // Das ZIEL (v5.0.1): ohne es landet eine Trage-Kontrolle auf dem KG-Formular und der Sub reicht
  // ein Foto ein, das seine Kontrolle gar nicht beantwortet. Fehlt der Parameter, bleibt es beim
  // KG — das ist die Bedeutung von `categoryId: null` im ganzen Modell.
  if (opts?.categoryId) params.set("cat", opts.categoryId);
  const query = params.toString();
  return `/dashboard/new/pruefung${query ? `?${query}` : ""}`;
}
