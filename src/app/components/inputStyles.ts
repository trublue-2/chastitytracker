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
/** Ein leiser Link neben etwas Wichtigerem — Rücklink, Nebenweg, „mehr dazu".
 *
 *  Stand zeichengleich an drei Stellen (`AuthScreen`, `AdminActionFormShell`, `ChangeoverNotice`).
 *  Der Hover ist der Punkt, an dem solche Ketten auseinanderlaufen: im Baum stehen daneben acht
 *  Rücklinks mit `hover:text-foreground-muted` statt `hover:text-foreground` (Issue #101). */
export const quietLinkCls = "text-neben text-foreground-faint hover:text-foreground transition";

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
 * Die Spalte, die eine Verlaufs-Zeile anführt — Uhrzeit oder Datum, je nach Liste.
 *
 * `min-w`, nicht `w`. Die feste Breite von 44 px war auf „07:40" bemessen und hielt genau einen
 * Fall aus; zwei andere liefen aus ihr heraus, ohne dass etwas sie aufhielt (kein `overflow-hidden`
 * in `listRowCls`, kein Umbruchverbot hier):
 *
 * - **„31.08.2026, 05:40"** — eine Liste ohne Tages-Gruppierung zeigt das volle Datum. Zehn Ziffern
 *   brauchen bei 12 px rund 72 px; die Zeile stiess ins Zeichen daneben (gemeldet 31.08.2026).
 * - **„07:40 AM"** — `formatTime` setzt kein `hour12: false`, also bekommt `en-US` den Zusatz. Rund
 *   53 px, und weil ein Leerzeichen drin ist, brach die Spalte in ZWEI Zeilen um: für englische
 *   Nutzer war jede Zeile beider Eintrags-Listen doppelt hoch. Der ältere und stillere der beiden
 *   Fehler — er sah nach Gestaltung aus, nicht nach Überlauf.
 *
 * `min-w-11` behält den Absatz, an dem die Arten darunter ausgerichtet stehen, und `whitespace-nowrap`
 * lässt die Spalte wachsen, statt zu brechen. Damit trägt EINE Klasse alle drei Fälle — es gibt keine
 * zweite, bei der sich jemand für die falsche entscheiden könnte.
 *
 * Zur Ausrichtung: alle Zeilen einer Liste tragen dasselbe Format, `tabular-nums` gibt den Ziffern
 * dieselbe Laufweite. In `en-US` unterscheiden sich „AM" und „PM" um Haaresbreite, weil das keine
 * Ziffern sind — sichtbar ist das nicht, aber behauptet sei es auch nicht.
 */
export const listRowTimeCls =
  "min-w-11 flex-shrink-0 whitespace-nowrap text-neben tabular-nums text-foreground-faint";

export const listRowButtonCls =
  "flex items-center gap-3 flex-1 min-w-0 text-left hover:bg-surface-raised/60 -mx-2 px-2 -my-1 py-1 rounded-lg transition";

/**
 * Die getönte Fläche einer ganzen Zeile, die als Klickziel dient — der Gegenpart zu
 * `listRowButtonCls` für Zeilen, deren Klickziel ein GESTRECKTER Link ist und die die Tönung
 * deshalb nicht selbst tragen können.
 *
 * Der Ausbruch (`-mx-3 px-3`) gehört ins Mass, nicht an die Aufrufstelle: ohne ihn beginnt die
 * Fläche genau dort, wo der Inhalt beginnt, und Avatar wie Knöpfe kleben auf ihrer Kante
 * (gemeldet 27.08.2026). Mit ihm wächst die Fläche nach aussen, während der Inhalt auf der
 * Fluchtlinie von `blockInsetCls` stehen bleibt — die Polsterung ist um genau diese 4 px grösser
 * als der Gegenrand.
 */
export const rowHoverCls = `-mx-3 px-4 rounded-lg transition-colors hover:bg-surface-raised`;

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

/**
 * Die Aussehens-Zeile einer BESCHRIFTETEN Aktion an einem Block — Rückzug-Knopf, „Jetzt erfassen",
 * „Jetzt einschliessen".
 *
 * Sie stand bis eben in `admin/WithdrawButton.tsx`, und das war nicht nur unordentlich: die Datei
 * ist `"use client"`, während `LockRequestBanner` keine Direktive trägt und aus SERVER-Komponenten
 * gerendert wird (`DashboardAlerts`, `admin/page`). Eine schlichte Funktion aus einem Client-Modul
 * ist im Server-Render eine Client-Referenz und nicht aufrufbar. Hier, in einem reinen Modul, ist
 * sie es überall.
 */
