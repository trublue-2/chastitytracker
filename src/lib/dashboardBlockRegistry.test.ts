import { describe, it, expect } from "vitest";
import de from "../../messages/de.json";
import en from "../../messages/en.json";
import { BLOCK_SURFACES, DASHBOARD_BLOCKS, blocksOf } from "./dashboardBlockRegistry";

/**
 * Wächter über das Register selbst.
 *
 * Die Regeln darin stehen sonst nur als Prosa im Docblock, und genau so ist sie gebrochen worden:
 * `alwaysOn` und `collapsible` waren zwei unabhängige Felder, und ein Block trug die
 * Zuklapp-Fähigkeit, für die die Anpassen-Ansicht keinen Schalter anbot.
 */
describe("das Block-Register", () => {
  const alle = BLOCK_SURFACES.flatMap((s) => blocksOf(s));

  it("kein Block ist gleichzeitig `alwaysOn` und `collapsible`", () => {
    // Ein Block, dessen Abwesenheit Konsequenzen hat, darf weder ausgeblendet NOCH zugeklappt
    // werden können — zugeklappt ist verschwunden. Wer eine überfällige Kontrolle wegklappt, sieht
    // sie so wenig wie einer, der sie ausgeblendet hat.
    const beides = alle.filter((b) => b.alwaysOn && b.collapsible).map((b) => `${b.surface}/${b.id}`);
    expect(beides).toEqual([]);
  });

  it("jede Id kommt auf ihrer Oberfläche genau einmal vor", () => {
    // Die Id landet in der gespeicherten Konfiguration. Zwei Blöcke mit derselben Id teilten sich
    // dort still Sichtbarkeit und Zuklapp-Vorgabe.
    for (const surface of BLOCK_SURFACES) {
      const ids = blocksOf(surface).map((b) => b.id);
      expect([...new Set(ids)]).toHaveLength(ids.length);
    }
  });

  it("jeder Block hat eine Beschriftung in beiden Sprachen", () => {
    // Ohne diesen Test fällt eine fehlende Beschriftung erst im Bearbeiten-Modus auf — und dort als
    // roher Schlüsselname, nicht als Fehler. `labelKey` ist ein blosser `string`, der Compiler
    // sieht es also auch nicht.
    for (const [lang, messages] of [["de", de], ["en", en]] as const) {
      const namespace = messages.dashboard as Record<string, string>;
      const fehlt = DASHBOARD_BLOCKS.filter((b) => !namespace[b.labelKey]).map((b) => b.labelKey);
      expect(fehlt, `\nFehlende Beschriftung in messages/${lang}.json (Namespace "dashboard"):\n  ${fehlt.join("\n  ")}\n`).toEqual([]);
    }
  });

  it("blocksOf trennt die Oberflächen sauber", () => {
    // Fängt den Block, der gar keiner Oberfläche zugeordnet ist oder eine vertippte trägt: er fiele
    // aus jedem `blocksOf` heraus und wäre in der Anpassen-Ansicht unsichtbar, ohne dass etwas
    // fehlschlägt.
    const summe = BLOCK_SURFACES.reduce((n, s) => n + blocksOf(s).length, 0);
    expect(summe).toBe(DASHBOARD_BLOCKS.length);
  });

  it("eine Oberfläche gehört als GANZE einer Rolle", () => {
    // `checkLayoutPatch` prüft die Rolle am ERSTEN Block einer Oberfläche und lehnt danach die
    // ganze Oberfläche ab. Wäre eine gemischt, hinge die Prüfung an der Reihenfolge.
    for (const surface of BLOCK_SURFACES) {
      const rollen = new Set(blocksOf(surface).map((b) => b.role));
      expect([...rollen]).toHaveLength(1);
    }
  });
});
