import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";

// Auf Modul-Ebene, weil der zweite Block unten (Landmarken) beides genauso braucht: über den Baum
// lesen statt eine Dateiliste pflegen, und vor jedem Vergleich die Kommentare entfernen — die
// Begründungen in diesem Baum enthalten die gesuchten Muster reihenweise selbst.
// Die Ausnahme `[^:]` rettet `https://…`: ohne sie kappte die Zeilen-Regel jede Zeile ab dem
// Doppelschrägstrich einer URL und liesse JSX dahinter verschwinden — ein Muster fände sich dann
// nicht mehr, und der Test wäre still zu lasch.
//
// Was sie NICHT kann: Zeichenketten unterscheiden. Ein `"<main>"` in einem String oder in
// `dangerouslySetInnerHTML` gilt hier als Code. Für diesen Baum ist das heute folgenlos (geprüft),
// aber die Erkennung ist eine Textsuche und keine Syntax-Analyse — wer sie schärfer braucht, nimmt
// einen Parser statt ein weiteres Muster.
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const ALL = readdirSync("src", { recursive: true, encoding: "utf8" })
  .filter((f: string) => f.endsWith(".tsx"))
  .map((f: string) => `src/${f}`)
  .sort();

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

  /**
   * Die Rubrik gehört `BlockHeading`; Formular-Beschriftungen sind eine eigene Familie.
   *
   * BEIDE Lautstärken von `BlockHeading`, nicht nur die leise: seit es ein `tone` hat, ist die
   * laute Fassung die für einen ganzen Block — und damit die, die man am ehesten von Hand
   * abschreibt. Ein Wächter, der nur die alte Farbe kennt, sieht der neuen beim Auseinanderlaufen
   * zu.
   *
   * Die LEISE Fassung ist an ihrer Farbe erkennbar (`faint` benutzt sonst niemand mit Versalien).
   * Die LAUTE teilt sich `uppercase tracking-wider text-foreground-muted` mit der
   * Feld-Beschriftung von `Input`/`Select`/`Textarea` und unterscheidet sich allein in der Grösse:
   * `text-neben` gegen `text-xs`. Deshalb die zwei Zweige — nach Farbe allein gesucht, meldete
   * dieser Test jedes Eingabefeld der App als Rubrik-Nachbau (sieben Treffer, alle falsch); nach
   * Grösse allein gesucht, verlor er die zwölf Altfälle, die ihre Grösse roh hinschreiben.
   */
  const MIT = (...klassen: string[]) => klassen.map((k) => `(?=[^"'\`]*${k})`).join("");
  const RUBRIK = new RegExp(
    `${MIT("uppercase", "tracking-wider")}[^"'\`]*(?:text-foreground-faint|text-neben[^"'\`]*text-foreground-muted)`
    + `|${MIT("uppercase", "tracking-wider", "text-neben", "text-foreground-muted")}[^"'\`]*`,
  );

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
    "src/app/dashboard/geraete/DevicesClient.tsx",
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

