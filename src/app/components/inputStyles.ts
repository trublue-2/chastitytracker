/** Geteilte Klassen der schmalen Inline-Eingaben in den Admin-Settings-Toggles (Zahl + Uhrzeit)
 *  und ihrer Beschriftungen. Eine Quelle für `NumberInput`, `TimeField` und `InlineSettingRow`,
 *  damit die Felder einer Zeile nicht auseinanderdriften. Rahmen und Polsterung sind für beide
 *  identisch — sie unterscheiden sich NUR in der Breite, siehe unten.
 *
 *  BEWUSST ohne eigene Fokus-Klassen: der Ring kommt aus der ungeschichteten `:focus-visible`-Regel
 *  in `globals.css`. Die stand hier vorher als `focus:outline-none focus:ring-2 focus:ring-foreground/20`
 *  und war in drei Punkten schlechter — `focus:` zeigt den Ring auch beim Mausklick, 20 % Deckung
 *  reissen den 3:1-Kontrast aus WCAG 2.4.11 nicht, und ein `ring` ist ein `box-shadow`, den der
 *  Windows-Kontrastmodus ersatzlos entfernt: dort wäre der Fokus danach unsichtbar gewesen. */
const inlineInputBaseCls = "border border-border rounded-lg px-2 py-1.5 text-sm text-foreground bg-surface-raised";

/** Zahl-Felder (`30`, `1`): zwei bis drei Ziffern, mehr Breite wäre nur Leerraum. */
export const inlineInputCls = `w-16 ${inlineInputBaseCls}`;

/** Uhrzeit-Felder brauchen mehr als die Zahl-Felder: `<input type="time">` zeigt „HH:MM" UND das
 *  browsereigene Uhr-Icon, das WebKit rechts einblendet. In `w-16` passt beides nicht — der Browser
 *  schneidet ab, und im Feld steht nur noch die Stunde („08" statt „08:00", gemeldet 08/2026 aus den
 *  Reinigungs-Fenstern). Die Breite gehört deshalb an die Eingabe-Art, nicht an die Aufruf-Stelle.
 *
 *  `w-28` statt knapper: im englischen Gebietsschema rendert dasselbe Feld „08:00 AM" — eine Breite,
 *  die nur für „08:00" reicht, verschiebt den Abschnitt bloss in die andere Sprache.
 *  `shrink-0`, weil die Felder in einer `flex`-Zeile neben einer Beschriftung stehen: ohne das
 *  schrumpfen sie auf schmalen Displays unter ihre Breite zurück und schneiden wieder ab. Umbrechen
 *  soll dort die Beschriftung, nicht die Uhrzeit. */
export const inlineTimeInputCls = `w-28 shrink-0 ${inlineInputBaseCls}`;

export const inlineLabelCls = "text-xs text-foreground-faint";

/** Der Icon-Knopf in der Kopfzeile (Feedback, Posteingang). EINE Quelle, damit die beiden Knöpfe
 *  nebeneinander nicht auseinanderlaufen — sie stehen zeichengleich in derselben Flex-Zeile. */
export const headerIconBtnCls =
  "p-2 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-raised transition";

/**
 * Die Kopfzeile selbst — aus demselben Grund eine Quelle wie der Knopf darin, nur eine Ebene höher:
 * `Header` (Träger) und `AdminHeader` bauen dieselbe Leiste, und wer zwischen den Bereichen wechselt,
 * sieht sie unmittelbar hintereinander. Driften Höhe, Rand oder `sticky` auseinander, springt beim
 * Wechsel die ganze Seite — und zwar erst beim Wechsel, also genau dort, wo niemand hinschaut.
 *
 * Klassen statt einer Hüllen-Komponente: der Träger-Kopf rendert seine rechte Gruppe nur angemeldet,
 * der Admin-Kopf immer. Eine gemeinsame Hülle müsste beide Fälle als Slots durchreichen und wäre
 * mehr Gerüst als Ersparnis. Was drift-gefährdet ist, sind die Masse — die stehen jetzt hier.
 */
export const headerBarCls = "bg-header-bg border-b border-header-border sticky top-0 z-30 pt-safe";
export const headerRowCls = "px-4 h-14 flex items-center justify-between gap-3";
export const headerActionsCls = "flex items-center gap-2";
export const headerBrandCls =
  "font-bold text-header-text hover:opacity-80 transition text-lg tracking-tight flex items-baseline gap-2 min-w-0";

/**
 * Der NAME in der Kopfzeile — bricht nie um.
 *
 * Der Name (`APP_NAME`) landete auf schmalen Geräten zweizeilig, sobald die Adresse daneben
 * Platz forderte; die Kopfzeile ist aber auf eine Zeilenhöhe festgelegt (`h-14`), also stand er
 * halb abgeschnitten da. Der Name hat Vorrang, die Adresse gibt nach — deshalb `shrink-0` hier
 * und `truncate` dort, zusammen mit `min-w-0` am Behälter. Das trägt auch den längeren Namen
 * ab v6 (`APP_NAME`): er bricht nicht um, die Adresse kürzt sich nur früher.
 */
