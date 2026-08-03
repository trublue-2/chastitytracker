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
 * `adminUserId` zeigt auf das Keyholder-PRÜFUNGS-Formular (`/admin/users/:id/aktionen/pruefung`) —
 * der Weg, auf dem die Keyholderin eine Kontrolle FÜR den Sub erfasst. **Achtung:** dieses Formular
 * liest weder `code` noch `kommentar`; beides zusammen mit `adminUserId` zu übergeben, baut einen
 * Link, dessen Vorbelegung still verfällt. Der einzige Aufrufer (`NewEntrySheet`) übergibt darum
 * keinen Code. Wird das Formular je vorbelegbar, ist hier nichts zu ändern — nur diese Warnung zu
 * löschen. Das Aufgaben-Formular ist ein eigener Bauplatz — siehe {@link taskFormHref}.
 */
export function inspectionHref(
  code?: string | null,
  opts?: { kommentar?: string | null; categoryId?: string | null; adminUserId?: string },
): string {
  const params = new URLSearchParams();
  if (code) params.set("code", code);
  if (opts?.kommentar) params.set("kommentar", opts.kommentar);
  // Das ZIEL (v5.0.1): ohne es landet eine Trage-Kontrolle auf dem KG-Formular und der Sub reicht
  // ein Foto ein, das seine Kontrolle gar nicht beantwortet. Fehlt der Parameter, bleibt es beim
  // KG — das ist die Bedeutung von `categoryId: null` im ganzen Modell.
  if (opts?.categoryId) params.set("cat", opts.categoryId);
  const query = params.toString();
  return `${entryFormBase(opts?.adminUserId)}/pruefung${query ? `?${query}` : ""}`;
}

/** Wurzel der Erfassungs-Formulare: der Sub erfasst unter `/dashboard/new`, die Keyholderin für ihn
 *  unter `/admin/users/<id>/aktionen`. Dieselbe Umschaltung braucht `wearActionHref`
 *  (categoryConstants.ts) — hier steht sie EINMAL, statt in jedem Link-Bauplatz erneut. */
export function entryFormBase(adminUserId?: string): string {
  return adminUserId ? `/admin/users/${adminUserId}/aktionen` : "/dashboard/new";
}

/** Die Query-Schlüssel des Aufgaben-Formulars. Als Konstanten, weil sie an ZWEI Enden stehen: der
 *  Link setzt sie, die Seite liest sie aus ihren `searchParams`. Als lose Zeichenketten hätte ein
 *  Umbenennen auf einer Seite die Vorbelegung UND die Urteils-Verknüpfung still abgeschaltet — das
 *  Formular sendet weiter, nur eben als gewöhnliche Aufgabe. */
export const TASK_FORM_QUERY = { offenseRef: "offenseRef", anlass: "anlass" } as const;

/**
 * Link auf das Aufgaben-Formular des Keyholders.
 *
 * Mit `offenseRef` wird die Aufgabe zur STRAFE für dieses Vergehen: die Route legt dann Aufgabe und
 * Urteil zusammen an. `anlass` belegt nur das Anlass-Feld vor — geprüft wird ausschliesslich die ref,
 * und zwar auf dem Server.
 *
 * Die Query kommt wie bei {@link inspectionHref} aus `URLSearchParams`: ein Anlass-Text mit `&` oder
 * `#` zerlegte den Link sonst still.
 */
export function taskFormHref(
  userId: string,
  opts?: { offenseRef?: string | null; anlass?: string | null },
): string {
  const params = new URLSearchParams();
  if (opts?.offenseRef) params.set(TASK_FORM_QUERY.offenseRef, opts.offenseRef);
  if (opts?.anlass) params.set(TASK_FORM_QUERY.anlass, opts.anlass);
  const query = params.toString();
  return `/admin/users/${userId}/aktionen/aufgabe${query ? `?${query}` : ""}`;
}