/**
 * Jede Seite hat GENAU EINE `<main>`-Landmarke — nicht keine, und nicht zwei.
 *
 * Anlass (#82): drei Dashboard-Seiten hatten gar keine. Der Screenreader bietet „zum Hauptbereich
 * springen" trotzdem an — die Ansage hängt am Angebot, nicht am Ziel. Der Sprung landete also
 * wieder am Seitenkopf, zwischen Navigation und Filterleiste. Auf `/dashboard/messages` genau vor
 * dem Weg, den er abkürzen soll.
 *
 * Warum das ohne Test wiederkommt: die Landmarke stammt in diesem Baum aus DREI Richtungen, und
 * welche gilt, hängt am Bereich.
 *
 *   1. `admin/users/[id]/layout.tsx` rendert ein `<main>`. Alles darunter erbt es und darf KEINS
 *      eigenes setzen.
 *   2. `dashboard/layout.tsx` und `admin/layout.tsx` rendern keins. Jede Seite darunter muss eins
 *      mitbringen.
 *   3. Manche bringen es nicht selbst, sondern über eine Hülle — `EntryActionFormShell` für die
 *      Erfassungs-Formulare, `SettingsForm` für die beiden Einstellungs-Seiten.
 *
 * Deshalb ist DIESELBE Hülle je nach Ort anders gebaut, und genau daran verrechnet man sich:
 * `AdminActionFormShell` (Regel 1) ist ein `div`, seine Schwester `EntryActionFormShell` (Regel 2)
 * ein `main`, und `StatsMain` ist trotz seines Namens ein `div`, das seine Landmarke von aussen
 * erwartet. Wer für eine neue Seite die falsche Nachbarschaft abschreibt, bekommt keine Landmarke
 * oder zwei — und beides sieht im Bild vollkommen normal aus.
 *
 * **Was ein statischer Test hier leisten kann — und was nicht.** Regel 1 hängt am Pfad, Regel 2
 * ebenso, Regel 3 an einem Tag im JSX: das ist lesbar. Nicht lesbar wäre eine Landmarke, die über
 * eine Laufzeit-Registry hereinkommt. Genau die gab es einmal — die Träger-Übersicht bezog ihr
 * `<main>` aus dem Block `statusAndStats`, den der Nutzer unter „Dashboard anpassen" abschalten
 * kann. Der Test führte diesen Fall als benannte Ausnahme, und die Ausnahme verdeckte einen
 * echten Defekt: mit ausgeblendetem Block hatte die Seite gar keinen Hauptbereich. Seither steht
 * die Landmarke in `dashboard/page.tsx` selbst, und es gibt keine Ausnahme mehr.
 *
 * Die Lehre dahinter gilt über diesen Test hinaus: **was das Gerüst einer Seite trägt, darf nicht
 * Teil ihres abschaltbaren Inhalts sein.** Eine Ausnahmeliste ist der richtige Ort für etwas, das
 * man nicht prüfen KANN — nicht für etwas, das man anders bauen sollte.
 *
 * Geprüft werden nur `/dashboard` und `/admin`. Die öffentlichen Seiten (Login, Passwort,
 * `/info`) stehen ausserhalb beider Bereichs-Layouts und holen ihre Landmarke aus `AuthScreen`;
 * sie folgen einer eigenen Regel und würden die hiesige nur verwässern.
 */