export const headerNameCls = "whitespace-nowrap shrink-0";

/**
 * Die Adresse der Instanz neben dem Namen — leise, und sie gibt als Erste nach.
 *
 * Sie steht in BEIDEN Bereichen: wer mehrere Instanzen betreut, sieht der Kopfzeile sonst nicht an,
 * auf welcher er gerade ist. Vorher trug sie nur der Träger-Bereich.
 */
export const headerHostCls = "text-xs font-normal text-foreground-faint tracking-normal truncate";

/**
 * Eine Zeile der Verlaufs-Listen und ihre Klickfläche — geteilt von `EntryRow` und `WeightRow`.
 *
 * Aus demselben Grund hier wie die Kopfzeile darüber: die beiden stehen in der Eintragsliste der
 * Keyholderin UNMITTELBAR untereinander, chronologisch gemischt. Driften Polsterung oder
 * Hover-Fläche auseinander, sieht man es nicht in der einen Zeile, sondern im Rhythmus der Liste.
 *
 * Klassen statt einer Hüllen-Komponente: gemeinsam ist wirklich nur das Mass. Der INHALT beider
 * Zeilen teilt nichts (Gerätekategorie, Kontroll-Code und Orgasmus-Art auf der einen Seite, Gewicht,
 * Veränderung und der von der Waage gelesene Wert auf der anderen), und eine Hülle müsste ihn samt
 * Modal-Panel als Slots durchreichen — mehr Gerüst als Ersparnis (Muster: `CARD_BODY_STRIPED`).
 */
/**
 * Der linke und rechte Rand ALLER Zeilen und Rubriken innerhalb eines `Section`-Abschnitts.
 *
 * Solange jede Liste in einer Karte sass, garantierte deren Rahmen die Flucht: alles darin begann
 * an derselben Kante, egal welchen Innenabstand die Zeile mitbrachte. Ohne Karte entscheidet ihn
 * jede Zeile selbst — und dann liegen auf einem Bildschirm vier verschiedene linke Kanten
 * übereinander (gemessen: `px-0`, `px-1`, `px-4`, `px-5` auf der Statistik-Seite). Das ist der
 * Preis, den das Entfernen eines Rahmens verlangt: wofür er einstand, muss jetzt benannt sein.
 *
 * Der Wert ist klein, weil die Spalte ihren Seitenrand schon hat (`px-4` am Container). Was hier
 * steht, ist nur die optische Luft, damit Buchstaben nicht auf der Kante kleben.
 */
export const blockInsetCls = "px-1";

/**
 * Die Spalte einer Inhaltsseite — das LESEMASS, nicht die Fensterbreite.
 *
 * Das Redesign ist durchgehend gegen 390 px geprüft worden, und auf dem Handy stellt sich die Frage
 * nicht: die Spalte IST der Bildschirm. Auf dem Desktop stellte sie sich und blieb unbeantwortet.
 * Gemessen bei 1440 px: der Träger-Bereich stand auf 672 px und las sich gut, der Keyholder-Bereich
 * auf 1024 px — dieselben Zeilen, 976 px breit. Ein Name ganz links, ein Chevron einen Meter weiter
 * rechts, dazwischen nichts. Genau das ist mit „zerfliesst" gemeint.
 *
 * Warum die beiden trotzdem verschieden bleiben: der Keyholder-Bereich trägt Zeilen mit Bild,
 * Beschriftung UND Aktionsmenü, der Träger-Bereich nicht. Zwei Stufen derselben Skala statt einer
 * Zahl für alles — aber eben zwei benannte, nicht zwölf gewachsene.
 *
 * Beide sind bewusst schmaler als der Platz, den es gäbe. Eine Spalte, die den Platz füllt, weil er
 * da ist, ist keine Entscheidung.
 */
export const readingColCls = "w-full max-w-2xl mx-auto px-4";
export const wideColCls = "w-full max-w-3xl mx-auto px-4 sm:px-6";

/**
 * Verengung auf das LESEMASS innerhalb einer breiteren Spalte.
 *
 * Für Formularseiten im Keyholder-Bereich, dessen Layout auf `wideColCls` steht: ein Formular ist
 * Fliesstext mit Feldern und liest sich schmaler besser. Bewusst OHNE `px-*` — der Seitenrand kommt
 * von der Spalte darüber; ein zweiter machte die alte Doppel-Einrückung wieder auf.
 *
 * `AdminActionFormShell` trägt dieselbe Verengung fest eingebaut; das hier ist für die drei Seiten,
 * die keine Aktions-Hülle haben (Instanz-Einstellungen, neuer Benutzer, Sub-Einstellungen).
 */