const actionColorClasses = {
  inspect:   "text-[var(--color-inspect)] hover:bg-[var(--color-inspect-bg)]",
  sperrzeit: "text-[var(--color-sperrzeit)] hover:bg-[var(--color-sperrzeit-bg)]",
  orgasm:    "text-[var(--color-orgasm)] hover:bg-[var(--color-orgasm-bg)]",
  request:   "text-[var(--color-request)] hover:bg-[var(--color-request-bg)]",
  warn:      "text-[var(--color-warn)] hover:bg-[var(--color-warn-bg)]",
  neutral:   "text-foreground-muted hover:bg-surface-raised",
} as const;

/** Die Bedeutungen, die eine beschriftete Aktion tragen kann. Breiter als das, was ein einzelner
 *  Aufrufer braucht — `WithdrawButton` hält seine eigene Prop bewusst schmaler. */
export type ActionColorToken = keyof typeof actionColorClasses;

export function cardActionCls(colorToken: ActionColorToken): string {
  return `flex items-center gap-1.5 min-h-12 px-3 text-sm font-medium rounded-full active:scale-90 disabled:opacity-50 transition ${actionColorClasses[colorToken]}`;
}

/** Die kompakte, unbeschriftete Fassung derselben Aktion (nur ein Zeichen). */
export function iconActionCls(colorToken: ActionColorToken): string {
  return `flex items-center rounded-full active:scale-90 disabled:opacity-50 transition p-1.5 -m-1 ${actionColorClasses[colorToken]}`;
}

/**
 * Die Geometrie EINES Elements in der Zeile unter einer Übersichts-Karte — die Schnellaktionen
 * („Kontrolle anfordern", „Sperrzeit setzen", „Sofort aufschliessen") und die Schnellschalter.
 *
 * Nur Mass und Form; die Farben bringt jedes Bauteil selbst mit, weil sie dort die BEDEUTUNG tragen
 * (Kontrolle, Sperrzeit, Freigabe) und nicht die Bauart. Die Kette stand viermal wörtlich in vier
 * Dateien, deren Knöpfe unmittelbar nebeneinander stehen — driften Polsterung oder Radius, sieht
 * man das nicht am einzelnen Knopf, sondern an der Reihe.
 */
export const overviewChipCls =
  "flex items-center gap-1.5 text-xs font-medium border rounded-lg px-2.5 py-2 transition";

/**
 * Die GEFÜLLTE Aktion an einem Block — die Schwester von `cardActionCls`, und der Grund, warum es
 * beide gibt.
 *
 * `cardActionCls` färbt nur die Schrift und bringt seinen Grund erst im Hover mit. Auf dem Handy
 * gibt es kein Hover: dort blieb farbiger Text übrig, und der Nutzer fand das Bedienelement nicht
 * („wo muss ich klicken", Rückmeldung 27.08.2026). Wo eine Aktion die ANTWORT auf einen Block ist —
 * „Jetzt erfassen" unter einer laufenden Frist —, braucht sie eine Füllung.
 *
 * Sie tritt der runden Taste der unteren Leiste nicht ins Gehege: die ist rund, trägt die
 * Weltfarbe und nur ein Zeichen; diese hier ist rechteckig, trägt die BEDEUTUNGS-Farbe und nur ein
 * Wort. Kein `shadow` — Leuchten gibt es im Entwurf nur an der runden Taste.
 *
 * Es ist die Zeichenketten-Fassung von `Button variant="semantic"`, weil das Ziel ein `<Link>` ist:
 * ein `<button>` in einem `<a>` wäre ungültiges Markup und für den Screenreader zwei ineinander
 * gesteckte Bedienelemente.
 */
/** Ausgeschrieben, NICHT zusammengesetzt: ein `bg-btn-${token}` sieht Tailwind statisch nie —
 *  derselbe Fehler, den `Card.tsx` protokolliert hat („dass die Karten trotzdem Farbe hatten, war
 *  Zufall"). Teilmenge von `Button`s `semanticBgMap`: nur die Bedeutungen, die als BLOCK-Aktion
 *  vorkommen. */