describe("Jede Seite hat genau eine Landmarke", () => {
  const PAGES = ALL.filter(
    (f) => (f.startsWith("src/app/dashboard/") || f.startsWith("src/app/admin/"))
      && f.endsWith("/page.tsx"),
  );

  it("findet die Seiten wirklich", () => {
    expect(PAGES.length, `nur ${PAGES.length} Seiten gefunden — die Suche ist kaputt`)
      .toBeGreaterThanOrEqual(45);
  });

  /** Der eine Bereich, dessen Layout die Landmarke für alle seine Seiten stellt. */
  const LAYOUT_STELLT_MAIN = "src/app/admin/users/[id]/";

  /** Hüllen, die die Landmarke ihrer Seite mitbringen — Name des Tags → wo er wohnt. */
  const HUELLEN_MIT_MAIN: Record<string, string> = {
    EntryActionFormShell: "src/app/components/AdminActionFormShell.tsx",
    SettingsForm: "src/app/dashboard/settings/SettingsForm.tsx",
  };

  /**
   * `as="main"` zählt als Landmarke — aber nur an den Bauteilen, die das Prop auch umsetzen. Ein
   * blosses `as="main"` irgendwo im Code färbte den Test sonst grün, ohne dass eine Landmarke
   * entsteht: `<Card as="main">` oder `<Section as="main">` reichen das Prop nirgends an ein
   * Element weiter, und die Seite hätte weiterhin keinen Hauptbereich.
   *
   * Ein drittes Bauteil mit diesem Prop gehört in diese Aufzählung — und die Prüfung darunter
   * merkt es an, wenn eines davon das Prop verliert.
   */
  const MIT_AS_PROP = ["DashboardBlock", "StatsMain"] as const;
  const SETZT_MAIN = new RegExp(`<main[\\s>]|<(?:${MIT_AS_PROP.join("|")})[^>]*\\sas="main"`);
  const src = (f: string) => stripComments(readFileSync(f, "utf8"));

  /**
   * Der Rumpf EINER benannten Export-Funktion, nicht die ganze Datei.
   *
   * `AdminActionFormShell.tsx` beherbergt beide Hüllen: die für den Keyholder-Reiter (ein `div`,
   * weil das Layout dort schon eine Landmarke stellt) und die für die Erfassungs-Seiten (ein
   * `<main>`). Eine Suche über die Datei fände das `<main>` der einen auch dann noch, wenn jemand
   * die Tags der beiden vertauscht — der Test bliebe grün, während zehn Erfassungs-Seiten ihre
   * Landmarke verlören und die Keyholder-Formularseiten eine zweite bekämen.
   */
  const exportBody = (file: string, name: string) => {
    const code = src(file);
    const at = code.search(new RegExp(`^export (?:default )?function ${name}\\b`, "m"));
    expect(at, `${name} ist in ${file} keine benannte Export-Funktion mehr`).toBeGreaterThanOrEqual(0);
    const next = code.slice(at + 1).search(/^export /m);
    return next === -1 ? code.slice(at) : code.slice(at, at + 1 + next);
  };
  const nutztHuelle = (code: string) =>
    Object.keys(HUELLEN_MIT_MAIN).some((tag) => code.includes(`<${tag}`));

  it.each(Object.entries(HUELLEN_MIT_MAIN))("%s bringt wirklich ein <main> mit", (tag, file) => {
    expect(
      exportBody(file, tag),
      `${tag} in ${file} rendert kein <main> mehr — aus HUELLEN_MIT_MAIN streichen`,
    ).toMatch(/<main[\s>]/);
    expect(
      PAGES.filter((p) => src(p).includes(`<${tag}`)),
      `keine Seite unter /dashboard oder /admin nutzt ${tag} noch — aus HUELLEN_MIT_MAIN streichen`,
    ).not.toHaveLength(0);
  });

  // Ohne diese Prüfung wäre die Liste die bequemste Stelle, an der der Test still stirbt: wer die
  // Erkennung kaputtmacht, bekommt eine grüne Suite UND eine Liste, die weiterhin nach Aufsicht
  // aussieht.
  it.each(MIT_AS_PROP)("%s setzt sein as-Prop wirklich um", (tag) => {
    const file = ALL.find((f) => f.endsWith(`/${tag}.tsx`));
    expect(file, `${tag} gibt es nicht mehr — aus MIT_AS_PROP streichen`).toBeDefined();
    expect(
      /as:\s*Tag|as\s*=\s*"div"/.test(readFileSync(file!, "utf8")),
      `${tag} nimmt kein \`as\`-Prop mehr entgegen — aus MIT_AS_PROP streichen, sonst zählt der `
        + `Landmarken-Test ein Prop, das nirgends ankommt`,
    ).toBe(true);
  });

  it.each(PAGES.filter((f) => f.startsWith(LAYOUT_STELLT_MAIN)))(
    "%s überlässt die Landmarke seinem Layout",
    (file) => {
      const code = src(file);
      expect(
        SETZT_MAIN.test(code) || nutztHuelle(code),
        `${file} setzt eine zweite Landmarke — `
          + `\`admin/users/[id]/layout.tsx\` rendert bereits ein <main>. Ein \`div\` nehmen `
          + `(so wie \`AdminActionFormShell\` und \`StatsMain\` es für genau diesen Ort tun).`,
      ).toBe(false);
    },
  );

  it.each(PAGES.filter((f) => !f.startsWith(LAYOUT_STELLT_MAIN)))("%s bringt seine Landmarke selbst mit", (file) => {
    const code = src(file);
    expect(
      SETZT_MAIN.test(code) || nutztHuelle(code),
      `${file} hat keinen Hauptbereich — weder \`dashboard/layout.tsx\` noch `
        + `\`admin/layout.tsx\` setzt einen. Ein \`<main>\` rendern, \`<DashboardBlock as="main">\` `
        + `nehmen oder eine Hülle, die eins mitbringt (${Object.keys(HUELLEN_MIT_MAIN).join(", ")}).`,
    ).toBe(true);
  });
});
