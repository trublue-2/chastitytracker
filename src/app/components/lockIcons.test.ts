import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Die beiden Schlösser müssen als DERSELBE Gegenstand lesbar bleiben — geschlossen und offen sind
 * zwei Stellungen einer Sache, nicht zwei Dinge. Sie teilen sich deshalb Korpus und Bügelform
 * Zeichen für Zeichen, und der Bügel ist offen um genau seine eigene Breite versetzt.
 *
 * Der Test hängt an der QUELLE, nicht am Bild: er liest die Datei und rechnet die Masse nach. Für
 * das Aussehen gibt es keinen sinnvollen automatischen Test — die Form ist am Bildschirm in fünf
 * Grössen ausgewählt worden. Hier hängt nur, dass die beiden zusammenbleiben.
 */
const QUELLE = readFileSync("src/app/components/lockIcons.ts", "utf8");

/** Die Zahlen aus `buegel(x)`: `M{x} 11V{legTop}a{r} {r} 0 0 1 {breite} 0v{...}`. */
const buegel = () => {
  const m = QUELLE.match(/d: `M\$\{x\} 11V([\d.]+)a([\d.]+) [\d.]+ 0 0 1 ([\d.]+) 0v([\d.]+)`/);
  expect(m, "Bügelpfad in lockIcons.ts nicht gefunden — Format geändert?").not.toBeNull();
  return { legTop: +m![1], r: +m![2], breite: +m![3], legLen: +m![4] };
};

const korpus = () => {
  const m = QUELLE.match(/\["rect", \{([^}]*)\}/);
  expect(m, "Korpus in lockIcons.ts nicht gefunden").not.toBeNull();
  return Object.fromEntries(
    [...m![1].matchAll(/(\w+):\s*"([^"]*)"/g)].map((p) => [p[1], +p[2] || p[2]]),
  ) as Record<string, number | string>;
};

const stellungen = () =>
  [...QUELLE.matchAll(/buegel\(([\d.]+)\)/g)].map((m) => +m[1]);

describe("Die beiden Schlösser bleiben ein Gegenstand", () => {
  it("teilen sich EINEN Korpus und EINE Bügelform", () => {
    // Nicht zwei `rect`- und zwei `path`-Literale: sie kämen sonst irgendwann auseinander. Beide
    // Zustände rufen dieselben zwei Funktionen.
    expect((QUELLE.match(/\["rect",/g) ?? []).length, "mehr als eine Korpus-Definition").toBe(1);
    expect((QUELLE.match(/\["path",/g) ?? []).length, "mehr als eine Bügel-Definition").toBe(1);
    expect(stellungen(), "es müssen genau zwei Stellungen sein: geschlossen und offen").toHaveLength(2);
  });

  // Was hier NICHT geprüft wird: dass der Versatz genau der Bügelbreite entspricht. Das wäre die
  // schönere Zahl, ist aber nicht die Bedingung — den Versatz bestimmt, wie weit das freie Ende
  // links am Korpus vorbeikommen muss, ohne aus dem Feld zu laufen. Ein Test darauf hätte eine
  // Ästhetik erzwungen, wo eine Geometrie gilt. Die drei Prüfungen darunter sagen dasselbe
  // sachlich: mittig zu, daneben offen, alles im Feld.

  it("geschlossen sitzt der Bügel mittig über dem Korpus", () => {
    const k = korpus();
    const { breite } = buegel();
    const [zu] = stellungen();
    const korpusMitte = (k.x as number) + (k.width as number) / 2;
    expect(zu + breite / 2, "der geschlossene Bügel steht nicht mittig").toBeCloseTo(korpusMitte, 5);
  });

  it("offen hängt das freie Ende NEBEN dem Korpus, der andere Schenkel steckt darin", () => {
    const k = korpus();
    const { breite } = buegel();
    const [, auf] = stellungen();
    const links = k.x as number;
    const rechts = links + (k.width as number);
    expect(auf, "das freie Ende läge über dem Korpus statt daneben — dort läuft der Spalt bei 14 px zu")
      .toBeLessThan(links);
    expect(auf + breite, "der zweite Schenkel steckt nicht mehr im Korpus").toBeGreaterThan(links);
    expect(auf + breite, "der zweite Schenkel ragt rechts aus dem Korpus").toBeLessThan(rechts);
  });

  it("bleibt im Inhaltsfeld und so hoch wie lucides Lock", () => {
    const k = korpus();
    const { legTop, r } = buegel();
    // Strichstärke 2 mit runden Enden: je 1 Einheit über den Pfad hinaus.
    expect(legTop - r - 1, "Scheitel ragt aus dem Feld").toBeGreaterThanOrEqual(1);
    expect((k.x as number) + (k.width as number) + 1, "Korpus ragt rechts aus dem Feld").toBeLessThanOrEqual(22);
    const [, auf] = stellungen();
    expect(auf - 1, "das freie Ende ragt links aus dem Feld").toBeGreaterThanOrEqual(2);
    // lucides `Lock` hat seinen Scheitel auf y=2 — das Paar darf daneben nicht kleiner wirken.
    expect(legTop - r, "Scheitelhöhe weicht von lucides Lock ab").toBeCloseTo(2, 5);
  });
});
