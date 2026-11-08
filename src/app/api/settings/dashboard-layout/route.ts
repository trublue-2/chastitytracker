import { checkLayoutPatch, isEmptySurface, mergeLayout } from "@/lib/ui/dashboardLayout";
import { controlsAnySub } from "@/lib/auth/keyholder";
import { userSelfFieldRoute } from "@/lib/userSelfField";

/**
 * Die Dashboard-Konfiguration ist eine USER-SELF-Präferenz: jeder stellt nur sein eigenes
 * Dashboard ein, niemand das eines anderen. Deshalb `userSelfFieldRoute` (Session-Auth) und nicht
 * `requireAdminApi` — und deshalb schreibt die Route ausschliesslich auf `session.user.id`.
 *
 * Die Rollen-Prüfung in `checkLayoutPatch` ist davon unabhängig und meint etwas anderes: sie
 * verhindert, dass sich jemand einen Block AUFLEGT, der einer anderen Rolle gehört. Das ist
 * Sicherheit, nicht Anzeige — eine fremde Block-Id wird abgelehnt, nicht still verworfen.
 *
 * Keyholder ist, wer `admin` ist ODER mindestens einen Sub steuert (Rolle `user` mit
 * Keyholder-Beziehung). Beides aus `role === "admin"` abzuleiten lehnte die Sicht jedes
 * Keyholders ohne Admin-Rolle als „fremd" ab. Wer Keyholder ist, hat zusätzlich seine eigene
 * Träger-Sicht („Meine Sicht") — darum die Liste.
 */
const ALL_ROLES = ["sub", "keyholder"] as const;

async function writableRoles(userId: string, role: string): Promise<readonly ("sub" | "keyholder")[]> {
  const isKeyholder = role === "admin" || (await controlsAnySub(userId));
  return isKeyholder ? ALL_ROLES : ["sub"];
}

/**
 * Prüfen und Umwandeln rufen `checkLayoutPatch` je einmal auf, statt das Ergebnis zwischen beiden
 * zu merken. Eine Modulvariable dafür wäre ein Datenleck — sie lebt im Server-Prozess, nicht in
 * der Anfrage, und zwei gleichzeitig speichernde Nutzer schrieben sich gegenseitig den Wert in
 * die Zeile. Die Prüfung ist rein; sie zweimal zu laufen kostet nichts. `transform` läuft erst nach
 * bestandener Prüfung und braucht die Rollen-Abfrage nicht noch einmal: es normalisiert nur.
 */
export const PATCH = userSelfFieldRoute(
  "dashboardLayout",
  async (value, session) => {
    const res = checkLayoutPatch(value, await writableRoles(session.user.id, session.user.role));
    return "error" in res ? res.error : null;
  },
  (value, _session, current) => {
    const res = checkLayoutPatch(value, ALL_ROLES);
    if ("error" in res) return null; // unerreichbar — `validate` hat schon abgelehnt
    // Über den BESTAND legen, nicht ihn ersetzen: der Client schickt nur die Oberfläche, die er
    // gerade bearbeitet, und die Spalte hält alle vier. Begründung in `mergeLayout`.
    const layout = mergeLayout(current, res.layout);
    // `null` heisst „zurück auf Standard". Ein leeres Objekt wäre gleichbedeutend, aber eine leere
    // Spalte sagt es deutlicher und spart beim Lesen die Auflösung.
    const leer = Object.values(layout).every(isEmptySurface);
    return leer ? null : JSON.stringify(layout);
  },
);