const filledActionBg = {
  inspect:   "bg-btn-inspect",
  warn:      "bg-btn-warn",
  request:   "bg-btn-request",
  sperrzeit: "bg-btn-sperrzeit",
  orgasm:    "bg-btn-orgasm",
} as const;

export function filledActionCls(colorToken: keyof typeof filledActionBg): string {
  // Basis WÖRTLICH wie `Button` (`transition-all select-none active:scale-[0.97]`, Hover-Dämpfung
  // und Fokusring): sie stand hier ohne `focus-visible` und ohne Hover — damit wäre der einzige
  // gefüllte Knopf der App entstanden, den man mit der Tastatur nicht sieht.
  return `inline-flex items-center justify-center gap-2 min-h-12 px-5 rounded-lg text-sm font-medium transition-all select-none active:scale-[0.97] hover:opacity-90 active:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring text-btn-primary-text ${filledActionBg[colorToken]}`;
}

/**
 * Die Kante links an etwas, das eine Frist gerissen hat.
 *
 * Sie stand wörtlich an drei Stellen (`OffenseCard`, beide Alarm-Banner) — dieselbe Geste an
 * derselben Farbe, dreimal abgeschrieben. Zwei Pixel und nicht vier: die vierte Breite gehört
 * `PairRow`, wo sie eine KARTE markiert und nicht eine Zeile.
 */
export const warnEdgeCls = "border-l-2 border-warn pl-3";

/**
 * Ein Symbol-Knopf in einer BEARBEITEN-Zeile — heute das Auge in `DashboardStack`.
 *
 * Die Kette stand einmal viermal in derselben Datei, und eine Kopie hatte `disabled:opacity-40`
 * bereits verloren. Knöpfe in einer Zeile, deren Geometrie nur noch zufällig übereinstimmt, sind
 * kein Stil-Thema: sie sind die Trefferflächen einer Reihe, und eine davon anders zu machen merkt
 * niemand beim Lesen.
 */
export const metaRowButtonCls =
  "size-9 shrink-0 rounded-lg flex items-center justify-center text-foreground-muted hover:bg-surface-raised transition disabled:opacity-40";

/**
 * Die BESCHRIFTETE Fassung von {@link metaRowButtonCls} — derselbe Knopf, aber mit einem Wort statt
 * nur einem Zeichen, und deshalb mitwachsend statt quadratisch (`min-h-9 px-2` statt `size-9`).
 *
 * Dasselbe Paar wie `cardActionCls` / `iconActionCls`. Es steht hier und nicht in der Komponente,
 * weil die Pille in derselben Zeile sitzt wie das Auge: die Höhe der beiden ist keine Geschmacks-
 * frage, und eine als Literal wiederholte `9` springt beim nächsten Mass nicht mit.
 *
 * `text-fliess` und NICHT `text-rubrik`: elf Pixel sind die versale Abschnitts-Überschrift, und
 * „Offen"/„Zu" ist keine Rubrik, sondern die Beschriftung eines Bedienelements.
 */
export const metaRowChipCls =
  "inline-flex items-center gap-1 shrink-0 min-h-9 px-2 rounded-lg text-fliess font-medium text-foreground-muted hover:bg-surface-raised transition";

/**
 * Ein NICHT bedienbarer Platzhalter in derselben Reihe — hält das Mass von
 * {@link metaRowButtonCls}, ohne dessen Knopf-Versprechen (`hover`, `disabled`) zu erben. Ein
 * Zeichen, das unter dem Zeiger aufleuchtet, kündigt einen Klick an, den es nicht gibt.
 */
export const metaRowSlotCls =
  "size-9 shrink-0 flex items-center justify-center text-foreground-faint";

/** Die Umrandung EINER bearbeitbaren Zeile in einer Einstellungs-Liste (Reinigungs-Fenster,
 *  Wiege-Fenster, Tages-Ausnahmen der Kontrollen). Dieselbe Begründung wie bei `listRowCls`: die drei
 *  Listen stehen in derselben Admin-Spalte untereinander, und driftet Radius oder Polsterung, sieht
 *  man es nicht an der Zeile, sondern am Rhythmus des Abschnitts. */
export const editRowCardCls = "flex flex-col gap-2 rounded-xl border border-border-subtle p-3";
