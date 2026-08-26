import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";

/**
 * Die geteilten Masse dürfen nicht neben sich selbst noch einmal von Hand stehen.
 *
 * Anlass: die Spaltenbreite (`readingColCls` / `wideColCls`) wurde benannt, weil auf dem Desktop
 * jede Seite ihre eigene erfand. Beim ersten Durchgang waren dann zehn Stellen umgestellt und
 * neunzehn nicht — und das ist SCHLECHTER als gar keine Konstante: es sieht aus, als sei das Mass
 * geregelt, während vier Fünftel der Seiten weiterhin nur zufällig gleich breit sind. Wer danach
 * an der Konstanten dreht, ändert zehn Seiten und lässt neunzehn stehen.
 *
 * Dasselbe war der Rubrik schon passiert: `BlockHeading` existiert, und daneben stand die gleiche
 * Klassenkette weiter im Baum — einmal sogar mit einer eigenen Laufweite (`tracking-[0.16em]`
 * gegen `tracking-wider`), die im Bild als schlampiger Satz ankam.
 *
 * Ein Test statt Disziplin, weil die Abweichung UNSICHTBAR ist: 672 px gegen 768 px fällt keinem
 * im Review auf, und auf 390 px — wogegen dieses Redesign entstanden ist — fällt sie gar nicht an.
 * Sie zeigt sich erst auf einem Bildschirm, den niemand beim Bauen offen hat.
 *
 * Bauart nach dem Vorbild von `theme.test.ts`: über den Baum lesen statt eine Dateiliste zu
 * pflegen (eine NEUE Datei wäre sonst still ungeprüft), Kommentare vorher entfernen (dieser
 * Kommentar hier enthält die verbotenen Muster selbst), und eine Untergrenze mitprüfen, damit eine
 * kaputte Suche nicht als grün durchgeht.
 */
