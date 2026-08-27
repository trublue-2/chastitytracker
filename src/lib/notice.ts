/**
 * Der Umstellungs-Hinweis: welcher gilt gerade, und hat dieser Nutzer ihn quittiert?
 *
 * **Wofür.** v6 ändert die BEDEUTUNG von Farbe. Bis v5 war sie eine Vorliebe — hell oder dunkel,
 * dazu eine Farbwelt zur Auswahl. Ab v6 sagt sie den Zustand: Grün heisst verschlossen, Rosa
 * heisst offen, Indigo ist der Keyholder-Bereich. Wer die App vorher benutzt hat, hat Grün als
 * „alles in Ordnung" gelernt und liest es ab jetzt als etwas anderes. Das ist eine gelernte
 * Bedeutung, die wegfällt, und ohne diesen Hinweis erfährt er es nirgends.
 *
 * **Warum eine Version und kein Boolean.** Derselbe Merker trägt den nächsten Umstellungs-Hinweis
 * mit. Ein `designNoticeSeen`-Feld wäre nach einmaligem Gebrauch tot und der übernächste Umbau
 * bekäme eine zweite Spalte.
 *
 * **Warum am `User` und nicht in `localStorage`.** Der Hinweis soll einmal pro PERSON gelesen
 * werden, nicht einmal pro Gerät. Eine Anzeige-Entscheidung im Gerätespeicher läuft zwischen Handy
 * und Rechner auseinander — genau der Fehler, der als #88 gemeldet war und den v6 gerade behoben
 * hat. Ihn hier zu wiederholen wäre bitter.
 *
 * Dieses Modul ist **importfrei** (per `notice.test.ts` geprüft, nicht bloss behauptet): das
 * Server-Gate und die Client-Komponente teilen sich `NOTICE_VERSION`, und ein Import hier zöge
 * beim nächsten Mal Server-Code ins Client-Bündel.
 */

/**
 * Der Hinweis, der GERADE gilt. Wer diesen Wert quittiert hat, sieht nichts mehr.
 *
 * Bewusst NICHT aus `package.json` abgeleitet: jeder Patch-Bump würde den Hinweis sonst erneut
 * allen zeigen. Er wandert nur, wenn es wirklich etwas Neues zu erklären gibt — und dann von Hand.
 *
 * **Wer den Text unter `notice.*` ändert, MUSS diesen Wert mitziehen.** Sonst haben alle
 * Bestandsnutzer den neuen Hinweis bereits quittiert und sehen ihn nie — ein vollständig stummer
 * Fehler, den niemand meldet, weil man nicht vermisst, was man nie gesehen hat. `notice.test.ts`
 * hält die beiden zusammen.
 *
 * Ein fehlender Merker (`null`) heisst „noch nie quittiert" — auch für einen frisch angelegten
 * Nutzer. Er hat nichts zu verlernen, aber die Regel gilt für ihn genauso, und ein einmaliger
 * Bildschirm ist der billigere Fehler als eine Farbe, deren Bedeutung niemand nennt.
 */
export const NOTICE_VERSION = "6.0.0";

