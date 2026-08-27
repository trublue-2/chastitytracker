import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

/**
 * Der Name der App und der Name der eingebauten Kategorie stehen an Orten, die kein TypeScript
 * importieren können — und genau dort blieben sie beim Umbau zurück.
 *
 * Was passiert ist: `APP_NAME` wurde eingeführt und elf Fundstellen umgestellt. Übersehen wurden
 * `manifest.webmanifest` (der Name unter dem Icon auf dem Home-Bildschirm), `sw.js` (der
 * Rückfall-Titel jeder Push-Meldung) und `offline.html`. Der Nutzer las damit im
 * Installations-Dialog „KG Tracker zum Home-Bildschirm hinzufügen" und bekam ein Symbol namens
 * „KG Tracker" — während die App daneben schon „Chastity Tracker" hiess. Dieselbe Klasse Fehler bei
 * der Kategorie: `scripts/seed.js` legte weiter `"KG"` an, und weil `docker-entrypoint.sh` erst
 * `migrate deploy` und dann den Seed fährt, hätte JEDE neue Instanz einen Admin mit dem alten
 * Namen bekommen — die Migration kommt nie wieder vorbei.
 *
 * Das ist die Fehlerart, vor der `pageMeasures.test.ts` in eigenen Worten warnt: zehn Stellen
 * umgestellt und neun nicht ist SCHLECHTER als gar keine Konstante, weil es aussieht, als sei der
 * Wert geregelt.
 *
 * Bauart nach `theme.test.ts`: die Konstanten werden als TEXT aus ihrer Datei gelesen, nicht
 * importiert. Beide Module ziehen über `deviceCategories.ts` den Prisma-Client nach sich, und ein
 * Wächter über statische Dateien soll dafür keine Datenbank-Attrappe brauchen.
 */

/** Liest `export const NAME = "…"` als Text — ohne das Modul (und damit Prisma) zu laden. */
function constFromSource(file: string, name: string): string {
  const m = new RegExp(`export const ${name} = "([^"]+)"`).exec(readFileSync(file, "utf8"));
  expect(m, `${name} steht nicht mehr als String-Literal in ${file}`).not.toBeNull();
  return m![1];
}

const APP_NAME = constFromSource("src/lib/constants.ts", "APP_NAME");
const KG_BUILTIN_NAME = constFromSource("src/lib/deviceCategories.ts", "KG_BUILTIN_NAME");

describe("Der App-Name steht überall gleich", () => {
  it("liest die Konstante wirklich", () => {
    // Untergrenze gegen eine kaputte Regex: ein leerer Treffer liesse alles darunter grün.
    expect(APP_NAME.length).toBeGreaterThan(3);
  });

  it.each([
    ["public/manifest.webmanifest", (s: string) => JSON.parse(s).name],
    ["public/manifest.webmanifest", (s: string) => JSON.parse(s).short_name],
  ])("%s trägt ihn", (file, pick) => {
    expect(pick(readFileSync(file, "utf8"))).toBe(APP_NAME);
  });

  it("der Rückfall-Titel einer Push-Meldung trägt ihn", () => {
    // `sw.js` läuft ausserhalb des Bundles und kann nichts importieren.
    const m = /let data = \{ title: '([^']+)'/.exec(readFileSync("public/sw.js", "utf8"));
    expect(m, "der Rückfall-Titel in public/sw.js sieht anders aus als erwartet").not.toBeNull();
    expect(m![1]).toBe(APP_NAME);
  });

  it("die Offline-Seite trägt ihn", () => {
    expect(readFileSync("public/offline.html", "utf8")).toContain(`<title>${APP_NAME} – Offline</title>`);
  });

  /**
   * Der eigentliche Wächter: irgendwo im Baum darf der ALTE Name nicht mehr stehen.
   *
   * Ohne diese Prüfung fängt der Test nur die vier Orte, an die heute jemand gedacht hat — und
   * der nächste vergessene Ort ist wieder unsichtbar. `src/data/changelog.json` ist ausgenommen:
   * dort steht Geschichte, und die wird nicht umgeschrieben.
   */
  it("der alte Name steht nirgends mehr", () => {
    const roots = ["src", "public", "scripts", "messages"];
    const files = roots.flatMap((root) =>
      readdirSync(root, { recursive: true, encoding: "utf8" })
        .map((f) => `${root}/${f}`)
        .filter((f) => /\.(ts|tsx|js|json|html|webmanifest)$/.test(f))
        .filter((f) => f !== "src/data/changelog.json")
        .filter((f) => !f.endsWith("appName.test.ts")),
    );
    expect(files.length, "die Dateisuche findet fast nichts — vermutlich kaputt").toBeGreaterThan(200);

    const stale = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      // Die Begründung an `APP_NAME` selbst DARF den alten Namen nennen — sie erklärt ihn.
      if (f === "src/lib/constants.ts") return false;
      return /KG[ -]Tracker/.test(src);
    });
    expect(stale, "diese Dateien führen noch den alten App-Namen").toEqual([]);
  });
});

describe("Die eingebaute Kategorie heisst überall gleich", () => {
  it("der Seed legt sie mit dem aktuellen Namen an", () => {
    // Reines CJS, kann nicht aus `src/` importieren — und läuft NACH der Migration, die den
    // alten Wert heilt. Was hier steht, korrigiert danach niemand mehr.
    expect(readFileSync("scripts/seed.js", "utf8")).toContain(`name: "${KG_BUILTIN_NAME}",`);
  });

  it("die Umbenennungs-Migration schreibt denselben Wert", () => {
    const sql = readFileSync("prisma/migrations/20260827080000_builtin_category_name/migration.sql", "utf8");
    expect(sql).toContain(`SET "name" = '${KG_BUILTIN_NAME}'`);
    // Und sie darf NUR den unveränderten Vorgabewert anfassen: ohne diese Bedingung überschriebe
    // sie die Wahl jedes Nutzers, der seine Kategorie längst selbst benannt hat.
    expect(sql).toContain(`AND "name" = 'KG'`);
  });
});