describe("Seiten-Masse kommen aus einer Quelle", () => {
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  const ALL = readdirSync("src", { recursive: true, encoding: "utf8" })
    .filter((f: string) => f.endsWith(".tsx"))
    .map((f: string) => `src/${f}`)
    .sort();

  it("liest den Baum wirklich", () => {
    expect(ALL.length, `nur ${ALL.length} .tsx-Dateien gefunden — die Suche ist kaputt`)
      .toBeGreaterThanOrEqual(150);
  });

  /**
   * Wo eine eigene Spalte legitim ist — und nur, wo sie es WIRKLICH ist.
   *
   * Die Liste stand zuerst mit sechs Einträgen hier; drei davon konnten gar nicht greifen
   * (`inputStyles.ts` ist keine `.tsx`, `DashboardBlock` schreibt sein Mass als CSS-Variable). Eine
   * Ausnahme, die nichts ausnimmt, liest sich wie eine begründete Entscheidung und ist keine —
   * deshalb prüft der Test unten, dass jeder Eintrag noch etwas ausnimmt.
   */
  const SPALTE_ERLAUBT = new Set([
    // Öffentliche Seiten stehen bewusst ausserhalb der App-Spalte.
    "src/app/Footer.tsx",
    "src/app/info/[lang]/page.tsx",
    // Die Bauteil-Schau zeigt Bauteile nebeneinander; sie ist keine Seite der App.
    "src/app/admin/dev/components/page.tsx",
  ]);

  // `max-w-*` ZUSAMMEN mit `mx-auto` ist eine Spalte. `max-w-*` allein ist eine Kappung (ein
  // Knopf, ein Bild, eine Sprechblase) und bleibt erlaubt — sonst würde der Test Dinge verbieten,
  // die mit der Seitenbreite nichts zu tun haben.
  const SPALTE = /max-w-(?:xs|sm|md|lg|\d?xl)[^"'`]*\bmx-auto|mx-auto[^"'`]*\bmax-w-(?:xs|sm|md|lg|\d?xl)/;

  // Nach dem Umbau (#77) spannt KEINE Seite mehr eine Spalte auf: die beiden Bereichs-Layouts tun
  // es, und die eine Ausnahme — das Formular im breiten Keyholder-Bereich — hat mit `formColCls`
  // einen Namen. Beides steht in `inputStyles.ts` und wird von dieser Regex nicht getroffen (sie
  // sucht die ausgeschriebene Tailwind-Kette, nicht die Konstante). Genau so soll es sein: wer die
  // Kette wieder von Hand schreibt, fällt auf.
  it.each([...SPALTE_ERLAUBT])("%s ist zu Recht ausgenommen", (file) => {
    expect(
      stripComments(readFileSync(file, "utf8")),
      `${file} spannt keine eigene Spalte mehr auf — aus SPALTE_ERLAUBT streichen`,
    ).toMatch(SPALTE);
  });

  it.each(ALL.filter((f) => !SPALTE_ERLAUBT.has(f)))("%s spannt keine eigene Spalte auf", (file) => {
    expect(
      stripComments(readFileSync(file, "utf8")),
      `${file} schreibt sein Spaltenmass selbst — `
        + `\`readingColCls\` (Fliesstext, Formulare) oder \`wideColCls\` (Listen mit Bild und `
        + `Aktionsmenü) aus \`components/inputStyles.ts\` nehmen`,
    ).not.toMatch(SPALTE);
  });

  /** Die Rubrik gehört `BlockHeading`; Formular-Beschriftungen sind eine eigene Familie. */
  const RUBRIK = /uppercase[^"'`]*tracking-wider[^"'`]*text-foreground-faint|text-foreground-faint[^"'`]*uppercase[^"'`]*tracking-wider/;

  /**
   * Der Rückstand, Stand 26.08.2026 — diese Liste darf nur SCHRUMPFEN.
   *
   * Sie steht hier und nicht in einem Ticket, weil ein Ticket den fünfzehnten Nachbau nicht
   * verhindert. Der Test schon: wer eine neue Rubrik von Hand setzt, muss die Datei hier eintragen,
   * und spätestens dann fällt auf, dass es `BlockHeading` gibt.
   *
   * Zwei Familien stehen darin, und sie brauchen verschiedene Antworten. Die einen sind echte
   * Nachbauten der Block-Rubrik (`admin/page.tsx`, `TaskCard.tsx`, `WeightStatsCard.tsx` …) — die
   * gehören auf `BlockHeading`. Die anderen sind FORMULAR-Beschriftungen (`FormField.tsx`,
   * `NotificationToggles.tsx`), die zufällig dieselbe Klassenkette tragen: ein `<label>` über einem
   * Feld ist keine Abschnitts-Überschrift und hat in der Überschriften-Navigation nichts verloren.
   * Die brauchen ein eigenes benanntes Bauteil, nicht `BlockHeading`.
   */
  const RUBRIK_RUECKSTAND = new Set([
    "src/app/admin/page.tsx",
    "src/app/admin/users/[id]/VorgabeForm.tsx",
    "src/app/admin/users/[id]/einstellungen/NotificationToggles.tsx",
    "src/app/admin/users/[id]/einstellungen/page.tsx",
    "src/app/admin/users/[id]/strafbuch/StrafbuchClient.tsx",
    "src/app/components/AvatarMenu.tsx",
    "src/app/components/CalendarContainer.tsx",
    "src/app/components/FormField.tsx",
    "src/app/components/TaskCard.tsx",
    "src/app/components/WeightStatsCard.tsx",
    "src/app/dashboard/WeightReleaseCard.tsx",
    "src/app/dashboard/geraete/DevicesClient.tsx",
    "src/app/login/page.tsx",
  ]);

  it.each(ALL.filter((f) =>
    f !== "src/app/components/BlockHeading.tsx"
    && !f.startsWith("src/app/admin/dev/")
    && !RUBRIK_RUECKSTAND.has(f)
  ))(
    "%s baut keine eigene Rubrik",
    (file) => {
      expect(
        stripComments(readFileSync(file, "utf8")),
        `${file} setzt eine Rubrik von Hand — \`BlockHeading\` nehmen (es kann h2/h3/span)`,
      ).not.toMatch(RUBRIK);
    },
  );

  // Ohne diese Prüfung wäre der Rückstand die bequemste Stelle, an der der Test still stirbt: wer
  // die Regex kaputtmacht, bekommt eine grüne Suite UND eine Liste, die weiterhin nach Aufsicht
  // aussieht. Also muss jeder Eintrag darin auch wirklich noch ein Treffer sein.
  it.each([...RUBRIK_RUECKSTAND])("%s steht zu Recht im Rückstand", (file) => {
    expect(
      stripComments(readFileSync(file, "utf8")),
      `${file} baut keine Rubrik mehr von Hand — aus RUBRIK_RUECKSTAND streichen`,
    ).toMatch(RUBRIK);
  });
});
