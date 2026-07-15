/**
 * Die Erfassungs-/Bearbeitungs-Routen, auf denen die fixe Bottom-Nav der fixen Formular-Aktionsleiste
 * weicht. EINE Quelle für beide Seiten der Regel: `BottomNav` blendet sich hier aus, `BottomNavSpacer`
 * reserviert hier keinen Nav-Platz. Getrennt gepflegt würden die beiden zwangsläufig auseinanderlaufen.
 */
export function isEntryFormRoute(pathname: string): boolean {
  return pathname.startsWith("/dashboard/new") || pathname.startsWith("/dashboard/edit");
}