// `w-full` gehört dazu: die Verengung landet oft als Kind eines Flex-Containers (die Reiter-Hülle
// `admin/users/[id]/layout.tsx` ist eine `flex flex-col`), und ein Flex-Kind ohne Breitenangabe
// schrumpft auf seinen INHALT statt auf das Mass. Gemessen: 364 px statt 672.
export const formColCls = "w-full max-w-2xl mx-auto";

export const listRowCls = `${blockInsetCls} py-2.5 flex items-center gap-3`;

/**
 * Die Zeit-Spalte, die eine Verlaufs-Zeile anführt.
 *
 * Feste Breite, damit die Arten darunter auf einer Kante stehen — und geteilt von `EntryRow` und
 * `WeightRow` aus demselben Grund wie `listRowCls` selbst: die beiden stehen in der Eintragsliste
 * der Keyholderin chronologisch gemischt untereinander. Zwei Zeitspalten, die um zwei Pixel
 * auseinanderliegen, sieht man nicht in der Zeile, sondern als Zittern in der Kolonne.
 */
export const listRowTimeCls = "w-11 flex-shrink-0 text-neben tabular-nums text-foreground-faint";
export const listRowButtonCls =
  "flex items-center gap-3 flex-1 min-w-0 text-left hover:bg-surface-raised/60 -mx-2 px-2 -my-1 py-1 rounded-lg transition";

/**
 * Die Dämpfung eines Bedienelements, das gerade NICHT verfügbar ist, aber trotzdem im Tab-Weg
 * bleibt (`aria-disabled` statt `disabled`).
 *
 * Warum es diese Bauform überhaupt gibt: ein `disabled` schaltet auch den Knopf ab, den der Nutzer
 * gerade gedrückt hält — wer sich mit „Weiter" bis zur letzten Seite klickt oder einen Block bis
 * ganz nach oben schiebt, verliert im selben Durchlauf den Fokus, weil ein deaktiviertes Element
 * ihn nicht halten kann. Der Browser gibt ihn dann an den Dokumentanfang, und man tabbt sich vom
 * Seitenkopf zurück. Mit `aria-disabled` bleibt der Knopf fokussierbar und ist trotzdem als nicht
 * verfügbar angesagt; die Handlung unterbleibt, weil der Handler sie abfängt. **Die Schranke im
 * Handler ist dabei Pflicht, nicht Zierde** — ein `aria-disabled`-Knopf ist weiterhin klickbar.
 *
 * Geteilt, weil vier Listen sie inzwischen brauchen und drei davon je einen eigenen Wert gewählt
 * hatten: die Blätter-Zeile, der Posteingang, seine Filterleiste und der Block-Stapel stehen teils
 * auf demselben Bildschirm.
 */
export const busyDimCls = "aria-disabled:opacity-50";

/**
 * Ein Symbol-Knopf in einer Zeile oder Kopfleiste — Schliessen, Menü, Entfernen.
 *
 * Die 24 px sind kein Gestaltungsmass, sondern das AA-Minimum für Trefferflächen (WCAG 2.5.8). Sie
 * stehen als `min-*`, damit das Symbol seine Grösse behält und nur die Fläche wächst: die
 * Zeilenhöhe der Listen darf sich davon nicht bewegen.
 */
export const iconButtonCls = "min-w-6 min-h-6 flex items-center justify-center";


/**
 * Der Abstand ZWISCHEN zwei gestapelten Blöcken.
 *
 * Die Zahl ist keine Geschmacksfrage: die Grenze muss deutlich grösser sein als der grösste Abstand
 * INNERHALB eines Blocks, sonst kehrt sich die Nähe um und das Auge findet die Grenze nicht mehr.
 * Genau das war der Fall — gemessen 24 px zwischen zwei Blöcken gegen 42 px Zeilenabstand in einem
 * Block. Mit 32/40 px liegt das Verhältnis wieder über 2:1.
 *
 * Mobil eine Stufe kleiner, und zwar aus Proportion, nicht aus Sparsamkeit: eine Grenze wird
 * relativ zu der Breite gelesen, die sie überspannt, und 40 px über 358 px wirken grösser als über
 * 640 px.
 *
 * Geteilt, weil es fünf Stapel gibt (Träger-Dashboard, Keyholder-Sub-Seite, Statistik und die zwei
 * Skelette) — und weil sie vorher DREI verschiedene Werte trugen. Ein Skelett mit anderem Abstand
 * als seine Seite springt im Moment des Austauschs sichtbar.
 */
export const blockStackCls = "flex flex-col gap-8 sm:gap-10";
