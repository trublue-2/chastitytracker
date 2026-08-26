import { checkLayoutPatch, mergeLayout } from "@/lib/dashboardLayout";
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
 * Ein Keyholder ist im Tracker ein `admin`; für die Block-Rollen zählt genau diese Unterscheidung.
 */
const roleOf = (role: string) => (role === "admin" ? "keyholder" : "sub");

/**
 * Prüfen und Umwandeln rufen `checkLayoutPatch` je einmal auf, statt das Ergebnis zwischen beiden
 * zu merken. Eine Modulvariable dafür wäre ein Datenleck — sie lebt im Server-Prozess, nicht in
 * der Anfrage, und zwei gleichzeitig speichernde Nutzer schrieben sich gegenseitig den Wert in
 * die Zeile. Die Prüfung ist rein; sie zweimal zu laufen kostet nichts.
 */
export const PATCH = userSelfFieldRoute(
  "dashboardLayout",
  (value, session) => {
    const res = checkLayoutPatch(value, roleOf(session.user.role));
    return "error" in res ? res.error : null;
  },
  (value, session, current) => {
    const res = checkLayoutPatch(value, roleOf(session.user.role));
    if ("error" in res) return null; // unerreichbar — `validate` hat schon abgelehnt
    // Über den BESTAND legen, nicht ihn ersetzen: der Client schickt nur die Oberfläche, die er
    // gerade bearbeitet, und die Spalte hält alle vier. Begründung in `mergeLayout`.
    const layout = mergeLayout(current, res.layout);
    // `null` heisst „zurück auf Standard". Ein leeres Objekt wäre gleichbedeutend, aber eine leere
    // Spalte sagt es deutlicher und spart beim Lesen die Auflösung.
    const leer = Object.values(layout).every((s) => !s?.hidden?.length && !s?.order?.length);
    return leer ? null : JSON.stringify(layout);
  },
);
